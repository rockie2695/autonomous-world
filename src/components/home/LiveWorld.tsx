'use client';

// ============================================================================
// 活著的世界 — 圖譜 + 勢力圖例 / Living World — Graph + Faction Legend
// ============================================================================
// 這一塊取代舊版的行星球。行星跟產品無關；這裡畫的是資料庫裡此刻真實的
// 據點分佈，顏色是勢力自己的色票，右側圖例直接列出存活勢力。
// This replaced the old planet. A planet was unrelated to the product; this
// renders the settlements that actually exist right now, coloured by each
// faction's own stored colour, with the surviving roster listed beside it.
// ============================================================================

import { useMemo } from 'react';
import WorldGraph from './WorldGraph';
import { usePublicWorld } from './usePublicWorld';
import { createTranslator, type Locale } from '@/lib/i18n';

type LiveWorldProps = {
  /** 由 server component 依 cookie 決定，避免 hydration 時閃爍語言
   * resolved server-side from the cookie so hydration never flashes a language */
  locale: Locale;
};

/** 圖例項目 / one legend entry */
const LEGEND_ITEM =
  'flex items-center gap-2 rounded-full border border-ds-line bg-slate-900/55 px-2.5 py-1.5 ' +
  'text-ds-label leading-[1.4] text-slate-100';

export default function LiveWorld({ locale }: LiveWorldProps) {
  const t = createTranslator(locale);
  const { payload, status } = usePublicWorld();

  // 場景的資料 effect 只在 payload 換掉時才重建，所以這三個必須穩定
  // The scene rebuilds its geometry only when the payload changes, so these
  // three references have to stay stable between renders.
  const places = useMemo(() => payload?.graph.places ?? [], [payload]);
  const roads = useMemo(() => payload?.graph.roads ?? [], [payload]);
  const colors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const faction of payload?.factions ?? []) {
      map[faction.id] = faction.color;
    }
    return map;
  }, [payload]);

  const unownedCount = payload?.counts.unownedPlaces ?? 0;

  return (
    <div>
      <WorldGraph
        places={places}
        roads={roads}
        colors={colors}
        label={t('home.world.graphLabel')}
        note={
          payload?.graph.truncated
            ? t('home.live.truncated', { shown: places.length, total: payload.counts.places })
            : undefined
        }
      />

      {/* 勢力圖例：名稱與顏色都是資料庫的值，不寫死
          names and colours come from the database, never hardcoded */}
      <div className="mt-6">
        <p className="font-orbitron text-ds-label font-semibold tracking-[0.2em] text-slate-400 uppercase">
          {t('home.world.legendTitle')}
        </p>

        {payload && payload.factions.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {payload.factions.map((faction) => (
              <li key={faction.id} className={LEGEND_ITEM}>
                {/* 勢力色是執行期資料，這裡用 inline style 是唯一被允許的例外
                    Faction colour is runtime data — this inline style is the one
                    sanctioned exception to "no inline styles" */}
                <span
                  className="size-2.5 shrink-0 rounded-[3px] shadow-[0_0_8px_currentColor]"
                  style={{ backgroundColor: faction.color, color: faction.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{faction.name}</span>
                <span className="text-slate-400 tabular-nums">{faction.places}</span>
              </li>
            ))}
            {unownedCount > 0 ? (
              <li className={LEGEND_ITEM}>
                <span
                  className="size-2.5 shrink-0 rounded-[3px] shadow-[0_0_8px_currentColor]"
                  style={{ backgroundColor: '#64748b', color: '#64748b' }}
                  aria-hidden="true"
                />
                <span>{t('home.live.unownedFaction')}</span>
                <span className="text-slate-400 tabular-nums">{unownedCount}</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-slate-400">
            {status === 'error' ? t('home.live.unavailableHint') : t('home.world.graphEmpty')}
          </p>
        )}
      </div>
    </div>
  );
}
