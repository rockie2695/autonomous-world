// ============================================================================
// 認證設定 — Auth.js v5 / Authentication Configuration — Auth.js v5
// ============================================================================
// 使用 Google provider 和 Prisma adapter 設定 NextAuth.js。
// Configures NextAuth.js with Google provider and Prisma adapter.
// 處理 session 管理、管理員偵測、token 刷新。
// Handles session management, admin detection, and token refresh.
//
// 除了 Google OAuth，也支援「電子信箱 + 密碼」登入（Credentials provider）。
// 兩種方式共用同一張 User 表：Google 帳號的 passwordHash 為 null，只有信箱密碼
// 登入的帳號才有。這個欄位可空是兩種登入能並存的前提。
// Besides Google OAuth, email + password sign-in is supported through the
// Credentials provider. Both share one User table: a Google account has a null
// passwordHash, and only password accounts have one — which is exactly why that
// column has to be nullable.
//
// 需要的環境變數 / Environment variables required:
//   AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAIL
// ============================================================================

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { verifyPassword } from './password';
import type { Session } from 'next-auth';

// ─── Auth.js 設定 / Auth.js Configuration ─────────────────────────────────

/**
 * 使用設定初始化 NextAuth。
 * Initialize NextAuth with configuration.
 * 回傳 handlers, auth, signIn, signOut 方法。
 * Returns handlers, auth, signIn, signOut methods.
 */
const { handlers, auth, signIn, signOut } = NextAuth({
  /**
   * 使用 Prisma adapter 進行資料庫 session 管理。
   * Use Prisma adapter for database sessions.
   * 將 accounts, sessions, users 儲存在資料庫中。
   * Stores accounts, sessions, users in the database.
   */
  adapter: PrismaAdapter(prisma),

  /**
   * 認證提供者。
   * Authentication providers.
   * 目前僅設定 Google OAuth。
   * Currently only Google OAuth is configured.
   */
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    /**
     * 電子信箱 + 密碼登入 / Email + password sign-in.
     *
     * `authorize` 回傳 null 就代表驗證失敗，Auth.js 會導向錯誤頁 —— 這是**唯一**
     * 應該區分「密碼錯」與其他失敗的地方。
     *
     * Returning null means the credentials did not verify and Auth.js routes to the
     * error page. That is the only place "wrong password" is distinguished, and it
     * deliberately does not say which of the email or the password was wrong: telling
     * an attacker which half failed turns the form into an account-enumeration
     * oracle.
     */
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Auth.js 把 provider 欄位交進來時型別是 `{}`，所以先收成 unknown 再逐一
        // 收窄。刻意不用 `as any` / 斷言 —— 真正的檢查必须在這裡做，因為這是唯一
        // 碰到未驗證輸入的地方。
        // Auth.js hands provider fields over typed as `{}`, so narrow from unknown one
        // at a time. No `as any` or casts on purpose: the real check has to happen here,
        // because this is the only place unverified input arrives.
        const rawEmail: unknown = credentials?.email;
        const rawPassword: unknown = credentials?.password;
        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
        const password = typeof rawPassword === 'string' ? rawPassword : '';
        // 欄位缺漏就直接拒絕，不要讓空值進到資料庫查詢 /
        // Reject missing fields outright rather than letting them reach the query
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // **一律回傳 null**，不區分「信箱不存在」與「密碼不對」：對外洩漏哪一項錯了，
        // 等於提供一個可以列出哪些信箱已註冊的工具。
        // Always return null, never "no such email" vs "wrong password": telling the
        // caller which half failed turns this into an account-enumeration oracle.
        //
        // Google 帳號的 passwordHash 為 null，因此不能用密碼登入 —— 要讓它也能用密碼，
        // 必須先用 Google 登入，再走 POST /api/auth/set-password（見 README）。
        // A Google account has a null passwordHash so it cannot sign in this way; to
        // give it a password it must first sign in with Google and then use
        // POST /api/auth/set-password.
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(user.passwordHash, password);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  /**
   * Session 設定。
   * Session configuration.
   * 使用 JWT 進行無狀態 session（無需資料庫 session 查詢）。
   * Uses JWT for stateless sessions (no database session lookups).
   */
  session: {
    strategy: 'jwt',
  },

  /**
   * 自訂頁面。
   * Custom pages.
   * 如有需要可覆蓋預設頁面。
   * Override default pages if needed.
   */
  pages: {
    // 自訂登入頁：內含 Google 按鈕與信箱／密碼表單 /
    // Custom sign-in page: the Google button plus the email / password form
    signIn: '/signin',
    error: '/signin',       // 錯誤時導向登入頁並顯示訊息 / On error, back to sign-in with a message
  },

  /**
   * 自訂認證行為的回呼函數。
   * Callbacks for customizing auth behavior.
   */
  callbacks: {
    /**
     * JWT 回呼 — 當 JWT 建立或更新時呼叫。
     * JWT callback — called whenever a JWT is created or updated.
     * 我們將使用者 email 加入 token 以進行管理員檢查。
     * We add the user's email to the token for admin checking.
     */
    async jwt({ token, user }) {
      // 首次登入時，將使用者 email 加入 token
      // On initial sign-in, add user email to token
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },

    /**
     * Session 回呼 — 當 session 被檢查時呼叫。
     * Session callback — called whenever session is checked.
     * 我們將 email 加入 session 物件以供客戶端管理員檢查。
     * We add the email to the session object for client-side admin checking.
     */
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },

  /**
   * 在開發環境啟用 debug 模式。
   * Enable debug mode in development.
   */
  debug: process.env.NODE_ENV === 'development',
});

// ─── 匯出 / Exports ───────────────────────────────────────────────────────

/**
 * NextAuth 處理器元件。
 * NextAuth handler components.
 * 在 [...nextauth] 路由處理器中使用。
 * Use these in the [...nextauth] route handler.
 */
export const { GET, POST } = handlers;

/**
 * 取得當前 session（伺服器端）。
 * Get the current session (server-side).
 * 未認證時回傳 null。
 * Returns null if not authenticated.
 *
 * @example
 * const session = await auth();
 * if (!session) return redirect('/');
 */
export { auth, signIn, signOut };

/**
 * 檢查當前使用者是否為管理員。
 * Check if the current user is an admin.
 * 管理員由 ADMIN_EMAIL 環境變數比對決定。
 * Admin is determined by matching ADMIN_EMAIL env var.
 *
 * @example
 * if (await isAdmin(session)) {
 *   // 顯示管理員控制項 / Show admin controls
 * }
 */
export async function isAdmin(
  session: Session | null
): Promise<boolean> {
  if (!session?.user?.email) return false;

  const adminEmails = (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(session.user.email.toLowerCase());
}

/**
 * 取得當前使用者的電子信箱，未認證時回傳 null。
 * Get the current user's email, or null if not authenticated.
 */
export function getUserEmail(
  session: Session | null
): string | null {
  return session?.user?.email ?? null;
}
