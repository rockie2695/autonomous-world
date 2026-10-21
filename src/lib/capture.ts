// ============================================================================
// 無主之地的佔領者（純邏輯）/ Who takes an unowned place (pure)
// ============================================================================
// 「誰佔領一個無主之地」的規則只有一條：**有勢力、有兵、最快**。戰鬥階段的
// 第一趟掃描與晚佔領趟（戰爭輪之後補掃逃跑落腳點）共用這一份——兩處各寫一遍，
// 遲早會對不上（例如一處忘了排除 0 兵的將領）。
//
// There is exactly one rule for who takes an unowned place: **factioned, with
// troops, fastest**. The battle phase's first pass and the late pass (after the
// war rounds, re-scanning where escapees landed) share this one definition —
// written twice, they will drift (say, one forgetting to exclude 0-troop
// leaders).
// ============================================================================

/**
 * 誰佔領這個無主之地：有勢力、兵力 > 0 的將領中最快的一位；沒有就 `null`。
 * Who takes this unowned place: the fastest leader with a faction and troops
 * above zero; `null` when there is nobody.
 *
 * 0 兵的將領不算：他連一場仗都開不了（battle.ts 不讓 0 兵的人開戰），站上去
 * 只是站在那裡——與第一趟掃描的「有兵才算攻方」同一條規則。
 * A 0-troop leader does not count: they cannot even start a fight (battle.ts
 * will not let a 0-troop leader engage), so standing there is all they do — the
 * same rule as the first pass's "only troop-bearing leaders count as attackers".
 */
export function captureLeaderOf<
  T extends { factionId: string | null; speed: number; troops: number },
>(characters: ReadonlyArray<T>): (T & { factionId: string }) | null {
  const contenders = characters.filter(
    (c): c is T & { factionId: string } => c.factionId !== null && c.troops > 0
  );
  if (contenders.length === 0) return null;
  return [...contenders].sort((a, b) => b.speed - a.speed)[0] ?? null;
}
