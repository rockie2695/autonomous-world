'use client';

// ============================================================================
// 勢力星雲外框 / Faction Nebula Frame
// ============================================================================
// three.js 場景只能在瀏覽器跑，所以用 dynamic + ssr:false 延後載入；這個檔案
// 本身不 import three，所以星雲的程式碼不會被拉進首頁主要的 bundle。
//
// The three.js scene can only run in the browser, so it loads through dynamic +
// ssr:false. This frame never imports three itself, so the nebula's code stays
// out of the homepage's main bundle.
//
// 畫布本身對讀螢幕軟體無意義，aria-label 只負責說明「每個光點是一座據點、顏色
// 代表勢力」。勢力的名稱、據點數與色票放在星雲正下方的清單，而不是畫進畫布：HTML
// 文字在 375px 上還讀得清楚、可以選取、也能被逐項念出來；而且勢力成長動畫改變的
// 是光點的數量，不是文字的位置，標籤不需要跟著重新投影。
//
// The canvas means nothing to a screen reader, so the aria-label only carries
// what a point is. Names, place counts and swatches sit in a list under the band
// rather than being painted into the canvas: HTML text stays legible at 375px, is
// selectable, and can be announced item by item. The growth animation changes how
// many points there are, not where any text sits, so the labels never need
// reprojecting.
// ============================================================================

import dynamic from 'next/dynamic';
import { useId, useMemo } from 'react';
import { usePublicWorld } from './usePublicWorld';
import { useChangedKeys } from './useChangedKeys';
import { SKELETON, UNOWNED_COLOR } from './tokens';
import { createTranslator, type Locale } from '@/lib/i18n';

type FactionNebulaProps = {
  /** 由 server component 依 cookie 決定，避免 hydration 時閃爍語言
   *  resolved server-side from the cookie so hydration never flashes a language */
  locale: Locale;
};

const FactionNebulaScene = dynamic(() => import('./FactionNebulaScene'), {
  ssr: false,
  loading: () => (
    // 絕不只顯示裸 spinner / never a bare spinner
    <div className={`${SKELETON} size-full`} aria-hidden="true" />
  ),
});

/** 數字變動提示的持續時間，與 #live 統計格同一個節奏
 *  how long the change flash stays up, matched to the #live stat cells */
const FLASH_MS = 700;

/** 無主勢力在變動比較表裡的鍵 / the unclaimed faction's key in the change diff */
const UNOWNED_KEY = '__unowned__';

/** 圖例項目 / one legend entry */
const LEGEND_ITEM =
  'flex items-center gap-2 rounded-full border border-ds-line bg-slate-900/55 px-2.5 py-1.5 ' +
  'text-ds-label leading-[1.4] text-slate-100';

/** 色票 / the colour chip */
const LEGEND_SWATCH = 'size-2.5 shrink-0 rounded-[3px] shadow-[0_0_8px_currentColor]';

export default function FactionNebula({ locale }: FactionNebulaProps) {
  const t = createTranslator(locale);
  const { payload, status } = usePublicWorld();
  const legendId = useId();

  // 場景只在 payload 換掉時重建，這個參考必須穩定
  // The scene rebuilds only when the payload changes, so this must stay stable
  const factions = useMemo(() => payload?.factions ?? [], [payload]);
  const unowned = payload?.counts.unownedPlaces ?? 0;

  const hasData = factions.length > 0 || unowned > 0;

  // 據點數變了就閃一下：名字旁邊的數字跟星雲由內向外生長的動畫對得起來
  // Flash on a place-count change so the number beside each name reads together
  // with its cloud growing outward from the core.
  // useMemo 保證 payload 沒變時快照是同一個參考，diff 才不會每個 render 重跑
  // useMemo keeps the snapshot referentially stable while the payload is
  // unchanged, otherwise the diff would rerun on every render.
  const snapshot = useMemo(() => {
    if (!payload) return null;
    const now: Record<string, number> = {
      [UNOWNED_KEY]: payload.counts.unownedPlaces,
    };
    for (const faction of payload.factions) now[faction.id] = faction.places;
    return now;
  }, [payload]);

  // 新冒出來的勢力不閃：它沒有舊值可以比較 /
  // A faction that just appeared does not flash — it has no previous value
  const changed = useChangedKeys(snapshot, FLASH_MS, true);

  // 一份資料同時餵給圖例與場景，兩邊不可能對不上
  // One list feeds both the legend and the scene, so the two cannot disagree
  const entries = factions.map((faction) => ({
    id: faction.id,
    name: faction.name,
    color: faction.color,
    places: faction.places,
  }));

  if (unowned > 0) {
    entries.push({
      id: UNOWNED_KEY,
      name: t('home.live.unownedFaction'),
      color: UNOWNED_COLOR,
      places: unowned,
    });
  }

  return (
    <div>
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-ds-panel border border-ds-line bg-ds-void">
        {hasData ? (
          <div role="img" aria-label={t('home.world.graphLabel')} className="size-full">
            <FactionNebulaScene factions={factions} unowned={unowned} />
          </div>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[0.9375rem] leading-relaxed text-slate-400">
            {status === 'error' ? t('home.live.unavailableHint') : t('home.world.graphEmpty')}
          </p>
        )}
      </div>

      {/* 勢力圖例：色票、名稱、據點數、名稱即時更新 / the legend: swatch, name and
          live place count, so the colour on the band always resolves to a name */}
      {hasData ? (
        <div className="mt-4">
          <p
            id={legendId}
            className="font-orbitron text-ds-label font-semibold tracking-[0.2em] text-slate-400 uppercase"
          >
            {t('home.world.legendTitle')}
          </p>

          <ul aria-labelledby={legendId} className="mt-3 flex flex-wrap gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className={LEGEND_ITEM}>
                {/* 勢力色是執行期資料，這裡的 inline style 是唯一被允許的例外
                    Faction colour is runtime data — this inline style is the one
                    sanctioned exception to "no inline styles" */}
                <span
                  className={LEGEND_SWATCH}
                  style={{ backgroundColor: entry.color, color: entry.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{entry.name}</span>
                <span
                  className="text-slate-400 tabular-nums data-changed:animate-ds-bump"
                  data-changed={changed.has(entry.id) ? 'true' : undefined}
                >
                  {entry.places.toLocaleString(locale === 'zh' ? 'zh-TW' : 'en-US')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
