import { describe, expect, it } from 'vitest';
import { kingSignal } from './kingSignal';

describe('kingSignal', () => {
  it('any posture relieves a place about to fall first', () => {
    const ownMargins = [
      { placeId: 'front', margin: -10 },
      { placeId: 'core', margin: 30 },
    ];
    for (const posture of ['aggressive', 'guardian', 'merchant', 'balanced'] as const) {
      expect(
        kingSignal({
          posture,
          ownMargins,
          borderTargets: [{ placeId: 'enemy1', defence: 5 }],
          strongestAttack: 100,
        })
      ).toEqual({ intent: 'defend', targetPlaceId: 'front' });
    }
  });

  it('an aggressive king attacks the weakest border when nothing is urgent', () => {
    expect(
      kingSignal({
        posture: 'aggressive',
        ownMargins: [{ placeId: 'home', margin: 20 }],
        borderTargets: [
          { placeId: 'strong', defence: 80 },
          { placeId: 'weak', defence: 10 },
        ],
        strongestAttack: 100,
      })
    ).toEqual({ intent: 'attack', targetPlaceId: 'weak' });
  });

  it('a guardian king stands down when nothing is threatened', () => {
    expect(
      kingSignal({
        posture: 'guardian',
        ownMargins: [{ placeId: 'home', margin: 20 }],
        borderTargets: [{ placeId: 'enemy1', defence: 5 }],
        strongestAttack: 100,
      })
    ).toBeNull();
  });

  it('a merchant king stands down too — his rarity comes from the doubled cooldown', () => {
    expect(
      kingSignal({
        posture: 'merchant',
        ownMargins: [{ placeId: 'home', margin: 20 }],
        borderTargets: [{ placeId: 'enemy1', defence: 5 }],
        strongestAttack: 100,
      })
    ).toBeNull();
  });

  it('a balanced king only attacks a border someone can actually take', () => {
    const input = {
      ownMargins: [{ placeId: 'home', margin: 20 }],
      borderTargets: [{ placeId: 'enemy1', defence: 100 }],
      strongestAttack: 100,
    };
    // 最弱邊界防禦 100 > 最強將領 100 ÷ 1.2 ≈ 83 → 不開戰 /
    // Border defence 100 > strongest 100 ÷ 1.2 ≈ 83 → no call
    expect(kingSignal({ posture: 'balanced', ...input })).toBeNull();
    // 邊界防禦降到 60 → 打 /
    // Border defence drops to 60 → attack
    expect(
      kingSignal({
        posture: 'balanced',
        ownMargins: input.ownMargins,
        borderTargets: [{ placeId: 'enemy1', defence: 60 }],
        strongestAttack: 100,
      })
    ).toEqual({ intent: 'attack', targetPlaceId: 'enemy1' });
  });

  it('no border and nothing urgent means no call', () => {
    expect(
      kingSignal({
        posture: 'aggressive',
        ownMargins: [{ placeId: 'home', margin: 20 }],
        borderTargets: [],
        strongestAttack: 100,
      })
    ).toBeNull();
  });
});
