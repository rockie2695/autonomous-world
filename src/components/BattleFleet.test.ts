import { describe, expect, it } from 'vitest';
import { battleFronts, type BattleFront } from '@/lib/battleFleet';
import { CONFIG } from '@/lib/gameConfig';

/**
 * 艦隊的初始狀態 / The fleets' initial state.
 *
 * 這裡測的是「動畫不會在重繪時跳動」這個特性：初始相位必須只由戰線的 key 決定。
 * 若混入 `Math.random()`，同一條戰線每次掛載都會換相位 —— 那正是動畫在重新
 * render 時整片跳一下的原因。
 *
 * What is under test is the property "the animation does not jump on repaint":
 * the initial phases must be determined solely by the front's key. With
 * `Math.random()` in there, the same front would reshuffle on every mount, which
 * is exactly what makes an animation visibly jump on re-render.
 */
function fronts(n: number): BattleFront[] {
  const sites = Array.from({ length: n * 2 }, (_, i) => ({
    id: `s${i}`,
    x: i * 10,
    y: 0,
    factionId: i % 2 === 0 ? 'red' : 'blue',
    garrison: 10,
  }));
  const roads = Array.from({ length: n }, (_, i) => ({ aId: `s${i * 2}`, bId: `s${i * 2 + 1}` }));
  return battleFronts(sites, roads, { red: '#f00', blue: '#00f' });
}

describe('buildFleets', () => {
  it('is deterministic for the same front lines', async () => {
    const { buildFleets } = await import('@/components/BattleFleet');
    const f = fronts(3);
    expect(buildFleets(f)).toEqual(buildFleets(f));
  });

  it('gives the same front the same phases across separate calls', async () => {
    const { buildFleets } = await import('@/components/BattleFleet');
    // Two identical front sets must produce identical fleets, not merely equal shapes
    const a = buildFleets(fronts(2));
    const b = buildFleets(fronts(2));
    expect(a.ships.map((s) => s.t)).toEqual(b.ships.map((s) => s.t));
    expect(a.ships.map((s) => s.cooldown)).toEqual(b.ships.map((s) => s.cooldown));
  });

  it('fields two opposing sides per front, pointed at each other', async () => {
    const { buildFleets } = await import('@/components/BattleFleet');
    const { ships } = buildFleets(fronts(1));
    expect(ships).toHaveLength(2 * CONFIG.BATTLE_FLEET_SHIPS_PER_SIDE);
    const red = ships.filter((s) => s.side === 0);
    const blue = ships.filter((s) => s.side === 1);
    expect(red.every((s) => s.dir === 1)).toBe(true);
    expect(blue.every((s) => s.dir === -1)).toBe(true);
  });

  it('offsets the two sides so they do not start on top of each other', async () => {
    const { buildFleets } = await import('@/components/BattleFleet');
    const { ships } = buildFleets(fronts(1));
    const first = ships.filter((s) => s.front === 0);
    const a = first.filter((s) => s.side === 0)[0];
    const b = first.filter((s) => s.side === 1)[0];
    expect(Math.abs(a.t - b.t)).toBeGreaterThan(0.05);
  });

  it('starts with no tracers in flight', async () => {
    const { buildFleets } = await import('@/components/BattleFleet');
    expect(buildFleets(fronts(4)).bolts).toEqual([]);
  });

  it('produces nothing for a world with no fronts', async () => {
    const { buildFleets } = await import('@/components/BattleFleet');
    expect(buildFleets([])).toEqual({ ships: [], bolts: [] });
  });
});