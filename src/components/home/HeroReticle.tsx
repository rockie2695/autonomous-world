// ============================================================================
// Hero HUD 準星 / Hero HUD Reticle
// ============================================================================
// 讓產品截圖讀成「透過儀器拍到的」，而不是「影片放在盒子裡」。四個角框、
// 邊緣刻度、中心十字，全部是 SVG，無 JS、無依賴。
// Makes the product shot read as "captured through an instrument" rather than
// "a video in a box". Four corner brackets, edge ticks, a centre crosshair —
// all SVG, no JavaScript, no dependency.
//
// 刻意不放刻度數字：那會是一個假的量測值。這裡只有儀器語言，沒有宣稱。
// Deliberately no scale numbers: those would be a fabricated measurement. This
// is instrument language only — it claims nothing.
//
// 琥珀色只出現在兩根刻度上，用來和背景的結晶格環對話
// Amber appears on exactly two ticks, answering the backdrop's lattice ring.
//
// 裝飾性、純視覺：不進無障礙樹，鍵盤與指標都摸不到。
// Decorative and purely visual: out of the accessibility tree, unreachable by
// keyboard and pointer.
// ============================================================================

export default function HeroReticle() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full text-cyan-300/45"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* 刻度線不跟著非等比縮放變粗 / strokes stay 1px under the non-uniform scale */}
      <g fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke">
        {/* 四角括號 / corner brackets */}
        <path d="M2 9V2h7" />
        <path d="M91 2h7v7" />
        <path d="M98 91v7h-7" />
        <path d="M9 98H2v-7" />

        {/* 中心十字 / centre crosshair */}
        <path d="M47 50h6M50 47v6" opacity={0.7} />

        {/* 上下邊緣刻度 / edge ticks, top and bottom */}
        <path d="M25 2v4M50 2v6M75 2v4" opacity={0.55} />
        <path d="M25 98v-4M50 98v-6M75 98v-4" opacity={0.55} />

        {/* 左緣刻度 / left edge ticks — 其中一根是琥珀色
            one of them is the amber that ties back to the lattice ring */}
        <path d="M2 30h4M2 50h6" opacity={0.55} />
        <path d="M2 70h4" opacity={0.55} />
      </g>

      {/* 琥珀只給一根刻度 / amber gets exactly one tick */}
      <path
        d="M98 50h-4"
        fill="none"
        stroke="var(--color-ds-amber)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
    </svg>
  );
}
