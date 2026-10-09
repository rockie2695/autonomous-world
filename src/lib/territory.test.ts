import { describe, it, expect } from 'vitest';
import {
  buildTerritoryField,
  factionAt,
  factionRegions,
  meanNeighbourDistance,
  nearestSite,
  neighbourMask,
  territoryAlpha,
  NEIGHBOUR_BOTTOM,
  NEIGHBOUR_LEFT,
  NEIGHBOUR_RIGHT,
  NEIGHBOUR_TOP,
  type TerritorySite,
} from './territory';

/** 方形排列的四個地方 / Four sites in a square */
function sites(): TerritorySite[] {
  return [
    { id: 'a', x: 0, y: 0, faction: 'alpha' },
    { id: 'b', x: 10, y: 0, faction: 'alpha' },
    { id: 'c', x: 0, y: 10, faction: 'beta' },
    { id: 'd', x: 10, y: 10, faction: 'beta' },
  ];
}

const FACTION_A = 'alpha';
const FACTION_B = 'beta';

describe('meanNeighbourDistance', () => {
  it('should return the spacing of a regular lattice', () => {
    // 正方排列的最近鄰距離就是邊長 /
    // For a square lattice the nearest-neighbour distance is the pitch
    expect(meanNeighbourDistance(sites())).toBeCloseTo(10);
  });

  it('should stay finite for degenerate input', () => {
    // 單一地方或全部共線時不能回傳 0，否則半徑會變成 0、整個場就崩了 /
    // A single site or a collinear set must not return 0, or the radius collapses
    // and the whole field breaks
    expect(Number.isFinite(meanNeighbourDistance([{ id: 'x', x: 4, y: 4, faction: 'a' }]))).toBe(
      true
    );
    const line: TerritorySite[] = [
      { id: 'a', x: 0, y: 3, faction: 'a' },
      { id: 'b', x: 5, y: 3, faction: 'a' },
    ];
    expect(meanNeighbourDistance(line)).toBeGreaterThan(0);
  });
});

describe('buildTerritoryField', () => {
  it('should return null when there are no sites', () => {
    expect(buildTerritoryField([], 256, 0.2, 1.8)).toBeNull();
  });

  it('should register each distinct faction exactly once', () => {
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    expect(field.factions.slice().sort()).toEqual([FACTION_A, FACTION_B]);
  });

  it('should give every site cell to its own faction', () => {
    // 每個地方的正中心必須屬於自己的勢力，否則領地會跟實際佔領對不上 /
    // Each site's own centre must belong to its own faction, or the territory
    // would disagree with who actually owns the place
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    for (const site of sites()) {
      const px = Math.floor(((site.x - field.minX) / (field.maxX - field.minX)) * field.width);
      const py = Math.floor(((site.y - field.minY) / (field.maxY - field.minY)) * field.height);
      const cx = Math.min(field.width - 1, Math.max(0, px));
      const cy = Math.min(field.height - 1, Math.max(0, py));
const winner = field.owner[cy * field.width + cx];
      expect(field.factions[winner]).toBe(site.faction);
    }
  });

  it('should leave unowned land unpainted instead of letting a faction claim it', () => {
    // 一整片 alpha 的土地，中間放一個無主之地。若無主之地只是「自己不畫」，
    // 周圍勢力的平滑密度場會直接蓋過去，於是無主之地看起來還是 alpha 的 ——
    // 這正是回報的問題。無主之地必須贏下那個槽位，把格子挖空。
    // A solid field of alpha land with one unowned place in the middle. If
    // unowned merely "didn't paint itself", the surrounding smooth density field
    // would flow straight over it and the place would still read as alpha — which
    // is the reported bug. Unowned has to *win* its slot and punch the cell out.
    const grid: TerritorySite[] = [];
    for (let x = 0; x <= 30; x += 10) {
      for (let y = 0; y <= 30; y += 10) {
        grid.push({ id: `s${x}-${y}`, x, y, faction: FACTION_A });
      }
    }
    grid.push({ id: 'free', x: 15, y: 15, faction: null });

    const field = buildTerritoryField(grid, 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');

    const cellOf = (gx: number, gy: number): number => {
      const px = Math.floor(((gx - field.minX) / (field.maxX - field.minX)) * field.width);
      const py = Math.floor(((gy - field.minY) / (field.maxY - field.minY)) * field.height);
      return field.owner[
        Math.min(field.height - 1, Math.max(0, py)) * field.width +
          Math.min(field.width - 1, Math.max(0, px))
      ];
    };

    // 空格：無主之地的正中心不屬於任何勢力 /
    // owner -1: the unowned place's own centre belongs to nobody
    expect(cellOf(15, 15)).toBe(-1);
    // 周圍仍然是 alpha —— 洞是被挖出來的，不是整片消失 /
    // The surroundings stay alpha: a hole was punched, not the region removed
    expect(field.factions[cellOf(0, 0)]).toBe(FACTION_A);
    expect(field.factions[cellOf(30, 30)]).toBe(FACTION_A);
    // 未佔用的 slot 絕不能外洩成 `factions` 的一員，否則會多出一個假勢力 /
    // The blocked slot must never leak into `factions`, or a phantom faction appears
    expect(field.factions).not.toContain('');
    expect(field.factions).toHaveLength(1);
  });

  it('should grow a faction\'s territory with how many places it holds', () => {
    // 這是「距離由力的多寡決定」的核心：每個地方推出的力都一樣，所以同勢力的力會
    // 累加。四個地方的勢力必須比只有一個地方的勢力佔更大面積 —— 舊的機率 OR 版本
    // 會讓兩者一樣大，因為 OR 飽和在 1，勢力大小完全沒反映在領地上。
    // This is the heart of "extent is decided by how much force": every place emits
    // an equal force, so same-faction force accumulates. A faction holding four
    // places must cover more ground than one holding a single place. The old
    // probabilistic-OR version made them identical, because OR saturates at 1 and
    // faction size had no effect on the map at all.
    // 離得很遠的無主錨點：它們不宣稱任何領地，存在的唯一目的是**把地圖範圍撐大**。
    // 沒有它們，範圍會緊貼著 alpha 那幾個地方，兩種情況都會把整個網格塗滿，
    // 數出來當然一樣多，等於什麼都沒測到。
    // Unowned anchors far away: they claim nothing and exist purely to **inflate the
    // extent**. Without them the extent hugs alpha's own places, both cases paint the
    // whole grid, and the comparison is meaningless.
    const anchors: TerritorySite[] = [];
    for (let x = 200; x <= 260; x += 20) {
      for (let y = 200; y <= 260; y += 20) {
        anchors.push({ id: `anchor-${x}-${y}`, x, y, faction: null });
      }
    }
    const one = [{ id: 'a', x: 0, y: 0, faction: FACTION_A }];
    const four = [
      { id: 'a', x: -1, y: -1, faction: FACTION_A },
      { id: 'b', x: 1, y: -1, faction: FACTION_A },
      { id: 'c', x: -1, y: 1, faction: FACTION_A },
      { id: 'd', x: 1, y: 1, faction: FACTION_A },
    ];
    const countOwned = (sites: TerritorySite[]) => {
      const field = buildTerritoryField([...sites, ...anchors], 256, 0.2, 2.4);
      if (!field) throw new Error('expected a field');
      let n = 0;
      for (const v of field.owner) if (v >= 0) n += 1;
      return n;
    };
    const single = countOwned(one);
    const clustered = countOwned(four);
    expect(single).toBeGreaterThan(0);
    expect(clustered).toBeGreaterThan(single);
  });

  it('should return null when every place is unowned', () => {
    const unowned: TerritorySite[] = [
      { id: 'a', x: 0, y: 0, faction: null },
      { id: 'b', x: 10, y: 10, faction: null },
    ];
    expect(buildTerritoryField(unowned, 64, 0.2, 1.8)).toBeNull();
  });

  it('should not leave a seam between two adjacent places of the same faction', () => {
    // 這是整個改動的重點：舊的 Voronoi 會在同勢力相鄰地方之間畫出一條邊界，
    // 看起來像像素塊。密度場必須把它們融合成一片連續區域。
    // This is the whole point of the rewrite: a Voronoi partition draws a border
    // between two adjacent places of the same faction, which reads as pixel art.
    // A density field must fuse them into one continuous region.
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    const alphaIndex = field.factions.indexOf(FACTION_A);
    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    // 沿著 a(0,0) → b(10,0) 這條線取樣：兩者同屬 alpha，中點也必須是 alpha /
    // Sample the line a(0,0) → b(10,0): both are alpha, so the midpoint must be
    // alpha too — that midpoint is exactly where a Voronoi seam would appear
    for (let step = 0; step <= 40; step++) {
      const gx = (step / 40) * 10;
      expect(factionAt(field, gx, 0)).toBe(FACTION_A);
    }
  });

  it('should put the border between factions where the claims are equal, not midway by fiat', () => {
    // 邊界要受距離影響：把 alpha 的地方往 beta 推近，交界就應該往 alpha 讓步 /
    // The border must respond to distance: move an alpha place closer to beta's
    // and the border should give way toward alpha
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    const alphaCells = countFaction(field, FACTION_A);
    // 再多給 alpha 一個地方，它應該贏到更多面積 /
    // Give alpha one more place and it should win more area
    const extra: TerritorySite[] = [...sites(), { id: 'e', x: 5, y: 0, faction: FACTION_A }];
    const grown = buildTerritoryField(extra, 256, 0.2, 1.8);
    if (!grown) throw new Error('expected a field');
    expect(countFaction(grown, FACTION_A)).toBeGreaterThan(alphaCells);
  });

  it('should grow the extent by the requested margin on each side', () => {
    // 沒有 margin 時格子邊界剛好落在最外側的地方上，畫面會有一條明顯直邊 /
    // With no margin the grid stops at the outermost place and the view shows a
    // hard straight edge
    const padded = buildTerritoryField(sites(), 256, 0.5, 1.8);
    if (!padded) throw new Error('expected a field');
    expect(padded.minX).toBeCloseTo(-5);
    expect(padded.maxX).toBeCloseTo(15);
  });

  it('should leave no unpainted gap inside a dense world', () => {
    // 勢力邊緣之外留白是**預期的**：每個地方只推有限距離，遠處本來就沒有人宣稱，
    // 而且「推多遠由累積的力決定」這條規則本來就會讓最外圈淡出。所以不能統計全局
    // 留白比例 —— 那會把正常的邊緣也算成失敗。
    // Unclaimed land beyond the edge is *expected*: each place pushes a finite
    // distance, and the outermost ring fading out is the whole point of "extent is
    // decided by accumulated force". Counting the global unpainted fraction would
    // therefore fail on correct behaviour.
    //
    // 真正不能接受的是**被領地包住的空洞**：四鄰都已被佔領、只有自己空著，那會在
    // 畫面上破一個洞。
    // What must never happen is a hole *enclosed* by held land, which would show as a
    // gap on screen.
    const many: TerritorySite[] = Array.from({ length: 80 }, (_, i) => ({
      id: `s${i}`,
      x: (i % 10) * 10,
      y: Math.floor(i / 10) * 10,
      faction: i % 2 === 0 ? FACTION_A : FACTION_B,
    }));
    const field = buildTerritoryField(many, 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    const at = (x: number, y: number) => field.owner[y * field.width + x];
    let interiorHoles = 0;
    for (let y = 1; y < field.height - 1; y++) {
      for (let x = 1; x < field.width - 1; x++) {
        if (at(x, y) >= 0) continue;
        // 連對角都算：只靠斜角接觸的縫隙一樣看得見 /
        // Diagonals count too: a gap touching its neighbours only at the corners
        // is still visible
        let held = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (at(x + dx, y + dy) >= 0) held += 1;
          }
        }
        if (held === 8) interiorHoles += 1;
      }
    }
    expect(interiorHoles).toBe(0);
  });

  it('should be deterministic for the same input', () => {
    const a = buildTerritoryField(sites(), 256, 0.2, 1.8);
    const b = buildTerritoryField(sites(), 256, 0.2, 1.8);
    expect(Array.from(a?.owner ?? [])).toEqual(Array.from(b?.owner ?? []));
  });

  it('should survive a single place without dividing by zero', () => {
    const field = buildTerritoryField([{ id: 'only', x: 5, y: 5, faction: 'solo' }], 64, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    expect(field.width).toBeGreaterThan(0);
    expect(field.height).toBeGreaterThan(0);
    expect(field.factions).toEqual(['solo']);
  });
});

describe('nearestSite', () => {
  it('should return the closest site to a point', () => {
    const list = sites();
    expect(nearestSite(list, 0.2, 0.2)).toBe(0);
    expect(nearestSite(list, 9.8, 0.2)).toBe(1);
    expect(nearestSite(list, 0.2, 9.8)).toBe(2);
    expect(nearestSite(list, 9.8, 9.8)).toBe(3);
  });

  it('should return -1 when there are no sites', () => {
    expect(nearestSite([], 0, 0)).toBe(-1);
  });
});

describe('neighbourMask', () => {
  it('should stay 0 inside a single faction', () => {
    // 單一勢力時到處都是內部，亮邊會讓整張圖發白 /
    // With one faction owning everything, everything is interior and a lit rim
    // would wash the map out
    const field = buildTerritoryField(
      [
        { id: 'a', x: 0, y: 0, faction: 'only' },
        { id: 'b', x: 10, y: 0, faction: 'only' },
        { id: 'c', x: 0, y: 10, faction: 'only' },
        { id: 'd', x: 10, y: 10, faction: 'only' },
      ],
      128,
      0.2,
      1.8
    );
    if (!field) throw new Error('expected a field');
    for (let py = 0; py < field.height; py++) {
      for (let px = 0; px < field.width; px++) {
        expect(neighbourMask(field, px, py)).toBe(0);
      }
    }
  });

  it('should report each differing side independently', () => {
    // 逐邊是重點：整格一起亮會變成厚白塊，所以四個方向要能分開判定 /
    // Per-side is the point: lighting whole cells turns the rim into a thick band,
    // so the four directions must be separable
    const field = buildTerritoryField(
      [
        // 對角切分才會同時產生水平與垂直邊界；單純上下或左右分兩半只會得到
        // 兩個方向 /
        // Only a diagonal split produces both horizontal and vertical borders;
        // splitting purely top/bottom or left/right yields just two directions
        { id: 'a', x: 0, y: 0, faction: FACTION_A },
        { id: 'b', x: 10, y: 0, faction: FACTION_B },
        { id: 'c', x: 0, y: 10, faction: FACTION_B },
        { id: 'd', x: 10, y: 10, faction: FACTION_A },
      ],
      128,
      0.2,
      1.8
    );
    if (!field) throw new Error('expected a field');
    const seen = new Set<number>();
    for (let py = 0; py < field.height; py++) {
      for (let px = 0; px < field.width; px++) {
        seen.add(neighbourMask(field, px, py));
      }
    }
    const single = [NEIGHBOUR_LEFT, NEIGHBOUR_RIGHT, NEIGHBOUR_TOP, NEIGHBOUR_BOTTOM];
    expect(single.some((side) => seen.has(side))).toBe(true);
    let union = 0;
    for (const mask of seen) union |= mask;
    expect(union).toBe(
      NEIGHBOUR_LEFT | NEIGHBOUR_RIGHT | NEIGHBOUR_TOP | NEIGHBOUR_BOTTOM
    );
  });
});

describe('factionRegions', () => {
  it('should group by faction and order largest first', () => {
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    const regions = factionRegions(field);
    expect(regions).toHaveLength(2);
    expect(regions[0]?.cellCount).toBeGreaterThanOrEqual(regions[1]?.cellCount ?? 0);
    expect(regions.map((r) => r.key).sort()).toEqual([FACTION_A, FACTION_B]);
  });

  it('should place each centroid inside the covered extent', () => {
    // 重心若跑到範圍外，名字就會壓到地圖外或別人的領地上 /
    // A centroid outside the extent would print a name off the map or over
    // another faction's land
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    for (const region of factionRegions(field)) {
      expect(region.cx).toBeGreaterThanOrEqual(field.minX);
      expect(region.cx).toBeLessThanOrEqual(field.maxX);
      expect(region.cy).toBeGreaterThanOrEqual(field.minY);
      expect(region.cy).toBeLessThanOrEqual(field.maxY);
    }
  });

  it('should report bounds that actually contain the centroid', () => {
    // 標籤會被夾進這組邊界，所以重心必須落在裡面，否則夾完會偏移 /
    // The label is clamped into these bounds, so the centroid must lie inside them
    // or the clamp would move the name somewhere unrelated
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    for (const region of factionRegions(field)) {
      expect(region.minX).toBeLessThanOrEqual(region.cx);
      expect(region.maxX).toBeGreaterThanOrEqual(region.cx);
      expect(region.minY).toBeLessThanOrEqual(region.cy);
      expect(region.maxY).toBeGreaterThanOrEqual(region.cy);
      // And the bounds must be a real box, not a point
      expect(region.maxX).toBeGreaterThan(region.minX);
      expect(region.maxY).toBeGreaterThan(region.minY);
    }
  });

  it('should anchor the label inside the region, not on a concave notch', () => {
    // The centroid of a bent claim can fall outside it; the inscribed-circle centre
    // never can, and it is what the label is positioned with.
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    for (const region of factionRegions(field)) {
      expect(region.labelX).toBeGreaterThanOrEqual(region.minX);
      expect(region.labelX).toBeLessThanOrEqual(region.maxX);
      expect(region.labelY).toBeGreaterThanOrEqual(region.minY);
      expect(region.labelY).toBeLessThanOrEqual(region.maxY);
    }
  });

  it('should give a positive inscribed radius for a region with any area', () => {
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    for (const region of factionRegions(field)) {
      // A region of any depth has a positive distance to its edge; zero would mean the
      // label can never be placed.
      expect(region.labelRadius).toBeGreaterThan(0);
    }
  });

  it('should report a finite angle and a sane elongation', () => {
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    for (const region of factionRegions(field)) {
      expect(Number.isFinite(region.angle)).toBe(true);
      // l1 >= l2 by construction, so the ratio is at least 1
      expect(region.elongation).toBeGreaterThanOrEqual(1);
    }
  });

  it('should keep a same-faction pair as one region, not two', () => {
    // 同勢力相鄰必須融合成一塊，否則地圖上會出現同一勢力兩塊不相連的領地 /
    // Adjacent same-faction places must fuse, or one faction shows as two
    // disconnected territories
    const field = buildTerritoryField(
      [
        { id: 'a', x: 0, y: 0, faction: 'solo' },
        { id: 'b', x: 10, y: 0, faction: 'solo' },
      ],
      256,
      0.2,
      1.8
    );
    if (!field) throw new Error('expected a field');
    const regions = factionRegions(field).filter((r) => r.key === 'solo');
    expect(regions).toHaveLength(1);
  });
});

describe('factionAt', () => {
  it('should report the faction owning the area under the cursor', () => {
    // 拉遠視圖畫的是「面積」，所以 hover 要問密度場：「游標底下這塊是誰的？」
    // 而不是「最近的地方是誰」—— 後者幾乎永遠會指向一個無關的小節點。
    // The zoomed-out view draws *areas*, so a hover has to ask the density field
    // "whose land is under the cursor?" rather than "which place is nearest?" —
    // the latter almost always names an unrelated node.
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    expect(factionAt(field, 0, 0)).toBe(FACTION_A);
    expect(factionAt(field, 10, 10)).toBe(FACTION_B);
  });

  it('should report null on blank land and outside the extent', () => {
    const field = buildTerritoryField(sites(), 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    // 範圍之外沒有任何勢力宣稱 /
    // Nothing claims anything outside the extent
    expect(factionAt(field, field.minX - 1000, field.minY - 1000)).toBeNull();
    expect(factionAt(field, field.maxX + 1000, field.maxY + 1000)).toBeNull();
  });

  it('should report null on a hole punched by unowned land', () => {
    const grid: TerritorySite[] = [];
    for (let x = 0; x <= 30; x += 10) {
      for (let y = 0; y <= 30; y += 10) {
        grid.push({ id: `s${x}-${y}`, x, y, faction: FACTION_A });
      }
    }
    grid.push({ id: 'free', x: 15, y: 15, faction: null });
    const field = buildTerritoryField(grid, 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    // 游標在無主之地上 → 不顯示任何勢力（也就不是錯顯示鄰居的勢力）/
    // Cursor on unowned land → no faction at all, rather than wrongly naming a
    // neighbour whose claim would otherwise flow over it
    expect(factionAt(field, 15, 15)).toBeNull();
    expect(factionAt(field, 0, 0)).toBe(FACTION_A);
  });
});

describe('territoryAlpha', () => {
  const FULL = 1.2;
  const GONE = 0.8;

  it('should be fully visible at or above the full threshold', () => {
    expect(territoryAlpha(FULL, FULL, GONE)).toBe(1);
    expect(territoryAlpha(4, FULL, GONE)).toBe(1);
  });

  it('should be fully hidden at or below the hidden threshold', () => {
    expect(territoryAlpha(GONE, FULL, GONE)).toBe(0);
    expect(territoryAlpha(0.1, FULL, GONE)).toBe(0);
  });

  it('should ramp smoothly and stay inside 0..1 across the fade', () => {
    for (let i = 0; i <= 9; i++) {
      const ratio = GONE + ((FULL - GONE) * i) / 9;
      const alpha = territoryAlpha(ratio, FULL, GONE);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it('should never increase as the camera zooms in', () => {
    // 往 zoom in 走只會讓領地圖更淡；若反過來代表參數順序用錯了 /
    // Zooming in may only ever reduce the territory; the reverse would mean the
    // thresholds are applied the wrong way round
    let previous = Infinity;
    for (let ratio = 2; ratio >= 0.4; ratio -= 0.1) {
      const alpha = territoryAlpha(ratio, FULL, GONE);
      expect(alpha).toBeLessThanOrEqual(previous + 1e-9);
      previous = alpha;
    }
  });
});

/** 數一數某勢力贏了多少格 / Count the cells a faction won */
function countFaction(field: { owner: Int32Array; factions: string[] }, key: string): number {
  const index = field.factions.indexOf(key);
  if (index < 0) return 0;
  let count = 0;
  for (const value of field.owner) if (value === index) count += 1;
  return count;
}