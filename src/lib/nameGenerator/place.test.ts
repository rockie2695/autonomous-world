import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import { CONFIG } from '../gameConfig';
import {
  generatePlaceName,
  generatePlaceNames,
  generateUniquePlaceName,
  generateEpithetPlaceName,
  PLACE_ADJECTIVES,
  PLACE_TERRAINS,
  PLACE_NAME_CAPACITY,
  PLACE_EPITHET_CAPACITY,
  PLACE_EPITHET_OVERLAP,
  PLACE_TOTAL_NAME_CAPACITY,
} from './place';
import { EPITHET_COUNT, epithetAt } from './epithet';

/** 全部合法稱號 / Every valid epithet */
const EPITHETS = new Set(
  Array.from({ length: EPITHET_COUNT }, (_, i) => epithetAt(i))
);

/** 傳統風格：[形容詞][形容詞][地形]（前兩字為形容詞）/ Classic: first two chars are adjectives */
function isClassicName(name: string): boolean {
  return (
    name.length >= 3 &&
    PLACE_ADJECTIVES.includes(name[0] ?? '') &&
    PLACE_ADJECTIVES.includes(name[1] ?? '')
  );
}

/** 稱號風格：[稱號][地形] / Epithet: [epithet][terrain] */
function isEpithetName(name: string): boolean {
  return PLACE_TERRAINS.some(
    (terrain) =>
      name.endsWith(terrain) &&
      EPITHETS.has(name.slice(0, name.length - terrain.length))
  );
}

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

    it('should decompose every classic name as [adj1][adj2][terrain]', () => {
      const rng = createRng('decompose-seed');
      let classics = 0;

      for (let i = 0; i < 200; i++) {
        const name = generatePlaceName(rng);
        if (isEpithetName(name) && !isClassicName(name)) continue;
        classics++;
        expect(name.length).toBeGreaterThanOrEqual(3);
        expect(PLACE_ADJECTIVES).toContain(name[0]);
        expect(PLACE_ADJECTIVES).toContain(name[1]);
        expect(PLACE_TERRAINS).toContain(name.slice(2));
      }

      expect(classics).toBeGreaterThan(0);
    });

    it('should never repeat the same adjective in classic names (adj1 !== adj2)', () => {
      const rng = createRng('no-dup-adj-seed');

      for (let i = 0; i < 500; i++) {
        const name = generatePlaceName(rng);
        if (!isClassicName(name)) continue;
        expect(name[0]).not.toBe(name[1]);
      }

      // 產生的批次名稱也必須不重複形容詞 / Batch names too
      const names = generatePlaceNames(createRng('batch-no-dup'), 500);
      for (const name of names) {
        if (!isClassicName(name)) continue;
        expect(name[0]).not.toBe(name[1]);
      }
    });

    it('should compute the total capacity as the union of both styles', () => {
      // 兩空間相加必須扣除跨風格重疊 / Summing both spaces must subtract the overlap
      expect(PLACE_EPITHET_OVERLAP).toBeGreaterThan(0);
      expect(PLACE_TOTAL_NAME_CAPACITY).toBe(
        PLACE_NAME_CAPACITY + PLACE_EPITHET_CAPACITY - PLACE_EPITHET_OVERLAP
      );
      expect(PLACE_TOTAL_NAME_CAPACITY).toBeLessThan(
        PLACE_NAME_CAPACITY + PLACE_EPITHET_CAPACITY
      );
    });

    it('should have enough capacity for PLACE_MAX_COUNT', () => {
      expect(PLACE_TOTAL_NAME_CAPACITY).toBeGreaterThanOrEqual(
        CONFIG.PLACE_MAX_COUNT
      );
    });

    it('should be able to generate the home page demo place names', () => {
      // 首頁展示的地名必須可由產生器組出，否則文案與遊戲內容會不一致
      // The demo names on the home page must be reachable, otherwise the
      // marketing copy and the actual game disagree
      const DEMO_PLACE_NAMES = [
        '灰岩高地',
        '沉星渡口',
        '裂風關',
        '黑曜要塞',
        '霧海前哨',
      ];

      for (const name of DEMO_PLACE_NAMES) {
        const chars = Array.from(name);
        const reachable = Array.from({ length: chars.length - 1 }, (_, split) => split + 1)
          .some((split) => {
            const head = chars.slice(0, split).join('');
            const tail = chars.slice(split).join('');
            return (
              Array.from(head).every((c) => PLACE_ADJECTIVES.includes(c)) &&
              PLACE_TERRAINS.includes(tail)
            );
          });
        expect(reachable).toBe(true);
      }
    });
  });

  describe('generatePlaceName', () => {
    it('should generate a Chinese place name in one of the two styles', () => {
      const rng = createRng('test-seed');

      for (let i = 0; i < 200; i++) {
        const name = generatePlaceName(rng);
        expect(typeof name).toBe('string');
        expect(isClassicName(name) || isEpithetName(name)).toBe(true);
      }
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

      for (let i = 0; i < 100; i++) {
        const name = generatePlaceName(rng);
        const hasTerrainSuffix = PLACE_TERRAINS.some((terrain) =>
          name.endsWith(terrain)
        );
        expect(hasTerrainSuffix).toBe(true);
      }
    });

    it('should mix both classic and epithet styles', () => {
      const rng = createRng('mixed-style-seed');
      const names = Array.from({ length: 400 }, () => generatePlaceName(rng));

      // 兩種風格在部分名稱上重疊，故以「非稱號名」判定傳統風格
      // The styles overlap on some names, so treat non-epithet as classic
      const epithets = names.filter((n) => isEpithetName(n));
      const classics = names.filter((n) => !isEpithetName(n));

      expect(epithets.length).toBeGreaterThan(0);
      expect(classics.length).toBeGreaterThan(0);
      expect(epithets.length / names.length).toBeGreaterThan(0.2);
      expect(epithets.length / names.length).toBeLessThan(0.5);
    });
  });

  describe('generateEpithetPlaceName', () => {
    it('should always produce [epithet][terrain] names', () => {
      const rng = createRng('epithet-seed');

      for (let i = 0; i < 200; i++) {
        const name = generateEpithetPlaceName(rng);
        expect(name.length).toBeGreaterThanOrEqual(3);
        expect(isEpithetName(name)).toBe(true);
      }
    });

    it('should be deterministic with the same seed', () => {
      const rng1 = createRng('same-epithet-seed');
      const rng2 = createRng('same-epithet-seed');

      for (let i = 0; i < 10; i++) {
        expect(generateEpithetPlaceName(rng1)).toBe(
          generateEpithetPlaceName(rng2)
        );
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

    it('should fall back to the deterministic scan when the fast path is exhausted', () => {
      const seed = 'forced-scan-seed';
      // 預先產生快速路徑會抽到的 64 個名稱 / Pre-fill the 64 names the fast
      // path would draw so the call is forced into the deterministic scan
      const taken = new Set<string>();
      const probe = createRng(seed);
      for (let i = 0; i < 64; i++) {
        taken.add(generatePlaceName(probe));
      }

      const name = generateUniquePlaceName(createRng(seed), taken);
      expect(name).not.toBeNull();
      if (name !== null) {
        expect(taken.has(name)).toBe(false);
        // 掃描起點來自 RNG → 同種子結果相同 / Scan start comes from the RNG,
        // so the same seed must yield the same scan result
        expect(generateUniquePlaceName(createRng(seed), taken)).toBe(name);
      }
    });

    it('should return null when every combination is taken', () => {
      const rng = createRng('exhausted-seed');
      const all = generatePlaceNames(rng, PLACE_TOTAL_NAME_CAPACITY);
      expect(all.length).toBe(PLACE_TOTAL_NAME_CAPACITY);
      expect(generateUniquePlaceName(rng, new Set(all))).toBeNull();
      // 填滿整個並集（39 萬筆）較慢，給寬鬆 timeout
      // Filling the whole union (~390k names) is slow, so allow plenty of time
    }, 180_000);
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
      const names = generatePlaceNames(rng, PLACE_TOTAL_NAME_CAPACITY + 500);

      // 應回報容量上限 / Should cap at capacity
      expect(names.length).toBe(PLACE_TOTAL_NAME_CAPACITY);
      expect(new Set(names).size).toBe(names.length);
    }, 180_000);
  });
});
