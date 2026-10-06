'use client';

// ============================================================================
// 真實勢力圖外框 / Real Faction Graph Frame
// ============================================================================
// three.js 場景只能在瀏覽器跑，所以用 dynamic + ssr:false 延後載入。
// 外框同時負責無障礙語意：畫布本身對讀螢幕軟體無意義，圖表說明文字放在
// role="img" 的兄弟位置而不是裡面，否則 aria-label 會把說明文字吃掉。
// The three.js scene can only run in the browser, so it is loaded through
// dynamic + ssr:false. The frame also carries the accessibility semantics:
// the canvas means nothing to a screen reader, and the truncation note sits
// outside role="img" so it is not swallowed by the aria-label.
// ============================================================================

import dynamic from 'next/dynamic';
import { SKELETON } from './tokens';
import type { PublicPlace, PublicRoad } from '@/lib/publicWorld';

type WorldGraphProps = {
  places: PublicPlace[];
  roads: PublicRoad[];
  /** factionId → 資料庫色票 / factionId → database colour */
  colors: Record<string, string>;
  /** 圖表的無障礙說明 / accessible description of the graph */
  label: string;
  /** 下采樣說明（資料被截斷時才出現）/ shown only when the graph was down-sampled */
  note?: string;
};

const WorldGraphScene = dynamic(() => import('./WorldGraphScene'), {
  ssr: false,
  loading: () => (
    // 絕不只顯示裸 spinner / never a bare spinner
    <div className={`${SKELETON} size-full rounded-ds-panel`} aria-hidden="true" />
  ),
});

// 艦隊層與圖譜同一組資料、同一段純邏輯（`battleFleet.ts`），只是用 3D 的方式畫。
// 同樣 ssr:false，因為 three.js 只能在瀏覽器跑。/
// The fleet layer runs the same pure logic (`battleFleet.ts`) over the same data,
// drawn in 3D instead. Also ssr:false, since three.js is browser-only.
const FleetScene = dynamic(() => import('./FleetScene'), { ssr: false });

export default function WorldGraph({ places, roads, colors, label, note }: WorldGraphProps) {
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-ds-panel border border-ds-line bg-ds-void">
      <div role="img" aria-label={label} className="size-full">
        <WorldGraphScene places={places} roads={roads} colors={colors} />
        {/* 艦隊壓在圖譜之上：它是氣氛，所以 aria-hidden 且不吃指標事件。/
            The fleet sits above the graph: it is atmosphere, so it is aria-hidden
            and never takes pointer events. */}
        <FleetScene places={places} roads={roads} colors={colors} />
      </div>
      {note ? (
        <p className="absolute bottom-3.5 left-3.5 max-w-[min(20rem,calc(100%-1.75rem))] rounded-lg border border-ds-line bg-[#020617]/80 px-2.5 py-1.5 text-ds-label leading-[1.4] text-slate-200">
          {note}
        </p>
      ) : null}
    </div>
  );
}
