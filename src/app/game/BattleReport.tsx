// ============================================================================
// 戰報 — 戰爭回放 / Battle report — war replay
// ----------------------------------------------------------------------------
// 戰報彈窗不再只顯示一次交戰的算式：多回合戰爭的每次出手都記在 `BattleStrike`
// 表裡，這個彈窗把**整場戰爭**按輪回放——將領的點衝向對方、命中閃光、兵力損耗、
// 陣亡或逃亡，一輪一輪播。
//
// The battle report is no longer one engagement's arithmetic: every strike of a
// multi-round war is recorded in the `BattleStrike` table, and this modal replays
// the **whole war** round by round — leaders lunging at each other, impact flashes,
// troop losses, deaths and escapes.
//
// 資料 / Data
// ---------------------------------------------------------------------------
// 開啟時打 `/api/world/battles?placeId=…` 拿該地方**所有**出手紀錄，用連續回合
// 分組出戰爭，定位到點擊事件所在的戰爭。直接查表（不依賴快照），歷史回合也能回放。
// On open it fetches `/api/world/battles?placeId=…` for **all** strikes at the
// place, groups them into wars by contiguous rounds, and locates the war containing
// the clicked event. Reads the table directly (no snapshot dependency), so
// historical rounds replay too.
//
// 動畫規範 / Animation rules
// ---------------------------------------------------------------------------
// 沿用專案規範：`prefers-reduced-motion` 下只畫**一幀靜態終局**（不打動畫、
// 直接顯示最後一擊與戰爭小結）。
// Follows the project's animation rules: under `prefers-reduced-motion` it renders
// a single static final frame (no animation — the last strike and the war summary
// shown directly).
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { t } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/gameConfig';
import { hslToHex } from '../../components/mapShared';

/** `BattleStrike` 的一行（API 回傳）/ One row of the API's strike log */
export interface WarStrike {
  round: number;
  seq: number;
  warRound: number;
  attackerId: string;
  attackerName: string;
  attackerFactionId: string | null;
  defenderId: string;
  defenderName: string;
  defenderFactionId: string | null;
  attackPower: number;
  defencePower: number;
  roll: number;
  damage: number;
  outcome: string;
}

export interface BattleReportProps {
  /** 戰爭發生的地方 / the place the war was fought at */
  placeId: string;
  placeName: string;
  /** 點擊事件的回合（定位戰爭用）/ the clicked event's round (locates the war) */
  round: number;
  /** 事件種類 → 戰爭結局 / the event kind -> the war's outcome */
  kind: 'captured' | 'death' | 'escape';
  /** 該列所關於的將領 / the leader the row is about */
  charName: string;
  factionColours: Record<string, string>;
  onClose: () => void;
}

const ARENA_W = 320;
const ARENA_H = 150;

const GM_REPLAY_BTN =
  'rounded-full border border-cyan-400/30 px-2.5 py-0.5 text-xs font-display tracking-wider text-cyan-300 hover:bg-cyan-500/10';

/** 戰場上的一個點 / One dot on the arena */
interface Fighter {
  id: string;
  name: string;
  side: 'attacker' | 'defender';
  x: number;
  y: number;
}

export function BattleReport({
  placeId,
  placeName,
  round,
  kind,
  charName,
  factionColours,
  onClose,
}: BattleReportProps) {
  const reduced = useReducedMotion();
  const [strikes, setStrikes] = useState<WarStrike[] | null>(null);
  const [roundIdx, setRoundIdx] = useState(0);
  const [strikeIdx, setStrikeIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/world/battles?placeId=' + encodeURIComponent(placeId))
      .then(async (res) => {
        const data = (await res.json()) as { strikes: WarStrike[] };
        if (cancelled) return;
        setStrikes(data.strikes ?? []);
        // 定位到點擊事件所在的輪（非同步回呼，不觸發 cascading-render 規則）/
        // Position on the clicked event's round (an async callback, so the
        // cascading-render rule does not apply)
        const rounds = [...new Set((data.strikes ?? []).map((s) => s.warRound))].sort(
          (a, b) => a - b
        );
        const idx = rounds.findIndex((r) => r === round);
        setRoundIdx(idx >= 0 ? idx : 0);
        setStrikeIdx(0);
      })
      .catch(() => {
        if (!cancelled) setStrikes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  // 把出手紀錄分組成戰爭（連續回合＝同一場），定位到點擊回合所在的戰爭 /
  // Group the strikes into wars (contiguous rounds) and locate the clicked one
  const war = useMemo(() => {
    if (!strikes || strikes.length === 0) return [];
    const wars: WarStrike[][] = [];
    let current: WarStrike[] = [];
    let prevRound: number | null = null;
    for (const strike of strikes) {
      if (prevRound !== null && strike.round > prevRound + 1) {
        wars.push(current);
        current = [];
      }
      current.push(strike);
      prevRound = strike.round;
    }
    wars.push(current);
    return wars.find((w) => w.some((s) => s.round === round)) ?? wars[wars.length - 1] ?? [];
  }, [strikes, round]);

  const warRounds = useMemo(() => {
    const set = new Set((war ?? []).map((s) => s.warRound));
    return [...set].sort((a, b) => a - b);
  }, [war]);

  const roundStrikes = useMemo(
    () => (war ?? []).filter((s) => s.warRound === warRounds[roundIdx]),
    [war, warRounds, roundIdx]
  );
  const current = roundStrikes[Math.min(strikeIdx, roundStrikes.length - 1)] ?? null;

  // 自動播放：每擊停 STRIKE_MS，輪間停 PAUSE_MS；reduced-motion 不播 /
  // Autoplay: STRIKE_MS per strike, PAUSE_MS between rounds; reduced motion never plays
  useEffect(() => {
    if (!playing || reduced || !war || war.length === 0) return;
    const timer = window.setTimeout(
      () => {
        setStrikeIdx((idx) => {
          const next = idx + 1;
          if (next < roundStrikes.length) return next;
          if (roundIdx < warRounds.length - 1) {
            setRoundIdx((r) => r + 1);
            return 0;
          }
          setPlaying(false);
          return idx;
        });
      },
      strikeIdx === roundStrikes.length - 1
        ? CONFIG.BATTLE_REPLAY_PAUSE_MS
        : CONFIG.BATTLE_REPLAY_STRIKE_MS
    );
    return () => window.clearTimeout(timer);
  }, [playing, reduced, strikeIdx, roundIdx, roundStrikes, war, warRounds]);

  // 戰場上的點：攻方靠左、守方靠右，按首次出現排序 /
  // Arena dots: attackers left, defenders right, ordered by first appearance
  const fighters = useMemo(() => {
    const list: Fighter[] = [];
    const seen = new Set<string>();
    for (const strike of war ?? []) {
      const sides: Array<[string, string, 'attacker' | 'defender']> = [
        [strike.attackerId, strike.attackerName, 'attacker'],
        [strike.defenderId, strike.defenderName, 'defender'],
      ];
      for (const [id, name, side] of sides) {
        if (id === 'garrison' || seen.has(id)) continue;
        seen.add(id);
        const count = list.filter((f) => f.side === side).length;
        list.push({
          id,
          name,
          side,
          x: side === 'attacker' ? 46 : ARENA_W - 46,
          y: 26 + count * 34,
        });
      }
    }
    return list;
  }, [war]);

  const step = (delta: number) => {
    if (!war || war.length === 0) return;
    setPlaying(false);
    let rIdx = roundIdx;
    let sIdx = strikeIdx + delta;
    while (sIdx < 0 && rIdx > 0) {
      rIdx--;
      const prevRoundStrikes = (war ?? []).filter((s) => s.warRound === warRounds[rIdx]);
      sIdx = prevRoundStrikes.length - 1;
    }
    while (sIdx > roundStrikes.length - 1 && rIdx < warRounds.length - 1) {
      rIdx++;
      sIdx = 0;
    }
    sIdx = Math.max(0, Math.min(sIdx, roundStrikes.length - 1));
    setRoundIdx(rIdx);
    setStrikeIdx(sIdx);
  };

  const attackerDot = current
    ? fighters.find((f) => f.id === current.attackerId)
    : null;
  const defenderDot = current
    ? fighters.find((f) => f.id === current.defenderId)
    : null;

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
            <div className="font-display text-sm text-cyan-300">{t('events.warReplay')}</div>
            <div className="mt-0.5 text-gray-200">
              {placeName} ·{' '}
              {t('events.warRoundLabel', {
                n: roundIdx + 1,
                total: warRounds.length || 1,
              })}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-200">
            ✕
          </button>
        </div>

        {strikes === null ? (
          <p className="text-gray-400">{t('events.loading')}</p>
        ) : war.length === 0 ? (
          <p className="text-gray-300 leading-relaxed">{t('events.noWarData')}</p>
        ) : (
          <div className="space-y-3">
            {/* 戰場 / The arena */}
            <svg
              viewBox={`0 0 ${ARENA_W} ${ARENA_H}`}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02]"
              role="img"
              aria-label={placeName + ' ' + t('events.warReplay')}
            >
              <line
                x1={ARENA_W / 2}
                y1={8}
                x2={ARENA_W / 2}
                y2={ARENA_H - 8}
                stroke="var(--color-ds-line)"
                strokeDasharray="3 3"
              />
              {fighters.map((f) => {
                // 出擊的將領向目標衝刺（reduced-motion 靜止）/
                // the striker lunges toward the target (static under reduced motion)
                const lunging = current && current.attackerId === f.id && !reduced && playing;
                const target = lunging && current ? fighters.find((d) => d.id === current.defenderId) : null;
                const lunge = target ? 0.55 : 0;
                const cx = f.x + (target ? (target.x - f.x) * lunge : 0);
                const cy = f.y + (target ? (target.y - f.y) * lunge : 0);
                const isVictim = current && current.defenderId === f.id;
                const fallen =
                  isVictim && current && (current.outcome === 'killed' || current.outcome === 'fled');
                return (
                  <g key={f.id} opacity={fallen ? 0.25 : 1}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={9}
                      fill={factionColour(f.id, factionColours)}
                      stroke="rgba(255,255,255,0.85)"
                      strokeWidth={1.5}
                    />
                    <text
                      x={f.side === 'attacker' ? 4 : ARENA_W - 4}
                      y={f.y - 12}
                      textAnchor={f.side === 'attacker' ? 'start' : 'end'}
                      fontSize={9}
                      fontFamily="monospace"
                      fill="rgba(255,255,255,0.75)"
                    >
                      {f.name}
                    </text>
                  </g>
                );
              })}
              {/* 命中閃光（傷害越大圈越大）/ the impact flash (bigger damage, bigger ring) */}
              {current && attackerDot && defenderDot && (
                <circle
                  cx={attackerDot.x * 0.3 + defenderDot.x * 0.7}
                  cy={attackerDot.y * 0.3 + defenderDot.y * 0.7}
                  r={6 + Math.min(14, current.damage)}
                  fill="none"
                  stroke="rgba(251,191,36,0.85)"
                  strokeWidth={2}
                  opacity={reduced ? 0.5 : 1}
                />
              )}
            </svg>

            {/* 本擊的算式 / this strike's arithmetic */}
            {current && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="mb-1 text-xs uppercase tracking-wider text-cyan-300">
                  {t('events.warStrike', { n: strikeIdx + 1 })} · {current.attackerName} →{' '}
                  {current.defenderName}
                </div>
                <Row label={t('events.reportRoll')} value={current.roll.toFixed(2)} />
                <Row label={t('events.reportPower')} value={current.attackPower.toFixed(1)} />
                <Row label={t('events.reportDefence')} value={current.defencePower.toFixed(1)} />
                <Row label={t('events.reportDamage')} value={String(current.damage)} />
                <Row
                  label={t('events.warOutcome')}
                  value={t(
                    current.outcome === 'killed'
                      ? 'events.strikeKilled'
                      : current.outcome === 'fled'
                        ? 'events.strikeFled'
                        : 'events.strikeHit'
                  )}
                />
              </div>
            )}

            {/* 戰爭小結 / the war's summary */}
            <WarSummary war={war} kind={kind} charName={charName} />

            {/* 控制 / controls */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                className={GM_REPLAY_BTN}
                aria-label={t('events.prevStrike')}
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className={GM_REPLAY_BTN}
                aria-label={playing ? t('events.pause') : t('events.play')}
              >
                {playing && !reduced ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className={GM_REPLAY_BTN}
                aria-label={t('events.nextStrike')}
              >
                ▶
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function factionColour(
  factionId: string | null,
  colours: Record<string, string>
): string {
  if (factionId && colours[factionId]) return colours[factionId];
  return 'rgba(148,163,184,0.85)';
}
function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className="font-display text-gray-100">{value}</span>
    </div>
  );
}

function WarSummary({
  war,
  kind,
  charName,
}: {
  war: WarStrike[];
  kind: 'captured' | 'death' | 'escape';
  charName: string;
}) {
  const rounds = new Set(war.map((s) => s.warRound)).size;
  return (
    <div className="text-[13px] leading-relaxed text-gray-300">
      {t('events.warSummary', { rounds, strikes: war.length })}
      {kind === 'captured'
        ? ' ' + t('events.warCaptured', { name: charName })
        : ' ' + t('events.warDeath', { name: charName })}
    </div>
  );
}
