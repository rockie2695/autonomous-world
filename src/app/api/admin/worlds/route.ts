// ============================================================================
// API 路由 — 建立新世界（僅管理員）/ API Route — Create World (Admin Only)
// ============================================================================
// 建立一個**額外**的世界。與 reset-world 的差別：這裡**不**停用任何既有世界——
// 多世界的 active 是「代表世界」的標記（沒有選擇 cookie 的人落在它身上），
// 不是互斥開關；選擇權在使用者的 cookie 裡。
//
// Creates an **additional** world. Unlike reset-world, this deactivates nothing —
// with multiple worlds, `active` marks the "default" world (where a visitor with
// no selection cookie lands), not an exclusive switch; the choice lives in each
// user's cookie.
//
// 初始化與 seed / reset **共用同一份**（server/initWorld.ts）：完整地方集、
// 地理 MST 道路、ForceAtlas2 佈局、君王 + 勢力 + 行政官、round 0 快照。
// Initialisation is **shared** with seed / reset (server/initWorld.ts): the full
// place set, geographic-MST roads, a ForceAtlas2 layout, king + factions +
// administrators, the round-0 snapshot.
//
// 成功時把選擇 cookie 指向新世界——「建了就切過去」是唯一合理的下一步。
// On success the selection cookie points at the new world — "create then land on
// it" is the only sensible next step.
//
// POST /api/admin/worlds      body: { name: string }
// 回應 / Response: { success: true, world: { id, name, seed }, placesCreated, roadCount }
// DELETE /api/admin/worlds    body: { worldId: string, confirm: true } — 刪除世界（見下方）
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { createRng } from '@/lib/rng';
import { CreateWorldBodySchema, DeleteWorldSchema } from '@/lib/validations';
import {
  WORLD_COOKIE,
  WORLD_COOKIE_MAX_AGE,
  getSelectedWorldId,
} from '@/lib/worldSelect';
import { teardownWorldData } from '../../../../../server/teardownWorld';
import { getRoundJob } from '../../../../../server/roundJob';
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
  const bodyResult = CreateWorldBodySchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: bodyResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name } = bodyResult.data;

  // 從時間戳記 + 隨機數產生唯一种子（與 reset-world 同一式）/ Generate a unique
  // seed from timestamp + random (the same expression reset-world uses)
  const seed = `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rng = createRng(seed);

  // 建立世界（**不**動其他世界）+ 完整初始化 + 收尾 /
  // Create the world (**touching nothing else**) + full initialisation + finalisation
  const world = await prisma.world.create({
    data: {
      name,
      seed,
      rngState: rng.getState(),
      active: false,
    },
  });

  const result = await initializeWorld(world.id, rng);
  await finalizeWorldCreation(world.id, rng);

  // 建了就切過去：選擇 cookie 指向新世界 / Land on it: the selection cookie
  // points at the new world
  const response = NextResponse.json({
    success: true,
    world: {
      id: world.id,
      name: world.name,
      seed: world.seed,
    },
    placesCreated: result.placeCount,
    roadCount: result.roadCount,
  });
  response.cookies.set(WORLD_COOKIE, world.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WORLD_COOKIE_MAX_AGE,
  });
  return response;
}

// ============================================================================
// 刪除世界（僅管理員）/ Delete a world (Admin Only)
// ============================================================================
// 拆除指定世界的全部遊戲資料，再把 World 列本身刪掉。護欄：
// - `confirm: true`（客端雙重確認）/ client double confirmation
// - 該世界有回合正在跑 → 409（記憶體工作或 DB 旗標都算）
// - **最後一個世界不能刪**：刪光所有世界後，每個路由都會 404，遊戲頁沒有東西
//   可以顯示——至少要留一個。
// - 若刪的是**目前選中**的世界，清掉選擇 cookie：讓 `getSelectedWorldId()` 的
//   fallback（active 世界）接手，而不是留著一個指向已刪世界的 cookie。
//
// Tears down the world's entire game dataset, then deletes the World row itself.
// Guards:
// - `confirm: true` (client double confirmation)
// - a round running for that world → 409 (in-memory job or the DB flag both count)
// - **the last world cannot be deleted**: with zero worlds every route 404s and the
//   game page has nothing to show — at least one must remain
// - if the deleted world was the **selected** one, the selection cookie is cleared so
//   `getSelectedWorldId()`'s fallback (the active world) takes over, rather than a
//   cookie pointing at a world that no longer exists
//
// DELETE /api/admin/worlds
// 請求本體 / Body: { worldId: string, confirm: true }
// 回應 / Response: { success: true, deletedId: string }
// ============================================================================
export async function DELETE(request: Request) {
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
  const bodyResult = DeleteWorldSchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: bodyResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { worldId } = bodyResult.data;

  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { id: true, name: true, roundRunning: true },
  });
  if (!world) {
    return NextResponse.json(
      { error: 'World not found' },
      { status: 404 }
    );
  }

  // 有回合正在跑就不能刪 / A running round blocks the delete
  if (world.roundRunning || getRoundJob(world.id)?.status === 'running') {
    return NextResponse.json(
      { error: 'A round is running for this world; wait for it to finish' },
      { status: 409 }
    );
  }

  // 最後一個世界不能刪 / The last world cannot be deleted
  const worldCount = await prisma.world.count();
  if (worldCount <= 1) {
    return NextResponse.json(
      { error: 'Cannot delete the last remaining world' },
      { status: 400 }
    );
  }

  // 拆除遊戲資料（一筆交易），再刪 World 列本身 /
  // Tear the game data down (one transaction), then delete the World row itself
  await teardownWorldData(world.id);
  await prisma.world.delete({ where: { id: world.id } });

  // 若刪的是選中的世界 → 清 cookie，fallback（active 世界）接手 /
  // If the deleted world was the selected one → clear the cookie so the fallback
  // (the active world) takes over
  const response = NextResponse.json({
    success: true,
    deletedId: world.id,
  });
  const selectedId = await getSelectedWorldId();
  if (selectedId === world.id) {
    response.cookies.delete(WORLD_COOKIE);
  }
  return response;
}
