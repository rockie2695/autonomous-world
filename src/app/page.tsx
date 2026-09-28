// ============================================================================
// 首頁 — 自治世界 / Homepage — Autonomous World
// ============================================================================
// 深空科幻主題 / Deep Space Sci-Fi Theme
// 流程 / Flow: hero → signal feed → living world (3D) → features →
//              how it works → faction saga → stats → CTA
// 保留既有 i18n 文案與 auth 流程 / Existing i18n copy and auth flow preserved.
// ============================================================================

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { t } from '@/lib/i18n';
import { Parallax, Reveal } from '@/components/home/Motion';
import PlanetCanvas from '@/components/home/PlanetCanvas';

// ─── 動態資料 / Derived content ─────────────────────────────────────────────

/** 世界訊號（示範）/ sample world signal feed built from the real event copy */
function buildSignalFeed(): string[] {
  return [
    t('events.newFactionDesc', { character: '霜狼·蓋爾', faction: '霜脊議會' }),
    t('events.placeCaptureDesc', { character: '赤潮·卡恩', place: '灰岩高地' }),
    t('events.moveDesc', { character: '幽光·薇拉', from: '沉星渡口', to: '裂風關' }),
    t('events.battleDesc', { attacker: '鐵壁·索恩', place: '黑曜要塞' }),
    t('events.newPlaceDesc', { place: '霧海前哨' }),
    t('events.recruitmentDesc', { place: '霜脊議會', count: 42 }),
    t('events.buildingUpgradeDesc', { place: '灰岩高地', building: '城牆', level: 3 }),
    t('events.defectionDesc', { character: '灰鷲·安卡' }),
    t('events.adminAssignedDesc', { character: '潮聲·莉安', place: '沉星渡口' }),
  ];
}

/** 勢力圖例（與 3D 軌道光點同一組色票）/ faction legend, palette-locked */
const FACTIONS = [
  { name: '赤潮軍團', dot: 'bg-[#f87171]' },
  { name: '霜脊議會', dot: 'bg-cyan-400' },
  { name: '幽光商盟', dot: 'bg-purple-400' },
  { name: '鐵壁聯邦', dot: 'bg-blue-500' },
  { name: '無主之地', dot: 'bg-slate-500' },
];

/** 傳奇時間軸 / faction saga timeline */
const SAGA = [
  { step: '01', era: '起源', text: '一名國王、一座城，世界開始運轉。' },
  { step: '02', era: '分裂', text: '第一個反叛勢力誕生，邊界首次被劃下。' },
  { step: '03', era: '結盟', text: '宿敵握手，聯盟在一夜之間改寫地圖。' },
  { step: '04', era: '背叛', text: '盟約比戰火更快崩塌，新王趁勢崛起。' },
  { step: '∞', era: '永恆', text: '沒有終局，只有下一回合。' },
];

// ─── 導覽列 / Navigation ────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '#world', label: '世界' },
  { href: '#how', label: '運作' },
  { href: '#saga', label: '傳奇' },
  { href: '#stats', label: '數據' },
];

// ─── 頁面元件 / Page Component ──────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect('/game');
  }

  const feed = buildSignalFeed();
  const feedLoop = [...feed, ...feed];

  return (
    <main className="relative flex min-h-screen flex-col">
      {/* 跳過導覽 / Skip navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-cyan-400 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#020617]"
      >
        跳至主要內容
      </a>

      {/* ── 星空背景 / Starfield background ────────────────────────────────── */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[#020617]" />

        {/* 視差星空 / parallax star layers */}
        <Parallax offset={90} className="absolute inset-0">
          <div className="stars" />
          <div className="stars2" />
        </Parallax>

        <div className="nebula" />
        <div className="ds-grid-bg absolute inset-0" />

        <div className="shooting-stars">
          <div className="shooting-star" />
          <div className="shooting-star" />
          <div className="shooting-star" />
          <div className="shooting-star" />
          <div className="shooting-star" />
        </div>

        {/* 遊戲畫面英雄影片 / game-screen hero video (first screen only) */}
        <div className="absolute inset-x-0 top-0 h-screen overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/hero-poster.jpg"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-45 motion-reduce:hidden"
          >
            <source src="/hero.mp4" type="video/mp4" />
            <source src="/hero.webm" type="video/webm" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/75 via-[#020617]/55 to-[#020617]/95" />
        </div>
      </div>

      {/* ── 標頭 / Header ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#020617]/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="自治世界 首頁">
            <span
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_18px_rgba(34,211,238,0.35)]"
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.5-6.5L17 7m-10 10-1.5 1.5M20.5 17.5 19 17M5 7 3.5 5.5" />
              </svg>
            </span>
            <span className="font-orbitron hidden text-sm font-bold tracking-[0.18em] text-white sm:inline md:text-base">
              AUTONOMOUS WORLD
            </span>
          </Link>

          <nav aria-label="主要導覽" className="hidden items-center gap-2 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-sm text-gray-300 transition-colors duration-200 hover:text-cyan-300"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <Link
            href="/api/auth/signin"
            className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-sm font-medium text-cyan-300 transition-all duration-300 hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-200 sm:px-5"
          >
            進入系統
          </Link>
        </div>
      </header>

      {/* ── 主視覺 / Hero ───────────────────────────────────────────────────── */}
      <section
        id="main-content"
        tabIndex={-1}
        className="relative z-10 flex flex-1 scroll-mt-20 flex-col items-center justify-center px-5 py-20 text-center sm:px-6 md:py-28"
      >
        <Parallax offset={36} className="w-full max-w-4xl">
          <div
            className="mx-auto mb-8 h-14 w-px bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent"
            aria-hidden="true"
          />

          <p className="ds-eyebrow mb-5">Browser-Based Autonomous Simulation</p>

          <h1 className="font-orbitron mb-6 text-[clamp(2.75rem,9vw,6.5rem)] font-bold leading-[1.05] tracking-tight">
            <span className="gradient-text-hero">自治世界</span>
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-lg leading-relaxed text-gray-300 md:text-xl">
            {t('home.intro')}
          </p>
          <p className="mx-auto mb-11 max-w-xl text-base leading-relaxed text-gray-400 md:text-lg">
            {t('home.description')}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/api/auth/signin"
              className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-9 py-4 font-orbitron text-sm font-bold tracking-wider text-[#020617] shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all duration-300 hover:from-cyan-400 hover:to-blue-500 hover:shadow-[0_0_44px_rgba(34,211,238,0.5)]"
            >
              <span>{t('home.startButton')}</span>
              <svg
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>

            <a
              href="#world"
              className="group inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-7 py-4 text-sm font-medium text-cyan-200 transition-all duration-300 hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-100"
            >
              觀看世界運作
              <svg
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
              </svg>
            </a>
          </div>
        </Parallax>

        <div className="mt-14 hidden flex-col items-center gap-2 sm:flex" aria-hidden="true">
          <span className="font-orbitron text-[10px] tracking-[0.3em] text-gray-400">SCROLL</span>
          <svg
            className="ds-cue h-4 w-4 text-cyan-400/80"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25 12 15.75l-7.5-7.5" />
          </svg>
        </div>
      </section>

      {/* ── 世界訊號（示範）/ signal feed strip ───────────────────────────── */}
      <div
        className="scanline relative z-10 border-y border-white/5 bg-[#020617]/70 py-3 backdrop-blur-sm"
        aria-hidden="true"
      >
        <div className="flex items-center">
          <span className="ds-eyebrow hidden shrink-0 items-center gap-2 pl-5 text-[10px] sm:flex md:pl-8">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
            </span>
            SIGNAL FEED · 示範
          </span>

          <div className="ds-ticker min-w-0 flex-1">
            <div className="ds-ticker-track">
              {feedLoop.map((signal, index) => (
                <span
                  key={`${signal}-${index}`}
                  className="mr-10 flex shrink-0 items-center gap-2.5 whitespace-nowrap text-xs text-gray-400 md:text-sm"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                    aria-hidden="true"
                  />
                  {signal}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 活著的世界 / Living World (3D) ─────────────────────────────────── */}
      <section id="world" className="relative z-10 px-5 py-[var(--ds-section-y)] sm:px-6">
        <div className="ds-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="order-1 lg:order-2">
            <PlanetCanvas />

            <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-3">
              {FACTIONS.map((faction) => (
                <li key={faction.name} className="flex items-center gap-2 text-xs text-gray-300 md:text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${faction.dot}`} aria-hidden="true" />
                  {faction.name}
                </li>
              ))}
            </ul>
          </div>

          <Reveal className="order-2 lg:order-1" delay={0.05}>
            <p className="ds-eyebrow mb-4">Living World / 活著的世界</p>
            <h2 className="font-orbitron text-3xl font-bold leading-tight text-white md:text-[2.5rem]">
              世界沒有劇本
            </h2>
            <div className="ds-hairline mt-5 w-28" aria-hidden="true" />

            <p className="mt-6 max-w-xl text-base leading-relaxed text-gray-400 md:text-lg">
              每一個光點都是一座據點，每一道軌跡都是一次行動。放著不管，世界也會自己走下去——
              勢力在地表崛起、結盟、互相背叛，而你只需要看著。
            </p>

            <div className="mt-8">
              <a
                href="#how"
                className="group inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-6 py-3.5 text-sm font-medium text-cyan-200 transition-all duration-300 hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-100"
              >
                了解運作方式
                <svg
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 特色 / Features ─────────────────────────────────────────────────── */}
      <section className="relative z-10 px-5 py-[var(--ds-section-y)] sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-14 text-center">
            <p className="ds-eyebrow mb-4">Core Features</p>
            <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
              四個不變的核心
            </h2>
            <div className="ds-hairline mx-auto mt-5 w-24" aria-hidden="true" />
          </Reveal>

          <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.05} className="h-full">
                <FeatureCard {...feature} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 運作方式 / How it works ─────────────────────────────────────────── */}
      <section
        id="how"
        className="relative z-10 scroll-mt-20 border-y border-white/5 bg-slate-900/25 px-5 py-[var(--ds-section-y)] sm:px-6"
      >
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-14 text-center">
            <p className="ds-eyebrow mb-4">How It Works</p>
            <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
              {t('home.howItWorks.title')}
            </h2>
            <div className="ds-hairline mx-auto mt-5 w-24" aria-hidden="true" />
          </Reveal>

          <div className="relative grid grid-cols-1 gap-6 md:grid-cols-3">
            <div
              className="pointer-events-none absolute inset-x-8 top-8 hidden h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent md:block"
              aria-hidden="true"
            />
            {STEPS.map((step, index) => (
              <Reveal key={step.step} delay={index * 0.05} className="relative h-full">
                <StepCard {...step} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 傳奇時間軸 / Faction saga ───────────────────────────────────────── */}
      <section id="saga" className="relative z-10 scroll-mt-20 overflow-hidden px-5 py-[var(--ds-section-y)] sm:px-6">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <Parallax offset={54} className="absolute inset-y-[-8%] inset-x-[-4%]">
            <img
              src="/space/deep-field.jpg"
              alt=""
              width={1920}
              height={1219}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover opacity-30"
            />
          </Parallax>
          <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/90 to-[#020617]" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <Reveal className="mb-14 text-center">
            <p className="ds-eyebrow mb-4">Faction Saga</p>
            <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
              沒有終局的傳奇
            </h2>
            <div className="ds-hairline mx-auto mt-5 w-24" aria-hidden="true" />
          </Reveal>

          <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {SAGA.map((item, index) => (
              <li key={item.era}>
                <Reveal delay={index * 0.05}>
                  <div className="relative border-t border-cyan-400/25 pt-6">
                    <span
                      className="absolute -top-[5px] left-0 h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]"
                      aria-hidden="true"
                    />
                    <span className="font-orbitron text-xs tracking-[0.25em] text-cyan-400/90">
                      {item.step}
                    </span>
                    <h3 className="font-orbitron mt-2 text-lg font-semibold text-white">{item.era}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400 md:text-base">{item.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 世界概況 / World stats ──────────────────────────────────────────── */}
      <section id="stats" className="relative z-10 scroll-mt-20 px-5 py-[var(--ds-section-y)] sm:px-6">
        <div className="ds-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl">
          <Reveal className="mb-14 text-center">
            <p className="ds-eyebrow mb-4">World Stats</p>
            <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
              {t('home.stats.title')}
            </h2>
            <div className="ds-hairline mx-auto mt-5 w-24" aria-hidden="true" />
          </Reveal>

          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {STATS.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 0.05} className="h-full">
                <StatCard {...stat} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 行動呼籲 / CTA ──────────────────────────────────────────────────── */}
      <section className="relative z-10 overflow-hidden px-5 py-24 text-center sm:px-6 md:py-32">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <Parallax offset={60} className="absolute inset-y-[-10%] inset-x-[-4%]">
            <img
              src="/space/cosmic-cliffs.jpg"
              alt=""
              width={1920}
              height={1111}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover opacity-40"
            />
          </Parallax>
          <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/85 to-[#020617]" />
        </div>

        <Reveal className="mx-auto max-w-3xl">
          <p className="ds-eyebrow mb-5">Enter The World</p>
          <h2 className="font-orbitron text-3xl font-bold text-white md:text-5xl">
            準備好觀察了嗎？
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-300 md:text-lg">
            進入自治世界，見證 AI 們書寫的永恆傳奇。
          </p>

          <div className="mt-10 flex justify-center">
            <Link
              href="/api/auth/signin"
              className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-11 py-4 font-orbitron text-base font-bold tracking-wider text-[#020617] shadow-[0_0_40px_rgba(34,211,238,0.35)] transition-all duration-300 hover:from-cyan-400 hover:to-blue-500 hover:shadow-[0_0_60px_rgba(34,211,238,0.55)]"
            >
              <span>{t('home.startButton')}</span>
              <svg
                className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── 頁尾 / Footer ───────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 px-5 py-7 text-center sm:px-6">
        <p className="font-orbitron text-[10px] uppercase tracking-[0.2em] text-gray-400">
          Autonomous World — Eternal Evolution Simulation
        </p>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          星空影像：NASA / ESA / CSA / STScI · 星球貼圖：Solar System Scope（CC BY 4.0）
        </p>
      </footer>
    </main>
  );
}

// ─── 特色資料 / Feature data ────────────────────────────────────────────────

const FEATURES: {
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    title: t('home.features.autonomous'),
    description: t('home.features.autonomousDesc'),
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.729-3.559"
        />
      </svg>
    ),
  },
  {
    title: t('home.features.realtime'),
    description: t('home.features.realtimeDesc'),
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: t('home.features.infinite'),
    description: t('home.features.infiniteDesc'),
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"
        />
      </svg>
    ),
  },
  {
    title: t('home.features.noVictory'),
    description: t('home.features.noVictoryDesc'),
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621-.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.996.188-1.676.32-2.228.401C6.441 4.692 6 5.23 6 5.824v1.06c0 1.02.187 1.988.512 2.863M18.75 4.236c.996.188 1.676.32 2.228.401C17.559 4.692 18 5.23 18 5.824v1.06c0 1.02-.187 1.988-.512 2.863M12 2.25A4.5 4.5 0 0 1 16.5 6.75v1.5a4.5 4.5 0 0 1-9 0v-1.5A4.5 4.5 0 0 1 12 2.25Z"
        />
      </svg>
    ),
  },
];

// ─── 運作步驟資料 / How-it-works data ───────────────────────────────────────

const STEPS = [
  { step: '01', title: t('home.howItWorks.step1'), description: t('home.howItWorks.step1Desc') },
  { step: '02', title: t('home.howItWorks.step2'), description: t('home.howItWorks.step2Desc') },
  { step: '03', title: t('home.howItWorks.step3'), description: t('home.howItWorks.step3Desc') },
];

// ─── 統計資料 / Stats data（值為既有展示數值 / values unchanged）─────────────

const STATS = [
  { label: t('home.stats.characters'), value: '100+', icon: 'people' },
  { label: t('home.stats.factions'), value: '10+', icon: 'shield' },
  { label: t('home.stats.places'), value: '500+', icon: 'pin' },
  { label: t('home.stats.rounds'), value: '1000+', icon: 'pulse' },
] as const;

// ─── 特色卡片 / Feature card ────────────────────────────────────────────────

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
    <div className="ds-panel ds-hud group h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.12)] md:p-7">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 transition-colors duration-300 group-hover:bg-cyan-500/20 group-hover:text-cyan-200">
        {icon}
      </div>
      <h3 className="font-orbitron mb-2.5 text-base font-semibold tracking-wide text-white">{title}</h3>
      <p className="text-base leading-relaxed text-gray-400">{description}</p>
    </div>
  );
}

// ─── 運作步驟卡片 / How-it-works card ───────────────────────────────────────

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="ds-panel ds-hud group h-full p-7 transition-all duration-300 hover:border-cyan-400/40 md:p-8">
      <span
        className="font-orbitron block text-4xl font-bold text-cyan-500/20 transition-colors duration-300 group-hover:text-cyan-400/40"
        aria-hidden="true"
      >
        {step}
      </span>
      <div className="ds-hairline my-5 w-16" aria-hidden="true" />
      <h3 className="font-orbitron mb-3 text-lg font-semibold text-white">{title}</h3>
      <p className="text-base leading-relaxed text-gray-400">{description}</p>
    </div>
  );
}

// ─── 統計卡片 / Stats card（SVG 圖示替代 emoji / SVG icons replace emoji）────

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: 'people' | 'shield' | 'pin' | 'pulse';
}) {
  return (
    <div className="ds-panel ds-hud group h-full p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/40 md:p-7">
      <span
        className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 transition-colors duration-300 group-hover:bg-cyan-500/20 group-hover:text-cyan-200"
        aria-hidden="true"
      >
        <StatIcon name={icon} />
      </span>
      <div className="font-orbitron text-3xl font-bold text-white md:text-4xl">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-gray-400 md:text-sm">{label}</div>
    </div>
  );
}

function StatIcon({ name }: { name: 'people' | 'shield' | 'pin' | 'pulse' }) {
  const paths: Record<'people' | 'shield' | 'pin' | 'pulse', React.ReactNode> = {
    people: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
      />
    ),
    shield: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    ),
    pin: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    ),
    pulse: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12h4l2.5-7 5 14L17 12h4"
      />
    ),
  };

  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      {paths[name]}
    </svg>
  );
}
