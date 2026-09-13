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
//
// 這是客戶端元件，因為需要互動性。 / This is a client component because it requires interactivity.
// 資料在伺服器端取得並作為 props 傳遞。 / Data is fetched on the server and passed as props.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

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

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

/**
 * 遊戲頁面元件。 / Game page component.
 * 取得世界狀態並渲染所有遊戲 UI 元件。 / Fetches world state and renders all game UI components.
 */
export default function GamePage() {
  const [selectedRound, setSelectedRound] = useState<number>(1);

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
        if (next > (worldState?.world.currentRound ?? 1)) {
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
          <p className="text-gray-400">載入世界資料中...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center max-w-md">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold mb-2">載入失敗</h2>
          <p className="text-gray-400 mb-4">{errorMessage}</p>
          <button
            onClick={() => fetchWorldState()}
            className="btn btn-secondary"
          >
            重試
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
          <span className="font-bold">自治世界</span>
          <span className="text-gray-500 text-sm">
            回合 {selectedRound}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">
            {worldState?.world.name ?? '—'}
          </span>
        </div>
      </header>

      {/* ── 主要內容 / Main Content ────────────────────────────────────────── */}
      <div className="flex-1 flex">
        {/* ── 左側邊欄 / Left Sidebar ────────────────────────────────────────────── */}
        <aside className="w-64 border-r border-gray-800 p-4 space-y-4 overflow-y-auto">
          {/* 回合時間軸 / Round Timeline */}
          <RoundTimeline
            currentRound={selectedRound}
            maxRound={worldState?.world.currentRound ?? 1}
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
          />

          {/* 事件日誌 / Event Log */}
          <EventLog
            round={selectedRound}
          />
        </aside>
      </div>
    </div>
  );
}

// ─── 子元件（暫存）/ Sub-Components (Stubs) ────────────────────────────────────────

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
      <h3 className="font-semibold mb-3">回合時間軸</h3>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onPlayToggle}
          className="btn btn-secondary btn-sm"
        >
          {isPlaying ? '⏸' : '▶'}
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
        {Array.from({ length: Math.min(maxRound, 20) }, (_, i) => maxRound - i).map(
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
              回合 {round}
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
      <h3 className="font-semibold mb-3">勢力排行</h3>
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

            return (
              <div key={faction.id} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="flex-1 truncate">{faction.name}</span>
                <span className="text-gray-400">{factionPlaces.length}領地</span>
                <span className="text-gray-400">{totalTroops}兵</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/**
 * 將領列表 — 顯示所有將領。 / Character List — Shows all characters.
 */
function CharacterList({
  characters,
}: {
  characters: WorldState['characters'];
}) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">將領列表</h3>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {characters
          .filter((c) => c.alive)
          .sort((a, b) => b.troops - a.troops)
          .map((char) => (
            <button
              key={char.id}
              onClick={() => setSelectedChar(char.id)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                selectedChar === char.id
                  ? 'bg-cyan-900/30 text-cyan-400'
                  : 'hover:bg-gray-800'
              }`}
            >
              <span className="font-medium">{char.name}</span>
              <span className="text-gray-400 ml-2">{char.troops}兵</span>
              {char.isKing && (
                <span className="text-amber-400 ml-1">👑</span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

/**
 * 事件日誌 — 顯示最近事件。 / Event Log — Shows recent events.
 */
function EventLog({ round }: { round: number }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">事件日誌</h3>
      <div className="text-gray-400 text-sm">
        <p>回合 {round} 的事件將在這裡顯示。</p>
      </div>
    </div>
  );
}

/**
 * 遊戲圖形 — Sigma.js 圖形視覺化（暫存）。 / GameGraph — Sigma.js graph visualization (stub).
 * 待辦：使用 Sigma.js + graphology 實作 / TODO: Implement with Sigma.js + graphology
 */
function GameGraph({
  places,
  factions,
  roads,
}: {
  places: WorldState['places'];
  factions: WorldState['factions'];
  roads: WorldState['roads'];
}) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900">
      <div className="text-center text-gray-500">
        <div className="text-6xl mb-4">🗺️</div>
        <p>Sigma.js 地圖</p>
        <p className="text-sm">
          {places.length} 地方 · {roads.length} 道路 ·{' '}
          {factions.filter((f) => f.alive).length} 勢力
        </p>
      </div>
    </div>
  );
}
