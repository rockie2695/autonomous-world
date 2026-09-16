// ============================================================================
// API 路由 — 取得統計資料（圖表資料）/ API Route — Get Statistics (Chart Data)
// ============================================================================
// 回傳統計圖表的時間序列資料。
// Returns time-series data for statistics charts.
//
// GET /api/world/stats?from=A&to=B
// 查詢參數 / Query params:
//   from（必填）— 起始回合數 / from (required) — Start round number
//   to（必填）— 結束回合數 / to (required) — End round number
// 回應 / Response: {
//   rounds: number[],
//   territories: number[],  // 每回合的勢力領地數 / Faction territory counts per round
//   troops: number[],       // 每回合的總兵力 / Total troops per round
//   gold: number[],         // 每回合的總金幣 / Total gold per round
//   characters: number[],   // 每回合的角色數 / Character counts per round
// }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { StatsQuerySchema } from '@/lib/validations';
import { decompressSnapshot } from '@/lib/snapshot';

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
  const { searchParams } = new URL(request.url);
  const queryResult = StatsQuerySchema.safeParse({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  });

  if (!queryResult.success) {
    return NextResponse.json(
      { error: queryResult.error.issues[0].message },
      { status: 400 }
    );
  }

  const { from, to } = queryResult.data;

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

  // 取得範圍內的快照 / Fetch snapshots for the range
  const snapshots = await prisma.roundSnapshot.findMany({
    where: {
      worldId: world.id,
      round: { gte: from, lte: to },
    },
    orderBy: { round: 'asc' },
  });

  // 解壓縮並提取統計資料 / Decompress and extract stats
  const rounds: number[] = [];
  const factionDataMap = new Map<string, {
    id: string;
    name: string;
    color: string;
    troops: number[];
    gold: number[];
    territories: number[];
  }>();

  for (const snapshot of snapshots) {
    try {
      const state = decompressSnapshot(Buffer.from(snapshot.data));
      rounds.push(snapshot.round);

      // 統計每個勢力的領地、兵力、金錢 / Count territories, troops, gold per faction
      const factionTroops = new Map<string, number>();
      const factionGold = new Map<string, number>();
      const factionTerritories = new Map<string, number>();

      // 計算領地數 / Count territories
      for (const place of state.places) {
        if (place.factionId) {
          factionTerritories.set(
            place.factionId,
            (factionTerritories.get(place.factionId) ?? 0) + 1
          );
        }
      }

      // 計算兵力和金錢 / Count troops and gold
      for (const char of state.characters) {
        if (char.alive && char.factionId) {
          factionTroops.set(
            char.factionId,
            (factionTroops.get(char.factionId) ?? 0) + char.troops
          );
          factionGold.set(
            char.factionId,
            (factionGold.get(char.factionId) ?? 0) + char.gold
          );
        }
      }

      // 記錄每個勢力的資料 / Record data for each faction
      for (const faction of state.factions) {
        if (!factionDataMap.has(faction.id)) {
          factionDataMap.set(faction.id, {
            id: faction.id,
            name: faction.name,
            color: faction.color,
            troops: [],
            gold: [],
            territories: [],
          });
        }
        const fd = factionDataMap.get(faction.id)!;
        fd.troops.push(factionTroops.get(faction.id) ?? 0);
        fd.gold.push(factionGold.get(faction.id) ?? 0);
        fd.territories.push(factionTerritories.get(faction.id) ?? 0);
      }
    } catch {
      // 跳過損壞的快照 / Skip corrupted snapshots
    }
  }

  return NextResponse.json({
    rounds,
    factions: Array.from(factionDataMap.values()),
  });
}
