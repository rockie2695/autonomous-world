import { describe, it, expect } from 'vitest';
import { createRng, Rng } from './rng';

describe('RNG (Random Number Generator)', () => {
  describe('createRng', () => {
    it('should create an RNG instance with a seed', () => {
      const rng = createRng('test-seed');
      expect(rng).toBeInstanceOf(Rng);
    });

    it('should create an RNG instance with initial state', () => {
      const rng1 = createRng('test-seed');
      const state = rng1.getState();
      const rng2 = createRng('test-seed', state);
      expect(rng2.getState()).toBe(state);
    });
  });

  describe('Rng.random', () => {
    it('should return a number between 0 (inclusive) and 1 (exclusive)', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 100; i++) {
        const value = rng.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should be deterministic with the same seed', () => {
      const rng1 = createRng('deterministic-seed');
      const rng2 = createRng('deterministic-seed');
      
      for (let i = 0; i < 100; i++) {
        expect(rng1.random()).toBe(rng2.random());
      }
    });

    it('should produce different sequences with different seeds', () => {
      const rng1 = createRng('seed-1');
      const rng2 = createRng('seed-2');
      
      const values1 = Array.from({ length: 10 }, () => rng1.random());
      const values2 = Array.from({ length: 10 }, () => rng2.random());
      
      expect(values1).not.toEqual(values2);
    });
  });

  describe('Rng.int', () => {
    it('should return an integer within the specified range', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 100; i++) {
        const value = rng.int(1, 10);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should return the min value when min equals max', () => {
      const rng = createRng('test-seed');
      expect(rng.int(5, 5)).toBe(5);
    });
  });

  describe('Rng.pick', () => {
    it('should return an element from the array', () => {
      const rng = createRng('test-seed');
      const array = ['a', 'b', 'c', 'd', 'e'];
      
      for (let i = 0; i < 50; i++) {
        const picked = rng.pick(array);
        expect(array).toContain(picked);
      }
    });

    it('should return undefined for an empty array', () => {
      const rng = createRng('test-seed');
      expect(rng.pick([])).toBeUndefined();
    });
  });

  describe('Rng.shuffle', () => {
    it('should return an array with the same elements', () => {
      const rng = createRng('test-seed');
      const original = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle([...original]);
      
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('should return the same array for chaining', () => {
      const rng = createRng('test-seed');
      const array = [1, 2, 3, 4, 5];
      const result = rng.shuffle(array);
      
      expect(result).toBe(array);
    });
  });

  describe('Rng.gaussian', () => {
    it('should return a value within the clamped range', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 100; i++) {
        const value = rng.gaussian(17, 5, 5, 30);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(30);
      }
    });

    it('should produce values centered around the mean', () => {
      const rng = createRng('test-seed');
      const values = Array.from({ length: 1000 }, () => rng.gaussian(17, 5, 0, 100));
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      
      // 平均值應接近 mean（在 2 個標準差內）/ Average should be close to mean (within 2 standard deviations)
      expect(average).toBeGreaterThan(15);
      expect(average).toBeLessThan(19);
    });
  });

  describe('Rng.float', () => {
    it('should return a float within the specified range', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 100; i++) {
        const value = rng.float(1.5, 3.5);
        expect(value).toBeGreaterThanOrEqual(1.5);
        expect(value).toBeLessThan(3.5);
      }
    });
  });

  describe('Rng.chance', () => {
    it('should return true with approximately the specified probability', () => {
      const rng = createRng('test-seed');
      const iterations = 1000;
      const probability = 0.5;
      
      let trueCount = 0;
      for (let i = 0; i < iterations; i++) {
        if (rng.chance(probability)) trueCount++;
      }
      
      const actualRate = trueCount / iterations;
      // 應在預期機率的 10% 以內 / Should be within 10% of expected probability
      expect(actualRate).toBeGreaterThan(0.4);
      expect(actualRate).toBeLessThan(0.6);
    });

    it('should always return false with probability 0', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(0)).toBe(false);
      }
    });

    it('should always return true with probability 1', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(1)).toBe(true);
      }
    });
  });

  describe('Rng.getState', () => {
    it('should return a string representation of the state', () => {
      const rng = createRng('test-seed');
      const state = rng.getState();
      
      expect(typeof state).toBe('string');
      expect(() => JSON.parse(state)).not.toThrow();
    });

    it('should produce the same state sequence with the same seed', () => {
      const rng1 = createRng('same-seed');
      const rng2 = createRng('same-seed');
      
      // 產生一些值以推進狀態 / Generate some values to advance state
      rng1.random();
      rng1.random();
      rng2.random();
      rng2.random();
      
      expect(rng1.getState()).toBe(rng2.getState());
    });
  });

  // `defectionBase` and `speed` are both integer columns. Both used to be fed `gaussian()`, which
  // returns a float, so their integrality was the *database's* doing rather than the code's.
  // This is the helper that makes it the code's job instead.
  describe('gaussianInt', () => {
    it('should only ever return integers', () => {
      // The whole point: a float reaching an Int column is silently accepted, so nothing
      // upstream would have complained.
      const rng = createRng('gaussian-int');
      for (let i = 0; i < 500; i++) {
        const value = rng.gaussianInt(17, 5, 5, 30);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should respect min and max exactly, never rounding past a bound', () => {
      // Rounding happens after the clamp, so a clamped value lands *on* the bound. If rounding
      // came first, an already-clamped 30 could become 30 but a 29.6 could round up to a value
      // above the range in other configurations.
      const rng = createRng('bounds');
      for (let i = 0; i < 500; i++) {
        const value = rng.gaussianInt(1000, 500, 5, 30);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(30);
      }
    });

    it('should be exactly gaussian() rounded, so the shape is unchanged', () => {
      // Same seed, same draw: the integer version must be the float version rounded, not a
      // different sample. Otherwise changing defectionBase to an integer would silently re-roll
      // every world generated from a given seed.
      const a = createRng('shape');
      const b = createRng('shape');
      for (let i = 0; i < 200; i++) {
        expect(a.gaussianInt(17, 5, 5, 30)).toBe(
          Math.round(b.gaussian(17, 5, 5, 30))
        );
      }
    });

    it('should be deterministic for a seed', () => {
      const first = Array.from({ length: 10 }, () =>
        createRng('det').gaussianInt(17, 5, 5, 30)
      );
      const again = Array.from({ length: 10 }, () =>
        createRng('det').gaussianInt(17, 5, 5, 30)
      );
      expect(again).toEqual(first);
    });

    it('should still centre near the mean', () => {
      const rng = createRng('centre');
      let total = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) total += rng.gaussianInt(17, 5, 5, 30);
      expect(total / n).toBeGreaterThan(16);
      expect(total / n).toBeLessThan(18);
    });
  });
});
