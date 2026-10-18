// ============================================================================
// 地方效果測試 / Place effect tests
// ----------------------------------------------------------------------------
// 這個模組存在的唯一理由，是讓地方彈窗顯示的數字**不可能**和模擬實際使用的數字不同。
// 所以測試鎖的是「規則本身」，而不是某個常數：升級費用是 2 的等比級數、堡壘防禦隨等級
// 線性成長、收入與徵兵都由基礎值加上等級加成。
//
// The module exists so the place popup cannot quote a number the simulation does not use, so
// these tests pin the *rules* rather than the constants: upgrade cost is exponential in the
// level, fortress defence grows linearly, and income and recruits are base plus per-level.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  BUILDING_MAX_LEVEL,
  buildingPerLevel,
  buildingTotal,
  fortressDefenceMult,
  nextUpgradeGain,
  placeIncome,
  placeRecruits,
  placeEffectLabel,
  upgradeCost,
} from './placeEffects';
import { CONFIG } from './gameConfig';

describe('placeEffects', () => {
  it('should print the place total output, not the building own contribution', () => {
    // 讀者回報的錯誤：地點面板的行內摘要在市場 1 級印「+5 金錢」，但同一個元件展開的
    // 等級表印「15 金錢 / 每回合」。兩個都是真的，兩個都不是對方 —— 而且讀者會以為
    // 0 級等於零收入，其實地方照樣有基礎收入。
    //
    // The bug the reader reported: the place panel's row printed "+5 gold" at market level 1
    // while the expanded level table in the same component printed "15 gold / round". Both
    // are true, neither matches the other, and it makes level 0 look like zero income when
    // the place still earns its base income.
    expect(placeEffectLabel('market', 1)).toEqual({
      value: CONFIG.PLACE_BASE_INCOME + CONFIG.PLACE_MARKET_INCOME_PER_LV,
      unit: 'gold',
    });
    expect(placeEffectLabel('barracks', 1)).toEqual({
      value: CONFIG.PLACE_BASE_RECRUIT + CONFIG.PLACE_BARRACKS_RECRUIT_PER_LV,
      unit: 'troops',
    });
    // 15 而不是一个看似合理的 5：等级 1 的市场值 PLACE_BASE_INCOME + 一级的加成 /
    // 15, not a plausible-looking 5: level 1 is the base income plus one level's bonus
    expect(placeEffectLabel('market', 1).value).toBe(15);
    expect(placeEffectLabel('barracks', 1).value).toBe(5);

    // 0 级也要印真实的基础产出，不能印 0 /
    // Level 0 prints the real base output too, never 0
    expect(placeEffectLabel('market', 0).value).toBe(CONFIG.PLACE_BASE_INCOME);
    expect(placeEffectLabel('barracks', 0).value).toBe(CONFIG.PLACE_BASE_RECRUIT);

    // 与 placeIncome / placeRecruits 必须一致：这两个是模拟真正使用的数字 /
    // Must agree with placeIncome / placeRecruits: those are the numbers the simulation uses
    for (const lvl of [0, 1, 3, BUILDING_MAX_LEVEL]) {
      expect(placeEffectLabel('market', lvl).value).toBe(placeIncome(lvl));
      expect(placeEffectLabel('barracks', lvl).value).toBe(placeRecruits(lvl));
    }
  });

  it('should keep the cumulative percentage for the fortress, which has no total', () => {
    // 堡壘的防禦是乘在守軍上的倍率，不是產出，所以沒有「總共產出多少」可印 /
    // Fortress defence is a multiplier on the garrison, not an output, so there is no total
    expect(placeEffectLabel('fortress', 1)).toEqual({
      value: buildingTotal('fortress', 1),
      unit: 'percent',
    });
    expect(placeEffectLabel('fortress', 0)).toEqual({ value: 0, unit: 'percent' });
  });
  describe('upgradeCost', () => {
    it('should be BASE x MULT^level, so each level costs twice the last', () => {
      for (let level = 0; level < BUILDING_MAX_LEVEL; level++) {
        expect(upgradeCost(level)).toBe(
          CONFIG.BUILDING_UPGRADE_COST_BASE * Math.pow(CONFIG.BUILDING_UPGRADE_COST_MULT, level)
        );
      }
      // The exponential is the point: 100, 200, 400, 800, 1600
      expect(upgradeCost(0) * 2).toBe(upgradeCost(1));
      expect(upgradeCost(1) * 2).toBe(upgradeCost(2));
    });

    it('should be affordable at level 0 and steep by the top', () => {
      expect(upgradeCost(0)).toBe(CONFIG.BUILDING_UPGRADE_COST_BASE);
      expect(upgradeCost(BUILDING_MAX_LEVEL - 1)).toBeGreaterThan(upgradeCost(0));
    });
  });

  describe('per-level effects', () => {
    it('should give fortress a defence percentage, market gold, barracks recruits', () => {
      // Each building's effect is a different unit, so the unit travels with the value —
      // a bare number would make the popup guess.
      expect(buildingPerLevel('fortress').unit).toBe('percent');
      expect(buildingPerLevel('market').unit).toBe('gold');
      expect(buildingPerLevel('barracks').unit).toBe('troops');
    });

    it('should accumulate linearly with level', () => {
      for (const kind of ['fortress', 'market', 'barracks'] as const) {
        const per = buildingPerLevel(kind).value;
        expect(buildingTotal(kind, 0)).toBe(0);
        for (let level = 0; level <= BUILDING_MAX_LEVEL; level++) {
          expect(buildingTotal(kind, level)).toBe(per * level);
        }
      }
    });
  });

  describe('placeIncome', () => {
    it('should be base plus market levels', () => {
      expect(placeIncome(0)).toBe(CONFIG.PLACE_BASE_INCOME);
      expect(placeIncome(3)).toBe(
        CONFIG.PLACE_BASE_INCOME + 3 * CONFIG.PLACE_MARKET_INCOME_PER_LV
      );
    });

    it('should grow strictly with market level', () => {
      for (let market = 0; market < BUILDING_MAX_LEVEL; market++) {
        expect(placeIncome(market + 1)).toBeGreaterThan(placeIncome(market));
      }
    });
  });

  describe('placeRecruits', () => {
    it('should be base plus barracks levels', () => {
      expect(placeRecruits(0)).toBe(CONFIG.PLACE_BASE_RECRUIT);
      expect(placeRecruits(2)).toBe(
        CONFIG.PLACE_BASE_RECRUIT + 2 * CONFIG.PLACE_BARRACKS_RECRUIT_PER_LV
      );
    });
  });

  describe('fortressDefenceMult', () => {
    it('should be 1 with no fortress and grow with level', () => {
      // Level 0 must be exactly neutral, or every place would silently gain defence.
      expect(fortressDefenceMult(0)).toBe(1);
      expect(fortressDefenceMult(1)).toBeGreaterThan(1);
      expect(fortressDefenceMult(5)).toBeGreaterThan(fortressDefenceMult(4));
    });

    it('should match the documented formula', () => {
      for (let level = 0; level <= BUILDING_MAX_LEVEL; level++) {
        expect(fortressDefenceMult(level)).toBe(
          1 + (level * CONFIG.BATTLE_FORTRESS_DEF_MULT)
        );
      }
    });
  });

  describe('nextUpgradeGain', () => {
    it('should report one level of gain below the cap and null at it', () => {
      expect(nextUpgradeGain('market', 0)).toBe(buildingPerLevel('market').value);
      expect(nextUpgradeGain('fortress', BUILDING_MAX_LEVEL - 1)).toBe(
        buildingPerLevel('fortress').value
      );
      // At the cap there is nothing to gain, which the popup renders as "already maxed"
      expect(nextUpgradeGain('fortress', BUILDING_MAX_LEVEL)).toBeNull();
      expect(nextUpgradeGain('barracks', BUILDING_MAX_LEVEL)).toBeNull();
    });
  });
});