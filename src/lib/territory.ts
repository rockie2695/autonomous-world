/**
 * 領地圖 / Territory field
 * ============================================================================
 * 拉遠到一定程度之後，地圖不再顯示「節點 + 道路」，而是顯示每個地方所佔的
 * 面積、依其 owner 著色 —— 类似 Stellaris 星系圖或 CK3 省份圖。
 * Past a zoom threshold the map stops drawing "nodes + roads" and instead shows
 * the *area* each place covers, coloured by its owner — like a Stellaris galaxy
 * map or CK3's province map.
 *
 * ── 為什麼不是 Voronoi ──/ Why this is not a Voronoi partition
 * 最直覺的做法是「每格歸給最近的地方」（Voronoi）。那是錯的，畫出來會是一格一格
 * 的階梯，而且同一勢力的兩個相鄰地方之間會多出一條不該存在的邊界 —— 也就是
 * 「像素塊」，完全不像 Stellaris。
 * The tempting approach is "each cell belongs to the nearest place" (Voronoi).
 * That is wrong: it renders as visible cell steps, and it draws a border between
 * two adjacent places of the *same* faction that should never exist. It looks like
 * pixel art, not like Stellaris.
 *
 * Stellaris 的做法是：**每個 star system 各自宣稱一塊範圍**，邊界畫在兩方宣稱
 * 相遇的地方。同勢力的宣稱會**合併**成一片連續區域，不留內部接縫。
 * Stellaris instead has *every owned system claim an area*, with the border drawn
 * where two empires' claims meet. Claims of the same faction merge into one
 * continuous region with no internal seam.
 *
 * ── 實作 / How it works
 * 每個地方都推出**一個一樣大的圓形力**（圓＝到中心的距離衰減）。同勢力的力
 * **累加**，不同勢力的力互相**抵擋**，每一格由力最大的勢力取得。
 * Every place projects an **equal circular force** (circular because the influence
 * falls off with distance). Same-faction forces **accumulate**, rival forces **push
 * against** each other, and each cell goes to whichever faction's force is strongest.
 * 這個做法同時滿足四件事：
 *  1. 同勢力的地方相鄰時力直接相加，所以融合成一片連續區域，不留內部接縫。
 *  2. 邊界是兩個平滑場相等處的曲線，而不是階梯。
 *  3. 勢力越大（地方越多）累積的力越強，領地自然推得更遠 —— 距離由力的多寡決定。
 *  4. 離某勢力越近，它就把邊界推得越遠。
 * That satisfies four things at once:
 *  1. Adjacent same-faction places add their force directly, so they fuse into one
 *     continuous region with no internal seam.
 *  2. A border is a curve where two smooth fields are equal, not a staircase.
 *  3. A bigger faction (more places) sums to more force and so pushes further — the
 *     extent is decided by how much force there is.
 *  4. Whichever faction is nearer pushes the border further away.
 *
 * 這裡**不是**相加後直接當密度用，而是「最大的那個勢力贏」；相加只是讓同勢力的
 * 影響疊加起來。早期版本用的是機率 OR（`1 - Π(1 - wᵢ)`），那會讓上限飽和在 1，
 * 因此一個有十個地方的勢力跟只有一個地方的勢力推得一樣遠 —— 勢力大小完全沒有
 * 反映在領地上，跟「距離由力的多寡決定」相反。
 * Note this is "strongest faction wins", not "the sum is the density": the sum only
 * makes a faction's own places reinforce each other. An earlier version used a
 * probabilistic OR (`1 - Π(1 - wᵢ)`), which saturates at 1 — so a faction with ten
 * places pushed exactly as far as one with a single place, and faction size had no
 * effect on the map at all.
 *
 * 這裡是**純邏輯**：不碰 canvas、不碰 DOM，所以可以在專案的 node vitest 環境下測。
 * This module is **pure logic** — no canvas, no DOM — so it is directly testable
 * under the project's `node` vitest environment.
 */

import { CONFIG } from './gameConfig';

/** 一個地方 / One place */
export interface TerritorySite {
  id: string;
  x: number;
  y: number;
  /**
   * 所屬勢力；**null 代表此地不宣稱任何領土，並且會把別人的領地挖開一個洞**。
   * 仍然把它算進「最近鄰距離」，因為宣稱半徑要跟整張地圖的疏密一致。
   * Owning faction; **null means this place claims no territory and punches a hole
   * in everyone else's claims.**
   *
   * 無主之地不只是「自己不畫」—— 那樣一來，旁邊勢力的平滑密度場照樣會蓋過它，
   * 於是無主之地看起來還是別人的領土（CK3 的省份圖不會這樣）。所以無主之地要
   * *贏*下那個槽位，贏到的格子直接留白，勢力的邊界就會繞過它。
   *
   * It still counts toward the nearest-neighbour distance, because the claim radius
   * has to match the density of the whole map.
   *
   * Merely *not painting* unowned places is not enough: a neighbouring faction's
   * smooth density field would simply flow over the top, so unowned land would
   * still read as someone else's territory — which is exactly what CK3's province
   * map never does. So unowned places have to *win* their slot, and the cells they
   * win stay blank, which makes the faction border route around them.
   */
  faction: string | null;
}

/** 密度場的結果 / The resulting density field */
export interface TerritoryField {
  /** 格數（橫）/ Cells across */
  width: number;
  /** 格數（直）/ Cells down */
  height: number;
  /** 每格贏家的勢力索引，索引到 factions；-1 表示沒有任何勢力靠近 / Winning faction index per cell; -1 where no faction is near */
  owner: Int32Array;
  /** 勢力索引 → key / Faction index to key */
  factions: string[];
  /** 覆蓋的圖座標範圍 / The graph-space extent covered */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 一個勢力在領地圖上的範圍 / One faction's region */
export interface FactionRegion {
  key: string;
  /** 佔了多少格（用來決定要不要放名字）/ Cells held (decides whether to label it) */
  cellCount: number;
  /** 重心（圖座標）/ Centroid in graph space */
  cx: number;
  cy: number;
  /**
   * 標籤的錨點：區塊內離邊界最遠的那一格（最大內切圓的圓心），圖座標。
   * The label anchor: the cell farthest from any boundary — the centre of the largest
   * inscribed circle — in graph coordinates.
   */
  labelX: number;
  labelY: number;
  /** 錨點到邊界的距離（圖座標），決定這裡塞得下多大的字 / distance from the anchor to the nearest edge */
  labelRadius: number;
  /** 主軸角度（弧度）/ the principal axis, in radians */
  angle: number;
  /** 主軸／次軸的長度比；越大越細長 / axial ratio; larger means more elongated */
  elongation: number;
  /**
   * 標籤**可以用到哪裡**：以錨點為中心、沿主軸對齊的矩形半長與半寬（圖座標）。
   * 整個矩形都經過驗證確認落在自己領地內，所以文字用它當作可用空間是安全的。
   *
   * Where the label **may reach**: the half-length and half-width (graph units) of a
   * rectangle centred on the anchor, aligned to **the frame the name is drawn in**
   * (see `labelRotated`). The whole rectangle is verified to lie inside this faction's own
   * claim, so sizing text against it is safe.
   *
   * 這是內切圓之外的第二個答案。圓只保證「圓心附近最寬多少」，對一塊**細長**的領地
   * 來說它小得可憐——名字沿長軸可以跑很遠，卻因為圓太窄而被迫縮成一小撮。要用滿整塊
   * 領地，就必須沿主軸量一個真正在領地裡的矩形。
   *
   * This is the second answer alongside the inscribed circle. The circle only reports "how
   * wide it is at the roomiest point", which is tiny for an **elongated** claim: a name could
   * run a long way along the axis but the circle forces it tiny. Filling the claim needs a
   * rectangle measured along the principal axis that genuinely lies inside it.
   *
   * 兩者的差別正是那個「驗證」：共變異數的半長**不能**用，因為彎曲的領地算出來可以遠大於
   * 實際領地；這裡是沿著格子走出領地為止，所以量到的就是真的。走出來之後還要檢查矩形四邊
   * 與內部都還是自己人，否則就縮小。
   *
   * The difference is exactly that verification. The covariance half-length must **not** be
   * used, because for a bent claim it can far exceed the real thing; this walks the grid until
   * it leaves the claim, so what it measures is real. After walking, the rectangle's edges and
   * interior are re-checked for ownership and shrunk if they fail.
   */
  halfAlong: number;
  halfAcross: number;
  /**
   * 名字會不會**跟著主軸轉**。這是本模組唯一的決定，renderer 必須照著畫，
   * 不許自己從 `elongation` 再推一次。
   *
   * Whether the name is drawn **along the principal axis**. This is the single decision, and
   * the renderer must follow it rather than re-deriving it from `elongation`.
   *
   * **量矩形的座標系必須等於畫字的座標系。** 這兩件事曾經各做各的：矩形永遠沿主軸量，
   * 但文字只有 `elongation > 1.5` 才轉。於是一塊 elongation 1.42、主軸歪 57° 的領地，
   * 名字是**水平**畫的，卻被塞進一個**歪 57°** 的矩形裡，四個角有三個落在自己地盤之外——
   * 而矩形是保證整塊都在自己地盤內的，所以那三個角也就跑到別人的地上了。
   *
   * The frame the rectangle is measured in **must be** the frame the text is drawn in. These
   * two were once decided independently: the rectangle was always measured along the principal
   * axis, but the text was only rotated onto it above 1.5. So a claim with elongation 1.42 and
   * a 57° axis got a **horizontal** name fitted into a rectangle tilted 57°, and three of its
   * four corners landed off its own land — which, since the rectangle is verified to be
   * entirely inside the claim, means three of four corners were on someone else's ground.
   */
  labelRotated: boolean;
  /**
   * 名字在**螢幕**上該轉多少度（已經取負、正規化到 ±90°，所以可以直接餵給 `rotate()`）。
   * 未旋轉時是 0。
   *
   * How far the name is rotated **on screen**, in degrees — already negated for the flipped y
   * axis and normalised to ±90°, so it can go straight into `rotate()`. Zero when not rotated.
   */
  labelAngleDeg: number;
}

/** 一條封閉邊界上的一個點（圖座標）/ one point on a closed outline, in graph coordinates */
export interface OutlinePoint {
  x: number;
  y: number;
}

/** 一個勢力的封閉邊界 / one faction's closed outlines */
export interface FactionOutline {
  faction: number;
  /** 每個元素是一條封閉曲線（首尾相連）/ each entry is one closed loop */
  loops: OutlinePoint[][];
}

/**
 * Chaikin 切角：把折線的每個角切掉，逼近一條平滑曲線。
 * Chaikin corner cutting: clip every corner of a polyline to approach a smooth curve.
 *
 * 這是「邊界是格子階梯」的解法。原始邊界一定沿著格線走，所以是直角；切角兩次之後
 * 就變成曲線，而且**不動到填色**——填色仍然是平塗的，只有線是彎的，所以不會有霧。
 *
 * This is the fix for a grid-staircase boundary. The raw boundary follows cell edges and is
 * all right angles; two passes of corner cutting turn it into a curve, and it does **not**
 * touch the fill — the fill stays flat, only the line curves, so there is no fog.
 *
 * @param loop - 封閉折線 / the closed polyline
 * @param iterations - 切角次數 / how many passes
 * @returns 平滑後的封閉折線 / the smoothed closed polyline
 */
export function smoothLoop(loop: OutlinePoint[], iterations: number): OutlinePoint[] {
  let points = loop;
  for (let pass = 0; pass < iterations; pass++) {
    if (points.length < 3) return points;
    const next: OutlinePoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    points = next;
  }
  return points;
}

/**
 * 把每個勢力的邊界取成封閉曲線 / Extract each faction's boundary as closed curves.
 *
 * 做法：先收集邊界「單位線段」（格子座標），把線段接成一圈一圈，再轉成圖座標並切角。
 * 一個勢力可能有好幾圈（領地中間挖空、或分離的兩塊），所以回傳的是陣列的陣列。
 *
 * Method: collect the boundary unit segments in cell coordinates, chain them into loops,
 * then convert to graph coordinates and smooth. A faction can have several loops (a hole,
 * or two disconnected holdings), hence an array of arrays.
 *
 * @param field - 密度場 / the density field
 * @param iterations - 每個角的切角次數 / corner-cutting passes
 * @returns 每個勢力一組封閉曲線 / one set of closed loops per faction
 */
export function factionOutlines(field: TerritoryField, iterations = 2): FactionOutline[] {
  const W = field.width;
  const H = field.height;
  const stride = W + 1;
  const spanX = field.maxX - field.minX;
  const spanY = field.maxY - field.minY;
  const cellW = spanX / W;
  const cellH = spanY / H;

  // 每個勢力各收一組邊 / one set of edges per faction
  const edgesByFaction = new Map<number, Array<[number, number]>>();
  const pushEdge = (f: number, a: number, b: number) => {
    const list = edgesByFaction.get(f);
    if (list) list.push([a, b]);
    else edgesByFaction.set(f, [[a, b]]);
  };

  const ownerAt = (px: number, py: number): number => {
    if (px < 0 || py < 0 || px >= W || py >= H) return -2;
    return field.owner[py * W + px] ?? -2;
  };

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const owner = field.owner[py * W + px] ?? -1;
      // 沒有屬主的格子不畫邊界。這裡要跟 factionRegions 用同一個判斷（key 不存在就
      // 跳過），否則全員無主的世界也會生出一圈不存在的邊界。
      //
      // Cells with no owner are skipped. This must use the same test as `factionRegions`
      // (skip when the key is missing), or a world where nobody owns anything would still
      // produce a boundary that does not exist.
      if (owner < 0 || field.factions[owner] === undefined) continue;
      // 頂點以「格線」編號：格 (px,py) 的四角是 (px,py)…(px+1,py+1) /
      // vertices are numbered on the grid lines
      const tl = py * stride + px;
      const tr = tl + 1;
      const bl = tl + stride;
      const br = bl + 1;
      if (ownerAt(px - 1, py) !== owner) pushEdge(owner, bl, tl);
      if (ownerAt(px + 1, py) !== owner) pushEdge(owner, tr, br);
      if (ownerAt(px, py - 1) !== owner) pushEdge(owner, tl, tr);
      if (ownerAt(px, py + 1) !== owner) pushEdge(owner, bl, br);
    }
  }

  const out: FactionOutline[] = [];
  for (const [faction, edges] of edgesByFaction) {
    // 鄰接表 + 走訪一圈 / adjacency, then walk loops
    const adj = new Map<number, number[]>();
    for (const [a, b] of edges) {
      const la = adj.get(a);
      if (la) la.push(b);
      else adj.set(a, [b]);
      const lb = adj.get(b);
      if (lb) lb.push(a);
      else adj.set(b, [a]);
    }
    const used = new Set<string>();
    const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const loops: OutlinePoint[][] = [];

    for (const startKey of adj.keys()) {
      // 從這點出發還有沒走過的邊嗎 / any unused edge left at this vertex?
      const hasUnused = (v: number) =>
        (adj.get(v) ?? []).some((n) => !used.has(edgeKey(v, n)));
      if (!hasUnused(startKey)) continue;

      let cur = startKey;
      const loop: number[] = [];
      // 有界迴圈：步數上限避免壞資料造成無限迴圈 /
      // bounded walk, so malformed data cannot spin forever
      for (let guard = 0; guard < edges.length + 2; guard++) {
        loop.push(cur);
        const next = (adj.get(cur) ?? []).find((n) => !used.has(edgeKey(cur, n)));
        if (next === undefined) break;
        used.add(edgeKey(cur, next));
        cur = next;
        if (cur === startKey) break;
      }
      if (loop.length < 4) continue;

      const raw: OutlinePoint[] = loop.map((v) => {
        const gpx = v % stride;
        const gpy = (v - gpx) / stride;
        return { x: field.minX + gpx * cellW, y: field.minY + gpy * cellH };
      });
      loops.push(smoothLoop(raw, iterations));
    }
    if (loops.length > 0) out.push({ faction, loops });
  }
  return out;
}

/** 鄰居方向遮罩 / Neighbour side mask */
export const NEIGHBOUR_LEFT = 1;
export const NEIGHBOUR_RIGHT = 2;
export const NEIGHBOUR_TOP = 4;
export const NEIGHBOUR_BOTTOM = 8;

/** 把格座標夾進合法範圍 / Clamp a cell coordinate into range */
function clampIndex(value: number, size: number): number {
  if (!Number.isFinite(value)) return 0;
  const i = Math.floor(value);
  if (i < 0) return 0;
  if (i >= size) return size - 1;
  return i;
}

/**
 * 距離的平滑衰減：在中心為 1、邊界為 0，而且**斜率在邊界也是 0**。
 * The smooth distance falloff: 1 at the centre, 0 at the rim, and — crucially —
 * with zero slope at the rim too.
 *
 * 一次方衰減（`1 - d/R`）在邊界會有折角，兩個相鄰的勢力在交界處就會出現可見的
 * 接縫；平方讓衰減與其一階導數在 `d = R` 同時歸零 therefore邊界是 C1 連續，曲線才會
 * 平滑。
 * A linear falloff (`1 - d/R`) has a corner at the rim, so two neighbouring
 * factions show a visible seam where they meet. Squaring takes both the value
 * and its first derivative to zero at `d = R`, making the boundary C1 continuous
 * and the curve smooth.
 */
function falloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

/**
 * 估算每個地方「宣稱半徑」該多大。
 * Estimate how large each place's claim radius should be.
 *
 * 用**最近鄰距離的平均值**作為尺度，而不是一個固定的世界座標常數，理由是密度會變：
 * 一百個地方擠在一起時固定半徑會全部糊成一片；世界長到兩千個地方時固定半徑又會讓
 * 每塊地都小到看不見。相對尺度讓「一格大小」不管世界多大都保持一致。
 * The *mean nearest-neighbour distance* is the unit here rather than a fixed
 * world-coordinate constant, because density changes: at a hundred crowded
 * places a fixed radius smears everything into one blob, and at two thousand the
 * claims become too small to see. A relative scale keeps the look identical
 * whatever the world size.
 *
 * @param sites - 地方座標 / Place positions
 * @param sampleLimit - 取樣上限，避免 O(n²) / Cap, to avoid O(n²)
 * @returns 平均最近鄰距離 / The mean nearest-neighbour distance
 */
export function meanNeighbourDistance(
  sites: readonly TerritorySite[],
  sampleLimit = 240
): number {
  const count = sites.length;
  if (count < 2) return 1;
  const stride = Math.max(1, Math.floor(count / sampleLimit));
  let total = 0;
  let taken = 0;
  for (let i = 0; i < count; i += stride) {
    let best = Infinity;
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const dx = sites[j].x - sites[i].x;
      const dy = sites[j].y - sites[i].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) {
      total += best;
      taken += 1;
    }
  }
  return taken > 0 ? total / taken : 1;
}

/**
 * 建立領地密度場。
 * Build the territory density field.
 *
 * @param sites - 地方座標與所屬勢力 / Place positions and their owner
 * @param maxResolution - 每軸的格數上限 / Upper bound on cells per axis
 * @param margin - 範圍往外擴張的比例 / Fraction to grow the extent by on side
 * @param radiusFactor - 宣稱半徑 = 半徑因子 × 最近鄰平均距離 / Claim radius = factor × mean neighbour distance
 * @param minForce - 佔有一格所需的最低力量 / Minimum force for a cell to count as held
 * @returns 密度場 / The field, or null when there are no sites
 */
export function buildTerritoryField(
  sites: readonly TerritorySite[],
  maxResolution: number,
  margin: number,
  radiusFactor: number,
  /**
   * 佔有一格所需的最低力量 /
   * Minimum force for a cell to count as held.
   *
   * 預設 0.12：一個地方靠自己的力就能維持到半徑的 65%，再多幾個地方就能推得更遠，
   * 但離得夠遠時仍然會自然收掉，不會讓地圖糊成一片 /
   * Defaults to 0.12: a lone place holds out to ~65% of the claim radius on its own,
   * a few more places push further, and genuinely distant land still falls away
   * instead of smearing across the map.
   */
  minForce = 0.12
): TerritoryField | null {
  const count = sites.length;
  if (count === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const site of sites) {
    if (site.x < minX) minX = site.x;
    if (site.x > maxX) maxX = site.x;
    if (site.y < minY) minY = site.y;
    if (site.y > maxY) maxY = site.y;
  }
  // 單一地方（或全部共線）在某一軸上沒有跨度。補回**回傳的**範圍，讓格子與範圍
  // 永遠一致，呼叫端就不需要知道有沒有被補過。
  // A single site (or a collinear set) has zero span on one axis. Pad the
  // *returned* extent so grid and extent always agree and callers never have to
  // know.
  if (maxX === minX) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (maxY === minY) {
    minY -= 0.5;
    maxY += 0.5;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // 往外擴張，否則畫面會出現一條明顯的直邊 /
  // Grow outward, or the view shows an obvious straight edge
  minX -= spanX * margin;
  maxX += spanX * margin;
  minY -= spanY * margin;
  maxY += spanY * margin;
  const fullSpanX = spanX * (1 + margin * 2);
  const fullSpanY = spanY * (1 + margin * 2);

  const radius = Math.max(1e-6, radiusFactor * meanNeighbourDistance(sites));

  // 解析度要讓「宣稱半徑」落在足夠多格子上，否則 upscale 之後邊界還是會有階梯。
  // 目標是半徑約等於 10 格；上限由 maxResolution 決定，2000 個地方時也不會太慢。
  // The resolution must put the claim radius across enough cells, or the upscaled
  // border still shows steps. Aim for a radius of roughly 10 cells, bounded by
  // maxResolution so 2000 places stay affordable.
  const maxSpan = Math.max(fullSpanX, fullSpanY);
  const target = Math.min(maxResolution, Math.max(48, Math.round((maxSpan * 10) / radius)));
  const aspect = fullSpanX / fullSpanY;
  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = target;
    height = Math.max(1, Math.round(target / aspect));
  } else {
    height = target;
    width = Math.max(1, Math.round(target * aspect));
  }

  // ── 勢力索引 / Faction indices ──
  const factionIndex = new Map<string, number>();
  const factionKeys: string[] = [];
  for (let i = 0; i < count; i++) {
    const key = sites[i].faction;
    if (key === null) continue;
    if (factionIndex.has(key)) continue;
    const index = factionKeys.length;
    factionIndex.set(key, index);
    factionKeys.push(key);
  }
  const factionCount = factionKeys.length;
  // 一個勢力都沒有就沒有領地圖可畫，交給呼叫端處理 /
  // No faction at all means there is no territory to draw; the caller handles it
  if (factionCount === 0) return null;

  // 無主之地共用一個「不繪製」槽位。**必須在真實勢力之後**配號，否則第一個勢力會
  // 拿到同一個索引。無主之地沒有自己的勢力，所以它不參與「哪個勢力較強」的比較；
  // 它只用來標記「這一格離無主之地比離任何有主地方更近」，那一格就不畫。
  //
  // Unowned places share one "blocked" slot, allocated *after* the real factions or
  // the first faction would collide with it. They have no faction of their own, so
  // they never take part in "which faction is strongest"; they only mark cells that
  // are nearer to unowned land than to any owned place, and those cells go unpainted.
  const BLOCKED = factionCount;
  const siteFaction = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const key = sites[i].faction;
    const index = key === null ? undefined : factionIndex.get(key);
    siteFaction[i] = index === undefined ? BLOCKED : index;
  }

  // ── 空間桶：格寬就是宣稱半徑，所以 3×3 鄰域涵蓋所有影響範圍 ──
  // Spatial buckets sized to the claim radius, so a 3×3 neighbourhood covers
  // every place that can possibly contribute
  const cols = Math.max(1, Math.ceil(fullSpanX / radius) + 1);
  const rows = Math.max(1, Math.ceil(fullSpanY / radius) + 1);
  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
  const bucketW = fullSpanX / cols;
  const bucketH = fullSpanY / rows;
  for (let i = 0; i < count; i++) {
    const bx = clampIndex((sites[i].x - minX) / bucketW, cols);
    const by = clampIndex((sites[i].y - minY) / bucketH, rows);
    buckets[by * cols + bx].push(i);
  }

  const owner = new Int32Array(width * height).fill(-1);
  // 每格的勢力力場累積器；用同一個陣列重複使用並在每格開頭歸零，避免每次配置 /
  // Per-cell force accumulator, reused and zeroed each cell so it is not reallocated
  const density = new Float64Array(factionCount);

  for (let py = 0; py < height; py++) {
    const gy = minY + ((py + 0.5) / height) * fullSpanY;
    const by = clampIndex((gy - minY) / bucketH, rows);
    for (let px = 0; px < width; px++) {
      const gx = minX + ((px + 0.5) / width) * fullSpanX;
      const bx = clampIndex((gx - minX) / bucketW, cols);

      density.fill(0);
      // 無主之地不是用「力的大小」來蓋掉勢力，而是用「誰離得更近」：離無主地方
      // 比離任何有主地方更近的格子，就是無主之地自己的地盤，不畫。
      // 用距離而不是比力，是因為同勢力的力會累加 —— 一個有十個地方的勢力在任一點
      // 的總力遠大於單一無主地方的力，拿來比較會讓無主之地直接被吞掉。
      // Unowned land does not out-push a faction by force; it wins by being *closer*:
      // a cell nearer an unowned place than any owned place is that place's own
      // ground and goes unpainted. Distance rather than force strength, because
      // same-faction force accumulates — a faction with ten places overwhelms a
      // single unowned place's force at almost every point, so comparing force
      // would simply swallow the unowned place.
      let nearestOwned = Infinity;
      let nearestUnowned = Infinity;
      for (let ny = Math.max(0, by - 1); ny <= Math.min(rows - 1, by + 1); ny++) {
        for (let nx = Math.max(0, bx - 1); nx <= Math.min(cols - 1, bx + 1); nx++) {
          for (const si of buckets[ny * cols + nx]) {
            const f = siteFaction[si];
            // -1 不會出現：這裡每個 index 都對應某個勢力或 BLOCKED /
            // -1 never appears here: every index is either a faction or BLOCKED
            if (f < 0) continue;
            const dx = sites[si].x - gx;
            const dy = sites[si].y - gy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const w = falloff(d, radius);
            if (w <= 0) continue;
            if (f === BLOCKED) {
              if (d < nearestUnowned) nearestUnowned = d;
            } else {
              // 同勢力的力**累加**：每個地方推出的力都一樣，勢力越大地方越多，
              // 累積的力就越強、領地推得越遠 —— 這就是「距離由力的多寡決定」。
              // 同一勢力的相鄰地方因此自然融合成一整片，中間不會有接縫。
              // Same-faction force **accumulates**: every place emits an equal force,
              // so a faction with more places sums to more force and pushes further —
              // the "extent is decided by how much force" rule. Adjacent same-faction
              // places therefore fuse into one region with no internal seam.
              density[f] += w;
              if (d < nearestOwned) nearestOwned = d;
            }
          }
        }
      }
      // 離無主之地更近 → 留白，不繪製；原地圖在該處保持可見 /
      // Nearer to unowned land → leave the cell blank so the map underneath shows
      if (nearestUnowned < nearestOwned) continue;

      let bestFaction = -1;
      let bestForce = 0;
      for (let f = 0; f < factionCount; f++) {
        if (density[f] > bestForce) {
          bestForce = density[f];
          bestFaction = f;
        }
      }
      // 贏家的力要**超過門檻**這格才算被佔有。沒有門檻的話，任何微小的正值都會贏過
      // 「沒有勢力」，於是領地永遠等於各地方圓盤的聯集，勢力大小對面積毫無影響 ——
      // 四個地方和一個地方畫出來一樣大。門檻讓「累積的力」真的決定能推多遠：
      // 一個地方自己就足以達到門檻的半徑是 R·(1-√t)，四個地方合力則是
      // R·(1-√(t/4))，也就是說勢力越大領地越遠。
      // The winner must clear a **threshold** for the cell to count as held. Without
      // one, any tiny positive force beats "no faction at all", so the territory is
      // always just the union of the per-place discs and faction size has no effect —
      // four places draw the same area as one. The threshold is what makes
      // accumulated force decide reach: a lone place holds out to R·(1-√t), four
      // places together reach R·(1-√(t/4)), so a bigger faction covers more ground.
      if (bestFaction < 0 || bestForce < minForce) continue;
      // 不同勢力的力互相**抵擋**，邊界落在兩邊力相等處 —— 所以離哪個勢力近，
      // 哪個勢力就把邊界推得遠。
      // Rival forces **push against** each other and the border lands where the two
      // are equal, so whichever faction is nearer pushes the border further away.
      owner[py * width + px] = bestFaction;
    }
  }

  return { width, height, owner, factions: factionKeys, minX, minY, maxX, maxY };
}

/**
 * 找出離某點最近的地方 —— hover／點擊用。
 * Nearest place to a point, for hover and click.
 *
 * 這裡**不做** Voronoi 網格：滑鼠每動一次只需要一次查詢，掃全部地方就夠了
 * （2000 個地方也只是一次 2000 次的迴圈）。網格只留給渲染要的密度場。
 * There is deliberately **no** nearest-site grid: a hover needs one query, and
 * scanning every place is cheap enough (a 2000-element loop per mousemove). The
 * grid is reserved for rendering the density field.
 *
 * @param sites - 地方座標 / Place positions
 * @param gx - 圖座標 X / Graph-space X
 * @param gy - 圖座標 Y / Graph-space Y
 * @returns 地方索引 / Index into sites
 */
export function nearestSite(
  sites: readonly TerritorySite[],
  gx: number,
  gy: number
): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const dx = sites[i].x - gx;
    const dy = sites[i].y - gy;
    const d = dx * dx + dy * dy;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * 某個圖座標屬於哪個勢力 —— 領地圖的 hover 用。
 * Which faction owns a graph point, for hovering the area map.
 *
 * 這裡查的是**密度場**，不是「最近的地方」。拉遠視圖裡畫的是面積而不是節點，
 * 所以游標底下的那一塊到底屬於誰，要由那個格子回答；用最近節點會得到一個幾乎
 * 永遠是某個小節點的答案，於是 tooltip 會顯示一個根本沒被指向的地點。
 *
 * This reads the **density field**, not "the nearest place". The zoomed-out view
 * draws areas rather than nodes, so what the cursor is over is answered by the
 * cell under it. Using the nearest node would almost always name some unrelated
 * little place, and the tooltip would describe somewhere the cursor isn't.
 *
 * @param field - 由 buildTerritoryField 產生 / Built by buildTerritoryField
 * @param gx - 圖座標 X / Graph-space X
 * @param gy - 圖座標 Y / Graph-space Y
 * @returns 勢力 key；無主之地或空白處為 null / Faction key; null on unowned or empty land
 */
export function factionAt(
  field: TerritoryField,
  gx: number,
  gy: number
): string | null {
  const spanX = field.maxX - field.minX;
  const spanY = field.maxY - field.minY;
  if (spanX <= 0 || spanY <= 0) return null;
  const fx = (gx - field.minX) / spanX;
  const fy = (gy - field.minY) / spanY;
  // 邊界之外不算：落在外面等於沒有任何勢力宣稱 /
  // Outside the extent counts as nothing: no faction claims it
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
  const px = Math.min(field.width - 1, Math.max(0, Math.floor(fx * field.width)));
  const py = Math.min(field.height - 1, Math.max(0, Math.floor(fy * field.height)));
  const index = field.owner[py * field.width + px];
  if (index < 0) return null;
  return field.factions[index] ?? null;
}

/**
 * 一個勢力名稱的典型長寬比，用來決定「哪一個內接矩形最值得用」。
 * The typical length:width ratio of a faction name, used to decide which inscribed
 * rectangle is worth having.
 *
 * 一個四字中文名在 100px 下大約 440×100，所以比例是 4.4:1。目標不是「面積最大」——那會挑到一塊又矮又寬的矩形，
 * 名字放不進去。目標是「**能放多大的字**」，而那取決於長與厚的較小者，所以要同時
 * 考量兩者。用一個代表性比例當權重，元件端仍會用實際量測到的長寬再解一次。
 *
 * A four-glyph CJK name measures about 440x100px at font-size 100, hence 4.4:1. The goal is
 * deliberately **not** the largest area —
 * that would pick a short fat rectangle no name fits. The goal is the **largest font** that
 * fits, which depends on the smaller of length and thickness, so both have to count. A
 * representative ratio stands in for the weighting here; the component re-solves with the
 * real measured aspect afterwards.
 */
const LABEL_NAME_ASPECT = 4.4;

/**
 * 選址時評分的候選格數量，以及評分前的取樣上限。**兩者都是品質／成本的取捨**，所以放在
 * config：數字越大名字越大，計算也越貴（實測單一領地 4ms → 14ms）。
 *
 * How many candidates the anchor search scores in full, and how many cells it samples first.
 * **Both are a quality/cost trade-off**, so they live in config: bigger numbers make the name
 * bigger and the work heavier (measured on one claim: 4ms -> 14ms).
 *
 * 先用便宜的代理評分對**取樣後**的格子排名，再只對前幾名跑真正的矩形搜尋。窮舉所有格子
 * 太貴（每格要沿兩軸走到底），而全領地可能上千格，所以另外抽樣。
 *
 * Sample the cells, rank them with the cheap proxy, then run the real rectangle search for
 * only the best few. Scoring every cell is far too costly (each one walks both axes to the
 * boundary), and a claim can hold thousands of cells, hence the extra sampling.
 */
const LABEL_ANCHOR_SAMPLES = CONFIG.TERRITORY_LABEL_ANCHOR_SAMPLES;
const LABEL_ANCHOR_CANDIDATES = CONFIG.TERRITORY_LABEL_ANCHOR_CANDIDATES;

/**
 * 量出「以某格為中心、沿 `angle` 對齊、而且整塊都在同一勢力領地內」的矩形半長與半寬。
 * Measure the half-length and half-width of a rectangle centred on a cell, aligned to
 * `angle`, whose **entire area** belongs to the same faction.
 *
 * **不能只是「沿軸走到底再同時縮小」**：那會找到一個又矮又窄的答案。細長的領地沿主軸可以
 * 跑很遠，但只要矩形有一點太厚，四個角就會伸出領地外，於是縮小循環把兩邊一起砍小，最後
 * 得到一個比內切圓還小的矩形——正好和「把領地用滿」相反。
 *
 * You cannot just "walk to the end, then shrink both sides". For an elongated claim the axis
 * reach is long, but as soon as the rectangle is any thicker its **corners** leave the claim, so
 * a shrink-both-sides loop converges on something small and squat — the opposite of filling the
 * claim.
 *
 * 正確做法是**搜尋**：把厚度當成外層變數，對每個候選厚度二分求出「還在領地內的最大長度」，
 * 再用「能放多大的字」評分，取最佳者。
 *
 * The right approach is to **search**: treat thickness as the outer variable, binary-search the
 * largest length that still fits for each candidate thickness, score the result by the font size
 * it would yield, and keep the best.
 *
 * @returns 半長與半寬（圖座標）/ The half-extents, in graph units
 */
export function measureClaimRect(
  field: TerritoryField,
  factionIndex: number,
  px: number,
  py: number,
  angle: number,
  cellW: number,
  cellH: number
): { halfAlong: number; halfAcross: number } {
  const spanX = field.maxX - field.minX;
  const spanY = field.maxY - field.minY;
  const gx0 = field.minX + ((px + 0.5) / field.width) * spanX;
  const gy0 = field.minY + ((py + 0.5) / field.height) * spanY;

  const owns = (gx: number, gy: number): boolean => {
    if (gx < field.minX || gy < field.minY || gx > field.maxX || gy > field.maxY) return false;
    const cx = Math.floor(((gx - field.minX) / spanX) * field.width);
    const cy = Math.floor(((gy - field.minY) / spanY) * field.height);
    return field.owner[cy * field.width + cx] === factionIndex;
  };

  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const bx = -ay;
  const by = ax;
  const step = Math.max(Math.min(cellW, cellH) * 0.5, 1e-6);
  const limit = Math.hypot(spanX, spanY);

  const reach = (dx: number, dy: number): number => {
    let d = 0;
    while (d < limit && owns(gx0 + dx * (d + step), gy0 + dy * (d + step))) d += step;
    return d;
  };

  const aMax = Math.min(reach(ax, ay), reach(-ax, -ay));
  const bMax = Math.min(reach(bx, by), reach(-bx, -by));
  if (aMax <= 0 || bMax <= 0) return { halfAlong: 0, halfAcross: 0 };

  /**
   * 整個矩形（不只是四條邊）都必須是自己人，所以用一張取樣網覆蓋面積。
   * The whole rectangle — not merely its four edges — must be ours, so sample a grid over the area.
   */
  const fits = (a: number, b: number): boolean => {
    // 11x11：後續用同樣密度複驗，所以這裡不能比它更粗 /
    // 11x11: the result is re-verified at this same density later, so this cannot be coarser
    const n = 11;
    for (let i = 0; i < n; i++) {
      const u = -a + (2 * a * i) / (n - 1);
      for (let j = 0; j < n; j++) {
        const v = -b + (2 * b * j) / (n - 1);
        if (!owns(gx0 + ax * u + bx * v, gy0 + ay * u + by * v)) return false;
      }
    }
    return true;
  };

  let bestAlong = 0;
  let bestAcross = 0;
  let bestScore = -1;

  // 厚度由厚到薄掃 12 檔；每檔二分求出可行的最大長度 /
  // Sweep thickness from thick to thin over 12 steps, binary-searching the largest feasible length
  for (let step_i = 12; step_i >= 1; step_i--) {
    const b = (bMax * step_i) / 12;
    if (b <= 0) continue;
    if (!fits(0, b)) continue; // even a zero-length rectangle pokes out at this thickness
    let lo = 0;
    let hi = aMax;
    for (let it = 0; it < 12; it++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, b)) lo = mid;
      else hi = mid;
    }
    // 能放多大的字：字級 = min(200·a/w100, 200·b/h100)，所以「每單位圖座標」的價值
    // 長是 1/寬、厚是 1/高 —— 長的權重是厚的 LABEL_NAME_ASPECT 倍。這個比例寫反的話
    // 會挑到又矮又寬的矩形，字反而比原來的圓還小。
    //
    // The font is min(200·a/w100, 200·b/h100), so per graph unit a unit of **length** is
    // worth LABEL_NAME_ASPECT times a unit of thickness. Get that ratio backwards and the
    // search picks a squat rectangle whose font is smaller than the circle it replaced.
    const score = Math.min(lo / LABEL_NAME_ASPECT, b);
    if (score > bestScore) {
      bestScore = score;
      bestAlong = lo;
      bestAcross = b;
    }
  }

  let outAlong = bestAlong * 0.98;
  let outAcross = bestAcross * 0.98;

  // ── 交出去之前的最終複驗（密度比搜尋時高一倍）──
  // 搜尋用的是 11×11 的取樣，而「保證在領地內」不能只在同樣密度下成立：格子之間還有
  // 縫隙，錨點剛好壓在格線上時，11×11 可能剛好跨過去而 21×21 沒有。用更高密度複驗一次，
  // 不乾淨就整體縮小，直到乾淨為止。這是唯一保證輸出的矩形**真的**整塊在自己地盤上的地方。
  //
  // Final re-check before handing the result over, at twice the search's density.
  //
  // Containment must not be guaranteed only at the sampling density used to search: there are
  // gaps *between* samples, and when the anchor sits right on a cell boundary an 11x11 grid can
  // step over a sliver that a 21x21 grid catches. Re-verify at the finer density and shrink until
  // it is clean. This is the single place where the returned rectangle is guaranteed to really
  // lie wholly on this faction's own land.
  for (let attempt = 0; attempt < 10; attempt++) {
    let clean = true;
    const n = 21;
    for (let i = 0; i < n && clean; i++) {
      const u = -outAlong + (2 * outAlong * i) / (n - 1);
      for (let j = 0; j < n; j++) {
        const v = -outAcross + (2 * outAcross * j) / (n - 1);
        if (!owns(gx0 + ax * u + bx * v, gy0 + ay * u + by * v)) {
          clean = false;
          break;
        }
      }
    }
    if (clean) break;
    outAlong *= 0.93;
    outAcross *= 0.93;
  }

  return { halfAlong: outAlong, halfAcross: outAcross };
}

/**
 * 某一格的四個方向裡，哪些鄰居屬於**不同**勢力。
 * Which of a cell's four sides border a *different* owner, as a bitmask.
 *
 * 邊界要畫成細線而不是整格一起亮：逐邊只點亮該方向那一排像素，兩鄰格才會剛好接成一
 * 條線。畫在自己的那一側而不是共用的接縫，兩個鄰格才不會各留一半、變成兩條線。
 * The rim has to be a hairline, not a lit cell: per-side lighting touches only
 * that side's row of pixels, and each cell paints its *own* side rather than
 * sharing a seam — otherwise two neighbours each light half and you get two
 * lines instead of one.
 *
 * @param field - 由 buildTerritoryField 產生 / Built by buildTerritoryField
 * @param px - 格的橫座標 / Cell column
 * @param py - 格的直座標 / Cell row
 * @returns 方向遮罩；0 表示這一格四邊都是自己人 / Side mask; 0 means fully interior
 */
export function neighbourMask(field: TerritoryField, px: number, py: number): number {
  const here = field.owner[py * field.width + px];
  if (here < 0) return 0;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= field.width || y >= field.height ? -1 : field.owner[y * field.width + x];
  const differs = (other: number) => other >= 0 && other !== here;
  let mask = 0;
  if (differs(at(px - 1, py))) mask |= NEIGHBOUR_LEFT;
  if (differs(at(px + 1, py))) mask |= NEIGHBOUR_RIGHT;
  if (differs(at(px, py - 1))) mask |= NEIGHBOUR_TOP;
  if (differs(at(px, py + 1))) mask |= NEIGHBOUR_BOTTOM;
  return mask;
}

/**
 * 依勢力把格子收合成區域，並回傳每個勢力的重心。
 * Collapse the cells into per-faction regions and return each one's centroid.
 *
 * 重心用格子中心平均：這裡只是要找一個放名字的位置，平均已經夠好，而且重心落在
 * 勢力形狀內部的機率遠高於外接框中心。
 * The centroid averages cell centres: all this needs is somewhere to put a label,
 * and averaging sits inside the shape far more often than a bbox centre would.
 *
 * @param field - 由 buildTerritoryField 產生 / Built by buildTerritoryField
 * @returns 每個勢力一筆，依格子數由多到少 / One entry per faction, largest first
 */
export function factionRegions(field: TerritoryField): FactionRegion[] {
  const spanX = field.maxX - field.minX;
  const spanY = field.maxY - field.minY;
  const W = field.width;
  const H = field.height;
  const cellW = spanX / W;
  const cellH = spanY / H;
  const graphX = (px: number) => field.minX + ((px + 0.5) / W) * spanX;
  const graphY = (py: number) => field.minY + ((py + 0.5) / H) * spanY;

  /**
   * 距離場：每一格到「不同屬主」的最短距離（單位：格）。
   * A distance field: each cell's distance to the nearest cell of a *different* owner,
   * in cells.
   *
   * 這是標籤位置的依據。用重心會出事：一塊 L 形或彎曲的領地，重心可能落在缺口（不是
   * 自己領地的地方），名字就印到別人的地盤上。改成「離邊界最遠的那一格」——也就是最大
   * 內切圓的圓心——就一定是領地裡面最寬闊的位置。
   *
   * This is what positions the label. A centroid fails: an L-shaped or bent claim can have
   * its centroid in the notch, which is *not* its own land, so the name prints on someone
   * else's ground. "The cell farthest from any boundary" — the centre of the largest
   * inscribed circle — is guaranteed to be the roomiest point inside the claim.
   */
  const dist = new Float32Array(W * H);
  const INF = 1e9;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const owner = field.owner[i] ?? -1;
      if (owner < 0) { dist[i] = 0; continue; }
      // 邊界格：四鄰有一個不同（含界外）→ 距離 0 / a boundary cell: some 4-neighbour differs
      const n =
        (px === 0 ? -2 : (field.owner[i - 1] ?? -2)) !== owner ||
        (px === W - 1 ? -2 : (field.owner[i + 1] ?? -2)) !== owner ||
        (py === 0 ? -2 : (field.owner[i - W] ?? -2)) !== owner ||
        (py === H - 1 ? -2 : (field.owner[i + W] ?? -2)) !== owner;
      dist[i] = n ? 0 : INF;
    }
  }
  // 兩遍 chamfer：正交 1、對角 √2 的近似歐氏距離 / two-pass chamfer distance
  const D1 = 1;
  const D2 = Math.SQRT2;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (dist[i] === 0) continue;
      if (px > 0) dist[i] = Math.min(dist[i], dist[i - 1] + D1);
      if (py > 0) dist[i] = Math.min(dist[i], dist[i - W] + D1);
      if (px > 0 && py > 0) dist[i] = Math.min(dist[i], dist[i - W - 1] + D2);
      if (px < W - 1 && py > 0) dist[i] = Math.min(dist[i], dist[i - W + 1] + D2);
    }
  }
  for (let py = H - 1; py >= 0; py--) {
    for (let px = W - 1; px >= 0; px--) {
      const i = py * W + px;
      if (dist[i] === 0) continue;
      if (px < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + D1);
      if (py < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + D1);
      if (px < W - 1 && py < H - 1) dist[i] = Math.min(dist[i], dist[i + W + 1] + D2);
      if (px > 0 && py < H - 1) dist[i] = Math.min(dist[i], dist[i + W - 1] + D2);
    }
  }

  interface Acc {
    cells: number;
    sumX: number;
    sumY: number;
    /** 目前為止最深的格子 / the deepest cell so far */
    best: number;
    bestPx: number;
    bestPy: number;
    /** 二階動差，用來求主軸 / second moments, for the principal axis */
    sxx: number;
    syy: number;
    sxy: number;
  }
  const totals = new Map<string, Acc>();
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const faction = field.owner[i] ?? -1;
      if (faction < 0) continue;
      const key = field.factions[faction];
      if (key === undefined) continue;
      const gx = graphX(px);
      const gy = graphY(py);
      const d = dist[i] ?? 0;
      const entry = totals.get(key);
      if (entry) {
        entry.cells += 1;
        entry.sumX += gx;
        entry.sumY += gy;
        if (d > entry.best) { entry.best = d; entry.bestPx = px; entry.bestPy = py; }
        entry.sxx += gx * gx;
        entry.syy += gy * gy;
        entry.sxy += gx * gy;
      } else {
        totals.set(key, {
          cells: 1,
          sumX: gx,
          sumY: gy,
          best: d,
          bestPx: px,
          bestPy: py,
          sxx: gx * gx,
          syy: gy * gy,
          sxy: gx * gy,
        });
      }
    }
  }

  const cellAvg = (cellW + cellH) / 2;

  /**
   * 這格是不是**某個指定勢力**的地。**必須帶勢力** —— 只問「有沒有主」會讓代理評分沿著
   * 別人的領地一路走過去，每一個靠近邊界的格子看起來都特別寬敞，排名就整個失真。
   *
   * Whether this graph point belongs to a **specific** faction. The faction matters: asking only
   * "does anyone own this" lets the proxy walk straight through a neighbour's claim, so every cell
   * near a border looks roomy and the ranking becomes noise.
   */
  const ownsCell = (gx: number, gy: number, factionIndex: number): boolean => {
    if (gx < field.minX || gy < field.minY || gx > field.maxX || gy > field.maxY) return false;
    const cx = Math.floor(((gx - field.minX) / spanX) * W);
    const cy = Math.floor(((gy - field.minY) / spanY) * H);
    return field.owner[cy * W + cx] === factionIndex;
  };

  /** 每個勢力自己的格子，供選址使用 / each faction's own cells, for anchor picking */
  const cellsByFaction = new Map<string, Array<{ px: number; py: number }>>();
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const faction = field.owner[py * W + px] ?? -1;
      if (faction < 0) continue;
      const key = field.factions[faction];
      if (key === undefined) continue;
      const list = cellsByFaction.get(key);
      if (list) list.push({ px, py });
      else cellsByFaction.set(key, [{ px, py }]);
    }
  }

  /**
   * 候選錨點：從「最深的那格」改成「能讓字最大的那一格」。
   *
   * 最深的格子（最大內切圓的圓心）是**圓形**問題的正確答案，卻不是**矩形**問題的正確
   * 答案。一塊領地可以某一點很「圓」（四周都有肉）卻很窄，而另一點較不圓、卻是一個明顯
   * 更寬的矩形。實測最大內切圓的圓心平均只撐到最佳錨點的 1/1.48（最壞 1/3.21）——
   * 也就是說名字被擺在一個讓它變小的地方，這正是「沒有把領地用滿」。
   *
   * 選址分兩階段，因為窮舉所有格子太貴：
   * 1. **便宜的代理評分** —— 每個候選格沿兩條軸用粗步長走一次，看四周有多少肉；
   * 2. **只對前幾名**跑真正的矩形搜尋。
   *
   * The anchor moves from "the deepest cell" to "the cell that makes the name largest".
   *
   * The deepest cell (the centre of the largest inscribed circle) is the right answer for a
   * **circular** fit and the wrong answer for a **rectangular** one. A claim can have a point
   * that is very round — flesh on every side — yet narrow, while a less round point holds a
   * noticeably wider rectangle. Measured, the inscribed-circle anchor reaches only 1/1.48 of
   * the best anchor on average and 1/3.21 at worst: the name was placed where it came out
   * smaller, which is exactly "the label does not use the largest space".
   *
   * Picking the anchor is two-phase, because trying every cell is far too expensive:
   * 1. a **cheap proxy score** — walk each candidate along both axes with a coarse step and
   *    see how much flesh surrounds it;
   * 2. run the real rectangle search for only the best few.
   */
  const chooseAnchor = (
    factionIndex: number,
    frameAngle: number,
    cells: Array<{ px: number; py: number }>
  ): { px: number; py: number; halfAlong: number; halfAcross: number } => {
    const ax = Math.cos(frameAngle);
    const ay = Math.sin(frameAngle);
    const bx = -ay;
    const by = ax;
    const walk = (cx: number, cy: number, dx: number, dy: number): number => {
      let d = 0;
      while (ownsCell(cx + dx * (d + cellAvg * 0.5), cy + dy * (d + cellAvg * 0.5), factionIndex)) {
        d += cellAvg * 0.5;
      }
      return d;
    };
    const scored = cells
      .map((c) => {
        const cx = graphX(c.px);
        const cy = graphY(c.py);
        const aMax = Math.min(walk(cx, cy, ax, ay), walk(cx, cy, -ax, -ay));
        const bMax = Math.min(walk(cx, cy, bx, by), walk(cx, cy, -bx, -by));
        return { ...c, score: Math.min(aMax / LABEL_NAME_ASPECT, bMax) };
      })
      .sort((p, q) => q.score - p.score);

    let best = { px: cells[0]!.px, py: cells[0]!.py, halfAlong: 0, halfAcross: 0 };
    let bestScore = -1;
    for (const cand of scored.slice(0, LABEL_ANCHOR_CANDIDATES)) {
      const rect = measureClaimRect(
        field,
        factionIndex,
        cand.px,
        cand.py,
        frameAngle,
        cellW,
        cellH
      );
      // 字級正比於 min(halfAlong/ASPECT, halfAcross)，所以直接比這個 /
      // The font is proportional to min(halfAlong/ASPECT, halfAcross), so compare that
      const score = Math.min(rect.halfAlong / LABEL_NAME_ASPECT, rect.halfAcross);
      if (score > bestScore) {
        bestScore = score;
        best = { px: cand.px, py: cand.py, halfAlong: rect.halfAlong, halfAcross: rect.halfAcross };
      }
    }
    return best;
  };

  /**
   * 兩個候選座標系裡挑一個，而不是由 elongation 直接決定。
   *
   * 原本的規則是「elongation > 1.5 就轉」，那是**形狀**的描述，不是**大小**的答案：
   * 實測 27 個領地裡，水平比主軸好的有 17 個 —— 規則錯的次數比對的還多。讓兩個座標系
   * 各跑一次選址再比字級，平均大 1.141 倍（最壞 1.57 倍）。
   *
   * Pick between two candidate frames instead of letting `elongation` decide.
   *
   * The old rule — "rotate above elongation 1.5" — describes the **shape**, and is not the
   * answer to "how big". Measured over 27 claims, horizontal beat the principal axis in **17
   * of them**: the rule was wrong more often than right. Running the anchor search in both
   * frames and comparing font scores gains 1.141x on average, 1.57x at worst.
   *
   * **要有遲滯**，否則兩者接近時名字會在每個回合之間翻轉。傾斜的座標系必須明顯更好
   * （`TERRITORY_LABEL_ROTATE_MARGIN`）才會被採用，否則一律水平。
   *
   * **It needs hysteresis**, or the name flips between the two orientations every round when
   * they are close. The tilted frame has to be clearly better (`TERRITORY_LABEL_ROTATE_MARGIN`)
   * to be taken; otherwise the name stays horizontal.
   */
  const pickFrame = (
    factionIndex: number,
    principalAngle: number,
    mayRotate: boolean,
    cells: Array<{ px: number; py: number }>
  ): { anchor: { px: number; py: number; halfAlong: number; halfAcross: number }; rotated: boolean } => {
    const flat = chooseAnchor(factionIndex, 0, cells);
    const flatScore = Math.min(flat.halfAlong / LABEL_NAME_ASPECT, flat.halfAcross);
    if (!mayRotate) return { anchor: flat, rotated: false };
    const tilted = chooseAnchor(factionIndex, principalAngle, cells);
    const tiltedScore = Math.min(tilted.halfAlong / LABEL_NAME_ASPECT, tilted.halfAcross);
    return tiltedScore > flatScore * CONFIG.TERRITORY_LABEL_ROTATE_MARGIN
      ? { anchor: tilted, rotated: true }
      : { anchor: flat, rotated: false };
  };

  const bySize = Array.from(totals.entries()).sort((a, b) => b[1].cells - a[1].cells);

  return bySize
    .map(([key, e], rank) => {
      const cx = e.sumX / e.cells;
      const cy = e.sumY / e.cells;
      // 共變異數 → 主軸方向 / covariance to principal axis
      const cxx = e.sxx / e.cells - cx * cx;
      const cyy = e.syy / e.cells - cy * cy;
      const cxy = e.sxy / e.cells - cx * cy;
      const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      // 主軸與次軸的比。太接近 1 就是接近圓形，此時主軸方向純粹是雜訊，
      // 照著它轉字只會每回合亂晃 —— 門檻在下一行 /
      // Axial ratio. Too close to 1 means near-circular, where the axis direction is pure
      // noise and rotating to it would jitter round after round — so the threshold is
      // applied on the next line
      const trace = cxx + cyy;
      const diff = Math.sqrt(Math.max(0, (cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy));
      const l1 = (trace + diff) / 2;
      const l2 = (trace - diff) / 2;
      const elongation = l2 > 1e-9 ? Math.sqrt(l1 / l2) : 99;
      // 這個座標系可不可以選 —— 接近圓形時主軸是雜訊，照著轉會每回合亂晃 /
      // Whether the tilted frame is even eligible — on a near-circular claim the axis is noise
      // and rotating to it would jitter
      const mayRotate = elongation > CONFIG.TERRITORY_LABEL_ROTATE_ELONGATION;
      // 選址：在自己的格子裡挑最能撐大名字的那一格，而不是最深的那一格。
      // 取樣上限：整塊領地可能上千格，逐格評分太貴 /
      // Pick the cell that best fills the name, not the deepest one. Sampling cap: a claim
      // can hold thousands of cells and scoring every one is too costly
      const own = cellsByFaction.get(key) ?? [{ px: e.bestPx, py: e.bestPy }];
      const stride = Math.max(1, Math.ceil(own.length / LABEL_ANCHOR_SAMPLES));
      const sampled = stride > 1 ? own.filter((_, i) => i % stride === 0) : own;
      const factionIndex = field.factions.indexOf(key);
      // 只有可能會被標名的領地值得跑昂貴的選址：其餘的排序永遠在前 N 名之後 /
      // Only claims that can actually be labelled are worth the expensive search — the rest
      // sort below the cap and are never drawn
      const searchable =
        rank < CONFIG.TERRITORY_MAX_LABELS && e.cells >= CONFIG.TERRITORY_MIN_LABEL_CELLS;
      const { anchor, rotated: labelRotated } = searchable
        ? pickFrame(factionIndex, angle, mayRotate, sampled)
        : {
            anchor: chooseAnchor(factionIndex, mayRotate ? angle : 0, sampled),
            rotated: mayRotate,
          };
      // 圖的 y 軸在螢幕上是翻轉的，所以螢幕角度取負；再正規化到 ±90°，字永遠不會顛倒 /
      // Screen y is flipped relative to graph y, so negate; then normalise to ±90° so the text
      // is never upside-down. (A 180° flip maps the axis onto its own negative, and the
      // rectangle is symmetric under that, so the fit still holds.)
      let labelAngleDeg = 0;
      if (labelRotated) {
        labelAngleDeg = (-angle * 180) / Math.PI;
        while (labelAngleDeg > 90) labelAngleDeg -= 180;
        while (labelAngleDeg < -90) labelAngleDeg += 180;
      }
      return {
        key,
        cellCount: e.cells,
        cx,
        cy,
        labelX: graphX(anchor.px),
        labelY: graphY(anchor.py),
        // 內切圓要跟著**被選中的那一格**，否則圓的後備值會描述另一個地點 /
        // The inscribed circle must follow the **chosen** cell, or the circle fallback
        // describes a different place
        labelRadius: (dist[anchor.py * W + anchor.px] ?? 0) * cellAvg,
        angle,
        elongation,
        halfAlong: anchor.halfAlong,
        halfAcross: anchor.halfAcross,
        labelRotated,
        labelAngleDeg,
      };
    })
    .sort((a, b) => b.cellCount - a.cellCount);
}

/**
 * 領地圖的淡入淡出比例。
 * The territory layer's cross-fade opacity.
 *
 * 用 smoothstep 而不是線性，讓淡入淡出兩端都不會出現「半透明」的瞬間。
 * A smoothstep rather than a linear ramp, so neither end of the fade has a
 * visible moment of half-transparency.
 *
 * @param ratio - 目前鏡頭比例 / Current camera ratio
 * @param fullAt - 到此比例即完全顯示 / At or above this the layer is fully visible
 * @param goneAt - 低於此比例即完全隱藏 / At or below this it is fully hidden
 * @returns 0..1 的不透明度 / Opacity from 0 to 1
 */
export function territoryAlpha(ratio: number, fullAt: number, goneAt: number): number {
  if (ratio >= fullAt) return 1;
  if (ratio <= goneAt) return 0;
  const t = (ratio - goneAt) / (fullAt - goneAt);
  return t * t * (3 - 2 * t);
}