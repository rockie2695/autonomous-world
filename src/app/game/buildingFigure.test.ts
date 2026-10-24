// ============================================================================
// BuildingFigure 幾何測試（node 環境，無 DOM）/ BuildingFigure geometry tests
// ============================================================================
// 元件的場景是**純資料 + 純投影**，所以這些不變式可以在沒有 DOM 的環境下釘住：
// 同輸入同輸出（等距圖必須可重現）、逐級只增不減、幽靈恰好是下一級的增量、
// 每個面都落在 viewBox 內（否則彈窗裡會被裁掉）。
//
// The scene is pure data plus a pure projection, so these invariants pin it
// without a DOM: same input same output (the figure must be reproducible),
// levels only add, the ghost is exactly the next level's increment, and every
// face stays inside the viewBox (anything outside is clipped away in the popup).
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  figureFaces,
  figureGhostFaces,
  figureGhostPrims,
  figurePrims,
} from './BuildingFigure';

const KINDS = ['fortress', 'market', 'barracks'] as const;

/** 數出 prim 陣列裡的地面類平板 / Count the ground-level slabs in a prim list */
const countUnder = (prims: ReturnType<typeof figurePrims>) =>
  prims.filter((p) => p.under === true).length;

describe('BuildingFigure geometry', () => {
  it('is deterministic — the same input yields the same faces', () => {
    for (const kind of KINDS) {
      for (let level = 0; level <= 5; level++) {
        expect(JSON.stringify(figureFaces(kind, level))).toBe(
          JSON.stringify(figureFaces(kind, level))
        );
      }
    }
  });

  it('grows monotonically — each level only adds, never removes', () => {
    for (const kind of KINDS) {
      let prev = 0;
      for (let level = 0; level <= 5; level++) {
        const n = figurePrims(kind, level).length;
        expect(n).toBeGreaterThanOrEqual(prev);
        // 每一級的增量都不是空的：升級必須看得見東西長出來
        // No level's increment is empty: an upgrade must visibly grow something
        if (level > 0) expect(n).toBeGreaterThan(prev);
        prev = n;
      }
    }
  });

  it('the ghost is exactly the next level\u2019s non-floor additions', () => {
    for (const kind of KINDS) {
      for (let level = 0; level < 5; level++) {
        const ghost = figureGhostPrims(kind, level);
        expect(ghost.length).toBeGreaterThan(0);
        // 場景差 = 增量（含地面類平板）；幽靈刻意**排除**地面類平板——
        // 廣場地坪的虛線菱形會蓋住整個場景，噪聲大於資訊
        // The scene delta is the increment (floor slabs included); the ghost
        // deliberately **excludes** them — a dashed plaza diamond over the whole
        // scene is noise, not information
        const next = figurePrims(kind, level + 1);
        const cur = figurePrims(kind, level);
        const underAdded = countUnder(next) - countUnder(cur);
        expect(ghost.length).toBe(next.length - cur.length - underAdded);
        for (const p of ghost) expect(p.under).not.toBe(true);
      }
      // 滿級沒有幽靈 / No ghost at max level
      expect(figureGhostPrims('fortress', 5)).toEqual([]);
      expect(figureGhostFaces('fortress', 5)).toEqual([]);
    }
  });

  it('keeps every face inside the viewBox (with stroke margin)', () => {
    for (const kind of KINDS) {
      for (let level = 0; level <= 5; level++) {
        const faces = [...figureFaces(kind, level), ...figureGhostFaces(kind, level)];
        expect(faces.length).toBeGreaterThan(0);
        for (const f of faces) {
          expect(f.pts.length).toBeGreaterThanOrEqual(3);
          for (const [x, y] of f.pts) {
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
            expect(x).toBeGreaterThan(-1);
            expect(x).toBeLessThan(101);
            expect(y).toBeGreaterThan(-1);
            expect(y).toBeLessThan(69);
          }
        }
      }
    }
  });

  it('clamps out-of-range levels to 0..5', () => {
    expect(figurePrims('fortress', -3)).toEqual(figurePrims('fortress', 0));
    expect(figurePrims('fortress', 99)).toEqual(figurePrims('fortress', 5));
    expect(figurePrims('market', 2.7)).toEqual(figurePrims('market', 3));
  });
});
