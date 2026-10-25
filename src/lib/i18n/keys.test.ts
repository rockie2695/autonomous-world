// ============================================================================
// 每個 t('...') 都必須真的存在 — 而且兩個語系都要有
// Every t('...') key must exist — in BOTH locales
//
// 為什麼這是**讀原始碼**而不是測行為：`t()` 的 key 參數是 `string`，不是聯合型別，
// 所以一個打錯的鍵（或一個只加進一個語系的鍵）**編譯得過、測試也綠燈**，只在瀏覽器
// 裡印出原始鍵名（`translateIn` 的後備就是回傳鍵本身）。這個測試把那個類別的錯誤
// 變成紅色。
//
// Why this reads the source rather than testing behaviour: `t()` takes a plain
// `string`, not a union of keys, so a typo'd key — or a key added to one locale
// only — compiles, passes tests, and then renders the raw key in the browser
// (`translateIn`'s fallback returns the key itself). This test makes that class of
// bug red.
//
// 真實案例 / The real case: `roundSelect` was moved from `events` to `general`
// when a second panel (the round overview) grew its own dropdown. Nothing in the
// type system could notice a stale `events.roundSelect` — this scan would have.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getTranslations } from './index';

const SRC = join(__dirname, '..', '..');

/** 走訪 src 下每個 .ts/.tsx / Walk every .ts/.tsx under src */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * 收出程式裡的兩種 `t()` 呼叫：靜態鍵與帶模板前綴的動態鍵。
 * Collects the two shapes of `t()` call: static keys and dynamic ones whose
 * literal prefix can still be checked.
 *
 * - `t('general.title')` → `{ kind: 'static', key: 'general.title' }`
 * - `t(\`phases.${id}\`)` → `{ kind: 'dynamic', key: 'phases.' }`（前綴必須是
 *   字典裡的一個**節點**，因為真正的鍵是執行時才組出來的）
 *
 * The i18n module's own directory is excluded: its JSDoc contains example keys,
 * and one of them is deliberately nonexistent (the fallback test asserts it).
 */
function translationCalls(): Array<{ kind: 'static' | 'dynamic'; key: string; file: string }> {
  const calls: Array<{ kind: 'static' | 'dynamic'; key: string; file: string }> = [];
  for (const file of sourceFiles(SRC)) {
    // Windows 的 relative() 給反斜線，先正規化成正斜線再比對——否則這個排除在
    // Windows 上會靜默失效，測試開始掃自己的文件。/ Windows' relative() yields
    // backslashes; normalise before comparing, or this exclusion silently fails on
    // Windows and the test scans its own files.
    const rel = relative(SRC, file).replace(/\\/g, '/');
    // 自己的文件與說明不算呼叫 / Our own module's files are docs, not call sites
    if (rel.startsWith('lib/i18n/')) continue;
    const source = readFileSync(file, 'utf8');
    const where = rel;
    // 去掉註解再掃：說明文字裡提到 `t('events.*')` 這種例子不該算呼叫（SignalFeed
    // 的檔案頭註解就提到它）。只剝掉行註解與區塊註解，不動字串內容——這個程式碼庫
    // 的註解裡沒有任何「t(...) 寫在字串裡」的合法用法。
    //
    // Strip comments before scanning: doc prose that mentions `t('events.*')` is
    // not a call site (SignalFeed's header comment mentions exactly that). Only
    // line and block comments are removed — nothing else in this codebase legitimately
    // writes t(...) inside a string literal.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // 靜態：t('...') 或 t("...")
    for (const match of code.matchAll(/\bt\(\s*(['"])([^'"\n]+)\1/g)) {
      calls.push({ kind: 'static', key: match[2]!, file: where });
    }
    // 動態：t(`prefix.${...}`)  — 只保留第一個 ${ 之前的靜態前綴
    for (const match of code.matchAll(/\bt\(\s*`([^`$]+)\$\{/g)) {
      calls.push({ kind: 'dynamic', key: match[1]!, file: where });
    }
  }
  return calls;
}

/** 字典裡的一個路徑存在嗎（值可以是字串或節點）/ Does a dict path exist (string or node) */
function has(dict: unknown, path: string): boolean {
  let value: unknown = dict;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return false;
    value = (value as Record<string, unknown>)[part];
  }
  return true;
}

/** 收集字典裡每一片葉子的路徑 / Every leaf path in a dictionary */
function leaves(dict: unknown, prefix = ''): string[] {
  if (!dict || typeof dict !== 'object') return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(dict as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') out.push(...leaves(value, path));
    else out.push(path);
  }
  return out;
}

describe('i18n keys used in the source', () => {
  const zh = getTranslations('zh');
  const en = getTranslations('en');
  const calls = translationCalls();
  const staticCalls = calls.filter((c) => c.kind === 'static');
  const dynamicCalls = [...new Set(calls.filter((c) => c.kind === 'dynamic').map((c) => `${c.key}|${c.file}`))]
    .map((entry) => {
      const [key, file] = entry.split('|');
      return { key: key!, file: file! };
    });

  it('should find call sites to check', () => {
    // 掃不到就是這個測試自己壞了，不是世界沒有翻譯鍵 /
    // Finding nothing would mean this test is broken, not that nothing uses t()
    expect(staticCalls.length).toBeGreaterThan(100);
  });

  it('every static t() key must exist in both locales', () => {
    const missingIn = (dict: unknown, locale: string) =>
      staticCalls
        .filter((c) => !has(dict, c.key))
        .map((c) => `${c.key}  (${locale}, ${c.file})`);
    expect(missingIn(zh, 'zh'), 'missing from zh.ts').toEqual([]);
    expect(missingIn(en, 'en'), 'missing from en.ts').toEqual([]);
  });

  it('every dynamic t() prefix must match a real key stem in both locales', () => {
    // 兩種動態形狀，所以用「前綴是不是某些鍵的開頭」而不是「是不是一個節點」：
    // `t(\`phases.${id}\`)` 的前綴 `phases.` 是節點，
    // `t(\`events.cat${kind}\`)` 的前綴 `events.cat` 是**半段鍵名**（真正的鍵是
    // `events.catBattle`）。拼錯任一段都會沒有任何鍵以它開頭，這裡就抓到。
    //
    // Two dynamic shapes, so the test asks "is this prefix the start of some key"
    // rather than "is it a node": `phases.${id}` has a node prefix, while
    // `t(\`events.cat${kind}\`)` has a *partial segment* prefix (the real key is
    // `events.catBattle`). A typo in either shape leaves no key starting with it.
    for (const locale of ['zh', 'en'] as const) {
      const dict = locale === 'zh' ? zh : en;
      const stems = leaves(dict);
      const bad = dynamicCalls.filter(
        (c) => !stems.some((k) => k === c.key.replace(/\.$/, '') || k.startsWith(c.key))
      );
      expect(bad.map((c) => `${c.key}  (${locale}, ${c.file})`)).toEqual([]);
    }
  });

  it('zh and en must define the same leaves', () => {
    const zhLeaves = new Set(leaves(zh));
    const enLeaves = new Set(leaves(en));
    const onlyZh = [...zhLeaves].filter((k) => !enLeaves.has(k));
    const onlyEn = [...enLeaves].filter((k) => !zhLeaves.has(k));
    expect(onlyZh, 'in zh.ts but not en.ts').toEqual([]);
    expect(onlyEn, 'in en.ts but not zh.ts').toEqual([]);
  });
});

// 這份文件特別留到最後：它自己也在掃描範圍外，所以可以引用一個**不存在**的鍵當例子
// Kept last, outside the scan on purpose so the file can cite a nonexistent key.
