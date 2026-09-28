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
import { motion, AnimatePresence, useReducedMotion, useSpring } from 'motion/react';
import { Reveal, Parallax } from '@/components/home/Motion';
import { t, setLocale, getLocale, getTranslations, DEFAULT_LOCALE } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { MapCameraControls } from '@/components/SigmaMap';
import { apiFetch } from '@/lib/api';
import { signOut } from 'next-auth/react';

const SigmaMap = dynamic(
  () => import('@/components/SigmaMap').then((mod) => mod.SigmaMap),
  { ssr: false }
);

// ─── 型別 / Types ─────────────────────────────────────────────────────────────────

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
    <section className="ds-gm-strip" aria-label={t('home.stats.title')}>
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <Parallax offset={48} className="absolute -top-1/2 -left-[5%] h-[200%] w-[110%]">
          <PointerDrift depth={14} className="h-full w-full">
            <img
              src="/space/deep-field.jpg"
              width={1920}
              height={1219}
              alt=""
              className="ds-gm-strip-photo"
            />
          </PointerDrift>
        </Parallax>
      </div>
      <div className="ds-gm-strip-veil" aria-hidden="true" />

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
            className={i === 0 ? 'ds-gm-kpi ds-gm-kpi--first' : 'ds-gm-kpi'}
          >
            <div className="ds-gm-kpi-label">{item.label}</div>
            <div className="ds-gm-kpi-value">{item.value}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

export default function GamePage() {
  const [selectedRound, setSelectedRound] = useState<number>(0);
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

  const {
    data: worldState,
    isLoading,
    error,
    refetch: fetchWorldState,
  } = useQuery<WorldState>({
    queryKey: ['worldState', selectedRound],
    queryFn: async () => {
      const response = await apiFetch(`/api/world/state?round=${selectedRound}`);
      if (!response.ok) throw new Error('Failed to fetch world state');
      return response.json();
    },
    staleTime: 30 * 1000,
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
        const next = prev + 1;
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

  if (isLoading && !worldState) {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#020617] overflow-hidden">
        <div className="stars" aria-hidden="true" />
        <div className="stars2" aria-hidden="true" />
        <div className="nebula" aria-hidden="true" />

        {/* 指揮列骨架 / Command bar skeleton */}
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3 px-4 md:px-5 py-3 border-b border-white/5 bg-gray-950/70">
          <div className="flex items-center gap-3">
            <div className="ds-gm-skel w-7 h-7" />
            <div className="ds-gm-skel h-4 w-28" />
            <div className="ds-gm-skel h-6 w-24" />
          </div>
          <div className="ds-gm-skel h-4 w-36 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="ds-gm-skel h-9 w-24" />
            <div className="ds-gm-skel h-9 w-16" />
          </div>
        </div>

        {/* 觀測帶骨架 / Telemetry strip skeleton */}
        <div className="relative z-10 flex items-center gap-6 px-4 md:px-6 py-3 border-b border-cyan-400/15 overflow-x-auto ds-gm-noscroll">
          <div className="ds-gm-skel h-10 w-32 hidden sm:block" />
          <div className="ds-gm-skel h-10 w-20" />
          <div className="ds-gm-skel h-10 w-24" />
          <div className="ds-gm-skel h-10 w-24" />
          <div className="ds-gm-skel h-10 w-28" />
        </div>

        {/* 內容骨架 / Content skeleton */}
        <div className="relative z-10 flex-1 flex min-h-0">
          <div className="hidden md:block w-64 shrink-0 border-r border-white/5 ds-gm-rail p-3 space-y-3">
            <div className="ds-gm-skel h-40 w-full" />
            <div className="ds-gm-skel h-56 w-full" />
          </div>
          <div className="flex-1 relative ds-gm-rail min-h-64">
            <div className="ds-grid-bg absolute inset-0" aria-hidden="true" />
            <div className="ds-gm-hudbar">
              <div className="ds-gm-skel h-5 w-48" />
              <div className="ml-auto flex items-center gap-2">
                <div className="ds-gm-skel w-9 h-9" />
                <div className="ds-gm-skel w-9 h-9" />
                <div className="ds-gm-skel w-9 h-9" />
              </div>
            </div>
          </div>
          <div className="hidden lg:block w-80 shrink-0 border-l border-white/5 ds-gm-rail p-3 space-y-3">
            <div className="ds-gm-skel h-9 w-full" />
            <div className="ds-gm-skel h-60 w-full" />
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
        <div className="relative text-center max-w-md ds-gm-panel border-red-500/30 px-8 py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="font-orbitron text-lg font-bold text-white mb-2">{t('general.error')}</h2>
          <p className="text-gray-400 text-base mb-6">{errorMessage}</p>
          <button
            onClick={() => fetchWorldState()}
            className="ds-gm-btn ds-gm-btn-accent px-6 py-2.5 text-base font-medium"
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
    <div className="min-h-screen flex flex-col bg-[#020617]">
      {/* ── 深空背景層（影像＋星域＋視差）/ Deep-space backdrop (photo + starfield + parallax) ── */}
      <div className="ds-gm-backdrop" aria-hidden="true">
        <PointerDrift depth={20} className="absolute inset-0">
          <img
            src="/space/milky-way.jpg"
            width={1920}
            height={959}
            alt=""
            className="ds-gm-photo"
          />
        </PointerDrift>
        <div className="nebula" />
        <div className="stars" />
        <div className="stars2" />
        <div className="ds-gm-veil" />
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
          <span className="ds-gm-badge hidden sm:flex items-center gap-2 text-xs font-orbitron tracking-wider text-cyan-300/90">
            <span className="ds-gm-live" aria-hidden="true" />
            RND {String(selectedRound).padStart(4, '0')}
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
            className="ds-gm-btn md:hidden w-8 h-8"
            title="時間軸 & 排行"
            aria-label="時間軸 & 排行"
          >
            <Ic className="w-4 h-4">
              <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </Ic>
          </button>

          <NextRoundButton
            isAdmin={isAdmin}
            currentRound={selectedRound}
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
            className="ds-gm-btn ds-gm-btn-danger px-3 py-1.5 text-xs font-orbitron tracking-wider"
            title={t('general.logout')}
          >
            {t('general.logout')}
          </button>

          {/* 右側邊欄切換按鈕（手機版）/ Right sidebar toggle (mobile) */}
          <button
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            className="ds-gm-btn lg:hidden w-8 h-8"
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
        round={selectedRound}
        worldName={worldState?.world.name ?? ''}
        aliveFactions={aliveFactions}
        territories={territories}
        aliveCharacters={aliveCharacterList.length}
        totalTroops={totalTroops}
      />

      {/* ── 主要內容 / Main Content ────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex min-h-0">
        {/* ── 左側邊欄（桌面版）/ Left Sidebar (desktop) ──────────────────────── */}
        <aside className="hidden md:block w-64 shrink-0 border-r border-white/5 ds-gm-rail ds-gm-scroll p-3 space-y-3 overflow-y-auto">
          <Reveal delay={0.06} y={18}>
            <RoundTimeline
              currentRound={selectedRound}
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
                className="relative w-72 ds-gm-rail border-r border-cyan-400/15 p-3 space-y-3 overflow-y-auto ds-gm-scroll"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              >
              <div className="flex items-center justify-between mb-2">
                <span className="font-orbitron text-xs text-gray-400 tracking-wider">控制面板</span>
                <button
                  onClick={() => setLeftSidebarOpen(false)}
                  className="ds-gm-btn w-7 h-7"
                  aria-label="關閉"
                >
                  <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
                </button>
              </div>
              <RoundTimeline
                currentRound={selectedRound}
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
          <div className="ds-gm-frame" aria-hidden="true">
            <span className="ds-gm-corner ds-gm-corner--tl" />
            <span className="ds-gm-corner ds-gm-corner--tr" />
            <span className="ds-gm-corner ds-gm-corner--bl" />
            <span className="ds-gm-corner ds-gm-corner--br" />
          </div>
          <div className="ds-gm-vignette" aria-hidden="true" />

          {/* 統一 HUD 列：圖例（左）＋相機控制（右）/ Unified HUD bar: legend (left) + camera controls (right) */}
          <div className="ds-gm-hudbar">
            <div className="ds-gm-legend" aria-label={t('map.faction')}>
              {(worldState?.factions ?? []).filter((f) => f.alive).slice(0, 5).map((f) => (
                <span key={f.id} className="ds-gm-legend-item">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="text-sm text-gray-300 whitespace-nowrap">{f.name}</span>
                </span>
              ))}
              <span className="ds-gm-legend-item">
                <span className="w-3 h-3 rounded-full bg-gray-500 shrink-0" />
                <span className="text-sm text-gray-400 whitespace-nowrap">{t('place.unowned')}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => mapControlsRef.current?.resetView()}
                title="重設視圖 / Reset view"
                aria-label="重設視圖 / Reset view"
                className="ds-gm-btn w-9 h-9"
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
                className="ds-gm-btn w-9 h-9"
              >
                <Ic className="w-4 h-4"><path d="M12 6v12M6 12h12" /></Ic>
              </button>
              <button
                onClick={() => mapControlsRef.current?.zoomOut()}
                title="縮小 / Zoom out"
                aria-label="縮小 / Zoom out"
                className="ds-gm-btn w-9 h-9"
              >
                <Ic className="w-4 h-4"><path d="M6 12h12" /></Ic>
              </button>
            </div>
          </div>
        </main>

        {/* ── 右側邊欄（桌面版）/ Right Sidebar (desktop) ──────────────────────── */}
        <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l border-white/5 ds-gm-rail overflow-hidden">
          <RightSidebarTabs
            activeTab={rightTab}
            onTabChange={setRightTab}
          />
          <div className="flex-1 overflow-y-auto ds-gm-scroll p-3">
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
              />
            )}
          </div>
        </aside>

        {/* ── 右側邊欄（手機版覆蓋）/ Right Sidebar (mobile overlay) ──────────── */}
        {rightSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRightSidebarOpen(false)} />
            <div className="relative w-80 ds-gm-rail border-l border-cyan-400/15 flex flex-col overflow-hidden animate-slide-in-right">
              <div className="flex items-center justify-between px-3 pt-3 pb-0">
                <span className="font-orbitron text-xs text-gray-400 tracking-wider">資訊面板</span>
                <button
                  onClick={() => setRightSidebarOpen(false)}
                  className="ds-gm-btn w-7 h-7"
                  aria-label="關閉"
                >
                  <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
                </button>
              </div>
              <RightSidebarTabs
                activeTab={rightTab}
                onTabChange={setRightTab}
              />
              <div className="flex-1 overflow-y-auto ds-gm-scroll p-3">
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
      className="ds-gm-btn px-3 py-1.5 text-xs font-orbitron tracking-wider text-cyan-300/90"
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
        className={`ds-gm-btn px-3 py-1.5 text-xs font-orbitron tracking-wider ${!isAdmin
          ? 'cursor-not-allowed'
          : loading
            ? 'ds-gm-btn-accent cursor-not-allowed'
            : 'ds-gm-btn-accent'
          }`}
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
    <div className="ds-gm-panel p-3">
      <h3 className="ds-gm-title mb-3">
        {t('game.selectRound')}
      </h3>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onPlayToggle}
          className="ds-gm-btn ds-gm-btn-accent px-3 py-1.5 text-sm font-medium"
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
            className="ds-gm-btn w-full mt-1 py-1.5 text-xs font-orbitron tracking-wider"
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
  onCloseRef.current = onClose;
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
        className="w-full max-w-3xl max-h-[80vh] overflow-hidden ds-gm-modal shadow-2xl flex flex-col"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="ds-gm-title text-gray-200">
            {title}
          </h3>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="ds-gm-btn w-7 h-7"
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
    <div className="ds-gm-panel p-3">
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        title={t('general.details')}
        className="ds-gm-title mb-3 w-full flex items-center justify-between group hover:text-cyan-300 transition-colors duration-150"
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
    <div className="ds-gm-panel p-3">
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        title={t('general.details')}
        className="ds-gm-title mb-3 w-full flex items-center justify-between group hover:text-cyan-300 transition-colors duration-150"
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
            className="ds-gm-btn w-full py-2 text-xs font-orbitron tracking-wider"
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
            className="ds-gm-btn w-full mt-3 py-2 text-xs font-orbitron tracking-wider"
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
        return t('events.adminAssignedDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      case 'ADMIN_REMOVED':
        return t('events.adminRemovedDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string)
          .replace('{newAdmin}', (p.newAdminName as string) ?? '?');
      case 'PLACE_CAPTURED':
        return t('events.placeCaptureDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      default:
        return event.type;
    }
  }

  return (
    <div className="ds-gm-panel p-3">
      <h3 className="ds-gm-title mb-3 flex items-center justify-between">
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
            className="ds-gm-btn w-full mt-2 py-2 text-xs font-orbitron tracking-wider"
          >
            載入更多（{events.length - visibleCount}）
          </button>
        )}
      </div>
    </div>
  );
}

function StatsCharts({
  worldId,
  currentRound,
}: {
  worldId: string;
  currentRound: number;
}) {
  const [chartData, setChartData] = useState<{
    factions: Array<{
      id: string;
      name: string;
      color: string;
      troops: number[];
      gold: number[];
      territories: number[];
    }>;
    rounds: number[];
  } | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (currentRound < 1) return;
    let cancelled = false;
    async function fetchStats() {
      setFetchFailed(false);
      try {
        const res = await apiFetch(`/api/world/stats?from=0&to=${currentRound}`);
        if (res.ok) {
          const data = await res.json();
          setChartData(data);
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

  if (currentRound < 1 || !chartData || chartData.factions.length === 0) {
    return (
      <div className="ds-gm-panel p-3">
        <h3 className="ds-gm-title mb-3">
          {t('stats.title')}
        </h3>
        <p className="text-gray-400 text-xs" role={fetchFailed ? 'alert' : undefined}>
          {fetchFailed ? t('general.error') : t('game.noData')}
        </p>
      </div>
    );
  }

  const { factions, rounds } = chartData;
  const width = 280;
  const height = 120;
  const padding = 30;

  function renderLineChart(
    data: number[][],
    colors: string[],
    labels: string[],
    title: string
  ) {
    const allValues = data.flat();
    const maxVal = Math.max(...allValues, 1);
    const minVal = 0;
    const xScale = (i: number) =>
      padding + (i / Math.max(rounds.length - 1, 1)) * (width - 2 * padding);
    const yScale = (v: number) =>
      height - padding - ((v - minVal) / (maxVal - minVal)) * (height - 2 * padding);

    return (
      <div className="mb-3">
        <div className="text-xs text-gray-400 font-orbitron tracking-wider mb-1.5 uppercase">{title}</div>
        <svg width={width} height={height} className="w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1={padding}
              y1={height - padding - pct * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - pct * (height - 2 * padding)}
              stroke="#1e293b"
              strokeWidth={0.5}
            />
          ))}
          {data.map((series, si) => (
            <polyline
              key={si}
              points={series.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
              fill="none"
              stroke={colors[si]}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
          {labels.map((label, i) => (
            <g key={i}>
              <rect x={padding + i * 70} y={4} width={8} height={8} fill={colors[i]} rx={1} />
              <text x={padding + i * 70 + 12} y={12} fill="#94a3b8" fontSize={8} fontFamily="monospace">
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  const troopData = factions.map((f) => f.troops);
  const goldData = factions.map((f) => f.gold);
  const territoryData = factions.map((f) => f.territories);
  const factionColors = factions.map((f) => f.color);
  const factionNames = factions.map((f) => f.name);

  return (
    <div className="ds-gm-panel p-3">
      <h3 className="ds-gm-title mb-3">
        {t('stats.title')}
      </h3>
      {renderLineChart(troopData, factionColors, factionNames, t('stats.troopsOverTime'))}
      {renderLineChart(goldData, factionColors, factionNames, t('stats.goldOverTime'))}
      {renderLineChart(territoryData, factionColors, factionNames, t('stats.territoriesOverTime'))}
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
        className="relative max-w-md w-full mx-4 ds-gm-modal overflow-hidden shadow-2xl shadow-black/60"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 影像標頭 / Imagery header */}
        <div className="relative h-24 overflow-hidden">
          <img
            src="/space/cosmic-cliffs.jpg"
            width={1920}
            height={1111}
            alt=""
            loading="lazy"
            className="ds-gm-modal-photo"
          />
          <div className="ds-gm-modal-veil" aria-hidden="true" />

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
              className="ds-gm-btn w-8 h-8 shrink-0"
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
              <div className="ds-gm-title text-xs mb-1.5 flex items-center gap-2">
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
            <div className="ds-gm-title text-xs mb-1.5">
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
    <div className="ds-gm-stat">
      <div className="ds-gm-stat-value">{value}</div>
      <div className="ds-gm-stat-label">{label}</div>
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
