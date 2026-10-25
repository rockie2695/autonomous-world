'use client';

// ============================================================================
// 目前所在區段 / The Section Currently On Screen
// ============================================================================
// 標頭的導覽列與右側的圓點導覽列都要知道「讀者現在在哪一屏」，所以這條規則只
// 寫一次。判定只在視窗中間那條帶子上做，捲動時選取態才不會來回跳。
// The header's nav row and the right-hand dot rail both need to know which
// screen the reader is on, so the rule is written once. Judgement happens on a
// narrow band in the middle of the viewport, so the state cannot flicker while
// scrolling.
// ============================================================================

import { useEffect, useState } from 'react';

/**
 * 判定帶：視窗上緣往下一點、下緣往上很多，於是「選取態」落在讀者正在讀的那一屏。
 * The band: a little below the viewport's top and a long way above its bottom, so
 * the selected state lands on the screen being read.
 */
const BAND = '-25% 0px -60% 0px';

/**
 * 回傳目前最靠上的可見區段（`#id`），沒有則 null。
 * The topmost visible section as `#id`, or null when none is in the band.
 */
export function useActiveSection(hrefs: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  // hrefs 每次 render 都是新的陣列，所以用 join 出來的字串當 effect 的鍵 /
  // hrefs is a fresh array each render, so the joined string is the effect's key
  const key = hrefs.join('|');

  useEffect(() => {
    const sections = key
      .split('|')
      .map((href) => document.querySelector<HTMLElement>(href))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 取最靠上的可見區段，避免下半屏的區段搶走選取態
        // The topmost visible section wins, so a lower one cannot steal the state
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActive(`#${(first.target as HTMLElement).id}`);
      },
      { rootMargin: BAND, threshold: 0 }
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [key]);

  return active;
}
