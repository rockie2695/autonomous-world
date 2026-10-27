// ============================================================================
// API 路由 — 取得目前世界 / API Route — Get Current World
// ============================================================================
// 回傳**目前選中**世界的基本資訊（cookie 選擇，見 src/lib/worldSelect.ts）。
// Returns the **currently selected** world's basic info (the cookie selection,
// see src/lib/worldSelect.ts).
//
// GET /api/world/current
// 回應 / Response: { id, name, currentRound, seed, createdAt }
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

  // 目前選中的世界 / The selected world
  const worldId = await getSelectedWorldId();
  if (!worldId) {
    return NextResponse.json(
      { error: 'No world found' },
      { status: 404 }
    );
  }

  const world = await prisma.world.findUnique({
    where: { id: worldId },
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
      { error: 'No world found' },
      { status: 404 }
    );
  }

  return NextResponse.json(world);
}
