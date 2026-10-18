import { describe, it, expect } from 'vitest';
import { relationsOf, type RelationPair } from './relations';

describe('relationsOf', () => {
  // 友誼一列 = 一段關係（雙向，但只存一列）
  const friendship: RelationPair[] = [
    { aId: 'a', bId: 'b', sinceRound: 3 },
  ];

  it('finds the partner in both storage orders', () => {
    // 掃描**兩端**是必要的：關係是雙向的，而儲存順序不保證一致。
    // Scanning **both** endpoints is required: relations are bidirectional and the stored
    // order is not guaranteed to put this leader first.
    expect(relationsOf('a', friendship)).toEqual([{ id: 'b', sinceRound: 3 }]);
    expect(relationsOf('b', friendship)).toEqual([{ id: 'a', sinceRound: 3 }]);
  });

  it('returns nothing for a leader with no relations', () => {
    expect(relationsOf('nobody', friendship)).toEqual([]);
  });

  // ── 這是不滿改成雙向之後才出現的問題 ────────────────────────────────────────
  // The case mutual discontent introduced.
  describe('mutual discontent is stored as two rows per pair', () => {
    const mutual: RelationPair[] = [
      { aId: 'a', bId: 'b', sinceRound: 7 },
      { aId: 'b', bId: 'a', sinceRound: 7 },
    ];

    it('reports the partner ONCE, not once per row', () => {
      // 舊版單向時，一對只有一列，所以這個 `length` 檢查會是 1 而通過。
      // 改成互相之後，naive 掃描會回報兩次 —— 同一個人在名單裡出現兩行。
      //
      // Under the old unidirectional form one pair was one row, so this length assertion
      // would have passed at 1. Once the relation became mutual a naive scan returns two —
      // the same person listed twice in one list, which reads as two different people.
      expect(relationsOf('a', mutual)).toEqual([{ id: 'b', sinceRound: 7 }]);
      expect(relationsOf('b', mutual)).toEqual([{ id: 'a', sinceRound: 7 }]);
    });

    it('keeps the earliest round when the two rows disagree', () => {
      // 兩列由同一次擲骰寫入，本來就同回合；但去重必須有明確的取值規則，
      // 否則「用哪一列」就變成 Map 的插入順序，一改順序答案就會飄。
      //
      // Both rows come from one roll and already agree, but collapsing them still needs a
      // defined rule — otherwise "which row wins" becomes Map insertion order and the
      // answer drifts when the order does.
      const disagreeing: RelationPair[] = [
        { aId: 'a', bId: 'b', sinceRound: 9 },
        { aId: 'b', bId: 'a', sinceRound: 4 },
      ];
      expect(relationsOf('a', disagreeing)).toEqual([{ id: 'b', sinceRound: 4 }]);
    });
  });

  it('collects several partners, ordered by when each formed', () => {
    const rows: RelationPair[] = [
      { aId: 'a', bId: 'late', sinceRound: 10 },
      { aId: 'a', bId: 'early', sinceRound: 2 },
      { aId: 'b', bId: 'c', sinceRound: 1 },
    ];
    // 與無關的人的行必須被忽略 —— 這支函式回傳的是「和這個人有關係的」。
    // Rows belonging to unrelated people must be ignored: this returns *his* relations.
    expect(relationsOf('a', rows)).toEqual([
      { id: 'early', sinceRound: 2 },
      { id: 'late', sinceRound: 10 },
    ]);
  });

  it('ignores a self-relation rather than listing the leader as their own partner', () => {
    // a === b 的列在資料庫層面是允許的（沒有約束擋它）。回傳「自己是自己的朋友」
    // 會在名單裡印出自己的名字。
    // The database permits `a === b` (nothing forbids it). Returning "you are your own
    // friend" would print the reader's own name back at them.
    expect(relationsOf('a', [{ aId: 'a', bId: 'a', sinceRound: 5 }])).toEqual([]);
  });
});