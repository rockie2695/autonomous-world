// ============================================================================
// 快照壓縮工具 / Snapshot Compression Utilities
// ============================================================================
// 處理回合快照的壓縮/解壓縮。
// Handles compression/decompression of round snapshots.
// 快照以 gzip(JSON) 格式儲存在資料庫中。
// Snapshots are stored as gzip(JSON) in the database.
//
// 使用方式 / Usage:
//   const compressed = compressSnapshot(worldState);
//   const state = decompressSnapshot(compressed);
// ============================================================================

import { gzipSync, gunzipSync } from 'zlib';
import { prisma } from '@/lib/prisma';

// ─── 型別 / Types ─────────────────────────────────────────────────────────

/**
 * 單一回合的完整世界狀態。
 * Complete world state for a single round.
 * 這就是被序列化為快照的內容。
 * This is what gets serialized into a snapshot.
 */
export interface WorldState {
  world: {
    id: string;
    name: string;
    currentRound: number;
  };
  places: Array<{
    id: string;
    name: string;
    factionId: string | null;
    administratorId: string | null;
    garrison: number;      // 駐軍 / Garrison
    fortress: number;      // 堡壘 / Fortress
    market: number;        // 市場 / Market
    barracks: number;      // 兵營 / Barracks
    layoutX: number;       // 佈局 X 座標 / Layout X position
    layoutY: number;       // 佈局 Y 座標 / Layout Y position
  }>;
  factions: Array<{
    id: string;
    name: string;
    color: string;
    alive: boolean;
    collapsing: boolean;   // 瓦解中 / Collapsing
    kingId: string | null;
  }>;
  characters: Array<{
    id: string;
    name: string;
    factionId: string | null;
    wu: number;            // 武力 / Martial
    tong: number;          // 統領 / Leadership
    jing: number;          // 經濟 / Economy
    speed: number;         // 速度 / Speed
    loyalty: string;       // 忠誠 / Loyalty
    ambition: number;      // 野心 / Ambition
    age: number;           // 年齡 / Age
    placeId: string;       // 位置 / Location
    troops: number;        // 兵力 / Troops
    gold: number;          // 金錢 / Gold
    alive: boolean;        // 存活 / Alive
    isKing: boolean;       // 國王 / Is king
  }>;
  roads: Array<{
    id: string;
    aId: string;           // 第一個地點 / First place
    bId: string;           // 第二個地點 / Second place
  }>;
}

// ─── 壓縮 / Compression ───────────────────────────────────────────────────

/**
 * 將世界狀態壓縮為 gzip 緩衝區。
 * Compress a world state into a gzip buffer.
 *
 * @param state - 要壓縮的世界狀態 / The world state to compress
 * @returns 包含 gzip 壓縮 JSON 的緩衝區 / Buffer containing gzip-compressed JSON
 */
export function compressSnapshot(state: WorldState): Buffer {
  const json = JSON.stringify(state);
  return gzipSync(Buffer.from(json, 'utf-8'));
}

/**
 * 將 gzip 緩衝區解壓縮回世界狀態。
 * Decompress a gzip buffer back into a world state.
 *
 * @param compressed - 要解壓縮的 gzip 緩衝區 / The gzip buffer to decompress
 * @returns 原始世界狀態 / The original world state
 */
export function decompressSnapshot(compressed: Buffer): WorldState {
  const json = gunzipSync(compressed).toString('utf-8');
  return JSON.parse(json) as WorldState;
}

/**
 * 從當前資料庫狀態建立快照。
 * Create a snapshot from the current database state.
 *
 * @param worldId - 要快照的世界 ID / The world ID to snapshot
 * @returns 壓縮的快照緩衝區 / Compressed snapshot buffer
 */
export async function createSnapshot(
  worldId: string
): Promise<Buffer> {
  // 取得所有世界資料 / Fetch all world data
  const [world, places, factions, characters, roads] = await Promise.all([
    prisma.world.findFirst({ where: { id: worldId } }),
    prisma.place.findMany({ where: { worldId } }),
    prisma.faction.findMany({ where: { worldId } }),
    prisma.character.findMany({ where: { worldId } }),
    prisma.road.findMany({ where: { worldId } }),
  ]);

  if (!world) {
    throw new Error(`找不到世界 ${worldId} / World ${worldId} not found`);
  }

  const state: WorldState = {
    world: {
      id: world.id,
      name: world.name,
      currentRound: world.currentRound,
    },
    places: places.map(p => ({
      id: p.id,
      name: p.name,
      factionId: p.factionId,
      administratorId: p.administratorId,
      garrison: p.garrison,
      fortress: p.fortress,
      market: p.market,
      barracks: p.barracks,
      layoutX: p.layoutX,
      layoutY: p.layoutY,
    })),
    factions: factions.map(f => ({
      id: f.id,
      name: f.name,
      color: f.color,
      alive: f.alive,
      collapsing: f.collapsing,
      kingId: f.kingId,
    })),
    characters: characters.map(c => ({
      id: c.id,
      name: c.name,
      factionId: c.factionId,
      wu: c.wu,
      tong: c.tong,
      jing: c.jing,
      speed: c.speed,
      loyalty: c.loyalty,
      ambition: c.ambition,
      age: c.age,
      placeId: c.placeId,
      troops: c.troops,
      gold: c.gold,
      alive: c.alive,
      isKing: c.isKing,
    })),
    roads: roads.map(r => ({
      id: r.id,
      aId: r.aId,
      bId: r.bId,
    })),
  };

  return compressSnapshot(state);
}
