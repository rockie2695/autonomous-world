// ============================================================================
// 首頁 — 自治世界 / Homepage — Autonomous World
// ============================================================================
// 深空科幻主題 v4 / Deep Space Sci-Fi Theme v4
// 方向：觀測者日誌 —— 用硬科幻的儀表語言，觀測一個本身帶奇幻質感的對象。
// Direction: an observer's log — hard-sci-fi instrument language wrapped around
// a subject that is itself slightly arcane.
//
// v3 換掉了假數字，v4 換掉假背景。地面不再是「貼了星星的深藍底」，而是一個
// 真的在那裡的天體；hero 的產品畫面被 HUD 框住，讀成「透過儀器拍到的」；
// 傳奇段換成一張會畫出來的星圖。三個表面各司其職，沒有第四個搶焦點的物件。
// v3 replaced the fake numbers; v4 replaces the fake ground. The backdrop is a
// real body rather than a dark blue wall with stars on it, the hero product
// view is framed as instrument capture, and the saga section became a star
// chart that draws itself. Three surfaces, each with one job — and
// deliberately no fourth object competing for the eye.
//
// 這支檔案維持 server component：auth() 轉向、cookie 語系解析與所有靜態內容
// 都在 server 端完成；只有即時資料、導覽互動與星圖繪製是 client island。
// This file stays a server component: the auth() redirect, cookie-based locale
// resolution, and all static content run on the server; only live data,
// navigation interaction, and the chart's drawing are client islands.
// ============================================================================

import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createTranslator, DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/i18n';
import { Parallax, Reveal } from '@/components/home/Motion';
import HomeNav from '@/components/home/HomeNav';
import LiveStats from '@/components/home/LiveStats';
import LiveWorld from '@/components/home/LiveWorld';
import FactionNebula from '@/components/home/FactionNebula';
import OrbitScene from '@/components/home/OrbitScene';
import SagaConstellation from '@/components/home/SagaConstellation';
import SignalFeed from '@/components/home/SignalFeed';
import VoidCanvas from '@/components/home/VoidCanvas';
import HeroReticle from '@/components/home/HeroReticle';
import { CTA_BASE, CTA_PRIMARY, CTA_SECONDARY, EYEBROW, HAIRLINE, PANEL } from '@/components/home/tokens';

// ─── 導覽 / Navigation ─────────────────────────────────────────────────────
// 錨點順序 = 敘事順序：先證明世界在動，再看世界本身
// Anchor order follows the narrative: prove it is running, then show it

const NAV_LINKS = [
  { href: '#live', labelKey: 'home.nav.live' },
  { href: '#world', labelKey: 'home.nav.world' },
  { href: '#how', labelKey: 'home.nav.how' },
  { href: '#saga', labelKey: 'home.nav.saga' },
] as const;

// ─── 特色資料 / Feature data ────────────────────────────────────────────────

const FEATURES: { titleKey: string; descKey: string; icon: React.ReactNode }[] = [
  {
    titleKey: 'home.features.autonomous',
    descKey: 'home.features.autonomousDesc',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.729-3.559"
        />
      </svg>
    ),
  },
  {
    titleKey: 'home.features.realtime',
    descKey: 'home.features.realtimeDesc',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    titleKey: 'home.features.infinite',
    descKey: 'home.features.infiniteDesc',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"
        />
      </svg>
    ),
  },
  {
    titleKey: 'home.features.noVictory',
    descKey: 'home.features.noVictoryDesc',
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621-.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.996.188-1.676.32-2.228.401C6.441 4.692 6 5.23 6 5.824v1.06c0 1.02.187 1.988.512 2.863M18.75 4.236c.996.188 1.676.32 2.228.401C17.559 4.692 18 5.23 18 5.824v1.06c0 1.02-.187 1.988-.512 2.863M12 2.25A4.5 4.5 0 0 1 16.5 6.75v1.5a4.5 4.5 0 0 1-9 0v-1.5A4.5 4.5 0 0 1 12 2.25Z"
        />
      </svg>
    ),
  },
];

// ─── 運作步驟 / How-it-works steps ─────────────────────────────────────────

const STEP_KEYS = [
  { step: '01', titleKey: 'home.howItWorks.step1', descKey: 'home.howItWorks.step1Desc' },
  { step: '02', titleKey: 'home.howItWorks.step2', descKey: 'home.howItWorks.step2Desc' },
  { step: '03', titleKey: 'home.howItWorks.step3', descKey: 'home.howItWorks.step3Desc' },
] as const;

// ─── 語系解析 / Locale resolution ───────────────────────────────────────────

/**
 * server component 拿不到 localStorage，只能從 cookie 與 Accept-Language 判斷。
 * 優先序與 client 端 getLocale() 一致：cookie > 瀏覽器語言 > 預設。
 * A server component cannot read localStorage, so the locale comes from the
 * cookie and Accept-Language. Same precedence as the client-side getLocale():
 * cookie > browser language > default.
 */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get('autonomous-world-locale')?.value;
  if (fromCookie && LOCALES.includes(fromCookie as Locale)) {
    return fromCookie as Locale;
  }

  const accept = (await headers()).get('accept-language') ?? '';
  if (accept.toLowerCase().startsWith('zh')) return 'zh';

  return DEFAULT_LOCALE;
}

// ─── 頁面元件 / Page Component ──────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect('/game');
  }

  const locale = await resolveLocale();
  const t = createTranslator(locale);

  const navLinks = NAV_LINKS.map((link) => ({ href: link.href, label: t(link.labelKey) }));

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* ── 背景天體 / Backdrop body ─────────────────────────────────────────
          固定全視窗、純裝飾。VoidScene 自己用 IntersectionObserver 盯著
          #hero，捲出畫面就停幀。
          Fixed, full-viewport, purely decorative. VoidScene watches #hero with
          an IntersectionObserver and stops its frame loop once it scrolls away. */}
      <VoidCanvas />

      {/* 跳過導覽 / Skip navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-cyan-400 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#020617]"
      >
        跳至主要內容
      </a>

      <HomeNav
        locale={locale}
        links={navLinks}
        enterLabel={t('home.nav.enter')}
        brandLabel={t('general.title')}
      />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* ── 主視覺 / Hero ───────────────────────────────────────────────── */}
        {/* id="hero" 是給背景場景的暫停錨點，不是樣式用途
            id="hero" is the pause anchor for the backdrop scene, not styling */}
        <section
          id="hero"
          className="relative z-10 scroll-mt-20 px-5 pt-12 pb-14 sm:px-6 md:pt-16 md:pb-20"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-9 lg:grid-cols-2 lg:gap-12">
            {/* 文案欄 / copy column */}
            <Parallax offset={20} className="min-w-0">
              {/* 天體的輝光會漫到文案後方，這層局部遮罩把可讀性拿回來
                  The body's glow reaches behind the copy; this local scrim takes
                  legibility back without flattening the whole backdrop */}
              <div className="relative">
                <div
                  className="pointer-events-none absolute -inset-x-6 -inset-y-8 bg-[radial-gradient(ellipse_70%_60%_at_30%_50%,rgba(2,6,23,0.88)_0%,rgba(2,6,23,0.5)_55%,transparent_100%)]"
                  aria-hidden="true"
                />

                <div className="relative">
                  <p className={`${EYEBROW} mb-5`}>{t('home.hero.eyebrow')}</p>

                  <h1 className="font-orbitron mb-6 text-[clamp(2.5rem,7.5vw,4.5rem)] leading-[1.08] font-bold tracking-tight">
                    <span className="gradient-text-hero">{t('general.title')}</span>
                  </h1>

                  <p className="mb-4 max-w-xl text-lg leading-relaxed text-slate-200">
                    {t('home.intro')}
                  </p>
                  <p className="mb-9 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
                    {t('home.description')}
                  </p>

                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <Link href="/api/auth/signin" className={`${CTA_BASE} ${CTA_PRIMARY}`}>
                      <span>{t('home.startButton')}</span>
                      <svg
                        className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>

                    <a href="#world" className={CTA_SECONDARY}>
                      {t('home.hero.secondaryCta')}
                      <svg
                        className="size-4 transition-transform duration-300"
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
                </div>
              </div>
            </Parallax>

            {/* 產品視覺 / product view。
                框的比例 16/9 來自量測過的 public/hero-poster.jpg（1280×720），
                所以 object-fit 不會切掉任何畫面內容。
                The 16:9 frame ratio comes from the measured 1280×720 poster, so
                object-fit crops nothing meaningful.

                這裡刻意沒有疊任何回合標籤。錄影是一段固定的歷史，而 LiveRound
                顯示的是此刻的真實回合；兩者疊在一起會自相矛盾——一個寫著錄影
                當時的 RND 0000，另一個寫著世界現在第幾回合。真實回合改由 #how
                的軌道核心與 #live 的統計格呈現。
                No round tag is overlaid here on purpose. The recording is a fixed
                piece of history while the live round is the world's right now;
                stacking them contradicts itself — one says the recorded RND 0000,
                the other says which round it is now. The real round is carried by
                the #how orbit core and the #live stat grid instead. */}
            <Parallax offset={110} className="min-w-0">
              <div className="relative aspect-[16/9] overflow-hidden rounded-ds-panel border border-ds-line bg-ds-void shadow-ds-hero">
                <video
                  className="block size-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/hero-poster.jpg"
                  aria-hidden="true"
                >
                  <source src="/hero.mp4" type="video/mp4" />
                </video>

                {/* 上重下輕的遮罩：HUD 標籤可讀，中段的產品畫面保持清楚
                    A top-weighted veil: the HUD tag stays readable while the
                    middle of the product view stays clear */}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--ds-panel-strong)_0%,transparent_34%,rgba(2,6,23,0.45)_100%)]" />

                <HeroReticle />
              </div>
            </Parallax>
          </div>
        </section>

        {/* ── 訊號流（真實事件）/ Signal feed, real events ──────────────────── */}
        <SignalFeed locale={locale} />

        {/* ── 即時數字 / Live numbers ────────────────────────────────────── */}
        <section
          id="live"
          className="relative z-10 scroll-mt-20 px-5 py-[var(--ds-section-y)] sm:px-6"
        >
          <div className="ds-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          {/* 星雲帶底部的星雲地面：星雲是扁的，所以用同樣扁的構圖當它的地面
              A nebula ground under the nebula band: the clouds are flat, so the
              ground beneath them is composed the same way */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <Image
              src="/space/veil-nebula.jpg"
              alt=""
              fill
              sizes="100vw"
              // 這段從 y≈583 開始、鋪滿 1212px，與首屏重疊 ~317px，
              // 是首頁的 LCP 元素 → 不要延遲載入 /
              // Starts at y≈583 and spans 1212px, so it overlaps the first screen
              // by ~317px and is the homepage's LCP element — don't defer it
              loading="eager"
              className="object-cover opacity-[0.2] saturate-[0.95]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/90 to-[#020617]" />
          </div>
          <div className="relative mx-auto max-w-6xl">
            <Reveal className="mb-10 max-w-2xl">
              <p className={`${EYEBROW} mb-4`}>{t('home.live.eyebrow')}</p>
              <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
                {t('home.live.title')}
              </h2>
              <div className={`${HAIRLINE} mt-5`} aria-hidden="true" />
              <p className="mt-5 text-base leading-relaxed text-slate-400 md:text-lg">
                {t('home.live.hint')}
              </p>
            </Reveal>

            <Reveal delay={0.05}>
              <LiveStats locale={locale} />
            </Reveal>

            {/* 勢力星雲：數字之下的密度視圖。片數與光點數都來自真實資料——
                勢力各自擁有的據點越多，那一片就真的越大。
                The faction nebula: a density view beneath the numbers. Both the
                number of clouds and their point counts come from real data — the
                more settlements a faction holds, the larger its cloud really is. */}
            <Reveal delay={0.1} className="mt-10">
              <FactionNebula locale={locale} />
            </Reveal>
          </div>
        </section>

        {/* ── 真實世界圖譜 / Real world graph ────────────────────────────── */}
        <section
          id="world"
          className="relative z-10 scroll-mt-20 border-y border-ds-inset-line bg-ds-inset px-5 py-[var(--ds-section-y)] sm:px-6"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-1 min-w-0 lg:order-2">
              <Reveal>
                <LiveWorld locale={locale} />
              </Reveal>
            </div>

            <Reveal className="order-2 min-w-0 lg:order-1" delay={0.05}>
              <p className={`${EYEBROW} mb-4`}>{t('home.world.eyebrow')}</p>
              <h2 className="font-orbitron text-3xl leading-tight font-bold text-white md:text-[2.5rem]">
                {t('home.world.title')}
              </h2>
              <div
                className="mt-5 h-px w-28 bg-[linear-gradient(90deg,transparent,var(--ds-line-cyan),transparent)]"
                aria-hidden="true"
              />
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
                {t('home.world.body')}
              </p>

              <div className="mt-8">
                <a href="#how" className={CTA_SECONDARY}>
                  {t('home.world.cta')}
                  <svg
                    className="size-4 transition-transform duration-300"
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

        {/* ── 特色 / Features ─────────────────────────────────────────────── */}
        <section className="relative z-10 px-5 py-[var(--ds-section-y)] sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal className="mb-12 text-center">
              <p className={`${EYEBROW} mb-4`}>{t('home.featuresSection.eyebrow')}</p>
              <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
                {t('home.featuresSection.title')}
              </h2>
              <div className={`${HAIRLINE} mx-auto mt-5`} aria-hidden="true" />
            </Reveal>

            <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, index) => (
                <Reveal key={feature.titleKey} delay={index * 0.05} className="h-full">
                  {/* 角框拿掉了：七張卡各掛一組裝飾括號是沒有理由的裝飾
                      The corner brackets are gone: seven cards each wearing
                      decorative brackets was ornament with no justification */}
                  <div className={`${PANEL} group h-full p-6 transition-colors duration-300 hover:border-cyan-400/40 md:p-7`}>
                    <div className="mb-5 flex size-11 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 transition-colors duration-300 group-hover:bg-cyan-500/20 group-hover:text-cyan-200">
                      {feature.icon}
                    </div>
                    <h3 className="font-orbitron mb-2.5 text-base font-semibold tracking-wide text-white">
                      {t(feature.titleKey)}
                    </h3>
                    <p className="text-base leading-relaxed text-slate-400">
                      {t(feature.descKey)}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 運作方式 / How it works ──────────────────────────────────────── */}
        <section
          id="how"
          className="relative z-10 scroll-mt-20 border-y border-ds-inset-line bg-ds-inset px-5 py-[var(--ds-section-y)] sm:px-6"
        >
          <div className="mx-auto max-w-6xl">
            {/* 照片地面：刻意壓到 0.18，只給軌道一個深度感，不搶軌道的線
                Photo ground: held at 0.18, it only gives the orbit depth and
                never competes with its lines */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
              <Image
                src="/space/pillars-of-creation.jpg"
                alt=""
                fill
                sizes="100vw"
                className="object-cover opacity-[0.18] saturate-[0.9]"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/92 to-[#020617]" />
            </div>

            <Reveal className="mb-12 text-center">
              <p className={`${EYEBROW} mb-4`}>{t('home.howItWorks.eyebrow')}</p>
              <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
                {t('home.howItWorks.title')}
              </h2>
              <div className={`${HAIRLINE} mx-auto mt-5`} aria-hidden="true" />
            </Reveal>

            {/* 回合演算軌道：核心是真實回合數，外圍三顆衛星對應下面三個階段。
                這是這一區唯一會動的東西，步驟名稱仍然只由下面的 HTML 卡片承載。
                The round-compute orbit: a core carrying the real round number,
                with three satellites matching the three stages below. It is the
                only moving thing in this section, and the step names stay carried
                by the HTML cards. */}
            <Reveal className="mb-14">
              <OrbitScene label={t('home.howItWorks.orbitLabel')} />
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEP_KEYS.map((step, index) => (
                <Reveal key={step.step} delay={index * 0.05} className="h-full">
                  <div className={`${PANEL} h-full p-7 md:p-8`}>
                    <span
                      className="font-orbitron block text-4xl font-bold text-cyan-500/25"
                      aria-hidden="true"
                    >
                      {step.step}
                    </span>
                    <div className="my-5 h-px w-16 bg-[linear-gradient(90deg,transparent,var(--ds-line-cyan),transparent)]" aria-hidden="true" />
                    <h3 className="font-orbitron mb-3 text-lg font-semibold text-white">
                      {t(step.titleKey)}
                    </h3>
                    <p className="text-base leading-relaxed text-slate-400">
                      {t(step.descKey)}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 傳奇星座 / Faction saga constellation ─────────────────────────── */}
        {/* 靜態照片地面：捲動繪製只留給星座本身，背景不做視差
             A static photo ground: scroll-driven drawing belongs to the
             constellation alone, the backdrop does not parallax */}
        <section
          id="saga"
          className="relative z-10 scroll-mt-20 overflow-hidden px-5 py-20 sm:px-6 md:py-28"
        >
          <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            {/* 裝飾性背景，刻意裁切 / decorative backdrop, deliberately cropped */}
            <Image src="/space/deep-field.jpg" alt="" fill sizes="100vw" className="object-cover opacity-[0.32] saturate-[1.05]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/85 to-[#020617]" />
          </div>

          <div className="relative mx-auto max-w-6xl">
            <Reveal className="mb-12 text-center">
              <p className={`${EYEBROW} mb-4`}>{t('home.saga.eyebrow')}</p>
              <h2 className="font-orbitron text-3xl font-bold text-white md:text-4xl">
                {t('home.saga.title')}
              </h2>
              <div className={`${HAIRLINE} mx-auto mt-5`} aria-hidden="true" />
            </Reveal>

            <SagaConstellation locale={locale} />
          </div>
        </section>

        {/* ── 行動呼籲 / CTA ───────────────────────────────────────────────── */}
        <section className="relative z-10 overflow-hidden px-5 py-20 text-center sm:px-6 md:py-28">
          <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <Image src="/space/cosmic-cliffs.jpg" alt="" fill sizes="100vw" className="object-cover opacity-[0.32] saturate-[1.05]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/80 to-[#020617]" />
          </div>

          <Reveal className="relative mx-auto max-w-3xl">
            <p className={`${EYEBROW} mb-5`}>{t('home.cta.eyebrow')}</p>
            <h2 className="font-orbitron text-3xl font-bold text-white md:text-5xl">
              {t('home.cta.title')}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-200 md:text-lg">
              {t('home.cta.body')}
            </p>

            <div className="mt-10 flex justify-center">
              <Link
                href="/api/auth/signin"
                className={`${CTA_BASE} ${CTA_PRIMARY} px-10 text-base shadow-[0_0_40px_rgba(34,211,238,0.35)] hover:shadow-[0_0_60px_rgba(34,211,238,0.55)]`}
              >
                <span>{t('home.startButton')}</span>
                <svg
                  className="size-5 transition-transform duration-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ── 頁尾 / Footer ──────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 px-5 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="font-orbitron mb-1 block text-ds-label font-semibold tracking-[0.2em] text-slate-200 uppercase">
                {t('general.title')}
              </p>
              <p className="block text-ds-label leading-[1.6] text-slate-400">
                {t('home.footer.tagline')}
              </p>
              <p className="mt-2 block text-ds-label leading-[1.6] text-slate-400">
                {t('home.footer.credits')}
              </p>
            </div>
            <div>
              <p className="mb-1 block text-ds-label font-semibold tracking-[0.06em] text-slate-200">
                {t('home.footer.runTitle')}
              </p>
              <p className="block text-ds-label leading-[1.6] text-slate-400">
                {t('home.footer.runHint')}
              </p>
            </div>
            <div>
              <p className="mb-1 block text-ds-label font-semibold tracking-[0.06em] text-slate-200">
                {t('home.footer.licenseTitle')}
              </p>
              <p className="block text-ds-label leading-[1.6] text-slate-400">
                {t('home.footer.license')}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
