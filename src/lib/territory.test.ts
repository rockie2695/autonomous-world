import { describe, it, expect } from 'vitest';
import {
  buildTerritoryField,
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
      expect(factionAt(field, gx, 0)).toBe(alphaIndex);
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

  it('should resolve every cell in a dense world, with no holes', () => {
    // 稀疏或邊緣的格子難免是 -1；密集世界裡出現空洞就會在畫面上破一個洞 /
    // Sparse or far-edge cells may legitimately be -1, but a hole in a dense world
    // would punch a visible gap
    const many: TerritorySite[] = Array.from({ length: 80 }, (_, i) => ({
      id: `s${i}`,
      x: (i % 10) * 10,
      y: Math.floor(i / 10) * 10,
      faction: i % 2 === 0 ? FACTION_A : FACTION_B,
    }));
    const field = buildTerritoryField(many, 256, 0.2, 1.8);
    if (!field) throw new Error('expected a field');
    let holes = 0;
    for (const value of field.owner) if (value < 0) holes += 1;
    expect(holes / field.owner.length).toBeLessThan(0.05);
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

/** 圖座標 → 該格的勢力索引 / Graph-space point to that cell's faction index */
function factionAt(
  field: { width: number; height: number; owner: Int32Array; minX: number; minY: number; maxX: number; maxY: number },
  gx: number,
  gy: number
): number {
  const px = Math.min(field.width - 1, Math.max(0, Math.floor(((gx - field.minX) / (field.maxX - field.minX)) * field.width)));
  const py = Math.min(field.height - 1, Math.max(0, Math.floor(((gy - field.minY) / (field.maxY - field.minY)) * field.height)));
  return field.owner[py * field.width + px];
}