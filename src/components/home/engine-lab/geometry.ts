// ============================================================================
// 星艦裝配線的靜態幾何 / The starship assembly line's static geometry
// ============================================================================
// 全部路徑在模組載入時算一次（server 與 client 各算一次，結果一致，hydration
// 安全）。會動的只有 transform 與透明度：手的關節是螢幕旋轉（見 frame.ts 對
// 「螢幕旋轉」的說明）、整條船的移動是平移、火光與燈是透明度、零件的出現是
// display——沒有任何一帧重建路徑。
//
// Every path is computed once at module load (server and client each compute them;
// identical results, so hydration is safe). Only transforms and opacities move: a
// hand's joints are screen rotations (see frame.ts on screen rotations), the ship
// travels by translation, fires and lamps ride opacities, and parts appear by
// display — no frame ever rebuilds a path.
//
// 自建的形體：hullPath（凸包描輪廓）、facet（立面矩形的四角投影）、prism（世界兩
// 點之間的矩形樑：兩個端面各四角，取凸包就是它的剪影）、revolveX（繞 x 軸的迴轉
// 體，鐘口與試車焰用）。
// Hand-built shapes: outlines from a convex hull, facets (a planar rectangle from
// its four world corners), prisms (a beam between two world points: four corners at
// each end, and the hull of the eight is its silhouette), and revolveX (a solid of
// revolution about the x axis, for the bell and the test-fire).
// ============================================================================

import {
  coil,
  cylinder,
  extrude,
  insetPlan,
  joinPaths,
  onTop,
  pathOf,
  planOutline,
  ring,
  segment,
  sideRing,
  slabOf,
  topMatrix,
  type Flat,
  type Plane,
  type Plan,
  type Point3,
  type SolidPaths,
} from '@/components/iso/iso-kit';
import {
  ARM_BASE,
  ARM_BASE_H,
  ARM_COL_R,
  ARM_COL_Z,
  ARM_FORE,
  ARM_HIT_R,
  ARM_SEG,
  ARM_Y,
  at,
  atStation,
  BEAM,
  BEAM_Z,
  BELL_END,
  CABINET,
  CABINET_H,
  CABINET_X,
  CRADLE,
  CRADLE_H,
  CRUCIBLE,
  CRUCIBLE_H,
  CRUCIBLE_WIN_Z,
  ELBOW,
  FOOT_H,
  HALL,
  HALL_H,
  HANGER_W,
  HANGER_X,
  LABEL_PLATE,
  LAMP,
  LAMP_Z,
  ODO,
  ODO_FIRST_X,
  ODO_H,
  ODO_STEP,
  ODO_WINDOW,
  P,
  PALLETS,
  PALLET_H,
  RACK,
  RACK_H,
  RAIL_FAR,
  RAIL_H,
  RAIL_NEAR,
  ROLLER_STEP,
  SHIP_HALF,
  SHIP_LEN,
  SHIP_STERN,
  SHIP_Z0,
  SHOULDER_R,
  SHOULDER_Z,
  SPOUT_FROM,
  SPOUT_TO,
  STATIONS,
  TOOL,
  WALKWAY,
  WALKWAY_H,
  WRIST,
  WRIST_R,
  stationX,
} from './view';

const solid = (plan: Plan, z: number, h: number, steps = 6, bevel = 0) => slabOf(plan, z, h, P, steps, bevel);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 40) => cylinder(cx, cy, r, z, h, P, steps);
const screwRing = (x: number, y: number, z: number) => ring(x, y, 2.2, z, P, 16);
const dot = (point: Point3): Flat => at(point);
const lineFrom = (a: Point3, b: Point3) => segment(a, b, P);

/** 一個最小 SolidPaths：只有輪廓，無刻面 / A minimal SolidPaths: outline only, no facets */
const minimal = (outline: string, seamless = true): SolidPaths => ({
  fill: outline,
  outline,
  crease: '',
  top: '',
  shades: [],
  seamless,
});

/** 世界四角的立面矩形（法向 x 或 y 的可視面）/ A planar rectangle from four world corners */
const facet = (corners: Point3[]): SolidPaths => {
  const points = corners.map((point) => at(point));
  const outline = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
  return minimal(outline, false);
};

/** 平面多邊形（世界座標）→ 有厚度的板 / A planar polygon (world space) → a plate with thickness */
const plate = (corners: Plane[], from: number, to: number, bevel = 0.6) =>
  extrude(corners, from, to - from, P, { convex: true, bevel });

// ── 凸包與樑 / The convex hull and a beam ─────────────────────────────────

function hullPath(points: Flat[]): string {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return '';
  const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (source: Flat[]) => {
    const out: Flat[] = [];
    for (const point of source) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    return out;
  };
  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  lower.pop();
  upper.pop();
  const loop = [...lower, ...upper];
  return loop.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
}

const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Point3): Point3 => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
};

/**
 * 兩點之間的矩形樑（8 個角取凸包 = 剪影）。關節的靜止姿由它建；關節轉動是螢幕
 * 旋轉，所以這條路徑永遠不必重建。
 * A rectangular beam between two points (the hull of its 8 corners is its
 * silhouette). Joint rest poses are built with it; a joint turns by a screen
 * rotation, so this path is never rebuilt.
 */
function prism(a: Point3, b: Point3, w: number, h: number): SolidPaths {
  const along = unit(sub(b, a));
  const right = unit(cross3(along, [0, 0, 1]));
  const up = unit(cross3(right, along));
  const points: Flat[] = [];
  for (const end of [a, b]) {
    for (const [sw, sh] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as Array<[number, number]>) {
      points.push(
        at([
          end[0] + right[0] * sw * (w / 2) + up[0] * sh * (h / 2),
          end[1] + right[1] * sw * (w / 2) + up[1] * sh * (h / 2),
          end[2] + right[2] * sw * (w / 2) + up[2] * sh * (h / 2),
        ]),
      );
    }
  }
  return minimal(hullPath(points), true);
}

/**
 * 繞 x 軸的迴轉體：把若干 (x, r) 截面畫成環、全部投影後取凸包。
 * A solid of revolution about the x axis: ring each (x, r) section, project them
 * all and take the hull.
 */
function revolveX(sections: Array<[number, number]>, y: number, z: number, steps = 22): SolidPaths {
  const points: Flat[] = [];
  for (const [x, r] of sections) {
    for (let step = 0; step < steps; step++) {
      const theta = (step / steps) * Math.PI * 2;
      points.push(at([x, y + r * Math.cos(theta), z + r * Math.sin(theta)]));
    }
  }
  return minimal(hullPath(points), true);
}

// ── 廠房地面 / The hall floor ─────────────────────────────────────────────

const HALL_FEET: Plane[] = [
  [HALL.x + 22, HALL.y + 22],
  [HALL.x + HALL.w - 22, HALL.y + 22],
  [HALL.x + 22, HALL.y + HALL.d - 22],
  [HALL.x + HALL.w - 22, HALL.y + HALL.d - 22],
];
const HALL_SCREWS: Plane[] = [
  [HALL.x + 10, HALL.y + 10],
  [HALL.x + HALL.w - 10, HALL.y + 10],
  [HALL.x + 10, HALL.y + HALL.d - 10],
  [HALL.x + HALL.w - 10, HALL.y + HALL.d - 10],
];

/** 車道線：兩條沿線的長線（在導軌外側）+ 兩端的橫擋 / Lane markings: two long lines outside the rails plus end stops */
const LANE_Y = [-44, 44] as const;
const LANE_END_TICKS: Plane[][] = [-424, 424].map((x) =>
  [0, 1, 2, 3, 4, 5].map((row): Plane => [x + (row % 2 ? 12 : 0), HALL.y + (row / 5) * HALL.d]),
);

export const FLOOR_ART = {
  walkway: solid(WALKWAY, 0, WALKWAY_H, 4, 0.4),
  walkwayEdge: planOutline(WALKWAY, WALKWAY_H, P, 4),
  /** 走道的踏面刻線：允許停在走道面上（線就畫在那塊板上）
      The walkway's tread marks: they lie on the walkway's own face, so resting there is right */
  tread: joinPaths(
    Array.from({ length: 24 }, (_, index) => {
      const x = WALKWAY.x + 16 + index * 30;
      return lineFrom([x, WALKWAY.y, WALKWAY_H + 0.3], [x, WALKWAY.y + WALKWAY.d, WALKWAY_H + 0.3]);
    }),
  ),
  pallets: PALLETS.map((plan, index) => solid(plan, 0, PALLET_H[index] ?? 8, 4, 0.6)),
  palletLids: PALLETS.map((plan, index) => planOutline(insetPlan(plan, 2), PALLET_H[index] ?? 8, P, 4)),
  palletBands: PALLETS.map((plan, index) =>
    lineFrom([plan.x + plan.w / 2, plan.y, (PALLET_H[index] ?? 8) - 3], [plan.x + plan.w / 2, plan.y + plan.d, (PALLET_H[index] ?? 8) - 3]),
  ),
  palletDots: PALLETS.flatMap((plan, index) => [
    dot([plan.x + 4, plan.y + 4, PALLET_H[index] ?? 8]),
    dot([plan.x + plan.w - 4, plan.y + plan.d - 4, PALLET_H[index] ?? 8]),
  ]),
};

export const HALL_ART = {
  halo: slabOf(HALL, -FOOT_H - HALL_H, HALL_H, P).fill,
  feet: HALL_FEET.map(([x, y]) => [cyl(x, y, 7, -FOOT_H - HALL_H, 1.8, 16), cyl(x, y, 5.4, -FOOT_H - HALL_H + 1.8, FOOT_H - 1.8, 16)]),
  slab: solid(HALL, -HALL_H, HALL_H, 8, 1.6),
  groove: planOutline(insetPlan(HALL, 5), 0, P),
  lanes: joinPaths(LANE_Y.map((y) => lineFrom([HALL.x + 10, y, 0], [HALL.x + HALL.w - 10, y, 0]))),
  laneTicks: joinPaths(LANE_END_TICKS.map((column) => pathOf(column.map(([x, y]) => at([x, y, 0]))))),
  screws: HALL_SCREWS.map(([x, y]) => dot([x, y, 0])),
  screwRings: joinPaths(HALL_SCREWS.map(([x, y]) => screwRing(x, y, 0))),
};

// ── 後牆：貨架、艙門、狀態燈條 / The back wall: rack, bay doors, status strip ──

/** 狀態燈條：每站一格，長度與位置都跟工位對齊（frame.ts 逐格點亮）
    The status strip: one cell per station, aligned with the line (frame.ts lights them cell by cell) */
const STRIP_HALF = 13;

export const RACK_ART = {
  slab: solid(RACK, 0, RACK_H, 4, 1),
  top: planOutline(RACK, RACK_H, P, 4),
  /** 底部的踢腳線 / The kick seam along the floor */
  kick: lineFrom([RACK.x, RACK.y + RACK.d, 3], [RACK.x + RACK.w, RACK.y + RACK.d, 3]),
  /** 每站一扇艙門的邊線 / One bay door's edges per station */
  bays: joinPaths(
    Array.from({ length: STATIONS }, (_, index) => {
      const x = stationX(index + 1);
      const y = RACK.y + RACK.d;
      return joinPaths([lineFrom([x - 15, y, 0], [x - 15, y, RACK_H]), lineFrom([x + 15, y, 0], [x + 15, y, RACK_H])]);
    }),
  ),
  /** 艙門的橫樑 / The doors' transom */
  transom: lineFrom([RACK.x, RACK.y + RACK.d, 24], [RACK.x + RACK.w, RACK.y + RACK.d, 24]),
  /** 燈條的槽 / The strip's recess */
  strip: lineFrom([stationX(1) - STRIP_HALF - 4, RACK.y + RACK.d, 27], [stationX(STATIONS) + STRIP_HALF + 4, RACK.y + RACK.d, 27]),
  stripCells: Array.from({ length: STATIONS }, (_, index) => {
    const x = stationX(index + 1);
    return facet([
      [x - STRIP_HALF, RACK.y + RACK.d, 25],
      [x + STRIP_HALF, RACK.y + RACK.d, 25],
      [x + STRIP_HALF, RACK.y + RACK.d, 28.5],
      [x - STRIP_HALF, RACK.y + RACK.d, 28.5],
    ]);
  }),
  dots: dotGridOnFace(),
};

/** 牆面的鉚釘列（裝飾細節，手機版由 .el-fine 收掉）
    The wall's rivet rows (fine detail, hidden by .el-fine on phones) */
function dotGridOnFace(): Flat[] {
  const out: Flat[] = [];
  for (let column = 0; column < 24; column++) {
    const x = RACK.x + 18 + column * 35;
    out.push(at([x, RACK.y + RACK.d, 3.2]));
    out.push(at([x, RACK.y + RACK.d, RACK_H - 3.2]));
  }
  return out;
}

// ── 配電櫃 / The cabinets ─────────────────────────────────────────────────

export const CABINET_ART = CABINET_X.map((x) => {
  const plan: Plan = { ...CABINET, x };
  return {
    body: solid(plan, 0, CABINET_H, 4, 0.8),
    door: planOutline(insetPlan(plan, 3), CABINET_H, P, 4),
    vents: joinPaths([0, 1, 2].map((row) => lineFrom([x + 3, plan.y + plan.d, 15 + row * 2.6], [x + CABINET.w - 3, plan.y + plan.d, 15 + row * 2.6]))),
    dots: [dot([x + CABINET.w - 10, plan.y + plan.d, 19]), dot([x + CABINET.w - 10, plan.y + plan.d, 16]), dot([x + CABINET.w - 10, plan.y + plan.d, 13])],
  };
});

// ── 天花板：行車樑、吊架、工位燈 / The ceiling: beam, hangers, station lamps ──

const HANGER_Y = BEAM.y + BEAM.d / 2;

export const BEAM_ART = {
  slab: solid(BEAM, BEAM_Z[0], BEAM_Z[1] - BEAM_Z[0], 4, 0.8),
  underside: planOutline(insetPlan(BEAM, 2), BEAM_Z[0], P, 4),
  /** 樑底的導軌縫 / The rail seam under the beam */
  way: lineFrom([BEAM.x, HANGER_Y, BEAM_Z[0] + 0.4], [BEAM.x + BEAM.w, HANGER_Y, BEAM_Z[0] + 0.4]),
  hangers: HANGER_X.map((x) => prism([x, HANGER_Y, RACK_H], [x, HANGER_Y, BEAM_Z[0] + 1], HANGER_W, HANGER_W)),
  hangerDots: HANGER_X.map((x) => dot([x, HANGER_Y, RACK_H + 1])),
};

export const LAMP_ART = {
  housing: solid({ x: BEAM.x + 16, y: LAMP.y - 2, w: BEAM.w - 32, d: LAMP.d + 4, r: 2 }, LAMP_Z[1], 2.4, 4, 0.6),
  /** 18 盞燈的發光面（el-hot，透明度由 frame.ts 的 sweep 驅動）
      18 lit faces (el-hot; frame.ts's sweep drives their opacity) */
  faces: Array.from({ length: STATIONS }, (_, index) =>
    facet([
      [stationX(index + 1) + LAMP.x, LAMP.y, LAMP_Z[0] - 1.6],
      [stationX(index + 1) + LAMP.x + LAMP.w, LAMP.y, LAMP_Z[0] - 1.6],
      [stationX(index + 1) + LAMP.x + LAMP.w, LAMP.y + LAMP.d, LAMP_Z[0] - 1.6],
      [stationX(index + 1) + LAMP.x, LAMP.y + LAMP.d, LAMP_Z[0] - 1.6],
    ]),
  ),
};

// ── 導軌與滾子 / The rails and their rollers ──────────────────────────────

const ROLLERS: number[] = (() => {
  const out: number[] = [];
  for (let x = RAIL_FAR.x + 16; x <= RAIL_FAR.x + RAIL_FAR.w - 16; x += ROLLER_STEP) out.push(x);
  return out;
})();

export const RAIL_ART = {
  far: solid(RAIL_FAR, 0, RAIL_H, 4, 0.6),
  near: solid(RAIL_NEAR, 0, RAIL_H, 4, 0.6),
  farTop: planOutline(RAIL_FAR, RAIL_H, P, 4),
  nearTop: planOutline(RAIL_NEAR, RAIL_H, P, 4),
  /** 軸承：兩條長槽裡的短刻（合成一條路徑）/ The bearings: ticks in both troughs (one joined path) */
  farTicks: joinPaths(ROLLERS.map((x) => lineFrom([x, RAIL_FAR.y, RAIL_H + 0.3], [x, RAIL_FAR.y + RAIL_FAR.d, RAIL_H + 0.3]))),
  nearTicks: joinPaths(ROLLERS.map((x) => lineFrom([x, RAIL_NEAR.y, RAIL_H + 0.3], [x, RAIL_NEAR.y + RAIL_NEAR.d, RAIL_H + 0.3]))),
  rollerDots: ROLLERS.flatMap((x) => [dot([x, RAIL_FAR.y + 4, RAIL_H + 0.3]), dot([x, RAIL_NEAR.y + 4, RAIL_H + 0.3])]),
};

// ── 熔金塔 / The crucible ─────────────────────────────────────────────────

export const CRUCIBLE_ART = {
  tower: solid(CRUCIBLE, 0, CRUCIBLE_H, 4, 1),
  lid: solid(insetPlan(CRUCIBLE, 3), CRUCIBLE_H, 3.4, 4, 0.8),
  lidRing: planOutline(insetPlan(CRUCIBLE, 5), CRUCIBLE_H + 3.4, P, 4),
  /** 澆口窗：+x 面，熔金紅（el-melt，第 17 站亮起）/ The pour window: the +x face, molten red (el-melt, lit at station 17) */
  window: facet([
    [CRUCIBLE.x + CRUCIBLE.w, CRUCIBLE.y + 6, CRUCIBLE_WIN_Z[0]],
    [CRUCIBLE.x + CRUCIBLE.w, CRUCIBLE.y + CRUCIBLE.d - 6, CRUCIBLE_WIN_Z[0]],
    [CRUCIBLE.x + CRUCIBLE.w, CRUCIBLE.y + CRUCIBLE.d - 6, CRUCIBLE_WIN_Z[1]],
    [CRUCIBLE.x + CRUCIBLE.w, CRUCIBLE.y + 6, CRUCIBLE_WIN_Z[1]],
  ]),
  windowRim: planOutline({ x: CRUCIBLE.x + CRUCIBLE.w - 1.6, y: CRUCIBLE.y + 4, w: 3.2, d: CRUCIBLE.d - 8, r: 1 }, CRUCIBLE_WIN_Z[0] - 1, P, 4),
  /** 支撐肋 / The buttress ribs on the back face */
  ribs: joinPaths([0, 1, 2].map((row) => lineFrom([CRUCIBLE.x, CRUCIBLE.y + CRUCIBLE.d, 6 + row * 8], [CRUCIBLE.x + CRUCIBLE.w, CRUCIBLE.y + CRUCIBLE.d, 6 + row * 8]))),
  /** 澆槽：從塔頂伸向裝配線的斜樑 / The spout: an angled beam from the tower's top toward the line */
  spout: prism(SPOUT_FROM, SPOUT_TO, 9, 6),
  spoutLip: prism([SPOUT_TO[0] - 3, SPOUT_TO[1], SPOUT_TO[2]], [SPOUT_TO[0] + 3, SPOUT_TO[1] + 3, SPOUT_TO[2] + 4], 9, 6),
  /** 澆口的熔金面：槽梢（el-melt）/ The molten face at the spout's lip (el-melt) */
  pour: facet([
    [SPOUT_TO[0] + 3, SPOUT_TO[1] + 1, SPOUT_TO[2] + 4.4],
    [SPOUT_TO[0] + 3, SPOUT_TO[1] + 4, SPOUT_TO[2] + 4.4],
    [SPOUT_TO[0] + 3, SPOUT_TO[1] + 4, SPOUT_TO[2] + 7],
    [SPOUT_TO[0] + 3, SPOUT_TO[1] + 1, SPOUT_TO[2] + 7],
  ]),
  screws: [dot([CRUCIBLE.x + 6, CRUCIBLE.y + 6, CRUCIBLE_H]), dot([CRUCIBLE.x + CRUCIBLE.w - 6, CRUCIBLE.y + 6, CRUCIBLE_H])],
};

// ── 托架（跟著船走）/ The cradle (travels with the ship) ──────────────────

export const CRADLE_ART = {
  slab: solid(CRADLE, 0, CRADLE_H, 4, 0.8),
  top: planOutline(CRADLE, CRADLE_H, P, 4),
  /** 四支夾具 / Four clamps */
  clamps: ([-1, 1] as const).flatMap((side) =>
    ([-1, 1] as const).map((end) => cyl(CRADLE.x + 14 + (end > 0 ? CRADLE.w - 28 : 0), CRADLE.y + (side > 0 ? CRADLE.d - 9 : 9), 3.4, CRADLE_H, 8, 14)),
  ),
  /** 兩條滑靴：踩在導軌上 / Two skids: they ride the rails */
  skids: ([-1, 1] as const).map((side) => solid({ x: CRADLE.x + 6, y: side > 0 ? RAIL_NEAR.y + 1.5 : RAIL_FAR.y + 3.5, w: CRADLE.w - 12, d: 3, r: 1.4 }, 0, CRADLE_H - 1, 4, 0.4)),
  clampDots: ([-1, 1] as const).flatMap((side) =>
    ([-1, 1] as const).map((end) => dot([CRADLE.x + 14 + (end > 0 ? CRADLE.w - 28 : 0), CRADLE.y + (side > 0 ? CRADLE.d - 9 : 9), CRADLE_H + 8])),
  ),
};

// ── 星艦：18 個階段各加一批零件 / The ship: one batch of parts per phase ────
//
// 每一批對應左表的一個階段（frame.ts 的 shipPartVisible 決定它在不在）。骨架先
// 立（龍骨、肋骨、脊樑、滑橇），再上外板（下板 → 左右中板 → 甲板），然後艦橋、
// 桅杆、管線、兩翼、塗裝，最後是引擎艙、引擎本體與鐘口——第 18 站試車。
// Each batch is one phase of the list beside the machine (frame.ts's shipPartVisible
// decides whether it is on). The frame goes up first (keel, ribs, spine, skids), then
// the plating (lower, both midships, deck), then bridge, mast, ducting, wings and
// livery, and finally the engine bay, the engine itself and the bell — test-fired at
// station 18.

/** 船體半長；所有船體零件都以它為基準（改船長只改 view.ts 一個數字）
    Half the hull's length; every ship part is written against it (resizing the ship
    is one number in view.ts) */
const S = SHIP_HALF;
/** 沿船長的位置：0 = 船尾、1 = 船首 / A position along the hull: 0 = stern, 1 = bow */
const along = (share: number) => -S + share * SHIP_LEN;

const RIB_X = [along(0.1), along(0.25), along(0.4), along(0.55), along(0.7), along(0.8), along(0.9), along(0.96)] as const;
const rib = (x: number): Plan => ({ x: x - 1.9, y: -11, w: 3.8, d: 22, r: 1 });
/** 一側的外板：skin 是「離龍骨中心線多遠開始」，厚度 d 再往外長
    One flank's plating: `skin` is how far out from the centreline it starts, and it grows `d` further out */
const flank = (side: 1 | -1, skin: number, d: number): Plan => ({ x: -S + 3, y: side > 0 ? skin : -skin - d, w: SHIP_LEN - 6, d, r: 1 });

const WING_LOCAL: Plane[] = [
  [-20, -15],
  [58, -38],
  [76, -22],
  [-8, -13],
];

// 船體的垂直分層：龍骨 6–9、肋骨 9–26、下板 9–17、中板 17–26、甲板 26–29.5、
// 艦橋 29.5–37、桅杆到 43、引擎軸線 20.5。**船要夠高才讀得出是一艘船**：先前
// 甲板只到 26，一條 160 長的船就成了一片薄片（實測截圖裡幾乎看不見艦體）。
// The hull's vertical layering: keel 6–9, ribs 9–26, lower plating 9–17, midships
// 17–26, deck 26–29.5, bridge 29.5–37, mast to 43, engine axis 20.5. **The ship has
// to be tall enough to read as a ship**: with the deck at 26, a 160-long hull was a
// sliver (measured on screen: the hull was nearly invisible).
/** 引擎軸線的高度（船體局部 z）/ The engine axis's height (ship-local z) */
const ENGINE_Z = SHIP_Z0 + 14.5;
/** 引擎艙的前緣 / The engine bay's forward edge */
const BAY_X = SHIP_STERN - 22;
const SKID_X = [along(0.12), along(0.34), along(0.56), along(0.8)] as const;

export const SHIP_ART = {
  /** 1 龍骨 / 1 keel */
  keel: solid({ x: -S + 5, y: -7, w: SHIP_LEN - 10, d: 14, r: 2 }, SHIP_Z0, 3, 4, 0.6),
  /** 2–3 肋骨（前四根、後四根）/ 2–3 ribs (four forward, four aft) */
  ribsFore: RIB_X.slice(0, 4).map((x) => solid(rib(x), SHIP_Z0 + 3, 17, 4, 0.4)),
  ribsAft: RIB_X.slice(4).map((x) => solid(rib(x), SHIP_Z0 + 3, 17, 4, 0.4)),
  ribsAftSeam: RIB_X.slice(4).map((x) => lineFrom([x, -11, SHIP_Z0 + 20], [x, -11, SHIP_Z0 + 22])),
  /** 4 脊樑 / 4 dorsal spine */
  spine: solid({ x: -S + 9, y: -4, w: SHIP_LEN - 18, d: 8, r: 2 }, SHIP_Z0 + 19, 3, 4, 0.6),
  /** 5 滑橇（龍骨下的四塊腳座）/ 5 skids (four blocks under the keel) */
  skids: SKID_X.flatMap((x) => [
    solid({ x: x - 9, y: -17, w: 18, d: 7, r: 1.4 }, SHIP_Z0 - 0.5, 4.5, 4, 0.4),
    solid({ x: x - 9, y: 10, w: 18, d: 7, r: 1.4 }, SHIP_Z0 - 0.5, 4.5, 4, 0.4),
  ]),
  skidDots: SKID_X.flatMap((x) => [dot([x - 6, -13.5, SHIP_Z0 + 4]), dot([x - 6, 13.5, SHIP_Z0 + 4])]),
  /** 6 下外板 / 6 lower plating */
  lowerPort: solid(flank(-1, 9.8, 3.6), SHIP_Z0 + 3, 8, 4, 0.4),
  lowerStarboard: solid(flank(1, 9.8, 3.6), SHIP_Z0 + 3, 8, 4, 0.4),
  /** 7–8 左右中板 / 7–8 midships plating */
  midPort: solid(flank(-1, 11.2, 4), SHIP_Z0 + 11, 9, 4, 0.4),
  midStarboard: solid(flank(1, 11.2, 4), SHIP_Z0 + 11, 9, 4, 0.4),
  /** 9 甲板 + 甲板縫 / 9 deck + its seam */
  deck: solid({ x: -S + 7, y: -13, w: SHIP_LEN - 14, d: 26, r: 2.6 }, SHIP_Z0 + 20, 3.5, 4, 0.6),
  deckSeam: planOutline(insetPlan({ x: -S + 7, y: -13, w: SHIP_LEN - 14, d: 26, r: 2.6 }, 2.4), SHIP_Z0 + 23.5, P, 4),
  deckTies: [along(0.25), along(0.45), along(0.65), along(0.85)].map((x) => lineFrom([x, -13, SHIP_Z0 + 23.5], [x, 13, SHIP_Z0 + 23.5])),
  /** 10 艦橋 + 窗（el-hot）/ 10 bridge + windows (el-hot) */
  bridge: solid({ x: -S + 14, y: -9, w: 40, d: 18, r: 3 }, SHIP_Z0 + 23.5, 7.5, 4, 0.8),
  bridgeCap: solid({ x: -S + 17, y: -6.5, w: 34, d: 13, r: 2 }, SHIP_Z0 + 31, 2.5, 4, 0.5),
  bridgeWindows: facet([
    [-S + 14, 9, SHIP_Z0 + 27.5],
    [-S + 54, 9, SHIP_Z0 + 27.5],
    [-S + 54, 9, SHIP_Z0 + 30],
    [-S + 14, 9, SHIP_Z0 + 30],
  ]),
  /** 11 桅杆與天線盤（桅杆站在船長的 0.6 處）/ 11 mast and dish (at 0.6 along the hull) */
  mast: prism([along(0.6), 0, SHIP_Z0 + 20], [along(0.6), 0, SHIP_Z0 + 37], 3.4, 3.4),
  mastYard: prism([along(0.6) - 6, 0, SHIP_Z0 + 35], [along(0.6) + 6, 0, SHIP_Z0 + 35], 2.4, 2.4),
  mastDish: cyl(along(0.6), 0, 5.2, SHIP_Z0 + 37, 1.6, 16),
  mastDishRing: ring(along(0.6), 0, 4.2, SHIP_Z0 + 38.6, P, 16),
  /** 12 舷側管線 / 12 flank ducting
      coil 回傳前後兩段（kit 把它們分開，管線才穿得過去）
      coil returns a back and a front run, so the pipe can pass between them */
  ductCoil: coil(along(0.82), along(0.2), [14.4, SHIP_Z0 + 16], 2.4, 5, 'x', P),
  ductPipe: joinPaths([
    lineFrom([along(0.15), 14.4, SHIP_Z0 + 21], [along(0.8), 14.4, SHIP_Z0 + 21]),
    lineFrom([along(0.15), 14.4, SHIP_Z0 + 15], [along(0.8), 14.4, SHIP_Z0 + 15]),
  ]),
  ductEnds: [along(0.15), along(0.8)].flatMap((x) => [dot([x, 14.4, SHIP_Z0 + 21]), dot([x, 14.4, SHIP_Z0 + 15])]),
  /** 13–14 兩翼 / 13–14 the two wings */
  wingPort: plate(WING_LOCAL, SHIP_Z0 + 8, SHIP_Z0 + 11.5, 0.8),
  wingStarboard: plate(WING_LOCAL.map(([x, y]): Plane => [x, -y]), SHIP_Z0 + 8, SHIP_Z0 + 11.5, 0.8),
  wingRimPort: pathOf(WING_LOCAL.slice(0, 3).map(([x, y]) => at([x, y, SHIP_Z0 + 11.5]))),
  wingRimStarboard: pathOf(WING_LOCAL.slice(0, 3).map(([x, y]) => at([x, -y, SHIP_Z0 + 11.5]))),
  wingPylonsPort: [-8, 40].map((x) => prism([x, -14, SHIP_Z0 + 11.5], [x, -18, SHIP_Z0 + 15.5], 4, 3)),
  wingPylonsStarboard: [-8, 40].map((x) => prism([x, 14, SHIP_Z0 + 11.5], [x, 18, SHIP_Z0 + 15.5], 4, 3)),
  /** 15 塗裝 / 15 livery */
  livery: joinPaths(
    [13.2, -13.2].flatMap((y) => [
      lineFrom([-S + 3, y, SHIP_Z0 + 18], [S - 3, y, SHIP_Z0 + 18]),
      lineFrom([-S + 3, y, SHIP_Z0 + 16], [S - 3, y, SHIP_Z0 + 16]),
    ]),
  ),
  liveryPatch: solid({ x: along(0.6) - 10, y: 12.4, w: 22, d: 1.6, r: 0.8 }, SHIP_Z0 + 13, 5, 3, 0.3),
  liveryDisc: ring(along(0.85), 13.4, 4.6, SHIP_Z0 + 17, P, 18),
  /** 外板縫：肋骨在外板上的對應線（船殼因此讀得出「板包在骨架上」）。左右分開，
      好讓它們跟著各自那一側的外板一起出現（第 7、8 站）。
      Plating seams: each rib's line on the outside of the plating, so the hull reads
      as plating over frames. Split by side so each arrives with its own plating
      (stations 7 and 8). */
  plankSeamsPort: joinPaths(RIB_X.map((x) => lineFrom([x, -12.6, SHIP_Z0 + 3], [x, -12.6, SHIP_Z0 + 20]))),
  plankSeamsStarboard: joinPaths(RIB_X.map((x) => lineFrom([x, 12.6, SHIP_Z0 + 3], [x, 12.6, SHIP_Z0 + 20]))),
  /** 16 引擎艙 / 16 the engine bay */
  bayPort: solid({ x: BAY_X, y: -13, w: 22, d: 4, r: 1 }, SHIP_Z0 + 7, 15, 4, 0.4),
  bayStarboard: solid({ x: BAY_X, y: 9, w: 22, d: 4, r: 1 }, SHIP_Z0 + 7, 15, 4, 0.4),
  bayLintel: solid({ x: BAY_X, y: -13, w: 22, d: 26, r: 2 }, SHIP_Z0 + 22, 3.5, 4, 0.5),
  baySeams: joinPaths([-12, 10].map((y) => lineFrom([BAY_X + 2, y, SHIP_Z0 + 8], [SHIP_STERN, y, SHIP_Z0 + 8]))),
  bayRibs: [-12.6, 10].flatMap((y) => [
    lineFrom([BAY_X, y, SHIP_Z0 + 7], [BAY_X, y, SHIP_Z0 + 22]),
    lineFrom([SHIP_STERN, y, SHIP_Z0 + 7], [SHIP_STERN, y, SHIP_Z0 + 22]),
  ]),
  /** 17 引擎本體 / 17 the engine itself */
  engine: cyl(SHIP_STERN - 11, 0, 8, SHIP_Z0 + 8, 14, 26),
  engineRing: ring(SHIP_STERN - 11, 0, 8, SHIP_Z0 + 22, P, 26),
  engineCollar: cyl(SHIP_STERN - 7, 0, 6.8, SHIP_Z0 + 8, 14, 22),
  engineSlit: facet([
    [SHIP_STERN - 11, -8, SHIP_Z0 + 12],
    [SHIP_STERN - 11, 8, SHIP_Z0 + 12],
    [SHIP_STERN - 11, 8, SHIP_Z0 + 20],
    [SHIP_STERN - 11, -8, SHIP_Z0 + 20],
  ]),
  engineMounts: [-12.4, 12.4].flatMap((y) => [prism([SHIP_STERN - 15, y - 2, SHIP_Z0 + 12], [SHIP_STERN - 7, y - 2, SHIP_Z0 + 12], 4, 2.6)]),
  /** 18 鐘口 / 18 the bell */
  bell: revolveX(
    [
      [SHIP_STERN + 3, 6.2],
      [SHIP_STERN + 7, 7.2],
      [BELL_END - 2, 9.4],
      [BELL_END, 10.2],
    ],
    0,
    ENGINE_Z,
    24,
  ),
  bellRings: joinPaths([
    sideRing([SHIP_STERN + 3.4, 0, ENGINE_Z], 6.4, 'x', P, 20),
    sideRing([BELL_END - 0.6, 0, ENGINE_Z], 10, 'x', P, 24),
  ]),
  bellMouth: sideRing([BELL_END - 1.2, 0, ENGINE_Z], 8, 'x', P, 24),
};

/** 焰的截面半徑輪廓：由鐘口鼓起、往梢端收成點
    The flame's radial profile: it swells from the mouth and tapers to a point */
function flameSections(len: number, peak: number, root: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const stages = 7;
  for (let stage = 0; stage <= stages; stage++) {
    const along = stage / stages;
    const bulge = Math.sin(Math.min(along * 1.3, 1) * Math.PI) ** 0.9;
    const decay = 1 - along ** 1.4;
    out.push([BELL_END + along * len, Math.max(0.2, (root + (peak - root) * bulge) * decay)]);
  }
  return out;
}

export const FIRE_ART = {
  /** 外焰（熔金紅）與焰心（lit 青）：兩層一起看才像一把火 */
  outer: revolveX(flameSections(62, 13, 10), 0, ENGINE_Z, 22),
  inner: revolveX(flameSections(34, 8, 6.2), 0, ENGINE_Z, 22),
  /** 焰心正後方的一小片亮面：全開時最亮的一點 / A small bright face right behind the bell: the hottest point at full burn */
  core: facet([
    [BELL_END + 1, -7.4, ENGINE_Z - 3],
    [BELL_END + 1, 7.4, ENGINE_Z - 3],
    [BELL_END + 1, 7.4, ENGINE_Z + 3],
    [BELL_END + 1, -7.4, ENGINE_Z + 3],
  ]),
  /** 環暈的錨點：鐘口後方 / The halo's anchor: behind the bell's mouth */
  haloAt: at([BELL_END + 8, 0, ENGINE_Z]),
};

// ── 電子手 / The electronic hands ─────────────────────────────────────────

/** 工具頭的種類：由階段的**分組**決定（world/simulation/aftermath/persistence）
    The tool kinds: decided by the phase's **group** (world / simulation / aftermath / persistence) */
export type ToolKind = 'welder' | 'assembler' | 'riveter' | 'scanner' | 'painter' | 'printer' | 'clamp' | 'igniter';

export const TOOL_SCHEDULE: ToolKind[] = [
  'welder', 'welder', // 1–2 world
  'assembler', 'assembler', 'riveter', 'riveter', 'assembler', 'assembler', 'assembler', 'scanner', 'scanner', // 3–11 simulation
  'painter', 'painter', 'painter', 'printer', // 12–15 aftermath
  'clamp', 'clamp', 'igniter', // 16–18 persistence
];

export interface HandArt {
  index: number;
  kind: ToolKind;
  pedestal: SolidPaths;
  column: SolidPaths;
  columnRing: string;
  shoulder: SolidPaths;
  shoulderCap: SolidPaths;
  upper: SolidPaths;
  elbow: SolidPaths;
  forearm: SolidPaths;
  wrist: SolidPaths;
  /** 工具頭：外殼 + 零件（都在工具樞軸座標下）/ The tool: a body plus parts (all under the tool pivot) */
  toolBody: SolidPaths;
  toolParts: SolidPaths[];
  /** 工具頭上的能量面（el-hot / el-melt；透明度由 frame.ts 驅動）/ The tool's energy faces (el-hot / el-melt; opacity driven by frame.ts) */
  toolFaces: SolidPaths[];
  /** 接縫：座與柱、柱與肩 / Seams: pedestal-to-column, column-to-shoulder */
  seams: string;
  /** 樞軸的螢幕點 / The pivots' screen points */
  shoulderPivot: Flat;
  elbowPivot: Flat;
  toolPivot: Flat;
  /** 火花源（工具梢）/ Where the sparks leave (the tool's tip) */
  emit: Flat;
  /** 命中目標（基座正上方）/ The hit target (above the pedestal) */
  hit: Flat;
  hitR: number;
}

/** 工具頭：以 TOOL 為中心，往 −z 出一個頭部；各種工具的零件不同
    The tool: a head centred on TOOL, reaching −z; the parts differ per kind */
function toolArt(kind: ToolKind, x: number) {
  const [tx, ty, tz] = [x + TOOL[0], TOOL[1], TOOL[2]];
  const bodyPlan: Plan = { x: tx - 7, y: ty - 5.5, w: 14, d: 11, r: 2.4 };
  const body = solid(bodyPlan, tz - 4, 7, 4, 0.8);
  const parts: SolidPaths[] = [];
  const faces: SolidPaths[] = [];

  const nozzle = (r: number, from: number, to: number) => cyl(tx, ty, r, from, to - from, 12);
  const faceAt = (plan: Plan, z: number, h: number) =>
    facet([
      [plan.x, plan.y + plan.d, z],
      [plan.x + plan.w, plan.y + plan.d, z],
      [plan.x + plan.w, plan.y + plan.d, z + h],
      [plan.x, plan.y + plan.d, z + h],
    ]);

  switch (kind) {
    // 焊接：單管焊槍 + 槍口那一點弧光 / Welding: one torch and the arc at its tip
    case 'welder':
      parts.push(nozzle(1.6, tz - 13.6, tz - 3.6));
      faces.push(faceAt({ x: tx - 2, y: ty - 2, w: 4, d: 4, r: 0 }, tz - 14.6, 1.4));
      break;
    // 組裝：三軸鎖付（中間一支 + 兩側各一支）/ Assembly: three spindles (one centre, two flanking)
    case 'assembler':
      parts.push(nozzle(1.4, tz - 14.6, tz - 3));
      parts.push(cyl(tx - 4.6, ty, 1.4, tz - 14.6, 11.6, 10));
      parts.push(cyl(tx + 4.6, ty, 1.4, tz - 14.6, 11.6, 10));
      faces.push(faceAt({ x: tx - 6, y: ty - 1.4, w: 12, d: 2.8, r: 0 }, tz - 6.4, 1.6));
      break;
    // 鉚接：一根粗衝頭 + 衝座 / Riveting: one heavy punch and its anvil
    case 'riveter':
      parts.push(nozzle(2.6, tz - 14.2, tz - 3.2));
      parts.push(solid({ x: tx - 4, y: ty - 4, w: 8, d: 8, r: 2 }, tz - 15.6, 2.6, 4, 0.4));
      faces.push(faceAt({ x: tx - 3, y: ty - 3, w: 6, d: 6, r: 0 }, tz - 16.2, 1.2));
      break;
    // 檢驗：一圈鏡頭環 / Inspection: a ring of lenses
    case 'scanner':
      parts.push(nozzle(3.4, tz - 12, tz - 3));
      parts.push(cyl(tx, ty, 4.4, tz - 14.4, 2.4, 14));
      faces.push(faceAt({ x: tx - 4, y: ty - 4, w: 8, d: 8, r: 0 }, tz - 15.4, 1.6));
      break;
    // 塗裝：噴頭 + 一道噴口 / Painting: a spray head and its slit
    case 'painter':
      parts.push(solid({ x: tx - 5.5, y: ty - 4, w: 11, d: 8, r: 2 }, tz - 9.4, 4.6, 4, 0.6));
      parts.push(nozzle(1.4, tz - 15, tz - 9.4));
      faces.push(faceAt({ x: tx - 2.6, y: ty - 1.4, w: 5.2, d: 2.8, r: 0 }, tz - 16, 1.4));
      break;
    // 印記：整排寬頭，一次蓋一整條 / Marking: a wide head that prints a whole stripe
    case 'printer':
      parts.push(solid({ x: tx - 10, y: ty - 3.4, w: 20, d: 6.8, r: 2 }, tz - 11.4, 5.4, 4, 0.6));
      faces.push(faceAt({ x: tx - 8.6, y: ty - 0.8, w: 17.2, d: 1.6, r: 0 }, tz - 13, 1.6));
      break;
    // 吊裝：雙爪夾具 / Rigging: a two-prong clamp
    case 'clamp':
      parts.push(
        solid({ x: tx - 6.4, y: ty - 4.4, w: 3, d: 8.8, r: 1.2 }, tz - 14.6, 3, 4, 0.4),
        solid({ x: tx + 3.4, y: ty - 4.4, w: 3, d: 8.8, r: 1.2 }, tz - 14.6, 3, 4, 0.4),
      );
      faces.push(faceAt({ x: tx - 5, y: ty - 1.4, w: 10, d: 2.8, r: 0 }, tz - 8.4, 1.4));
      break;
    // 點火：噴嘴 + 引燃嘴（第 18 站，與引擎試車同一時間亮）
    case 'igniter':
      parts.push(nozzle(1.8, tz - 14, tz - 3.4));
      parts.push(cyl(tx, ty, 3.8, tz - 18.6, 4.6, 12));
      faces.push(faceAt({ x: tx - 3, y: ty - 3, w: 6, d: 6, r: 0 }, tz - 21.6, 3));
      break;
  }
  return { body, parts, faces };
}

export const HAND_ART: HandArt[] = Array.from({ length: STATIONS }, (_, index) => {
  const station = index + 1;
  const x = stationX(station);
  const kind = TOOL_SCHEDULE[index]!;
  const shoulder: Point3 = [x, ARM_Y, SHOULDER_Z[1] - 2.5];
  const elbow = atStation(station, ELBOW);
  const wrist = atStation(station, WRIST);
  const tool = toolArt(kind, x);
  return {
    index: station,
    kind,
    pedestal: solid({ ...ARM_BASE, x: x + ARM_BASE.x }, 0, ARM_BASE_H, 4, 0.8),
    column: cyl(x, ARM_Y, ARM_COL_R, ARM_COL_Z[0], ARM_COL_Z[1] - ARM_COL_Z[0], 18),
    columnRing: ring(x, ARM_Y, ARM_COL_R - 0.8, ARM_COL_Z[1], P, 18),
    shoulder: cyl(x, ARM_Y, SHOULDER_R, SHOULDER_Z[0], SHOULDER_Z[1] - SHOULDER_Z[0], 20),
    shoulderCap: cyl(x, ARM_Y, SHOULDER_R - 1.6, SHOULDER_Z[1], 1.8, 20),
    upper: prism(shoulder, elbow, ARM_SEG[0], ARM_SEG[1]),
    elbow: cyl(elbow[0], elbow[1], 5.7, elbow[2] - 2.9, 5.8, 16),
    forearm: prism(elbow, wrist, ARM_FORE[0], ARM_FORE[1]),
    wrist: cyl(wrist[0], wrist[1], WRIST_R, wrist[2] - 2.2, 4.4, 14),
    toolBody: tool.body,
    toolParts: tool.parts,
    toolFaces: tool.faces,
    seams: joinPaths([
      planOutline({ ...ARM_BASE, x: x + ARM_BASE.x }, ARM_BASE_H, P, 4),
      lineFrom([x, ARM_Y, ARM_COL_Z[1]], [x, ARM_Y, SHOULDER_Z[0]]),
    ]),
    shoulderPivot: at(shoulder),
    elbowPivot: at(elbow),
    toolPivot: at([x + TOOL[0], TOOL[1], TOOL[2] - 4]),
    emit: at([x + TOOL[0], TOOL[1], TOOL[2] - 17]),
    hit: at([x + ARM_BASE.x + ARM_BASE.w / 2, ARM_Y, 0]),
    hitR: ARM_HIT_R,
  };
});

// ── 里程計 / The odometer ─────────────────────────────────────────────────

const ODO_SCREWS: Plane[] = [
  [ODO.x + 4.5, ODO.y + 4.5],
  [ODO.x + ODO.w - 4.5, ODO.y + 4.5],
  [ODO.x + 4.5, ODO.y + ODO.d - 4.5],
  [ODO.x + ODO.w - 4.5, ODO.y + ODO.d - 4.5],
];

export const ODO_ART = {
  housing: solid(ODO, 0, ODO_H, 6, 1.2),
  bezel: planOutline(insetPlan(ODO, 3), ODO_H, P),
  window: solid(ODO_WINDOW, ODO_H - 0.5, 0.5, 4),
  windowLine: planOutline(ODO_WINDOW, ODO_H, P, 4),
  dividers: joinPaths(
    [1, 2, 3].map((slot) =>
      onTop(
        [
          [ODO_FIRST_X + slot * ODO_STEP, ODO_WINDOW.y],
          [ODO_FIRST_X + slot * ODO_STEP, ODO_WINDOW.y + ODO_WINDOW.d],
        ],
        ODO_H + 0.3,
        P,
      ),
    ),
  ),
  /** 每位數的頂面矩陣；文字帶掛在它下面，每帧補一個 translate / Each digit slot's top-face matrix; the strip hangs under it with a per-frame translate */
  digitSlots: Array.from({ length: 4 }, (_, slot) =>
    topMatrix([ODO_FIRST_X + slot * ODO_STEP + ODO_STEP / 2, ODO_WINDOW.y + ODO_WINDOW.d / 2], ODO_H + 0.3, P),
  ),
  clip: planOutline(insetPlan(ODO_WINDOW, 1.4), ODO_H + 0.3, P, 4),
  screws: ODO_SCREWS.map(([x, y]) => dot([x, y, ODO_H])),
  screwRings: joinPaths(ODO_SCREWS.map(([x, y]) => screwRing(x, y, ODO_H))),
};

// ── 銘牌 / The engraved label plate ───────────────────────────────────────

export const LABEL_ART = {
  plate: solid(LABEL_PLATE, 0, 0.9, 4),
  line: planOutline(insetPlan(LABEL_PLATE, 1.8), 0.9, P),
  // 刻線是印的字：允許停在素面上 / The rules are printed text: they may stop on a bare face
  rules: joinPaths(
    [0, 1, 2].map((row) =>
      onTop(
        [
          [LABEL_PLATE.x + 8, LABEL_PLATE.y + 3.6 + row * 2.4],
          [LABEL_PLATE.x + (row === 1 ? 36 : 46), LABEL_PLATE.y + 3.6 + row * 2.4],
        ],
        0.9,
        P,
      ),
    ),
  ),
  screws: [
    dot([LABEL_PLATE.x + 3.6, LABEL_PLATE.y + LABEL_PLATE.d / 2, 0.9]),
    dot([LABEL_PLATE.x + LABEL_PLATE.w - 3.6, LABEL_PLATE.y + LABEL_PLATE.d / 2, 0.9]),
  ],
};
