// ============================================================================
// 階段 4：經濟
// Phase 4: Economy
// ============================================================================
// 分配收入、招募軍隊、處理購兵。
// Distributes income, recruits troops, handles troop purchases.
//
// 規則（來自規格）/ Rules (from spec):
// - 地點收入 = BASE_INCOME + MARKET_LV × MARKET_PER_LV / Place income = BASE_INCOME + MARKET_LV × MARKET_PER_LV
// - 分配：君王 30%、行政官 40%、其他人 30%（平分）——行政官拿最大份，因為實際管事的
//   是他（詳見 server/income.ts）/
//   Split: king 30%, administrator 40%, everyone else 30% (shared equally) — the
//   administrator's cut is the largest because they are the one actually running the
//   place (see server/income.ts)
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
// - jing（經濟）會放大領導者 pockets 的份額，規則見 server/income.ts /
//   jing (economy) multiplies what a leader pockets — see server/income.ts
//
// 使用方式 / Usage:
//   await economy(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { splitIncome, tongPurchaseMultiplier } from '../income';
import { spendingPosture, troopReserveRate } from '@/lib/spending';
import { inTransaction, type TxClient } from '../tx';
import { placeIncome, placeRecruits } from '@/lib/placeEffects';

/**
 * 處理世界中所有地點的經濟。
 * Process economy for all places in the world.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於購兵的種子 RNG / Seeded RNG for troop purchases
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
        select: { id: true, name: true, gold: true, troops: true, tong: true, wu: true, ti: true, jing: true },
      },
      faction: {
        select: { kingId: true },
      },
    },
  });

  // 君王與總督可能住在外地，所以另外抓一次他們的 jing /
  // A king or an admin can live in another place, so fetch their jing separately
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
      select: { id: true, name: true, jing: true },
    });
    for (const leader of leaders) {
      leaderJing.set(leader.id, leader.jing);
      leaderName.set(leader.id, leader.name);
    }
  }

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

    const income = placeIncome(place.market);

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
    // 「其他人」= 住在這裡、又既不是君王也不是行政官的角色 /
    // "Everyone else" = living here, and neither the king nor the administrator
    const otherChars = place.characters.filter(
      (c: { id: string }) => c.id !== kingId && c.id !== adminId
    );
    const split = splitIncome(income, kingJing, adminJing, otherChars.length);

    // 分配收入 / Distribute income
    // ── 分配收益，同時記下「發了多少」與「發完剩多少」──
    // 日誌要同時顯示增加量與總量，所以 update 的**回傳值**（更新後的那一列）要留下來。
    //
    // Distribute while capturing both the amount paid and the resulting total: the log shows
    // the increase *and* the new balance, so the update's returned row is kept.
    let kingGold = 0;
    let kingGoldAfter = 0;
    let adminGold = 0;
    let adminGoldAfter = 0;
    let othersGold = 0;

    await inTransaction(async (tx: TxClient) => {
      if (kingId && split.king > 0) {
        const king = await tx.character.update({
          where: { id: kingId },
          data: { gold: { increment: split.king } },
        });
        kingGold = split.king;
        kingGoldAfter = king.gold;
      }

      if (adminId && split.admin > 0) {
        const admin = await tx.character.update({
          where: { id: adminId },
          data: { gold: { increment: split.admin } },
        });
        adminGold = split.admin;
        adminGoldAfter = admin.gold;
      }

      // 「其他人」平分剩下的 30%。splitIncome 已經保證三份加起來等於 income，所以這裡
      // 不會多發錢。沒有行政官時三份都是 0，整段自然跳過。
      //
      // "Everyone else" splits the remaining 30%. splitIncome already guarantees the three
      // shares sum to `income`, so this cannot pay out extra. With no administrator all three
      // are 0 and this whole block is skipped, which is the point.
      if (otherChars.length > 0 && split.others > 0) {
        const perChar = Math.floor(split.others / otherChars.length);
        if (perChar > 0) {
          for (const char of otherChars) {
            await tx.character.update({
              where: { id: char.id },
              data: { gold: { increment: perChar } },
            });
          }
          // 只記真正發出去的金額；除不盡的餘數留在地方上 /
          // Record only what was actually paid; the remainder stays with the place
          othersGold = perChar * otherChars.length;
        }
      }
    });

    // ── 徵兵，同樣記下增加量與總量 ──
    // Recruit for the garrison, keeping both the increment and the new total.
    const recruits = placeRecruits(place.barracks);
    const updatedPlace = await prisma.place.update({
      where: { id: place.id },
      data: { garrison: { increment: recruits } },
    });

    // 角色以個人金幣購兵 / Characters buy troops with personal gold
    // 記一筆 INCOME 事件：哪個地方、這個回合發了多少錢給誰、徵了多少兵。
    // 一個地方一筆，而不是一人一筆：世界有上百個地方，每人一筆每回合就是數百筆事件，
    // 對事件表與事件日誌都是負擔，而一筆就已經回答「錢從哪裡來、給了多少」。
    //
    // One INCOME event per place rather than per leader: a world holds hundreds of places
    // and per-leader rows would be hundreds of events a round for no extra information.
    await prisma.event.create({
      data: {
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
          garrisonAfter: updatedPlace.garrison,
        },
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
        // ── tong（統領）決定「這一筆買多少」，公式與 jing 對收入的完全相同 ──
        // 購買上限 = CHAR_BUY_TROOP_MAX × (1 + (tong − INCOME_TONG_MIDPOINT) / CHAR_ABILITY_MAX)
        // 以平均值為中心，所以一般將領的上限就是 CHAR_BUY_TROOP_MAX、高 tong 買得到更多、
        // 低 tong 買得少一些。錢仍然是最硬的限制：買不到 min 就不買。
        //
        // tong (leadership) sets **how large one purchase is**, with exactly the formula jing
        // uses for income: cap = CHAR_BUY_TROOP_MAX × (1 + (tong − INCOME_TONG_MIDPOINT) /
        // CHAR_ABILITY_MAX). Centred on the average, so an average leader's cap is just
        // CHAR_BUY_TROOP_MAX, a high-tong one buys more and a low-tong one less.
        // Gold is still the hard limit, and the floor stays CHAR_BUY_TROOP_MIN.
        const tongCap = Math.max(
          CONFIG.CHAR_BUY_TROOP_MIN,
          Math.round(
            CONFIG.CHAR_BUY_TROOP_MAX *
              tongPurchaseMultiplier(char.tong)
          )
        );
        const buyCap = Math.min(tongCap, maxBuyable);
        const buyCount = rng.int(CONFIG.CHAR_BUY_TROOP_MIN, buyCap);

        const cost = buyCount * CONFIG.CHAR_BUY_TROOP_PRICE;

        const updatedChar = await prisma.character.update({
          where: { id: char.id },
          data: {
            gold: { decrement: cost },
            troops: { increment: buyCount },
          },
        });

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
        await prisma.event.create({
          data: {
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
              //
              // The resulting balance and strength, for the same reason INCOME carries them:
              // the delta alone cannot answer "how much does he have now"
              goldAfter: updatedChar.gold,
              troopsAfter: updatedChar.troops,
            },
          },
        });
      }
    }
  }
}
