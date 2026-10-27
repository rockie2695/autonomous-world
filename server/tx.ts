import { prisma, Prisma } from '@/lib/prisma';

// ============================================================================
// 交易輔助 / Transaction helper
// ============================================================================
//
// 為什麼只有少數地方需要交易 / Why only a few sites need one
// -----------------------------------------------------------------------
// 一個回合本來就是「可能跑到一半」的模擬：任何一階段中途失敗，下一回合就從那裡繼續。
// 大部分半完成的寫入是可自行修正的 —— 金幣的誤差下一回合就抹平，少寫一筆事件只是
// 日誌不好看。把全部約 90 個寫入點包進交易，只會換來每回合數百次交易開銷，
// 換不到對應的正確性。
//
// A round is already a simulation that may stop halfway: the next round resumes from
// wherever it stopped. Most partial writes are self-correcting - gold drift settles
// itself, a missing Event row only makes the log less pretty. Wrapping all ~90 write
// sites would buy hundreds of transactions a round and no matching correctness.
//
// 真正需要交易的，是「半寫入會永久毀掉東西」的路徑 /
// What genuinely needs one is a half-finished write that destroys something permanently
// -----------------------------------------------------------------------
// 判斷標準只有一條：之後有沒有任何一條程式路徑會把它修回來。沒有，就必須交易。
//
// The test is one question: does any later code path repair this? If not, it must be
// atomic. Currently that is exactly two units:
//
//   - adminAssign.grantAdmin / revokeAdmin - the seat moves but the defectionBase delta never
//     lands, so no revert is ever scheduled, and nothing will ever credit it back. That
//     character is then permanently quieter in defectionBase than the rules allow.
//   - economy's payout - the WHOLE phase is one transaction, and the transaction holds
//     only THREE statements (batch mode, Oct 2026): one merged characters
//     UPDATE ... FROM (VALUES ...) (every character's net gold/troop delta), one merged
//     places UPDATE (garrison recruits), and one createMany of every INCOME and
//     TROOPS_BOUGHT row. Every place's income split, recruitment, troop purchase and its
//     events land together or not at all. A half-written phase would leave part of the
//     world's gold simply absent - the amounts are computed, never derived from a stored
//     total, so no later phase can reconcile them. The event payloads' "after" balances
//     come from an in-memory simulated ledger (same increments, same loop order), not
//     from a write's return value. Batching is what makes the invariant affordable: it
//     used to be one statement per write, then one transaction PER PLACE.
//
// 刻意排除 / Deliberately excluded
// -----------------------------------------------------------------------
//   - 回合快照 (runRound.ts): the snapshot is a cache of a finished round. Putting it in
//     the round's transaction would hold one transaction open across all 14 phases.
//   - 每筆事件列: an Event row is a log line. Losing one costs narration, not state.
// ============================================================================

/** 交易內可用的 client / The client handed to a transaction body. */
export type TxClient = Prisma.TransactionClient;

/**
 * Prisma 互動式交易的預設逾時是 5 秒。
 *
 * economy 的整階段交易在 2026-10 收斂成**三句話**（合併的角色 UPDATE、合併的地方
 * UPDATE、一次 createMany），早已不再是「2000 地點 × 每地 5–8 次依序寫入」；60 秒
 * 從那時起是餘裕而不是必需。交易是在**開始後**才計時的，所以逾時等於整階段的經濟
 * 寫入全部作廢、重跑。`maxWait` 與 `timeout` 共用這個值，等待與執行兩邊都有上限。
 *
 * Prisma's default interactive-transaction timeout is 5s.
 *
 * economy's whole-phase transaction collapsed to THREE statements in Oct 2026 (a merged
 * characters UPDATE, a merged places UPDATE, one createMany) and no longer spans
 * "2000 places × 5-8 sequential writes each"; the 60s has been headroom since. The
 * clock starts when the transaction does, so a timeout discards the phase's entire
 * economy write and reruns it. maxWait and timeout share this value, so both the wait
 * and the run are bounded.
 */
export const TX_TIMEOUT_MS = 60000;

/**
 * 執行一段必然一起落地的寫入 / Run a unit of writes that must land together.
 *
 * fn 只可以使用傳進去的 client。在 fn 裡呼叫模組層級的 prisma 會逃出這筆交易，
 * 不會隨之回滾 —— 這是這個輔助用來把這個陷阱寫明的理由。
 *
 * fn must ONLY use the client it is handed. Calling the module-level prisma inside fn
 * escapes the transaction and will not be rolled back with it.
 */
export function inTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: TX_TIMEOUT_MS,
    timeout: TX_TIMEOUT_MS,
  });
}