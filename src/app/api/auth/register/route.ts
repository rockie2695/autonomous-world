// ============================================================================
// API 路由 — 註冊 / API Route — Register
// ============================================================================
// 以「電子信箱 + 密碼」建立帳號，讓不必使用 Google 也能進入遊戲。
// Creates an account from an email + password so Google is not the only way in.
//
// POST /api/auth/register
// 請求本體 / Body: { email: string, password: string, name?: string }
// 回應 / Response: { success: true } 或 400 / 409
//
// 安全性 / Security
// - 密碼以 argon2id 雜湊後才寫入，明文絕不落地、絕不進 log。
//   The password is stored only as an argon2id hash; the plaintext is never
//   persisted and never logged.
// - **信箱已存在就回 409，不會覆寫既有帳號的密碼。** 這一點很關鍵：若改成
//   「信箱存在就直接 set password」，任何知道某個 Google 使用者信箱的人都能
//   替對方設密碼並接管帳號。要讓既有（Google）帳號也能用密碼登入，正確路徑是
//   先用 Google 登入，再呼叫 POST /api/auth/set-password。
//   **An existing email returns 409 and never has its password overwritten.** This
//   matters: if this instead "just set the password" on an existing row, anyone who
//   knew a Google user's email could set a password on it and take the account over.
//   The safe path for an existing Google account is to sign in with Google first,
//   then call POST /api/auth/set-password.
// - 這個端點不做 email 驗證（需要寄信服務），所以一個信箱在驗證前就能用密碼登入。
//   這是「先不做驗證」的已知取捨。
//   There is no email verification here (it needs a mail provider), so an address
//   can sign in with its password before any confirmation. That is the accepted
//   trade-off of skipping verification.
//
// 速率限制 / Rate limiting
// 本路由沒有速率限制。要在公開環境擋密碼填充，需要在前面加一層（例如
// Upstash、Vercel WAF 或中介層）。註冊端點尤其需要，因為它會寫入資料庫。
// This route has no rate limiting. Guarding against password stuffing in a public
// deployment needs something in front of it (Upstash, Vercel WAF, or middleware).
// Registration especially so, because it writes to the database.
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { RegisterBodySchema } from '@/lib/validations';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // 使用 Zod 驗證請求本體 / Validate request body with Zod
  const parsed = RegisterBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { email, password, name } = parsed.data;

  // 先查再建立：@unique 只會擋下完全相同的值，而回傳「已存在」比讓資料庫丟出
  // P2002 更容易讀懂。競態（兩次同時註冊同一信箱）仍由 @unique 兜底。
  // Check before creating: @unique only catches an exact collision, and reporting
  // "already exists" reads better than surfacing P2002. A race (two simultaneous
  // registrations for one address) is still caught by @unique below.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (existing) {
    // 一律回「信箱已被使用」，**不**洩漏這個帳號是不是已經有密碼、或是用 Google
    // 建立的 —— 那等於告訴攻擊者這個信箱存在，而且還多給他一條線索。
    // Always answer "address already in use" without revealing whether the account
    // already has a password or arrived via Google: that would confirm the address
    // exists and hand the attacker an extra signal.
    return NextResponse.json(
      { error: '此電子信箱已被使用 / This email is already in use' },
      { status: 409 }
    );
  }

  // 雜湊後才寫入 / Hash before writing
  const passwordHash = await hashPassword(password);

  try {
    await prisma.user.create({
      data: {
        email,
        name: name && name.length > 0 ? name : null,
        passwordHash,
        // 沒有寄信驗證，所以 emailVerified 保持 null。登入判定只比對 passwordHash，
        // 不看這個欄位，所以不會影響登入。
        // There is no mail verification, so emailVerified stays null. Sign-in only
        // compares passwordHash and never reads this column, so it does not matter.
      },
      // 只回傳必要欄位，順便避免不小心把 passwordHash 送到任何地方 /
      // Select only what we need, which also keeps passwordHash from leaking anywhere
      select: { id: true, email: true },
    });
  } catch (error) {
    // 競態：同一信箱在「查」與「建立」之間被別人先用掉了 / Race: someone else took
    // the address between the check and the insert
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: '此電子信箱已被使用 / This email is already in use' },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}