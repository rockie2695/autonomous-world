// ============================================================================
// 認證設定 — Auth.js v5 / Authentication Configuration — Auth.js v5
// ============================================================================
// 使用 Google provider 和 Prisma adapter 設定 NextAuth.js。
// Configures NextAuth.js with Google provider and Prisma adapter.
// 處理 session 管理、管理員偵測、token 刷新。
// Handles session management, admin detection, and token refresh.
//
// 使用方式 / Usage:
//   import { auth, isAdmin } from '@/lib/auth';
//   const session = await auth();
//   const admin = await isAdmin(session);
//
// 需要的環境變數 / Environment variables required:
//   AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAIL
// ============================================================================

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
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
  adapter: PrismaAdapter(prisma) as any,

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
    signIn: '/',           // 登入後導向首頁 / Redirect to homepage for login
    error: '/',            // 錯誤時導向首頁 / Redirect to homepage on error
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
