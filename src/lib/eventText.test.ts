// ============================================================================
// eventText 的測試 / Tests for eventText
// ============================================================================
// 在 **node** 環境跑（無 DOM），所以斷言的是純函式的輸出。翻譯用真的 zh 字典：
// 模板若被改掉（少了參數、改了鍵名），這裡會立刻失敗，而不是等到畫面上出現
// `{place}` 字面值才被發現。
// Runs under **node** (no DOM), asserting the pure functions' output. The real
// zh dictionary is the translator: if a template drifts (a parameter dropped, a
// key renamed), these fail immediately rather than the day a `{place}` literal
// shows up on screen.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { zh } from '@/lib/i18n/zh';
import {
  describeEvent,
  describeEventText,
  EVENT_CATEGORY,
  EVENT_TYPES,
  type EventSegment,
} from './eventText';

/** 用真的 zh 字典做點路徑查詢 + 插值的翻譯器 / A translator over the real zh dict */
function zhT(key: string, params?: Record<string, string | number>): string {
  let value: unknown = zh;
  for (const part of key.split('.')) {
    if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part];
    } else {
      throw new Error(`missing i18n key: ${key}`);
    }
  }
  if (typeof value !== 'string') throw new Error(`i18n key is not a string: ${key}`);
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

// ─── 每種事件類型的完整樣本 / One full sample per event type ────────────────

const C1 = { charId: 'c1', charName: '張飛' };
const C2 = { id: 'c2', name: '關羽' };
const P1 = { placeId: 'p1', placeName: '洛水城' };
const F1 = { factionId: 'f1', factionName: '蒼龍盟' };

/** 每種類型一份「欄位齊全」的事件資料 / A fully-populated payload per type */
const FULL_DATA: Record<string, Record<string, unknown>> = {
  PLACE_CREATED: { ...P1 },
  CHARACTER_SPAWNED: { ...C1, ...P1 },
  CHARACTER_MOVED: {
    ...C1,
    fromPlaceId: 'p1',
    fromPlaceName: '洛水城',
    toPlaceId: 'p2',
    toPlaceName: '黑曜要塞',
  },
  CHILD_BORN: { ...C1, fatherId: C2.id, fatherName: C2.name },
  FRIENDSHIP: { ...C1, friendId: C2.id, character2: C2.name },
  KING_INHERITED: { ...C1, fatherId: C2.id, fatherName: C2.name, ...F1 },
  DEATH: { ...C1 },
  BATTLE_DEATH: { ...C1, ...P1 },
  ESCAPE_SUCCESS: { ...C1, ...P1 },
  SIGNAL_ISSUED: { ...C1, ...F1, ...P1, intent: 'attack' },
  DEFECTION: {
    ...C1,
    oldFactionId: 'f0',
    oldFactionName: '蒼龍盟',
    ...P1,
    newFactionId: 'f2',
    newFactionName: '霜狼團',
    reason: 'created_new_faction',
  },
  FACTION_COLLAPSE: { ...F1 },
  FACTION_ELIMINATED: { ...F1 },
  BUILDING_UPGRADE: { ...P1, building: 'market', newLevel: 2 },
  ADMIN_ASSIGNED: { ...C1, ...P1 },
  ADMIN_REMOVED: { ...C1, ...P1, newAdminId: C2.id, newAdminName: C2.name },
  PLACE_CAPTURED: { ...C1, ...P1 },
  INCOME: {
    ...P1,
    income: 5,
    recruits: 2,
    garrisonAfter: 9,
    kingId: 'c1',
    kingName: '張飛',
    adminId: 'c2',
    adminName: '關羽',
    kingGold: 1,
    adminGold: 2,
    kingGoldAfter: 3,
    adminGoldAfter: 4,
  },
  TROOPS_BOUGHT: { ...C1, ...P1, bought: 30, cost: 15, goldAfter: 0, troopsAfter: 31 },
};

/** 語段的鍵序列 / The segment keys of an event */
function keysOf(type: string): string[] {
  return describeEvent(type, FULL_DATA[type], zhT).map((segment) => segment.key);
}

// ─── 正典表 / The canonical table ─────────────────────────────────────────

describe('EVENT_CATEGORY', () => {
  it('covers exactly 19 types', () => {
    expect(EVENT_TYPES).toHaveLength(19);
    expect(new Set(EVENT_TYPES).size).toBe(19);
  });

  it('every canonical type maps to a category', () => {
    for (const type of EVENT_TYPES) {
      expect(EVENT_CATEGORY[type], type).toBeDefined();
    }
  });
});

// ─── 覆蓋率：19 種類型都會說話 / Coverage: all 19 types speak ──────────────

describe('describeEvent coverage', () => {
  it('produces at least one segment for every canonical type', () => {
    for (const type of EVENT_TYPES) {
      const segments = describeEvent(type, FULL_DATA[type], zhT);
      expect(segments.length, type).toBeGreaterThan(0);
    }
  });

  it('never leaves a {placeholder} literal in any sentence', () => {
    for (const type of EVENT_TYPES) {
      const text = describeEventText(type, FULL_DATA[type], zhT);
      expect(text, type).not.toMatch(/\{\w+\}/);
      expect(text.length, type).toBeGreaterThan(0);
    }
  });
});

// ─── 各類型的措辭 / Per-type wording ──────────────────────────────────────

describe('describeEvent per type', () => {
  it('PLACE_CREATED / FACTION_* name the place or faction', () => {
    expect(keysOf('PLACE_CREATED')).toEqual(['events.newPlaceDesc']);
    expect(keysOf('FACTION_COLLAPSE')).toEqual(['events.collapseDesc']);
    expect(keysOf('FACTION_ELIMINATED')).toEqual(['events.eliminationDesc']);
    const text = describeEventText('FACTION_COLLAPSE', FULL_DATA.FACTION_COLLAPSE, zhT);
    expect(text).toContain('蒼龍盟');
  });

  it('CHARACTER_SPAWNED says where the leader was born', () => {
    const text = describeEventText('CHARACTER_SPAWNED', FULL_DATA.CHARACTER_SPAWNED, zhT);
    expect(text).toContain('張飛');
    expect(text).toContain('洛水城');
  });

  it('CHARACTER_MOVED carries both endpoints', () => {
    const text = describeEventText('CHARACTER_MOVED', FULL_DATA.CHARACTER_MOVED, zhT);
    expect(text).toContain('洛水城');
    expect(text).toContain('黑曜要塞');
  });

  it('ESCAPE_SUCCESS switches wording on `escaped`', () => {
    expect(keysOf('ESCAPE_SUCCESS')).toEqual(['events.escapeSuccessDesc']);
    const survived = describeEvent('ESCAPE_SUCCESS', { ...C1, ...P1, escaped: false }, zhT);
    expect(survived.map((segment) => segment.key)).toEqual(['events.escapeSurvivedDesc']);
  });

  it('SIGNAL_ISSUED switches wording on `intent`', () => {
    expect(keysOf('SIGNAL_ISSUED')).toEqual(['events.signalAttackDesc']);
    const defend = describeEvent('SIGNAL_ISSUED', { ...FULL_DATA.SIGNAL_ISSUED, intent: 'defend' }, zhT);
    expect(defend.map((segment) => segment.key)).toEqual(['events.signalDefendDesc']);
  });

  it('DEFECTION reads as one sentence of up to four clauses', () => {
    expect(keysOf('DEFECTION')).toEqual([
      'events.defectionDesc',
      'events.defectionLeft',
      'events.defectionAt',
      'events.defectionFounded',
    ]);
    const text = describeEventText('DEFECTION', FULL_DATA.DEFECTION, zhT);
    // 建立新勢力的 reason 用 founded 而非 joined / a created_new_faction reason says founded
    expect(text).toContain('建立了新勢力');
    // 四段以 ' · ' 相連 / four clauses joined by ' · '
    expect(text.split(' · ')).toHaveLength(4);
  });

  it('DEFECTION joining an existing faction says joined, not founded', () => {
    const joined = describeEvent(
      'DEFECTION',
      { ...C1, newFactionId: 'f2', newFactionName: '霜狼團', reason: 'joined_nearby' },
      zhT
    );
    expect(joined.map((segment) => segment.key)).toEqual([
      'events.defectionDesc',
      'events.defectionJoined',
    ]);
  });

  it('DEFECTION with only the defector still renders the subject', () => {
    const minimal = describeEvent('DEFECTION', { ...C1 }, zhT);
    expect(minimal.map((segment) => segment.key)).toEqual(['events.defectionDesc']);
  });

  it('BUILDING_UPGRADE translates the building name', () => {
    const text = describeEventText('BUILDING_UPGRADE', FULL_DATA.BUILDING_UPGRADE, zhT);
    expect(text).toContain('洛水城');
    expect(text).toContain('市場');
    expect(text).toContain('2');
  });

  it('ADMIN_REMOVED without a successor prints the dash, never a placeholder', () => {
    const noSuccessor = describeEvent('ADMIN_REMOVED', { ...C1, ...P1 }, zhT);
    const text = describeEventText(
      'ADMIN_REMOVED',
      noSuccessor.length > 0 ? { ...C1, ...P1 } : {},
      zhT
    );
    expect(noSuccessor).toHaveLength(1);
    expect(text).toContain('—');
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it('INCOME merges the king and administrator when one person holds both seats', () => {
    const same = describeEvent(
      'INCOME',
      {
        ...P1,
        income: 5,
        recruits: 2,
        garrisonAfter: 9,
        kingId: 'c1',
        kingName: '張飛',
        adminId: 'c1',
        adminName: '張飛',
        kingGold: 3,
        adminGold: 2,
        adminGoldAfter: 5,
      },
      zhT
    );
    expect(same).toHaveLength(2);
    expect(same[1].key).toBe('events.incomeLeader');
    // 合併後的金額是兩份之和 / the merged share is the sum of both
    expect(same[1].params.gold).toBe(5);
    expect(same[1].params.total).toBe(5);
  });

  it('INCOME lists king and administrator separately otherwise', () => {
    const separate = describeEvent('INCOME', FULL_DATA.INCOME, zhT);
    expect(separate).toHaveLength(3);
    expect(separate[1].params.gold).toBe(1);
    expect(separate[2].params.gold).toBe(2);
  });

  it('INCOME drops a paid-share clause when that name is missing', () => {
    const noAdminName = describeEvent(
      'INCOME',
      {
        ...P1,
        income: 5,
        recruits: 2,
        garrisonAfter: 9,
        kingId: 'c1',
        kingName: '張飛',
        kingGold: 1,
        kingGoldAfter: 3,
        adminId: 'c2',
        adminGold: 2,
        adminGoldAfter: 4,
      },
      zhT
    );
    // adminName 缺了 → 只有收益與君王兩段 / adminName missing → income + king only
    expect(noAdminName).toHaveLength(2);
    expect(noAdminName.map((segment) => segment.key)).toEqual([
      'events.incomeDesc',
      'events.incomeLeader',
    ]);
    expect(noAdminName[1].params.gold).toBe(1);
  });

  it('TROOPS_BOUGHT reports the whole money path', () => {
    const text = describeEventText('TROOPS_BOUGHT', FULL_DATA.TROOPS_BOUGHT, zhT);
    expect(text).toContain('30');
    expect(text).toContain('15');
  });
});

// ─── 缺欄位 / Missing fields ─────────────────────────────────────────────

describe('describeEvent missing fields', () => {
  it('drops the whole segment when a required name is absent', () => {
    // 出生沒有地名（本次改動之前的舊事件）/ a spawn without its place (legacy rows)
    expect(describeEvent('CHARACTER_SPAWNED', { ...C1 }, zhT)).toEqual([]);
    // 移動只有起點 / a move with only the origin
    expect(
      describeEvent(
        'CHARACTER_MOVED',
        { ...C1, fromPlaceId: 'p1', fromPlaceName: '洛水城' },
        zhT
      )
    ).toEqual([]);
  });

  it('returns [] for an unknown event type', () => {
    expect(describeEvent('SOMETHING_NEW', { charName: '張飛' }, zhT)).toEqual([]);
    expect(describeEventText('SOMETHING_NEW', {}, zhT)).toBe('');
  });

  it('never emits a placeholder when a compound event loses a clause', () => {
    // 舊事件的叛變沒有 old/new 勢力名，句子只剩主詞，不能出現 {faction}
    // A legacy defection carries no faction names: the subject alone survives,
    // and no {faction} literal may appear
    const legacy = describeEvent('DEFECTION', { ...C1 }, zhT);
    const text = describeEventText('DEFECTION', { ...C1 }, zhT);
    expect(legacy.map((segment: EventSegment) => segment.key)).not.toContain('events.defectionLeft');
    expect(text).not.toMatch(/\{\w+\}/);
  });
});
