'use client';

// ============================================================================
// 統計圖表 / Stats Charts
// ============================================================================
// 四種樣式（折線 / 圓餅 / 長條 / 區塊圖）共用同一個提示面板與圖例元件，所以
// hover 的行為與外觀在任何樣式下都一致。圓餅用於勢力時是環圈，用於世界指標
// 時則是「目前 vs 歷史峰值」的儀表；區塊圖會取代九張圖，顯示勢力整體實力。
// 另外雷達圖是獨立面板，不受樣式切換影響。
//
// All four styles (line / pie / bar / treemap) share one tooltip component and one
// legend component, so hover behaviour and looks stay identical across styles. The
// pie style is a donut for factions and a "current vs. historical peak" gauge for
// world metrics; the treemap replaces the nine charts with one combined view of
// faction power. The character radar is its own panel and ignores the type toggle.
// ============================================================================

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { CONFIG } from '@/lib/gameConfig';
import { apiFetch } from '@/lib/api';
import type { WorldState } from './types';
import { GM_BTN, GM_BTN_ACCENT, GM_PANEL, GM_SKEL, GM_TITLE } from './styles';
import { DetailModal } from './leader-detail';
// ─── 統計圖表 / Stats Charts ─────────────────────────────────────────────────────

/** 圖表類型 / Chart type */
type ChartType = 'line' | 'pie' | 'square' | 'treemap';

const CHART_TYPES: readonly ChartType[] = ['line', 'pie', 'square', 'treemap'];

/** 圖表類型的 i18n 鍵 / i18n keys for the chart types */
const CHART_TYPE_LABEL_KEYS: Record<ChartType, string> = {
  line: 'stats.line',
  pie: 'stats.pie',
  square: 'stats.square',
  treemap: 'stats.treemap',
};

/**
 * 圖表尺寸與上限值來自 CONFIG，這裡只是取別名，好讓下面的繪圖程式碼讀起來
 * 短一點。真正的調整點只有 `gameConfig.ts` 一處。
 * The chart dimensions and caps live in CONFIG; these are just aliases so the
 * drawing code below stays readable. `gameConfig.ts` is the single place to tune.
 */
const {
  CHART_W,
  CHART_H,
  CHART_PAD,
  CHART_TIP_FLIP_AT,
  BAR_MAX_ROUNDS,
  TREEMAP_W,
  TREEMAP_H,
  TREEMAP_MAX_FACTIONS,
  RADAR_SIZE,
  RADAR_RADIUS,
  RADAR_MAX_FACTIONS,
} = CONFIG;

/** 單一序列的圖表資料 / One series of chart data */
interface ChartSeries {
  values: number[];
  color: string;
  label: string;
}

/** 可圖表化的勢力欄位 / Per-faction fields that can be charted */
type FactionStatKey = 'troops' | 'gold' | 'territories' | 'characters';

/** 可圖表化的世界欄位 / World-wide fields that can be charted */
type WorldStatKey =
  | 'aliveFactions'
  | 'totalCharacters'
  | 'unownedPlaces'
  | 'totalGarrison'
  | 'totalRoads';

/** GET /api/world/stats 回應格式 / GET /api/world/stats response shape */
interface StatsPayload {
  rounds: number[];
  factions: Array<{
    id: string;
    name: string;
    color: string;
    troops: number[];
    gold: number[];
    territories: number[];
    characters: number[];
  }>;
  world: Record<WorldStatKey, number[]>;
}

/** 圖表外框：標題 + 內容 / Chart frame: title + body
    整張卡片是 hover 單位：-mx-2/px-2 讓 hover 底色蓋滿面板的 p-3 內距，
    文字仍然對齊 / The whole card is the hover target: -mx-2/px-2 lets the tint
    cover the panel padding while the text stays aligned. */
function ChartFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="-mx-2 mb-3 rounded-md border border-transparent px-2 py-1.5 transition-colors duration-200 last:mb-0 hover:border-white/10 hover:bg-white/[0.03]">
      <div className="text-sm text-gray-300 font-orbitron tracking-wider mb-2 uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

/** 圖例：單一序列時隱藏 / Legend — hidden when there is a single series */
function ChartLegend({ series, shares }: { series: ChartSeries[]; shares?: number[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
      {series.map((s, i) => (
        <li
          key={`${s.label}-${i}`}
          className="group inline-flex items-center gap-1.5 text-[13px] text-gray-400 font-mono transition-colors duration-200 hover:text-gray-100"
          title={s.label}
        >
          <span
            className="w-2.5 h-2.5 rounded-[1px] shrink-0 transition-transform duration-200 group-hover:scale-125"
            style={{ backgroundColor: s.color }}
          />
          <span className="truncate max-w-[80px]">{s.label}</span>
          {shares && <span className="text-gray-500">{shares[i].toFixed(0)}%</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * 圖表提示面板：列出每個序列在該回合的數值。
 * The chart tooltip panel: one row per series, with its value at the hovered round.
 *
 * 用 **DOM** 而不是 SVG `<title>`：原生 title 是瀏覽器浮動提示，延遲高、樣式不可控，
 * 而且只能顯示一行。這裡要同時顯示「所有勢力在同一回合的數值」，並跟著游標移動，
 * 所以做成絕對定位的 DOM 面板，和 rechart 的行為一致。
 * Rendered as **DOM** rather than an SVG `<title>`: the native one is a browser
 * popup that appears late, cannot be styled, and shows a single line. This has to
 * read out *every* series at one round and follow the cursor, so it is an
 * absolutely positioned panel, matching how rechart behaves.
 */
function ChartTooltip({
  round,
  rows,
  x,
  y,
  flip,
}: {
  /** 回合標題； treemap 顯示的是「目前」快照而非某一回合，所以可以不給 /
   *  Round heading. The treemap shows the current snapshot rather than one
   *  round, so it may be omitted */
  round?: number;
  rows: Array<{ label: string; color: string; value: number }>;
  /** 相對於圖表容器的游標位置 / Pointer position within the chart container */
  x: number;
  y: number;
  /** 游標已靠近圖表右緣時，把面板翻到游標左側，避免被面板裁掉 /
   *  Flip the panel to the cursor's left near the chart's right edge, so it never
   *  gets clipped by the panel */
  flip?: boolean;
}) {
  return (
    <div
      // pointer-events-none：面板壓在圖表上，滑鼠不能被它吃掉，否則指標會抖 /
      // pointer-events-none: the panel sits over the chart and must not steal the
      // pointer, or the readout jitters
      className="pointer-events-none absolute z-20 min-w-[9rem] rounded-lg border border-white/10 bg-gray-900/95 px-2.5 py-2 shadow-xl shadow-black/50 backdrop-blur-md"
      style={{
        left: x,
        top: y,
        // 游標右方空間不足時翻到左側，避免面板被面板邊界裁掉；
        // 圖表只有 240px 寬，提示最少 144px，所以 45% 之後就翻 /
        // Flip to the cursor's left when the right side has no room. The charts are
        // only ~240px wide and the panel is at least 144px, so flip past 45%.
        transform: flip ? 'translate(calc(-100% - 12px), -50%)' : 'translate(12px, -50%)',
      }}
      role="tooltip"
    >
      {round !== undefined && (
        <div className="mb-1 font-orbitron text-[11px] tracking-widest text-cyan-300/90">
          {t('chart.round')} {round}
        </div>
      )}
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-1.5 text-[13px] leading-relaxed">
            <span
              className="size-2 shrink-0 rounded-[1px]"
              style={{ backgroundColor: row.color }}
            />
            <span className="min-w-0 flex-1 truncate text-gray-300">{row.label}</span>
            <span className="font-mono tabular-nums text-gray-100">{row.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 水平格線 / Horizontal grid lines */
function ChartGrid({ maxVal }: { maxVal: number }) {
  const plotH = CHART_H - CHART_PAD * 2;
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={CHART_PAD}
          y1={CHART_H - CHART_PAD - pct * plotH}
          x2={CHART_W - CHART_PAD}
          y2={CHART_H - CHART_PAD - pct * plotH}
          stroke="#1e293b"
          strokeWidth={0.5}
        />
      ))}
      <text
        x={2}
        y={CHART_PAD - 8}
        fill="#475569"
        fontSize={11}
        fontFamily="monospace"
      >
        {maxVal}
      </text>
    </g>
  );
}

/** 折線圖：每個序列一條線 / Line chart — one line per series */
function LineChart({
  series,
  title,
  rounds,
}: {
  series: ChartSeries[];
  title: string;
  rounds: number[];
}) {
  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const plotW = CHART_W - CHART_PAD * 2;
  const plotH = CHART_H - CHART_PAD * 2;
  const xScale = (i: number) =>
    CHART_PAD + (i / Math.max(rounds.length - 1, 1)) * plotW;
  const yScale = (v: number) => CHART_H - CHART_PAD - (v / maxVal) * plotH;

  // 提示的游標位置與回合索引 / Tooltip pointer position and snapped round index
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  return (
    <ChartFrame title={title}>
      <div
        className="relative"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          // viewBox 與實際像素不同寬，所以先把游標換算成 viewBox 座標再求索引，
          // 否則提示會整個偏掉。比例由容器寬度推得，不需要真的量svg。
          // The viewBox is not the pixel width, so the cursor is converted into
          // viewBox space before solving for the index — otherwise the whole
          // readout is offset. The ratio comes from the container width, so the svg
          // never has to be measured.
          const scale = CHART_W / Math.max(rect.width, 1);
          const viewX = (event.clientX - rect.left) * scale;
          const index = Math.min(
            rounds.length - 1,
            Math.max(
              0,
              Math.round(((viewX - CHART_PAD) / Math.max(plotW, 1)) * Math.max(rounds.length - 1, 1))
            )
          );
          setHover({ index, x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        onPointerLeave={() => setHover(null)}
      >
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        role="img"
        aria-label={title}
      >
        <ChartGrid maxVal={maxVal} />
        {/* 每個序列一組：可見線 + 透明加粗命中區。
            1.5px 的線太細，游標幾乎壓不到，hover 會時靈时不靈；
            命中區把可 hover 的範圍撐到 14px，並且畫在可見線之上（最後一個
            子節點）以接收游標 / One group per series: the visible line plus an
            invisible 14px hit band. A 1.5px stroke is a near-miss target, so the
            band is what actually receives the pointer — and being the last child
            it paints on top. */}
        {series.map((s, si) => (
          <g key={si} className="group/series">
            <polyline
              points={s.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="pointer-events-none transition-[stroke-width] duration-200 group-hover/series:[stroke-width:3]"
            />
            <polyline
              points={s.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              className="cursor-pointer"
            >
              {/* 原生 tooltip：最後一回合的數值 / Native tooltip with the latest value */}
              <title>{`${s.label} · ${rounds[rounds.length - 1] ?? ''} · ${s.values[s.values.length - 1] ?? 0}`}</title>
            </polyline>
          </g>
        ))}
        {/* 標記最新一回合的端點 / Mark the latest round of each series */}
        {series.map((s, si) => {
          const last = s.values.length - 1;
          if (last < 0) return null;
          return (
            <circle
              key={si}
              cx={xScale(last)}
              cy={yScale(s.values[last] ?? 0)}
              r={3}
              fill={s.color}
            />
          );
        })}
        {/* 十字準線與各序列的資料點：游標停在哪一回合就畫在哪一回合 /
            Crosshair plus one marker per series, drawn at whichever round the
            cursor is snapped to */}
        {hover && (
          <g className="pointer-events-none">
            <line
              x1={xScale(hover.index)}
              y1={CHART_PAD}
              x2={xScale(hover.index)}
              y2={CHART_H - CHART_PAD}
              stroke="#22d3ee"
              strokeOpacity={0.45}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s, si) => (
              <circle
                key={si}
                cx={xScale(hover.index)}
                cy={yScale(s.values[hover.index] ?? 0)}
                r={3.5}
                fill={s.color}
                stroke="var(--color-ds-void)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        )}
      </svg>
      {/* hover 時的數值面板 / the value readout while hovering */}
      {hover && (
        <ChartTooltip
          round={rounds[hover.index] ?? 0}
          x={hover.x}
        flip={hover.x > CHART_TIP_FLIP_AT}
          y={hover.y}
          rows={series.map((s) => ({
            label: s.label,
            color: s.color,
            value: s.values[hover.index] ?? 0,
          }))}
        />
      )}
      <ChartLegend series={series} />
      </div>
    </ChartFrame>
  );
}

/** 圓環扇形路徑 / Donut sector path */
function donutSector(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number
): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return [
    `M ${p(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p(rOuter, end)}`,
    `L ${p(rInner, end)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p(rInner, start)}`,
    'Z',
  ].join(' ');
}

/** 圓餅圖：最新一回合的佔比 / Pie chart — share at the latest round */
function PieChart({
  series,
  title,
  rounds,
}: {
  series: ChartSeries[];
  title: string;
  /** 只用來在提示上標示「這是第幾回合的佔比」/ Only used to label which round the shares describe */
  rounds: number[];
}) {
  const values = series.map((s) => s.values[s.values.length - 1] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter * 0.55;
  const startAngle = -Math.PI / 2;
  // 累加前置總數取得每個扇形的起點角度 / Prefix sum gives each sector its start angle
  const prefixAt = (i: number) => values.slice(0, i).reduce((a, b) => a + b, 0);

  // 扇形的 hover：取代原生<title>，用同一個 DOM 提示面板 /
  // Slice hover: replaces the native <title> with the same DOM tooltip
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  // 用 ref 拿到提示的定位基準；查詢 DOM 會撞到地圖上其他 relative 容器 /
  // A ref gives the tooltip its positioning basis — querying the DOM could match a
  // different relative container, such as the map's timeline overlay
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <ChartFrame title={title}>
      {total <= 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{t('game.noData')}</p>
      ) : (
        <div className="relative" ref={wrapRef}>
        <div className="flex items-center gap-3">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-24 shrink-0"
            role="img"
            aria-label={title}
          >
            {series.map((s, i) => {
              const value = values[i] ?? 0;
              if (value <= 0) return null;
              const from = startAngle + (prefixAt(i) / total) * Math.PI * 2;
              const sweep = (value / total) * Math.PI * 2;
              return (
                <path
                  key={i}
                  d={donutSector(cx, cy, rOuter, rInner, from, from + sweep)}
                  fill={s.color}
                  opacity={hover && hover.i !== i ? 0.45 : 0.9}
                  className="cursor-pointer transition-opacity duration-200"
                  onPointerMove={(event) => {
                    const box = wrapRef.current?.getBoundingClientRect();
                    setHover({
                      i,
                      x: event.clientX - (box?.left ?? 0),
                      y: event.clientY - (box?.top ?? 0),
                    });
                  }}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
            <text
              x={cx}
              y={cy + 6}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize={19}
              fontFamily="monospace"
            >
              {total}
            </text>
          </svg>
          <ChartLegend
            series={series}
            shares={values.map((v) => (v / total) * 100)}
          />
        </div>
        {hover && (
          <ChartTooltip
            round={rounds[rounds.length - 1] ?? 0}
            x={hover.x}
        flip={hover.x > CHART_TIP_FLIP_AT}
            y={hover.y}
            rows={[
              {
                label: series[hover.i]?.label ?? '',
                color: series[hover.i]?.color ?? '#888',
                value: values[hover.i] ?? 0,
              },
            ]}
          />
        )}
        </div>
      )}
    </ChartFrame>
  );
}

/** 進度環：目前值相對歷史峰值的比例（單一序列時取代圓餅圖）
 *  Gauge ring — current value against its historical peak (replaces the pie for a single series) */
function GaugeChart({ series, title }: { series: ChartSeries[]; title: string }) {
  const s = series[0];
  const values = s?.values ?? [];
  const value = values[values.length - 1] ?? 0;
  const peak = Math.max(1, ...values);
  const ratio = Math.min(1, value / peak);
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 9;
  const circumference = 2 * Math.PI * r;

  // hover：取代原生 <title>，改用共用的 DOM 提示面板 /
  // Hover: replaces the native <title> with the shared DOM tooltip
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <ChartFrame title={title}>
      <div
        className="relative"
        onPointerMove={(event) => {
          const box = wrapRef.current?.getBoundingClientRect();
          setHover({ x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) });
        }}
        onPointerLeave={() => setHover(null)}
      >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-28 mx-auto"
        role="img"
        aria-label={title}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={s?.color ?? '#22d3ee'}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="cursor-pointer transition-[stroke-width] duration-200 hover:[stroke-width:11]"
        />
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={22}
          fontFamily="monospace"
        >
          {value}
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          fill="#64748b"
          fontSize={13}
          fontFamily="monospace"
        >
          {t('stats.peak')} {peak}
        </text>
      </svg>
      {hover && (
        <ChartTooltip
          x={hover.x}
          flip={hover.x > CHART_TIP_FLIP_AT}
          y={hover.y}
          rows={[
            { label: t('stats.current'), color: s?.color ?? '#22d3ee', value },
            { label: t('stats.peak'), color: '#475569', value: peak },
          ]}
        />
      )}
      </div>
    </ChartFrame>
  );
}

/** 長條圖：每回合一根堆疊長條 / Bar chart — one stacked bar per round */
function BarChart({
  series,
  title,
  rounds,
}: {
  series: ChartSeries[];
  title: string;
  rounds: number[];
}) {
  const start = Math.max(0, rounds.length - BAR_MAX_ROUNDS);
  const visibleRounds = rounds.slice(start);
  const totals = visibleRounds.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[start + i] ?? 0), 0)
  );
  const maxVal = Math.max(1, ...totals);
  const plotW = CHART_W - CHART_PAD * 2;
  const plotH = CHART_H - CHART_PAD * 2;
  const slot = plotW / Math.max(visibleRounds.length, 1);
  const barW = Math.max(1.5, Math.min(16, slot * 0.6));
  const lastRound = visibleRounds[visibleRounds.length - 1];
  // 該回合前已堆疊的數值 / How much is already stacked below in that round
  const stackedBelow = (roundIdx: number, upto: number) =>
    series
      .slice(0, upto)
      .reduce((sum, s) => sum + (s.values[start + roundIdx] ?? 0), 0);

  // hover：游標對齊到某一回合的長條，並顯示該回合各序列的數值 /
  // Hover: the cursor snaps to one round's bar and the readout lists every series
  // at that round
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <ChartFrame title={title}>
      <div
        className="relative"
        ref={wrapRef}
        onPointerMove={(event) => {
          const box = wrapRef.current?.getBoundingClientRect();
          if (!box) return;
          // viewBox 與像素寬度不同，先換算成 viewBox 座標再求槽位索引 /
          // The viewBox is not the pixel width, so convert into viewBox space
          // before solving for the slot index
          const scale = CHART_W / Math.max(box.width, 1);
          const viewX = (event.clientX - box.left) * scale;
          const index = Math.min(
            visibleRounds.length - 1,
            Math.max(0, Math.floor((viewX - CHART_PAD) / Math.max(slot, 1)))
          );
          setHover({ index, x: event.clientX - box.left, y: event.clientY - box.top });
        }}
        onPointerLeave={() => setHover(null)}
      >
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        role="img"
        aria-label={title}
      >
        <ChartGrid maxVal={maxVal} />
        {hover && (
          // hover 中的長條加一圈底襯，看不出錯的是哪一根 /
          // A backing rect behind the hovered bar, so it is obvious which one
          <rect
            x={CHART_PAD + hover.index * slot}
            y={CHART_PAD - 4}
            width={slot}
            height={CHART_H - CHART_PAD * 2 + 8}
            fill="#22d3ee"
            opacity={0.08}
            className="pointer-events-none"
          />
        )}
        {totals.map((_, i) => {
          const x = CHART_PAD + i * slot + (slot - barW) / 2;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.values[start + i] ?? 0;
                if (v <= 0) return null;
                const h = (v / maxVal) * plotH;
                const y =
                  CHART_H - CHART_PAD - ((stackedBelow(i, si) + v) / maxVal) * plotH;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 0.5)}
                    fill={s.color}
                    opacity={hover && hover.index !== i ? 0.45 : 0.9}
                    className="pointer-events-none transition-opacity duration-150"
                  />
                );
              })}
            </g>
          );
        })}
        {visibleRounds.length > 0 && (
          <>
            <text
              x={CHART_PAD}
              y={CHART_H - 6}
              fill="#475569"
              fontSize={11}
              fontFamily="monospace"
            >
              {visibleRounds[0]}
            </text>
            <text
              x={CHART_W - CHART_PAD}
              y={CHART_H - 6}
              textAnchor="end"
              fill="#475569"
              fontSize={11}
              fontFamily="monospace"
            >
              {lastRound}
            </text>
          </>
        )}
      </svg>
      {hover && (
        <ChartTooltip
          round={visibleRounds[hover.index] ?? 0}
          x={hover.x}
        flip={hover.x > CHART_TIP_FLIP_AT}
          y={hover.y}
          rows={series.map((s) => ({
            label: s.label,
            color: s.color,
            value: s.values[start + hover.index] ?? 0,
          }))}
        />
      )}
      <ChartLegend series={series} />
      </div>
    </ChartFrame>
  );
}

/** treemap 的三個內部分段（依序列值）/ The treemap's three inner segments, in series order */
const TREEMAP_SEGMENT_KEYS = ['troops', 'gold', 'characters'] as const;

/** treemap 分段色票取自設計 token（兵力/金幣/將領）/ Segment swatches come from design tokens (troops / gold / characters) */
const TREEMAP_SEGMENT_VARS = [
  'var(--color-ds-cyan)',
  'var(--color-ds-amber)',
  'var(--color-ds-purple)',
] as const;

/** treemap 的節點 / One treemap node; `children` turns it into a subdivided block */
interface TreemapNode {
  key: string;
  label: string;
  value: number;
  color: string;
  children?: TreemapNode[];
  /**
   * 提示面板要顯示的「真實數字」，跟版面用的 `value` 分開 /
   * The real number the readout shows, kept apart from the layout `value`.
   *
   * 父區塊的 `value` 本身就是勢力數，但子分段（兵力 / 金錢 / 將領）為了讓三段
   * 在同一個區塊裡分出比例，存的是**正規化後**的 0..1。直接顯示會讀成 "0.42"，
   * 所以真實數字另外存在 `display`。
   * A parent's `value` is already the real count, but each child segment stores a
   * *normalised* 0..1 so the three of them split the block proportionally.
   * Printing that verbatim reads as "0.42", so the real number lives in `display`.
   */
  display?: number;
}

/**
 * slice-and-dice 佈局：把節點依價值比例切成長條，父節點遞迴切分自己的矩形。
 * Slice-and-dice: split nodes proportionally along the longer axis, recursing
 * into each parent's own rectangle. Cheap, deterministic, and good enough for
 * the ~12 blocks the treemap caps itself at.
 *
 * @param nodes - 要排列的節點（值 <= 0 的會被忽略）/ Nodes to lay out (non-positive values are skipped)
 * @param rect - 可用矩形 / The rectangle to fill
 * @returns 每個節點（含父與子）分到的矩形 / The rectangle assigned to each node, parents included
 */
function layoutTreemap(
  nodes: TreemapNode[],
  rect: { x: number; y: number; width: number; height: number }
): Array<{ node: TreemapNode; x: number; y: number; width: number; height: number }> {
  const usable = nodes.filter((n) => n.value > 0);
  const total = usable.reduce((sum, n) => sum + n.value, 0);
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return [];

  const placed: Array<{
    node: TreemapNode;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  // 沿較長的那一邊切，切出來的長條才不會立刻變細 /
  // Cut along the longer side so the strips do not immediately go sliver-thin
  const horizontal = rect.width >= rect.height;
  const span = horizontal ? rect.width : rect.height;
  let offset = 0;

  for (const node of usable) {
    const slice = (node.value / total) * span;
    const box = horizontal
      ? { x: rect.x + offset, y: rect.y, width: slice, height: rect.height }
      : { x: rect.x, y: rect.y + offset, width: rect.width, height: slice };
    placed.push({ node, ...box });
    if (node.children && node.children.length > 0) {
      placed.push(...layoutTreemap(node.children, box));
    }
    offset += slice;
  }

  return placed;
}

/**
 * 勢力力量區塊圖：每個勢力一個區塊，面積是領地數，區塊內再依兵力/金幣/將領細分。
 * Faction power treemap: one block per faction sized by territory count, each
 * subdivided into troops / gold / characters.
 *
 * 三個指標量級差很多（兵力可以是將領數的千倍），所以各指標先除以「全世界的最大值」
 * 再取比例 — 區塊大小同時反映勢力量級與內部組成。這個正規化是刻意的取捨。
 * The three metrics differ by orders of magnitude, so each is divided by its own
 * world maximum before the split: block area reflects both a faction's scale
 * and its internal mix. That normalisation is a deliberate trade-off.
 */
function FactionTreemap({ factions }: { factions: StatsPayload['factions'] }) {
  const at = (f: StatsPayload['factions'][number], key: (typeof TREEMAP_SEGMENT_KEYS)[number] | 'territories') => {
    const series = f[key];
    return series[series.length - 1] ?? 0;
  };

  // 只畫有領地的勢力，並依領地數取前 N 個 /
  // Only factions holding land, capped to the largest N
  const ranked = [...factions]
    .filter((f) => at(f, 'territories') > 0)
    .sort((a, b) => at(b, 'territories') - at(a, 'territories'))
    .slice(0, TREEMAP_MAX_FACTIONS);

  // 各指標的正規化基準 / Each metric's normalisation base
  const maxOf = (key: (typeof TREEMAP_SEGMENT_KEYS)[number]) =>
    Math.max(1, ...ranked.map((f) => at(f, key)));

  const maxTroops = maxOf('troops');
  const maxGold = maxOf('gold');
  const maxCharacters = maxOf('characters');

  const nodes: TreemapNode[] = ranked.map((f) => {
    // 子分段單獨hover時只會讀到指標名，讀不出是誰的兵力，所以標籤先帶上勢力名 /
    // Hovering a segment on its own would otherwise read as a bare metric name
    // with no indication of which faction it belongs to
    const children: TreemapNode[] = [
      { key: `${f.id}-troops`, label: `${f.name} · ${t('stats.troopsOverTime')}`, value: at(f, 'troops') / maxTroops, display: at(f, 'troops'), color: TREEMAP_SEGMENT_VARS[0] },
      { key: `${f.id}-gold`, label: `${f.name} · ${t('stats.goldOverTime')}`, value: at(f, 'gold') / maxGold, display: at(f, 'gold'), color: TREEMAP_SEGMENT_VARS[1] },
      { key: `${f.id}-characters`, label: `${f.name} · ${t('stats.charactersOverTime')}`, value: at(f, 'characters') / maxCharacters, display: at(f, 'characters'), color: TREEMAP_SEGMENT_VARS[2] },
    ];
    return {
      key: f.id,
      label: f.name,
      value: at(f, 'territories'),
      display: at(f, 'territories'),
      color: f.color,
      // 沒有任何數值時不細分，只留勢力色的大區塊 /
      // With nothing to split, keep the plain faction-coloured block
      children: children.some((c) => c.value > 0) ? children : undefined,
    };
  });

  const placed = layoutTreemap(nodes, {
    x: 0,
    y: 0,
    width: TREEMAP_W,
    height: TREEMAP_H,
  });

  // hover：取代原生 <title>，四種樣式都用同一個 DOM 提示面板 /
  // Hover: replaces the native <title>; all four chart styles share one DOM tooltip
  const [hover, setHover] = useState<{
    label: string;
    color: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <ChartFrame title={t('stats.factionPower')}>
      {placed.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{t('game.noData')}</p>
      ) : (
        <>
          <div
            className="relative"
            ref={wrapRef}
            onPointerMove={(event) => {
              const box = wrapRef.current?.getBoundingClientRect();
              if (!box) return;
              // 座標換算成 viewBox 空間後用 hitTest 找出被指向的區塊 /
              // Convert into viewBox space and hit-test for the block under the
              // cursor, so the tooltip follows the actual rectangle
              const scaleX = TREEMAP_W / Math.max(box.width, 1);
              const scaleY = TREEMAP_H / Math.max(box.height, 1);
              const vx = (event.clientX - box.left) * scaleX;
              const vy = (event.clientY - box.top) * scaleY;
              // 子分段是疊在父區塊「裡面」的，所以取第一個命中的會永遠拿到父區塊，
              // 細分段就永遠 hover 不到。改成在所有命中裡挑面積最小的（最深層）。
              // A child segment sits *inside* its parent's rect, so taking the
              // first hit always returned the parent and the subdivided segments
              // could never be hovered. Pick the smallest containing rect instead,
              // which is always the deepest one under the cursor.
              let hit: (typeof placed)[number] | undefined;
              for (const candidate of placed) {
                const { x, y, width, height } = candidate;
                if (vx < x || vx > x + width || vy < y || vy > y + height) continue;
                if (hit === undefined || width * height < hit.width * hit.height) {
                  hit = candidate;
                }
              }
              if (!hit) {
                setHover(null);
                return;
              }
              setHover({
                // `key` is the faction/segment id, `label` is what we actually
                // want to read out (faction name, or "faction · metric" for a
                // subdivided segment)
                label: hit.node.label,
                color: hit.node.color,
                // Parents hold a real count; child segments store a normalised
                // 0..1 for layout, so read the untouched number instead
                value: hit.node.display ?? hit.node.value,
                x: event.clientX - box.left,
                y: event.clientY - box.top,
              });
            }}
            onPointerLeave={() => setHover(null)}
          >
          <svg
            viewBox={`0 0 ${TREEMAP_W} ${TREEMAP_H}`}
            className="w-full"
            role="img"
            aria-label={t('stats.factionPower')}
          >
            {placed.map(({ node, x, y, width, height }) => {
              // 父區塊畫勢力色底，子區塊疊在它上面 /
              // Parents paint the faction colour; children sit on top
              const isParent = node.children !== undefined;
              return (
                <rect
                  key={node.key}
                  x={x}
                  y={y}
                  width={Math.max(0, width)}
                  height={Math.max(0, height)}
                  fill={node.color}
                  fillOpacity={isParent ? 0.22 : 0.62}
                  stroke={node.color}
                  strokeWidth={isParent ? 1 : 0.5}
                  className="pointer-events-none transition-[fill-opacity,stroke-width] duration-200"
                />
              );
            })}
          </svg>
          {hover && (
            <ChartTooltip
              x={hover.x}
        flip={hover.x > CHART_TIP_FLIP_AT}
              y={hover.y}
              rows={[{ label: hover.label, color: hover.color, value: hover.value }]}
            />
          )}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
            {ranked.map((f) => (
              <li
                key={f.id}
                className="group inline-flex items-center gap-1.5 text-[13px] text-gray-400 font-mono transition-colors duration-200 hover:text-gray-100"
                title={f.name}
              >
                <span
                  className="w-2.5 h-2.5 rounded-[1px] shrink-0 transition-transform duration-200 group-hover:scale-125"
                  style={{ backgroundColor: f.color }}
                />
                <span className="truncate max-w-[80px]">{f.name}</span>
                <span className="text-gray-500">{at(f, 'territories')}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
            {TREEMAP_SEGMENT_KEYS.map((key, i) => (
              <li
                key={key}
                className="group inline-flex items-center gap-1.5 text-[13px] text-gray-500 font-mono transition-colors duration-200 hover:text-gray-200"
              >
                <span
                  className="w-2.5 h-2.5 rounded-[1px] shrink-0 transition-transform duration-200 group-hover:scale-125"
                  style={{ backgroundColor: TREEMAP_SEGMENT_VARS[i] }}
                />
                {key === 'troops'
                  ? t('stats.troopsOverTime')
                  : key === 'gold'
                    ? t('stats.goldOverTime')
                    : t('stats.charactersOverTime')}
              </li>
            ))}
          </ul>
        </>
      )}
    </ChartFrame>
  );
}

/** 雷達圖的六個軸：五項能力 + 年齡 / The radar's six axes: five abilities plus age */
export const RADAR_AXES = [
  { key: 'wu', label: 'character.wu', max: CONFIG.CHAR_ABILITY_MAX },
  { key: 'tong', label: 'character.tong', max: CONFIG.CHAR_ABILITY_MAX },
  { key: 'jing', label: 'character.jing', max: CONFIG.CHAR_ABILITY_MAX },
  { key: 'speed', label: 'character.speed', max: CONFIG.CHAR_SPEED_MAX },
  { key: 'ambition', label: 'character.ambition', max: CONFIG.CHAR_AMBITION_MAX },
  { key: 'age', label: 'character.age', max: CONFIG.CHAR_MAX_AGE_MAX },
] as const;

/**
 * 將一組數值轉成雷達多邊形的點字串。
 * Turn one series of axis values into an SVG polygon point list.
 *
 * @param values - 每個軸的值（與 RADAR_AXES 同序）/ One value per axis, in RADAR_AXES order
 * @param size - viewBox 邊長 / viewBox edge length
 * @param radius - 最外圈半徑 / Outermost ring radius
 * @returns "x,y x,y …" / A "x,y x,y …" point list
 */
function radarPoints(values: number[], size: number, radius: number): string {
  const cx = size / 2;
  const cy = size / 2;
  return RADAR_AXES.map((axis, i) => {
    const ratio = Math.max(0, Math.min(1, (values[i] ?? 0) / axis.max));
    const angle = -Math.PI / 2 + (i / RADAR_AXES.length) * Math.PI * 2;
    const r = ratio * radius;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

/** 某個軸在雷達圖上的角度 / The angle of one axis on the radar */
function radarAngle(index: number): number {
  return -Math.PI / 2 + (index / RADAR_AXES.length) * Math.PI * 2;
}

/** 同心格線：四條軸線各畫四圈 / Concentric grid: four rings along each of the six axes */
function RadarGrid({ size, radius }: { size: number; radius: number }) {
  const cx = size / 2;
  const cy = size / 2;
  return (
    <g>
      {[0.25, 0.5, 0.75, 1].map((pct) =>
        RADAR_AXES.map((axis, i) => {
          const r = pct * radius;
          return (
            <line
              key={`${pct}-${axis.key}`}
              x1={cx}
              y1={cy}
              x2={cx + r * Math.cos(radarAngle(i))}
              y2={cy + r * Math.sin(radarAngle(i))}
              stroke="var(--color-ds-void)"
              strokeWidth={0.5}
            />
          );
        })
      )}
    </g>
  );
}

/** 軸標籤（沿用 character.* i18n 鍵）/ Axis labels, reusing the existing character.* keys */
function RadarAxisLabels({ size, radius }: { size: number; radius: number }) {
  const cx = size / 2;
  const cy = size / 2;
  return (
    <g>
      {RADAR_AXES.map((axis, i) => {
        const r = radius + 15;
        return (
          <text
            key={axis.key}
            x={cx + r * Math.cos(radarAngle(i))}
            y={cy + r * Math.sin(radarAngle(i))}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontFamily="monospace"
            style={{ fill: 'var(--color-ds-muted)' }}
          >
            {t(axis.label)}
          </text>
        );
      })}
    </g>
  );
}

/** 某個角色的雷達數值，依雷達軸順序 / One character's values in radar-axis order */
function characterRadarValues(
  character: WorldState['characters'][0]
): number[] {
  return RADAR_AXES.map((axis) => character[axis.key] as number);
}

/**
 * 將領雷達圖：每個勢力一個多邊形，畫的是該勢力存活將領的平均屬性，
 * 虛線是全世界的平均值當參考基準。
 * Character radar: one polygon per faction showing its living characters' mean
 * attributes, with the world average as a dashed reference.
 *
 * 各軸用不同的最大值正規化（年齡上限本來就遠高於能力值），所以邊長不能跨軸比較，
 * 這是雷達圖的慣例：看的是「這個形狀像什麼」，不是絕對數值。
 * Each axis normalises against its own maximum (age tops out far above the
 * ability stats), so edge lengths are not comparable across axes — the usual
 * radar caveat: read the shape, not the absolute numbers.
 */
function CharacterRadar({
  characters,
  factions,
}: {
  characters: WorldState['characters'];
  factions: WorldState['factions'];
}) {
  const living = characters.filter((c) => c.alive);

  /** 依所給角色算每個軸的平均值 / Mean of every axis over the given characters */
  const means = (group: WorldState['characters']): number[] | null => {
    if (group.length === 0) return null;
    return RADAR_AXES.map((axis) => {
      const sum = group.reduce((acc, c) => acc + (c[axis.key] as number), 0);
      return sum / group.length;
    });
  };

  // 依存活將領數取前 N 個勢力，太多多邊形會互相蓋住 /
  // Cap to the factions with the most living characters; more polygons just overlap
  const bySize = factions
    .map((faction) => {
      const members = living.filter((c) => c.factionId === faction.id);
      return { faction, members, values: means(members) };
    })
    .filter((entry) => entry.values !== null)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, RADAR_MAX_FACTIONS);

  const worldAverage = means(living);

  return (
    <ChartFrame title={t('stats.attributes')}>
      {living.length === 0 || bySize.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">{t('game.noData')}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            className="w-full max-w-[240px] mx-auto"
            role="img"
            aria-label={t('stats.attributes')}
          >
            <RadarGrid size={RADAR_SIZE} radius={RADAR_RADIUS} />
            {/* 勢力多邊形 / Faction polygons */}
            {bySize.map(({ faction, values, members }) => (
              <polygon
                key={faction.id}
                points={radarPoints(values ?? [], RADAR_SIZE, RADAR_RADIUS)}
                fill={faction.color}
                fillOpacity={0.14}
                stroke={faction.color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                className="cursor-pointer transition-[stroke-width,fill-opacity] duration-200 hover:[stroke-width:2.5] hover:fill-opacity-30"
              >
                <title>{`${faction.name} · ${members.length}`}</title>
              </polygon>
            ))}
            {/* 世界平均參考線 / World-average reference */}
            {worldAverage && (
              <polygon
                points={radarPoints(worldAverage, RADAR_SIZE, RADAR_RADIUS)}
                fill="none"
                stroke="var(--color-ds-cyan)"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            )}
            <RadarAxisLabels size={RADAR_SIZE} radius={RADAR_RADIUS} />
          </svg>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
            {bySize.map(({ faction, members }) => (
              <li
                key={faction.id}
                className="group inline-flex items-center gap-1.5 text-[13px] text-gray-400 font-mono transition-colors duration-200 hover:text-gray-100"
                title={faction.name}
              >
                <span
                  className="w-2.5 h-2.5 rounded-[1px] shrink-0 transition-transform duration-200 group-hover:scale-125"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="truncate max-w-[80px]">{faction.name}</span>
                <span className="text-gray-500">{members.length}</span>
              </li>
            ))}
            {worldAverage && (
              <li className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 font-mono">
                <span
                  className="w-3 h-0 border-t border-dashed"
                  style={{ borderColor: 'var(--color-ds-cyan)' }}
                />
                {t('stats.worldAverage')}
              </li>
            )}
          </ul>
        </>
      )}
    </ChartFrame>
  );
}

/** hover 預覽的雷達圖尺寸（比側欄的小）/ Hover preview radar size (smaller than the sidebar one) */
const HOVER_RADAR_SIZE = 168;
const HOVER_RADAR_RADIUS = 54;

/**
 * 單一將領的雷達預覽：滑鼠停在將領表格的某一列時，浮在表格右側顯示他的屬性形狀，
 * 虛線是同勢力存活將領的平均值當參考。
 * Single-character radar preview: hovering a row of the leader table floats this
 * beside the table, with the faction's living mean as a dashed reference.
 *
 * 面板本身 `pointer-events-none`，否則游標移過去會讓該列觸發 mouseleave、
 * 面板馬上消失（閃爍）。整張表也會在指標離開時收起。
 * The panel is `pointer-events-none`: otherwise moving the cursor onto it would
 * fire the row's mouseleave and make the panel vanish (flicker). The whole table
 * also collapses when the pointer leaves it.
 */
export function CharacterRadarHover({
  character,
  factionAverage,
  color,
}: {
  character: WorldState['characters'][0];
  factionAverage: number[] | null;
  color: string;
}) {
  const values = characterRadarValues(character);
  // 參考環只在「真的不一樣」時才畫：單人勢力的平均值會與本人完全相同，
  // 疊在資料多邊形上等於看不見，看起來像壞掉不如明說 /
  // Only draw the reference ring when it genuinely differs. In a one-member
  // faction the mean coincides with the character, so the ring hides under the
  // data polygon — saying so plainly beats looking broken
  const referenceDiffers =
    factionAverage !== null &&
    factionAverage.some((value, i) => Math.abs(value - values[i]) > 1e-6);

  return (
    <div className="pointer-events-none w-[196px]">
      <div className="text-xs text-gray-200 font-medium truncate">{character.name}</div>
      <svg
        viewBox={`0 0 ${HOVER_RADAR_SIZE} ${HOVER_RADAR_SIZE}`}
        className="w-full"
        role="img"
        aria-label={`${character.name} ${t('stats.attributes')}`}
      >
        <RadarGrid size={HOVER_RADAR_SIZE} radius={HOVER_RADAR_RADIUS} />
        <polygon
          points={radarPoints(values, HOVER_RADAR_SIZE, HOVER_RADAR_RADIUS)}
          fill={color}
          fillOpacity={0.18}
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {referenceDiffers && factionAverage && (
          <polygon
            points={radarPoints(factionAverage, HOVER_RADAR_SIZE, HOVER_RADAR_RADIUS)}
            fill="none"
            stroke="var(--color-ds-cyan)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        )}
        <RadarAxisLabels size={HOVER_RADAR_SIZE} radius={HOVER_RADAR_RADIUS} />
      </svg>
      <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono">
        {referenceDiffers ? (
          <>
            <span
              className="w-2.5 h-0 border-t border-dashed"
              style={{ borderColor: 'var(--color-ds-cyan)' }}
            />
            {t('stats.factionAverage')}
          </>
        ) : (
          <span>{t('stats.factionAverageSelf')}</span>
        )}
      </div>
    </div>
  );
}

/** 圖表類型切換（折線／圓餅／長條／區塊圖）/ Chart type switch (line / pie / bar / treemap) */
function ChartTypeSwitch({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (next: ChartType) => void;
}) {
  return (
    <div className="flex gap-1 shrink-0" role="group" aria-label={t('stats.chartType')}>
      {CHART_TYPES.map((ct) => (
        <button
          key={ct}
          type="button"
          onClick={() => onChange(ct)}
          aria-pressed={value === ct}
          // 同上：選中態換成完整的 accent 按鈕，而不是在基底上加一個類別
          // Same reason: the selected state swaps in a complete accent button
          // min-h-11 = 44px 觸控目標下限 / 44px minimum touch target
          className={`${value === ct ? GM_BTN_ACCENT : GM_BTN} min-h-11 px-2.5 py-1.5 text-[13px] font-orbitron tracking-wider transition-colors duration-200`}
        >
          {t(CHART_TYPE_LABEL_KEYS[ct])}
        </button>
      ))}
    </div>
  );
}

export function StatsCharts({
  worldId,
  currentRound,
  characters,
  worldFactions,
}: {
  worldId: string;
  currentRound: number;
  characters: WorldState['characters'];
  worldFactions: WorldState['factions'];
}) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [data, setData] = useState<StatsPayload | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (currentRound < 1) return;
    let cancelled = false;
    async function fetchStats() {
      setFetchFailed(false);
      try {
        const res = await apiFetch(`/api/world/stats?from=0&to=${currentRound}`);
        if (res.ok) {
          const payload: StatsPayload = await res.json();
          if (!cancelled) setData(payload);
        } else if (!cancelled) {
          setFetchFailed(true);
        }
      } catch {
        if (!cancelled) setFetchFailed(true);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [currentRound, worldId]);

  // 必須宣告在下面的 early return 之前，否則違反 rules-of-hooks /
  // Must be declared before the early return below, or rules-of-hooks trips
  /** 放大檢視的圖表：點小圖 → 彈出放大版 / The chart opened in the lightbox: click a small chart to enlarge it */
  const [expandedChart, setExpandedChart] = useState<{
    title: string;
    series: ChartSeries[];
  } | null>(null);

  // 還沒拿到資料、也還沒失敗 → 顯示骨架，而不是「沒有資料」。這裡刻意用
  // data/fetchFailed 推導，不加狀態：骨架只是還沒回來，不是另一種事實。
  // No payload yet and no failure yet → show a skeleton rather than "no data".
  // Derived from data/fetchFailed instead of extra state: "not back yet" is not
  // a third fact, it is the absence of the two we already track.
  const statsPending = currentRound >= 1 && !data && !fetchFailed;

  if (currentRound < 1 || !data || data.rounds.length === 0) {
    return (
      <div className={`${GM_PANEL} p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-3">
          <h3 className={`${GM_TITLE} shrink-0 whitespace-nowrap`}>{t('stats.title')}</h3>
          <ChartTypeSwitch value={chartType} onChange={setChartType} />
        </div>
        {statsPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <div className={`${GM_SKEL} h-4 w-2/5`} />
            <div className={`${GM_SKEL} h-32 w-full`} />
            <div className={`${GM_SKEL} h-32 w-full`} />
          </div>
        ) : (
          <p className="text-gray-400 text-xs" role={fetchFailed ? 'alert' : undefined}>
            {fetchFailed ? t('general.error') : t('game.noData')}
          </p>
        )}
      </div>
    );
  }

  const { factions, rounds, world } = data;

  const factionSeries = (key: FactionStatKey): ChartSeries[] =>
    factions.map((f) => ({ values: f[key], color: f.color, label: f.name }));

  const worldSeries = (key: WorldStatKey): ChartSeries[] => [
    { values: world[key] ?? [], color: '#22d3ee', label: t('stats.title') },
  ];

  // 勢力數據（每個勢力一條序列）/ Faction data — one series per faction
  const factionCharts: Array<{ title: string; series: ChartSeries[] }> = [
    { title: t('stats.territoriesOverTime'), series: factionSeries('territories') },
    { title: t('stats.troopsOverTime'), series: factionSeries('troops') },
    { title: t('stats.goldOverTime'), series: factionSeries('gold') },
    { title: t('stats.charactersOverTime'), series: factionSeries('characters') },
  ];

  // 世界整體數據（單一序列）/ World-wide data — single series
  const worldCharts: Array<{ title: string; series: ChartSeries[] }> = [
    { title: t('stats.aliveFactionsOverTime'), series: worldSeries('aliveFactions') },
    { title: t('stats.totalCharactersOverTime'), series: worldSeries('totalCharacters') },
    { title: t('stats.unownedPlacesOverTime'), series: worldSeries('unownedPlaces') },
    { title: t('stats.garrisonOverTime'), series: worldSeries('totalGarrison') },
    { title: t('stats.roadsOverTime'), series: worldSeries('totalRoads') },
  ];

  function renderChart(chart: { title: string; series: ChartSeries[] }) {
    if (chart.series.length === 0) return null;
    if (chartType === 'pie') {
      // 單一序列用進度環，其餘用圓餅圖 / Single series uses the gauge, otherwise a pie
      return chart.series.length === 1 ? (
        <GaugeChart key={chart.title} series={chart.series} title={chart.title} />
      ) : (
        <PieChart key={chart.title} series={chart.series} title={chart.title} rounds={rounds} />
      );
    }
    if (chartType === 'square') {
      return (
        <BarChart
          key={chart.title}
          series={chart.series}
          title={chart.title}
          rounds={rounds}
        />
      );
    }
    return (
      <LineChart
        key={chart.title}
        series={chart.series}
        title={chart.title}
        rounds={rounds}
      />
    );
  }

  return (
    <div className={`${GM_PANEL} p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mb-3">
          <h3 className={`${GM_TITLE} shrink-0 whitespace-nowrap`}>{t('stats.title')}</h3>
        <ChartTypeSwitch value={chartType} onChange={setChartType} />
      </div>
      {chartType === 'treemap' ? (
        // 區塊圖是「勢力力量」的整合視角，不是任何單一指標的另一種畫法，
        // 所以這個模式下不畫那 9 張時間序列圖。
        // The treemap is a combined view of faction power, not another rendering
        // of any single metric, so it replaces the nine time-series charts.
        <FactionTreemap factions={factions} />
      ) : (
        <>
          {factionCharts.map((chart) => (
            <div key={chart.title}>
              {/* 點擊放大：外包成 button 而不是改動各圖表元件， 張圖表共用同一個 renderChart / Click to enlarge: wrap at the frame rather than touching every chart component, since all nine share one renderChart */}
              <button
                type="button"
                onClick={() => setExpandedChart(chart)}
                title={t('stats.expand')}
                aria-label={`${t('stats.expand')} ${chart.title}`}
                className="w-full text-left cursor-pointer"
              >
                {renderChart(chart)}
              </button>
            </div>
          ))}
          {factionCharts.some((c) => c.series.length > 0) && (
            <div className="border-t border-white/5 pt-3 mt-1">
              {worldCharts.map((chart) => (
                <div key={chart.title}>
                  <button
                    type="button"
                    onClick={() => setExpandedChart(chart)}
                    title={t('stats.expand')}
                    aria-label={`${t('stats.expand')} ${chart.title}`}
                    className="w-full text-left cursor-pointer"
                  >
                    {renderChart(chart)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {/* 放大檢視 / Enlarged view */}
      <DetailModal
        open={expandedChart !== null}
        onClose={() => setExpandedChart(null)}
        title={expandedChart ? expandedChart.title : ''}
      >
        {expandedChart && renderChart({ ...expandedChart, title: '' })}
      </DetailModal>
      {/* 雷達圖是自己的面板，不受圖表類型影響 / The radar is its own panel and ignores the type toggle */}
      <div className="border-t border-white/5 pt-3 mt-1">
        <CharacterRadar characters={characters} factions={worldFactions} />
      </div>
    </div>
  );
}
