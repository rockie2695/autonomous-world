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
  //
  // 兩種模式都**由舊到新**（聊天式）：回合升冪、回合內依建立時間。
  // 所有回合的模式原本是 `round: 'desc'`，配合前端的 `.reverse()` 剛好也是由舊到新；
  // 但那兩個寫法互相依賴，只要其中一邊改了就會整個翻面——而且單一回合分支根本沒有
  // `desc`，所以同一個 endpoint 對兩種查詢會給出**相反**的順序。這裡只留一種順序。
  //
  // Both modes are **oldest to newest** (chat-style): round ascending, then createdAt within
  // the round. The all-rounds mode used to say `round: 'desc'` and rely on the client's
  // `.reverse()` to land back on oldest-first — two halves depending on each other, so
  // changing either one flips the whole thing. Worse, the single-round branch had no `desc`
  // at all, so one endpoint returned **opposite** orders depending on the query. One order
  // now, no reversal on either side.
  //
  // `id` 是最後的破平手，而且不是裝飾：Postgres 的 timestamp 比較到毫秒，同一回合裡
  // 連續寫入的事件常常落在同一毫秒，沒有這一層排序它們的先後是**未定義**的。這正是
  // 「順序有時候對、有時候錯」而不是穩定錯掉的原因。
  //
  // The `id` tiebreak is load-bearing, not decorative: Postgres compares timestamps at
  // millisecond resolution, and events written back to back within a round routinely land in
  // the same millisecond, leaving their order **undefined** without it. That is what makes an
  // ordering bug look intermittent instead of consistently wrong.
  const events = await prisma.event.findMany({
    where: {
      worldId: world.id,
      ...(round !== undefined ? { round } : {}),
    },
    orderBy: [{ round: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  // 讀取時 enrich：只存 placeId 的事件補上地名（讀取時 join 讓舊事件也能顯示地名，
  // 不需回填資料庫）。`CHARACTER_SPAWNED` 與 `CHILD_BORN` 的 `placeName` 雖然已經隨事件
  // 一起寫入，但**舊事件沒有**，所以這裡照樣由 id 補名——否則那幾回合的「誕生於」會是
  // 一個沒有文字的按鈕。
  //
  // Read-time enrichment: events that store only a placeId get the name joined here, so legacy
  // rows render names without a DB backfill. `CHARACTER_SPAWNED` and `CHILD_BORN` now write
  // `placeName` alongside the id, but rows written before that do not, so the name is still
  // resolved by id here — otherwise those rounds' birthplace would be a button with no label.
  const movedPlaceIds = new Set<string>();
  for (const event of events) {
    if (event.type === 'CHARACTER_MOVED') {
      const data = event.data as { fromPlaceId?: string; toPlaceId?: string };
      if (data.fromPlaceId) movedPlaceIds.add(data.fromPlaceId);
      if (data.toPlaceId) movedPlaceIds.add(data.toPlaceId);
    } else if (event.type === 'CHARACTER_SPAWNED' || event.type === 'CHILD_BORN') {
      const data = event.data as { placeId?: string; placeName?: unknown };
      if (data.placeId) movedPlaceIds.add(data.placeId);
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

    // 出生地只有**一個** id，所以不像 CHARACTER_MOVED 需要兩個欄位；而且只在事件本身
    // 沒有名稱時才補——已寫入 `placeName` 的新事件直接沿用它，不覆蓋。
    //
    // A birthplace has only **one** id, so unlike CHARACTER_MOVED there is no second field —
    // and it is only filled when the event does not already carry a name, so rows written with
    // `placeName` keep theirs rather than being overwritten.
    const spawnPlace =
      placeNameById &&
      (event.type === 'CHARACTER_SPAWNED' || event.type === 'CHILD_BORN') &&
      typeof data.placeId === 'string' &&
      typeof data.placeName !== 'string'
        ? { placeId: data.placeId }
        : null;

    if (!moved && !charId && !spawnPlace) return event;
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
        ...(spawnPlace
          ? { placeName: placeNameById!.get(spawnPlace.placeId) ?? null }
          : {}),
      },
    };
  });

  return NextResponse.json({ events: enriched });
}
