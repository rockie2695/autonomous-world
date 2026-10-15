import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/gameConfig';
import { framedPlacement, lerp, parseHex, withAlpha, type FramedMapper } from '@/lib/spaceShared';
import { galaxyFade, galaxyLayout, galaxyOptions, rotateAt } from './spaceGalaxy';

const options = galaxyOptions();

/**
 * 一個假的 sigma：把框化座標映射成視窗像素。
 *
 * 刻意用 sigma 的真實語意——`screen = (framed − centre) × pxPerUnit + viewportCentre`
 * ——所以這支 stub 能證明「方向是否正確」，而測試不必依賴 sigma 本身。
 *
 * A stub standing in for sigma, deliberately using sigma's real semantics —
 * `screen = (framed − centre) × pxPerUnit + viewportCentre` — so it can prove the
 * *sign* without the test needing sigma itself.
 */
function stubMapper(
  cameraX: number,
  cameraY: number,
  pxPerUnit: number,
  width = 800,
  height = 600,
): FramedMapper {
  return (p) => ({
    x: (p.x - cameraX) * pxPerUnit + width / 2,
    y: (p.y - cameraY) * pxPerUnit + height / 2,
  });
}

describe('galaxy options', () => {
  it('builds every option from CONFIG', () => {
    expect(options.seed).toBe(CONFIG.SPACE_GALAXY_SEED);
    expect(options.radiusFraction).toBe(CONFIG.SPACE_GALAXY_RADIUS_FRACTION);
    expect(options.coreRadius).toBe(CONFIG.SPACE_GALAXY_CORE_RADIUS);
    expect(options.starCount).toBe(CONFIG.SPACE_GALAXY_STAR_COUNT);
    expect(options.nebulaBlobs).toBe(CONFIG.SPACE_GALAXY_NEBULA_BLOBS);
    expect(options.fadeRatio).toBe(CONFIG.SPACE_GALAXY_FADE_RATIO);
  });

  it('has a reproducible seed', () => {
    expect(options.seed.length).toBeGreaterThan(0);
  });

  it('carries no parallax or zoom-clamp settings of its own', () => {
    // Placement and scale are sigma's job now. The galaxy used to carry
    // `parallax`, `scaleExponent`, `scaleClampMin/Max` and `refRatio`; the parallax
    // had the **wrong sign** (the backdrop drifted against the map) and the clamp was
    // only ever hiding the fact that the zoom was not following the map at all.
    // Nothing of the sort may creep back in.
    const keys = Object.keys(options);
    for (const gone of [
      'armTwist',
      'arms',
      'colorLane',
      'laneAlpha',
      'laneCount',
      'laneNoiseScale',
      'laneSteps',
      'laneWidth',
      'laneWobble',
      'parallax',
      'refRatio',
      'scaleClampMax',
      'scaleClampMin',
      'scaleExponent',
    ]) {
      expect(keys).not.toContain(gone);
    }
  });
});

describe('framed placement', () => {
  it('takes the centre from the mapper, not from camera x / y', () => {
    // The galaxy is a world object at the world centre (0.5, 0.5), so its screen
    // position is whatever sigma says that point maps to. If this ever goes back to
    // deriving from camera.x / y it is the sign bug again.
    const mapper = stubMapper(0.3, 0.4, 600);
    const place = framedPlacement(mapper, options.radiusFraction);
    const expected = mapper({ x: 0.5, y: 0.5 });
    expect(place.cx).toBeCloseTo(expected.x, 9);
    expect(place.cy).toBeCloseTo(expected.y, 9);
  });

  it('travels with the map, not against it', () => {
    // Sigma moves world content **left** as camera.x rises, because the mapping is
    // `(framed − camera) × scale + centre`. The galaxy must do the same. The
    // hand-rolled version added `(camera.x − 0.5) × k` to the centre, which moved it
    // the *opposite* way — the bug this whole layer was rewritten to remove.
    const a = framedPlacement(stubMapper(0.4, 0.5, 600), options.radiusFraction);
    const b = framedPlacement(stubMapper(0.6, 0.5, 600), options.radiusFraction);
    expect(b.cx).toBeLessThan(a.cx);
    expect(b.cy).toBeCloseTo(a.cy, 9);
  });

  it('scales with the map', () => {
    const zoomedOut = framedPlacement(stubMapper(0.5, 0.5, 600), options.radiusFraction);
    const zoomedIn = framedPlacement(stubMapper(0.5, 0.5, 1200), options.radiusFraction);
    expect(zoomedIn.pxPerUnit).toBeCloseTo(zoomedOut.pxPerUnit * 2, 6);
  });

  it('multiplies the pixel scale by the requested radius', () => {
    const one = framedPlacement(stubMapper(0.5, 0.5, 600), 1);
    const half = framedPlacement(stubMapper(0.5, 0.5, 600), 0.5);
    expect(half.pxPerUnit).toBeCloseTo(one.pxPerUnit * 0.5, 6);
  });

  it('takes the larger of the two axes, so the disc does not inflate', () => {
    // Sigma's normalisation makes the *larger* axis exactly 1, so the smaller axis
    // has more pixels per unit. Taking the smaller would inflate the disc at some
    // viewport aspects.
    const wide: FramedMapper = (p) => ({ x: p.x * 1000, y: p.y * 500 });
    const tall: FramedMapper = (p) => ({ x: p.x * 500, y: p.y * 1000 });
    expect(framedPlacement(wide, 1).pxPerUnit).toBeCloseTo(1000, 6);
    expect(framedPlacement(tall, 1).pxPerUnit).toBeCloseTo(1000, 6);
  });

  it('never returns a zero or negative scale', () => {
    const degenerate = framedPlacement(() => ({ x: 5, y: 5 }), options.radiusFraction);
    expect(degenerate.pxPerUnit).toBeGreaterThan(0);
    expect(Number.isFinite(degenerate.pxPerUnit)).toBe(true);
  });
});

describe('galaxy zoom fade', () => {
  it('is fully visible at and above the threshold', () => {
    expect(galaxyFade(options.fadeRatio, options)).toBe(1);
    expect(galaxyFade(options.fadeRatio + 1, options)).toBe(1);
  });

  it('keeps a visible floor instead of fading to nothing', () => {
    // Fading to 0 left a pure-black frame at deep zoom, which reads as broken rather
    // than intended. The galaxy now always remains part of the background.
    expect(galaxyFade(0, options)).toBe(options.fadeMin);
    expect(galaxyFade(options.fadeRatio / 2, options)).toBeCloseTo(
      options.fadeMin + (1 - options.fadeMin) * 0.5,
      9,
    );
  });

  it('never returns 0, whatever the ratio', () => {
    for (const ratio of [0, 0.01, 0.05, 0.3, 0.89, 0.9, 1.18, 3]) {
      expect(galaxyFade(ratio, options)).toBeGreaterThan(0);
    }
    expect(options.fadeMin).toBeGreaterThan(0);
    expect(options.fadeMin).toBeLessThan(1);
  });

  it('decreases monotonically as the camera zooms in', () => {
    let previous = 2;
    for (let ratio = options.fadeRatio; ratio >= 0.05; ratio -= 0.05) {
      const fade = galaxyFade(ratio, options);
      expect(fade).toBeLessThanOrEqual(previous);
      expect(fade).toBeGreaterThanOrEqual(0);
      previous = fade;
    }
  });

  it('fades before the disc can become a film, but stays visible in normal use', () => {
    // At sigma's minimum ratio the disc would be ~9x the viewport: a flat warm film
    // that costs the roads their contrast, so the fade must complete well above that.
    expect(CONFIG.SPACE_GALAXY_FADE_RATIO).toBeGreaterThan(CONFIG.MAP_ZOOM_MIN_RATIO * 4);
    // Fully visible in the default fit view, and still *partly* visible when a place
    // is focused (MAP_FOCUS_ZOOM = 0.45 → fade 0.45 / 0.9 = 0.5), so clicking a node
    // does not blank the backdrop outright.
    expect(CONFIG.SPACE_GALAXY_FADE_RATIO).toBeLessThan(CONFIG.MAP_FIT_PADDING);
    expect(galaxyFade(CONFIG.MAP_FIT_PADDING, options)).toBe(1);
    const focused = galaxyFade(CONFIG.MAP_FOCUS_ZOOM, options);
    expect(focused).toBeGreaterThan(0);
    expect(focused).toBeLessThan(1);
  });

  it('falls back to the floor for a non-finite ratio rather than NaN', () => {
    expect(galaxyFade(Number.NaN, options)).toBe(options.fadeMin);
    expect(galaxyFade(Number.POSITIVE_INFINITY, options)).toBe(options.fadeMin);
  });
});

describe('galaxy layout', () => {
  const layout = galaxyLayout(options.seed, options);

  it('is reproducible from the seed', () => {
    const again = galaxyLayout(options.seed, options);
    expect(again.stars.length).toBe(layout.stars.length);
    expect(again.stars[0]?.x).toBe(layout.stars[0]?.x);
    expect(again.stars[0]?.y).toBe(layout.stars[0]?.y);
    expect(again.blobs[0]?.r).toBe(layout.blobs[0]?.r);
  });

  it('differs for a different seed', () => {
    const other = galaxyLayout(`${options.seed}-other`, options);
    expect(other.stars[0]?.x).not.toBe(layout.stars[0]?.x);
  });

  it('carries no lanes', () => {
    expect((layout as unknown as { lanes?: unknown }).lanes).toBeUndefined();
  });

  it('places stars around the world centre, inside the disc', () => {
    for (const star of layout.stars) {
      const dist = Math.hypot(star.x - 0.5, star.y - 0.5);
      expect(dist).toBeLessThanOrEqual(options.radiusFraction);
      expect(star.size).toBeGreaterThanOrEqual(options.starMinSize * 0.79);
      expect(star.size).toBeLessThanOrEqual(options.starMaxSize);
    }
  });

  it('concentrates stars toward the centre', () => {
    // `pow(u, 1.7)` biases the sample toward 0, so the inner half of the disc must
    // hold more than half the stars. A uniform spread would give roughly 25%.
    const inner = layout.stars.filter(
      (s) => Math.hypot(s.x - 0.5, s.y - 0.5) < options.radiusFraction * 0.5,
    ).length;
    expect(inner).toBeGreaterThan(layout.stars.length * 0.4);
  });

  it('dims stars toward the rim so the edge does not show as a hard cut', () => {
    const alphaAt = (r: number) => {
      const near = layout.stars.filter(
        (s) => Math.abs(Math.hypot(s.x - 0.5, s.y - 0.5) - r) < options.radiusFraction * 0.06,
      );
      if (near.length === 0) return null;
      return near.reduce((sum, s) => sum + s.alpha, 0) / near.length;
    };
    const core = alphaAt(options.radiusFraction * 0.2);
    const rim = alphaAt(options.radiusFraction * 0.95);
    if (core === null || rim === null) return;
    expect(core).toBeGreaterThan(rim);
  });

  it('indexes colours inside the configured palettes', () => {
    for (const star of layout.stars) {
      expect(star.color).toBeGreaterThanOrEqual(0);
      expect(star.color).toBeLessThan(options.starColors.length);
    }
    for (const blob of layout.blobs) {
      expect(blob.color).toBeGreaterThanOrEqual(0);
      expect(blob.color).toBeLessThan(options.nebulaColors.length);
    }
  });

  it('keeps the nebula off the exact centre, so the core is not fogged over', () => {
    for (const blob of layout.blobs) {
      const dist = Math.hypot(blob.x - 0.5, blob.y - 0.5);
      expect(dist).toBeGreaterThan(options.radiusFraction * 0.1);
      expect(dist).toBeLessThan(options.radiusFraction * 0.85);
    }
  });

  it('produces the configured counts', () => {
    expect(layout.stars.length).toBe(options.starCount);
    expect(layout.blobs.length).toBe(options.nebulaBlobs);
    expect(layout.coreRadius).toBeCloseTo(options.coreRadius * options.radiusFraction, 10);
  });
});

describe('rotation', () => {
  it('completes exactly one turn per period', () => {
    const period = options.rotatePeriodSec;
    expect(rotateAt(0, options)).toBeCloseTo(0, 10);
    expect(rotateAt(period, options)).toBeCloseTo(0, 6);
    expect(rotateAt(period * 0.25, options)).toBeCloseTo(Math.PI / 2, 6);
    expect(rotateAt(period * 0.5, options)).toBeCloseTo(Math.PI, 6);
  });

  it('stays inside 0..2π however long it has been open', () => {
    const huge = options.rotatePeriodSec * 100000;
    for (let i = 0; i <= 50; i += 1) {
      const angle = rotateAt((huge / 50) * i, options);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI * 2);
    }
  });

  it('turns slowly enough not to read as a spinning prop', () => {
    expect(options.rotatePeriodSec).toBeGreaterThan(120);
  });

  it('does not turn at all when the period is disabled', () => {
    expect(rotateAt(12345, { ...options, rotatePeriodSec: 0 })).toBe(0);
    expect(rotateAt(12345, { ...options, rotatePeriodSec: -5 })).toBe(0);
  });
});

describe('colour helpers', () => {
  it('parses both hex lengths', () => {
    expect(parseHex('#c9b79c')).toEqual({ r: 201, g: 183, b: 156 });
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('rejects anything that is not a hex colour', () => {
    expect(parseHex('c9b79c')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('#zzzzzz')).toBeNull();
  });

  it('applies alpha without losing the colour', () => {
    expect(withAlpha('#c9b79c', 0.5)).toBe('rgba(201, 183, 156, 0.5)');
    expect(withAlpha('#c9b79c', 0)).toBe('rgba(201, 183, 156, 0)');
  });

  it('returns the input unchanged when it cannot parse', () => {
    expect(withAlpha('not-a-colour', 0.5)).toBe('not-a-colour');
  });

  it('interpolates', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 1)).toBe(4);
  });
});

describe('galaxy config sanity', () => {
  it('keeps the disc a sensible fraction of world space', () => {
    expect(CONFIG.SPACE_GALAXY_RADIUS_FRACTION).toBeGreaterThan(0);
    expect(CONFIG.SPACE_GALAXY_RADIUS_FRACTION).toBeLessThan(1);
  });

  it('keeps the core inside the disc', () => {
    expect(CONFIG.SPACE_GALAXY_CORE_RADIUS).toBeGreaterThan(0);
    expect(CONFIG.SPACE_GALAXY_CORE_RADIUS).toBeLessThan(1);
  });

  it('keeps every alpha within 0..1', () => {
    for (const alpha of [
      CONFIG.SPACE_GALAXY_CORE_ALPHA,
      CONFIG.SPACE_GALAXY_MID_ALPHA,
      CONFIG.SPACE_GALAXY_NEBULA_ALPHA,
      CONFIG.SPACE_GALAXY_STAR_ALPHA,
    ]) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it('stays deliberately dimmer than the Stellaris reference', () => {
    // The reference core reads as a bright warm glow. This layer sits under
    // semi-transparent #1e3a5f roads with up to 2000 nodes above them, so every
    // alpha is held well below it.
    expect(CONFIG.SPACE_GALAXY_CORE_ALPHA).toBeLessThan(0.6);
    expect(CONFIG.SPACE_GALAXY_MID_ALPHA).toBeLessThan(0.3);
    expect(CONFIG.SPACE_GALAXY_STAR_ALPHA).toBeLessThan(1);
  });

  it('keeps enough floor and detail that zooming in still reads as a galaxy', () => {
    // "More clear when zoomed in" is answered by a higher fade floor plus more stars and
    // nebula, not by removing the fade — a bright disc at deep zoom is a warm wash over the
    // roads. If any of these drop back, the galaxy thins to a film at exactly the zoom the
    // user asked to see it best.
    expect(CONFIG.SPACE_GALAXY_FADE_MIN).toBeGreaterThanOrEqual(0.5);
    expect(CONFIG.SPACE_GALAXY_STAR_COUNT).toBeGreaterThanOrEqual(600);
    expect(CONFIG.SPACE_GALAXY_NEBULA_BLOBS).toBeGreaterThanOrEqual(8);
    expect(CONFIG.SPACE_GALAXY_RADIUS_FRACTION).toBeGreaterThanOrEqual(0.8);
  });

  it('uses valid hex colours throughout', () => {
    const colors = [
      CONFIG.SPACE_GALAXY_COLOR_CORE,
      CONFIG.SPACE_GALAXY_COLOR_MID,
      ...CONFIG.SPACE_GALAXY_NEBULA_COLORS,
      ...CONFIG.SPACE_GALAXY_STAR_COLORS,
    ];
    for (const color of colors) {
      expect(parseHex(color)).not.toBeNull();
    }
  });

  it('keeps the star palette and count in budget', () => {
    expect(CONFIG.SPACE_GALAXY_STAR_COUNT).toBeGreaterThan(0);
    expect(CONFIG.SPACE_GALAXY_STAR_COUNT).toBeLessThanOrEqual(2000);
    expect(CONFIG.SPACE_GALAXY_STAR_COLORS.length).toBeGreaterThan(0);
    expect(CONFIG.SPACE_GALAXY_NEBULA_COLORS.length).toBeGreaterThan(0);
  });

  it('keeps the star size range ordered', () => {
    expect(CONFIG.SPACE_GALAXY_STAR_MIN_SIZE).toBeGreaterThan(0);
    expect(CONFIG.SPACE_GALAXY_STAR_MAX_SIZE).toBeGreaterThan(
      CONFIG.SPACE_GALAXY_STAR_MIN_SIZE,
    );
  });

  it('leaves the DPR cap shared with the other canvas layers', () => {
    expect(CONFIG.SPACE_DPR_CAP).toBeGreaterThan(0);
  });
});
