import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { generatePlaceName, generatePlaceNames } from './place';

describe('Place Name Generator', () => {
  describe('generatePlaceName', () => {
    it('should generate a Chinese place name', () => {
      const rng = createRng('test-seed');
      const name = generatePlaceName(rng);
      
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThanOrEqual(2);
    });

    it('should be deterministic with the same seed', () => {
      const rng1 = createRng('same-seed');
      const rng2 = createRng('same-seed');
      
      for (let i = 0; i < 10; i++) {
        expect(generatePlaceName(rng1)).toBe(generatePlaceName(rng2));
      }
    });

    it('should generate different names with different seeds', () => {
      const rng1 = createRng('seed-1');
      const rng2 = createRng('seed-2');
      
      const names1 = Array.from({ length: 10 }, () => generatePlaceName(rng1));
      const names2 = Array.from({ length: 10 }, () => generatePlaceName(rng2));
      
      const hasDifferent = names1.some((name, i) => name !== names2[i]);
      expect(hasDifferent).toBe(true);
    });

    it('should have terrain as the last character(s)', () => {
      const rng = createRng('test-seed');
      const terrains = [
        '城', '鎮', '村', '關', '堡', '港', '寨', '峰', '谷', '原',
        '山', '水', '河', '湖', '海', '島', '林', '森', '沙漠', '原野',
        '隘口', '峽谷', '平原', '丘陵', '盆地', '沼澤', '綠洲', '邊塞',
        '要塞', '哨站', '驛站', '市集', '港口', '碼頭', '渡口',
      ];
      
      for (let i = 0; i < 50; i++) {
        const name = generatePlaceName(rng);
        const hasTerrainSuffix = terrains.some(terrain => name.endsWith(terrain));
        expect(hasTerrainSuffix).toBe(true);
      }
    });
  });

  describe('generatePlaceNames', () => {
    it('should generate unique names', () => {
      const rng = createRng('test-seed');
      const names = generatePlaceNames(rng, 20);
      
      expect(names.length).toBe(20);
      // 所有名稱應唯一 / All names should be unique
      expect(new Set(names).size).toBe(names.length);
    });

    it('should generate the requested number of names', () => {
      const rng = createRng('test-seed');
      const names = generatePlaceNames(rng, 15);
      
      expect(names.length).toBe(15);
    });

    it('should handle large requests gracefully', () => {
      const rng = createRng('test-seed');
      // 請求超過可能的唯一組合 / Request more than possible unique combinations
      const names = generatePlaceNames(rng, 100);
      
      // 應回傳所能產生的 / Should return what it can
      expect(names.length).toBeGreaterThan(0);
      expect(names.length).toBeLessThanOrEqual(100);
    });
  });
});
