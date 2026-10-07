// ============================================================================
// 遊戲頁面 — 主要遊戲介面 / Game Page — Main Game Interface
// ============================================================================
// 深空科幻主題 / Deep Space Sci-Fi Theme
// 版面：指揮列 → 世界觀測帶（展示區塊）→ 左軌 / 地圖 HUD / 右軌
// Layout: command bar → world telemetry band → left rail / map HUD / right rail
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion, useSpring } from 'motion/react';
import { Reveal, Parallax } from '@/components/home/Motion';
import { t, setLocale, getLocale, getTranslations, DEFAULT_LOCALE } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { MapCameraControls } from '@/components/SigmaMap';
import { LeaderAvatar } from '@/components/LeaderAvatar';
import { apiFetch } from '@/lib/api';
import { CONFIG } from '@/lib/gameConfig';
import { signOut } from 'next-auth/react';
import { Ic, Crown } from './icons';
import { EventLog } from './EventLog';
import { StatsCharts, CharacterRadarHover, RADAR_AXES } from './stats-charts';
import { DetailModal, FactionRanking } from './leader-detail';
import type { WorldInfo, WorldState } from './types';
import { GM_BACKDROP, GM_BTN, GM_BTN_ACCENT, GM_BTN_DANGER, GM_CORNER_BL, GM_CORNER_BR, GM_CORNER_TL, GM_CORNER_TR, GM_FRAME, GM_HUD_CONTROLS_CLOSED, GM_HUD_CONTROLS_OPEN, GM_HUD_LEGEND, GM_KPI, GM_KPI_FIRST, GM_KPI_LABEL, GM_KPI_VALUE, GM_LEGEND, GM_LEGEND_ITEM, GM_MODAL, GM_MODAL_PHOTO, GM_MODAL_VEIL, GM_PANEL, GM_PHOTO, GM_RAIL, GM_SKEL, GM_STAT, GM_STAT_LABEL, GM_STAT_VALUE, GM_STRIP, GM_STRIP_INLINE, GM_STRIP_PHOTO, GM_STRIP_VEIL, GM_TIMELINE, GM_TITLE, GM_VEIL, GM_VIGNETTE } from './styles';

const SigmaMap = dynamic(
  () => import('@/components/SigmaMap').then((mod) => mod.SigmaMap),
  { ssr: false }
);
// 艦隊交戰層。跟 SigmaMap 分開動態載入，因为它自己是一個 canvas + rAF 迴圈，
// 而且首頁與遊戲頁共用同一段純邏輯（`battleFleet.ts`）。/
// The battle fleet layer. Dynamically imported apart from SigmaMap because it is
// its own canvas plus rAF loop, and because the home page shares the same pure
// logic (`battleFleet.ts`).
const BattleFleet = dynamic(
  () => import('@/components/BattleFleet').then((mod) => mod.BattleFleet),
  { ssr: false }
);
// 流場塵埃層。跟艦隊分開動態載入，因為它是第一個出現的層，早到可以獨立載入，
// 晚載也不會擋住地圖。/
// The flow-field dust layer. Loaded separately from the fleet because it paints
// first, so it can arrive on its own without holding the map back.
const SpaceFlow = dynamic(
  () => import('@/components/SpaceFlow').then((mod) => mod.SpaceFlow),
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

/** 窄視窗斷點：面板在此以下預設收合 / Narrow-viewport breakpoint: the panel defaults closed below it */
const NARROW_MQ = '(max-width: 1023px)';

/** matchMedia 訂閱 / the matchMedia subscription */
function subscribeNarrow(onChange: () => void) {
  const mql = window.matchMedia(NARROW_MQ);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
/** 客戶端快照：true = 窄 / client snapshot: true = narrow */
function getIsNarrow() {
  return window.matchMedia(NARROW_MQ).matches;
}
/** 伺服器快照：桌面基準，讓 SSR 先輸出展開狀態 /
 *  Server snapshot: the desktop baseline, so SSR emits the panel open */
function getIsNarrowServer() {
  return false;
}

function getServerLocale(): Locale {
  return DEFAULT_LOCALE;
}

function subscribeLocale(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => { };
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
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
  inline = false,
}: {
  round: number;
  worldName: string;
  aliveFactions: number;
  territories: number;
  aliveCharacters: number;
  totalTroops: number;
  /** 併入頂部列而非獨佔一行 / Merged into the header row instead of taking its own */
  inline?: boolean;
}) {
  const items = [
    { label: t('game.round'), value: String(round).padStart(4, '0') },
    { label: t('home.stats.factions'), value: aliveFactions.toLocaleString() },
    { label: t('home.stats.places'), value: territories.toLocaleString() },
    { label: t('home.stats.characters'), value: aliveCharacters.toLocaleString() },
    { label: t('faction.totalTroops'), value: totalTroops.toLocaleString() },
  ];

  return (
    <section
      className={`${inline ? GM_STRIP_INLINE : GM_STRIP} ${inline ? 'flex-1 min-w-0' : ''}`}
      aria-label={t('home.stats.title')}
    >
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

      <div
        className={`relative flex items-center gap-4 md:gap-6 px-4 md:px-6 py-3 overflow-x-auto ds-gm-noscroll ${
          inline ? 'px-0 py-0' : ''
        }`}
      >
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
  /** 彈窗導覽堆疊：地點 ⇄ 將領互相跳轉時，「上一個」就是堆疊的上一層，
   *  返回鍵 pop 一層即可回到剛才那個彈窗；堆疊只剩一筆時等同於關閉 /
   *  Popup navigation stack. When a place and a leader cross-link, "the popup
   *  you came from" is simply the entry below the top, so Back pops one level.
   *  A single-entry stack behaves exactly like a plain close. */
  type PopupEntry =
    | { kind: 'place'; place: WorldState['places'][0] }
    | { kind: 'leader'; char: WorldState['characters'][0] };
  const [popupStack, setPopupStack] = useState<PopupEntry[]>([]);
  const popup = popupStack.length > 0 ? popupStack[popupStack.length - 1] : null;
  const selectedPlace = popup && popup.kind === 'place' ? popup.place : null;
  const detailChar = popup && popup.kind === 'leader' ? popup.char : null;
  const openPlace = (place: WorldState['places'][0]) =>
    setPopupStack((stack) => [...stack, { kind: 'place', place }]);
  const openLeader = (char: WorldState['characters'][0]) =>
    setPopupStack((stack) => [...stack, { kind: 'leader', char }]);
  const closePopup = () => setPopupStack([]);
  const popupBack = () => setPopupStack((stack) => stack.slice(0, -1));
  const [isAdmin, setIsAdmin] = useState(false);
  const queryClient = useQueryClient();
  /** 地圖視角控制（浮動縮放 / 重設按鈕）/ Map camera controls (floating zoom / reset buttons) */
  const mapControlsRef = useRef<MapCameraControls | null>(null);
  /** 同一組控制項也放進 state：ZoomSlider 要在 render 期間訂閱縮放變動，
   *  而 ref 只能在事件處理器裡讀，不能拿來驅動 render /
   *  The same controls also live in state: ZoomSlider subscribes to zoom
   *  changes during render, and a ref must never drive rendering */
  const [mapControls, setMapControls] = useState<MapCameraControls | null>(null);

  /**
   * 鏡頭位置只存 ref：太空塵埃每一幀都要讀它做視差，所以**不能**進 state，否則
   * 拖曳地圖會讓整棵樹���幀重新渲染。塵埃自己直接讀這個 ref。
   *
   * The camera position lives in a ref only: the dust reads it every frame for the
   * parallax, so it must not become state — a drag would re-render the whole tree every
   * frame. The dust reads this ref directly.
   */
  const cameraPosRef = useRef({ x: 0.5, y: 0.5 });

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
  // 註解型別：CONFIG 是 `as const`，不加會把 state 鎖成字面值 5000 /
// Annotated: CONFIG is `as const`, which would otherwise pin the state to the
// literal 5000 and reject any other speed
const [playSpeed, setPlaySpeed] = useState<number>(CONFIG.AUTOPLAY_DEFAULT_MS);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  /** 右側地圖面板：頁籤列常駐，內容可收合；null = 尚未手動開合過，走預設 /
   *  Map side panel: the rail is always present and the content collapses;
   *  null means the user has not toggled it yet, so the default applies */
  const [panelOverride, setPanelOverride] = useState<boolean | null>(null);

  // 窄視窗預設收合：19rem 的面板在 390px 寬吃掉 78% 畫布，會把地圖和 HUD
  // 一起蓋掉。這裡用 useSyncExternalStore 讀斷點，而不是在 effect 裡
  // setState：後者會觸發 lint 的 cascading-render 規則，而 lazy initializer
  // 又會讓 server/client 初始值不一致、直接炸 hydration。
  // useSyncExternalStore is the sanctioned way to read a media query: React uses
  // the server snapshot while hydrating and swaps to the client snapshot right
  // after, so there is no hydration mismatch and no setState-in-effect (which
  // trips the cascading-render lint rule).
  const isNarrow = useSyncExternalStore(subscribeNarrow, getIsNarrow, getIsNarrowServer);
  const rightPanelOpen = panelOverride ?? !isNarrow;
  const setRightPanelOpen = (next: boolean) => setPanelOverride(next);
  // 預設**不開**任何分頁：首次進入地圖就是主角，一個預設開著的側欄會把它蓋掉。
  //
  // No panel open by default: the map is the subject on arrival, and a panel that is
  // already open would cover it.
  const [rightTab, setRightTab] = useState<'characters' | 'events' | 'stats' | null>(null);

  /**
   * 事件只存 charName（沒有 charId），所以這裡接受 id 或名字：先當 id 查，
   * 再退回名字比對；都找不到就不開——寧可沒反應，也不要開錯人。
   * Events only carry charName, so this takes an id or a name: try the id first,
   * then fall back to a name match. If neither resolves, do nothing — no
   * response beats opening the wrong leader.
   */
  const openLeaderDetail = (key: string) => {
    const chars = worldState?.characters ?? [];
    const target = chars.find((c) => c.id === key) ?? chars.find((c) => c.name === key);
    if (target) openLeader(target);
  };

  /** 點地名 → 聚焦地圖；順便收起左側欄，不然地圖還被蓋著。
   * 右側地圖面板保持開啟——事件日誌就在裡面，把它關掉等於把使用者正在
   * 點的東西收走。
   *  Clicking a place name focuses the map, collapsing the left sidebar first so
   *  the map is not left covered. The map side panel stays open: the event log
   *  lives inside it, so collapsing it would hide the very row being clicked. */
  const focusPlaceFromLog = (placeId: string) => {
    setLeftSidebarOpen(false);
    mapControlsRef.current?.focusPlace(placeId);
  };

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

  // Esc 關閉手機版左側欄覆蓋層；若對話框開啟則交由其自行處理。
  // 覆蓋層無論怎麼收合（Esc／背景／✕／選回合）都會在 effect 清理時
  // 把焦點還給開啟它的按鈕。右側地圖面板不算：它常駐頁籤列、由自己的 ✕ 收合，
  // Esc 不該順手把它關掉。
  // Escape closes the mobile left sidebar overlay; when a dialog is open it
  // consumes Escape itself. Whatever closes the overlay (Esc, backdrop, ✕,
  // selecting a round) runs the effect cleanup and returns focus to its toggle
  // button. The map side panel is excluded: its rail is always present and it
  // collapses through its own ✕, so Escape must not close it as a side effect.
  useEffect(() => {
    if (!leftSidebarOpen) return;
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      setLeftSidebarOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [leftSidebarOpen]);

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
            <div className={`${GM_HUD_LEGEND}`}>
              <div className={`${GM_SKEL} h-5 w-48`} />
            </div>
<div className={GM_HUD_CONTROLS_CLOSED}>
              <div className={`${GM_SKEL} w-9 h-9`} />
              <div className={`${GM_SKEL} w-9 h-9`} />
              <div className={`${GM_SKEL} w-9 h-9`} />
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
            // 版面已鎖定在視窗高度（h-dvh），這張滿版背景就是本頁的 LCP 元素，
            // 必須立即載入 /
            // The layout is viewport-locked (h-dvh), so this full-bleed backdrop
            // is this page's LCP element — it must not be deferred
            loading="eager"
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
          {/* <span className={`${GM_BADGE} hidden sm:flex items-center gap-2 text-xs font-orbitron tracking-wider text-cyan-300/90`}>
            <span className={`${GM_LIVE}`} aria-hidden="true" />
            RND {String(round).padStart(4, '0')}
          </span> */}
        </div>

        <div className="hidden sm:flex items-center gap-3 min-w-0 text-gray-400">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-400/40" aria-hidden="true" />
          <span className="text-xs font-orbitron tracking-widest truncate">
            {worldState?.world.name ?? '—'}
          </span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-cyan-400/40" aria-hidden="true" />
        </div>

        {/* 世界概況併入這一列，地圖因此多出一整列的高度 /
            世界概況 lives in this row, giving the map that height back */}
        <TelemetryStrip
          inline
          round={round}
          worldName={worldState?.world.name ?? ''}
          aliveFactions={aliveFactions}
          territories={territories}
          aliveCharacters={aliveCharacterList.length}
          totalTroops={totalTroops}
        />

        <div className="flex items-center gap-2 ml-auto shrink-0">
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

          {/* 右側地圖面板切換（手機版）/ Map side panel toggle (mobile) */}
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
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

      {/* ── 主要內容 / Main Content ────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex min-h-0">
        {/* 左側欄位已改成疊在地圖上的絕對定位（見 <main> 內的選擇回合）與統計頁籤
            內的勢力排行，所以這裡不再有桌面版側欄 /
            The left column is now an absolute overlay on the map (the round
            timeline inside <main>) plus the faction ranking in the stats tab, so
            there is no desktop sidebar here any more. */}

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
              onPlaceClick={openPlace}
              selectedPlaceId={selectedPlace?.id}
              onControlsReady={(controls) => {
                mapControlsRef.current = controls;
                setMapControls(controls);
              }}
              onCameraMove={(x, y) => {
                cameraPosRef.current.x = x;
                cameraPosRef.current.y = y;
              }}
            />
          </div>

          {/* 選擇回合：絕對定位疊在地圖左緣，把整個左欄的版面寬度還給地圖。
          手機版仍使用左側抽屜（見上方），因為這個位置在窄視窗會被地圖塞滿。
          The round timeline is an absolute overlay on the map's left edge, handing
          the whole sidebar's width back to the map. Mobile keeps the drawer above,
          because this corner is entirely map on a narrow viewport. */}
          <div className={GM_TIMELINE}>
            <RoundTimeline
              currentRound={round}
              maxRound={lastRound}
              isPlaying={isPlaying}
              playSpeed={playSpeed}
              onSelect={handleRoundSelect}
              onPlayToggle={() => setIsPlaying(!isPlaying)}
              onSpeedChange={setPlaySpeed}
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

          {/* HUD 分成兩個面板：圖例貼左下、相機控制貼右下 / HUD split into two panels: legend bottom-left, camera controls bottom-right */}
          <div className={`${GM_HUD_LEGEND}`}>
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
          </div>

          <div className={rightPanelOpen ? GM_HUD_CONTROLS_OPEN : GM_HUD_CONTROLS_CLOSED}>
            <div className="flex items-center gap-2">
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
                onClick={() => mapControlsRef.current?.zoomOut()}
                title="縮小 / Zoom out"
                aria-label="縮小 / Zoom out"
                className={`${GM_BTN} w-9 h-9`}
              >
                <Ic className="w-4 h-4"><path d="M6 12h12" /></Ic>
              </button>
              {/* 縮放滑桿夾在縮小/放大之間：拖曳可連續縮放，右側顯示百分比 /
                  Slider sits between the two buttons for continuous zoom, with
                  the current percentage on the right */}
              <ZoomSlider controls={mapControls} label={t('map.zoomLevel')} />
              <button
                onClick={() => mapControlsRef.current?.zoomIn()}
                title="放大 / Zoom in"
                aria-label="放大 / Zoom in"
                className={`${GM_BTN} w-9 h-9`}
              >
                <Ic className="w-4 h-4"><path d="M12 6v12M6 12h12" /></Ic>
              </button>
            </div>
          </div>
        {/* ── 右側面板：疊在地圖上，不再佔用版面 / Right panel: overlaid on the
            map so it no longer consumes layout width ──────────────────────────── */}
        <MapSidePanel
          activeTab={rightTab}
          onTabChange={(tab) => {
            setRightTab(tab);
            setRightPanelOpen(true);
          }}
          open={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          loading={isLoading && !worldState}
        >
          {rightTab === 'characters' && (
            <CharacterList
              characters={worldState?.characters ?? []}
              places={worldState?.places ?? []}
              factions={worldState?.factions ?? []}
              onOpenLeaderDetail={openLeaderDetail}
            />
          )}
          {rightTab === 'events' && (
            <EventLog
              worldId={worldState?.world.id ?? ''}
              factions={worldState?.factions ?? []}
              characters={worldState?.characters ?? []}
              places={worldState?.places ?? []}
              onFocusPlace={focusPlaceFromLog}
              onOpenLeaderDetail={openLeaderDetail}
            />
          )}
          {rightTab === 'stats' && (
            <>
              {/* 勢力排行從左欄搬到这里：它本來就在統計語境裡，獨立在左欄只會一直
                  吃掉地圖寬度。兩個面板各自帶自己的 GM_PANEL，所以會自然堆疊 /
                  The faction ranking moved here from the left column: it was always a
                  statistics view, and sitting in its own column it just ate map width
                  permanently. Each keeps its own GM_PANEL so they stack cleanly. */}
              <FactionRanking
                factions={worldState?.factions ?? []}
                characters={worldState?.characters ?? []}
                places={worldState?.places ?? []}
              />
              <StatsCharts
                worldId={worldState?.world.id ?? ''}
                currentRound={worldState?.world.currentRound ?? 0}
                characters={worldState?.characters ?? []}
                worldFactions={worldState?.factions ?? []}
              />
            </>
          )}
        </MapSidePanel>
        </main>

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
            onClose={closePopup}
            canGoBack={popupStack.length > 1}
            onBack={popupBack}
            onOpenPlace={openPlace}
            onOpenLeader={openLeader}
          />
        )}
      </AnimatePresence>

      {/* 單一將領詳情：表格點列與事件日誌點人名共用 / Single-leader detail, shared by leader-table rows and event-log names */}
      <DetailModal
        open={detailChar !== null}
        onClose={closePopup}
        onBack={popupBack}
        canGoBack={popupStack.length > 1}
        title={detailChar ? detailChar.name : ''}
      >
        {detailChar && (
          <LeaderDetail
            char={detailChar}
            faction={
              detailChar.factionId
                ? ((worldState?.factions ?? []).find((f) => f.id === detailChar.factionId) ?? null)
                : null
            }
            placeName={
              (worldState?.places ?? []).find((pl) => pl.id === detailChar.placeId)?.name ?? '—'
            }
            factionAverage={radarMeanOf(
              (worldState?.characters ?? []).filter(
                (c) => c.factionId && c.factionId === detailChar.factionId && c.alive
              )
            )}
          />
        )}
      </DetailModal>
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

/** 右側面板的分頁 / Tabs for the right-hand side panel */
type SideTab = 'characters' | 'events' | 'stats';

/** 分頁圖示與名稱的單一來源，橫向頁籤與地圖上的直向 rail 共用 /
 *  Single source for tab icons and labels, shared by the horizontal tab bar and
 *  the vertical rail overlaid on the map */
function useSideTabs(): Array<{ key: SideTab; label: string; icon: ReactNode }> {
  return [
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
}


/**
 * 地圖右側的內容面板：頁籤直向釘在 map 的右緣，內容由右往左淡入。
 * 這樣右欄不再佔版面，地圖整個寬度都留給 map /
 * Content panel pinned to the right of the map: the tabs sit vertically on the
 * map's right edge and the content fades in from the right, so the panel no
 * longer steals width from the map.
 */
function MapSidePanel({
  activeTab,
  onTabChange,
  open,
  onClose,
  loading,
  children,
}: {
  /** null = 沒有任何分頁開著 / null means no panel is open */
  activeTab: SideTab | null;
  onTabChange: (tab: SideTab) => void;
  open: boolean;
  onClose: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  const tabs = useSideTabs();
  return (
    <div className="absolute inset-y-0 right-0 z-[8] flex items-stretch pointer-events-none">
      {/* 內容：從右往左淡入 / Content: fades in from the right */}
      <AnimatePresence mode="wait" initial={false}>
        {open && (
        <motion.div
          // open 已經保證有值，但 TS 從 `activeTab` 推不出來，所以收斂一次 /
          // `open` already guarantees a value, but TS cannot infer that
          key={activeTab ?? 'none'}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 28 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={`pointer-events-auto h-full w-[19rem] max-w-[80vw] ${GM_RAIL} border-l border-white/5 flex flex-col overflow-hidden`}
        >
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="font-orbitron text-xs text-gray-400 tracking-wider">
              {tabs.find((tab) => tab.key === activeTab)?.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className={`${GM_BTN} w-7 h-7`}
              aria-label={t('general.close')}
            >
              <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto ds-gm-scroll p-3 pt-0">
            {loading ? <PanelSkeleton /> : children}
          </div>
        </motion.div>
        )}
      </AnimatePresence>
      {/* 頁籤：直向釘住地圖右緣 / Tabs: vertical rail on the map's right edge */}
      <div
        role="tablist"
        aria-orientation="vertical"
        className={`pointer-events-auto flex flex-col gap-1 self-center m-3 ${GM_RAIL} rounded-xl border border-white/10 p-1`}
      >
        {tabs.map((tab) => {
          // 面板收合時沒有任何頁籤算「使用中」：內容已經不存在，卻仍留著高亮，
          // 會讓人以為那個分頁還開著。所以 active 外觀跟著 open 一起走。
          // When the panel is collapsed no tab is in use — the content is gone,
          // yet a highlighted tab still implies it is open, so the active look
          // follows `open` as well as `activeTab`.
          const isActive = open && activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.key)}
              title={tab.label}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-orbitron tracking-wider transition-all duration-200 ${
                isActive ? 'bg-cyan-500/15 text-cyan-300' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Ic className="w-4 h-4">{tab.icon}</Ic>
              {/* 窄視窗只留圖示：rail 寬度會被面板壓到 80px，帶文字會逐字斷行 */}
              {/* Icon only when narrow: the panel squeezes the rail to ~80px, and
                  with the label present each character wraps onto its own line */}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 側欄面板的載入骨架 / Loading skeleton for a side panel */
function PanelSkeleton() {
  return (
    <div className="space-y-2 pt-1" aria-busy="true">
      <div className={`${GM_SKEL} h-4 w-2/5`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`${GM_SKEL} h-9 w-full`} />
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
          title={isPlaying ? t('game.pause') : t('game.play')}
          aria-label={isPlaying ? t('game.pause') : t('game.play')}
        >
          {isPlaying ? (
            <>
              <Ic className="w-3.5 h-3.5"><path d="M8 5.5h3v13H8zM13 5.5h3v13h-3z" /></Ic>
              {t('game.pause')}
            </>
          ) : (
            <>
              <Ic className="w-3.5 h-3.5"><path d="M8 5.5v13l11-6.5z" /></Ic>
              {/* {t('game.play')} */}
            </>
          )}
        </button>
        <div>
          <input
            type="range"
            min={CONFIG.AUTOPLAY_MIN_MS}
            max={CONFIG.AUTOPLAY_MAX_MS}
            step={500}
            value={playSpeed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label={t('game.autoPlaySpeed')}
            className="flex-1 h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
          />
          <span className="text-xs text-gray-400 font-orbitron tabular-nums">
            {(playSpeed / 1000).toFixed(1)}s
          </span>
        </div>
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

/** 一組角色的各軸平均值（雷達圖參考線用）/ Mean of every radar axis over a group of characters */
function radarMeanOf(group: WorldState['characters']): number[] | null {
  if (group.length === 0) return null;
  return RADAR_AXES.map((axis) => {
    const sum = group.reduce((acc, c) => acc + (c[axis.key] as number), 0);
    return sum / group.length;
  });
}

/**
 * 單一將領詳情：程序化頭像 ＋ 雷達圖（勢力平均為虛線參考環）＋ 全部欄位。
 * 將領表格點擊與事件日誌點擊都開這個視圖，所以只實作一份。
 * Single-leader detail: procedural avatar, radar (with the faction mean as the
 * dashed reference ring) and every column. Both the leader table and the event
 * log open this one view.
 */
function LeaderDetail({
  char,
  faction,
  placeName,
  factionAverage,
}: {
  char: WorldState['characters'][0];
  faction: WorldState['factions'][0] | null;
  placeName: string;
  factionAverage: number[] | null;
}) {
  const stats: ReadonlyArray<readonly [string, string | number]> = [
    [t('character.wu'), char.wu],
    [t('character.tong'), char.tong],
    [t('character.jing'), char.jing],
    [t('character.speed'), char.speed],
    [t('character.ambition'), Math.round(char.ambition)],
    [t('character.age'), char.age],
    [t('character.troops'), char.troops],
    [t('character.gold'), char.gold],
    [
      t('character.loyalty'),
      t(`character.loyalty${char.loyalty.charAt(0)}${char.loyalty.slice(1).toLowerCase()}`),
    ],
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="shrink-0">
        {/* 呼吸只在詳情彈窗開：這裡是全頁唯一的單一大頭像，動得起來也值得動。
            列表列與 hover 預覽不開 —— 那兩處在 40–56px，動畫看不出來卻會持續重繪。
            Breathing only in the detail modal: the one large avatar on the page.
            The list rows and the hover preview leave it off — at 40–56px the motion
            is invisible but the repaints are real. */}
        <LeaderAvatar
          character={char}
          factionColor={faction ? faction.color : null}
          size={168}
          className="rounded-[14px]"
          breathe
        />
        <div className="mt-2 flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-gray-200">{char.name}</span>
            {char.isKing && (
              <Crown className="w-4 h-4 text-amber-300 shrink-0" label={t('character.isKing')} />
            )}
          </span>
          <span className="text-xs text-gray-400">{faction ? faction.name : '—'}</span>
          {!char.alive && (
            <span className="text-xs text-rose-300">{t('character.dead')}</span>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <CharacterRadarHover
          character={char}
          factionAverage={factionAverage}
          color={faction ? faction.color : '#64748b'}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-2 border-b border-white/5 py-1"
            >
              <dt className="text-xs text-gray-400">{label}</dt>
              <dd className="text-xs text-gray-200 font-orbitron">{value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1">
            <dt className="text-xs text-gray-400">{t('character.place')}</dt>
            <dd className="text-xs text-gray-200 truncate">{placeName}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/**
 * hover 面板的版面尺寸。頭像面板是 `w-[196px]`，雷達面板包住 196px 的
 * `CharacterRadarHover` 再加上自己的 padding，所以略寬。
 * Hover panel box metrics. The avatar panel is `w-[196px]`; the radar panel
 * wraps a 196px `CharacterRadarHover` and adds its own padding, so it is wider.
 */
const HOVER_AVATAR_PANEL_W = 196;
const HOVER_RADAR_PANEL_W = 216;
const HOVER_PANEL_GAP = 12;
const HOVER_PANEL_H = 232;

function CharacterList({
  characters,
  places,
  factions,
  onOpenLeaderDetail,
}: {
  characters: WorldState['characters'];
  places: WorldState['places'];
  factions: WorldState['factions'];
  onOpenLeaderDetail: (charId: string) => void;
}) {
  
  const [showDetail, setShowDetail] = useState(false);
  // 彈窗表格分批：將領會隨回合持續增加，避免一次掛載全部列 /
  // Batched modal rows: characters keep growing with rounds — don't mount them all
  const [rowsShown, setRowsShown] = useState(100);
  // 側欄清單分批：存活將領會隨回合持續增加，避免一次掛載全部列 /
  // Batched sidebar list: alive characters keep growing with rounds —
  // mount only the first page and append on demand
  const [listShown, setListShown] = useState(100);
  // hover 預覽：停在哪一列，以及該列在視窗中的位置（面板要跟著列走）/
  // Hover preview: which row is hovered, and where that row sits in the viewport
  // (the floating panel tracks it)
  const tableRef = useRef<HTMLTableElement>(null);
  // avatarLeft / radarLeft：面板釘在「表格左右兩側」而不是視窗邊緣，跟著列走 /
  // avatarLeft / radarLeft: the panels anchor to the table's left and right
  // edges rather than the viewport edges, and track the hovered row
  const [hoverPreview, setHoverPreview] = useState<{
    char: WorldState['characters'][0];
    top: number;
    avatarLeft: number;
    radarLeft: number;
  } | null>(null);
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
              type="button"
              onClick={() => onOpenLeaderDetail(char.id)}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all duration-150 text-gray-400 hover:text-gray-200 hover:bg-white/5 [content-visibility:auto] [contain-intrinsic-size:auto_44px]"
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
        <table
          ref={tableRef}
          className="w-full text-xs border-collapse"
          // 指標離開整張表就收起預覽（列與列之間的空隙也會觸發）/
          // Collapse the preview when the pointer leaves the table — the gaps
          // between rows fire this too, which is what we want
          onMouseLeave={() => setHoverPreview(null)}
        >
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
                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                onClick={() => {
                  // 先關閉表格彈窗再開詳情：兩個 modal 同時存在會一起搶 Esc /
                  // Close the table modal before opening the detail: two stacked
                  // modals would both compete for Escape
                  // 順便收起 hover 面板：表格卸載後 onMouseLeave 不會再觸發，
                  // 否則頭像／雷達圖會浮在詳情彈窗上面 /
                  // Also clear the hover panels: once the table unmounts
                  // onMouseLeave never fires, leaving the avatar and radar
                  // floating on top of the detail modal
                  setHoverPreview(null);
                  setShowDetail(false);
                  onOpenLeaderDetail(char.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHoverPreview(null);
                    setShowDetail(false);
                    onOpenLeaderDetail(char.id);
                  }
                }}
                tabIndex={0}
                aria-label={char.name}
                onMouseEnter={(e) => {
                  // 在事件處理器裡讀版面位置（不在 render 期間讀，避免強制重排）；
                  // 同時把面板的垂直位置夾在視窗內，之後 render 就不用碰 window /
                  // Read the row's position in the handler, never during render;
                  // clamp it into the viewport here so render never touches window
                  const rect = e.currentTarget.getBoundingClientRect();
                  const table = tableRef.current?.getBoundingClientRect();
                  // 面板釘在表格左右外側、跟著 hovered 列走；外側空間不足就夾進視窗 /
                  // Anchor the panels just outside the table's left and right
                  // edges, tracking the hovered row; clamp them into the viewport
                  // when the outer gutter is too narrow to hold them
                  const clampX = (x: number, w: number) =>
                    Math.max(8, Math.min(x, window.innerWidth - w - 8));
                  setHoverPreview({
                    char,
                    top: Math.max(
                      8,
                      Math.min(rect.top, window.innerHeight - HOVER_PANEL_H - 16)
                    ),
                    avatarLeft: table
                      ? clampX(table.left - HOVER_AVATAR_PANEL_W - HOVER_PANEL_GAP, HOVER_AVATAR_PANEL_W)
                      : 8,
                    radarLeft: table
                      ? clampX(table.right + HOVER_PANEL_GAP, HOVER_RADAR_PANEL_W)
                      : 8,
                  });
                }}
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
        {/* hover 預覽：透過 portal 掛在 body 上。左邊是頭像、右邊是雷達圖，
            兩者都不攔截指標，所以不會讓底下那一列失去 hover。
            Hover preview: portalled to the body — the avatar on the left, the
            radar on the right. Neither captures the pointer, so the row
            underneath keeps its hover and the panel cannot flicker itself away. */}
        {hoverPreview &&
          createPortal(
            <>
              <div
                className="fixed z-[110] pointer-events-none"
                style={{ left: hoverPreview.avatarLeft, top: hoverPreview.top }}
              >
                <div className={`${GM_PANEL} bg-ds-panel-strong! p-2 w-[196px]`}>
                  <LeaderAvatar
                    character={hoverPreview.char}
                    factionColor={
                      hoverPreview.char.factionId
                        ? (factionMap.get(hoverPreview.char.factionId)?.color ?? null)
                        : null
                    }
                    size={168}
                    className="mx-auto rounded-[14px]"
                  />
                  <div className="text-xs text-gray-200 text-center mt-1.5 truncate">
                    {hoverPreview.char.name}
                  </div>
                </div>
              </div>
              <div
                className="fixed z-[110] pointer-events-none"
                style={{ left: hoverPreview.radarLeft, top: hoverPreview.top }}
              >
                <div className={`${GM_PANEL} bg-ds-panel-strong! p-2.5`}>
                  <CharacterRadarHover
                    character={hoverPreview.char}
                    color={
                      hoverPreview.char.factionId
                        ? (factionMap.get(hoverPreview.char.factionId)?.color ?? '#64748b')
                        : '#64748b'
                    }
                    factionAverage={
                      hoverPreview.char.factionId
                        ? radarMeanOf(
                            detailRows
                              .map((row) => row.char)
                              .filter((c) => c.factionId === hoverPreview.char.factionId)
                          )
                        : null
                    }
                  />
                </div>
              </div>
            </>,
            document.body
          )}
      </DetailModal>
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
  canGoBack,
  onBack,
  onOpenPlace,
  onOpenLeader,
}: {
  place: WorldState['places'][0];
  factions: WorldState['factions'];
  characters: WorldState['characters'];
  roads: WorldState['roads'];
  places: WorldState['places'];
  onClose: () => void;
  canGoBack: boolean;
  onBack: () => void;
  onOpenPlace: (place: WorldState['places'][0]) => void;
  onOpenLeader: (char: WorldState['characters'][0]) => void;
}) {
  const faction = factions.find((f) => f.id === place.factionId);
  const placeChars = characters.filter(
    (c) => c.placeId === place.id && c.alive
  );
  // 管理此地點的行政官（可能人在他處）/ The place's administrator (may be elsewhere)
  const adminChar = characters.find((c) => c.id === place.administratorId) ?? null;

  // 相連地點保留完整物件（不是只有名字）——點擊跳轉需要 id /
  // Keep the whole place objects rather than just names: navigating needs the id
  const linkedPlaces = roads
    .filter((road) => road.aId === place.id || road.bId === place.id)
    .map((road) => (road.aId === place.id ? road.bId : road.aId))
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is WorldState['places'][0] => p !== undefined);

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
            <div className="flex items-center gap-1.5 shrink-0">
              {canGoBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className={`${GM_BTN} w-8 h-8`}
                  aria-label={t('general.back')}
                  title={t('general.back')}
                >
                  <Ic className="w-4 h-4"><path d="m15 6-6 6 6 6" /></Ic>
                </button>
              )}
              <button
              onClick={onClose}
              className={`${GM_BTN} w-8 h-8`}
              aria-label="close"
            >
              <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
            </button>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 相連地點 / Linked Places */}
          {linkedPlaces.length > 0 && (
            <div>
              <div className={`${GM_TITLE} text-xs! mb-1.5 flex items-center gap-2`}>
                <span className="h-px w-4 bg-cyan-400/50" aria-hidden="true" />
                {t('map.linkedPlaces')}
              </div>
              <div className="flex flex-wrap gap-1">
                {linkedPlaces.map((linked) => (
                  <button
                    key={linked.id}
                    type="button"
                    onClick={() => onOpenPlace(linked)}
                    className="text-sm bg-white/5 border border-white/10 rounded px-2 py-0.5 text-gray-300 hover:text-cyan-200 hover:border-cyan-400/40 hover:bg-cyan-400/10 transition-colors"
                  >
                    {linked.name}
                  </button>
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
                <div
                  key={char.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenLeader(char)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenLeader(char);
                    }
                  }}
                  className="px-2 py-1 rounded-md text-base text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-200">{char.name}</span>
                    {char.isKing && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" label={t('character.isKing')} />}
                    <span className="ml-auto flex items-center gap-3 text-sm font-orbitron">
                      {/* 兵力配劍、金幣配錢記號，並各自上色。原本兩個數字直接並排、
                          金幣連圖示都沒有，看不出哪個是兵力哪個是金幣 / Troops get a
                          sword and gold a coin, each colour-coded. Previously the two
                          numbers sat side by side and gold had no icon at all, so
                          there was no way to tell them apart. */}
                      <span
                        className="inline-flex items-center gap-1 text-cyan-300"
                        title={t('character.troops')}
                      >
                        <Ic className="w-3.5 h-3.5"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /></Ic>
                        <span className="sr-only">{t('character.troops')}: </span>
                        {char.troops}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-amber-300"
                        title={t('character.gold')}
                      >
                        <Ic className="w-3.5 h-3.5"><circle cx="12" cy="12" r="8" /><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5" /></Ic>
                        <span className="sr-only">{t('character.gold')}: </span>
                        {char.gold}
                      </span>
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

/**
 * 縮放滑桿：0 = 最遠、1 = 最近（右＝更近），拖曳時直接 setState 不做動畫，
 * 這樣游標才跟得上。百分比只是顯示，實際比例由 Sigma 的相機決定 /
 * Zoom slider: 0 = furthest, 1 = closest (right = closer). Dragging sets the
 * camera state directly with no animation so the handle tracks the pointer;
 * the percentage is display only — Sigma owns the real ratio.
 */
function ZoomSlider({
  controls,
  label,
}: {
  controls: MapCameraControls | null;
  label: string;
}) {
  const [zoom, setZoomState] = useState(0);

  // controls 是 ref.current，會在 Sigma 建立後才填入；用 effect 訂閱並清理 /
  // controls comes from a ref and is only filled once Sigma exists — subscribe
  // in an effect and always unsubscribe
  useEffect(() => {
    if (!controls?.onZoomChange) return;
    return controls.onZoomChange(setZoomState);
  }, [controls]);

  return (
    <div className="flex items-center gap-2 px-1">
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={zoom}
        disabled={!controls}
        onChange={(e) => {
          const next = Number(e.target.value);
          setZoomState(next);
          controls?.setZoom(next);
        }}
        aria-label={label}
        title={label}
        className="w-28 h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <span className="text-xs text-gray-400 font-orbitron tabular-nums w-9 text-right">
        {Math.round(zoom * 100)}%
      </span>
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
  onCameraMove,
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
  /** 鏡頭每次移動時通知（框化座標），轉給塵埃層做視差 / Notified on every camera move (framed coords), forwarded to the dust layer for parallax */
  onCameraMove?: (x: number, y: number) => void;
}) {
  // 艦隊用的世界座標與勢力色票。座標直接沿用 ForceAtlas2 的 layoutX / layoutY，
  // 所以艦隊與地圖上的據點一定落在同一個位置。/
  // 塵埃層需要的鏡頭位置。這裡在本地包一層：外面傳進來的是**回呼**，而塵埃每幀都要
  // **讀取**位置，所以不能只靠回呼——必須有一個穩定的 ref 可以逐幀查詢。ref 不進
  // state，否則拖曳地圖會讓整棵樹每幀重新渲染。
  //
  // The camera position the dust layer needs. Wrapped locally: the incoming prop is a
  // *callback*, but the dust must *read* the position every frame, so it needs a
  // stable ref rather than only a callback. A ref, not state — otherwise dragging the
  // map re-renders the whole tree every frame.
  const cameraPosRef = useRef({ x: 0.5, y: 0.5 });
  const handleCameraMove = useCallback((x: number, y: number) => {
    cameraPosRef.current.x = x;
    cameraPosRef.current.y = y;
    onCameraMove?.(x, y);
  }, [onCameraMove]);

  // World coordinates and faction colours for the fleet. The coordinates reuse
  // ForceAtlas2's layoutX / layoutY, so the ships and the map's settlements are
  // always in the same place.
  const fleetSites = useMemo(
    () =>
      places.map((p) => ({
        id: p.id,
        x: p.layoutX,
        y: p.layoutY,
        factionId: p.factionId,
        garrison: p.garrison,
      })),
    [places],
  );
  const fleetRoads = useMemo(() => roads.map((r) => ({ aId: r.aId, bId: r.bId })), [roads]);
  const fleetColors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of factions) out[f.id] = f.color;
    return out;
  }, [factions]);
  // 可見範圍要留一點餘裕，否則邊緣的戰線會被切掉 /
  // A little slack on the extent, or a front line at the edge gets clipped
  const fleetBounds = useMemo(() => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of places) {
      if (p.layoutX < minX) minX = p.layoutX;
      if (p.layoutX > maxX) maxX = p.layoutX;
      if (p.layoutY < minY) minY = p.layoutY;
      if (p.layoutY > maxY) maxY = p.layoutY;
    }
    if (!Number.isFinite(minX)) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    const padX = Math.max((maxX - minX) * 0.05, 1);
    const padY = Math.max((maxY - minY) * 0.05, 1);
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  }, [places]);

  return (
    // 深空底色與星雲來自 @theme static，兩個 utility 疊在一起 /
    // The deep-space base and nebula come from @theme static; two utilities
    // layered together
    <div className="w-full h-full bg-ds-space relative">
      <div className="absolute inset-0 bg-ds-space-nebula" aria-hidden="true" />
      {/* 流場塵埃必須在 SigmaMap **之前**：DOM 順序就是繪製順序，而 sigma 的容器
          本身帶一層不透明底色，放在後面會被完全蓋掉。SigmaMap 的外層底色也已經
          拿掉，改由上層的 bg-ds-space 提供。/
          The flow-field dust must come BEFORE SigmaMap: DOM order is paint order,
          and sigma's container carries its own opaque background, which would hide
          the dust completely. SigmaMap's own backdrop was removed too — bg-ds-space
          above now provides it. */}
      <SpaceFlow cameraRef={cameraPosRef} />
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
        onCameraMove={handleCameraMove}
      />
      {/* 艦隊壓在 sigma 之上、覆蓋層之下：它只是氣氛，不該擋住地圖互動，也不該蓋掉
          地名。pointer-events 已在元件裡關掉。/
          The fleet sits above sigma and below the overlays: it is atmosphere, so it
          must not block map interaction nor cover place names. The component already
          sets pointer-events: none. */}
      <BattleFleet
        sites={fleetSites}
        roads={fleetRoads}
        colors={fleetColors}
        bounds={fleetBounds}
        className="z-[1]"
      />
    </div>
  );
}
