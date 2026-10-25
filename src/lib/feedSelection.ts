// ============================================================================
// 動態消息的挑選 / Feed Selection — What the Ticker May Say
// ============================================================================
// 首頁 ticker 原本直接吃「最新 14 筆」，而一個回合的開頭幾個階段是 生地 / 生人：
// 於是帶子上永遠是「建立新地點 ×14」，打过的仗、叛變與動員永遠進不了鏡頭。
// 挑選規則因此集中在這個**純函式**裡（不碰 i18n、不碰 DOM）：
//
//   1. **顯著事件優先**：戰爭、叛變、王位、動員、行政、拓墾——這些是「世界傾向」
//      的訊號，每種在窗口內至少佔一格（各取其最新一筆）。
//   2. **每種類型設上限**：同一種事件不能洗版；顯著名額認領完，剩餘的名額就用
//      最新的其他事件補滿。
//   3. **輸出按時間正序**（舊→新），ticker 直接順著播。
//
// 輸入契約：呼叫端給「新到舊」的序列（`round desc` 之類的排序結果），函式
// 只在窗口內運作，不自行排序——同一回合內的先後由呼叫端的排序保證。
// The homepage ticker used to take "the newest 14 rows" as-is, and a round
// opens with its place/character spawn phases — so the band always read
// "new place ×14" and battles, defections and mobilisations could never make
// the cut. The selection rule therefore lives in this one **pure function**
// (no i18n, no DOM):
//
//   1. **Notable events first**: war, defection, succession, mobilisation,
//      administration and colonisation are the signals of "where the world is
//      heading"; each notable type present in the window earns at least one
//      slot (its newest row).
//   2. **Per-type caps**: no one type flood-fills the band; after the notables,
//      the remaining slots fill with the newest rows still under their cap.
//   3. **Output is chronological** (oldest → newest), ready for the ticker.
//
// Input contract: the caller supplies rows in **recency order** (newest first,
// e.g. a `round desc` query). The function works only inside that window and
// never re-sorts — the within-round order is the caller's sort's job.
// ============================================================================

/** 挑選函式認得的最小欄位 / The smallest shape the selector needs */
export type FeedEvent = { type: string; round: number };

/**
 * 帶子的長度 / How many rows the feed carries.
 * 與 `/api/public/world` 的 `recentEvents` 上限同源。帶子是循環動畫，14 筆
 * 播一圈約一分鐘，再多讀者也追不上。
 * The `recentEvents` cap of `/api/public/world`. The ticker loops, and at 14
 * rows one loop is about a minute — more would outrun the reader.
 */
export const FEED_SIZE = 14;

/**
 * 每種事件類型在帶子上最多出現幾次。**不認得的類型上限是 0**——帶子只播
 * 19 種已註冊的事件，未知類型落入「第 N 回合發生了一件事」之流的空列。
 * How many rows of one type the feed will carry. **An unknown type caps at 0**
 * — the band only plays the registered event types; anything else would land
 * as a meaningless row.
 */
const TYPE_CAPS: Record<string, number> = {
  PLACE_CAPTURED: 3,
  BATTLE_DEATH: 3,
  ESCAPE_SUCCESS: 2,
  DEFECTION: 2,
  KING_INHERITED: 2,
  FACTION_COLLAPSE: 1,
  FACTION_ELIMINATED: 1,
  SIGNAL_ISSUED: 2,
  ADMIN_ASSIGNED: 2,
  ADMIN_REMOVED: 2,
  PLACE_CREATED: 2,
  CHILD_BORN: 2,
  BUILDING_UPGRADE: 2,
  FRIENDSHIP: 1,
  CHARACTER_SPAWNED: 2,
  CHARACTER_MOVED: 2,
  DEATH: 2,
  INCOME: 2,
  TROOPS_BOUGHT: 2,
};

/**
 * 顯著事件的優先序（小 = 先給地位）。**每種顯著類型各取其一**，不算洗版；
 * 真正防止同型事件擠掉彼此的是 TYPE_CAPS。
 * Priority among notable events (smaller = claims its slot earlier). Each
 * notable type claims **one** slot; TYPE_CAPS is what keeps same-type rows
 * from crowding each other out.
 */
const NOTABLE_RANK: Record<string, number> = {
  PLACE_CAPTURED: 0,
  BATTLE_DEATH: 1,
  ESCAPE_SUCCESS: 2,
  DEFECTION: 3,
  KING_INHERITED: 4,
  FACTION_COLLAPSE: 5,
  FACTION_ELIMINATED: 6,
  SIGNAL_ISSUED: 7,
  ADMIN_ASSIGNED: 8,
  ADMIN_REMOVED: 9,
  PLACE_CREATED: 10,
};

/**
 * 從「新到舊」的事件序列挑出帶子的內容，**輸出時間正序**。
 * 在一個陣列上兩輪：
 *   - 第一輪：顯著事件逐一認領名額（每種 1 筆，受各型上限約束）；
 *   - 第二輪：按新到舊補滿剩餘名額，受各型上限約束。
 * 再把被選中的列按原索引反轉輸出——原序列是新到舊，反轉即是時間正序。
 *
 * Pick the feed's rows from a newest-first sequence and return them in
 * chronological order. Two passes over the one array:
 *   - pass 1: notable types claim their slots one each (still under caps);
 *   - pass 2: fill the rest newest-first, again under caps.
 * The picked rows then leave in reverse input order — the input runs newest
 * first, so reversing is chronological.
 */
export function selectFeedEvents<T extends FeedEvent>(
  events: T[],
  size: number = FEED_SIZE
): T[] {
  if (events.length === 0 || size <= 0) return [];

  const counts = new Map<string, number>();
  const picked = new Set<number>();

  const capOf = (type: string): number => TYPE_CAPS[type] ?? 0;
  const underCap = (type: string): boolean =>
    (counts.get(type) ?? 0) < capOf(type);
  const take = (index: number, event: T): void => {
    picked.add(index);
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  };

  // ── 第一輪：顯著事件各取其最新一筆 ──
  // 先按 NOTABLE_RANK 計算窗口內存在哪些顯著類型，再從新到舊各拿一筆。
  // 顯著類型的數量就是這輪的名額上限，永遠不會擠掉 size 的其他內容。
  //
  // ── Pass 1: one newest row per notable type ──
  // Count which notable types exist in the window first, then walk
  // newest→oldest claiming one row each. The distinct-type count is the pass's
  // own slot budget, so it can never eat into the rest of the band's size.
  const notableTypes = [...new Set(events.map((e) => e.type))]
    .filter((type) => type in NOTABLE_RANK)
    .sort((a, b) => NOTABLE_RANK[a] - NOTABLE_RANK[b]);
  const notableBudget = Math.min(size, notableTypes.length);

  for (const type of notableTypes) {
    if (picked.size >= notableBudget) break;
    const index = events.findIndex((e) => e.type === type);
    if (index >= 0 && underCap(type)) take(index, events[index]);
  }

  // ── 第二輪：新到舊補滿，受各型上限約束 ──
  // ── Pass 2: fill newest-first, still under caps ──
  for (let index = 0; index < events.length && picked.size < size; index += 1) {
    if (picked.has(index)) continue;
    const event = events[index];
    if (underCap(event.type)) take(index, event);
  }

  // 原序列新到舊 → 反轉輸出即時間正序 / input is newest-first → reverse is chronological
  const rows: T[] = [];
  const indices = [...picked].sort((a, b) => b - a);
  for (const index of indices) rows.push(events[index]);
  return rows;
}
