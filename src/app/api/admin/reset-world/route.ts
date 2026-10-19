// ============================================================================
// API 路由 — 重置世界（僅管理員）/ API Route — Reset World (Admin Only)
// ============================================================================
// 建立新世界，並停用目前的世界。
// Creates a new world, deactivating the current one.
// 需要客戶端 double confirmation。
// Requires double confirmation from the client.
//
// 新世界的初始化與 `prisma/seed.ts` **共用同一份**（`server/initWorld.ts`）：
// 完整地方集、地理 MST + 補邊道路、ForceAtlas2 佈局、君王 + 勢力 + 行政官。
// 修復前這裡只建 10 個佔位地點（圓圈擺位）——沒有道路、沒有勢力、沒有君王，
// 重置出的世界跑不起來（全是無主之地，沒有人會出生，經濟完全不轉）。
//
// The new world's initialisation is **shared** with `prisma/seed.ts`
// (`server/initWorld.ts`): the full place set, geographic-MST roads, a ForceAtlas2
// layout, king + faction + administrators. Before the fix this route created just
// 10 placeholder places on a circle — no roads, no faction, no king — and the reset
// world could not run (all land unowned, nobody would ever spawn, the economy never
// turned).
//
// POST /api/admin/reset-world
// 請求本體 / Body: { name: string, confirm: boolean }
// 回應 / Response: { success: true, world: { id, name, seed }, placesCreated, roadCount }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { createRng } from '@/lib/rng';
import { ResetWorldBodySchema } from '@/lib/validations';
import {
  initializeWorld,
  finalizeWorldCreation,
} from '../../../../../server/initWorld';

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
  const rng = createRng(seed);

  // 建立新世界 / Create the new world
  const world = await prisma.world.create({
    data: {
      name,
      seed,
      rngState: rng.getState(),
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

  // 完整初始化（與 seed 同一份）+ 收尾：round 0 快照 → 推進到 round 1 /
  // Full initialisation (the same one seed uses) + finalisation: the round-0
  // snapshot, then advancing to round 1
  const result = await initializeWorld(world.id, rng);
  await finalizeWorldCreation(world.id, rng);

  return NextResponse.json({
    success: true,
    world: {
      id: world.id,
      name: world.name,
      seed: world.seed,
    },
    placesCreated: result.placeCount,
    roadCount: result.roadCount,
  });
}
