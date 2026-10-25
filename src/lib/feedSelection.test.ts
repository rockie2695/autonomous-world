// ============================================================================
// feedSelection 的測試 / Tests for feedSelection
// ============================================================================
// 在 **node** 環境跑。樣本用真實的 19 種事件類型——上限表與優先序都是按類型
// 寫死的，測試若用假類型反而測不到真正的規則。
// Runs under **node**. The samples use the real 19 event types — both the cap
// table and the priority order are keyed by type, and fake types would test
// nothing.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { FEED_SIZE, selectFeedEvents } from './feedSelection';
import { EVENT_TYPES } from './eventText';

type Row = { type: string; round: number };

/** 一筆新到舊的事件 / one row (recency order, newest first) */
const row = (type: string, round: number): Row => ({ type, round });

/** 產生 n 筆同類型、新到舊的事件 / n rows of one type, newest first */
const flood = (type: string, n: number, newestRound = 30): Row[] =>
  Array.from({ length: n }, (_, i) => row(type, newestRound - i));

describe('selectFeedEvents', () => {
  it('returns [] on empty input or a non-positive size', () => {
    expect(selectFeedEvents([])).toEqual([]);
    expect(selectFeedEvents(flood('PLACE_CAPTURED', 3), 0)).toEqual([]);
  });

  it('caps the output at FEED_SIZE rows', () => {
    // 三種類型的上限總和是 3+3+2=8：上限**不打折**——窗口裡只有三種事件時，
    // 帶子寧可短一點也不放同型事件洗版。世界正常的時候類型夠多，補滿 14 筆
    // 的是「passes every row through…」與「gives every notable…」兩個案例。
    // Three types' caps sum to 3+3+2=8: caps are **not relaxed** to fill the
    // band — a window with only three types yields a shorter band rather than
    // one flooded with same-type rows. A healthy world has enough types; the
    // fill-to-14 cases are the two tests below.
    const events = [
      ...flood('PLACE_CAPTURED', 10),
      ...flood('BATTLE_DEATH', 10),
      ...flood('CHARACTER_MOVED', 10),
    ];
    const picked = selectFeedEvents(events);
    expect(picked.length).toBe(8);
    expect(picked.length).toBeLessThanOrEqual(FEED_SIZE);
  });

  it('never carries more rows of one type than its cap', () => {
    const events = [
      ...flood('PLACE_CAPTURED', 10),
      ...flood('BATTLE_DEATH', 10),
      ...flood('CHARACTER_MOVED', 10),
      ...flood('CHARACTER_SPAWNED', 10),
      ...flood('DEATH', 10),
    ];
    const counts = new Map<string, number>();
    for (const event of selectFeedEvents(events)) {
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      expect(count, type).toBeLessThanOrEqual(3); // 最寬的上限是 3 / the widest cap is 3
    }
    // 佔領最多 3 筆，不是 10 筆洗版 / captures top out at 3, not a 10-row flood
    expect(counts.get('PLACE_CAPTURED')).toBe(3);
  });

  it('gives every notable type present at least one slot', () => {
    const events = [
      ...flood('CHARACTER_MOVED', 20), // 洗版背景 / the flood background
      row('PLACE_CAPTURED', 12),
      row('DEFECTION', 12),
      row('KING_INHERITED', 12),
      row('SIGNAL_ISSUED', 12),
      row('ADMIN_ASSIGNED', 12),
    ];
    const types = new Set(selectFeedEvents(events).map((event) => event.type));
    for (const notable of [
      'PLACE_CAPTURED',
      'DEFECTION',
      'KING_INHERITED',
      'SIGNAL_ISSUED',
      'ADMIN_ASSIGNED',
    ]) {
      expect(types.has(notable), notable).toBe(true);
    }
  });

  it('prefers newer notable rows over older floods', () => {
    // 洗版事件比顯著事件舊，顯著的仍要入鏡 / the flood is older than the
    // notables, yet the notables must make the cut
    const events = [
      ...flood('PLACE_CAPTURED', 1, 30),
      ...flood('DEFECTION', 1, 28),
      ...flood('CHARACTER_MOVED', 40, 25),
    ];
    const types = new Set(selectFeedEvents(events).map((event) => event.type));
    expect(types.has('PLACE_CAPTURED')).toBe(true);
    expect(types.has('DEFECTION')).toBe(true);
  });

  it('returns rows in chronological order (oldest first)', () => {
    const events = [
      row('PLACE_CAPTURED', 30),
      row('BATTLE_DEATH', 30),
      row('CHARACTER_MOVED', 29),
      row('DEFECTION', 28),
      row('KING_INHERITED', 28),
      row('SIGNAL_ISSUED', 27),
      row('CHARACTER_SPAWNED', 27),
      row('DEATH', 26),
      row('PLACE_CREATED', 25),
      row('CHILD_BORN', 25),
      row('FRIENDSHIP', 24),
      row('BUILDING_UPGRADE', 24),
      row('ADMIN_REMOVED', 23),
      row('FACTION_COLLAPSE', 22),
      row('ESCAPE_SUCCESS', 21),
    ];
    const rounds = selectFeedEvents(events).map((event) => event.round);
    const sorted = [...rounds].sort((a, b) => a - b);
    expect(rounds).toEqual(sorted);
  });

  it('passes every row through when the window is smaller than the feed', () => {
    const events = [
      row('PLACE_CAPTURED', 30),
      row('BATTLE_DEATH', 30),
      row('DEFECTION', 29),
    ];
    const picked = selectFeedEvents(events);
    expect(picked).toHaveLength(3);
    // 輸出時間正序 / chronological
    expect(picked.map((event) => event.round)).toEqual([29, 30, 30]);
  });

  it('drops unknown event types (cap 0)', () => {
    const events = [
      ...flood('SOMETHING_NEW', 5),
      row('PLACE_CAPTURED', 30),
    ];
    const types = new Set(selectFeedEvents(events).map((event) => event.type));
    expect(types.has('SOMETHING_NEW')).toBe(false);
    expect(types.has('PLACE_CAPTURED')).toBe(true);
  });

  it('knows every canonical event type in its cap table', () => {
    // 19 種正典類型都必須在 TYPE_CAPS 裡——不在的話上限是 0，該類型會從帶子上
    // 消失。這裡用「每種類型單獨餵入、都挑得出來」來間接斷言。
    // All 19 canonical types must be capped — a missing entry caps at 0 and the
    // type silently vanishes from the band. Fed one type at a time, each must
    // still come through.
    for (const type of EVENT_TYPES) {
      const picked = selectFeedEvents([row(type, 30), row(type, 29)]);
      expect(picked.some((event) => event.type === type), type).toBe(true);
    }
  });
});
