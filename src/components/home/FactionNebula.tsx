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
// 無障礙語意放在外層：畫布本身對讀螢幕軟體無意義，aria-label 描述的是「每個
// 光點是一座據點、顏色是勢力」這件事，勢力名稱與數字則在 #live 的統計格與
// #world 的圖例裡，三者不重複。
// The accessibility semantics live out here: the canvas itself means nothing to
// a screen reader, the aria-label describes what a point is, and the faction
// names and counts live in the #live stat grid and the #world legend — so the
// same information is never said twice.
// ============================================================================

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { usePublicWorld } from './usePublicWorld';
import { createTranslator, type Locale } from '@/lib/i18n';

type FactionNebulaProps = {
  /** 由 server component 依 cookie 決定，避免 hydration 時閃爍語言
   *  resolved server-side from the cookie so hydration never flashes a language */
  locale: Locale;
};

/**
 * 載入骨架：純 Tailwind utility，不依賴任何自訂類別。
 * 這是刻意不寫 `.ds-gm-skel` 的——那個類別在 Tailwind 遷移時已被移除。
 * The loading skeleton is pure Tailwind utilities and depends on no bespoke
 * class. It deliberately avoids `.ds-gm-skel`, which the Tailwind migration
 * removed along with the rest of the custom class layer.
 */
const SKELETON =
  'relative overflow-hidden bg-[rgba(148,163,184,0.08)] ' +
  "after:absolute after:inset-0 after:-translate-x-full after:content-[''] " +
  'after:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.14),transparent)] ' +
  'after:animate-ds-shimmer';

const FactionNebulaScene = dynamic(() => import('./FactionNebulaScene'), {
  ssr: false,
  loading: () => (
    // 絕不只顯示裸 spinner / never a bare spinner
    <div className={`${SKELETON} size-full`} aria-hidden="true" />
  ),
});

export default function FactionNebula({ locale }: FactionNebulaProps) {
  const t = createTranslator(locale);
  const { payload, status } = usePublicWorld();

  // 場景只在 payload 換掉時重建，這個參考必須穩定
  // The scene rebuilds only when the payload changes, so this must stay stable
  const factions = useMemo(() => payload?.factions ?? [], [payload]);
  const unowned = payload?.counts.unownedPlaces ?? 0;

  const hasData = factions.length > 0 || unowned > 0;

  return (
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
  );
}
