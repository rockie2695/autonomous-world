// ============================================================================
// 艦隊交戰動畫 / Battle fleet animation
// ----------------------------------------------------------------------------
// 首頁與遊戲頁共用的戰艦動畫層。Canvas 2D，一個 requestAnimationFrame。
//
// The shared ship-animation layer for the home page and the game page. Canvas 2D,
// one requestAnimationFrame.
//
// 「戰線」是由現實資料推導的（見 `battleFleet.ts`），不是事件推播，所以這一層
// 不需要任何事件管線：拿到據點與道路就能跑。
//
// The front lines are derived from real data (see `battleFleet.ts`) rather than
// pushed as events, so this layer needs no event plumbing: hand it settlements
// and roads and it runs.
//
// 動畫要點 / What the animation does
// 每條戰線上，雙方各有幾艘船沿線巡航，並且**互相開火** —— 曳光彈從攻擊方飛向
// 最近的敵方船。船到位後會掉頭，所以畫面永遠是「正在打」而不是「打完了」。
//
// On each front, both sides fly ships along the line and **exchange fire** —
// tracers travel from the shooter toward the nearest enemy ship. Ships turn
// around at the ends, so the screen always reads as "fighting now" rather than
// "already won".
//
// 效能 / Performance
// 動畫迴圈一律遵守專案規則：離開視窗（IntersectionObserver）與分頁隱藏時暫停，
// 重���時用 `requestAnimationFrame` 合併。不需要 `prefers-reduced-motion`：這是
// 氛圍動畫而不是資訊，但規格允許的話仍會尊重它 —— 若使用者要求減少動態，就只畫
// 一格靜態畫面。
//
// The loop obeys the project rules: it pauses when the map leaves the viewport
// (IntersectionObserver) and when the tab is hidden, and coalesces with
// `requestAnimationFrame`. Unlike the spotlight layer this one does **not** need
// `prefers-reduced-motion` — it is atmosphere, not information — but it still
// honours it by rendering a single static frame.
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { CONFIG } from '@/lib/gameConfig';
import { battleFronts, type BattleFront, type FleetRoad, type FleetSite } from '@/lib/battleFleet';

/** 投影後的螢幕座標 / A projected screen position */
type ScreenPoint = { x: number; y: number };

/**
 * 投影「戰線上的一點」/ Project a point that is already on a front line.
 *
 * 特別包成一個函式，是為了讓呼叫端不必把 `pointOn` 的回傳值拆開再餵給
 * `project` —— 那樣得寫成 `project(...pointOn(...))`，而 `ScreenPoint` 不是
 * tuple，TypeScript 不允許那樣展開。
 *
 * Wrapped as its own function so callers do not have to splat `pointOn`'s result
 * into `project` — that needs `project(...pointOn(...))`, and a `ScreenPoint` is
 * not a tuple, so TypeScript rejects the spread.
 */
function projectFrontPoint(
  project: Projector,
  front: BattleFront,
  t: number,
  lane: number,
  scratch: ScreenPoint,
): ScreenPoint {
  const world = pointOn(front, t, lane, scratch);
  return project(world.x, world.y);
}

/** 投影：世界座標 → 螢幕像素 / Projection: world coordinates to screen pixels */
type Projector = (x: number, y: number) => ScreenPoint;

/** 一艘船 / one ship */
interface Ship {
  front: number;
  /** 0 = A 方，1 = B 方 / 0 = side A, 1 = side B */
  side: 0 | 1;
  /** 沿戰線的位置，0..1 / position along the line, 0..1 */
  t: number;
  /** 行進方向 / travel direction */
  dir: 1 | -1;
  /** 距離下一次開火還剩多久（毫秒）/ milliseconds until the next shot */
  cooldown: number;
  /** 沿線的微抖，讓艦隊不像一條鐵軌 / slight along-line jitter so the line is not a rail */
  jitter: number;
}

/** 一發曳光彈 / one tracer */
interface Bolt {
  front: number;
  /** 0 = A 方射出 / 0 = fired by side A */
  side: 0 | 1;
  /** 起點沿線位置 / launch position along the line */
  from: number;
  /** 終點沿線位置 / impact position along the line */
  to: number;
  /** 0..1 的飛行進度 / flight progress, 0..1 */
  age: number;
}

export interface BattleFleetProps {
  /** 據點（世界座標）/ settlements in world coordinates */
  sites: FleetSite[];
  /** 道路 / roads */
  roads: FleetRoad[];
  /** 勢力 id → 色票 / faction id to colour */
  colors: Record<string, string>;
  /** 世界座標的可見範圍，用來把世界對應到畫布 / the visible world extent, used to map world to canvas */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** 額外 className / extra className */
  className?: string;
}

/**
 * 交錯的決定性亂數 / A deterministic interleave.
 *
 * 這裡刻意**不用** `Math.random()`：每次 React 重新掛載都會換一組船的相位，整片
 * 艦隊會「跳」一下。改用前端的 id 雜湊讓同一條戰線每次都長得一樣。
 *
 * Deliberately **not** `Math.random()`: a remount would reshuffle every ship's
 * phase and the whole fleet would visibly jump. Hashing the front's id instead
 * means the same front always looks the same.
 */
function phaseFor(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16776719);
  }
  // 0..1 / 0..1
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * 由戰線生出艦隊 / Build the fleets from the front lines.
 *
 * 抽出來是為了讓它可測：初始相位必須由 `phaseFor` 決定，不能摻入亂數，否則測試
 * 會偶發失敗，而那正是動畫會在重繪時跳動的同一個原因。
 *
 * Extracted so it is testable: the initial phases must come from `phaseFor`, not
 * from randomness, or the test would flake — and that randomness is exactly what
 * makes an animation jump on repaint.
 */
export function buildFleets(fronts: BattleFront[]): { ships: Ship[]; bolts: Bolt[] } {
  const ships: Ship[] = [];
  const bolts: Bolt[] = [];
  for (let f = 0; f < fronts.length; f += 1) {
    const front = fronts[f];
    for (const side of [0, 1] as const) {
      for (let s = 0; s < CONFIG.BATTLE_FLEET_SHIPS_PER_SIDE; s += 1) {
        const phase = phaseFor(front.key, side * 31 + s);
        ships.push({
          front: f,
          side,
          // 兩方的出發點錯開，否則會朝同一點對撞 / the two sides start out of phase
          // so they do not converge on the same point
          t: (phase + (side === 0 ? 0 : 0.5)) % 1,
          dir: side === 0 ? 1 : -1,
          cooldown: Math.round(phase * CONFIG.BATTLE_FLEET_FIRE_MS),
          jitter: (phase - 0.5) * CONFIG.BATTLE_FLEET_LANE,
        });
      }
    }
  }
  return { ships, bolts };
}

/** 沿戰線取點（含法線偏移）/ A point along the front, offset along the normal */
function pointOn(front: BattleFront, t: number, lane: number, out: ScreenPoint): ScreenPoint {
  out.x = front.ax + (front.bx - front.ax) * t + front.nx * lane;
  out.y = front.ay + (front.by - front.ay) * t + front.ny * lane;
  return out;
}

export function BattleFleet({ sites, roads, colors, bounds, className }: BattleFleetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 在 effect 開頭收斂成非 null 的區域變數。標上型別是必要的：下面 `render` 是
    // function declaration，會被 hoist，TypeScript 因此不會把 `ctx === null` 的收斂
    // 帶進它的作用域。
    //
    // Narrow to a non-null local at the top of the effect. The explicit annotation is
    // required: `render` below is a hoisted function declaration, so TypeScript does
    // not carry the `ctx === null` narrowing into its scope.
    const maybeCtx = canvas.getContext('2d');
    if (maybeCtx === null) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const fronts = battleFronts(sites, roads, colors);
    // 沒有戰線就整層拿掉，不要留一個空 canvas 在畫面上跑迴圈 /
    // With no fronts, unmount the layer rather than keep an empty canvas looping
    if (fronts.length === 0) return;

    const { ships, bolts } = buildFleets(fronts);

    let dpr = 1;
    let viewW = 0;
    let viewH = 0;

    /**
     * 世界 → viewport 的投影 / The world-to-viewport projection.
     *
     * 這裡**自己算**比例，而不是問 sigma 要 `graphToViewport`：這個元件同時要能
     * 站在遊戲頁（世界座標來自資料庫的 layoutX/layoutY）與首頁（來自 ForceAtlas2
     * 的 x/y），兩邊的座標空間相同但沒有共同的 sigma 實例，所以比例必須由
     * `bounds` 與畫布尺寸推導。
     *
     * This computes the scale itself rather than asking sigma for
     * `graphToViewport`: the same component has to sit on the game page (world
     * coordinates from the database `layoutX` / `layoutY`) and on the home page
     * (ForceAtlas2 `x` / `y`). Both share a coordinate space but there is no
     * shared sigma instance, so the scale has to come from `bounds` and the
     * canvas size.
     */
    const project: Projector = (x, y) => {
      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
      const scale = Math.min(viewW / spanX, viewH / spanY);
      // 置中 / centre it
      const originX = (viewW - spanX * scale) / 2;
      const originY = (viewH - spanY * scale) / 2;
      return {
        x: originX + (x - bounds.minX) * scale,
        y: originY + (y - bounds.minY) * scale,
      };
    };
    // 取一個平均比例給需要「像素長度」的地方（艦體、彈尾）/
    // One representative scale for the places that need a pixel length (ships, tails)
    const meanScale = () => {
      const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
      return Math.min(viewW / spanX, viewH / spanY);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      viewW = rect.width;
      viewH = rect.height;
      canvas.width = Math.max(1, Math.round(viewW * dpr));
      canvas.height = Math.max(1, Math.round(viewH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // ── 可見性 / Visibility ──────────────────────────────────────────────────
    // 專案規則：動畫迴圈必須在離開視窗與分頁隱藏時暫停 /
    // Project rule: an animation loop must pause off-viewport and when hidden
    let inView = true;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    const onVisibilityChange = () => {
      if (document.hidden) drawOnce();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 尊重「減少動態效果」/ Respect prefers-reduced-motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    const onMotionChange = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      if (reduced) {
        cancelAnimationFrame(raf);
        raf = 0;
        drawOnce();
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    const scratch = { x: 0, y: 0 };
    const scratch2 = { x: 0, y: 0 };

    /** 一格靜態畫面 / one static frame */
    function drawOnce() {
      render(0);
    }

    function render(dtSeconds: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      const scale = meanScale();

      // 戰線底線：很淡，只交代「這裡在打仗」/ The base line is very faint; it only
      // says "fighting happens here"
      ctx.lineWidth = 1;
      for (const front of fronts) {
        const a = project(front.ax, front.ay);
        const b = project(front.bx, front.by);
        ctx.strokeStyle = front.colorB;
        ctx.globalAlpha = CONFIG.BATTLE_FLEET_LINE_ALPHA;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 開火 / firing
      for (const ship of ships) {
        if (dtSeconds > 0) {
          ship.cooldown -= dtSeconds * 1000;
          if (ship.cooldown <= 0) {
            ship.cooldown += CONFIG.BATTLE_FLEET_FIRE_MS;
            // 找最近的敵方船當目標 / target the nearest enemy ship
            const front = fronts[ship.front];
            const enemySide: 0 | 1 = ship.side === 0 ? 1 : 0;
            let best = Number.POSITIVE_INFINITY;
            for (const other of ships) {
              if (other.front !== ship.front || other.side !== enemySide) continue;
              const gap = Math.abs(other.t - ship.t);
              if (gap < best) best = gap;
            }
            if (Number.isFinite(best)) {
              bolts.push({
                front: ship.front,
                side: ship.side,
                from: ship.t,
                to: ship.t + (enemySide === 0 ? 1 : -1) * Math.min(best, 0.3),
                age: 0,
              });
              void front;
            }
          }
        }
      }

      // 曳光彈 / tracers
      for (let i = bolts.length - 1; i >= 0; i -= 1) {
        const bolt = bolts[i];
        if (dtSeconds > 0) bolt.age += (dtSeconds * CONFIG.BATTLE_FLEET_BOLT_SPEED) / Math.max(fronts[bolt.front].length, 1);
        if (bolt.age >= 1) {
          bolts.splice(i, 1);
          continue;
        }
        const front = fronts[bolt.front];
        // 往目標飛，但只畫已走過的一段當拖尾 / fly toward the target, drawing only
        // the travelled part as the tail
        const head = bolt.from + (bolt.to - bolt.from) * bolt.age;
        const tailLen = CONFIG.BATTLE_FLEET_BOLT_LEN / Math.max(scale, 1e-6) / Math.max(front.length, 1);
        const tail = head - Math.sign(bolt.to - bolt.from) * tailLen;
        const color = bolt.side === 0 ? front.colorA : front.colorB;
        const tailPt = projectFrontPoint(project, front, tail, 0, scratch);
        const sx = tailPt.x;
        const sy = tailPt.y;
        const p2 = projectFrontPoint(project, front, head, 0, scratch2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85 * (1 - bolt.age);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 艦體 / the ships themselves
      const shipPx = CONFIG.BATTLE_FLEET_SHIP_PX;
      for (const ship of ships) {
        if (dtSeconds > 0) {
          const front = fronts[ship.front];
          ship.t += ship.dir * ((CONFIG.BATTLE_FLEET_SPEED / Math.max(front.length, 1)) * dtSeconds);
          // 到頭就掉頭 / turn around at the ends
          if (ship.t > 1) {
            ship.t = 1;
            ship.dir = -1;
          } else if (ship.t < 0) {
            ship.t = 0;
            ship.dir = 1;
          }
        }
        const front = fronts[ship.front];
        const lane = (ship.side === 0 ? 1 : -1) * CONFIG.BATTLE_FLEET_LANE + ship.jitter;
        const pos = projectFrontPoint(project, front, ship.t, lane, scratch);
        const color = ship.side === 0 ? front.colorA : front.colorB;
        // 朝行進方向的小三角 / a small triangle pointing along the direction of travel
        const heading = Math.atan2(
          (front.by - front.ay) * ship.dir,
          (front.bx - front.ax) * ship.dir,
        );
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(heading);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(shipPx, 0);
        ctx.lineTo(-shipPx * 0.6, shipPx * 0.42);
        ctx.lineTo(-shipPx * 0.6, -shipPx * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // 離開視窗、分頁隱藏、或是使用者要求減少動態，就不推進時間 /
      // Off-viewport, hidden, or reduced-motion: do not advance time
      if (!inView || document.hidden || reduced) return;
      render(dt);
    };

    drawOnce();
    if (!reduced) raf = requestAnimationFrame(loop);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener('change', onMotionChange);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    // 戰線本身是 sites/roads/colors 的純函式，所以依賴它們就夠了 /
    // The fronts are a pure function of sites / roads / colors, so those are the
    // only dependencies
  }, [sites, roads, colors, bounds]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}