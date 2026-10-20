// ============================================================================
// 階段 10：戰鬥
// Phase 10: Battle
// ============================================================================
// 角色抵達敵方領地時解決戰鬥。
// Resolves battles when characters arrive at enemy territories.
//
// 規則（來自規格）/ Rules (from spec):
// - 攻擊者抵達地點，與守軍交戰 / Attackers arrive at place, fight defenders
// - 攻擊順序：速度降序（v1.1）/ Attack order: speed descending (v1.1)
// - 若多名攻擊者，後到者與新擁有者交戰 / If multiple attackers, later ones fight the new owner
// - atk = troops × (1 + effectiveWu/30) × rand(0.85, 1.15)
// - def = troops × (1 + effectiveTi/30) × (1 + fortress×0.2) × rand(0.85, 1.15)
//   防守端用**體魄 (ti)**，不是統領 (tong)：tong 早已不參與防禦，它只影響購兵量。
//   Defence uses **physique (ti)**, not leadership (tong): tong left defence long ago and
//   now only sizes a troop purchase.
// - 同地點的關係會調整 effectiveWu / effectiveTi（見下方）/ Co-located relations adjust
//   effectiveWu and effectiveTi (see below)
// - 敗者：依速度差逃跑 / Loser: escape based on speed difference
//   - escape = clamp(0.5 + speedDiff × 0.02, 0.1, 0.9)
//   - 若逃跑失敗 → 死亡 / If escape fails → death
// - 勝者：troops ×= 0.9（疲勞）/ Winner: troops ×= 0.9 (fatigue)
// - 若守軍全滅：地點易主 / If all defenders dead: place changes owner
// - 無主之地：將領抵達即進攻；駐軍 > 0 則交戰，駐軍 0 則直接佔領
//   戰勝（或無駐軍）→ 陣營控制該地；戰敗 → 逃跑或死亡 / Unowned place: commander
//   arriving assaults it; garrison > 0 → fight, garrison 0 → free capture.
//   Win (or no garrison) → faction controls the place; lose → escape or die
//
// 使用方式 / Usage:
//   const battles = await battle(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { recordMove } from '../moveEvent';
import { fortressDefenceMult } from '@/lib/placeEffects';
import {
  strikeDamage,
  warFatigue,
  warVerdict,
  warEscapeChance,
} from '@/lib/warMath';
import { buildRelationCombatDeltas, effectiveAbility } from '@/lib/relationCombat';
import { buildBattleReport } from '../battleReport';
import { processDeadLeaders, type DeadLeader } from '../afterDeath';
import { grantAdmin } from '../adminAssign';

/**
 * 潰敗或疲勞之後，**活著的將領至少保有 1 名士兵**。
 * A living leader always keeps **at least 1 soldier** after a rout or fatigue.
 *
 * 潰敗與疲勞會解除武裝嗎？不會：歸零的將領什麼都做不了——aiMove 不會讓 0 兵的
 * 人開戰或行軍，他只能站著等經濟階段。保底 1 名親兵讓他下一回合仍是一個「行動
 * 中的單位」，經濟階段照常購兵補充。新生的將領同樣以 `CHAR_START_TROOPS`（1）
 * 起步——全生命周期沒有任何一刻是 0 兵的活人。
 *
 * Does a rout or fatigue disarm? No: a zeroed leader can do nothing — aiMove will
 * not march a 0-troop leader into battle or on the road, so they would only stand
 * and wait for the economy phase. The 1-soldier floor keeps them an acting unit
 * that the economy can top up. Newborn leaders likewise start at
 * `CHAR_START_TROOPS` (1) — at no point in a leader's life are they a living 0.
 */
/**
 * 解決所有交戰地點的戰鬥。
 * Resolve battles at all contested places.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於戰鬥計算的種子 RNG / Seeded RNG for battle calculations
 * @returns 進行的戰鬥數 / Number of battles fought
 */
export async function battle(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // 取得所有道路以進行逃跑路徑尋找 / Get all roads for escape pathfinding
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // 建立逃跑移動用的鄰接表 / Build adjacency map for escape movement
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }

  // ── 同地點關係對戰鬥力的影響 / Co-located relations and combat ability ─────
  // 朋友站在同一個地點會**提高**武力與體魄；不滿的人站在同一個地點則**降低**。
  //
  // A friend standing at the same place **raises** martial and physique; someone resented
  // at the same place lowers them.
  //
  // **三次查詢，整個戰鬥階段只做一次**，而不是每位戰鬥者各查一次。
  //
  // Three queries, **once for the whole battle phase**, rather than one per combatant.
  //
  // `placeOf` **只含活著的角色**：關係不會隨死亡而消失，而亡者的 `placeId` 仍留在
  // 資料庫裡——不排除的話，已故的朋友會繼續影響他生前所在的地點。
  //
  // `placeOf` holds **living characters only**: relations outlive their owners and a dead
  // character's placeId stays in the database, so without this a dead friend would keep
  // affecting the place they used to stand in.
  const [friendRows, discontentRows, placedCharacters] = await Promise.all([
    prisma.friendship.findMany({ where: { worldId }, select: { aId: true, bId: true } }),
    prisma.discontent.findMany({ where: { worldId }, select: { aId: true, bId: true } }),
    prisma.character.findMany({
      where: { worldId, alive: true },
      select: { id: true, placeId: true },
    }),
  ]);

  const placeOf = new Map(placedCharacters.map((c) => [c.id, c.placeId] as const));
  const relationDeltas = buildRelationCombatDeltas(placeOf, friendRows, discontentRows);

  /** 某位將領此刻的**有效**武力 / this leader's **effective** martial right now */
  const effectiveWu = (char: { id: string; wu: number }): number =>
    effectiveAbility(char.wu, relationDeltas.get(char.id) ?? 0);

  /** 某位將領此刻的**有效**體魄 / this leader's **effective** physique right now */
  const effectiveTi = (char: { id: string; ti: number }): number =>
    effectiveAbility(char.ti, relationDeltas.get(char.id) ?? 0);

  // 取得所有地點及陣營資訊以決定逃跑目的地 / Get all places with faction info for escape destination
  const allPlaces = await prisma.place.findMany({
    where: { worldId },
    select: { id: true, factionId: true, name: true },
  });
  const placeFactionMap = new Map<string, string | null>();
  for (const p of allPlaces) {
    placeFactionMap.set(p.id, p.factionId);
  }
  // 逃亡目的地的**名字**：事件要能說「逃至哪裡」，只有 id 的話日誌寫不出人話 /
  // The escape destination's **name**: the event has to say where they fled to —
  // an id alone cannot be rendered as prose
  const placeNameById = new Map(allPlaces.map((p) => [p.id, p.name] as const));

  let battleCount = 0;

  // 本回合戰死的人：王位繼承／崩解與行政官席位清空在**收尾時一次處理**（見函式尾），
  // 各死亡點只負責收集。不畫 RNG，亂數序列不變 /
  // Everyone who died in battle this round: succession/collapse and seat clearing are
  // processed **once at the end** (see the tail of this function); each death site only
  // collects. No RNG draws, so the random sequence is untouched.
  const deadLeaders: DeadLeader[] = [];

  // ── A + B. 多回合戰爭 ─────────────────────────────────────────────────────
  // 戰鬥不再一回合決勝負：佔據敵地的攻方與守軍**每個模擬回合打一輪**，傷害以
  // 兵力損耗累積（兵力＝血量），直到一方潰敗。戰爭不存表——「敵對將領持續站在
  // 敵地」就是戰爭本身，狀態全部由當前世界推導；已打輪數由 BattleStrike 的紀錄
  // 回推（連續回合＝同一場戰爭）。增援自然湧現：下一回合趕到的將領直接加入，
  // 信号集結因此真正有用。每次出手寫一行 BattleStrike（**不進事件日誌**），
  // 戰報彈窗的戰爭回放由此讀取。
  //
  // ── Multi-round wars ─────────────────────────────────────────────────────
  // Battles no longer end in one round: the attackers on enemy ground and the
  // defenders fight **one war round per simulation round**, accumulating troop
  // losses (troops = HP) until one side breaks. The war is not stored — "hostile
  // leaders keep standing on enemy ground" *is* the war; its state is derived from
  // the current world, and the round count is reconstructed from the BattleStrike
  // log (a contiguous run of rounds = one war). Reinforcements emerge naturally:
  // leaders arriving next round simply join, which is what makes signals matter.
  // Every strike writes a BattleStrike row (**never in the event log**); the battle
  // report's war replay reads it.

  // ── 0. 全景查詢 / The full picture ──
  const unownedPlaces = await prisma.place.findMany({
    where: { worldId, factionId: null },
    include: {
      characters: {
        where: { alive: true },
        select: { id: true, factionId: true, wu: true, ti: true, speed: true, troops: true, name: true, isKing: true },
      },
    },
  });
  const places = await prisma.place.findMany({
    where: { worldId, factionId: { not: null } },
    include: {
      characters: {
        where: { alive: true },
        select: { id: true, factionId: true, wu: true, tong: true, ti: true, speed: true, troops: true, name: true, isKing: true },
      },
    },
  });

  // 已打輪數：每個地方 BattleStrike 的**連續**回合數（從上一回合往回數）——
  // 中斷過的舊戰爭不會算進現在這場。
  // Rounds already fought: the **contiguous** strike rounds per place, walking back
  // from the previous round — a long-finished earlier war does not count toward the
  // current one.
  const priorStrikeRounds = new Map<string, Set<number>>();
  const priorRows = await prisma.battleStrike.findMany({
    where: { worldId, round: { lt: round } },
    select: { placeId: true, round: true },
    distinct: ['placeId', 'round'],
  });
  for (const row of priorRows) {
    const set = priorStrikeRounds.get(row.placeId) ?? new Set<number>();
    set.add(row.round);
    priorStrikeRounds.set(row.placeId, set);
  }
  const roundsFoughtAt = (placeId: string): number => {
    const set = priorStrikeRounds.get(placeId);
    if (!set) return 0;
    let fought = 0;
    let r = round - 1;
    while (set.has(r)) {
      fought++;
      r--;
    }
    return fought;
  };

  // 出手紀錄（收尾批次寫入）/ strike rows, batch-written once at the end
  type StrikeRow = {
    worldId: string;
    round: number;
    seq: number;
    warRound: number;
    placeId: string;
    attackerId: string;
    attackerName: string;
    attackerFactionId: string | null;
    defenderId: string;
    defenderName: string;
    defenderFactionId: string | null;
    attackPower: number;
    defencePower: number;
    roll: number;
    damage: number;
    outcome: string;
  };
  const strikeRows: StrikeRow[] = [];

  /** 一名潰敗將領的命運：逃亡擲骰 → 逃到友方鄰居（兵歸 0）或陣亡。
   * A routed leader's fate: an escape roll -> flee to a friendly neighbour (troops
   * zeroed) or die. */
  const resolveRouted = async (
    member: { id: string; name: string; factionId: string | null; speed: number; isKing: boolean },
    fromPlaceId: string,
    pursuerSpeed: number,
    strikeReport: ReturnType<typeof buildBattleReport>,
    killerName: string
  ): Promise<'fled' | 'killed'> => {
    const speedDiff = member.speed - pursuerSpeed;
    if (rng.chance(warEscapeChance(speedDiff))) {
      const neighbors = adjacent.get(fromPlaceId) ?? [];
      let escapePlaceId: string | null = null;
      for (const neighbor of neighbors) {
        const neighborFaction = placeFactionMap.get(neighbor);
        if (neighborFaction === member.factionId || neighborFaction === null) {
          escapePlaceId = neighbor;
          break;
        }
      }
      if (escapePlaceId) {
        await prisma.character.update({
          where: { id: member.id },
          data: { troops: 0, placeId: escapePlaceId },
        });
        await recordMove({
          worldId,
          round,
          charId: member.id,
          charName: member.name,
          factionId: member.factionId,
          fromPlaceId,
          toPlaceId: escapePlaceId,
        });
      } else {
        // 無路可退：撿回一命但留駐原地（兵歸 0）/
        // No way out: survived but stayed put (troops zeroed)
        await prisma.character.update({
          where: { id: member.id },
          data: { troops: 0 },
        });
      }
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'ESCAPE_SUCCESS',
          data: {
            charId: member.id,
            charName: member.name,
            placeId: fromPlaceId,
            speedDiff,
            escaped: escapePlaceId !== null,
            toPlaceName: escapePlaceId ? placeNameById.get(escapePlaceId) ?? null : null,
            report: strikeReport,
          },
        },
      });
      return 'fled';
    }
    await prisma.character.update({
      where: { id: member.id },
      data: { alive: false, diedAtRound: round },
    });
    deadLeaders.push({
      id: member.id,
      name: member.name,
      factionId: member.factionId,
      isKing: member.isKing,
    });
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'BATTLE_DEATH',
        data: {
          charId: member.id,
          charName: member.name,
          placeId: fromPlaceId,
          killerName,
          report: strikeReport,
        },
      },
    });
    return 'killed';
  };

  // ── A. 無主之地：自由佔領（無駐軍）或圍攻（有駐軍，多輪）──
  // Unowned places: a free capture when undefended, otherwise a multi-round siege.
  for (const place of unownedPlaces) {
    const attackers = place.characters.filter(
      (c) => c.factionId !== null && c.troops > 0
    );
    if (attackers.length === 0) continue;

    if (place.garrison <= 0) {
      // 無駐軍：站上去就佔領（自由佔領，與舊制相同）/
      // Undefended: walking in takes the place (the same free capture as before)
      const leader = [...attackers].sort((a, b) => b.speed - a.speed)[0]!;
      if (!leader.factionId) continue;
      await prisma.place.update({
        where: { id: place.id },
        data: { factionId: leader.factionId, garrison: 0 },
      });
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'PLACE_CAPTURED',
          data: {
            charId: leader.id,
            charName: leader.name,
            placeId: place.id,
            placeName: place.name,
            factionId: leader.factionId,
            garrisonFought: 0,
            report: null,
          },
        },
      });
      if (!place.administratorId) {
        await grantAdmin({
          worldId,
          round,
          place: { id: place.id, name: place.name },
          char: { id: leader.id, name: leader.name },
        });
      }
      continue;
    }

    // ── 圍攻輪：攻方按速度各自打擊駐軍 ──
    // ── Siege round: each attacker strikes the garrison in speed order ──
    battleCount++;
    const warRound = roundsFoughtAt(place.id) + 1;
    const sorted = [...attackers].sort((a, b) => b.speed - a.speed);
    const fortress = fortressDefenceMult(place.fortress);
    let garrison = place.garrison;
    let siegeSeq = 0;
    let lastReport: ReturnType<typeof buildBattleReport> = null;

    for (const attacker of sorted) {
      const roll = rng.float(CONFIG.BATTLE_RANDOM_MIN, CONFIG.BATTLE_RANDOM_MAX);
      const attackPower =
        attacker.troops * (1 + effectiveWu(attacker) * CONFIG.BATTLE_ATK_WU_MULT) * roll;
      const damage = strikeDamage(attackPower, fortress);
      const applied = Math.min(damage, garrison);
      garrison -= applied;
      const report = buildBattleReport('assault', {
        attackerTroops: attacker.troops,
        attackerWu: effectiveWu(attacker),
        attackRoll: roll,
        attackPower,
        defenderGarrison: garrison + applied,
        defenderFortress: place.fortress,
        defenceRoll: 1,
        defencePower: applied,
      });
      lastReport = report;
      siegeSeq++;
      strikeRows.push({
        worldId,
        round,
        seq: siegeSeq,
        warRound,
        placeId: place.id,
        attackerId: attacker.id,
        attackerName: attacker.name,
        attackerFactionId: attacker.factionId,
        defenderId: 'garrison',
        defenderName: '駐軍 ' + (garrison + applied),
        defenderFactionId: null,
        attackPower,
        defencePower: applied,
        roll,
        damage: applied,
        outcome: 'hit',
      });
      // 駐軍打空了：後面的攻方這輪沒有目標 /
      // The garrison is gone: later attackers have no target this round
      if (garrison <= 0) break;
    }

    // 全員疲勞（圍城也累）/ everyone fatigues (sieging tires too)
    for (const attacker of attackers) {
      const tired = warFatigue(attacker.troops);
      attacker.troops = tired;
      await prisma.character.update({
        where: { id: attacker.id },
        data: { troops: tired },
      });
    }
    await prisma.place.update({
      where: { id: place.id },
      data: { garrison },
    });

    if (garrison <= 0) {
      // 駐軍打空：佔領 /
      // The garrison fell: capture
      const leader = sorted[0]!;
      if (!leader.factionId) continue;
      await prisma.place.update({
        where: { id: place.id },
        data: { factionId: leader.factionId, garrison: 0 },
      });
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'PLACE_CAPTURED',
          data: {
            charId: leader.id,
            charName: leader.name,
            placeId: place.id,
            placeName: place.name,
            factionId: leader.factionId,
            garrisonFought: place.garrison,
            report: lastReport,
          },
        },
      });
      if (!place.administratorId) {
        await grantAdmin({
          worldId,
          round,
          place: { id: place.id, name: place.name },
          char: { id: leader.id, name: leader.name },
        });
      }
      continue;
    }

    // 退兵：到達最大輪數，或攻方兵力低於駐軍的一半（這場圍攻打不贏）/
    // Retreat: the round cap, or the attackers below half the garrison (unwinnable)
    const totalAttackers = attackers.reduce((s, a) => s + a.troops, 0);
    if (warRound >= CONFIG.BATTLE_MAX_ROUNDS || totalAttackers < garrison * CONFIG.BATTLE_ROUT_RATIO) {
      for (const attacker of attackers) {
        await resolveRouted(
          attacker,
          place.id,
          0,
          lastReport,
          '駐軍 ' + garrison
        );
      }
    }
  }

  // ── B. 有主地方：戰爭輪 ───────────────────────────────────────────────────
  // 每個被攻打的地方一輪：全場按速度降序，每人出手一次打最強的活著的敵人；
  // 傷害扣兵力；兵力歸零者逃亡擲骰或陣亡。一輪結束後判定戰爭走向。
  // Each besieged place fights one round: everyone strikes in speed order, damage
  // costs troops, a zeroed member flees or dies, and the war's direction is decided
  // after the pass.
  for (const place of places) {
    if (!place.factionId) continue;

    const defenders = place.characters.filter(
      (c) => c.factionId === place.factionId
    );
    const attackers = place.characters.filter(
      (c) => c.factionId !== null && c.factionId !== place.factionId && c.troops > 0
    );
    const defendersAlive =
      place.garrison > 0 || defenders.some((d) => d.troops > 0);
    if (attackers.length === 0 || !defendersAlive) continue;

    battleCount++;
    const warRound = roundsFoughtAt(place.id) + 1;
    const fortress = fortressDefenceMult(place.fortress);
    let garrison = place.garrison;
    let seq = 0;

    // 出手順序：全場按速度降序（攻守混排，v1.1）/
    // Strike order: everyone mixed, speed descending
    const combatants = [...attackers, ...defenders].sort(
      (a, b) => b.speed - a.speed
    );
    // 可變狀態：本輪內兵力隨打擊變化，後出手的人面對的是**打過之後**的戰場 /
    // Mutable state: troops change during the round; later strikers face the
    // battlefield *after* the earlier strikes
    const troops = new Map<string, number>();
    for (const c of combatants) troops.set(c.id, c.troops);
    const alive = new Set(combatants.map((c) => c.id));

    const livingEnemies = (factionId: string) =>
      combatants.filter(
        (c) =>
          c.factionId !== null &&
          c.factionId !== factionId &&
          alive.has(c.id) &&
          (troops.get(c.id) ?? 0) > 0
      );

    let lastReport: ReturnType<typeof buildBattleReport> = null;

    for (const combatant of combatants) {
      if (!alive.has(combatant.id)) continue;
      const myTroops = troops.get(combatant.id) ?? 0;
      if (myTroops <= 0) continue;

      const isAttacker = combatant.factionId !== place.factionId;
      const roll = rng.float(CONFIG.BATTLE_RANDOM_MIN, CONFIG.BATTLE_RANDOM_MAX);
      const attackPower =
        myTroops * (1 + effectiveWu(combatant) * CONFIG.BATTLE_ATK_WU_MULT) * roll;

      // 攻方先打**城牆**：傷害先扣駐軍，城破才輪到守將——圍城先破城、後巷戰。
      // 守方反擊直接打攻方（在野外，沒有城牆）。
      // Attackers hit the **walls first**: garrison damage before the defending
      // leaders - breach the walls, then fight in the streets. Defenders strike the
      // attackers directly (in the open, no walls).
      if (isAttacker && garrison > 0) {
        const damage = strikeDamage(attackPower, fortress);
        const applied = Math.min(damage, garrison);
        garrison -= applied;
        seq++;
        strikeRows.push({
          worldId,
          round,
          seq,
          warRound,
          placeId: place.id,
          attackerId: combatant.id,
          attackerName: combatant.name,
          attackerFactionId: combatant.factionId,
          defenderId: 'garrison',
          defenderName: '駐軍 ' + (garrison + applied),
          defenderFactionId: null,
          attackPower,
          defencePower: applied,
          roll,
          damage: applied,
          outcome: 'hit',
        });
        // 駐軍打空了：後面的攻方這輪沒有目標 /
        // The garrison is gone: later attackers have no target this round
        if (garrison <= 0) break;
        continue;
      }

      const enemies = livingEnemies(combatant.factionId!);
      if (enemies.length === 0) break;

      // 目標：守方被攻時行政官優先（斬首），其餘打兵力最高者 /
      // Target: the administrator first (decapitation), then the strongest
      let target = enemies[0]!;
      if (isAttacker) {
        const adminTarget = enemies.find((d) => place.administratorId === d.id);
        target =
          adminTarget ??
          enemies.reduce((a, b) => ((troops.get(b.id) ?? 0) > (troops.get(a.id) ?? 0) ? b : a));
      } else {
        target = enemies.reduce((a, b) => ((troops.get(b.id) ?? 0) > (troops.get(a.id) ?? 0) ? b : a));
      }

      // 防禦係數：守將有體魄＋堡壘；攻方沒有堡壘（在野外）/
      // Defence factor: defending leaders bring physique + fortress; attackers in
      // the open bring physique only
      const targetIsDefender = target.factionId === place.factionId;
      const targetTroops = troops.get(target.id) ?? 0;
      const defenceFactor =
        (1 + effectiveTi(target) * CONFIG.BATTLE_DEF_TI_MULT) *
        (targetIsDefender ? fortress : 1);
      const damage = strikeDamage(attackPower, defenceFactor);
      const applied = Math.min(damage, targetTroops);
      const remaining = targetTroops - applied;
      troops.set(target.id, remaining);

      const report = buildBattleReport('assault', {
        attackerTroops: myTroops,
        attackerWu: effectiveWu(combatant),
        attackRoll: roll,
        attackPower,
        defenderGarrison: targetTroops,
        defenderFortress: targetIsDefender ? place.fortress : 0,
        defenceRoll: 1,
        defencePower: Math.floor(targetTroops * defenceFactor),
      });
      lastReport = report;

      seq++;
      strikeRows.push({
        worldId,
        round,
        seq,
        warRound,
        placeId: place.id,
        attackerId: combatant.id,
        attackerName: combatant.name,
        attackerFactionId: combatant.factionId,
        defenderId: target.id,
        defenderName: target.name,
        defenderFactionId: target.factionId,
        attackPower,
        defencePower: Math.floor(targetTroops * defenceFactor),
        roll,
        damage: applied,
        outcome: remaining <= 0 ? 'killed' : 'hit',
      });

      // 兵力歸零：逃亡擲骰（對手最快的成員追擊）→ 逃或死 /
      // Troops zeroed: an escape roll (pursued by the fastest enemy) -> flee or die
      if (remaining <= 0) {
        alive.delete(target.id);
        const pursuer = combatants
          .filter(
            (c) =>
              alive.has(c.id) &&
              c.factionId !== null &&
              c.factionId !== target.factionId
          )
          .reduce<((typeof combatants)[number]) | null>(
            (best, c) => (!best || c.speed > best.speed ? c : best),
            null
          );
        const outcome = await resolveRouted(
          target,
          place.id,
          pursuer ? pursuer.speed : 0,
          report,
          combatant.name
        );
        strikeRows[strikeRows.length - 1]!.outcome = outcome;
      }
    }

    // 全員疲勞（攻守皆然——久戰兩敗俱傷，守方有堡壘減傷抵消）/
    // Everyone fatigues (both sides — long wars hurt; the fortress offsets it for
    // the defence)
    for (const c of combatants) {
      const before = troops.get(c.id) ?? 0;
      const after = warFatigue(before);
      troops.set(c.id, after);
      if (after !== before) {
        await prisma.character.update({
          where: { id: c.id },
          data: { troops: after },
        });
      }
    }
    if (garrison !== place.garrison) {
      await prisma.place.update({
        where: { id: place.id },
        data: { garrison },
      });
    }

    // 一輪結束：判定戰爭走向 /
    // After the pass: decide the war's direction
    const verdict = warVerdict({
      garrison,
      attackerTroops: attackers.reduce(
        (s, a) => s + (troops.get(a.id) ?? 0),
        0
      ),
      defenderTroops: defenders.reduce(
        (s, d) => s + (alive.has(d.id) ? (troops.get(d.id) ?? 0) : 0),
        0
      ),
      roundsFought: warRound,
    });

    if (verdict === 'capture') {
      // 守方全空：佔領。攻勢領袖 = 攻方中兵力最高者（本輪打完後）/
      // The defence is gone: capture. The assault's leader = the strongest attacker
      // remaining after this round
      const attackerFaction = attackers[0]!.factionId!;
      const leader = attackers
        .filter((a) => a.factionId === attackerFaction)
        .sort((a, b) => (troops.get(b.id) ?? 0) - (troops.get(a.id) ?? 0))[0]!;
      await prisma.place.update({
        where: { id: place.id },
        data: { factionId: attackerFaction, garrison: 0 },
      });
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'PLACE_CAPTURED',
          data: {
            charId: leader.id,
            charName: leader.name,
            placeId: place.id,
            placeName: place.name,
            factionId: attackerFaction,
            garrisonFought: place.garrison,
            report: lastReport,
          },
        },
      });
      if (!place.administratorId) {
        await grantAdmin({
          worldId,
          round,
          place: { id: place.id, name: place.name },
          char: { id: leader.id, name: leader.name },
        });
      }
    } else if (verdict === 'rout' || verdict === 'retreat') {
      // 攻方潰逃／退兵：每人各自逃亡擲骰或陣亡。守軍不動（他們在家）/
      // The attackers rout or retreat: each flees or dies. The defence stays (it is
      // their home).
      const pursuer = defenders
        .filter((d) => alive.has(d.id))
        .reduce<((typeof defenders)[number]) | null>(
          (best, d) => (!best || d.speed > best.speed ? d : best),
          null
        );
      for (const attacker of attackers) {
        if (!alive.has(attacker.id)) continue;
        await resolveRouted(
          attacker,
          place.id,
          pursuer ? pursuer.speed : 0,
          lastReport,
          pursuer ? pursuer.name : '駐軍'
        );
      }
    }
    // 'hold' / 'continue'：守住了或繼續——都不需要額外處理 /
    // 'hold' / 'continue': held or still grinding — nothing more to do
  }

  // 出手紀錄批次寫入（戰爭回放的資料來源）/
  // Batch-write the strike rows (the war replay's data source)
  if (strikeRows.length > 0) {
    await prisma.battleStrike.createMany({ data: strikeRows });
  }

  // ── 死亡善後：王位繼承／崩解 + 清空死者佔用的行政官席位 ──
  // 修復前戰死什麼都不觸發：君王戰死 → faction.kingId 永遠指向死人、勢力永不崩解
  // 也永不繼承；行政官戰死 → 席位被死人佔著（指派階段只補 NULL 席），而且經濟階段
  // 抓君王／行政官的 jing 不過濾 alive，死人每回合照領 40% 分成。
  // 收尾時**一次**處理：指派階段（12）與崩解階段（13）都在戰鬥之後，所以繼承的新王
  // 與清空的席位同一回合就被下游看見。
  //
  // ── Death aftermath: succession/collapse + clearing seats the dead held ──
  // Before the fix a battle death triggered nothing: a dead king left
  // faction.kingId on a corpse with neither succession nor collapse ever firing, and
  // a dead administrator kept the seat (the assignment phase only fills NULL seats)
  // while the economy fetched the king/admin's jing with no aliveness filter — a
  // corpse collecting the 40% share every round. Processed **once at the end**: the
  // assignment (12) and collapse (13) phases both run after battle, so the new heir
  // and the cleared seats are visible downstream in the same round.
  await processDeadLeaders(worldId, round, deadLeaders);

  return battleCount;
}
