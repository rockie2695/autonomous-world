import { describe, it, expect } from 'vitest';
import {
  deriveAvatarTraits,
  avatarCues,
  type AvatarCharacter,
  type AbilityTier,
} from './LeaderAvatar';

/** 一位沒有特殊資料的普通將領 / An ordinary leader with no special data */
function leader(overrides: Partial<AvatarCharacter> = {}): AvatarCharacter {
  return {
    id: 'char-abc',
    wu: 12,
    tong: 12,
    jing: 12,
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

  it('should crown the king while still reporting martial ability honestly', () => {
    for (let i = 0; i < 20; i++) {
      const traits = deriveAvatarTraits(leader({ id: `k-${i}`, isKing: true, wu: 30 }));
      expect(traits.crown).toBe(true);
      // 君王不戴頭盔（否則王冠會被蓋掉），但那是**渲染層**的判斷：純函式如實
      // 回報數值，否則這裡就測不到分級本身。
      // A king never wears a helmet over the crown, but that is a *renderer*
      // decision — the pure function reports the number honestly so the banding
      // itself stays testable.
      expect(traits.wuTier).toBe('high');
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

  it('should band martial ability into three tiers', () => {
    for (let i = 0; i < 30; i++) {
      const id = `m-${i}`;
      expect(deriveAvatarTraits(leader({ id, wu: 30 })).wuTier).toBe('high');
      expect(deriveAvatarTraits(leader({ id, wu: 20 })).wuTier).toBe('mid');
      expect(deriveAvatarTraits(leader({ id, wu: 10 })).wuTier).toBe('low');
    }
  });

  it('should place the tier boundaries inclusively', () => {
    // 25 / 18 都要落在「較高」那一側，否則 24 與 25 會看起來一樣 /
    // Both 25 and 18 must fall on the higher side, or 24 and 25 would look alike
    expect(deriveAvatarTraits(leader({ wu: 25 })).wuTier).toBe('high');
    expect(deriveAvatarTraits(leader({ wu: 24 })).wuTier).toBe('mid');
    expect(deriveAvatarTraits(leader({ wu: 18 })).wuTier).toBe('mid');
    expect(deriveAvatarTraits(leader({ wu: 17 })).wuTier).toBe('low');
  });

  it('should give every leader a cue for all three abilities — never a blank', () => {
    // 這正是三段式的目的：舊版只有 high 有配件，約八成的將領身上讀不出任何
    // 能力差異，看起來都一樣。
    // This is the whole point of the three bands: the old rule rewarded only
    // `high`, so ~80% of leaders carried no ability signal and looked alike.
    for (let i = 0; i < 60; i++) {
      const traits = deriveAvatarTraits(leader({ id: `weak-${i}`, wu: 10, tong: 10, jing: 10 }));
      expect(traits.wuTier).toBe('low');
      expect(traits.tongTier).toBe('low');
      expect(traits.jingTier).toBe('low');
    }
  });

  it('should band leadership into three tiers', () => {
    for (let i = 0; i < 30; i++) {
      const id = `t-${i}`;
      expect(deriveAvatarTraits(leader({ id, tong: 30 })).tongTier).toBe('high');
      expect(deriveAvatarTraits(leader({ id, tong: 20 })).tongTier).toBe('mid');
      expect(deriveAvatarTraits(leader({ id, tong: 10 })).tongTier).toBe('low');
    }
  });

  it('should band economy into three tiers', () => {
    for (let i = 0; i < 30; i++) {
      const id = `e-${i}`;
      expect(deriveAvatarTraits(leader({ id, jing: 30 })).jingTier).toBe('high');
      expect(deriveAvatarTraits(leader({ id, jing: 20 })).jingTier).toBe('mid');
      expect(deriveAvatarTraits(leader({ id, jing: 10 })).jingTier).toBe('low');
    }
  });

  it('should sharpen the brows for high ambition', () => {
    for (let i = 0; i < 30; i++) {
      const id = `a-${i}`;
      expect(deriveAvatarTraits(leader({ id, ambition: 25 })).sharpBrow).toBe(true);
      expect(deriveAvatarTraits(leader({ id, ambition: 8 })).sharpBrow).toBe(false);
    }
  });

  it('should keep the three abilities independent', () => {
    // 富而不武、勇而無謀，都是合理的；三項不能被摺疊成 wu /
    // Being rich without being a warrior, or brave without being shrewd, are
    // both legitimate — the three must not collapse into wu
    for (let i = 0; i < 30; i++) {
      const id = `x-${i}`;
      const richWarrior = deriveAvatarTraits(leader({ id, wu: 30, jing: 30, tong: 10 }));
      expect(richWarrior.wuTier).toBe('high');
      expect(richWarrior.jingTier).toBe('high');
      expect(richWarrior.tongTier).toBe('low');

      const poorGeneral = deriveAvatarTraits(leader({ id, wu: 10, jing: 10, tong: 30 }));
      expect(poorGeneral.wuTier).toBe('low');
      expect(poorGeneral.jingTier).toBe('low');
      expect(poorGeneral.tongTier).toBe('high');
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
      expect(traits.wuTier).toBeTruthy();
      expect(traits.tongTier).toBeTruthy();
      expect(traits.jingTier).toBeTruthy();
      expect(typeof traits.scarRight).toBe('boolean');
    }
  });
});

describe('avatarCues', () => {
  it('should always return exactly three rows, in wu / tong / jing order', () => {
    // 提示只有三列，順序固定；少一列代表某個能力沒有被渲染 /
    // The tooltip is exactly three rows in a fixed order; a missing row means
    // one ability never got a cue
    for (let i = 0; i < 20; i++) {
      const rows = avatarCues(deriveAvatarTraits(leader({ id: `c-${i}` })));
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.stat)).toEqual(['wu', 'tong', 'jing']);
    }
  });

  it('should report the same tiers the traits carry', () => {
    // 提示只是把特徵換成文字，數值不可被改寫 /
    // The tooltip only rewords the traits; it must never alter the values
    const traits = deriveAvatarTraits(leader({ wu: 28, tong: 12, jing: 20 }));
    const rows = avatarCues(traits);
    expect(rows[0]?.tier).toBe(traits.wuTier);
    expect(rows[1]?.tier).toBe(traits.tongTier);
    expect(rows[2]?.tier).toBe(traits.jingTier);
    expect(rows[0]?.tier).toBe<AbilityTier>('high');
    expect(rows[1]?.tier).toBe<AbilityTier>('low');
    expect(rows[2]?.tier).toBe<AbilityTier>('mid');
  });

  it('should never emit a tier outside the three bands', () => {
    // 每個 tier 都必須對應到一個 i18n 鍵；漏掉的話提示會顯示原始的 key /
    // Every tier must map to a real i18n key, or the tooltip shows a raw key
    const bands: AbilityTier[] = ['high', 'mid', 'low'];
    for (const wu of [5, 17, 18, 24, 25, 30]) {
      for (const tong of [5, 18, 30]) {
        for (const jing of [5, 18, 30]) {
          const rows = avatarCues(deriveAvatarTraits(leader({ wu, tong, jing })));
          for (const row of rows) expect(bands).toContain(row.tier);
        }
      }
    }
  });
});