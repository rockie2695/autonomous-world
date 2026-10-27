// ============================================================================
// 世界資料拆除 / World Data Teardown
// ============================================================================
// 把一個世界的**所有遊戲資料**刪乾淨，只留 World 列本身。兩個呼叫者：
//   - 「重置此世界」（POST /api/admin/worlds/reset）：拆除後用同一個 world id
//     重新 initWorld——世界還在，歷史歸零。
//   - 「刪除世界」（DELETE /api/admin/worlds）：拆除後把 World 列也刪掉。
//
// Wipes a world's **entire game dataset**, leaving only the World row. Two callers:
//   - "Reset this world" (POST /api/admin/worlds/reset): after the teardown the same
//     world id is re-initialised with initWorld — the world survives, its history is zero.
//   - "Delete world" (DELETE /api/admin/worlds): after the teardown the World row goes too.
//
// **外鍵迴圈與拆除順序**：Schema 裡有兩個環——
//   Place.administratorId → Character，而 Character.placeId → Place（必填）；
//   Faction.kingId → Character，而 Character.factionId → Faction。
// 所以不能「先刪甲再刪乙」一次排完：先把**指向環上的外鍵清成 null**（三個 updateMany），
// 再按依賴序刪除。BattleStrike **刻意沒有外鍵**（戰史要比參與者長命），直接按 worldId 刪。
// 整個拆除在**一筆交易**裡：拆到一半的世界比壞掉更糟——重置與刪除都必須是全有或全無。
//
// **FK cycles and the teardown order**: the schema has two cycles —
//   Place.administratorId → Character while Character.placeId → Place (required);
//   Faction.kingId → Character while Character.factionId → Faction.
// So the deletes cannot be ordered outright: first **null the FKs that sit on the cycles**
// (three updateMany calls), then delete in dependency order. BattleStrike **deliberately
// has no foreign keys** (war history outlives its participants) and goes by worldId alone.
// The whole teardown runs in **one transaction**: a half-torn world is worse than a broken
// one — reset and delete must be all-or-nothing.
// ============================================================================

import { inTransaction } from './tx';

/**
 * 拆除一個世界的所有遊戲資料（不動 World 列本身）。
 * Tear down a world's entire game dataset (the World row itself is untouched).
 *
 * @param worldId - 要拆除的世界 ID / The world to tear down
 * @param worldFields - 交易內順手更新的 World 欄位（重置時寫入新 seed、
 *   `currentRound: 0`、清 roundRunning 旗標；刪除時不需要）/
 *   World fields to update inside the same transaction (reset writes the new seed,
 *   `currentRound: 0`, clears the roundRunning flag; delete needs none)
 */
export async function teardownWorldData(
  worldId: string,
  worldFields: Record<string, unknown> = {}
): Promise<void> {
  await inTransaction(async (tx) => {
    // ── 1. 清掉環上的外鍵（見檔頭）／ Null the FKs on the cycles (see the header) ──
    await tx.place.updateMany({
      where: { worldId },
      data: { administratorId: null },
    });
    await tx.faction.updateMany({
      where: { worldId },
      data: { kingId: null },
    });
    await tx.character.updateMany({
      where: { worldId },
      data: { factionId: null, parentId: null },
    });

    // ── 2. 依賴序刪除：先「指向角色／地方」的表，再角色、地方、勢力本身 ──
    // ── Dependency order: tables pointing at characters/places first, then
    //    characters, places and factions themselves ──
    await tx.signal.deleteMany({ where: { worldId } }); // → Character + Place
    await tx.friendship.deleteMany({ where: { worldId } }); // → Character ×2
    await tx.discontent.deleteMany({ where: { worldId } }); // → Character ×2
    await tx.defectionEvent.deleteMany({ where: { worldId } }); // → Character
    await tx.battleStrike.deleteMany({ where: { worldId } }); // 無外鍵 / no FKs
    await tx.event.deleteMany({ where: { worldId } });
    await tx.road.deleteMany({ where: { worldId } }); // → Place ×2
    await tx.character.deleteMany({ where: { worldId } });
    await tx.place.deleteMany({ where: { worldId } });
    await tx.faction.deleteMany({ where: { worldId } });
    await tx.roundSnapshot.deleteMany({ where: { worldId } });

    if (Object.keys(worldFields).length > 0) {
      await tx.world.update({
        where: { id: worldId },
        data: worldFields,
      });
    }
  });
}
