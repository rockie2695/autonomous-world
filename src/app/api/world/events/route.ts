// ============================================================================
// API 路由 — 取得事件 / API Route — Get Events
// ============================================================================
// 回傳所有回合（或指定單一回合）的事件。
// Returns events for all rounds, or for a single round when round is given.
//
// GET /api/world/events[?round=N]
// 查詢參數 / Query params:
//   round（選填）— 僅回傳該回合；省略時回傳所有回合 /
//   round (optional) — only that round; omit to get all rounds
// 回應 / Response: { events: Event[] }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { EventsQuerySchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 使用 Zod 驗證查詢參數 / Validate query parameters with Zod
  // 注意：searchParams.get() 缺參數時回傳 null，而 z.coerce.number() 會把
  // null 轉成 0 — 必須先轉 undefined 才能真正省略 round /
  // NOTE: searchParams.get() returns null when absent and z.coerce.number()
  // turns null into 0 — map it to undefined so round is truly optional.
  const { searchParams } = new URL(request.url);
  const roundParam = searchParams.get('round');
  const queryResult = EventsQuerySchema.safeParse({
    round: roundParam === null ? undefined : roundParam,
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { round } = queryResult.data;

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

  // 取得事件（單一回合或所有回合）/ Fetch events (single round or all rounds)
  // 全部模式依回合倒序、回合內依建立時間正序（新的在前）/
  // All mode: round desc, createdAt asc within a round (newest round first)
  const events = await prisma.event.findMany({
    where: {
      worldId: world.id,
      ...(round !== undefined ? { round } : {}),
    },
    orderBy:
      round !== undefined
        ? { createdAt: 'asc' }
        : [{ round: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  // 讀取時 enrich：CHARACTER_MOVED 只存 placeId，補上地名（讀取時 join 讓
  // 舊事件也能顯示地名，不需回填資料庫）/
  // Read-time enrichment: CHARACTER_MOVED stores only placeIds — join place
  // names here so LEGACY events also render names without a DB backfill.
  const movedPlaceIds = new Set<string>();
  for (const event of events) {
    if (event.type === 'CHARACTER_MOVED') {
      const data = event.data as { fromPlaceId?: string; toPlaceId?: string };
      if (data.fromPlaceId) movedPlaceIds.add(data.fromPlaceId);
      if (data.toPlaceId) movedPlaceIds.add(data.toPlaceId);
    }
  }

  let placeNameById: Map<string, string> | null = null;
  if (movedPlaceIds.size > 0) {
    const places = await prisma.place.findMany({
      where: { id: { in: [...movedPlaceIds] } },
      select: { id: true, name: true },
    });
    placeNameById = new Map(places.map((p) => [p.id, p.name]));
  }

  // 舊事件只存 charName，用名字回查 charId 補上，讓事件日誌能準確開啟該將領
  // （改名或同名時以 id 為準）。仍然不寫回資料庫 /
  // Legacy events only stored charName — resolve it to a charId at read time so
  // the log can open the right leader even if a name was reused. Still no
  // DB backfill: resolution happens per response.
  const legacyCharNames = new Set<string>();
  for (const event of events) {
    const data = event.data as { charId?: unknown; charName?: unknown };
    if (typeof data.charId === 'string' && data.charId) continue;
    if (typeof data.charName === 'string' && data.charName) {
      legacyCharNames.add(data.charName);
    }
  }

  let charIdByName: Map<string, string> | null = null;
  if (legacyCharNames.size > 0) {
    const chars = await prisma.character.findMany({
      where: { worldId: world.id, name: { in: [...legacyCharNames] } },
      select: { id: true, name: true },
      // 存活優先：名字被沿用時要指向仍在的那位 / Prefer the living match first:
      // when a name was reused, point at the one still in play
      orderBy: { alive: 'desc' },
    });
    charIdByName = new Map<string, string>();
    for (const c of chars) {
      if (!charIdByName.has(c.name)) charIdByName.set(c.name, c.id);
    }
  }

  const enriched = events.map((event) => {
    const data = event.data as Record<string, unknown>;

    // 補 charId（舊事件）/ backfill charId for legacy events
    const needsCharId =
      (typeof data.charId !== 'string' || !data.charId) &&
      typeof data.charName === 'string' &&
      !!data.charName;
    const charId =
      needsCharId && charIdByName ? charIdByName.get(data.charName as string) : undefined;

    const moved =
      placeNameById && event.type === 'CHARACTER_MOVED'
        ? (data as { fromPlaceId?: string; toPlaceId?: string })
        : null;

    if (!moved && !charId) return event;
    return {
      ...event,
      data: {
        ...data,
        ...(charId ? { charId } : {}),
        ...(moved
          ? {
              fromPlaceName: moved.fromPlaceId
                ? placeNameById!.get(moved.fromPlaceId) ?? null
                : null,
              toPlaceName: moved.toPlaceId
                ? placeNameById!.get(moved.toPlaceId) ?? null
                : null,
            }
          : {}),
      },
    };
  });

  return NextResponse.json({ events: enriched });
}
