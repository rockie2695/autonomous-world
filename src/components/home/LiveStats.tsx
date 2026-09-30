'use client';

// ============================================================================
// 即時世界數字 / Live World Numbers
// ============================================================================
// 舊版這裡是四個寫死的展示值（100+ / 10+ / 500+ / 1000+）。那些數字沒有任何
// 來源，是首頁最大的可信度漏洞：整頁都在講「這個世界真的在跑」，唯一的證據
// 卻是編的。這裡每一格都是 /api/public/world 的真實計數，數字變了會閃一下。
// The old section showed four hardcoded display values. Nothing sourced them,
// which was this page's biggest credibility hole: the whole page claims the
// world is really running, and the only evidence was invented. Every cell here
// is a real count, and it flashes when a value changes.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { usePublicWorld } from './usePublicWorld';
import { createTranslator, type Locale } from '@/lib/i18n';
import { PANEL } from './tokens';

type LiveStatsProps = {
  locale: Locale;
};

/** 數字變動提示的持續時間 / how long the change flash stays up */
const FLASH_MS = 700;

/** 骨架格數量與正式格數一致，切換時版面不會跳 / matches the real cell count so the layout never jumps */
const SKELETON_CELLS = 6;

/** 正在跳動的指示燈：純 utility，沒有自訂類別
    the pulsing live dot, expressed purely with utilities */
const LIVE_DOT =
  'relative inline-block size-2 shrink-0 rounded-full bg-ds-cyan ' +
  'after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-ds-cyan after:content-[""]';

export default function LiveStats({ locale }: LiveStatsProps) {
  const t = createTranslator(locale);
  const { payload, status } = usePublicWorld();

  const previous = useRef<Record<string, number> | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());

  // 比較只吃 payload，不吃 t（翻譯函式每次 render 都是新的，放進依賴會迴圈）
  // The comparison reads only the payload — t() is a new function on every
  // render and would loop if it were a dependency.
  useEffect(() => {
    if (!payload) return;
    const now: Record<string, number> = {
      round: payload.world.round,
      factions: payload.counts.factions,
      characters: payload.counts.characters,
      places: payload.counts.places,
      troops: payload.counts.troops,
      roads: payload.counts.roads,
    };
    const before = previous.current;
    previous.current = now;
    if (!before) return;

    const diff = new Set<string>();
    for (const [key, value] of Object.entries(now)) {
      if (before[key] !== value) diff.add(key);
    }
    if (diff.size === 0) return;

    setChanged(diff);
    const timer = setTimeout(() => setChanged(new Set()), FLASH_MS);
    return () => clearTimeout(timer);
  }, [payload]);

  // ── 讀不到：失敗 / Unreachable: failure ───────────────────────────────────
  if (status === 'error') {
    return (
      <div className={`${PANEL} p-6`} role="alert">
        <p className="text-base font-semibold text-white">{t('home.live.unavailable')}</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-slate-400">
          {t('home.live.unavailableHint')}
        </p>
      </div>
    );
  }

  // ── 世界還沒啟動（404）/ The world has not started (404) ─────────────────
  if (status === 'empty') {
    return (
      <div className={`${PANEL} p-6`}>
        <p className="text-base font-semibold text-white">{t('home.world.graphEmpty')}</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-slate-400">
          {t('home.live.unavailableHint')}
        </p>
      </div>
    );
  }

  // ── 載入中：骨架而不是裸 spinner / Loading: skeleton, never a bare spinner
  if (!payload) {
    return (
      <div role="status">
        <p className="sr-only">{t('general.loading')}</p>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          aria-hidden="true"
        >
          {Array.from({ length: SKELETON_CELLS }, (_, index) => (
            <div key={index} className="ds-gm-skel h-[5.5rem] w-full" />
          ))}
        </div>
      </div>
    );
  }

  const cells = [
    { key: 'round', value: payload.world.round, label: t('home.stats.rounds') },
    { key: 'factions', value: payload.counts.factions, label: t('home.stats.factions') },
    { key: 'characters', value: payload.counts.characters, label: t('home.stats.characters') },
    { key: 'places', value: payload.counts.places, label: t('home.stats.places') },
    { key: 'troops', value: payload.counts.troops, label: t('faction.totalTroops') },
    { key: 'roads', value: payload.counts.roads, label: t('home.live.roads') },
  ];

  const stamp = new Date(payload.generatedAt);
  const time = Number.isNaN(stamp.getTime())
    ? ''
    : stamp.toLocaleTimeString(locale === 'zh' ? 'zh-TW' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

  return (
    <div>
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        role="group"
        aria-label={t('home.live.title')}
      >
        {cells.map((cell) => (
          // 數字與它的說明各自成行，不塞成同一行的兩個 span
          // The numeral and its caption are separate block lines, never two
          // sibling inline spans sharing one box
          <div
            key={cell.key}
            className="block rounded-ds-control border border-ds-line bg-slate-900/50 px-3.5 py-4 text-center"
          >
            <span
              className="block font-orbitron text-[clamp(1.5rem,3.4vw,2rem)] leading-[1.2] font-bold text-slate-50 tabular-nums whitespace-nowrap data-changed:animate-ds-bump"
              data-changed={changed.has(cell.key) ? 'true' : undefined}
            >
              {cell.value.toLocaleString(locale === 'zh' ? 'zh-TW' : 'en-US')}
            </span>
            <span className="mt-1 block text-ds-label leading-[1.4] text-slate-200">
              {cell.label}
            </span>
          </div>
        ))}
      </div>

      {/* 資料擷取時間：讓讀者知道這不是寫死的數字 / proves the numbers are not hardcoded */}
      <p className="mt-4 flex flex-wrap items-center gap-2 text-ds-label text-slate-400">
        <span className={LIVE_DOT} aria-hidden="true" />
        <span className="font-orbitron tracking-[0.18em] text-cyan-300 uppercase">
          {t('home.feed.live')}
        </span>
        {time ? <span>{t('home.live.updated', { time })}</span> : null}
      </p>
    </div>
  );
}
