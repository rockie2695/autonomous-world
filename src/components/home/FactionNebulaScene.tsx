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
//
// ── 生長，而不是密度快照 ────────────────────────────────────────────────
// 密度只是「現在有多少」；這個元件還要說出「正在變多」。做法是每片雲先撒出
// 一組固定的候選點並「依半徑由內而外排序」，然後用 setDrawRange 控制實際
// 畫出幾個。回合推進、該勢力多佔一座城，畫出的點數就從舊值補到新值——
// 星雲因此是**由核心向外長開**，而不是整片突然換掉。
//
// Density is only "how much right now". This scene also has to say "and it is
// growing". Each cloud therefore scatters one fixed set of candidate points
// ordered by radius, and setDrawRange controls how many are actually drawn. When
// a round advances and a faction takes another settlement, the drawn count eases
// from the old value to the new one, so the cloud opens **outward from its core**
// instead of the whole figure being swapped at once.
//
// 為什麼用 setDrawRange 而不是重建幾何體：重建會讓每 15 秒輪詢都換掉整個
// 頂點緩衝，動畫每輪都從零重啟，看起來像閃爍而不是生長。畫範圍變動不需要
// 動到 GPU 緩衝。
// Why setDrawRange rather than rebuilding geometry: a rebuild replaces the whole
// vertex buffer on every 15s poll and restarts the animation from zero, which
// reads as a flicker instead of growth. Changing the draw range never touches
// the GPU buffer.
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PublicFaction } from '@/lib/publicWorld';

export type FactionNebulaSceneProps = {
  factions: PublicFaction[];
  unowned: number;
};

type Cloud = {
  factionId: string;
  group: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  /** 本次生長的起點與終點（點數）/ this growth's start and end point counts */
  from: number;
  to: number;
  /** 生長進度 0..1 / growth progress 0..1 */
  progress: number;
};

type Rig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  clouds: Cloud[];
  running: boolean;
  reduced: boolean;
  drawStaticFrame: (() => void) | null;
};

// ─── 常數 / Constants ───────────────────────────────────────────────────────

/** 每個勢力的最少光點：只有一座城也要看得見 / floor so a one-city faction shows */
const MIN_POINTS = 14;

/** 每個勢力預先撒出的候選點上限 / candidate points scattered per cloud */
const MAX_POINTS = 190;

/** 候選點中實際畫出的比例基準，比例再換算成各自的份額
    the budget the drawn share is scaled from */
const POINT_BUDGET = 420;

/** 生長耗時（毫秒）——依「較大轉場 ≤ 400ms」放寬，因為這是資料變化不是互動
    growth duration in ms — relaxed past the 400ms transition ceiling because
    this is a data change, not an interaction */
const GROW_MS = 900;

/** 雲團半徑與環狀擺放半徑 / cloud radius and the ring the clouds sit on */
const CLOUD_RADIUS = 1.5;
const RING_RADIUS = 5.4;

/** 垂直壓扁：星雲是扁的，不是球 / vertical squash: a nebula is flat */
const FLATTEN = 0.52;

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
 * 確定性的偽亂數：同一個 seed 永遠長出同一片星雲，所以輪詢換資料時圖不會跳。
 * A deterministic PRNG: the same seed always grows the same cloud, so polling
 * never makes the figure jump.
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

/** 生長用的緩動：起步快、收尾慢，讓「長開」而不是「膨脹」
    the growth easing: quick start, slow settle, so it opens rather than inflates */
function easeOutCubic(t: number): number {
  const inverse = 1 - t;
  return 1 - inverse * inverse * inverse;
}

/** 依據比例決定一片雲要畫出多少光點，並且不低於下限、不高於上限
    decide a cloud's drawn point count from its share, clamped at both ends */
function pointCount(share: number, total: number): number {
  if (total <= 0) return MIN_POINTS;
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round((share / total) * POINT_BUDGET)));
}

/**
 * 撒出固定的一組候選點，**依半徑由內而外排序**。
 * 排序是整個生長效果的地基：畫出前 N 個點時，得到的就是「核心最密、越往外
 * 越稀疏」的星雲，所以增加點數等於往外長，而不是在核心堆積。
 *
 * Scatter one fixed set of candidate points **sorted by radius, innermost
 * first**. That ordering is the foundation of the whole effect: drawing the
 * first N yields a cloud that is densest at its core and thins outward, so
 * raising the count grows the cloud outward instead of piling up in the middle.
 */
function buildCloud(key: string, color: THREE.Color, ringAngle: number): {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
} {
  const random = mulberry32(seedOf(key));
  const cx = Math.cos(ringAngle) * RING_RADIUS;
  const cz = Math.sin(ringAngle) * RING_RADIUS;

  type Sample = { radius: number; theta: number; phi: number };
  const samples: Sample[] = [];

  for (let i = 0; i < MAX_POINTS; i += 1) {
    // 立方根讓體積均勻，而不是把點都堆在中心
    // The cube root spreads by volume rather than piling points at the core
    samples.push({
      radius: CLOUD_RADIUS * Math.cbrt(random()),
      theta: random() * Math.PI * 2,
      phi: Math.acos(2 * random() - 1),
    });
  }

  samples.sort((a, b) => a.radius - b.radius);

  const positions = new Float32Array(MAX_POINTS * 3);
  const colors = new Float32Array(MAX_POINTS * 3);
  const sizes = new Float32Array(MAX_POINTS);

  for (let i = 0; i < MAX_POINTS; i += 1) {
    const { radius, theta, phi } = samples[i];
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
    // 這是一條扁帶，不需要跟世界圖譜同樣的 DPR
    // A flat band does not need the world graph's pixel ratio
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
      clouds: [],
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
    // 自己算 delta：THREE.Clock 的 getElapsedTime() 與 getDelta() 共用同一個
    // 內部計時器，在同一幀裡先後呼叫會讓 getDelta() 幾乎回傳 0，生長就卡住。
    // Self-computed delta: THREE.Clock.getElapsedTime() and getDelta() share
    // one internal timer, so calling both in a frame makes getDelta() return
    // ~0 and the growth stalls.
    let previousTime = performance.now();
    let elapsed = 0;
    let raf = 0;

    /** 把一片雲的生長進度寫進畫範圍 / push a cloud's growth into the draw range */
    const applyCloud = (cloud: Cloud) => {
      const eased = easeOutCubic(cloud.progress);
      const current = Math.round(cloud.from + (cloud.to - cloud.from) * eased);
      cloud.geometry.setDrawRange(0, current);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!rig.running || document.hidden) {
        // 離屏或分頁隱藏時把時基準拉回來，回到畫面時才不會補上一個巨大的 delta
        // Resync the time base while off-screen or hidden, so returning does not
        // hand the next frame one enormous delta
        previousTime = performance.now();
        return;
      }

      const now = performance.now();
      // 上限 100ms：分頁切回來時那一幀的 delta 會非常大，沒有上限會直接跳過整段生長
      // Capped at 100ms: the first frame after a tab returns has an enormous
      // delta, and without the cap it would skip the whole growth
      const delta = Math.min(0.1, (now - previousTime) / 1000);
      previousTime = now;
      // 收斂動效時相位凍結，只畫一格 / freeze the phase under reduced motion
      elapsed = rig.reduced ? 0 : elapsed + delta;

      group.rotation.y = elapsed * 0.06;

      // 推進生長 / advance every cloud that is still growing
      for (const cloud of rig.clouds) {
        if (cloud.progress < 1) {
          cloud.progress = Math.min(1, cloud.progress + (delta * 1000) / GROW_MS);
          applyCloud(cloud);
          // 畫的點數在動，所以這一幀一定要重畫；不是每幀都白跑
          // The drawn count moved, so this frame must repaint — it is not idle
        }
      }

      renderer.render(scene, camera);
    };

    const drawStaticFrame = () => {
      group.rotation.y = 0;
      // 收斂動效：直接把每片雲畫到終點，不做任何漸進
      // Reduced motion: snap every cloud to its end state, no gradual reveal
      for (const cloud of rig.clouds) {
        cloud.progress = 1;
        cloud.geometry.setDrawRange(0, cloud.to);
      }
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
      for (const cloud of rig.clouds) {
        cloud.geometry.dispose();
        cloud.material.dispose();
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

  // ── 資料：每個勢力一片雲，點數 = 該勢力真的擁有的據點數 ───────────────
  // Data: one cloud per faction, its point count equal to settlements it holds
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;

    const total = factions.reduce((sum, faction) => sum + faction.places, 0) + unowned;
    const byId = new Map(rig.clouds.map((cloud) => [cloud.factionId, cloud]));

    // 這個世界長出什麼勢力：存活勢力依序繞環，無主之地固定在正中
    // What the world has grown: the surviving factions ring the centre, and
    // unclaimed ground always sits in the middle
    const wanted: Array<{ id: string; color: string; places: number; ringAngle: number }> = [];
    const ringCount = Math.max(1, factions.length);
    factions.forEach((faction, index) => {
      wanted.push({
        id: faction.id,
        color: faction.color,
        places: faction.places,
        ringAngle: (index / ringCount) * Math.PI * 2,
      });
    });
    if (unowned > 0) {
      wanted.push({ id: '__unowned__', color: '', places: unowned, ringAngle: 0 });
    }

    // ── 已經不存在的勢力：整片拿掉 / factions that no longer exist come out
    for (const cloud of [...rig.clouds]) {
      if (wanted.some((entry) => entry.id === cloud.factionId)) continue;
      rig.group.remove(cloud.group);
      cloud.geometry.dispose();
      cloud.material.dispose();
      rig.clouds = rig.clouds.filter((candidate) => candidate !== cloud);
    }

    // ── 每一片：新的長出來，舊的往新點數長 ──────────────────────────────
    // Each cloud: grow a new one, or grow an existing one toward its new count
    for (const entry of wanted) {
      const target = pointCount(entry.places, total);
      const existing = byId.get(entry.id);

      if (existing) {
        // 已經在同一個點數就不動，免得每 15 秒輪詢都重啟一次生長動畫
        // Same count, no work: otherwise every 15s poll would restart the growth
        if (existing.to === target) continue;
        // 從「目前實際畫出來」接到新值，中途縮減時才不會出現瞬間爆點
        // Start from what is actually on screen so a mid-flight shrink never pops
        const eased = easeOutCubic(existing.progress);
        existing.from = Math.round(existing.from + (existing.to - existing.from) * eased);
        existing.to = target;
        existing.progress = 0;
        if (rig.reduced) rig.drawStaticFrame?.();
        continue;
      }

      const { positions, colors, sizes } = buildCloud(
        entry.id,
        toColor(entry.color || undefined, UNCLAIMED),
        entry.ringAngle
      );

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      // 開場是空的，由 0 長到 target / starts empty and grows from 0 to target
      geometry.setDrawRange(0, 0);

      const material = new THREE.ShaderMaterial({
        vertexShader: NODE_VERTEX,
        fragmentShader: NODE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geometry, material);
      const cloudGroup = new THREE.Group();
      cloudGroup.add(points);
      rig.group.add(cloudGroup);

      const cloud: Cloud = {
        factionId: entry.id,
        group: cloudGroup,
        geometry,
        material,
        from: 0,
        to: target,
        progress: 0,
      };
      rig.clouds.push(cloud);

      if (rig.reduced) rig.drawStaticFrame?.();
    }

    // 沒有勢力也沒有無主據點：這是還沒啟動的世界，畫面就留空
    // No factions and no unclaimed ground: the world has not started, so it
    // stays empty rather than inventing something to draw
    if (rig.reduced) rig.drawStaticFrame?.();
  }, [factions, unowned]);

  return <div ref={containerRef} className="h-full w-full" />;
}
