'use client';

// ============================================================================
// 公開世界資料 — 共享輪詢 / Public World Data — Shared Poller
// ============================================================================
// 首頁的即時數字、真實勢力圖與訊號流都要讀同一個世界狀態。三個元件各自
// 輪詢會打出三倍請求，所以在模組層做一個單例 poller：多個訂閱者、一份狀態、
// 一條請求鏈。
// The live numbers, the real faction graph, and the signal feed all read the
// same world state. Three components polling independently would triple the
// request volume, so the poller is a module-level singleton: many subscribers,
// one state, one request chain.
// ============================================================================

import { useEffect, useState } from 'react';
import type { PublicWorldPayload } from '@/lib/publicWorld';

export type PublicWorldStatus = 'loading' | 'ready' | 'empty' | 'error';

export type PublicWorldSnapshot = {
  payload: PublicWorldPayload | null;
  status: PublicWorldStatus;
};

/** 輪詢間隔 / Poll interval */
const POLL_MS = 15_000;

type Listener = (next: PublicWorldSnapshot) => void;

// ─── 單例狀態 / Singleton state ────────────────────────────────────────────

let snapshot: PublicWorldSnapshot = { payload: null, status: 'loading' };
let timer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let subscribers = 0;

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function stop(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  controller?.abort();
  controller = null;
}

function schedule(): void {
  if (subscribers === 0) return;
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    void run();
  }, POLL_MS);
}

async function run(): Promise<void> {
  // 分頁在背景時不打資料庫，只保留計時器
  // Don't hit the database while the tab is hidden; keep the timer alive.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    schedule();
    return;
  }

  controller?.abort();
  controller = new AbortController();

  try {
    const response = await fetch('/api/public/world', {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (response.status === 404) {
      // 世界還沒啟動 / The world has not started yet
      snapshot = { payload: null, status: 'empty' };
    } else if (!response.ok) {
      // 已經有資料就保留舊值：暫時讀不到不該讓頁面變空白
      // Keep the last good payload — a transient failure must not blank the page
      if (snapshot.payload === null) {
        snapshot = { payload: null, status: 'error' };
      }
    } else {
      snapshot = { payload: (await response.json()) as PublicWorldPayload, status: 'ready' };
    }
  } catch (error) {
    if ((error as Error | null)?.name === 'AbortError') {
      schedule();
      return;
    }
    if (snapshot.payload === null) {
      snapshot = { payload: null, status: 'error' };
    }
  }

  emit();
  schedule();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void run();
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * 訂閱公開世界狀態。回傳的 payload 在元件卸載後仍會留在模組層，
 * 重新掛載時立刻拿到上次結果，不會又閃一次載入態。
 * Subscribe to the public world state. The payload survives unmount, so a
 * remount gets the last result immediately instead of flashing a loading state.
 */
export function usePublicWorld(): PublicWorldSnapshot {
  const [state, setState] = useState<PublicWorldSnapshot>(snapshot);

  useEffect(() => {
    const listener: Listener = (next) => setState(next);
    listeners.add(listener);
    subscribers += 1;
    setState(snapshot);

    if (subscribers === 1) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      if (snapshot.status === 'loading' || snapshot.status === 'error') {
        void run();
      } else {
        schedule();
      }
    }

    return () => {
      listeners.delete(listener);
      subscribers -= 1;
      if (subscribers === 0) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        stop();
      }
    };
  }, []);

  return state;
}
