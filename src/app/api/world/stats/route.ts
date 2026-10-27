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
//   factions: Array<{
//     id, name, color,
//     troops: number[],       // 每回合的勢力兵力 / Faction troops per round
//     gold: number[],         // 每回合的勢力金幣 / Faction gold per round
//     territories: number[],  // 每回合的勢力領地數 / Faction territory counts per round
//     characters: number[],   // 每回合的勢力存活將領數 / Alive characters per faction per round
//   }>,
//   world: {                 // 世界整體時間序列 / World-wide time series
//     aliveFactions: number[],
//     totalCharacters: number[],
//     unownedPlaces: number[],
//     totalGarrison: number[],
//     totalRoads: number[],
//   }
// }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { StatsQuerySchema } from '@/lib/validations';
import { decompressSnapshot } from '@/lib/snapshot';
import { getSelectedWorldId } from '@/lib/worldSelect';

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

  // 目前選中的世界（cookie；無 cookie 時回退 active 世界）/
  // The selected world (the cookie; falls back to the active world without one)
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
  characters: number[];
  /**
   * The absolute round number each value above belongs to.
   *
   * A faction's series is NOT dense from the world's first round: it only gains an entry in
   * the round it first appears, so its array starts at index 0 while the world starts at,
   * say, round 12. Plotting by array index therefore drew every faction as if it had existed
   * since the beginning, and the x axis read 0,1,2 instead of 12,13,14. Carrying the round
   * per point lets the chart place the series on the world's own round axis.
   */
  rounds: number[];
  }>();

  // 世界整體時間序列 / World-wide time series
  const worldSeries = {
    aliveFactions: [] as number[],
    totalCharacters: [] as number[],
    unownedPlaces: [] as number[],
    totalGarrison: [] as number[],
    totalRoads: [] as number[],
  };

  for (const snapshot of snapshots) {
    try {
      const state = decompressSnapshot(Buffer.from(snapshot.data));
      rounds.push(snapshot.round);

      // 統計每個勢力的領地、兵力、金錢、將領 / Count territories, troops, gold, characters per faction
      const factionTroops = new Map<string, number>();
      const factionGold = new Map<string, number>();
      const factionTerritories = new Map<string, number>();
      const factionCharacters = new Map<string, number>();

      // 計算領地數 / Count territories
      for (const place of state.places) {
        if (place.factionId) {
          factionTerritories.set(
            place.factionId,
            (factionTerritories.get(place.factionId) ?? 0) + 1
          );
        }
      }

      // 計算兵力、金錢與存活將領數 / Count troops, gold and alive characters
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
          factionCharacters.set(
            char.factionId,
            (factionCharacters.get(char.factionId) ?? 0) + 1
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
        rounds: [],
        troops: [],
            gold: [],
            territories: [],
            characters: [],
          });
        }
      const fd = factionDataMap.get(faction.id)!;
      // 記下這一筆屬於哪一回合，前端才知道要把折線畫在正確的回合位置 /
      // Record which round this point belongs to, so the chart can place it on the
      // world's round axis rather than on its own array index
      fd.rounds.push(snapshot.round);
      fd.troops.push(factionTroops.get(faction.id) ?? 0);
        fd.gold.push(factionGold.get(faction.id) ?? 0);
        fd.territories.push(factionTerritories.get(faction.id) ?? 0);
        fd.characters.push(factionCharacters.get(faction.id) ?? 0);
      }

      // 世界整體統計 / World-wide stats
      worldSeries.aliveFactions.push(state.factions.filter((f) => f.alive).length);
      worldSeries.totalCharacters.push(state.characters.filter((c) => c.alive).length);
      worldSeries.unownedPlaces.push(state.places.filter((p) => !p.factionId).length);
      worldSeries.totalGarrison.push(
        state.places.reduce((sum, p) => sum + p.garrison, 0)
      );
      worldSeries.totalRoads.push(state.roads.length);
    } catch {
      // 跳過損壞的快照 / Skip corrupted snapshots
    }
  }

  return NextResponse.json({
    rounds,
    factions: Array.from(factionDataMap.values()),
    world: worldSeries,
  });
}
