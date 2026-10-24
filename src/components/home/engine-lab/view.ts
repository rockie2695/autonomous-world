// ============================================================================
// 星艦裝配線佈局 / The starship assembly line layout
// ============================================================================
// 一條 18 工位的裝配線：**18 隻電子手**站在廠房後側、沿 x 排成一列，產品（星艦）
// 坐在前後兩條導軌之間的托架上，從第 1 站走到第 18 站——一個回合跑完 18 個階段，
// 線上也走完 18 站，末端裝上引擎並試車。後牆是配電櫃與狀態燈條、天花板是行車樑
// 與 18 盞工位燈、第 15–16 站之間是熔金塔（澆鑄引擎）；左前是里程計（滾真實回合
// 數）、右前是銘牌、地板前緣是走道與料件。
//
// An 18-station assembly line: **18 electronic hands** stand at the back of the
// hall in a row along x, and the product — a starship — rides a cradle between two
// guide rails, travelling from station 1 to station 18: one round runs its 18
// phases, the line walks its 18 stations, and the engine is fitted and test-fired at
// the end. The back wall carries the cabinets and the status strip, the ceiling a
// travelling beam with 18 station lamps, the crucible stands between stations 15 and
// 16 (it pours the engine); the odometer (the real round count) sits front left, the
// label plate front right, and the floor's front strip carries a walkway and stock.
//
// 三個幾何約束（都是投影逼出來的，不是美感）：
// ① **畫家序是固定的三層**：遠景（後牆、配電櫃、熔金塔、天花板、**18 隻手**）→
//    產品（托架 + 星艦）→ 近景（前導軌、走道與料件、里程計、銘牌）。裝配線不像
//    上一版的環會公轉，沒有任何零件每帧換層，所以三層寫死就好。
// ② **手只轉關節、不平移**：靜止姿在模組載入時算好，每帧只寫關節與工具頭的
//    transform（見 frame.ts 的 armPose），路徑永不重建。
// ③ **星艦只平移**：正交投影下平移不變形，所以整條船的移動是一個 transform
//    （shift(dx,0,0)），船上的零件由 display 開關，不重建。
//
// Three constraints the projection forces, none of them cosmetic:
// ① **The painter's order is a fixed three planes**: far (back wall, cabinets,
//    crucible, ceiling, the **18 hands**) → product (cradle + ship) → near (front
//    rail, walkway and stock, odometer, label plate). An assembly line never moves a
//    part between layers the way the previous orbiting ring did, so three written
//    planes are enough.
// ② **A hand only rotates its joints, never translates**: the rest pose is computed
//    at module load and a frame writes joint and tool transforms only (frame.ts's
//    armPose). Paths are never rebuilt.
// ③ **The ship only translates**: plan translation is shape-preserving in
//    orthographic projection, so the whole vessel's travel is one transform
//    (shift(dx,0,0)) while its parts are switched by display.
// ============================================================================

import { fitProjection, iso, type Flat, type Plan, type Point3, type Projection } from '@/components/iso/iso-kit';

export const WIDTH = 1040;
export const HEIGHT = 480;
const PAD = 24;
export const AZIMUTH = 57;
export const AZIMUTH_RAD = (AZIMUTH * Math.PI) / 180;

/** 階段數：單一來源是 ROUND_PHASES.length，這裡只是幾何的本地鏡像
    Station count: the single source is ROUND_PHASES.length; mirrored here for geometry */
export const STATIONS = 18;

// ── 廠房地面 / The hall floor ──────────────────────────────────────────────
// 深度壓到 250：廠房的地面深度是投影高度的主要來源，太深會讓 fit 縮小、整張圖
// 變小（實測 312 的時候每個零件都只有幾 px）。
// The depth is held at 250: the floor's depth is the main contributor to the
// projected height, and a deeper hall shrinks the fit — at 312 every part measured
// only a few px.
export const HALL: Plan = { x: -400, y: -140, w: 800, d: 250, r: 8 };
export const HALL_H = 10;
export const FOOT_H = 6;

// ── 裝配線（軸沿 x，產品中心在 y=LINE_Y）/ The line (axis along x, product centred on y) ──
export const LINE_X0 = -320;
export const LINE_PITCH = 36;
export const LINE_Y = 0;
/** 第 index 站（1..18）的世界 x / Station index's world x (1..18) */
export const stationX = (index: number) => LINE_X0 + (index - 1) * LINE_PITCH;
/** 最後一站的 x / The last station's x */
export const LINE_END = stationX(STATIONS);

// ── 導軌 / The guide rails ────────────────────────────────────────────────
export const RAIL_FAR: Plan = { x: -396, y: -34, w: 792, d: 8, r: 2 };
export const RAIL_NEAR: Plan = { x: -396, y: 26, w: 792, d: 8, r: 2 };
export const RAIL_H = 5;
/** 滾子間距（導軌上的軸承，裝飾細節）/ Roller pitch (the rails' bearings, decorative) */
export const ROLLER_STEP = 44;

// ── 星艦與托架 / The ship and its cradle ──────────────────────────────────
// 船的所有零件都以 SHIP_HALF 為基準寫（geometry.ts 的 along/flank 系列），所以改
// 船長只改這一個數字——船是這張圖的主角，它的尺寸不該散成 40 個魔術數字。
// Every part of the ship is written relative to SHIP_HALF (geometry.ts's `along` /
// `flank` helpers), so resizing the ship is one number — the ship is the subject of
// this figure and its size must not be scattered across forty magic numbers.
export const SHIP_LEN = 160;
export const SHIP_HALF = SHIP_LEN / 2;
/** 船體半寬 / The hull's half-width */
export const SHIP_Y = 20;
export const SHIP_Z0 = 6;
/** 引擎艙尾端 + 鐘口的 x（船體局部）/ The engine bay's stern and the bell's x (ship-local) */
export const SHIP_STERN = SHIP_HALF;
export const BELL_END = SHIP_HALF + 18;
/** 桅杆頂（船體局部 z）/ The mast's top (ship-local z) */
export const SHIP_TOP = 46;
/** 甲板頂（船體局部 z）：火花的落點用它 / The deck's top (ship-local z): where the sparks land */
export const SHIP_DECK_Z = SHIP_Z0 + 23.5;
export const CRADLE: Plan = { x: -SHIP_HALF + 22, y: -24, w: SHIP_LEN - 44, d: 48, r: 3 };
export const CRADLE_H = 5;
/** 完工的船滑出廠房的距離；同時在淡出，所以不必走遠（也不會把畫布撐大）
    How far the finished ship rolls out before it is gone; it fades as it goes, so it need not travel far (and cannot stretch the canvas) */
export const SHIP_EXIT = 40;

// ── 電子手 / The electronic hands ─────────────────────────────────────────
export const ARM_Y = -96;
/** 基座（相對工位 x）/ The pedestal (relative to the station's x) */
export const ARM_BASE: Plan = { x: -14, y: -110, w: 28, d: 28, r: 4 };
export const ARM_BASE_H = 7;
export const ARM_COL_R = 7.6;
export const ARM_COL_Z: [number, number] = [7, 23];
export const SHOULDER_R = 9.6;
export const SHOULDER_Z: [number, number] = [23, 30];
// 手臂的三個樞軸：x 相對工位，y/z 是世界座標（第 i 站 = stationX(i) + 這個 x）。
// 世界座標直接寫 y/z 比寫「相對肩部」好讀，也讓 fit 與命中圈的點一眼看得懂。
// The arm's three pivots: x relative to the station, y/z in world units (station i
// sits at stationX(i) + this x). Absolute y/z reads better than shoulder-relative
// offsets, and it keeps the fit points and the hit circles self-evident.
/** 肘 / The elbow */
export const ELBOW: Point3 = [11, -84, 42];
/** 腕 / The wrist */
export const WRIST: Point3 = [7, -52, 40];
/** 工具頭的懸停點：船的左舷正上方（永遠高於甲板；艦橋在下方的船中央，不在這裡）
    The tool's hover point: above the ship's far flank (always clear of the deck; the
    bridge sits on the centreline, well away from this lateral position) */
export const TOOL: Point3 = [6, -14, 31];
/** 第 index 站的樞軸 → 世界點 / A station's pivot → its world point */
export const atStation = (index: number, pivot: Point3): Point3 => [
  stationX(index) + pivot[0],
  pivot[1],
  pivot[2],
];
export const ARM_SEG: [number, number] = [11.5, 9.5];
export const ARM_FORE: [number, number] = [8.6, 7.6];
export const WRIST_R = 5;
export const ARM_HIT_R = 17;

// ── 後牆配電櫃與狀態燈條 / The back wall's cabinets and status strip ─────
export const RACK: Plan = { x: -400, y: -138, w: 800, d: 14, r: 3 };
export const RACK_H = 30;
export const CABINET: Plan = { x: 0, y: -118, w: 48, d: 22, r: 3 };
export const CABINET_H = 26;
/** 配電櫃的 x（四個，避開熔金塔）/ The four cabinets' x (clear of the crucible) */
export const CABINET_X = [-392, -196, -84, 132] as const;

// ── 天花板行車樑與工位燈 / The ceiling beam and the station lamps ─────────
export const BEAM: Plan = { x: -400, y: -58, w: 800, d: 16, r: 2 };
export const BEAM_Z: [number, number] = [64, 70];
/** 樑的吊架 x / The beam's hanger x positions */
export const HANGER_X = [-390, -230, -70, 90, 250, 390] as const;
export const HANGER_W = 5;
/** 工位燈：懸在裝配線正上方的一小塊發光面 / A station lamp: a small lit face hanging over the line */
export const LAMP: Plan = { x: 5, y: -46, w: 27, d: 12, r: 2 };
export const LAMP_Z: [number, number] = [60, 62.5];

// ── 熔金塔（澆鑄引擎的那一爐）/ The crucible tower (the pour that fills the engine) ──
// 熔金塔刻意**不**放在最後一站旁邊：末端是完工船的停泊位（休息態就停在那裡），
// 兩者在畫面上會擠成一團。它在第 15–16 站之間，澆槽伸向線上的引擎艙。
// The crucible deliberately sits **not** beside the last station: the end bay is where
// the finished ship rests, and the two crowded each other on screen. It stands
// between stations 15 and 16, its spout reaching toward the engine bay on the line.
export const CRUCIBLE: Plan = { x: 196, y: -128, w: 38, d: 32, r: 4 };
export const CRUCIBLE_H = 32;
/** 澆口窗：開在 +x 面 / The pour window: on the +x face */
export const CRUCIBLE_WIN_Z: [number, number] = [9, 22];
/** 澆槽：從塔頂伸向裝配線的斜槽 / The spout: an angled trough from the tower's top toward the line */
export const SPOUT_FROM: Point3 = [216, -118, 32];
export const SPOUT_TO: Point3 = [250, -66, 44];

// ── 地板前緣：走道與料件 / The floor's front strip: a walkway and some pallets ─
// 前緣那一條不該是空地：工廠的地板有走道、有碼好的料件。它們同時解決構圖問題
// ——空曠的前景會讓整張圖看起來沒畫完。
// The front strip must not be bare ground: a factory floor has a walkway and stacked
// stock. They also solve a composition problem — an empty foreground reads as an
// unfinished drawing.
export const WALKWAY: Plan = { x: -372, y: 44, w: 744, d: 18, r: 2 };
export const WALKWAY_H = 1.6;
/** 料件（托盤與貨箱，沿走道前緣）/ The stock (pallets and crates along the walkway) */
export const PALLETS: Plan[] = [
  { x: -300, y: 74, w: 34, d: 24, r: 2 },
  { x: -258, y: 78, w: 24, d: 18, r: 2 },
  { x: -96, y: 76, w: 30, d: 22, r: 2 },
  { x: -58, y: 80, w: 20, d: 16, r: 2 },
  { x: 128, y: 74, w: 32, d: 22, r: 2 },
  { x: 170, y: 79, w: 22, d: 16, r: 2 },
];
export const PALLET_H = [11, 7, 13, 6, 10, 6] as const;

// ── 里程計（真實回合數）/ The odometer (the real round count) ──────────────
export const ODO: Plan = { x: -388, y: 66, w: 78, d: 34, r: 4 };
export const ODO_H = 22;
/** 窗口深度 ≈ 1 格：太深會讓鄰位字形探頭（ghost glyph）/ The window is ≈ 1 slot deep — a deeper window lets the next digit's glyph lean in (the ghost glyph) */
export const ODO_WINDOW: Plan = { x: ODO.x + 8, y: ODO.y + 11, w: 62, d: 12, r: 3 };
export const ODO_DIGITS = 4;
export const ODO_STEP = 13;
export const ODO_FIRST_X = ODO_WINDOW.x + 5;

// ── 銘牌 / The engraved label plate ───────────────────────────────────────
export const LABEL_PLATE: Plan = { x: 300, y: 66, w: 58, d: 12, r: 2 };

// ── 投影 / The projection ─────────────────────────────────────────────────
//
// 納入 fit 的極端點：廠房外緣、後牆與樑頂、熔金塔與澆槽梢、手的工具頭、星艦
// 在**兩端**（第 1 站與第 18 站 + 滑出距離）的位置、里程計與銘牌。星艦的滑出
// 位置一定要在 fit 裡——`.iso-svg` 是 overflow:visible，漏掉它，淡出中的船會
// 畫到卡片外面去。
// The extremes fed to the fit: the hall's rim, the rack and beam tops, the crucible
// and its spout's tip, a hand's tool head, the ship at **both** ends (station 1 and
// station 18 plus the exit travel), the odometer and the plate. The exit position has
// to be inside the fit — `.iso-svg` is overflow:visible, so leaving it out would
// paint the fading ship outside the card.
const fitPoints = (plan: Plan, z0: number, z1: number): Point3[] => {
  const out: Point3[] = [];
  for (const px of [plan.x, plan.x + plan.w]) {
    for (const py of [plan.y, plan.y + plan.d]) {
      for (const z of [z0, z1]) out.push([px, py, z]);
    }
  }
  return out;
};

/** 船體在船中心 x=centre 時的世界包絡 / The ship's world envelope when its centre sits at `centre` */
const shipEnvelope = (centre: number): Point3[] => [
  [centre - SHIP_HALF, -30, SHIP_Z0],
  [centre - SHIP_HALF, 30, SHIP_TOP],
  [centre + BELL_END, -30, SHIP_Z0],
  [centre + BELL_END, 30, SHIP_TOP],
];

export const P: Projection = fitProjection(
  [
    ...fitPoints(HALL, -FOOT_H - HALL_H, 0),
    ...fitPoints(RACK, 0, RACK_H),
    ...fitPoints(BEAM, BEAM_Z[0], BEAM_Z[1]),
    ...fitPoints(CRUCIBLE, 0, CRUCIBLE_H),
    ...fitPoints(ODO, 0, ODO_H),
    ...fitPoints(LABEL_PLATE, 0, 1),
    ...HANGER_X.map((x): Point3 => [x, BEAM.y + BEAM.d / 2, RACK_H]),
    [SPOUT_FROM[0] + 6, SPOUT_TO[1], SPOUT_TO[2]],
    [SPOUT_TO[0] + 6, SPOUT_TO[1], SPOUT_TO[2]],
    // 兩端：手的工具頭（第 1 站與第 18 站）/ Both ends: a hand's tool head (stations 1 and 18)
    atStation(1, TOOL),
    atStation(STATIONS, TOOL),
    // 兩端：星艦（第 1 站、第 18 站與滑出）/ Both ends: the ship (station 1, station 18, and the exit)
    ...shipEnvelope(stationX(1)),
    ...shipEnvelope(stationX(STATIONS)),
    ...shipEnvelope(stationX(STATIONS) + SHIP_EXIT),
    // 導軌的兩端（熔金塔前方沒有東西，但導軌要收進來）/ The rails' two ends (nothing precedes the tower, but the rails must be inside)
    [RAIL_FAR.x, RAIL_FAR.y, RAIL_H],
    [RAIL_NEAR.x + RAIL_NEAR.w, RAIL_NEAR.y + RAIL_NEAR.d, RAIL_H],
  ],
  WIDTH,
  HEIGHT,
  { pad: PAD, azimuth: AZIMUTH },
);

/** 世界 → 螢幕 / World → screen */
export const at = (point: Point3): Flat => iso(point, P);

const ORIGIN = at([0, 0, 0]);
const minus = (a: Flat, b: Flat): Flat => [a[0] - b[0], a[1] - b[1]];
/** 世界 +x 一步的螢幕向量 / The screen vector of one +x world step */
export const EX = minus(at([1, 0, 0]), ORIGIN);
/** 世界 +z 一步的螢幕向量 / The screen vector of one +z world step */
export const EZ = minus(at([0, 0, 1]), ORIGIN);

const fine = (value: number) => Math.round(value * 100) / 100;

/** 世界平移 → SVG transform（星艦沿線移動用）/ A world delta as an SVG transform (the ship's travel) */
export const shift = (dx: number, dy: number, dz = 0) =>
  `translate(${fine(EX[0] * dx + EZ[0] * dz)} ${fine(EX[1] * dx + EZ[1] * dz)})`;

/** 螢幕座標繞一點旋轉（關節；見 frame.ts 對「螢幕旋轉」的說明）
    A screen-space rotation about a point (a joint; see frame.ts on screen rotations) */
export const spin = (deg: number, pivot: Flat) =>
  `rotate(${fine(deg)} ${fine(pivot[0])} ${fine(pivot[1])})`;
