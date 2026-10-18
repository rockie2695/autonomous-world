// ============================================================================
// 人物關係查詢（純邏輯）
// Relationship lookups (pure)
// ============================================================================
// 友誼與不滿都以「扁平的一對」送到客戶端，和 `roads` 同形。要回答「他有哪些朋友」
// 只有一件事：掃描所有 `aId` 或 `bId` 是他的那一列。
//
// Friendships and discontents both ship as flat pairs, the same shape as `roads`.
// Answering "who is this leader close to" comes down to one thing: scan the rows whose
// `aId` or `bId` is him.
//
// **去重是這裡唯一非平凡的部分。** 友誼一列代表一段關係，所以掃描一次就得到一次。
// 但不滿是**互相**的，同一對會存成兩列（a→b 與 b→a），於是掃描會把同一個人回報
// **兩次**。這正是把不滿改成雙向之後才出現的問題——單向的時候一個方向只有一列。
//
// **Deduplication is the only non-trivial part.** One friendship row is one relationship,
// so the scan returns it once. But discontent is **mutual**, so one pair is stored as two
// rows (`a→b` and `b→a`) and a naive scan reports the same person **twice**. That only
// became a problem when discontent went bidirectional — with one direction there was a
// single row and nothing to collapse.
//
// 不碰 React，所以可以直接測。/ No React, so it is testable as-is.
// ============================================================================

/** 一段關係的一列，兩個欄位都是角色 id / one relation row; both fields are character ids */
export interface RelationPair {
  aId: string;
  bId: string;
  sinceRound: number;
}

/** 某人與另一人的一段關係 / one relationship between two leaders */
export interface Relation {
  /** 對方的 id / the *other* leader's id */
  id: string;
  /** 關係成立的回合 / the round the relationship formed */
  sinceRound: number;
}

/**
 * 取出某人所有的關係對象，**每個對象只出現一次**。
 * Everyone this leader has a relationship with, **each exactly once**.
 *
 * 兩端都要檢查：關係是雙向的，所以兩種儲存順序都可能見到。這同時處理了友誼（一列）
 * 與不滿（同一對兩列）——後者正是需要去重的那個情況。
 *
 * Both endpoints are checked, because relations are bidirectional and either storage order
 * may appear. That single rule handles friendship (one row) and discontent (two rows for
 * the same pair) alike — the latter being exactly the case that needs collapsing.
 *
 * 保留**最早**的 `sinceRound`：不滿的兩列由同一次擲骰寫入，兩邊本來就同回合，而友誼
 * 一律只有一列，所以這個選擇不會改變任何現有行為，只是讓輸出一致。
 *
 * The **earliest** `sinceRound` is kept: both discontent rows come from the same roll and
 * therefore already agree, and a friendship only ever has one row — so this changes no
 * existing behaviour, it just makes the output consistent.
 *
 * @param charId - 要查的人 / the leader to look up
 * @param rows - 全部關係列 / every relation row in the world
 * @returns 每個對象一筆，依成立回合排序 / one entry per partner, ordered by sinceRound
 */
export function relationsOf(
  charId: string,
  rows: ReadonlyArray<RelationPair>
): Relation[] {
  const earliest = new Map<string, number>();

  for (const row of rows) {
    // `aId === bId` 的列在資料庫層面是允許的（沒有約束擋它），而建立關係的配對一定
    // 是兩個不同的人，所以這是防禦性的。回傳「自己是自己的朋友」只會在名單裡印出
    // 讀者自己的名字。
    //
    // A row with `aId === bId` is permitted by the database (nothing forbids it) while the
    // pair loop that forms relationships always uses two distinct characters, so this is
    // defensive. Returning "you are your own friend" just prints the reader's own name back.
    if (row.aId === row.bId) continue;

    if (row.aId === charId) {
      const seen = earliest.get(row.bId);
      if (seen === undefined || row.sinceRound < seen) earliest.set(row.bId, row.sinceRound);
    } else if (row.bId === charId) {
      const seen = earliest.get(row.aId);
      if (seen === undefined || row.sinceRound < seen) earliest.set(row.aId, row.sinceRound);
    }
  }

  return [...earliest.entries()]
    .map(([id, sinceRound]) => ({ id, sinceRound }))
    .sort((a, b) => a.sinceRound - b.sinceRound || a.id.localeCompare(b.id));
}