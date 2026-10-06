import { describe, expect, it } from 'vitest';
import { BREATH_PERIOD_S, breathAmount } from './LeaderAvatar';

/**
 * 呼吸曲線 / The breath curve.
 *
 * 這組測試守的是「看起來像呼吸」而不是「數值正確」：一個對稱的正弦會讀成「脈動」，
 * 而且峰值不對就會看起來像抽筋。
 *
 * These tests guard "it reads as breathing", not "the numbers are right": a
 * symmetric sine reads as pulsing, and a mis-placed peak looks like a twitch.
 */
describe('breathAmount', () => {
  it('starts and ends a cycle at rest (fully exhaled)', () => {
    expect(breathAmount(0)).toBeCloseTo(0, 5);
    expect(breathAmount(BREATH_PERIOD_S)).toBeCloseTo(0, 5);
  });

  it('peaks at the top of the inhale, not at the halfway point', () => {
    // The peak is deliberately at 0.45 of the cycle, so the inhale is shorter
    // than the exhale. Asserting 0.5 here would force a symmetric curve, which
    // reads as pulsing.
    let best = -1;
    let bestT = 0;
    for (let i = 0; i <= 1000; i += 1) {
      const t = (i / 1000) * BREATH_PERIOD_S;
      const v = breathAmount(t);
      if (v > best) {
        best = v;
        bestT = t;
      }
    }
    expect(best).toBeCloseTo(1, 5);
    // 0.45 ± 0.01 of the period / 0.45 ± 0.01 of the period
    expect(bestT / BREATH_PERIOD_S).toBeCloseTo(0.45, 2);
  });

  it('peaks exactly once per cycle', () => {
    let peaks = 0;
    // 200 samples across two cycles; a peak is a sample above both neighbours
    for (let i = 1; i < 199; i += 1) {
      const t = (i / 200) * BREATH_PERIOD_S * 2;
      const here = breathAmount(t);
      const before = breathAmount(t - BREATH_PERIOD_S / 100);
      const after = breathAmount(t + BREATH_PERIOD_S / 100);
      if (here > before && here > after && here > 0.9) peaks += 1;
    }
    expect(peaks).toBe(2);
  });

  it('stays within 0..1', () => {
    for (let i = 0; i <= 400; i += 1) {
      const v = breathAmount((i / 400) * BREATH_PERIOD_S * 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('inhales faster than it exhales, which is what makes it read as breathing', () => {
    // Time to reach the peak vs time to fall back. The peak is at 0.45 of the
    // cycle by construction, so the inhale must be the shorter half.
    const peak = BREATH_PERIOD_S * 0.45;
    expect(peak).toBeLessThan(BREATH_PERIOD_S - peak);
  });

  it('is continuous across the wrap point', () => {
    // A jump at the cycle boundary is exactly what reads as a twitch
    const justBefore = breathAmount(BREATH_PERIOD_S - 0.001);
    const justAfter = breathAmount(0.001);
    expect(Math.abs(justBefore - justAfter)).toBeLessThan(0.01);
  });

  it('is monotonic on the way up', () => {
    let previous = -1;
    for (let i = 0; i <= 45; i += 1) {
      const t = (i / 100) * BREATH_PERIOD_S;
      const v = breathAmount(t);
      expect(v).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = v;
    }
  });

  it('is monotonic on the way down', () => {
    let previous = 2;
    for (let i = 55; i <= 100; i += 1) {
      const t = (i / 100) * BREATH_PERIOD_S;
      const v = breathAmount(t);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });
});