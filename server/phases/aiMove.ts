// ============================================================================
// 階段 9：AI 移動
// Phase 9: AI Movement
// ============================================================================
// 將每個角色朝目標移動（每回合 1 格）。
// Moves each character toward their target (1 tile per turn).
//
// 規則（來自規格）/ Rules (from spec):
// - 每個角色每回合最多移動 1 個地點 / Each character moves at most 1 place per turn
// - 移動順序：速度降序（v1.1）/ Movement order: speed descending (v1.1)
// - 速度相同：以種子 RNG 決定順序 / Same speed: seeded RNG determines order
// - 若角色無目標則原地不動 / If character has no target, they stay put
// - 目標優先順序：號令 > 陣營敵人 > 向最近無主之地行軍 > 原地不動
// - Target priority: Signal > Faction enemy > March to nearest unowned place > Stay put
//
// 使用方式 / Usage:
//   await aiMove(worldId, round, rng);
//   await aiMove(worldId, round, rng, skipIds); // skipIds: 本回合出生者不移動
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import {
  estimateAttack,
  estimatePlaceDefence,
  isThreatened,
} from '@/lib/warEstimate';
import { type Rng } from '@/lib/rng';

/**
 * 將所有角色朝其目標移動。
 * Move all characters toward their targets.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於打破速度平手的種子 RNG / Seeded RNG for tie-breaking movement order
 * @param skipIds - 本回合不得移動的角色 ID（出生回合原地待命）
 *                  Character IDs that must not move this round (spawn-round stay put)
 */
export async function aiMove(
  worldId: string,
  round: number,
  rng: Rng,
  skipIds?: ReadonlySet<string>
): Promise<void> {
  // 取得所有存活角色及其所在地與陣營 / Get all living characters with their current locations and faction
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      name: true,
      placeId: true,
      speed: true,
      factionId: true,
      troops: true,
      // 開打前估量攻防需要武力與體魄（見下方 defenceEstimate）/
      // wu and ti feed the pre-battle estimate (see defenceEstimate below)
      wu: true,
      ti: true,
    },
  });

  // 依速度降序排序（v1.1）/ Sort by speed descending (v1.1)
  // 速度相同時用種子 RNG 做確定性平手裁決 / For same speed, use seeded RNG for deterministic tie-breaking
  const sorted = characters.sort((a, b) => {
    if (a.speed !== b.speed) return b.speed - a.speed;
    // 速度相同：使用 RNG / Same speed: use RNG
    return rng.random() - 0.5;
  });

  // 取得所有道路以進行路徑尋找 / Get all roads for pathfinding
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // 建立鄰接表 / Build adjacency map
  const adjacent = new Map<string, string[]>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, []);
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, []);
    adjacent.get(road.aId)!.push(road.bId);
    adjacent.get(road.bId)!.push(road.aId);
  }

  // 取得本回合的有效號令 / Get active signals for this round
  const activeSignals = await prisma.signal.findMany({
    where: {
      worldId,
      active: true,
      expireRound: { gte: round },
    },
    select: {
      fromId: true,
      targetPlaceId: true,
    },
  });

  // 建立號令對照：characterId -> targetPlaceId / Build signal map: characterId -> targetPlaceId
  const signalTargets = new Map<string, string>();
  for (const signal of activeSignals) {
    signalTargets.set(signal.fromId, signal.targetPlaceId);
  }

  // 取得所有地點及陣營資訊以偵測敵人 / Get all places with their faction info for enemy detection
  const places = await prisma.place.findMany({
    where: { worldId },
    select: {
      id: true,
      factionId: true,
      // 開打前估量守方：駐軍與堡壘等級（見下方 defenceEstimate）/
      // garrison and fortress feed the defender estimate (see defenceEstimate below)
      garrison: true,
      fortress: true,
      // 行政官：受威脅的行政官留守不出征（見主迴圈）/
      // administratorId: a threatened administrator stays home (see the main loop)
      administratorId: true,
    },
  });

  // 建立地點→陣營對照 / Build place faction map
  const placeFactionMap = new Map<string, string | null>();
  for (const place of places) {
    placeFactionMap.set(place.id, place.factionId);
  }

  // 多源 BFS：從所有無主之地起算，每個地點到最近無主之地的距離
  // Multi-source BFS from all unowned places: distance to nearest unowned place
  // 用於「向無主之地行軍」（距離 d 的地點走一步到距離 d-1 的鄰居）
  // Used for marching on unowned land (step from distance d to a neighbor at d-1)
  const distToUnowned = new Map<string, number>();
  const bfsQueue: string[] = [];
  for (const place of places) {
    if (place.factionId === null) {
      distToUnowned.set(place.id, 0);
      bfsQueue.push(place.id);
    }
  }
  for (let qi = 0; qi < bfsQueue.length; qi++) {
    const cur = bfsQueue[qi];
    const d = distToUnowned.get(cur)!;
    for (const nb of adjacent.get(cur) ?? []) {
      if (!distToUnowned.has(nb)) {
        distToUnowned.set(nb, d + 1);
        bfsQueue.push(nb);
      }
    }
  }

  // ── 開打前的估量（warEstimate.ts——攻守共用同一份，battle.ts 同一組係數）──
  // 每個地方的**估計防禦**：駐軍 + 同陣營守軍將領（體魄加成）× 堡壘倍率。
  // ── The pre-battle estimate (warEstimate.ts — both sides share it, and the
  // coefficients are battle.ts's own) ──
  // Each place's **estimated defence**: garrison plus same-faction defending leaders
  // (physique scaled), times the fortress multiplier.
  const residentsByPlace = new Map<string, typeof characters>();
  for (const c of characters) {
    const list = residentsByPlace.get(c.placeId) ?? [];
    list.push(c);
    residentsByPlace.set(c.placeId, list);
  }
  const administratorByPlace = new Map(
    places.map((p) => [p.id, p.administratorId] as const)
  );
  const defenceEstimate = new Map<string, number>();
  for (const place of places) {
    const defenders = (residentsByPlace.get(place.id) ?? []).filter(
      (c) => c.factionId !== null && c.factionId === place.factionId
    );
    defenceEstimate.set(place.id, estimatePlaceDefence(place, defenders));
  }

  // ── 移動先收集、最後一次寫入 ──
  // 主迴圈的**每一次決策都只讀初始快照**：residentsByPlace / defenceEstimate /
  // placeFactionMap / signalTargets 全部在迴圈前建成，迴圈內從不重讀資料庫，
  // 也從不因前一人的移動而改變（昔日 `character.update` 立即落地，但沒有任何後續
  // 決策去讀它——逐筆寫入對結果毫無作用，只對雲端的 round trip 有貢獻）。所以把
  // 移動收進記憶體、回合結尾一次 UPDATE + 一次 createMany，行為逐位元組相同，
  // 每人兩次 round trip 變成整階段兩次。
  //
  // ── Collect the moves, write once at the end ──
  // Every decision in the main loop reads only the **initial snapshots**:
  // residentsByPlace / defenceEstimate / placeFactionMap / signalTargets are all
  // built before the loop, and the loop never re-reads the database nor can it be
  // changed by an earlier character's move (the old `character.update` landed
  // immediately, but no later decision ever read it — the per-move write had no
  // effect on the outcome, only on the cloud round trips). So the moves are
  // collected in memory and flushed once at the end — one UPDATE plus one
  // createMany — which is byte-for-byte the same behaviour at two round trips for
  // the whole phase instead of two per character.
  //
  // 事件寫進 createMany 的陣列依排序後的角色次序——與昔日逐筆建立的順序完全相同，
  // 事件日誌的 `{ round asc, createdAt asc, id asc }` 排序照樣還原原序。
  //
  // The createMany's array follows the sorted character order — exactly the order the
  // old per-move creates ran in, so the log's `{ round asc, createdAt asc, id asc }`
  // ordering restores the same sequence.
  //
  // 透明寫入（不用交易）：昔日每句也各自落地，中途失敗一樣留下半套——新的暴露面
  // 不大於舊的，而回合尚未推進，失敗的回合會整個重跑。
  //
  // Left outside a transaction on purpose: the old statements each landed on their
  // own, and a mid-loop failure left a partial set then too — the new exposure is no
  // larger, and the round has not advanced, so a failed round reruns in full.
  type MoveRow = {
    charId: string;
    charName: string;
    factionId: string | null;
    fromPlaceId: string;
    toPlaceId: string;
  };
  const moveRows: MoveRow[] = [];

  // 移動每個角色 / Move each character
  for (const char of sorted) {
    // 本回合出生的角色原地待命（出生回合不移動）/
    // Spawned this round: stay put (no movement in spawn round)
    if (skipIds?.has(char.id)) continue;

    // 1. 檢查角色是否有號令目標 / Check if character has a target from signal
    const signalTarget = signalTargets.get(char.id);
    if (signalTarget) {
      // 朝號令目標移動 / Move toward signal target
      const neighbors = adjacent.get(char.placeId) ?? [];
      if (neighbors.includes(signalTarget)) {
        // 可直接移至目標。但**敵地要先估量**：君王的號令不是送死令——打不贏
        // （估計攻擊 < 估計防禦 × AI_ATTACK_ADVANTAGE，與自主進攻同一道門檻）
        // 就原地等待，經濟階段購兵後再接令。馳援自家/無主地不需要門檻。
        // Can move directly onto the target. But a **hostile target needs the
        // estimate first**: the king's call is not a suicide order — if it is
        // unwinnable (estimated attack < defence × AI_ATTACK_ADVANTAGE, the same
        // bar as a self-chosen assault), wait in place and re-arm. Relieving an own
        // or unowned place needs no bar.
        const targetFaction = placeFactionMap.get(signalTarget);
        const hostile = targetFaction !== char.factionId;
        const winnable =
          !hostile ||
          estimateAttack(char) >=
            (defenceEstimate.get(signalTarget) ?? 0) * CONFIG.AI_ATTACK_ADVANTAGE;
        if (winnable) {
          moveRows.push({
            charId: char.id,
            charName: char.name,
            factionId: char.factionId,
            fromPlaceId: char.placeId,
            toPlaceId: signalTarget,
          });
        }
        continue;
      }

      // 尋找可更接近目標的相鄰地點（BFS 深度 1）/ Find adjacent place that gets closer to target (BFS depth 1)
      // 跳過**敵對**佔領的鄰地；無主與友方鄰地都可以當跳板。比較基準同樣是角色
      // 自己的勢力——否則站在敵地上接令的人，只能沿著敵人的領土行軍。
      // Skip **hostile**-owned neighbours; unowned and friendly ones both work as
      // stepping stones. The reference is again the character's own faction —
      // otherwise a leader taking a call from enemy ground could only march
      // through enemy territory.
      for (const neighbor of neighbors) {
        const neighborFaction = placeFactionMap.get(neighbor);
        if (neighborFaction !== null && neighborFaction !== char.factionId) continue; // 跳過敵方地點 / Skip hostile places
        moveRows.push({
          charId: char.id,
          charName: char.name,
          factionId: char.factionId,
          fromPlaceId: char.placeId,
          toPlaceId: neighbor,
        });
        break;
      }
      continue;
    }

    // ── 腳下有敵人：留在原地打 ──
    // 我所在的地方**駐著敵對將領**（我是守方，或我是踩上敵地的入侵者）就不移動：
    // 戰鬥階段（階段 10）會解析這場戰爭。以前 aiMove 只看**相鄰**地點——守方會丟下
    // 被人踩著的自家地盤、去佔一個防禦為 0 的空地方，入侵者也不會留在敵地上開戰，
    // 兩人各走各的路，永遠碰不上（aiMove 跑在戰鬥之前，走掉了就打不成）。
    // 號令優先於留守：上面的分支已經 continue。無所屬的將領不參戰，照樣行軍。
    //
    // ── An enemy at my feet: stay and fight ──
    // When the place I am standing in **hosts a hostile leader** (I am the
    // defender, or the invader standing on enemy ground), I do not move: the
    // battle phase (phase 10) resolves that war. aiMove used to look only at
    // **adjacent** places — a defender would abandon their own place with an enemy
    // inside it to go grab a defence-0 empty one, and an invader would not stay to
    // press the attack, so the two walked apart and never met (aiMove runs before
    // the battle, and once they walk off there is no fight to resolve). A signal
    // outranks staying: that branch already continued above. A factionless leader
    // never fights, so they keep marching.
    if (char.factionId) {
      const hostileHere = (residentsByPlace.get(char.placeId) ?? []).some(
        (r) =>
          r.id !== char.id &&
          r.factionId !== null &&
          r.factionId !== char.factionId
      );
      if (hostileHere) continue;
    }

    // ── 受威脅的行政官留守 ──
    // 行政官被 aiMove 拉出去進攻，自己管的地方就空了——最能打的守軍不在。規則：
    // 行政官所在地**受威脅**（warEstimate 的 isThreatened：在場或相鄰的敵將，
    // 估計攻擊蓋得過本地估計防禦）就不出征——他的兵力與體魄本來就計入本地防禦，
    // 人走了防禦直接掉一截。號令（君王明令）優先於留守：上面的分支已經 continue。
    // 與攻方門檻（AI_ATTACK_ADVANTAGE）不同：防守要比進攻更早警覺。
    //
    // ── A threatened administrator stays home ──
    // aiMove would march the administrator out to attack and leave their place
    // empty — the strongest defender gone. Rule: when the administrator's place is
    // **threatened** (warEstimate's isThreatened: some hostile leader present or
    // adjacent whose estimated attack clears the local estimated defence), they do
    // not march out — their troops and physique already count toward the local
    // defence, and leaving drops it. A signal (the king's explicit order) outranks
    // staying: that branch already continued above. Deliberately a lower bar than
    // the attacking side's AI_ATTACK_ADVANTAGE: defence wakes before offence
    // commits.
    if (char.factionId && administratorByPlace.get(char.placeId) === char.id) {
      let maxHostileAttack = 0;
      const nearby = [char.placeId, ...(adjacent.get(char.placeId) ?? [])];
      for (const pid of nearby) {
        for (const resident of residentsByPlace.get(pid) ?? []) {
          if (resident.factionId === null || resident.factionId === char.factionId) continue;
          if (resident.id === char.id) continue;
          maxHostileAttack = Math.max(maxHostileAttack, estimateAttack(resident));
        }
      }
      if (isThreatened(defenceEstimate.get(char.placeId) ?? 0, maxHostileAttack)) {
        // 留守：本回合完全不出征 / Stay: no movement at all this round
        continue;
      }
    }

    // 2. 若無號令，檢查陣營附近是否有敵人 / If no signal, check if faction has enemies nearby
    if (char.factionId) {
      const neighbors = adjacent.get(char.placeId) ?? [];

      // 尋找敵方地點（敵方勢力或無主）。比較基準是**角色自己的勢力**，不是腳下
      // 地點的勢力：站在無主之地上的人，不該把自己勢力的鄰地當成目標；站在敵地上
      // 的人，也不該把友方鄰地當成目標。無主鄰地照樣是目標——誰都可以去佔。
      // Find enemy places (hostile factions or unowned). The reference is the
      // **character's own faction**, not the current place's: someone standing on
      // unowned land must not target their own faction's neighbours, and someone
      // standing on enemy ground must not target friendly ones. Unowned neighbours
      // stay targets — anyone may take them.
      const enemyPlaces = neighbors.filter((n) => {
        const nFaction = placeFactionMap.get(n);
        return nFaction !== char.factionId;
      });

      if (enemyPlaces.length > 0) {
        // **開打前先估量**（原行為是 rng.pick 隨機撿一個敵鄰衝進去，兵力不足也衝，
        // 結果就是「賈寶 在 靜霞堡 戰死」這種送頭）：
        //
        // - 攻方估計戰力 = 兵力 × (1 + 武力 × BATTLE_ATK_WU_MULT)——battle.ts 的
        //   攻擊式去掉隨機骰（期望值 1.0）
        // - 守方估計防禦 = defenceEstimate（駐軍 + 守軍將領，含堡壘倍率）
        // - 只有**估計戰力 ≥ 估計防禦 × AI_ATTACK_ADVANTAGE** 才開打；幾個可打的
        //   之中挑**最弱**的（不是隨機——會打仗就是要挑贏面最大的）
        // - 沒有任何一個打得過：**原地等待**。經濟階段會用他的金幣購兵，
        //   下回合再評估——等兵、等錢，而不是送死。
        // - 兵力為 0 的（剛被擊退的倖存者）不衝敵陣：battle.ts 根本不會讓 0 兵的
        //   人開戰，衝過去只是站在敵人地盤上，所以同樣原地等待。
        //
        // **Estimate before engaging** (the old behaviour `rng.pick`ed an enemy
        // neighbour and charged in regardless of strength — the "died at the
        // neighbouring strong place" kind of suicide):
        //
        // - Estimated attack = troops × (1 + wu × BATTLE_ATK_WU_MULT) — battle.ts's
        //   attack formula with the roll at its expected 1.0
        // - Estimated defence = defenceEstimate (garrison + defenders, fortress
        //   multiplier included)
        // - Engage only when **attack ≥ defence × AI_ATTACK_ADVANTAGE**; among the
        //   viable ones pick the **weakest** (not random — if you must fight, fight
        //   the most winnable)
        // - If none is winnable: **wait in place**. The economy phase buys troops
        //   with his gold and next round re-evaluates — wait and re-arm, not die.
        // - A troops-0 survivor never charges in: battle.ts would not let him fight
        //   anyway, so waiting is the only honest move.
        // - 估計戰力用 estimateAttack（warEstimate.ts，與戰報同一組係數）/
        //   estimated attack via estimateAttack (warEstimate.ts, the report's own coefficients)
        const attackEstimate = estimateAttack(char);
        const viable = enemyPlaces
          .map((id) => ({ id, defence: defenceEstimate.get(id) ?? 0 }))
          .filter((p) => attackEstimate >= p.defence * CONFIG.AI_ATTACK_ADVANTAGE)
          .sort((a, b) => a.defence - b.defence);
        const target = viable[0]?.id;
        if (target) {
          moveRows.push({
            charId: char.id,
            charName: char.name,
            factionId: char.factionId,
            fromPlaceId: char.placeId,
            toPlaceId: target,
          });
        }
        // 沒有打得過的目標就原地不動（等待購兵），不再隨機送頭 /
        // No winnable target: stay put and wait for the economy phase to re-arm,
        // instead of charging into a losing fight
        continue;
      }

      // 3. 無相鄰敵人：向最近的無主之地行軍（每回合 1 格）/
      // No adjacent enemy: march toward the nearest unowned place (1 hop per round)
      // 僅限有陣營的將領（無陣營者不參與佔領）/ Only faction members (factionless chars never capture)
      const dist = distToUnowned.get(char.placeId);
      if (char.factionId && dist !== undefined && dist > 0 && char.troops > 0) {
        // 走到距離減一的鄰居，若有多个選擇則用 RNG 決定 /
        // Step to a neighbor at distance-1; RNG breaks ties
        const nextHops = (adjacent.get(char.placeId) ?? []).filter(
          (n) => distToUnowned.get(n) === dist - 1
        );
        const next = rng.pick(nextHops);
        if (next) {
          moveRows.push({
            charId: char.id,
            charName: char.name,
            factionId: char.factionId,
            fromPlaceId: char.placeId,
            toPlaceId: next,
          });
        }
      }
    }

    // 4. 若無目標則原地不動（不移動）/ If no target, stay put (no movement)
  }

  // ── 一次落地：合併的 placeId UPDATE + 一次 createMany ──
  // 移動事件不經 recordMove()，因為那一行本來就讀不到批量場景要的形狀；payload
  // 與 moveEvent.ts 的同一組欄位逐字相同（含 from === to 就不記的規則——本階段的
  // 四個移動點全部指向不同的地點，但在這裡守約一次，規則就不會在某個未來的移動點
  // 被遺忘）。
  //
  // ── Land it all at once: one merged placeId UPDATE plus one createMany ──
  // The move events bypass recordMove(), which cannot take a batch; the payloads
  // carry exactly the same fields as moveEvent.ts's (including its "no row when
  // from === to" rule — none of this phase's four move sites can produce a no-op,
  // but honouring it here keeps the rule true for any future site too).
  if (moveRows.length > 0) {
    const writeRows = moveRows.filter((m) => m.fromPlaceId !== m.toPlaceId);
    if (writeRows.length > 0) {
      const params: (string | number)[] = [];
      const values = writeRows
        .map((m, i) => {
          params.push(m.charId, m.toPlaceId);
          return `($${i * 2 + 1}::text, $${i * 2 + 2}::text)`;
        })
        .join(', ');
      await prisma.$executeRawUnsafe(
        `UPDATE "Character" AS c
           SET "placeId" = v.pid
           FROM (VALUES ${values}) AS v(id, pid)
           WHERE c.id = v.id`,
        ...params,
      );
      await prisma.event.createMany({
        data: writeRows.map((m) => ({
          worldId,
          round,
          type: 'CHARACTER_MOVED',
          data: {
            charId: m.charId,
            charName: m.charName,
            factionId: m.factionId,
            fromPlaceId: m.fromPlaceId,
            toPlaceId: m.toPlaceId,
          },
        })),
      });
    }
  }
}
