'use client';

// ============================================================================
// 傳奇星圖 / Faction Saga Star Chart
// ============================================================================
// #saga 原本是五欄靜態時間軸：五個數字、五個標題、五段文字，靠一條線串起來。
// 這一版把它換成一張會畫出來的星圖——節點依序亮起、連線一條一條延伸，讀起來
// 像一份被標繳出來的觀測紀錄，而不是一個版面元件。
//
// The section used to be a five-column static timeline: five numerals, five
// titles, five paragraphs, joined by a line. This is a star chart that draws
// itself — nodes lighting up in sequence, links extending one by one — so it
// reads as an annotated observation record rather than a layout component.
//
// 文字不放進 SVG。SVG 內的文字會隨 viewBox 縮放，375px 上會縮到 11px 以下；
// 圖是圖，文字是 HTML，兩者各用各的強項。
// No text inside the SVG. SVG text scales with the viewBox and drops below
// 11px at 375px; the chart is a chart and the copy is HTML, each using what it
// is good at.
// ============================================================================

import { motion, useReducedMotion } from 'motion/react';
import { createTranslator, type Locale } from '@/lib/i18n';

type SagaChartProps = {
  locale: Locale;
};

type Era = { step: string; title: string; text: string };

/**
 * 節點座標（viewBox 0 0 1000 300）。刻意排成一條起伏的曲線而不是一直線——
 * 星圖不是時間軸，它該有自己的形狀。
 * Node coordinates. Deliberately a rising and falling curve rather than a
 * straight rule: a star chart is not a timeline and should have its own shape.
 */
const NODES: ReadonlyArray<readonly [number, number]> = [
  [90, 208],
  [285, 118],
  [500, 168],
  [715, 104],
  [925, 192],
];

/** 兩顆純裝飾的遠景星，讓星圖不至於太空曠 / two decorative background stars */
const FAR_STARS: ReadonlyArray<readonly [number, number, number]> = [
  [190, 62, 1.6],
  [640, 250, 1.2],
];

/** 水平控制點的平滑曲線 / a smooth curve built from horizontal control points */
function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const midX = (x0 + x1) / 2;
    d += ` C ${midX} ${y0}, ${midX} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

const LINK = smoothPath(NODES);

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const node = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

export default function SagaChart({ locale }: SagaChartProps) {
  const t = createTranslator(locale);
  const reduce = useReducedMotion();

  const eras: Era[] = [
    { step: '01', title: t('home.saga.s1Title'), text: t('home.saga.s1Text') },
    { step: '02', title: t('home.saga.s2Title'), text: t('home.saga.s2Text') },
    { step: '03', title: t('home.saga.s3Title'), text: t('home.saga.s3Text') },
    { step: '04', title: t('home.saga.s4Title'), text: t('home.saga.s4Text') },
    { step: '∞', title: t('home.saga.s5Title'), text: t('home.saga.s5Text') },
  ];

  // 收斂動效：星圖一次畫完，內容完全相同
  // Reduced motion: the chart appears at once, with identical content
  const draw = reduce
    ? { initial: { pathLength: 1, opacity: 1 }, animate: {} }
    : {
        initial: { pathLength: 0, opacity: 0 },
        whileInView: { pathLength: 1, opacity: 1 },
        viewport: { once: true, amount: 0.4 },
        transition: { duration: 1.1, ease: 'easeInOut' as const },
      };

  return (
    <div>
      {/* ── 圖 / The chart ──────────────────────────────────────────────── */}
      {/* 圖是純裝飾：所有資訊都在下面的 HTML 文字裡，不重複也不遺漏
          Purely decorative: every piece of information is in the HTML below,
          so nothing is duplicated and nothing is lost */}
      <svg
        className="h-auto w-full text-cyan-400/70"
        viewBox="0 0 1000 300"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        {/* 極淡的座標網：這是一份紀錄，不是一張裝飾圖
            A very faint coordinate grid: this is a record, not an ornament */}
        <g stroke="currentColor" strokeWidth={0.5} opacity={0.12}>
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
            <line key={`v${x}`} x1={x} y1={0} x2={x} y2={300} />
          ))}
          {[75, 150, 225].map((y) => (
            <line key={`h${y}`} x1={0} y1={y} x2={1000} y2={y} />
          ))}
        </g>

        {/* 遠景星 / background stars */}
        {FAR_STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" opacity={0.3} />
        ))}

        {/* 連線：一條畫出來的曲線 / the link, drawn as one path */}
        <motion.path
          d={LINK}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          {...draw}
        />

        {/* 節點：外環 + 核心，最後一個是琥珀色的「永恆」
            Nodes: a ring plus a core; the last one is the amber "eternity" */}
        {NODES.map(([x, y], index) => {
          const last = index === NODES.length - 1;
          const initialR = reduce ? 5.5 : 0;
          return (
            <motion.g
              key={`${x}-${y}`}
              initial={{ opacity: reduce ? 1 : 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : 0.15 + index * 0.12 }}
            >
              <motion.circle
                cx={x}
                cy={y}
                r={initialR}
                fill="none"
                stroke={last ? 'var(--color-ds-amber)' : 'currentColor'}
                strokeWidth={1.5}
                animate={{ r: 5.5 }}
                transition={{ duration: 0.45, delay: reduce ? 0 : 0.15 + index * 0.12, ease: 'easeOut' }}
              />
              <motion.circle
                cx={x}
                cy={y}
                r={initialR * 0.45}
                fill={last ? 'var(--color-ds-amber)' : 'currentColor'}
                animate={{ r: 2.4 }}
                transition={{ duration: 0.45, delay: reduce ? 0 : 0.15 + index * 0.12, ease: 'easeOut' }}
              />
            </motion.g>
          );
        })}
      </svg>

      {/* ── 文字 / The copy ─────────────────────────────────────────────── */}
      {/* 每個時代一欄，與星圖的節點順序一致
          One column per era, in the same order as the chart's nodes */}
      <ol className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-5">
        {eras.map((era, index) => (
          <motion.li
            key={era.step}
            variants={node}
            initial={reduce ? 'show' : 'hidden'}
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="border-t border-cyan-400/25 pt-5"
          >
            <span className="font-orbitron block text-[0.8125rem] tracking-[0.22em] text-cyan-400/90">
              {era.step}
            </span>
            <h3 className="font-orbitron mt-2 text-lg font-semibold text-white">
              {era.title}
            </h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-slate-400 md:text-base">
              {era.text}
            </p>
            {/* 螢幕閱讀器不需要知道星圖的節點順序，那是視覺訊息
                A screen reader does not need the node order; that is visual */}
            <span className="sr-only">{index + 1} / {eras.length}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
