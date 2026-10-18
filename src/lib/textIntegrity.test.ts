// ============================================================================
// 文字完整性 / Text integrity
// ----------------------------------------------------------------------------
// 這個專案的註解與文件是**中英雙語**的，而它們是唯一會經過 shell 寫入的原始碼。
// 一個非常容易犯、而且**不會被任何編碼檢查抓到**的錯：把某個字換成**另一個同樣合法的
// 漢字**。
//
// This project's comments and docs are bilingual, and they are the only source that ever gets
// written through a shell. The failure mode that matters here is a character being replaced by
// *another valid character of the same script* — which no encoding check will ever catch,
// because nothing about the byte stream is invalid.
//
// 真實案例：`顏色`（顏 = U+984F, "colour"）被寫成了 `題色`（題 = U+984C, "question"）。
// `題色` 不是中文詞，而同一行的英文卻完全正確（"/ Check 2 hops for color conflicts"）。
// 真正的訊號是：**中文不成字、英文卻對**。掃 `U+FFFD` 完全抓不到，因為兩個字都是合法碼位。
//
// The real case: `顏色` ("colour") was written as `題色` ("question"). `題色` is not a Chinese
// word, while the English on the same line stayed perfectly correct. The actual tell is
// "nonsense Chinese, correct English" — and scanning for `U+FFFD` catches none of it, because
// both characters are valid code points.
//
// 這個檔案把已知的壞字串釘死。它**不是**通用檢查：通用檢查抓不到這一類錯誤。能抓到的只有
// 這種「把某個已知的壞序列釘死」的方式。
//
// This file pins the known-bad sequences. It is deliberately **not** a general validator,
// because no general validator catches this class of bug. What catches it is exactly this:
// pinning a specific sequence someone already got wrong.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 從 repo 根目錄掃描起算 / scanned from the repo root */
const ROOT = process.cwd();

/** 會掃描的目錄 / directories to scan */
const SCAN_DIRS = ['src', 'server', 'prisma'];

/** 會一併掃描的根目錄檔案 / root-level files to scan too */
const SCAN_FILES = ['README.md', 'README.zh-TW.md', 'TECH.md', 'AGENTS.md'];

/** 一律跳過 / never walked into */
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'coverage',
  '.codegraph',
  '.turbo',
  '.vercel',
]);

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.md', '.json', '.css', '.prisma']);

/**
 * 已知的壞字串，全部用**碼位**寫出來。
 *
 * 刻意不用字面：這個測試檔本身也是雙語註解，而它要檢查的正是「字面被換掉」這件事。
 * 寫成 `'\u984C\u8272'` 就永遠不會被同一個錯誤改掉 —— 測試不會和它的目標一起壞掉。
 *
 * Every known-bad sequence, written as **code points**.
 *
 * Deliberately not as literals: this file carries bilingual comments too, and the very thing it
 * checks is "a literal got swapped". Writing `'\u984C\u8272'` means it cannot be broken by the
 * same mistake — a guard must not be able to fail alongside the thing it guards.
 */
const KNOWN_BAD: ReadonlyArray<{ bad: string; right: string; note: string }> = [
  {
    // 題色 — 題 means "question/examination"; it is not part of any word meaning "colour"
    bad: '\u984c\u8272',
    right: '\u984f\u8272',
    note: 'colour',
  },
];

/**
 * 這個檔案**自己**不掃描。
 *
 * This file excludes **itself**.
 *
 * 它的註解必須**寫出**那個壞字串當範例，所以它一定含有那個字串。若不排除，它會找出自己、
 * 每次執行都紅，然後有人會把它關掉 —— 一個永遠失敗的守衛比沒有守衛更糟。
 *
 * Its comment has to *name* the corrupted form as an example, so it necessarily contains it.
 * Without this exclusion it finds itself, fails every run, and someone eventually turns it off —
 * a guard that always fails is worse than no guard.
 */
const SELF = 'textIntegrity.test.ts';

/**
 * 逐行的例外標記。文件必須能**引用**那個壞字串 —— 否則沒辦法說明它是什麼、也不能教別人
 * 避開它。而整份文件都不能排除（那等於放棄整份文件），所以例外必須細到**行**。
 *
 * A per-line opt-out. The documentation has to be able to *quote* the corrupted form — otherwise
 * there is no way to say what it is, let alone teach anyone to avoid it. Excluding the whole
 * file would be no good either (that is just abandoning it), so the exemption has to be as fine
 * grained as a line.
 *
 * 這是**刻意可見**的：要通過檢查就必須寫下這幾個字，所以每一個例外都會出現在 `git blame`
 * 裡。一個看不見的後門會變成大家隨手關掉測試的理由。
 *
 * It is **visible on purpose**: passing requires typing the marker, so every exemption shows up
 * in `git blame`. An invisible escape hatch is how a guard quietly stops being a guard.
 */
const ALLOW_MARKER = 'text-integrity:allow-example';

/** 收集所有要檢查的文字檔案 / collect every text file in scope */
function collectFiles(): string[] {
  const out: string[] = [];
  for (const name of SCAN_FILES) {
    try {
      statSync(join(ROOT, name));
      out.push(name);
    } catch {
      // a doc that does not exist in this checkout is simply not scanned
    }
  }
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      if (entry === SELF) continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        walk(full);
        continue;
      }
      const dot = entry.lastIndexOf('.');
      const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : '';
      if (TEXT_EXTENSIONS.has(ext)) out.push(full);
    }
  };
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir));
  return out;
}

describe('bilingual text integrity', () => {
  const files = collectFiles();

  it('should actually find files to check', () => {
    // A scan that silently matched nothing would pass every assertion below while proving
    // nothing, so the scope is asserted first.
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(KNOWN_BAD.map((k) => [k.bad, k.right, k.note] as const))(
    'should never contain the corrupted form of %s',
    (bad, right, note) => {
      // The pair must actually differ, or this test would be asserting that a sequence is
      // absent while comparing it against itself.
      expect(bad).not.toBe(right);
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        // Offenders are reported per line, and a line carrying the marker is exempt — the docs
        // have to be able to quote the corrupted form in order to explain it.
        const lineStarts: number[] = [];
        for (let i = 0; i < text.length; i++) {
          if (i === 0 || text.charCodeAt(i - 1) === 10) lineStarts.push(i);
        }
        const lineOf = (index: number): number => {
          let lo = 0;
          let hi = lineStarts.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= index) lo = mid;
            else hi = mid - 1;
          }
          return lo;
        };
        let at = text.indexOf(bad);
        while (at !== -1) {
          const li = lineOf(at);
          // The marker may sit anywhere on the line, including after the match, so the whole
          // line is examined rather than only the span up to the match.
          const lineEnd =
            li + 1 < lineStarts.length ? lineStarts[li + 1] : text.length;
          if (!text.slice(lineStarts[li], lineEnd).includes(ALLOW_MARKER)) {
            offenders.push(`${file}:${li + 1}`);
          }
          at = text.indexOf(bad, at + bad.length);
        }
      }
      expect(offenders, `corrupted "${note}" found at:\n${offenders.join('\n')}`).toEqual([]);
    }
  );

  it('should contain no Unicode replacement characters', () => {
    // The cheap check, kept because it catches a *different* failure: a character that never
    // survived the write at all.
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      let at = text.indexOf('\ufffd');
      while (at !== -1) {
        const line = text.slice(0, at).split('\n').length;
        offenders.push(`${file}:${line}`);
        at = text.indexOf('\ufffd', at + 1);
      }
    }
    expect(offenders, `U+FFFD found at:\n${offenders.join('\n')}`).toEqual([]);
  });
});