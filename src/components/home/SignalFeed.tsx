'use client';

// ============================================================================
// 訊號流 — 改播真實事件 / Signal Feed — Now Carrying Real Events
// ============================================================================
// 舊版這條帶子是用 t('events.*') 模板加上一組虛構的人名地名跑出來的，旁邊還
// 得貼「示範」兩個字才不算說謊。現在事件直接來自資料庫：真實的將領、真實的
// 據點、真實的回合。「示範」標籤因此可以拿掉。
// The old ticker interpolated t('events.*') templates with invented names and
// needed a "sample" label to stay honest. Events now come straight from the
// database — real characters, real places, real rounds — so the label is gone.
// ============================================================================

import { useMemo } from 'react';
import { usePublicWorld } from './usePublicWorld';
import { createTranslator, type Locale } from '@/lib/i18n';
import type { PublicEvent } from '@/lib/publicWorld';
import { describeEventText, type Translator } from '@/lib/eventText';
import { EYEBROW } from './tokens';

type SignalFeedProps = {
  locale: Locale;
};

/**
 * 事件的句子由 `eventText.ts` 統一供給——與遊戲頁事件日誌同一份規則。缺欄位
 * 的語段整段省略、未知的事件類型回空字串，所以空字串在這裡就等於「這一列不存在」。
 * Sentences come from `eventText.ts` — the same rule the game page's event log
 * uses. Missing fields drop their clause and an unknown event type returns an
 * empty string, so an empty string here simply means "no row".
 */
function formatSignal(event: PublicEvent, t: Translator): string {
  return describeEventText(event.type, event.data, t);
}

export default function SignalFeed({ locale }: SignalFeedProps) {
  const t = createTranslator(locale);
  const { payload, status } = usePublicWorld();

  // 事件格式化要吃翻譯函式，而翻譯函式每次 render 都是新的，所以只在 payload
  // 換掉時重算，否則每 15 秒會無謂地重建字串
  // Formatting needs the translator, which is a new function on every render,
  // so this only recomputes when the payload changes.
  const lines = useMemo(
    () =>
      (payload?.recentEvents ?? [])
        .map((event) => formatSignal(event, t))
        .filter((line) => line.length > 0),
    [payload, locale] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const hasEvents = lines.length > 0;

  return (
    <div className="flex items-center gap-3 border-y border-ds-line bg-[#020617]/70 py-3 backdrop-blur-[6px]">
      <div className="flex w-full min-w-0 items-center gap-3 px-5 sm:px-6">
        <span className={`${EYEBROW} flex shrink-0 items-center gap-2 whitespace-nowrap`}>
          <span
            className="relative inline-block size-2 shrink-0 rounded-full bg-ds-cyan after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-ds-cyan after:content-['']"
            aria-hidden="true"
          />
          {t('home.feed.label')}
        </span>

        {!hasEvents ? (
          // 沒有事件就說沒有，不用假事件填滿這條帶子
          // No events means say so — do not fill the band with invented ones
          <p className="min-w-0 flex-1 truncate text-[0.9375rem] text-slate-400">
            {status === 'loading' ? t('general.loading') : t('home.world.graphEmpty')}
          </p>
        ) : (
          // 軌道要剛好兩份，-50% 的位移才接得上。
          // data-ds-feed-track 是給 hover 暫停用的鉤子，指標限定在
          // @media (hover: hover) 裡。
          // Exactly two copies, so the -50% translate loops seamlessly. The
          // data attribute is the hook for hover-to-pause, gated on real
          // pointers inside @media (hover: hover).
          <div className="min-w-0 flex-1 overflow-hidden" aria-hidden="true">
            <div
              data-ds-feed-track
              className="flex w-max animate-[ds-ticker_52s_linear_infinite]"
            >
              {[0, 1].map((half) => (
                <div key={half} className="flex shrink-0">
                  {lines.map((line, index) => (
                    <span
                      key={`${half}-${index}`}
                      className="mr-10 flex shrink-0 items-center gap-2.5 text-[0.9375rem] whitespace-nowrap text-slate-300"
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                        aria-hidden="true"
                      />
                      {line}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
