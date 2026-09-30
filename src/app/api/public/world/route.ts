// ============================================================================
// 公開世界資料（免登入唯讀）/ Public World Data (Unauthenticated, Read-Only)
// ============================================================================
// 首頁是給「尚未登入」的訪客看的，但 /api/world/* 全部需要認證，兩邊對不上。
// 這個端點只為首頁存在：回傳聚合後的世界現況，讓公開首頁顯示真實數字與
// 真實勢力圖，而不是編造的展示值。
// The homepage serves signed-out visitors, but every /api/world/* route
// requires auth — so the public page could not read real data. This route
// exists only for the homepage: it returns an aggregated view of the running
// world so the landing page can show real numbers and a real faction graph
// instead of invented display values.
//
// GET /api/public/world
//
// 認證 / Authentication: 刻意不需要 / Intentionally none.
//   使用者已明確同意讓世界狀態對未登入訪客可讀（僅讀取，無任何寫入路徑）。
//   The user explicitly accepted exposing world state to signed-out visitors.
//   This route is strictly read-only: it exposes no admin, mutation, or
//   session surface, and returns no personal data — only settlement names,
//   faction names, and aggregate counts.
//
// 查詢 / Query: 無參數 / no parameters
//
// 回應 / Response: PublicWorldPayload（見下方 type）
//   計數一律為完整值；graph 為下采樣後的子集，truncated 標示是否被截斷。
//   All counts are complete; `graph` is a down-sampled subset and `truncated`
//   says whether it was cut down.
//
// 快取 / Caching: no-store — 這是即時資料，不可被快取。
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type {
  PublicEvent,
  PublicFaction,
  PublicPlace,
  PublicRoad,
  PublicWorldPayload,
} from '@/lib/publicWorld';

// 每次請求都要重新查詢，不可靜態快取 / Never statically cached
export const dynamic = 'force-dynamic';

// ─── 下采樣 / Down-sampling ────────────────────────────────────────────────
// 世界最大可有 CONFIG.PLACE_MAX_COUNT (2000) 個據點（見 lib/gameConfig）。
// 首頁不需要全部，但又不能直接「依駐軍取前 N」—— 那會挑出空間上散落的據點，
// 圖看起來是一堆孤立的光點。改成先把佈局切成方格、再從每格依駐軍轮流取值，
// 世界形狀與各勢力的分佈都留得住。
// The world can grow to CONFIG.PLACE_MAX_COUNT (2000) settlements. Taking the
// top N by garrison would scatter them across the map and the graph would read
// as loose dots, so the layout is bucketed into a grid and garrison-ranked
// within each bucket, then filled round-robin: the world's shape and the
// distribution of factions both survive.

/** 送出的據點上限 / Max settlements sent to the client */
const MAX_PLACES = 400;

/** 抽樣方格邊長（世界單位）/ bucket edge length in world units */
const BUCKET_SIZE = 120;

/** 送出的道路上限 / Max roads sent to the client */
const MAX_ROADS = 600;

/** 送出的近期事件數 / Recent events sent to the client */
const EVENT_LIMIT = 14;

/**
 * 方格輪流抽樣：每格內依駐軍排序，再一格一格各取一個，直到湊滿上限。
 * Round-robin across buckets: rank each bucket by garrison, then take one from
 * each bucket in turn until the cap is reached.
 */
function samplePlaces<T extends { layoutX: number; layoutY: number; garrison: number }>(
  all: T[]
): T[] {
  if (all.length <= MAX_PLACES) return all;

  const buckets = new Map<string, T[]>();
  for (const place of all) {
    const key = `${Math.floor(place.layoutX / BUCKET_SIZE)}:${Math.floor(place.layoutY / BUCKET_SIZE)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(place);
    else buckets.set(key, [place]);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.garrison - a.garrison);
  }

  const selected: T[] = [];
  const groups = [...buckets.values()];
  for (let round = 0; selected.length < MAX_PLACES; round += 1) {
    let addedThisRound = 0;
    for (const bucket of groups) {
      const place = bucket[round];
      if (!place) continue;
      selected.push(place);
      addedThisRound += 1;
      if (selected.length >= MAX_PLACES) break;
    }
    // 所有格子都取完了 / every bucket is exhausted
    if (addedThisRound === 0) break;
  }

  return selected;
}

// ─── 處理器 / Handler ─────────────────────────────────────────────────────

export async function GET() {
  const world = await prisma.world.findFirst({ where: { active: true } });

  if (!world) {
    return NextResponse.json(
      { error: 'No active world found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const worldId = world.id;

  const [
    aliveFactions,
    aliveCharacters,
    totalPlaces,
    ownedPlaces,
    totalRoads,
    troopSum,
    factionRows,
    allPlaces,
    factionPlaces,
    factionCharacters,
    recentEvents,
  ] = await Promise.all([
    // ── 完整計數（首頁顯示的就是這些數字）────────────────────────────────
    // Complete counts — these are the numbers the homepage shows.
    prisma.faction.count({ where: { worldId, alive: true } }),
    prisma.character.count({ where: { worldId, alive: true } }),
    prisma.place.count({ where: { worldId } }),
    prisma.place.count({ where: { worldId, factionId: { not: null } } }),
    prisma.road.count({ where: { worldId } }),
    prisma.character.aggregate({
      where: { worldId, alive: true },
      _sum: { troops: true },
    }),

    // ── 勢力清單（含真實色票）──────────────────────────────────────────
    // Faction roster with the real colour values.
    prisma.faction.findMany({
      where: { worldId, alive: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    }),

    // ── 圖譜據點：先取全部的輕量欄位，再做方格輪流抽樣 ──────────────────
    // Graph settlements: fetch the light columns, then sample by grid
    prisma.place.findMany({
      where: { worldId },
      select: {
        id: true,
        factionId: true,
        layoutX: true,
        layoutY: true,
        garrison: true,
      },
    }),

    prisma.place.groupBy({
      by: ['factionId'],
      where: { worldId, factionId: { not: null } },
      _count: { _all: true },
    }),
    prisma.character.groupBy({
      by: ['factionId'],
      where: { worldId, alive: true, factionId: { not: null } },
      _count: { _all: true },
      _sum: { troops: true },
    }),

    // 回合倒序抓最新事件，最後再翻正成時間正序給 ticker 用
    // Fetch newest-first, then reverse into chronological order for the ticker.
    prisma.event.findMany({
      where: { worldId },
      orderBy: [{ round: 'desc' }, { createdAt: 'asc' }],
      take: EVENT_LIMIT,
      select: { type: true, round: true, data: true },
    }),
  ]);

  // ── 依勢力彙整領地 / 將領 / 兵力 ───────────────────────────────────────
  // Aggregate places / characters / troops per faction.
  const placesByFaction = new Map<string, number>();
  for (const row of factionPlaces) {
    if (row.factionId) {
      placesByFaction.set(row.factionId, row._count._all);
    }
  }
  const charactersByFaction = new Map<string, { count: number; troops: number }>();
  for (const row of factionCharacters) {
    if (row.factionId) {
      charactersByFaction.set(row.factionId, {
        count: row._count._all,
        troops: row._sum.troops ?? 0,
      });
    }
  }

  const factions: PublicFaction[] = factionRows
    .map((faction) => {
      const stats = charactersByFaction.get(faction.id);
      return {
        id: faction.id,
        name: faction.name,
        color: faction.color,
        places: placesByFaction.get(faction.id) ?? 0,
        characters: stats?.count ?? 0,
        troops: stats?.troops ?? 0,
      };
    })
    // 勢力大小是首頁最想讓人一眼看到的排序依據
    // Territory count is the ordering the homepage most needs to read at a glance.
    .sort((a, b) => b.places - a.places || a.name.localeCompare(b.name));

  // ── 圖譜：據點已抽樣，道路要兩端都還在圖上才留 ───────────────────────
  // Graph: settlements are sampled; a road survives only if both of its
  // endpoints survived, so the client never renders a dangling edge.
  const placeRows = samplePlaces(allPlaces);
  const keptPlaceIds = new Set(placeRows.map((place) => place.id));
  const truncated = allPlaces.length > placeRows.length;

  const roadRows = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  const roads: PublicRoad[] = [];
  for (const road of roadRows) {
    if (roads.length >= MAX_ROADS) break;
    if (keptPlaceIds.has(road.aId) && keptPlaceIds.has(road.bId)) {
      roads.push(road);
    }
  }

  // ── 事件：補上移動事件的地名，前端免再查一次 ─────────────────────────
  // Events: resolve move place names once here so the client never re-queries.
  const movePlaceIds = new Set<string>();
  for (const event of recentEvents) {
    if (event.type !== 'CHARACTER_MOVED') continue;
    const data = event.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      if (typeof record.fromPlaceId === 'string') movePlaceIds.add(record.fromPlaceId);
      if (typeof record.toPlaceId === 'string') movePlaceIds.add(record.toPlaceId);
    }
  }

  const placeNameById = new Map<string, string>();
  if (movePlaceIds.size > 0) {
    const named = await prisma.place.findMany({
      where: { id: { in: [...movePlaceIds] } },
      select: { id: true, name: true },
    });
    for (const place of named) {
      placeNameById.set(place.id, place.name);
    }
  }

  const events: PublicEvent[] = recentEvents.map((event) => {
    if (event.type !== 'CHARACTER_MOVED') return event;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return event;
    const record = data as Record<string, unknown>;
    return {
      ...event,
      data: {
        ...record,
        fromPlaceName:
          typeof record.fromPlaceId === 'string'
            ? (placeNameById.get(record.fromPlaceId) ?? null)
            : null,
        toPlaceName:
          typeof record.toPlaceId === 'string'
            ? (placeNameById.get(record.toPlaceId) ?? null)
            : null,
      },
    };
  });

  // 翻成時間正序，讓 ticker 直接順著播 / Chronological, so the ticker just plays on
  events.reverse();

  const payload: PublicWorldPayload = {
    world: { name: world.name, round: world.currentRound },
    counts: {
      factions: aliveFactions,
      characters: aliveCharacters,
      places: totalPlaces,
      ownedPlaces,
      unownedPlaces: totalPlaces - ownedPlaces,
      roads: totalRoads,
      troops: troopSum._sum.troops ?? 0,
    },
    factions,
    graph: {
      places: placeRows.map((place) => ({
        id: place.id,
        factionId: place.factionId,
        x: place.layoutX,
        y: place.layoutY,
        garrison: place.garrison,
      })),
      roads,
      truncated,
    },
    recentEvents: events,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
