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

  const enriched = placeNameById
    ? events.map((event) => {
        if (event.type !== 'CHARACTER_MOVED') return event;
        const data = event.data as { fromPlaceId?: string; toPlaceId?: string };
        return {
          ...event,
          data: {
            ...data,
            fromPlaceName: data.fromPlaceId
              ? placeNameById.get(data.fromPlaceId) ?? null
              : null,
            toPlaceName: data.toPlaceId
              ? placeNameById.get(data.toPlaceId) ?? null
              : null,
          },
        };
      })
    : events;

  return NextResponse.json({ events: enriched });
}
