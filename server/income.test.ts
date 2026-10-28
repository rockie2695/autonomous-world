// ============================================================================
// 收入分配測試 / Income split tests
// ----------------------------------------------------------------------------
// 這些測試把規則釘死：30/40/30 的比例、沒有行政官就誰都不拿、**一個地方的收入只受
// 行政官的 jing 影響**（呼叫端用它放大整塊餅），以及君王與其他人的份額是變大後的餅
// 的固定比例。tong 的購兵倍率也住在同一個模組，所以一起測。
//
// These pin the rules: the 30/40/30 shares, nobody being paid without an
// administrator, **a place's income being shaped by the administrator's jing alone**
// (the caller scales the whole pie with it), and the king's and the others' shares
// being flat ratios of that grown pie. tong's purchase multiplier lives in the same
// module, so it is covered here too.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  splitIncome,
  jingIncomeMultiplier,
  placeOutput,
  purchaseBatch,
  tongPurchaseMultiplier,
  othersOf,
} from './income';
import { placeIncome } from '@/lib/placeEffects';
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
      // 兩個公式刻意長得一樣，所以同一個輸入必須得到同一個答案——
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

  describe('placeOutput', () => {
    it('floors the pie: gold is always whole', () => {
      // 倍率乘在**整塊餅**上後必須取整——金幣是 Int 欄位，事件的「收益」也要印得出人話
      // The multiplier scales the **whole pie** and then floors — gold is an Int column
      // and the event's income figure has to read as prose
      const out = placeOutput(1, 24);
      expect(Number.isInteger(out)).toBe(true);
      expect(out).toBe(Math.floor(placeIncome(1) * jingIncomeMultiplier(24)));
    });

    it('without an administrator the output is the base', () => {
      // 沒有行政官：地方照樣生產基礎產出（只是一分不發）/
      // No administrator: the place still produces its base output (it just pays nobody)
      expect(placeOutput(10, null)).toBe(placeIncome(10));
    });

    it('a higher-jing administrator makes the place richer', () => {
      const rich = placeOutput(10, 30);
      const poor = placeOutput(10, 5);
      expect(rich).toBeGreaterThan(poor);
    });
  });

  describe('splitIncome shares', () => {
    it('should split 10 / 60 / 30 at the midpoint', () => {
      // 比例規則本身：君王 10%、行政官 60%、其他人 30%（Oct 2026 由 30/40/30 改來，
      // 把君王的 20% 挪給實際管事的行政官）/
      // The shares themselves: king 10%, administrator 60%, everyone else 30%
      // (Oct 2026: changed from 30/40/30, moving the king's 20% to the one
      // actually running the place)
      const split = splitIncome(100, MID, MID, 2);
      expect(split.king).toBe(10);
      expect(split.admin).toBe(60);
      expect(split.others).toBe(30);
    });

    it('should give the administrator 90% when there are no other characters', () => {
      // 沒有其他人可分，那 30% 由行政官接手：60% + 30% = 90%（君王仍拿 10%）/
      // With nobody else to share with, the 30% goes to the administrator:
      // 60% + 30% = 90% (the king still gets his 10%)
      const split = splitIncome(100, MID, MID, 0);
      expect(split.king).toBe(10);
      expect(split.admin).toBe(90);
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
      const none = { king: 0, admin: 0, others: 0, portions: { king: 0, admin: 0, others: 0 } };
      expect(splitIncome(100, 30, null, 3)).toEqual(none);
      expect(splitIncome(100, null, null, 3)).toEqual(none);
      expect(splitIncome(0, 30, null, 3)).toEqual(none);
    });

    it('should expose the effective portions (absorption included)', () => {
      // 彈窗印的百分比是**有效**比例：君王缺席時行政官 70%；沒有其他人時他把
      // 「其他人」的 30% 也吸掉。印死 40% 會讓分成加總對不上餅，讀者以為帳目有誤。
      // The percentages the popup prints are the **effective** portions: with no
      // king the administrator is 70%; with nobody else he absorbs the others' 30%
      // too. A hard 40% would fail to sum to the pie, reading as a ledger error.
      const full = splitIncome(100, MID, MID, 2);
      expect(full.portions).toEqual({ king: 0.1, admin: 0.6, others: 0.3 });
      const noKing = splitIncome(100, null, MID, 2);
      expect(noKing.portions).toEqual({ king: 0, admin: 0.7, others: 0.3 });
      const alone = splitIncome(100, MID, MID, 0);
      expect(alone.portions).toEqual({ king: 0.1, admin: 0.9, others: 0 });
      // 沒有君王也沒有其他人：行政官獨得全部（30% + 40% + 30% = 100%）/
      // No king and no others: the administrator takes everything (30+40+30 = 100%)
      const sole = splitIncome(100, null, MID, 0);
      expect(sole.portions).toEqual({ king: 0, admin: 1, others: 0 });
      expect(sole.admin).toBe(100);
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

  describe('othersOf', () => {
    // 一個地方的駐場將領：受控勢力的君王、行政官與兩名將領，外加一名異勢力入侵者
    // 與一名無所屬的過客 / A place's residents: the controlling faction's king,
    // administrator and two leaders, plus a foreign-faction invader and a
    // factionless passer-by
    const chars = [
      { id: 'king', factionId: 'f1' },
      { id: 'admin', factionId: 'f1' },
      { id: 'own1', factionId: 'f1' },
      { id: 'own2', factionId: 'f1' },
      { id: 'invader', factionId: 'f2' },
      { id: 'loner', factionId: null },
    ];

    it('pays only the controlling faction, minus the king and the admin', () => {
      const others = othersOf(chars, 'f1', 'king', 'admin');
      expect(others.map((c) => c.id)).toEqual(['own1', 'own2']);
    });

    it('never pays a foreign-faction leader standing in the place', () => {
      const others = othersOf(chars, 'f1', 'king', 'admin');
      expect(others.some((c) => c.id === 'invader')).toBe(false);
      expect(others.some((c) => c.id === 'loner')).toBe(false);
    });

    it('an unowned place pays nobody from the others bucket', () => {
      expect(othersOf(chars, null, 'king', 'admin')).toEqual([]);
    });

    it('vacant seats exclude nobody extra', () => {
      const others = othersOf(chars, 'f1', null, null);
      expect(others.map((c) => c.id)).toEqual(['king', 'admin', 'own1', 'own2']);
    });
  });

  describe('purchaseBatch', () => {
    it('jitter 0 lands exactly on the base batch', () => {
      // 基準批量 = 30 乘 tong 倍率：tong 30 -> round(30 x 1.4167) = 43
      // Base batch = 30 x the tong multiplier: tong 30 -> round(30 x 1.4167) = 43
      expect(purchaseBatch(30, 200, 0)).toBe(43);
      expect(purchaseBatch(17.5, 200, 0)).toBe(30);
      expect(purchaseBatch(5, 200, 0)).toBe(Math.round(30 * jingIncomeMultiplier(5)));
    });

    it('gold is the hard limit', () => {
      // 買不起基準批量就買到買得起為止，絕不超過 maxBuyable /
      // Below the base batch it buys what it can afford — never past maxBuyable
      expect(purchaseBatch(30, 15, 0)).toBe(15);
      expect(purchaseBatch(30, 12, 0.5)).toBe(12);
    });

    it('the spec cap (100) and the batch minimum (10) both clamp', () => {
      // 高 tong 的基準批量超過 100 -> 夾回規格上限 /
      // A high-tong base batch exceeds 100 -> clamped to the spec cap
      expect(purchaseBatch(30, 500, 1)).toBeLessThanOrEqual(100);
      // 抖動到最低也不低於批次下限 /
      // Even jittered to the bottom, never below the batch minimum
      expect(purchaseBatch(5, 200, -1)).toBeGreaterThanOrEqual(10);
    });
  });

  describe('splitIncome invariants', () => {
    it('should never distribute more than the place earns', () => {
      // 份額是結構性的（≤ 100%），任何 jing 值都不能讓總額超過收入 /
      // The shares are structural (≤ 100%): no jing value can push the total past the income
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

    it('should never return a fractional share, even for a fractional income', () => {
      // 金幣永遠是整數：收入帶小數時（呼叫端忘了取整）每一份仍必須是整數——
      // `!hasOthers` 分支曾經吐出 9.166666666666668 /
      // Gold is always whole: with a fractional income (a caller forgot to floor) every
      // share must still be an integer — the `!hasOthers` branch once produced
      // 9.166666666666668
      const split = splitIncome(12.166666666666666, 30, 24, 0);
      expect(Number.isInteger(split.king)).toBe(true);
      expect(Number.isInteger(split.admin)).toBe(true);
      expect(Number.isInteger(split.others)).toBe(true);
    });

    it('should treat jing 0 as a real leader, not a vacant seat', () => {
      // 0 與 null 意義不同：0 是「有這個人」。jing 的**值**不影響 split——一個地方
      // 的收入只受行政官的 jing 影響（呼叫端放大整塊餅），君王與其他人的份額是
      // 變大後的餅的固定比例。
      // 0 and null differ in meaning: 0 is "a real leader". The jing **value** does not
      // affect the split — a place's income is shaped by the administrator's jing alone
      // (the caller scales the whole pie); the king's and the others' shares are flat
      // ratios of that grown pie.
      const split = splitIncome(100, 0, 0, 2);
      expect(split.king).toBe(10);
      expect(split.admin).toBe(60);
      expect(split.others).toBe(30);
    });

    it('should reward economic power with a bigger pocket — through the pie, not the split', () => {
      // 行政官的 jing 在**呼叫端**放大整塊餅（economy 的做法），split 本身對行政官
      // 不再乘倍率——在 split 裡再乘會是 ×jing²。組合起來（餅 × 倍率 → split），
      // 高 jing 的行政官仍然一定拿得更多。
      // The administrator's jing scales the **whole pie at the caller** (what economy
      // does), and the split no longer multiplies him — multiplying there too would be
      // ×jing². Composed (pie × multiplier → split), the higher-jing administrator
      // still always pockets more.
      const rich = splitIncome(100 * jingIncomeMultiplier(30), MID, 30, 2);
      const poor = splitIncome(100 * jingIncomeMultiplier(5), MID, 5, 2);
      expect(rich.admin).toBeGreaterThan(40);
      expect(poor.admin).toBeLessThan(40);
      expect(rich.admin).toBeGreaterThan(poor.admin);
    });

    it('should keep the king\u2019s share flat whatever his jing', () => {
      // 君王的 30% 是變大後的餅的**固定抽成**：他的 jing 值不影響自己的份額——
      // jing 的收入效果只有一條（行政官放大整塊餅），同一個人的 jing 作用兩次
      // （開國君王通常自己就是行政官）會是 ×jing²。
      // The king's 30% is a **flat cut** of the grown pie: his jing value does not
      // touch his own share — jing's only income effect is the administrator scaling
      // the whole pie, and the same person's jing acting twice (the founding king is
      // usually the administrator himself) would be ×jing².
      const low = splitIncome(100, 0, MID, 2);
      const high = splitIncome(100, 30, MID, 2);
      expect(low.king).toBe(10);
      expect(high.king).toBe(10);
    });

    it('should hand a strong administrator the largest share by default', () => {
      // 60% 是最大的份額，因為實際管事的是行政官（Oct 2026 由 40% 提高）/
      // 60% is the largest share because the administrator is the one actually running
      // it (raised from 40% in Oct 2026)
      const split = splitIncome(100, MID, MID, 3);
      expect(split.admin).toBeGreaterThan(split.king);
      expect(split.admin).toBeGreaterThan(split.others);
    });
  });
});
