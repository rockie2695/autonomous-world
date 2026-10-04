// ============================================================================
// 密碼雜湊 / Password hashing
// ============================================================================
// 密碼從不存明文，也永遠不記錄到 log：資料庫裡只放 argon2id 的編碼雜湊，字串本身
// 就帶有產生它時的參數（記憶體成本、時間成本、lane 數），所以驗證時不需要另外
// 記住或傳入這些參數 —— 也因此日後調高參數不會讓舊帳號無法驗證。
//
// Passwords are never stored in plaintext and never logged: the database only holds
// an argon2id encoded hash. The encoded string carries the parameters it was created
// with (memory cost, iterations, lanes), so verification needs no side-channel
// config — and raising the parameters later will not lock existing users out.
//
// 為什麼是 argon2id / Why argon2id
// - **記憶面硬**：攻擊者要破解就必須同時用大量記憶體，比 bcrypt 的 CPU 成本 harder，
//   而 GPU 平行破解的優勢也被記憶體上限抵銷。
// - **抗 side-channel**：bcrypt 的比對時間會洩漏雜湊值資訊，argon2 的設計本來就假設
//   攻擊者看得見計算時間。
//
// - **Memory-hard**: cracking it costs memory as well as CPU, which blunts the GPU
//   parallelism that makes brute force cheap against bcrypt.
// - **Side-channel resistant**: bcrypt's compare leaks information through timing;
//   argon2 is designed assuming the attacker can watch how long it takes.
//
// 刻意**不做**的事 / Deliberately not done here
// - 不做 email 驗證、不做密碼重設（這兩項需要寄信服務，見 README 的說明）。
// - 不限制密碼字元組成，只限制長度下限 —— 複雜度規則實際上只會把人推向
//   `Password1!` 這種可預測的密碼，長度才是真正有效的。
// - No email verification and no password reset (both need a mail provider).
// - No composition rules, only a minimum length: complexity rules mostly push people
//   toward predictable `Password1!`-style strings, and length is what actually helps.

import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id 參數 /
 * argon2id parameters.
 *
 * 19 MiB / t=2 / p=1 是 OWASP 對 argon2id 的最低建議值。提高記憶體成本會讓
 * 伺服器每次驗證都吃更多記憶體（在一次登入高峰時是實際的成本），所以這裡取建議值
 * 而不是最大值 —— 真正的防禦深度來自「不讓攻擊者拿到雜湊值」，而不是把參數拉到很高。
 *
 * 19 MiB / t=2 / p=1 is OWASP's minimum recommendation for argon2id. Raising the
 * memory cost makes every verification cost more server memory (a real bill during a
 * login peak), so this takes the recommended floor rather than the maximum — the
 * depth that actually matters comes from attackers not obtaining the hash at all,
 * not from inflating the parameters.
 *
 * **不寫 `algorithm`**：套件預設就是 argon2id（型別定義裡的說明明寫「Default
 * value, this is the default algorithm for normative recommendations」）。而
 * `Algorithm` 是 ambient const enum，在本專案開了 `isolatedModules` 的情況下無法取值
 * —— 明確寫 `Algorithm.Argon2id` 反而編譯不過。省略它既讀得到意圖，也不會壞。
 *
 * **`algorithm` is deliberately omitted**: the library already defaults to argon2id
 * (its own type declaration says "Default value, this is the default algorithm for
 * normative recommendations"), and `Algorithm` is an ambient const enum that cannot be
 * read with `isolatedModules` enabled — so naming it explicitly would not compile.
 * Leaving it out states the intent without breaking the build.
 */
const ARGON2_OPTIONS = {
  /** KiB。19 MiB / OWASP's floor for argon2id */
  memoryCost: 19456,
  /** 迭代次數 / Passes over memory */
  timeCost: 2,
  /** lane 數；1 對一般登入量已足夠 / Lanes; 1 is plenty at sign-in volumes */
  parallelism: 1,
  /** 輸出長度（bytes）/ Output length in bytes */
  outputLen: 32,
} as const;

/**
 * 產生 argon2id 編碼雜湊。
 * Produce an argon2id encoded hash.
 *
 * 參數被寫進雜湊字串本身，所以驗證端不需要知道這些設定。
 * The parameters are encoded into the hash string, so the verifier does not need
 * to know them.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * 驗證明文密碼是否對得上雜湊。
 * Check a plaintext password against an encoded hash.
 *
 * 對格式錯誤的雜湊（舊資料、寫壞的資料庫）直接回 false 而不是拋錯 —— 登入流程不該
 * 因為一筆壞資料而整個 500。
 * A malformed digest (legacy or corrupted row) returns false rather than throwing:
 * a sign-in attempt should not 500 because one row is bad.
 */
export async function verifyPassword(
  encodedHash: string,
  plain: string
): Promise<boolean> {
  try {
    // 刻意不傳 options：解碼後的字串自帶參數，傳進去反而可能與雜湊不符 /
    // Deliberately no options: the encoded string carries its own parameters and
    // passing them in can conflict with it
    return await verify(encodedHash, plain);
  } catch {
    return false;
  }
}

/**
 * 密碼長度下限 / Minimum password length.
 *
 * **規則本身住在 `passwordPolicy.ts`**，那裡沒有任何依賴，所以 client component
 * 可以安心 import 它而不會把 argon2 拉進瀏覽器 bundle。這裡只是轉出，讓 server
 * 端呼叫者有單一進入點。
 *
 * The rule itself lives in `passwordPolicy.ts`, which has no dependencies, so a client
 * component can import it without dragging argon2 into the browser bundle. This is
 * only a re-export so server-side callers have one obvious entry point.
 */
export { PASSWORD_MIN_LENGTH } from './passwordPolicy';