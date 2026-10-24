'use client';

// ============================================================================
// 回合管線 / The round pipeline
// ============================================================================
// 「世界如何運轉」那一段下面，真正的內容：**一回合跑的 18 個階段**，照著伺服器
// 真的執行順序排列，分成四個段落。這不是示意圖——地圖上每一次佔領、每一次叛變，
// 都是這串階段依序算出來的。
//
// Under "how the world works", the real content: the **18 phases a round runs**, in
// the order the server actually runs them, grouped into four movements. This is
// not a diagram of the idea - every capture and every defection on the map is
// computed by exactly this sequence.
//
// 階段清單來自 `src/lib/roundPhases.ts`（**單一來源**）：伺服器用它計時，這張圖
// 用它畫，檢查器用它顯示。三處各寫一份的話，圖上就會出現伺服器根本沒跑的階段。
//
// The phase list comes from `src/lib/roundPhases.ts` (**one source**): the server
// times them, this diagram draws them, the inspector shows them. Written twice,
// the diagram would show a phase the server never runs.
// ============================================================================

import { createTranslator, type Locale } from '@/lib/i18n';
import { ROUND_PHASES, ROUND_PHASE_GROUPS, type RoundPhaseGroup } from '@/lib/roundPhases';

/** 每個段落包含哪些階段 / Which phases each movement contains */
const GROUP_PHASES: Record<RoundPhaseGroup, string[]> = {
  world: [],
  simulation: [],
  aftermath: [],
  persistence: [],
};
for (const phase of ROUND_PHASES) {
  GROUP_PHASES[phase.group].push(phase.id);
}

/** 段落的 i18n 鍵 / The i18n key of each movement */
const GROUP_LABEL: Record<RoundPhaseGroup, string> = {
  world: 'phases.groupWorld',
  simulation: 'phases.groupSimulation',
  aftermath: 'phases.groupAftermath',
  persistence: 'phases.groupPersistence',
};

// locale 由呼叫端帶入，不用模組層的環境 t()：那個在 server render 時解析成預設
// 語系，英文版首屏會是英文、注水後變中文，React 判定 hydration 失敗並重建整棵樹。
// 其他首頁元件都收 locale 這個 prop，這支只是漏了。
// The locale comes in as a prop rather than from the ambient t(): during SSR the
// ambient one resolves to the default locale, so an English page renders English
// and then hydrates to Chinese — React declares a hydration failure and rebuilds
// the tree. Every other homepage component already takes this prop.
export function RoundPipeline({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="font-display text-sm tracking-widest text-cyan-300/90 uppercase">
          {t('home.howItWorks.pipelineTitle')}
        </h3>
        <span className="font-display text-xs text-gray-500 tabular-nums">
          {ROUND_PHASES.length}
        </span>
      </div>

      {/* 四個段落：桌機並排，手機縱向 / The four movements: side by side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ROUND_PHASE_GROUPS.map((group, groupIndex) => (
          <div key={group} className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-display text-[11px] tracking-widest text-gray-400 uppercase">
                {t(GROUP_LABEL[group])}
              </span>
              <span className="h-px flex-1 bg-linear-to-r from-white/15 to-transparent" aria-hidden="true" />
            </div>
            <ol className="space-y-1">
              {GROUP_PHASES[group].map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-md bg-white/[0.04] border border-white/5 px-2.5 py-1.5"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-cyan-400/70 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-slate-300 truncate">{t(`phases.${id}`)}</span>
                </li>
              ))}
            </ol>
            {/* 段落之間的流向（桌機）/ The flow between movements (desktop only) */}
            {groupIndex < ROUND_PHASE_GROUPS.length - 1 && (
              <div
                className="hidden lg:block text-center text-gray-600 text-xs leading-none py-1"
                aria-hidden="true"
              >
                ↓
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-500">
        {t('home.howItWorks.pipelineNote')}
      </p>
    </div>
  );
}