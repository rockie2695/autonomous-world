// ============================================================================
// 地名產生器
// Place Name Generator
// ============================================================================
// 以形容詞 + 形容詞 + 地形組合產生中文地名。
// Generates Chinese place names using adjective + adjective + terrain combinations.
// 例：青碧城, 蒼翠關, 紫金沙漠 / Examples: 青碧城, 蒼翠關, 紫金沙漠
//
// 產生器使用種子 RNG 以確保名稱可重現。
// The generator uses seeded RNG for reproducible names.
//
// 組合容量 / Combination capacity:
//   形容詞 60 × 形容詞 59（排除第一個形容詞）× 地形 51 = 180,540 ≥ PLACE_MAX_COUNT (2000)
//   名稱格式為 [形容詞][形容詞][地形]；兩個形容詞不相同（adj1 ≠ adj2），
//   皆為單字、兩池皆去重，因此名稱可由「前兩字 + 餘下地形」唯一分解，
//   任意三元組合不會碰撞。
//   Format is [Adjective][Adjective][Terrain]; the two adjectives are never
//   equal (adj1 ≠ adj2), both single-char from deduplicated pools, so a name
//   decomposes uniquely into first two chars + remaining terrain, and no two
//   distinct triples collide.
// ============================================================================

import { type Rng } from '../rng';

// ─── 名稱元件 / Name Components ────────────────────────────────────────────

/** 描述氛圍或外觀的形容詞（單字、無重複）/ Single-char adjectives, no duplicates */
export const PLACE_ADJECTIVES: readonly string[] = [
  '青', '碧', '翠', '紫', '金', '銀', '赤', '白', '黑', '玄',
  '蒼', '丹', '朱', '素', '彩', '霞', '雲', '霧', '雨', '風',
  '雷', '電', '霜', '雪', '冰', '炎', '烈', '柔', '清', '幽',
  '靜', '喧', '繁', '荒', '深', '遠', '近', '高', '低', '明',
  '暗', '曦', '暉', '影', '光', '星', '月', '日', '晨', '暮',
  '華', '瑤', '瓊', '琛', '炫', '熠', '凝', '煜', '峻', '邃',
];

/** 地形後綴（無重複）/ Terrain suffixes, no duplicates */
export const PLACE_TERRAINS: readonly string[] = [
  '城', '鎮', '村', '關', '堡', '港', '寨', '峰', '谷', '原',
  '山', '水', '河', '湖', '海', '島', '林', '森', '沙漠', '原野',
  '隘口', '峽谷', '平原', '丘陵', '盆地', '沼澤', '綠洲', '邊塞',
  '要塞', '哨站', '驛站', '市集', '港口', '碼頭', '渡口', '洲',
  '灣', '潭', '溪', '濱', '崖', '峭', '堤', '坪', '嶺', '峪',
  '瀑', '汀', '渚', '塘', '野',
];

/** 理論唯一組合數 = 形容詞數 × (形容詞數 − 1) × 地形數（adj1 ≠ adj2）/ Theoretical unique combination count with adj1 ≠ adj2 */
export const PLACE_NAME_CAPACITY =
  PLACE_ADJECTIVES.length *
  (PLACE_ADJECTIVES.length - 1) *
  PLACE_TERRAINS.length;

// ─── 產生器 / Generator ────────────────────────────────────────────────────

/**
 * 產生隨機中文地名（不保證唯一，呼叫端應以 generateUniquePlaceName 查重）。
 * Generate a random Chinese place name (NOT unique; callers wanting
 * uniqueness should use generateUniquePlaceName).
 *
 * 格式：[形容詞][形容詞][地形] / Format: [Adjective][Adjective][Terrain]
 * 例：青碧城, 蒼翠關, 紫金沙漠 / Example: 青碧城, 蒼翠關, 紫金沙漠
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 隨機地名 / A random place name
 */
export function generatePlaceName(rng: Rng): string {
  const adj1Index = rng.int(0, PLACE_ADJECTIVES.length - 1);
  // adj2 從排除 adj1 的 59 個候選中選取（adj1 ≠ adj2）/
  // adj2 picked from the 59 candidates excluding adj1 (adj1 ≠ adj2)
  let adj2Index = rng.int(0, PLACE_ADJECTIVES.length - 2);
  if (adj2Index >= adj1Index) adj2Index++;
  const terrain = rng.pick([...PLACE_TERRAINS]) ?? '城';
  return `${PLACE_ADJECTIVES[adj1Index]}${PLACE_ADJECTIVES[adj2Index]}${terrain}`;
}

/**
 * 以 [第一形容詞索引, 第二形容詞索引, 地形索引] 組合出名稱。
 * Build a name from a first-adjective index, second-adjective index and
 * terrain index.
 *
 * @param adj1Index - 第一形容詞池索引 / Index into PLACE_ADJECTIVES (first slot)
 * @param adj2Index - 第二形容詞池索引 / Index into PLACE_ADJECTIVES (second slot)
 * @param terrainIndex - 地形池索引 / Index into PLACE_TERRAINS
 * @returns 地名 / The place name
 */
function nameAt(adj1Index: number, adj2Index: number, terrainIndex: number): string {
  return `${PLACE_ADJECTIVES[adj1Index]}${PLACE_ADJECTIVES[adj2Index]}${PLACE_TERRAINS[terrainIndex]}`;
}

/**
 * 產生不與 taken 撞名的地名；若隨機嘗試失敗則以確定性掃描保證找到
 * （容量內必回傳，否則回傳 null）。
 * Generate a place name not present in `taken`. Falls back to a
 * deterministic scan over the whole cross product so it always finds one
 * if the capacity allows; returns null when every combination is taken.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param taken - 已佔用的名稱集合 / Set of names already in use
 * @returns 唯一地名，或 null（容量耗盡）/ A unique name, or null if exhausted
 */
export function generateUniquePlaceName(
  rng: Rng,
  taken: ReadonlySet<string>
): string | null {
  // 隨機快速路徑 / Fast random path
  for (let attempt = 0; attempt < 64; attempt++) {
    const name = generatePlaceName(rng);
    if (!taken.has(name)) return name;
  }

  // 確定性掃描：從隨機起點線性走過全部組合（adj1 ≠ adj2）/
  // Deterministic scan from a random start over every combination (adj1 ≠ adj2)
  const total = PLACE_NAME_CAPACITY;
  const adjs = PLACE_ADJECTIVES.length;
  const terrains = PLACE_TERRAINS.length;
  const block = (adjs - 1) * terrains; // 每個 adj1 的組合數 / combinations per adj1
  const start = rng.int(0, total - 1);
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const adj1 = Math.floor(idx / block);
    const rem = idx % block;
    // adj2 索引落在 [0, adjs-2]，映射到跳過 adj1 的 [0, adjs-1] /
    // adj2 index in [0, adjs-2] remapped to [0, adjs-1] skipping adj1
    let adj2 = Math.floor(rem / terrains);
    if (adj2 >= adj1) adj2++;
    const terrain = rem % terrains;
    const name = nameAt(adj1, adj2, terrain);
    if (!taken.has(name)) return name;
  }
  return null;
}

/**
 * 產生一批唯一地名（保證回傳 count 個，除非容量不足）。適用於世界初始化。
 * Generate a batch of unique names. Guarantees `count` names unless the
 * theoretical capacity is too small. Useful for world initialization.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param count - 要產生的名稱數 / Number of names to generate
 * @returns 唯一名稱陣列 / Array of unique names
 */
export function generatePlaceNames(rng: Rng, count: number): string[] {
  const taken = new Set<string>();
  const limit = Math.min(count, PLACE_NAME_CAPACITY);

  for (let i = 0; i < limit; i++) {
    const name = generateUniquePlaceName(rng, taken);
    if (name === null) break;
    taken.add(name);
  }

  if (taken.size < count) {
    console.warn(
      `[nameGenerator] Could only generate ${taken.size}/${count} unique place names (capacity ${PLACE_NAME_CAPACITY})`
    );
  }

  return Array.from(taken);
}
