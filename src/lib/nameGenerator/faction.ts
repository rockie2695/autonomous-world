// ============================================================================
// 勢力名稱產生器
// Faction Name Generator
// ============================================================================
// 產生中文勢力名稱，共兩種風格 / Generates Chinese faction names in two styles:
// - 傳統 / classic：「蒼龍盟」（修飾詞 + 名詞 + 單字後綴）
// - 稱號 / epithet：「霜脊議會」（兩字稱號 + 兩字組織類型）
//
// 兩種風格依 CONFIG.FACTION_EPITHET_NAME_RATE 混合出現。
// The two styles are mixed according to CONFIG.FACTION_EPITHET_NAME_RATE.
//
// 傳統風格混合以下元素：
// The classic style mixes these elements:
// - 描述性形容詞（顏色、大小、品質）/ Descriptive adjectives (color, size, quality)
// - 象徵性名詞（動物、元素、概念）/ Symbolic nouns (animals, elements, concepts)
// - 組織後綴（盟、閣、營、幫等）/ Organization suffixes (盟, 閣, 營, 幫, etc.)
// ============================================================================

import { type Rng } from '../rng';
import { CONFIG } from '../gameConfig';
import { EPITHET_COUNT, epithetAt, generateEpithet } from './epithet';

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

/**
 * 稱號風格的組織類型（皆為兩字）。
 * Organization types for the epithet style (all two characters).
 * 例：議會, 軍團, 聯邦 / Examples: 議會, 軍團, 聯邦
 */
const ORG_TYPES = [
  '議會', '軍團', '商盟', '聯邦', '王庭', '神殿',
  '教團', '城邦', '商團', '騎團', '劍盟', '血盟',
] as const;

// ─── 產生器 / Generator ────────────────────────────────────────────────────

/**
 * 產生「稱號 + 組織類型」風格的勢力名稱。
 * Generate a faction name in the "[epithet][organization type]" style.
 *
 * 格式：[稱號][組織類型] — 例「霜脊議會」
 * Format: [Epithet][Organization type] — e.g. 霜脊議會
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 稱號風格勢力名稱 / An epithet-style faction name
 */
export function generateEpithetFactionName(rng: Rng): string {
  const epithet = generateEpithet(rng);
  const org = rng.pick([...ORG_TYPES]) ?? '議會';
  return `${epithet}${org}`;
}

/**
 * 產生隨機中文勢力名稱（兩種風格混合）。
 * Generate a random Chinese faction name (mixing both styles).
 *
 * 格式變化 / Formats:
 * - 稱號風格（機率 CONFIG.FACTION_EPITHET_NAME_RATE）：[稱號][組織類型]（4 字）—「霜脊議會」
 * - 傳統風格（3-5 字）：
 *   - 40%：[修飾詞][名詞][後綴]（3 字）—「蒼龍盟」
 *   - 30%：[修飾詞][名詞][名詞][後綴]（4 字）—「金龍鳳閣」
 *   - 20%：[修飾詞][修飾詞][名詞][後綴]（4 字）—「蒼翠龍盟」
 *   - 10%：[修飾詞][名詞][名詞][名詞][後綴]（5 字）—「蒼龍鳳雲閣」
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 隨機勢力名稱（呼叫端應驗證唯一性）/ A random faction name (caller should verify uniqueness)
 */
export function generateFactionName(rng: Rng): string {
  // 稱號風格 / Epithet style
  if (rng.chance(CONFIG.FACTION_EPITHET_NAME_RATE)) {
    return generateEpithetFactionName(rng);
  }

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

/**
 * 產生不與 taken 撞名的勢力名稱；隨機嘗試 64 次失敗後改以確定性掃描
 * 兩個名稱空間：傳統 [修飾詞][名詞][後綴]（約 40,000 種）與稱號 [稱號][組織類型]
 * （6,912 種），兩者都耗盡時回傳 null。
 * Generate a faction name not present in `taken`. After 64 random attempts it
 * falls back to a deterministic scan over both name spaces — classic
 * [Descriptor][Noun][Suffix] (~40,000) and epithet [Epithet][Org type] (6,912) —
 * returning null when both are exhausted.
 *
 * 空 taken 時第一個隨機嘗試即成功，RNG 消耗與 generateFactionName 相同。
 * With an empty `taken` the first random attempt succeeds, so RNG consumption
 * matches generateFactionName exactly.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param taken - 已佔用的名稱集合 / Set of names already in use
 * @returns 唯一勢力名稱，或 null（空間耗盡）/ A unique faction name, or null if exhausted
 */
export function generateUniqueFactionName(
  rng: Rng,
  taken: ReadonlySet<string>
): string | null {
  // 隨機快速路徑 / Fast random path
  for (let attempt = 0; attempt < 64; attempt++) {
    const name = generateFactionName(rng);
    if (!taken.has(name)) return name;
  }

  // 確定性掃描 1：從隨機起點走過全部傳統 [修飾詞][名詞][後綴] 組合
  // Deterministic scan 1: from a random start over every classic
  // [Descriptor][Noun][Suffix] combination
  const nounCount = NOUNS.length;
  const suffixCount = SUFFIXES.length;
  const total = DESCRIPTORS.length * nounCount * suffixCount;
  const start = rng.int(0, total - 1);
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const desc = Math.floor(idx / (nounCount * suffixCount));
    const rem = idx % (nounCount * suffixCount);
    const noun = Math.floor(rem / suffixCount);
    const suffix = rem % suffixCount;
    const name = `${DESCRIPTORS[desc]}${NOUNS[noun]}${SUFFIXES[suffix]}`;
    if (!taken.has(name)) return name;
  }

  // 確定性掃描 2：稱號空間 [稱號][組織類型]
  // Deterministic scan 2: the epithet space [Epithet][Organization type]
  const orgCount = ORG_TYPES.length;
  const epithetTotal = EPITHET_COUNT * orgCount;
  const epithetStart = rng.int(0, epithetTotal - 1);
  for (let i = 0; i < epithetTotal; i++) {
    const idx = (epithetStart + i) % epithetTotal;
    const epithet = epithetAt(Math.floor(idx / orgCount));
    const org = ORG_TYPES[idx % orgCount];
    const name = `${epithet}${org}`;
    if (!taken.has(name)) return name;
  }
  return null;
}
