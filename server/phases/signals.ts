// ============================================================================
// 階段 5：號令
// Phase 5: Signals
// ============================================================================
// 處理號令的過期、冷卻，以及**發號**。
// Processes signal expiry, cooldowns, and **issuing**.
//
// 規則 / Rules:
// - 號令在 SIGNAL_DURATION 回合後過期 / Signals expire after SIGNAL_DURATION rounds
// - 每個陣營最多同時有 1 個有效號令（只有君王發號，見下）/ Each faction has at most 1
//   active signal (only kings issue — see below)
// - 君王按**性格**發號（kingSignal.ts）：危急先馳援；沒有危急時，武人王進攻最弱
//   邊界、守將王按兵不動、商人王少下令（雙倍冷卻）、均衡王只打贏面大的邊界
// - 君王按性格發號，冷卻為 SIGNAL_COOLDOWN（商人王 ×2）/
//   The king issues by posture (kingSignal.ts), cooldown SIGNAL_COOLDOWN (×2 for
//   merchant kings)
//
// 修復前這個階段**從不發號**——信號表沒有任何寫入端，aiMove 的接令行軍在等一個
// 永遠不會來的號令，`SIGNAL_DURATION`/`SIGNAL_COOLDOWN` 只活在註解裡。
// Before the fix this phase **never issued a signal** — nothing wrote the Signal
// table, aiMove's rally marching waited on a call that could never come, and
// SIGNAL_DURATION/SIGNAL_COOLDOWN lived only in comments.
//
// 使用方式 / Usage:
//   await signals(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { spendingPosture } from '@/lib/spending';
import { estimateAttack, estimatePlaceDefence } from '@/lib/warEstimate';
import { kingSignal } from '@/lib/kingSignal';

/**
 * 處理號令的過期、冷卻與發號。
 * Process signal expiry, cooldowns, and issuing.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（發號決策是確定性的，本階段不畫 RNG）/
 *              Seeded RNG (the issuing decision is deterministic; the phase draws no RNG)
 */
export async function signals(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  void rng;

  // 使過期號令失效 / Expire old signals
  await prisma.signal.updateMany({
    where: {
      worldId,
      active: true,
      expireRound: { lte: round },
    },
    data: { active: false },
  });

  // 減少會發送號令之角色的冷卻 / Decrease cooldowns for characters who sent signals
  await prisma.character.updateMany({
    where: {
      worldId,
      signalCooldown: { gt: 0 },
    },
    data: { signalCooldown: { decrement: 1 } },
  });

  // ── 發號：每個勢力的君王 ──
  // 估量需要的全景：地方（陣營/駐軍/堡壘）、道路、存活將領（兵力/武/體）。
  // 與 aiMove、build **同一份** warEstimate——勢力層的號令不得引用模擬沒用的數字。
  // ── Issuing: each faction's king ──
  // The full picture the estimates need: places (faction/garrison/fortress), roads,
  // living leaders (troops/wu/ti). The **same** warEstimate as aiMove and build — a
  // faction-level call may not quote numbers the fight does not use.
  const [factions, places, roads, everyone, activeSignals] = await Promise.all([
    prisma.faction.findMany({
      where: { worldId, alive: true },
      select: { id: true, name: true, kingId: true },
    }),
    prisma.place.findMany({
      where: { worldId },
      select: { id: true, name: true, factionId: true, garrison: true, fortress: true },
    }),
    prisma.road.findMany({
      where: { worldId },
      select: { aId: true, bId: true },
    }),
    prisma.character.findMany({
      where: { worldId, alive: true },
      select: {
        id: true,
        placeId: true,
        factionId: true,
        troops: true,
        wu: true,
        ti: true,
      },
    }),
    // 進行中的號令：只有君王發號，所以「發送者的號令還在效期內」等於「這個勢力
    // 已有號令」/
    // Active signals: only kings issue, so "the sender's signal is still live"
    // equals "this faction already has one"
    prisma.signal.findMany({
      where: { worldId, active: true, expireRound: { gt: round } },
      select: { fromId: true },
    }),
  ]);

  const placeById = new Map(places.map((p) => [p.id, p] as const));
  // 君王本人：Faction 沒有 king 關係，用 kingId 另查一次（含發號需要的屬性）/
  // The king himself: Faction has no king relation — fetch by kingId (with the
  // stats the decision needs)
  const kingIds = factions
    .map((f) => f.kingId)
    .filter((id): id is string => id !== null);
  const kings = kingIds.length
    ? await prisma.character.findMany({
        where: { id: { in: kingIds }, alive: true },
        select: {
          id: true,
          name: true,
          signalCooldown: true,
          wu: true,
          ti: true,
          jing: true,
        },
      })
    : [];
  const kingById = new Map(kings.map((k) => [k.id, k] as const));
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }
  const residentsOf = new Map<string, typeof everyone>();
  for (const c of everyone) {
    const list = residentsOf.get(c.placeId) ?? [];
    list.push(c);
    residentsOf.set(c.placeId, list);
  }
  const sendersWithActiveSignal = new Set(activeSignals.map((s) => s.fromId));

  for (const faction of factions) {
    const king = faction.kingId ? kingById.get(faction.kingId) : undefined;
    // 沒有君王（戰死待繼承／崩解中）或冷卻未過或已有進行中的號令 → 不發 /
    // No king (dead, awaiting succession / collapsing), cooling down, or an active
    // signal already out → no call
    if (!king) continue;
    if (king.signalCooldown > 0) continue;
    if (sendersWithActiveSignal.has(king.id)) continue;

    // ── 自家族地危急度：估計防禦 − 相鄰敵將最強估計攻擊 ──
    // ── Each own place's urgency: estimated defence minus the strongest adjacent
    // hostile leader's estimated attack ──
    const ownPlaces = places.filter((p) => p.factionId === faction.id);
    const ownMargins = ownPlaces.map((p) => {
      const defenders = (residentsOf.get(p.id) ?? []).filter(
        (c) => c.factionId === faction.id
      );
      const defence = estimatePlaceDefence(p, defenders);
      let maxHostileAttack = 0;
      for (const n of adjacent.get(p.id) ?? []) {
        const nPlace = placeById.get(n);
        if (!nPlace || nPlace.factionId === faction.id) continue;
        for (const r of residentsOf.get(n) ?? []) {
          if (r.factionId === null || r.factionId === faction.id) continue;
          maxHostileAttack = Math.max(maxHostileAttack, estimateAttack(r));
        }
      }
      return { placeId: p.id, margin: defence - maxHostileAttack };
    });

    // ── 邊界敵地：與任一自家地方相鄰的敵對地方 ──
    // ── Border enemy places: hostile places adjacent to any own place ──
    const borderTargets: Array<{ placeId: string; defence: number }> = [];
    for (const p of ownPlaces) {
      for (const n of adjacent.get(p.id) ?? []) {
        const nPlace = placeById.get(n);
        if (!nPlace || !nPlace.factionId || nPlace.factionId === faction.id) continue;
        if (borderTargets.some((t) => t.placeId === n)) continue;
        const defenders = (residentsOf.get(n) ?? []).filter(
          (c) => c.factionId === nPlace.factionId
        );
        borderTargets.push({
          placeId: n,
          defence: estimatePlaceDefence(nPlace, defenders),
        });
      }
    }

    const strongestAttack = Math.max(
      0,
      ...everyone
        .filter((c) => c.factionId === faction.id)
        .map((c) => estimateAttack(c))
    );

    const decision = kingSignal({
      posture: spendingPosture(king),
      ownMargins,
      borderTargets,
      strongestAttack,
    });
    if (!decision) continue;

    const target = placeById.get(decision.targetPlaceId);
    if (!target) continue;

    await prisma.signal.create({
      data: {
        worldId,
        fromId: king.id,
        targetPlaceId: decision.targetPlaceId,
        createdRound: round,
        expireRound: round + CONFIG.SIGNAL_DURATION,
        active: true,
      },
    });
    // 冷卻：商人王雙倍——他不是不想守，是能不開口就不開口 /
    // Cooldown: merchant kings take double — not unwilling to defend, just sparing
    // with any call at all
    await prisma.character.update({
      where: { id: king.id },
      data: {
        signalCooldown:
          CONFIG.SIGNAL_COOLDOWN *
          (spendingPosture(king) === 'merchant' ? 2 : 1),
      },
    });

    // 號令要寫事件：勢力層的動員是玩家唯一看得到的「君王在做什麼」，一行都不寫
    // 等於君王在戰略上是隱形的 /
    // Log the call: a faction-level mobilisation is the only visible thing a king
    // *does* — without the row the king is strategically invisible
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'SIGNAL_ISSUED',
        data: {
          charId: king.id,
          charName: king.name,
          factionId: faction.id,
          factionName: faction.name,
          placeId: target.id,
          placeName: target.name,
          intent: decision.intent,
        },
      },
    });
  }
}
