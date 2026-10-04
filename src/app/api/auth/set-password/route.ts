// ============================================================================
// API 路由 — 為已登入的使用者設定密碼 / API Route — Set Password
// ============================================================================
// 讓已經用 Google 登入的人（含以 ADMIN_EMAIL 判定的管理員）**再**加上一組密碼，
// 之後就能改用信箱＋密碼登入。
// Lets someone who already signs in with Google — including admins, who are matched
// by ADMIN_EMAIL — additionally set a password so they can sign in with email + password
// from then on.
//
// POST /api/auth/set-password
// 請求本體 / Body: { password: string }
// 回應 / Response: { success: true } 或 400 / 401 / 409
//
// 為什麼需要這個端點 / Why this route exists
// Google 登入建立的帳號 passwordHash 是 null，因此無法用密碼登入。理論上有兩種做法：
//   (a) 註冊時若信箱已存在就直接幫它設密碼；
//   (b) 要求本人先證明自己擁有帳號，再設密碼 —— 也就是這個端點。
// (a) 是**帳號接管漏洞**：任何知道某個 Google 使用者信箱的人都能註冊一組密碼然後登入
// 成為他。信箱是可以輕易得知的（公開的 commit、截圖、猜測），所以這不是假想威脅。
// (b) 需要一個已驗證的 session，而取得 session 正是「證明身份」這件事本身。
// A Google account has a null passwordHash, so it cannot sign in with a password.
// There are two ways to change that: (a) registration sets a password whenever the
// address already exists, or (b) the owner proves the account is theirs first, which is
// this route. (a) is an **account takeover hole** — anyone who knows a Google user's
// address could register a password and then sign in as them, and addresses are easy to
// learn (public commits, screenshots, guessing). (b) demands a verified session, and
// holding one *is* the proof of ownership.
//
// 已持有密碼的使用者 / If a password already exists
// 回傳 409，而不是直接覆寫。覆寫等同於無聲地改掉使用者的憑證，應該是一個明確的
// 動作（先讓人重新輸入舊密碼之類的）。這一版刻意不做那個流程。
// Returns 409 rather than overwriting. Silently replacing someone's credentials is not
// acceptable; it should be a deliberate action (re-entering the current password, say).
// This version deliberately does not implement that flow.
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { SetPasswordBodySchema } from '@/lib/validations';

export async function POST(request: Request) {
  // 必須已經登入 —— 這就是「證明自己擁有帳號」的那一步 /
  // Must already be signed in — this is the "prove you own this account" step
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = SetPasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, passwordHash: true },
  });

  // session 有效但使用者已不存在（剛被刪掉）/ Valid session but the user row is gone
  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // 已經有密碼就不覆寫 / Do not overwrite an existing password
  if (user.passwordHash) {
    return NextResponse.json(
      { error: '此帳號已經設定過密碼 / This account already has a password' },
      { status: 409 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
    select: { id: true },
  });

  return NextResponse.json({ success: true });
}