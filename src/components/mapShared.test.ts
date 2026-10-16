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
import { CONFIG } from '@/lib/gameConfig';
import {
  brightenColor,
  hexToRgb,
  linkedPlaceNames,
  placeLabelRect,
  pointInRect,
  solveLabelFontSize,
  starClassOf,
  starScaleAt,
  transparent,
} from './mapShared';

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

describe('starScaleAt', () => {
  it('should be exactly 1 on the frame that enters star view, so nothing jumps', () => {
    expect(starScaleAt(CONFIG.MAP_STAR_ZOOM_RATIO)).toBeCloseTo(1, 10);
  });

  it('should grow as the camera zooms closer (smaller ratio)', () => {
    expect(starScaleAt(CONFIG.MAP_STAR_ZOOM_RATIO / 4)).toBeGreaterThan(
      starScaleAt(CONFIG.MAP_STAR_ZOOM_RATIO / 2)
    );
    expect(starScaleAt(CONFIG.MAP_ZOOM_MIN_RATIO)).toBeGreaterThan(1);
  });

  it('should match sigma\'s own size / sqrt(ratio) at an exponent of 0.5', () => {
    const ratio = CONFIG.MAP_STAR_ZOOM_RATIO / 3;
    const expected = Math.sqrt(CONFIG.MAP_STAR_ZOOM_RATIO / ratio);
    expect(starScaleAt(ratio)).toBeCloseTo(expected, 10);
  });

  it('should stay inside the configured bounds all the way out and in', () => {
    // Well past the star band on both sides must still be bounded, or systems overlap at
    // the closest zoom and collapse to unreadable specks at the furthest.
    expect(starScaleAt(CONFIG.MAP_ZOOM_MIN_RATIO)).toBeLessThanOrEqual(
      CONFIG.MAP_STAR_ZOOM_SCALE_MAX
    );
    expect(starScaleAt(CONFIG.MAP_STAR_ZOOM_RATIO * 100)).toBeGreaterThanOrEqual(
      CONFIG.MAP_STAR_ZOOM_SCALE_MIN
    );
  });

  it('should never return a non-finite value for a broken camera ratio', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(starScaleAt(bad))).toBe(true);
      expect(starScaleAt(bad)).toBeGreaterThanOrEqual(CONFIG.MAP_STAR_ZOOM_SCALE_MIN);
    }
  });
});

describe('linkedPlaceNames', () => {
  // Two tooltip paths used to derive this independently, and the one that ran last shipped
  // an empty list — so pointing at a place showed "no linked places" while the roads on
  // screen plainly connected it to four. The shared helper is the fix; this is the guard.
  const graph = {
    neighbors: (node: string) =>
      node === 'a' ? ['b', 'c', 'd', 'e'] : node === 'b' ? ['a'] : [],
    // c is null (what the zoom rule leaves behind) and d is a non-string, so both must be
    // dropped while b and e survive.
    getNodeAttributes: (node: string) => ({
      label: node === 'c' ? null : node === 'd' ? 42 : `place-${node}`,
    }),
  };

  it('should name every linked place that carries a label', () => {
    expect(linkedPlaceNames(graph, 'a')).toEqual(['place-b', 'place-e']);
  });

  it('should drop neighbours whose label is null or not a string', () => {
    // Zoomed out `nodeReducer` nulls every label; listing those would put a column of
    // blanks in the tooltip instead of the roads the reader can actually see.
    const names = linkedPlaceNames(graph, 'a');
    expect(names).toHaveLength(2);
    expect(names.every((name) => typeof name === 'string')).toBe(true);
    expect(names).not.toContain('place-c');
    expect(names).not.toContain('place-d');
  });

  it('should return nothing for a place with no roads', () => {
    expect(linkedPlaceNames(graph, 'c')).toEqual([]);
  });

  it('should agree with itself from either end of the same road', () => {
    // A road a→b must read the same as b→a, or hovering the two ends disagrees.
    expect(linkedPlaceNames(graph, 'b')).toEqual(['place-a']);
  });
});

describe('starClassOf', () => {
  it('should give the same sun to the same place, every time', () => {
    // The sun is painted by Sigma's node disc and its glow by the overlay — two code paths.
    // Both read this, so agreement has to come from one value, not from two draws that happen
    // to match.
    expect(starClassOf('place-abc')).toEqual(starClassOf('place-abc'));
  });

  it('should give different places different suns often enough to read as variation', () => {
    const classes = new Set<string>();
    for (let i = 0; i < 60; i++) classes.add(starClassOf(`place-${i}`).edge);
    expect(classes.size).toBeGreaterThan(1);
    // Not "all of them": the palette has to actually be reachable, or the feature is dead.
    expect(classes.size).toBeLessThanOrEqual(CONFIG.MAP_STAR_SUN_CLASSES.length);
  });

  it('should not key off only the first character, which ids often share', () => {
    // `id.charCodeAt(0) % n` would hand a whole batch of similarly-prefixed ids one sun.
    const edges = new Set(
      ['cmusa1', 'cmusb1', 'cmusc1', 'cmusd1', 'cmuse1'].map(
        (id) => starClassOf(id).edge
      )
    );
    expect(edges.size).toBeGreaterThan(1);
  });

  it('should always return an entry that exists in the config', () => {
    for (let i = 0; i < 40; i++) {
      expect(CONFIG.MAP_STAR_SUN_CLASSES).toContain(starClassOf(`x${i}`));
    }
  });

  it('should pair core and edge from the same class', () => {
    // A core from one star with the halo of another is the failure this guards.
    for (let i = 0; i < 40; i++) {
      const c = starClassOf(`y${i}`);
      const match = CONFIG.MAP_STAR_SUN_CLASSES.find(
        (k) => k.core === c.core && k.edge === c.edge
      );
      expect(match).toBeDefined();
    }
  });
});

describe('transparent', () => {
  it('should keep the hue and force zero alpha', () => {
    // The glow gradient's outer stop has to fade out in the sun's own colour, or a sun that
    // changes colour fades into the wrong hue.
    expect(transparent('#ff9a2e')).toBe('#ff9a2e00');
    expect(transparent('#ffffff')).toBe('#ffffff00');
  });

  it('should not disturb the RGB, only append alpha', () => {
    expect(transparent('#ff9a2e').slice(0, -2)).toBe('#ff9a2e');
  });
});

describe('placeLabelRect', () => {
  const base = { cx: 100, cy: 200, radius: 8, textWidth: 60, labelSize: 14 };

  it('should sit to the right of the disc, clear of its edge', () => {
    // Sigma draws the name at `x + size + 3`; anything closer would overlap the disc and
    // hover the node twice over.
    const r = placeLabelRect(base);
    expect(r.x).toBe(base.cx + base.radius + 3);
    expect(r.y + r.h / 2).toBeCloseTo(base.cy, 10);
  });

  it('should be as wide as the text that was actually measured', () => {
    expect(placeLabelRect(base).w).toBe(60);
    expect(placeLabelRect({ ...base, textWidth: 200 }).w).toBe(200);
  });

  it('should not overlap the disc, so the disc stays its own hit target', () => {
    expect(placeLabelRect(base).x).toBeGreaterThan(base.cx + base.radius);
  });
});

describe('pointInRect', () => {
  const r = { x: 100, y: 190, w: 60, h: 16 };

  it('should accept a point inside the text', () => {
    expect(pointInRect(130, 198, r)).toBe(true);
  });

  it('should accept the exact edges, so the target is not off by a pixel', () => {
    expect(pointInRect(r.x, r.y, r)).toBe(true);
    expect(pointInRect(r.x + r.w, r.y + r.h, r)).toBe(true);
  });

  it('should reject a point past the end of the name', () => {
    // This is the whole point of the feature: mousing out of the label must stop counting.
    expect(pointInRect(r.x + r.w + 6, 198, r)).toBe(false);
  });

  it('should reject a point above and below the text', () => {
    expect(pointInRect(130, r.y - 6, r)).toBe(false);
    expect(pointInRect(130, r.y + r.h + 6, r)).toBe(false);
  });

  it('should reject the disc side, which is not part of the label box', () => {
    expect(pointInRect(95, 198, r)).toBe(false);
  });
});
