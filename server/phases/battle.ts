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
import { estimateAttack } from '@/lib/warEstimate';
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
function survivorTroops(troops: number): number {
  return Math.max(1, Math.floor(troops));
}

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

  // ── A. 無主之地進攻 / Assaults on unowned places ─────────────────────────
  // 將領抵達無主之地：駐軍 > 0 則與駐軍交戰，否則直接佔領 /
  // Commander arrives at unowned place: fight the garrison if > 0, else free capture
  const unownedPlaces = await prisma.place.findMany({
    where: { worldId, factionId: null },
    include: {
      characters: {
        where: { alive: true },
        // isKing：戰死的君王要觸發繼承／崩解（見 processDeadLeaders）/
        // isKing: a battle-dead king must trigger succession/collapse (see processDeadLeaders)
        select: { id: true, factionId: true, wu: true, speed: true, troops: true, name: true, isKing: true },
      },
    },
  });

  for (const place of unownedPlaces) {
    if (place.characters.length === 0) continue;

    // 攻擊者：有陣營、有兵力，依速度降序，取最快者執行本回合進攻 /
    // Attackers: faction members with troops, speed descending; fastest acts this round
    const attackers = place.characters
      .filter((c) => c.factionId !== null && c.troops > 0)
      .sort((a, b) => b.speed - a.speed);
    const attacker = attackers[0];
    if (!attacker || !attacker.factionId) continue;

    // 這一場的計算明細，供戰報顯示。沒有駐軍時維持 null —— 那本身就是「無守軍、直接
    // 佔領」，戰報要明確說出來，而不是留白。
    //
    // The arithmetic behind this engagement, for the battle report. It stays null when
    // there was no garrison, and that *is* the "no defenders, walk-in capture" case.
    let battleReport: ReturnType<typeof buildBattleReport> = null;

    let captured = false;

    if (place.garrison > 0) {
      // 與駐軍交戰（駐軍無統帥，防禦只算兵力 × 堡壘）/
      // Fight the garrison (no commander: defense = troops × fortress only)
      battleCount++;

      const atkRandom = rng.float(
        CONFIG.BATTLE_RANDOM_MIN,
        CONFIG.BATTLE_RANDOM_MAX
      );
      // **有效**武力：同地點的朋友提高它，不滿的人降低它。攻擊力用它計算，戰報也用
      // 它——兩者必須是同一個數字，否則報告裡的算式對不上。
      //
      // The **effective** martial: co-located friends raise it, co-located gripes lower it.
      // The attack power is computed with it and the report quotes it — they have to be the
      // same number, or the arithmetic in the report will not add up.
      const attackerWu = effectiveWu(attacker);
      const atk =
        attacker.troops *
        (1 + attackerWu * CONFIG.BATTLE_ATK_WU_MULT) *
        atkRandom;

      const defRandom = rng.float(
        CONFIG.BATTLE_RANDOM_MIN,
        CONFIG.BATTLE_RANDOM_MAX
      );
      const def =
        place.garrison *
        fortressDefenceMult(place.fortress) *
        defRandom;

      if (atk > def) {
        const reportParts = {
          attackerTroops: attacker.troops,
          attackerWu,
          attackRoll: atkRandom,
          attackPower: atk,
          defenderGarrison: place.garrison,
          defenderFortress: place.fortress,
          defenceRoll: defRandom,
          defencePower: def,
        };
        battleReport = buildBattleReport('assault', reportParts);
        // 進攻成功：駐軍全滅，攻擊者疲勞後佔領 /
        // Assault succeeds: garrison wiped, attacker fatigues then captures
        const fatiguedTroops = survivorTroops(
          attacker.troops * CONFIG.CHAR_FATIGUE_PER_WIN
        );
        await prisma.character.update({
          where: { id: attacker.id },
          data: { troops: fatiguedTroops },
        });
        captured = true;
      } else {
        const reportParts = {
          attackerTroops: attacker.troops,
          attackerWu,
          attackRoll: atkRandom,
          attackPower: atk,
          defenderGarrison: place.garrison,
          defenderFortress: place.fortress,
          defenceRoll: defRandom,
          defencePower: def,
        };
        battleReport = buildBattleReport('repelled', reportParts);
        // 進攻失敗：攻擊者依速度差嘗試逃跑（駐軍速度視為 0）/
        // Assault fails: attacker tries to escape (garrison speed treated as 0)
        const speedDiff = attacker.speed;
        const escapeChance = Math.max(
          CONFIG.SPEED_ESCAPE_MIN,
          Math.min(
            CONFIG.SPEED_ESCAPE_MAX,
            CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
          )
        );

        if (rng.chance(escapeChance)) {
          const neighbors = adjacent.get(place.id) ?? [];
          let escapePlaceId: string | null = null;
          for (const neighbor of neighbors) {
            const neighborFaction = placeFactionMap.get(neighbor);
            if (
              neighborFaction === attacker.factionId ||
              neighborFaction === null
            ) {
              escapePlaceId = neighbor;
              break;
            }
          }

          if (escapePlaceId) {
            await prisma.character.update({
              where: { id: attacker.id },
              data: { troops: 1, placeId: escapePlaceId }, // survivorTroops：潰敗不解除武裝 / a rout does not disarm
            });
            await recordMove({
              worldId,
              round,
              charId: attacker.id,
              charName: attacker.name,
              factionId: attacker.factionId,
              fromPlaceId: place.id,
              toPlaceId: escapePlaceId,
            });
          } else {
            // 無路可退：撿回一命但**留駐原地**（troops 歸 0）。事件必須說實話——
            // 這不是「逃離」，日誌的措辭由 `escaped` 決定 /
            // No way out: survived but **stayed on the spot** (troops zeroed). The
            // event has to tell the truth — this is not an escape; the log's wording
            // keys off `escaped`
            await prisma.character.update({
              where: { id: attacker.id },
              data: { troops: 1 }, // survivorTroops：潰敗不解除武裝 / a rout does not disarm
            });
          }

          await prisma.event.create({
            data: {
              worldId,
              round,
              type: 'ESCAPE_SUCCESS',
              data: {
                charId: attacker.id,
                charName: attacker.name,
                placeId: place.id,
                placeName: place.name,
                speedDiff,
                // **真的離開了嗎**：有友方（或無主）鄰居可退才算逃離；否則只是原地
                // 存活。附上這一場的算式（outcome='repelled'），日誌的 戰報 按鈕
                // 才開得出來——以前這份報告算完就丟了。
                //
                // Did they **actually leave**? Only with a friendly (or unowned)
                // neighbour to fall back to; otherwise they merely survived in place.
                // The engagement's arithmetic (outcome='repelled') rides along so the
                // log's 戰報 button opens — it used to be computed and thrown away.
                escaped: escapePlaceId !== null,
                toPlaceName: escapePlaceId
                  ? placeNameById.get(escapePlaceId) ?? null
                  : null,
                report: battleReport,
              },
            },
          });
        } else {
          // 逃跑失敗 — 死亡 / Escape failed — death
          await prisma.character.update({
            where: { id: attacker.id },
            data: { alive: false, diedAtRound: round },
          });
          // 收集給收尾善後（王位／席位）/ Collected for the end-of-phase aftermath
          deadLeaders.push({
            id: attacker.id,
            name: attacker.name,
            factionId: attacker.factionId,
            isKing: attacker.isKing,
          });

          await prisma.event.create({
            data: {
              worldId,
              round,
              type: 'BATTLE_DEATH',
              data: {
                charId: attacker.id,
                charName: attacker.name,
                placeId: place.id,
                placeName: place.name,
                defenderName: `駐軍 ${place.garrison}`,
                // 死亡的算式一樣附上：被擊退然後逃脫失敗，這場仗打過什麼要能查 /
                // The death carries the arithmetic too: repelled, then the escape
                // failed — the fight's numbers have to be inspectable
                report: battleReport,
              },
            },
          });
        }
      }
    } else {
      // 無駐軍 — 直接佔領 / No garrison — free capture
      captured = true;
    }

    if (captured) {
      // 陣營控制該地 / Faction controls the place
      await prisma.place.update({
        where: { id: place.id },
        data: { factionId: attacker.factionId, garrison: 0 },
      });

      // 佔領事件 **先寫**，再任命 / The capture event is written FIRST, then the appointment
      //
      // 順序是因果的：先佔領，之後才可能成為該地行政官。這兩個 `await` 是循序的，沒有
      // 競爭，所以寫進資料庫的先後完全由這裡的程式順序決定。寫反了的時候，日誌讀起來是
      // 「覃雲 被任命為 炫灰濱 的行政官」**然後才**「覃雲 佔領了 炫灰濱」——先被任命、
      // 後佔領，時間線是倒的，而且沒有任何機制會事後修正它。
      //
      // 這裡只調換兩段 `await`，不動遊戲行為：行政官仍然在 build 階段（第 11 階段）之前
      // 到位，所以「佔領當回合就能升級建築」依然成立。改變的只有事件在日誌裡的先後。
      //
      // The order here is the causal one: the place is captured first, and only then can
      // anyone be its administrator. The two `await`s are sequential with no race, so the
      // order in the database is decided entirely by the order of these statements. Written
      // the other way round, the log reads "appointed administrator of X" *before*
      // "captured X" — appointed first, captured second, a backwards timeline that nothing
      // downstream can repair.
      //
      // Only the two `await`s are swapped; gameplay is untouched. The administrator still
      // arrives before the build phase (11), so "captured this round, upgraded this round"
      // still holds. Only the log's ordering changes.
      await prisma.event.create({
        data: {
          worldId,
          round,
          type: 'PLACE_CAPTURED',
          data: {
            charId: attacker.id,
            charName: attacker.name,
            placeId: place.id,
            placeName: place.name,
            factionId: attacker.factionId,
            garrisonFought: place.garrison,
            report: battleReport,
          },
        },
      });

      // 若無總督，佔領者成為總督（不受行政官冷卻限制：戰役奪取照常生效；
      // 但仍會打上冷卻錨點，之後 AI 10 回合內不得再換）/
      // Capturer becomes admin if none (not blocked by the admin cooldown:
      // battle captures still apply, but they stamp the cooldown anchor)
      if (!place.administratorId) {
        await grantAdmin({
          worldId,
          round,
          place: { id: place.id, name: place.name },
          char: { id: attacker.id, name: attacker.name },
        });
      }
    }
  }

  // ── B. 已佔領地點的戰鬥（重新查詢，納入剛易主的地點，讓後到的攻擊者與新擁有者交戰）/
  // Battles at owned places (re-query to include just-captured places so late
  // attackers fight the new owner)
  const places = await prisma.place.findMany({
    where: { worldId, factionId: { not: null } },
    include: {
      characters: {
        where: { alive: true },
        // isKing：戰死的君王要觸發繼承／崩解（見 processDeadLeaders）/
        // isKing: a battle-dead king must trigger succession/collapse (see processDeadLeaders)
        select: { id: true, factionId: true, wu: true, tong: true, ti: true, speed: true, troops: true, name: true, isKing: true },
      },
    },
  });

  for (const place of places) {
    if (!place.factionId) continue;

    // ── 合戰（army vs army）──
    // 以前是「車輪戰」：多攻方按速度輪流 1v1、多守方逐一接戰，兵力**完全不合并**
    // ——三個 50 兵的將領輪流把命送給一個 100 兵守將（守將贏了不疲勞）。號令集結
    // 來的大軍因此毫無合力優勢。現在**兩軍各擲一骰**：攻方全員戰力相加，守方駐軍
    // + 全員將領相加，一次判定。
    // 攻方**按勢力分組**——兩個敵對勢力的兵不會併成一家；本回合只有**總估計戰力
    // 最大**的那一組開戰（多勢力同場很罕見，其餘的下一回合再打）。
    //
    // ── Combined engagement (army vs army) ──
    // The old form was a relay of duels: attackers took turns 1v1 by speed and
    // defenders stepped up one by one, with power **never combined** — three 50-troop
    // leaders fed themselves one by one to a 100-troop defender who never fatigued on
    // a win, so an army rallied by a signal had no combined weight at all. Now **each
    // army rolls once**: the attackers' full power summed against the garrison plus
    // every defending leader, one verdict. Attackers are **grouped by faction** — two
    // hostile factions do not merge into one army; this round only the group with the
    // **largest total estimated attack** engages (co-occupancy by several factions is
    // rare; the rest fight next round).
    const defenders = place.characters.filter(
      (c) => c.factionId === place.factionId
    );
    if (defenders.length === 0) continue;

    // 攻方按勢力分組；0 兵的打不了，也沒資格代表勢力開戰 /
    // Attackers grouped by faction; a 0-troop leader neither fights nor commits a
    // faction to battle
    const groups = new Map<string, typeof place.characters>();
    for (const c of place.characters) {
      if (c.factionId === null || c.factionId === place.factionId) continue;
      if (c.troops <= 0) continue;
      const list = groups.get(c.factionId) ?? [];
      list.push(c);
      groups.set(c.factionId, list);
    }
    if (groups.size === 0) continue;

    // 開戰的組：總估計攻擊最大者；平手用 factionId 裁決（必須確定性）/
    // The engaging group: the largest total estimated attack; ties break by factionId
    // (the choice must be deterministic)
    let attackingGroup: typeof place.characters = [];
    let attackingFactionId = '';
    let bestGroupPower = -1;
    for (const [groupFactionId, members] of groups) {
      const power = members.reduce((s, m) => s + estimateAttack(m), 0);
      if (
        power > bestGroupPower ||
        (power === bestGroupPower &&
          groupFactionId.localeCompare(attackingFactionId) < 0)
      ) {
        bestGroupPower = power;
        attackingGroup = members;
        attackingFactionId = groupFactionId;
      }
    }

    // 速度降序：誰代表這場攻勢（佔領者、追擊速度）/ Speed descending: who leads the
    // assault (the capturer, the pursuit speed)
    const sortedAttackers = [...attackingGroup].sort((a, b) => b.speed - a.speed);
    const leadAttacker = sortedAttackers[0]!;
    // 守方代表：行政官優先（守方的臉面），再取兵力最高 / The defence's leader: the
    // administrator first (the face of the defence), then the strongest
    const sortedDefenders = [...defenders].sort((a, b) => b.troops - a.troops);
    const leadDefender =
      defenders.find((d) => place.administratorId === d.id) ?? sortedDefenders[0]!;

    type Combatant = (typeof place.characters)[number];

    /**
     * 潰敗方的每一員各自逃亡（追擊者 = 對方最快／最強的一員——大軍追擊更難逃）。
     * 逃跑目的地、事件形狀與 A 區**同一套**；這裡收攏舊寫法裡重複的潰敗處理。
     * Every member of the routed side flees individually (the pursuer is the other
     * side's fastest/strongest — an army's pursuit is harder to outrun). Destination
     * and event shape identical to section A; this folds the duplicated rout blocks
     * of the old relay form.
     */
    const resolveRout = async (
      routed: readonly Combatant[],
      pursuerSpeed: number,
      side: 'defender' | 'attacker',
      counterpart: { id: string; name: string }
    ): Promise<void> => {
      for (const member of routed) {
        const speedDiff = member.speed - pursuerSpeed;
        const escapeChance = Math.max(
          CONFIG.SPEED_ESCAPE_MIN,
          Math.min(
            CONFIG.SPEED_ESCAPE_MAX,
            CONFIG.SPEED_ESCAPE_BASE + speedDiff * CONFIG.SPEED_ESCAPE_PER_DIFF
          )
        );

        if (rng.chance(escapeChance)) {
          // 逃跑成功 — 移至附近友方地點 / Escape successful — move to a nearby friendly place
          const neighbors = adjacent.get(place.id) ?? [];
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
              data: { troops: 1, placeId: escapePlaceId }, // survivorTroops：潰敗不解除武裝 / a rout does not disarm
            });
            await recordMove({
              worldId,
              round,
              charId: member.id,
              charName: member.name,
              factionId: member.factionId,
              fromPlaceId: place.id,
              toPlaceId: escapePlaceId,
            });
          } else {
            // 無路可退：撿回一命但留駐原地（與 A 區同一條誠實規則）/
            // No way out: survived but stayed put (the same honesty rule as section A)
            await prisma.character.update({
              where: { id: member.id },
              data: { troops: 1 }, // survivorTroops：潰敗不解除武裝 / a rout does not disarm
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
                placeId: place.id,
                placeName: place.name,
                speedDiff,
                escaped: escapePlaceId !== null,
                toPlaceName: escapePlaceId
                  ? placeNameById.get(escapePlaceId) ?? null
                  : null,
                report: engagementReport,
              },
            },
          });
        } else {
          // 逃跑失敗 — 死亡 / Escape failed — death
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
                placeId: place.id,
                placeName: place.name,
                // 對手是誰：守方戰死記攻方代表，攻方戰死記守方代表——合戰是群體的，
                // 但日誌要點得到一個人 /
                // The counterpart: a dead defender records the assault's leader, a
                // dead attacker the defence's leader — the engagement is collective,
                // but the log row still links to one person
                attackerId: side === 'defender' ? counterpart.id : null,
                attackerName: side === 'defender' ? counterpart.name : null,
                defenderId: side === 'attacker' ? counterpart.id : null,
                defenderName: side === 'attacker' ? counterpart.name : null,
                report: engagementReport,
              },
            },
          });
        }
      }
    };

    // ── 兩軍各擲一骰 ──
    // 攻方戰力 = Σ 兵力 × (1 + 有效武力/30)。報告的 `attackerWu` 是**兵力加權平均**
    // ——線性保證 `總兵力 × (1 + 平均武力/30) × 骰` 與逐人相加**完全相等**，戰報的
    // 算式因此仍然對得上。
    // ── Each army rolls once ──
    // Attack power = Σ troops × (1 + effective wu/30). The report's `attackerWu` is
    // the **troop-weighted mean** — linearity guarantees `total troops × (1 + mean
    // wu/30) × roll` equals the per-leader sum **exactly**, so the report's
    // arithmetic still adds up.
    const atkRandom = rng.float(CONFIG.BATTLE_RANDOM_MIN, CONFIG.BATTLE_RANDOM_MAX);
    const totalTroops = attackingGroup.reduce((s, m) => s + m.troops, 0);
    const meanWu =
      attackingGroup.reduce((s, m) => s + m.troops * effectiveWu(m), 0) / totalTroops;
    const attackPower =
      totalTroops * (1 + meanWu * CONFIG.BATTLE_ATK_WU_MULT) * atkRandom;

    const defRandom = rng.float(CONFIG.BATTLE_RANDOM_MIN, CONFIG.BATTLE_RANDOM_MAX);
    const defenderTroops = defenders.reduce((s, d) => s + d.troops, 0);
    const meanTi =
      defenderTroops > 0
        ? defenders.reduce((s, d) => s + d.troops * effectiveTi(d), 0) /
          defenderTroops
        : 0;
    // 守方基數 = 駐軍 + 守將兵力；**都**乘同一個堡壘倍率（與 estimatePlaceDefence
    // 同一條式——aiMove 的估量因此與實戰一致）/
    // Defence base = garrison + defending leaders' troops; **both** carry the one
    // fortress multiplier (the same formula as estimatePlaceDefence — so aiMove's
    // estimate matches the real fight)
    const defenceBase =
      place.garrison + defenderTroops * (1 + meanTi * CONFIG.BATTLE_DEF_TI_MULT);
    const defencePower =
      defenceBase * fortressDefenceMult(place.fortress) * defRandom;

    // 這一場（兩軍）的算式，供戰報顯示。`defenderGarrison` 放的是**合流守方基數**
    // （駐軍 + 守將兵力），`defenderFortress` 是該地的堡壘等級。
    // The arithmetic of this (army vs army) engagement, for the report.
    // `defenderGarrison` carries the **combined defence base** (garrison + defending
    // leaders' troops) and `defenderFortress` the place's fortress level.
    const engagementReport = buildBattleReport(
      attackPower > defencePower ? 'assault' : 'repelled',
      {
        attackerTroops: totalTroops,
        attackerWu: meanWu,
        attackRoll: atkRandom,
        attackPower,
        defenderGarrison: defenceBase,
        defenderFortress: place.fortress,
        defenceRoll: defRandom,
        defencePower,
      }
    );

        battleCount++;

        if (attackPower > defencePower) {
          // 攻方大捷：守軍全體潰敗——每人各自逃亡（追擊者 = 最快攻方，大軍追擊
          // 更難逃）或戰死。
          // A decisive assault: the whole defence routs — each member flees
          // individually (pursued by the fastest attacker) or dies.
          await resolveRout(defenders, leadAttacker.speed, 'defender', {
            id: leadAttacker.id,
            name: leadAttacker.name,
          });

          // 攻方全體疲勞（合戰人人有份，與舊制每次獲勝 ×疲勞同一個係數）/
          // The whole assaulting force fatigues — everyone took part (the same
          // per-win factor as the old duels)
          for (const member of sortedAttackers) {
            const fatigued = survivorTroops(
              member.troops * CONFIG.CHAR_FATIGUE_PER_WIN
            );
            member.troops = fatigued;
            await prisma.character.update({
              where: { id: member.id },
              data: { troops: fatigued },
            });
          }

          // 佔領：地點易主。駐軍隨守方一起敗，**歸零**——與 A 區同一條規則（以前
          // B 區佔領不洗駐軍，新主人憑空繼承剛被打垮的守軍）。PLACE_CAPTURED
          // **先寫**再任命，順序是因果的：先佔領，之後才可能成為行政官。
          // Capture: the place changes hands. The garrison fell with the defence and
          // **resets to 0** — the same rule as section A (the old section-B capture
          // left the garrison intact, handing the new owner the defenders it had just
          // beaten). PLACE_CAPTURED is written **before** the appointment — the
          // causal order: captured first, only then can anyone be its administrator.
          await prisma.place.update({
            where: { id: place.id },
            data: { factionId: attackingFactionId, garrison: 0 },
          });

          await prisma.event.create({
            data: {
              worldId,
              round,
              type: 'PLACE_CAPTURED',
              data: {
                charId: leadAttacker.id,
                charName: leadAttacker.name,
                placeId: place.id,
                placeName: place.name,
                factionId: attackingFactionId,
                garrisonFought: place.garrison,
                report: engagementReport,
              },
            },
          });

          // 若無總督，攻勢領袖成為總督（不受行政官冷卻限制）/
          // If no administrator, the assault's leader takes the seat (not blocked by
          // the admin cooldown)
          if (!place.administratorId) {
            // grantAdmin 會先清除他在其他地點的總督職，避免唯一約束衝突 /
            // grantAdmin clears the leader's admin role at other places first to
            // avoid the Place.administratorId unique constraint conflict
            await grantAdmin({
              worldId,
              round,
              place: { id: place.id, name: place.name },
              char: { id: leadAttacker.id, name: leadAttacker.name },
            });
          }
        } else {
          // 守軍守住：攻方潰敗——每人各自逃亡（追擊者 = 最強守將）或戰死。
          // 守方不疲勞：守成了就是守成了 /
          // The defence holds: the attackers rout — each flees individually
          // (pursued by the strongest defender) or dies. The defence does not
          // fatigue: holding is holding.
          await resolveRout(sortedAttackers, leadDefender.speed, 'attacker', {
            id: leadDefender.id,
            name: leadDefender.name,
          });
        }
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
