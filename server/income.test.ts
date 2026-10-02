import { describe, it, expect } from 'vitest';
import { splitIncome, jingIncomeMultiplier } from './income';
import { CONFIG } from '@/lib/gameConfig';

describe('Income split', () => {
  describe('jingIncomeMultiplier', () => {
    it('should be 1 at the configured midpoint', () => {
      // 平均 jing 的領導者與舊規則完全相同 / an average leader matches the old rule
      expect(jingIncomeMultiplier(CONFIG.INCOME_JING_MIDPOINT)).toBe(1);
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

  describe('splitIncome', () => {
    it('should reproduce the old 40/30/30 split at the midpoint', () => {
      // 回歸守門：舊規則沒有 jing，產生了 40/30/30。兩位都是平均 jing 時必須完全相同 /
      // Regression guard: the old rule had no jing and produced 40/30/30, so a pair
      // sitting exactly at the midpoint must reproduce it
      const mid = CONFIG.INCOME_JING_MIDPOINT;
      const split = splitIncome(100, mid, mid);
      expect(split.king).toBe(40);
      expect(split.admin).toBe(30);
      expect(split.others).toBe(30);
    });

    it('should not shift the whole economy for an average leader', () => {
      // 平均 jing 的領導者不該從部屬身上多拿 / an average leader must not take more
      // from their subordinates than the old rule did
      const mid = CONFIG.INCOME_JING_MIDPOINT;
      expect(splitIncome(1000, mid, mid).others).toBe(300);
    });

    it('should never distribute more than the place earns', () => {
      // 兩位高 jing 領導者加總可能超過收入，必須按比例縮回 /
      // Two high-jing leaders can add up to more than the income, so scale back
      for (let income = 10; income <= 400; income += 7) {
        for (const kingJing of [0, 5, 17, 30]) {
          for (const adminJing of [0, 5, 17, 30]) {
            const split = splitIncome(income, kingJing, adminJing);
            expect(split.king).toBeGreaterThanOrEqual(0);
            expect(split.admin).toBeGreaterThanOrEqual(0);
            expect(split.others).toBeGreaterThanOrEqual(0);
            expect(split.king + split.admin + split.others).toBeLessThanOrEqual(
              income
            );
          }
        }
      }
    });

    it('should reward economic power with a bigger pocket', () => {
      // 同一份額比例下，jing 高的那位一定拿得更多 /
      // At the same share ratio, the higher-jing leader always pockets more
      const mid = CONFIG.INCOME_JING_MIDPOINT;
      const rich = splitIncome(100, mid, 30);
      const poor = splitIncome(100, mid, 5);
      expect(rich.admin).toBeGreaterThan(30);
      expect(poor.admin).toBeLessThan(30);
      expect(rich.admin).toBeGreaterThan(poor.admin);
    });

    it('should let a strong leader out-earn a weak one, ratio preserved', () => {
      const high = splitIncome(100, 30, 5);
      const low = splitIncome(100, 5, 30);
      expect(high.king).toBeGreaterThan(high.admin);
      expect(low.admin).toBeGreaterThan(low.king);
    });

    it('should give a lone leader everything, with no multiplier', () => {
      // 單一領導者本來就獨得全部，套倍率會印錢 /
      // A lone leader already takes everything — a multiplier would mint gold
      expect(splitIncome(100, 30, null)).toEqual({ king: 100, admin: 0, others: 0 });
      expect(splitIncome(100, null, 30)).toEqual({ king: 0, admin: 100, others: 0 });
    });

    it('should treat jing 0 as a real leader, not a vacant seat', () => {
      // 0 與 null 意義不同：0 是「有這個人但 jing 低」/ 0 and null differ in meaning
      const split = splitIncome(100, 0, 0);
      expect(split.king).toBeGreaterThan(0);
      expect(split.admin).toBeGreaterThan(0);
      expect(split.king).toBeLessThan(40);
    });

    it('should distribute nothing when there is no leader at all', () => {
      // 與舊行為一致：沒有君王也沒有總督時，收入不發放 /
      // Matches the old behaviour: no king and no admin means nobody is paid
      const split = splitIncome(100, null, null);
      expect(split).toEqual({ king: 0, admin: 0, others: 100 });
    });
  });
});