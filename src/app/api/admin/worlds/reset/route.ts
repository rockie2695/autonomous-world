// ============================================================================
// API 路由 — 重置指定世界（僅管理員）/ API Route — Reset a Specific World (Admin Only)
// ============================================================================
// 把**指定的世界**就地重置：拆除它的全部遊戲資料，然後用**同一個 world id** 重新
// 走一遍 `initWorld`（與 seed / create-world 共用）——世界還在、名字不變、歷史歸零、
// `currentRound` 回到 1。與 `POST /api/admin/reset-world` 的差別：那條路是「建一個
// 新世界並讓它成為唯一預設」；這裡是「把**你指著的**這個世界打掉重練」。
//
// Resets a **specific** world in place: its entire game dataset is torn down, then
// `initWorld` (shared with seed / create-world) runs again against the **same world
// id** — the world survives with its name, its history is zeroed, and
// `currentRound` returns to 1. Unlike `POST /api/admin/reset-world` (which creates a
// NEW world and makes it the sole default), this is "tear down and rebuild the world
// you are pointing at".
//
// 護欄 / Guards:
// - `confirm: true`（客端雙重確認，與 reset-world 同一約定）/ client double confirmation
// - 該世界有回合正在跑（記憶體工作或 DB 旗標）→ 409，不能重置一半的回合
//   a round running for that world (in-memory job or the DB flag) → 409; never
//   reset underneath a running round
//
// POST /api/admin/worlds/reset
// 請求本體 / Body: { worldId: string, confirm: true }
// 回應 / Response: { success: true, world: { id, name, seed }, placesCreated, roadCount }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, isAdmin } from '@/lib/auth';
import { createRng } from '@/lib/rng';
import { ResetWorldByIdSchema } from '@/lib/validations';
import { getRoundJob } from '../../../../../../server/roundJob';
import { teardownWorldData } from '../../../../../../server/teardownWorld';
import {
  initializeWorld,
  finalizeWorldCreation,
} from '../../../../../../server/initWorld';

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
  const bodyResult = ResetWorldByIdSchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: bodyResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { worldId } = bodyResult.data;

  // 世界必須存在 / The world must exist
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

  // 有回合正在跑就不能重置：記憶體工作（本行程）或 DB 旗標（別的行程）都算。
  // 在跑動中的回合底下拆資料，等於把工作腳下的地板抽掉。
  // A running round blocks the reset: an in-memory job (this process) or the DB
  // flag (another process) both count. Tearing data down under a running round
  // pulls the floor out from under the job.
  if (world.roundRunning || getRoundJob(world.id)?.status === 'running') {
    return NextResponse.json(
      { error: 'A round is running for this world; wait for it to finish' },
      { status: 409 }
    );
  }

  // 從時間戳記 + 隨機數產生唯一种子（與 reset-world / create-world 同一式）/
  // Generate a unique seed from timestamp + random (the same expression
  // reset-world / create-world use)
  const seed = `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rng = createRng(seed);

  // 拆除（一筆交易）→ 同一個 world id 重新初始化 → 收尾（round-0 快照、currentRound: 1）。
  // 新 seed 與 `currentRound: 0`、清掉的 roundRunning 旗標隨拆除交易一起寫。
  // Teardown (one transaction) → re-initialise the SAME world id → finalise
  // (round-0 snapshot, currentRound: 1). The new seed, `currentRound: 0` and the
  // cleared roundRunning flag ride inside the teardown transaction.
  await teardownWorldData(world.id, {
    seed,
    rngState: rng.getState(),
    currentRound: 0,
    roundRunning: false,
    roundStartedAt: null,
  });
  const result = await initializeWorld(world.id, rng);
  await finalizeWorldCreation(world.id, rng);

  return NextResponse.json({
    success: true,
    world: {
      id: world.id,
      name: world.name,
      seed,
    },
    placesCreated: result.placeCount,
    roadCount: result.roadCount,
  });
}
