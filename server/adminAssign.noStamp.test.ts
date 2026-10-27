// ============================================================================
// 搬 seat 的清空不打冷卻錨點 — 讀原始碼的不變量
// Seat-clearing (a seat *moves*) must NOT stamp the cooldown anchor
//
// 為什麼這是**讀原始碼**而不是測行為：測試環境是 `node`、沒有資料庫，而
// `grantAdminTx` 的兩個 `place.update` 是循序 await、沒有競爭，它們寫進資料庫的
// 欄位完全由原始碼裡的 `data:` 物件決定。同一種做法：`battle.eventOrder.test.ts`。
//
// Why this reads the source rather than testing behaviour: the test environment is
// `node` with no database, and `grantAdminTx`'s two `place.update`s are sequential
// awaits with no race — what they write is decided entirely by the `data:` objects in
// the file. Same approach as `battle.eventOrder.test.ts`.
//
// 規則本身的理由（写了它防止「顺手補回去」）/ The rule's own rationale (written down
// so it is not "helpfully" reintroduced): when a leader takes a seat at a new place,
// the seat-clearing vacates his OLD place. Nothing was compared and nothing was fought
// there — the administrator simply carried the post away. `assignAdmins` skips a place
// while `round - adminChangedRound < ADMIN_CHANGE_COOLDOWN_ROUNDS` and its `where`
// filter reads **only** `adminChangedRound`, so stamping the old place would freeze an
 // empty place for ten rounds with its 40% administrator share unpocketed.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'adminAssign.ts'), 'utf8');

describe('adminAssign — seat-clearing stamps no cooldown anchor', () => {
  it('the vacating write clears administratorId only', () => {
    // 搬 seat 的清空寫入 only 清 administratorId；adminChangedRound 一度被連帶寫入，
    // 這個字串回來就是回歸 / The vacating write clears administratorId only;
    // adminChangedRound used to ride along, and this string returning IS the regression
    expect(source.includes('data: { administratorId: null, adminChangedRound: round }')).toBe(false);
    expect(source.includes('data: { administratorId: null }')).toBe(true);
  });

  it("the NEW place's grant still stamps the anchor", () => {
    // 冷卻防的是「同一地反覆換帥」，新地真的換了領導，所以照樣打點 /
    // The cooldown guards thrash at one place; the NEW place really changed leaders,
    // so its anchor stays stamped
    expect(
      source.includes('data: { administratorId: char.id, adminChangedRound: round }')
    ).toBe(true);
  });

  it('the vacating write still sits inside grantAdminTx, before the grant', () => {
    // 兩個寫入的相對順序保留（先清後授，唯一約束靠前者先行）/
    // The two writes keep their order (clear before grant — the unique constraint
    // depends on the clearing running first)
    const vacate = source.indexOf('data: { administratorId: null }');
    const grant = source.indexOf('data: { administratorId: char.id, adminChangedRound: round }');
    const fnStart = source.indexOf('async function grantAdminTx');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    expect(vacate).toBeGreaterThan(fnStart);
    expect(grant).toBeGreaterThan(vacate);
  });
});
