'use client';

// ============================================================================
// 真實勢力圖（三維）/ Real Faction Graph (three.js)
// ============================================================================
// 這裡畫的不是示意圖，是 /api/public/world 回傳的真實佈局：每個光點是一座
// 據點、顏色是它所屬勢力在資料庫裡的色票、每條線是一條真實道路。
// 舊版是一顆跟產品無關的行星；換成真實圖譜之後，首頁第一次說明自己在賣什麼。
// This is not an illustration: it renders the real layout returned by
// /api/public/world — one point per settlement, coloured by the faction colour
// stored in the database, one line per real road. The previous version was a
// planet unrelated to the product; the real graph finally explains what this is.
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PublicPlace, PublicRoad } from '@/lib/publicWorld';

type WorldGraphSceneProps = {
  places: PublicPlace[];
  roads: PublicRoad[];
  /** factionId → 色票 / factionId → colour, straight from the database */
  colors: Record<string, string>;
};

type Rig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  graph: THREE.Group;
  points: THREE.Points | null;
  edges: THREE.LineSegments | null;
  /** 圖譜外接圓半徑（世界單位）/ bounding radius of the graph */
  extent: number;
  pointer: { x: number; y: number };
  running: boolean;
  reduced: boolean;
  node: HTMLElement;
  /** reduced-motion 下重畫單格 / redraws the single frame under reduced motion */
  drawStaticFrame: (() => void) | null;
};

// ─── 常數 / Constants ─────────────────────────────────────────────────────

/** 無主據點 / unclaimed settlements */
const UNCLAIMED = 0x64748b;

/** 道路刻意壓低，不搶勢力色的視覺主導權 / edges stay recessive so faction colour leads */
const EDGE = 0x334155;

/** 相機俯角（弧度）/ camera pitch in radians */
const PITCH = 0.26;

/** 呼吸擺動幅度（相對半徑）/ idle sway, relative to the bounding radius */
const SWAY = 0.1;

/** 深度展開比例：把 2D 佈局撐成有厚度的 3D 場 / depth spread, gives the flat layout thickness */
const Z_SPREAD = 0.05;

/** 邊界半徑下限，避免世界只有一個點時相機退化 / floor so a single-point world still frames */
const MIN_EXTENT = 60;

const NODE_VERTEX = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * (320.0 / -mvPosition.z), 1.0, 26.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const NODE_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float dist = length(offset);
    if (dist > 0.5) discard;
    float core = smoothstep(0.5, 0.14, dist);
    float halo = smoothstep(0.5, 0.0, dist) * 0.4;
    gl_FragColor = vec4(vColor, core * 0.92 + halo);
  }
`;

// ─── 工具 / Helpers ────────────────────────────────────────────────────────

/** 解析資料庫色票，容忍 #abc / #aabbcc，失敗時退回 / parse a DB colour, tolerating both hex widths */
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

/** 由 id 推出穩定的深度偏移，讓每個據點在 3D 裡有固定高度 / stable per-id depth offset */
function depthOffset(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

// ─── 元件 / Component ──────────────────────────────────────────────────────

export default function WorldGraphScene({ places, roads, colors }: WorldGraphSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<Rig | null>(null);

  // ── 掛載：建立渲染器、場景、觀察者與動畫迴圈（只跑一次）──────────────
  // Mount: build the renderer, scene, observers, and loop exactly once.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    // 遠裁切面留給成長中的世界（2000 據點時距離可達數千）
    // A generous far plane: a grown world (2000 settlements) pushes the
    // camera thousands of units back
    const camera = new THREE.PerspectiveCamera(42, 1, 10, 40_000);
    const graph = new THREE.Group();
    scene.add(graph);

    const rig: Rig = {
      renderer,
      scene,
      camera,
      graph,
      points: null,
      edges: null,
      extent: MIN_EXTENT,
      pointer: { x: 0, y: 0 },
      running: true,
      reduced,
      node,
      drawStaticFrame: null,
    };
    rigRef.current = rig;

    // ── 尺寸 / Sizing ────────────────────────────────────────────────────
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

    // ── 離開視窗就停：首頁在很下面，不該整頁捲動時都燒 GPU
    // Pause off-screen: this section sits far down the page.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          rig.running = entry.isIntersecting;
        }
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(node);

    // ── 指標視差（僅在真的有指標且未收斂動效時）
    // Pointer parallax, only on real pointers and without reduced motion
    const finePointer = window.matchMedia('(hover: hover)').matches;
    const handlePointerMove = (event: PointerEvent) => {
      if (rig.reduced || !finePointer) return;
      const rect = node.getBoundingClientRect();
      rig.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      rig.pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    if (!reduced && finePointer) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
    }

    // ── 動畫迴圈 / Animation loop ───────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;

    /**
     * 依圖譜半徑與目前畫面比例定位相機。同時符合垂直與水平視角，
     * 窄螢幕才不會把圖譜切掉。
     * Frame the camera from the graph radius and the current aspect, fitting
     * the tighter of the vertical and horizontal FOV so a portrait viewport
     * cannot crop the graph.
     */
    const frameCamera = (swayX: number, offsetY: number) => {
      const { extent } = rig;
      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.0001));
      const distance = (extent / Math.sin(Math.min(vFov, hFov) / 2)) * 0.92;
      camera.position.set(swayX, distance * Math.sin(PITCH) + offsetY, distance * Math.cos(PITCH));
      camera.lookAt(0, 0, 0);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!rig.running || document.hidden) return;

      const { extent } = rig;
      const elapsed = clock.getElapsedTime();
      const sway = Math.sin(elapsed * 0.16) * extent * SWAY;
      const px = rig.reduced ? 0 : rig.pointer.x * extent * 0.05;
      const py = rig.reduced ? 0 : rig.pointer.y * extent * 0.04;

      frameCamera(sway + px, -py);
      renderer.render(scene, camera);
    };

    /** 收斂動效時資料換了新內容，重畫一格 / Redraw the single frame when data changes under reduced motion */
    const drawStaticFrame = () => {
      frameCamera(0, 0);
      renderer.render(scene, camera);
    };

    rig.drawStaticFrame = drawStaticFrame;

    if (reduced) {
      // 收斂動效：只畫一格，內容照樣完整
      // Reduced motion: render a single frame, content stays complete
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
      window.removeEventListener('pointermove', handlePointerMove);

      rig.points?.geometry.dispose();
      (rig.points?.material as THREE.Material | undefined)?.dispose();
      rig.edges?.geometry.dispose();
      (rig.edges?.material as THREE.Material | undefined)?.dispose();
      scene.clear();

      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === node) {
        node.removeChild(renderer.domElement);
      }
      rigRef.current = null;
    };
  }, []);

  // ── 資料：只重建幾何體，相機與迴圈不中斷（每 15 秒換一次資料不重置視角）
  // Data: rebuild only the geometry so a 15s poll never resets the camera.
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const { graph } = rig;

    rig.points?.geometry.dispose();
    (rig.points?.material as THREE.Material | undefined)?.dispose();
    rig.edges?.geometry.dispose();
    (rig.edges?.material as THREE.Material | undefined)?.dispose();
    if (rig.points) graph.remove(rig.points);
    if (rig.edges) graph.remove(rig.edges);
    rig.points = null;
    rig.edges = null;

    if (places.length === 0) {
      rig.extent = MIN_EXTENT;
      if (rig.reduced) rig.drawStaticFrame?.();
      return;
    }

    // ── 置中 + 半徑 / Centre on the graph and measure its radius ──────────
    let sumX = 0;
    let sumY = 0;
    for (const place of places) {
      sumX += place.x;
      sumY += place.y;
    }
    const centerX = sumX / places.length;
    const centerY = sumY / places.length;

    const spread = Z_SPREAD * Math.max(
      MIN_EXTENT,
      places.reduce((max, place) => Math.max(max, Math.hypot(place.x - centerX, place.y - centerY)), 0)
    );

    const count = places.length;
    const positions = new Float32Array(count * 3);
    const nodeColors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    let maxGarrison = 0;
    for (const place of places) maxGarrison = Math.max(maxGarrison, place.garrison);

    const indexById = new Map<string, number>();

    for (let i = 0; i < count; i += 1) {
      const place = places[i];
      indexById.set(place.id, i);
      // y 翻轉：ForceAtlas2 的 y 軸朝下，螢幕座標朝上
      // Flip y: ForceAtlas2's y axis points down, screen coordinates up
      positions[i * 3] = place.x - centerX;
      positions[i * 3 + 1] = -(place.y - centerY);
      positions[i * 3 + 2] = depthOffset(place.id) * spread;

      const color = toColor(place.factionId ? colors[place.factionId] : undefined, UNCLAIMED);
      nodeColors[i * 3] = color.r;
      nodeColors[i * 3 + 1] = color.g;
      nodeColors[i * 3 + 2] = color.b;

      // 駐軍越多光點越大，但有上限，避免大城吃掉整張圖
      // Bigger garrisons get bigger points, capped so one city cannot eat the frame
      const weight = maxGarrison > 0 ? Math.min(1, place.garrison / maxGarrison) : 0;
      sizes[i] = MIN_EXTENT * (0.055 + 0.05 * weight);
    }

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointGeometry.setAttribute('aColor', new THREE.BufferAttribute(nodeColors, 3));
    pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const pointMaterial = new THREE.ShaderMaterial({
      vertexShader: NODE_VERTEX,
      fragmentShader: NODE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(pointGeometry, pointMaterial);
    graph.add(points);
    rig.points = points;

    // ── 道路：只畫兩端都在圖上的邊 ─────────────────────────────────────
    // Roads: only edges whose endpoints both survived the down-sample
    const edgePositions: number[] = [];
    for (const road of roads) {
      const a = indexById.get(road.aId);
      const b = indexById.get(road.bId);
      if (a === undefined || b === undefined) continue;
      edgePositions.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]
      );
    }

    if (edgePositions.length > 0) {
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(edgePositions), 3)
      );
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: EDGE,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      graph.add(edges);
      rig.edges = edges;
    }

    rig.extent = Math.max(
      MIN_EXTENT,
      places.reduce(
        (max, place) =>
          Math.max(max, Math.hypot(place.x - centerX, place.y - centerY) + spread),
        0
      )
    );

    // 收斂動效時迴圈已停，資料換了新內容要重畫一格
    // The loop is stopped under reduced motion, so new data needs an explicit redraw
    if (rig.reduced) {
      rig.drawStaticFrame?.();
    }
  }, [places, roads, colors]);

  return <div ref={containerRef} className="h-full w-full" />;
}
