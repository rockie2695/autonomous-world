import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/gameConfig';
import { withAlpha } from '@/lib/spaceShared';
import { fogLayout, fogOptions, fogRotateAt } from './spaceFog';

const fog = fogOptions();

describe('fog options', () => {
  it('builds every option from CONFIG', () => {
    expect(fog.seed).toBe(CONFIG.SPACE_FOG_SEED);
    expect(fog.count).toBe(CONFIG.SPACE_FOG_COUNT);
    expect(fog.radius).toBe(CONFIG.SPACE_FOG_RADIUS);
    expect(fog.alpha).toBe(CONFIG.SPACE_FOG_ALPHA);
    expect(fog.rotatePeriodSec).toBe(CONFIG.SPACE_FOG_ROTATE_PERIOD_SEC);
  });

  it('carries no zoom-fade thresholds of its own', () => {
    // The fog moved under the map and lost its zoom fade, so the two threshold keys it
    // used to copy from the territory view are gone. If either creeps back, the fog is
    // once again appearing and vanishing with zoom — exactly what was removed.
    const keys = Object.keys(fog);
    expect(keys).not.toContain('zoomRatio');
    expect(keys).not.toContain('fadeRatio');
  });
});

describe('fog layout', () => {
  const blobs = fogLayout(fog);

  it('is seeded, so a remount cannot make the layer jump', () => {
    const again = fogLayout(fog);
    const key = (b: { x: number; y: number; r: number }) => `${b.x},${b.y},${b.r}`;
    expect(blobs.map(key)).toEqual(again.map(key));
  });

  it('differs for a different seed', () => {
    const other = fogLayout({ ...fog, seed: `${fog.seed}-other` });
    expect(other[0]?.x).not.toBe(blobs[0]?.x);
  });

  it('produces the configured count', () => {
    expect(blobs.length).toBe(fog.count);
  });

  it('keeps every patch inside world space', () => {
    for (const blob of blobs) {
      expect(blob.x).toBeGreaterThanOrEqual(0);
      expect(blob.x).toBeLessThanOrEqual(1);
      expect(blob.y).toBeGreaterThanOrEqual(0);
      expect(blob.y).toBeLessThanOrEqual(1);
      expect(blob.r).toBeGreaterThan(0);
      expect(blob.alpha).toBeGreaterThan(0);
      expect(blob.alpha).toBeLessThanOrEqual(fog.alpha);
      expect(blob.color).toBeGreaterThanOrEqual(0);
      expect(blob.color).toBeLessThan(fog.colors.length);
    }
  });

  it('spreads across world space rather than clustering', () => {
    // The fog is a cloud layer you travel past, not a halo around the core, so the
    // patches must not all sit together.
    const xs = blobs.map((b) => b.x);
    const ys = blobs.map((b) => b.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);
  });
});

describe('fog drift', () => {
  it('has no zoom fade to drive, so the drift is the only motion', () => {
    // The fog used to fade with zoom; now it is a backdrop that drifts slowly forever,
    // and that drift is the only thing that keeps the layer alive.
    expect(fog.rotatePeriodSec).toBeGreaterThan(0);
  });

  it('completes exactly one turn per period', () => {
    const period = fog.rotatePeriodSec;
    expect(fogRotateAt(0, fog)).toBeCloseTo(0, 10);
    expect(fogRotateAt(period, fog)).toBeCloseTo(0, 6);
    expect(fogRotateAt(period * 0.25, fog)).toBeCloseTo(Math.PI / 2, 6);
    expect(fogRotateAt(period * 0.5, fog)).toBeCloseTo(Math.PI, 6);
  });

  it('stays inside 0..2π however long it has been open', () => {
    const huge = fog.rotatePeriodSec * 100000;
    for (let i = 0; i <= 50; i += 1) {
      const angle = fogRotateAt((huge / 50) * i, fog);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI * 2);
    }
  });

  it('drifts more slowly than the galaxy, so they never read as one object', () => {
    expect(fog.rotatePeriodSec).toBeGreaterThan(CONFIG.SPACE_GALAXY_ROTATE_PERIOD_SEC);
  });

  it('does not drift at all when the period is disabled', () => {
    expect(fogRotateAt(12345, { ...fog, rotatePeriodSec: 0 })).toBe(0);
    expect(fogRotateAt(12345, { ...fog, rotatePeriodSec: -5 })).toBe(0);
  });
});

describe('fog config sanity', () => {
  it('is visible against the dark void, but spread across a wide density range', () => {
    // This ceiling was once asserted as < 0.3, back when the fog painted *over* the map.
    // It moved *under* the map and is a warm nebula now, so the floor is the constraint:
    // it must be high enough to surface against the near-black void.
    //
    // What stops it becoming a uniform white sheet is the **density range**, not the
    // ceiling: every patch multiplies the ceiling by its own density, so the average is
    // far below it and thin patches nearly vanish.
    expect(fog.alpha).toBeGreaterThan(0.3);
    expect(fog.alpha).toBeLessThanOrEqual(1);
    expect(fog.densityMin).toBeLessThan(0.25);
    expect(fog.densityMax).toBe(1);
  });

  it('gives the patches a wide spread of densities', () => {
    const blobs = fogLayout(fog);
    const alphas = blobs.map((b) => b.alpha);
    // Some patches dense and near the ceiling, others thin: that contrast is what makes
    // the layer read as a random cloud instead of one flat brightness.
    expect(Math.max(...alphas)).toBeGreaterThan(fog.alpha * 0.8);
    expect(Math.min(...alphas)).toBeLessThan(fog.alpha * 0.3);
    // And the average must sit well below the ceiling, so it is never a solid sheet
    const mean = alphas.reduce((a, b) => a + b, 0) / alphas.length;
    expect(mean).toBeLessThan(fog.alpha * 0.75);
  });

  it('pairs brightness with size, so dense patches are also large', () => {
    const blobs = fogLayout(fog);
    const sorted = [...blobs].sort((a, b) => a.alpha - b.alpha);
    const thinnest = sorted[0];
    const densest = sorted[sorted.length - 1];
    if (thinnest === undefined || densest === undefined) return;
    // Drawing them independently produced big transparent patches, which read as a bug
    expect(densest.r).toBeGreaterThan(thinnest.r);
  });

  it('keeps the patch count and radius sane', () => {
    expect(CONFIG.SPACE_FOG_COUNT).toBeGreaterThan(0);
    expect(CONFIG.SPACE_FOG_COUNT).toBeLessThanOrEqual(200);
    expect(CONFIG.SPACE_FOG_RADIUS).toBeGreaterThan(0);
    expect(CONFIG.SPACE_FOG_RADIUS).toBeLessThanOrEqual(1);
    expect(CONFIG.SPACE_FOG_COLORS.length).toBeGreaterThan(0);
  });

  it('is warm star dust, not a cold grey haze', () => {
    // The palette is deliberately warm — this layer is a nebula / star dust, so it has to
    // read as lit dust. Every colour must have its red channel dominant over blue, or it
    // drifts back toward cold grey fog.
    for (const color of CONFIG.SPACE_FOG_COLORS) {
      const parsed = /^#([0-9a-f]{6})$/i.exec(color);
      expect(parsed).not.toBeNull();
      if (!parsed) continue;
      const n = Number.parseInt(parsed[1]!, 16);
      const r = (n >> 16) & 255;
      const b = n & 255;
      expect(r).toBeGreaterThan(b);
    }
  });

  it('uses valid hex colours', () => {
    for (const color of CONFIG.SPACE_FOG_COLORS) {
      expect(withAlpha(color, fog.alpha)).toMatch(/^rgba\(\d+, \d+, \d+, /);
    }
  });
});
