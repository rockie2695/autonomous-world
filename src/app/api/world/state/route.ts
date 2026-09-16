// ============================================================================
// API 路由 — 取得回合的世界狀態 / API Route — Get World State for a Round
// ============================================================================
// 回傳特定回合的完整遊戲狀態。
// Returns the complete game state for a specific round.
// 優先使用 RoundSnapshot，否則查詢即時資料。
// Uses RoundSnapshot if available, otherwise queries live data.
//
// GET /api/world/state?round=N
// 查詢參數 / Query params:
//   round（必填）— 要取得的回合數 / round (required) — Round number to fetch
// 回應 / Response: { world, places, factions, characters, roads }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { decompressSnapshot } from "@/lib/snapshot";
import { WorldStateQuerySchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("here 1");
  // 使用 Zod 驗證查詢參數 / Validate query parameters with Zod
  const { searchParams } = new URL(request.url);
  const queryResult = WorldStateQuerySchema.safeParse({
    round: searchParams.get("round"),
  });
  console.log("here 2");
  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.issues[0].message },
      { status: 400 },
    );
  }
  console.log("here 3");
  const { round } = queryResult.data;

  // 尋找活躍的世界 / Find the active world
  const world = await prisma.world.findFirst({
    where: { active: true },
  });
  console.log("here 4");
  if (!world) {
    return NextResponse.json(
      { error: "No active world found" },
      { status: 404 },
    );
  }
  console.log("here 5");
  // 檢查回合是否有效 / Check if round is valid
  if (round > world.currentRound) {
    return NextResponse.json(
      { error: "Round has not occurred yet" },
      { status: 400 },
    );
  }
  console.log("here 6");
  // 嘗試先取得快照 / Try to get snapshot first
  const snapshot = await prisma.roundSnapshot.findUnique({
    where: {
      worldId_round: {
        worldId: world.id,
        round,
      },
    },
  });
  console.log("here 7");
  if (snapshot) {
    // 解壓縮並回傳快照資料 / Decompress and return snapshot data
    // Prisma 7 對 Bytes 欄位回傳 Uint8Array，轉換為 Buffer
    // Prisma 7 returns Uint8Array for Bytes fields, convert to Buffer
    const buffer = Buffer.from(snapshot.data);
    const state = decompressSnapshot(buffer);
    return NextResponse.json(state);
  }
  console.log("here 8");
  // 沒有可用的快照 — 查詢即時資料 / No snapshot available — query live data
  // 這是沒有快照的回合的後備方案 / This is a fallback for rounds without snapshots
  const [places, factions, characters, roads] = await Promise.all([
    prisma.place.findMany({
      where: { worldId: world.id },
      select: {
        id: true,
        name: true,
        factionId: true,
        garrison: true,
        fortress: true,
        market: true,
        barracks: true,
        layoutX: true,
        layoutY: true,
      },
    }),
    prisma.faction.findMany({
      where: { worldId: world.id },
      select: {
        id: true,
        name: true,
        color: true,
        alive: true,
        collapsing: true,
      },
    }),
    prisma.character.findMany({
      where: { worldId: world.id },
      select: {
        id: true,
        name: true,
        factionId: true,
        wu: true,
        tong: true,
        jing: true,
        speed: true,
        ambition: true,
        troops: true,
        gold: true,
        placeId: true,
        alive: true,
        isKing: true,
      },
    }),
    prisma.road.findMany({
      where: { worldId: world.id },
      select: {
        id: true,
        aId: true,
        bId: true,
      },
    }),
  ]);

  return NextResponse.json({
    world: {
      id: world.id,
      name: world.name,
      currentRound: world.currentRound,
    },
    places,
    factions,
    characters,
    roads,
  });
}
