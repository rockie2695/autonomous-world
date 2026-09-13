// ============================================================================
// 首頁 — 自治世界 / Homepage — Autonomous World
// ============================================================================
// 遊戲介紹和登入的登陸頁面。
// The landing page with game introduction and login.
// 特色：
// Features:
// - 深色科技美學，搭配漸層點綴 / Dark tech aesthetic with gradient accents
// - 突出關鍵面向的特色卡片 / Feature cards highlighting key aspects
// - Google OAuth 登入按鈕 / Google OAuth login button
// - 行動版和桌面版的響應式設計 / Responsive design for mobile and desktop
// ============================================================================

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

// ─── 頁面元件 / Page Component ────────────────────────────────────────────────

/**
 * 首頁元件。 / Homepage component.
 * 如果已登入，導向 /game。 / If already logged in, redirects to /game.
 * 否則顯示登入按鈕的登陸頁面。 / Otherwise shows the landing page with login button.
 */
export default async function HomePage() {
  // 檢查使用者是否已登入 / Check if user is already logged in
  const session = await auth();

  // 已認證則導向遊戲 / Redirect to game if authenticated
  if (session?.user) {
    redirect('/game');
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── 標頭 / Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500" />
          <span className="font-bold text-lg">自治世界</span>
        </div>
        <Link
          href="/api/auth/signin"
          className="btn btn-primary"
        >
          使用 Google 登入
        </Link>
      </header>

      {/* ── 標題區塊 / Hero Section ────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        {/* 標題 / Title */}
        <h1 className="text-5xl md:text-7xl font-bold mb-6 gradient-text">
          自治世界
        </h1>

        {/* 副標題 / Subtitle */}
        <p className="text-xl md:text-2xl text-gray-400 mb-4 max-w-2xl">
          一個無限運行的自主模擬世界
        </p>

        {/* 描述 / Description */}
        <p className="text-gray-500 mb-12 max-w-xl">
          觀看數百個 AI 角色在動態地圖上建立勢力、征戰、結盟、背叛。
          沒有勝利條件，只有永恆的演化。
        </p>

        {/* 特色卡片 / Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl w-full">
          <FeatureCard
            icon="🌐"
            title="完全自主運行"
            description="世界自行演化，無需人工干預"
          />
          <FeatureCard
            icon="⚡"
            title="即時模擬"
            description="每回合自動計算所有事件"
          />
          <FeatureCard
            icon="♾️"
            title="無限世界"
            description="沒有終點，只有持續的變化"
          />
        </div>

        {/* 登入按鈕 / Login Button */}
        <Link
          href="/api/auth/signin"
          className="btn btn-primary text-lg px-8 py-3"
        >
          進入世界
        </Link>
      </section>

      {/* ── 頁尾 / Footer ──────────────────────────────────────────────────────── */}
      <footer className="px-6 py-4 text-center text-gray-600 text-sm">
        <p>自治世界 — 永恆演化的模擬 / A simulation of eternal evolution</p>
      </footer>
    </main>
  );
}

// ─── 特色卡片元件 / Feature Card Component ────────────────────────────────────────

/**
 * 突出遊戲關鍵特色的卡片。 / A card highlighting a key feature of the game.
 */
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="card text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}
