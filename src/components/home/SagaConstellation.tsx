'use client';

// ============================================================================
// 傳奇星圖星座 / Faction Saga Constellation
// ============================================================================
// 這一版取代 SagaChart。差別不在裝飾，而在于它畫的是「星座」：五個時代是
// 主星座，節點之間不是一條平滑曲線，而是依星等連出的多邊連線——像一份真的
// 觀測紀錄裡，那個被標繪出來的圖形。
//
// This replaces SagaChart. The difference is not decoration but what it draws:
// the five eras are a constellation, and the links are not one smooth curve but
// a polygon of lines drawn according to node magnitude — the shape you would
// actually trace on an observation record.
//
// 三件事刻意不做：
//  1. 文字不放進 SVG。SVG 文字隨 viewBox 縮放，375px 上會縮到 11px 以下。
//  2. 不放刻度數字。那是假的量測值。
//  3. 不重複下面的 HTML 文字。圖是圖，文字是文字，各用各的強項。
// Three things deliberately not done: no text inside the SVG (it scales below
// 11px at 375px), no tick numerals (a fabricated measurement), and no repeating
// of the HTML copy below. The chart is a chart; the copy is copy.
// ============================================================================

import { motion, useReducedMotion } from 'motion/react';
import { createTranslator, type Locale } from '@/lib/i18n';

type SagaConstellationProps = {
  locale: Locale;
};

type Era = { step: string; title: string; text: string };

/**
 * 節點座標（viewBox 0 0 1000 340）。排成不對稱的星座，而不是一條起伏曲線——
 * 星圖是形狀，不是時間軸。
 * Node coordinates. An asymmetric constellation rather than a rising curve: a
 * star chart is a shape, not a timeline.
 */
const NODES: ReadonlyArray<readonly [number, number]> = [
  [110, 232],
  [268, 96],
  [478, 186],
  [676, 78],
  [892, 204],
];

/**
 * 星座連線：不是 0→1→2→3→4 的單一路徑，而是一組折線段，交替連 0-2-4 與
 * 1-3，讓中央形成一個五邊形——這是「一個圖形」，不是「一條線」。
 * The links are not a single 0→1→2→3→4 path. Two runs — 0-2-4 and 1-3 —
 * interleave so the middle resolves into a pentagon: a figure, not a line.
 */
const LINKS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [2, 4],
  [1, 3],
];

/** 極淡的遠景星，讓圖不至於太空曠 / faint background stars so it is not too empty */
const FAR_STARS: ReadonlyArray<readonly [number, number, number]> = [
  [196, 44, 1.5],
  [372, 288, 1.1],
  [612, 250, 1.3],
  [804, 132, 1.1],
  [942, 62, 1.5],
  [86, 108, 1.2],
];

/** 星座外框：把五個節點連成一個不規則多邊形，框住整張圖
    an irregular polygon around the nodes, framing the whole figure */
const CONTOUR: ReadonlyArray<readonly [number, number]> = [
  [110, 232],
  [268, 96],
  [676, 78],
  [892, 204],
  [478, 186],
  [110, 232],
];

/** 星等：主星依次遞減，最後一個是琥珀色的「永恆」
    magnitudes taper along the sequence; the last node is the amber eternity */
const MAGNITUDES = [8.5, 7, 6, 5.5, 5] as const;

const node = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

export default function SagaConstellation({ locale }: SagaConstellationProps) {
  const t = createTranslator(locale);
  const reduce = useReducedMotion();

  const eras: Era[] = [
    { step: '01', title: t('home.saga.s1Title'), text: t('home.saga.s1Text') },
    { step: '02', title: t('home.saga.s2Title'), text: t('home.saga.s2Text') },
    { step: '03', title: t('home.saga.s3Title'), text: t('home.saga.s3Text') },
    { step: '04', title: t('home.saga.s4Title'), text: t('home.saga.s4Text') },
    { step: '∞', title: t('home.saga.s5Title'), text: t('home.saga.s5Text') },
  ];

  // 收斂動效：一次畫完，內容完全相同 / Reduced motion: drawn at once, identical content
  const draw = reduce
    ? { initial: { pathLength: 1, opacity: 1 }, animate: {} }
    : {
        initial: { pathLength: 0, opacity: 0 },
        whileInView: { pathLength: 1, opacity: 1 },
        viewport: { once: true, amount: 0.4 },
        transition: { duration: 1, ease: 'easeInOut' as const },
      };

  return (
    <div>
      {/* ── 圖 / The figure ───────────────────────────────────────────────── */}
      {/* 純裝飾：所有資訊都在下面的 HTML 裡 / Purely decorative: the copy below has it all */}
      <svg
        className="h-auto w-full text-cyan-400/70"
        viewBox="0 0 1000 340"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        {/* 極淡的座標網：這是一份紀錄，不是一張裝飾圖
            A very faint grid: this is a record, not an ornament */}
        <g stroke="currentColor" strokeWidth={0.5} opacity={0.1}>
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
            <line key={`v${x}`} x1={x} y1={0} x2={x} y2={340} />
          ))}
          {[85, 170, 255].map((y) => (
            <line key={`h${y}`} x1={0} y1={y} x2={1000} y2={y} />
          ))}
        </g>

        {/* 遠景星 / background stars */}
        {FAR_STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" opacity={0.3} />
        ))}

        {/* 星座外框：一條封閉的細線，點出整個圖形的範圍
            The contour: one closed hairline that states the figure's extent */}
        <motion.polygon
          points={CONTOUR.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.75}
          strokeLinejoin="round"
          opacity={0.45}
          {...draw}
        />

        {/* 星座連線：兩條交錯的折線，中央形成五邊形
            The links: two interleaved runs resolving into a central pentagon */}
        {LINKS.map(([a, b], index) => (
          <motion.line
            key={`${a}-${b}`}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            initial={reduce ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              duration: 0.7,
              delay: reduce ? 0 : 0.2 + index * 0.14,
              ease: 'easeInOut' as const,
            }}
          />
        ))}

        {/* 主星：外環 + 核心 + 四道光芒，最後一個是琥珀色的「永恆」
            The primary stars: a ring, a core, four rays; the last is amber */}
        {NODES.map(([x, y], index) => {
          const last = index === NODES.length - 1;
          const magnitude = MAGNITUDES[index];
          const delay = reduce ? 0 : 0.25 + index * 0.12;
          const color = last ? 'var(--color-ds-amber)' : 'currentColor';
          return (
            <motion.g
              key={`${x}-${y}`}
              initial={{ opacity: reduce ? 1 : 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay }}
            >
              {/* 四道光芒：星等越大越長，但不誇張到像圖示
                  Four rays, scaled by magnitude, short enough to stay a star */}
              <motion.g
                stroke={color}
                strokeWidth={0.9}
                strokeLinecap="round"
                initial={{ opacity: reduce ? 0.55 : 0, scale: reduce ? 1 : 0.3 }}
                whileInView={{ opacity: 0.55, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                style={{ transformOrigin: `${x}px ${y}px` }}
                transition={{ duration: 0.5, delay, ease: 'easeOut' as const }}
              >
                <line x1={x - magnitude * 1.5} y1={y} x2={x + magnitude * 1.5} y2={y} />
                <line x1={x} y1={y - magnitude * 1.5} x2={x} y2={y + magnitude * 1.5} />
              </motion.g>
              <motion.circle
                cx={x}
                cy={y}
                r={reduce ? magnitude : 0}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                animate={{ r: magnitude }}
                transition={{ duration: 0.45, delay, ease: 'easeOut' as const }}
              />
              <motion.circle
                cx={x}
                cy={y}
                r={reduce ? magnitude * 0.4 : 0}
                fill={color}
                animate={{ r: magnitude * 0.4 }}
                transition={{ duration: 0.45, delay, ease: 'easeOut' as const }}
              />
            </motion.g>
          );
        })}
      </svg>

      {/* ── 文字 / The copy ───────────────────────────────────────────────── */}
      {/* 每個時代一欄，順序與星座節點一致
          One column per era, in the same order as the constellation's stars */}
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
            {/* 螢幕閱讀器不需要知道星座的節點順序，那是視覺訊息
                A screen reader does not need the star order; that is visual */}
            <span className="sr-only">
              {index + 1} / {eras.length}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
