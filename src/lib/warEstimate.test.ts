import { describe, expect, it } from 'vitest';
import {
  estimateAttack,
  estimatePlaceDefence,
  isThreatened,
} from './warEstimate';
import { CONFIG } from './gameConfig';

describe('estimateAttack', () => {
  it('matches battle.ts at expected rolls', () => {
    // 0 兵打不出東西；係數讀 battle.ts 同一份 CONFIG /
    // No troops, no attack; the coefficient is battle.ts's own CONFIG constant
    expect(estimateAttack({ troops: 0, wu: 30 })).toBe(0);
    expect(estimateAttack({ troops: 100, wu: 0 })).toBe(100);
    expect(estimateAttack({ troops: 100, wu: 30 })).toBeCloseTo(200, 12);
    expect(estimateAttack({ troops: 100, wu: 15 })).toBeCloseTo(100 * (1 + 15 * CONFIG.BATTLE_ATK_WU_MULT), 12);
  });
});

describe('estimatePlaceDefence', () => {
  it('multiplies garrison and defenders by the same fortress multiplier once', () => {
    // 堡壘 0：無加成 /
    expect(estimatePlaceDefence({ garrison: 10, fortress: 0 }, [])).toBe(10);
    // 堡壘 5：(1 + 5 × 0.2) = 2 倍 /
    expect(estimatePlaceDefence({ garrison: 10, fortress: 5 }, [])).toBeCloseTo(20, 12);
    // 守軍將領與駐軍**共用**同一個堡壘倍率（battle.ts 兩條防禦式各帶一次）/
    // Defending leaders share the garrison's fortress multiplier (both defence
    // formulas in battle.ts carry it)
    const withLeader = estimatePlaceDefence({ garrison: 10, fortress: 5 }, [
      { troops: 20, ti: 30 },
    ]);
    expect(withLeader).toBeCloseTo((10 + 20 * 2) * 2, 12);
  });
});

describe('isThreatened', () => {
  it('any hostile neighbour threatens an undefended place', () => {
    expect(isThreatened(0, 1)).toBe(true);
    expect(isThreatened(0, 0)).toBe(false);
  });
  it('threatens when the strongest neighbour needs no luck to win', () => {
    expect(isThreatened(100, 100)).toBe(true);
    expect(isThreatened(100, 99.9)).toBe(false);
  });
});
