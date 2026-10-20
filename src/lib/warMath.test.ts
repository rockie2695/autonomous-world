import { describe, it, expect } from 'vitest';
import {
  strikeDamage,
  warFatigue,
  warVerdict,
  warEscapeChance,
} from './warMath';
import { CONFIG } from './gameConfig';

describe('strikeDamage', () => {
  it('scales with attack power and floors to whole troops', () => {
    // 攻擊 60、防禦係數 1（無體魄無堡壘）、每 8 點打掉 1 兵 → 7（floor）/
    // Attack 60, defence factor 1 (no ti, no fortress), 8 power per troop -> 7 (floor)
    expect(strikeDamage(60, 1)).toBe(7);
    expect(Number.isInteger(strikeDamage(60, 1))).toBe(true);
  });

  it('defence factor (physique + fortress) mitigates the damage', () => {
    const bare = strikeDamage(60, 1);
    const tough = strikeDamage(60, 1.5 * 1.4);
    expect(tough).toBeLessThan(bare);
    expect(tough).toBeGreaterThan(0);
  });

  it('never goes negative', () => {
    expect(strikeDamage(1, 5)).toBe(0);
  });
});

describe('warFatigue', () => {
  it('applies the per-round multiplier and floors at 1', () => {
    // 30 兵打完一輪 ×0.95 = 28.5 → 28；1 兵打完一輪仍是 1（活著的將領至少 1 兵）/
    // 30 troops after one round x0.95 = 28.5 -> 28; 1 troop stays 1 (a living leader
    // keeps at least one soldier)
    expect(warFatigue(30)).toBe(Math.floor(30 * CONFIG.BATTLE_WAR_FATIGUE));
    expect(warFatigue(1)).toBe(1);
  });
});

describe('warVerdict', () => {
  const base = { garrison: 0, attackerTroops: 50, defenderTroops: 50, roundsFought: 1 };

  it('capture when the defence is gone (garrison 0 and no defenders)', () => {
    expect(warVerdict({ ...base, garrison: 0, defenderTroops: 0 })).toBe('capture');
  });

  it('hold when the attackers are gone', () => {
    expect(warVerdict({ ...base, attackerTroops: 0 })).toBe('hold');
  });

  it('rout when the attackers fall below the threshold', () => {
    // 攻方 20 < 守方 50 × 0.5 = 25 → 潰逃 /
    // attackers 20 < defenders 50 x 0.5 = 25 -> rout
    expect(warVerdict({ ...base, attackerTroops: 20, defenderTroops: 50 })).toBe('rout');
    // 剛好在門檻之上 → 繼續 / just above the threshold -> continue
    expect(warVerdict({ ...base, attackerTroops: 26, defenderTroops: 50 })).toBe('continue');
  });

  it('retreat at the round cap', () => {
    expect(
      warVerdict({ ...base, roundsFought: CONFIG.BATTLE_MAX_ROUNDS })
    ).toBe('retreat');
  });

  it('the garrison counts toward the defence', () => {
    // 攻方 20 vs 駐軍 50（無守將）→ 潰逃；駐軍 0 時攻方照樣打 /
    // attackers 20 vs garrison 50 (no defenders) -> rout; with no garrison they fight on
    expect(warVerdict({ ...base, garrison: 50, defenderTroops: 0, attackerTroops: 20 })).toBe('rout');
  });
});

describe('warEscapeChance', () => {
  it('matches the single-engagement formula', () => {
    expect(warEscapeChance(0)).toBe(CONFIG.SPEED_ESCAPE_BASE);
    expect(warEscapeChance(25)).toBe(CONFIG.SPEED_ESCAPE_MAX);
    expect(warEscapeChance(-25)).toBe(CONFIG.SPEED_ESCAPE_MIN);
  });
});
