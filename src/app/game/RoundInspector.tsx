'use client';

// ============================================================================
// 回合檢查器 / The round inspector
// ============================================================================
// 「這一回合發生了什麼、花了多少時間」——以前只能手寫 SQL 連資料庫查，而且每次
// 都要重新想一遍該查什麼。現在回合的量測跟著快照存下來，這個面板把它讀出來：
// 摘要（事件、戰鬥、叛變）、事件種類分佈，以及**每一個階段各花多少時間**。
//
// "What happened this round, and where did the time went" - before, that meant
// hand-writing SQL against the database and re-thinking the query every time. The
// round's measurements now travel with the snapshot, and this panel reads them
// back: the summary (events, battles, defections), the event mix, and **how long
// each phase took**.
//
// 階段的**條**用比例呈現（相對最慢的那一段），所以一眼看得出瓶頸在哪——這正是
// 手寫 SQL 時最難看出來的一件事。
//
// The **bar** per phase is proportional (against the slowest phase), so the
// bottleneck is visible at a glance - the one thing a hand-written query is worst
// at showing.
// ============================================================================

import { t } from '@/lib/i18n';
import type { RoundPhaseId } from '@/lib/roundPhases';
import { GM_PANEL, GM_TITLE } from './styles';

/** 檢查器回傳的資料 / The payload the inspector endpoint returns */
export interface RoundInspectPayload {
  round: number;
  servedFrom: 'snapshot' | 'live';
  durationMs: number | null;
  phases: Array<{ id: RoundPhaseId; ms: number }>;
  summary: {
    events: number;
    battlesFought: number;
    defections: number;
    charactersSpawned: number;
    charactersDied: number;
    charactersBorn: number;
  } | null;
  eventTypes: Array<{ type: string; count: number }>;
  counts: { places: number; characters: number; factions: number; roads: number };
}

/** 毫秒的顯示格式 / How a duration is written */
function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function RoundInspector({
  round,
  data,
}: {
  round: number;
  data: RoundInspectPayload | null;
}) {
  if (!data) {
    return (
      <div className={`${GM_PANEL} p-3`}>
        <h3 className={`${GM_TITLE} mb-2`}>{t('game.roundOverview')}</h3>
        <p className="text-xs text-gray-500">{t('game.roundNoData')}</p>
      </div>
    );
  }

  const slowest = data.phases.reduce((max, p) => Math.max(max, p.ms), 0);
  const total = data.phases.reduce((sum, p) => sum + p.ms, 0);

  return (
    <div className={`${GM_PANEL} p-3`}>
      <h3 className={`${GM_TITLE} mb-2 flex items-baseline justify-between gap-2`}>
        <span>{t('game.roundOverview')}</span>
        <span className="font-display text-xs tracking-widest text-cyan-300/90">
          RND {String(round).padStart(4, '0')}
        </span>
      </h3>

      {/* 摘要：這一回合發生的事 / The summary: what this round did */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: t('game.roundEvents'), value: data.summary?.events ?? 0 },
          { label: t('game.roundBattles'), value: data.summary?.battlesFought ?? 0 },
          { label: t('game.roundDefections'), value: data.summary?.defections ?? 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5">
            <div className="text-[11px] text-gray-400">{item.label}</div>
            <div className="font-display text-base text-cyan-300 tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* 耗時：整回合 + 資料來源 / The duration: whole round + where the data came from */}
      <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
        <span className="text-gray-400">{t('game.roundDuration')}</span>
        <span className="font-display text-amber-300 tabular-nums">
          {data.durationMs !== null ? fmtMs(data.durationMs) : '—'}
          <span className="ml-2 text-[10px] text-gray-500">
            {data.servedFrom === 'snapshot'
              ? t('game.roundServedSnapshot')
              : t('game.roundServedLive')}
          </span>
        </span>
      </div>

      {/* 階段耗時：最慢的那一段是 100% / Phase timings: the slowest phase is 100% */}
      {data.phases.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mt-2 mb-1">
            {t('game.roundPhases')}
          </div>
          <ul className="space-y-1">
            {data.phases.map((phase) => {
              const width = slowest > 0 ? Math.max(2, Math.round((phase.ms / slowest) * 100)) : 2;
              return (
                <li key={phase.id} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 w-28 shrink-0 truncate">
                    {t(`phases.${phase.id}`)}
                  </span>
                  <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-cyan-400/70"
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="text-[11px] text-gray-400 tabular-nums w-12 text-right shrink-0">
                    {fmtMs(phase.ms)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-gray-500 mt-1.5">
            <span>{t('game.roundPhaseTotal')}</span>
            <span className="tabular-nums">{fmtMs(total)}</span>
          </div>
        </>
      )}

      {/* 事件種類分佈 / The event mix */}
      {data.eventTypes.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mt-3 mb-1">
            {t('game.roundEventMix')}
          </div>
          <ul className="space-y-0.5">
            {data.eventTypes.slice(0, 6).map((entry) => (
              <li key={entry.type} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-gray-400 truncate">{entry.type}</span>
                <span className="text-gray-300 tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 世界規模 / The world's scale */}
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-gray-500 mt-3 pt-2 border-t border-white/10">
        <span>{t('game.roundWorldScale')}</span>
        <span className="tabular-nums">
          {data.counts.places} · {data.counts.characters} · {data.counts.factions} ·{' '}
          {data.counts.roads}
        </span>
      </div>
    </div>
  );
}