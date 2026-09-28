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
import { grantAdmin, revokeAdmin } from '../../../../../server/adminAssign';

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

  // 僅有勢力控制的地點可被指派 / Only faction-controlled places can be assigned
  if (!place.factionId) {
    return NextResponse.json(
      { error: 'Cannot assign administrator to an unowned place' },
      { status: 400 }
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

  // 手動指派不受行政官冷卻期限制（玩家可隨時更換），但仍會打上冷卻錨點，
  // 使 AI 在 ADMIN_CHANGE_COOLDOWN_ROUNDS 回合內不得再更換該地點 /
  // Manual assignment ignores the admin cooldown (players may always change it)
  // but still stamps the cooldown anchor so the AI cannot change it for
  // ADMIN_CHANGE_COOLDOWN_ROUNDS rounds afterwards
  const newChar = { id: character.id, name: character.name };
  const placeRef = { id: place.id, name: place.name };

  // 舊任者若被換下 → 免職（野心 +1、取消未到期減免）並記 ADMIN_REMOVED /
  // A displaced outgoing admin is revoked (+1 ambition, pending reduction
  // cancelled) and an ADMIN_REMOVED Event is logged
  if (place.administratorId && place.administratorId !== character.id) {
    const oldAdmin = await prisma.character.findUnique({
      where: { id: place.administratorId },
      select: { id: true, name: true },
    });

    if (oldAdmin) {
      await revokeAdmin({
        worldId: world.id,
        round: world.currentRound,
        place: placeRef,
        char: { id: oldAdmin.id, name: oldAdmin.name },
        newAdmin: newChar,
        logEvent: true,
      });
    }
  }

  // 任命新行政官（同時清除他在其他地點的職務以符合唯一約束）/
  // Grant the new administrator (also clearing his seat elsewhere to satisfy
  // the unique constraint)
  await grantAdmin({
    worldId: world.id,
    round: world.currentRound,
    place: placeRef,
    char: newChar,
  });

  return NextResponse.json({
    success: true,
    message: `Assigned ${character.name} as administrator of ${place.name}`,
  });
}
