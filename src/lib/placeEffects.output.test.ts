import { describe, it, expect } from 'vitest';
import {
  placeOutputAt,
  totalCostToReach,
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

describe('totalCostToReach — the running total, not one step', () => {
  it('level 0 costs nothing', () => {
    expect(totalCostToReach(0)).toBe(0);
  });

  it('accumulates the per-step cost', () => {
    expect(totalCostToReach(1)).toBe(upgradeCost(0));
    expect(totalCostToReach(3)).toBe(upgradeCost(0) + upgradeCost(1) + upgradeCost(2));
    expect(totalCostToReach(3)).toBe(700);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let l = 0; l <= BUILDING_MAX_LEVEL; l++) {
      const c = totalCostToReach(l);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});