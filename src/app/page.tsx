// ============================================================================
// 首頁 — 自治世界 / Homepage — Autonomous World
// ============================================================================
// 專業遊戲介紹展示網站 / Professional Game Introduction Display
// 深空科幻主題 / Deep Space Sci-Fi Theme
// ============================================================================

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { t } from '@/lib/i18n';

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect('/game');
  }

  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden">
      {/* ── 星空背景 / Starfield Background ─────────────────────────────────── */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#020617]" />
        <div className="stars" />
        <div className="stars2" />
        <div className="nebula" />
        <div className="shooting-stars">
          <div className="shooting-star" />
          <div className="shooting-star" />
          <div className="shooting-star" />
          <div className="shooting-star" />
          <div className="shooting-star" />
        </div>
      </div>

      {/* ── 標頭 / Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 blur-sm opacity-60" />
            <div className="relative w-full h-full rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.5-6.5L17 7m-10 10-1.5 1.5M20.5 17.5 19 17M5 7 3.5 5.5" />
              </svg>
            </div>
          </div>
          <span className="font-orbitron font-bold text-lg tracking-wider text-white">
            AUTONOMOUS WORLD
          </span>
        </div>
        <Link
          href="/api/auth/signin"
          className="group relative px-5 py-2.5 rounded-lg font-medium text-sm text-cyan-300 border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/15 hover:border-cyan-400/50 transition-all duration-300"
        >
          <span className="relative z-10">進入系統</span>
          <div className="absolute inset-0 rounded-lg bg-cyan-400/0 group-hover:bg-cyan-400/10 transition-all duration-300" />
        </Link>
      </header>

      {/* ── 主視覺區塊 / Hero Section ──────────────────────────────────────────── */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* 裝飾線 / Decorative line */}
        <div className="w-px h-16 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent mb-8" />

        {/* 副標題 / Subtitle */}
        <p className="font-orbitron text-xs tracking-[0.3em] text-cyan-400/70 mb-4 uppercase">
          Browser-Based Autonomous Simulation
        </p>

        {/* 標題 / Title */}
        <h1 className="font-orbitron text-5xl md:text-7xl lg:text-8xl font-bold mb-6">
          <span className="gradient-text-hero">自治世界</span>
        </h1>

        {/* 描述 / Description */}
        <p className="text-lg md:text-xl text-gray-400 mb-4 max-w-2xl leading-relaxed">
          {t('home.intro')}
        </p>
        <p className="text-sm text-gray-500 mb-14 max-w-xl leading-relaxed">
          {t('home.description')}
        </p>

        {/* 特色卡片 / Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-14 max-w-6xl w-full">
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.729-3.559" />
              </svg>
            }
            title={t('home.features.autonomous')}
            description={t('home.features.autonomousDesc')}
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            }
            title={t('home.features.realtime')}
            description={t('home.features.realtimeDesc')}
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
              </svg>
            }
            title={t('home.features.infinite')}
            description={t('home.features.infiniteDesc')}
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.996.188-1.676.32-2.228.401C6.441 4.692 6 5.23 6 5.824v1.06c0 1.02.187 1.988.512 2.863M18.75 4.236c.996.188 1.676.32 2.228.401C17.559 4.692 18 5.23 18 5.824v1.06c0 1.02-.187 1.988-.512 2.863M12 2.25A4.5 4.5 0 0 1 16.5 6.75v1.5a4.5 4.5 0 0 1-9 0v-1.5A4.5 4.5 0 0 1 12 2.25Z" />
              </svg>
            }
            title={t('home.features.noVictory')}
            description={t('home.features.noVictoryDesc')}
          />
        </div>

        {/* 登入按鈕 / Login Button */}
        <Link
          href="/api/auth/signin"
          className="group relative inline-flex items-center gap-3 px-10 py-4 rounded-xl font-orbitron font-semibold text-sm tracking-wider text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] transition-all duration-300"
        >
          <span>{t('home.startButton')}</span>
          <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>

        {/* 裝飾線 / Decorative line */}
        <div className="w-px h-16 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent mt-12" />
      </section>

      {/* ── 運作方式區塊 / How It Works Section ───────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-orbitron text-3xl md:text-4xl font-bold text-white mb-4">
              {t('home.howItWorks.title')}
            </h2>
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <HowItWorksCard
              step="01"
              title={t('home.howItWorks.step1')}
              description={t('home.howItWorks.step1Desc')}
            />
            <HowItWorksCard
              step="02"
              title={t('home.howItWorks.step2')}
              description={t('home.howItWorks.step2Desc')}
            />
            <HowItWorksCard
              step="03"
              title={t('home.howItWorks.step3')}
              description={t('home.howItWorks.step3Desc')}
            />
          </div>
        </div>
      </section>

      {/* ── 世界概況區塊 / World Stats Section ────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6 bg-gray-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-orbitron text-3xl md:text-4xl font-bold text-white mb-4">
              {t('home.stats.title')}
            </h2>
            <div className="w-24 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent mx-auto" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatsCard
              icon="⚔️"
              label={t('home.stats.characters')}
              value="100+"
            />
            <StatsCard
              icon="🏰"
              label={t('home.stats.factions')}
              value="10+"
            />
            <StatsCard
              icon="🗺️"
              label={t('home.stats.places')}
              value="500+"
            />
            <StatsCard
              icon="📊"
              label={t('home.stats.rounds')}
              value="1000+"
            />
          </div>
        </div>
      </section>

      {/* ── 行動呼籲區塊 / CTA Section ────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-orbitron text-3xl md:text-5xl font-bold text-white mb-6">
            準備好觀察了嗎？
          </h2>
          <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto">
            進入自治世界，見證 AI 們書寫的永恆傳奇。
          </p>
          <Link
            href="/api/auth/signin"
            className="group relative inline-flex items-center gap-3 px-12 py-5 rounded-xl font-orbitron font-semibold text-base tracking-wider text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_40px_rgba(34,211,238,0.3)] hover:shadow-[0_0_60px_rgba(34,211,238,0.5)] transition-all duration-300"
          >
            <span>{t('home.startButton')}</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── 頁尾 / Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 px-6 py-5 text-center border-t border-gray-800/50">
        <p className="font-orbitron text-[10px] tracking-[0.2em] text-gray-600 uppercase">
          Autonomous World — Eternal Evolution Simulation
        </p>
      </footer>
    </main>
  );
}

// ─── 特色卡片元件 / Feature Card Component ────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative p-6 rounded-xl border border-gray-800/80 bg-gray-900/40 backdrop-blur-sm hover:border-cyan-500/30 hover:bg-gray-900/60 transition-all duration-300">
      {/* 頂部發光線 / Top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent group-hover:w-20 transition-all duration-300" />

      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:bg-cyan-500/20 group-hover:border-cyan-400/40 transition-all duration-300">
          {icon}
        </div>
        <h3 className="font-orbitron font-semibold text-sm tracking-wide text-white mb-2">
          {title}
        </h3>
        <p className="text-gray-500 text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── 運作方式卡片元件 / How It Works Card Component ────────────────────────────────

function HowItWorksCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative p-8 rounded-xl border border-gray-800/80 bg-gray-900/40 backdrop-blur-sm hover:border-cyan-500/30 hover:bg-gray-900/60 transition-all duration-300">
      {/* 步驟編號 / Step Number */}
      <div className="absolute top-6 right-6 font-orbitron text-4xl font-bold text-cyan-500/10 group-hover:text-cyan-500/20 transition-all duration-300">
        {step}
      </div>

      {/* 頂部發光線 / Top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent group-hover:w-20 transition-all duration-300" />

      <div className="relative">
        <h3 className="font-orbitron font-semibold text-lg tracking-wide text-white mb-3">
          {title}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── 統計卡片元件 / Stats Card Component ────────────────────────────────────────────

function StatsCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="group relative p-6 rounded-xl border border-gray-800/80 bg-gray-900/40 backdrop-blur-sm hover:border-cyan-500/30 hover:bg-gray-900/60 transition-all duration-300 text-center">
      {/* 頂部發光線 / Top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent group-hover:w-20 transition-all duration-300" />

      <div className="text-3xl mb-3">{icon}</div>
      <div className="font-orbitron text-2xl md:text-3xl font-bold text-white mb-2">{value}</div>
      <div className="text-gray-500 text-xs uppercase tracking-wider">{label}</div>
    </div>
  );
}
