import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import {
  generateFactionName,
  generateFactionNames,
  generateUniqueFactionName,
} from './faction';

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
      
      // 至少應有 2 種不同長度 / Should have at least 2 different lengths
      expect(lengths.size).toBeGreaterThanOrEqual(2);
      // 所有長度應為 3-5 / All lengths should be 3-5
      lengths.forEach(len => {
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('generateUniqueFactionName', () => {
    it('should avoid names already in the taken set', () => {
      const rng = createRng('unique-faction-seed');
      const taken = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const name = generateUniqueFactionName(rng, taken);
        expect(name).not.toBeNull();
        if (name !== null) {
          expect(taken.has(name)).toBe(false);
          taken.add(name);
        }
      }
      expect(taken.size).toBe(100);
    });

    it('should be deterministic with the same seed', () => {
      const taken = new Set<string>(['蒼龍盟', '金鳳閣']);
      const rng1 = createRng('same-unique-seed');
      const rng2 = createRng('same-unique-seed');

      for (let i = 0; i < 20; i++) {
        expect(generateUniqueFactionName(rng1, taken)).toBe(
          generateUniqueFactionName(rng2, taken)
        );
      }
    });

    it('should fall back to the deterministic scan when the fast path is exhausted', () => {
      const seed = 'forced-scan-seed';
      // 預先產生快速路徑會抽到的 64 個名稱 / Pre-fill the 64 names the fast
      // path would draw so the call is forced into the deterministic scan
      const taken = new Set<string>();
      const probe = createRng(seed);
      for (let i = 0; i < 64; i++) {
        taken.add(generateFactionName(probe));
      }

      const name = generateUniqueFactionName(createRng(seed), taken);
      expect(name).not.toBeNull();
      if (name !== null) {
        expect(taken.has(name)).toBe(false);
        // 掃描起點來自 RNG → 同種子結果相同 / Scan start comes from the RNG,
        // so the same seed must yield the same scan result
        expect(generateUniqueFactionName(createRng(seed), taken)).toBe(name);
      }
    });
  });

  describe('generateFactionNames', () => {
    it('should generate unique names', () => {
      const rng = createRng('test-seed');
      const names = generateFactionNames(rng, 15);
      
      expect(names.length).toBe(15);
      // 所有名稱應唯一 / All names should be unique
      expect(new Set(names).size).toBe(names.length);
    });

    it('should generate the requested number of names', () => {
      const rng = createRng('test-seed');
      const names = generateFactionNames(rng, 10);
      
      expect(names.length).toBe(10);
    });

    it('should handle large requests gracefully', () => {
      const rng = createRng('test-seed');
      // 請求合理的數量 / Request a reasonable number
      const names = generateFactionNames(rng, 50);
      
      expect(names.length).toBeGreaterThan(0);
      expect(names.length).toBeLessThanOrEqual(50);
    });
  });
});
