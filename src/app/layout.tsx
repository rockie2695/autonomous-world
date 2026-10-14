// ============================================================================
// 根佈局 — 自治世界 / Root Layout — Autonomous World
// ============================================================================
// 深空科幻主題 / Deep Space Sci-Fi Theme
// ============================================================================

import type { Metadata } from 'next';
import { Chakra_Petch, Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/lib/queryClient';

// ─── 字型配置 / Font Configuration ─────────────────────────────────────────────

// 顯示字型 / The display face.
//
// 這裡原本是 Orbitron。它在這個介面上「不清楚」不是主觀問題，而是結構性的：Orbitron
// 字幅很寬、x-height 低、字形切角又特殊，所以它最常出現的地方——事件列標頭、圖表刻度、
// RND 計數、eyebrow 標籤，都是 11–13px 的小字——在那些尺寸下筆畫會糊成一團。
//
// This was Orbitron, and its illegibility here was structural rather than a matter of
// taste: it is very wide, has a low x-height and unusual geometric cuts, and it spends
// most of its life at 11-13px in this UI — event-log headers, chart ticks, the RND
// counter, eyebrow labels — where those traits smear into each other.
//
// Chakra Petch 保留科幻的方正感，但切角是「刀」而不是「面」，筆畫對比更高、字幅更窄，
// 所以同樣尺寸下每個字母都還認得出來；斜切的收尾也帶一點武備感，剛好補上奇幻那一半。
// 它只有 latin，所以中文一律落到 PingFang TC——這和舊設定相同，不是新問題。
//
// Chakra Petch keeps the squarish sci-fi feel, but its terminals are blade cuts rather
// than facets, the stroke contrast is higher and the letterforms are narrower, so each
// letter still separates at those same small sizes. The angled cuts also read as
// martial, which supplies the fantasy half. It is latin-only, so CJK falls back to
// PingFang TC exactly as before — not a new problem.
const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
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
      <body className={`min-h-screen bg-[#020617] text-gray-100 antialiased ${inter.variable} ${display.variable} font-sans`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
