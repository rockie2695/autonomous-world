import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { CONFIG } from '../gameConfig';
import {
  generatePlaceName,
  generatePlaceNames,
  generateUniquePlaceName,
  PLACE_ADJECTIVES,
  PLACE_TERRAINS,
  PLACE_NAME_CAPACITY,
} from './place';

describe('Place Name Generator', () => {
  describe('name pools', () => {
    it('should have deduplicated adjective and terrain pools', () => {
      expect(new Set(PLACE_ADJECTIVES).size).toBe(PLACE_ADJECTIVES.length);
      expect(new Set(PLACE_TERRAINS).size).toBe(PLACE_TERRAINS.length);
    });

    it('should have single-character adjectives (name decomposes uniquely)', () => {
      for (const adj of PLACE_ADJECTIVES) {
        expect(adj.length).toBe(1);
      }
    });

    it('should decompose every name as [adj1][adj2][terrain]', () => {
      const rng = createRng('decompose-seed');

      for (let i = 0; i < 100; i++) {
        const name = generatePlaceName(rng);
        expect(name.length).toBeGreaterThanOrEqual(3);
        expect(PLACE_ADJECTIVES).toContain(name[0]);
        expect(PLACE_ADJECTIVES).toContain(name[1]);
        expect(PLACE_TERRAINS).toContain(name.slice(2));
      }
    });

    it('should never repeat the same adjective (adj1 !== adj2)', () => {
      const rng = createRng('no-dup-adj-seed');

      for (let i = 0; i < 500; i++) {
        const name = generatePlaceName(rng);
        expect(name[0]).not.toBe(name[1]);
      }

      // 產生的批次名稱也必須不重複形容詞 / Batch names too
      const names = generatePlaceNames(createRng('batch-no-dup'), 500);
      for (const name of names) {
        expect(name[0]).not.toBe(name[1]);
      }
    });

    it('should have enough capacity for PLACE_MAX_COUNT', () => {
      expect(PLACE_NAME_CAPACITY).toBeGreaterThanOrEqual(
        CONFIG.PLACE_MAX_COUNT
      );
    });
  });

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

      for (let i = 0; i < 50; i++) {
        const name = generatePlaceName(rng);
        const hasTerrainSuffix = PLACE_TERRAINS.some((terrain) =>
          name.endsWith(terrain)
        );
        expect(hasTerrainSuffix).toBe(true);
      }
    });
  });

  describe('generateUniquePlaceName', () => {
    it('should avoid names already in the taken set', () => {
      const rng = createRng('unique-seed');
      const taken = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const name = generateUniquePlaceName(rng, taken);
        expect(name).not.toBeNull();
        if (name !== null) {
          expect(taken.has(name)).toBe(false);
          taken.add(name);
        }
      }
      expect(taken.size).toBe(100);
    });

    it('should return null when every combination is taken', () => {
      const rng = createRng('exhausted-seed');
      const all = generatePlaceNames(rng, PLACE_NAME_CAPACITY);
      expect(all.length).toBe(PLACE_NAME_CAPACITY);
      expect(generateUniquePlaceName(rng, new Set(all))).toBeNull();
    }, 60_000);
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

    it('should generate exactly PLACE_MAX_COUNT unique names', () => {
      const rng = createRng('max-count-seed');
      const names = generatePlaceNames(rng, CONFIG.PLACE_MAX_COUNT);

      expect(names.length).toBe(CONFIG.PLACE_MAX_COUNT);
      expect(new Set(names).size).toBe(CONFIG.PLACE_MAX_COUNT);
    });

    it('should cap at capacity for impossible requests', () => {
      const rng = createRng('test-seed');
      // 請求超過理論容量 / Request more than theoretical capacity
      const names = generatePlaceNames(rng, PLACE_NAME_CAPACITY + 500);

      // 應回報容量上限 / Should cap at capacity
      expect(names.length).toBe(PLACE_NAME_CAPACITY);
      expect(new Set(names).size).toBe(names.length);
    }, 60_000);
  });
});
