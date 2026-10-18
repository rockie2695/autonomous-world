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
import { CONFIG } from "@/lib/gameConfig";

export async function GET(request: NextRequest) {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // 使用 Zod 驗證查詢參數 / Validate query parameters with Zod
  const { searchParams } = new URL(request.url);
  const queryResult = WorldStateQuerySchema.safeParse({
    round: searchParams.get("round"),
  });
  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.issues[0].message },
      { status: 400 },
    );
  }
  const { round } = queryResult.data;

  // 尋找活躍的世界 / Find the active world
  const world = await prisma.world.findFirst({
    where: { active: true },
  });
  if (!world) {
    return NextResponse.json(
      { error: "No active world found" },
      { status: 404 },
    );
  }
  // 檢查回合是否有效 / Check if round is valid
  if (round > world.currentRound) {
    return NextResponse.json(
      { error: "Round has not occurred yet" },
      { status: 400 },
    );
  }
  // ── 地圖聚光燈與移動動畫資料（依事件表計算，快照與即時路徑共用）/─
  // Map spotlight + move-animation data (computed from the events table;
  // shared by the snapshot and live paths)
  const spotlightFrom = Math.max(0, round - CONFIG.SPOTLIGHT_ROUNDS + 1);
  const recentEvents = await prisma.event.findMany({
    where: {
      worldId: world.id,
      round: { gte: spotlightFrom, lte: round },
      type: {
        in: [
          "PLACE_CREATED",
          "PLACE_CAPTURED",
          "BATTLE_DEATH",
          "ESCAPE_SUCCESS",
          "CHARACTER_MOVED",
        ],
      },
    },
    select: { round: true, type: true, data: true },
  });

  const createdSet = new Set<string>();
  const attackedSet = new Set<string>();
  const moves: Array<{
    fromPlaceId: string;
    toPlaceId: string;
    factionId: string | null;
  }> = [];
  for (const ev of recentEvents) {
    const raw = ev.data as unknown;
    if (typeof raw !== "object" || raw === null) continue;
    const data = raw as Record<string, unknown>;

    if (ev.type === "CHARACTER_MOVED") {
      // 動畫只播放「當前顯示回合」的移動 / Animate only the displayed round's moves
      if (ev.round !== round) continue;
      const from = data.fromPlaceId;
      const to = data.toPlaceId;
      if (typeof from === "string" && typeof to === "string") {
        moves.push({
          fromPlaceId: from,
          toPlaceId: to,
          factionId: typeof data.factionId === "string" ? data.factionId : null,
        });
      }
      continue;
    }

    const placeId = data.placeId;
    if (typeof placeId !== "string") continue;
    if (ev.type === "PLACE_CREATED") createdSet.add(placeId);
    else attackedSet.add(placeId); // PLACE_CAPTURED / BATTLE_DEATH / ESCAPE_SUCCESS
  }
  const spotlights = [...createdSet, ...[...attackedSet].filter(
    (id) => !createdSet.has(id),
  )].map((placeId) => ({
    placeId,
    kind: createdSet.has(placeId)
      ? ("created" as const)
      : ("attacked" as const),
  }));

  // 嘗試先取得快照 / Try to get snapshot first
  const snapshot = await prisma.roundSnapshot.findUnique({
    where: {
      worldId_round: {
        worldId: world.id,
        round,
      },
    },
  });
  if (snapshot) {
    // 解壓縮並回傳快照資料 / Decompress and return snapshot data
    // Prisma 7 對 Bytes 欄位回傳 Uint8Array，轉換為 Buffer
    // Prisma 7 returns Uint8Array for Bytes fields, convert to Buffer
    const buffer = Buffer.from(snapshot.data);
    const state = decompressSnapshot(buffer);
    // 快照內嵌的 world.currentRound 是「快照當下的回合」，會讓時間軸在觀看
    // 舊回合時縮短到該回合 — 一律覆寫為即時的最新回合 /
    // The snapshot's embedded world.currentRound is the round at capture time,
    // which would shrink the timeline when viewing an old round — always
    // override it with the live latest round.
    return NextResponse.json({
      ...state,
      world: { ...state.world, currentRound: world.currentRound },
      spotlights,
      moves,
    });
  }
  // 沒有可用的快照 — 查詢即時資料 / No snapshot available — query live data
  // 這是沒有快照的回合的後備方案 / This is a fallback for rounds without snapshots
  const [places, factions, characters, roads, friendships, discontents] = await Promise.all([
    prisma.place.findMany({
      where: { worldId: world.id },
      select: {
        id: true,
        name: true,
        factionId: true,
        administratorId: true,
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
        // The place popup recomputes what a place actually pays its administrator, and the
        // king's own cut comes off the top — so the client needs to know who the king is.
        kingId: true,
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
    ti: true,
        jing: true,
        speed: true,
        loyalty: true,
        defectionBase: true,
        age: true,
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
    // 友誼與不滿以**扁平的一對**送出，與 `roads` 完全相同。將領彈窗要回答
    // 「他有哪些朋友、對哪些人不滿」，這兩個問題都只是「哪一列的 aId 或 bId 是他」，
    // 所以不需要 per-character 巢狀結構——那會把每個人的資料膨脹成每條關係一份。
    //
    // Friendships and discontents ship as **flat pairs**, exactly like `roads`. The leader
    // popup has to answer "who are they friends with, who are they unhappy with", and both
    // reduce to "which rows have this id as an endpoint" — so a per-character nested shape
    // would duplicate every relationship into every character that owns one.
    //
    // 雙向的關係在這裡**兩個方向都送**（不滿是互相的，友誼本來就是），由客戶端反轉。
    //
    // Bidirectional relations arrive with **both** directions here (discontent is mutual and
    // friendship always was); the client inverts them.
    prisma.friendship.findMany({
      where: { worldId: world.id },
      select: { aId: true, bId: true, sinceRound: true },
    }),
    prisma.discontent.findMany({
      where: { worldId: world.id },
      select: { aId: true, bId: true, sinceRound: true },
    }),
  ]);

  /**
   * 本回合的 DefectionEvent：叛變值的「事件部分」就是這些 delta 的總和。
   *
   * 只取**本回合**，因為叛變值每回合重算，而歷史紀錄在這裡沒有作用：它們是不同回合
   * 的 delta，把跨回合的加總塞進一個「本回合的叛變值」只會讓那個數字沒有定義。
   *
   * This round's DefectionEvents: the "events" part of the defection value is their delta sum.
   *
   * Only **this round**, because the value is recomputed every round. History has no role
   * here: summing deltas across rounds would give the number no meaning.
   */
  const roundDefectionEvents = await prisma.defectionEvent.findMany({
    where: { worldId: world.id, round },
    select: { charId: true, delta: true, reason: true },
    orderBy: { round: 'asc' },
  });

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
    friendships,
    discontents,
    spotlights,
    moves,
    roundDefectionEvents,
  });
}
