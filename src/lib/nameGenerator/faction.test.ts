import { describe, it, expect } from 'vitest';
import { createRng } from '../rng';
import {
  generateFactionName,
  generateFactionNames,
  generateUniqueFactionName,
  generateEpithetFactionName,
} from './faction';
import { EPITHET_COUNT, epithetAt } from './epithet';

/** 傳統風格的單字組織後綴 / Single-character org suffixes of the classic style */
const CLASSIC_SUFFIXES = [
  '盟', '閣', '營', '幫', '會', '宗', '門', '教', '國', '朝', '軍', '團', '社', '堂', '殿',
];

/** 稱號風格的兩字組織類型 / Two-character org types of the epithet style */
const ORG_TYPES = [
  '議會', '軍團', '商盟', '聯邦', '王庭', '神殿',
  '教團', '城邦', '商團', '騎團', '劍盟', '血盟',
];

/** 全部合法稱號 / Every valid epithet */
const EPITHETS = new Set(
  Array.from({ length: EPITHET_COUNT }, (_, i) => epithetAt(i))
);

/** 稱號風格：[稱號][兩字組織類型] / Epithet style: [epithet][2-char org type] */
function isEpithetName(name: string): boolean {
  return ORG_TYPES.some(
    (org) => name.endsWith(org) && EPITHETS.has(name.slice(0, name.length - org.length))
  );
}

/** 傳統風格：3-5 字並以單字後綴結尾 / Classic style: 3-5 chars ending in a single-char suffix */
function isClassicName(name: string): boolean {
  return (
    name.length >= 3 &&
    name.length <= 5 &&
    CLASSIC_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

describe('Faction Name Generator', () => {
  describe('generateFactionName', () => {
    it('should generate a Chinese faction name in one of the two styles', () => {
      const rng = createRng('test-seed');

      for (let i = 0; i < 200; i++) {
        const name = generateFactionName(rng);
        expect(typeof name).toBe('string');
        expect(isClassicName(name) || isEpithetName(name)).toBe(true);
      }
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

    it('should always end with an organization marker', () => {
      const rng = createRng('test-seed');

      for (let i = 0; i < 200; i++) {
        const name = generateFactionName(rng);
        const hasMarker =
          CLASSIC_SUFFIXES.some((s) => name.endsWith(s)) ||
          ORG_TYPES.some((o) => name.endsWith(o));
        expect(hasMarker).toBe(true);
      }
    });

    it('should generate 3-5 character names', () => {
      const rng = createRng('test-seed');
      const lengths = new Set<number>();

      for (let i = 0; i < 200; i++) {
        const name = generateFactionName(rng);
        lengths.add(name.length);
      }

      // 至少應有 2 種不同長度 / Should have at least 2 different lengths
      expect(lengths.size).toBeGreaterThanOrEqual(2);
      // 所有長度應為 3-5 / All lengths should be 3-5
      lengths.forEach((len) => {
        expect(len).toBeGreaterThanOrEqual(3);
        expect(len).toBeLessThanOrEqual(5);
      });
    });

    it('should mix both classic and epithet styles', () => {
      const rng = createRng('mixed-style-seed');
      const names = Array.from({ length: 300 }, () => generateFactionName(rng));

      // 每個稱號風格輸出必然是合法稱號名；非稱號名即為傳統風格
      // Every epithet-style output is a valid epithet name; anything else is classic
      const epithets = names.filter((n) => isEpithetName(n));
      const classics = names.filter((n) => !isEpithetName(n));

      expect(epithets.length).toBeGreaterThan(0);
      expect(classics.length).toBeGreaterThan(0);
      // 兩種風格都在合理比例內 / Both styles appear in a sane proportion
      expect(epithets.length / names.length).toBeGreaterThan(0.15);
      expect(epithets.length / names.length).toBeLessThan(0.6);
    });
  });

  describe('generateEpithetFactionName', () => {
    it('should always produce [epithet][org type] names', () => {
      const rng = createRng('epithet-seed');

      for (let i = 0; i < 200; i++) {
        const name = generateEpithetFactionName(rng);
        expect(name.length).toBe(4);
        expect(isEpithetName(name)).toBe(true);
      }
    });

    it('should be deterministic with the same seed', () => {
      const rng1 = createRng('same-epithet-seed');
      const rng2 = createRng('same-epithet-seed');

      for (let i = 0; i < 10; i++) {
        expect(generateEpithetFactionName(rng1)).toBe(
          generateEpithetFactionName(rng2)
        );
      }
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
      const taken = new Set<string>(['蒼龍盟', '金鳳閣', '霜脊議會']);
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
