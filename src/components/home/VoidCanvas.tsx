'use client';

// ============================================================================
// 整頁背景天體 — 外框 / Page Backdrop Body — Frame
// ============================================================================
// 純裝飾：fixed 全視窗、-z-10、aria-hidden、pointer-events-none。
// 它不承載任何文字層沒有的資訊，所以讀螢幕軟體看不到它、鍵盤也摸不到它。
// Purely decorative: fixed, behind everything, aria-hidden, unclickable. It
// carries no information the text layer does not, so assistive technology
// never sees it and the keyboard cannot reach it.
// ============================================================================

import dynamic from 'next/dynamic';

// 裝飾性背景不需要骨架／進場佔位，沒有可感知的等待
// A decorative backdrop needs no skeleton — there is no perceived wait
const VoidScene = dynamic(() => import('./VoidScene'), { ssr: false, loading: () => null });

export default function VoidCanvas() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <VoidScene />
    </div>
  );
}
