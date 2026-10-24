'use client';

// ============================================================================
// 裝配線的活體 / The assembly line's live half
// ============================================================================
// 只有一個 rAF 迴圈、只寫 transform / 透明度 / display，絕不逐帧 setState。回合數
// 來自 usePublicWorld（模組單例 poller）：回合 +1 時，完工的船滑出廠房、新龍骨進
// 站、18 隻電子手逐站施工（指到的那隻手探向工作點、工具頭亮起、火花濺到船面）、
// 第 17 站裝上引擎、第 18 站試車——同一時間里程計滾到新數、後牆的 18 格狀態燈條
// 逐格亮起、工作點正上方那盞工位燈點亮。離開視口或頁籤隱藏即停；
// prefers-reduced-motion 直接落到靜止的一帧（末端完工的船，火光只剩餘燼）。
//
// One rAF loop, writing only transforms / opacities / display — never a per-frame
// setState. The round comes from usePublicWorld (the module-singleton poller): when
// the round advances, the finished ship rolls out of the hall, a bare keel enters,
// the 18 electronic hands work through it station by station (the pointed-at hand
// reaches for the work point, its tool lights, sparks land on the hull), the engine
// is fitted at station 17 and test-fired at station 18 — while the odometer rolls
// to the new number, the back wall's 18-cell status strip fills cell by cell, and
// the station lamp directly over the work point comes on. The loop stops offscreen
// or on a hidden tab; prefers-reduced-motion lands straight on one still frame.
//
// 靜止形狀在 geometry.ts 算好、這裡只搬；靜態畫在 art.tsx。這一檔負責三件只有
// 客戶端能做的事：逐帧的位移與透明度、`usePublicWorld` 的回合、以及指標／鍵盤。
// Rest shapes live in geometry.ts and are only moved here; static art is art.tsx.
// This file does the three things only a client can: per-frame transforms and
// opacities, the round from usePublicWorld, and pointer/keyboard.
// ============================================================================

import * as React from 'react';
import { IsoFigure, Line, Solid } from '@/components/iso/react/draw';
import { asksForStillness } from '@/components/iso/react/live';
import { usePublicWorld } from '@/components/home/usePublicWorld';
import { createTranslator, type Locale } from '@/lib/i18n';
import { ROUND_PHASES } from '@/lib/roundPhases';
import { CRUCIBLE_ART, FIRE_ART, HAND_ART, LAMP_ART, ODO_ART, RACK_ART } from './geometry';
import {
  SPARK_COUNT,
  TOTAL_SECONDS,
  armPose,
  burnFollow,
  cellAt,
  digitShift,
  digitTargets,
  glowFlame,
  glowHalo,
  glowTool,
  lampAt,
  passAt,
  passBusy,
  pourAt,
  rollDigit,
  shipPartVisible,
  sparkDots,
} from './frame';
import { HEIGHT, STATIONS, WIDTH, shift, spin } from './view';
import {
  CABINET_EL,
  CRADLE_EL,
  FLOOR_FRONT_EL,
  HALL_EL,
  HAND_BASES,
  HITS_EL,
  LABEL_EL,
  ODO_EL,
  RACK_EL,
  RAIL_FAR_EL,
  RAIL_NEAR_EL,
  SHIP_PARTS,
  WORKS_EL,
  OdoStripGlyphs,
} from './art';

const BURN_SECONDS = 0.25;
const DIGIT_SECONDS = 0.5;
const pad2 = (value: number) => String(value).padStart(2, '0');
const pad4 = (value: number) => String(Math.max(0, Math.floor(value))).padStart(4, '0');

type Translator = (key: string, params?: Record<string, string | number>) => string;

/** 站位 → 階段名（單一來源 ROUND_PHASES）/ Station → phase name (the single source)
    翻譯函式由呼叫端帶進來，不是模組層的環境 t()：那個在 SSR 上解析成預設語系，
    會讓 aria-valuetext 在英文版上伺服器／客戶端不一致（見 EngineLabFigure 的註解） */
const phaseName = (t: Translator, station: number) => {
  const phase = ROUND_PHASES[station - 1];
  return phase ? t(`phases.${phase.id}`) : '';
};

/** 一隻手的三個關節群組與它的能量面 / One hand's three joint groups and its energy faces */
interface HandNodes {
  shoulder: SVGGElement | null;
  elbow: SVGGElement | null;
  tool: SVGGElement | null;
  faces: SVGGElement | null;
}

const EMPTY_HANDS = (): HandNodes[] =>
  Array.from({ length: STATIONS }, () => ({ shoulder: null, elbow: null, tool: null, faces: null }));
const EMPTY_NODES = <T,>(count: number): (T | null)[] => Array.from({ length: count }, () => null);

export function EngineLabLive(props: { locale: Locale; label: string }) {
  // 翻譯函式以 locale 為鍵穩定住：draw() 是 rAF 路徑的依賴之一，每次 render 換一
  // 個新函式會讓下面掛著 draw 的 layout effect 每次都重跑。
  // The translator is pinned to the locale: draw() is one of the rAF path's
  // dependencies, and a fresh function per render would re-run the layout effects
  // that depend on it every time.
  const t = React.useMemo(() => createTranslator(props.locale), [props.locale]);
  const root = React.useRef<HTMLDivElement | null>(null);

  /**
   * 讀出槽：與 kit 的 useReadout 同一條規則（closest .iso-plate [data-readout]），
   * 但在這裡自己寫——把 hook 回傳的 anchor 再掛到別的 ref 上會觸發 React Compiler
   * 的 immutability 規則，而說明文字只需要 root 一個錨點。
   * The readout: the same rule as the kit's useReadout (closest .iso-plate
   * [data-readout]), written here because re-attaching a hook-returned ref trips the
   * React Compiler's immutability rule, and the readout only ever needs the one root
   * anchor.
   */
  const say = React.useCallback((text: string) => {
    const slot = root.current?.closest('.iso-plate')?.querySelector('[data-readout]');
    if (slot && slot.textContent !== text) slot.textContent = text;
  }, []);

  // ── 每帧會動的節點 / The per-frame nodes ─────────────────────────────────
  const ship = React.useRef<SVGGElement | null>(null);
  const parts = React.useRef<(SVGGElement | null)[]>(EMPTY_NODES<SVGGElement>(STATIONS));
  const fireWrap = React.useRef<SVGGElement | null>(null);
  const fireOuter = React.useRef<SVGGElement | null>(null);
  const fireInner = React.useRef<SVGGElement | null>(null);
  const halo = React.useRef<SVGCircleElement | null>(null);
  const crucible = React.useRef<SVGPathElement | null>(null);
  const pour = React.useRef<SVGPathElement | null>(null);
  const lamps = React.useRef<(SVGPathElement | null)[]>(EMPTY_NODES<SVGPathElement>(STATIONS));
  const cells = React.useRef<(SVGPathElement | null)[]>(EMPTY_NODES<SVGPathElement>(STATIONS));
  const sparks = React.useRef<(SVGCircleElement | null)[]>(EMPTY_NODES<SVGCircleElement>(SPARK_COUNT));
  const strips = React.useRef<(SVGGElement | null)[]>(EMPTY_NODES<SVGGElement>(4));
  const hands = React.useRef<HandNodes[]>(EMPTY_HANDS());

  // ── 運動狀態（refs，不是 state）/ Motion state (refs, not state) ──────────
  /** 這趟走線已走的秒數；休息值是「上一回合在末端完工」/ Seconds into this pass; the resting value is "the last round finished at the end" */
  const elapsed = React.useRef(TOTAL_SECONDS);
  const burn = React.useRef(0);
  const digits = React.useRef([0, 0, 0, 0]);
  const goals = React.useRef([0, 0, 0, 0]);
  const visible = React.useRef(true);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const [selected, setSelected] = React.useState(1);
  const selectedRef = React.useRef(1);
  const roundRef = React.useRef(0);

  // 回合數：usePublicWorld 的模組單例 / The round: the module-singleton poller
  const world = usePublicWorld();
  const round = world.payload?.world.round ?? 0;

  const draw = React.useCallback(() => {
    const calm = asksForStillness();
    const now = performance.now() / 1000;
    const pass = passAt(elapsed.current);
    const sweeping = elapsed.current < TOTAL_SECONDS;

    // 產品：整條船（含托架）沿線平移；滑出時淡掉 / The product: the whole ship (cradle
    // included) translates along the line, and fades as it rolls out
    if (ship.current) {
      const transform = shift(pass.shipX, 0, 0);
      if (ship.current.getAttribute('transform') !== transform) ship.current.setAttribute('transform', transform);
      const alpha = pass.alpha.toFixed(3);
      if (ship.current.style.opacity !== alpha) ship.current.style.opacity = alpha;
    }
    // 零件：工作點走到哪一站就裝到哪一批 / Parts: whatever the work point has reached is fitted
    for (let step = 1; step <= STATIONS; step++) {
      const node = parts.current[step - 1];
      if (!node) continue;
      const wanted = shipPartVisible(step, pass.station) ? '' : 'none';
      if (node.style.display !== wanted) node.style.display = wanted;
    }

    // 18 隻手：肩、肘是螢幕旋轉；工具頭反向轉回去，永遠端平
    // The 18 hands: shoulder and elbow turn by a screen rotation, and the tool is
    // counter-rotated so it is always held level
    for (let index = 1; index <= STATIONS; index++) {
      const hand = HAND_ART[index - 1]!;
      const nodes = hands.current[index - 1]!;
      const pose = armPose(index, pass.station, selectedRef.current, calm);
      if (nodes.shoulder) {
        const transform = spin(pose.shoulder, hand.shoulderPivot);
        if (nodes.shoulder.getAttribute('transform') !== transform) nodes.shoulder.setAttribute('transform', transform);
      }
      if (nodes.elbow) {
        const transform = spin(pose.elbow, hand.elbowPivot);
        if (nodes.elbow.getAttribute('transform') !== transform) nodes.elbow.setAttribute('transform', transform);
      }
      if (nodes.tool) {
        const transform = spin(-(pose.shoulder + pose.elbow), hand.toolPivot);
        if (nodes.tool.getAttribute('transform') !== transform) nodes.tool.setAttribute('transform', transform);
      }
      if (nodes.faces) {
        // 工具頭的光跟著「工作度」；第 18 站的點火手另外吃試車的燃量
        // A tool's glow rides its activity; the igniter at station 18 also takes the test-fire's burn
        const face = glowTool(pose.reach, index === STATIONS ? burn.current : 0).toFixed(3);
        if (nodes.faces.style.opacity !== face) nodes.faces.style.opacity = face;
      }
    }

    // 燈：工位燈與後牆燈條。只在值真的變了才寫——36 個節點每帧都寫是浪費
    // The lamps: station lamps and the wall strip, written only when the value
    // actually changes — writing all 36 every frame is waste
    for (let index = 1; index <= STATIONS; index++) {
      const lamp = lamps.current[index - 1];
      if (lamp) {
        const value = lampAt(index, pass.station).toFixed(2);
        if (lamp.style.opacity !== value) lamp.style.opacity = value;
      }
      const cell = cells.current[index - 1];
      if (cell) {
        const value = cellAt(index, pass.station).toFixed(2);
        if (cell.style.opacity !== value) cell.style.opacity = value;
      }
    }

    // 熔金塔：第 17 站（裝引擎）澆口最亮 / The crucible: brightest while the work point is at station 17
    if (crucible.current) crucible.current.style.opacity = (0.22 + 0.7 * pourAt(pass.station)).toFixed(3);
    if (pour.current) pour.current.style.opacity = pourAt(pass.station).toFixed(3);

    // 試車焰（第 18 站之後）與鐘口環暈：與第 18 批零件同時出現
    // The test-fire (after station 18) and the bell's halo: they arrive with batch 18
    if (fireWrap.current) {
      const wanted = shipPartVisible(STATIONS, pass.station) ? '' : 'none';
      if (fireWrap.current.style.display !== wanted) fireWrap.current.style.display = wanted;
    }
    const flame = glowFlame(now, burn.current, calm);
    if (fireOuter.current) fireOuter.current.style.opacity = flame.outer.toFixed(3);
    if (fireInner.current) fireInner.current.style.opacity = flame.inner.toFixed(3);
    if (halo.current) halo.current.setAttribute('opacity', glowHalo(now, burn.current, calm).toFixed(3));

    // 火花：走線中跟著工作點，靜止時跟著選到的那隻手（hover 的回應）
    // Sparks: they follow the work point while the line runs, and the selected hand
    // while it rests (the answer to a hover)
    const active = sweeping ? Math.min(STATIONS, Math.max(1, Math.round(pass.station))) : selectedRef.current;
    const dots = sparkDots(now, active, pass.station, selectedRef.current, calm);
    for (let k = 0; k < SPARK_COUNT; k++) {
      const circle = sparks.current[k];
      if (!circle) continue;
      const [point, alpha, radius] = dots[k]!;
      circle.setAttribute('cx', point[0].toFixed(2));
      circle.setAttribute('cy', point[1].toFixed(2));
      circle.setAttribute('r', radius.toFixed(2));
      circle.setAttribute('opacity', alpha.toFixed(3));
    }

    // 里程計：四位數位帶 / The odometer: four digit strips
    for (let slot = 0; slot < 4; slot++) {
      const strip = strips.current[slot];
      if (!strip) continue;
      const transform = `${ODO_ART.digitSlots[slot]} translate(0 ${digitShift(digits.current[slot] ?? 0)})`;
      if (strip.getAttribute('transform') !== transform) strip.setAttribute('transform', transform);
    }

    // 讀出槽：走線中報「正過哪一站」，靜止時報「你指到的那一站」
    // The readout: the station being passed while the line runs, the one you point
    // at while it rests
    const shown = sweeping ? Math.min(STATIONS, Math.max(1, Math.round(pass.station))) : selectedRef.current;
    say(
      roundRef.current > 0
        ? `${t('home.engineLab.rnd')} ${pad4(roundRef.current)} · ${pad2(shown)}/18 · ${phaseName(t, shown)}`
        : t('home.engineLab.readoutIdle'),
    );
  }, [say, t]);

  const stop = React.useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  const busy = React.useCallback(() => passBusy(elapsed.current) || burn.current > 1e-3, []);

  const run = React.useCallback(() => {
    if (frame.current) return;
    if (!visible.current || document.hidden) return;
    last.current = 0;
    const tick = (nowMs: number) => {
      if (!visible.current || document.hidden) {
        frame.current = 0;
        return;
      }
      const dt = last.current ? Math.min((nowMs - last.current) / 1000, 1 / 30) : 1 / 60;
      last.current = nowMs;
      const calm = asksForStillness();
      if (calm) {
        // 靜止的一帧：直接落到休息態 / One still frame: land straight on the resting state
        elapsed.current = TOTAL_SECONDS;
        burn.current = 0;
        digits.current = [...goals.current];
      } else {
        elapsed.current += dt;
        // 焰量跟隨這趟走線的目標（第 18 站之後點火，結束後只留餘燼）
        // The burn follows this pass's target (ignition after station 18, embers after)
        burn.current = burnFollow(burn.current, passAt(elapsed.current).burn, dt, BURN_SECONDS);
        digits.current = digits.current.map((value, slot) =>
          rollDigit(value, goals.current[slot] ?? 0, dt, DIGIT_SECONDS, calm).value,
        );
      }
      draw();
      frame.current = busy() ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [busy, draw]);

  // 完成後的下一次機會：離開視口時動畫停在當下；回來時若有未竟之事續跑
  // The next chance after finishing: offscreen pauses mid-motion; returning resumes
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      visible.current = !!entry?.isIntersecting;
      if (visible.current && busy()) run();
    });
    io.observe(el);
    const onVisibility = () => {
      if (!document.hidden && visible.current && busy()) run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [busy, run]);

  React.useEffect(() => stop, [stop]);

  // 回合前進：新的一趟走線。layout effect + 先 draw()：React 重渲染會把 JSX 的
  // rest 屬性蓋回去，繪製必須在**上屏之前**糾正，否則會閃一帧舊姿。
  // A round advanced: a new pass. Layout effect + draw() first: React's re-render
  // rewrites the rest attributes from JSX, so the drawing must be corrected
  // **before paint** or a frame of the old pose flashes.
  React.useLayoutEffect(() => {
    if (round === roundRef.current) return;
    const advanced = round > roundRef.current;
    roundRef.current = round;
    goals.current = digitTargets(round);
    if (advanced) {
      elapsed.current = 0;
      burn.current = 0;
    } else {
      // 世界被重置：就地落到休息態，不跑一趟 / The world was reset: land in place, no pass
      elapsed.current = TOTAL_SECONDS;
      burn.current = 0;
      digits.current = digitTargets(round);
      goals.current = [...digits.current];
    }
    draw();
    run();
  }, [round, run, draw]);

  // 選中站位：工具頭亮起、手探向工作點。layout effect 的理由同上——選取態要在上屏
  // 之前就畫好，不然會閃一帧「手還收著」。
  // A selected station: its tool lights and the hand reaches for the work point. The
  // layout effect is for the same reason — the state has to be drawn before paint or
  // a frame of the parked pose flashes.
  React.useLayoutEffect(() => {
    selectedRef.current = selected;
    draw();
    run();
  }, [selected, draw, run]);

  const select = React.useCallback((station: number) => {
    const next = ((station - 1 + STATIONS) % STATIONS) + 1;
    setSelected(next);
  }, []);

  /**
   * 指到哪隻手：螢幕上最近的命中圈。距離上限是命中圈半徑的 1.4 倍——再寬，游標停
   * 在兩隻手之間就會亂跳。命中圈是 DOM 裡最後一組，任何零件都蓋不掉。
   * Which hand is pointed at: the nearest hit circle on screen. The gate is 1.4× the
   * circle's radius — wider and a cursor between two hands flickers. The hit circles
   * are the last group in the DOM, so nothing can sit over them.
   */
  const xToStation = React.useCallback((clientX: number, clientY: number) => {
    const circles = root.current?.querySelectorAll<SVGCircleElement>('.el-hit');
    if (!circles) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    circles.forEach((circle) => {
      const station = Number(circle.dataset.station);
      if (!Number.isFinite(station)) return;
      const box = circle.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      const dx = box.left + box.width / 2 - clientX;
      const dy = box.top + box.height / 2 - clientY;
      const dist = dx * dx + dy * dy;
      const gate = (box.width / 2) * 1.4;
      if (dist <= gate * gate && dist < bestDist) {
        bestDist = dist;
        best = station;
      }
    });
    return best;
  }, []);

  return (
    <div
      ref={(node) => {
        root.current = node;
      }}
      className="el"
      role="slider"
      tabIndex={0}
      aria-label={props.label}
      aria-valuemin={1}
      aria-valuemax={STATIONS}
      aria-valuenow={selected}
      aria-valuetext={`${pad2(selected)}/18 · ${phaseName(t, selected)}`}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const station = xToStation(event.clientX, event.clientY);
        if (station !== null) select(station);
      }}
      onPointerDown={(event) => {
        const station = xToStation(event.clientX, event.clientY);
        if (station !== null) select(station);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          select(selectedRef.current + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          select(selectedRef.current - 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          select(1);
        } else if (event.key === 'End') {
          event.preventDefault();
          select(STATIONS);
        }
      }}
    >
      <IsoFigure width={WIDTH} height={HEIGHT} label={props.label} className="el-stage">
        <defs>
          <clipPath id="el-odo-clip">
            <path d={ODO_ART.clip} />
          </clipPath>
          {/* 環暈：螢幕空間的輻射光，色接 lit 代幣 / The halo: screen-space radial light on the lit token */}
          <radialGradient id="el-halo">
            <stop offset="0%" style={{ stopColor: 'var(--anatomy-lit)', stopOpacity: 0.45 }} />
            <stop offset="55%" style={{ stopColor: 'var(--anatomy-lit)', stopOpacity: 0.12 }} />
            <stop offset="100%" style={{ stopColor: 'var(--anatomy-lit)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* ── 遠景 / far plane ───────────────────────────────────────────── */}
        {HALL_EL}
        {RACK_EL}
        {/* 後牆的 18 格狀態燈條：走過的格子亮著（frame.ts 的 cellAt）*/}
        {RACK_ART.stripCells.map((cell, index) => (
          <path
            key={index}
            ref={(node) => {
              cells.current[index] = node;
            }}
            className="el-hot"
            d={cell.fill}
            opacity={0.05}
          />
        ))}
        {CABINET_EL}
        {WORKS_EL}
        {/* 熔金塔的澆口窗與澆口面：第 17 站（裝引擎）亮起 */}
        <path
          ref={(node) => {
            crucible.current = node;
          }}
          className="el-melt"
          d={CRUCIBLE_ART.window.fill}
          opacity={0.22}
        />
        <path
          ref={(node) => {
            pour.current = node;
          }}
          className="el-melt"
          d={CRUCIBLE_ART.pour.fill}
          opacity={0}
        />
        {/* 18 盞工位燈：工作點正上方那盞最亮 */}
        {LAMP_ART.faces.map((face, index) => (
          <path
            key={index}
            ref={(node) => {
              lamps.current[index] = node;
            }}
            className="el-hot"
            d={face.fill}
            opacity={0.05}
          />
        ))}
        {RAIL_FAR_EL}

        {/* 18 隻電子手：基座（靜態）→ 肩 → 肘 → 工具頭（反向轉回水平）
            The 18 electronic hands: base (static) → shoulder → elbow → tool
            (counter-rotated back to level) */}
        {HAND_ART.map((hand, index) => (
          <g key={hand.index}>
            {HAND_BASES[index]}
            <g
              ref={(node) => {
                hands.current[index]!.shoulder = node;
              }}
            >
              {/* 上臂與前臂是最大的兩個面：保留四色階，並用 hi 讓他們從暗色的廠房
                  裡跳出來——18 隻「電子手」是這張圖的主角。肘、腕、工具零件小，改
                  flat（理由見 art.tsx 的 HAND_BASES）*/}
              <Solid paths={hand.upper} tone="mid" crease="faint" />
              <Solid paths={hand.elbow} tone="hi" crease="none" flat />
              <g
                ref={(node) => {
                  hands.current[index]!.elbow = node;
                }}
              >
                <Solid paths={hand.forearm} tone="mid" crease="faint" />
                <Solid paths={hand.wrist} tone="hi" crease="none" flat />
                <g
                  ref={(node) => {
                    hands.current[index]!.tool = node;
                  }}
                >
                  <Solid paths={hand.toolBody} tone="hi" crease="faint" />
                  {hand.toolParts.map((paths, part) => (
                    <Solid key={part} paths={paths} tone="mid" crease="none" flat />
                  ))}
                  <g
                    ref={(node) => {
                      hands.current[index]!.faces = node;
                    }}
                  >
                    {hand.toolFaces.map((face, part) => (
                      <path key={part} className="el-hot" d={face.fill} />
                    ))}
                  </g>
                </g>
              </g>
            </g>
          </g>
        ))}

        {/* ── 產品 / product ─────────────────────────────────────────────── */}
        <g
          ref={(node) => {
            ship.current = node;
          }}
          className="el-ship"
        >
          {CRADLE_EL}
          {SHIP_PARTS.map((part, index) => (
            <g
              key={index}
              ref={(node) => {
                parts.current[index] = node;
              }}
            >
              {part}
            </g>
          ))}
          {
            // 試車焰與鐘口環暈**跟著第 18 批零件**出現：引擎還沒裝上就有一道焰
            // 是說謊。display 由 draw() 與零件同步開關（step 18）。
            // The test-fire and the bell's halo appear **with batch 18**: a flame
            // before the engine is fitted would be a lie. Its display is toggled by
            // draw() together with that part.
          }
          <g
            ref={(node) => {
              fireWrap.current = node;
            }}
          >
          <circle
            ref={(node) => {
              halo.current = node;
            }}
            className="el-halo"
            cx={FIRE_ART.haloAt[0]}
            cy={FIRE_ART.haloAt[1]}
            r={30}
            opacity={0.16}
          />
          <g
            ref={(node) => {
              fireOuter.current = node;
            }}
            className="el-flame"
            opacity={0.09}
          >
            <path className="el-melt" d={FIRE_ART.outer.fill} />
            <path className="el-melt" d={FIRE_ART.core.fill} />
          </g>
          <g
            ref={(node) => {
              fireInner.current = node;
            }}
            className="el-flame"
            opacity={0.14}
          >
            <path className="el-hot" d={FIRE_ART.inner.fill} />
          </g>
          </g>
        </g>

        {/* ── 近景 / near plane ─────────────────────────────────────────── */}
        {RAIL_NEAR_EL}
        {FLOOR_FRONT_EL}
        {ODO_EL}
        <g clipPath="url(#el-odo-clip)">
          {ODO_ART.digitSlots.map((matrix, slot) => (
            <g
              key={slot}
              ref={(node) => {
                strips.current[slot] = node;
              }}
              transform={`${matrix} translate(0 0)`}
            >
              <OdoStripGlyphs />
            </g>
          ))}
          {/* 位間蓋條：畫在數位帶之上，讓窗口讀成四格 / The slot dividers above the
              digit strips, so the window reads as four ruled columns */}
          <Line d={ODO_ART.dividers} tone="faint" />
        </g>
        {LABEL_EL}
        {/* 火花：從工具梢濺到船面上（共用一池，跟著工作點那隻手）*/}
        {EMPTY_NODES<number>(SPARK_COUNT).map((_, k) => (
          <circle
            key={k}
            ref={(node) => {
              sparks.current[k] = node;
            }}
            className="el-spark"
            cx={0}
            cy={0}
            r={1}
            opacity={0}
          />
        ))}
        {HITS_EL}
      </IsoFigure>
    </div>
  );
}
