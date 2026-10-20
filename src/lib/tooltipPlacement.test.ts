import { describe, expect, it } from 'vitest';
import { placeTooltip } from './tooltipPlacement';

const W = 1200;
const H = 800;
const GAP = 8;

describe('placeTooltip — cursor anchor', () => {
  it('a cursor in the top half is served from BELOW with its top-left near the cursor', () => {
    const p = placeTooltip({
      ax: 500, ay: 120, panelW: 272, panelH: 96, boxW: W, boxH: H, gap: GAP, anchor: 'cursor',
    });
    // 上半部：面板在下方，左上角 = 光標 + gap /
    // Top half: the panel sits below, its top-left at cursor + gap
    expect(p.above).toBe(false);
    expect(p.x).toBe(500 + GAP);
    expect(p.y).toBe(120 + GAP);
  });

  it('flips ABOVE only when below would overflow the bottom', () => {
    const p = placeTooltip({
      ax: 500, ay: H - 40, panelW: 272, panelH: 96, boxW: W, boxH: H, gap: GAP, anchor: 'cursor',
    });
    expect(p.above).toBe(true);
    expect(p.y).toBe(H - 40 - GAP - 96);
  });

  it('flips LEFT when the panel would overflow the right edge', () => {
    const p = placeTooltip({
      ax: W - 30, ay: 120, panelW: 272, panelH: 96, boxW: W, boxH: H, gap: GAP, anchor: 'cursor',
    });
    // 右側放不下 → 右緣貼光標左側 /
    // The right edge hugs the cursor's left
    expect(p.x).toBe(W - 30 - GAP - 272);
  });

  it('clamps inside the box when even the flipped position overflows', () => {
    const p = placeTooltip({
      ax: 10, ay: 120, panelW: 272, panelH: 96, boxW: 200, boxH: H, gap: GAP, anchor: 'cursor',
    });
    // 面板比框寬 → 夾回 0 /
    // The panel is wider than the box → clamped to 0
    expect(p.x).toBe(0);
  });
});

describe('placeTooltip — element anchor', () => {
  it('centres on the element below it, clamped inside the box', () => {
    const p = placeTooltip({
      ax: 600, ay: 300, panelW: 272, panelH: 96, boxW: W, boxH: H, gap: GAP, anchor: 'element',
    });
    expect(p.above).toBe(false);
    expect(p.x).toBe(600 - 136);
    expect(p.y).toBe(300 + GAP);
  });

  it('an element near the top is still served from below (the top-half rule)', () => {
    const p = placeTooltip({
      ax: 600, ay: 30, panelW: 272, panelH: 96, boxW: W, boxH: H, gap: GAP, anchor: 'element',
    });
    expect(p.above).toBe(false);
    expect(p.y).toBe(30 + GAP);
  });
});

describe('placeTooltip — no room on either side', () => {
  it('takes the side with more room', () => {
    // 錨點在正中：下方剩 392 > 上方 292 → 下方 /
    // Anchor mid-screen: 392 below > 292 above → below
    const p = placeTooltip({
      ax: 600, ay: 400, panelW: 272, panelH: 500, boxW: W, boxH: H, gap: GAP, anchor: 'cursor',
    });
    expect(p.above).toBe(false);
    // 錨點靠下：下方 32 < 上方 692 → 上方 /
    // Anchor low: 32 below < 692 above → above
    const p2 = placeTooltip({
      ax: 600, ay: 760, panelW: 272, panelH: 500, boxW: W, boxH: H, gap: GAP, anchor: 'cursor',
    });
    expect(p2.above).toBe(true);
  });
});
