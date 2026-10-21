// ============================================================================
// 事件寫入順序 — 佔領必須排在行政官交接之前
// Event write order — a capture must be recorded before the seat handover
//
// 為什麼這是**讀原始碼**而不是測行為：測試環境是 `node`，沒有資料庫，而這些
// `await` 是循序的、沒有競爭，所以它們在資料庫裡的先後**完全**由原始碼裡的陳述
// 順序決定。沒有資料庫就沒有行為可測——唯一能被驗證的不變量就是「哪一句寫在
// 前面」。這跟 `territoryLabelPlacement.test.ts` 守住一段 CSS 宣告是同一種做法。
//
// Why this reads the source rather than testing behaviour: the test environment is
// `node` with no database, and these `await`s are sequential with no race, so their
// order in the database is decided *entirely* by the order of the statements in the
// file. With no database there is no behaviour to exercise — the only checkable
// invariant is which statement comes first. Same approach as
// `territoryLabelPlacement.test.ts`, which guards a CSS declaration for exactly the
// same reason.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'phases', 'battle.ts'), 'utf8');

describe('battle event write order', () => {
  it('should record PLACE_CAPTURED before handing over the administrator seat', () => {
    // 讀者回報的錯誤：日誌讀成「覃雲 被任命為 炫灰濱 的行政官」**然後才**
    // 「覃雲 佔領了 炫灰濱」。先被任命、後佔領——時間線是倒的，而且沒有任何機制
    // 會事後修正資料庫裡既有的先後。
    //
    // The bug a reader reported: the log read "appointed administrator of X"
    // *before* "captured X". Appointed first, captured second — a backwards
    // timeline, and nothing downstream can repair the order already stored.
    // 佔領與行政官交接現在收在一個 helper（transferAdminSeat：先免職舊主、再任命
    // 佔領者）裡，所以不變量搬到**呼叫點**上：三個佔領點（自由佔領、圍攻攻破、
    // 戰爭輪攻陷）的每一次交接都必須排在 PLACE_CAPTURED 之後，而且要貼著它——
    // 同一段佔領邏輯的相鄰語句，不是檔案裡隨便某場舊戰爭的佔領。
    //
    // The capture and the seat handover now live in one helper (transferAdminSeat:
    // revoke the old owner's admin, then appoint the capturer), so the invariant
    // moved to the **call sites**: all three capture points (the free capture, the
    // breached siege, the war-round capture) must hand the seat over *after* their
    // PLACE_CAPTURED, and right next to it — adjacent statements of the same
    // capture logic, not some unrelated earlier war's capture.
    const captures = [...source.matchAll(/type: 'PLACE_CAPTURED'/g)].map((m) => m.index!);
    const handovers = [...source.matchAll(/await transferAdminSeat\(/g)].map((m) => m.index!);
    expect(captures.length, 'captures should exist').toBeGreaterThan(0);
    expect(handovers.length, 'seat handovers should exist').toBeGreaterThan(0);
    for (const handover of handovers) {
      const before = captures.filter((cp) => cp < handover);
      expect(
        before.length,
        'every seat handover must be preceded by a PLACE_CAPTURED — the place is captured first, and only then can its capturer be appointed'
      ).toBeGreaterThan(0);
      const nearest = before[before.length - 1]!;
      expect(handover - nearest, 'the handover must sit right after its capture').toBeLessThan(600);
    }
  });

  it('should route every seat change through the adminAssign helpers', () => {
    // 佔領路徑不得直接寫 Place.administratorId——免職與任命的規則（帳本、事件、
    // 冷卻錨點、席位唯一約束）都住在 adminAssign.ts；helper 自己必須呼叫
    // revokeAdmin（免職舊主）與 grantAdmin（任命佔領者）。
    //
    // A capture path must never write Place.administratorId directly — the revoke
    // and grant rules (the ledger, the events, the cooldown anchor, the seat's
    // unique constraint) live in adminAssign.ts; the helper itself must call
    // revokeAdmin (the old owner's seat) and grantAdmin (the capturer's).
    expect(source).toContain('await grantAdmin(');
    expect(source).toContain('await revokeAdmin(');
    // 防禦性：不允許「直接把 administratorId 寫成某個角色」的捷徑 /
    // Defensive: no shortcut that assigns administratorId straight to a character
    expect(source).not.toMatch(/administratorId:\s*(newLeader|leader)\.id/);
  });
});
