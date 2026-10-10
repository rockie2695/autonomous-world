import { describe, expect, it } from 'vitest';
import { buildBattleReport, type BattleReportParts } from './battleReport';

const parts: BattleReportParts = {
  attackerTroops: 400,
  attackerWu: 20,
  attackRoll: 1.2,
  attackPower: 5200,
  defenderGarrison: 50,
  defenderFortress: 2,
  defenceRoll: 0.9,
  defencePower: 1170,
};

describe('buildBattleReport', () => {
  it('keeps every number of the arithmetic, so the popup can show the working', () => {
    const report = buildBattleReport('assault', parts);
    expect(report).not.toBeNull();
    // Each figure the report displays must survive untouched — a dropped field would show
    // as a blank row in the popup.
    for (const [key, value] of Object.entries(parts)) {
      expect(report?.[key]).toBe(value);
    }
  });

  it('records a won assault as "assault"', () => {
    expect(buildBattleReport('assault', parts)?.outcome).toBe('assault');
  });

  it('records a failed assault as "repelled"', () => {
    expect(buildBattleReport('repelled', parts)?.outcome).toBe('repelled');
  });

  it('returns null for no defenders — the blank IS the fact that nothing was fought', () => {
    // This is the rule the whole feature exists for: a capture from an empty place must not
    // render a "0 vs 0" battle, because that battle did not happen.
    expect(buildBattleReport('no_defenders', null)).toBeNull();
  });

  it('returns null when the outcome says assault but there is no arithmetic', () => {
    // Defensive: half the data is worse than none, and a report with undefined powers
    // would print NaN in every row.
    expect(buildBattleReport('assault', null)).toBeNull();
    expect(buildBattleReport('repelled', null)).toBeNull();
  });

  it('returns null when the outcome is no_defenders even if arithmetic was passed', () => {
    // The outcome is authoritative: no defenders means no fight, whatever else arrived.
    expect(buildBattleReport('no_defenders', parts)).toBeNull();
  });

  it('produces a plain object that Prisma can store as Json', () => {
    const report = buildBattleReport('assault', parts);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
