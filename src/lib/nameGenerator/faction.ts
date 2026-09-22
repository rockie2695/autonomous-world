// ============================================================================
// 勢力名稱產生器
// Faction Name Generator
// ============================================================================
// 以 3-5 字組合產生中文勢力名稱。
// Generates Chinese faction names using 3-5 character combinations.
// 例：蒼龍盟, 金鳳閣, 鐵血營, 風雷幫
// Examples: 蒼龍盟, 金鳳閣, 鐵血營, 風雷幫
//
// 勢力名稱混合以下元素：
// Factions are named with a mix of:
// - 描述性形容詞（顏色、大小、品質）/ Descriptive adjectives (color, size, quality)
// - 象徵性名詞（動物、元素、概念）/ Symbolic nouns (animals, elements, concepts)
// - 組織後綴（盟、閣、營、幫等）/ Organization suffixes (盟, 閣, 營, 幫, etc.)
// ============================================================================

import { type Rng } from '../rng';

// ─── 名稱元件 / Name Components ────────────────────────────────────────────

/** 勢力名稱的形容詞/修飾詞 / Adjectives/descriptors for faction names */
const DESCRIPTORS = [
  '蒼', '碧', '翠', '紫', '金', '銀', '赤', '白', '玄', '青',
  '鐵', '鋼', '玉', '石', '火', '水', '風', '雷', '雲', '霧',
  '龍', '鳳', '虎', '鵬', '狼', '蛇', '鷹', '熊', '豹', '蛟',
  '天', '地', '日', '月', '星', '辰', '山', '河', '海', '原',
  '烈', '剛', '柔', '玄', '奇', '神', '仙', '聖', '魔', '妖',
];

/** 接在修飾詞後的名詞 / Nouns that follow descriptors */
const NOUNS = [
  '龍', '鳳', '虎', '鵬', '狼', '蛇', '鷹', '熊', '豹', '蛟',
  '雲', '風', '雷', '電', '火', '水', '冰', '霜', '雪', '雨',
  '山', '河', '海', '原', '林', '谷', '峰', '崖', '淵', '島',
  '天', '地', '日', '月', '星', '辰', '光', '影', '曦', '暉',
  '血', '刃', '甲', '盾', '弓', '劍', '戟', '斧', '錘', '槍',
];

/** 組織類型後綴 / Organization type suffixes */
const SUFFIXES = [
  '盟',   // 聯盟 / Alliance
  '閣',   // 樓閣 / Pavilion
  '營',   // 營寨 / Camp
  '幫',   // 幫派 / Gang/Group
  '會',   // 社會 / Society
  '宗',   // 宗派 / Sect
  '門',   // 門派 / Gate/Faction
  '教',   // 教派 / Doctrine
  '國',   // 國家 / Kingdom
  '朝',   // 朝代 / Dynasty
  '軍',   // 軍隊 / Army
  '團',   // 團隊 / Corps
  '社',   // 社團 / Agency
  '堂',   // 堂口 / Hall
  '殿',   // 殿宇 / Palace
  '殿',   // 寺廟 / Temple
];

// ─── 產生器 / Generator ────────────────────────────────────────────────────

/**
 * 產生隨機中文勢力名稱。
 * Generate a random Chinese faction name.
 *
 * 格式變化（3-5 字）/ Format varies (3-5 characters):
 * - 40% 機率：[修飾詞][名詞][後綴]（3 字）—「蒼龍盟」/ 40% chance: [Descriptor][Noun][Suffix] (3 chars) — "蒼龍盟"
 * - 30% 機率：[修飾詞][名詞][名詞][後綴]（4 字）—「金龍鳳閣」/ 30% chance: [Descriptor][Noun][Noun][Suffix] (4 chars) — "金龍鳳閣"
 * - 30% 機率：[修飾詞][修飾詞][名詞][後綴]（4 字）—「蒼翠龍盟」/ 30% chance: [Descriptor][Descriptor][Noun][Suffix] (4 chars) — "蒼翠龍盟"
 * - 可選：[修飾詞][名詞][名詞][名詞][後綴]（5 字）/ Optional: [Descriptor][Noun][Noun][Noun][Suffix] (5 chars)
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 唯一勢力名稱（呼叫端應驗證唯一性）/ A unique faction name (caller should verify uniqueness)
 */
export function generateFactionName(rng: Rng): string {
  const desc = rng.pick(DESCRIPTORS) ?? '蒼';
  const noun = rng.pick(NOUNS) ?? '龍';
  const suffix = rng.pick(SUFFIXES) ?? '盟';

  const roll = rng.random();

  if (roll < 0.4) {
    // 3 字：[修飾詞][名詞][後綴] / 3 chars: [Descriptor][Noun][Suffix]
    return `${desc}${noun}${suffix}`;
  } else if (roll < 0.7) {
    // 4 字：[修飾詞][名詞][名詞][後綴] / 4 chars: [Descriptor][Noun][Noun][Suffix]
    const noun2 = rng.pick(NOUNS) ?? '虎';
    return `${desc}${noun}${noun2}${suffix}`;
  } else if (roll < 0.9) {
    // 4 字：[修飾詞][修飾詞][名詞][後綴] / 4 chars: [Descriptor][Descriptor][Noun][Suffix]
    const desc2 = rng.pick(DESCRIPTORS) ?? '金';
    return `${desc}${desc2}${noun}${suffix}`;
  } else {
    // 5 字：[修飾詞][名詞][名詞][名詞][後綴] / 5 chars: [Descriptor][Noun][Noun][Noun][Suffix]
    const noun2 = rng.pick(NOUNS) ?? '雲';
    const noun3 = rng.pick(NOUNS) ?? '風';
    return `${desc}${noun}${noun2}${noun3}${suffix}`;
  }
}

/**
 * 產生一批唯一勢力名稱。
 * Generate a batch of unique faction names.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param count - 要產生的名稱數 / Number of names to generate
 * @returns 唯一名稱陣列 / Array of unique names
 */
export function generateFactionNames(rng: Rng, count: number): string[] {
  const names = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10;

  while (names.size < count && attempts < maxAttempts) {
    names.add(generateFactionName(rng));
    attempts++;
  }

  if (names.size < count) {
    console.warn(
      `[nameGenerator] Could only generate ${names.size}/${count} unique faction names`
    );
  }

  return Array.from(names);
}
