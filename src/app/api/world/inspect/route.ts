// ============================================================================
// API 路由 — 回合檢查器 / API Route — Round Inspector
// ============================================================================
// 「這一回合發生了什麼、花了多少時間」——以前只能手寫 SQL 連資料庫查（而且每次
// 都要重新想一遍查什麼）。現在回合的**量測**跟著快照一起存下來（各階段耗時 +
// 摘要），這個端點把它讀出來，再加上事件種類的分佈。
//
// "What happened this round, and where did the time go" - before, that meant
// hand-writing SQL against the database (and re-thinking the query every time).
// The round's **measurements** now travel with the snapshot (per-phase durations
// plus a summary), and this endpoint reads them back and adds the event mix.
//
// GET /api/world/inspect?round=N
// 回應 / Response: {
//   round, servedFrom: 'snapshot' | 'live', durationMs, phases, summary,
//   eventTypes: { type, count }[], counts: { places, characters, factions, roads }
// }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { decompressSnapshot, type WorldStateMeta } from '@/lib/snapshot';
import { getSelectedWorldId } from '@/lib/worldSelect';
import { withRetry } from '@/lib/retry';

export async function GET(request: NextRequest) {
  // 需要認證 / Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const worldId = await getSelectedWorldId();
  if (!worldId) {
    return NextResponse.json(
      { error: 'No world found' },
      { status: 404 }
    );
  }
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    return NextResponse.json(
      { error: 'No active world found' },
      { status: 404 }
    );
  }

  const roundParam = searchParams.get('round');
  const round =
    roundParam === null ? world.currentRound : Number.parseInt(roundParam, 10);
  if (!Number.isInteger(round) || round < 0) {
    return NextResponse.json(
      { error: 'round must be a non-negative integer' },
      { status: 400 }
    );
  }

  // 快照帶著量測；沒有快照的回合（例如剛跑完、還在寫的那一回合）走即時路徑 /
  // The snapshot carries the measurements; rounds without one (a round that just
  // finished and is still being written) fall back to the live path.
  const snapshot = await prisma.roundSnapshot.findUnique({
    where: {
      worldId_round: {
        worldId: world.id,
        round,
      },
    },
  });

  let meta: WorldStateMeta | undefined;
  let counts: { places: number; characters: number; factions: number; roads: number };
  let servedFrom: 'snapshot' | 'live';

  if (snapshot) {
    const state = decompressSnapshot(Buffer.from(snapshot.data));
    meta = state.meta;
    counts = {
      places: state.places.length,
      characters: state.characters.length,
      factions: state.factions.length,
      roads: state.roads.length,
    };
    servedFrom = 'snapshot';
  } else {
    const [places, characters, factions, roads] = await Promise.all([
      prisma.place.count({ where: { worldId: world.id } }),
      prisma.character.count({ where: { worldId: world.id } }),
      prisma.faction.count({ where: { worldId: world.id } }),
      prisma.road.count({ where: { worldId: world.id } }),
    ]);
    counts = { places, characters, factions, roads };
    servedFrom = 'live';
  }

  // 這一回合的事件種類分佈（快照裡沒有，只能即時數）/
  // This round's event mix (not in the snapshot, so it is counted live)
  const grouped = await withRetry(() =>
    prisma.event.groupBy({
      by: ['type'],
      where: { worldId: world.id, round },
      _count: { _all: true },
    })
  );

  return NextResponse.json({
    round,
    servedFrom,
    durationMs: meta?.durationMs ?? null,
    phases: meta?.phases ?? [],
    summary: meta?.summary ?? null,
    eventTypes: grouped
      .map((g) => ({ type: g.type, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    counts,
  });
}