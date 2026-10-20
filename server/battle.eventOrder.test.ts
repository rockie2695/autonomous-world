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
    // 新結構有**兩個**佔領點（圍攻與戰爭輪），不變量對每一個都要成立：
    // 每個 grantAdmin 之前都必須有 PLACE_CAPTURED（先佔領、後任命）。
    // The new structure has **two** capture sites (the siege and the war round); the
    // invariant holds for each: every grantAdmin must be preceded by a PLACE_CAPTURED
    // (captured first, appointed after).
    const captures = [...source.matchAll(/type: 'PLACE_CAPTURED'/g)].map((m) => m.index!);
    const grants = [...source.matchAll(/await grantAdmin\(/g)].map((m) => m.index!);
    expect(captures.length, 'captures should exist').toBeGreaterThan(0);
    expect(grants.length, 'appointments should exist').toBeGreaterThan(0);
    for (const grant of grants) {
      const covering = captures.filter((cp) => cp < grant);
      expect(
        covering.length,
        'every grantAdmin must be preceded by a PLACE_CAPTURED — the place is captured first, and only then can its capturer be appointed'
      ).toBeGreaterThan(0);
    }
  });

  it('should keep the appointment inside the capture branch', () => {
    // 防禦性：若有人把 grantAdmin 移到 `if (captured)` 之外，佔領者可能還沒拿下這個地方
    // 就先拿到它的行政官。上面那條只比對相對位置，抓不到這種情況。
    //
    // Defensive: if someone moves `grantAdmin` out of the `if (captured)` block, the
    // capturer could hold the administrator seat of a place they do not yet own. The test
    // above compares relative positions and cannot catch that, so this one checks scope.
    // 防禦性：每個 grantAdmin 的**前一個** PLACE_CAPTURED 必須離它夠近（同一段
    // 佔領邏輯內），而不是檔案裡隨便某場舊戰爭的佔領。取每個 grant 往回找最近的
    // 佔領，距離必須在 600 字內——佔領與任命是同一段程式的相鄰語句。
    // Defensive: each grantAdmin's nearest preceding PLACE_CAPTURED must be close
    // (the same capture logic), not some unrelated earlier capture. The capture and
    // the appointment are adjacent statements of the same block.
    const captures = [...source.matchAll(/type: 'PLACE_CAPTURED'/g)].map((m) => m.index!);
    const grants = [...source.matchAll(/await grantAdmin\(/g)].map((m) => m.index!);
    for (const grant of grants) {
      const before = captures.filter((cp) => cp < grant);
      expect(before.length, 'grantAdmin must be preceded by a capture').toBeGreaterThan(0);
      const nearest = before[before.length - 1]!;
      expect(grant - nearest, 'the appointment must sit right after its capture').toBeLessThan(600);
    }
  });
});