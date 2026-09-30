// ============================================================================
// 稱號元件（共用）
// Epithet Components (shared)
// ============================================================================
// 產生「兩字稱號」，供人名與勢力名共用。
// Produces a two-character epithet shared by person and faction names.
//
// 人名：霜狼·蓋爾（稱號 + 外來名）/ Person: 霜狼·蓋爾 (epithet + foreign given name)
// 勢力：霜脊議會（稱號 + 組織類型）/ Faction: 霜脊議會 (epithet + organization type)
//
// 稱號 = [首字][末字]，首字為自然／材質意象，末字為動物、地形或力量。
// An epithet is [head][tail]: the head is a natural/material image, the tail an
// animal, terrain feature, or force.
// ============================================================================

import { type Rng } from '../rng';

/** 稱號與外來名之間的分隔符 / Separator between the epithet and the foreign given name */
export const EPITHET_SEPARATOR = '·';

/**
 * 稱號首字：自然現象、材質、情緒。
 * Epithet heads — weather, material, mood.
 */
export const EPITHET_HEADS = [
  '霜', '赤', '幽', '鐵', '灰', '潮', '玄', '蒼', '金', '血', '暗', '寒',
  '炎', '碧', '紫', '墨', '烈', '狂', '寂', '冰', '雪', '白', '青', '銀',
] as const;

/**
 * 稱號末字：動物、地形、力量。
 * Epithet tails — animals, terrain, forces.
 */
export const EPITHET_TAILS = [
  '狼', '潮', '光', '壁', '鷲', '聲', '脊', '崖', '焰', '影', '刃', '雷',
  '風', '雲', '虎', '龍', '鷹', '熊', '豹', '鯨', '鯊', '峰', '海', '林',
] as const;

/** 稱號組合總數 / Total number of epithet combinations */
export const EPITHET_COUNT = EPITHET_HEADS.length * EPITHET_TAILS.length;

/**
 * 以線性索引取得稱號（供確定性掃描使用，不消耗 RNG）。
 * Get the epithet at a flat index (for the deterministic scan; consumes no RNG).
 *
 * @param index - 0 到 EPITHET_COUNT-1 的索引 / Index from 0 to EPITHET_COUNT-1
 * @returns 兩字稱號 / A two-character epithet
 */
export function epithetAt(index: number): string {
  const head = EPITHET_HEADS[Math.floor(index / EPITHET_TAILS.length) % EPITHET_HEADS.length];
  const tail = EPITHET_TAILS[index % EPITHET_TAILS.length];
  return `${head}${tail}`;
}

/**
 * 產生隨機兩字稱號。
 * Generate a random two-character epithet.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @returns 兩字稱號，例如「霜狼」/ A two-character epithet, e.g. 霜狼
 */
export function generateEpithet(rng: Rng): string {
  return epithetAt(rng.int(0, EPITHET_COUNT - 1));
}
