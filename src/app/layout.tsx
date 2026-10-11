// ============================================================================
// 根佈局 — 自治世界 / Root Layout — Autonomous World
// ============================================================================
// 深空科幻主題 / Deep Space Sci-Fi Theme
// ============================================================================

import type { Metadata } from 'next';
import { Orbitron, Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/lib/queryClient';

// ─── 字型配置 / Font Configuration ─────────────────────────────────────────────

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// ─── 中繼資料 / Metadata ──────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'Autonomous World | 自治世界',
    template: '%s | Autonomous World',
  },
  description:
    'An infinitely running autonomous simulation. No victory conditions, only eternal evolution.',
  keywords: ['simulation', 'autonomous', 'game', 'AI', 'world', '自治世界'],
  authors: [{ name: 'Autonomous World' }],
};

// ─── 根佈局 / Root Layout ───────────────────────────────────────────────────

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `data-scroll-behavior="smooth"` 宣告這裡的 `scroll-behavior: smooth` 是有意的，
    // 讓 Next 在路由切換時跳過它——否則換頁會從舊位置平滑捲回去。
    // Next needs this attribute because `html { scroll-behavior: smooth }` is set in
    // globals.css: without it a route change animates the scroll back from the old page.
    <html lang="zh-TW" className="dark" data-scroll-behavior="smooth">
      <body className={`min-h-screen bg-[#020617] text-gray-100 antialiased ${inter.variable} ${orbitron.variable} font-sans`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
