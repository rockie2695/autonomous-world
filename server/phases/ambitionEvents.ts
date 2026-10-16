// ============================================================================
// 階段 7：野心事件
// Phase 7: Ambition Events
// ============================================================================
// 依遊戲事件處理野心變化。
// Processes ambition changes based on game events.
//
// 規則（來自規格）/ Rules (from spec):
// - 20 回合未升遷 → 野性 +0.5 / 20 rounds without promotion → ambition +0.5
// - 朋友叛逃 → 野心 +2 / Friend defects → ambition +2
// - 君王統率高 → 野心 -0.5 × (king.tong / 30) / King tong high → ambition -0.5 × (king.tong / 30)
// - 行政官暫時減免到期 → 仍在職則 +AMBITION_ADMIN_ASSIGNED_DELTA 回復 /
//   Expired temporary administrator reduction reverts (+AMBITION_ADMIN_ASSIGNED_DELTA)
// - 叛變冷卻 → 每次叛變 -AMBITION_DEFECTION_DELTA，持續 AMBITION_DEFECTION_ROUNDS /
//   Defection cooling: -AMBITION_DEFECTION_DELTA per defection, lasting
//   AMBITION_DEFECTION_ROUNDS
//
// 使用方式 / Usage:
//   await ambitionEvents(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 處理所有角色的野心事件。
 * Process ambition events for all characters.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用）/ Seeded RNG (unused for this phase)
 */
export async function ambitionEvents(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有存活角色 / Get all living characters
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      factionId: true,
      lastPromotedRound: true,
      ambition: true,
    },
  });

  // 冷卻視窗內的叛變次數（依人計數）。查 `Event` 而不是 `Character`，因為「何時叛變」
  // 本來就是事件表的一等資料，而野心是固定值、不存任何狀態 —— 多加一個欄位只會多一個
  // 可能對不上的真相。
  //
  // Defection counts per character inside the cooling window, read from `Event` rather
  // than from `Character`: "when did they defect" is already first-class in the event
  // table, and ambition is a fixed stat that stores no state — a new column would only
  // add one more version of the truth to keep in sync.
  //
  // 視窗是 `round - ROUNDS + 1 .. round`，也就是**包含**本回合。`charId` 放在 `data` JSON
  // 裡而**不是**一個欄位（事件表比欄位老），所以這裡取出整個 data 再讀；早期事件只有
  // `charName`，事件日誌另有讀取時回填，這裡則直接略過 —— 沒有 id 就算不出冷卻。
  //
  // The window is `round - ROUNDS + 1 .. round`, so it **includes** this round. `charId`
  // lives inside the `data` JSON rather than in a column (the events table predates it),
  // so the whole blob is selected and read here. Earliest rows only carry `charName`,
  // which the event log backfills at read time; they are skipped here, because without an
  // id there is no cooling to compute.
  const defections = await prisma.event.findMany({
    where: {
      worldId,
      type: 'DEFECTION',
      round: { gte: round - CONFIG.AMBITION_DEFECTION_ROUNDS + 1 },
    },
    select: { data: true },
  });

  /** 每人最近一次叛變的次數（疊加冷卻）/ Defections per character (the cooling stacks) */
  const defectionsInWindow = new Map<string, number>();
  for (const defection of defections) {
    const charId = (defection.data as { charId?: unknown } | null)?.charId;
    if (typeof charId !== 'string' || !charId) continue;
    defectionsInWindow.set(charId, (defectionsInWindow.get(charId) ?? 0) + 1);
  }

  for (const char of characters) {
    let delta = 0;
    let reason = '';

    // 檢查是否久未升遷（20+ 回合）/ Check for lack of promotion (20+ rounds)
    const roundsSincePromotion = char.lastPromotedRound
      ? round - char.lastPromotedRound
      : round; // 從未升遷 / Never promoted

    if (roundsSincePromotion >= CONFIG.AMBITION_NO_PROMOTION_ROUNDS) {
      delta += CONFIG.AMBITION_NO_PROMOTION_DELTA;
      reason += `No promotion for ${roundsSincePromotion} rounds; `;
    }

    // ── 叛變冷卻 / Defection cooling ────────────────────────────────────────
    // 叛變本身**不再重骰野心**（那會讓「從不變動」的規則破功，而且幅度大到讓叛變
    // 行為驟變）。改在這裡往帳本寫一筆負的 delta：忠誠檢查會把它加總進叛變值，
    // 於是剛叛變的人接下來 20 回合比較不容易再叛變。
    //
    // Defecting no longer re-rolls ambition — that would break the "never changes"
    // rule, and the swing was large enough to make defection behaviour flip. Instead a
    // negative delta goes into the ledger here, which loyaltyCheck sums into the
    // defection value, so someone who just defected is markedly less likely to defect
    // again for the next 20 rounds.
    //
    // **每一筆叛變各自計算，所以會疊加**：短時間內叛變兩次是 −4。冷卻是疊加而不是
    // 封頂 −2 —— 連續叛變本身就是更強傾向的證據，封頂等於把這個訊息丟掉。
    //
    // **One row per defection, so they stack**: two defections in quick succession is
    // -4. The cooling is additive rather than capped at -2, because defecting twice in a
    // row is itself the evidence and capping it would throw that away.
    //
    // 寫成**獨立一筆**而不是併進上面的 delta：那筆常常是小數（國王統率會產生
    // 0.35 這種），混在一起之後「叛變冷卻是 −2」就看不出來了，而這正是它的全部意义。
    //
    // A **separate** row rather than folded into the delta above: that one is often a
    // fraction (a strong king yields 0.35), and merged in, "the cooling is -2" stops
    // being readable — which is the whole point of it.
    const defectionCount = defectionsInWindow.get(char.id) ?? 0;
    if (defectionCount > 0) {
      await prisma.ambitionEvent.create({
        data: {
          worldId,
          charId: char.id,
          round,
          delta: defectionCount * CONFIG.AMBITION_DEFECTION_DELTA,
          reason: `Defected ${defectionCount}× within ${CONFIG.AMBITION_DEFECTION_ROUNDS} rounds; `,
        },
      });
    }

    // 檢查朋友是否最近叛逃 / Check if friend recently defected
    // TODO: 需檢查最近的叛逃事件 / This requires checking recent defection events
    // 目前略過此檢查 / For now, skip this check

    // 檢查君王統率（降低野心）/ Check king's tong (reduces ambition)
    if (char.factionId) {
      const faction = await prisma.faction.findUnique({
        where: { id: char.factionId },
        select: { kingId: true },
      });

      if (faction?.kingId) {
        const king = await prisma.character.findUnique({
          where: { id: faction.kingId },
          select: { tong: true },
        });

        if (king) {
          const tongReduction =
            CONFIG.AMBITION_KING_TONG_DELTA * (king.tong / 30);
          delta -= tongReduction;
          reason += `King tong ${king.tong} reduces ambition; `;
        }
      }
    }

    // 野心是**固定初始值**，所以這裡不再改寫 `Character.ambition`，只寫帳本。
    //
    // Ambition is a **fixed initial stat**, so this no longer rewrites
    // `Character.ambition` — it only writes the ledger.
    //
    // 帳本不是裝飾：忠誠檢查每回合會把本回合的 delta 加總成「叛變值」
    // （見 src/lib/defection.ts）。把狀態留在事件表裡、而不是攤平到一個會漂移的數字上，
    // 這條鏈才不會有兩份互相矛盾的真相。
    //
    // The ledger is not decoration: `loyaltyCheck` sums this round's deltas into the defection
    // value every round (see src/lib/defection.ts). Keeping the state in the event table rather
    // than flattening it into a number that can drift is what stops there being two
    // contradictory versions of the same truth.
    if (delta !== 0) {
      // 記錄事件 / Log the event
      await prisma.ambitionEvent.create({
        data: {
          worldId,
          charId: char.id,
          round,
          delta,
          reason: reason.trim(),
        },
      });
    }
  }
}
