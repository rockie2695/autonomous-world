// ============================================================================
// 階段 7：野心事件
// Phase 7: Defection Events
// ============================================================================
// 依遊戲事件處理叛變值變化。
// Processes defection-value changes based on game events.
//
// 規則（來自規格）/ Rules (from spec):
// - 20 回合未升遷 → +DEFECTION_NO_PROMOTION_DELTA / 20 rounds without promotion → +DEFECTION_NO_PROMOTION_DELTA
// - 朋友叛逃 → 叛變值 +DEFECTION_FRIEND_DELTA，持續 DEFECTION_FRIEND_ROUNDS /
//   Friend defects → +DEFECTION_FRIEND_DELTA, lasting DEFECTION_FRIEND_ROUNDS
// - 叛變冷卻 → 每次叛變 -DEFECTION_COOLING_DELTA，持續 DEFECTION_COOLING_ROUNDS /
//   Defection cooling: -DEFECTION_COOLING_DELTA per defection, lasting
//   DEFECTION_COOLING_ROUNDS
//
// 這個階段**只寫帳本**，不改寫 `Character.defectionBase`（那是固定初始值）。
// This phase writes **only the ledger**; it never rewrites `Character.defectionBase`,
// which is a fixed initial stat.
//
// 使用方式 / Usage:
//   await defectionEvents(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 處理所有角色的野心事件。
 * Process defectionBase events for all characters.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 種子 RNG（本階段未使用）/ Seeded RNG (unused for this phase)
 */
export async function defectionEvents(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有存活角色 / Get all living characters
  //
  // 查詢欄位剛好只剩這些：`factionId` 與 `defectionBase` 原本是為了「君王統率降低野心」而查的，
  // 那條規則移除之後**沒有任何地方讀得到它們**，所以一併拿掉 —— 多查出來的欄位不會報錯，
  // 只會讓人以為這個階段還在意那兩件事。
  //
  // The select is now exactly this: `factionId` and `defectionBase` existed only for the "king's tong
  // reduces defectionBase" rule, and nothing reads them since that rule was removed. Fetching them
  // anyway cannot fail — it just implies this phase still cares about those two things.
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: {
      id: true,
      lastPromotedRound: true,
    },
  });

  // 冷卻視窗內的叛變次數（依人計數）。查 `Event` 而不是 `Character`，因為「何時叛變」
  // 本來就是事件表的一等資料，而野心是固定值、不存任何狀態 —— 多加一個欄位只會多一個
  // 可能對不上的真相。
  //
  // Defection counts per character inside the cooling window, read from `Event` rather
  // than from `Character`: "when did they defect" is already first-class in the event
  // table, and defectionBase is a fixed stat that stores no state — a new column would only
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
  //
  // **一次查詢餵兩個視窗。** 冷卻視窗（20 回合）比較長，所以它決定查詢範圍；朋友視窗
  // （10 回合）比較短，直接在這一趟裡過濾即可。第二次查詢只會把同一批列再讀一次。
  //
  // **One query feeds both windows.** The cooling window (20 rounds) is the longer one, so it
  // sets the query range; the friend window (10 rounds) is shorter and is simply filtered
  // during the same pass. A second query would only re-read the same rows.
  //
  // 順帶取出 `round`，因為「朋友在**什麼時候**叛逃」決定了友誼當時是否已存在（見下）。
  // `round` comes along because *when* a friend defected decides whether the friendship
  // existed at that moment (below).
  const defections = await prisma.event.findMany({
    where: {
      worldId,
      type: 'DEFECTION',
      round: { gte: round - CONFIG.DEFECTION_COOLING_ROUNDS + 1 },
    },
    select: { round: true, data: true },
  });

  /** 每人最近一次叛變的次數（疊加冷卻）/ Defections per character (the cooling stacks) */
  const defectionsInWindow = new Map<string, number>();

  // 朋友視窗：留下每個人叛逃的**回合**，不是次數 —— 判斷友誼是否已存在需要回合本身 /
  // Friend window: keep the *rounds* each person defected on, not a count — deciding
  // whether a friendship existed yet needs the round itself
  const friendWindowStart = round - CONFIG.DEFECTION_FRIEND_ROUNDS + 1;
  const defectionRounds = new Map<string, number[]>();

  for (const defection of defections) {
    const charId = (defection.data as { charId?: unknown } | null)?.charId;
    if (typeof charId !== 'string' || !charId) continue;
    defectionsInWindow.set(charId, (defectionsInWindow.get(charId) ?? 0) + 1);
    if (defection.round >= friendWindowStart) {
      const rounds = defectionRounds.get(charId);
      if (rounds) rounds.push(defection.round);
      else defectionRounds.set(charId, [defection.round]);
    }
  }

  // 友誼反轉成「我認識誰」：一列 `Friendship` 是**雙向**的，所以 `aId` 與 `bId` 兩邊
  // 都要拿到對方。這裡只做一次查詢、建成索引，而不是對每個人各查一次 —— 那會是 N+1。
  //
  // Friendships inverted into "who do I know": a `Friendship` row is **bidirectional**, so
  // both `aId` and `bId` need the other side. One query and an index, rather than a query
  // per character — that would be N+1.
  //
  // `sinceRound` 一起帶出來，因為「朋友在背叛**當時**是否已是朋友」要用它判斷。
  // `sinceRound` comes along because "were they already friends at the moment of the
  // betrayal" is decided with it.
  const friendships = await prisma.friendship.findMany({
    where: { worldId },
    select: { aId: true, bId: true, sinceRound: true },
  });

  /** 某人 → 其朋友（連同友誼成立的回合）/ who a leader is friends with, and since when */
  const friends = new Map<string, Array<{ id: string; sinceRound: number }>>();
  for (const friendship of friendships) {
    const forA = friends.get(friendship.aId);
    if (forA) forA.push({ id: friendship.bId, sinceRound: friendship.sinceRound });
    else friends.set(friendship.aId, [{ id: friendship.bId, sinceRound: friendship.sinceRound }]);

    const forB = friends.get(friendship.bId);
    if (forB) forB.push({ id: friendship.aId, sinceRound: friendship.sinceRound });
    else friends.set(friendship.bId, [{ id: friendship.aId, sinceRound: friendship.sinceRound }]);
  }

  for (const char of characters) {
    let delta = 0;
    let reason = '';

    // 檢查是否久未升遷（20+ 回合）/ Check for lack of promotion (20+ rounds)
    const roundsSincePromotion = char.lastPromotedRound
      ? round - char.lastPromotedRound
      : round; // 從未升遷 / Never promoted

    if (roundsSincePromotion >= CONFIG.DEFECTION_NO_PROMOTION_ROUNDS) {
      delta += CONFIG.DEFECTION_NO_PROMOTION_DELTA;
      reason += `No promotion for ${roundsSincePromotion} rounds; `;
    }

    // ── 叛變冷卻 / Defection cooling ────────────────────────────────────────
    // 叛變本身**不再重骰野心**（那會讓「從不變動」的規則破功，而且幅度大到讓叛變
    // 行為驟變）。改在這裡往帳本寫一筆負的 delta：忠誠檢查會把它加總進叛變值，
    // 於是剛叛變的人接下來 20 回合比較不容易再叛變。
    //
    // Defecting no longer re-rolls defectionBase — that would break the "never changes"
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
      await prisma.defectionEvent.create({
        data: {
          worldId,
          charId: char.id,
          round,
          delta: defectionCount * CONFIG.DEFECTION_COOLING_DELTA,
          reason: `Defected ${defectionCount}× within ${CONFIG.DEFECTION_COOLING_ROUNDS} rounds; `,
        },
      });
    }

    // ── 朋友叛逃 / A friend defects ────────────────────────────────────────────
    // 與冷卻相反，這是**正向**的：身邊的人走了，自己也更想走。
    //
    // The opposite sign to the cooling: this is positive. People around you leaving makes
    // you likelier to leave too.
    //
    // **每一位叛逃的朋友各算一次**，所以兩位朋友叛逃是 +4。
    //
    // **Each friend who defected counts once**, so two of them is +4.
    //
    // 友誼必須**在背叛當時就存在**。少了這個判斷，一名先叛逃、後來才成為朋友的人
    // 仍然會被記上一筆 —— 而那正是「事後才認識」的結局，不是「被朋友拋下」。
    // 叛逃可能發生在視窗內的**任一**回合，所以只要 `sinceRound <= 某次叛逃回合` 即算。
    //
    // The friendship has to have existed **at the moment of the betrayal**. Without that
    // test, someone who defected first and became a friend later is still billed for it —
    // which is "made friends afterwards", not "left behind by a friend". A defection may
    // land on any round in the window, so one round with `sinceRound <= defectionRound`
    // is enough.
    //
    // **和冷卻一樣寫成獨立一筆**，不併進上面的 delta：那筆常常是小數，混在一起之後
    // 「朋友叛逃是 +2」就看不出來了。
    //
    // A **separate row**, as the cooling is: that one is often a fraction, and merged in,
    // "a friend defected is +2" stops being readable.
    //
    // 時機上要晚**一回合**：本階段在 `loyaltyCheck`（真正決定誰叛逃）**之前**執行，
    // 所以本回合的叛逃此刻還不存在。於是第 N 回合的背叛，是從第 N+1 回合起算，
    // 一直影響到 N+10。
    //
    // It lands **one round late** on purpose: this phase runs *before* `loyaltyCheck`,
    // which is what actually decides who defects, so this round's defections do not exist
    // yet. A betrayal in round N therefore bills friends from N+1 through N+10.
    const myFriends = friends.get(char.id);
    if (myFriends) {
      let betrayedBy = 0;
      for (const friend of myFriends) {
        const rounds = defectionRounds.get(friend.id);
        if (!rounds) continue;
        if (rounds.some((defectedRound) => friend.sinceRound <= defectedRound)) {
          betrayedBy++;
        }
      }

      if (betrayedBy > 0) {
        await prisma.defectionEvent.create({
          data: {
            worldId,
            charId: char.id,
            round,
            delta: betrayedBy * CONFIG.DEFECTION_FRIEND_DELTA,
            reason:
              `${betrayedBy} friend(s) defected within ` +
              `${CONFIG.DEFECTION_FRIEND_ROUNDS} rounds; `,
          },
        });
      }
    }

    // 野心是**固定初始值**，所以這裡不再改寫 `Character.defectionBase`，只寫帳本。
    //
    // The defection base is a **fixed initial stat**, so this no longer rewrites
    // `Character.defectionBase` — it only writes the ledger.
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
      await prisma.defectionEvent.create({
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
