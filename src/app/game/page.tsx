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
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { defectionValue, defectionChance } from '@/lib/defection';
import { buildRelationCombatDeltas, effectiveAbility } from '@/lib/relationCombat';
import { splitIncome } from '../../../server/income';
import {
  BUILDING_MAX_LEVEL,
  buildingPerLevel,
  nextUpgradeGain,
  placeIncome,
  placeRecruits,
  upgradeCost,
  costToReachLevel,
  placeEffectLabel,
  type BuildingKind,
} from '@/lib/placeEffects';
import { signOut } from 'next-auth/react';
import { Ic, Crown } from './icons';
import { EventLog } from './EventLog';
import { StatsCharts, CharacterRadarHover, RADAR_AXES } from './stats-charts';
import { DetailModal, FactionRanking, LeaderRelations } from './leader-detail';
import type { WorldInfo, WorldState } from './types';
import { GM_BACKDROP, GM_BTN, GM_BTN_ACCENT, GM_BTN_DANGER, GM_CORNER_BL, GM_CORNER_BR, GM_CORNER_TL, GM_CORNER_TR, GM_FRAME, GM_HUD_CONTROLS_CLOSED, GM_HUD_CONTROLS_OPEN, GM_HUD_LEGEND, GM_KPI, GM_KPI_FIRST, GM_KPI_LABEL, GM_KPI_VALUE, GM_LEGEND, GM_LEGEND_ITEM, GM_MODAL, GM_MODAL_PHOTO, GM_MODAL_VEIL, GM_PANEL, GM_PHOTO, GM_RAIL, GM_SKEL, GM_STAT, GM_STAT_LABEL, GM_STAT_VALUE, GM_STRIP, GM_STRIP_INLINE, GM_STRIP_PHOTO, GM_STRIP_VEIL, GM_TIMELINE, GM_TITLE, GM_VEIL, GM_VIGNETTE } from './styles';

const SigmaMap = dynamic(
  () => import('@/components/SigmaMap').then((mod) => mod.SigmaMap),
  { ssr: false }
);
// 背景銀河層。晚載也不會擋住地圖。/
// The background galaxy layer. It arrives on its own without holding the map back.
const SpaceGalaxy = dynamic(
  () => import('@/components/SpaceGalaxy').then((mod) => mod.SpaceGalaxy),
  { ssr: false }
);

// 流場塵埃層，疊在銀河**之上**：銀河提供深處的暖光與星點，這一層提供結構與移動。
// 兩層都晚載，都不會擋住地圖。/
//
// The flow-field dust layer, stacked **over** the galaxy: the galaxy supplies the
// distant warm light and stars, this one supplies the structure and the motion. Both
// arrive on their own without holding the map back.
const SpaceFlow = dynamic(
  () => import('@/components/SpaceFlow').then((mod) => mod.SpaceFlow),
  { ssr: false }
);

// 霧氣層，畫在 SigmaMap **之上**。晚載不會擋住地圖。
// The fog layer, painted ABOVE SigmaMap. It arrives on its own without holding the map back.
const SpaceFog = dynamic(() => import('@/components/SpaceFog').then((mod) => mod.SpaceFog), {
  ssr: false,
});

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
          <div className="mt-0.5 text-xs text-white/85 font-display tracking-widest truncate">
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
  /**
   * 點地圖上的地點時，除了把選取推到 stack，還要**切到「地點」分頁並打開面板**。
   *
   * 地點詳情現在是右欄分頁的內容，不再是浮動彈窗；所以只推 stack 的話，點了地圖節點
   * 之後畫面不會有任何變化——選取已經發生了，卻沒有任何東西顯示它。
   *
   * Selecting a place now has to switch to the 地點 tab and open the panel as well. The
   * place detail is the tab's content rather than a floating popup, so pushing the stack
   * alone would leave the selection invisible: it would happen, and nothing would show it.
   */
  const openPlace = (place: WorldState['places'][0]) => {
    setPopupStack((stack) => [...stack, { kind: 'place', place }]);
    setRightTab('places');
    setRightPanelOpen(true);
  };
  const openLeader = (char: WorldState['characters'][0]) =>
    setPopupStack((stack) => [...stack, { kind: 'leader', char }]);
  const closePopup = () => setPopupStack([]);
  const popupBack = () => setPopupStack((stack) => stack.slice(0, -1));
  /**
   * 從「將領數」表格點進來時，記住怎麼回到那張表。
   *
   * 表格本身是一個 modal，開啟將領詳情時它會被關掉（兩個 modal 疊著會互搶 Esc），所以
   * 「返回」不能只是 popupBack() —— 那會直接關掉詳情、回到地圖，而不是回到表格。這裡
   * 存下重新打開表格的動作，返回時一併執行。
   *
   * When the detail was opened from the leader table, remember how to get back to it.
   *
   * The table is itself a modal and closes when the detail opens (two stacked modals fight
   * over Escape), so "back" cannot be just popupBack() — that closes the detail to the map
   * rather than to the table. This keeps the action that reopens the table.
   */
  const [leaderTableReturn, setLeaderTableReturn] = useState<{ reopen: () => void } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const queryClient = useQueryClient();
  /** 地圖視角控制（浮動縮放 / 重設按鈕）/ Map camera controls (floating zoom / reset buttons) */
  const mapControlsRef = useRef<MapCameraControls | null>(null);
  /**
   * sigma 自己的「框化座標 → 視窗像素」對應，由 `SigmaMap` 透過 `onControlsReady`
   * 提供。銀河與霧氣用它定位與縮放，所以兩者真的躺在**世界座標**裡、跟著地圖走。
   *
   * 這是**必須的**：從 camera.x / y / ratio 自行推導會把方向算反，背景於是與地圖反向
   * 漂移，平移時看起來「不跟著地圖走」。
   *
   * Sigma's own framed → viewport mapping, supplied by `SigmaMap` through
   * `onControlsReady`. The galaxy and fog use it to place and scale themselves, so both
   * genuinely sit in **world** coordinates and travel with the map.
   *
   * This is **required**: deriving it from camera.x / y / ratio gets the sign wrong,
   * so the backdrop drifts against the map.
   */
  const framedMapperRef = useRef<
    ((p: { x: number; y: number }) => { x: number; y: number }) | null
  >(null);
  /** 同一組控制項也放進 state：ZoomSlider 要在 render 期間訂閱縮放變動，
   *  而 ref 只能在事件處理器裡讀，不能拿來驅動 render /
   *  The same controls also live in state: ZoomSlider subscribes to zoom
   *  changes during render, and a ref must never drive rendering */
  const [mapControls, setMapControls] = useState<MapCameraControls | null>(null);



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
    // ── 換回合時**沿用上一回合的畫面**，不要整頁閃一下 ──────────────────────────────
    // 沒有這裡的話，按「下一回合」或點時間軸的回合，`queryKey` 變了 → `worldState` 變成
    // `undefined` → 上面 `if ((isLoading || worldInfoPending) && !worldState)` 成立 → **整個
    // 頁面換成骨架畫面**，`SigmaMap` 跟著被卸載重掛。於是 sigma 實例整個重建：星雲、
    // 覆蓋層、rAF 迴圈全部重來，鏡頭回到預設視角。看起來就是「整個畫面重新整理了一次」。
    //
    // `keepPreviousData` 讓舊資料在新資料到達之前繼續留在畫面上，於是地圖**不會被卸載**：
    // sigma 實例、鏡頭、覆蓋層與動畫全部原封不動，只是節點換成新回合的內容。這也正好
    // 補上 AGENTS.md 記錄的那條規則——鏡頭要在資料更新後活下來——因為根本沒有「更新後」，
    // 期間連元件都沒有被卸載。
    //
    // Without this, pressing "Next Round" or picking a round changes the `queryKey`, so
    // `worldState` becomes `undefined`, so the whole page swaps to the skeleton and
    // **`SigmaMap` unmounts with it**. Sigma is then rebuilt from scratch — galaxy, overlays,
    // every rAF loop — and the camera returns to its default view. It reads as "the screen
    // refreshed".
    //
    // `keepPreviousData` keeps the previous round on screen until the new one arrives, so the
    // map is never unmounted: the sigma instance, camera, overlays and animations all survive,
    // and only the node set changes. That also satisfies the rule AGENTS.md records — the
    // camera must survive a data refresh — because for the whole transition there is no
    // unmount at all.
    placeholderData: keepPreviousData,
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
  const [rightTab, setRightTab] = useState<SideTab | null>(null);

  /**
   * 面板只有在**已經選了分頁**時才算開啟。
   *
   * 這是修掉「一進遊戲頁右上角就有一個空的彈窗」的關鍵：`rightPanelOpen` 在桌面版
   * 預設是 true（`!isNarrow`），但 `rightTab` 預設是 null，於是外框畫出來了、裡面
   * 卻是空的，只剩一個 ✕。把「有沒有內容」一起判斷，空的外框就不會出現。
   *
   * The panel only counts as open once a **tab has been selected**.
   *
   * This is what removes the empty popup on arrival: `rightPanelOpen` defaults to true
   * on desktop (`!isNarrow`) while `rightTab` defaults to null, so the frame rendered
   * with nothing inside but a close button. Folding "has content" into the check keeps
   * the empty frame from appearing.
   */
  const panelHasContent = rightPanelOpen && rightTab !== null;

  /**
   * 關掉右側面板，並**連帶清掉選取**。
   *
   * 面板只是把地點詳情「搬進」分頁而已，選取狀態仍然住在 `popupStack`。所以任何一條
   * 關閉路徑若只關面板而不清 stack，地圖上的節點就會繼續維持選取樣式（高亮 + 強制顯示
   * 地名）——畫面上看起來就是「面板關了卻還選著」。
   *
   * 這裡原本有三條各自為政的關閉路徑（分頁再點一次、分頁自己的 ✕、詳情自己的 ✕），
   * 而其中兩條忘了清選取。這正是把它收斂成一個函式的原因：第四條路徑不會再忘記。
   *
   * Close the side panel **and clear the selection**.
   *
   * The panel only *hosts* the place detail as a tab — the selection itself lives in
   * `popupStack`. So any close path that closes the panel without emptying the stack
   * leaves the map node highlighted (selected colour plus a forced label), which reads
   * as "the panel closed but it's still selected".
   *
   * There used to be three separate close routes — re-clicking the active tab, the panel's
   * own ✕, and the detail's own ✕ — and two of them forgot to clear. That is the whole
   * reason this is one function: a fourth path now has nothing to forget.
   */
  const closePanel = () => {
    setRightTab(null);
    setRightPanelOpen(false);
    closePopup();
  };
  // 領地圖層的開關。由使用者控制而不是跟著縮放淡入淡出：地圖拉到很遠時，領地是唯一
  // 還說得出「這裡是誰的」的東西，所以預設開著，但要能關掉看清楚節點與道路。
  //
  // The territory-layer toggle, user-controlled rather than faded by zoom: when the map
  // is far out, the territory is the only thing that says who owns what, so it defaults
  // on — but it has to be switchable to see the nodes and roads plainly.
  const [showTerritory, setShowTerritory] = useState(true);

  /**
   * 事件只存 charName（沒有 charId），所以這裡接受 id 或名字：先當 id 查，
   * 再退回名字比對；都找不到就不開——寧可沒反應，也不要開錯人。
   * Events only carry charName, so this takes an id or a name: try the id first,
   * then fall back to a name match. If neither resolves, do nothing — no
   * response beats opening the wrong leader.
   */
  const openLeaderDetail = (key: string, reopenTable?: () => void) => {
    const chars = worldState?.characters ?? [];
    const target = chars.find((c) => c.id === key) ?? chars.find((c) => c.name === key);
    if (!target) return;
    setLeaderTableReturn(reopenTable ? { reopen: reopenTable } : null);
    openLeader(target);
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
          <h2 className="font-display text-lg font-bold text-white mb-2">{t('general.error')}</h2>
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
          <span className="font-display font-bold text-sm tracking-wider text-white truncate">
            {t('general.title')}
          </span>
          {/* <span className={`${GM_BADGE} hidden sm:flex items-center gap-2 text-xs font-display tracking-wider text-cyan-300/90`}>
            <span className={`${GM_LIVE}`} aria-hidden="true" />
            RND {String(round).padStart(4, '0')}
          </span> */}
        </div>

        <div className="hidden sm:flex items-center gap-3 min-w-0 text-gray-400">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-400/40" aria-hidden="true" />
          <span className="text-xs font-display tracking-widest truncate">
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
            className={`${GM_BTN_DANGER} px-3 py-1.5 text-xs font-display tracking-wider`}
            title={t('general.logout')}
          >
            {t('general.logout')}
          </button>

          {/* 右側地圖面板切換（手機版）/ Map side panel toggle (mobile) */}
          <button
            onClick={() => {
              // 沒有分頁時先選一個，否則只是把空外框叫回來 /
              // Pick a tab first, or this just brings the empty frame back
              if (rightTab === null) setRightTab('characters');
              setRightPanelOpen(!panelHasContent);
            }}
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
                  <span className="font-display text-xs text-gray-400 tracking-wider">控制面板</span>
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
                // 銀河與霧氣需要 sigma 自己的對應，而不是自行推導 /
                // The galaxy and fog need sigma's own mapping, not a hand-rolled one
                framedMapperRef.current = controls?.framedGraphToViewport ?? null;
                setMapControls(controls);
              }}
              framedMapperRef={framedMapperRef}
              showTerritory={showTerritory}
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
              {(worldState?.factions ?? []).filter((f) => f.alive).map((f) => (
                <span key={f.id} className={`${GM_LEGEND_ITEM}`}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="text-sm text-gray-300 whitespace-nowrap">{f.name}</span>
                </span>
              ))}
              <span className={`${GM_LEGEND_ITEM}`}>
                <span className="w-3 h-3 rounded-full bg-gray-500 shrink-0" />
                <span className="text-sm text-gray-400 whitespace-nowrap">{t('place.unowned')}</span>
              </span>
              {/* 領地開關。放在圖例下方而不是控制列：它控制的是「地圖畫什麼」，
                  跟圖例是同一類東西，而控制列已經有四個按鈕。 /
                  The territory toggle sits under the legend rather than in the control
                  row: it changes *what the map draws*, which is what a legend is for,
                  and the control row already carries four buttons. */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTerritory}
                  onChange={(e) => setShowTerritory(e.target.checked)}
                  className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                />
                <span className="text-sm text-gray-300 whitespace-nowrap">{t('map.territory')}</span>
              </label>
            </div>
          </div>

          <div className={panelHasContent ? GM_HUD_CONTROLS_OPEN : GM_HUD_CONTROLS_CLOSED}>
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
            // 再點一次**已經啟用**的分頁 = 關閉面板。這是「切換」語意，而不是只能開不能關。
            // 走 closePanel，因為這條路徑也必須清掉選取。
            //
            // Clicking the already-active tab again closes the panel: a toggle, not open-only.
            // It goes through closePanel because this path must clear the selection too.
            if (rightTab === tab) {
              closePanel();
              return;
            }
            setRightTab(tab);
            setRightPanelOpen(true);
          }}
          open={panelHasContent}
          // 面板自己的 ✕。和分頁切換走同一個 closePanel，所以選取一定會跟著被清掉。
          //
          // The panel's own ✕. It shares closePanel with the tab toggle, so the selection is
          // always cleared along with the panel.
          onClose={closePanel}
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
          {rightTab === 'places' && (
            // The place detail is now the 地點 tab's content rather than a floating
            // popup: it used to cover the map it was describing, and the rail already
            // exists, so there was no reason for a second surface.
            <PlaceDetail
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
        </MapSidePanel>
        </main>

      </div>


      {/* 單一將領詳情：表格點列與事件日誌點人名共用 / Single-leader detail, shared by leader-table rows and event-log names */}
      <DetailModal
        open={detailChar !== null}
        onClose={closePopup}
        onBack={() => {
          popupBack();
          const back = leaderTableReturn;
          if (back) {
            setLeaderTableReturn(null);
            back.reopen();
          }
        }}
        canGoBack={popupStack.length > 1 || leaderTableReturn !== null}
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
            controlledPlaceName={
              (worldState?.places ?? []).find((pl) => pl.administratorId === detailChar.id)?.name ?? '—'
            }
            kingLoyalty={(() => {
              const f = (worldState?.factions ?? []).find((x) => x.id === detailChar.factionId);
              const king = f?.kingId
                ? (worldState?.characters ?? []).find((c) => c.id === f.kingId)
                : null;
              return king ? king.loyalty : null;
            })()}
            myEvents={(worldState?.roundDefectionEvents ?? []).filter(
              (e) => e.charId === detailChar.id
            )}
            friendships={worldState?.friendships ?? []}
            discontents={worldState?.discontents ?? []}
            characters={worldState?.characters ?? []}
            onOpenLeader={(id) => openLeaderDetail(id)}
            factionAverage={radarMeanOf(
              (worldState?.characters ?? []).filter(
                (c) => c.factionId && c.factionId === detailChar.factionId && c.alive
              )
            )}
            onFocusPlace={(placeId) => {
              // 鏡頭移過去 **而且** 開啟地點分頁：只移鏡頭的話，讀者得到的是一個
              // 地圖畫面，卻不知道要再按一次什麼才看得到那個地方的詳情 /
              // Move the camera AND open the tab: moving the camera alone leaves the reader
              // staring at the map with no idea what to press next to see the detail.
              focusPlaceFromLog(placeId);
              const target = (worldState?.places ?? []).find((pl) => pl.id === placeId);
              if (target) openPlace(target);
            }}
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
      className={`${GM_BTN} px-3 py-1.5 text-xs font-display tracking-wider text-cyan-300/90!`}
      title={t('general.language')}
      aria-label={t('general.language')}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}

// ─── 右側邊欄分頁 / Right Sidebar Tabs ────────────────────────────────────────────

/** 右側面板的分頁 / Tabs for the right-hand side panel */
/**
 * 捲到底自動載入下一批 / Load the next batch when the end of the list scrolls into view.
 *
 * 用哨兵元素 + IntersectionObserver，而不是監聽 scroll 事件：scroll 每次都觸發，要在
 * handler 裡比較 scrollTop/clientHeight/scrollHeight；observer 只在跨越門檻時叫一次，
 * 便宜很多。回呼存在 ref 裡，否則每次 render 產生新的函式會讓 observer 反覆重建。
 *
 * A sentinel element plus an IntersectionObserver rather than a scroll listener: scroll
 * fires constantly and the handler has to compare scrollTop/clientHeight/scrollHeight,
 * while the observer fires once per threshold crossing. The callback lives in a ref, or a
 * fresh function each render would rebuild the observer on every render.
 *
 * @param hasMore - 還有沒有下一批 / whether another batch exists
 * @param onLoadMore - 要載入時呼叫 / called when more should load
 * @returns 掛在哨兵上的 ref / the ref to attach to the sentinel
 */
function useLoadMoreOnScroll(
  hasMore: boolean,
  onLoadMore: () => void,
): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 寫入 ref 必須在 effect 裡：render 期間讀寫 ref.current 會觸發
  // react-hooks/refs，而且在並行渲染下是不安全的（和 DetailModal 的做法一致）。
  //
  // The ref write belongs in an effect: touching `ref.current` during render trips
  // react-hooks/refs and is unsafe under concurrent rendering (same pattern as
  // DetailModal).
  const callbackRef = useRef(onLoadMore);
  useEffect(() => {
    callbackRef.current = onLoadMore;
  });
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) callbackRef.current();
        }
      },
      // 提前一點載入，捲到底才不會先看到空白 /
      // Start a little early so reaching the end does not show blank space first
      { rootMargin: '160px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore]);
  return sentinelRef;
}

type SideTab = 'characters' | 'events' | 'stats' | 'places';

/** 將領表可排序的欄位 / the sortable columns of the leader table */
type LeaderSortKey =
  | 'name'
  | 'faction'
  | 'wu'
  | 'tong'
  | 'ti'
  | 'jing'
  | 'speed'
  | 'defectionBase'
  | 'age'
  | 'troops'
  | 'gold'
  | 'loyalty'
  | 'place';

/** 表格的一列 / one row of the leader table */
interface LeaderRow {
  char: WorldState['characters'][0];
  faction: WorldState['factions'][0] | null;
  placeName: string;
}

/**
 * 依欄位比較兩列。字串用 localeCompare（中文才排得對），數字直接相減。
 * 只回傳方向無關的順序，升降由呼叫端乘上 ±1 —— 兩處各自處理很容易不一致。
 *
 * Compare two rows by column. Strings use localeCompare so Chinese sorts sensibly; numbers
 * subtract. This returns direction-agnostic order and the caller applies ±1, because
 * handling the direction in two places drifts apart easily.
 */
function compareLeaderRows(a: LeaderRow, b: LeaderRow, key: LeaderSortKey): number {
  switch (key) {
    case 'name':
      return a.char.name.localeCompare(b.char.name);
    case 'faction':
      return (a.faction?.name ?? '').localeCompare(b.faction?.name ?? '');
    case 'place':
      return a.placeName.localeCompare(b.placeName);
    case 'loyalty':
      return a.char.loyalty.localeCompare(b.char.loyalty);
    default:
      return a.char[key] - b.char[key];
  }
}

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
    {
      key: 'places' as const,
      label: t('place.tab'),
      icon: (
        <>
          <circle cx="12" cy="12" r="2.5" />
          <ellipse cx="12" cy="12" rx="9" ry="4" />
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
          className={`pointer-events-auto h-full w-[24rem] max-w-[80vw] ${GM_RAIL} border-l border-white/5 flex flex-col overflow-hidden`}
        >
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="font-display text-xs text-gray-400 tracking-wider">
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
              // 錄影腳本靠這個穩定地切換分頁。不要改用 class 名稱或 emoji：
              // 兩者都被改過一次 —— `font-orbitron` → `font-display` 之後，
              // scripts/capture-hero.mjs 的 `div.fixed.z-50 h3.font-orbitron`
              // 就永遠配不上了，而腳本只會印一行 WARN 然後安靜地少拍一段。
              //
              // The capture script switches tabs through this. Do not reach for a class
              // name or an emoji instead: both have been changed before — after
              // `font-orbitron` became `font-display`, the script's
              // `div.fixed.z-50 h3.font-orbitron` could never match again, and it only
              // printed one WARN and silently recorded a shorter video.
              data-testid={`side-tab-${tab.key}`}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-display tracking-wider transition-all duration-200 ${
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
        className={`${!isAdmin ? GM_BTN : GM_BTN_ACCENT} px-3 py-1.5 text-xs font-display tracking-wider`}
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
          <span className="text-xs text-gray-400 font-display tabular-nums">
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
              <span className="font-display tracking-wider">{t('game.round')} {String(round).padStart(4, '0')}</span>
            </button>
          )
        )}
        {oldestRound > 0 && (
          <button
            type="button"
            onClick={() => setOlderPages((pages) => pages + 1)}
            className={`${GM_BTN} w-full mt-1 py-1.5 text-xs font-display tracking-wider`}
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
  kingLoyalty,
  myEvents,
  friendships,
  discontents,
  onOpenLeader,
  characters,
  onFocusPlace,
  controlledPlaceName,
}: {
  char: WorldState['characters'][0];
  faction: WorldState['factions'][0] | null;
  placeName: string;
  factionAverage: number[] | null;
  /** 本势力君王的忠誠标签；null = 没有君王可比 / The faction king's loyalty tag; null when there is no king to compare */
  kingLoyalty: string | null;
  /** 本回合影響此人的 DefectionEvent / This round's DefectionEvents affecting them */
  myEvents: ReadonlyArray<{ delta: number; reason: string }>;
  /** 全世界友誼列（扁平）/ every friendship row in the world (flat) */
  friendships: WorldState['friendships'];
  /** 全世界不滿列（每對兩列）/ every discontent row in the world (two per pair) */
  discontents: WorldState['discontents'];
  /** 全體將領，只為了把人名解析成人 / all leaders, purely to resolve ids to names */
  characters: WorldState['characters'];
  /** 從關係清單點名字時開啟那個人的彈窗 / open another leader's popup from the relations list */
  onOpenLeader: (charId: string) => void;
  /** 點「位置」時把鏡頭移過去並開啟地點分頁 /
   *  Called when 位置 is clicked: move the camera there and open the 地點 tab */
  onFocusPlace: (placeId: string) => void;
  /** 這個角色管理的**地方**（`Place.administratorId === char.id`）/ The place this leader administers */
  controlledPlaceName: string;
}) {
  // 關係分頁預設關閉：多數時候讀者來看的是數值，關係是「有興趣才去看」的。
  // The relations tab starts closed: most readers come for the numbers, and the relations
  // are there when they want them.
  const [detailTab, setDetailTab] = useState<'stats' | 'relations'>('stats');

  // 人名查表**每次 render 重建一次**，而不是用 ref 或 memo：這裡只在「點名字」時被呼叫，
  // 重建的成本是幾個 entry，而 memo 化反而要處理 `characters` 陣列的參考identity——
  // 每回合它都是新的物件，memo 會直接失效。
  //
  // The name lookup is rebuilt every render rather than memoised or held in a ref: it is
  // only called when a name is clicked, it costs a few entries, and memoising it would mean
  // tracking the identity of `characters` — a fresh array every round, so the memo would
  // miss anyway.
  const nameOf = useMemo(() => {
    const map = new Map(characters.map((c) => [c.id, c.name] as const));
    return (id: string) => map.get(id) ?? '—';
  }, [characters]);
  /**
   * 叛變值與本回合機率，**在客戶端用同一組純函式重算**，而不是讓伺服器多存一份。
   *
   * 伺服器端已經用 `src/lib/defection.ts` 算過一次來擲骰；這裡呼叫同一個函式，所以
   * 顯示的值與實際擲骰用的值不可能對不上。若這裡改成自己重寫一份公式，就會出現
   * 「面板寫 12%、實際擲出來像 5%」這種沒有任何機制能發現的不一致。
   *
   * Recomputed client-side with the *same* pure functions the server rolled with, rather
   * than having the server store a second copy.
   *
   * `loyaltyCheck` already called `src/lib/defection.ts` to make the roll, so calling it
   * again here means the displayed value and the rolled value cannot disagree. Re-deriving
   * the formula by hand here is what would produce a "the panel says 12% but it behaved
   * like 5%" divergence that nothing would ever catch.
   */
  const eventDeltaSum = myEvents.reduce((sum, e) => sum + e.delta, 0);
  const loyaltyMismatch = kingLoyalty !== null && char.loyalty !== kingLoyalty;
  const defection = defectionValue({
    defectionBase: char.defectionBase,
    loyaltyMismatch,
    eventDeltaSum,
  });
  const defectionRate = defectionChance(defection);

  /**
   * 同地點關係對戰鬥力的影響，同樣是**用同一組純函式在客戶端重算**。
   *
   * 伺服器在 `battle.ts` 裡用 `buildRelationCombatDeltas()` 算過一次；這裡呼叫同一個
   * 函式，所以面板顯示的戰鬥力與實際交戰時用的**不可能對不上**。若這裡自己重寫一份
   * 規則，就會出現「面板寫 24、實際像 20」這種沒有任何機制能發現的不一致。
   *
   * The same recomputation, with the *same* pure functions the server fought with.
   *
   * `battle.ts` called `buildRelationCombatDeltas()` to roll the fight; calling it again
   * here means the displayed combat ability and the one the battle used cannot disagree.
   * Re-deriving the rule by hand here is what would produce a "the panel says 24 but it
   * behaved like 20" divergence that nothing would ever catch.
   *
   * `placeOf` **只含活著的角色**，與伺服器端相同：關係不會隨死亡而消失，而亡者的
   * `placeId` 仍留在資料庫裡。
   *
   * `placeOf` holds **living characters only**, exactly as on the server: relations outlive
   * their owners and a dead character's `placeId` stays in the database.
   */
  const relationCombat = useMemo(() => {
    const placeOf = new Map(
      characters.filter((c) => c.alive).map((c) => [c.id, c.placeId] as const)
    );
    return buildRelationCombatDeltas(placeOf, friendships, discontents);
  }, [characters, friendships, discontents]);

  const relationDelta = relationCombat.get(char.id) ?? 0;
  const effectiveWu = effectiveAbility(char.wu, relationDelta);
  const effectiveTi = effectiveAbility(char.ti, relationDelta);

  /**
   * 被關係改動過的數值才需要 tooltip：括號裡已經寫了 `+1`／`−1`，但那是**結果**；
   * tooltip 說的是**原因**——為什麼這個數字被推高或壓低。
   *
   * Only a value that relations actually moved needs a tooltip. The parenthetical already
   * carries the `+1` / `−1`, but that is the *result*; the tooltip gives the *reason* — why
   * this number was pushed up or down.
   */
  const modifiedNote = (base: number, effective: number): string | undefined => {
    if (effective === base) return undefined;
    const diff = effective - base;
    return t('character.abilityModified', {
      delta: `${diff > 0 ? '+' : '−'}${Math.abs(diff)}`,
      base,
    });
  };

  /**
   * 資料分頁分成三組：**基礎**（年齡、位置、金錢、兵力）、**戰力**（五項屬性）、
   * **忠誠**（忠誠標籤、野心、叛變值、叛變機率）。
   *
   * The data tab is three groups: **basics** (age, place, gold, troops), **power** (the five
   * abilities) and **loyalty** (loyalty tag, ambition, defection value, defection chance).
   *
   * 分組不是排版偏好，是**讀法**：混在一張表裡時，讀者得自己分辨「哪些數字決定他打贏」
   * 與「哪些只是關於他這個人的資料」。分成三組之後，戰力那一組就**只有**會影響交戰的
   * 數字。
   *
   * The grouping is not a layout preference, it is a **reading**: mixed into one table, the
   * reader has to work out for themselves which numbers decide whether he wins a fight and
   * which are merely facts about him. In three groups the power group contains **only** the
   * numbers that affect a fight.
   */
  const statGroups: ReadonlyArray<{ title: string; rows: ReadonlyArray<StatRow> }> = [
    {
      title: t('character.groupBasic'),
      rows: [
        { label: t('character.age'), value: char.age },
        {
          label: t('character.place'),
          // 位置可點：把鏡頭移過去，並且開啟「地點」分頁看那個地方的詳情。
          // 只是文字時，它等於叫讀者自己去地圖上找那個地方 /
          // The place is clickable: move the camera there AND open the 地點 tab, so the
          // detail is actually shown. As plain text it only told the reader where to go
          // and look for it.
          value: (
            <button
              type="button"
              onClick={() => onFocusPlace(char.placeId)}
              className="block max-w-full text-xs text-cyan-300 hover:text-cyan-200 hover:underline transition-colors duration-150 truncate text-left"
            >
              {placeName}
            </button>
          ),
        },
        {
          label: t('character.administeredPlace'),
          // 領導所管理的**地方**：就是 `Place.administratorId` 指向他的那個地點。
          // 無主勢力的國王或沒有管理任何地方時顯示「無」。
          value: (
            <button
              type="button"
              disabled={controlledPlaceName === '—'}
              onClick={() => onFocusPlace(char.placeId)}
              className="block max-w-full text-xs text-cyan-300 hover:text-cyan-200 hover:underline transition-colors duration-150 truncate text-left"
            >
              {controlledPlaceName}
            </button>
          ),
        },
        { label: t('character.gold'), value: char.gold },
        { label: t('character.troops'), value: char.troops },
      ],
    },
    {
      title: t('character.groupPower'),
      rows: [
        {
          label: t('character.wu'),
          value: abilityText(char.wu, effectiveWu),
          note: modifiedNote(char.wu, effectiveWu),
        },
        {
          label: t('character.ti'),
          value: abilityText(char.ti, effectiveTi),
          note: modifiedNote(char.ti, effectiveTi),
        },
        { label: t('character.tong'), value: char.tong },
        { label: t('character.jing'), value: char.jing },
        { label: t('character.speed'), value: char.speed },
      ],
    },
    {
      title: t('character.groupLoyalty'),
      rows: [
        {
          label: t('character.loyalty'),
          value: t(
            `character.loyalty${char.loyalty.charAt(0)}${char.loyalty.slice(1).toLowerCase()}`
          ),
        },
        { label: t('character.defectionBase'), value: char.defectionBase },
        { label: t('character.defectionValue'), value: defection.toFixed(1) },
        { label: t('character.defectionChance'), value: `${(defectionRate * 100).toFixed(1)}%` },
      ],
    },
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
          size={216}
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
          {/* 勢力色塊放在勢力名「左邊」：色塊先到，文字才對得起那個顏色。
              沒有勢力時才用 em dash，不留一個沒有來源的色塊 /
              The faction swatch sits to the LEFT of the name, so the colour arrives before
              the word it belongs to. No swatch when there is no faction: a coloured chip
              with nothing behind it reads as a different faction. */}
          <span className="flex items-center gap-1.5">
            {faction && (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: faction.color }}
                aria-hidden="true"
              />
            )}
            <span className="text-xs text-gray-400">{faction ? faction.name : '—'}</span>
          </span>
          {!char.alive && (
            <span className="text-xs text-rose-300">{t('character.dead')}</span>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {/* 分頁：資料 / 關係。點擊當前分頁即收起（與地圖側欄同一個互動慣例），
            所以讀者永遠有一條路把面板清乾淨。
            Tabs: 資料 / 關係. Clicking the active tab collapses it, the same toggle the map
            side rail uses, so there is always a way to put the panel away. */}
        <div className="flex items-center gap-1 border-b border-white/5" role="tablist">
          {(['stats', 'relations'] as const).map((tab) => {
            const active = detailTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDetailTab(active && tab === 'relations' ? 'stats' : tab)}
                className={`px-3 py-1.5 text-xs transition-colors duration-150 border-b-2 -mb-px ${
                  active
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab === 'stats' ? t('character.tabStats') : t('character.tabRelations')}
              </button>
            );
          })}
        </div>
        {detailTab === 'relations' ? (
          <LeaderRelations
            charId={char.id}
            friendships={friendships}
            discontents={discontents}
            nameOf={nameOf}
            onOpenLeader={onOpenLeader}
          />
        ) : (
          <>
        {/* interactive：詳情彌窗里的圖是固定的，可以很自然地接受游標；
            而將領表那一列的浮動預稿必須保持 pointer-events-none，
            否則面板會觸發那一列的 mouseleave 而閃烁消失 /
            interactive: in the modal the chart is static and can take the pointer; the
            leader-table hover preview must stay non-interactive or it flickers away */}
        <CharacterRadarHover
          character={char}
          factionAverage={factionAverage}
          color={faction ? faction.color : '#64748b'}
          interactive
        />
        {/* 每個區塊用一條細線分開，而不是只靠間距。字級提到 14px（`GM_TITLE` 本來就是
            14px，之前用 `text-xs!` 壓回 12px，和下面 12px 的標籤一樣大，分組標題就看不出
            是標題）。
            **間距總量刻意維持原本的 12px**：容器 `space-y-1`（4px）＋分隔線的 `pt-2`（8px）
            ＝ 12px，和原本的 `space-y-3` 一樣。標題本身**不留**下邊距：上方已經有線條，下方
            每一列自己就有一條 `border-b` 與 `py-1`，再加 4px 只會讓這個面板在剛好裝得下時
            溢出 1px、冒出一條捲軸。
            **The spacing total is deliberately unchanged at 12px**: the container's
            `space-y-1` (4px) plus the rule's `pt-2` (8px) is exactly what `space-y-3` used to
            be. The heading carries **no** bottom margin: there is already a rule above it, and
            every row below has its own `border-b` and `py-1`, so another 4px only pushed the
            panel 1px past its box and produced a scrollbar on a popup that otherwise fitted. */}
        <div className="space-y-1">
          {statGroups.map((group, index) => (
            <section
              key={group.title}
              className={index > 0 ? 'border-t border-white/10 pt-2' : undefined}
            >
              <h4 className={`${GM_TITLE} text-gray-300!`}>{group.title}</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2 border-b border-white/5 py-1"
                  >
                    <dt className="text-xs text-gray-400">{row.label}</dt>
                    {/* 顯示字體放在**值**上，不放在 `dd` 上：「位置」那一列的值是個
                        按鈕，而按鈕繼承父層的字體——放在 `dd` 上會讓地名變成顯示字體，
                        那是一次沒人要求的排版變更。
                        The display face goes on the **value**, not on the `dd`: the place
                        row's value is a button, and a button inherits its parent's font —
                        putting it on the `dd` would silently switch the place name to the
                        display face, which is a typographic change nobody asked for. */}
                    <dd className="min-w-0 text-xs text-gray-200" title={row.note}>
                      {typeof row.value === 'string' || typeof row.value === 'number' ? (
                        <span className="font-display">{row.value}</span>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        {/* 叛變值的來源：把「哪些事件把這個數字推高或壓低」列出來。
            一個沒有來源的數字等於沒有解釋——讀者看得到結果，看不到原因，所以這個面板
            在表面上顯示機率、實際上卻沒有任何機制會讓人懷疑它錯了。
            每筆事件各有各的 delta（可以正也可以負），所以列的是**原始 delta**而不是
            事件筆數。
            The sources of the defection value: which events pushed it up or down.
            A number with no visible source is not an explanation — the reader sees the result
            and not the cause, so nothing would ever make them doubt it. Each event carries
            its own delta, positive or negative, so the list shows the raw delta rather than a
            count of events. 這是同一組區塊裡的第四個，所以用同一條線分開 ——
            它是「忠誠」那一組的證據，不是另一個面板。*/}
        <section className="border-t border-white/10 pt-2">
          <div className={`${GM_TITLE} text-gray-300!`}>
            {t('character.defectionEvents')}
          </div>
          {myEvents.length === 0 ? (
            <p className="text-xs text-gray-500">{t('character.noDefectionEvents')}</p>
          ) : (
            <ul className="space-y-0.5">
              {myEvents.map((e, i) => (
                <li
                  key={`${i}-${e.reason}`}
                  className="flex items-baseline gap-2 text-xs text-gray-400"
                >
                  <span
                    className={`font-display tabular-nums shrink-0 ${
                      e.delta >= 0 ? 'text-amber-300' : 'text-cyan-300'
                    }`}
                  >
                    {e.delta >= 0 ? `+${e.delta}` : e.delta}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{e.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
          </>
        )}
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
  onOpenLeaderDetail: (charId: string, reopenTable?: () => void) => void;
}) {
  
  const [showDetail, setShowDetail] = useState(false);
  // 彈窗表格分批：將領會隨回合持續增加，避免一次掛載全部列 /
  // Batched modal rows: characters keep growing with rounds — don't mount them all
  const [rowsShown, setRowsShown] = useState(100);
  // 表頭排序。欄位鍵與 header 對應；點同一個欄位會切換升降。
  // Column sorting for the table head; clicking the same column toggles the direction.
  const [sortKey, setSortKey] = useState<LeaderSortKey>('troops');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  /**
   * 切換排序。點新欄位時用該欄位合理的預設方向（數字大的先、名字 A→Z），
   * 而不是沿用上一個欄位的方向 —— 那會讓「點名字」先出現 Z→A。
   *
   * Switching columns picks that column's own sensible default direction (biggest number
   * first, names A→Z) instead of inheriting the previous column's, which would make
   * clicking "name" start at Z→A.
   */
  const toggleSort = (key: LeaderSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'faction' || key === 'place' || key === 'loyalty' ? 'asc' : 'desc');
    }
    // 換排序要回到第一頁，否則會停在一個已經沒有意義的捲動位置
    // Re-sorting returns to the first page; otherwise the scroll position is meaningless
    setRowsShown(100);
  };
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
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      return compareLeaderRows(a, b, sortKey) * dir;
    });

  // 側欄用同一份排序：兵力 desc / Sidebar uses the same order: troops desc
  const aliveRows = characters.filter((c) => c.alive).sort((a, b) => b.troops - a.troops);

  // 兩個清單都會自動接續 / both lists now continue on their own when scrolled to the end
  const leaderLoadMoreRef = useLoadMoreOnScroll(
    detailRows.length > rowsShown,
    () => setRowsShown((count) => count + 100),
  );
  const listLoadMoreRef = useLoadMoreOnScroll(
    aliveRows.length > listShown,
    () => setListShown((count) => count + 100),
  );


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
                <span className="ml-auto flex items-center gap-1 text-xs text-gray-400 font-display">
                  <Ic className="w-3.5 h-3.5"><path d="m6 13 6-6 6 6M6 18l6-6 6 6" /></Ic>
                  <span className="sr-only">{t('character.troops')}: </span>
                  {char.troops}
                </span>
              </div>
              
            </button>
          ))}
        {/* 哨兵：捲到這裡就自動載入下一批（按鈕保留給鍵盤與不想等的人）/
            Sentinel: scrolled here, load the next batch (the button stays for keyboard
            users and for anyone who would rather not wait) */}
        <div ref={listLoadMoreRef} aria-hidden="true" />
        {aliveRows.length > listShown && (
          <button
            type="button"
            onClick={() => setListShown((count) => count + 100)}
            className={`${GM_BTN} w-full py-2 text-xs font-display tracking-wider`}
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
              {(
                [
                  ['name', 'character.name'],
                  ['faction', 'faction.name'],
                  ['wu', 'character.wu'],
                  ['tong', 'character.tong'],
                  ['ti', 'character.ti'],
                  ['jing', 'character.jing'],
                  ['speed', 'character.speed'],
                  ['defectionBase', 'character.defectionBase'],
                  ['age', 'character.age'],
                  ['troops', 'character.troops'],
                  ['gold', 'character.gold'],
                  ['loyalty', 'character.loyalty'],
                  ['place', 'character.place'],
                ] as const
              ).map(([key, labelKey]) => {
                const active = sortKey === key;
                return (
                  <th
                    key={key}
                    className={`py-2 pr-3 font-medium ${key === 'place' ? '' : 'text-right'}`}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {/* 表頭本身是排序按鈕：整格可點，字尾顯示目前方向。
                        The header *is* the sort control: the whole cell is clickable, and
                        the glyph shows the current direction. */}
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`inline-flex items-center gap-0.5 hover:text-gray-200 transition-colors duration-150 ${
                        active ? 'text-cyan-300' : ''
                      }`}
                    >
                      {t(labelKey)}
                      {active && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {detailRows.slice(0, rowsShown).map(({ char, faction, placeName }: LeaderRow) => (
              <tr
                key={char.id}
                // 虛擬化：`content-visibility: auto` 讓瀏覽器**跳過畫面外的列**的排版與繪製，
                // 只在捲到時才算。這就是專案裡事件日誌列已經在用的做法（同一個 class 字串），
                // 而且是瀏覽器原生、零相依、對表格列一樣有效。
                //
                // `contain-intrinsic-size` 給每列一個預估高度，否則跳過的列高度算成 0，
                // 捲軸會抖動。
                //
                // Virtualisation: `content-visibility: auto` makes the browser **skip layout and
                // paint** for rows outside the viewport, doing the work only when they scroll in.
                // It is the idiom the event log already uses (same class string), it is native,
                // needs no dependency, and works on table rows. `contain-intrinsic-size` gives a
                // row an estimated height, or skipped rows measure 0 and the scrollbar jitters.
                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-150 cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_37px]"
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
                  onOpenLeaderDetail(char.id, () => setShowDetail(true));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setHoverPreview(null);
                    setShowDetail(false);
                    onOpenLeaderDetail(char.id, () => setShowDetail(true));
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
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.wu}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.tong}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.ti}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.jing}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.speed}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.defectionBase}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.age}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.troops}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{char.gold}</td>
                <td className="py-2 pr-3 text-gray-300">
                  {t(`character.loyalty${char.loyalty.charAt(0)}${char.loyalty.slice(1).toLowerCase()}`)}
                </td>
                <td className="py-2 text-gray-300">{placeName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={leaderLoadMoreRef} aria-hidden="true" />
        {detailRows.length > rowsShown && (
          <button
            type="button"
            onClick={() => setRowsShown((count) => count + 100)}
            className={`${GM_BTN} w-full mt-3 py-2 text-xs font-display tracking-wider`}
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
  place: WorldState['places'][0] | null;
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
/**
 * Which building's per-level breakdown is expanded, or none.
 *
 * 建築列一開始只顯示「等級 + 目前效果」，每一級的效果表在 hover / focus / click
 * 時才展開。全部攤開會把真正要看的兩個數字（現在幾級、升一級多少錢）埋掉。
 * A building row shows only its level and current effect; the per-level table expands
 * on hover, focus or click. Listing every level up front buried the two numbers the
 * reader actually came for.
 *
 * 這個 state 必須在 `if (!place)` **之前**：hook 不能條件式呼叫，否則有選中／沒選中
 * 會走不一樣的 hook 順序。
 * This state must sit ABOVE the `if (!place)` guard: hooks cannot be called
 * conditionally, and "a place is selected" vs "none" would otherwise change the order.
 */
/**
 * Which building's per-level breakdown is expanded, or none.
 *
 * 建立列一開始只顯示「等級 + 目前效果」，每一級的效果表在 hover / focus / click
 * 時才展開。全部擊開會把真正要看的兩個數字（現在幾級、升一級多少錢）埋掉。
 * A building row shows only its level and current effect; the per-level table expands
 * on hover, focus or click. Listing every level up front buried the two numbers the
 * reader actually came for.
 *
 * 這個 state 必須在 `if (!place)` **之前**：hook 不能條件式呼叫，否則有選中／沒選中
 * 會走不一樣的 hook 順序。
 * This state must sit ABOVE the `if (!place)` guard: hooks cannot be called
 * conditionally, and "a place is selected" vs "none" would otherwise change the order.
 */
const [pinnedBuilding, setPinnedBuilding] = useState<BuildingKind | null>(null);
const [hoveredBuilding, setHoveredBuilding] = useState<BuildingKind | null>(null);

/**
 * Pinned wins over hovered. These are two separate states on purpose: a single "open"
 * state cannot serve both, because hover opens the row and the click that follows then
 * lands on an already-open row and immediately closes it again. Measured — the row
 * expanded on mouse-enter and collapsed again on the very next click.
 *
 * 分成兩個狀態是必要的：單一個 open 無法同時服務 hover 與 click，因為 hover 開完後緊接的
 * click 來到已開啟的列，立即把它關掉。分开來結果就是：鼠横移開伀默認開的那一列，
 * 體素後仍可以固定住。
 */
const openBuilding = pinnedBuilding ?? hoveredBuilding;

  // 還沒選地點時：不是空白，而是**列出所有地點**讓人直接點。這個面板現在是「地點」分頁
  // 的內容，所以「沒有選中」是一個正常狀態；但只放一句提示等於逼讀者回到地圖自己去點，
  // 面板既然已經在這裡，就該把所有地點攤開。依名稱排序，因為這個列表和地圖的視覺位置無關。
  //
  // With nothing selected, do not show a dead end: list every place and let the reader pick.
  // This panel is the 地點 tab's content, so "nothing selected" is a normal state — but a
  // one-line prompt sends the reader back to the map to hunt. The panel is already here, so
  // it should list them. Sorted by name, because this list has no spatial cue of its own.
  /** 地點列表的搜尋字串 / The place list's search text */
  const [placeQuery, setPlaceQuery] = useState('');
  /** 擁有權過濾 / Ownership filter */
  const [placeOwnerFilter, setPlaceOwnerFilter] = useState<'all' | 'owned' | 'unowned'>('all');
  /**
   * 勢力過濾。`'all'` 是「不依勢力篩」，其餘是勢力 id。
   *
   * Faction filter. `'all'` means "don't filter by faction"; anything else is a faction id.
   *
   * 選了勢力會**同時**把擁有權過濾切回 `all`：兩個條件可以自由組合，但「某勢力 + 無主」
   * 在定義上永遠是空集合，留著只會給人一個看不懂的空清單。
   *
   * Choosing a faction also switches the ownership filter back to `all`: the filters compose,
   * but "this faction + unowned" is empty by construction, and leaving it selectable only
   * produces a list nobody can read.
   */
  const [placeFactionFilter, setPlaceFactionFilter] = useState('all');
  /**
   * 已顯示的筆數。這是「無窮載入」而不是一次畫完：世界可以到 2000 個地點，而這個面板
   * 只有 24rem 寬，一次建立兩千列等於每次開分頁都重建整個列表。
   *
   * Rows revealed so far. This is incremental loading rather than rendering everything: the
   * world can hold 2000 places and this panel is only 24rem wide, so building every row on
   * each open means rebuilding the whole list every time the tab is opened.
   *
   * 重設這個值是因為過濾條件改變後，已顯示的筆數會指向另一個集合的尾端。
   * It resets when the filter changes, because the count would otherwise point into the tail
   * of a different set.
   */
  const [placeVisibleCount, setPlaceVisibleCount] =
    // CONFIG 是 `as const`，所以這裡會推成字面值 `100`，而 updater 要回傳 number。
    // 顯式標成 number 才不會把 setter 鎖死成只有 100 可用 / CONFIG is `as const`, so this
    // infers the literal `100` and the updater cannot return a larger number. Annotating it
    // is what keeps the setter usable.
    useState<number>(CONFIG.PLACE_LIST_PAGE_SIZE);

  if (!place) {
    const ownedFilter = placeOwnerFilter;
    const query = placeQuery.trim().toLowerCase();
    const factionFilter = placeFactionFilter;
    const filtered = places.filter((p) => {
      const isOwned = p.factionId !== null;
      if (ownedFilter === 'owned' && !isOwned) return false;
      if (ownedFilter === 'unowned' && isOwned) return false;
      // 勢力過濾。無主之地的 factionId 是 null，永遠不會等於任何一個 id，所以選了勢力
      // 就自動把它們排除 —— 不需要另外寫一個 unowned 分支 /
      // Faction filter. Unowned places have a null factionId, which never equals any id, so
      // picking a faction excludes them automatically — no separate unowned branch needed.
      if (factionFilter !== 'all' && p.factionId !== factionFilter) return false;
      // 名稱比對不分大小寫：中文沒有大小寫，但英文地名有，所以一律轉小寫再比 /
      // Name matching is case-insensitive: Chinese has no case but English place names do
      return query === '' || p.name.toLowerCase().includes(query);
    });
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    const shown = sorted.slice(0, placeVisibleCount);
    const hasMore = shown.length < sorted.length;
    return (
      <div className={`${GM_PANEL} px-2 py-2`}>
        <div className={`${GM_TITLE} text-xs! mb-1.5`}>{t('place.allPlaces')}</div>
        {/* 搜尋 + 擁有權過濾。重設「已顯示筆數」是必要的：否則換了條件之後，那個數字
            會指向另一個集合的尾端，畫面看起來就像「沒反應」 /
            Search plus an ownership filter. The revealed-row count has to reset with them:
            otherwise the count points into the tail of a different set and the list looks
            unresponsive. */}
        <input
          type="search"
          value={placeQuery}
          onChange={(e) => {
            setPlaceQuery(e.target.value);
            setPlaceVisibleCount(CONFIG.PLACE_LIST_PAGE_SIZE);
          }}
          placeholder={t('place.searchPlaces')}
          aria-label={t('place.searchPlaces')}
          className="mb-1.5 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-cyan-400/50"
        />
        <div className="mb-1.5 flex gap-1" role="group" aria-label={t('place.filterOwnership')}>
          {(
            [
              ['all', t('place.filterAll')],
              ['owned', t('place.filterOwned')],
              ['unowned', t('place.filterUnowned')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={placeOwnerFilter === key}
              onClick={() => {
                setPlaceOwnerFilter(key);
                setPlaceVisibleCount(CONFIG.PLACE_LIST_PAGE_SIZE);
              }}
              className={`min-h-11 flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors duration-150 ${
                placeOwnerFilter === key
                  ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 勢力過濾。用下拉選單而非同樣式的一排按鈕：勢力動輒上百個，按鈕排不下。
            樣式與事件日誌的勢力過濾一致，兩個過濾讀起來才像同一個東西。標示沿用
            faction.* 既有的三個狀態用字，不另造字串 —— 這三個狀態正是
            leader-detail.tsx 的 statusRank() 排序用的同一組 /
            Faction filter. A dropdown rather than another chip row: there can be hundreds of
            factions, which no row of buttons can hold. Styled to match the event log's faction
            filter so the two read as the same control. The markers reuse the existing
            `faction.*` state words rather than inventing strings — and they are the same three
            states `statusRank()` in leader-detail.tsx sorts by. */}
        <div className="mb-1.5 flex items-center gap-2">
          <label
            className="shrink-0 text-xs text-gray-400"
            htmlFor="gm-place-faction"
          >
            {t('place.filterFaction')}
          </label>
          <select
            id="gm-place-faction"
            value={placeFactionFilter}
            onChange={(e) => {
              setPlaceFactionFilter(e.target.value);
              // 選了勢力就代表要「有主」的地點，所以把擁有權過濾拉回全部 /
              // Picking a faction means "places that are owned", so pull ownership back to All
              if (e.target.value !== 'all') setPlaceOwnerFilter('all');
              setPlaceVisibleCount(CONFIG.PLACE_LIST_PAGE_SIZE);
            }}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-200 focus:border-cyan-400/50 focus:outline-none"
          >
            <option value="all">{t('place.allFactions')}</option>
            {/* 已滅亡／瓦解中的勢力仍然列出：地點會留下來，仍然找得到，但標出來讓你知道
                這個勢力已經沒了。排序用 localeCompare，和地點清單本身的排序一致 /
                Destroyed and collapsing factions stay in the list: their places persist and
                should remain findable, but marked so it is clear the faction is gone. Sorted
                with localeCompare, matching the list's own sort. */}
            {[...factions]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((faction) => (
                <option key={faction.id} value={faction.id}>
                  {faction.name}
                  {!faction.alive ? ` · ${t('faction.collapsed')}` : ''}
                  {faction.collapsing ? ` · ${t('faction.collapsing')}` : ''}
                </option>
              ))}
          </select>
        </div>
        {sorted.length === 0 ? (
          <p className="text-base text-gray-400 px-1">{t('game.noData')}</p>
        ) : (
          <>
            <ul
              className="space-y-0.5 max-h-[55vh] overflow-y-auto ds-gm-scroll"
              onScroll={(e) => {
                // 接近底部就再載入一頁。用捲動事件而不是 IntersectionObserver：
                // 這裡已經有一個捲動容器，加一個哨兵元素只是多一個要同步的節點 /
                // Reveal another page near the bottom. A scroll handler rather than an
                // IntersectionObserver: the scroll container already exists, so a sentinel
                // element would just be one more node to keep in sync
                const el = e.currentTarget;
                if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                  setPlaceVisibleCount((c) => c + CONFIG.PLACE_LIST_PAGE_SIZE);
                }
              }}
            >
              {shown.map((p) => {
              const owner = factions.find((f) => f.id === p.factionId);
              const adminId = p.administratorId;
              const adminChar = (characters ?? []).find(
                (c: any) => c.id === adminId
              );
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPlace(p)}
                    data-testid="place-list-row"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/5"
                  >
                    {/* 勢力色塊在地點名左邊，與將領詳情的排列一致 /
                        The faction swatch sits left of the name, matching the leader detail */}
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: owner ? owner.color : 'transparent' }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-200">
                      {p.name}
                    </span>
                    {adminChar ? (
                      <span
                        className="shrink-0 text-[11px] text-cyan-300/90 truncate max-w-[8rem]"
                        title={t('place.administeredBy', { name: adminChar.name })}
                      >
                        👤 {adminChar.name}
                      </span>
                    ) : null}
                    {!owner && (
                      <span className="shrink-0 text-xs text-gray-500">
                        {t('place.unowned')}
                      </span>
                    )}
                    <span className="shrink-0 font-display text-xs text-cyan-300/80 tabular-nums">
                      {p.garrison}
                    </span>
                  </button>
                </li>
              );
            })}
            </ul>
            {/* 已經到底了就不再提示，否則它會永遠掛在那裡說「還有更多」 /
                No "load more" once the list is exhausted, or it sits there claiming there
                is more forever */}
            <div className="mt-1 px-1 text-center text-[11px] text-gray-500 tabular-nums">
              {hasMore
                ? `${shown.length} / ${sorted.length}`
                : `${sorted.length}`}
            </div>
          </>
        )}
      </div>
    );
  }

  const faction = factions.find((f) => f.id === place.factionId);
  const placeChars = characters.filter(
    (c) => c.placeId === place.id && c.alive
  );
  // 管理此地點的行政官（可能人在他處）/ The place's administrator (may be elsewhere)
  const adminChar = characters.find((c) => c.id === place.administratorId) ?? null;

  // 這個地方每回合實際給行政官多少。**直接呼叫真正的分配函式**，而不是在 UI 裡重寫一遍
  // 比例：沒有行政官就一分不發（新規則），若這裡顯示「40%」會讓人以為他照樣有錢。
  // 預覽與模擬若各寫一份，兩者遲早會對不上。
  //
  // What this place actually pays its administrator this round. This **calls the real split
  // function** rather than restating the ratio in the UI: with no administrator nobody is
  // paid, and quoting "40%" would read as though he still gets paid. A preview that
  // re-derives the rule separately from the simulation will drift from it.
  const kingIdOfThisPlace = place.factionId
    ? (factions.find((f) => f.id === place.factionId)?.kingId ?? null)
    : null;
  const kingCharOfPlace = characters.find((c) => c.id === kingIdOfThisPlace) ?? null;
  const othersHere = placeChars.filter(
    (c) => c.id !== place.administratorId && c.id !== kingIdOfThisPlace
  ).length;
  const adminLeaderShare = adminChar
    ? splitIncome(
        placeIncome(place.market),
        kingCharOfPlace ? kingCharOfPlace.jing : null,
        adminChar.jing,
        othersHere
      ).admin
    : null;

  // 相連地點保留完整物件（不是只有名字）——點擊跳轉需要 id /
  // Keep the whole place objects rather than just names: navigating needs the id
  const linkedPlaces = roads
    .filter((road) => road.aId === place.id || road.bId === place.id)
    .map((road) => (road.aId === place.id ? road.bId : road.aId))
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is WorldState['places'][0] => p !== undefined);

  return (
    <motion.div
      className={`relative w-full ${GM_MODAL} overflow-hidden`}
      // 錄影腳本等這個元素來確認「地點詳情真的顯示出來了」。它以前是一個浮動彈出視窗，
      // 錄影腳本等的是 `div.fixed.z-50`；改成側欄分頁內容之後那個選擇器就永遠配不上，
      // 於是腳本只印一行 WARN、少拍一段影片，而且沒有人會注意到。
      //
      // The capture script waits on this to confirm the place detail actually rendered. It
      // used to be a floating popup and the script waited for `div.fixed.z-50`; once it
      // became side-panel tab content that selector could never match, so the script
      // printed one WARN, recorded a shorter video, and nobody noticed.
      data-testid="place-detail"
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
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
              <h3 className="font-display font-bold text-lg text-white tracking-wide truncate">{place.name}</h3>
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

          {/* 建築資訊：每棟一列，等級與目前效果常駐；每一級的效果表在 hover / focus /
              click 時才展開，並把目前等級標成 active。新的互動（hover / focus / click）
              同時取代了 hover 與 click，所以觸控也能用同一顆按鈕 /
              Buildings: one compact row each, level and current effect always visible; the
              per-level table expands on hover, focus or click with the current level marked
              active. Hover, focus and click all toggle the same one-row disclosure, so touch
              gets the identical control instead of a second one. */}
          <div>
            <div className={`${GM_TITLE} text-xs! mb-1.5`}>{t('place.buildings')}</div>
            <div className="space-y-1.5">
              {BUILDING_ROWS.map((row) => {
                const level = place[row.kind];
                const per = buildingPerLevel(row.kind);
                const cost = level >= BUILDING_MAX_LEVEL ? null : upgradeCost(level);
                // 下一升到頂了嗎？只用來當開關——顯示的數字是 `buildingTotal(level + 1)`（**累積**值，
                // 例如堡壘 1→2 是 +40%，不是 +20%），所以不能直接印這個的傳回值。
                //
                // Is the next upgrade possible? Used **only as the gate** — the number printed
                // is `buildingTotal(level + 1)`, the **cumulative** effect (fortress 1→2 is
                // +40%, not +20%), so this function's own return value must not be printed.
                const nextGain = nextUpgradeGain(row.kind, level);
                // 印的數字一律走 `placeEffectLabel`：市場與兵營印**這個地方每回合的總產出**
                // （1 級 = 基礎 10 + 5 = 15），堡壘沒有「總產出」可言所以印累積百分比。
                // 展開的等級表與等級圓點的 tooltip 也走同一個函式——以前行與圓點印的是這一棟
                // 建築自己的貢獻，於是市場 1 級同時有「15 金錢 / 每回合」與「+5 金錢」兩個數字。
                //
                // Every printed number goes through `placeEffectLabel`: market and barracks
                // print the **place's total per round** (level 1 = 10 base + 5 = 15), while
                // fortress has no total and keeps its cumulative percentage. The expanded level
                // table and the dots' tooltips go through the same function — the row and the
                // dots used to print this one building's own contribution, so market level 1
                // carried both "15 gold / round" and "+5 gold".
                const currentLabel = placeEffectLabel(row.kind, level);
                const nextLabel = placeEffectLabel(row.kind, level + 1);
                const expanded = openBuilding === row.kind;
                const affordable = adminChar !== null && adminChar.gold >= (cost ?? 0);
                return (
                  <div
                    key={row.kind}
                    // 展開時提高 z：提示畫在這一張卡的**外面**（上一張卡的上方），
                    // 不提高的話會被後面的同層卡片蓋掉。
                    // 而這裡**不能**把 `overflow-hidden` 加回來：它會把提示整個裁掉，
                    // z 再高也沒用——裁切與堆疊順序是兩件事。
                    //
                    // Raise z while expanded: the tooltip renders *outside* this card, over the
                    // card above it, so a later sibling would otherwise paint over it. And
                    // `overflow-hidden` must not come back here — it clips the tooltip away
                    // entirely, and no z-index can undo a clip.
                    className={`relative rounded-lg bg-white/5 border border-white/10 ${
                      expanded ? 'z-30' : ''
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      // 點擊＝固定，hover＝預覽。固定之後滑鼠移開也不會收起 / Click pins, hover only
                      // previews, so a pinned row survives the pointer leaving the row
                      onClick={() => setPinnedBuilding(pinnedBuilding === row.kind ? null : row.kind)}
                      onMouseEnter={() => setHoveredBuilding(row.kind)}
                      onMouseLeave={() =>
                        setHoveredBuilding((cur) => (cur === row.kind ? null : cur))
                      }
                      onFocus={() => setHoveredBuilding(row.kind)}
                      onBlur={() =>
                        setHoveredBuilding((cur) => (cur === row.kind ? null : cur))
                      }
                      className={`w-full flex flex-col gap-1 px-2.5 py-2 text-left transition-colors duration-150 ${
                        expanded ? 'bg-cyan-400/10' : 'hover:bg-white/5'
                      }`}
                    >
                      {/* 第一行：等級、名稱、價格；第二行：「目前 → 下一級」。
                          單行時市場那一列是 `1/5 市場 +15 金錢 → +20 金錢 升級費用 200`，
                          剛好溢出 24rem 的面板 —— 而且溢出的是最右邊的價格，也就是最該讀到
                          的那個數字。第二行只有兩個數字，任何面板寬度都放得下。
                          箭頭留在第一行右緣，跟價格同一組，兩者是同一件事。

                          Line one: level, name, price. Line two: "current → next". On one line
                          the market row was `1/5 市場 +15 金錢 → +20 金錢 升級費用 200`, which
                          overflowed the 24rem panel — and what overflowed was the price, the one
                          number that most needs reading. Line two holds two numbers and fits any
                          width. The chevron stays on line one beside the price, which is the
                          same piece of information. */}
                      <div className="flex items-center gap-2">
                        {/* 等級是主要資訊，所以用等寬字 + active 色，無論展開與否都在 /
                          The level is the headline number, so it keeps the active colour
                          whether or not the table is expanded */}
                        <span
                          className={`font-display text-sm tabular-nums shrink-0 ${
                            level > 0 ? 'text-cyan-300' : 'text-gray-500'
                          }`}
                        >
                          {level}/{BUILDING_MAX_LEVEL}
                        </span>
                        <span className="text-base text-gray-200 truncate">
                          {t(row.labelKey)}
                        </span>
                        <span className="flex-1 min-w-0" />
                        {cost !== null ? (
                          <span
                            className={`text-sm font-display tabular-nums shrink-0 ${
                              affordable ? 'text-amber-300' : 'text-rose-300'
                            }`}
                            title={adminChar ? `${t('place.adminHas')} ${adminChar.gold}` : undefined}
                          >
                            {t('place.upgradeCost')} {cost}
                          </span>
                        ) : (
                          <span className="text-sm text-amber-300 shrink-0">{t('place.maxLevel')}</span>
                        )}
                        {/* 展開時的箭頭：折疊方向本身就是提示，不需要文字 / A chevron is the
                            affordance here; the direction already says "this opens" */}
                        <Ic
                          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform duration-200 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </Ic>
                      </div>
                      {/* 第二行：「目前 → 下一級」。箭頭是這裡唯一的說明——它說明右邊是
                          「多花這筆錢會換到的東西」，而不是另一個並排的數字。
                          第二行仍然自己 `flex-wrap`，所以就算面板再窄一點也不會溢出。

                          Line two: "current → next". The arrow is the whole explanation — it
                          says the right-hand number is what the money buys, not another figure
                          sitting beside this one. Line two wraps on its own, so a narrower
                          panel cannot push it over the edge either. */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm text-gray-300 font-display tabular-nums shrink-0">
                          {formatEffect(currentLabel.value, currentLabel.unit)}
                        </span>
                        {nextGain !== null && (
                          <>
                            <span className="text-gray-600 shrink-0" aria-hidden="true">
                              →
                            </span>
                            <span
                              className="text-sm text-cyan-300/90 font-display tabular-nums shrink-0"
                              title={t('place.nextLevelEffect')}
                            >
                              {formatEffect(nextLabel.value, nextLabel.unit)}
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                    {/* 一級一點：已達到的填滿，目前等級是 active 色，未達到的只剩外框。
                        數字不常駐——滑鼠停在點點上時用 tooltip 顯示，這樣一行只佔幾像素，
                        三棟建築疊起來仍然讀得完。
                        One dot per level: reached levels filled, the current one in the active colour,
                        unreached ones reduced to an outline. The numbers are not permanent — they appear
                        in a tooltip on hover, so a row costs a few pixels and all three buildings still fit. */}
                    <div
                      className="group/dots relative flex items-center gap-1.5 px-2.5 pb-2"
                      onMouseEnter={() => setPinnedBuilding(row.kind)}
                      onMouseLeave={() => setPinnedBuilding((cur) => (cur === row.kind ? null : cur))}
                    >
                        {Array.from({ length: BUILDING_MAX_LEVEL + 1 }, (_, lvl) => {
                          const active = lvl === level;
                          const reached = lvl <= level;
                          return (
                          <span
                            key={lvl}
                            className={`size-2 rounded-full transition-colors duration-150 ${
                              active
                                ? 'bg-cyan-300 ring-2 ring-cyan-400/50 scale-125'
                                : reached
                                  ? 'bg-cyan-400/45'
                                  : 'border border-white/20 bg-transparent'
                            }`}
                            title={`L${lvl} · ${formatEffect(placeEffectLabel(row.kind, lvl).value, placeEffectLabel(row.kind, lvl).unit)} / ${t('place.perRound')}`}
                          />
                          );
                        })}
{/* 提示固定貼在點點**上方**（bottom-full）。點點本來就在每一張卡片的底部，下面就是卡片邊界，
                          再往下只會被裁掉，所以一律往上，不做翻轉。
                          The tooltip is anchored above the dots (bottom-full) unconditionally:
                          the dots already sit at the bottom of each card, so anything below
                          them is the card edge and would be clipped. No flip needed. */}
                      {expanded && (
                        <div
                          className="pointer-events-none absolute left-2.5 bottom-full mb-1 z-20 min-w-[9rem] rounded-lg border border-white/10 bg-gray-900/95 px-2 py-1.5 shadow-lg shadow-black/50"
                          role="tooltip"
                          >
                          <ul className="space-y-0.5">
                            {Array.from({ length: BUILDING_MAX_LEVEL + 1 }, (_, lvl) => {
                              const out = placeEffectLabel(row.kind, lvl);
                              // 印的是**此地此刻每回合的總產出**，不是這一棟自己的貢獻：
                              // 市場 0 級時貢獻是 0，但地方照樣有基礎收入，印 0 會讓讀者
                              // 以為這棟建築一點用都沒有。堡壘沒有「總產出」，退回累積百分比。
                              // 這裡與行內摘要、圓點 tooltip 共用同一個函式，三處不可能再各說各話。
                              //
                              // The **place's total per round** is printed, not this building's own
                              // contribution: at market level 0 the contribution is 0 while the
                              // place still earns its base income, and printing 0 would read as
                              // "this building is worthless". Fortress has no total, so it falls
                              // back to the cumulative percentage. The row summary and the dots'
                              // tooltips share this function, so the three cannot drift apart.
                              const value = out.value;
                              const unit = out.unit;
                              return (
                                <li
                                  key={lvl}
                                  className={`flex items-baseline gap-1.5 text-[13px] font-mono tabular-nums ${
                                    lvl === level ? 'text-cyan-200' : 'text-gray-400'
                                  }`}
                                >
                                  <span className="w-4 shrink-0">L{lvl}</span>
                                  <span className="flex-1">
                                    {formatEffect(value, unit)} / {t('place.perRound')}
                                  </span>
                                  {/* **升到這一級這一步的價錢**，不是「從 0 升到這裡」的累計。
                                      這裡原本印的是累計（`totalCostToReach`），而 `build.ts`
                                      實際收的是**一步**的價錢——於是同一個目標兩處印出不同
                                      數字（1→2：這裡 300、卡片 200），而卡片才是收費的
                                      那個。一張價格表卻不列價格，就是讀者回報的那個問題。
                                      一張列出各級價格的表，若旁邊的卡片寫著另一個數字，
                                      那個「另一個」才是錯的——所以價格跟著收費走。

                                      The price of **this one step**, not the running total
                                      from level 0. This used to print `totalCostToReach`
                                      while `build.ts` charges a single step, so the same
                                      target printed two different numbers side by side
                                      (1→2: 300 here, 200 on the card) — and the card is
                                      the one that gets charged. A price list that does not
                                      list prices is the bug this fixes; the price follows
                                      the charge. */}
                                  <span className="shrink-0 text-amber-300/80">
                                    {lvl === 0
                                      ? '—'
                                      : `${t('place.upgradeCost')} ${costToReachLevel(lvl)}`}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-1 border-t border-white/10 pt-1 text-[11px] text-gray-500">
                            {t('place.perLevel')} {formatEffect(per.value, per.unit)}
                            {adminChar && cost !== null && (
                              <> · {t('place.adminHas')} {adminChar.gold}</>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 這個地方每回合實際產出多少 / What this place actually yields each round */}
          <div className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-2 space-y-1">
            <div className={`${GM_TITLE} text-xs!`}>{t('place.perRound')}</div>
            <div className="flex items-baseline justify-between gap-2 text-base">
              <span className="text-gray-400">{t('place.recruitsToGarrison')}</span>
              <span className="font-display text-cyan-300 tabular-nums">
                +{placeRecruits(place.barracks)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-base">
              <span className="text-gray-400">{t('place.incomeTotal')}</span>
              <span className="font-display text-amber-300 tabular-nums">
                {placeIncome(place.market)}
              </span>
            </div>
            {/* 依新的分配規則，沒有行政官就誰都不拿，所以這裡必須寫明實際結果而不是比例 /
                Under the new split nobody is paid without an administrator, so this states the
                outcome rather than the nominal share */}
            <div className="flex items-baseline justify-between gap-2 text-base">
              <span className="text-gray-400">{t('place.toAdmin')}</span>
              <span className={`font-display tabular-nums ${adminChar ? 'text-amber-300' : 'text-gray-500'}`}>
                {adminLeaderShare === null ? t('place.nobodyPaid') : `+${adminLeaderShare}`}
              </span>
            </div>
          </div>

          {/* 駐軍 / Garrison */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10">
            <span className="text-base text-gray-400">{t('place.garrison')}</span>
            <span className="font-display font-bold text-lg text-cyan-300 tabular-nums">{place.garrison}</span>
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
                    <span className="ml-auto flex items-center gap-3 text-sm font-display">
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
                  <div className="flex flex-wrap gap-x-2.5 text-xs font-display text-gray-400">
                    <span>{t('character.wu')} {char.wu}</span>
                    <span>{t('character.tong')} {char.tong}</span>
                    <span>{t('character.ti')} {char.ti}</span>
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
  );
}

/**
 * 三種建築在彈窗裡的顯示順序，以及各自的名稱 key。
 * Display order for the three buildings in the popup, and each one's label key.
 */
const BUILDING_ROWS: ReadonlyArray<{ kind: BuildingKind; labelKey: string }> = [
  { kind: 'fortress', labelKey: 'place.fortress' },
  { kind: 'market', labelKey: 'place.market' },
  { kind: 'barracks', labelKey: 'place.barracks' },
];

/**
 * 把一個效果值寫成「+20% 防禦」/「+5 金」/「+3 名」這種讀得懂的樣子。
 * Render an effect value as something readable: a percent, an amount of gold, or a headcount.
 *
 * 單位由 `buildingPerLevel()` 決定，所以這裡只負責挑前綴與後綴，數字本身不猜分。
 * The unit comes from `buildingPerLevel()`, so this only picks the affix; it never guesses.
 */
function formatEffect(value: number, unit: 'percent' | 'gold' | 'troops'): string {
  if (unit === 'percent') return `+${Math.round(value)}%`;
  if (unit === 'gold') return `+${value} ${t('character.gold')}`;
  return `+${value}`;
}

/**
 * 將領資料表的一列。
 * One row of the leader's data table.
 *
 * `value` 是 ReactNode 而不是字串，因為「位置」那一列的值是**可點的按鈕**——它點下去
 * 會把鏡頭移過去並開啟地點分頁。把它做成字串就得另外開一條路徑去處理那一列。
 *
 * `value` is a ReactNode rather than a string because the place row's value is a **clickable
 * button** — it moves the camera and opens the place tab. Making it a string would mean a
 * second code path for that one row.
 *
 * `note` 是 tooltip，只有**被規則改動過**的數值才會有：括號裡已經寫了增減量，那是結果；
 * tooltip 說的是原因。
 *
 * `note` is the tooltip, and only a value **a rule has moved** carries one: the parenthetical
 * already shows the change, which is the result; the tooltip gives the reason.
 */
interface StatRow {
  label: string;
  value: ReactNode;
  note?: string;
}

/**
 * 戰鬥力的顯示格式。
 * How a combat ability is displayed.
 *
 * **只有被關係改動時**才多印括號裡的基礎值與差額（`24 (20+4)`），沒有改動時就是
 * 乾淨的一個數字。括號是算式，所以不需要翻譯。
 *
 * The base and the difference are printed **only when relations moved the value**
 * (`24 (20+4)`); otherwise it is a clean number. The parenthetical is arithmetic, so it
 * needs no translation.
 *
 * **顯示的是「計算時真正使用的值」**，因為專案的規則是彈窗不得引用模擬沒有用到的數字
 * ——戰報裡的算式也必須用同一個數字，否則兩邊對不上。
 *
 * It shows the value the **calculation actually uses**, because the rule is that a panel
 * may not quote a number the simulation did not use — and the battle report has to use the
 * same number or the arithmetic will not add up.
 */
function abilityText(base: number, effective: number): string {
  if (effective === base) return String(base);
  const diff = effective - base;
  return `${effective} (${base}${diff > 0 ? '+' : '−'}${Math.abs(diff)})`;
}

/**
 * 縮放滑桿：0 = 最遠、1 = 最近（右＝更近），拖曳時直接 setState 不做動畫，
 * 這樣游標才跟得上。百分比**可以直接輸入**，輸入後會跳到該比例；
 * 實際比例仍由 Sigma 的相機決定 /
 * Zoom slider: 0 = furthest, 1 = closest (right = closer). Dragging sets the
 * camera state directly with no animation so the handle tracks the pointer.
 * The percentage is **directly typeable** and jumps to that zoom; Sigma still owns
 * the real ratio.
 */
function ZoomSlider({
  controls,
  label,
}: {
  controls: MapCameraControls | null;
  label: string;
}) {
  const [zoom, setZoomState] = useState(0);
  /**
   * 正在編輯的文字。`null` 表示「跟著 zoom 走」。必須是**字串**而不是數字，否則使用者
   * 打「1」準備打「15」時，值會立刻被 format 成 1%，游標就跳到第一個字後面。
   *
   * The text being edited; `null` means "follow the zoom". It has to be a **string** and
   * not a number: while typing "15", a numeric value would immediately reformat to 1% and
   * throw the caret to the end after the first keystroke.
   */
  const [draft, setDraft] = useState<string | null>(null);

  // controls 是 ref.current，會在 Sigma 建立後才填入；用 effect 訂閱並清理 /
  // controls comes from a ref and is only filled once Sigma exists — subscribe
  // in an effect and always unsubscribe
  useEffect(() => {
    if (!controls?.onZoomChange) return;
    return controls.onZoomChange(setZoomState);
  }, [controls]);

  /** 把百分比套用成縮放 / Apply a percentage as the zoom */
  const commit = (raw: string) => {
    const pct = Number(raw);
    setDraft(null);
    if (!Number.isFinite(pct)) return;
    const next = Math.max(0, Math.min(100, pct)) / 100;
    setZoomState(next);
    controls?.setZoom(next);
  };

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
          setDraft(null);
          controls?.setZoom(next);
        }}
        aria-label={label}
        title={label}
        className="w-28 h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
      />
      {/* 百分比是可輸入的，不是純顯示。Enter 立即套用、失焦也套用——只用 blur 的話按
          Enter 後文字不會生效；兩者都留著才能涵蓋「習慣按 Enter」與「習慣點別處」。
          `inputMode="numeric"` 讓手機彈數字鍵盤。
          文字框本身是 `w-14`：寬度夠放三碼數字（100），又窄到不會把右側按鈕推走。 */}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        disabled={!controls}
        value={draft ?? String(Math.round(zoom * 100))}
        aria-label={label}
        title={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        className="w-14 bg-transparent text-right text-xs text-gray-400 font-display tabular-nums border-b border-transparent hover:border-gray-700 focus:border-cyan-500 focus:outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {/* 百分比**文字**，與可輸入的數字並排——數字是本體，% 是它的單位。 */}
      <span className="text-xs text-gray-400 font-display">%</span>
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
  showTerritory = true,
  framedMapperRef,
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
  onCameraMove?: (x: number, y: number, ratio: number) => void;
  /** 是否顯示領地層 / whether the territory layer is shown */
  showTerritory?: boolean;
  /** sigma 的框化→視窗對應，轉給銀河層定位用 / Sigma's framed → viewport mapping, forwarded to the galaxy layer */
  framedMapperRef?: React.RefObject<
    ((p: { x: number; y: number }) => { x: number; y: number }) | null
  >;
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
  const cameraPosRef = useRef<{ x: number; y: number; ratio: number }>({
    x: 0.5,
    y: 0.5,
    ratio: CONFIG.MAP_ZOOM_MAX_RATIO,
  });
  const handleCameraMove = useCallback((x: number, y: number, ratio: number) => {
    cameraPosRef.current.x = x;
    cameraPosRef.current.y = y;
    cameraPosRef.current.ratio = ratio;
    onCameraMove?.(x, y, ratio);
  }, [onCameraMove]);

  return (
    // 深空底色與星雲來自 @theme static，兩個 utility 疊在一起 /
    // The deep-space base and nebula come from @theme static; two utilities
    // layered together
    <div className="w-full h-full bg-ds-space relative">
      <div className="absolute inset-0 bg-ds-space-nebula" aria-hidden="true" />
{/* DOM 順序就是繪製順序，而 sigma 的容器本身帶一層不透明底色，所以**銀河、霧氣、塵埃都必須在
          SigmaMap 之前**，否則會被完全蓋掉。SigmaMap 的外層底色也已經拿掉，改由上層的
          bg-ds-space 提供。

          三層的順序是「銀河 → 霧 → 塵埃」：
          - 銀河在最底，是深處的場（暖核、星雲、星點）。
          - 霧是**暖色星雲**，畫在銀河之上、地圖之下——它是背景，不是蓋在地圖上的霧，
            所以道路與節點永遠在它之上，不會被它蒙住。
          - 塵埃有視差（`SPACE_FLOW_PARALLAX`），浮在地圖上方。

          霧與塵埃原本的位置對調過：霧原本畫在地圖**之上**（會蒙住道路），現在移到地圖**之下**。

          Both the galaxy, the fog and the dust must come BEFORE SigmaMap: DOM order is paint
          order, and sigma's container carries its own opaque background, which would hide them
          completely. SigmaMap's own backdrop was removed too — bg-ds-space above provides it.

          The three layers run galaxy → fog → dust:
          - the galaxy is the deep field at the bottom (warm core, nebula, stars);
          - the fog is a **warm nebula** over the galaxy and *under* the map — it is a backdrop,
            not a haze over the map, so roads and nodes always sit on top of it;
          - the dust carries parallax (`SPACE_FLOW_PARALLAX`) and floats above the map.

          The fog used to sit *above* the map, which veiled the roads; it now sits *under* it. */}
      <SpaceGalaxy cameraRef={cameraPosRef} mapperRef={framedMapperRef} />
      <SpaceFog mapperRef={framedMapperRef} />
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
        showTerritory={showTerritory}
      />
    </div>
  );
}
