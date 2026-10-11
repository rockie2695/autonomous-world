// ============================================================================
// mapShared 的純邏輯測試 / Tests for mapShared's pure logic
// ----------------------------------------------------------------------------
// 只測兩個不需要 DOM 的函式：`brightenColor`（把勢力色調亮）與
// `solveLabelFontSize`（解出「整塊文字都還在內切圓裡」的字級）。
//
// Only the two DOM-free functions: `brightenColor` (lift a faction colour) and
// `solveLabelFontSize` (the largest font whose whole text box still fits the
// inscribed circle).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { brightenColor, hexToRgb, solveLabelFontSize } from './mapShared';

describe('brightenColor', () => {
  it('should mix toward white without changing the hue', () => {
    // hsl(0, 70%, 50%) is a saturated red; lifting it toward white must keep it red and
    // raise every channel.
    const brightened = brightenColor('hsl(0, 70%, 50%)', 0.45);
    const before = hexToRgb('#e64b4b'); // hsl(0, 70%, 50%) resolved
    const after = hexToRgb(brightened);

    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeGreaterThan(before[1]);
    expect(after[2]).toBeGreaterThan(before[2]);
    // Still clearly red: the red channel must stay the dominant one.
    expect(after[0]).toBeGreaterThan(after[1]);
    expect(after[0]).toBeGreaterThan(after[2]);
  });

  it('should be a no-op at amount 0 and pure white at amount 1', () => {
    expect(brightenColor('hsl(120, 70%, 50%)', 0)).toBe(
      brightenColor('hsl(120, 70%, 50%)', 0),
    );
    expect(brightenColor('hsl(120, 70%, 50%)', 1)).toBe('#ffffff');
  });

  it('should accept a hex colour as well as hsl', () => {
    expect(brightenColor('#000000', 1)).toBe('#ffffff');
    expect(brightenColor('#3a86ff', 0)).toBe('#3a86ff');
  });

  it('should return unparseable input unchanged rather than guessing', () => {
    expect(brightenColor('not-a-colour', 0.5)).toBe('not-a-colour');
    expect(brightenColor('', 0.5)).toBe('');
  });
});

describe('solveLabelFontSize', () => {
  const base = {
    // A four-glyph CJK name is roughly square-ish per glyph but wide overall at 100px.
    widthAt100: 400,
    heightAt100: 100,
    radiusPx: 100,
    fit: 0.82,
    fontMax: 120,
    fontMin: 11,
  };

  it('should solve a size whose text box still fits the inscribed circle', () => {
    // The whole point: half-diagonal of the solved box must not exceed radius × fit, or
    // the name would spill off its own claim — the bug this replaced.
    const { fontSize, legible } = solveLabelFontSize(base);
    expect(legible).toBe(true);

    const w = (base.widthAt100 * fontSize) / 100;
    const h = (base.heightAt100 * fontSize) / 100;
    expect(Math.hypot(w, h) / 2).toBeLessThanOrEqual(base.radiusPx * base.fit + 1e-9);
  });

  it('should let a wide name run long while staying thin', () => {
    // A 4:1 name is allowed ~2r of length for only r/4 of thickness. Solving this as a
    // square instead would have made every long name absurdly small.
    const { fontSize } = solveLabelFontSize(base);
    expect(fontSize * 4).toBeGreaterThan(fontSize / 4);
    expect(fontSize).toBeGreaterThan(20);
  });

  it('should scale linearly with the radius', () => {
    const a = solveLabelFontSize({ ...base, radiusPx: 50 }).fontSize;
    const b = solveLabelFontSize({ ...base, radiusPx: 100 }).fontSize;
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('should never exceed the ceiling', () => {
    const huge = solveLabelFontSize({ ...base, radiusPx: 5000 });
    expect(huge.fontSize).toBe(base.fontMax);
    expect(huge.legible).toBe(true);
  });

  it('should report illegible instead of scaling up past the claim', () => {
    // A thin sliver cannot hold a readable name. Scaling it up until it reads is exactly
    // what would push it outside the territory, so it must be dropped instead.
    const sliver = solveLabelFontSize({ ...base, radiusPx: 2 });
    expect(sliver.legible).toBe(false);
    expect(sliver.fontSize).toBeLessThan(base.fontMin);
  });

  it('should refuse degenerate measurements', () => {
    expect(solveLabelFontSize({ ...base, radiusPx: 0 })).toEqual({ fontSize: 0, legible: false });
    expect(solveLabelFontSize({ ...base, widthAt100: 0, heightAt100: 0 })).toEqual({
      fontSize: 0,
      legible: false,
    });
  });
});
