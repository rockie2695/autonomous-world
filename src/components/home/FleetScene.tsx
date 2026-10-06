// ============================================================================
// 首頁的艦隊交戰 / Battle fleet on the home page
// ----------------------------------------------------------------------------
// 首頁的圖是 three.js 的 3D 圖譜（`WorldGraphScene`），不是 sigma。兩者投影方式
// 不同，所以這裡不能直接把 `BattleFleet` 塞進那個 canvas —— 它是給「世界座標對應
// 到 2D 畫布」用的。
//
// The home page's graph is a three.js 3D scene (`WorldGraphScene`), not sigma.
// The two project differently, so `BattleFleet` cannot simply be dropped into
// that canvas: it assumes world coordinates mapped onto a 2D canvas.
//
// 因此這裡用**同一段純邏輯**（`battleFleet.ts`）配一個**不同的呈現方式**：俯視的
// 正交投影，深度只影響大小與亮度。這樣兩頁的交戰完全一致（同一批戰線、同一組
// 船、同一個相位），但看起來是 3D 太空圖上的艦隊，而不是 2D 地圖上的圖示。
//
// So this reuses the **same pure logic** (`battleFleet.ts`) with a **different
// presentation**: a top-down orthographic projection where depth only affects size
// and brightness. Both pages then show the same engagement — same fronts, same
// ships, same phases — but here it reads as a fleet in a 3D space rather than
// glyphs on a 2D map.
// ============================================================================

'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PublicPlace, PublicRoad } from '@/lib/publicWorld';
import { battleFronts, type FleetSite } from '@/lib/battleFleet';
import { CONFIG } from '@/lib/gameConfig';

type FleetSceneProps = {
  places: PublicPlace[];
  roads: PublicRoad[];
  colors: Record<string, string>;
};

/** 每艘船 / one ship */
type Ship = {
  front: number;
  side: 0 | 1;
  t: number;
  dir: 1 | -1;
  cooldown: number;
  jitter: number;
  /** 沿戰線的深度 jitter，讓艦隊有前後層次 / depth jitter along the line, for layering */
  depth: number;
};

type Bolt = {
  front: number;
  side: 0 | 1;
  from: number;
  to: number;
  age: number;
};

type FleetRig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  group: THREE.Group;
  running: boolean;
  reduced: boolean;
  node: HTMLElement;
  observer: IntersectionObserver;
  drawStaticFrame: (() => void) | null;
};

/**
 * 決定性的相位 / A deterministic phase.
 *
 * 與 `BattleFleet` 同一套雜湊：同一條戰線每次掛載都必須長得一樣，否則重新
 * render 時整片艦隊會跳一下。
 *
 * The same hash as `BattleFleet`: the same front must always look the same, or the
 * whole fleet visibly jumps on re-render.
 */
function phaseFor(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16776719);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** 幾何：一支朝 +X 的箭頭 / Geometry: one arrowhead pointing along +X */
const SHIP_GEOMETRY = new THREE.ConeGeometry(1, 2.6, 3);
SHIP_GEOMETRY.rotateZ(-Math.PI / 2);

/**
 * 戰艦場景 / The fleet scene.
 *
 * 深度只影響**大小與亮度**，不影響位置判斷 —— 3D 圖是俯視的，畫面上深度本來就
 * 難以判讀。讓深度去改變位置只會讓交戰看起來錯亂。
 *
 * Depth affects **size and brightness only**, never position: the 3D graph is
 * viewed from above, where depth is already hard to read. Letting it move ships
 * would only make the engagement look scrambled.
 */
export default function FleetScene({ places, roads, colors }: FleetSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<FleetRig | null>(null);

  // 與首頁圖譜同一套座標：ForceAtlas2 的原始 x / y，且 y 軸要翻轉（圖譜的 y 往下，
  // 螢幕的 y 往上）。與 WorldGraphScene 的處理一致，艦隊才會落在光點上。/
  // Same coordinates as the home graph: ForceAtlas2's raw x / y, with y flipped
  // (the graph's y points down, screen coordinates up). Matches
  // WorldGraphScene, so the ships land on the points.
  const sites: FleetSite[] = useMemo(
    () =>
      places.map((p) => ({
        id: p.id,
        x: p.x,
        // WorldGraphScene negates y for the same reason
        y: -p.y,
        factionId: p.factionId,
        garrison: p.garrison,
      })),
    [places],
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const fronts = battleFronts(sites, roads, colors);
    if (fronts.length === 0) return;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const f of fronts) {
      minX = Math.min(minX, f.ax, f.bx);
      maxX = Math.max(maxX, f.ax, f.bx);
      minY = Math.min(minY, f.ay, f.by);
      maxY = Math.max(maxY, f.ay, f.by);
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    node.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // 正交投影：交戰是俯視的視圖，用透視會讓遠端的戰線看起來擠在一起 /
    // Orthographic: the view is top-down, and perspective would bunch up the far end
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);

    const group = new THREE.Group();
    scene.add(group);

    const ships: Ship[] = [];
    for (let f = 0; f < fronts.length; f += 1) {
      for (const side of [0, 1] as const) {
        for (let s = 0; s < CONFIG.BATTLE_FLEET_SHIPS_PER_SIDE; s += 1) {
          const phase = phaseFor(fronts[f].key, side * 31 + s);
          ships.push({
            front: f,
            side,
            t: (phase + (side === 0 ? 0 : 0.5)) % 1,
            dir: side === 0 ? 1 : -1,
            cooldown: Math.round(phase * CONFIG.BATTLE_FLEET_FIRE_MS),
            jitter: (phase - 0.5) * CONFIG.BATTLE_FLEET_LANE,
            depth: (phase - 0.5) * CONFIG.BATTLE_FLEET_DEPTH,
          });
        }
      }
    }

    // 船體：cone 幾何 + 每方一種色 / hulls: cone geometry, one colour per side
    const shipMeshes = ships.map((ship) => {
      const front = fronts[ship.front];
      const color = new THREE.Color(ship.side === 0 ? front.colorA : front.colorB);
      // 材質型別必須收斂成 MeshBasicMaterial，否則 TS 只知道它是
      // `Material | Material[]`（MeshBasicMaterial 的建構子簽章），`dispose` 就
      // 取不到。/
      // The material type must narrow to MeshBasicMaterial, or TypeScript only
      // knows it as `Material | Material[]` (the constructor's signature) and
      // `dispose` is unreachable.
      const material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(SHIP_GEOMETRY, material);
      // 幾何是固定的，所有船共用一份 / one shared geometry for every ship
      mesh.scale.setScalar(CONFIG.BATTLE_FLEET_SHIP_PX * 2.2);
      group.add(mesh);
      return mesh;
    });

    // 曳光彈：細長的 box，開火時才建立，撞到目標就回收 /
    // Tracers: thin boxes, created on firing and recycled on impact
    const boltGeometry = new THREE.BoxGeometry(1, 1, 1);
    // 曳光彈連同它的材質一起存，因為釋放時要分開處理 /
    // Tracers are stored with their material, because disposal needs both
    const bolts: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; data: Bolt }> = [];

    // ── 可見性 / Visibility ────────────────────────────────────────────────
    // 專案規則：動畫迴圈必須在離開視窗時暫停 /
    // Project rule: an animation loop must pause when it leaves the viewport
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) rig.running = entry.isIntersecting && !rig.reduced;
      },
      { threshold: 0 }
    );

    const resize = () => {
      const rect = node.getBoundingClientRect();
      const aspect = rect.width / Math.max(rect.height, 1);
      renderer.setSize(rect.width, rect.height, false);
      // 讓世界「裝滿」較短的那一邊，長邊則留邊 /
      // Fit the world to the shorter axis and leave slack on the longer one
      const half = Math.max(spanX, spanY) / 2;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(node);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const positionShip = (ship: Ship, mesh: THREE.Mesh) => {
      const front = fronts[ship.front];
      const lane = (ship.side === 0 ? 1 : -1) * CONFIG.BATTLE_FLEET_LANE + ship.jitter;
      mesh.position.set(
        front.ax + (front.bx - front.ax) * ship.t + front.nx * lane,
        front.ay + (front.by - front.ay) * ship.t + front.ny * lane,
        ship.depth
      );
      // 箭頭朝行進方向 / point along the direction of travel
      mesh.rotation.z = Math.atan2(
        (front.by - front.ay) * ship.dir,
        (front.bx - front.ax) * ship.dir
      );
    };

    const render = (dt: number) => {
      // 開火 / firing
      for (const ship of ships) {
        ship.cooldown -= dt * 1000;
        if (ship.cooldown > 0) continue;
        ship.cooldown += CONFIG.BATTLE_FLEET_FIRE_MS;
        const enemySide: 0 | 1 = ship.side === 0 ? 1 : 0;
        let best = Number.POSITIVE_INFINITY;
        for (const other of ships) {
          if (other.front !== ship.front || other.side !== enemySide) continue;
          const gap = Math.abs(other.t - ship.t);
          if (gap < best) best = gap;
        }
        if (!Number.isFinite(best)) continue;
        const front = fronts[ship.front];
        const color = new THREE.Color(ship.side === 0 ? front.colorA : front.colorB);
        const material: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(boltGeometry, material);
        mesh.scale.set(CONFIG.BATTLE_FLEET_BOLT_LEN, 0.6, 0.6);
        group.add(mesh);
        bolts.push({
          mesh,
          material,
          data: {
            front: ship.front,
            side: ship.side,
            from: ship.t,
            to: ship.t + (enemySide === 0 ? 1 : -1) * Math.min(best, 0.3),
            age: 0,
          },
        });
      }

      // 曳光彈前進 / advance the tracers
      for (let i = bolts.length - 1; i >= 0; i -= 1) {
        const bolt = bolts[i];
        const front = fronts[bolt.data.front];
        bolt.data.age += (dt * CONFIG.BATTLE_FLEET_BOLT_SPEED) / Math.max(front.length, 1);
        if (bolt.data.age >= 1) {
          group.remove(bolt.mesh);
          // 材質是每發專屬的，所以連同材質一起釋放 /
          // Each tracer owns its material, so release it with the mesh
          bolt.material.dispose();
          bolts.splice(i, 1);
          continue;
        }
        const head = bolt.data.from + (bolt.data.to - bolt.data.from) * bolt.data.age;
        const tailLen = CONFIG.BATTLE_FLEET_BOLT_LEN / Math.max(front.length, 1);
        const tail = head - Math.sign(bolt.data.to - bolt.data.from) * tailLen;
        const lane = (bolt.data.side === 0 ? 1 : -1) * CONFIG.BATTLE_FLEET_LANE;
        const mid = (tail + head) / 2;
        bolt.mesh.position.set(
          front.ax + (front.bx - front.ax) * mid + front.nx * lane,
          front.ay + (front.by - front.ay) * mid + front.ny * lane,
          0
        );
        bolt.mesh.rotation.z = Math.atan2(front.by - front.ay, front.bx - front.ax);
      }

      // 艦隊推進 / advance the fleet
      for (let i = 0; i < ships.length; i += 1) {
        const ship = ships[i];
        const front = fronts[ship.front];
        ship.t += ship.dir * ((CONFIG.BATTLE_FLEET_SPEED / Math.max(front.length, 1)) * dt);
        if (ship.t > 1) {
          ship.t = 1;
          ship.dir = -1;
        } else if (ship.t < 0) {
          ship.t = 0;
          ship.dir = 1;
        }
        positionShip(ship, shipMeshes[i]);
      }
    };

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!rig.running || document.hidden) return;
      render(dt);
      renderer.render(scene, camera);
    };

    const rig: FleetRig = {
      renderer,
      scene,
      camera,
      group,
      running: true,
      reduced: motionQuery.matches,
      node,
      observer,
      drawStaticFrame: null,
    };
    rigRef.current = rig;

    // 幾何與材質的釋放 / dispose geometry and materials
    const dispose = () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
      SHIP_GEOMETRY.dispose();
      boltGeometry.dispose();
      for (const mesh of shipMeshes) {
        // 每艘船一份材質（顏色不同），所以逐個釋放 /
        // each ship owns its material (different colour), so release them one by one
        (mesh.material as THREE.MeshBasicMaterial).dispose();
      }
      for (const bolt of bolts) bolt.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === node) node.removeChild(renderer.domElement);
      rigRef.current = null;
    };

    observer.observe(node);

    const onMotionChange = () => {
      rig.reduced = motionQuery.matches;
      rig.running = !rig.reduced;
      if (rig.reduced) {
        // 收斂動效時迴圈已停，資料換了新內容要重畫一格 /
        // The loop is stopped under reduced motion, so new data needs an explicit redraw
        positionShip(ships[0], shipMeshes[0]);
        renderer.render(scene, camera);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    rig.drawStaticFrame = () => renderer.render(scene, camera);
    if (rig.reduced) {
      for (let i = 0; i < ships.length; i += 1) positionShip(ships[i], shipMeshes[i]);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      motionQuery.removeEventListener('change', onMotionChange);
      dispose();
    };
  }, [sites, roads, colors]);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}