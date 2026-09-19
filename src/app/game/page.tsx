// ============================================================================
// 遊戲頁面 — 主要遊戲介面 / Game Page — Main Game Interface
// ============================================================================
// 主要遊戲視圖，包含：
// The primary game view with:
// - Sigma.js 圖形地圖（互動式）/ Sigma.js graph map (interactive)
// - 回合時間軸和自動播放 / Round timeline with auto-play
// - 勢力排行側邊欄 / Faction ranking sidebar
// - 將領列表 / Character list
// - 事件日誌 / Event log
// - 統計圖表 / Statistics charts
// - 語言切換 / Language switch
// - 下一回合按鈕（管理員）/ Next round button (admin only)
//
// 這是客戶端元件，因為需要互動性。 / This is a client component because it requires interactivity.
// 資料在伺服器端取得並作為 props 傳遞。 / Data is fetched on the server and passed as props.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { t, setLocale, getLocale } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

// 動態載入 Sigma 地圖（需要 WebGL，僅客戶端）
// Dynamic import Sigma map (requires WebGL, client-only)
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
  payload: Record<string, unknown>;
  round: number;
}

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

/**
 * 遊戲頁面元件。 / Game page component.
 * 取得世界狀態並渲染所有遊戲 UI 元件。 / Fetches world state and renders all game UI components.
 */
export default function GamePage() {
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [locale, setLocaleState] = useState<Locale>('zh');
  const [selectedPlace, setSelectedPlace] = useState<WorldState['places'][0] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 初始化語言 / Initialize locale
  useEffect(() => {
    setLocaleState(getLocale());
  }, []);

  // 語言切換 / Language toggle
  const handleLocaleToggle = useCallback(() => {
    const newLocale: Locale = locale === 'zh' ? 'en' : 'zh';
    setLocale(newLocale);
    setLocaleState(newLocale);
  }, [locale]);

  // ── 資料取得 — 使用 TanStack Query / Data Fetching — Using TanStack Query ──

  /**
   * 取得選定回合的世界狀態。 / Fetch world state for the selected round.
   * 使用 TanStack Query 自動管理載入狀態、錯誤和快取。
   * Uses TanStack Query to automatically manage loading state, errors, and caching.
   */
  const {
    data: worldState,
    isLoading,
    error,
    refetch: fetchWorldState,
  } = useQuery<WorldState>({
    queryKey: ['worldState', selectedRound],
    queryFn: async () => {
      const response = await fetch(`/api/world/state?round=${selectedRound}`);
      if (!response.ok) {
        throw new Error('Failed to fetch world state');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 秒內認為資料是新鮮的 / Data is fresh for 30 seconds
  });

  // 將 error 轉換為字串格式 / Convert error to string format
  const errorMessage = error instanceof Error ? error.message : null;

  // ── 檢查管理員 / Check Admin ─────────────────────────────────────────────

  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch('/api/auth/session');
        const session = await res.json();
        // 簡易管理員檢查 — 實際應由後端 session 回傳 isAdmin 欄位
        // Simple admin check — ideally backend session returns isAdmin field
        setIsAdmin(false); // 預設非管理員 / Default non-admin
      } catch {
        setIsAdmin(false);
      }
    }
    checkAdmin();
  }, []);

  // ── 事件處理器 / Event Handlers ─────────────────────────────────────────────

  /**
   * 處理時間軸的回合選擇。 / Handle round selection from timeline.
   */
  const handleRoundSelect = (round: number) => {
    setSelectedRound(round);
  };

  /**
   * 處理自動播放切換。 / Handle auto-play toggle.
   */
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1000); // 每回合毫秒數 / ms per round

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

  // ── 渲染 / Render ─────────────────────────────────────────────────────────

  if (isLoading && !worldState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse-subtle text-2xl mb-2">⏳</div>
          <p className="text-gray-400">{t('general.loading')}</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center max-w-md">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold mb-2">{t('general.error')}</h2>
          <p className="text-gray-400 mb-4">{errorMessage}</p>
          <button
            onClick={() => fetchWorldState()}
            className="btn btn-secondary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── 標頭 / Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-400 to-blue-500" />
          <span className="font-bold">{t('general.title')}</span>
          <span className="text-gray-500 text-sm">
            {t('game.round')} {selectedRound}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">
            {worldState?.world.name ?? '—'}
          </span>
          <NextRoundButton
            isAdmin={isAdmin}
            currentRound={selectedRound}
            onSuccess={() => fetchWorldState()}
          />
          <LanguageSwitch locale={locale} onToggle={handleLocaleToggle} />
        </div>
      </header>

      {/* ── 主要內容 / Main Content ────────────────────────────────────────── */}
      <div className="flex-1 flex">
        {/* ── 左側邊欄 / Left Sidebar ────────────────────────────────────────────── */}
        <aside className="w-64 border-r border-gray-800 p-4 space-y-4 overflow-y-auto">
          {/* 回合時間軸 / Round Timeline */}
          <RoundTimeline
            currentRound={selectedRound}
            maxRound={worldState?.world.currentRound ?? 0}
            isPlaying={isPlaying}
            playSpeed={playSpeed}
            onSelect={handleRoundSelect}
            onPlayToggle={() => setIsPlaying(!isPlaying)}
            onSpeedChange={setPlaySpeed}
          />

          {/* 勢力排行 / Faction Ranking */}
          <FactionRanking
            factions={worldState?.factions ?? []}
            characters={worldState?.characters ?? []}
            places={worldState?.places ?? []}
          />
        </aside>

        {/* ── 中央（圖形）/ Center (Graph) ───────────────────────────────────── */}
        <main className="flex-1 relative">
          {/* 圖形容器 / Graph container */}
          <div className="absolute inset-0">
            <GameGraph
              places={worldState?.places ?? []}
              factions={worldState?.factions ?? []}
              roads={worldState?.roads ?? []}
              characters={worldState?.characters ?? []}
              onPlaceClick={(place) => setSelectedPlace(place)}
            />
          </div>

          {/* 浮動控制項 / Floating controls */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button className="btn btn-secondary btn-sm">+</button>
            <button className="btn btn-secondary btn-sm">−</button>
          </div>
        </main>

        {/* ── 右側邊欄 / Right Sidebar ────────────────────────────────────────────── */}
        <aside className="w-80 border-l border-gray-800 p-4 space-y-4 overflow-y-auto">
          {/* 將領列表 / Character List */}
          <CharacterList
            characters={worldState?.characters ?? []}
            places={worldState?.places ?? []}
          />

          {/* 事件日誌 / Event Log */}
          <EventLog
            round={selectedRound}
            worldId={worldState?.world.id ?? ''}
          />

          {/* 統計圖表 / Stats Charts */}
          <StatsCharts
            worldId={worldState?.world.id ?? ''}
            currentRound={worldState?.world.currentRound ?? 0}
          />
        </aside>
      </div>

      {/* ── 地方詳情彈窗 / Place Detail Panel ───────────────────────────────── */}
      {selectedPlace && (
        <PlaceDetail
          place={selectedPlace}
          factions={worldState?.factions ?? []}
          characters={worldState?.characters ?? []}
          onClose={() => setSelectedPlace(null)}
        />
      )}
    </div>
  );
}

// ─── 子元件 / Sub-Components ────────────────────────────────────────────────────

/**
 * 語言切換按鈕。 / Language switch button.
 * 在中文和英文之間切換。 / Toggles between Chinese and English.
 */
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
      className="btn btn-secondary btn-sm text-xs"
      title={t('general.language')}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}

/**
 * 下一回合按鈕 — 僅管理員可點。 / Next Round Button — Admin only.
 * 非管理員時按鈕灰掉。 / Greyed out for non-admin.
 */
function NextRoundButton({
  isAdmin,
  currentRound,
  onSuccess,
}: {
  isAdmin: boolean;
  currentRound: number;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!isAdmin || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/run-round', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed');
        return;
      }

      onSuccess();
    } catch (err) {
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
        className={`btn btn-sm text-xs ${
          isAdmin
            ? 'btn-primary'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
        title={isAdmin ? t('admin.runRound') : t('game.adminOnly')}
      >
        {loading ? '⏳' : '▶'} {t('game.nextRound')}
      </button>
      {error && (
        <div className="absolute top-full mt-1 right-0 text-xs text-red-400 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * 回合時間軸 — 顯示回合並控制自動播放。 / Round Timeline — Shows rounds and controls auto-play.
 */
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
    <div className="card">
      <h3 className="font-semibold mb-3">{t('game.selectRound')}</h3>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onPlayToggle}
          className="btn btn-secondary btn-sm"
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
          className="flex-1"
        />
        <span className="text-xs text-gray-400">{playSpeed}ms</span>
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {Array.from({ length: Math.min(maxRound + 1, 20) }, (_, i) => maxRound - i).map(
          (round) => (
            <button
              key={round}
              onClick={() => onSelect(round)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                round === currentRound
                  ? 'bg-cyan-900/30 text-cyan-400'
                  : 'hover:bg-gray-800'
              }`}
            >
              {t('game.round')} {round}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * 勢力排行 — 顯示勢力統計。 / Faction Ranking — Shows faction statistics.
 */
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
    <div className="card">
      <h3 className="font-semibold mb-3">{t('ranking.title')}</h3>
      <div className="space-y-2">
        {factions
          .filter((f) => f.alive)
          .slice(0, 10)
          .map((faction) => {
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
              <div key={faction.id} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="flex-1 truncate">{faction.name}</span>
                <span className="text-gray-400">{factionPlaces.length}{t('ranking.territories')}</span>
                <span className="text-gray-400">{totalTroops}{t('ranking.troops')}</span>
                <span className="text-gray-400">💰{totalGold}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/**
 * 將領列表 — 顯示所有將領詳細資料。 / Character List — Shows all characters with full details.
 */
function CharacterList({
  characters,
  places,
}: {
  characters: WorldState['characters'];
  places: WorldState['places'];
}) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);

  // 建立地點名稱對照 / Create place name map
  const placeMap = new Map<string, string>();
  for (const place of places) {
    placeMap.set(place.id, place.name);
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{t('faction.characters')}</h3>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {characters
          .filter((c) => c.alive)
          .sort((a, b) => b.troops - a.troops)
          .map((char) => (
            <button
              key={char.id}
              onClick={() => setSelectedChar(selectedChar === char.id ? null : char.id)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                selectedChar === char.id
                  ? 'bg-cyan-900/30 text-cyan-400'
                  : 'hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="font-medium">{char.name}</span>
                {char.isKing && <span className="text-amber-400">👑</span>}
              </div>
              {/* 展開的詳細資料 / Expanded details */}
              {selectedChar === char.id && (
                <div className="mt-1 text-xs text-gray-400 space-y-0.5">
                  <div>{t('character.wu')}: {char.wu} | {t('character.tong')}: {char.tong} | {t('character.jing')}: {char.jing}</div>
                  <div>{t('character.speed')}: {char.speed} | {t('character.ambition')}: {char.ambition}</div>
                  <div>{t('character.troops')}: {char.troops} | 💰 {char.gold}</div>
                  <div>{t('character.place')}: {placeMap.get(char.placeId) ?? '—'}</div>
                </div>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * 事件日誌 — 從 API 取得並顯示。 / Event Log — Fetches from API and displays.
 * 使用 i18n 渲染雙語事件。 / Renders bilingual events using i18n.
 */
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
      const res = await fetch(`/api/world/events?round=${round}`);
      if (!res.ok) return { events: [] };
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const events = data?.events ?? [];

  // 事件圖示對照 / Event icon map
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

  // 格式化事件描述 / Format event description
  function formatEvent(event: GameEvent): string {
    const p = event.payload;
    switch (event.type) {
      case 'PLACE_CREATED':
        return t('events.newPlaceDesc')
          .replace('{place}', p.placeName as string);
      case 'CHARACTER_SPAWNED':
        return t('events.spawnDesc')
          .replace('{character}', p.charName as string);
      case 'DEATH':
        return t('events.deathDesc')
          .replace('{character}', p.charName as string);
      case 'BATTLE_DEATH':
        return t('events.battleDeathDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      case 'ESCAPE_SUCCESS':
        return t('events.escapeSuccessDesc')
          .replace('{character}', p.charName as string)
          .replace('{place}', p.placeName as string);
      case 'DEFECTION':
        return t('events.defectionDesc')
          .replace('{character}', p.charName as string);
      case 'FACTION_COLLAPSE':
        return t('events.collapseDesc')
          .replace('{faction}', p.factionName as string);
      case 'FACTION_ELIMINATED':
        return t('events.eliminationDesc')
          .replace('{faction}', p.factionName as string);
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
    <div className="card">
      <h3 className="font-semibold mb-3">{t('events.title')}</h3>
      <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
        {isLoading && (
          <p className="text-gray-500">{t('general.loading')}</p>
        )}
        {!isLoading && events.length === 0 && (
          <p className="text-gray-500">{t('game.noData')}</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-2 py-1 border-b border-gray-800 last:border-0">
            <span>{eventIcons[event.type] ?? '📌'}</span>
            <div className="flex-1">
              <span className="text-gray-300">{formatEvent(event)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 統計圖表 — SVG 折線圖。 / Stats Charts — SVG line chart.
 * 顯示兵力、金錢、領地數隨回合變化。 / Shows troops, gold, territories over rounds.
 * 使用各勢力顏色繪製折線。 / Uses faction colors for lines.
 */
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

  // 從 API 取得統計資料 / Fetch stats from API
  useEffect(() => {
    if (currentRound < 1) return;

    async function fetchStats() {
      try {
        const res = await fetch(
          `/api/world/stats?from=0&to=${currentRound}`
        );
        if (res.ok) {
          const data = await res.json();
          setChartData(data);
        }
      } catch {
        // 靜默失敗 / Silent fail
      }
    }

    fetchStats();
  }, [currentRound, worldId]);

  // 只在有足夠回合時顯示 / Only show when enough rounds exist
  if (currentRound < 1 || !chartData || chartData.factions.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-3">{t('stats.title')}</h3>
        <p className="text-gray-500 text-sm">{t('game.noData')}</p>
      </div>
    );
  }

  const { factions, rounds } = chartData;
  const width = 280;
  const height = 120;
  const padding = 30;

  // 繪製折線圖 / Render line chart
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
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-1">{title}</div>
        <svg width={width} height={height} className="w-full">
          {/* 網格線 / Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1={padding}
              y1={height - padding - pct * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - pct * (height - 2 * padding)}
              stroke="#333"
              strokeWidth={0.5}
            />
          ))}

          {/* 折線 / Lines */}
          {data.map((series, si) => (
            <polyline
              key={si}
              points={series
                .map((v, i) => `${xScale(i)},${yScale(v)}`)
                .join(' ')}
              fill="none"
              stroke={colors[si]}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}

          {/* 圖例 / Legend */}
          {labels.map((label, i) => (
            <g key={i}>
              <rect
                x={padding + i * 70}
                y={4}
                width={8}
                height={8}
                fill={colors[i]}
                rx={1}
              />
              <text
                x={padding + i * 70 + 12}
                y={12}
                fill="#888"
                fontSize={8}
              >
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  // 準備資料 / Prepare data
  const troopData = factions.map((f) => f.troops);
  const goldData = factions.map((f) => f.gold);
  const territoryData = factions.map((f) => f.territories);
  const factionColors = factions.map((f) => f.color);
  const factionNames = factions.map((f) => f.name);

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{t('stats.title')}</h3>
      {renderLineChart(troopData, factionColors, factionNames, t('stats.troopsOverTime'))}
      {renderLineChart(goldData, factionColors, factionNames, t('stats.goldOverTime'))}
      {renderLineChart(territoryData, factionColors, factionNames, t('stats.territoriesOverTime'))}
    </div>
  );
}

/**
 * 地方詳情面板 — 點擊地圖節點時顯示。 / Place Detail Panel — Shows when map node clicked.
 */
function PlaceDetail({
  place,
  factions,
  characters,
  onClose,
}: {
  place: WorldState['places'][0];
  factions: WorldState['factions'];
  characters: WorldState['characters'];
  onClose: () => void;
}) {
  const faction = factions.find((f) => f.id === place.factionId);
  const placeChars = characters.filter(
    (c) => c.placeId === place.id && c.alive
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full mx-4 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標頭 / Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{place.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {/* 勢力 / Faction */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: faction?.color ?? '#444' }}
          />
          <span className="text-sm">
            {faction ? faction.name : t('place.unowned')}
          </span>
        </div>

        {/* 建築資訊 / Building Info */}
        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-gray-800 rounded p-2">
            <div className="text-lg font-bold">{place.fortress}</div>
            <div className="text-xs text-gray-400">🏰 {t('place.fortress')}</div>
          </div>
          <div className="bg-gray-800 rounded p-2">
            <div className="text-lg font-bold">{place.market}</div>
            <div className="text-xs text-gray-400">🏪 {t('place.market')}</div>
          </div>
          <div className="bg-gray-800 rounded p-2">
            <div className="text-lg font-bold">{place.barracks}</div>
            <div className="text-xs text-gray-400">🏯 {t('place.barracks')}</div>
          </div>
        </div>

        {/* 駐軍 / Garrison */}
        <div className="mb-4">
          <div className="text-sm text-gray-400">{t('place.garrison')}</div>
          <div className="text-lg font-bold">⚔️ {place.garrison}</div>
        </div>

        {/* 駐紮將領 / Stationed Characters */}
        <div>
          <div className="text-sm text-gray-400 mb-2">{t('place.characters')}</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {placeChars.length === 0 && (
              <p className="text-gray-500 text-sm">—</p>
            )}
            {placeChars.map((char) => (
              <div key={char.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{char.name}</span>
                {char.isKing && <span className="text-amber-400">👑</span>}
                <span className="text-gray-400">⚔️{char.troops}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 遊戲圖形 — Sigma.js 圖形視覺化。 / GameGraph — Sigma.js graph visualization.
 * 使用 Sigma.js + graphology 渲染互動式地圖。
 * Uses Sigma.js + graphology to render interactive map.
 */
function GameGraph({
  places,
  factions,
  roads,
  characters,
  onPlaceClick,
}: {
  places: WorldState['places'];
  factions: WorldState['factions'];
  roads: WorldState['roads'];
  characters: WorldState['characters'];
  onPlaceClick?: (place: WorldState['places'][0]) => void;
}) {
  return (
    <div className="w-full h-full bg-gray-900 relative">
      <SigmaMap
        places={places}
        factions={factions}
        roads={roads}
        characters={characters}
        onPlaceClick={onPlaceClick}
      />
      {/* 圖例 / Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-800/90 rounded p-3 text-xs space-y-1">
        <div className="font-semibold text-gray-300 mb-2">{t('map.faction')}</div>
        {factions.filter(f => f.alive).slice(0, 5).map(f => (
          <div key={f.id} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
            <span className="text-gray-400">{f.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-600" />
          <span className="text-gray-400">{t('place.unowned')}</span>
        </div>
      </div>
    </div>
  );
}
