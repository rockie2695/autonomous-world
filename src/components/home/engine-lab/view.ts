// ============================================================================
// 星艦裝配線佈局 / The starship assembly line layout
// ============================================================================
// 一條 18 工位的裝配線：**18 隻電子手分兩列站**——奇數站在遠列（船的後舷側）、
// 偶數站在近列（船的前舷側），每第三隻手踩在凸起的地台上；導軌與船沿一條平緩的
// S 曲線走（lineY），從第 1 站走到第 18 站——一個回合跑完 18 個階段，線上也走
// 完 18 站，末端裝上引擎並試車。後牆是配電櫃與狀態燈條、天花板是行車樑與 18 盞
// 工位燈、出料端是熔金塔（澆鑄引擎）；前緣是里程計（滾真實回合數）與銘牌，
// 遠側地板有走道與料件，近側的手之間放了幾個料箱。
//
// An 18-station assembly line: the **18 electronic hands stand in two rows** —
// odd stations in the far row, taking the ship's far flank, even stations in the
// near row, taking the near flank, and every third hand stands on a raised plinth.
// The rails and the ship ride a **gentle S curve** (lineY) from station 1 to
// station 18: one round runs its 18 phases, the line walks its 18 stations, and
// the engine is fitted and test-fired at the end. The back wall carries cabinets
// and the status strip, the ceiling a beam and 18 station lamps, the crucible
// stands at the output end (it pours the engine); the odometer and the label plate
// sit on the front strip, a walkway and stock run along the far floor, and a few
// crates fill the gaps between the near-row hands.
//
// 四個幾何約束（都是投影逼出來的，不是美感）：
// ① **畫家序是固定的四層**：遠景（後牆、配電櫃、熔金塔、遠側走道與料件、天花板、
//    遠導軌、**遠列的手**）→ 產品（托架 + 星艦）→ 近導軌 → **近列的手**（比導軌
//    更近，手與料箱、前緣的里程計／銘牌在船之前畫才不會被船蓋掉）。裝配線不像
//    上一版的環會公轉，沒有任何零件每帧換層，所以四層寫死就好。
// ② **手只轉關節、不平移**：靜止姿在模組載入時算好，每帧只寫關節與工具頭的
//    transform（見 frame.ts 的 armPose），路徑永不重建。
// ③ **曲線是平緩的 S**：lineY = 11·sin(2π(x+320)/690)，最大斜率 ≈ 5.7°——手、
//    地台與工具頭的樞軸都跟著線走（座位 = lineY ± 96），所以船開到哪一站，
//    那一站的工具頭永遠懸在船舷正上方，導軌正好在托架滑靴下面。
// ④ **船的移動 = 平移 + 一個小螢幕旋轉**：正交投影下平移不變形，但船沿曲線走，
//    船軸要跟著切線傾才不會「坐在彎撞直的軌上」。旋轉是螢幕旋轉（繞船中心的
//    rotate + 平移），最大約 6°（CURVE_AMP·2π/WAVE 造成的切線角），小到關節近似
//    的偏差看不出來；角度一旦放大就會顯形。
//
// Four constraints the projection forces, none of them cosmetic:
// ① **The painter's order is a fixed four planes**: far (back wall, cabinets,
//    crucible, far walkway and stock, ceiling, far rail, the **far-row hands**) →
//    product (cradle + ship) → near rail → **near-row hands** (the hands, the
//    crates, the odometer and the plate are closer than the rail, so they paint
//    after the product). An assembly line never moves a part between layers the
//    way the previous orbiting ring did, so four written planes are enough.
// ② **A hand only rotates its joints, never translates**: the rest pose is
//    computed once at load and a frame writes joint and tool transforms only
//    (frame.ts's armPose). Paths are never rebuilt.
// ③ **The curve is a gentle S**: lineY = 11·sin(2π(x+320)/690), steepest slope
//    ≈ 5.7°. Hands, plinths and tool pivots all follow it (the seat sits at
//    lineY ± 96), so whatever station the ship is at, that hand's tool hangs over
//    the ship's flank and the rails sit exactly under the cradle's skids.
// ④ **The ship travels by translation plus one small screen rotation**: plan
//    translation is shape-preserving in orthographic projection, but the ship rides
//    a curve, so its axis has to lean with the tangent or it reads as sitting on
//    bent rails with straight skids. The rotation is a screen rotation about the
//    ship's centre, at most ~6° (the tangent angle implied by
//    CURVE_AMP·2π/WAVE) — small enough that the approximation's deviation is
//    invisible. Widen it and the deviation becomes visible again.
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
// 加深到 310：第二列手要有真正的縱深（近列在 +96、遠列在 −96，加上後牆的櫃子
// 才不會擠成一疊）。代價是每一個零件在 fit 裡都小了一點——實測這個深度下各零件
// 仍讀得出來，兩列手比單列佔了整張圖的視覺重量。
// Deepened to 310: a second row of hands needs real depth (the near row at +96,
// the far row at −96, plus the wall's cabinets must not stack up). The cost is
// that every part shrink slightly in the fit — at this depth they still all read;
// two rows carry more of the figure's visual weight than one row did.
export const HALL: Plan = { x: -400, y: -170, w: 800, d: 310, r: 8 };
export const HALL_H = 10;
export const FOOT_H = 6;

// ── 裝配線與 S 曲線 / The line and its S curve ────────────────────────────
// 曲線不是裝飾：直線的兩列手會把整張圖讀成一把尺，而工廠的輸送線是彎的。振幅
// 11 世界單位、波長 690——最大斜率 11·2π/690 ≈ 0.10（約 5.7°），一切跟線走的
// 東西（手、地台、工具頭、導軌分段）都足以跟上，而船的切線旋轉也保持在幾度的
// 範圍內。
// The curve is not decoration: a straight two-row line reads as a ruler, and a
// factory conveyor bends. Amplitude 11 world units over a 690 wavelength — the
// steepest slope is 11·2π/690 ≈ 0.10 (about 5.7°) — is enough to carry the draft
// without anything that follows it (hands, plinths, tool heads, rail segments)
// having to exaggerate, and it keeps the ship's tangent spin within a few degrees.
export const LINE_X0 = -320;
export const LINE_PITCH = 36;
/** 第 index 站（1..18）的世界 x / Station index's world x (1..18) */
export const stationX = (index: number) => LINE_X0 + (index - 1) * LINE_PITCH;
/** 最後一站的 x / The last station's x */
export const LINE_END = stationX(STATIONS);
/** 曲線的振幅與波長 / The curve's amplitude and wavelength */
export const CURVE_AMP = 11;
export const CURVE_WAVE = 690;
/** 線的世界 y：平緩的 S 曲線 / The line's world y: a gentle S curve */
export const lineY = (x: number) =>
  CURVE_AMP * Math.sin((2 * Math.PI * (x - LINE_X0)) / CURVE_WAVE);
/** 線的斜率（船的切線旋轉要吃它）/ The line's slope (the ship's tangent spin feeds on it) */
export const lineDy = (x: number) =>
  (CURVE_AMP * 2 * Math.PI) / CURVE_WAVE * Math.cos((2 * Math.PI * (x - LINE_X0)) / CURVE_WAVE);

// ── 導軌（沿曲線分段）/ The rails (segmented along the curve) ─────────────
// 導軌不再是兩根直條：它們是一段段凸四邊形沿曲線拼出來的（每 32 走一步，段的
// y 差最多 ~3.5，四角永遠是凸四邊形）。遠軌貼在線的後緣（26..34）、近軌貼前緣。
// The rails are no longer two straight bars: they are a chain of convex quads laid
// along the curve (a step every 32 keeps a segment's y delta ≤ ~3.5, so every quad
// stays convex). The far rail hugs the line's back edge (26..34 out), the near
// rail its front edge.
export const RAIL_X0 = -396;
export const RAIL_X1 = 396;
export const RAIL_STEP = 32;
export const RAIL_H = 5;
/** 導軌到線中心的內緣／外緣距離 / The rails' inner and outer edge distances from the line */
export const RAIL_IN = 26;
export const RAIL_OUT = 34;
/** 滾子間距（導軌上的軸承，裝飾細節）/ Roller pitch (the rails' bearings, decorative) */
export const ROLLER_STEP = 44;
/** 導軌在 x 的上下邊緣（沿曲線）/ A rail's y edges at x, along the curve */
export const railBand = (x: number, far: boolean): [number, number] =>
  far ? [lineY(x) - RAIL_OUT, lineY(x) - RAIL_IN] : [lineY(x) + RAIL_IN, lineY(x) + RAIL_OUT];

// ── 星艦與托架 / The ship and its cradle ──────────────────────────────────
// 船的所有零件都以 SHIP_HALF 為基準寫（geometry.ts 的 along/flank 系列），所以改
// 船長只改這一個數字——船是這張圖的主角，它的尺寸不該散成 40 個魔術數字。
// Every part of the ship is written relative to SHIP_HALF (geometry.ts's `along` /
// `flank` helpers), so resizing the ship is one number — the ship is the subject of
// this figure and its size must not be scattered across forty magic numbers.
export const SHIP_LEN = 160;
export const SHIP_HALF = SHIP_LEN / 2;
/** 船體半寬 / The hull's half-width */
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

// ── 電子手（兩列 + 地台）/ The electronic hands (two rows and a plinth) ───
// 奇數站在遠列（貼船的後舷）、偶數站在近列（貼前舷），每第三隻手踩在 12 高的
// 地台上——兩列比一列更讀得懂「18 個工位就是 18 個階段」這句話，因為每隻手
// 都在它自己的側面上工作。
// Odd stations stand in the far row (taking the ship's far flank), even stations
// in the near row, and every third hand stands on a 12-high plinth — two rows tell
// "18 stations are the 18 phases" better than one, because every hand works on its
// own side of the ship.
export const ROW_OFFSET = 96;
/** 地台：第 3/6/9/12/15/18 站踩著的一塊 12 高座 / The plinth: the raised seat under stations 3/6/9/12/15/18 */
export const PLINTH_H = 12;
export const plinthAt = (index: number) => index % 3 === 0;
/** 座位的 z0：踩著地台的手整組抬高 / A seat's z0: a plinthed hand rises whole */
export const seatZ = (index: number) => (plinthAt(index) ? PLINTH_H : 0);
/** 座位的世界 y：跟著曲線走（lineY ± 96）/ A seat's world y: it follows the curve (lineY ± 96) */
export const seatY = (index: number) =>
  lineY(stationX(index)) + (index % 2 === 1 ? -ROW_OFFSET : ROW_OFFSET);
/** 工作方向：遠列的手朝 +y 伸向線、近列朝 −y / The reach direction: the far row leans +y toward the line, the near row −y */
export const reachSign = (index: number) => (index % 2 === 1 ? 1 : -1);
/** 基座（相對座位）／地台（相對工位）：兩者都以座位為中心 / The pedestal (seat-relative) and the plinth (station-relative), both centred on the seat */
export const ARM_BASE: Plan = { x: -14, y: -14, w: 28, d: 28, r: 4 };
export const PLINTH: Plan = { x: -22, y: -24, w: 44, d: 48, r: 3 };
export const ARM_BASE_H = 7;
export const ARM_COL_R = 7.6;
export const ARM_COL_Z: [number, number] = [7, 23];
export const SHOULDER_R = 9.6;
export const SHOULDER_Z: [number, number] = [23, 30];
// 手臂的三個樞軸：**相對座位**——x 相對工位、y 相對座位（乘上 reachSign 决定伸向
// 哪一舷）、z 相對座位地台。遠列（+1）：肘 +12、腕 +44、工具 +84；近列（−1）鏡像。
// 這樣「座位到工具的 dy = ±84」對兩列都是同一個數字，工具頭正好懸在船舷 ±12 上。
// The arm's three pivots, **seat-relative** — x from the station, y from the seat
// (multiplied by reachSign to pick the flank), z from the seat plate. Far row
// (+1): elbow +12, wrist +44, tool +84; the near row mirrors. So "the seat-to-tool
// dy is ±84" is one number for both rows, and the tool hovers exactly over the
// ship's flank at ±12.
/** 肘 / The elbow */
export const ELBOW: Point3 = [11, 12, 42];
/** 腕 / The wrist */
export const WRIST: Point3 = [7, 44, 40];
/** 工具頭的懸停點（船舷正上方；艦橋在船中央，不在這裡）/ The tool's hover point (over the ship's flank; the bridge sits on the centreline, well away) */
export const TOOL: Point3 = [6, 84, 31];
/** 第 index 站的樞軸 → 世界點 / A station's pivot → its world point */
export const atStation = (index: number, pivot: Point3): Point3 => [
  stationX(index) + pivot[0],
  seatY(index) + reachSign(index) * pivot[1],
  seatZ(index) + pivot[2],
];
/** 工具頭的世界點（火花源與命中圈要吃它）/ The tool head's world point (sparks and hit maths read it) */
export const toolPoint = (index: number) => atStation(index, TOOL);
/** 工具梢（火花離開的地方）/ The tool's tip (where the sparks leave) */
export const emitPoint = (index: number) =>
  atStation(index, [TOOL[0], TOOL[1], TOOL[2] - 17]);
/** 火花的落點：往船中線收 2.5、落在甲板頂 / Where sparks land: 2.5 toward the centreline, on the deck's top */
export const sparkLand = (index: number, spread: number): Point3 => [
  stationX(index) + TOOL[0] + spread,
  seatY(index) + reachSign(index) * (TOOL[1] + 2.5),
  SHIP_DECK_Z,
];
export const ARM_SEG: [number, number] = [11.5, 9.5];
export const ARM_FORE: [number, number] = [8.6, 7.6];
export const WRIST_R = 5;
export const ARM_HIT_R = 17;

// ── 後牆配電櫃與狀態燈條 / The back wall's cabinets and status strip ─────
export const RACK: Plan = { x: -400, y: -168, w: 800, d: 14, r: 3 };
export const RACK_H = 30;
export const CABINET: Plan = { x: 0, y: -150, w: 48, d: 22, r: 3 };
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
// 熔金塔搬到**出料端**：末端正好是引擎要進去的艙位（第 17 站）與完工船出廠的
// 方向，澆口就守在旁邊——上一版它站第 15–16 站之間，是因為那時出料端還不擠；
// 改兩列之後，塔在遠側的這個位置既避開近列的手，也讓「澆鑄 → 裝引擎」讀成
// 連續的一個動作。
// The crucible moved to the **output end**: the end bay is where the engine goes
// in (station 17) and finished ships leave, so the pour stands guard beside it.
// The previous version stood between stations 15–16 because the end bay was not
// crowded then; with two rows, this far-side spot both clears the near-row hands
// and reads the pour and the fit as one continuous act.
export const CRUCIBLE: Plan = { x: 300, y: -128, w: 38, d: 32, r: 4 };
export const CRUCIBLE_H = 32;
/** 澆口窗：開在 +x 面 / The pour window: on the +x face */
export const CRUCIBLE_WIN_Z: [number, number] = [9, 22];
/** 澆槽：從塔頂伸向裝配線的斜槽 / The spout: an angled trough from the tower's top toward the line */
export const SPOUT_FROM: Point3 = [316, -118, 32];
export const SPOUT_TO: Point3 = [300, -66, 44];

// ── 遠側地板：走道與料件 / The far floor: a walkway and stock ─────────────
// 走道移到機器的**後方**——工廠的料件應該在輸送線的旁邊，擋在人前是構圖錯誤；
// 料件踩在走道上（z 從 WALKWAY_H 算起）。
// The walkway moved to the **back** of the line — a factory stages its stock beside
// the conveyor, never between the machine and the viewer; the stock sits on the
// walkway (its z starts at WALKWAY_H).
export const WALKWAY: Plan = { x: -372, y: -80, w: 744, d: 22, r: 2 };
export const WALKWAY_H = 1.6;
/** 料件（托盤，踩在走道上）/ The stock (pallets standing on the walkway) */
export const PALLETS: Plan[] = [
  { x: -300, y: -77, w: 30, d: 17, r: 2 },
  { x: -104, y: -77, w: 24, d: 16, r: 2 },
  { x: 128, y: -77, w: 30, d: 17, r: 2 },
  { x: 236, y: -77, w: 22, d: 15, r: 2 },
];
export const PALLET_H = [11, 7, 10, 6] as const;

// ── 近側料箱 / The near-side crates ──────────────────────────────────────
// 幾個板條箱放在**近列手之間的間隙**裡（y 58 起，剛好在導軌外緣 34 的外面、
// 近列基座帶的裡面），讓近側地板不是一片空地。
// A few crates fill the **gaps between the near-row hands** (y from 58, just
// outside the rail's outer edge at 34 and inside the near pedestals' band), so the
// near floor is not bare ground.
export const CRATES: Plan[] = [
  { x: -264, y: 58, w: 22, d: 20, r: 2 },
  { x: -192, y: 58, w: 20, d: 16, r: 2 },
  { x: -44, y: 58, w: 22, d: 20, r: 2 },
  { x: 168, y: 58, w: 22, d: 16, r: 2 },
];
export const CRATE_H = [12, 8, 14, 9] as const;

// ── 里程計（真實回合數）/ The odometer (the real round count) ──────────────
// 前緣那一條是給「身為觀者的人」的表面：里程計與銘牌都放在近列基座帶之外
// （y ≥ 104），它們與船都被近列的手蓋在中間——這是四層畫家序的收尾。
// The front strip belongs to the viewer: the odometer and the plate both sit out
// beyond the near pedestals' band (y ≥ 104), and they close the four-plane order
// with the sparks.
export const ODO: Plan = { x: -388, y: 104, w: 78, d: 34, r: 4 };
export const ODO_H = 22;
/** 窗口深度 ≈ 1 格：太深會讓鄰位字形探頭（ghost glyph）/ The window is ≈ 1 slot deep — a deeper window lets the next digit's glyph lean in (the ghost glyph) */
export const ODO_WINDOW: Plan = { x: ODO.x + 8, y: ODO.y + 11, w: 62, d: 12, r: 3 };
export const ODO_DIGITS = 4;
export const ODO_STEP = 13;
export const ODO_FIRST_X = ODO_WINDOW.x + 5;

// ── 銘牌 / The engraved label plate ───────────────────────────────────────
export const LABEL_PLATE: Plan = { x: 300, y: 118, w: 58, d: 12, r: 2 };

// ── 投影 / The projection ─────────────────────────────────────────────────
//
// 納入 fit 的極端點：廠房外緣、後牆與樑頂、熔金塔與澆槽梢、手的工具頭與工具
// 梢（第 1、9、10、18 站——含 9/10 是曲線起伏的中段）、導軌**沿曲線**的每一個
// 分段角，以及星艦在**兩端**（第 1 站與第 18 站 + 滑出距離）與帶旋轉鬆弛的
// 包絡。星艦的滑出位置一定要在 fit 裡——`.iso-svg` 是 overflow:visible，漏掉它，
// 淡出中的船會畫到卡片外面去。
// The extremes fed to the fit: the hall's rim, the rack and beam tops, the crucible
// and its spout's tip, a hand's tool head and tip (stations 1, 9, 10 and 18 — 9/10
// cover the curve's mid-span), **every segmented corner of the rails along the
// curve**, and the ship at **both** ends (station 1 and station 18 plus the exit
// travel) with slack for the tilt. The exit position has to be inside the fit —
// `.iso-svg` is overflow:visible, so leaving it out would paint the fading ship
// outside the card.
const fitPoints = (plan: Plan, z0: number, z1: number): Point3[] => {
  const out: Point3[] = [];
  for (const px of [plan.x, plan.x + plan.w]) {
    for (const py of [plan.y, plan.y + plan.d]) {
      for (const z of [z0, z1]) out.push([px, py, z]);
    }
  }
  return out;
};

/** 船體在船中心 x=centre 時的世界包絡（含切線旋轉的鬆弛）
    The ship's world envelope when its centre sits at `centre`, with slack for the tangent tilt */
const shipEnvelope = (centre: number): Point3[] => [
  [centre - SHIP_HALF - 4, -34, SHIP_Z0],
  [centre - SHIP_HALF - 4, 34, SHIP_TOP],
  [centre + BELL_END + 4, -34, SHIP_Z0],
  [centre + BELL_END + 4, 34, SHIP_TOP],
  [centre, -34, SHIP_TOP + 5],
  [centre, 34, SHIP_TOP + 5],
];

export const P: Projection = fitProjection(
  [
    ...fitPoints(HALL, -FOOT_H - HALL_H, 0),
    ...fitPoints(RACK, 0, RACK_H),
    ...fitPoints(BEAM, BEAM_Z[0], BEAM_Z[1]),
    ...fitPoints(CRUCIBLE, 0, CRUCIBLE_H + 3.4),
    ...fitPoints(ODO, 0, ODO_H),
    ...fitPoints(LABEL_PLATE, 0, 1),
    ...fitPoints(WALKWAY, 0, WALKWAY_H),
    ...PALLETS.flatMap((pallet, index) => fitPoints(pallet, WALKWAY_H, WALKWAY_H + (PALLET_H[index] ?? 8))),
    ...CRATES.flatMap((crate, index) => fitPoints(crate, 0, CRATE_H[index] ?? 10)),
    ...fitPoints({ x: RAIL_X0, y: -RAIL_OUT, w: RAIL_X1 - RAIL_X0, d: 2 * RAIL_OUT, r: 0 }, 0, RAIL_H),
    ...HANGER_X.map((x): Point3 => [x, BEAM.y + BEAM.d / 2, RACK_H]),
    SPOUT_FROM,
    [SPOUT_TO[0] + 3, SPOUT_TO[1] + 4, SPOUT_TO[2] + 7],
    // 兩端與中段：手的工具頭與工具梢 / Both ends and mid-span: a hand's tool head and tip
    toolPoint(1),
    toolPoint(9),
    toolPoint(10),
    toolPoint(18),
    emitPoint(1),
    emitPoint(10),
    emitPoint(18),
    // 兩端：星艦（第 1 站、第 18 站與滑出）/ Both ends: the ship (station 1, station 18, and the exit)
    ...shipEnvelope(stationX(1)),
    ...shipEnvelope(stationX(STATIONS)),
    ...shipEnvelope(stationX(STATIONS) + SHIP_EXIT),
    // 導軌沿曲線的每一段角（導軌不再是一條直的邊）/ Every corner of the rails along the curve (the rails are no longer one straight edge)
    ...Array.from({ length: Math.ceil((RAIL_X1 - RAIL_X0) / RAIL_STEP) }, (_, index) => {
      const x0 = RAIL_X0 + index * RAIL_STEP;
      const [fy0] = railBand(Math.min(x0, RAIL_X1), true);
      const [, ny1] = railBand(Math.min(x0, RAIL_X1), false);
      return [[x0, fy0, RAIL_H], [x0, ny1, RAIL_H], [x0, fy0, 0], [x0, ny1, 0]] as Point3[];
    }).flat(),
    [RAIL_X1, railBand(RAIL_X1, true)[0], RAIL_H],
    [RAIL_X1, railBand(RAIL_X1, false)[1], RAIL_H],
  ],
  WIDTH,
  HEIGHT,
  { pad: PAD, azimuth: AZIMUTH },
);

/** 世界 → 螢幕 / World → screen */
export const at = (point: Point3): Flat => iso(point, P);

const ORIGIN = at([0, 0, 0]);
const minus = (a: Flat, b: Flat): Flat => [a[0] - b[0], a[1] - b[1]];
/** 世界 +x / +y / +z 一步的螢幕向量 / The screen vector of one +x / +y / +z world step */
export const EX = minus(at([1, 0, 0]), ORIGIN);
/** 世界 +y 一步的螢幕向量（船沿曲線的 y 偏移要吃它）
    The screen vector of one +y world step (the ship's curve-following y offset feeds on it) */
export const EY = minus(at([0, 1, 0]), ORIGIN);
/** 世界 +z 一步的螢幕向量 / The screen vector of one +z world step */
export const EZ = minus(at([0, 0, 1]), ORIGIN);

const fine = (value: number) => Math.round(value * 100) / 100;

/** 世界平移 → SVG transform / A world delta as an SVG transform */
export const shift = (dx: number, dy = 0, dz = 0) =>
  `translate(${fine(EX[0] * dx + EY[0] * dy + EZ[0] * dz)} ${fine(EX[1] * dx + EY[1] * dy + EZ[1] * dz)})`;

/** 螢幕座標繞一點旋轉（關節；見 frame.ts 對「螢幕旋轉」的說明）
    A screen-space rotation about a point (a joint; see frame.ts on screen rotations) */
export const spin = (deg: number, pivot: Flat) =>
  `rotate(${fine(deg)} ${fine(pivot[0])} ${fine(pivot[1])})`;

/**
 * 船的切線旋轉（度）：船軸在螢幕上是 EX 的方向，曲線切線在螢幕上是
 * EX + 斜率·EY；兩者夾角就是要補的旋轉。SVG 的 rotate() 與 atan2 的螢幕座標
 * 都以 +x 轉向 +y 為正，所以差值直接可用、不必再翻符號。
 * The ship's tangent spin, in degrees: on screen the ship's axis points along EX,
 * the curve's tangent along the world unit vector (1, slope) = EX + slope·EY, and
 * the angle between the two is the correction. Both SVG's rotate() and atan2 over
 * screen coordinates take positive angles from +x toward +y, so the difference is
 * directly usable with no sign flip.
 */
export const tangentSpin = (x: number): number => {
  const slope = lineDy(x);
  const vx = EX[0] + slope * EY[0];
  const vy = EX[1] + slope * EY[1];
  const toDeg = 180 / Math.PI;
  return (
    toDeg * (Math.atan2(vy, vx) - Math.atan2(EX[1], EX[0]))
  );
};

/**
 * 船的組合 transform：沿曲線平移（x 用 EX、y 用 lineY 走 EY）＋以船中心為樞的
 * 切線旋轉。transform 串列由右往左作用——旋轉作用在船的局部座標（船畫在中心
 * 0 處，樞點就是原點），平移最後把整組搬到位。
 * The ship's combined transform: translated along the curve (x through EX, y
 * through lineY and EY) plus the tangent spin, pivoting at the ship's centre. SVG
 * applies a transform list right-to-left — the rotation acts on the ship's local
 * coordinates (the ship is drawn centred on 0, so the pivot is the origin), and
 * the translation carries the whole group to the station.
 */
export const shipTransform = (x: number): string =>
  `${shift(x, lineY(x))} ${spin(tangentSpin(x), ORIGIN)}`;
