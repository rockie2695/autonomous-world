// ============================================================================
// 同地點關係對戰鬥力的影響（純邏輯）
// How co-located relations affect combat ability (pure)
// ============================================================================
// 朋友在同一個地點時，**提高**他的武力與體魄；不滿的人在同一個地點時，**降低**。
// 兩者都只影響**計算**，不改寫 `Character` 的任何欄位。
//
// A friend at the same place **raises** a leader's martial and physique; someone they are
// unhappy with at the same place **lowers** them. Both are calculation-only — no `Character`
// column is ever rewritten.
//
// **「離開就回復」是免費的。** 這裡沒有任何持久狀態可以回復：penalty 每一次都從**目前**
// 的位置重新推導，所以它不可能忘記撤銷，也不可能卡住不消失。走開了，數字立刻回來。
//
// **"Reverts when they are not at the same place" is free.** There is no persistent state to
// revert: the penalty is re-derived from current positions every time, so it cannot forget to
// expire and cannot get stuck. Walk away and the number is back immediately.
//
// 這支函式**同時**被伺服器（`battle.ts`）與客戶端（將領彈窗）使用，兩邊算出來必須是
// 同一個數字。專案既有的慣例：`defectionValue()` 就是這樣被兩邊共用的。
//
// This module is used by the server (`battle.ts`) **and** the client (the leader popup), and
// the two must agree on the number. The project's existing precedent is `defectionValue()`,
// which is shared the same way.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

/**
 * 有效能力的下限。攻擊力是 `troops × (1 + wu/30)`，所以 wu 掉到 0 以下會讓攻擊力變成
 * 負數——那不是「很弱」，那是錯的。
 *
 * The floor for an effective ability. Attack power is `troops × (1 + wu/30)`, so a wu below
 * zero would make attack power *negative* — which is not "very weak", it is wrong.
 */
export const COMBAT_ABILITY_FLOOR = 1;

/** 某人被關係影響的總量 / the total modifier on one leader */
export interface RelationCombatDelta {
  /** 武力（攻擊）的增減 / the change to martial (attack) */
  wu: number;
  /** 體魄（防禦）的增減 / the change to physique (defence) */
  ti: number;
}

/**
 * 一列關係的**最小**形狀：只有兩個端點。
 * The **minimal** shape of a relation row: just the two endpoints.
 *
 * 這裡刻意不要求 `sinceRound`——戰鬥計算只問「誰跟誰站在一起」，不問那關係是什麼時候
 * 建立的。`RelationPair`（帶 `sinceRound`）可以指派給這個型別，反過來不行。
 *
 * `sinceRound` is deliberately not required: the combat calculation only asks "who is
 * standing with whom", never when the relationship formed. `RelationPair` (which carries
 * `sinceRound`) is assignable to this type, but not the other way round.
 */
export interface RelationEndpoint {
  aId: string;
  bId: string;
}

/**
 * 依目前的**位置**推導每個人的戰鬥力增減。
 * Derive every leader's combat modifier from their **current** positions.
 *
 * **一次配對掃描就夠了。** 對一列關係 (a, b)：若兩人**在同一個地點**，那一列對**兩邊**
 * 都有效果——a 有一位同處一地的朋友，b 也是。兩人不同地點時，這一列對誰都沒有效果。
 * 這個寫法本身就是「對方在我的地點」的定義，而且只需 O(關係數) 一次，不必每位戰鬥者
 * 各掃一次。
 *
 * **One pass over the pairs.** For a relation row (a, b): if the two are **at the same
 * place**, the row counts for **both** — a has a friend standing with them, and so does b.
 * When they are apart, the row counts for neither. That formulation *is* the definition of
 * "the other one is at my place", and it costs O(relations) once instead of a scan per
 * combatant.
 *
 * `placeOf` **只應該包含活著的角色**。關係不會隨著死亡而消失，而亡者的 `placeId` 仍留在
 * 資料庫裡——那會讓一位已故的朋友繼續削弱他生前所在的地點。
 *
 * `placeOf` should contain **living characters only**. Relations outlive their owners and a
 * dead character's `placeId` stays in the database, which would let a dead friend keep
 * weakening the place they used to stand in.
 *
 * @param placeOf - 角色 id → 目前所在地 / character id → current place
 * @param friends - 友誼列 / the friendship rows
 * @param discontents - 不滿列 / the discontent rows
 * @returns 角色 id → 增減量（沒有影響的角色不會出現在結果裡）/ character id → the modifier
 */
export function buildRelationCombatDeltas(
  placeOf: ReadonlyMap<string, string>,
  friends: ReadonlyArray<RelationEndpoint>,
  discontents: ReadonlyArray<RelationEndpoint>
): Map<string, number> {
  /** 每人各有多少位同地點的朋友 / 不滿的人 */
  const counts = new Map<string, { friends: number; discontents: number }>();

  const bump = (charId: string, kind: 'friends' | 'discontents'): void => {
    const entry = counts.get(charId);
    if (entry) {
      entry[kind] += 1;
    } else {
      counts.set(charId, {
        friends: kind === 'friends' ? 1 : 0,
        discontents: kind === 'discontents' ? 1 : 0,
      });
    }
  };

  /** 對每列關係：兩人同地點才對兩邊計數 */
  const countPairs = (
    rows: ReadonlyArray<RelationEndpoint>,
    kind: 'friends' | 'discontents'
  ): void => {
    for (const row of rows) {
      const a = placeOf.get(row.aId);
      const b = placeOf.get(row.bId);
      // 缺少位置 = 角色不存在或已死 / a missing place means the character is gone or dead
      if (a === undefined || b === undefined) continue;
      if (a !== b) continue;
      bump(row.aId, kind);
      bump(row.bId, kind);
    }
  };

  countPairs(friends, 'friends');
  countPairs(discontents, 'discontents');

  const deltas = new Map<string, number>();
  for (const [charId, count] of counts) {
    // 每種關係**各自**有上限：一位有九位同地點朋友的人，效果只等同於三位朋友，
    // 否則十位朋友就是 +10 武力，而整個能力區間只有 5–30，那一下就淹沒了整條刻度。
    //
    // Each relation kind is capped **separately**: a leader with nine friends standing with
    // them gets the effect of three, or ten friends would be +10 martial while the whole
    // ability band is 5–30 — one swing would swamp the entire scale.
    const friendPart =
      Math.min(count.friends, CONFIG.RELATION_SAME_PLACE_MAX) *
      CONFIG.FRIEND_SAME_PLACE_DELTA;
    const discontentPart =
      Math.min(count.discontents, CONFIG.RELATION_SAME_PLACE_MAX) *
      CONFIG.DISCONTENT_SAME_PLACE_DELTA;

    const total = friendPart + discontentPart;
    if (total !== 0) deltas.set(charId, total);
  }

  return deltas;
}

/**
 * 把基礎值加上關係影響，並夾在合理的範圍內。
 * Apply the relation modifier to a base ability, clamped to a sane range.
 *
 * **沒有上限。** 武力 30 的人身邊有四位朋友，會得到 34——那個加成正是這條規則的意義。
 * 只有**下限**，因為負的攻擊力是錯的。
 *
 * **No ceiling.** A leader at 30 with four friends beside them gets 34 — that bonus is the
 * whole point of the rule. Only a **floor**, because a negative attack power is simply wrong.
 *
 * @param base - 資料庫裡的基礎值 / the stored base value
 * @param delta - 關係造成的增減 / the modifier from the relations
 * @returns 計算時真正使用的值 / the value the calculation actually uses
 */
export function effectiveAbility(base: number, delta: number): number {
  return Math.max(COMBAT_ABILITY_FLOOR, base + delta);
}
