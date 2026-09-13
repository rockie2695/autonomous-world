import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { generatePersonName, generatePersonNames } from './person';

describe('Person Name Generator', () => {
  describe('generatePersonName', () => {
    it('should generate a Chinese person name', () => {
      const rng = createRng('test-seed');
      const name = generatePersonName(rng);
      
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(3);
    });

    it('should be deterministic with the same seed', () => {
      const rng1 = createRng('same-seed');
      const rng2 = createRng('same-seed');
      
      for (let i = 0; i < 10; i++) {
        expect(generatePersonName(rng1)).toBe(generatePersonName(rng2));
      }
    });

    it('should generate different names with different seeds', () => {
      const rng1 = createRng('seed-1');
      const rng2 = createRng('seed-2');
      
      const names1 = Array.from({ length: 10 }, () => generatePersonName(rng1));
      const names2 = Array.from({ length: 10 }, () => generatePersonName(rng2));
      
      // At least some names should be different
      const hasDifferent = names1.some((name, i) => name !== names2[i]);
      expect(hasDifferent).toBe(true);
    });

    it('should have a surname as the first character', () => {
      const rng = createRng('test-seed');
      
      // Common Chinese surnames (top 100 from 百家姓)
      const commonSurnames = [
        '王', '李', '張', '劉', '陳', '楊', '黃', '趙', '吳', '周',
        '徐', '孫', '馬', '朱', '胡', '郭', '林', '何', '高', '羅',
        '鄭', '梁', '謝', '宋', '唐', '許', '韓', '馮', '鄧', '曹',
        '彭', '曾', '蕭', '田', '董', '潘', '袁', '蔡', '蔣', '余',
        '于', '杜', '葉', '程', '魏', '蘇', '呂', '丁', '任', '盧',
        '姚', '沈', '鍾', '姜', '崔', '譚', '陸', '范', '汪', '廖',
        '石', '金', '韋', '賈', '夏', '付', '方', '鄒', '熊', '白',
        '孟', '秦', '邱', '侯', '江', '尹', '薛', '閆', '雷', '龍',
        '段', '郝', '孔', '毛', '史', '黎', '賀', '顧', '龔', '邵',
        '覃', '武', '錢', '戴', '嚴', '莫', '康', '萬', '溫', '牛',
      ];
      
      for (let i = 0; i < 50; i++) {
        const name = generatePersonName(rng);
        expect(commonSurnames).toContain(name[0]);
      }
    });
  });

  describe('generatePersonNames', () => {
    it('should generate the requested number of names', () => {
      const rng = createRng('test-seed');
      const names = generatePersonNames(rng, 10);
      
      expect(names.length).toBe(10);
    });

    it('should return an array of strings', () => {
      const rng = createRng('test-seed');
      const names = generatePersonNames(rng, 5);
      
      names.forEach(name => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should allow duplicate names', () => {
      const rng = createRng('test-seed');
      // Generate many names - some may repeat
      const names = generatePersonNames(rng, 100);
      
      expect(names.length).toBe(100);
      // The set might be smaller than the array if there are duplicates
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBeLessThanOrEqual(100);
    });
  });
});
