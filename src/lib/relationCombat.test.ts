import { describe, it, expect } from 'vitest';
import {
  buildRelationCombatDeltas,
  effectiveAbility,
  COMBAT_ABILITY_FLOOR,
} from './relationCombat';
import { CONFIG } from './gameConfig';
import type { RelationPair } from './relations';

const place = (entries: Record<string, string>) => new Map(Object.entries(entries));

const friend = (aId: string, bId: string): RelationPair => ({ aId, bId, sinceRound: 1 });
const grudge = (aId: string, bId: string): RelationPair => ({ aId, bId, sinceRound: 1 });

describe('buildRelationCombatDeltas', () => {
  it('gives a leader a friend standing with them', () => {
    // 朋友在**同一個地點** → 武力/體魄提高。這是這條規則的正面效果。
    // A friend at the **same place** raises martial and physique. This is the positive half
    // of the rule.
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P', b: 'P' }),
      [friend('a', 'b')],
      []
    );
    expect(deltas.get('a')).toBe(CONFIG.FRIEND_SAME_PLACE_DELTA);
    expect(deltas.get('b')).toBe(CONFIG.FRIEND_SAME_PLACE_DELTA);
  });

  it('gives a leader nothing while the friend is somewhere else', () => {
    // 同一段關係，但兩人不同地點 → 完全沒有影響。這就是「離開就回復」的機制：
    // 沒有任何狀態被記住，所以沒有東西需要被撤銷。
    //
    // The same relation, but the two are apart: no effect at all. This is the "reverts when
    // they separate" mechanism — nothing is remembered, so there is nothing to expire.
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P', b: 'Q' }),
      [friend('a', 'b')],
      []
    );
    expect(deltas.size).toBe(0);
  });

  it('lowers a leader for someone they are unhappy with, alongside them', () => {
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P', b: 'P' }),
      [],
      [grudge('a', 'b')]
    );
    expect(deltas.get('a')).toBe(CONFIG.DISCONTENT_SAME_PLACE_DELTA);
    expect(deltas.get('b')).toBe(CONFIG.DISCONTENT_SAME_PLACE_DELTA);
  });

  it('counts each co-located relation separately', () => {
    // 兩位朋友同地 → +2，不是 +1。逐筆累加（與冷卻、朋友叛逃同一條規則）。
    // Two friends alongside -> +2, not +1. Additive, the same rule as the cooling and the
    // friend-defection penalty.
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P', b: 'P', c: 'P' }),
      [friend('a', 'b'), friend('a', 'c')],
      []
    );
    expect(deltas.get('a')).toBe(2 * CONFIG.FRIEND_SAME_PLACE_DELTA);
    expect(deltas.get('b')).toBe(CONFIG.FRIEND_SAME_PLACE_DELTA);
    expect(deltas.get('c')).toBe(CONFIG.FRIEND_SAME_PLACE_DELTA);
  });

  it('caps how many relations of one kind count', () => {
    // 沒有上限的話，五位同地點朋友就是 +5 武力，而能力區間只有 5–30。
    // Without the cap, five friends alongside is +5 martial while the band is 5–30.
    const people = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rows = people.slice(1).map((id) => friend('a', id));
    const deltas = buildRelationCombatDeltas(
      place(Object.fromEntries(people.map((id) => [id, 'P']))),
      rows,
      []
    );
    expect(deltas.get('a')).toBe(CONFIG.RELATION_SAME_PLACE_MAX * CONFIG.FRIEND_SAME_PLACE_DELTA);
  });

  it('caps each relation kind separately', () => {
    // 兩種關係**各自**有上限：三位朋友 + 兩位不滿的人 = 3×(+1) + 2×(−1) = +1。
    // Each kind is capped **separately**: three friends plus two gripes is 3(+1) + 2(−1).
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P', b: 'P', c: 'P', d: 'P', e: 'P' }),
      [friend('a', 'b'), friend('a', 'c'), friend('a', 'd')],
      [grudge('a', 'e')]
    );
    expect(deltas.get('a')).toBe(
      CONFIG.RELATION_SAME_PLACE_MAX * CONFIG.FRIEND_SAME_PLACE_DELTA +
        CONFIG.DISCONTENT_SAME_PLACE_DELTA
    );
  });

  it('ignores a character with no place, so a dead friend stops counting', () => {
    // 關係不會隨死亡而消失，而亡者的 placeId 仍留在資料庫裡。若不排除，他生前所在的地點
    // 會繼續被一位已故的朋友影響。
    //
    // Relations outlive their owners and a dead character's placeId stays in the database.
    // Without excluding them, the place they used to stand in keeps being affected by a
    // friend who is already dead.
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P' }), // 'b' is absent — dead, or gone
      [friend('a', 'b')],
      []
    );
    expect(deltas.size).toBe(0);
  });

  it('omits leaders with no effect at all', () => {
    // 沒有影響的人不會出現在結果裡——否則呼叫端每次都要先問「這個 delta 是 0 還是沒有」。
    // Leaders with no effect are absent from the map, so the caller does not have to ask
    // "is this delta zero, or is there no entry?".
    const deltas = buildRelationCombatDeltas(place({ a: 'P', b: 'Q' }), [friend('a', 'b')], []);
    expect(deltas.has('a')).toBe(false);
  });

  it('nets friends and gripes that cancel out to no modifier', () => {
    const deltas = buildRelationCombatDeltas(
      place({ a: 'P', b: 'P' }),
      [friend('a', 'b')],
      [grudge('a', 'b')]
    );
    expect(deltas.has('a')).toBe(false);
  });
});

describe('effectiveAbility', () => {
  it('adds the modifier to the base value', () => {
    expect(effectiveAbility(20, 1)).toBe(21);
    expect(effectiveAbility(20, -1)).toBe(19);
  });

  it('never goes below the floor', () => {
    // 攻擊力是 troops × (1 + wu/30)，wu 掉到 0 以下會讓攻擊力變成**負數**——那不是
    // 「很弱」，那是錯的。
    //
    // Attack power is troops × (1 + wu/30), so a wu below zero makes attack power
    // **negative** — which is not "very weak", it is wrong.
    expect(effectiveAbility(5, -10)).toBe(COMBAT_ABILITY_FLOOR);
    expect(effectiveAbility(0, -1)).toBe(COMBAT_ABILITY_FLOOR);
  });

  it('has no ceiling, so a good leader still gains from friends', () => {
    // 沒有上限：武力 30 的人身邊有四位朋友會得到 34，那個加成正是這條規則的意義。
    // No ceiling: a leader at 30 with four friends gets 34, and that bonus is the point.
    expect(effectiveAbility(30, 4)).toBe(34);
  });
});
