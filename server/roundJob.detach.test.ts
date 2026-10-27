// ============================================================================
// 回合與請求生命週期脫鉤 — 關掉瀏覽器不能停止回合
// The round is decoupled from the request lifecycle — closing the browser
// must never stop a round
//
// 為什麼這是**讀原始碼**而不是測行為：測試環境是 `node`、沒有資料庫，而「瀏覽器
// 關掉、伺服器繼續跑完整回合」這件事的保證完全落在原始碼的形狀上——
//   1. 回合以 `void (async () => …)()` **脫離** POST 處理器執行，沒有任何東西
//      await 它；
//   2. POST 與 GET 處理器**不讀 `request.signal`**（讀了就會把客端斷線變成
//      取消訊號）；
//   3. 入隊路徑上沒有 `await runRound`（等它就等於把回合綁回請求生命週期）。
// 這跟 `battle.eventOrder.test.ts` 守住語句順序、`territoryLabelPlacement.test.ts`
// 守住 CSS 宣告是同一種做法：沒有資料庫就沒有行為可測，能驗證的是原始碼的不變量。
//
// Why this reads the source rather than testing behaviour: the test environment is
// `node` with no database, and the guarantee "the browser closes, the server still
// finishes the round" rests entirely on the shape of the source —
//   1. the round executes **detached** from the POST handler as
//      `void (async () => …)()`, with nothing awaiting it;
//   2. the POST and GET handlers never read `request.signal` (reading it would turn
//      the client's disconnect into a cancellation signal);
//   3. the enqueue path never does `await runRound` (awaiting it would tie the
//      round back to the request lifecycle).
// Same approach as `battle.eventOrder.test.ts` (statement order) and
// `territoryLabelPlacement.test.ts` (a CSS declaration): with no database there is
// no behaviour to exercise — the checkable invariant is in the source.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const roundJobSource = readFileSync(join(__dirname, 'roundJob.ts'), 'utf8');
const routeSource = readFileSync(
  join(__dirname, '..', 'src', 'app', 'api', 'admin', 'run-round', 'route.ts'),
  'utf8'
);

describe('the round outlives its HTTP request', () => {
  it('executes the round detached from the enqueue path (void, not awaited)', () => {
    // 回合必須以 fire-and-forget 的 IIFE 跑：`void (async () => …)()`。
    // 不變量：`await runRound` 恰好出現**一次**，而且落在 IIFE **裡面**——IIFE 自己
    // 等回合是應該的（工作要等自己的本體），但入隊路徑絕不能等 IIFE。若有人把
    // `void` 拿掉、或在 IIFE 外面加了 `await`，回合就綁回了 POST 請求的生命週期——
    // 客端斷線（關瀏覽器）會讓請求鏈被取消，回合跟著死掉。
    //
    // The round must run as a fire-and-forget IIFE: `void (async () => …)()`.
    // Invariant: `await runRound` appears exactly ONCE, and INSIDE that IIFE — the
    // IIFE awaiting the round is right (a job awaits its own body), but the enqueue
    // path must never await the IIFE. If anyone drops the `void`, or adds an `await`
    // outside the IIFE, the round is tied back to the POST request's lifecycle — a
    // client disconnect (closing the browser) cancels the request chain and the
    // round dies with it.
    const detached = roundJobSource.indexOf('void (async () => {');
    expect(detached, 'the round runs as a void-detached IIFE').toBeGreaterThan(-1);
    const awaits = [...roundJobSource.matchAll(/await runRound/g)].map((m) => m.index!);
    expect(
      awaits.length,
      'await runRound must appear exactly once — inside the detached IIFE'
    ).toBe(1);
    expect(
      awaits[0]!,
      'the single await runRound sits inside the detached IIFE (after its opening)'
    ).toBeGreaterThan(detached);
    // IIFE 的收尾 `})();` 必須在 `await runRound` 之後——await 真的在 IIFE 本體裡 /
    // The IIFE's closing `})();` must come after `await runRound` — the await
    // really is inside the IIFE body
    const iifeEnd = roundJobSource.indexOf('})();', detached);
    expect(iifeEnd, 'the IIFE closes after the round await').toBeGreaterThan(awaits[0]!);
  });

  it('never reads request.signal in the run-round handlers', () => {
    // request.signal 是 Next.js 把「客端斷線」遞進來的通道。只要沒有人讀它，
    // 關掉瀏覽器對伺服器裡的回合**零影響**——202 已回、工作已在行程裡跑。
    //
    // request.signal is how Next.js delivers "the client disconnected" into a
    // handler. As long as nobody reads it, closing the browser has ZERO effect
    // on a round inside the server process — the 202 is already answered and the
    // job is running in the process.
    expect(routeSource, 'reading request.signal would couple the round to the client connection').not.toContain(
      'request.signal'
    );
  });

  it('persists the running flag and clears it in a finally, outside the request', () => {
    // 「關瀏覽器 → 重開 → 按鈕狀態正確」靠兩件事：入隊時寫 DB 旗標（重整後的頁面
    // 立刻鎖按鈕），以及工作結束的 finally 清旗標（成功與失敗都清）。兩者都必須
    // 在 roundJob.ts 裡，而不是在 route 或客端。
    //
    // "Close the browser → reopen → the button state is right" rests on two
    // things: the flag is written to the DB on enqueue (a refreshed page locks
    // the button at once), and the job's finally clears it (success AND failure).
    // Both must live in roundJob.ts, not in the route or the client.
    expect(roundJobSource).toContain('roundRunning: true');
    const finallyIdx = roundJobSource.indexOf('} finally {');
    // lastIndexOf：watchdog 的自癒也寫 `roundRunning: false`，但那在檔案**前面**；
    // finally 裡的清除是檔案裡的最後一個。
    // lastIndexOf: the watchdog's heal also writes `roundRunning: false`, but that
    // one sits EARLIER in the file; the finally's clear is the last occurrence.
    const clearIdx = roundJobSource.lastIndexOf('roundRunning: false');
    expect(finallyIdx, 'the job has a finally block').toBeGreaterThan(-1);
    expect(clearIdx, 'the flag is cleared in the job body').toBeGreaterThan(finallyIdx);
  });
});
