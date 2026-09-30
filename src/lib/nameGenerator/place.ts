// ============================================================================
// 地名產生器
// Place Name Generator
// ============================================================================
// 產生中文地名，共兩種風格 / Generates Chinese place names in two styles:
// - 傳統 / classic：[形容詞][形容詞][地形] — 青碧城, 蒼翠關, 紫金沙漠
// - 稱號 / epithet：[稱號][地形] — 霜狼關, 赤潮城, 幽光港
//
// 兩種風格依 CONFIG.PLACE_EPITHET_NAME_RATE 混合產生。
// The two styles are mixed according to CONFIG.PLACE_EPITHET_NAME_RATE.
//
// 產生器使用種子 RNG 以確保名稱可重現。
// The generator uses seeded RNG for reproducible names.
//
// 組合容量 / Combination capacity（數值由下方 pool 推導，實際值以
// PLACE_*_CAPACITY 常數為準 / derived from the pools below; the constants are
// the source of truth）:
//   傳統 / classic
//     修飾字 81 × 修飾字 80（排除第一個）× 地形 57 = 369,360
//     名稱格式為 [修飾字][修飾字][地形]；兩字不相同（m1 ≠ m2），
//     皆為單字、兩池皆去重，因此名稱可由「前兩字 + 餘下地形」唯一分解，
//     任意三元組合不會碰撞。
//     Format is [Modifier][Modifier][Terrain]; the two modifiers are never
//     equal (m1 ≠ m2), both single-char from deduplicated pools, so a name
//     decomposes uniquely into first two chars + remaining terrain, and no two
//     distinct triples collide.
//   稱號 / epithet
//     稱號 576 × 地形 57 = 32,832
//   跨風格重疊 10,659（稱號首尾字都屬修飾字池，例如「雲影城」兩種風格都組得出）
//   兩種風格並集 369,360 + 32,832 − 10,659 = 391,533 ≥ PLACE_MAX_COUNT (2000)
//   Cross-style overlap is 10,659 (both epithet chars are modifiers, e.g. 雲影城
//   is reachable from either style); the union is 391,533 ≥ PLACE_MAX_COUNT.
//   PLACE_TOTAL_NAME_CAPACITY 以程式算出此並集容量（而非兩個空間相加）。
//   PLACE_TOTAL_NAME_CAPACITY computes this union (rather than summing the two
//   spaces) so the "N distinct names" guarantee is honest.
//
// 已知取捨 / Known trade-off:
//   稱號首字與末字僅「潮」重疊，故可能出現「潮潮關」。機率極低
//   （1/576 的稱號），保留以維持「赤潮」等示範名稱。
//   Only 潮 appears in both the head and tail pools, so a 潮潮X name is
//   possible (1/576 of epithets). Kept so demo names like 赤潮 still generate.
// ============================================================================

import { type Rng } from '../rng';
import { CONFIG } from '../gameConfig';
import {
  EPITHET_COUNT,
  EPITHET_HEADS,
  EPITHET_TAILS,
  epithetAt,
  generateEpithet,
} from './epithet';

// ─── 名稱元件 / Name Components ────────────────────────────────────────────

/**
 * 地名修飾字（單字、無重複）：氛圍／外觀形容詞 + 具体地物。
 * Single-char place modifiers, no duplicates: atmosphere/appearance adjectives
 * plus concrete features (岩/狼/龍), so names like 灰岩高地 and 霧海前哨 generate.
 */
export const PLACE_ADJECTIVES: readonly string[] = [
  '青', '碧', '翠', '紫', '金', '銀', '赤', '白', '黑', '玄',
  '蒼', '丹', '朱', '素', '彩', '霞', '雲', '霧', '雨', '風',
  '雷', '電', '霜', '雪', '冰', '炎', '烈', '柔', '清', '幽',
  '靜', '喧', '繁', '荒', '深', '遠', '近', '高', '低', '明',
  '暗', '曦', '暉', '影', '光', '星', '月', '日', '晨', '暮',
  '華', '瑤', '瓊', '琛', '炫', '熠', '凝', '煜', '峻', '邃',
  '岩', '曜', '裂', '沉', '海', '峰', '沙', '泉', '沼', '骨',
  '骸', '龍', '蛇', '鷹', '鯨', '狼', '黯', '皓', '漠', '墟',
  '灰',
];

/** 地形後綴（無重複）/ Terrain suffixes, no duplicates */
export const PLACE_TERRAINS: readonly string[] = [
  '城', '鎮', '村', '關', '堡', '港', '寨', '峰', '谷', '原',
  '山', '水', '河', '湖', '海', '島', '林', '森', '沙漠', '原野',
  '隘口', '峽谷', '平原', '丘陵', '盆地', '沼澤', '綠洲', '邊塞',
  '要塞', '哨站', '驛站', '市集', '港口', '碼頭', '渡口', '洲',
  '灣', '潭', '溪', '濱', '崖', '峭', '堤', '坪', '嶺', '峪',
  '瀑', '汀', '渚', '塘', '野', '高地', '前哨', '津', '埠', '磯', '峽',
];

/** 傳統風格理論唯一組合數 = 形容詞數 × (形容詞數 − 1) × 地形數（adj1 ≠ adj2）/ Theoretical unique classic combination count with adj1 ≠ adj2 */
export const PLACE_NAME_CAPACITY =
  PLACE_ADJECTIVES.length *
  (PLACE_ADJECTIVES.length - 1) *
  PLACE_TERRAINS.length;

/** 稱號風格理論組合數 = 稱號數 × 地形數 / Theoretical unique epithet combination count */
export const PLACE_EPITHET_CAPACITY = EPITHET_COUNT * PLACE_TERRAINS.length;

/**
 * 兩種風格重疊的名稱數（稱號首尾字都屬於形容詞池時，兩種風格可組出同一字串）。
 * 需扣除重複計數，才能得到真正的並集容量。
 * Names reachable from BOTH styles (when both epithet chars are adjectives) —
 * subtracted so the union capacity is exact.
 */
export const PLACE_EPITHET_OVERLAP = (() => {
  const adjectives = new Set(PLACE_ADJECTIVES);
  let pairs = 0;
  for (const head of EPITHET_HEADS) {
    if (!adjectives.has(head)) continue;
    for (const tail of EPITHET_TAILS) {
      if (adjectives.has(tail) && tail !== head) pairs++;
    }
  }
  return pairs * PLACE_TERRAINS.length;
})();

/** 兩種風格的總容量（已扣除重疊）/ Total distinct capacity across both styles, overlap removed */
export const PLACE_TOTAL_NAME_CAPACITY =
  PLACE_NAME_CAPACITY + PLACE_EPITHET_CAPACITY - PLACE_EPITHET_OVERLAP;

// ─── 產生器 / Generator ────────────────────────────────────────────────────

/**
 * 產生「稱號 + 地形」風格的地名。
 * Generate a place name in the "[epithet][terrain]" style.
 *
 * 格式：[稱號][地形] — 例「霜狼關」
 * Format: [Epithet][Terrain] — e.g. 霜狼關
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 稱號風格地名 / An epithet-style place name
 */
export function generateEpithetPlaceName(rng: Rng): string {
  const epithet = generateEpithet(rng);
  const terrain = rng.pick([...PLACE_TERRAINS]) ?? '城';
  return `${epithet}${terrain}`;
}

/**
 * 產生隨機中文地名（兩種風格混合，不保證唯一）。
 * Generate a random Chinese place name (mixing both styles, NOT unique).
 *
 * 格式 / Formats:
 * - 稱號風格（機率 CONFIG.PLACE_EPITHET_NAME_RATE）：[稱號][地形] —「霜狼關」
 * - 傳統風格：[形容詞][形容詞][地形] —「青碧城」
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 隨機地名 / A random place name
 */
export function generatePlaceName(rng: Rng): string {
  // 稱號風格 / Epithet style
  if (rng.chance(CONFIG.PLACE_EPITHET_NAME_RATE)) {
    return generateEpithetPlaceName(rng);
  }

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
 * （容量內必回傳，否則回傳 null）。掃描依序走傳統空間與稱號空間。
 * Generate a place name not present in `taken`. Falls back to a deterministic
 * scan over the whole cross product — the classic space first, then the epithet
 * space — so it always finds one if the capacity allows; returns null when
 * every combination is taken.
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

  // 確定性掃描 1：傳統空間，從隨機起點線性走過全部組合（adj1 ≠ adj2）/
  // Deterministic scan 1: classic space, from a random start over every
  // combination (adj1 ≠ adj2)
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

  // 確定性掃描 2：稱號空間 [稱號][地形]/
  // Deterministic scan 2: the epithet space [Epithet][Terrain]
  const epithetTotal = PLACE_EPITHET_CAPACITY;
  const epithetStart = rng.int(0, epithetTotal - 1);
  for (let i = 0; i < epithetTotal; i++) {
    const idx = (epithetStart + i) % epithetTotal;
    const epithet = epithetAt(Math.floor(idx / terrains));
    const terrain = idx % terrains;
    const name = `${epithet}${PLACE_TERRAINS[terrain]}`;
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
  const limit = Math.min(count, PLACE_TOTAL_NAME_CAPACITY);

  for (let i = 0; i < limit; i++) {
    const name = generateUniquePlaceName(rng, taken);
    if (name === null) break;
    taken.add(name);
  }

  if (taken.size < count) {
    console.warn(
      `[nameGenerator] Could only generate ${taken.size}/${count} unique place names (capacity ${PLACE_TOTAL_NAME_CAPACITY})`
    );
  }

  return Array.from(taken);
}
