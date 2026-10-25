import { describe, expect, it } from 'vitest';
import {
  EXIT_SECONDS,
  FIRE_SECONDS,
  SPARK_COUNT,
  SWEEP_SECONDS,
  TOTAL_SECONDS,
  armPose,
  cellAt,
  digitShift,
  digitTargets,
  lampAt,
  passAt,
  passBusy,
  pourAt,
  proximity,
  rollDigit,
  shipPartVisible,
  sparkDots,
} from './frame';
import {
  CURVE_AMP,
  STATIONS,
  emitPoint,
  at,
  lineDy,
  lineY,
  stationX,
  tangentSpin,
} from './view';

// 運動模型是純函數，所以這一組測試在 node 環境跑，不需要 DOM（與
// buildingFigure.test.ts 同一個做法）。它們守的是這張圖**說真話**的那幾條規則：
// 走線的順序、零件的出現順序、以及「船走到哪、裝到哪」。
// The motion model is pure, so this suite runs under node with no DOM (the same
// approach as buildingFigure.test.ts). It guards the rules that make the figure
// honest: the order of the pass, the order parts appear in, and "wherever the work
// point has reached is what has been fitted".
describe('assembly line motion model', () => {
  describe('one pass', () => {
    it('rolls the finished ship out before it builds the next one', () => {
      const start = passAt(0);
      expect(start.station).toBe(STATIONS);
      // 滑出中：透明度掉、x 超過最後一站 / rolling out: alpha drops, x passes the last station
      const mid = passAt(EXIT_SECONDS / 2);
      expect(mid.shipX).toBeGreaterThan(stationX(STATIONS));
      expect(mid.alpha).toBeLessThan(1);
      expect(passAt(EXIT_SECONDS - 1e-6).alpha).toBeLessThan(0.05);
    });

    it('then walks station 1 to station 18 in order', () => {
      const stations = [0.05, 0.25, 0.5, 0.75, 0.95].map(
        (share) => passAt(EXIT_SECONDS + share * SWEEP_SECONDS).station,
      );
      for (let index = 1; index < stations.length; index++) {
        expect(stations[index]!).toBeGreaterThan(stations[index - 1]!);
      }
      expect(stations[0]!).toBeGreaterThanOrEqual(1);
      expect(stations.at(-1)!).toBeLessThanOrEqual(STATIONS);
    });

    it('puts the ship exactly at the station the readout names', () => {
      for (const station of [1, 5, 9, 13, 18]) {
        const share = (station - 1) / (STATIONS - 1);
        const pass = passAt(EXIT_SECONDS + share * SWEEP_SECONDS);
        expect(pass.station).toBeCloseTo(station, 6);
        expect(pass.shipX).toBeCloseTo(stationX(station), 6);
      }
    });

    it('ignites only after the engine is in, and settles on the resting state', () => {
      expect(passAt(EXIT_SECONDS + SWEEP_SECONDS * 0.5).burn).toBe(0);
      const firing = passAt(EXIT_SECONDS + SWEEP_SECONDS + FIRE_SECONDS * 0.25);
      expect(firing.burn).toBeGreaterThan(0.9);
      const rest = passAt(TOTAL_SECONDS * 3);
      expect(rest).toEqual({ shipX: stationX(STATIONS), alpha: 1, station: STATIONS, burn: expect.any(Number) });
      expect(rest.shipX).toBe(stationX(STATIONS));
      expect(rest.station).toBe(STATIONS);
      expect(rest.alpha).toBe(1);
    });

    it('is busy only while the pass still has something to do', () => {
      expect(passBusy(0)).toBe(true);
      expect(passBusy(TOTAL_SECONDS - 0.01)).toBe(true);
      expect(passBusy(TOTAL_SECONDS)).toBe(false);
      expect(passBusy(TOTAL_SECONDS + 10)).toBe(false);
    });

    it('reads slowly enough to follow — the slow-down is a contract', () => {
      // 每站停留 ≥ 150ms：再快，兩列手的「探向 → 工具亮 → 火花」就讀不出來
      // Each stop ≥ 150 ms: any faster and "reach → tool lights → sparks" is
      // unreadable, the more so across two rows
      expect(SWEEP_SECONDS / (STATIONS - 1)).toBeGreaterThanOrEqual(0.15);
      // 整趟 ≈ 6.4 s（出口 1.2 + 掃描 4.0 + 試車 1.2）
      expect(TOTAL_SECONDS).toBeCloseTo(6.4, 6);
    });
  });

  describe('the S curve', () => {
    it('stays gentle everywhere — amplitude and slope are both capped', () => {
      const at6 = Math.tan((6 * Math.PI) / 180);
      for (let x = -400; x <= 400; x += 4) {
        expect(Math.abs(lineY(x))).toBeLessThanOrEqual(CURVE_AMP);
        // 斜率的上限就是「船螢幕旋轉 ≤ 6°」：切線轉角是 atan(斜率) 去掉 EX 的基角
        // The slope cap *is* "the ship's screen spin ≤ 6°": the tangent angle is
        // atan(slope) minus the EX baseline
        expect(Math.abs(lineDy(x))).toBeLessThanOrEqual(at6);
      }
    });

    it('keeps every tangent spin within 6 degrees', () => {
      for (let station = 1; station <= STATIONS; station++) {
        expect(Math.abs(tangentSpin(stationX(station)))).toBeLessThanOrEqual(6);
      }
    });
  });

  describe('batch of parts per station', () => {
    it('is monotone in the station and complete at the end', () => {
      const counts = Array.from({ length: STATIONS }, (_, index) => {
        const station = index + 1;
        return Array.from({ length: STATIONS }, (_, step) => step + 1).filter((step) => shipPartVisible(step, station)).length;
      });
      expect(counts).toEqual(Array.from({ length: STATIONS }, (_, index) => index + 1));
    });

    it('hides parts that are still ahead of the work point', () => {
      expect(shipPartVisible(1, 1)).toBe(true);
      expect(shipPartVisible(2, 1)).toBe(false);
      expect(shipPartVisible(17, 9)).toBe(false);
      expect(shipPartVisible(17, 17)).toBe(true);
      // 休息態整艘船都在 / at rest the whole ship is there
      expect(shipPartVisible(STATIONS, passAt(TOTAL_SECONDS).station)).toBe(true);
    });
  });

  describe('arms', () => {
    it('reaches for the work point and parks away from it', () => {
      const working = armPose(7, 7, 0, false);
      const parked = armPose(7, 1, 0, false);
      expect(working.reach).toBe(1);
      expect(parked.reach).toBe(0);
      expect(working.shoulder).toBeGreaterThan(parked.shoulder);
      expect(working.elbow).toBeGreaterThan(parked.elbow);
    });

    it('treats the pointed-at station as working', () => {
      expect(armPose(5, 18, 5, false).reach).toBe(1);
      expect(armPose(5, 18, 6, false).reach).toBe(0);
    });

    it('keeps every angle small — the pose rides screen rotations', () => {
      for (let index = 1; index <= STATIONS; index++) {
        for (const station of [1, 9, 18]) {
          const pose = armPose(index, station, 0, false);
          expect(Math.abs(pose.shoulder)).toBeLessThan(24);
          expect(Math.abs(pose.elbow)).toBeLessThan(24);
        }
      }
    });

    it('parks the 18 hands differently from each other', () => {
      const parked = Array.from({ length: STATIONS }, (_, index) => armPose(index + 1, 18, 0, false).shoulder);
      expect(new Set(parked.map((angle) => angle.toFixed(3))).size).toBeGreaterThan(STATIONS / 2);
    });

    it('freezes the pose under reduced motion', () => {
      const calm = armPose(9, 18, 0, true);
      expect(calm.shoulder).toBe(-7);
      expect(calm.elbow).toBe(-5);
    });
  });

  describe('lamps and the status strip', () => {
    it('lights the lamp over the work point and dims the rest', () => {
      expect(lampAt(9, 9)).toBeGreaterThan(lampAt(9, 3));
      expect(lampAt(1, 18)).toBeLessThan(0.1);
    });

    it('fills the strip behind the work point, and is full at rest', () => {
      expect(cellAt(1, 5)).toBeGreaterThan(0.5);
      expect(cellAt(9, 5)).toBeLessThan(0.1);
      const cells = Array.from({ length: STATIONS }, (_, index) => cellAt(index + 1, passAt(TOTAL_SECONDS).station));
      expect(cells.every((value) => value > 0.5)).toBe(true);
    });

    it('pours the crucible when the engine goes in', () => {
      expect(pourAt(17)).toBe(1);
      expect(pourAt(1)).toBeLessThan(0.1);
    });
  });

  describe('sparks', () => {
    it('is dark on an idle machine', () => {
      const dots = sparkDots(0, 9, 18, 0, false);
      expect(dots).toHaveLength(SPARK_COUNT);
      expect(dots.every(([, alpha]) => alpha === 0)).toBe(true);
    });

    it('leaves the working hand and lands on the hull', () => {
      const dots = sparkDots(0.4, 9, 9, 0, false);
      // 工具梢的**螢幕**點：與 frame.ts 的算式相同（火花是螢幕座標，世界點不能直接比）
      // The tool tip in **screen** space, the same expression frame.ts uses (sparks are
      // screen points; a world point cannot be compared with them directly)
      const tip = at(emitPoint(9));
      expect(dots.some(([, alpha, radius]) => alpha > 0 && radius > 0)).toBe(true);
      // 每個亮點都落在工具梢與船面之間的一小段裡（不會噴到畫布外）
      // Every lit dot stays in the short span between the tool tip and the hull
      for (const [point, alpha] of dots) {
        if (alpha === 0) continue;
        expect(Math.abs(point[0] - tip[0])).toBeLessThan(24);
        expect(Math.abs(point[1] - tip[1])).toBeLessThan(24);
      }
    });

    it('answers a hover with a small burst', () => {
      const hover = sparkDots(0.4, 4, 18, 4, false);
      const active = Math.max(...hover.map(([, alpha]) => alpha));
      expect(active).toBeGreaterThan(0);
      expect(active).toBeLessThan(0.7);
    });

    it('freezes at one phase under reduced motion', () => {
      const first = sparkDots(1, 9, 9, 0, true);
      const later = sparkDots(9, 9, 9, 0, true);
      expect(later.map(([point]) => point)).toEqual(first.map(([point]) => point));
    });
  });

  describe('proximity and the odometer', () => {
    it('is 1 at the work point and 0 away from it', () => {
      expect(proximity(6, 6)).toBe(1);
      expect(proximity(6, 12)).toBe(0);
      expect(proximity(6, 7)).toBeGreaterThan(0);
      expect(proximity(6, 7)).toBeLessThan(1);
    });

    it('rolls a digit toward its target and settles', () => {
      const target = digitTargets(4321);
      expect(target).toEqual([4, 3, 2, 1]);
      let value = 0;
      for (let step = 0; step < 400; step++) value = rollDigit(value, 7, 1 / 60, 0.5, false).value;
      expect(value).toBe(7);
      expect(digitShift(7)).toBe(-91);
    });
  });
});
