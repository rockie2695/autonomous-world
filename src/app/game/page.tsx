// ============================================================================
// 遊戲頁面 — 主要遊戲介面 / Game Page — Main Game Interface
// ============================================================================
// 深空科幻主題 / Deep Space Sci-Fi Theme
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
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
    ambition: number;
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

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

export default function GamePage() {
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [selectedPlace, setSelectedPlace] = useState<WorldState['places'][0] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
        if (next > (worldState?.world.currentRound ?? 0)) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, playSpeed);
    return () => clearInterval(timer);
  }, [isPlaying, playSpeed, worldState?.world.currentRound]);

  // ── 載入狀態 / Loading State ──────────────────────────────────────────────

  if (isLoading && !worldState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          {/* 使用 locale（useSyncExternalStore）而非 t()，確保 SSR 與 hydration 文字一致
              Use locale (useSyncExternalStore) instead of t() so SSR and hydration text match */}
          <p className="font-orbitron text-base text-cyan-400/70 tracking-wider">{getTranslations(locale).general.loading}</p>
        </div>
      </div>
    );
  }

  // ── 錯誤狀態 / Error State ─────────────────────────────────────────────────

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="text-center max-w-md p-8 rounded-xl border border-red-500/20 bg-gray-900/60 backdrop-blur-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="font-orbitron text-lg font-bold text-white mb-2">{t('general.error')}</h2>
          <p className="text-gray-400 text-base mb-6">{errorMessage}</p>
          <button
            onClick={() => fetchWorldState()}
            className="px-6 py-2.5 rounded-lg font-medium text-base text-cyan-300 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/15 hover:border-cyan-400/50 transition-all duration-300"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  // ── 主要渲染 / Main Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      {/* ── 標頭 / Header ──────────────────────────────────────────────────────── */}
      <header className="relative flex items-center justify-between px-5 py-3 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-md">
        {/* 頂部發光線 / Top glow line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 blur-sm opacity-50" />
            <div className="relative w-full h-full rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
              </svg>
            </div>
          </div>
          <span className="font-orbitron font-bold text-sm tracking-wider text-white">
            {t('general.title')}
          </span>
          <span className="text-cyan-400/60 text-xs font-orbitron tracking-wider">
            RND {String(selectedRound).padStart(4, '0')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 左側邊欄切換按鈕（手機版）/ Left sidebar toggle (mobile) */}
          <button
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className="md:hidden w-8 h-8 rounded-lg border border-gray-700/60 bg-gray-900/50 text-gray-400 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all duration-200"
            title="時間軸 & 排行"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          <span className="text-gray-400 text-xs font-orbitron tracking-wider hidden sm:block">
            {worldState?.world.name ?? '—'}
          </span>
          <NextRoundButton
            isAdmin={isAdmin}
            currentRound={selectedRound}
            onSuccess={(round) => setSelectedRound(round)}
          />
          <LanguageSwitch locale={locale} onToggle={handleLocaleToggle} />

          {/* 登出按鈕 / Logout button */}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="px-3 py-1.5 rounded-md text-xs font-orbitron tracking-wider text-red-400/70 border border-gray-700/60 bg-gray-900/50 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 transition-all duration-200"
            title={t('general.logout')}
          >
            {t('general.logout')}
          </button>

          {/* 右側邊欄切換按鈕（手機版）/ Right sidebar toggle (mobile) */}
          <button
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            className="lg:hidden w-8 h-8 rounded-lg border border-gray-700/60 bg-gray-900/50 text-gray-400 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all duration-200"
            title="將領 & 事件"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── 主要內容 / Main Content ────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 relative">
        {/* ── 左側邊欄（桌面版）/ Left Sidebar (desktop) ──────────────────────── */}
        <aside className="hidden md:block w-64 border-r border-gray-800/60 bg-gray-950/50 p-3 space-y-3 overflow-y-auto shrink-0">
          <RoundTimeline
            currentRound={selectedRound}
            maxRound={worldState?.world.currentRound ?? 0}
            isPlaying={isPlaying}
            playSpeed={playSpeed}
            onSelect={handleRoundSelect}
            onPlayToggle={() => setIsPlaying(!isPlaying)}
            onSpeedChange={setPlaySpeed}
          />
          <FactionRanking
            factions={worldState?.factions ?? []}
            characters={worldState?.characters ?? []}
            places={worldState?.places ?? []}
          />
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
                className="relative w-72 bg-gray-950 border-r border-gray-800/60 p-3 space-y-3 overflow-y-auto"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              >
              <div className="flex items-center justify-between mb-2">
                <span className="font-orbitron text-xs text-gray-400 tracking-wider">控制面板</span>
                <button onClick={() => setLeftSidebarOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <RoundTimeline
                currentRound={selectedRound}
                maxRound={worldState?.world.currentRound ?? 0}
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

        {/* ── 中央（圖形）/ Center (Graph) ───────────────────────────────────── */}
        <main className="flex-1 relative min-w-0">
          <div className="absolute inset-0">
            <GameGraph
              places={worldState?.places ?? []}
              factions={worldState?.factions ?? []}
              roads={worldState?.roads ?? []}
              characters={worldState?.characters ?? []}
              onPlaceClick={(place) => setSelectedPlace(place)}
              selectedPlaceId={selectedPlace?.id}
              onControlsReady={(controls) => { mapControlsRef.current = controls; }}
            />
          </div>

          {/* 浮動控制項 / Floating controls */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button
              onClick={() => mapControlsRef.current?.resetView()}
              title="重設視圖 / Reset view"
              aria-label="重設視圖 / Reset view"
              className="w-9 h-9 rounded-lg border border-gray-700/60 bg-gray-900/80 backdrop-blur-sm text-gray-400 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all duration-200 text-sm"
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
              className="w-9 h-9 rounded-lg border border-gray-700/60 bg-gray-900/80 backdrop-blur-sm text-gray-400 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all duration-200 text-sm"
            >
              +
            </button>
            <button
              onClick={() => mapControlsRef.current?.zoomOut()}
              title="縮小 / Zoom out"
              aria-label="縮小 / Zoom out"
              className="w-9 h-9 rounded-lg border border-gray-700/60 bg-gray-900/80 backdrop-blur-sm text-gray-400 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all duration-200 text-sm"
            >
              −
            </button>
          </div>
        </main>

        {/* ── 右側邊欄（桌面版）/ Right Sidebar (desktop) ──────────────────────── */}
        <aside className="hidden lg:flex flex-col w-80 border-l border-gray-800/60 bg-gray-950/50 shrink-0 overflow-hidden">
          <RightSidebarTabs
            activeTab={rightTab}
            onTabChange={setRightTab}
          />
          <div className="flex-1 overflow-y-auto p-3">
            {rightTab === 'characters' && (
              <CharacterList
                characters={worldState?.characters ?? []}
                places={worldState?.places ?? []}
              />
            )}
            {rightTab === 'events' && (
              <EventLog
                round={selectedRound}
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
            <div className="relative w-80 bg-gray-950 border-l border-gray-800/60 flex flex-col overflow-hidden animate-slide-in-right">
              <div className="flex items-center justify-between px-3 pt-3 pb-0">
                <span className="font-orbitron text-xs text-gray-400 tracking-wider">資訊面板</span>
                <button onClick={() => setRightSidebarOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <RightSidebarTabs
                activeTab={rightTab}
                onTabChange={setRightTab}
              />
              <div className="flex-1 overflow-y-auto p-3">
                {rightTab === 'characters' && (
                  <CharacterList
                    characters={worldState?.characters ?? []}
                    places={worldState?.places ?? []}
                  />
                )}
                {rightTab === 'events' && (
                  <EventLog
                    round={selectedRound}
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
      className="px-3 py-1.5 rounded-md text-xs font-orbitron tracking-wider text-cyan-400/70 border border-gray-700/60 bg-gray-900/50 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-300 transition-all duration-200"
      title={t('general.language')}
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
    { key: 'characters' as const, label: t('faction.tab'), icon: '👤' },
    { key: 'events' as const, label: t('events.tab'), icon: '📜' },
    { key: 'stats' as const, label: t('stats.tab'), icon: '📊' },
  ];

  return (
    <div className="flex border-b border-gray-800/60">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-orbitron tracking-wider transition-all duration-200 border-b-2 ${activeTab === tab.key
            ? 'text-cyan-400 border-cyan-400 bg-cyan-500/5'
            : 'text-gray-400 border-transparent hover:text-gray-300 hover:bg-gray-800/30'
            }`}
        >
          <span>{tab.icon}</span>
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
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!isAdmin || loading) return;
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
      setLoading(false);
    }
  };
  
  return (
    <div className="relative">
      <button
        onClick={handleRun}
        disabled={!isAdmin || loading}
        className={`px-3 py-1.5 rounded-md text-xs font-orbitron tracking-wider transition-all duration-200 ${isAdmin
          ? 'text-cyan-300 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/15 hover:border-cyan-400/50'
          : 'text-gray-600 border border-gray-800 bg-gray-900/50 cursor-not-allowed'
          }`}
        title={isAdmin ? t('admin.runRound') : t('game.adminOnly')}
      >
        {loading ? '⏳' : '▶'} {t('game.nextRound')}
      </button>
      {error && (
        <div className="absolute top-full mt-1 right-0 text-xs text-red-400 whitespace-nowrap bg-gray-900/90 px-2 py-1 rounded border border-red-500/20">
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
  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 backdrop-blur-sm p-3">
      <h3 className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 mb-3 uppercase">
        {t('game.selectRound')}
      </h3>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onPlayToggle}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-cyan-300 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/15 transition-all duration-200"
        >
          {isPlaying ? `⏸ ${t('game.pause')}` : `▶ ${t('game.play')}`}
        </button>
        <input
          type="range"
          min={500}
          max={3000}
          step={500}
          value={playSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="flex-1 h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
        />
        <span className="text-xs text-gray-600 font-orbitron">{playSpeed}ms</span>
      </div>
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {Array.from({ length: Math.min(maxRound + 1, 20) }, (_, i) => maxRound - i).map(
          (round) => (
            <button
              key={round}
              onClick={() => onSelect(round)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all duration-200 ${round === currentRound
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
            >
              <span className="font-orbitron tracking-wider">{t('game.round')} {String(round).padStart(4, '0')}</span>
            </button>
          )
        )}
      </div>
    </div>
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
  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 backdrop-blur-sm p-3">
      <h3 className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 mb-3 uppercase">
        {t('ranking.title')}
      </h3>
      <div className="space-y-1.5">
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
              <div key={faction.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-800/30 transition-colors duration-150">
                <span className="font-orbitron text-xs text-gray-600 w-4">{idx + 1}</span>
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="flex-1 text-sm text-gray-300 truncate">{faction.name}</span>
                <span className="text-xs text-gray-600 font-orbitron">{factionPlaces.length}{t('ranking.territories')}</span>
                <span className="text-xs text-gray-600 font-orbitron">{totalTroops}{t('ranking.troops')}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function CharacterList({
  characters,
  places,
}: {
  characters: WorldState['characters'];
  places: WorldState['places'];
}) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const placeMap = new Map<string, string>();
  for (const place of places) {
    placeMap.set(place.id, place.name);
  }

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 backdrop-blur-sm p-3">
      <h3 className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 mb-3 uppercase">
        {t('faction.characters')}
      </h3>
      <div className="space-y-0.5 max-h-60 overflow-y-auto">
        {characters
          .filter((c) => c.alive)
          .sort((a, b) => b.troops - a.troops)
          .map((char) => (
            <button
              key={char.id}
              onClick={() => setSelectedChar(selectedChar === char.id ? null : char.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all duration-150 ${selectedChar === char.id
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{char.name}</span>
                {char.isKing && <span className="text-amber-400 text-xs">👑</span>}
                <span className="ml-auto text-xs text-gray-600 font-orbitron">⚔{char.troops}</span>
              </div>
              {selectedChar === char.id && (
                <div className="mt-1.5 pl-3 text-xs text-gray-400 space-y-0.5 border-l border-gray-800">
                  <div>{t('character.wu')}: {char.wu} · {t('character.tong')}: {char.tong} · {t('character.jing')}: {char.jing}</div>
                  <div>{t('character.speed')}: {char.speed} · {t('character.ambition')}: {char.ambition}</div>
                  <div>{t('character.troops')}: {char.troops} · 💰 {char.gold}</div>
                  <div>{t('character.place')}: {placeMap.get(char.placeId) ?? '—'}</div>
                </div>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

function EventLog({
  round,
  worldId,
}: {
  round: number;
  worldId: string;
}) {
  const { data, isLoading } = useQuery<{ events: GameEvent[] }>({
    queryKey: ['events', round],
    queryFn: async () => {
      const res = await apiFetch(`/api/world/events?round=${round}`);
      if (!res.ok) return { events: [] };
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const events = data?.events ?? [];

  const eventIcons: Record<string, string> = {
    PLACE_CREATED: '🏘️',
    CHARACTER_SPAWNED: '👤',
    DEATH: '☠️',
    BATTLE_DEATH: '💀',
    ESCAPE_SUCCESS: '🏃',
    DEFECTION: '🏴',
    FACTION_COLLAPSE: '🏚️',
    FACTION_ELIMINATED: '❌',
    BUILDING_UPGRADE: '🏗️',
    ADMIN_ASSIGNED: '👤',
  };

  function formatEvent(event: GameEvent): string {
    const p = event.data;
    switch (event.type) {
      case 'PLACE_CREATED':
        return t('events.newPlaceDesc').replace('{place}', p.placeName as string);
      case 'CHARACTER_SPAWNED':
        return t('events.spawnDesc').replace('{character}', p.charName as string);
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
      default:
        return event.type;
    }
  }

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 backdrop-blur-sm p-3">
      <h3 className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 mb-3 uppercase">
        {t('events.title')}
      </h3>
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {isLoading && (
          <p className="text-gray-600 text-xs">{t('general.loading')}</p>
        )}
        {!isLoading && events.length === 0 && (
          <p className="text-gray-600 text-xs">{t('game.noData')}</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-800/20 transition-colors duration-150">
            <span className="text-sm shrink-0 mt-0.5">{eventIcons[event.type] ?? '📌'}</span>
            <span className="text-sm text-gray-400 leading-relaxed">{formatEvent(event)}</span>
          </div>
        ))}
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

  useEffect(() => {
    if (currentRound < 1) return;
    async function fetchStats() {
      try {
        const res = await apiFetch(`/api/world/stats?from=0&to=${currentRound}`);
        if (res.ok) {
          const data = await res.json();
          setChartData(data);
        }
      } catch {
        // 靜默失敗
      }
    }
    fetchStats();
  }, [currentRound, worldId]);

  if (currentRound < 1 || !chartData || chartData.factions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 backdrop-blur-sm p-3">
        <h3 className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 mb-3 uppercase">
          {t('stats.title')}
        </h3>
        <p className="text-gray-600 text-xs">{t('game.noData')}</p>
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
              <text x={padding + i * 70 + 12} y={12} fill="#4b5563" fontSize={8} fontFamily="monospace">
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
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 backdrop-blur-sm p-3">
      <h3 className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 mb-3 uppercase">
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

  const linkedPlaceNames = roads
    .filter((road) => road.aId === place.id || road.bId === place.id)
    .map((road) => (road.aId === place.id ? road.bId : road.aId))
    .map((id) => places.find((p) => p.id === id)?.name ?? null)
    .filter((name): name is string => name !== null);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="relative max-w-md w-full mx-4 rounded-xl border border-gray-700/60 bg-gray-900/95 backdrop-blur-md shadow-2xl shadow-black/50"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 頂部發光線 / Top glow line */}
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

        {/* 標頭 / Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800/60">
          <div>
            <h3 className="font-orbitron font-bold text-lg text-white tracking-wide">{place.name}</h3>
            {faction && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: faction.color }} />
                <span className="text-base text-gray-400">{faction.name}</span>
              </div>
            )}
            {!faction && (
              <span className="text-sm text-gray-600">{t('place.unowned')}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-gray-700/60 bg-gray-800/50 text-gray-400 hover:text-white hover:border-gray-600 flex items-center justify-center transition-all duration-200"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 相連地點 / Linked Places */}
          {linkedPlaceNames.length > 0 && (
            <div>
              <div className="text-sm text-gray-600 font-orbitron tracking-wider uppercase mb-1.5">
                🛣️ {t('map.linkedPlaces')}
              </div>
              <div className="flex flex-wrap gap-1">
                {linkedPlaceNames.map((name) => (
                  <span key={name} className="text-sm bg-gray-800/60 border border-gray-700/40 rounded px-2 py-0.5 text-gray-400">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 建築資訊 / Building Info */}
          <div className="grid grid-cols-3 gap-2">
            <BuildingStat icon="🏰" label={t('place.fortress')} value={place.fortress} />
            <BuildingStat icon="🏪" label={t('place.market')} value={place.market} />
            <BuildingStat icon="🏯" label={t('place.barracks')} value={place.barracks} />
          </div>

          {/* 駐軍 / Garrison */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/30 border border-gray-800/40">
            <span className="text-base text-gray-400">{t('place.garrison')}</span>
            <span className="font-orbitron font-bold text-lg text-cyan-400">⚔ {place.garrison}</span>
          </div>

          {/* 駐紮將領 / Stationed Characters */}
          <div>
            <div className="text-sm text-gray-600 font-orbitron tracking-wider uppercase mb-1.5">
              {t('place.characters')}
            </div>
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {placeChars.length === 0 && (
                <p className="text-gray-700 text-sm">—</p>
              )}
              {placeChars.map((char) => (
                <div key={char.id} className="flex items-center gap-2 px-2 py-1 rounded-md text-base text-gray-400">
                  <span className="font-medium text-gray-300">{char.name}</span>
                  {char.isKing && <span className="text-amber-400 text-sm">👑</span>}
                  <span className="ml-auto text-sm font-orbitron text-gray-600">⚔{char.troops}</span>
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
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <div className="text-center p-2 rounded-lg bg-gray-800/30 border border-gray-800/40">
      <div className="text-base mb-0.5">{icon}</div>
      <div className="font-orbitron font-bold text-lg text-white">{value}</div>
      <div className="text-sm text-gray-600 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function GameGraph({
  places,
  factions,
  roads,
  characters,
  onPlaceClick,
  selectedPlaceId,
  onControlsReady,
}: {
  places: WorldState['places'];
  factions: WorldState['factions'];
  roads: WorldState['roads'];
  characters: WorldState['characters'];
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
        onPlaceClick={onPlaceClick}
        selectedPlaceId={selectedPlaceId}
        onControlsReady={onControlsReady}
      />
      {/* 圖例 / Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm border border-gray-800/60 rounded-lg p-3.5 text-base space-y-1">
        <div className="font-orbitron text-sm font-semibold tracking-wider text-gray-400 uppercase mb-2">
          {t('map.faction')}
        </div>
        {factions.filter(f => f.alive).slice(0, 5).map(f => (
          <div key={f.id} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
            <span className="text-sm text-gray-400">{f.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-600" />
          <span className="text-sm text-gray-400">{t('place.unowned')}</span>
        </div>
      </div>
    </div>
  );
}
