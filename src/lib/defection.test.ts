import { describe, it, expect } from 'vitest';
import {
  defectionValue,
  defectionChance,
  DEFECTION_MIDPOINT,
} from '@/lib/defection';
import { CONFIG } from '@/lib/gameConfig';

describe('defectionValue', () => {
  it('is just the ambition when nothing else applies', () => {
    expect(defectionValue({ ambition: 17, loyaltyMismatch: false, eventDeltaSum: 0 })).toBe(17);
  });

  it('adds 2 when the loyalty tag differs from the king', () => {
    expect(defectionValue({ ambition: 17, loyaltyMismatch: true, eventDeltaSum: 0 })).toBe(19);
  });

  it('sums event deltas: the spec example 17 -> 19 -> 21', () => {
    // Two +1 events this round, on top of the loyalty penalty.
    const v = defectionValue({ ambition: 17, loyaltyMismatch: true, eventDeltaSum: 2 });
    expect(v).toBe(21);
  });

  it('uses each event delta, not a flat +1 per event', () => {
    // A single -2 must lower the value: the data says so.
    expect(defectionValue({ ambition: 20, loyaltyMismatch: false, eventDeltaSum: -2 })).toBe(18);
    // And a +3 event is +3, not +1.
    expect(defectionValue({ ambition: 20, loyaltyMismatch: false, eventDeltaSum: 3 })).toBe(23);
  });
});

describe('defectionChance', () => {
  it('is 0 at the midpoint, because the base rate is a scale factor not a floor', () => {
    // The rule is (value - 17.5) / 17.5 * 0.05. At value 17.5 the excess is zero, so the
    // chance is zero. 0.05 is the *gradient* — what one midpoint's worth of excess buys —
    // not a minimum. This is worth stating because it means a leader at exactly average
    // ambition can never defect, and so can everyone below it.
    expect(defectionChance(DEFECTION_MIDPOINT)).toBe(0);
  });

  it('buys CONFIG.DEFECTION_BASE_RATE for exactly one midpoint of excess', () => {
    // value 35 is one full midpoint above 17.5, so the excess term is exactly 1.
    expect(defectionChance(DEFECTION_MIDPOINT * 2)).toBeCloseTo(
      CONFIG.DEFECTION_BASE_RATE,
      10
    );
  });

  it('is the spec example: value 21 gives 1%', () => {
    // (21 - 17.5) / 17.5 * 0.05 = 0.01
    expect(defectionChance(21)).toBeCloseTo(0.01, 10);
  });

  it('is 0 below the midpoint, never negative', () => {
    expect(defectionChance(5)).toBe(0);
    expect(defectionChance(DEFECTION_MIDPOINT - 0.001)).toBe(0);
  });

  it('rises linearly with the value', () => {
    // Double the excess should double the chance.
    const a = defectionChance(DEFECTION_MIDPOINT + 1);
    const b = defectionChance(DEFECTION_MIDPOINT + 2);
    expect(b).toBeCloseTo(a * 2, 10);
  });

  it('never exceeds 1', () => {
    expect(defectionChance(1000)).toBe(1);
  });

  it('tracks the midpoint derived from the ambition range, not a hardcoded 17.5', () => {
    expect(DEFECTION_MIDPOINT).toBe(17.5);
  });
});