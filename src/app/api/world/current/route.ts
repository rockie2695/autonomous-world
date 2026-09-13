// ============================================================================
// API 路由 — 取得目前世界 / API Route — Get Current World
// ============================================================================
// 回傳目前活躍世界的基本資訊。
// Returns the currently active world's basic info.
//
// GET /api/world/current
// 回應 / Response: { id, name, currentRound, seed, createdAt }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 尋找活躍的世界 / Find the active world
  const world = await prisma.world.findFirst({
    where: { active: true },
    select: {
      id: true,
      name: true,
      currentRound: true,
      seed: true,
      createdAt: true,
    },
  });

  if (!world) {
    return NextResponse.json(
      { error: 'No active world found' },
      { status: 404 }
    );
  }

  return NextResponse.json(world);
}
