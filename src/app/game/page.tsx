// ============================================================================
// 遊戲頁面 — 主要遊戲介面 / Game Page — Main Game Interface
// ============================================================================
// 深空科幻主題 / Deep Space Sci-Fi Theme
// 版面：指揮列 → 世界觀測帶（展示區塊）→ 左軌 / 地圖 HUD / 右軌
// Layout: command bar → world telemetry band → left rail / map HUD / right rail
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion, useSpring } from 'motion/react';
import { Reveal, Parallax } from '@/components/home/Motion';
import { t, setLocale, getLocale, getTranslations, DEFAULT_LOCALE } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { MapCameraControls } from '@/components/SigmaMap';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/gameConfig';
import { signOut } from 'next-auth/react';

const SigmaMap = dynamic(
  () => import('@/components/SigmaMap').then((mod) => mod.SigmaMap),
  { ssr: false }
);

// ============================================================================
// 表面 utility / Surface utilities — Tailwind v4
// ============================================================================
// 這裡的每一條都對應到遷移前 globals.css 裡一條 .ds-gm-* 的**完全相同**計算值。
// 這是一次架構遷移，不是改版：顏色、字級、間距、圓角、陰影、動效時長一個都沒變，
// 只是從自訂元件類搬到 Tailwind utility，並把值集中在這裡避免重複。
//
// Every entry reproduces one former .ds-gm-* rule with an identical computed
// value. This is an architecture migration, not a restyle: not one colour,
// size, spacing, radius, shadow, or duration changed — the values simply moved
// from bespoke component classes into Tailwind utilities and now live here so
// they are written exactly once.
//
// 兩個性質要注意 / Two properties to watch:
//  1. GM_TITLE 與 GM_BTN 帶著自己的 font-size 與 color。若某個呼叫端要改寫它，
//     必須加 Tailwind 的 important 修飾符（`text-xs!`），因為兩者現在同在
//     utilities 層，不再有「元件層永遠輸給 utility」那條保護。
//     GM_TITLE and GM_BTN carry their own size and colour. A call site that
//     overrides one must use Tailwind's important modifier (`text-xs!`),
//     because both now sit in the utilities layer and the old
//     "components always lose to utilities" guarantee is gone.
//  2. pointer-coarse: 變體取代原本的 @media (pointer: coarse) 區塊。
//     The pointer-coarse: variant replaces the old media query.
// ============================================================================

/** 固定全視窗背景 / the fixed full-viewport backdrop */
const GM_BACKDROP = 'pointer-events-none fixed inset-0 z-0 overflow-hidden';
const GM_PHOTO = 'size-full object-cover opacity-[0.17] [filter:saturate(1.1)_contrast(1.04)]';
const GM_VEIL =
  'absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(2,6,23,0.3)_0%,rgba(2,6,23,0.78)_55%,rgba(2,6,23,0.96)_100%),linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.7))]';

/** 世界觀測帶 / the telemetry band */
const GM_STRIP =
  'relative z-10 overflow-hidden border-b border-[rgba(34,211,238,0.22)] ' +
  'bg-[linear-gradient(180deg,rgba(2,6,23,0.5),rgba(2,6,23,0.84))] backdrop-blur-[8px]';
const GM_STRIP_PHOTO = 'size-full object-cover opacity-[0.55]';
const GM_STRIP_VEIL =
  'absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.97)_0%,rgba(2,6,23,0.86)_45%,rgba(2,6,23,0.62)_100%),linear-gradient(180deg,rgba(2,6,23,0.2),rgba(2,6,23,0.68))]';

/** 觀測帶的 KPI / the band's readouts */
const GM_KPI =
  'flex-none min-w-[6.5rem] border-l border-[rgba(34,211,238,0.22)] py-[0.15rem] pl-[1.1rem]';
const GM_KPI_FIRST = 'flex-none min-w-[6.5rem] border-l-0 py-[0.15rem] pl-0';
const GM_KPI_LABEL =
  'font-orbitron text-xs font-semibold tracking-[0.14em] text-[rgba(165,243,252,0.92)] uppercase';
const GM_KPI_VALUE =
  'font-orbitron text-[clamp(1.3rem,2vw,1.65rem)] leading-[1.25] font-bold text-slate-50 ' +
  'tabular-nums [text-shadow:0_0_18px_rgba(34,211,238,0.35)]';

/** 面板與側軌 / panels and rails */
const GM_PANEL =
  'relative rounded-ds-panel border border-ds-line ' +
  'bg-[linear-gradient(180deg,rgba(15,23,42,0.74),rgba(2,6,23,0.74))] backdrop-blur-[12px] ' +
  // 頂緣那條漸層細線：原本是 .ds-gm-panel::before
  // The top hairline, formerly .ds-gm-panel::before
  "before:absolute before:-top-px before:left-4 before:right-4 before:h-px before:pointer-events-none " +
  "before:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.55),transparent)] before:content-['']";
const GM_TITLE =
  'font-orbitron text-sm font-semibold tracking-[0.14em] text-slate-400 uppercase';
const GM_RAIL = 'bg-[linear-gradient(180deg,rgba(2,6,23,0.74),rgba(2,6,23,0.56))] backdrop-blur-[10px]';

/** HUD 按鈕 / HUD buttons。三條各自完整，沒有「基底 + 覆寫」的疊加關係，
 *  因為疊加在 utilities 層已經不可靠。三態（停用）用 disabled: 變體。
 * Three complete buttons, never base-plus-override: layering is unreliable in
 * a single layer. The disabled state rides the disabled: variant. */
const GM_BTN =
  'inline-flex cursor-pointer items-center justify-center gap-[0.4rem] rounded-lg ' +
  'border border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.72)] text-slate-400 ' +
  'transition-[color,background-color,border-color] duration-200 ease-ds ' +
  'hover:border-[rgba(34,211,238,0.45)] hover:bg-[rgba(34,211,238,0.1)] hover:text-slate-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11 pointer-coarse:min-w-11';
const GM_BTN_ACCENT =
  'inline-flex cursor-pointer items-center justify-center gap-[0.4rem] rounded-lg ' +
  'border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.08)] text-cyan-300 ' +
  'transition-[color,background-color,border-color] duration-200 ease-ds ' +
  'hover:border-[rgba(34,211,238,0.6)] hover:bg-[rgba(34,211,238,0.16)] hover:text-cyan-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11 pointer-coarse:min-w-11';
const GM_BTN_DANGER =
  'inline-flex cursor-pointer items-center justify-center gap-[0.4rem] rounded-lg ' +
  'border border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.72)] text-[rgba(248,113,113,0.85)] ' +
  'transition-[color,background-color,border-color] duration-200 ease-ds ' +
  'hover:border-[rgba(248,113,113,0.45)] hover:bg-[rgba(248,113,113,0.1)] hover:text-red-300 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11 pointer-coarse:min-w-11';

/** LIVE 徽章 / the LIVE badge */
const GM_BADGE =
  'rounded-full border border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.07)] py-[0.15rem] px-2';

/** 地圖 HUD 外框與角標 / the map HUD frame and its corner brackets */
const GM_FRAME = 'pointer-events-none absolute inset-[10px] z-[5]';
const GM_VIGNETTE =
  'pointer-events-none absolute inset-0 z-[4] bg-[radial-gradient(ellipse_at_50%_50%,transparent_58%,rgba(2,6,23,0.55)_100%)]';
const GM_HUDBAR =
  'absolute top-3.5 left-3.5 right-3.5 z-[6] flex flex-wrap items-center gap-3 ' +
  'rounded-xl border border-[rgba(34,211,238,0.28)] bg-[rgba(2,6,23,0.74)] ' +
  'px-3 py-[0.55rem] backdrop-blur-[14px]';
const GM_CORNER_BASE = 'absolute size-[26px] border-[rgba(34,211,238,0.55)] border-solid';
const GM_CORNER_TL = `${GM_CORNER_BASE} top-0 left-0 border-w-[1px_0_0_1px]`;
const GM_CORNER_TR = `${GM_CORNER_BASE} top-0 right-0 border-w-[1px_1px_0_0]`;
const GM_CORNER_BL = `${GM_CORNER_BASE} bottom-0 left-0 border-w-[0_0_1px_1px]`;
const GM_CORNER_BR = `${GM_CORNER_BASE} bottom-0 right-0 border-w-[0_1px_1px_0]`;

/** 圖例 / the legend rail */
const GM_LEGEND = 'flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const GM_LEGEND_ITEM = 'flex flex-none items-center gap-[0.4rem]';

/** 統計格 / stat cells */
const GM_STAT =
  'relative rounded-[10px] border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,42,0.6)] ' +
  'px-2 py-[0.6rem] text-center ' +
  "before:absolute before:top-0 before:left-[18%] before:right-[18%] before:h-px " +
  "before:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.55),transparent)] before:content-['']";
const GM_STAT_VALUE = 'font-orbitron text-xl leading-[1.3] font-bold text-slate-50 tabular-nums';
const GM_STAT_LABEL = 'mt-[0.15rem] text-xs tracking-[0.08em] text-slate-400 uppercase';

/** 對話框 / the detail modal */
const GM_MODAL =
  'rounded-ds-panel border border-[rgba(34,211,238,0.28)] ' +
  'bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.97))] backdrop-blur-[16px]';
const GM_MODAL_PHOTO = 'absolute inset-0 size-full object-cover opacity-[0.45]';
const GM_MODAL_VEIL =
  'absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.2)_0%,rgba(2,6,23,0.9)_76%,rgba(2,6,23,0.97)_100%)]';

/** 跳動的 LIVE 指示燈 / the pulsing LIVE dot。動畫時長沿用原本的 1.9s，
 *  不是 Tailwind animate-ping 預設的 1s。
 * The pulsing dot keeps the original 1.9s cycle, not Tailwind's animate-ping
 * default of 1s. */
const GM_LIVE =
  'relative inline-block size-[7px] rounded-full bg-ds-cyan shadow-[0_0_10px_rgba(34,211,238,0.9)] ' +
  "after:absolute after:inset-0 after:rounded-full after:bg-ds-cyan after:content-[''] " +
  'after:[animation:ds-ping_1.9s_cubic-bezier(0,0,0.2,1)_infinite]';

/** 載入骨架（永不只顯示裸 spinner）/ Loading skeleton, never a bare spinner */
const GM_SKEL =
  'relative overflow-hidden rounded-lg bg-[rgba(148,163,184,0.08)] ' +
  "after:absolute after:inset-0 after:-translate-x-full after:content-[''] " +
  'after:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.14),transparent)] ' +
  'after:animate-ds-shimmer';


// ─── 型別 / Types ────────────────────────────────────────────────────────────────

/** GET /api/world/current — 世界進度，用來定位最新已執行的回合 / World progress, used to resolve the latest executed round */
interface WorldInfo {
  id: string;
  name: string;
  currentRound: number;
}

interface WorldState {
  world: {
    id: string;
    name: string;
    currentRound: number;
  };
  places: Array<{
    id: string;
    name: string;
    factionId: string | null;
    administratorId: string | null;
    garrison: number;
    fortress: number;
    market: number;
    barracks: number;
    layoutX: number;
    layoutY: number;
  }>;
  factions: Array<{
    id: string;
    name: string;
    color: string;
    alive: boolean;
    collapsing: boolean;
  }>;
  characters: Array<{
    id: string;
    name: string;
    factionId: string | null;
    wu: number;
    tong: number;
    jing: number;
    speed: number;
    loyalty: string;
    ambition: number;
    age: number;
    troops: number;
    gold: number;
    placeId: string;
    alive: boolean;
    isKing: boolean;
  }>;
  roads: Array<{
    id: string;
    aId: string;
    bId: string;
  }>;
  /** 地圖聚光燈：近 K 回合內新生成 / 被攻擊的地點 / Map spotlight: places created/attacked within the last K rounds */
  spotlights?: Array<{ placeId: string; kind: 'created' | 'attacked' }>;
  /** 本回合移動（供地圖動畫）/ This round's moves (for the map animation) */
  moves?: Array<{ fromPlaceId: string; toPlaceId: string; factionId: string | null }>;
}

interface GameEvent {
  id: string;
  type: string;
  // 事件資料（API 回傳 Prisma 的 data 欄位）/ Event payload (API returns Prisma's data field)
  data: Record<string, unknown>;
  round: number;
}

// ─── 語言訂閱 / Locale Subscription ─────────────────────────────────────────

function getServerLocale(): Locale {
  return DEFAULT_LOCALE;
}

function subscribeLocale(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => { };
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

// ─── 圖示 / Icons（統一 1.5px 描邊、24 viewBox，不使用 emoji）─────────────────

function Ic({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Crown({ className, label }: { className?: string; label: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path d="M4.5 8.5 8.5 12 12 6l3.5 6 4-3.5L18 17H6z" />
    </svg>
  );
}

function EventGlyph({ type }: { type: string }) {
  let body: ReactNode;
  switch (type) {
    case 'PLACE_CREATED':
    case 'PLACE_CAPTURED':
      body = (
        <>
          <path d="M12 21c4-4.5 6.5-7.7 6.5-11a6.5 6.5 0 1 0-13 0c0 3.3 2.5 6.5 6.5 11Z" />
          <circle cx="12" cy="10" r="2.4" />
        </>
      );
      break;
    case 'CHARACTER_SPAWNED':
    case 'ADMIN_ASSIGNED':
    case 'ADMIN_REMOVED':
    case 'AMBITION_RECOVERED':
      body = (
        <>
          <circle cx="12" cy="8.5" r="3.2" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
        </>
      );
      break;
    case 'CHARACTER_MOVED':
      body = <path d="M5 12h14M13 6l6 6-6 6" />;
      break;
    case 'DEATH':
    case 'BATTLE_DEATH':
      body = (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m9.5 9.5 5 5m0-5-5 5" />
        </>
      );
      break;
    case 'ESCAPE_SUCCESS':
      body = (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M8 12h8m-3-3 3 3-3 3" />
        </>
      );
      break;
    case 'DEFECTION':
      body = (
        <>
          <path d="M6 21V4" />
          <path d="M6 5h11l-2.2 3.5L17 12H6z" />
        </>
      );
      break;
    case 'FACTION_COLLAPSE':
    case 'FACTION_ELIMINATED':
      body = (
        <>
          <path d="M12 4.5 21 20H3z" />
          <path d="M12 10.5v4M12 17.2h.01" />
        </>
      );
      break;
    case 'BUILDING_UPGRADE':
      body = (
        <>
          <rect x="5" y="9" width="14" height="11.5" rx="1.5" />
          <path d="M9 9V5.5h6V9" />
        </>
      );
      break;
    default:
      body = <circle cx="12" cy="12" r="3.2" />;
  }
  return <Ic className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400/75">{body}</Ic>;
}

// ─── 指標視差（滑鼠位移 → 背景層位移，reduced-motion 時靜止）──────────────────

function PointerDrift({
  depth = 18,
  className,
  children,
}: {
  depth?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 55, damping: 20, mass: 0.6 });
  const y = useSpring(0, { stiffness: 55, damping: 20, mass: 0.6 });

  useEffect(() => {
    if (reduce) return;
    const handle = (e: PointerEvent) => {
      x.set(((e.clientX / Math.max(window.innerWidth, 1)) - 0.5) * 2 * depth);
      y.set(((e.clientY / Math.max(window.innerHeight, 1)) - 0.5) * 2 * depth);
    };
    window.addEventListener('pointermove', handle, { passive: true });
    return () => window.removeEventListener('pointermove', handle);
  }, [reduce, depth, x, y]);

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} style={{ x, y }}>
      {children}
    </motion.div>
  );
}

// ─── 世界觀測帶 / World Telemetry Band（新版面展示區塊）────────────────────────

function TelemetryStrip({
  round,
  worldName,
  aliveFactions,
  territories,
  aliveCharacters,
  totalTroops,
}: {
  round: number;
  worldName: string;
  aliveFactions: number;
  territories: number;
  aliveCharacters: number;
  totalTroops: number;
}) {
  const items = [
    { label: t('game.round'), value: String(round).padStart(4, '0') },
    { label: t('home.stats.factions'), value: aliveFactions.toLocaleString() },
    { label: t('home.stats.places'), value: territories.toLocaleString() },
    { label: t('home.stats.characters'), value: aliveCharacters.toLocaleString() },
    { label: t('faction.totalTroops'), value: totalTroops.toLocaleString() },
  ];

  return (
    <section className={`${GM_STRIP}`} aria-label={t('home.stats.title')}>
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <Parallax offset={48} className="absolute -top-1/2 -left-[5%] h-[200%] w-[110%]">
          {/* relative：fill 的影像需要一個 positioned 父層，否則 Next 會警告
              且 containing block 會往上跳到 Parallax / relative: a fill image
              needs a positioned parent, otherwise Next warns and the containing
              block silently resolves further up to Parallax */}
          <PointerDrift depth={14} className="relative h-full w-full">
            <Image
              src="/space/deep-field.jpg"
              alt=""
              fill
              sizes="100vw"
              // 這張在第一屏內、也是本頁的 LCP 元素 → 不要延遲載入 /
              // Sits above the fold and is this page's LCP element — don't defer it
              loading="eager"
              className={`${GM_STRIP_PHOTO}`}
            />
          </PointerDrift>
        </Parallax>
      </div>
      <div className={`${GM_STRIP_VEIL}`} aria-hidden="true" />

      <div className="relative flex items-center gap-4 md:gap-6 px-4 md:px-6 py-3 overflow-x-auto ds-gm-noscroll">
        <div className="hidden sm:block shrink-0 pr-4 md:pr-6 border-r border-cyan-400/20 max-w-[12rem]">
          <div className="ds-eyebrow">{t('home.stats.title')}</div>
          <div className="mt-0.5 text-xs text-white/85 font-orbitron tracking-widest truncate">
            {worldName}
          </div>
        </div>
        {items.map((item, i) => (
          <Reveal
            key={item.label}
            delay={0.05 * i}
            y={14}
            className={i === 0 ? GM_KPI_FIRST : GM_KPI}
          >
            <div className={`${GM_KPI_LABEL}`}>{item.label}</div>
            <div className={`${GM_KPI_VALUE}`}>{item.value}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

export default function GamePage() {
  /** 使用者選取的回合；null = 尚未選取 → 自動跟隨世界最新回合 / User-picked round; null = follow the world's latest round */
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<WorldState['places'][0] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const queryClient = useQueryClient();
  /** 地圖視角控制（浮動縮放 / 重設按鈕）/ Map camera controls (floating zoom / reset buttons) */
  const mapControlsRef = useRef<MapCameraControls | null>(null);

  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocale,
    getServerLocale
  );

  const handleLocaleToggle = useCallback(() => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
  }, [locale]);

  // 先取得世界進度，才知道最新已執行的回合（快照存在 0..currentRound-1）/
  // Fetch world progress first so we know the latest executed round (snapshots
  // exist for 0..currentRound-1)
  const { data: worldInfo, isError: worldInfoError } = useQuery<WorldInfo>({
    queryKey: ['worldCurrent'],
    queryFn: async () => {
      const response = await apiFetch('/api/world/current');
      if (!response.ok) throw new Error('Failed to fetch world');
      return response.json();
    },
    staleTime: 30 * 1000,
  });

  // 進網頁即顯示「最新已執行回合」的資料，而不是第 0 回合：未選取時直接用
  // latestRound 推導（純 render 推導，不在 effect 裡 setState）；使用者一旦
  // 點了時間軸或執行新回合，就以選取值為準 /
  // Land on the latest executed round instead of round 0: with no user pick we
  // derive it during render (no setState in an effect); once the user picks a
  // round from the timeline or runs a new one, their pick wins.
  const latestRound = worldInfo ? Math.max(0, worldInfo.currentRound - 1) : 0;
  const round = selectedRound ?? latestRound;
  /** 世界進度尚未回應（且未曾選取回合）→ 暫不請求回合狀態，避免先抓 round=0 /
   * Don't request round state until world progress resolves, so we never fetch round 0 first */
  const canFetchRound =
    selectedRound !== null || worldInfo !== undefined || worldInfoError;

  const {
    data: worldState,
    isLoading,
    error,
    refetch: fetchWorldState,
  } = useQuery<WorldState>({
    queryKey: ['worldState', round],
    queryFn: async () => {
      const response = await apiFetch(`/api/world/state?round=${round}`);
      if (!response.ok) throw new Error('Failed to fetch world state');
      return response.json();
    },
    staleTime: 30 * 1000,
    enabled: canFetchRound,
  });

  const errorMessage = error instanceof Error ? error.message : null;
  /** 已執行的最大回合：快照存在 0..currentRound-1，currentRound 是尚未執行的下一回合 → 時間軸不顯示未來回合 / Last run round: snapshots exist for 0..currentRound-1, currentRound is the next (un-run) round → never show future rounds on the timeline */
  const lastRound = Math.max(0, (worldState?.world.currentRound ?? 1) - 1);

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch('/api/auth/session');
        const result: { user?: { email?: string | null } } = await res.json();
        // 比對 session email 與 ADMIN_EMAIL（逗號分隔清單，與伺服器端 isAdmin 規則一致）
        // Compare session email with ADMIN_EMAIL (comma-separated list, same rule as server-side isAdmin)
        const adminEmails = (process.env.ADMIN_EMAIL ?? '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        setIsAdmin(adminEmails.includes((result.user?.email ?? '').toLowerCase()));
      } catch {
        setIsAdmin(false);
      }
    }
    checkAdmin();
  }, []);

  const handleRoundSelect = (round: number) => {
    setSelectedRound(round);
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1000);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'characters' | 'events' | 'stats'>('characters');

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setSelectedRound((prev) => {
        // prev 為 null 表示尚未選取（顯示最新回合）→ 從最新回合往下算 /
        // prev null = no explicit pick (viewing the latest round) → start there
        const next = (prev ?? lastRound) + 1;
        if (next > lastRound) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, playSpeed);
    return () => clearInterval(timer);
  }, [isPlaying, playSpeed, lastRound]);

  // Esc 關閉手機版側欄覆蓋層；若對話框開啟則交由其自行處理。
  // 覆蓋層無論怎麼收合（Esc／背景／✕／選回合）都會在 effect 清理時
  // 把焦點還給開啟它的按鈕 /
  // Escape closes mobile sidebar overlays; when a dialog is open it consumes
  // Escape itself. Whatever closes the overlay (Esc, backdrop, ✕, selecting
  // a round) runs the effect cleanup and returns focus to its toggle button
  useEffect(() => {
    if (!leftSidebarOpen && !rightSidebarOpen) return;
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [leftSidebarOpen, rightSidebarOpen]);

  // ── 載入狀態 / Loading State ──────────────────────────────────────────────

  // 世界進度尚未回應時仍在校正起始回合 → 顯示骨架畫面 /
  // Still resolving the starting round while world progress is pending → skeleton
  const worldInfoPending = worldInfo === undefined && !worldInfoError;

  if ((isLoading || worldInfoPending) && !worldState) {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#020617] overflow-hidden">
        <div className="stars" aria-hidden="true" />
        <div className="stars2" aria-hidden="true" />
        <div className="nebula" aria-hidden="true" />

        {/* 指揮列骨架 / Command bar skeleton */}
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3 px-4 md:px-5 py-3 border-b border-white/5 bg-gray-950/70">
          <div className="flex items-center gap-3">
            <div className={`${GM_SKEL} w-7 h-7`} />
            <div className={`${GM_SKEL} h-4 w-28`} />
            <div className={`${GM_SKEL} h-6 w-24`} />
          </div>
          <div className={`${GM_SKEL} h-4 w-36 hidden sm:block`} />
          <div className="flex items-center gap-2">
            <div className={`${GM_SKEL} h-9 w-24`} />
            <div className={`${GM_SKEL} h-9 w-16`} />
          </div>
        </div>

        {/* 觀測帶骨架 / Telemetry strip skeleton */}
        <div className="relative z-10 flex items-center gap-6 px-4 md:px-6 py-3 border-b border-cyan-400/15 overflow-x-auto ds-gm-noscroll">
          <div className={`${GM_SKEL} h-10 w-32 hidden sm:block`} />
          <div className={`${GM_SKEL} h-10 w-20`} />
          <div className={`${GM_SKEL} h-10 w-24`} />
          <div className={`${GM_SKEL} h-10 w-24`} />
          <div className={`${GM_SKEL} h-10 w-28`} />
        </div>

        {/* 內容骨架 / Content skeleton */}
        <div className="relative z-10 flex-1 flex min-h-0">
          <div className={`hidden md:block w-64 shrink-0 border-r border-white/5 ${GM_RAIL} p-3 space-y-3`}>
            <div className={`${GM_SKEL} h-40 w-full`} />
            <div className={`${GM_SKEL} h-56 w-full`} />
          </div>
          <div className={`flex-1 relative ${GM_RAIL} min-h-64`}>
            <div className="ds-grid-bg absolute inset-0" aria-hidden="true" />
            <div className={`${GM_HUDBAR}`}>
              <div className={`${GM_SKEL} h-5 w-48`} />
              <div className="ml-auto flex items-center gap-2">
                <div className={`${GM_SKEL} w-9 h-9`} />
                <div className={`${GM_SKEL} w-9 h-9`} />
                <div className={`${GM_SKEL} w-9 h-9`} />
              </div>
            </div>
          </div>
          <div className={`hidden lg:block w-80 shrink-0 border-l border-white/5 ${GM_RAIL} p-3 space-y-3`}>
            <div className={`${GM_SKEL} h-9 w-full`} />
            <div className={`${GM_SKEL} h-60 w-full`} />
          </div>
        </div>

        {/* 使用 locale（useSyncExternalStore）而非 t()，確保 SSR 與 hydration 文字一致
            Use locale (useSyncExternalStore) instead of t() so SSR and hydration text match */}
        <p role="status" className="sr-only">
          {getTranslations(locale).general.loading}
        </p>
      </div>
    );
  }

  // ── 錯誤狀態 / Error State ─────────────────────────────────────────────────

  if (errorMessage) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-[#020617] overflow-hidden">
        <div className="stars" aria-hidden="true" />
        <div className="stars2" aria-hidden="true" />
        <div className="nebula" aria-hidden="true" />
        <div className={`relative text-center max-w-md ${GM_PANEL} border-red-500/30! px-8 py-8`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="font-orbitron text-lg font-bold text-white mb-2">{t('general.error')}</h2>
          <p className="text-gray-400 text-base mb-6">{errorMessage}</p>
          <button
            onClick={() => fetchWorldState()}
            className={`${GM_BTN_ACCENT} px-6 py-2.5 text-base font-medium`}
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  const aliveFactions = worldState?.factions.filter((f) => f.alive).length ?? 0;
  const aliveCharacterList = worldState?.characters.filter((c) => c.alive) ?? [];
  const totalTroops = aliveCharacterList.reduce((sum, c) => sum + c.troops, 0);
  const territories = worldState?.places.length ?? 0;

  // ── 主要渲染 / Main Render ─────────────────────────────────────────────────

  return (
    // h-dvh（不是 min-h-screen）：HUD 是「地圖填滿、左右欄內捲」的固定版面，
    // 外層必須是確定高度，flex 演算法才會把剩餘空間分給 row，內層
    // flex-1 + min-h-0 的捲動容器才會拿到小於內容的高度。min-h-screen 只是
    // 下限，row 會被內容撐高、面板就跟著長高而永遠不會捲動 /
    // h-dvh, not min-h-screen: this is a fixed HUD (map fills, side rails
    // scroll). The outer box needs a *definite* height so flex gives the row the
    // leftover space and the inner flex-1 + min-h-0 boxes end up shorter than
    // their content. With min-h-screen the row is floored by its content, the
    // panel grows with it, and nothing ever scrolls.
    <div className="h-dvh flex flex-col overflow-hidden bg-[#020617]">
      {/* ── 深空背景層（影像＋星域＋視差）/ Deep-space backdrop (photo + starfield + parallax) ── */}
      <div className={`${GM_BACKDROP}`} aria-hidden="true">
        <PointerDrift depth={20} className="absolute inset-0">
          <Image
            src="/space/milky-way.jpg"
            alt=""
            fill
            sizes="100vw"
            className={`${GM_PHOTO}`}
          />
        </PointerDrift>
        <div className="nebula" />
        <div className="stars" />
        <div className="stars2" />
        <div className={`${GM_VEIL}`} />
      </div>

      <a
        href="#gm-map"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:bg-cyan-400 focus:text-slate-950 focus:rounded-lg focus:font-medium"
      >
        跳至地圖
      </a>

      {/* ── 指揮列 / Command Bar ──────────────────────────────────────────────── */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 md:px-5 py-3 border-b border-white/5 bg-gray-950/70 backdrop-blur-md">
        {/* 頂部發光線 / Top glow line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-7 h-7 shrink-0">
            <div className="absolute inset-0 rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 blur-sm opacity-50" />
            <div className="relative w-full h-full rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
              </svg>
            </div>
          </div>
          <span className="font-orbitron font-bold text-sm tracking-wider text-white truncate">
            {t('general.title')}
          </span>
          <span className={`${GM_BADGE} hidden sm:flex items-center gap-2 text-xs font-orbitron tracking-wider text-cyan-300/90`}>
            <span className={`${GM_LIVE}`} aria-hidden="true" />
            RND {String(round).padStart(4, '0')}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 min-w-0 text-gray-400">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-400/40" aria-hidden="true" />
          <span className="text-xs font-orbitron tracking-widest truncate">
            {worldState?.world.name ?? '—'}
          </span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-cyan-400/40" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* 左側邊欄切換按鈕（手機版）/ Left sidebar toggle (mobile) */}
          <button
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className={`${GM_BTN} md:hidden w-8 h-8`}
            title="時間軸 & 排行"
            aria-label="時間軸 & 排行"
          >
            <Ic className="w-4 h-4">
              <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </Ic>
          </button>

          <NextRoundButton
            isAdmin={isAdmin}
            currentRound={round}
            onSuccess={(round) => {
              setSelectedRound(round);
              // 回合可能沒變（正在看最新回合）→ 快取不會失效，強制重新抓取
              // Round may be unchanged (viewing latest) → cache key stays, so
              // explicitly invalidate to force a fresh fetch of newest state
              void queryClient.invalidateQueries({ queryKey: ['worldState'] });
              // 事件日誌現在包含所有回合 → 新回合完成後也要失效
              // Event log now spans all rounds → invalidate after a new round too
              void queryClient.invalidateQueries({ queryKey: ['events'] });
            }}
          />
          <LanguageSwitch locale={locale} onToggle={handleLocaleToggle} />

          {/* 登出按鈕 / Logout button */}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className={`${GM_BTN_DANGER} px-3 py-1.5 text-xs font-orbitron tracking-wider`}
            title={t('general.logout')}
          >
            {t('general.logout')}
          </button>

          {/* 右側邊欄切換按鈕（手機版）/ Right sidebar toggle (mobile) */}
          <button
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            className={`${GM_BTN} lg:hidden w-8 h-8`}
            title="將領 & 事件"
            aria-label="將領 & 事件"
          >
            <Ic className="w-4 h-4">
              <circle cx="12" cy="6.75" r="1" />
              <circle cx="12" cy="12.75" r="1" />
              <circle cx="12" cy="18.75" r="1" />
            </Ic>
          </button>
        </div>
      </header>

      {/* ── 世界觀測帶 / World Telemetry Band ──────────────────────────────────── */}
      <TelemetryStrip
        round={round}
        worldName={worldState?.world.name ?? ''}
        aliveFactions={aliveFactions}
        territories={territories}
        aliveCharacters={aliveCharacterList.length}
        totalTroops={totalTroops}
      />

      {/* ── 主要內容 / Main Content ────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex min-h-0">
        {/* ── 左側邊欄（桌面版）/ Left Sidebar (desktop) ──────────────────────── */}
        <aside className={`hidden md:block w-64 shrink-0 border-r border-white/5 ${GM_RAIL} ds-gm-scroll p-3 space-y-3 overflow-y-auto`}>
          <Reveal delay={0.06} y={18}>
            <RoundTimeline
              currentRound={round}
              maxRound={lastRound}
              isPlaying={isPlaying}
              playSpeed={playSpeed}
              onSelect={handleRoundSelect}
              onPlayToggle={() => setIsPlaying(!isPlaying)}
              onSpeedChange={setPlaySpeed}
            />
          </Reveal>
          <Reveal delay={0.12} y={18}>
            <FactionRanking
              factions={worldState?.factions ?? []}
              characters={worldState?.characters ?? []}
              places={worldState?.places ?? []}
            />
          </Reveal>
        </aside>

        {/* ── 左側邊欄（手機版覆蓋，含滑出動畫）/ Left Sidebar (mobile overlay, animated) ── */}
        <AnimatePresence>
          {leftSidebarOpen && (
            <motion.div
              key="left-sidebar"
              className="md:hidden fixed inset-0 z-40 flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setLeftSidebarOpen(false)} />
              <motion.div
                className={`relative w-72 ${GM_RAIL} border-r border-cyan-400/15 p-3 space-y-3 overflow-y-auto ds-gm-scroll`}
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              >
              <div className="flex items-center justify-between mb-2">
                <span className="font-orbitron text-xs text-gray-400 tracking-wider">控制面板</span>
                <button
                  onClick={() => setLeftSidebarOpen(false)}
                  className={`${GM_BTN} w-7 h-7`}
                  aria-label="關閉"
                >
                  <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
                </button>
              </div>
              <RoundTimeline
                currentRound={round}
                maxRound={lastRound}
                isPlaying={isPlaying}
                playSpeed={playSpeed}
                onSelect={(r) => { handleRoundSelect(r); setLeftSidebarOpen(false); }}
                onPlayToggle={() => setIsPlaying(!isPlaying)}
                onSpeedChange={setPlaySpeed}
              />
              <FactionRanking
                factions={worldState?.factions ?? []}
                characters={worldState?.characters ?? []}
                places={worldState?.places ?? []}
              />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 中央（圖形＋HUD）/ Center (Graph + HUD) ────────────────────────── */}
        <main id="gm-map" tabIndex={-1} className="flex-1 relative min-w-0 outline-none">
          <div className="absolute inset-0">
            <GameGraph
                places={worldState?.places ?? []}
                factions={worldState?.factions ?? []}
                roads={worldState?.roads ?? []}
                characters={worldState?.characters ?? []}
                spotlights={worldState?.spotlights ?? []}
                moves={worldState?.moves ?? []}
                onPlaceClick={(place) => setSelectedPlace(place)}
                selectedPlaceId={selectedPlace?.id}
                onControlsReady={(controls) => { mapControlsRef.current = controls; }}
              />
          </div>

          {/* HUD 框角與暗角 / HUD corner brackets + vignette */}
          <div className={`${GM_FRAME}`} aria-hidden="true">
            <span className={`${GM_CORNER_TL}`} />
            <span className={`${GM_CORNER_TR}`} />
            <span className={`${GM_CORNER_BL}`} />
            <span className={`${GM_CORNER_BR}`} />
          </div>
          <div className={`${GM_VIGNETTE}`} aria-hidden="true" />

          {/* 統一 HUD 列：圖例（左）＋相機控制（右）/ Unified HUD bar: legend (left) + camera controls (right) */}
          <div className={`${GM_HUDBAR}`}>
            <div className={`${GM_LEGEND}`} aria-label={t('map.faction')}>
              {(worldState?.factions ?? []).filter((f) => f.alive).slice(0, 5).map((f) => (
                <span key={f.id} className={`${GM_LEGEND_ITEM}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="text-sm text-gray-300 whitespace-nowrap">{f.name}</span>
                </span>
              ))}
              <span className={`${GM_LEGEND_ITEM}`}>
                <span className="w-3 h-3 rounded-full bg-gray-500 shrink-0" />
                <span className="text-sm text-gray-400 whitespace-nowrap">{t('place.unowned')}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => mapControlsRef.current?.resetView()}
                title="重設視圖 / Reset view"
                aria-label="重設視圖 / Reset view"
                className={`${GM_BTN} w-9 h-9`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v5h5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 16h5v5" />
                </svg>
              </button>
              <button
                onClick={() => mapControlsRef.current?.zoomIn()}
                title="放大 / Zoom in"
                aria-label="放大 / Zoom in"
                className={`${GM_BTN} w-9 h-9`}
              >
                <Ic className="w-4 h-4"><path d="M12 6v12M6 12h12" /></Ic>
              </button>
              <button
                onClick={() => mapControlsRef.current?.zoomOut()}
                title="縮小 / Zoom out"
                aria-label="縮小 / Zoom out"
                className={`${GM_BTN} w-9 h-9`}
              >
                <Ic className="w-4 h-4"><path d="M6 12h12" /></Ic>
              </button>
            </div>
          </div>
        </main>

        {/* ── 右側邊欄（桌面版）/ Right Sidebar (desktop) ──────────────────────── */}
        <aside className={`hidden lg:flex flex-col w-80 shrink-0 border-l border-white/5 ${GM_RAIL} overflow-hidden`}>
          <RightSidebarTabs
            activeTab={rightTab}
            onTabChange={setRightTab}
          />
          {/* min-h-0：column flex 的 flex-1 項目預設 min-height:auto，會被內容撐高，
              overflow-y-auto 就永遠不會捲動（外層 overflow-hidden 直接裁掉）/
              min-h-0: a flex-1 child of a column flex box defaults to
              min-height:auto, so it is floored at its content height and
              overflow-y-auto never engages (the rail's overflow-hidden clips it) */}
          <div className="flex-1 min-h-0 overflow-y-auto ds-gm-scroll p-3">
            {rightTab === 'characters' && (
              <CharacterList
                characters={worldState?.characters ?? []}
                places={worldState?.places ?? []}
                factions={worldState?.factions ?? []}
              />
            )}
            {rightTab === 'events' && (
              <EventLog
                worldId={worldState?.world.id ?? ''}
              />
            )}
            {rightTab === 'stats' && (
              <StatsCharts
                worldId={worldState?.world.id ?? ''}
                currentRound={worldState?.world.currentRound ?? 0}
                characters={worldState?.characters ?? []}
                worldFactions={worldState?.factions ?? []}
              />
            )}
          </div>
        </aside>

        {/* ── 右側邊欄（手機版覆蓋）/ Right Sidebar (mobile overlay) ──────────── */}
        {rightSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRightSidebarOpen(false)} />
            <div className={`relative w-80 ${GM_RAIL} border-l border-cyan-400/15 flex flex-col overflow-hidden animate-slide-in-right`}>
              <div className="flex items-center justify-between px-3 pt-3 pb-0">
                <span className="font-orbitron text-xs text-gray-400 tracking-wider">資訊面板</span>
                <button
                  onClick={() => setRightSidebarOpen(false)}
                  className={`${GM_BTN} w-7 h-7`}
                  aria-label="關閉"
                >
                  <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
                </button>
              </div>
              <RightSidebarTabs
                activeTab={rightTab}
                onTabChange={setRightTab}
              />
              <div className="flex-1 min-h-0 overflow-y-auto ds-gm-scroll p-3">
                {rightTab === 'characters' && (
                  <CharacterList
                    characters={worldState?.characters ?? []}
                    places={worldState?.places ?? []}
                    factions={worldState?.factions ?? []}
                  />
                )}
                {rightTab === 'events' && (
                  <EventLog
                    worldId={worldState?.world.id ?? ''}
                  />
                )}
                {rightTab === 'stats' && (
                  <StatsCharts
                    worldId={worldState?.world.id ?? ''}
                    currentRound={worldState?.world.currentRound ?? 0}
                    characters={worldState?.characters ?? []}
                    worldFactions={worldState?.factions ?? []}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 地方詳情彈窗 / Place Detail Panel ───────────────────────────────── */}
      {/* 地點詳情彈窗（含淡出動畫）/ Place detail popup (with fade-out exit) */}
      <AnimatePresence>
        {selectedPlace && (
          <PlaceDetail
            key="place-detail"
            place={selectedPlace}
            factions={worldState?.factions ?? []}
            characters={worldState?.characters ?? []}
            roads={worldState?.roads ?? []}
            places={worldState?.places ?? []}
            onClose={() => setSelectedPlace(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 子元件 / Sub-Components ────────────────────────────────────────────────────

function LanguageSwitch({
  locale,
  onToggle,
}: {
  locale: Locale;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`${GM_BTN} px-3 py-1.5 text-xs font-orbitron tracking-wider text-cyan-300/90!`}
      title={t('general.language')}
      aria-label={t('general.language')}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}

// ─── 右側邊欄分頁 / Right Sidebar Tabs ────────────────────────────────────────────

function RightSidebarTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: 'characters' | 'events' | 'stats';
  onTabChange: (tab: 'characters' | 'events' | 'stats') => void;
}) {
  const tabs = [
    {
      key: 'characters' as const,
      label: t('faction.tab'),
      icon: (
        <>
          <circle cx="9.5" cy="8.5" r="3.25" />
          <path d="M4 19.5a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.6a3.4 3.4 0 0 1 0 6.3" />
          <path d="M17.4 14.6A5.5 5.5 0 0 1 21 19.5" />
        </>
      ),
    },
    {
      key: 'events' as const,
      label: t('events.tab'),
      icon: (
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M8.5 8.5h7M8.5 12.5h7M8.5 16.5h4" />
        </>
      ),
    },
    {
      key: 'stats' as const,
      label: t('stats.tab'),
      icon: (
        <>
          <path d="M5 20V11M12 20V5M19 20v-7" />
          <path d="M3.5 20.5h17" />
        </>
      ),
    },
  ];

  return (
    <div className="flex border-b border-white/5" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-orbitron tracking-wider transition-all duration-200 border-b-2 ${activeTab === tab.key
            ? 'text-cyan-300 border-cyan-400 bg-cyan-500/5'
            : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/5'
            }`}
        >
          <Ic className="w-4 h-4">{tab.icon}</Ic>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function NextRoundButton({
  isAdmin,
  currentRound,
  onSuccess,
}: {
  isAdmin: boolean;
  currentRound: number;
  /** 回傳新回合數，讓頁面跳到剛執行的回合 / Receives the new round number so the view jumps to it */
  onSuccess: (round: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  // 用 ref 同步擋住 loading 中的重複點擊（state 更新前的空窗）
  // Ref closes the race window before setState re-renders, blocking double-clicks
  const loadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!isAdmin || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/run-round', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed');
        return;
      }
      onSuccess(data.round ?? currentRound + 1);
    } catch {
      setError('Network error');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleRun}
        disabled={!isAdmin || loading}
        // 原本是「基底 + 條件式 accent 疊加」。疊加在單一 utilities 層不可靠，
        // 所以改成二選一的完整按鈕。停用游標交給 GM_BTN 的 disabled: 變體——
        // 鈕的停用條件恰好就是 !isAdmin || loading，行為與原式完全相同。
        // Was base-plus-conditional-accent. Layering is unreliable in one
        // utilities layer, so this picks one complete button. The disabled
        // cursor rides GM_BTN's disabled: variant, whose condition matches the
        // button's own disabled={!isAdmin || loading} exactly.
        className={`${!isAdmin ? GM_BTN : GM_BTN_ACCENT} px-3 py-1.5 text-xs font-orbitron tracking-wider`}
        title={isAdmin ? t('admin.runRound') : t('game.adminOnly')}
      >
        {loading ? (
          <Ic className="w-3.5 h-3.5 animate-spin">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </Ic>
        ) : (
          <Ic className="w-3.5 h-3.5"><path d="M8 5.5v13l11-6.5z" /></Ic>
        )}
        {t('game.nextRound')}
      </button>
      {error && (
        <div role="alert" className="absolute top-full mt-1 right-0 z-20 text-xs text-red-300 whitespace-nowrap bg-gray-950/95 px-2 py-1 rounded border border-red-500/30">
          {error}
        </div>
      )}
    </div>
  );
}

function RoundTimeline({
  currentRound,
  maxRound,
  isPlaying,
  playSpeed,
  onSelect,
  onPlayToggle,
  onSpeedChange,
}: {
  currentRound: number;
  maxRound: number;
  isPlaying: boolean;
  playSpeed: number;
  onSelect: (round: number) => void;
  onPlayToggle: () => void;
  onSpeedChange: (speed: number) => void;
}) {
  // 分批渲染回合：世界持續演化，回合數可能達數千，預設只掛載最新 200 個 /
  // Batched rounds: the world keeps evolving and rounds can reach the
  // thousands — mount the latest 200 first, append older pages on demand
  const [olderPages, setOlderPages] = useState(0);
  const oldestRound = Math.max(0, maxRound - 199 - olderPages * 200);

  return (
    <div className={`${GM_PANEL} p-3`}>
      <h3 className={`${GM_TITLE} mb-3`}>
        {t('game.selectRound')}
      </h3>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onPlayToggle}
          className={`${GM_BTN_ACCENT} px-3 py-1.5 text-sm font-medium`}
        >
          {isPlaying ? (
            <>
              <Ic className="w-3.5 h-3.5"><path d="M8 5.5h3v13H8zM13 5.5h3v13h-3z" /></Ic>
              {t('game.pause')}
            </>
          ) : (
            <>
              <Ic className="w-3.5 h-3.5"><path d="M8 5.5v13l11-6.5z" /></Ic>
              {t('game.play')}
            </>
          )}
        </button>
        <input
          type="range"
          min={500}
          max={3000}
          step={500}
          value={playSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          aria-label={t('game.autoPlaySpeed')}
          className="flex-1 h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
        />
        <span className="text-xs text-gray-400 font-orbitron tabular-nums">{playSpeed}ms</span>
      </div>
      {/* 分批顯示：最新 200 個回合在捲軸內，更早的回合按需載入 /
          Batched: latest 200 rounds in the scroll, older rounds on demand */}
      <div className="space-y-0.5 max-h-40 overflow-y-auto ds-gm-scroll">
        {Array.from(
          { length: maxRound - oldestRound + 1 },
          (_, i) => maxRound - i
        ).map(
          (round) => (
            <button
              key={round}
              onClick={() => onSelect(round)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all duration-200 [content-visibility:auto] [contain-intrinsic-size:auto_40px] ${round === currentRound
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/25'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
            >
              <span className="font-orbitron tracking-wider">{t('game.round')} {String(round).padStart(4, '0')}</span>
            </button>
          )
        )}
        {oldestRound > 0 && (
          <button
            type="button"
            onClick={() => setOlderPages((pages) => pages + 1)}
            className={`${GM_BTN} w-full mt-1 py-1.5 text-xs font-orbitron tracking-wider`}
          >
            載入更早回合（{oldestRound}）
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 詳細資料彈窗 / Detail info modal
 * Portal 到 body：側欄卡片有 backdrop-filter，會使子層 fixed 定位失效 /
 * Portaled to body: sidebar cards use backdrop-filter, which breaks
 * fixed positioning for descendant elements
 */
function DetailModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  // open 只會在使用者點擊後於客戶端變 true（SSR 時恒為 false），
  // 因此不需 mounted effect，也不會在伺服器端存取 document /
  // open only flips true after a user click on the client (always false
  // during SSR), so no mounted effect is needed and document is never
  // touched on the server
  // 鍵盤關閉路徑：Esc 收合彈窗（對話框標準行為）/
  // Keyboard dismissal: Escape closes the dialog (standard dialog behaviour)
  // 開啟時記住觸發元素、關閉後歸還焦點；onClose 走 ref，
  // 避免父層輪詢重繪時重掛監聽並把焦點從對話框搶走 /
  // Remember the trigger on open and return focus on close; read onClose
  // through a ref so parent re-renders don't rebind and steal focus
  const onCloseRef = useRef(onClose);
  // 最新 onClose 只在 effect 中同步（不可在 render 期間寫 ref，否則會觸發
  // react-hooks/refs 錯誤，且 render 期間的寫入在並行模式下不安全）。
  // 此 effect 宣告在鍵盤 effect 之前，因此每次 commit 後 ref 都是最新值 /
  // Sync the latest onClose in an effect, never during render (the render-time
  // write trips react-hooks/refs and is unsafe under concurrent rendering).
  // Declared before the keydown effect so the ref is fresh after every commit.
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full max-w-3xl max-h-[80vh] overflow-hidden ${GM_MODAL} shadow-2xl flex flex-col`}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className={`${GM_TITLE} text-gray-200!`}>
            {title}
          </h3>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className={`${GM_BTN} w-7 h-7`}
            aria-label="關閉"
          >
            <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
          </button>
        </div>
        <div className="p-4 overflow-auto ds-gm-scroll">{children}</div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function FactionRanking({
  factions,
  characters,
  places,
}: {
  factions: WorldState['factions'];
  characters: WorldState['characters'];
  places: WorldState['places'];
}) {
  const [showDetail, setShowDetail] = useState(false);

  // 彈窗用完整資料：含全部勢力（不只前 10 名）/
  // Full data for the modal: all factions (not just top 10)
  const detailRows = factions
    .map((faction) => {
      const factionChars = characters.filter(
        (c) => c.factionId === faction.id && c.alive
      );
      const factionPlaces = places.filter((p) => p.factionId === faction.id);
      const king = factionChars.find((c) => c.isKing);
      return {
        faction,
        members: factionChars.length,
        territories: factionPlaces.length,
        troops: factionChars.reduce((sum, c) => sum + c.troops, 0),
        gold: factionChars.reduce((sum, c) => sum + c.gold, 0),
        kingName: king?.name ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.faction.alive) - Number(a.faction.alive) ||
        b.territories - a.territories
    );

  return (
    <div className={`${GM_PANEL} p-3`}>
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        title={t('general.details')}
        className={`${GM_TITLE} mb-3 w-full flex items-center justify-between group hover:text-cyan-300 transition-colors duration-150`}
      >
        <span>{t('ranking.title')}</span>
        <Ic className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
          <path d="M7 17 17 7M9 7h8v8" />
        </Ic>
      </button>
      <div className="space-y-1.5">
        {factions.filter((f) => f.alive).length === 0 && (
          <p className="text-gray-400 text-xs">{t('game.noData')}</p>
        )}
        {factions
          .filter((f) => f.alive)
          .slice(0, 10)
          .map((faction, idx) => {
            const factionChars = characters.filter(
              (c) => c.factionId === faction.id && c.alive
            );
            const factionPlaces = places.filter(
              (p) => p.factionId === faction.id
            );
            const totalTroops = factionChars.reduce(
              (sum, c) => sum + c.troops,
              0
            );
            const totalGold = factionChars.reduce(
              (sum, c) => sum + c.gold,
              0
            );

            return (
              <div key={faction.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors duration-150">
                <span className="font-orbitron text-xs text-gray-400 w-4">{idx + 1}</span>
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="flex-1 text-sm text-gray-200 truncate">{faction.name}</span>
                <span className="text-xs text-gray-400 font-orbitron">{factionPlaces.length}{t('ranking.territories')}</span>
                <span className="text-xs text-gray-400 font-orbitron">{totalTroops}{t('ranking.troops')}</span>
              </div>
            );
          })}
      </div>

      <DetailModal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={t('ranking.title')}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-400 text-left border-b border-white/10">
              <th className="py-2 pr-3 font-medium">{t('ranking.rank')}</th>
              <th className="py-2 pr-3 font-medium">{t('faction.name')}</th>
              <th className="py-2 pr-3 font-medium">{t('general.status')}</th>
              <th className="py-2 pr-3 font-medium">{t('faction.king')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('faction.territories')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('faction.characters')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('ranking.troops')}</th>
              <th className="py-2 font-medium text-right">{t('ranking.gold')}</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row, idx) => (
              <tr
                key={row.faction.id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-150"
              >
                <td className="py-2 pr-3 text-gray-400 font-orbitron">{idx + 1}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: row.faction.color }}
                    />
                    <span className="text-gray-200">{row.faction.name}</span>
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={
                      row.faction.alive && !row.faction.collapsing
                        ? 'text-emerald-400'
                        : row.faction.collapsing
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }
                  >
                    {row.faction.alive
                      ? row.faction.collapsing
                        ? t('faction.collapsing')
                        : t('faction.alive')
                      : t('faction.collapsed')}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-300">
                  {row.kingName ?? t('faction.noKing')}
                </td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{row.territories}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{row.members}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{row.troops}</td>
                <td className="py-2 text-gray-300 font-orbitron text-right">{row.gold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>
    </div>
  );
}

function CharacterList({
  characters,
  places,
  factions,
}: {
  characters: WorldState['characters'];
  places: WorldState['places'];
  factions: WorldState['factions'];
}) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  // 彈窗表格分批：將領會隨回合持續增加，避免一次掛載全部列 /
  // Batched modal rows: characters keep growing with rounds — don't mount them all
  const [rowsShown, setRowsShown] = useState(100);
  // 側欄清單分批：存活將領會隨回合持續增加，避免一次掛載全部列 /
  // Batched sidebar list: alive characters keep growing with rounds —
  // mount only the first page and append on demand
  const [listShown, setListShown] = useState(100);
  const placeMap = new Map<string, string>();
  for (const place of places) {
    placeMap.set(place.id, place.name);
  }
  const factionMap = new Map<string, WorldState['factions'][0]>();
  for (const faction of factions) {
    factionMap.set(faction.id, faction);
  }

  // 彈窗用完整資料：全部存活將領，依兵力排序 /
  // Full data for the modal: all alive characters, sorted by troops
  const detailRows = characters
    .filter((c) => c.alive)
    .map((char) => ({
      char,
      faction: char.factionId
        ? (factionMap.get(char.factionId) ?? null)
        : null,
      placeName: placeMap.get(char.placeId) ?? '—',
    }))
    .sort((a, b) => b.char.troops - a.char.troops);

  // 側欄用同一份排序：兵力 desc / Sidebar uses the same order: troops desc
  const aliveRows = characters.filter((c) => c.alive).sort((a, b) => b.troops - a.troops);

  return (
    <div className={`${GM_PANEL} p-3`}>
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        title={t('general.details')}
        className={`${GM_TITLE} mb-3 w-full flex items-center justify-between group hover:text-cyan-300 transition-colors duration-150`}
      >
        <span>{t('faction.characters')}</span>
        <Ic className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
          <path d="M7 17 17 7M9 7h8v8" />
        </Ic>
      </button>
      <div className="space-y-0.5 max-h-60 overflow-y-auto ds-gm-scroll">
        {aliveRows.length === 0 && (
          <p className="text-gray-400 text-xs">{t('game.noData')}</p>
        )}
        {aliveRows
          .slice(0, listShown)
          .map((char) => (
            <button
              key={char.id}
              onClick={() => setSelectedChar(selectedChar === char.id ? null : char.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_44px] ${selectedChar === char.id
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/25'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{char.name}</span>
                {char.isKing && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" label={t('character.isKing')} />}
                <span className="ml-auto flex items-center gap-1 text-xs text-gray-400 font-orbitron">
                  <Ic className="w-3.5 h-3.5"><path d="m6 13 6-6 6 6M6 18l6-6 6 6" /></Ic>
                  <span className="sr-only">{t('character.troops')}: </span>
                  {char.troops}
                </span>
              </div>
              {selectedChar === char.id && (
                <div className="mt-1.5 pl-3 text-xs text-gray-400 space-y-0.5 border-l border-white/10">
                  <div>{t('character.wu')}: {char.wu} · {t('character.tong')}: {char.tong} · {t('character.jing')}: {char.jing}</div>
                  <div>{t('character.speed')}: {char.speed} · {t('character.ambition')}: {Math.round(char.ambition)}</div>
                  <div>{t('character.age')}: {char.age} · {t('character.troops')}: {char.troops} · {t('character.gold')}: {char.gold}</div>
                  <div>{t('character.place')}: {placeMap.get(char.placeId) ?? '—'}</div>
                </div>
              )}
            </button>
          ))}
        {aliveRows.length > listShown && (
          <button
            type="button"
            onClick={() => setListShown((count) => count + 100)}
            className={`${GM_BTN} w-full py-2 text-xs font-orbitron tracking-wider`}
          >
            載入更多（{aliveRows.length - listShown}）
          </button>
        )}
      </div>

      <DetailModal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={t('faction.characters')}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-400 text-left border-b border-white/10">
              <th className="py-2 pr-3 font-medium">{t('character.name')}</th>
              <th className="py-2 pr-3 font-medium">{t('faction.name')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.wu')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.tong')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.jing')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.speed')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.ambition')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.age')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.troops')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('character.gold')}</th>
              <th className="py-2 pr-3 font-medium">{t('character.loyalty')}</th>
              <th className="py-2 font-medium">{t('character.place')}</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.slice(0, rowsShown).map(({ char, faction, placeName }) => (
              <tr
                key={char.id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-150"
              >
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1 text-gray-200">
                    {char.name}
                    {char.isKing && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" label={t('character.isKing')} />}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {faction ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: faction.color }}
                      />
                      <span className="text-gray-400">{faction.name}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.wu}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.tong}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.jing}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.speed}</td>
                {/* 野心存於 Float 欄位（±0.5 增減），顯示取整與其他整數屬性一致 /
                    Ambition lives in a Float column (±0.5 deltas); round for
                    display so it matches the other integer stats */}
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{Math.round(char.ambition)}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.age}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.troops}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{char.gold}</td>
                <td className="py-2 pr-3 text-gray-300">
                  {t(`character.loyalty${char.loyalty.charAt(0)}${char.loyalty.slice(1).toLowerCase()}`)}
                </td>
                <td className="py-2 text-gray-300">{placeName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {detailRows.length > rowsShown && (
          <button
            type="button"
            onClick={() => setRowsShown((count) => count + 100)}
            className={`${GM_BTN} w-full mt-3 py-2 text-xs font-orbitron tracking-wider`}
          >
            載入更多（{detailRows.length - rowsShown}）
          </button>
        )}
      </DetailModal>
    </div>
  );
}

function EventLog({
  worldId,
}: {
  worldId: string;
}) {
  const { data, isLoading } = useQuery<{ events: GameEvent[] }>({
    // 不帶 round → 回傳所有回合的事件 / Omit round → events for ALL rounds
    queryKey: ['events'],
    queryFn: async () => {
      const res = await apiFetch('/api/world/events');
      if (!res.ok) return { events: [] };
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const events = data?.events ?? [];

  // 分批顯示：回合數增長後事件可能上萬筆，避免一次掛載全部 DOM /
  // Batched rendering: events can reach tens of thousands as rounds grow —
  // mount only the first page and append on demand
  const [visibleCount, setVisibleCount] = useState(60);

  function formatEvent(event: GameEvent): string {
    const p = event.data;
    // 野心增減附註（-1 / +1），無資料時為空字串 /
    // Ambition delta suffix (-1 / +1); empty when the event carries no delta
    const ambitionNote = (delta: unknown): string =>
      typeof delta === 'number' && delta !== 0
        ? t('events.ambitionDelta').replace('{delta}', String(delta))
        : '';
    switch (event.type) {
      case 'PLACE_CREATED':
        return t('events.newPlaceDesc').replace('{place}', p.placeName as string);
      case 'CHARACTER_SPAWNED':
        return t('events.spawnDesc').replace('{character}', p.charName as string);
      case 'CHARACTER_MOVED': {
        const from = (p.fromPlaceName as string | null) ?? '?';
        const to = (p.toPlaceName as string | null) ?? '?';
        return t('events.moveDesc')
          .replace('{character}', p.charName as string)
          .replace('{from}', from)
          .replace('{to}', to);
      }
      case 'DEATH':
        return t('events.deathDesc').replace('{character}', p.charName as string);
      case 'BATTLE_DEATH':
        return t('events.battleDeathDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      case 'ESCAPE_SUCCESS':
        return t('events.escapeSuccessDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      case 'DEFECTION':
        return t('events.defectionDesc').replace('{character}', p.charName as string);
      case 'FACTION_COLLAPSE':
        return t('events.collapseDesc').replace('{faction}', p.factionName as string);
      case 'FACTION_ELIMINATED':
        return t('events.eliminationDesc').replace('{faction}', p.factionName as string);
      case 'BUILDING_UPGRADE':
        return t('events.buildingDesc')
          .replace('{place}', p.placeName as string)
          .replace('{building}', t(`map.${p.building as string}`))
          .replace('{level}', String(p.newLevel));
      case 'ADMIN_ASSIGNED':
        return (
          t('events.adminAssignedDesc')
            .replace('{character}', p.charName as string)
            .replace('{place}', p.placeName as string) +
          ambitionNote(p.ambitionDelta)
        );
      case 'ADMIN_REMOVED':
        return (
          t('events.adminRemovedDesc')
            .replace('{character}', p.charName as string)
            .replace('{place}', p.placeName as string)
            .replace('{newAdmin}', (p.newAdminName as string) ?? '?') +
          ambitionNote(p.ambitionDelta)
        );
      case 'AMBITION_RECOVERED':
        return (
          t('events.ambitionRecoveredDesc')
            .replace('{character}', p.charName as string)
            .replace('{place}', p.placeName as string) +
          ambitionNote(p.ambitionDelta)
        );
      case 'PLACE_CAPTURED':
        return t('events.placeCaptureDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      default:
        return event.type;
    }
  }

  return (
    <div className={`${GM_PANEL} p-3`}>
      <h3 className={`${GM_TITLE} mb-3 flex items-center justify-between`}>
        <span>{t('events.title')}</span>
        <span className="text-cyan-300/85 text-xs tracking-widest font-normal">
          {events.length} {t('events.tab')}
        </span>
      </h3>
      {/* 所有回合的事件，高度加倍以便瀏覽 / All rounds' events, doubled height for browsing */}
      <div className="space-y-0.5 max-h-80 overflow-y-auto ds-gm-scroll">
        {isLoading && (
          <p className="text-gray-400 text-xs">{t('general.loading')}</p>
        )}
        {!isLoading && events.length === 0 && (
          <p className="text-gray-400 text-xs">{t('game.noData')}</p>
        )}
        {events.slice(0, visibleCount).map((event) => (
          <div key={event.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_44px]">
            <EventGlyph type={event.type} />
            {/* 回合徽章：所有回合的事件需標示來源回合 / Round badge: all-rounds events need their source round */}
            <span className="font-orbitron text-[10px] text-cyan-400/80 shrink-0 mt-1 tracking-wider">
              {String(event.round).padStart(4, '0')}
            </span>
            <span className="text-sm text-gray-400 leading-relaxed">{formatEvent(event)}</span>
          </div>
        ))}
        {events.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 60)}
            className={`${GM_BTN} w-full mt-2 py-2 text-xs font-orbitron tracking-wider`}
          >
            載入更多（{events.length - visibleCount}）
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 統計圖表 / Stats Charts ─────────────────────────────────────────────────────

/** 圖表類型 / Chart type */
type ChartType = 'line' | 'pie' | 'square' | 'treemap';

const CHART_TYPES: readonly ChartType[] = ['line', 'pie', 'square', 'treemap'];

/** 圖表類型的 i18n 鍵 / i18n keys for the chart types */
const CHART_TYPE_LABEL_KEYS: Record<ChartType, string> = {
  line: 'stats.line',
  pie: 'stats.pie',
  square: 'stats.square',
  treemap: 'stats.treemap',
};

/** 長條圖最多顯示的回合數，較早的回合會被省略 / Max rounds in bar charts, older rounds are dropped */
const BAR_MAX_ROUNDS = 24;

const CHART_W = 280;
const CHART_H = 120;
const CHART_PAD = 26;

/** 單一序列的圖表資料 / One series of chart data */
interface ChartSeries {
  values: number[];
  color: string;
  label: string;
}

/** 可圖表化的勢力欄位 / Per-faction fields that can be charted */
type FactionStatKey = 'troops' | 'gold' | 'territories' | 'characters';

/** 可圖表化的世界欄位 / World-wide fields that can be charted */
type WorldStatKey =
  | 'aliveFactions'
  | 'totalCharacters'
  | 'unownedPlaces'
  | 'totalGarrison'
  | 'totalRoads';

/** GET /api/world/stats 回應格式 / GET /api/world/stats response shape */
interface StatsPayload {
  rounds: number[];
  factions: Array<{
    id: string;
    name: string;
    color: string;
    troops: number[];
    gold: number[];
    territories: number[];
    characters: number[];
  }>;
  world: Record<WorldStatKey, number[]>;
}

/** 圖表外框：標題 + 內容 / Chart frame: title + body */
function ChartFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-xs text-gray-400 font-orbitron tracking-wider mb-1.5 uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

/** 圖例：單一序列時隱藏 / Legend — hidden when there is a single series */
function ChartLegend({ series, shares }: { series: ChartSeries[]; shares?: number[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
      {series.map((s, i) => (
        <li
          key={`${s.label}-${i}`}
          className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-mono"
        >
          <span
            className="w-2 h-2 rounded-[1px] shrink-0"
            style={{ backgroundColor: s.color }}
          />
          <span className="truncate max-w-[80px]">{s.label}</span>
          {shares && <span className="text-gray-500">{shares[i].toFixed(0)}%</span>}
        </li>
      ))}
    </ul>
  );
}

/** 水平格線 / Horizontal grid lines */
function ChartGrid({ maxVal }: { maxVal: number }) {
  const plotH = CHART_H - CHART_PAD * 2;
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={CHART_PAD}
          y1={CHART_H - CHART_PAD - pct * plotH}
          x2={CHART_W - CHART_PAD}
          y2={CHART_H - CHART_PAD - pct * plotH}
          stroke="#1e293b"
          strokeWidth={0.5}
        />
      ))}
      <text
        x={2}
        y={CHART_PAD - 8}
        fill="#475569"
        fontSize={8}
        fontFamily="monospace"
      >
        {maxVal}
      </text>
    </g>
  );
}

/** 折線圖：每個序列一條線 / Line chart — one line per series */
function LineChart({
  series,
  title,
  rounds,
}: {
  series: ChartSeries[];
  title: string;
  rounds: number[];
}) {
  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const plotW = CHART_W - CHART_PAD * 2;
  const plotH = CHART_H - CHART_PAD * 2;
  const xScale = (i: number) =>
    CHART_PAD + (i / Math.max(rounds.length - 1, 1)) * plotW;
  const yScale = (v: number) => CHART_H - CHART_PAD - (v / maxVal) * plotH;

  return (
    <ChartFrame title={title}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        role="img"
        aria-label={title}
      >
        <ChartGrid maxVal={maxVal} />
        {series.map((s, si) => (
          <polyline
            key={si}
            points={s.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* 標記最新一回合的端點 / Mark the latest round of each series */}
        {series.map((s, si) => {
          const last = s.values.length - 1;
          if (last < 0) return null;
          return (
            <circle
              key={si}
              cx={xScale(last)}
              cy={yScale(s.values[last] ?? 0)}
              r={2}
              fill={s.color}
            />
          );
        })}
      </svg>
      <ChartLegend series={series} />
    </ChartFrame>
  );
}

/** 圓環扇形路徑 / Donut sector path */
function donutSector(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number
): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return [
    `M ${p(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p(rOuter, end)}`,
    `L ${p(rInner, end)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p(rInner, start)}`,
    'Z',
  ].join(' ');
}

/** 圓餅圖：最新一回合的佔比 / Pie chart — share at the latest round */
function PieChart({ series, title }: { series: ChartSeries[]; title: string }) {
  const values = series.map((s) => s.values[s.values.length - 1] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter * 0.55;
  const startAngle = -Math.PI / 2;
  // 累加前置總數取得每個扇形的起點角度 / Prefix sum gives each sector its start angle
  const prefixAt = (i: number) => values.slice(0, i).reduce((a, b) => a + b, 0);

  return (
    <ChartFrame title={title}>
      {total <= 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">{t('game.noData')}</p>
      ) : (
        <div className="flex items-center gap-3">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-24 shrink-0"
            role="img"
            aria-label={title}
          >
            {series.map((s, i) => {
              const value = values[i] ?? 0;
              if (value <= 0) return null;
              const from = startAngle + (prefixAt(i) / total) * Math.PI * 2;
              const sweep = (value / total) * Math.PI * 2;
              return (
                <path
                  key={i}
                  d={donutSector(cx, cy, rOuter, rInner, from, from + sweep)}
                  fill={s.color}
                  opacity={0.9}
                />
              );
            })}
            <text
              x={cx}
              y={cy + 5}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize={15}
              fontFamily="monospace"
            >
              {total}
            </text>
          </svg>
          <ChartLegend
            series={series}
            shares={values.map((v) => (v / total) * 100)}
          />
        </div>
      )}
    </ChartFrame>
  );
}

/** 進度環：目前值相對歷史峰值的比例（單一序列時取代圓餅圖）
 *  Gauge ring — current value against its historical peak (replaces the pie for a single series) */
function GaugeChart({ series, title }: { series: ChartSeries[]; title: string }) {
  const s = series[0];
  const values = s?.values ?? [];
  const value = values[values.length - 1] ?? 0;
  const peak = Math.max(1, ...values);
  const ratio = Math.min(1, value / peak);
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 9;
  const circumference = 2 * Math.PI * r;

  return (
    <ChartFrame title={title}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-24 mx-auto"
        role="img"
        aria-label={title}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={s?.color ?? '#22d3ee'}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={17}
          fontFamily="monospace"
        >
          {value}
        </text>
        <text
          x={cx}
          y={cy + 15}
          textAnchor="middle"
          fill="#64748b"
          fontSize={8}
          fontFamily="monospace"
        >
          {t('stats.peak')} {peak}
        </text>
      </svg>
    </ChartFrame>
  );
}

/** 長條圖：每回合一根堆疊長條 / Bar chart — one stacked bar per round */
function BarChart({
  series,
  title,
  rounds,
}: {
  series: ChartSeries[];
  title: string;
  rounds: number[];
}) {
  const start = Math.max(0, rounds.length - BAR_MAX_ROUNDS);
  const visibleRounds = rounds.slice(start);
  const totals = visibleRounds.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[start + i] ?? 0), 0)
  );
  const maxVal = Math.max(1, ...totals);
  const plotW = CHART_W - CHART_PAD * 2;
  const plotH = CHART_H - CHART_PAD * 2;
  const slot = plotW / Math.max(visibleRounds.length, 1);
  const barW = Math.max(1.5, Math.min(16, slot * 0.6));
  const lastRound = visibleRounds[visibleRounds.length - 1];
  // 該回合前已堆疊的數值 / How much is already stacked below in that round
  const stackedBelow = (roundIdx: number, upto: number) =>
    series
      .slice(0, upto)
      .reduce((sum, s) => sum + (s.values[start + roundIdx] ?? 0), 0);

  return (
    <ChartFrame title={title}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        role="img"
        aria-label={title}
      >
        <ChartGrid maxVal={maxVal} />
        {totals.map((_, i) => {
          const x = CHART_PAD + i * slot + (slot - barW) / 2;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.values[start + i] ?? 0;
                if (v <= 0) return null;
                const h = (v / maxVal) * plotH;
                const y =
                  CHART_H - CHART_PAD - ((stackedBelow(i, si) + v) / maxVal) * plotH;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 0.5)}
                    fill={s.color}
                    opacity={0.9}
                  />
                );
              })}
            </g>
          );
        })}
        {visibleRounds.length > 0 && (
          <>
            <text
              x={CHART_PAD}
              y={CHART_H - 6}
              fill="#475569"
              fontSize={8}
              fontFamily="monospace"
            >
              {visibleRounds[0]}
            </text>
            <text
              x={CHART_W - CHART_PAD}
              y={CHART_H - 6}
              textAnchor="end"
              fill="#475569"
              fontSize={8}
              fontFamily="monospace"
            >
              {lastRound}
            </text>
          </>
        )}
      </svg>
      <ChartLegend series={series} />
    </ChartFrame>
  );
}

/** treemap 最多顯示的勢力數，太多會糊成一片 / Max factions drawn in the treemap before it turns to mush */
const TREEMAP_MAX_FACTIONS = 12;

/** 雷達圖最多疊加的勢力數 / Max faction polygons overlaid in the radar */
const RADAR_MAX_FACTIONS = 6;

const TREEMAP_W = 280;
const TREEMAP_H = 190;

/** treemap 的三個內部分段（依序列值）/ The treemap's three inner segments, in series order */
const TREEMAP_SEGMENT_KEYS = ['troops', 'gold', 'characters'] as const;

/** treemap 分段色票取自設計 token（兵力/金幣/將領）/ Segment swatches come from design tokens (troops / gold / characters) */
const TREEMAP_SEGMENT_VARS = [
  'var(--color-ds-cyan)',
  'var(--color-ds-amber)',
  'var(--color-ds-purple)',
] as const;

/** treemap 的節點 / One treemap node; `children` turns it into a subdivided block */
interface TreemapNode {
  key: string;
  label: string;
  value: number;
  color: string;
  children?: TreemapNode[];
}

/**
 * slice-and-dice 佈局：把節點依價值比例切成長條，父節點遞迴切分自己的矩形。
 * Slice-and-dice: split nodes proportionally along the longer axis, recursing
 * into each parent's own rectangle. Cheap, deterministic, and good enough for
 * the ~12 blocks the treemap caps itself at.
 *
 * @param nodes - 要排列的節點（值 <= 0 的會被忽略）/ Nodes to lay out (non-positive values are skipped)
 * @param rect - 可用矩形 / The rectangle to fill
 * @returns 每個節點（含父與子）分到的矩形 / The rectangle assigned to each node, parents included
 */
function layoutTreemap(
  nodes: TreemapNode[],
  rect: { x: number; y: number; width: number; height: number }
): Array<{ node: TreemapNode; x: number; y: number; width: number; height: number }> {
  const usable = nodes.filter((n) => n.value > 0);
  const total = usable.reduce((sum, n) => sum + n.value, 0);
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return [];

  const placed: Array<{
    node: TreemapNode;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  // 沿較長的那一邊切，切出來的長條才不會立刻變細 /
  // Cut along the longer side so the strips do not immediately go sliver-thin
  const horizontal = rect.width >= rect.height;
  const span = horizontal ? rect.width : rect.height;
  let offset = 0;

  for (const node of usable) {
    const slice = (node.value / total) * span;
    const box = horizontal
      ? { x: rect.x + offset, y: rect.y, width: slice, height: rect.height }
      : { x: rect.x, y: rect.y + offset, width: rect.width, height: slice };
    placed.push({ node, ...box });
    if (node.children && node.children.length > 0) {
      placed.push(...layoutTreemap(node.children, box));
    }
    offset += slice;
  }

  return placed;
}

/**
 * 勢力力量區塊圖：每個勢力一個區塊，面積是領地數，區塊內再依兵力/金幣/將領細分。
 * Faction power treemap: one block per faction sized by territory count, each
 * subdivided into troops / gold / characters.
 *
 * 三個指標量級差很多（兵力可以是將領數的千倍），所以各指標先除以「全世界的最大值」
 * 再取比例 — 區塊大小同時反映勢力量級與內部組成。這個正規化是刻意的取捨。
 * The three metrics differ by orders of magnitude, so each is divided by its own
 * world maximum before the split: block area reflects both a faction's scale
 * and its internal mix. That normalisation is a deliberate trade-off.
 */
function FactionTreemap({ factions }: { factions: StatsPayload['factions'] }) {
  const at = (f: StatsPayload['factions'][number], key: (typeof TREEMAP_SEGMENT_KEYS)[number] | 'territories') => {
    const series = f[key];
    return series[series.length - 1] ?? 0;
  };

  // 只畫有領地的勢力，並依領地數取前 N 個 /
  // Only factions holding land, capped to the largest N
  const ranked = [...factions]
    .filter((f) => at(f, 'territories') > 0)
    .sort((a, b) => at(b, 'territories') - at(a, 'territories'))
    .slice(0, TREEMAP_MAX_FACTIONS);

  // 各指標的正規化基準 / Each metric's normalisation base
  const maxOf = (key: (typeof TREEMAP_SEGMENT_KEYS)[number]) =>
    Math.max(1, ...ranked.map((f) => at(f, key)));

  const maxTroops = maxOf('troops');
  const maxGold = maxOf('gold');
  const maxCharacters = maxOf('characters');

  const nodes: TreemapNode[] = ranked.map((f) => {
    const children: TreemapNode[] = [
      { key: `${f.id}-troops`, label: t('stats.troopsOverTime'), value: at(f, 'troops') / maxTroops, color: TREEMAP_SEGMENT_VARS[0] },
      { key: `${f.id}-gold`, label: t('stats.goldOverTime'), value: at(f, 'gold') / maxGold, color: TREEMAP_SEGMENT_VARS[1] },
      { key: `${f.id}-characters`, label: t('stats.charactersOverTime'), value: at(f, 'characters') / maxCharacters, color: TREEMAP_SEGMENT_VARS[2] },
    ];
    return {
      key: f.id,
      label: f.name,
      value: at(f, 'territories'),
      color: f.color,
      // 沒有任何數值時不細分，只留勢力色的大區塊 /
      // With nothing to split, keep the plain faction-coloured block
      children: children.some((c) => c.value > 0) ? children : undefined,
    };
  });

  const placed = layoutTreemap(nodes, {
    x: 0,
    y: 0,
    width: TREEMAP_W,
    height: TREEMAP_H,
  });

  return (
    <ChartFrame title={t('stats.factionPower')}>
      {placed.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">{t('game.noData')}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${TREEMAP_W} ${TREEMAP_H}`}
            className="w-full"
            role="img"
            aria-label={t('stats.factionPower')}
          >
            {placed.map(({ node, x, y, width, height }) => {
              // 父區塊畫勢力色底，子區塊疊在它上面 /
              // Parents paint the faction colour; children sit on top
              const isParent = node.children !== undefined;
              return (
                <rect
                  key={node.key}
                  x={x}
                  y={y}
                  width={Math.max(0, width)}
                  height={Math.max(0, height)}
                  fill={node.color}
                  fillOpacity={isParent ? 0.22 : 0.62}
                  stroke={node.color}
                  strokeWidth={isParent ? 1 : 0.5}
                />
              );
            })}
          </svg>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {ranked.map((f) => (
              <li
                key={f.id}
                className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-mono"
              >
                <span
                  className="w-2 h-2 rounded-[1px] shrink-0"
                  style={{ backgroundColor: f.color }}
                />
                <span className="truncate max-w-[80px]">{f.name}</span>
                <span className="text-gray-500">{at(f, 'territories')}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {TREEMAP_SEGMENT_KEYS.map((key, i) => (
              <li
                key={key}
                className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-mono"
              >
                <span
                  className="w-2 h-2 rounded-[1px] shrink-0"
                  style={{ backgroundColor: TREEMAP_SEGMENT_VARS[i] }}
                />
                {key === 'troops'
                  ? t('stats.troopsOverTime')
                  : key === 'gold'
                    ? t('stats.goldOverTime')
                    : t('stats.charactersOverTime')}
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartFrame>
  );
}

/** 雷達圖的六個軸：五項能力 + 年齡 / The radar's six axes: five abilities plus age */
const RADAR_AXES = [
  { key: 'wu', label: 'character.wu', max: CONFIG.CHAR_ABILITY_MAX },
  { key: 'tong', label: 'character.tong', max: CONFIG.CHAR_ABILITY_MAX },
  { key: 'jing', label: 'character.jing', max: CONFIG.CHAR_ABILITY_MAX },
  { key: 'speed', label: 'character.speed', max: CONFIG.CHAR_SPEED_MAX },
  { key: 'ambition', label: 'character.ambition', max: CONFIG.CHAR_AMBITION_MAX },
  { key: 'age', label: 'character.age', max: CONFIG.CHAR_MAX_AGE_MAX },
] as const;

const RADAR_SIZE = 210;
const RADAR_RADIUS = 68;

/**
 * 將一組數值轉成雷達多邊形的點字串。
 * Turn one series of axis values into an SVG polygon point list.
 *
 * @param values - 每個軸的值（與 RADAR_AXES 同序）/ One value per axis, in RADAR_AXES order
 * @returns "x,y x,y …" / A "x,y x,y …" point list
 */
function radarPoints(values: number[]): string {
  const cx = RADAR_SIZE / 2;
  const cy = RADAR_SIZE / 2;
  return RADAR_AXES.map((axis, i) => {
    const ratio = Math.max(0, Math.min(1, (values[i] ?? 0) / axis.max));
    const angle = -Math.PI / 2 + (i / RADAR_AXES.length) * Math.PI * 2;
    const r = ratio * RADAR_RADIUS;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

/**
 * 將領雷達圖：每個勢力一個多邊形，畫的是該勢力存活將領的平均屬性，
 * 虛線是全世界的平均值當參考基準。
 * Character radar: one polygon per faction showing its living characters' mean
 * attributes, with the world average as a dashed reference.
 *
 * 各軸用不同的最大值正規化（年齡上限本來就遠高於能力值），所以邊長不能跨軸比較，
 * 這是雷達圖的慣例：看的是「這個形狀像什麼」，不是絕對數值。
 * Each axis normalises against its own maximum (age tops out far above the
 * ability stats), so edge lengths are not comparable across axes — the usual
 * radar caveat: read the shape, not the absolute numbers.
 */
function CharacterRadar({
  characters,
  factions,
}: {
  characters: WorldState['characters'];
  factions: WorldState['factions'];
}) {
  const living = characters.filter((c) => c.alive);

  /** 依所給角色算每個軸的平均值 / Mean of every axis over the given characters */
  const means = (group: WorldState['characters']): number[] | null => {
    if (group.length === 0) return null;
    return RADAR_AXES.map((axis) => {
      const sum = group.reduce((acc, c) => acc + (c[axis.key] as number), 0);
      return sum / group.length;
    });
  };

  // 依存活將領數取前 N 個勢力，太多多邊形會互相蓋住 /
  // Cap to the factions with the most living characters; more polygons just overlap
  const bySize = factions
    .map((faction) => {
      const members = living.filter((c) => c.factionId === faction.id);
      return { faction, members, values: means(members) };
    })
    .filter((entry) => entry.values !== null)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, RADAR_MAX_FACTIONS);

  const worldAverage = means(living);
  const cx = RADAR_SIZE / 2;
  const cy = RADAR_SIZE / 2;

  return (
    <ChartFrame title={t('stats.attributes')}>
      {living.length === 0 || bySize.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">{t('game.noData')}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            className="w-full max-w-[240px] mx-auto"
            role="img"
            aria-label={t('stats.attributes')}
          >
            {/* 同心格線 / Concentric grid */}
            {[0.25, 0.5, 0.75, 1].map((pct) =>
              RADAR_AXES.map((axis, i) => {
                const angle = -Math.PI / 2 + (i / RADAR_AXES.length) * Math.PI * 2;
                const r = pct * RADAR_RADIUS;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                return (
                  <line
                    key={`${pct}-${i}`}
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="var(--color-ds-void)"
                    strokeWidth={0.5}
                  />
                );
              })
            )}
            {/* 勢力多邊形 / Faction polygons */}
            {bySize.map(({ faction, values }) => (
              <polygon
                key={faction.id}
                points={radarPoints(values ?? [])}
                fill={faction.color}
                fillOpacity={0.14}
                stroke={faction.color}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            ))}
            {/* 世界平均參考線 / World-average reference */}
            {worldAverage && (
              <polygon
                points={radarPoints(worldAverage)}
                fill="none"
                stroke="var(--color-ds-cyan)"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            )}
            {/* 軸標籤 / Axis labels */}
            {RADAR_AXES.map((axis, i) => {
              const angle = -Math.PI / 2 + (i / RADAR_AXES.length) * Math.PI * 2;
              const r = RADAR_RADIUS + 15;
              const x = cx + r * Math.cos(angle);
              const y = cy + r * Math.sin(angle);
              return (
                <text
                  key={axis.key}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  fontFamily="monospace"
                  style={{ fill: 'var(--color-ds-muted)' }}
                >
                  {t(axis.label)}
                </text>
              );
            })}
          </svg>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {bySize.map(({ faction, members }) => (
              <li
                key={faction.id}
                className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-mono"
              >
                <span
                  className="w-2 h-2 rounded-[1px] shrink-0"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="truncate max-w-[80px]">{faction.name}</span>
                <span className="text-gray-500">{members.length}</span>
              </li>
            ))}
            {worldAverage && (
              <li className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                <span
                  className="w-3 h-0 border-t border-dashed"
                  style={{ borderColor: 'var(--color-ds-cyan)' }}
                />
                {t('stats.worldAverage')}
              </li>
            )}
          </ul>
        </>
      )}
    </ChartFrame>
  );
}

/** 圖表類型切換（折線／圓餅／長條／區塊圖）/ Chart type switch (line / pie / bar / treemap) */
function ChartTypeSwitch({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (next: ChartType) => void;
}) {
  return (
    <div className="flex gap-1 shrink-0" role="group" aria-label={t('stats.chartType')}>
      {CHART_TYPES.map((ct) => (
        <button
          key={ct}
          type="button"
          onClick={() => onChange(ct)}
          aria-pressed={value === ct}
          // 同上：選中態換成完整的 accent 按鈕，而不是在基底上加一個類別
          // Same reason: the selected state swaps in a complete accent button
          className={`${value === ct ? GM_BTN_ACCENT : GM_BTN} px-2 py-1 text-[10px] font-orbitron tracking-wider`}
        >
          {t(CHART_TYPE_LABEL_KEYS[ct])}
        </button>
      ))}
    </div>
  );
}

function StatsCharts({
  worldId,
  currentRound,
  characters,
  worldFactions,
}: {
  worldId: string;
  currentRound: number;
  characters: WorldState['characters'];
  worldFactions: WorldState['factions'];
}) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [data, setData] = useState<StatsPayload | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (currentRound < 1) return;
    let cancelled = false;
    async function fetchStats() {
      setFetchFailed(false);
      try {
        const res = await apiFetch(`/api/world/stats?from=0&to=${currentRound}`);
        if (res.ok) {
          const payload: StatsPayload = await res.json();
          if (!cancelled) setData(payload);
        } else if (!cancelled) {
          setFetchFailed(true);
        }
      } catch {
        if (!cancelled) setFetchFailed(true);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [currentRound, worldId]);

  if (currentRound < 1 || !data || data.rounds.length === 0) {
    return (
      <div className={`${GM_PANEL} p-3`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className={`${GM_TITLE}`}>{t('stats.title')}</h3>
          <ChartTypeSwitch value={chartType} onChange={setChartType} />
        </div>
        <p className="text-gray-400 text-xs" role={fetchFailed ? 'alert' : undefined}>
          {fetchFailed ? t('general.error') : t('game.noData')}
        </p>
      </div>
    );
  }

  const { factions, rounds, world } = data;

  const factionSeries = (key: FactionStatKey): ChartSeries[] =>
    factions.map((f) => ({ values: f[key], color: f.color, label: f.name }));

  const worldSeries = (key: WorldStatKey): ChartSeries[] => [
    { values: world[key] ?? [], color: '#22d3ee', label: t('stats.title') },
  ];

  // 勢力數據（每個勢力一條序列）/ Faction data — one series per faction
  const factionCharts: Array<{ title: string; series: ChartSeries[] }> = [
    { title: t('stats.territoriesOverTime'), series: factionSeries('territories') },
    { title: t('stats.troopsOverTime'), series: factionSeries('troops') },
    { title: t('stats.goldOverTime'), series: factionSeries('gold') },
    { title: t('stats.charactersOverTime'), series: factionSeries('characters') },
  ];

  // 世界整體數據（單一序列）/ World-wide data — single series
  const worldCharts: Array<{ title: string; series: ChartSeries[] }> = [
    { title: t('stats.aliveFactionsOverTime'), series: worldSeries('aliveFactions') },
    { title: t('stats.totalCharactersOverTime'), series: worldSeries('totalCharacters') },
    { title: t('stats.unownedPlacesOverTime'), series: worldSeries('unownedPlaces') },
    { title: t('stats.garrisonOverTime'), series: worldSeries('totalGarrison') },
    { title: t('stats.roadsOverTime'), series: worldSeries('totalRoads') },
  ];

  function renderChart(chart: { title: string; series: ChartSeries[] }) {
    if (chart.series.length === 0) return null;
    if (chartType === 'pie') {
      // 單一序列用進度環，其餘用圓餅圖 / Single series uses the gauge, otherwise a pie
      return chart.series.length === 1 ? (
        <GaugeChart key={chart.title} series={chart.series} title={chart.title} />
      ) : (
        <PieChart key={chart.title} series={chart.series} title={chart.title} />
      );
    }
    if (chartType === 'square') {
      return (
        <BarChart
          key={chart.title}
          series={chart.series}
          title={chart.title}
          rounds={rounds}
        />
      );
    }
    return (
      <LineChart
        key={chart.title}
        series={chart.series}
        title={chart.title}
        rounds={rounds}
      />
    );
  }

  return (
    <div className={`${GM_PANEL} p-3`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className={`${GM_TITLE}`}>{t('stats.title')}</h3>
        <ChartTypeSwitch value={chartType} onChange={setChartType} />
      </div>
      {chartType === 'treemap' ? (
        // 區塊圖是「勢力力量」的整合視角，不是任何單一指標的另一種畫法，
        // 所以這個模式下不畫那 9 張時間序列圖。
        // The treemap is a combined view of faction power, not another rendering
        // of any single metric, so it replaces the nine time-series charts.
        <FactionTreemap factions={factions} />
      ) : (
        <>
          {factionCharts.map((chart) => (
            <div key={chart.title}>{renderChart(chart)}</div>
          ))}
          {factionCharts.some((c) => c.series.length > 0) && (
            <div className="border-t border-white/5 pt-3 mt-1">
              {worldCharts.map((chart) => (
                <div key={chart.title}>{renderChart(chart)}</div>
              ))}
            </div>
          )}
        </>
      )}
      {/* 雷達圖是自己的面板，不受圖表類型影響 / The radar is its own panel and ignores the type toggle */}
      <div className="border-t border-white/5 pt-3 mt-1">
        <CharacterRadar characters={characters} factions={worldFactions} />
      </div>
    </div>
  );
}

function PlaceDetail({
  place,
  factions,
  characters,
  roads,
  places,
  onClose,
}: {
  place: WorldState['places'][0];
  factions: WorldState['factions'];
  characters: WorldState['characters'];
  roads: WorldState['roads'];
  places: WorldState['places'];
  onClose: () => void;
}) {
  const faction = factions.find((f) => f.id === place.factionId);
  const placeChars = characters.filter(
    (c) => c.placeId === place.id && c.alive
  );
  // 管理此地點的行政官（可能人在他處）/ The place's administrator (may be elsewhere)
  const adminChar = characters.find((c) => c.id === place.administratorId) ?? null;

  const linkedPlaceNames = roads
    .filter((road) => road.aId === place.id || road.bId === place.id)
    .map((road) => (road.aId === place.id ? road.bId : road.aId))
    .map((id) => places.find((p) => p.id === id)?.name ?? null)
    .filter((name): name is string => name !== null);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className={`relative max-w-md w-full mx-4 ${GM_MODAL} overflow-hidden shadow-2xl shadow-black/60`}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 影像標頭 / Imagery header */}
        <div className="relative h-24 overflow-hidden">
          <Image
            src="/space/cosmic-cliffs.jpg"
            alt=""
            fill
            sizes="100vw"
            className={`${GM_MODAL_PHOTO}`}
          />
          <div className={`${GM_MODAL_VEIL}`} aria-hidden="true" />

          {/* 標頭 / Header */}
          <div className="relative h-full flex items-end justify-between gap-3 p-4 pb-3">
            <div className="min-w-0">
              <h3 className="font-orbitron font-bold text-lg text-white tracking-wide truncate">{place.name}</h3>
              {faction && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: faction.color }} />
                  <span className="text-base text-gray-300 truncate">{faction.name}</span>
                </div>
              )}
              {!faction && (
                <span className="text-sm text-gray-400">{t('place.unowned')}</span>
              )}
            </div>
            <button
              onClick={onClose}
              className={`${GM_BTN} w-8 h-8 shrink-0`}
              aria-label="close"
            >
              <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 相連地點 / Linked Places */}
          {linkedPlaceNames.length > 0 && (
            <div>
              <div className={`${GM_TITLE} text-xs! mb-1.5 flex items-center gap-2`}>
                <span className="h-px w-4 bg-cyan-400/50" aria-hidden="true" />
                {t('map.linkedPlaces')}
              </div>
              <div className="flex flex-wrap gap-1">
                {linkedPlaceNames.map((name) => (
                  <span key={name} className="text-sm bg-white/5 border border-white/10 rounded px-2 py-0.5 text-gray-300">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 建築資訊 / Building Info */}
          <div className="grid grid-cols-3 gap-2">
            <BuildingStat label={t('place.fortress')} value={place.fortress} />
            <BuildingStat label={t('place.market')} value={place.market} />
            <BuildingStat label={t('place.barracks')} value={place.barracks} />
          </div>

          {/* 駐軍 / Garrison */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-base text-gray-400">{t('place.garrison')}</span>
            <span className="font-orbitron font-bold text-lg text-cyan-300 tabular-nums">{place.garrison}</span>
          </div>

          {/* 行政官 / Administrator */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-base text-gray-400">{t('place.administrator')}</span>
            {adminChar ? (
              <span className="text-base font-medium text-amber-300 flex items-center gap-1.5">
                {adminChar.isKing && <Crown className="w-4 h-4 shrink-0" label={t('character.isKing')} />}
                {adminChar.name}
              </span>
            ) : (
              <span className="text-base text-gray-400">{t('place.noAdmin')}</span>
            )}
          </div>

          {/* 駐紮將領 / Stationed Characters */}
          <div>
            <div className={`${GM_TITLE} text-xs! mb-1.5`}>
              {t('place.characters')}
            </div>
            <div className="space-y-0.5 max-h-44 overflow-y-auto ds-gm-scroll">
              {placeChars.length === 0 && (
                <p className="text-gray-400 text-sm">—</p>
              )}
              {placeChars.map((char) => (
                <div key={char.id} className="px-2 py-1 rounded-md text-base text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-200">{char.name}</span>
                    {char.isKing && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" label={t('character.isKing')} />}
                    <span className="ml-auto flex items-center gap-1 text-sm font-orbitron text-gray-400">
                      <Ic className="w-3.5 h-3.5"><path d="m6 13 6-6 6 6M6 18l6-6 6 6" /></Ic>
                      <span className="sr-only">{t('character.troops')}: </span>
                      {char.troops}
                    </span>
                    <span className="text-sm font-orbitron text-gray-400 tabular-nums">
                      <span className="sr-only">{t('character.gold')}: </span>
                      {char.gold}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2.5 text-xs font-orbitron text-gray-400">
                    <span>{t('character.wu')} {char.wu}</span>
                    <span>{t('character.tong')} {char.tong}</span>
                    <span>{t('character.jing')} {char.jing}</span>
                    <span>{t('character.speed')} {char.speed}</span>
                    <span>{t('character.age')} {char.age}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BuildingStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={`${GM_STAT}`}>
      <div className={`${GM_STAT_VALUE}`}>{value}</div>
      <div className={`${GM_STAT_LABEL}`}>{label}</div>
    </div>
  );
}

function GameGraph({
  places,
  factions,
  roads,
  characters,
  spotlights,
  moves,
  onPlaceClick,
  selectedPlaceId,
  onControlsReady,
}: {
  places: WorldState['places'];
  factions: WorldState['factions'];
  roads: WorldState['roads'];
  characters: WorldState['characters'];
  spotlights: NonNullable<WorldState['spotlights']>;
  moves: NonNullable<WorldState['moves']>;
  onPlaceClick?: (place: WorldState['places'][0]) => void;
  selectedPlaceId?: string | null;
  onControlsReady?: (controls: MapCameraControls | null) => void;
}) {
  return (
    <div className="w-full h-full bg-[#020617] relative">
      <SigmaMap
        places={places}
        factions={factions}
        roads={roads}
        characters={characters}
        spotlights={spotlights}
        moves={moves}
        onPlaceClick={onPlaceClick}
        selectedPlaceId={selectedPlaceId}
        onControlsReady={onControlsReady}
      />
    </div>
  );
}
