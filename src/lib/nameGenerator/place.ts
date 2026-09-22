// ============================================================================
// 地名產生器
// Place Name Generator
// ============================================================================
// 以形容詞 + 地形組合產生中文地名。
// Generates Chinese place names using adjective + terrain combinations.
// 例：青雲城, 落霞關, 碧水鎮, 風暴港
// Examples: 青雲城, 落霞關, 碧水鎮, 風暴港
//
// 產生器使用種子 RNG 以確保名稱可重現。
// The generator uses seeded RNG for reproducible names.
// ============================================================================

import { type Rng } from '../rng';

// ─── 名稱元件 / Name Components ────────────────────────────────────────────

/** 描述氛圍或外觀的形容詞 / Adjectives describing atmosphere or appearance */
const ADJECTIVES = [
  '青', '碧', '翠', '紫', '金', '銀', '赤', '白', '黑', '玄',
  '蒼', '丹', '朱', '素', '彩', '霞', '雲', '霧', '雨', '風',
  '雷', '電', '霜', '雪', '冰', '炎', '烈', '柔', '清', '幽',
  '靜', '喧', '繁', '荒', '幽', '深', '遠', '近', '高', '低',
  '明', '暗', '曦', '暉', '影', '光', '星', '月', '日', '晨',
];

/** 地形後綴 / Terrain suffixes */
const TERRAINS = [
  '城', '鎮', '村', '關', '堡', '港', '寨', '峰', '谷', '原',
  '山', '水', '河', '湖', '海', '島', '林', '森', '沙漠', '原野',
  '隘口', '峽谷', '平原', '丘陵', '盆地', '沼澤', '綠洲', '邊塞',
  '要塞', '哨站', '驛站', '市集', '港口', '碼頭', '碼頭', '渡口',
];

// ─── 產生器 / Generator ────────────────────────────────────────────────────

/**
 * 產生隨機中文地名。
 * Generate a random Chinese place name.
 *
 * 格式：[形容詞][地形] / Format: [Adjective][Terrain]
 * 例：青雲城, 落霞關, 碧水鎮 / Example: 青雲城, 落霞關, 碧水鎮
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 唯一地名（呼叫端應驗證唯一性）/ A unique place name (caller should verify uniqueness)
 */
export function generatePlaceName(rng: Rng): string {
  const adj = rng.pick(ADJECTIVES) ?? '青';
  const terrain = rng.pick(TERRAINS) ?? '城';
  return `${adj}${terrain}`;
}

/**
 * 產生一批唯一地名。適用於世界初始化。
 * Generate a batch of unique place names. Useful for world initialization.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param count - 要產生的名稱數 / Number of names to generate
 * @returns 唯一名稱陣列 / Array of unique names
 */
export function generatePlaceNames(rng: Rng, count: number): string[] {
  const names = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10; // 防止無限迴圈 / Prevent infinite loop

  while (names.size < count && attempts < maxAttempts) {
    names.add(generatePlaceName(rng));
    attempts++;
  }

  if (names.size < count) {
    console.warn(
      `[nameGenerator] Could only generate ${names.size}/${count} unique place names`
    );
  }

  return Array.from(names);
}
