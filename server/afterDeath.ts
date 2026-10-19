// ============================================================================
// 死亡善後 / Death aftermath
// ----------------------------------------------------------------------------
// 君王戰死或行政官戰死時，只有 `alive: false` 與一筆事件是不夠的——死亡還有兩件
// 善後：**王位**與**行政官席位**。這裡把兩件事收在一個模組，讓自然死亡（ageAndDeath）
// 與戰死（battle）走**同一條**路，兩種死法才不會各自為政。
//
// A death is not just `alive: false` plus an event — two pieces of aftermath follow:
// the **throne** and the **administrator's seat**. Both live here so natural death
// (ageAndDeath) and battle death (battle) take the **same** path and cannot drift.
//
// 為什麼必須存在 / Why this must exist
// ---------------------------------------------------------------------------
// 修復前：君王戰死 → `faction.kingId` 永遠指向死人（`collapsing` 只有自然死亡會設，
// 崩解階段只處理已標記的勢力——被殺的君王什麼都不觸發）；行政官戰死 →
// `Place.administratorId` 永遠被死人佔著（指派階段只補 NULL 席），而且經濟階段抓
// 君王/行政官的 jing **不過濾 alive**——死人每回合照領分成。連自然死亡都不清席位。
//
// Before the fix: a battle-dead king left `faction.kingId` pointing at a corpse
// forever (`collapsing` was only set by natural death, and the collapse phase only
// processes already-marked factions — a killed king triggered nothing); a
// battle-dead administrator kept the seat forever (the assignment phase only fills
// NULL seats) and the economy fetched the king/admin's jing **without an aliveness
// filter** — a corpse collected the admin share every round. Even natural death
// never cleared the seat.
// ============================================================================

import { prisma } from '@/lib/prisma';

/** 一位死者的必要欄位 / What the aftermath needs to know about one death */
export interface DeadLeader {
  id: string;
  name: string;
  factionId: string | null;
  isKing: boolean;
}

/**
 * 處理死亡善後：王位繼承／崩解 + 清空死者佔用的行政官席位。
 * Process death aftermath: throne succession/collapse + clearing seats the dead held.
 *
 * **不畫 RNG**：繼承人按年齡取、席位清空無隨機——呼叫端（battle）的亂數序列
 * 完全不變，世界對同一個種子長得一樣。
 *
 * **Draws no RNG**: the heir is picked by age and the seat clearing is
 * deterministic — the caller's (battle's) random sequence is untouched, so a seed
 * still grows the same world.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param dead - 本回合死亡的角色 / The characters who died this round
 */
export async function processDeadLeaders(
  worldId: string,
  round: number,
  dead: ReadonlyArray<DeadLeader>
): Promise<void> {
  if (dead.length === 0) return;

  // ── 1. 清空死者佔用的行政官席位 ────────────────────────────────────────────
  // **不蓋冷卻錨點**（與 grantAdmin 的席位清空不同）：死亡不是任何人的主動操作，
  // 蓋了 `adminChangedRound` 會讓指派階段冷凍該地 10 回合——40% 的行政官分成跟著
  // 消失 10 回合。不清錨點，指派階段（戰鬥之後的同一回合）立刻補上新人，地方照常運轉。
  //
  // **No cooldown stamp** (unlike grantAdmin's seat-clearing): a death is not an
  // actor-driven change, and stamping `adminChangedRound` would freeze the place
  // out of the assignment phase for 10 rounds — the 40% administrator share with
  // it. Without the stamp the assignment phase (the same round, right after
  // battle) refills the seat and the place keeps running.
  const deadIds = dead.map((d) => d.id);
  await prisma.place.updateMany({
    where: { worldId, administratorId: { in: deadIds } },
    data: { administratorId: null },
  });

  // ── 2. 君王的王位 ─────────────────────────────────────────────────────────
  // 有子女時由**最年長**的子女繼承，沒有子女才把勢力標記為崩解——與自然死亡
  // 同一條規則（繼承只**增加**一條路徑，沒有繼承者時不能吃掉原本的崩解行為）。
  //
  // The oldest child takes the throne; with no child the faction is marked
  // collapsing — the same rule as natural death (inheritance only ADDS a path and
  // must not swallow the collapse rule when no heir exists).
  for (const king of dead) {
    if (!king.isKing || !king.factionId) continue;

    // 排序 age desc 就是長子：同回合數出生的孩子，先出生的年紀更大 /
    // Ordering by age gives the first-born: children of the same round count age
    // the same, so an earlier-born child is older
    const heir = await prisma.character.findFirst({
      where: { parentId: king.id, alive: true },
      orderBy: { age: 'desc' },
      select: { id: true, name: true },
    });

    if (heir) {
      await prisma.character.update({
        where: { id: heir.id },
        data: { isKing: true },
      });
      await prisma.faction.update({
        where: { id: king.factionId },
        data: { kingId: heir.id },
      });

      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'KING_INHERITED',
          data: {
            charId: heir.id,
            charName: heir.name,
            fatherId: king.id,
            fatherName: king.name,
            factionId: king.factionId,
          },
        },
      });
    } else {
      await prisma.faction.update({
        where: { id: king.factionId },
        data: { collapsing: true },
      });
    }
  }
}
