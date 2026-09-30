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

import { useSyncExternalStore } from 'react';
import type { PublicWorldPayload } from '@/lib/publicWorld';

export type PublicWorldStatus = 'loading' | 'ready' | 'empty' | 'error';

export type PublicWorldSnapshot = {
  payload: PublicWorldPayload | null;
  status: PublicWorldStatus;
};

/** 輪詢間隔 / Poll interval */
const POLL_MS = 15_000;

type Listener = () => void;

// ─── 單例狀態 / Singleton state ────────────────────────────────────────────

let snapshot: PublicWorldSnapshot = { payload: null, status: 'loading' };
let timer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let subscribers = 0;

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
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

// ─── Store 介面 / Store interface ──────────────────────────────────────────
// useSyncExternalStore 需要的兩個函式。訂閱者數與輪詢啟停仍由模組層管理，
// React 只負責何時重新渲染。
// The two functions useSyncExternalStore needs. The subscriber count and the
// polling lifecycle stay here in the module; React only decides when to render.

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  subscribers += 1;

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
}

/**
 * 讀取目前快照。emit() 之間必須保持同一個參考物件，否則 React 會無限重繪。
 * Read the current snapshot. The reference must stay identical between emits,
 * otherwise React re-renders forever.
 */
function getSnapshot(): PublicWorldSnapshot {
  return snapshot;
}

/** 伺服器渲染時模組狀態就是初始值，兩邊一致以避免 hydration 不一致 / The module starts in its loading state on the server too, so hydration matches */
function getServerSnapshot(): PublicWorldSnapshot {
  return snapshot;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * 訂閱公開世界狀態。回傳的 payload 在元件卸載後仍會留在模組層，
 * 重新掛載時立刻拿到上次結果，不會又閃一次載入態。
 * Subscribe to the public world state. The payload survives unmount, so a
 * remount gets the last result immediately instead of flashing a loading state.
 *
 * 這是一個標準的外部 store，所以用 useSyncExternalStore：React 會自行處理
 * 「掛載時補一次快照」與競態，不需要在 effect 裡同步 setState。
 * This is a textbook external store, so it uses useSyncExternalStore: React
 * handles the mount-time snapshot sync and races itself, so no state is set
 * synchronously inside an effect.
 */
export function usePublicWorld(): PublicWorldSnapshot {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return state;
}
