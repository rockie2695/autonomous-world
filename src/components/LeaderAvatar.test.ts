import { describe, it, expect } from 'vitest';
import { deriveAvatarTraits, type AvatarCharacter } from './LeaderAvatar';

/** 一位沒有特殊資料的普通將領 / An ordinary leader with no special data */
function leader(overrides: Partial<AvatarCharacter> = {}): AvatarCharacter {
  return {
    id: 'char-abc',
    wu: 12,
    ambition: 10,
    age: 30,
    isKing: false,
    ...overrides,
  };
}

const GREY = ['#9ca3af', '#e5e7eb'];

describe('deriveAvatarTraits', () => {
  it('should be deterministic — the same id always yields the same face', () => {
    for (let i = 0; i < 50; i++) {
      const id = `char-${i}`;
      expect(deriveAvatarTraits(leader({ id }))).toEqual(
        deriveAvatarTraits(leader({ id }))
      );
    }
  });

  it('should give different leaders different faces', () => {
    const faces = new Set(
      Array.from({ length: 40 }, (_, i) =>
        JSON.stringify(deriveAvatarTraits(leader({ id: `char-${i}` })))
      )
    );
    // 40 位將領不該長得一樣 / 40 leaders should not all look alike
    expect(faces.size).toBeGreaterThan(30);
  });

  it('should ignore game data when seeding, so overrides cannot skew the spread', () => {
    // 不同資料、同一個 id → 除了覆寫欄位以外其餘特徵相同 /
    // Same id, different stats → only the overridden traits may differ
    const young = deriveAvatarTraits(leader({ id: 'same-id', age: 25, wu: 10 }));
    const old = deriveAvatarTraits(leader({ id: 'same-id', age: 70, wu: 10 }));
    expect(old.hairStyle).toBe(young.hairStyle);
    expect(old.skin).toBe(young.skin);
    expect(old.eyeShape).toBe(young.eyeShape);
  });

  it('should crown the king', () => {
    for (let i = 0; i < 20; i++) {
      const traits = deriveAvatarTraits(leader({ id: `k-${i}`, isKing: true }));
      expect(traits.crown).toBe(true);
      // 君王不戴頭盔，否則王冠會被蓋掉 / A king never wears a helmet over the crown
      expect(traits.helmet).toBe(false);
    }
  });

  it('should never crown a non-king', () => {
    for (let i = 0; i < 30; i++) {
      expect(deriveAvatarTraits(leader({ id: `n-${i}` })).crown).toBe(false);
    }
  });

  it('should grey the hair with age', () => {
    for (let i = 0; i < 30; i++) {
      const id = `old-${i}`;
      expect(GREY).toContain(deriveAvatarTraits(leader({ id, age: 62 })).hairColor);
      expect(GREY).toContain(deriveAvatarTraits(leader({ id, age: 75 })).hairColor);
    }
  });

  it('should not force grey hair on the young', () => {
    // 髮色池 6 種中有 2 種是灰色，所以隨機仍可能抽到；年輕人應該「大多」不是灰髮 /
    // Two of the six hair colours are grey, so a random draw can still land on
    // one — what matters is that age does not force it
    const young = Array.from({ length: 60 }, (_, i) =>
      deriveAvatarTraits(leader({ id: `y-${i}`, age: 20 }))
    );
    const greyCount = young.filter((t) => GREY.includes(t.hairColor)).length;
    expect(greyCount).toBeLessThan(young.length * 0.6);
  });

  it('should equip a helmet for very high martial ability', () => {
    for (let i = 0; i < 30; i++) {
      expect(deriveAvatarTraits(leader({ id: `m-${i}`, wu: 30 })).helmet).toBe(true);
      expect(deriveAvatarTraits(leader({ id: `m-${i}`, wu: 10 })).helmet).toBe(false);
    }
  });

  it('should sharpen the brows for high ambition', () => {
    for (let i = 0; i < 30; i++) {
      const id = `a-${i}`;
      expect(deriveAvatarTraits(leader({ id, ambition: 25 })).sharpBrow).toBe(true);
      expect(deriveAvatarTraits(leader({ id, ambition: 8 })).sharpBrow).toBe(false);
    }
  });

  it('should always resolve real values, never undefined', () => {
    for (let i = 0; i < 60; i++) {
      const traits = deriveAvatarTraits(leader({ id: `v-${i}`, age: 20 + i }));
      expect(traits.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(traits.hairColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(Number.isFinite(traits.widthMul)).toBe(true);
      expect(traits.hairStyle).toBeTruthy();
      expect(traits.eyeShape).toBeTruthy();
      expect(traits.mouthShape).toBeTruthy();
      expect(traits.facialHair).toBeTruthy();
    }
  });
});