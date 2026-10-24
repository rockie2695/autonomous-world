// ============================================================================
// 星艦裝配線的運動模型 / The assembly line's motion model
// ============================================================================
// 純函數、無 DOM：一次「回合推進」在線上是一趟**完整走線**——完工的船滑出廠房、
// 新龍骨進站、18 站逐站施工、末端裝引擎並試車。live.tsx 每帧呼叫這裡決定船在
// 哪裡、每隻手轉幾度、哪盞燈亮、火花在哪；靜止形狀由 geometry.ts 在模組載入時
// 算好。
//
// Pure functions, no DOM: one round advance is **one full pass** of the line — the
// finished ship rolls out, a bare keel enters, the 18 stations work through it, and
// the engine is fitted and test-fired at the end. live.tsx calls these every frame
// for the ship's position, each hand's joint angles, which lamp is lit and where the
// sparks are; the rest shapes are computed once at module load in geometry.ts.
//
// **關節是螢幕旋轉，這是要說清楚的近似。** 繞視軸的旋轉在正交投影下是剛體旋轉
// （精確）；繞世界 z 軸的旋轉投影成橢圓，螢幕旋轉只是它的近似。手肘本來就是
// 小幅、精密的動作（≤14°），而且這裡畫的是風格的等角插畫不是 CAD，所以選了
// 「一個關節每帧一個 transform、路徑永不重建」；角度一旦放大就會看出偏差。
//
// **A joint turns by a screen rotation, and that approximation is stated on
// purpose.** A rotation about the view axis is exactly a rigid rotation under
// orthographic projection; a rotation about the world z axis projects to an
// ellipse, of which a screen rotation is only an approximation. Arm joints make
// small, precise moves (≤14°) and this is a stylised isometric illustration, not
// CAD, so the trade is "one transform per joint per frame, paths never rebuilt".
// Widen the angles and the deviation becomes visible.
// ============================================================================

import { type Flat } from '@/components/iso/iso-kit';
import {
  LINE_END,
  ODO_DIGITS,
  ODO_STEP,
  SHIP_DECK_Z,
  SHIP_EXIT,
  STATIONS,
  TOOL,
  at,
  atStation,
  stationX,
} from './view';

// ── 一趟走線的時間軸（秒）/ One pass's timeline (seconds) ───────────────────
/** 完工的船滑出 + 新龍骨進站 / The finished ship rolls out, the bare keel enters */
export const EXIT_SECONDS = 0.8;
/** 18 站逐站施工 / The 18 stations working through it */
export const SWEEP_SECONDS = 2.1;
/** 第 18 站試車 / The test-fire at station 18 */
export const FIRE_SECONDS = 0.7;
export const TOTAL_SECONDS = EXIT_SECONDS + SWEEP_SECONDS + FIRE_SECONDS;

/** 一次走線的狀態 / One pass's state */
export interface Pass {
  /** 船中心的世界 x / the ship centre's world x */
  shipX: number;
  /** 船（與托架）的不透明度 / the ship's (and cradle's) opacity */
  alpha: number;
  /** 連續站號 1..18（休息時是 18：上一回合在末端完工）/ the continuous station 1..18 (18 at rest: the last round finished at the end) */
  station: number;
  /** 試車焰量 0..1 / the test-fire's burn, 0..1 */
  burn: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 2.4;

/**
 * 時間 → 這趟走線的狀態。休息態（t ≥ TOTAL_SECONDS）就是「上一回合在末端完工的
 * 那艘船」，所以靜止畫面永遠是同一件事，不必另寫一套。
 * Time → the pass's state. The resting state (t ≥ TOTAL_SECONDS) *is* "the ship the
 * last round finished at the end of the line", so the still frame needs no second
 * code path.
 */
export function passAt(seconds: number): Pass {
  if (seconds < EXIT_SECONDS) {
    const share = seconds / EXIT_SECONDS;
    return {
      shipX: LINE_END + easeOut(share) * SHIP_EXIT,
      alpha: 1 - clamp01((share - 0.3) / 0.7),
      station: STATIONS,
      burn: 0,
    };
  }
  if (seconds < EXIT_SECONDS + SWEEP_SECONDS) {
    const share = (seconds - EXIT_SECONDS) / SWEEP_SECONDS;
    const station = 1 + share * (STATIONS - 1);
    return { shipX: stationX(station), alpha: clamp01(share / 0.1), station, burn: 0 };
  }
  const share = (seconds - EXIT_SECONDS - SWEEP_SECONDS) / FIRE_SECONDS;
  // 點火：快速升到全開，然後收到六成（不是熄滅——引擎在跑）
  // Ignition: a fast rise to full, then settle to six tenths (not off — the engine runs)
  const burn = share < 0.2 ? share / 0.2 : 1 - ((share - 0.2) / 0.8) * 0.4;
  return { shipX: stationX(STATIONS), alpha: 1, station: STATIONS, burn: clamp01(burn) };
}

/** 還在動嗎（false 就讓 rAF 停下）/ Is anything still moving (false lets the rAF loop stop) */
export const passBusy = (seconds: number) => seconds < TOTAL_SECONDS;

// ── 零件出現 / Which parts exist ──────────────────────────────────────────
/**
 * 第 step 批零件在不在。工作點走到第 n 站，1..n 批都已經裝上——所以船的外觀
 * 就是這趟走線的進度。休息態 station = 18，整艘船都在。
 * Whether batch `step` exists. When the work point reaches station n, batches 1..n
 * are on — so the ship's appearance *is* this pass's progress. At rest station is
 * 18, so the whole ship is there.
 */
export const shipPartVisible = (step: number, station: number) => step <= Math.round(station);

// ── 電子手 / The electronic hands ─────────────────────────────────────────

/** 這隻手離工作點多近（1 = 正在工作，0 = 收起來）/ How close this hand is to the work point (1 = working, 0 = parked) */
export const proximity = (index: number, station: number) => clamp01(1 - Math.abs(station - index) / 1.15);

export interface Pose {
  /** 肩的角度（度）/ the shoulder's angle (degrees) */
  shoulder: number;
  /** 肘的角度（度）/ the elbow's angle (degrees) */
  elbow: number;
  /** 工作度 0..1：工具的光、火花都看它 / how active, 0..1: the tool's glow and sparks ride it */
  reach: number;
}

/**
 * 這隻手的姿態：收起來 → 探向工作點的插值。`selected`（滑過或鍵盤選到的站）
 * 就當作工作在它底下——這是使用者指到的那隻手，讀出槽正在報它的階段。
 * This hand's pose: an interpolation from parked to reaching. A `selected` station
 * (hovered or keyed) counts as working at that hand — that is the hand the user
 * pointed at, the one the readout names.
 */
export function armPose(index: number, station: number, selected: number, calm: boolean): Pose {
  const working = Math.max(proximity(index, station), selected === index ? 1 : 0);
  // 收起來的手也各不相同：18 隻手同一個靜止角會排成一把梳子，而這是一間工廠。
  // 每個角度都是 index 的確定性函數（不是隨機），所以同一個站位永遠同一個姿態。
  // Parked hands differ from each other: eighteen hands at one rest angle read as a
  // comb, and this is a factory. Every angle is a deterministic function of the
  // index (not random), so a station's parked pose is always the same.
  const parked = calm ? 0 : Math.sin(index * 2.3) * 8;
  const parkedElbow = calm ? 0 : Math.cos(index * 1.9) * 10;
  return {
    shoulder: -7 + 14 * working + parked * (1 - working),
    elbow: -5 + 18 * working + parkedElbow * (1 - working),
    reach: working,
  };
}

// ── 燈與燈條 / The lamps and the status strip ─────────────────────────────

/** 工位燈：工作點正上方那一盞最亮 / A station lamp: brightest directly over the work point */
export const lampAt = (index: number, station: number) => 0.05 + 0.72 * proximity(index, station);

/** 狀態燈條：工作點走過的格子亮著，沒走到的暗（休息態是整條亮——上一回合跑完了 18 個階段）
    The status strip: cells the work point has passed stay lit (at rest the whole strip is lit — the last round ran all 18 phases) */
export const cellAt = (index: number, station: number) => (station >= index ? 0.78 : 0.05);

/** 熔金塔的澆口：工作點在第 17 站（裝引擎）時最亮 / The crucible's pour: brightest while the work point is at station 17 (the engine goes in) */
export const pourAt = (station: number) => proximity(17, station);

// ── 燃量驅動的光效 / The burn-driven glows ────────────────────────────────

/** 燃向目標的鬆弛跟隨 / The burn's relaxed follow toward its target */
export const burnFollow = (current: number, target: number, dt: number, seconds: number) =>
  current + (target - current) * (1 - Math.exp(-dt / seconds));

/** 亮度微抖：焰與火花共享；calm（reduced-motion）時抖幅為 0
    The brightness wobble shared by flame and sparks; zero wobble when calm */
const wobble = (now: number, seed: number, calm: boolean, span: number) =>
  calm ? 1 : 1 - span * (0.5 + 0.5 * Math.sin(now * 9.4 + seed));

/** 試車焰的兩層透明度（燃量 = 亮度；靜止時只剩一點餘燼）
    The test-fire's two-layer opacities (burn = brightness; a faint ember at rest) */
export const glowFlame = (now: number, burn: number, calm: boolean) => ({
  inner: 0.14 + 0.86 * burn * wobble(now, 0, calm, 0.22),
  outer: 0.09 + 0.5 * burn * wobble(now, 2.1, calm, 0.16),
});

/** 鐘口環暈 / The bell's halo */
export const glowHalo = (now: number, burn: number, calm: boolean) => 0.16 + 0.6 * burn * wobble(now, 2.8, calm, 0.14);

/** 工具頭能量面的透明度：工作度 × 燃量（沒在工作時只留一點待機光）
    A tool face's opacity: activity × burn (a faint standby glow while idle) */
export const glowTool = (reach: number, burn: number) => 0.1 + 0.85 * Math.max(reach, burn);

export const SPARK_COUNT = 6;

/**
 * 焊接火花：從工具梢濺到船面上，六點輪替。工作度 0 → 全暗（靜止的機器不噴火）；
 * 滑過（selected 但沒有走線）時只給一小簇，讓 hover 有回應而不吵。
 * Welding sparks: six dots in turn, leaving the tool's tip and landing on the hull.
 * At zero activity they are all dark (an idle machine does not throw fire); a
 * hover (selected while nothing sweeps) gets a small burst, so hovering answers
 * back without shouting.
 */
export function sparkDots(
  now: number,
  index: number,
  station: number,
  selected: number,
  calm: boolean,
): Array<[Flat, number, number]> {
  const working = proximity(index, station);
  const hover = selected === index && working < 0.2 ? 1 : 0;
  const level = Math.max(working, hover * 0.62);
  if (level <= 0.02) return Array.from({ length: SPARK_COUNT }, () => [at(atStation(index, TOOL)), 0, 0] as [Flat, number, number]);
  const tip = at(atStation(index, [TOOL[0], TOOL[1], TOOL[2] - 17]));
  const out: Array<[Flat, number, number]> = [];
  for (let k = 0; k < SPARK_COUNT; k++) {
    const cycle = calm ? k / SPARK_COUNT : (now * 1.15 + k / SPARK_COUNT) % 1;
    const spread = (k - (SPARK_COUNT - 1) / 2) * 1.9;
    const land = at([stationX(index) + TOOL[0] + spread, TOOL[1] + 2.5, SHIP_DECK_Z]);
    const point: Flat = [tip[0] + (land[0] - tip[0]) * cycle, tip[1] + (land[1] - tip[1]) * cycle + cycle * cycle * 3];
    const alpha = level * Math.max(0, 1 - cycle) * (calm ? 0.75 : wobble(now, k * 1.7, false, 0.3));
    out.push([point, clamp01(alpha), 0.8 + (1 - cycle) * 0.6]);
  }
  return out;
}

// ── 里程計 / The odometer ─────────────────────────────────────────────────

/**
 * 里程計一位數的連續值。0..9 排兩輪：9→0 從 10 那一側滾過去，過橋後就地減 10
 * ——兩份 0 是同一個字形，畫面不跳。
 * One odometer digit's continuous value. The strip carries 0..9 twice: the 9→0
 * wrap rolls via 10, then drops 10 in place — both zeros are the same glyph, so
 * nothing jumps.
 */
export const rollDigit = (
  shown: number,
  target: number,
  dt: number,
  seconds: number,
  calm: boolean,
): { value: number; settled: boolean } => {
  if (calm) return { value: target, settled: true };
  if (Math.abs(target - shown) < 0.002) return { value: target, settled: true };
  let goal = target;
  if (target < shown - 4) goal += 10; // 只在跨越時補一輪 / bridge only on a wrap
  const next = shown + (goal - shown) * (1 - Math.exp(-dt / seconds));
  const done = Math.abs(goal - next) < 0.002;
  const carry = next >= 10 ? next - 10 : next;
  // 就地落到目標：跨橋後 10 的 0 與 0 的 0 是同一個字形（帶有兩份 0..9）
  // Land on the target in place: past the bridge, 10's zero and 0's zero are the
  // same glyph (the strip carries 0..9 twice)
  return { value: done ? target : carry, settled: done && Math.round(goal) % 10 === target };
};

/** 數位帶在面內的位移（local y，一格一位）/ A digit strip's in-face offset (local y, one slot per digit) */
export const digitShift = (value: number) => -Math.round(value * ODO_STEP * 100) / 100;

/** 讀回來的回合數 → 四位數的目標 / A round number → its ODO_DIGITS targets */
export const digitTargets = (round: number): number[] =>
  Array.from({ length: ODO_DIGITS }, (_, position) => {
    const power = 10 ** (ODO_DIGITS - 1 - position);
    return Math.floor(round / power) % 10;
  });
