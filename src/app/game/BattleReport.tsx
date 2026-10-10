// ============================================================================
// 戰報 / Battle report
// ----------------------------------------------------------------------------
// 佔領事件的明細彈窗：把那一場的算式、以及「無守軍」的情況講清楚。
//
// A detail popup for a capture: the arithmetic of that engagement, and the
// "no defenders" case stated plainly.
//
// 為什麼要有這個 / Why this exists
// 事件日誌一行只說得出「誰佔領了哪裡」。但一場佔領其實有兩種完全不同的經過：一種是
// 城裡有守軍、打了一場，另一種是空城直接走進去。兩者在前端看起來一樣，所以要把算式
// （攻方兵力×武力×隨機 vs 守方駐軍×堡壘×隨機）攤開，並在沒有守軍時明確寫「無守軍」，
// 而不是留一格空白讓人以為是 bug。
//
// A log row can only say "who took where". But a capture has two very different
// histories: a garrisoned place that was fought for, and an empty one walked into.
// They look identical in the list, so the arithmetic is laid out
// (attacker troops × wu × roll vs defenders garrison × fortress × roll) and the
// no-garrison case says "no defenders" outright rather than leaving a blank the user
// would read as a bug.
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { t } from '@/lib/i18n';

/** 事件的 `report` 欄位 / the event's `report` payload */
export interface BattleReportData {
  attackerTroops: number;
  attackerWu: number;
  attackRoll: number;
  attackPower: number;
  defenderGarrison: number;
  defenderFortress: number;
  defenceRoll: number;
  defencePower: number;
  outcome: 'assault' | 'repelled' | 'no_defenders';
}

export interface BattleReportProps {
  /** 佔領者 / the capturer */
  charName: string;
  /** 地點 / the place */
  placeName: string;
  /** 該回合的攻守明細；null = 無守軍 / the engagement; null means no defenders */
  report: BattleReportData | null;
  /** 關閉 / close */
  onClose: () => void;
}

/** 一列算式 / one row of the arithmetic */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className="font-orbitron text-gray-100">{value}</span>
    </div>
  );
}

/**
 * 攻防動畫 / The attack–defence replay.
 *
 * 三段式：攻方戰力條長出來 → 守方戰力條長出來 → 判定與控制權轉移。三段的**長度比**
 * 就是雙方的戰力比，所以一眼看得出誰強。
 *
 * Three beats: the attacker's power bar fills, the defender's fills, then the verdict and the
 * change of control. The two bars' **relative lengths** are the two powers, so who is stronger
 * is legible at a glance.
 *
 * 每幀只寫 DOM（寬度與透明度），**不進 React state** —— 逐幀 setState 會讓整個彈窗重繪，
 * 而這裡只有兩條線在動。尊重 reduced-motion：那時直接畫最後一格。
 *
 * Each frame writes to the DOM only (bar widths, opacity), never React state: a per-frame
 * setState would re-render the whole popup when only two bars move. Honours reduced motion by
 * jumping to the final frame.
 */
function AttackReplay({ report }: { report: BattleReportData }) {
  const attackRef = useRef<HTMLDivElement>(null);
  const defenceRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const attack = attackRef.current;
    const defence = defenceRef.current;
    const verdict = verdictRef.current;
    if (!attack || !defence || !verdict) return;

    // 兩條都依「雙方的最大值」正規化，長度才可以直接比較 /
    // Both bars normalise against the larger of the two powers, so their lengths compare
    const peak = Math.max(report.attackPower, report.defencePower, 1);
    const attackPct = (report.attackPower / peak) * 100;
    const defencePct = (report.defencePower / peak) * 100;

    const paint = (progress: number) => {
      // 0–0.35 攻方、0.35–0.7 守方、0.7–1 判定 / three beats
      const a = Math.min(1, Math.max(0, progress / 0.35));
      const d = Math.min(1, Math.max(0, (progress - 0.35) / 0.35));
      const v = Math.min(1, Math.max(0, (progress - 0.7) / 0.3));
      attack.style.width = `${(attackPct * a).toFixed(1)}%`;
      defence.style.width = `${(defencePct * d).toFixed(1)}%`;
      verdict.style.opacity = String(v);
    };

    if (reduced) {
      paint(1);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const DURATION = 1600;
    const loop = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION);
      paint(progress);
      if (progress < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [report, reduced]);

  const won = report.outcome === 'assault';
  return (
    <div className="space-y-2">
      <div>
        <div className="mb-0.5 flex justify-between text-xs text-cyan-300">
          <span>{t('events.reportAttack')}</span>
          <span className="font-orbitron">{report.attackPower.toFixed(0)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div ref={attackRef} className="h-full rounded-full bg-cyan-400" style={{ width: 0 }} />
        </div>
      </div>
      <div>
        <div className="mb-0.5 flex justify-between text-xs text-rose-300">
          <span>{t('events.reportDefence')}</span>
          <span className="font-orbitron">{report.defencePower.toFixed(0)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div ref={defenceRef} className="h-full rounded-full bg-rose-400" style={{ width: 0 }} />
        </div>
      </div>
      <div ref={verdictRef} className="pt-1" style={{ opacity: 0 }}>
        <p className={won ? 'text-emerald-400' : 'text-rose-400'}>
          {won ? t('events.reportWon') : t('events.reportLost')}
        </p>
      </div>
    </div>
  );
}

export function BattleReport({ charName, placeName, report, onClose }: BattleReportProps) {
  // 沒有 report 就是「無守軍」——照樣開彈窗，只是內容說明沒有打過。
  // A missing report *is* the no-defenders case: still open, and say so.
  const body = !report ? (
    <p className="text-gray-300 leading-relaxed">{t('events.reportNoDefenders')}</p>
  ) : (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="mb-1 text-xs uppercase tracking-wider text-cyan-300">
          {t('events.reportAttack')}
        </div>
        <Row label={t('character.troops')} value={String(report.attackerTroops)} />
        <Row label={t('character.wu')} value={String(report.attackerWu)} />
        <Row label={t('events.reportRoll')} value={report.attackRoll.toFixed(2)} />
        <Row label={t('events.reportPower')} value={report.attackPower.toFixed(1)} />
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="mb-1 text-xs uppercase tracking-wider text-rose-300">
          {t('events.reportDefence')}
        </div>
        <Row label={t('place.garrison')} value={String(report.defenderGarrison)} />
        <Row label={t('place.fortress')} value={String(report.defenderFortress)} />
        <Row label={t('events.reportRoll')} value={report.defenceRoll.toFixed(2)} />
        <Row label={t('events.reportPower')} value={report.defencePower.toFixed(1)} />
      </div>
      <AttackReplay report={report} />
    </div>
  );

  // Portalled to the body: the log is a scroll container, and an absolutely positioned
  // panel inside it would scroll away with the rows.
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-ds-panel border border-ds-line bg-ds-panel-strong p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="font-orbitron text-sm text-cyan-300">{t('events.reportTitle')}</div>
            <div className="mt-0.5 text-gray-200">
              {charName} → {placeName}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-200">
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}
