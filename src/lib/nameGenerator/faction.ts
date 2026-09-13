// ============================================================================
// Faction Name Generator
// ============================================================================
// Generates Chinese faction names using 3-5 character combinations.
// Examples: 蒼龍盟, 金鳳閣, 鐵血營, 風雷幫
//
// Factions are named with a mix of:
// - Descriptive adjectives (color, size, quality)
// - Symbolic nouns (animals, elements, concepts)
// - Organization suffixes (盟, 閣, 營, 幫, etc.)
// ============================================================================

import { type Rng } from '../rng';

// ─── Name Components ───────────────────────────────────────────────────────

/** Adjectives/descriptors for faction names */
const DESCRIPTORS = [
  '蒼', '碧', '翠', '紫', '金', '銀', '赤', '白', '玄', '青',
  '鐵', '鋼', '玉', '石', '火', '水', '風', '雷', '雲', '霧',
  '龍', '鳳', '虎', '鵬', '狼', '蛇', '鷹', '熊', '豹', '蛟',
  '天', '地', '日', '月', '星', '辰', '山', '河', '海', '原',
  '烈', '剛', '柔', '玄', '奇', '神', '仙', '聖', '魔', '妖',
];

/** Nouns that follow descriptors */
const NOUNS = [
  '龍', '鳳', '虎', '鵬', '狼', '蛇', '鷹', '熊', '豹', '蛟',
  '雲', '風', '雷', '電', '火', '水', '冰', '霜', '雪', '雨',
  '山', '河', '海', '原', '林', '谷', '峰', '崖', '淵', '島',
  '天', '地', '日', '月', '星', '辰', '光', '影', '曦', '暉',
  '血', '刃', '甲', '盾', '弓', '劍', '戟', '斧', '錘', '槍',
];

/** Organization type suffixes */
const SUFFIXES = [
  '盟',   // Alliance
  '閣',   // Pavilion
  '營',   // Camp
  '幫',   // Gang/Group
  '會',   // Society
  '宗',   // Sect
  '門',   // Gate/Faction
  '教',   // Doctrine
  '國',   // Kingdom
  '朝',   // Dynasty
  '軍',   // Army
  '團',   // Corps
  '社',   // Agency
  '堂',   // Hall
  '殿',   // Palace
  '殿',   // Temple
];

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * Generate a random Chinese faction name.
 *
 * Format varies (3-5 characters):
 * - 40% chance: [Descriptor][Noun][Suffix] (3 chars) — "蒼龍盟"
 * - 30% chance: [Descriptor][Noun][Noun][Suffix] (4 chars) — "金龍鳳閣"
 * - 30% chance: [Descriptor][Descriptor][Noun][Suffix] (4 chars) — "蒼翠龍盟"
 * - Optional: [Descriptor][Noun][Noun][Noun][Suffix] (5 chars)
 *
 * @param rng - Seeded RNG instance for reproducibility
 * @returns A unique faction name (caller should verify uniqueness)
 */
export function generateFactionName(rng: Rng): string {
  const desc = rng.pick(DESCRIPTORS) ?? '蒼';
  const noun = rng.pick(NOUNS) ?? '龍';
  const suffix = rng.pick(SUFFIXES) ?? '盟';

  const roll = rng.random();

  if (roll < 0.4) {
    // 3 chars: [Descriptor][Noun][Suffix]
    return `${desc}${noun}${suffix}`;
  } else if (roll < 0.7) {
    // 4 chars: [Descriptor][Noun][Noun][Suffix]
    const noun2 = rng.pick(NOUNS) ?? '虎';
    return `${desc}${noun}${noun2}${suffix}`;
  } else if (roll < 0.9) {
    // 4 chars: [Descriptor][Descriptor][Noun][Suffix]
    const desc2 = rng.pick(DESCRIPTORS) ?? '金';
    return `${desc}${desc2}${noun}${suffix}`;
  } else {
    // 5 chars: [Descriptor][Noun][Noun][Noun][Suffix]
    const noun2 = rng.pick(NOUNS) ?? '雲';
    const noun3 = rng.pick(NOUNS) ?? '風';
    return `${desc}${noun}${noun2}${noun3}${suffix}`;
  }
}

/**
 * Generate a batch of unique faction names.
 *
 * @param rng - Seeded RNG instance
 * @param count - Number of names to generate
 * @returns Array of unique names
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
