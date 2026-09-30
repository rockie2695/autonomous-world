'use client';

// ============================================================================
// 首頁導覽 / Homepage Navigation
// ============================================================================
// 桌面是 scroll-spy 的錨點列，375px 是選單面板，兩者共用同一組連結資料。
// 選取態不只靠顏色：底線的 scaleX 是獨立的非色彩線索，色盲與灰階都讀得到。
// Desktop is a scroll-spy anchor row; at 375px it becomes a menu panel. Both
// read from the same link data. The selected state is not colour-only: the
// underline's scaleX is an independent non-colour cue.
// ============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createTranslator, setLocale, type Locale } from '@/lib/i18n';
import { CTA_BASE, CTA_PRIMARY, EYEBROW } from './tokens';

type HomeNavProps = {
  locale: Locale;
  links: ReadonlyArray<{ href: string; label: string }>;
  enterLabel: string;
  brandLabel: string;
};

/** 錨點列的連結基底 / base for an anchor in the desktop row */
const LINK_BASE =
  'ds-nav-underline inline-flex min-h-11 items-center rounded-lg px-3 text-[0.9375rem] ' +
  'text-slate-200 no-underline transition-colors duration-200 ' +
  'hover:text-cyan-200 aria-current:text-white';

/** 行動版選單的連結 / a link inside the mobile menu */
const MENU_LINK =
  'flex min-h-11 items-center border-b border-ds-line px-5 text-base text-slate-200 no-underline ' +
  'aria-current:text-ds-cyan aria-current:shadow-[inset_3px_0_0_var(--color-ds-cyan)]';

export default function HomeNav({ locale, links, enterLabel, brandLabel }: HomeNavProps) {
  const t = createTranslator(locale);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Scroll-spy：盯著每個錨點對應的區段 ────────────────────────────────
  useEffect(() => {
    const sections = links
      .map((link) => document.querySelector<HTMLElement>(link.href))
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
      // 只在視窗中間那條帶子上判定，捲動時選取態才不會來回跳
      // Judge inside a narrow band so the state cannot flicker while scrolling
      { rootMargin: '-25% 0px -60% 0px', threshold: 0 }
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [links]);

  // ── 行動版選單：Esc 關閉 + 鎖住背景捲動 ─────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const nextLocale: Locale = locale === 'zh' ? 'en' : 'zh';
  const nextLocaleLabel = nextLocale === 'en' ? t('general.english') : t('general.chinese');

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#020617]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={brandLabel}>
          <span
            className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
            aria-hidden="true"
          >
            <svg className="size-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.5-6.5L17 7m-10 10-1.5 1.5M20.5 17.5 19 17M5 7 3.5 5.5" />
            </svg>
          </span>
          <span className="font-orbitron hidden min-w-0 truncate text-sm font-bold tracking-[0.18em] text-white sm:inline md:text-base">
            AUTONOMOUS WORLD
          </span>
        </Link>

        {/* 桌面導覽 / desktop navigation */}
        <nav aria-label={t('home.nav.menuLabel')} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={LINK_BASE}
              aria-current={active === link.href ? 'true' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setLocale(nextLocale)}
            className={`${LINK_BASE} ${EYEBROW} tracking-[0.12em]`}
            aria-label={`${t('general.language')}: ${nextLocaleLabel}`}
          >
            {nextLocaleLabel}
          </button>

          <Link
            href="/api/auth/signin"
            className="hidden rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5 text-sm font-medium text-cyan-300 transition-colors duration-200 hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-200 sm:inline-flex"
          >
            {enterLabel}
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex size-11 items-center justify-center rounded-lg border border-cyan-500/30 text-cyan-300 transition-colors duration-200 hover:border-cyan-400/60 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="hp-mobile-menu"
            aria-label={menuOpen ? t('home.nav.closeMenu') : t('home.nav.openMenu')}
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 行動版選單：375px 下所有錨點與主要 CTA 都在這裡
          Mobile menu: every anchor and the primary CTA live here at 375px */}
      {menuOpen ? (
        <div
          id="hp-mobile-menu"
          className="border-t border-ds-line bg-[#020617]/95 backdrop-blur-[12px] md:hidden"
        >
          <nav aria-label={t('home.nav.menuLabel')}>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={MENU_LINK}
                aria-current={active === link.href ? 'true' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="px-5 py-4">
            <Link
              href="/api/auth/signin"
              onClick={() => setMenuOpen(false)}
              className={`${CTA_BASE} ${CTA_PRIMARY} w-full shadow-[0_0_30px_rgba(34,211,238,0.3)]`}
            >
              {enterLabel}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
