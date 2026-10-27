// ============================================================================
// API 路由 — 選擇世界 / API Route — Select World
// ============================================================================
// 把「我現在在看哪個世界」寫進 cookie。**任何已登入使用者**都可以選（與 admin
// 的權限差異只在「建立新世界」與「跑回合」），選擇是 per-session 的，不影響
// 其他使用者或其他分頁的資料。
//
// Writes "which world am I looking at" into the cookie. **Any signed-in user**
// can select (the admin-only privileges are creating a world and running rounds);
// the selection is per-session and touches nobody else's data.
//
// POST /api/worlds/select      body: { worldId: string }
// 回應 / Response: { success: true, selectedId }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { SelectWorldBodySchema } from '@/lib/validations';
import {
  WORLD_COOKIE,
  WORLD_COOKIE_MAX_AGE,
} from '@/lib/worldSelect';

export async function POST(request: Request) {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const bodyResult = SelectWorldBodySchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: bodyResult.error.issues[0].message },
      { status: 400 }
    );
  }

  // 世界必須真的存在：cookie 指向不存在的世界會讓每個讀取路由都走 fallback，
  // 選擇器看起來「選了卻沒反應」——在這裡就擋下來，給出 404。
  // The world must actually exist: a cookie pointing at a missing world sends
  // every read route down its fallback path, and the picker reads as "selected
  // but nothing happened" — refuse here with a 404 instead.
  const exists = await prisma.world.findUnique({
    where: { id: bodyResult.data.worldId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json(
      { error: 'World not found' },
      { status: 404 }
    );
  }

  const response = NextResponse.json({
    success: true,
    selectedId: exists.id,
  });
  response.cookies.set(WORLD_COOKIE, exists.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WORLD_COOKIE_MAX_AGE,
  });
  return response;
}
