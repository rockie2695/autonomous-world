'use client';

// ============================================================================
// 變化閃爍 / Change Flash
// ============================================================================
// 輪詢資料更新時，讓「哪幾個數字變了」在畫面上短暫閃一下（數字彈一下＋場景生長），
// 讓看的人一眼知道哪裡變動。首頁有兩處用同一套邏輯（勢力星雲與即時數字），
// 所以抽成一個 hook。
// When polled data changes, briefly flag which numbers moved so the eye catches
// it (the figure bumps and the cloud grows). Two homepage widgets need the same
// behaviour — the faction nebula and the live figures — so it lives in one hook.
// ============================================================================

import { useEffect, useState } from 'react';

/** 穩定的空集合：避免每次 render 都換參考而讓 effect 反覆重跑 / Stable empty set so the effect does not re-run on identity churn */
const NO_CHANGES: ReadonlySet<string> = new Set();

/**
 * 追蹤一組數字，並回傳「這一輪哪些 key 變了」。
 * Track a set of numbers and report which keys changed on the latest update.
 *
 * 比對發生在 **render 期間**（React 官方的「調整 state」寫法），不是 effect 裡——
 * 在 effect 主體同步 setState 會造成多一次 cascade render，也違反
 * `react-hooks/set-state-in-effect`。effect 只留計時器，setState 在 callback 裡。
 * The diff runs **during render** (React's documented "adjust state" pattern)
 * rather than in an effect: setting state synchronously in an effect body costs
 * an extra cascading render and trips `react-hooks/set-state-in-effect`. Only
 * the timer stays in the effect, with its setState inside the async callback.
 *
 * @param snapshot - 本輪的數字；必須在資料沒變時維持同一個參考（用 useMemo 包）/ This round's numbers; keep the same reference while the data is unchanged (wrap it in useMemo)
 * @param flashMs - 標記維持多久（毫秒）/ How long the flag lasts (ms)
 * @param skipNewKeys - 新出現的 key 不算變化（它沒有舊值可比較）/ A brand-new key is not a change — it has no previous value
 * @returns 這一輪變化的 key 集合 / The keys that changed this round
 */
export function useChangedKeys(
  snapshot: Record<string, number> | null,
  flashMs: number,
  skipNewKeys = false
): ReadonlySet<string> {
  const [tracked, setTracked] = useState<{
    snapshot: Record<string, number> | null;
    changed: ReadonlySet<string>;
  }>({ snapshot: null, changed: NO_CHANGES });

  if (snapshot !== tracked.snapshot) {
    const before = tracked.snapshot;
    const changed = new Set<string>();
    // 第一次拿到資料時不閃：沒有舊值可比較 / No flash on the first load — nothing to compare against
    if (before && snapshot) {
      for (const [key, value] of Object.entries(snapshot)) {
        if (skipNewKeys && before[key] === undefined) continue;
        if (before[key] !== value) changed.add(key);
      }
    }
    setTracked({ snapshot, changed });
  }

  useEffect(() => {
    if (tracked.changed.size === 0) return;
    const timer = setTimeout(() => {
      setTracked((prev) => ({ ...prev, changed: NO_CHANGES }));
    }, flashMs);
    return () => clearTimeout(timer);
  }, [tracked.changed, flashMs]);

  return tracked.changed;
}
