'use client';

// ============================================================================
// 回合演算軌道（三維）/ Round-Compute Orbit (three.js)
// ============================================================================
// #how 原本是三張靜態卡片：01 觀察、02 分析、03 見證，中間只有一條分隔線。
// 這一版在標題與卡片之間放一個三維軌道：中央核心是真實的回合數，外圍三顆
// 衛星對應那三個步驟，軌道傾角刻意各不相同——它畫的是「三個階段繞著一個
// 不斷前進的世界轉」，不是裝飾球。
//
// The section used to be three static cards joined by a divider. This is a 3D
// orbit: a core carrying the real round number, with three satellites matching
// the three steps. Each ring sits at a different inclination, because the idea
// is three phases turning around a world that keeps advancing — not a decorative
// sphere.
//
// 文字不放進 canvas。畫布對讀螢幕軟體沒有意義，說明文字放在外層
// role="img" 的兄弟位置；步驟名稱仍然是下面那三張 HTML 卡片，這裡不重複。
// No text in the canvas. It means nothing to a screen reader, so the description
// lives outside role="img"; the step names stay in the HTML cards below and are
// never duplicated here.
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { usePublicWorld } from './usePublicWorld';

type OrbitSceneProps = {
  /** 無障礙說明 / accessible description of the diagram */
  label: string;
};

type Rig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  core: THREE.Mesh;
  rings: THREE.Mesh[];
  nodes: THREE.Mesh[];
  /** 傾斜的軌道容器：每次重建都必須整個移除，否則會在 group 裡累積
      the tilted ring containers — each rebuild must drop them or they pile up
      in the group */
  pivots: THREE.Group[];
  running: boolean;
  reduced: boolean;
  drawStaticFrame: (() => void) | null;
};

// ─── 常數 / Constants ───────────────────────────────────────────────────────

/** 三個階段的軌道傾角（弧度）——刻意錯開，否則疊在一起看不出一個「軌道」
    ring inclinations in radians, deliberately staggered so they read as orbits */
const INCLINATIONS = [0.34, -0.52, 0.86] as const;

/** 軌道半徑 / ring radii */
const RADII = [3.05, 3.85, 4.65] as const;

/** 衛星角速度（弧度／秒），各環不同速才有層次 / angular speed per ring, rad/s */
const SPEEDS = [0.34, -0.23, 0.16] as const;

/** 相機距離 / camera distance */
const DISTANCE = 9.2;

/** 核心球細分層級（IcosahedronGeometry 的 detail）— 線框在這個值已經夠密
    core sphere subdivision (IcosahedronGeometry detail); the wireframe is dense
    enough at this level without paying for more */
const CORE_DETAIL = 4;

// ─── 工具 / Helpers ──────────────────────────────────────────────────────────

/** 由字串推出穩定的 0..1，用於每顆衛星的相位，避免三顆整齊排成一線
    a stable 0..1 from a string, so the satellites never line up */
function phaseOf(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/** 極薄的環：內外兩圈加一個乘數，視覺上是一道光帶而不是幾何圓盤
    a hairline ring: two loops and a multiplier read as a light band, not a disc */
function makeRing(radius: number, color: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(radius - 0.006, radius + 0.006, 160);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

// ─── 元件 / Component ───────────────────────────────────────────────────────

export default function OrbitScene({ label }: OrbitSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<Rig | null>(null);
  const { payload } = usePublicWorld();

  // 回合數：拿不到真值就不畫數字，絕不用假值或 0 冒充
  // The round: with no real value we draw no number at all — never a fake or 0
  const round = payload?.world.round ?? null;

  // ── 掛載：渲染器、場景、觀察者、迴圈（只跑一次）────────────────────────
  // Mount: renderer, scene, observers, and loop, exactly once.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    // 這是一個小元件，不需要跟世界圖譜同樣的 DPR；1.5 已經足夠乾淨
    // A small element does not need the world graph's pixel ratio; 1.5 is clean
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.55, DISTANCE);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    group.rotation.x = 0.16;
    scene.add(group);

    // ── 核心：真實回合數所在的球 / the core that carries the real round
    const coreGeometry = new THREE.IcosahedronGeometry(0.78, CORE_DETAIL);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x0e7490,
      transparent: true,
      opacity: 0.55,
      wireframe: true,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    // 核心外的一層實心薄殼，讓核心有體積而不是只有線框
    // A solid shell around the core so it has volume, not just a wireframe
    const shellGeometry = new THREE.IcosahedronGeometry(0.56, 3);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.14,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    group.add(shell);

    const rig: Rig = {
      renderer,
      scene,
      camera,
      group,
      core,
      rings: [],
      nodes: [],
      pivots: [],
      running: true,
      reduced,
      drawStaticFrame: null,
    };
    rigRef.current = rig;

    // ── 尺寸 / Sizing ─────────────────────────────────────────────────────
    const applySize = () => {
      const { clientWidth: width, clientHeight: height } = node;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    applySize();
    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(node);

    // ── 離屏就停 / Pause off-screen
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) rig.running = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(node);

    // ── 動畫迴圈 / Animation loop ─────────────────────────────────────────
    // Timer（Clock 的替代品）：分頁隱藏時 delta 歸零、切回時重設起點，
    // 軌道不會因為背景拖了一段時間而猛然跳動 /
    // Timer (Clock's replacement): delta is zero while the tab is hidden and the
    // origin resets on return, so the orbits never lurch after a long pause.
    const timer = new THREE.Timer();
    timer.connect(document);
    let raf = 0;

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (!rig.running || document.hidden) return;

      // Timer 必須先 update() 才能讀時間，且同一幀內讀幾次都一樣 /
      // Timer needs update() before any query, and repeats within one frame agree
      timer.update(time);
      const elapsed = timer.getElapsed();
      // 收斂動效時 elapsed 仍會前進，但下面只畫一格就停，這裡用 0 凍結相位
      // Under reduced motion the loop stops after one frame, so freeze at 0
      const t = rig.reduced ? 0 : elapsed;

      rig.core.rotation.y = t * 0.16;
      rig.core.rotation.x = t * 0.07;
      group.rotation.y = t * 0.045;

      for (const node3d of rig.nodes) {
        const pivot = node3d.userData.pivot as THREE.Object3D;
        const phase = node3d.userData.phase as number;
        const speed = node3d.userData.speed as number;
        pivot.rotation.z = t * speed + phase * Math.PI * 2;
      }

      renderer.render(scene, camera);
    };

    const drawStaticFrame = () => {
      rig.core.rotation.y = 0;
      group.rotation.y = 0;
      renderer.render(scene, camera);
    };
    rig.drawStaticFrame = drawStaticFrame;

    if (reduced) {
      // 手動帶時間戳，因為這一格不是 rAF 來的 / The timestamp is passed by hand
      // because this frame is not from rAF
      frame(performance.now());
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      timer.dispose();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();

      coreGeometry.dispose();
      coreMaterial.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      for (const ring of rig.rings) {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      }
      for (const satellite of rig.nodes) {
        satellite.geometry.dispose();
        (satellite.material as THREE.Material).dispose();
      }
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === node) {
        node.removeChild(renderer.domElement);
      }
      rigRef.current = null;
    };
  }, []);

  // ── 資料：回合數與三顆衛星（只在 payload 換掉時重建）────────────────────
  // Data: the round and the three satellites, rebuilt only when data changes.
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;

    for (const ring of rig.rings) {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      rig.group.remove(ring);
    }
    rig.rings = [];

      for (const satellite of rig.nodes) {
        const pivot = satellite.userData.pivot as THREE.Object3D;
        pivot.remove(satellite);
        satellite.geometry.dispose();
        (satellite.material as THREE.Material).dispose();
      }
      rig.nodes = [];

      for (const pivot of rig.pivots) {
        rig.group.remove(pivot);
      }
      rig.pivots = [];

    if (round === null) {
      if (rig.reduced) rig.drawStaticFrame?.();
      return;
    }

    // 回合數越大，外環轉得越快一點點——只是「在跑」的暗示，不是假的度量
    // A larger round nudges the outer ring faster: a hint that it is running,
    // never a fabricated measurement
    const pace = 1 + Math.min(1.6, round / 600) * 0.5;
    for (let i = 0; i < SPEEDS.length; i += 1) {
      const tilted = new THREE.Group();
      tilted.rotation.x = INCLINATIONS[i];
      rig.group.add(tilted);
      rig.pivots.push(tilted);

      const ring = makeRing(RADII[i], 0x1e3a5f, 0.85);
      tilted.add(ring);
      rig.rings.push(ring);

      // 衛星：實心核心，一眼看出是「一個階段」而不是一個點
      // The satellite: a solid core, so it reads as a stage and not a dot
      const satelliteGeometry = new THREE.IcosahedronGeometry(0.19, 2);
      const satelliteMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
      const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
      satellite.position.x = RADII[i];
      satellite.userData.pivot = tilted;
      satellite.userData.phase = phaseOf(`${round}-${i}`);
      satellite.userData.speed = SPEEDS[i] * pace;
      tilted.add(satellite);
      rig.nodes.push(satellite);
    }

    if (rig.reduced) {
      rig.drawStaticFrame?.();
    }
  }, [round]);

  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-xl sm:aspect-[2/1]">
      <div ref={containerRef} className="absolute inset-0" role="img" aria-label={label} />

      {/* 回合數是 HTML 文字，不是畫布上的字：它在 375px 仍然讀得清楚
          The round is HTML, not canvas text: it stays legible at 375px */}
      {round !== null ? (
        <p className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-orbitron text-3xl font-bold text-cyan-200 tabular-nums sm:text-4xl">
            {round.toLocaleString('en-US')}
          </span>
        </p>
      ) : null}
    </div>
  );
}
