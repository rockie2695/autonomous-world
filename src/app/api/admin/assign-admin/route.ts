// ============================================================================
// API 路由 — 指派管理員（僅管理員）/ API Route — Assign Administrator (Admin Only)
// ============================================================================
// 手動將管理員指派給地點。
// Manually assigns an administrator to a place.
//
// POST /api/admin/assign-admin
// 請求本體 / Body: { placeId: string, characterId: string }
// 回應 / Response: { success: true }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { AssignAdminBodySchema } from '@/lib/validations';

export async function POST(request: Request) {
  // 檢查認證 / Check authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 檢查管理員狀態 / Check admin status
  if (!(await isAdmin(session))) {
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    );
  }

  // 使用 Zod 驗證請求本體 / Validate request body with Zod
  const body = await request.json();
  const bodyResult = AssignAdminBodySchema.safeParse(body);

  if (!bodyResult.success) {
    return NextResponse.json(
      { error: bodyResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { placeId, characterId } = bodyResult.data;

  // 尋找活躍的世界 / Find the active world
  const world = await prisma.world.findFirst({
    where: { active: true },
  });

  if (!world) {
    return NextResponse.json(
      { error: 'No active world found' },
      { status: 404 }
    );
  }

  // 驗證地點存在且屬於此世界 / Validate place exists and belongs to this world
  const place = await prisma.place.findFirst({
    where: {
      id: placeId,
      worldId: world.id,
    },
  });

  if (!place) {
    return NextResponse.json(
      { error: 'Place not found' },
      { status: 404 }
    );
  }

  // 驗證角色存在、存活且屬於此世界 / Validate character exists, is alive, and belongs to this world
  const character = await prisma.character.findFirst({
    where: {
      id: characterId,
      worldId: world.id,
      alive: true,
    },
  });

  if (!character) {
    return NextResponse.json(
      { error: 'Character not found or dead' },
      { status: 404 }
    );
  }

  // 更新地點的管理員 / Update the place's administrator
  await prisma.place.update({
    where: { id: placeId },
    data: { administratorId: characterId },
  });

  // 更新角色的 lastPromotedRound / Update the character's lastPromotedRound
  await prisma.character.update({
    where: { id: characterId },
    data: { lastPromotedRound: world.currentRound },
  });

  return NextResponse.json({
    success: true,
    message: `Assigned ${character.name} as administrator of ${place.name}`,
  });
}
