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
   * 勢力範圍的邊界（圖座標）/ The region's bounds in graph space.
   *
   * 標籤需要它才能**留在領地裡面**：只靠重心的話，一塊長條形或彎曲的領地會把名字放到
   * 範圍外的空白上。所以要能把標籤夾回邊界內，並且在領地在螢幕上太小以致於放不下時
   * 直接不畫。
   *
   * The label needs this to **stay inside the territory**: with only a centroid, an
   * elongated or bent region puts its name on blank ground outside the claim. Bounds
   * let the label be clamped back inside, and let it be skipped entirely when the
   * region is too small on screen to hold it.
   */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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
   * 領地沿著主軸的半長，以及垂直方向的半寬（圖座標）。
   *
   * 這是「字要撐滿整個領地」的關鍵：內切圓的半徑對細長的領地會很小（一條長長的領地
   * 內切圓只有幾格寬），用半徑去算字級會讓名字小得可笑。沿著主軸的半長才代表那塊地
   * 有多長，字才有辦法變大。
   *
   * 由共變異數的特徵值推得：均勻填滿的橢圓，沿軸的變異數是 a²/4，所以 a = 2√λ。
   *
   * The half-length along the principal axis and the half-width across it, in graph
   * coordinates.
   *
   * This is what lets the text fill the whole claim: the inscribed radius is tiny for a
   * long thin claim (a strip only a few cells wide), so sizing from it makes the name
   * absurdly small. The half-length along the axis is how long the claim actually is,
   * which is what lets the text grow.
   *
   * Derived from the covariance eigenvalues: for a uniformly filled ellipse the variance
   * along an axis is a²/4, so a = 2√λ.
   */
  halfLength: number;
  halfWidth: number;
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
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
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
        if (gx < entry.minX) entry.minX = gx;
        if (gx > entry.maxX) entry.maxX = gx;
        if (gy < entry.minY) entry.minY = gy;
        if (gy > entry.maxY) entry.maxY = gy;
        if (d > entry.best) { entry.best = d; entry.bestPx = px; entry.bestPy = py; }
        entry.sxx += gx * gx;
        entry.syy += gy * gy;
        entry.sxy += gx * gy;
      } else {
        totals.set(key, {
          cells: 1,
          sumX: gx,
          sumY: gy,
          minX: gx,
          minY: gy,
          maxX: gx,
          maxY: gy,
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
  return Array.from(totals.entries())
    .map(([key, e]) => {
      const cx = e.sumX / e.cells;
      const cy = e.sumY / e.cells;
      // 共變異數 → 主軸方向 / covariance to principal axis
      const cxx = e.sxx / e.cells - cx * cx;
      const cyy = e.syy / e.cells - cy * cy;
      const cxy = e.sxy / e.cells - cx * cy;
      const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      // 主軸與次軸的比：太接近就是接近圓形，方向不穩定，不值得旋轉文字
      // Axial ratio: too close means near-circular, where the direction is unstable and
      // rotating the text is not worth it
      const trace = cxx + cyy;
      const diff = Math.sqrt(Math.max(0, (cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy));
      const l1 = (trace + diff) / 2;
      const l2 = (trace - diff) / 2;
      const elongation = l2 > 1e-9 ? Math.sqrt(l1 / l2) : 99;
      // 沿主軸／次軸的半長度（見介面上的說明）/ half extents along each axis
      const halfLength = 2 * Math.sqrt(Math.max(l1, 0));
      const halfWidth = 2 * Math.sqrt(Math.max(l2, 0));
      return {
        key,
        cellCount: e.cells,
        cx,
        cy,
        minX: e.minX,
        minY: e.minY,
        maxX: e.maxX,
        maxY: e.maxY,
        labelX: graphX(e.bestPx),
        labelY: graphY(e.bestPy),
        labelRadius: e.best * cellAvg,
        angle,
        elongation,
        halfLength,
        halfWidth,
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