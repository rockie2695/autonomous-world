// ============================================================================
// 人名產生器
// Person Name Generator
// ============================================================================
// 產生中文人名，共兩種風格 / Generates Chinese person names in two styles:
// - 傳統 / classic：「張飛」「李白」（姓 + 名）— (surname + given name)
// - 稱號 / epithet：「霜狼·蓋爾」（稱號 + 外來名）— (epithet + foreign given name)
//
// 兩種風格依 CONFIG.PERSON_EPITHET_NAME_RATE 混合出現。
// The two styles are mixed according to CONFIG.PERSON_EPITHET_NAME_RATE.
//
// 使用常見中文姓氏（百家姓）與名字中常用字的字庫。
// Uses a pool of common Chinese surnames (百家姓) and frequently used
// 名稱可能重複 — 規格指出不需檢查。characters in given names. Names may repeat — the spec says not to check.
// ============================================================================

import { type Rng } from '../rng';
import { CONFIG } from '../gameConfig';
import {
  EPITHET_SEPARATOR,
  EPITHET_COUNT,
  epithetAt,
  generateEpithet,
} from './epithet';

// ─── 名稱元件 / Name Components ────────────────────────────────────────────

/**
 * 常見中文姓氏（百家姓前 100）。
 * Common Chinese surnames (百家姓 top 100).
 * 這些是華語地區最常見的姓氏。These are the most frequent surnames in Chinese-speaking regions.
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
 * 名字中常用的字。
 * Characters commonly used in given names.
 * 精選具美感與意涵關聯的用字。Selected for aesthetic and meaningful associations.
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

/**
 * 稱號風格的外來名（皆為兩字音譯）。
 * Foreign given names for the epithet style (all two characters, transliterated).
 * 例：蓋爾, 卡恩, 薇拉 / Examples: 蓋爾, 卡恩, 薇拉
 */
const FOREIGN_GIVEN_NAMES = [
  '蓋爾', '卡恩', '薇拉', '索恩', '安卡', '莉安', '諾亞', '伊芙',
  '艾琳', '賽恩', '妮可', '維克', '萊昂', '伊娃', '奧利', '芬妮',
  '艾德', '凱文', '洛恩', '瑪琳', '蒂亞', '希勒', '羅根', '布蘭',
] as const;

// ─── 產生器 / Generator ────────────────────────────────────────────────────

/**
 * 產生「稱號·外來名」風格的人名。
 * Generate a person name in the "[epithet]·[foreign name]" style.
 *
 * 格式：[稱號][·][外來名] — 例「霜狼·蓋爾」
 * Format: [Epithet][·][Foreign name] — e.g. 霜狼·蓋爾
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 稱號風格人名 / An epithet-style person name
 */
export function generateEpithetPersonName(rng: Rng): string {
  const epithet = generateEpithet(rng);
  const given = rng.pick([...FOREIGN_GIVEN_NAMES]) ?? '蓋爾';
  return `${epithet}${EPITHET_SEPARATOR}${given}`;
}

/**
 * 產生隨機中文人名（兩種風格混合）。
 * Generate a random Chinese person name (mixing both styles).
 *
 * 格式 / Formats:
 * - 稱號風格（機率 CONFIG.PERSON_EPITHET_NAME_RATE）：[稱號]·[外來名] —「霜狼·蓋爾」
 * - 傳統風格：[姓][名]（2 字）或 [姓][名][名]（3 字，20% 機率）—「張飛」「王雲飛」
 *
 * @param rng - 用於可重現性的種子 RNG 實例 / Seeded RNG instance for reproducibility
 * @returns 隨機人名 / A random person name
 */
export function generatePersonName(rng: Rng): string {
  // 稱號風格 / Epithet style
  if (rng.chance(CONFIG.PERSON_EPITHET_NAME_RATE)) {
    return generateEpithetPersonName(rng);
  }

  const surname = rng.pick(SURNAMES) ?? '王';
  const given1 = rng.pick(GIVEN_CHARS) ?? '飛';

  // 20% 機率為 2 字名字 / 20% chance of 2-character given name
  if (rng.chance(0.2)) {
    const given2 = rng.pick(GIVEN_CHARS) ?? '雲';
    return `${surname}${given1}${given2}`;
  }

  return `${surname}${given1}`;
}

/**
 * 產生一批人名。名稱可能重複 — 規格刻意允許。
 * Generate a batch of person names. Names may repeat — the spec intentionally allows this.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param count - 要產生的名稱數 / Number of names to generate
 * @returns 名稱陣列（可能含重複）/ Array of names (may contain duplicates)
 */
export function generatePersonNames(rng: Rng, count: number): string[] {
  return Array.from({ length: count }, () => generatePersonName(rng));
}

/**
 * 產生不與 taken 撞名的人名；隨機嘗試 64 次失敗後改以確定性掃描
 * 兩個名稱空間：傳統 [姓][名]（8,000 種）與稱號 [稱號]·[外來名]（13,824 種），
 * 兩者都耗盡時回傳 null。
 * Generate a person name not present in `taken`. After 64 random attempts it
 * falls back to a deterministic scan over both name spaces — classic
 * [Surname][Given] (8,000) and epithet [Epithet]·[Foreign] (13,824) — returning
 * null when both are exhausted.
 *
 * 空 taken 時第一個隨機嘗試即成功，RNG 消耗與 generatePersonName 相同。
 * With an empty `taken` the first random attempt succeeds, so RNG consumption
 * matches generatePersonName exactly.
 *
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @param taken - 已佔用的名稱集合 / Set of names already in use
 * @returns 唯一人名，或 null（空間耗盡）/ A unique person name, or null if exhausted
 */
export function generateUniquePersonName(
  rng: Rng,
  taken: ReadonlySet<string>
): string | null {
  // 隨機快速路徑 / Fast random path
  for (let attempt = 0; attempt < 64; attempt++) {
    const name = generatePersonName(rng);
    if (!taken.has(name)) return name;
  }

  // 確定性掃描 1：從隨機起點走過全部傳統 [姓][名] 組合
  // Deterministic scan 1: from a random start over every classic
  // [Surname][Given] combination
  const givenCount = GIVEN_CHARS.length;
  const classicTotal = SURNAMES.length * givenCount;
  const start = rng.int(0, classicTotal - 1);
  for (let i = 0; i < classicTotal; i++) {
    const idx = (start + i) % classicTotal;
    const surname = Math.floor(idx / givenCount);
    const given = idx % givenCount;
    const name = `${SURNAMES[surname]}${GIVEN_CHARS[given]}`;
    if (!taken.has(name)) return name;
  }

  // 確定性掃描 2：稱號空間 [稱號]·[外來名]
  // Deterministic scan 2: the epithet space [Epithet]·[Foreign name]
  const foreignCount = FOREIGN_GIVEN_NAMES.length;
  const epithetTotal = EPITHET_COUNT * foreignCount;
  const epithetStart = rng.int(0, epithetTotal - 1);
  for (let i = 0; i < epithetTotal; i++) {
    const idx = (epithetStart + i) % epithetTotal;
    const epithet = epithetAt(Math.floor(idx / foreignCount));
    const given = FOREIGN_GIVEN_NAMES[idx % foreignCount];
    const name = `${epithet}${EPITHET_SEPARATOR}${given}`;
    if (!taken.has(name)) return name;
  }
  return null;
}
