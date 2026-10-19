import { describe, expect, it } from 'vitest';
import {
  attackMultiplier,
  defenceMultiplier,
  defectionChance,
  jingIncomeMultiplier,
  tongPurchaseMultiplier,
} from './abilityEffects';
import { DEFECTION_MIDPOINT } from './defection';
import { CONFIG } from './gameConfig';

describe('attackMultiplier / defenceMultiplier', () => {
  it('reads the same CONFIG constants battle.ts uses', () => {
    // 倍率在 0 是 1、在上限恰好是 2——兩個端點把常數釘死 /
    // The two endpoints pin the constant: 1 at zero, exactly 2 at the cap
    expect(attackMultiplier(0)).toBe(1);
    expect(attackMultiplier(CONFIG.CHAR_ABILITY_MAX)).toBe(2);
    expect(defenceMultiplier(0)).toBe(1);
    expect(defenceMultiplier(CONFIG.CHAR_ABILITY_MAX)).toBe(2);
  });

  it('matches a mid-band value', () => {
    expect(attackMultiplier(21)).toBeCloseTo(1 + 21 / 30, 12);
    expect(defenceMultiplier(18)).toBeCloseTo(1 + 18 / 30, 12);
  });

  it('is linear in the ability — so a faction mean yields an exact multiplier', () => {
    // 彈窗用**勢力平均**算倍率的正當性：倍率對屬性是線性的，所以
    // 倍率(平均) === 平均(倍率)。這條斷言若失敗，雷達提示的數字就只是近似，
    // 必須改設計。浮點誤差用 12 位精度容忍 /
    // What licenses the radar tooltip deriving from a **faction mean**: the
    // multiplier is linear in the ability, so multiplier(mean) ===
    // mean(multiplier). If this fails the radar number is only an approximation
    // and the design has to change. Float noise tolerated at 12 digits.
    for (const [a, b] of [
      [10, 20],
      [5, 30],
      [17, 19],
    ] as const) {
      const mean = (a + b) / 2;
      expect(attackMultiplier(mean)).toBeCloseTo(
        (attackMultiplier(a) + attackMultiplier(b)) / 2,
        12
      );
      expect(defenceMultiplier(mean)).toBeCloseTo(
        (defenceMultiplier(a) + defenceMultiplier(b)) / 2,
        12
      );
      expect(tongPurchaseMultiplier(mean)).toBeCloseTo(
        (tongPurchaseMultiplier(a) + tongPurchaseMultiplier(b)) / 2,
        12
      );
      expect(jingIncomeMultiplier(mean)).toBeCloseTo(
        (jingIncomeMultiplier(a) + jingIncomeMultiplier(b)) / 2,
        12
      );
    }
  });
});

describe('tongPurchaseMultiplier / jingIncomeMultiplier', () => {
  it('is 1 at the midpoint, above above it, below below it, never negative', () => {
    expect(tongPurchaseMultiplier(17.5)).toBe(1);
    expect(jingIncomeMultiplier(17.5)).toBe(1);
    expect(tongPurchaseMultiplier(30)).toBeGreaterThan(1);
    expect(tongPurchaseMultiplier(5)).toBeLessThan(1);
    // 輸入先被 `Math.max(0, jing)` 夾住，所以 0 時是 1 − 中點/上限，不是 0——
    // income.ts 的 0 下限是防禦性的，正常輸入到不了 /
    // The input is clamped by `Math.max(0, jing)` first, so at 0 the multiplier is
    // 1 − midpoint/max, not 0 — income.ts's 0 floor is defensive and unreachable
    // with valid input
    expect(jingIncomeMultiplier(0)).toBeCloseTo(
      1 - CONFIG.INCOME_JING_MIDPOINT / CONFIG.CHAR_ABILITY_MAX,
      12
    );
  });
});

describe('defectionChance', () => {
  it('is 0 at the midpoint (below average never defects)', () => {
    expect(defectionChance(DEFECTION_MIDPOINT)).toBe(0);
    expect(defectionChance(DEFECTION_MIDPOINT - 1)).toBe(0);
  });

  it('scales linearly above the midpoint', () => {
    expect(defectionChance(30)).toBeCloseTo(
      ((30 - DEFECTION_MIDPOINT) / DEFECTION_MIDPOINT) * CONFIG.DEFECTION_BASE_RATE,
      12
    );
  });
});
