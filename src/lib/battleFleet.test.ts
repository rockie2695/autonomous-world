import { describe, expect, it } from 'vitest';
import { battleFronts, type FleetRoad, type FleetSite } from './battleFleet';

const RED = '#ff0000';
const BLUE = '#0000ff';

function sites(list: Array<[string, number, number, string | null, number?]>): FleetSite[] {
  return list.map(([id, x, y, factionId, garrison = 0]) => ({
    id,
    x,
    y,
    factionId,
    garrison,
  }));
}

describe('battleFronts', () => {
  it('treats a road between rival factions as a front line', () => {
    const out = battleFronts(
      sites([
        ['a', 0, 0, 'red', 10],
        ['b', 10, 0, 'blue', 10],
      ]),
      [{ aId: 'a', bId: 'b' }],
      { red: RED, blue: BLUE },
    );
    expect(out).toHaveLength(1);
    expect(out[0].colorA).toBe(RED);
    expect(out[0].colorB).toBe(BLUE);
  });

  it('ignores roads inside a single faction — those are internal, not a war', () => {
    const out = battleFronts(
      sites([
        ['a', 0, 0, 'red'],
        ['b', 10, 0, 'red'],
      ]),
      [{ aId: 'a', bId: 'b' }],
      { red: RED },
    );
    expect(out).toHaveLength(0);
  });

  it('ignores unowned land on either end — no opponent, no war', () => {
    const out = battleFronts(
      sites([
        ['a', 0, 0, 'red'],
        ['b', 10, 0, null],
      ]),
      [{ aId: 'a', bId: 'b' }],
      { red: RED },
    );
    expect(out).toHaveLength(0);
  });

  it('ignores roads whose endpoints are not both in the settlement set', () => {
    const out = battleFronts(
      sites([['a', 0, 0, 'red']]),
      [
        { aId: 'a', bId: 'ghost' },
      ],
      { red: RED },
    );
    expect(out).toHaveLength(0);
  });

  it('computes a unit normal perpendicular to the line', () => {
    const out = battleFronts(
      sites([
        ['a', 0, 0, 'red'],
        ['b', 0, 8, 'blue'],
      ]),
      [{ aId: 'a', bId: 'b' }],
      { red: RED, blue: BLUE },
    );
    const front = out[0];
    expect(front.length).toBeCloseTo(8);
    // The normal must be unit length...
    expect(Math.hypot(front.nx, front.ny)).toBeCloseTo(1);
    // ...and perpendicular to the segment direction (0, 8).
    const dot = (front.bx - front.ax) * front.nx + (front.by - front.ay) * front.ny;
    expect(dot).toBeCloseTo(0);
  });

  it('skips coincident endpoints instead of producing an undefined normal', () => {
    const out = battleFronts(
      sites([
        ['a', 5, 5, 'red'],
        ['b', 5, 5, 'blue'],
      ]),
      [{ aId: 'a', bId: 'b' }],
      { red: RED, blue: BLUE },
    );
    expect(out).toHaveLength(0);
  });

  it('falls back to a neutral colour for an unknown faction', () => {
    const out = battleFronts(
      sites([
        ['a', 0, 0, 'red'],
        ['b', 5, 0, 'purple'],
      ]),
      [{ aId: 'a', bId: 'b' }],
      { red: RED },
    );
    expect(out[0].colorA).toBe(RED);
    expect(out[0].colorB).toBe('#64748b');
  });

  it('keeps the heaviest fronts when over the cap, by the smaller garrison', () => {
    const built: FleetSite[] = [];
    const roads: FleetRoad[] = [];
    // three fronts with weights 5, 50 and 20
    for (const [i, weight] of [5, 50, 20].entries()) {
      built.push({ id: `r${i}`, x: 0, y: i * 10, factionId: 'red', garrison: weight });
      built.push({ id: `b${i}`, x: 10, y: i * 10, factionId: 'blue', garrison: weight });
      roads.push({ aId: `r${i}`, bId: `b${i}` });
    }
    const out = battleFronts(built, roads, { red: RED, blue: BLUE }, 2);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.weight)).toEqual([50, 20]);
  });

  it('returns an empty list for an empty world', () => {
    expect(battleFronts([], [], {})).toEqual([]);
  });
});