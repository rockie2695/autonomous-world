'use client';

// ============================================================================
// 3D 星球容器 — 自治世界首頁 / 3D planet mount for the homepage
// ============================================================================
// three.js is imported only on the client: `ssr: false` lives in this client
// wrapper (Next.js only honours it there), so the renderer bundle never hits
// the server render pass. While it loads, a light CSS orbit placeholder shows.
// ============================================================================

import dynamic from 'next/dynamic';

const PlanetScene = dynamic(() => import('./PlanetScene'), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      <div className="relative h-44 w-44">
        <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="absolute inset-0 rounded-full border border-cyan-400/25" />
        <div className="absolute inset-5 rounded-full border border-dashed border-cyan-400/30 animate-[ds-spin_18s_linear_infinite]" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_12px_2px_rgba(34,211,238,0.6)]" />
      </div>
    </div>
  ),
});

export default function PlanetCanvas() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[34rem]"
      role="img"
      aria-label="自治世界的 3D 星球視圖：地表領土與環繞運行的據點光點"
    >
      {/* 環境光暈 / ambient halo behind the canvas */}
      <div className="ds-orb-glow pointer-events-none absolute inset-[-12%] rounded-full" aria-hidden="true" />
      <PlanetScene />
    </div>
  );
}
