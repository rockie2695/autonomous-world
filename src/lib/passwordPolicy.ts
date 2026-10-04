// ============================================================================
// 密碼規則 / Password policy
// ============================================================================
// 這個模組**刻意不 import 任何東西**，特別是不 import argon2。
//
// 為什麼要獨立成一個檔案？`@node-rs/argon2` 在 package.json 裡有頂層的
// `browser: browser.js`，而 Next.js 的 webpack 會在**客戶端** bundle 優先採用
// browser 欄位 —— 那個檔案需要沒安裝的 `@node-rs/argon2-wasm32-wasi`，於是只要
// 任何 client component 連帶 import 到 argon2，整頁就會 500。
// 前端表單只需要「密碼至少幾碼」這個常數，所以把它放在一個沒有依賴的模組裡，
// client 就完全不必碰 argon2。
//
// This module deliberately imports **nothing** — in particular, not argon2.
//
// Why is it its own file? `@node-rs/argon2` declares a top-level
// `browser: browser.js`, and Next's webpack prefers the browser field for the
// *client* bundle. That file requires `@node-rs/argon2-wasm32-wasi`, which is not
// installed, so the moment any client component transitively imports argon2 the whole
// page 500s. The sign-in form only needs the minimum-length constant, so that lives
// here in a dependency-free module and the client never touches argon2 at all.
//
// **真正雜湊的地方 / Where the hashing actually happens**
// `src/lib/password.ts` — server only. 註冊與登入 API 路由，以及 Auth.js 的
// Credentials provider，都只在那裡使用它。
// `src/lib/password.ts` — server only, used by the register / set-password routes and
// by Auth.js's Credentials provider.
//
// 規則本身 / The rule itself
// NIST SP 800-63B 建議至少 8 碼，並明確建議**不要**再加字元組成要求：複雜度規則
// 實際上只會把人推向 `Password1!` 這種可預測的密碼，而長度才是真正有效的。
// NIST SP 800-63B asks for at least 8 characters and explicitly advises against extra
// composition rules: complexity rules mostly push people toward predictable
// `Password1!`-style passwords, and length is what actually helps.

/** 密碼長度下限 / Minimum password length */
export const PASSWORD_MIN_LENGTH = 8;