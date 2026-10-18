import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 勢力名的定位：錨點、旋轉、與 CSS 的 `transform-origin`。
 * Faction-name placement: the anchor, the rotation, and the CSS `transform-origin`.
 *
 * **這個 bug 沒有任何純邏輯測試抓得到。** 幾何是對的 —— `factionRegions` 回傳的矩形經過
 * 驗證、座標系也與繪製一致 —— 問題出在 CSS：span 上的變換鏈是
 * `translate(anchor) rotate(deg) translate(-50%, -50%)`，而 `transform-origin` 預設是
 * `50% 50%`，於是整條鏈（含最後那個置中用的位移）都繞元素自己的中心旋轉。
 *
 * **No pure-logic test could catch this one.** The geometry was correct — `factionRegions`
 * returns a verified rectangle measured in the frame the name is drawn in — the bug was in
 * CSS: the span's chain is `translate(anchor) rotate(deg) translate(-50%, -50%)`, and because
 * `transform-origin` defaults to `50% 50%`, the whole chain *including the centring shift* is
 * rotated about the element's own centre.
 *
 * 位移量是 `(R(deg) − I)·(−hw, −hh)`：deg = 0 時**剛好為 0**，所以未旋轉的名字一直正常，
 * 一旦轉起來偏移就和名字本身一樣大。實測一個 62×14、四字、−78° 的名字偏了 (17.7, 35.9)px，
 * 整個跑到領地外面 —— 正是「勢力名沒有完整落在領地裡」。
 *
 * The displacement is `(R(deg) − I)·(−hw, −hh)`: exactly **0 at deg = 0**, which is why
 * unrotated names were always fine, and as large as the name itself once rotated. Measured on
 * a 62×14, four-glyph, −78° name: (17.7, 35.9)px, entirely off its claim — precisely
 * "the faction name is not fully inside the faction area".
 *
 * 所以這個測試守的是**那一行宣告**。專案的 vitest 跑在 `node` 環境、沒有 DOM，渲染不出
 * transform；但漏掉 `origin-top-left` 就會讓名字錯位，而錯位在截圖裡看不出是 CSS 造成的。
 * 這是刻意選擇的守門方式，不是偷懶。
 *
 * So this test guards **that one declaration**. The project's vitest runs under `node` with no
 * DOM and cannot render a transform, but dropping `origin-top-left` silently displaces the
 * name — and a displaced name looks like a geometry bug, not a CSS one. This is a deliberate
 * choice about what can be guarded here, not a shortcut.
 */
describe('territory label placement', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/SigmaMap.tsx'), 'utf8');

  it('should pin the label span transform-origin to the top-left corner', () => {
    // 找出勢力名的 span：它由 territoryLabelEls 綁定，開標籤在那一行之前 /
    // Find the faction-name span: the one bound to territoryLabelEls, whose opening tag sits
    // just above that line
    const at = source.indexOf('territoryLabelEls.current[index]');
    expect(at, 'could not find the faction-label span binding in SigmaMap.tsx').toBeGreaterThan(0);
    const open = source.lastIndexOf('<span', at);
    const close = source.indexOf('>', at);
    expect(open).toBeGreaterThan(0);
    expect(close).toBeGreaterThan(at);
    const markup = source.slice(open, close + 1);

    expect(
      markup,
      'the faction-label span must set transform-origin: 0 0 (Tailwind `origin-top-left`). ' +
        'Without it `translate(-50%, -50%)` is itself rotated about the element centre, ' +
        'displacing a rotated name by (R(deg) - I)·(-hw, -hh) — zero when unrotated, and as ' +
        'large as the name once rotated.'
    ).toMatch(/origin-top-left|transformOrigin:\s*['"]0 0['"]/);
  });

  it('should keep the centring shift last, so it is applied before the rotation', () => {
    // 順序有意義：translate(-50%,-50%) 必須在**最內層**，這樣它作用於未旋轉的座標系 /
    // The order matters: translate(-50%, -50%) must be innermost, so it acts in the
    // unrotated frame
    const t = /el\.style\.transform = `([^`]+)`/.exec(source);
    expect(t, 'could not find the label transform assignment').not.toBeNull();
    const value = t![1]!;
    expect(value.indexOf('-50%')).toBeGreaterThan(value.indexOf('rotate('));
    expect(value.indexOf('-50%')).toBeGreaterThan(value.lastIndexOf('translate(') - 1);
  });
});