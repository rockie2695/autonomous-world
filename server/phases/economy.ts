// ============================================================================
// 階段 4：經濟
// Phase 4: Economy
// ============================================================================
// 分配收入、招募軍隊、處理購兵。
// Distributes income, recruits troops, handles troop purchases.
//
// 規則（來自規格）/ Rules (from spec):
// - 地點收入 = BASE_INCOME + MARKET_LV × MARKET_PER_LV / Place income = BASE_INCOME + MARKET_LV × MARKET_PER_LV
// - 分配：君王 10%、行政官 60%、其他人 30%（平分）——行政官拿最大份，因為實際管事的
//   是他（Oct 2026 由 30/40/30 改為 10/60/30，把君王的 20% 挪給行政官；詳見
//   server/income.ts）/
//   Split: king 10%, administrator 60%, everyone else 30% (shared equally) — the
//   administrator's cut is the largest because they are the one actually running the
//   place (Oct 2026: changed from 30/40/30, moving the king's 20% to the admin;
//   see server/income.ts)
// - **沒有行政官就誰都不領**：刻意反轉舊制（舊制把行政官份額轉給君王）——付錢給
//   不在場的君王比誰都不付更糟，錢留在地方上 /
//   **No administrator means nobody is paid**: this deliberately inverts the old
//   rule (which routed the admin's share to the king) — paying an absent king is
//   worse than paying nobody, so the gold stays with the place
// - 空缺的君王或空的「其他人」份額由在場者吸收，三份永遠加總等於總收入 /
//   A vacant king or an empty "everyone else" bucket is absorbed by whoever is
//   present; the three shares always sum to the income
// - 招募：BASE_RECRUIT + BARRACKS_LV × BARRACKS_PER_LV / Recruitment = BASE_RECRUIT + BARRACKS_LV × BARRACKS_PER_LV
// - 角色購兵：1 兵 = 2 金，批次 10-100 / Characters buy troops: 1 troop = 2 gold, batch 10-100
// - 一個地方的收入只受**行政官的 jing**影響（放大整塊餅）；君王與其他人的份額是
//   變大後的餅的固定比例，規則見 server/income.ts /
//   A place's income is shaped by the **administrator's jing alone** (it scales the
//   whole pie); the king's and the others' shares are flat ratios of that grown pie —
//   see server/income.ts
//
// 使用方式 / Usage:
//   await economy(worldId, round, rng);
//
// 寫入方式 / How it writes:
//   整階段的寫入落在**同一筆交易**裡，而且交易裡**只有三句話**：一段合併的角色
//   UPDATE（UPDATE ... FROM (VALUES ...)，一口氣套用每個角色的金幣／兵力淨增量），
//   一段合併的地方 UPDATE（駐軍招募），以及一次 createMany（全部 INCOME 與
//   TROOPS_BOUGHT 事件，陣列順序＝模擬順序）。雲端資料庫每一句都是一次 round
//   trip：以前每地 5–10 次逐筆寫入 × 上百個地方，一回合是數百次往返；現在交易內
//   只剩三次。讀取與**計算**全部在交易外——交易只做寫入，所以很短。
//
//   The whole phase's writes land in **one transaction**, and the transaction holds
//   exactly **THREE statements**: one merged characters UPDATE (UPDATE ... FROM
//   (VALUES ...), applying every character's net gold/troop delta in one shot), one
//   merged places UPDATE (garrison recruits), and one createMany of every INCOME and
//   TROOPS_BOUGHT row (array order = simulation order). Every statement is a cloud
//   round trip: the old 5-10 sequential writes per place × ~a hundred places were
//   hundreds of round trips a round; the transaction now holds three. Reads and the
//   **computation** stay outside entirely — the transaction only writes, which is
//   what keeps it short.
//
//   **為什麼可以這樣合併**：繁衍結果的量（金幣、兵力）全部在**計算時**就知道——
//   「發多少」與「買多少」都是算出來的，從不依賴寫入的回傳值，除了事件要印的「之後
//   餘額」。該餘額用**模擬帳本**重現：初始值（讀取時的快照）按住，之後每筆增量照
//   同一個迴圈順序在記憶體裡累加——和昔日「逐筆 update 之後讀回傳值」給出同一組
//   數字，因為資料庫本來也是把同樣的增量按同樣順序疊上去的。
//
//   **Why merging is possible**: the amounts being reproduced (gold, troops) are all
//   known at **computation** time — "how much was paid" and "how big a batch" are
//   computed, never derived from a write's return value. The only thing the old
//   `update().gold` round-trip provided is the event's *after* balance, and that is
//   reproduced by a **simulated ledger**: take the initial value (the read snapshot),
//   then accumulate every increment in memory **in the same loop order** the old
//   statements applied them. Same order, same adds — so the sim gives exactly the
//   numbers the sequential updates returned.
//
//   事件的因果順序也保住了：createMany 依**陣列順序**插fila，id 由用戶端按序產生
//   （cuid 單調遞增），事件日誌的 `{ round asc, createdAt asc, id asc }` 排序因此
//   仍然還原「先 INCOME、後 TROOPS_BOUGHT、按地點推進」的原序。
//
//   The events' causal order survives too: createMany inserts in **array order** with
//   client-generated monotonic cuid ids, so the log's
//   `{ round asc, createdAt asc, id asc }` ordering still restores the original
//   INCOME-before-purchases, place-by-place sequence.
// ============================================================================

import { prisma, type Prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import {
  splitIncome,
  tongPurchaseMultiplier,
  placeOutput,
  purchaseBatch,
  othersOf,
} from '../income';
import { spendingPosture, troopReserveRate } from '@/lib/spending';
import { inTransaction } from '../tx';
import { placeRecruits } from '@/lib/placeEffects';

/**
 * 處理世界中所有地點的經濟。
 * Process economy for all places in the world.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於購兵的種子 RNG / Seeded RNG for troop purchases
 *
 * @remarks 計算（分配、徵兵、購兵的每一次 RNG 抽取與每個事件的內容）在交易外
 *   完成，順序與昔日逐筆寫入時逐一相同；寫入則是一次 `inTransaction` 收攏成三句
 *   （合併的角色 UPDATE、合併的地方 UPDATE、一次 createMany）。同一個種子仍然
 *   長出同一個世界。
 *
 *   The computation (splits, recruits, every RNG draw, every event payload) happens
 *   outside the transaction, in exactly the order the per-statement version ran;
 *   one `inTransaction` then folds the writes into three statements (a merged
 *   characters UPDATE, a merged places UPDATE, one createMany). One seed still
 *   grows one world.
 */
export async function economy(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有地點及其角色與陣營資訊 / Get all places with their characters and faction info
  const places = await prisma.place.findMany({
    where: { worldId },
    include: {
      characters: {
        where: { alive: true },
        // 武/體/經：消費性格（spending.ts）由此推導，決定行政官買兵前留多少 /
        // wu/ti/jing feed the spending posture (spending.ts), which decides how
        // much an administrator keeps aside before buying troops
        select: { id: true, name: true, gold: true, troops: true, tong: true, wu: true, ti: true, jing: true, factionId: true },
      },
      faction: {
        select: { kingId: true },
      },
    },
  });

  // ── 模擬帳本（模擬昔日回傳值的記憶體複本）──
  // charInitial：從快照來的初始值；charDelta：至今的淨增量；running*()：套用增量後
  // 的「現在值」——昔日這個值來自 update 的回傳列（資料庫把同樣的增量按同樣順序
  // 疊上去），所以按同一順序累加得到的是同一組數字。
  //
  // ── The simulated ledger (an in-memory replica of the old return values) ──
  // charInitial: the starting values from the snapshots; charDelta: the net delta so
  // far; running*(): the "current" value after applying it — the value the old code
  // read off an update's returned row (the database stacked the same increments in
  // the same order), so accumulating in that same order yields the same numbers.
  const charInitial = new Map<string, { gold: number; troops: number }>();
  const charDelta = new Map<string, { gold: number; troops: number }>();
  const placeDelta = new Map<string, number>(); // placeId → 本回合招募數 / recruits this round

  // 在地快照先播種（這些角色也在下面的君王／行政官清單裡，setIfAbsent 避免覆寫）/
  // Seed from the place snapshots first (these ids also appear in the king/admin list
  // below; setIfAbsent keeps the first, identical seed)
  for (const place of places) {
    for (const char of place.characters) {
      if (!charInitial.has(char.id)) {
        charInitial.set(char.id, { gold: char.gold, troops: char.troops });
      }
    }
  }

  // 君王與總督可能住在外地，所以另外抓一次他們 / A king or an admin can live in
  // another place, so fetch them separately. The ledger needs their starting gold
  // and troops the same way (see charInitial above).
  const leaderIds = new Set<string>();
  for (const place of places) {
    const kingId = place.faction?.kingId;
    if (kingId) leaderIds.add(kingId);
    if (place.administratorId) leaderIds.add(place.administratorId);
  }
  const leaderJing = new Map<string, number>();
  const leaderName = new Map<string, string>();
  if (leaderIds.size > 0) {
    // **只抓活人**：崩解中的勢力 `kingId` 可能仍指向屍體（君王戰死、無繼承人，等到
    // 勢力死亡才清）。不過濾 alive 的話，死人每回合照領君王 30% 份额。
    // **Only the living**: a collapsing faction's `kingId` can still point at a corpse
    // (king killed in battle, no heir, cleared only when the faction dies). Without the
    // aliveness filter the dead collected the king's 30% share every round.
    const leaders = await prisma.character.findMany({
      where: { id: { in: Array.from(leaderIds) }, alive: true },
      select: { id: true, name: true, jing: true, gold: true, troops: true },
    });
    for (const leader of leaders) {
      leaderJing.set(leader.id, leader.jing);
      leaderName.set(leader.id, leader.name);
      if (!charInitial.has(leader.id)) {
        charInitial.set(leader.id, { gold: leader.gold, troops: leader.troops });
      }
    }
  }

  /** 累加一個角色的淨增量 / Accumulate a character's net delta */
  const applyDelta = (charId: string, dGold: number, dTroops: number): void => {
    const cur = charDelta.get(charId) ?? { gold: 0, troops: 0 };
    cur.gold += dGold;
    cur.troops += dTroops;
    charDelta.set(charId, cur);
  };
  /** 套用增量後的金幣：昔日自 update 回傳值讀取 / Gold after the delta: the update's returned value yesterday */
  const runningGold = (charId: string): number =>
    (charInitial.get(charId)?.gold ?? 0) + (charDelta.get(charId)?.gold ?? 0);
  /** 套用增量後的兵力，同一個道理 / Troops after the delta, for the same reason */
  const runningTroops = (charId: string): number =>
    (charInitial.get(charId)?.troops ?? 0) + (charDelta.get(charId)?.troops ?? 0);

  // ── 計算（交易外）：順序與昔日逐筆寫入時逐一相同 ──
  // ── The computation (outside the transaction): exactly the old order ──
  const eventRows: Prisma.EventCreateManyInput[] = [];

  for (const place of places) {
    // 計算地點收入 / Calculate place income
    // ── 無主之地：完全不進入經濟循環 ──
    // 不產出、不徵兵、也不寫事件。無主之地沒有勢力在其上收稅或養兵，讓它出現在事件日誌
    // 只會被讀成「這裡有人在收錢」，而事實上沒有。
    //
    // Unowned places skip the economy entirely — no income, no recruits, and no event. Nothing
    // collects tax or raises troops there, so a log row would read as "someone was paid here"
    // when nobody was.
    if (!place.factionId) continue;

    // 取得君王與總督 / Get king and admin
    // ── 沒人在這裡，就沒有控制者，錢也不發放 ──
    // 一個地方要有住在這裡的角色才算被掌握。沒有人的話，連國王的份也不發 —— 否則一個
    // 空城照樣把收益送給遠方的國王。
    //
    // A place counts as held only if a character actually lives there. With nobody present even
    // the king's share is withheld, or an empty place would keep paying a distant king.
    const held = place.characters.length > 0;
    const kingId = held ? (place.faction?.kingId ?? null) : null;
    const adminId = held ? place.administratorId : null;

    // jing = 經濟：決定領導者能 pockets 多少。查不到 = 死亡或不存在的席位 → **null**
    //（空位），份額由 splitIncome 吸收給在場者——不能當 0：0 是「活著但中性」，仍會
    // 把份額發給那個 id，而死人不該收款。
    // jing = economy: how much the leader pockets. A miss = a dead or nonexistent seat →
    // **null** (vacant), and splitIncome absorbs the share to those present — not 0: 0
    // means "alive but neutral" and would still pay that id, and the dead get nothing.
    const kingJing = kingId ? (leaderJing.get(kingId) ?? null) : null;
    const adminJing = adminId ? (leaderJing.get(adminId) ?? null) : null;

    // ── 行政官的 jing 放大**整塊餅**（地方產出），不是他自己的份額 ──
    // 舊制把倍率乘在行政官的份額上，但分配總額被封在地點收入裡——單一領取人時
    // 倍率完全看不出效果（×1.22 的請求被縮回 ×1.00）。现在倍率先作用在產出上：
    // jing 24 的地方產出 ×1.22，jing 5 的只有 ×0.58，高經濟的行政官真的讓地方更富裕。
    // 分配階段（splitIncome）**不再**對行政官重複乘——那會是平方。
    // 產出在 `placeOutput` **取整**：金幣永遠是整數。
    //
    // ── The administrator's jing scales the **whole pie** (the place's output), not
    // his own share ──
    // The old rule multiplied the administrator's share, but the split is capped at
    // the place's income — with a single recipient the multiplier had no visible
    // effect (a ×1.22 request was scaled back to ×1.00). The multiplier now acts on
    // the output first: a jing-24 place produces ×1.22, a jing-5 one ×0.58, so a
    // high-economy administrator genuinely makes the place richer. The split
    // (splitIncome) **no longer** multiplies the administrator again — that would
    // square it. The output is **rounded** in `placeOutput`: gold is always whole.
    const income = placeOutput(place.market, adminJing);
    // 「其他人」= **受控勢力**裡、既不是君王也不是行政官的駐場將領（othersOf，
    // 與地點彈窗同一份）。**異勢力的將領不算**：敵對將領站在這裡不會讓他領這個
    // 地方的錢——入侵者不能領佔領地的收入。君王與行政官另有自己的份額。
    //
    // "Everyone else" = the **controlling faction's** leaders here, excluding the
    // king and the administrator (othersOf — the same one the place popup reads).
    // A leader of another faction does not count: an enemy standing here is not
    // paid from this place — an invader does not collect the income of the ground
    // they are standing on. The king and the administrator have their own shares.
    const otherChars = othersOf(place.characters, place.factionId, kingId, adminId);
    const split = splitIncome(income, kingJing, adminJing, otherChars.length);

    // 分配收入 / Distribute income
    // ── 分配收益，同時記下「發了多少」與「發完剩多少」──
    // 日誌要同時顯示增加量與總量。增量進模擬帳本，總量由 runningGold() 重現——
    // 昔日這個總量來自 update 回傳列，資料庫按同樣順序疊了同樣的增量。
    //
    // Distribute while capturing both the amount paid and the resulting total: the log shows
    // the increase *and* the new balance. The increase goes into the simulated ledger and
    // the total is reproduced by runningGold() — the number the old code read off an
    // update's returned row, where the database had stacked the same increments in the
    // same order.
    let kingGold = 0;
    let kingGoldAfter = 0;
    let adminGold = 0;
    let adminGoldAfter = 0;
    let othersGold = 0;

    if (kingId && split.king > 0) {
      applyDelta(kingId, split.king, 0);
      kingGold = split.king;
      kingGoldAfter = runningGold(kingId);
    }

    if (adminId && split.admin > 0) {
      applyDelta(adminId, split.admin, 0);
      adminGold = split.admin;
      adminGoldAfter = runningGold(adminId);
    }

    if (otherChars.length > 0 && split.others > 0) {
      const perChar = Math.floor(split.others / otherChars.length);
      if (perChar > 0) {
        for (const char of otherChars) {
          applyDelta(char.id, perChar, 0);
        }
        othersGold = perChar * otherChars.length;
      }
    }

    // ── 徵兵，同樣記下增加量與總量 ──
    // 本地只有這一筆招募增量，所以「之後的駐軍」就是快照值 + recruits——不需要
    // 帳本，加法本身就給出確定性。
    // Recruit for the garrison, keeping both the increment and the new total.
    // This is the only garrison increment a place gets here, so "after" is simply the
    // snapshot value plus recruits — the arithmetic is already exact.
    const recruits = placeRecruits(place.barracks);
    placeDelta.set(place.id, recruits);
    const garrisonAfter = place.garrison + recruits;

    // 角色以個人金幣購兵 / Characters buy troops with personal gold
    // 記一筆 INCOME 事件：哪個地方、這個回合發了多少錢給誰、徵了多少兵。
    // 一個地方一筆，而不是一人一筆：世界有上百個地方，每人一筆每回合就是數百筆事件，
    // 對事件表與事件日誌都是負擔，而一筆就已經回答「錢從哪裡來、給了多少」。
    //
    // One INCOME event per place rather than per leader: a world holds hundreds of places
    // and per-leader rows would be hundreds of events a round for no extra information.
    eventRows.push({
      worldId,
      round,
      type: 'INCOME',
      data: {
        placeId: place.id,
        placeName: place.name,
        income,
        recruits,
        kingId,
        kingName: kingId ? (leaderName.get(kingId) ?? null) : null,
        // 只記錄**真的發出**的金額。沒有控制者時 split 仍然算得出一個數字，但那些錢
        // 根本沒發出去 —— 照抄 split 會讓日誌顯示「收益 10 金」卻沒有收款人。
        //
        // Record only what was **actually paid**. With no controller the split still
        // produces a number, but none of it was handed out — copying the split would make
        // the log read "earned 10 gold" with no recipient.
        // 增加量與**發完後的總額**：日誌要說得出「現在有多少」/
        // Both the increase and the resulting total, so the log can state the new balance
        kingGold,
        kingGoldAfter,
        adminId,
        adminName: adminId ? (leaderName.get(adminId) ?? null) : null,
        adminGold,
        adminGoldAfter,
        // 「其他人」只有在君王與行政官都存在時才會分到 / others are paid only when both seats are filled
        othersGold,
        // 徵兵後的駐軍總數 / the garrison total after recruiting
        garrisonAfter,
      },
    });

    for (const char of place.characters) {
      // ── 錢在兵與建築之間怎麼分：行政官**先留儲備**再買兵 ──
      // 只有行政官有建築要蓋（建築階段 11 之後就跑），留多少由消費性格決定
      // （spending.ts：武人不留、守將／商人留一半、均衡留四分之一）。非行政官
      // 沒有建築可買，儲備只是死錢——照舊全額可花。
      // ── How money splits between soldiers and buildings: an administrator
      // **keeps a reserve first**, then buys troops ──
      // Only administrators have a building to raise (the build phase runs right
      // after), and the posture decides how much is kept (spending.ts: the
      // aggressive keep nothing, guardians/merchants half, balanced a quarter).
      // Non-administrators have no building, so a reserve would be dead money —
      // they spend in full as before.
      const isAdminHere = place.administratorId === char.id;
      const reserve = isAdminHere
        ? Math.floor(char.gold * troopReserveRate(spendingPosture(char)))
        : 0;
      const maxBuyable = Math.floor(
        (char.gold - reserve) / CONFIG.CHAR_BUY_TROOP_PRICE
      );
      if (maxBuyable >= CONFIG.CHAR_BUY_TROOP_MIN) {
        // ── tong（統領）決定「這一筆買多少」：基準批量 = BASE × tong 倍率，隨機只在
        // ±25% 內抖動。舊制（上限 100 × 倍率）幾乎不咬人——將領每回合的錢買不到 100
        // 兵，tong 的上限永遠是鬆的，購兵量由隨機與金幣決定。金幣仍是硬上限：
        // 買不到 min 就不買。
        //
        // ── tong (leadership) decides **how large one purchase is**: base batch =
        // BASE × the tong multiplier, jittered within +/-25%. The old rule (cap 100 ×
        // multiplier) almost never bound — a leader's per-round gold rarely affords 100
        // troops, so tong's cap was always slack and the size was decided by randomness
        // and gold. Gold is still the hard limit: below the minimum batch, no purchase.
        const buyCount = purchaseBatch(
          char.tong,
          maxBuyable,
          rng.float(-1, 1)
        );

        const cost = buyCount * CONFIG.CHAR_BUY_TROOP_PRICE;

        applyDelta(char.id, -cost, buyCount);

        // 購兵要寫事件：這是唯一一筆「**自己的錢變成自己的兵**」的紀錄，而 INCOME 只
        // 說明地方发了多少錢給誰，看不出誰把錢換成了兵。沒有它，日誌會出現「某某 得 5 金」
        // 卻找不到他後來買了幾個兵 —— 錢去了哪裡就斷了。
        //
        // 每次購買都帶 `charId`（不只是名稱），所以這一列能點回該將領；也帶 `placeId`，
        // 可以直接把地圖鏡頭帶到成交的地方。
        //
        // Log the purchase: it is the only record of a leader turning **their own gold into
        // their own soldiers**, and INCOME only says what a place paid out. Without it the log
        // shows "某某 got 5 gold" and never says how many troops it turned into — the money
        // just stops there.
        //
        // `charId` (not just the name) so the row links back to the leader, and `placeId` so the
        // camera can jump to where the trade happened.
        eventRows.push({
          worldId,
          round,
          type: 'TROOPS_BOUGHT',
          data: {
            charId: char.id,
            charName: char.name,
            placeId: place.id,
            placeName: place.name,
            bought: buyCount,
            cost,
            // 花完後的餘額與兵力，與 INCOME 同一個理由：只寫增減量說不出「現在有多少」
            // 總量由模擬帳本重現（昔日自 update 回傳值讀取）。
            //
            // The resulting balance and strength, for the same reason INCOME carries them:
            // the delta alone cannot answer "how much does he have now". The total is
            // reproduced by the simulated ledger (the old code read it off an update).
            goldAfter: runningGold(char.id),
            troopsAfter: runningTroops(char.id),
          },
        });
      }
    }
  }

  // ── 寫入（交易內，三句話）／ The writes (in one transaction, three statements) ──
  await inTransaction(async (tx) => {
    // 1) 角色：一段 UPDATE ... FROM (VALUES ...) 同時套用每個角色的金幣與兵力淨增量。
    //    多處收入（君王在多個地方有封地）本來就是逐筆 increment 疊上去的——一次 SUM
    //    套上同一個總量，結果逐位元組相同。gold 為負數 = 購兵的花費。
    //    一个總量為 0 的角色不會出現：只有真的被動到的 id 才進得來。
    //
    //    Characters: one UPDATE ... FROM (VALUES ...) applies every character's net
    //    gold and troop delta. Income collected at several places (a king with several
    //    fiefs) was always a series of increments — applying their sum once is
    //    byte-for-byte the same result. A negative gold delta is a purchase's cost.
    //    A character with an all-zero delta cannot appear: only genuinely touched ids
    //    get in.
    if (charDelta.size > 0) {
      const params: (string | number)[] = [];
      const values = Array.from(charDelta)
        .map(([id, d], i) => {
          params.push(id, d.gold, d.troops);
          const b = i * 3;
          return `($${b + 1}::text, $${b + 2}::int, $${b + 3}::int)`;
        })
        .join(', ');
      await tx.$executeRawUnsafe(
        `UPDATE "Character" AS c
           SET gold = c.gold + v.dg, troops = c.troops + v.dt
           FROM (VALUES ${values}) AS v(id, dg, dt)
           WHERE c.id = v.id`,
        ...params,
      );
    }

    // 2) 地方：招募的駐軍增量，同樣一段合併 UPDATE（每地一筆，鍵唯一，無疊加風險）/
    //    Places: the recruit increment, likewise one merged UPDATE (one row per place,
    //    keys unique, no stacking risk).
    if (placeDelta.size > 0) {
      const params: (string | number)[] = [];
      const values = Array.from(placeDelta)
        .map(([id, dg], i) => {
          params.push(id, dg);
          return `($${i * 2 + 1}::text, $${i * 2 + 2}::int)`;
        })
        .join(', ');
      await tx.$executeRawUnsafe(
        `UPDATE "Place" AS p
           SET garrison = p.garrison + v.dg
           FROM (VALUES ${values}) AS v(id, dg)
           WHERE p.id = v.id`,
        ...params,
      );
    }

    // 3) 事件：一次 createMany，陣列順序＝模擬順序（見檔頭因果順序註解）/
    //    Events: one createMany, array order = simulation order (see the file header's
    //    causal-order note).
    if (eventRows.length > 0) {
      await tx.event.createMany({ data: eventRows });
    }
  });
}
