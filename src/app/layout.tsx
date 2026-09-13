// ============================================================================
// 根佈局 — 自治世界 / Root Layout — Autonomous World
// ============================================================================
// 根佈局包裹所有頁面。提供：
// The root layout wraps all pages. It provides:
// - 帶有中繼資料的 HTML 結構 / HTML structure with metadata
// - 深色科技主題的全域樣式 / Global CSS with dark tech theme
// - 字型配置 / Font configuration
// - Auth session provider（供客戶端元件使用）/ Auth session provider (for client components)
//
// 除非另有定義，所有頁面都繼承此佈局。
// All pages inherit this layout unless they define their own.
// ============================================================================

import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/queryClient';

// ─── 中繼資料 / Metadata ──────────────────────────────────────────────────────

/**
 * 站點中繼資料，用於 SEO 和社群分享。 / Site-wide metadata for SEO and social sharing.
 * 需要時可透過 generateMetadata 動態更新。 / Updated dynamically per-page using generateMetadata where needed.
 */
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

/**
 * 根佈局元件。 / Root layout component.
 * 用深色科技主題和全域樣式包裹所有子頁面。 / Wraps all child pages with the dark tech theme and global styles.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased font-sans">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
