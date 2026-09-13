// ============================================================================
// API 路由 — 重置世界（僅管理員）/ API Route — Reset World (Admin Only)
// ============================================================================
// 建立新世界，並停用目前的世界。
// Creates a new world, deactivating the current one.
// 需要客戶端 double confirmation。
// Requires double confirmation from the client.
//
// POST /api/admin/reset-world
// 請求本體 / Body: { name: string, confirm: boolean }
// 回應 / Response: { success: true, world: { id, name, seed } }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { createRng } from '@/lib/rng';
import { generatePlaceNames } from '@/lib/nameGenerator/place';
import { generateFactionNames } from '@/lib/nameGenerator/faction';
import { CONFIG } from '@/lib/gameConfig';
import { ResetWorldBodySchema } from '@/lib/validations';

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
  const bodyResult = ResetWorldBodySchema.safeParse(body);

  if (!bodyResult.success) {
    return NextResponse.json(
      { error: bodyResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name } = bodyResult.data;

  // 從時間戳記 + 隨機數產生唯一种子 / Generate a unique seed from timestamp + random
  const seed = `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 建立新世界 / Create the new world
  const world = await prisma.world.create({
    data: {
      name,
      seed,
      rngState: createRng(seed).getState(),
      active: true,
    },
  });

  // 停用所有其他世界 / Deactivate all other worlds
  await prisma.world.updateMany({
    where: {
      id: { not: world.id },
      active: true,
    },
    data: { active: false },
  });

  // 產生初始地點 / Generate initial places
  const rng = createRng(seed);
  const placeNames = generatePlaceNames(rng, CONFIG.PLACE_INITIAL_COUNT);

  // 待辦：建立具有正確佈局的初始地點 / TODO: Create initial places with proper layout
  // 目前只建立佔位資料 / For now, just create placeholder data
  const places = await Promise.all(
    placeNames.slice(0, 10).map((placeName, index) =>
      prisma.place.create({
        data: {
          worldId: world.id,
          name: placeName,
          layoutX: Math.cos((index / 10) * Math.PI * 2) * 100,
          layoutY: Math.sin((index / 10) * Math.PI * 2) * 100,
          createdAtRound: 0,
        },
      })
    )
  );

  return NextResponse.json({
    success: true,
    world: {
      id: world.id,
      name: world.name,
      seed: world.seed,
    },
    placesCreated: places.length,
  });
}
