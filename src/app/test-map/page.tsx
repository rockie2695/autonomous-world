// ============================================================================
// 測試頁面 — SigmaMap 視角保留 + tooltip 清除 + 相連地點驗證（暫時性）
// Test Page — SigmaMap camera preservation + tooltip clearing + linked places
// (temporary, deleted after QA)
// ============================================================================

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PlaceDetail } from '@/app/game/page';

const SigmaMap = dynamic(
  () => import('@/components/SigmaMap').then((mod) => mod.SigmaMap),
  { ssr: false }
);

const places = [
  { id: 'p1', name: '中央城', factionId: 'f1', garrison: 10, fortress: 2, market: 1, barracks: 1, layoutX: 0, layoutY: 0 },
  { id: 'p2', name: 'North Keep', factionId: 'f1', garrison: 5, fortress: 1, market: 0, barracks: 0, layoutX: -1, layoutY: -1 },
  { id: 'p3', name: 'East Town', factionId: null, garrison: 3, fortress: 0, market: 2, barracks: 0, layoutX: 1, layoutY: 1 },
];

const factions = [
  { id: 'f1', name: '青龍邦', color: 'hsl(190, 70%, 50%)', alive: true, collapsing: false },
];

const roads = [
  { id: 'r1', aId: 'p1', bId: 'p2' },
  { id: 'r2', aId: 'p1', bId: 'p3' },
];

const characters = [
  { id: 'c1', name: 'King A', factionId: 'f1', wu: 20, tong: 18, jing: 15, speed: 17, ambition: 8, troops: 20, gold: 100, placeId: 'p1', alive: true, isKing: true },
  { id: 'c2', name: 'General B', factionId: 'f1', wu: 15, tong: 14, jing: 12, speed: 19, ambition: 6, troops: 10, gold: 50, placeId: 'p2', alive: true, isKing: false },
];

export default function TestMapPage() {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const selectedPlace = places.find((p) => p.id === selectedPlaceId) ?? null;

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="w-full h-screen relative">
        <SigmaMap
          places={places}
          factions={factions}
          roads={roads}
          characters={characters}
          onPlaceClick={(place) => setSelectedPlaceId(place.id)}
          selectedPlaceId={selectedPlaceId}
        />
      </div>

      {/* 彈窗 — 使用真實的 PlaceDetail 元件 / Popup using the real PlaceDetail */}
      {selectedPlace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedPlaceId(null)}
        >
          <div className="max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <PlaceDetail
              place={selectedPlace}
              factions={factions}
              characters={characters}
              roads={roads}
              places={places}
              onClose={() => setSelectedPlaceId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
