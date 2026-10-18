import { describe, it, expect } from 'vitest';
import {
  placeOutputAt,
  costToReachLevel,
  upgradeCost,
  placeIncome,
  BUILDING_MAX_LEVEL,
} from '@/lib/placeEffects';

describe('placeOutputAt — what the place yields, not what the building adds', () => {
  it('market level 0 reports the place base income, not 0', () => {
    // The bug this exists for: buildingTotal('market', 0) is 0, which reads as "no income".
    expect(placeOutputAt('market', 0)).toEqual({ value: 10, unit: 'gold' });
  });

  it('market steps by PLACE_MARKET_INCOME_PER_LV', () => {
    expect(placeOutputAt('market', 1)?.value).toBe(15);
    expect(placeOutputAt('market', 5)?.value).toBe(35);
  });

  it('agrees with placeIncome at every level', () => {
    for (let l = 0; l <= BUILDING_MAX_LEVEL; l++) {
      expect(placeOutputAt('market', l)?.value).toBe(placeIncome(l));
    }
  });

  it('barracks reports total recruits', () => {
    expect(placeOutputAt('barracks', 0)?.unit).toBe('troops');
  });

  it('fortress has no output to report', () => {
    // Defence is a multiplier on the garrison, so a "total output" would be a lie.
    expect(placeOutputAt('fortress', 3)).toBeNull();
  });
});

describe('costToReachLevel — one step, because that is what the upgrade charges', () => {
  it('level 0 has no step before it', () => {
    expect(costToReachLevel(0)).toBeNull();
  });

  it('prints the price the upgrade action actually charges', () => {
    // `build.ts` charges `upgradeCost(currentLevel)`. Reaching level 2 means upgrading
    // *from* level 1, so the charge is upgradeCost(1) — and so is the price printed.
    expect(costToReachLevel(2)).toBe(upgradeCost(1));
    expect(costToReachLevel(2)).toBe(200);
  });

  // 這是讀者回報的錯誤本身：同一個目標印出兩個價錢，其中一個從未被收過。
  // This is the reported bug itself: one target, two prices, one of them never charged.
  it('would disagree with the charge if it printed a running total', () => {
    const runningTotalTo2 = upgradeCost(0) + upgradeCost(1);
    expect(runningTotalTo2).toBe(300);
    expect(costToReachLevel(2)).not.toBe(runningTotalTo2);
  });

  it('is strictly increasing, so each level in the list reads as its own price', () => {
    let prev = 0;
    for (let lvl = 1; lvl <= BUILDING_MAX_LEVEL; lvl++) {
      const cost = costToReachLevel(lvl);
      expect(cost).not.toBeNull();
      expect(cost!).toBeGreaterThan(prev);
      prev = cost!;
    }
  });
});