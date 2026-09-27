// ============================================================================
// 唯一活躍名稱產生器（DB 層）
// Unique Alive-Name Helpers (DB layer)
// ============================================================================
// 查詢資料庫中「存活」的勢力/君王名稱，產生不撞名的新名稱。
// Queries the database for ALIVE faction/king names and generates names that
// do not collide with them.
//
// 設計要點 / Design notes:
// - 純函式產生器（generateUniqueFactionName / generateUniquePersonName）
//   負責「不撞 taken」；本檔負責「從 DB 組出 taken」。
// - 名稱唯一性只約束「存活」實體：死亡國王/解散勢力的名稱可被重用。
// - RNG 流保持不變：taken 為空時第一個隨機嘗試即成功，消耗與舊版
//   generateFactionName / generatePersonName 完全相同 → 種子重現性不受影響。
// - 回傳值永不為 null：理論上極端撞滿時退化為數字後綴（unreachable guard）。
// ============================================================================

import { prisma } from '@/lib/prisma';
import { type Rng } from '@/lib/rng';
import {
  generateUniqueFactionName,
  generateFactionName,
} from '@/lib/nameGenerator/faction';
import {
  generateUniquePersonName,
  generatePersonName,
} from '@/lib/nameGenerator/person';

/**
 * 產生不與同世界「存活勢力」撞名的新勢力名稱。
 * Generate a faction name unique among the alive factions of this world.
 *
 * RNG 消耗與 generateFactionName 一致（未撞名時 1 次抽取）。
 * RNG consumption matches generateFactionName (1 draw when no collision).
 *
 * @param worldId - 世界 ID / World id
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @returns 唯一存活勢力名稱 / A name unique among alive factions
 */
export async function uniqueAliveFactionName(
  worldId: string,
  rng: Rng
): Promise<string> {
  const factions = await prisma.faction.findMany({
    where: { worldId, alive: true },
    select: { name: true },
  });
  const taken = new Set(factions.map((f) => f.name));

  const name = generateUniqueFactionName(rng, taken);
  if (name !== null) return name;

  // unreachable guard：40,000 組合全部佔滿時退化為數字後綴
  // unreachable guard: numeric suffix when all 40,000 combos are taken
  const base = generateFactionName(rng);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * 產生「君王」名稱：在同世界存活君王（不含指定角色本身）中唯一。
 * Generate a king name unique among the alive kings of this world
 * (excluding the specified character itself).
 *
 * 若 currentName 已經唯一則原樣回傳、不消耗任何 RNG（保持既有 RNG 流）。
 * If `currentName` is already unique it is returned unchanged and NO RNG is
 * consumed (preserves the existing RNG stream).
 *
 * @param worldId - 世界 ID / World id
 * @param charId - 即將成為君王的角色 ID（排除自身）/ Character becoming king (excluded)
 * @param currentName - 該角色目前的名字 / The character's current name
 * @param rng - 種子 RNG 實例 / Seeded RNG instance
 * @returns 在存活君王中唯一的名字 / A name unique among alive kings
 */
export async function uniqueAliveKingName(
  worldId: string,
  charId: string,
  currentName: string,
  rng: Rng
): Promise<string> {
  const kings = await prisma.character.findMany({
    where: { worldId, alive: true, isKing: true, id: { not: charId } },
    select: { name: true },
  });
  const taken = new Set(kings.map((k) => k.name));

  // 已唯一 → 原樣回傳、零 RNG 消耗 / Already unique → return as-is, zero RNG
  if (!taken.has(currentName)) return currentName;

  const name = generateUniquePersonName(rng, taken);
  if (name !== null) return name;

  // unreachable guard：8,000 組合全部佔滿時退化為數字後綴
  // unreachable guard: numeric suffix when all 8,000 combos are taken
  const base = generatePersonName(rng);
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
