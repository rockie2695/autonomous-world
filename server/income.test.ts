// ============================================================================
// 收入分配測試 / Income split tests
// ----------------------------------------------------------------------------
// 這些測試把三條規則釘死：30/40/30 的比例、沒有行政官就誰都不拿、以及 jing 對份額的
// 放大作用。tong 的購兵倍率也住在同一個模組，所以一起測。
//
// These pin three rules: the 30/40/30 shares, nobody being paid without an
// administrator, and jing's effect on a share. tong's purchase multiplier lives in the
// same module, so it is covered here too.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  splitIncome,
  jingIncomeMultiplier,
  tongPurchaseMultiplier,
} from './income';
import { CONFIG } from '@/lib/gameConfig';

const MID = CONFIG.INCOME_JING_MIDPOINT;

describe('Income split', () => {
  describe('jingIncomeMultiplier', () => {
    it('should be 1 at the configured midpoint', () => {
      // 平均 jing 的領導者倍率是 1 / an average leader's multiplier is exactly 1
      expect(jingIncomeMultiplier(MID)).toBe(1);
    });

    it('should scale up above the midpoint and down below it', () => {
      expect(jingIncomeMultiplier(CONFIG.CHAR_ABILITY_MAX)).toBeGreaterThan(1);
      expect(jingIncomeMultiplier(CONFIG.CHAR_ABILITY_MIN)).toBeLessThan(1);
    });

    it('should never go negative, even for dirty data', () => {
      // 負值等同 0 / a negative value is treated as 0
      expect(jingIncomeMultiplier(-10)).toBe(jingIncomeMultiplier(0));
      expect(jingIncomeMultiplier(-10)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('tongPurchaseMultiplier', () => {
    it('should be 1 at the configured midpoint', () => {
      expect(tongPurchaseMultiplier(CONFIG.INCOME_TONG_MIDPOINT)).toBe(1);
    });

    it('should scale up above the midpoint and down below it', () => {
      expect(tongPurchaseMultiplier(CONFIG.CHAR_ABILITY_MAX)).toBeGreaterThan(1);
      expect(tongPurchaseMultiplier(CONFIG.CHAR_ABILITY_MIN)).toBeLessThan(1);
    });

    it('should use exactly the same shape as the jing multiplier', () => {
      // 兩個公式刻意長得一樣，所以同一個輸入必須得到同一個答案 ——
      // 這是「tong 的效果像 jing」最直接的證明 /
      // The two formulas are deliberately identical, so the same input must give the same
      // answer — the most direct proof that "tong behaves like jing"
      for (const value of [0, 5, 12, 17.5, 24, 30, 999]) {
        expect(tongPurchaseMultiplier(value)).toBe(jingIncomeMultiplier(value));
      }
    });

    it('should never go negative, even for dirty data', () => {
      expect(tongPurchaseMultiplier(-10)).toBe(tongPurchaseMultiplier(0));
      expect(tongPurchaseMultiplier(-10)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('splitIncome shares', () => {
    it('should split 30 / 40 / 30 at the midpoint', () => {
      // 比例規則本身：君王 30%、行政官 40%、其他人 30% /
      // The shares themselves: king 30%, administrator 40%, everyone else 30%
      const split = splitIncome(100, MID, MID, 2);
      expect(split.king).toBe(30);
      expect(split.admin).toBe(40);
      expect(split.others).toBe(30);
    });

    it('should give the administrator 70% when there are no other characters', () => {
      // 沒有其他人可分，那 30% 由行政官接手：30% + 40% = 70% /
      // With nobody else to share with, the 30% goes to the administrator: 30% + 40% = 70%
      const split = splitIncome(100, MID, MID, 0);
      expect(split.king).toBe(30);
      expect(split.admin).toBe(70);
      expect(split.others).toBe(0);
    });

    it('should give the administrator 100% when there is neither king nor others', () => {
      // 君王缺席時他的 30% 也併入行政官 / a vacant king folds his 30% in as well
      const split = splitIncome(100, null, MID, 0);
      expect(split.king).toBe(0);
      expect(split.admin).toBe(100);
      expect(split.others).toBe(0);
    });

    it('should pay nobody at all without an administrator', () => {
      // 這條規則和舊的相反：舊版沒有總督就把錢給國王，現在一分都不發 /
      // This inverts the old rule: the king used to absorb a vacant administrator's place,
      // now nobody is paid at all
      expect(splitIncome(100, 30, null, 3)).toEqual({ king: 0, admin: 0, others: 0 });
      expect(splitIncome(100, null, null, 3)).toEqual({ king: 0, admin: 0, others: 0 });
      expect(splitIncome(0, 30, null, 3)).toEqual({ king: 0, admin: 0, others: 0 });
    });

    it('should apply the absent-vacant-seat rule even when a king exists', () => {
      // 沒有行政官時，國王那份也不能單獨發出去 /
      // With no administrator the king does not get paid on his own either
      const split = splitIncome(100, MID, null, 1);
      expect(split.king).toBe(0);
      expect(split.admin).toBe(0);
      expect(split.others).toBe(0);
    });
  });

  describe('splitIncome invariants', () => {
    it('should never distribute more than the place earns', () => {
      // 兩位高 jing 領導者加總可能超過收入，必須按比例縮回 /
      // Two high-jing leaders can add up to more than the income, so scale back
      for (let income = 10; income <= 400; income += 7) {
        for (const kingJing of [0, 5, 17, 30]) {
          for (const adminJing of [0, 5, 17, 30]) {
            for (const others of [0, 1, 4]) {
              const split = splitIncome(income, kingJing, adminJing, others);
              expect(split.king).toBeGreaterThanOrEqual(0);
              expect(split.admin).toBeGreaterThanOrEqual(0);
              expect(split.others).toBeGreaterThanOrEqual(0);
              expect(split.king + split.admin + split.others).toBeLessThanOrEqual(income);
            }
          }
        }
      }
    });

    it('should distribute the whole income whenever there is an administrator', () => {
      // 有行政官時總額必定分完（錢不能憑空消失）/
      // With an administrator the whole income is distributed — gold cannot vanish
      for (let income = 10; income <= 300; income += 11) {
        for (const kingJing of [0, 9, 30, null]) {
          for (const adminJing of [0, 9, 30]) {
            for (const others of [0, 2]) {
              const split = splitIncome(income, kingJing, adminJing, others);
              expect(split.king + split.admin + split.others).toBe(income);
            }
          }
        }
      }
    });

    it('should treat jing 0 as a real leader, not a vacant seat', () => {
      // 0 與 null 意義不同：0 是「有這個人但 jing 低」/ 0 and null differ in meaning
      const split = splitIncome(100, 0, 0, 2);
      expect(split.king).toBeGreaterThan(0);
      expect(split.admin).toBeGreaterThan(0);
      expect(split.king).toBeLessThan(30);
      expect(split.admin).toBeLessThan(40);
    });

    it('should reward economic power with a bigger pocket', () => {
      // 同一份額比例下，jing 高的那位一定拿得更多 /
      // At the same share, the higher-jing leader always pockets more
      const rich = splitIncome(100, MID, 30, 2);
      const poor = splitIncome(100, MID, 5, 2);
      expect(rich.admin).toBeGreaterThan(40);
      expect(poor.admin).toBeLessThan(40);
      expect(rich.admin).toBeGreaterThan(poor.admin);
    });

    it('should let a strong leader out-earn a weak one, ratio preserved', () => {
      // 比例縮放要保留兩人的相對高低，而不是把弱的砍成 0 /
      // The proportional scale-back must preserve which of the two is richer
      const high = splitIncome(100, 30, 5, 2);
      const low = splitIncome(100, 5, 30, 2);
      expect(high.king).toBeGreaterThan(high.admin);
      expect(low.admin).toBeGreaterThan(low.king);
    });

    it('should hand a strong administrator the largest share by default', () => {
      // 40% 是最大的份額，因為實際管事的是行政官 /
      // 40% is the largest share because the administrator is the one actually running it
      const split = splitIncome(100, MID, MID, 3);
      expect(split.admin).toBeGreaterThan(split.king);
      expect(split.admin).toBeGreaterThan(split.others);
    });
  });
});