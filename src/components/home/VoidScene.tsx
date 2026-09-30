'use client';

// ============================================================================
// 觀測者日誌 — 背景天體 / Observer's Log — Backdrop Body
// ============================================================================
// 整頁地面本來是兩層 CSS 星空加一層星雲，也就是「貼了星星的深藍底」。這裡換成
// 一個真的在那裡的天體：黑洞吸積盤，帶引力透鏡、視盤多普勒增亮、溫度梯度，
// 外加一圈結晶格環——那圈格環就是「科學奇幻」那一半，它長在同一個天體上而不是
// 另開一個物件，所以兩種氣質是融合的而不是拼湊的。
//
// The page ground used to be two CSS star layers and a nebula — a dark blue
// background with stars on it. This is an actual body instead: a black hole
// with a lensed accretion disc, doppler-brightened on the approaching side and
// graded by temperature, wrapped in a crystalline lattice ring. That ring is
// the science-fantasy half; it grows on the same body rather than opening a
// second object, so the two registers fuse instead of colliding.
//
// 為什麼用薄鏡近似而不是完整 raymarch / Why a thin-lens approximation
// 完整的光線追蹤要對每個像素迭代多次，在全視窗尺寸下成本高且容易在部分驅動
// 上失真。薄鏡近似把偏折當成「離中心越近彎折越大」的解析式，一次取樣就得到
// 愛因斯坦環的正確外觀，單一 draw call、每幀只有一次 fragment 執行。
// A full raymarch iterates per pixel, which is expensive at full-viewport size
// and fragile on some drivers. The thin-lens approximation treats deflection as
// an analytic falloff from the centre: one sample reproduces the Einstein ring,
// in a single draw call with one fragment pass per frame.
// ============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ─── 常數 / Constants ─────────────────────────────────────────────────────

/** 捕獲半徑（畫面單位）/ capture radius in screen units */
const RS = 0.05;

/** 偏折強度 / deflection strength */
const DEFLECT = 0.032;

/** 視盤的扁平係數：斜看下去應該是寬扁的橢圓
    disc flattening — seen at a shallow angle it is a wide, flat ellipse */
const SQUASH = 3.1;

/** 像素比上限：這是背景，不是主角 / pixel-ratio cap: this is a backdrop */
const MAX_DPR = 1.25;

/** 幀率節流：背景不需要 60fps / frame throttle — a backdrop does not need 60fps */
const FRAME_SKIP = 2;

/** 懸停節點 id：hero 離開視窗就停 / hero id, so the loop stops when it scrolls away */
const HERO_SELECTOR = '#hero';

// ─── 片段著色器 / Fragment shader ──────────────────────────────────────────

const FRAGMENT = /* glsl */ `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uPointer;

// 這三個常數住在 JS 端，由模板注入成 GLSL 巨集：值只寫一次，而且不會出現
// 「JS 改了、着色器 忘了」的那種 bug。
// These three live in JS and are injected as GLSL macros, so each value has a
// single home and a JS-side change can never silently miss the shader.
#define PI 3.14159265359
#define RS ${RS.toFixed(5)}
#define DEFLECT ${DEFLECT.toFixed(5)}
#define SQUASH ${SQUASH.toFixed(3)}

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

// 三軸夾角 60° 的正弦光柵取交集，得到三角／六角格網
// Three 60°-apart sine gratings intersected, which yields a triangular net
float lattice(vec2 p, float scale) {
  vec2 q = p * scale;
  float a = sin(q.x * 6.28318);
  float b = sin(q.x * 3.14159 + q.y * 5.44140);
  float c = sin(q.x * 3.14159 - q.y * 5.44140);
  return pow(max(0.0, (a + b + c) * 0.3333), 7.0);
}

// 單層星點：格點雜湊決定有無，格內隨機位置決定落點
// One star layer: a grid hash decides presence, a per-cell offset the position
float stars(vec2 p, float scale, float threshold, float size) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash21(id);
  vec2 off = (vec2(hash21(id + 3.17), hash21(id + 7.71)) - 0.5) * 0.7;
  float d = length(f - off);
  return step(threshold, h) * smoothstep(size, 0.0, d) * (0.3 + 0.7 * fract(h * 91.7));
}

void main() {
  // 以高度做正規化，讓形狀不隨視窗比例變形
  // Normalise by height so the composition never stretches
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float aspect = uResolution.x / uResolution.y;

  // 極慢的漂移 + 指標視差：兩個都小到只是「活的」，不會被注意到
  // A very slow drift plus pointer parallax — both small enough to read as
  // "alive" rather than "moving"
  vec2 drift = vec2(uTime * 0.0055, sin(uTime * 0.037) * 0.014);
  vec2 par   = uPointer * vec2(0.026, 0.018);

  // 位置偏右上：讓開左欄文案，也落在產品框的上緣之外
  // Sits upper-right: clear of the left copy column and above the product frame
  vec2 bh = vec2(0.30 * aspect, 0.085) + drift + par;

  vec2 rel = uv - bh;
  float b  = length(rel);

  // ── 薄鏡偏折 / Thin-lens deflection ────────────────────────────────────
  vec2 dir = b > 1e-4 ? rel / b : vec2(0.0);
  float bend = min(DEFLECT / max(b, RS * 0.5), b * 0.85);
  vec2 lensed = bh + dir * (b + bend);
  vec2 lrel = lensed - bh;

  float lb  = length(lrel);
  float ang = atan(lrel.y, lrel.x);

  // ── 視盤 / Accretion disc ──────────────────────────────────────────────
  float discR = length(vec2(lrel.x, lrel.y * SQUASH));
  float inner = RS * 1.5;
  float outer = RS * 7.2;
  float t = clamp((discR - inner) / (outer - inner), 0.0, 1.0);

  float band = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.70, 1.0, t));

  // 多普勒增亮：接近觀測者的一側比較亮
  // Doppler beaming: the side rotating toward us is brighter
  float doppler = 0.52 + 0.48 * cos(ang + 0.55);

  // 軌道剪切造成的渦流 / orbital shear
  float turb = fbm(vec2(ang * 2.2, discR * 3.4 - uTime * 0.085));

  // 溫度梯度：核心近白，內圈琥珀，外緣暗紅
  // Temperature gradient: white core, amber mid, deep red rim
  vec3 hot   = vec3(0.86, 0.95, 1.00);
  vec3 warm  = vec3(1.00, 0.71, 0.27);
  vec3 rim   = vec3(0.93, 0.40, 0.22);
  vec3 discCol = mix(hot, warm, smoothstep(0.0, 0.42, t));
  discCol = mix(discCol, rim, smoothstep(0.42, 1.0, t));

  float disc = band * doppler * (0.42 + 0.72 * turb);

  // ── 結晶格環 / Crystalline lattice ring ────────────────────────────────
  // 這是「科學奇幻」那一半：格網乘在視盤上，並在固定的半徑上聚成一道環
  // This is the science-fantasy half: a lattice multiplied over the disc, and
  // gathered into a ring at a fixed radius
  vec3 amber = vec3(1.00, 0.71, 0.27);
  float cells = lattice(vec2(cos(ang), sin(ang)) * (discR * 0.55), 5.0);
  float ringR = outer * 0.82;
  float ringW = RS * 0.20;
  float ring = exp(-pow((discR - ringR) / ringW, 2.0));

  float latticeRing = ring * (0.30 + 0.70 * cells);
  float latticeDisc = disc * cells * 0.85;

  // ── 合成 / Composite ───────────────────────────────────────────────────
  vec3 col = discCol * (disc * 0.62 + latticeDisc);
  col += amber * latticeRing * 0.55;

  // 光子環：影子外緣那一圈細亮邊 / photon ring: the thin bright edge outside
  float photon = exp(-pow((b - RS * 1.04) / (RS * 0.05), 2.0));
  col += vec3(1.00, 0.94, 0.86) * photon * 0.75;

  // 事件視界：把影子裡的東西全部壓掉 / event horizon: crush everything inside
  float shadow = 1.0 - smoothstep(RS * 0.97, RS * 1.05, b);
  col *= 1.0 - shadow;

  // ── 透鏡後的星野與塵埃 / Star field and dust, seen through the lens ────
  float far = stars(lensed, 150.0, 0.9955, 0.30) * 0.85;
  float mid = stars(lensed + 11.3, 78.0, 0.9930, 0.34) * 0.55;
  float neb = fbm(lensed * 2.3 + vec2(0.0, uTime * 0.007));
  vec3 nebulaTint = mix(vec3(0.05, 0.09, 0.19), vec3(0.14, 0.05, 0.23), neb);

  col += nebulaTint * pow(neb, 2.4) * 0.6;
  col += vec3(0.72, 0.86, 1.0) * (far + mid);

  // ── 收斂 / Convergence ────────────────────────────────────────────────
  // 整體壓低亮度：這是背景，文字層的不透明度才是可讀性的保證。
  // A backdrop, not a light source — the opaque text layer carries legibility.
  col *= 0.62;

  // 邊緣漸暗，讓中央 70–80% 的訊息區保持乾淨
  // Vignette, keeping the central reading area clean
  float vig = 1.0 - 0.62 * pow(clamp(length(uv * vec2(0.60, 1.0)) * 0.92, 0.0, 1.0), 2.0);
  col *= vig;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// ─── 型別 / Types ──────────────────────────────────────────────────────────

type Rig = {
  renderer: THREE.WebGLRenderer;
  material: THREE.ShaderMaterial;
  node: HTMLElement;
  pointer: { x: number; y: number };
  running: boolean;
  reduced: boolean;
};

// ─── 元件 / Component ──────────────────────────────────────────────────────

export default function VoidScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<Rig | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: /* glsl */ `
        void main() {
          // 直接從 position 寫 clip space，camera 不參與
          // Write clip space straight from position; the camera is irrelevant
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    // 全視窗四邊形：單一 draw call / one full-viewport quad: a single draw call
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    const camera = new THREE.Camera();

    const rig: Rig = {
      renderer,
      material,
      node,
      pointer: { x: 0, y: 0 },
      running: true,
      reduced,
    };
    rigRef.current = rig;

    const applySize = () => {
      const { clientWidth: width, clientHeight: height } = node;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      (material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
    };
    applySize();
    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(node);

    // ── 節流 / Throttle ───────────────────────────────────────────────────
    // 背景不需要 60fps：跳幀省電，畫面幾乎看不出差別
    // A backdrop does not need 60fps; skipped frames cost nothing visually
    const timer = new THREE.Timer();
    // Page Visibility API：分頁隱藏時 delta 歸零、切回時重設時間起點，
    // 回來不會出現一次巨大的跳動（Clock 要靠手動 getDelta() 丟棄落差）/
    // Page Visibility API: delta is zero while hidden and the origin resets on
    // return, so coming back never produces one huge jump (Clock needed a manual
    // getDelta() call to throw the gap away).
    timer.connect(document);
    let raf = 0;
    let frameCount = 0;
    let elapsed = 0;

    const draw = (time: number) => {
      material.uniforms.uTime.value = time;
      const pointer = material.uniforms.uPointer.value as THREE.Vector2;
      pointer.set(rig.pointer.x, rig.pointer.y);
      renderer.render(scene, camera);
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (!rig.running || document.hidden) return;
      frameCount += 1;
      if (frameCount % FRAME_SKIP !== 0) return;
      // Timer 必須先 update() 才能讀時間，且同一幀內讀幾次都一樣 /
      // Timer needs update() before any query, and repeats within one frame agree
      timer.update(time);
      elapsed = timer.getElapsed();
      draw(elapsed);
    };

    const drawStaticFrame = () => {
      // 收斂動效：一格靜態、渦流停在 t=0，內容依然完整
      // Reduced motion: one static frame with the turbulence at t=0
      draw(0);
    };

    // ── 暫停條件 / Pause conditions ───────────────────────────────────────
    // fixed 容器永遠在視窗內，所以 IntersectionObserver 要看 hero 本身：
    // hero 捲出畫面就停，背景沒有存在的理由。
    // A fixed container is always in view, so the observer watches the hero:
    // once it scrolls away the backdrop has no reason to keep burning frames.
    const hero = document.querySelector(HERO_SELECTOR);
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) rig.running = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    if (hero) intersectionObserver.observe(hero);

    const handleVisibility = () => {
      // 時間落差由 timer.connect(document) 處理，這裡只剩收斂動效的重畫 /
      // timer.connect(document) absorbs the time gap; only the reduced-motion
      // redraw is left to do here
      if (document.visibilityState === 'visible' && reduced) {
        drawStaticFrame();
      }
    };

    // ── 指標視差 / Pointer parallax ──────────────────────────────────────
    const finePointer = window.matchMedia('(hover: hover)').matches;
    const handlePointerMove = (event: PointerEvent) => {
      if (reduced || !finePointer) return;
      rig.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      rig.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    if (reduced) {
      drawStaticFrame();
    } else {
      if (finePointer) {
        window.addEventListener('pointermove', handlePointerMove, { passive: true });
      }
      document.addEventListener('visibilitychange', handleVisibility);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('visibilitychange', handleVisibility);

      // 釋放：幾何、材質、著色器、context
      // Release: geometry, material, shader, context
      timer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      material.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === node) {
        node.removeChild(renderer.domElement);
      }
      rigRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="size-full" />;
}
