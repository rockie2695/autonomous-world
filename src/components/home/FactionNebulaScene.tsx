'use client';

// ============================================================================
// 勢力星雲場景（三維）/ Faction Nebula Scene (three.js)
// ============================================================================
// 獨立成檔是為了讓 three 只在外框掛載時才載入——首頁已經有一個黑洞場景，
// 再把 three 塞進同一個 bundle 會讓 starfield 一起變重。
// Its own file so `three` is only pulled in when the frame mounts: the homepage
// already runs a black-hole scene, and bundling three here would weigh on the
// starfield too.
//
// 每一片星雲是一個真實勢力，光點數就是它此刻真的擁有的據點數，顏色是資料庫
// 的色票。佔得多就真的比較大——這是密度，不是排名。
// Each cloud is a real faction: the point count is how many settlements it
// actually holds, the colour is the stored swatch. Bigger holdings look bigger —
// that is density, not a ranking.
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PublicFaction } from '@/lib/publicWorld';

export type FactionNebulaSceneProps = {
  factions: PublicFaction[];
  unowned: number;
};

type Cloud = {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
};

type Rig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  points: THREE.Points | null;
  running: boolean;
  reduced: boolean;
  drawStaticFrame: (() => void) | null;
};

// ─── 常數 / Constants ───────────────────────────────────────────────────────

/** 每個勢力的最少光點：只有一座城也要看得見 / floor so a one-city faction shows */
const MIN_POINTS = 14;

/** 每個勢力的最多光點，避免大勢力吃掉整個畫面
    ceiling so one dominant faction cannot eat the frame */
const MAX_POINTS = 190;

/** 雲團半徑與環狀擺放半徑 / cloud radius and the ring the clouds sit on */
const CLOUD_RADIUS = 1.5;
const RING_RADIUS = 5.4;

/** 垂直壓扁：星雲是扁的，不是球 / vertical squash: a nebula is flat */
const FLATTEN = 0.52;

/** 光點總數的目標值，比例再換算成各自的份額 / target point total before shares */
const POINT_BUDGET = 420;

const UNCLAIMED = 0x64748b;

const NODE_VERTEX = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * (300.0 / -mvPosition.z), 1.0, 22.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const NODE_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float dist = length(offset);
    if (dist > 0.5) discard;
    float core = smoothstep(0.5, 0.1, dist);
    float halo = smoothstep(0.5, 0.0, dist) * 0.35;
    gl_FragColor = vec4(vColor, core * 0.85 + halo);
  }
`;

// ─── 工具 / Helpers ──────────────────────────────────────────────────────────

/** 解析資料庫色票，容忍 #abc / #aabbcc / parse a DB colour, tolerating both widths */
function toColor(value: string | undefined, fallback: number): THREE.Color {
  if (!value) return new THREE.Color(fallback);
  const hex = value.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.split('');
    return new THREE.Color(`#${r}${r}${g}${g}${b}${b}`);
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return new THREE.Color(`#${hex}`);
  }
  return new THREE.Color(fallback);
}

/**
 * 確定性的偽亂數：同一個 seed 永遠長出同一片星雲，所以每 15 秒輪詢換資料時
 * 圖不會整片跳動。
 * A deterministic PRNG: the same seed always grows the same cloud, so a 15s poll
 * that changes the data never makes the figure jump.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 依據比例決定一片雲要多少光點，並且不低於下限、不高於上限
    decide a cloud's point count from its share, clamped at both ends */
function pointCount(share: number, total: number): number {
  if (total <= 0) return MIN_POINTS;
  return Math.round(
    Math.min(MAX_POINTS, Math.max(MIN_POINTS, (share / total) * POINT_BUDGET))
  );
}

/** 把光點撒成中心密、邊緣疏的扁球，讀起來才像星雲而不是亂撒
    scatter into a dense-centre, sparse-edge flattened sphere */
function buildCloud(key: string, count: number, color: THREE.Color, ringAngle: number): Cloud {
  const random = mulberry32(seedOf(key));
  const cx = Math.cos(ringAngle) * RING_RADIUS;
  const cz = Math.sin(ringAngle) * RING_RADIUS;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    // 立方根讓體積均勻，而不是把點都堆在中心
    // The cube root spreads by volume rather than piling points at the core
    const radius = CLOUD_RADIUS * Math.cbrt(random());
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);

    positions[i * 3] = cx + radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * FLATTEN;
    positions[i * 3 + 2] = cz + radius * Math.sin(phi) * Math.sin(theta);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // 邊緣的點略小、中心的略大，星雲才有層次
    // Edge points smaller than core ones, so the cloud reads as deep
    sizes[i] = 5.5 + (1 - radius / CLOUD_RADIUS) * 4.5;
  }

  return { positions, colors, sizes };
}

// ─── 元件 / Component ───────────────────────────────────────────────────────

export default function FactionNebulaScene({ factions, unowned }: FactionNebulaSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<Rig | null>(null);

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
    // 這是一條扁帶，不需要跟世界圖譜同樣的 DPR / A flat band does not need the
    // world graph's pixel ratio
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(0, 2.4, 12.5);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    scene.add(group);

    const rig: Rig = {
      renderer,
      scene,
      camera,
      group,
      points: null,
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

    // ── 離屏就停：這一段在頁面中段，不該捲過時還在燒 GPU
    // Pause off-screen: this band sits mid-page and must not burn GPU while
    // the visitor scrolls past it.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) rig.running = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(node);

    // ── 動畫迴圈 / Animation loop ─────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!rig.running || document.hidden) return;
      // 收斂動效時凍結相位，只畫一格 / freeze the phase, draw one frame only
      const t = rig.reduced ? 0 : clock.getElapsedTime();
      group.rotation.y = t * 0.06;
      renderer.render(scene, camera);
    };

    const drawStaticFrame = () => {
      group.rotation.y = 0;
      renderer.render(scene, camera);
    };
    rig.drawStaticFrame = drawStaticFrame;

    if (reduced) {
      frame();
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      rig.points?.geometry.dispose();
      (rig.points?.material as THREE.Material | undefined)?.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === node) {
        node.removeChild(renderer.domElement);
      }
      rigRef.current = null;
    };
  }, []);

  // ── 資料：每個勢力一片雲，光點數 = 該勢力真的擁有的據點數 ──────────────
  // Data: one cloud per faction, its point count equal to settlements it holds
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;

    rig.points?.geometry.dispose();
    (rig.points?.material as THREE.Material | undefined)?.dispose();
    if (rig.points) rig.group.remove(rig.points);
    rig.points = null;

    const total = factions.reduce((sum, faction) => sum + faction.places, 0) + unowned;
    if (factions.length === 0 && unowned === 0) {
      if (rig.reduced) rig.drawStaticFrame?.();
      return;
    }

    // 無主之地固定在正中，其餘勢力環繞它擺放
    // Unclaimed ground sits in the middle; the factions ring it
    const clouds: Cloud[] = [];
    const ringCount = Math.max(1, factions.length);
    factions.forEach((faction, index) => {
      clouds.push(
        buildCloud(
          faction.id,
          pointCount(faction.places, total),
          toColor(faction.color, UNCLAIMED),
          (index / ringCount) * Math.PI * 2
        )
      );
    });
    if (unowned > 0) {
      clouds.push(
        buildCloud('__unowned__', pointCount(unowned, total), new THREE.Color(UNCLAIMED), 0)
      );
    }

    let pointTotal = 0;
    for (const cloud of clouds) pointTotal += cloud.positions.length / 3;

    const positions = new Float32Array(pointTotal * 3);
    const colors = new Float32Array(pointTotal * 3);
    const sizes = new Float32Array(pointTotal);
    let offset = 0;
    for (const cloud of clouds) {
      const count = cloud.positions.length / 3;
      positions.set(cloud.positions, offset * 3);
      colors.set(cloud.colors, offset * 3);
      sizes.set(cloud.sizes, offset);
      offset += count;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: NODE_VERTEX,
      fragmentShader: NODE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    rig.group.add(points);
    rig.points = points;

    // 收斂動效時迴圈已停，資料換了新內容要重畫一格
    // The loop is stopped under reduced motion, so new data needs a redraw
    if (rig.reduced) {
      rig.drawStaticFrame?.();
    }
  }, [factions, unowned]);

  return <div ref={containerRef} className="h-full w-full" />;
}
