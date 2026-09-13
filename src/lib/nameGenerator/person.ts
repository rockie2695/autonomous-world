// ============================================================================
// Person Name Generator
// ============================================================================
// Generates Chinese person names using common surnames + given name characters.
// Examples: 張飛, 李白, 王雲, 趙風
//
// Uses a pool of common Chinese surnames (百家姓) and frequently used
// characters in given names. Names may repeat — the spec says not to check.
// ============================================================================

import { type Rng } from '../rng';

// ─── Name Components ───────────────────────────────────────────────────────

/**
 * Common Chinese surnames (百家姓 top 100).
 * These are the most frequent surnames in Chinese-speaking regions.
 */
const SURNAMES = [
  '王', '李', '張', '劉', '陳', '楊', '黃', '趙', '吳', '周',
  '徐', '孫', '馬', '朱', '胡', '郭', '林', '何', '高', '羅',
  '鄭', '梁', '謝', '宋', '唐', '許', '韓', '馮', '鄧', '曹',
  '彭', '曾', '蕭', '田', '董', '潘', '袁', '蔡', '蔣', '余',
  '于', '杜', '葉', '程', '魏', '蘇', '呂', '丁', '任', '盧',
  '姚', '沈', '鍾', '姜', '崔', '譚', '陸', '范', '汪', '廖',
  '石', '金', '韋', '賈', '夏', '付', '方', '鄒', '熊', '白',
  '孟', '秦', '邱', '侯', '江', '尹', '薛', '閆', '雷', '龍',
  '段', '郝', '孔', '毛', '史', '黎', '賀', '顧', '龔', '邵',
  '覃', '武', '錢', '戴', '嚴', '莫', '康', '萬', '溫', '牛',
];

/**
 * Characters commonly used in given names.
 * Selected for aesthetic and meaningful associations.
 */
const GIVEN_CHARS = [
  '飛', '雲', '風', '龍', '虎', '鵬', '華', '明', '光', '輝',
  '英', '傑', '豪', '雄', '偉', '強', '勇', '剛', '威', '武',
  '文', '德', '仁', '義', '禮', '智', '信', '忠', '孝', '廉',
  '山', '河', '海', '天', '日', '月', '星', '辰', '雷', '電',
  '春', '夏', '秋', '冬', '青', '翠', '丹', '朱', '紫', '金',
  '玉', '寶', '珍', '珠', '蘭', '梅', '竹', '松', '柏', '荷',
  '雪', '霜', '雨', '露', '霞', '煙', '霧', '嵐', '曦', '暉',
  '志', '宏', '毅', '恆', '永', '長', '久', '安', '寧', '平',
];

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * Generate a random Chinese person name.
 *
 * Format: [Surname][Given Name]
 * Most names are 2 characters (surname + 1 given char).
 * 20% chance of 3 characters (surname + 2 given chars).
 *
 * @param rng - Seeded RNG instance for reproducibility
 * @returns A random person name
 */
export function generatePersonName(rng: Rng): string {
  const surname = rng.pick(SURNAMES) ?? '王';
  const given1 = rng.pick(GIVEN_CHARS) ?? '飛';

  // 20% chance of 2-character given name
  if (rng.chance(0.2)) {
    const given2 = rng.pick(GIVEN_CHARS) ?? '雲';
    return `${surname}${given1}${given2}`;
  }

  return `${surname}${given1}`;
}

/**
 * Generate a batch of person names.
 * Names may repeat — the spec intentionally allows this.
 *
 * @param rng - Seeded RNG instance
 * @param count - Number of names to generate
 * @returns Array of names (may contain duplicates)
 */
export function generatePersonNames(rng: Rng, count: number): string[] {
  return Array.from({ length: count }, () => generatePersonName(rng));
}
