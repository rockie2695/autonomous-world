// ============================================================================
// API 路由 — 世界列表 / API Route — World List
// ============================================================================
// 所有已登入使用者都能看的世界列表 + 各自的選中狀態。多世界之後「我在看哪個
// 世界」由 cookie 決定（src/lib/worldSelect.ts），這裡把列表與 selectedId 一起
// 送出，客端的選擇器一次就能畫對。
//
// The world list every signed-in user can read, together with the caller's own
// selection. With multiple worlds, "which world am I looking at" lives in a
// cookie (src/lib/worldSelect.ts); this ships the list and selectedId together
// so the client's picker renders correctly in one round trip.
//
// GET /api/worlds
// 回應 / Response: { worlds: Array<{ id, name, currentRound, active, createdAt }>,
//                    selectedId: string | null }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getSelectedWorldId } from '@/lib/worldSelect';

export async function GET() {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const [worlds, selectedId] = await Promise.all([
    prisma.world.findMany({
      select: {
        id: true,
        name: true,
        currentRound: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    getSelectedWorldId(),
  ]);

  return NextResponse.json({ worlds, selectedId });
}
