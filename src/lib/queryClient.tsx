// ============================================================================
// QueryClient 設定 — TanStack Query / QueryClient Configuration — TanStack Query
// ============================================================================
// 為 Next.js App Router 設定 TanStack Query 的 QueryClient。
// Configures TanStack Query's QueryClient for Next.js App Router.
// 使用 React 19 的 cache 函數確保每個請求都有獨立的 QueryClient。
// Uses React 19's cache function to ensure each request has its own QueryClient.
// ============================================================================

'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── QueryClient 建立 / QueryClient Creation ──────────────────────────────────

/**
 * 建立 QueryClient 的輔助函數。
 * Helper function to create a QueryClient.
 * 設定預設的 staleTime 以避免 SSR 時的立即重新獲取。
 * Sets default staleTime to avoid immediate refetching during SSR.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSR 時設定 staleTime 為 60 秒
        // Set staleTime to 60 seconds for SSR
        staleTime: 60 * 1000,
      },
    },
  });
}

// ─── 瀏覽器端 QueryClient / Browser QueryClient ──────────────────────────────

let browserQueryClient: QueryClient | undefined = undefined;

/**
 * 取得 QueryClient。
 * Get the QueryClient.
 * 在伺服器端總是建立新的，在瀏覽器端重用。
 * Always creates a new one on the server, reuses on the browser.
 */
function getQueryClient() {
  if (typeof window === 'undefined') {
    // 伺服器端：總是建立新的 / Server: always make a new one
    return makeQueryClient();
  } else {
    // 瀏覽器端：重用相同的客戶端 / Browser: reuse the same client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

// ─── Provider 元件 / Provider Component ───────────────────────────────────────

/**
 * TanStack Query Provider 元件。
 * TanStack Query Provider component.
 * 包裝應用程式以提供快取功能。
 * Wraps the application to provide caching functionality.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
