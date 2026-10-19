import { describe, expect, it } from 'vitest';
import {
  preferredBuildings,
  spendingPosture,
  troopReserveRate,
} from './spending';
import { CONFIG } from './gameConfig';

describe('spendingPosture', () => {
  it('a strictly dominant stat sets the posture', () => {
    expect(spendingPosture({ wu: 20, ti: 10, jing: 10 })).toBe('aggressive');
    expect(spendingPosture({ wu: 10, ti: 20, jing: 10 })).toBe('guardian');
    expect(spendingPosture({ wu: 10, ti: 10, jing: 20 })).toBe('merchant');
  });

  it('any tie is balanced — a marginal lead commits no one', () => {
    expect(spendingPosture({ wu: 20, ti: 20, jing: 10 })).toBe('balanced');
    expect(spendingPosture({ wu: 20, ti: 10, jing: 20 })).toBe('balanced');
    expect(spendingPosture({ wu: 10, ti: 10, jing: 10 })).toBe('balanced');
    expect(spendingPosture({ wu: 20, ti: 19, jing: 10 })).toBe('aggressive');
  });
});

describe('troopReserveRate', () => {
  it('reads the CONFIG values: aggressive none, balanced a quarter, guardian/merchant half', () => {
    expect(troopReserveRate('aggressive')).toBe(CONFIG.SPEND_RESERVE_AGGRESSIVE);
    expect(troopReserveRate('balanced')).toBe(CONFIG.SPEND_RESERVE_BALANCED);
    expect(troopReserveRate('guardian')).toBe(CONFIG.SPEND_RESERVE_GUARDIAN);
    expect(troopReserveRate('merchant')).toBe(CONFIG.SPEND_RESERVE_MERCHANT);
  });
});

describe('preferredBuildings', () => {
  it('each posture leads with its own building', () => {
    expect(preferredBuildings('aggressive', { fortress: 0, market: 0, barracks: 0 })[0]).toBe('barracks');
    expect(preferredBuildings('guardian', { fortress: 0, market: 0, barracks: 0 })[0]).toBe('fortress');
    expect(preferredBuildings('merchant', { fortress: 0, market: 0, barracks: 0 })[0]).toBe('market');
  });

  it('balanced raises the shortest board first', () => {
    const order = preferredBuildings('balanced', { fortress: 3, market: 1, barracks: 2 });
    expect(order[0]).toBe('market');
    expect(order[1]).toBe('barracks');
    expect(order[2]).toBe('fortress');
  });

  it('every posture yields all three buildings exactly once (the caller walks the list)', () => {
    for (const posture of ['aggressive', 'guardian', 'merchant', 'balanced'] as const) {
      const order = preferredBuildings(posture, { fortress: 0, market: 0, barracks: 0 });
      expect([...order].sort()).toEqual(['barracks', 'fortress', 'market']);
    }
  });
});
