// ============================================================================
// 事件日誌的將領 / 地點篩選（純邏輯）/ Event log leader & place filters (pure)
// ============================================================================
// 「篩出與某人（或某地）相關的事件」的匹配規則住在自己的純模組裡：可以單獨測，
// EventLog 只負責畫。一個事件可能帶**多個**人物或地點欄位——母子兩人、朋友兩人、
// 收益的君王與行政官、免職的舊任與接任者——篩選要命中任何一個，否則「篩某個
// 將領」會漏掉他作為父親 / 朋友 / 君王出現的那些列。
//
// The "events involving this leader (or place)" matching rule lives in its own
// pure module: testable on its own, with EventLog doing nothing but drawing. One
// event can carry **several** leader or place fields — a father and child, two
// friends, the king and the administrator, the removed admin and the successor —
// and the filter must match any of them, or filtering by a leader would drop the
// rows where they appear as a father, a friend or a king.
// ============================================================================

/** 一個事件 data 可能帶的「人物 id」欄位 / Every leader-id field an event's data may carry */
const LEADER_ID_KEYS = [
  'charId',
  'fatherId',
  'friendId',
  'kingId',
  'adminId',
  'newAdminId',
] as const;

/** 一個事件 data 可能帶的「地點 id」欄位 / Every place-id field an event's data may carry */
const PLACE_ID_KEYS = ['placeId', 'fromPlaceId', 'toPlaceId'] as const;

const stringValues = (
  data: Record<string, unknown>,
  keys: readonly string[]
): string[] => {
  const out: string[] = [];
  for (const key of keys) {
    const value = data[key];
    // 空字串不算：舊事件常帶 `placeId: ''`，那不是「提到了某地」/
    // Empty strings do not count: legacy rows often carry `placeId: ''`, which is
    // not "mentions a place"
    if (typeof value === 'string' && value) out.push(value);
  }
  return out;
};

/**
 * 這個事件提到的**所有**將領 id：主角、父親、朋友、君王、行政官、接任者。
 * Every leader id an event mentions: the subject, a father, a friend, a king, an
 * administrator, a successor.
 */
export function eventLeaderIds(data: Record<string, unknown>): string[] {
  return stringValues(data, LEADER_ID_KEYS);
}

/**
 * 這個事件提到的**所有**地點 id：發生地，以及移動的起點與終點。
 * Every place id an event mentions: where it happened, plus a move's start and end.
 */
export function eventPlaceIds(data: Record<string, unknown>): string[] {
  return stringValues(data, PLACE_ID_KEYS);
}
