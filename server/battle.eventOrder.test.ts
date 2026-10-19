// ============================================================================
// 事件寫入順序 — 佔領必須排在任命之前
// Event write order — a capture must be recorded before the appointment
//
// 為什麼這是**讀原始碼**而不是測行為：測試環境是 `node`，沒有資料庫，而這兩個
// `await` 是循序的、沒有競爭，所以它們在資料庫裡的先後**完全**由原始碼裡的陳述順序
// 決定。沒有資料庫就沒有行為可測——唯一能被驗證的不變量就是「哪一句寫在前面」。
// 這跟 `territoryLabelPlacement.test.ts` 守住一段 CSS 宣告是同一種做法。
//
// Why this reads the source rather than testing behaviour: the test environment is `node`
// with no database, and these two `await`s are sequential with no race, so their order in
// the database is decided *entirely* by the order of the statements in the file. With no
// database there is no behaviour to exercise — the only checkable invariant is which
// statement comes first. Same approach as `territoryLabelPlacement.test.ts`, which guards a
// CSS declaration for exactly the same reason.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'phases', 'battle.ts'), 'utf8');

describe('battle event write order', () => {
  it('should record PLACE_CAPTURED before granting the administrator', () => {
    // 讀者回報的錯誤：日誌讀成「覃雲 被任命為 炫灰濱 的行政官」**然後才**
    // 「覃雲 佔領了 炫灰濱」。先被任命、後佔領——時間線是倒的，而且沒有任何機制會
    // 事後修正資料庫裡既有的先後。
    //
    // The bug a reader reported: the log read "appointed administrator of X" *before*
    // "captured X". Appointed first, captured second — a backwards timeline, and nothing
    // downstream can repair the order already stored.
    const branch = source.indexOf('if (captured)');
    expect(branch, 'the capture branch should still exist').toBeGreaterThan(-1);

    const capture = source.indexOf("type: 'PLACE_CAPTURED'", branch);
    const grant = source.indexOf('await grantAdmin({', branch);

    expect(capture, 'PLACE_CAPTURED should be written inside the capture branch').toBeGreaterThan(-1);
    expect(grant, 'the capture branch should still grant the administrator').toBeGreaterThan(-1);

    // 核心不變量 / The load-bearing invariant
    expect(
      capture,
      'PLACE_CAPTURED must be written BEFORE grantAdmin — the place is captured first, ' +
        'and only then can its capturer be appointed administrator of it'
    ).toBeLessThan(grant);
  });

  it('should keep the appointment inside the capture branch', () => {
    // 防禦性：若有人把 grantAdmin 移到 `if (captured)` 之外，佔領者可能還沒拿下這個地方
    // 就先拿到它的行政官。上面那條只比對相對位置，抓不到這種情況。
    //
    // Defensive: if someone moves `grantAdmin` out of the `if (captured)` block, the
    // capturer could hold the administrator seat of a place they do not yet own. The test
    // above compares relative positions and cannot catch that, so this one checks scope.
    const branch = source.indexOf('if (captured)');
    // 這個分支以 `captured` 區塊結束；用下一個頂層註解分隔線當終點 /
    // This block ends at the next top-level section divider
    const branchEnd = source.indexOf('// ── B.', branch);
    expect(branchEnd, 'the capture branch should end before section B').toBeGreaterThan(branch);

    const grant = source.indexOf('await grantAdmin({', branch);
    expect(grant).toBeLessThan(branchEnd);
  });
});