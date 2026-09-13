import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { generateFactionName, generateFactionNames } from './faction';

describe('Faction Name Generator', () => {
  describe('generateFactionName', () => {
    it('should generate a Chinese faction name', () => {
      const rng = createRng('test-seed');
      const name = generateFactionName(rng);
      
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(5);
    });

    it('should be deterministic with the same seed', () => {
      const rng1 = createRng('same-seed');
      const rng2 = createRng('same-seed');
      
      for (let i = 0; i < 10; i++) {
        expect(generateFactionName(rng1)).toBe(generateFactionName(rng2));
      }
    });

    it('should generate different names with different seeds', () => {
      const rng1 = createRng('seed-1');
      const rng2 = createRng('seed-2');
      
      const names1 = Array.from({ length: 10 }, () => generateFactionName(rng1));
      const names2 = Array.from({ length: 10 }, () => generateFactionName(rng2));
      
      const hasDifferent = names1.some((name, i) => name !== names2[i]);
      expect(hasDifferent).toBe(true);
    });

    it('should have an organization suffix', () => {
      const rng = createRng('test-seed');
      const suffixes = ['盟', '閣', '營', '幫', '會', '宗', '門', '教', '國', '朝', '軍', '團', '社', '堂', '殿'];
      
      for (let i = 0; i < 50; i++) {
        const name = generateFactionName(rng);
        const hasValidSuffix = suffixes.some(suffix => name.endsWith(suffix));
        expect(hasValidSuffix).toBe(true);
      }
    });

    it('should generate 3-5 character names', () => {
      const rng = createRng('test-seed');
      const lengths = new Set<number>();
      
      for (let i = 0; i < 100; i++) {
        const name = generateFactionName(rng);
        lengths.add(name.length);
      }
      
      // Should have at least 2 different lengths
      expect(lengths.size).toBeGreaterThanOrEqual(2);
      // All lengths should be 3-5
      lengths.forEach(len => {
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('generateFactionNames', () => {
    it('should generate unique names', () => {
      const rng = createRng('test-seed');
      const names = generateFactionNames(rng, 15);
      
      expect(names.length).toBe(15);
      // All names should be unique
      expect(new Set(names).size).toBe(names.length);
    });

    it('should generate the requested number of names', () => {
      const rng = createRng('test-seed');
      const names = generateFactionNames(rng, 10);
      
      expect(names.length).toBe(10);
    });

    it('should handle large requests gracefully', () => {
      const rng = createRng('test-seed');
      // Request a reasonable number
      const names = generateFactionNames(rng, 50);
      
      expect(names.length).toBeGreaterThan(0);
      expect(names.length).toBeLessThanOrEqual(50);
    });
  });
});
