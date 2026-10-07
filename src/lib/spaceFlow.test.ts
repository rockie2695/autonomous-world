import { describe, expect, it } from 'vitest';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { CONFIG } from '@/lib/gameConfig';
import { createRng } from '@/lib/rng';
import {
  buildFlowStyles,
  createFlowField,
  flowAngle,
  flowOptions,
  hueForIndex,
  lifeFade,
  particleHueIndex,
  spawnParticle,
} from './spaceFlow';

describe('flow field', () => {
  it('produces a usable field from a seeded RNG, not a constant one', () => {
    const noise = new SimplexNoise(createRng('seed'));
    // A constant `() => 0.5` collapses the permutation table and the field becomes
    // a smooth ramp. Sample widely and require real variance.
    const values: number[] = [];
    for (let x = 0; x < 400; x += 17) {
      for (let y = 0; y < 400; y += 23) {
        values.push(noise.noise3d(x, y, 0));
      }
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max - min).toBeGreaterThan(0.5);
  });

  it('returns values inside the simplex range', () => {
    const noise = new SimplexNoise(createRng('range'));
    for (let i = 0; i < 500; i += 1) {
      const v = noise.noise3d(i * 0.37, i * 0.71, i * 0.13);
      expect(v).toBeGreaterThanOrEqual(-1.05);
      expect(v).toBeLessThanOrEqual(1.05);
    }
  });

  it('is continuous: nearby positions give similar directions', () => {
    // This is the property the whole technique rests on. If it fails, particles
    // scatter instead of forming ribbons.
    const { noise, options } = createFlowField('continuity');
    let maxJump = 0;
    for (let x = 0; x < 900; x += 37) {
      for (let y = 0; y < 900; y += 41) {
        const a = flowAngle(noise, x, y, 0, options);
        const b = flowAngle(noise, x + 1, y, 0, options);
        maxJump = Math.max(maxJump, Math.abs(a - b));
      }
    }
    // A one-pixel step must not swing the direction wildly
    expect(maxJump).toBeLessThan(0.2);
  });

  it('varies over time, so the field evolves rather than freezing', () => {
    const { noise, options } = createFlowField('evolve');
    let differs = 0;
    for (let x = 0; x < 500; x += 29) {
      if (flowAngle(noise, x, x, 0, options) !== flowAngle(noise, x, x, 4000, options)) {
        differs += 1;
      }
    }
    expect(differs).toBeGreaterThan(10);
  });

  it('is reproducible: the same seed gives the same field', () => {
    const a = createFlowField(CONFIG.SPACE_FLOW_SEED);
    const b = createFlowField(CONFIG.SPACE_FLOW_SEED);
    for (const t of [0, 1000, 5000]) {
      expect(flowAngle(a.noise, 100, 200, t, a.options)).toBe(
        flowAngle(b.noise, 100, 200, t, b.options),
      );
    }
  });

  it('spawns particles inside 0..1 and with a life inside its own bounds', () => {
    const options = flowOptions();
    for (let i = 0; i < 200; i += 1) {
      const p = spawnParticle(`p${i}`, options, true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
      expect(p.life).toBeGreaterThanOrEqual(0);
      expect(p.life).toBeLessThanOrEqual(p.maxLife);
      expect(p.maxLife).toBeGreaterThanOrEqual(options.minLife);
      expect(p.maxLife).toBeLessThanOrEqual(options.maxLife);
      expect(p.size).toBeGreaterThanOrEqual(options.minSize);
      expect(p.size).toBeLessThanOrEqual(options.maxSize);
    }
  });

  it('staggeres initial lives so the layer does not breathe in sync', () => {
    const options = flowOptions();
    const lives = Array.from({ length: 40 }, (_, i) => spawnParticle(`s${i}`, options, true).life);
    const distinct = new Set(lives.map((v) => v.toFixed(3))).size;
    // If every particle started at life 0, they would all fade in and respawn together
    expect(distinct).toBeGreaterThan(30);
  });

  it('starts a fresh particle at life 0', () => {
    const options = flowOptions();
    expect(spawnParticle('fresh', options, false).life).toBe(0);
  });
});

describe('lifeFade', () => {
  const fade = CONFIG.SPACE_FLOW_FADE_FRACTION;

  it('is 0 at birth and 0 at death', () => {
    expect(lifeFade(0, 400, fade)).toBeCloseTo(0, 6);
    expect(lifeFade(400, 400, fade)).toBeCloseTo(0, 6);
  });

  it('reaches 1 in the middle of life', () => {
    expect(lifeFade(200, 400, fade)).toBeCloseTo(1, 6);
  });

  it('stays within 0..1 across the whole life', () => {
    for (let life = 0; life <= 400; life += 1) {
      const v = lifeFade(life, 400, fade);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonically increasing while fading in', () => {
    let previous = -1;
    for (let life = 0; life <= 40; life += 1) {
      const v = lifeFade(life, 400, fade);
      expect(v).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = v;
    }
  });

  it('handles a zero-length life without dividing by zero', () => {
    expect(lifeFade(5, 0, fade)).toBe(0);
  });
});

describe('hue follows the field', () => {
  const options = flowOptions();

  it('gives nearby particles the same quantised step, so a ribbon is one colour', () => {
    const { noise } = createFlowField('hue-ribbon');
    // This is the whole point: colour must be a property of *where you are*, not of
    // which particle you are. If it were per-particle, one ribbon would contain
    // every colour and no structure would be visible.
    for (const [x, y] of [
      [400, 300],
      [820, 410],
      [1500, 600],
    ]) {
      const steps = new Set<number>();
      for (let i = 0; i < 5; i += 1) {
        steps.add(particleHueIndex(noise, x + i, y + i, 0, options));
      }
      // A 5px step must not jump more than a couple of quantisation steps
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(2);
    }
  });

  it('varies across the canvas, so there is more than one colour band', () => {
    const { noise } = createFlowField('hue-variety');
    const seen = new Set<number>();
    for (let x = 0; x < 1820; x += 90) {
      for (let y = 0; y < 758; y += 90) {
        seen.add(particleHueIndex(noise, x, y, 0, options));
      }
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('stays inside the configured hue band', () => {
    const { noise } = createFlowField('hue-range');
    for (let x = 0; x < 1820; x += 37) {
      for (let y = 0; y < 758; y += 41) {
        const hue = hueForIndex(particleHueIndex(noise, x, y, 0, options), options);
        expect(hue).toBeGreaterThanOrEqual(options.hueMin);
        expect(hue).toBeLessThanOrEqual(options.hueMax);
      }
    }
  });

  it('returns an in-range integer index for every sample', () => {
    const { noise } = createFlowField('hue-index');
    for (let x = 0; x < 1820; x += 53) {
      const step = particleHueIndex(noise, x, 300, 0, options);
      expect(Number.isInteger(step)).toBe(true);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(options.hueSteps);
    }
  });

  it('drifts with the field, but slower than the flow does', () => {
    const { noise } = createFlowField('hue-drift');
    // Colour must evolve with the grouping, or the two decouple — but if it
    // evolved as fast as the flow it would churn, which is worse than static.
    expect(options.hueTimeScale).toBeLessThan(options.timeScale);

    // And it must actually drift: a fixed hue would decouple colour from the
    // grouping over time.
    const x = 700;
    const y = 400;
    const first = particleHueIndex(noise, x, y, 0, options);
    const later = particleHueIndex(noise, x, y, 60 * 60 * 8, options);
    expect(later).not.toBe(first);
  });

  it('has every colour reachable from config', () => {
    // Every colour must be tunable from gameConfig, with nothing hard-coded in the
    // component. This asserts the knobs exist and are in sane ranges.
    expect(CONFIG.SPACE_FLOW_HUE_MIN).toBeGreaterThanOrEqual(0);
    expect(CONFIG.SPACE_FLOW_HUE_MAX).toBeLessThanOrEqual(360);
    expect(CONFIG.SPACE_FLOW_HUE_MAX).toBeGreaterThan(CONFIG.SPACE_FLOW_HUE_MIN);
    expect(CONFIG.SPACE_FLOW_SATURATION).toBeGreaterThan(0);
    expect(CONFIG.SPACE_FLOW_SATURATION).toBeLessThanOrEqual(100);
    expect(CONFIG.SPACE_FLOW_LIGHTNESS).toBeGreaterThan(0);
    expect(CONFIG.SPACE_FLOW_LIGHTNESS).toBeLessThanOrEqual(100);
    expect(CONFIG.SPACE_FLOW_MAX_ALPHA).toBeGreaterThan(0);
    expect(CONFIG.SPACE_FLOW_MAX_ALPHA).toBeLessThanOrEqual(1);
    expect(Array.isArray(CONFIG.SPACE_FLOW_COLORS)).toBe(true);
  });

  it('is bright enough to actually see', () => {
    // The user reported the dust looked colourless. Saturation, lightness and the
    // alpha ceiling all have to be high enough that a 1-2px particle reads.
    expect(CONFIG.SPACE_FLOW_SATURATION).toBeGreaterThanOrEqual(60);
    expect(CONFIG.SPACE_FLOW_LIGHTNESS).toBeGreaterThanOrEqual(55);
    expect(CONFIG.SPACE_FLOW_MAX_ALPHA).toBeGreaterThanOrEqual(0.5);
  });
});

describe('buildFlowStyles', () => {
  it('returns exactly hueSteps strings, so a frame costs one lookup per particle', () => {
    expect(buildFlowStyles(flowOptions())).toHaveLength(flowOptions().hueSteps);
  });

  it('derives a spread of hues when no explicit colours are configured', () => {
    const options = { ...flowOptions(), colors: [] };
    const styles = buildFlowStyles(options);
    const hues = new Set(styles.map((s) => s.match(/hsla\((\d+(?:\.\d+)?)/)?.[1]));
    // A single-colour layer would look like plain dust again
    expect(hues.size).toBeGreaterThan(8);
  });

  it('honours explicit rgb colours when given', () => {
    const options = { ...flowOptions(), colors: ['255,0,0', '0,255,0'] };
    const styles = buildFlowStyles(options);
    expect(styles).toHaveLength(options.hueSteps);
    expect(styles[0]).toContain('255, 0, 0');
  });

  it('accepts hex colours', () => {
    const options = { ...flowOptions(), colors: ['#ff0000'] };
    expect(buildFlowStyles(options)[0]).toContain('rgba(255, 0, 0, 1)');
  });

  it('falls back to the hue ramp when an explicit colour is malformed', () => {
    const options = { ...flowOptions(), colors: ['not-a-colour'] };
    const styles = buildFlowStyles(options);
    expect(styles).toHaveLength(options.hueSteps);
    expect(styles[0]).toContain('hsla(');
  });

  it('ignores blank entries so a trailing comma cannot break the ramp', () => {
    const options = { ...flowOptions(), colors: ['', '  ', '#0000ff'] };
    expect(buildFlowStyles(options)[0]).toContain('rgba(0, 0, 255, 1)');
  });

  it('never emits an empty string', () => {
    for (const colors of [[], [''], ['bogus'], ['#zzz'], ['1,2'], ['300,0,0']]) {
      for (const s of buildFlowStyles({ ...flowOptions(), colors })) {
        expect(s.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('colour visibility', () => {
  it('spans the warm half of the wheel, not just the cool half', () => {
    // The range used to be 195 → 320, which excludes green, yellow, orange and red
    // entirely — only purple, pink and blue could ever appear. Guard the full span.
    const { noise } = createFlowField('warm-wheel');
    const options = flowOptions();
    const hues: number[] = [];
    for (let x = 0; x < 1820; x += 47) {
      for (let y = 0; y < 758; y += 53) {
        hues.push(hueForIndex(particleHueIndex(noise, x, y, 0, options), options));
      }
    }
    // Red, green and yellow must all be reachable
    const hasWarm = (lo: number, hi: number) =>
      hues.some((h) => h >= lo && h <= hi);
    expect(hasWarm(0, 45)).toBe(true); // red → orange
    expect(hasWarm(45, 75)).toBe(true); // orange → yellow
    expect(hasWarm(90, 150)).toBe(true); // green
    expect(hasWarm(190, 250)).toBe(true); // blue
    expect(hasWarm(270, 320)).toBe(true); // violet
  });

  it('renders distinguishable colours, not all the same one', () => {
    const { noise } = createFlowField('visible');
    const options = flowOptions();
    const styles = buildFlowStyles(options);
    const used = new Set<number>();
    for (let x = 0; x < 1820; x += 61) {
      for (let y = 0; y < 758; y += 67) {
        used.add(particleHueIndex(noise, x, y, 0, options));
      }
    }
    // Several distinct bands must appear across the canvas
    expect(used.size).toBeGreaterThanOrEqual(4);
    const distinctStyles = new Set([...used].map((i) => styles[i]));
    expect(distinctStyles.size).toBeGreaterThanOrEqual(3);
  });
});