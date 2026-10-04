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
 * 每個勢力有一個「密度場」：把該勢力所有地方的影響力以 `1 - Π(1 - wᵢ)`（機率 OR）
 * 合併，其中 `wᵢ` 是距離的平滑衰減。每格取密度最高的勢力。
 * 這個做法同時滿足三件事：相鄰同勢力會融合、邊界是兩個平滑場相等處的曲線、離某地
 * 越近的勢力會把邊界推得越遠 —— 也就是「距離決定邊界」。
 * Each faction gets a density field: its places' influences combined with
 * `1 - Π(1 - wᵢ)` (a probabilistic OR), where `wᵢ` is a smooth distance falloff.
 * Each cell takes the highest density. That satisfies all three requirements at
 * once: adjacent same-faction places fuse, borders are curves where two smooth
 * fields are equal, and whichever faction is nearer pushes the border away —
 * distance decides the border.
 *
 * 用機率 OR 而不是相加，是因為相加會讓領地廣的勢力在遠處也累積出高密度、無限膨脹；
 * 機率 OR 的上限是 1，一個勢力只有在**附近真的有地**時才可能贏。
 * Probabilistic OR rather than a plain sum: a sum keeps accumulating at distance,
 * so a sprawling faction would inflate forever. OR saturates at 1, so a faction
 * can only win where it genuinely holds nearby ground.
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
   * 所屬勢力；**null 代表此地不宣稱任何領土**。
   * 仍然把它算進「最近鄰距離」，因為宣稱半徑要跟整張地圖的疏密一致，但密度場
   * 完全跳過它 —— 所以無主之地不會被塗成一片灰色，原地圖仍然看得見。
   * Owning faction; **null means this place claims no territory at all.**
   *
   * It still counts toward the nearest-neighbour distance, because the claim
   * radius has to match the density of the whole map — but the field skips it
   * entirely, so unowned land is never painted over and the map underneath stays
   * visible. This is the difference between CK3's map modes (ownership is a tint
   * *on* the map, unclaimed land is untouched) and repainting the map.
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
 * @returns 密度場 / The field, or null when there are no sites
 */
export function buildTerritoryField(
  sites: readonly TerritorySite[],
  maxResolution: number,
  margin: number,
  radiusFactor: number
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
  const siteFaction = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const key = sites[i].faction;
    // null = 不宣稱領土：密度場會跳過它，但上面的距離計算仍然把它算進去 /
    // null = claims nothing: the field skips it, while the distance pass above
    // still counts it
    if (key === null) continue;
    let index = factionIndex.get(key);
    if (index === undefined) {
      index = factionKeys.length;
      factionIndex.set(key, index);
      factionKeys.push(key);
    }
    siteFaction[i] = index;
  }
  const factionCount = factionKeys.length;
  // 一個勢力都沒有就沒有領地圖可畫，交給呼叫端處理 /
  // No faction at all means there is no territory to draw; the caller handles it
  if (factionCount === 0) return null;

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
  // 每格的密度累積器；用同一個陣列重複使用並在每格開頭歸零，避免每次配置 /
  // Per-cell density accumulator, reused and zeroed each cell so it is not
  // reallocated
  const density = new Float64Array(factionCount);

  for (let py = 0; py < height; py++) {
    const gy = minY + ((py + 0.5) / height) * fullSpanY;
    const by = clampIndex((gy - minY) / bucketH, rows);
    for (let px = 0; px < width; px++) {
      const gx = minX + ((px + 0.5) / width) * fullSpanX;
      const bx = clampIndex((gx - minX) / bucketW, cols);

      density.fill(0);
      let touched = false;
      for (let ny = Math.max(0, by - 1); ny <= Math.min(rows - 1, by + 1); ny++) {
        for (let nx = Math.max(0, bx - 1); nx <= Math.min(cols - 1, bx + 1); nx++) {
          for (const si of buckets[ny * cols + nx]) {
            const f = siteFaction[si];
            // -1 = 此地不宣稱領土，直接跳過；地圖在該處保持原樣 /
            // -1 = claims nothing, so skip it and leave the map untouched there
            if (f < 0) continue;
            const dx = sites[si].x - gx;
            const dy = sites[si].y - gy;
            const w = falloff(Math.sqrt(dx * dx + dy * dy), radius);
            if (w <= 0) continue;
            touched = true;
            // 機率 OR：acc ← acc + w - acc·w，等於 1 - Π(1 - wᵢ) /
            // Probabilistic OR: acc ← acc + w - acc·w, which is 1 - Π(1 - wᵢ)
            density[f] += w - density[f] * w;
          }
        }
      }
      if (!touched) continue;

      let bestFaction = -1;
      let bestDensity = 0;
      for (let f = 0; f < factionCount; f++) {
        if (density[f] > bestDensity) {
          bestDensity = density[f];
          bestFaction = f;
        }
      }
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
  const totals = new Map<string, { cells: number; sumX: number; sumY: number }>();

  for (let py = 0; py < field.height; py++) {
    const gy = field.minY + ((py + 0.5) / field.height) * spanY;
    for (let px = 0; px < field.width; px++) {
      const faction = field.owner[py * field.width + px];
      if (faction < 0) continue;
      const key = field.factions[faction];
      if (key === undefined) continue;
      const gx = field.minX + ((px + 0.5) / field.width) * spanX;
      const entry = totals.get(key);
      if (entry) {
        entry.cells += 1;
        entry.sumX += gx;
        entry.sumY += gy;
      } else {
        totals.set(key, { cells: 1, sumX: gx, sumY: gy });
      }
    }
  }

  return Array.from(totals.entries())
    .map(([key, entry]) => ({
      key,
      cellCount: entry.cells,
      cx: entry.sumX / entry.cells,
      cy: entry.sumY / entry.cells,
    }))
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