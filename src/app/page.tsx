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
import SlideDots from '@/components/home/SlideDots';
import LiveStats from '@/components/home/LiveStats';
import LiveWorld from '@/components/home/LiveWorld';
import FactionNebula from '@/components/home/FactionNebula';
import OrbitScene from '@/components/home/OrbitScene';
import { RoundPipeline } from '@/components/home/RoundPipeline';
import { EngineLabFigure } from '@/components/home/engine-lab/EngineLabFigure';
import SagaConstellation from '@/components/home/SagaConstellation';
import SignalFeed from '@/components/home/SignalFeed';
import VoidCanvas from '@/components/home/VoidCanvas';
import HeroReticle from '@/components/home/HeroReticle';
import HeroVideo from '@/components/home/HeroVideo';
import { webApplicationJsonLd } from '@/lib/seo';
import { CTA_BASE, CTA_PRIMARY, CTA_SECONDARY, EYEBROW, HAIRLINE, PANEL } from '@/components/home/tokens';

// ─── 導覽 / Navigation ─────────────────────────────────────────────────────
// 錨點順序 = 敘事順序：先證明世界在動，再看世界本身
// Anchor order follows the narrative: prove it is running, then show it
//
// **這份清單是簡報的目錄，不是標頭列的目錄。** 首頁是一疊一屏一屏的簡報，
// 右側的圓點導覽需要每一屏的名字（含標頭列不放的 hero / features / cta），
// 所以一份清單管兩件事：`inHeader` 決定哪幾項同時出現在標頭列，全部都是圓點。
// 分成兩份清單會讓「多了／少了一屏」變成兩邊各自維護的問題。
//
// **This list is the deck's table of contents, not the header row's.** The
// homepage is a deck of one-screen slides, and the right-hand dot rail needs a
// name for every screen — including hero / features / cta, which the header
// row does not carry — so one list serves both: `inHeader` decides which
// entries also appear in the header row, and all of them are dots. Two lists
// would make "a screen was added" a problem to maintain twice.

const SLIDE_LINKS = [
  { href: '#hero', labelKey: 'home.nav.hero', inHeader: false },
  { href: '#live', labelKey: 'home.nav.live', inHeader: true },
  { href: '#world', labelKey: 'home.nav.world', inHeader: true },
  { href: '#features', labelKey: 'home.nav.features', inHeader: false },
  { href: '#how', labelKey: 'home.nav.how', inHeader: true },
  { href: '#orrery', labelKey: 'home.nav.orrery', inHeader: true },
  { href: '#saga', labelKey: 'home.nav.saga', inHeader: true },
  { href: '#cta', labelKey: 'home.nav.cta', inHeader: false },
] as const;

const NAV_LINKS = SLIDE_LINKS.filter((link) => link.inHeader);

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
  // 圓點導覽吃整份目錄 / the dot rail reads the whole table of contents
  const slideLinks = SLIDE_LINKS.map((link) => ({
    href: link.href,
    label: t(link.labelKey),
  }));

  // data-slide-deck 讓 globals.css 的簡報捲動規則只作用在這一頁：
  // 其他頁面（遊戲、登入）完全不受 scroll-snap 影響。
  // data-slide-deck scopes the slide-deck scroll rule in globals.css to this
  // page alone; the game and sign-in pages are untouched by scroll-snap.
  return (
    <div className="relative flex min-h-screen flex-col" data-slide-deck="">
      {/* 結構化資料 / JSON-LD structured data for the application entity */}
      <script
        type="application/ld+json"
        // JSON 作為純資料注入；引用鍵與上下文都由 @/lib/seo 固定
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationJsonLd()) }}
      />
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

      {/* 右側的圓點導覽：這一疊簡報的書籤（md 以上）/
          The right-hand dot rail: this deck's bookmarks (md and up) */}
      <SlideDots slides={slideLinks} label={t('home.nav.slidesLabel')} />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* ── 主視覺 / Hero ───────────────────────────────────────────────── */}
        {/* id="hero" 是給背景場景的暫停錨點，不是樣式用途
            id="hero" is the pause anchor for the backdrop scene, not styling */}
        <section
          id="hero"
          className="relative z-10 flex min-h-svh snap-start snap-always flex-col px-5 pt-12 pb-10 sm:px-6 md:pt-16 md:pb-12"
        >
          {/* my-auto 把文案欄在「扣掉底緣跑馬燈」後的空間裡垂直置中：最下緣的
              訊號流吃 mt-auto，所以中央標高不是 justify-center 的數學，是 margin
              的分配。
              my-auto centers the copy column within the space left over after the
              bottom ticker: the feed takes mt-auto, so the centre height is margin
              distribution, not justify-content's arithmetic. */}
          <div className="mx-auto my-auto grid max-w-6xl items-center gap-9 lg:grid-cols-2 lg:gap-12">
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

                  {/* text-balance：標題換行時把兩行拉平，不留一個字的孤行
                      text-balance evens the two lines instead of leaving a widow */}
                  <h1 className="font-display mb-6 text-balance text-[clamp(2.5rem,7.5vw,4.5rem)] leading-[1.08] font-bold tracking-tight">
                    <span className="gradient-text-hero">{t('general.title')}</span>
                  </h1>

                  <p className="mb-4 max-w-xl text-lg leading-relaxed text-slate-200">
                    {t('home.intro')}
                  </p>
                  <p className="mb-9 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
                    {t('home.description')}
                  </p>

                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <Link href="/signin" className={`${CTA_BASE} ${CTA_PRIMARY}`}>
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
                的軌道核心、#live 的統計格，以及 #orrery 的星儀錶盤呈現。
                No round tag is overlaid here on purpose. The recording is a fixed
                piece of history while the live round is the world's right now;
                stacking them contradicts itself — one says the recorded RND 0000,
                the other says which round it is now. The real round is carried by
                the #how orbit core, the #live stat grid and the dial over at
                #orrery. */}
            <Parallax offset={110} className="min-w-0">
              <div className="relative aspect-[16/9] overflow-hidden rounded-ds-panel border border-ds-line bg-ds-void shadow-ds-hero">
                {/* 裝飾性循環影片的播放規則（reduced-motion 停下、離開視口暫停）
                    收在 HeroVideo 一個地方，不寫在這裡。
                    The decorative loop's playback rules (stop under reduced
                    motion, pause off-screen) live once in HeroVideo. */}
                <HeroVideo
                  className="block size-full object-cover"
                  src="/hero.mp4"
                  poster="/hero-poster.jpg"
                />

                {/* 上重下輕的遮罩：HUD 標籤可讀，中段的產品畫面保持清楚
                    A top-weighted veil: the HUD tag stays readable while the
                    middle of the product view stays clear */}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--ds-panel-strong)_0%,transparent_34%,rgba(2,6,23,0.45)_100%)]" />

                <HeroReticle />
              </div>
            </Parallax>
          </div>

          {/* ── 訊號流（真實事件）：主視覺投影片的底緣。帶子本身滿版出血——
                 影片欄左右原本有 px-5 的留白，這裡用負 margin 蓋回去。
                 ─ The signal feed: the hero slide's bottom edge. The band is
                 full-bleed: the hero carries px-5 page gutters, and a negative
                 margin takes them back. */}
          <div className="-mx-5 mt-auto sm:-mx-6">
            <SignalFeed locale={locale} />
          </div>
        </section>

        {/* ── 即時數字 / Live numbers ────────────────────────────────────── */}
        <section
          id="live"
          className="relative z-10 snap-start snap-always px-5 py-[var(--ds-section-y)] sm:px-6"
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
              <h2 className="font-display text-3xl text-balance font-bold text-white md:text-4xl">
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
          className="relative z-10 flex min-h-svh snap-start snap-always flex-col justify-center border-y border-ds-inset-line bg-ds-inset px-5 py-[var(--ds-section-y)] sm:px-6"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-1 min-w-0 lg:order-2">
              <Reveal>
                <LiveWorld locale={locale} />
              </Reveal>
            </div>

            <Reveal className="order-2 min-w-0 lg:order-1" delay={0.05}>
              <p className={`${EYEBROW} mb-4`}>{t('home.world.eyebrow')}</p>
              <h2 className="font-display text-3xl leading-tight text-balance font-bold text-white md:text-[2.5rem]">
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
        <section
          id="features"
          className="relative z-10 flex min-h-svh snap-start snap-always flex-col justify-center px-5 py-[var(--ds-section-y)] sm:px-6"
        >
          <div className="mx-auto max-w-6xl">
            <Reveal className="mb-12 text-center">
              <p className={`${EYEBROW} mb-4`}>{t('home.featuresSection.eyebrow')}</p>
              <h2 className="font-display text-3xl text-balance font-bold text-white md:text-4xl">
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
                    <h3 className="font-display mb-2.5 text-base font-semibold tracking-wide text-white">
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
          className="relative z-10 snap-start snap-always border-y border-ds-inset-line bg-ds-inset px-5 py-[var(--ds-section-y)] sm:px-6"
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
              <h2 className="font-display text-3xl text-balance font-bold text-white md:text-4xl">
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

            {/* 回合管線：底下那三張卡是敘事，這一張是**真的** 18 個階段 /
                The round pipeline: the three cards below are the narrative; this is
                the **actual** 18 phases */}
            <Reveal className="mb-10">
              {/* 圖文合一：18 站分度台在清單正上方——機器講轉了幾圈、正過哪一站，
                  清單講每一站叫什麼。兩者共用 ROUND_PHASES 單一來源。
                  Text and machine as one: the 18-station table sits directly above the
                  list — the machine says how many turns have run and which station is
                  passing, the list says what each station is called. Both read the
                  ROUND_PHASES single source. */}
              <EngineLabFigure locale={locale} />
            </Reveal>
            <Reveal className="mb-10">
              <RoundPipeline locale={locale} />
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEP_KEYS.map((step, index) => (
                <Reveal key={step.step} delay={index * 0.05} className="h-full">
                  <div className={`${PANEL} h-full p-7 md:p-8`}>
                    <span
                      className="font-display block text-4xl font-bold text-cyan-500/25"
                      aria-hidden="true"
                    >
                      {step.step}
                    </span>
                    <div className="my-5 h-px w-16 bg-[linear-gradient(90deg,transparent,var(--ds-line-cyan),transparent)]" aria-hidden="true" />
                    <h3 className="font-display mb-3 text-lg font-semibold text-white">
                      {t(step.titleKey)}
                    </h3>
                    <p className="text-base leading-relaxed text-slate-400">
                      {t(step.descKey)}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* 明確說出「不做什麼」：沒有劇本、沒有提示、沒有預設的勝負 /
                Say plainly what it does not do: no script, no hints, no scripted
                outcomes */}
            <Reveal delay={0.1} className="mt-8">
              <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-gray-400">
                {t('home.howItWorks.outOfScope')}
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── 發條星儀 / The Roundworks Orrery ────────────────────────────── */}
        {/* 產品模型在這裡這一屏：運作方式講完 18 個階段，接著站到那台機器
            面前看它走。兩欄排版與 #world 同構，地面刻意留空——左右都是有
            照片地面的鄰居，中間需要一屏喘息。
            The product model gets its own slide: after #how lists the 18 phases,
            you stand in front of the machine and watch it turn. Two columns like
            #world; the ground is deliberately left bare — both neighbours carry
            photo grounds, so this slide is the breath between them. */}
        <section
          id="orrery"
          className="relative z-10 flex min-h-svh snap-start snap-always flex-col justify-center px-5 py-[var(--ds-section-y)] sm:px-6"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="order-2 min-w-0 lg:order-1">
              <p className={`${EYEBROW} mb-4`}>{t('home.orrery.eyebrow')}</p>
              <h2 className="font-display text-3xl leading-tight text-balance font-bold text-white md:text-[2.5rem]">
                {t('home.orrery.title')}
              </h2>
              <div
                className="mt-5 h-px w-28 bg-[linear-gradient(90deg,transparent,var(--ds-line-cyan),transparent)]"
                aria-hidden="true"
              />
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 md:text-lg">
                {t('home.orrery.body')}
              </p>

              <div className="mt-8">
                <a
                  href={`/orrery.html?lang=${locale}`}
                  target="_blank"
                  rel="noreferrer"
                  className={CTA_SECONDARY}
                >
                  {t('home.orrery.linkLabel')}
                  {/* 開新視窗要講出來，否則螢幕閱讀器的使用者會被帶離這一頁而
                      沒有任何預告。視覺上只留一個 sr-only。
                      A new tab has to be announced, or a screen-reader user is
                      taken away from this page with no warning. */}
                  <span className="sr-only"> {t('home.orrery.linkHint')}</span>
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

            {
              // 互動模型：拖曳／方向鍵上弦；wheel 事件沒有在模型頁被攔截，
              // 捲過框框時滾輪仍會鏈回簡報本體。遮罩只留 reticle——模型自己
              // 的 RND 錶盤就是產品的一部分。
              // The interactive model: drag / arrow keys to wind. The model page
              // does not intercept wheel events, so scrolling over the frame
              // still chains into the deck above it. Only the reticle veils it —
              // the model's own RND dial is part of the product.
            }
            <div className="order-1 min-w-0 lg:order-2">
              <Reveal>
                <div className="relative aspect-[16/9] overflow-hidden rounded-ds-panel border border-ds-line bg-ds-void shadow-ds-hero">
                  <iframe
                    className="block size-full"
                    src={`/orrery.html?embed=1&lang=${locale}`}
                    title={t('home.orrery.frameTitle')}
                    loading="lazy"
                  />
                  <HeroReticle />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── 傳奇星座 / Faction saga constellation ─────────────────────────── */}
        {/* 靜態照片地面：捲動繪製只留給星座本身，背景不做視差
             A static photo ground: scroll-driven drawing belongs to the
             constellation alone, the backdrop does not parallax */}
        <section
          id="saga"
          className="relative z-10 min-h-svh snap-start snap-always overflow-hidden px-5 py-20 sm:px-6 md:py-28"
        >
          <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            {/* 裝飾性背景，刻意裁切 / decorative backdrop, deliberately cropped */}
            <Image src="/space/deep-field.jpg" alt="" fill sizes="100vw" className="object-cover opacity-[0.32] saturate-[1.05]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/85 to-[#020617]" />
          </div>

          <div className="relative mx-auto max-w-6xl">
            <Reveal className="mb-12 text-center">
              <p className={`${EYEBROW} mb-4`}>{t('home.saga.eyebrow')}</p>
              <h2 className="font-display text-3xl text-balance font-bold text-white md:text-4xl">
                {t('home.saga.title')}
              </h2>
              <div className={`${HAIRLINE} mx-auto mt-5`} aria-hidden="true" />
            </Reveal>

            <SagaConstellation locale={locale} />
          </div>
        </section>

        {/* ── 行動呼籲 / CTA ───────────────────────────────────────────────── */}
        <section
          id="cta"
          className="relative z-10 flex min-h-svh snap-start snap-always flex-col justify-center overflow-hidden px-5 py-20 text-center sm:px-6 md:py-28"
        >
          <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <Image src="/space/cosmic-cliffs.jpg" alt="" fill sizes="100vw" className="object-cover opacity-[0.32] saturate-[1.05]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617]/80 to-[#020617]" />
          </div>

          <Reveal className="relative mx-auto max-w-3xl">
            <p className={`${EYEBROW} mb-5`}>{t('home.cta.eyebrow')}</p>
            <h2 className="font-display text-3xl text-balance font-bold text-white md:text-5xl">
              {t('home.cta.title')}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-200 md:text-lg">
              {t('home.cta.body')}
            </p>

            <div className="mt-10 flex justify-center">
              <Link
                href="/signin"
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
      {/* snap-end 讓「捲到文件最底」本身就是一個合法停點，簡報不會在最後一屏
          彈回上一頁。snap-end makes "scrolled to the very end" itself a valid
          rest point, so the deck cannot bounce off the closing slide. */}
      <footer className="relative z-10 snap-end border-t border-white/5 px-5 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="font-display mb-1 block text-ds-label font-semibold tracking-[0.2em] text-slate-200 uppercase">
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
