// ============================================================================
// 資料庫瞬時錯誤的重試 / Retrying transient database errors
// ============================================================================
// 讀路徑打的是 Neon（雲端 Postgres），而雲端資料庫**偶爾**會瞬時失敗：連線被
// 連線池回收、交易衝突（serialization failure）、逾時。這些錯誤重試一次就過了，
// 直接丟給使用者就是一整個面板壞掉。
//
// The read paths hit Neon (a cloud Postgres), and a cloud database **occasionally**
// fails transiently: a connection reaped by the pool, a serialization conflict, a
// timeout. Retrying once fixes them; surfacing them instead breaks a whole panel.
//
// **只重試瞬時錯誤**：語意錯誤（型別不符、找不到資料）重試只是把同一個錯誤送三次，
// 而且會拖慢每一個失敗的請求。判斷放在**同一個函式**裡，呼叫端不必自己決定
// 「這個值不值得重試」。
//
// **Only transient errors are retried**: a semantic error (a type mismatch, a
// missing row) retried is the same error three times, and it slows every failing
// request. The decision lives in **one function**, so callers never have to decide
// whether an error is worth another try.
//
// **退避帶抖動**：所有等待者若同時重試，會形成 thundering herd——同一瞬間全部打回去，
// 把剛恢復的服務再度壓垮。抖動讓每一次重試落在不同時刻。
//
// **The backoff is jittered**: if every waiter retried at once they would form a
// thundering herd - all hitting back the same instant and re-overloading a service
// that had just come back. The jitter lands each retry at a different moment.
//
// 這裡**不碰模擬的亂數**：重試是 I/O 層的事，與決定世界走向的種子 RNG 完全無關。
// This never touches the simulation's random: retrying is an I/O concern, entirely
// separate from the seeded RNG that decides what happens in the world.
// ============================================================================

/** Prisma 的瞬時錯誤碼 / Prisma's transient error codes */
const TRANSIENT_CODES = new Set([
  'P1001', // 連不上 / can't reach the database
  'P1002', // 伺服器關閉連線 / the server closed the connection
  'P1008', // 操作逾時 / the operation timed out
  'P2024', // 連線池逾時 / the connection pool timed out
  'P2028', // 交易 API 錯誤 / transaction API error
  'P2034', // 交易衝突（序列化失敗）/ transaction conflict (serialization failure)
]);

/**
 * 這個錯誤值得重試嗎？只有**瞬時**的資料庫錯誤值得。
 * Is this error worth another try? Only a **transient** database error is.
 */
export function isTransientDbError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

export interface RetryOptions {
  /** 最多嘗試幾次（含第一次）/ How many attempts at most (the first one included) */
  attempts?: number;
  /** 退避的基數（毫秒）/ The backoff base (ms) */
  baseMs?: number;
  /** 等待函式（測試用）/ The wait function (for tests) */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 執行一次讀取，瞬時失敗就退避重試。
 * Run a read, retrying transient failures with a backoff.
 *
 * @param fn - 要執行的操作 / The operation to run
 * @param options - 嘗試次數、退避基數 / Attempts and backoff base
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseMs = Math.max(0, options.baseMs ?? 200);
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === attempts) throw error;
      // 指數退避 + 抖動（最多一半的退避量）/ Exponential backoff + jitter (up to
      // half the backoff)
      const backoff = baseMs * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.5;
      await sleep(backoff + jitter);
    }
  }
  throw lastError;
}