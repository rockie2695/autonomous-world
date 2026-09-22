import { describe, it, expect } from 'vitest';
import { CONFIG, getConfig, type ConfigKey } from './gameConfig';

describe('Game Configuration', () => {
  describe('CONFIG object', () => {
    it('should have all required configuration keys', () => {
      // 地點 / Places
      expect(CONFIG).toHaveProperty('PLACE_INITIAL_COUNT');
      expect(CONFIG).toHaveProperty('PLACE_MAX_COUNT');
      expect(CONFIG).toHaveProperty('PLACE_NEW_PER_ROUND');
      expect(CONFIG).toHaveProperty('PLACE_INITIAL_FORTRESS');
      expect(CONFIG).toHaveProperty('PLACE_INITIAL_MARKET');
      expect(CONFIG).toHaveProperty('PLACE_INITIAL_BARRACKS');
      expect(CONFIG).toHaveProperty('PLACE_INITIAL_GARRISON');

      // 道路 / Roads
      expect(CONFIG).toHaveProperty('ROAD_MAX_PER_PLACE');

      // 角色 / Characters
      expect(CONFIG).toHaveProperty('CHAR_START_AGE');
      expect(CONFIG).toHaveProperty('CHAR_MAX_AGE_MIN');
      expect(CONFIG).toHaveProperty('CHAR_MAX_AGE_MAX');
      expect(CONFIG).toHaveProperty('CHAR_ABILITY_MIN');
      expect(CONFIG).toHaveProperty('CHAR_ABILITY_MAX');
      expect(CONFIG).toHaveProperty('CHAR_SPEED_MIN');
      expect(CONFIG).toHaveProperty('CHAR_SPEED_MAX');
      expect(CONFIG).toHaveProperty('CHAR_AMBITION_MIN');
      expect(CONFIG).toHaveProperty('CHAR_AMBITION_MAX');

      // 經濟 / Economy
      expect(CONFIG).toHaveProperty('PLACE_BASE_INCOME');
      expect(CONFIG).toHaveProperty('INCOME_KING_SHARE');
      expect(CONFIG).toHaveProperty('INCOME_ADMIN_SHARE');
      expect(CONFIG).toHaveProperty('INCOME_OTHER_SHARE');

      // 戰鬥 / Battle
      expect(CONFIG).toHaveProperty('BATTLE_RANDOM_MIN');
      expect(CONFIG).toHaveProperty('BATTLE_RANDOM_MAX');

      // 號令 / Signals
      expect(CONFIG).toHaveProperty('SIGNAL_RANGE');
      expect(CONFIG).toHaveProperty('SIGNAL_DURATION');
    });

    it('should have numeric values for all numeric configs', () => {
      expect(typeof CONFIG.PLACE_INITIAL_COUNT).toBe('number');
      expect(typeof CONFIG.CHAR_START_AGE).toBe('number');
      expect(typeof CONFIG.CHAR_ABILITY_MIN).toBe('number');
      expect(typeof CONFIG.CHAR_ABILITY_MAX).toBe('number');
      expect(typeof CONFIG.PLACE_BASE_INCOME).toBe('number');
      expect(typeof CONFIG.BATTLE_RANDOM_MIN).toBe('number');
    });

    it('should have valid value ranges', () => {
      // 屬性範圍 / Ability ranges
      expect(CONFIG.CHAR_ABILITY_MIN).toBeLessThan(CONFIG.CHAR_ABILITY_MAX);
      expect(CONFIG.CHAR_SPEED_MIN).toBeLessThan(CONFIG.CHAR_SPEED_MAX);
      expect(CONFIG.CHAR_AMBITION_MIN).toBeLessThan(CONFIG.CHAR_AMBITION_MAX);

      // 年齡範圍 / Age ranges
      expect(CONFIG.CHAR_MAX_AGE_MIN).toBeLessThan(CONFIG.CHAR_MAX_AGE_MAX);
      expect(CONFIG.CHAR_START_AGE).toBeLessThan(CONFIG.CHAR_MAX_AGE_MIN);

      // 收入份額總和應為 1 / Income shares should sum to 1
      const totalShare = CONFIG.INCOME_KING_SHARE + CONFIG.INCOME_ADMIN_SHARE + CONFIG.INCOME_OTHER_SHARE;
      expect(totalShare).toBeCloseTo(1.0, 2);

      // 戰鬥隨機範圍 / Battle random range
      expect(CONFIG.BATTLE_RANDOM_MIN).toBeLessThan(CONFIG.BATTLE_RANDOM_MAX);
      expect(CONFIG.BATTLE_RANDOM_MIN).toBeGreaterThan(0);
      expect(CONFIG.BATTLE_RANDOM_MAX).toBeLessThanOrEqual(2);
    });

    it('should have valid probability values (0-1)', () => {
      const probabilityKeys: ConfigKey[] = [
        'CHAR_SPAWN_RATE_START',
        'CHAR_SPAWN_RATE_END',
        'SPEED_ESCAPE_BASE',
        'SPEED_ESCAPE_MIN',
        'SPEED_ESCAPE_MAX',
        'FRIEND_FORM_CHANCE',
        'DISCONTENT_FORM_CHANCE',
        'CHAR_FATIGUE_PER_WIN',
      ];

      for (const key of probabilityKeys) {
        const value = CONFIG[key];
        if (typeof value === 'number') {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('getConfig', () => {
    it('should return the correct value for a valid key', () => {
      expect(getConfig('PLACE_INITIAL_COUNT')).toBe(100);
      expect(getConfig('CHAR_START_AGE')).toBe(20);
      expect(getConfig('PLACE_BASE_INCOME')).toBe(10);
    });

    it('should return the same value as accessing CONFIG directly', () => {
      expect(getConfig('PLACE_INITIAL_COUNT')).toBe(CONFIG.PLACE_INITIAL_COUNT);
      expect(getConfig('CHAR_START_AGE')).toBe(CONFIG.CHAR_START_AGE);
    });

    it('should be type-safe', () => {
      // 此處應可無錯誤編譯 / This should compile without errors
      const value: ConfigKey = 'PLACE_INITIAL_COUNT';
      expect(getConfig(value)).toBe(100);
    });
  });

  describe('Configuration consistency', () => {
    it('should have ROAD_MAX_PER_PLACE >= ROAD_NEW_PER_PLACE_MAX', () => {
      expect(CONFIG.ROAD_MAX_PER_PLACE).toBeGreaterThanOrEqual(CONFIG.ROAD_NEW_PER_PLACE_MAX);
    });

    it('should have CHAR_TROOP_CAP_BASE > 0', () => {
      expect(CONFIG.CHAR_TROOP_CAP_BASE).toBeGreaterThan(0);
    });

    it('should have positive building costs', () => {
      expect(CONFIG.BUILDING_UPGRADE_COST_BASE).toBeGreaterThan(0);
      expect(CONFIG.BUILDING_UPGRADE_COST_MULT).toBeGreaterThan(1);
    });

    it('should have valid escape probability formula constants', () => {
      // base + diff * per_diff 應保持在 min/max 之內 / Base + diff * per_diff should stay within min/max
      expect(CONFIG.SPEED_ESCAPE_BASE).toBeGreaterThanOrEqual(CONFIG.SPEED_ESCAPE_MIN);
      expect(CONFIG.SPEED_ESCAPE_BASE).toBeLessThanOrEqual(CONFIG.SPEED_ESCAPE_MAX);
    });
  });
});
