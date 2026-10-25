'use client';

// ============================================================================
// 區段圓點導覽 / Section Dot Rail
// ============================================================================
// 首頁是一疊「一屏一屏」的簡報（見 globals.css 的 scroll-snap 規則），右側的
// 圓點就是這疊紙的書籤：讀者所在的那一屏亮起青色，點任一顆就跳到那一屏。
//
// 幾件事是刻意的 / A few things are deliberate:
//   - 圓點很小，所以每一顆都帶著自己的名字，滑過或鍵盤聚焦時從左側浮出；
//     名字是 `pointer-events-none` 的絕對定位元素，否則那塊看不見的區域會蓋在
//     頁面右緣上、吃掉底下的點擊。
//   - 每一顆都是真的連結（`<a href="#…">`），不是裝飾：沒有 JS 也跳得動，
//     而且焦點順序、螢幕閱讀器都讀得到名字。
//   - 點擊交給 `scrollIntoView` 而不是瀏覽器預設，只有這樣 `prefers-reduced-motion`
//     才能真的等於「不要動畫」（行為設成 auto）。
//   - A dot is small, so each carries its own name, revealed from the left on
//     hover or keyboard focus; the name is an absolutely positioned
//     `pointer-events-none` element, or that invisible box would cover the
//     page's right edge and eat the clicks underneath.
//   - Every dot is a real link (`<a href="#…">`), not decoration: it still
//     jumps without JS, and focus order and screen readers both get the name.
//   - The click goes through `scrollIntoView` rather than the browser default,
//     which is the only way `prefers-reduced-motion` can mean "no animation"
//     (behaviour set to auto).
// ============================================================================

import { useReducedMotion } from 'motion/react';
import { useActiveSection } from './useActiveSection';

type SlideDotsProps = {
  slides: ReadonlyArray<{ href: string; label: string }>;
  /** 這條導覽的無障礙名稱 / the rail's accessible name */
  label: string;
};

export default function SlideDots({ slides, label }: SlideDotsProps) {
  const active = useActiveSection(slides.map((slide) => slide.href));
  const reduce = useReducedMotion();

  return (
    <nav
      aria-label={label}
      // 只在 md 以上出現：手機版的右緣已經有選單鍵與地圖控制，再放八顆圓點只會擠
      // Only from md up: on a phone the right edge already holds the menu button
      // and the map controls, and eight more dots would only crowd it
      className="fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 md:block"
    >
      <ul className="flex flex-col items-end">
        {slides.map((slide) => {
          const isActive = active === slide.href;
          return (
            <li key={slide.href}>
              <a
                href={slide.href}
                aria-current={isActive ? 'true' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .querySelector<HTMLElement>(slide.href)
                    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
                }}
                className="group relative flex min-h-11 min-w-11 items-center justify-end pr-1"
              >
                {/* 名字：浮在圓點左側，只在滑過／聚焦時出現 / the name, to the
                    dot's left, only while hovered or focused */}
                <span className="pointer-events-none absolute right-full mr-2 rounded-md border border-white/10 bg-[#020617]/85 px-2 py-1 text-xs whitespace-nowrap text-slate-200 opacity-0 backdrop-blur-[6px] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {slide.label}
                </span>
                {/* 選取態不只靠顏色：作用中的圓點同時放大並發光 /
                    The selected state is not colour-only: the active dot also
                    scales up and glows */}
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full transition-all duration-200 ${
                    isActive
                      ? 'scale-125 bg-ds-cyan shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                      : 'bg-slate-500/70 group-hover:bg-slate-300'
                  }`}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
