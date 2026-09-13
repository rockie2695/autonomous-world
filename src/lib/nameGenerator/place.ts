// ============================================================================
// Place Name Generator
// ============================================================================
// Generates Chinese place names using adjective + terrain combinations.
// Examples: 青雲城, 落霞關, 碧水鎮, 風暴港
//
// The generator uses seeded RNG for reproducible names.
// ============================================================================

import { type Rng } from '../rng';

// ─── Name Components ───────────────────────────────────────────────────────

/** Adjectives describing atmosphere or appearance */
const ADJECTIVES = [
  '青', '碧', '翠', '紫', '金', '銀', '赤', '白', '黑', '玄',
  '蒼', '丹', '朱', '素', '彩', '霞', '雲', '霧', '雨', '風',
  '雷', '電', '霜', '雪', '冰', '炎', '烈', '柔', '清', '幽',
  '靜', '喧', '繁', '荒', '幽', '深', '遠', '近', '高', '低',
  '明', '暗', '曦', '暉', '影', '光', '星', '月', '日', '晨',
];

/** Terrain suffixes */
const TERRAINS = [
  '城', '鎮', '村', '關', '堡', '港', '寨', '峰', '谷', '原',
  '山', '水', '河', '湖', '海', '島', '林', '森', '沙漠', '原野',
  '隘口', '峽谷', '平原', '丘陵', '盆地', '沼澤', '綠洲', '邊塞',
  '要塞', '哨站', '驛站', '市集', '港口', '碼頭', '碼頭', '渡口',
];

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * Generate a random Chinese place name.
 *
 * Format: [Adjective][Terrain]
 * Example: 青雲城, 落霞關, 碧水鎮
 *
 * @param rng - Seeded RNG instance for reproducibility
 * @returns A unique place name (caller should verify uniqueness)
 */
export function generatePlaceName(rng: Rng): string {
  const adj = rng.pick(ADJECTIVES) ?? '青';
  const terrain = rng.pick(TERRAINS) ?? '城';
  return `${adj}${terrain}`;
}

/**
 * Generate a batch of unique place names.
 * Useful for world initialization.
 *
 * @param rng - Seeded RNG instance
 * @param count - Number of names to generate
 * @returns Array of unique names
 */
export function generatePlaceNames(rng: Rng, count: number): string[] {
  const names = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10; // Prevent infinite loop

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
