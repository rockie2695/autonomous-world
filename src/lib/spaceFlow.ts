// ============================================================================
// 彩色流動塵埃：Simplex Noise 流場 / Flow-field dust: a Simplex noise field
// ----------------------------------------------------------------------------
// 純邏輯，與 DOM 無關。粒子沿著一個 3D Simplex noise 場移動，所以會自然聚成絲帶、
// 渦流與空洞——「隨機但有結構」。關鍵在於 noise 的**連續性**：鄰近位置的取值相近，
// 所以粒子沿著「同一片場」流動，而不是各自亂飛。
//
// Pure logic, no DOM. Particles move along a 3D Simplex noise field, so they
// gather into ribbons, vortices and voids — random but structured. What makes it
// work is the field's **continuity**: nearby positions return similar values, so
// the particles flow along one shared field instead of scattering at random.
//
// 為什麼噪聲來自 three 而不是 simplex-noise / Why the noise comes from three
// 專案已經依賴 three，而它自帶 `examples/jsm/math/SimplexNoise`——同樣的演算法，
// 不需要為了取一個函式再加一個相依套件。
//
// The project already depends on three, which ships `examples/jsm/math/
// SimplexNoise` — the same algorithm, with no extra dependency just to get one
// function.
//
// 為什麼用專案自己的 createRng，而不是亂數 / Why the project's own createRng
// `simplex-noise` 的 `createNoise3D(rand)` 會呼叫 `rand` **兩百多次**來建立它的
// permutation table。傳入 `() => 0.5` 這種常數函數會讓所有梯度索引都一樣，於是場
// 退化成一條平滑的斜坡——正好失去「隨機但有結構」這個唯一的重點。
//
// `simplex-noise`'s `createNoise3D(rand)` calls `rand` **a couple of hundred
// times** to build its permutation table. Passing a constant like `() => 0.5`
// makes every gradient index identical, which degenerates the field into a smooth
// ramp — losing the one thing this technique is for.
//
// 所以這裡用專案既有的 FNV-1a + mulberry32（`createRng`）。同一個種子永遠得到同一
// 個場，所以重新掛載不會讓整層跳動。
//
// So this uses the project's existing FNV-1a + mulberry32 (`createRng`). The same
// seed always yields the same field, so a remount cannot make the layer jump.
// ============================================================================

import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { createRng, type Rng } from '@/lib/rng';
import { CONFIG } from '@/lib/gameConfig';

/** 一顆粒子 / one particle */
export interface FlowParticle {
  x: number;
  y: number;
  /** 已走的生命（幀）/ frames lived */
  life: number;
  /** 這一生總共能走多久（幀）/ total frames this life lasts */
  maxLife: number;
  /**
   * 保留給外部使用（例如重生時的短暫保留）。顏色**不再**由這個值決定——
   * 色相取自粒子所在位置的噪聲，所以同一條絲帶共享顏色。
   *
   * Kept for callers that want to carry it across a respawn. The colour is **no
   * longer** derived from this: the hue is read from the noise at the particle's
   * position, so one ribbon shares one colour.
   */
  hue: number;
  size: number;
  speed: number;
}

/** 流場所需的參數 / The parameters a field needs */
export interface FlowFieldOptions {
  noiseScale: number;
  timeScale: number;
  flowSpeed: number;
  hueMin: number;
  hueMax: number;
  /** 色相取樣的空間尺度 / spatial scale for the hue sample */
  hueScale: number;
  /** 色相隨場漂移的速度 / hue drift rate */
  hueTimeScale: number;
  /** 群聚強度 0..1 / clumping strength, 0..1 */
  clump: number;
  /** 色相量化階數 / hue quantisation steps */
  hueSteps: number;
  /** 飽和度（%）/ saturation % */
  saturation: number;
  /** 亮度（%）/ lightness % */
  lightness: number;
  /**
   * 每個色階的 RGB。不為空就直接使用，讓開發者能指定確切顏色。
   * `r,g,b` per step, so a developer can name exact colours; empty derives from the
   * hue range.
   */
  colors: string[];
  /** 拖曳 / 縮放時跟著鏡頭移動的比例 / how much the dust follows the camera */
  parallax: number;
  minSize: number;
  maxSize: number;
  minLife: number;
  maxLife: number;
  fadeFraction: number;
}

/** 用 CONFIG 建立參數 / Build the options from CONFIG */
export function flowOptions(): FlowFieldOptions {
  return {
    noiseScale: CONFIG.SPACE_FLOW_NOISE_SCALE,
    timeScale: CONFIG.SPACE_FLOW_TIME_SCALE,
    flowSpeed: CONFIG.SPACE_FLOW_SPEED,
    hueMin: CONFIG.SPACE_FLOW_HUE_MIN,
    hueMax: CONFIG.SPACE_FLOW_HUE_MAX,
    hueScale: CONFIG.SPACE_FLOW_HUE_SCALE,
    hueTimeScale: CONFIG.SPACE_FLOW_HUE_TIME_SCALE,
    hueSteps: CONFIG.SPACE_FLOW_HUE_STEPS,
    clump: CONFIG.SPACE_FLOW_CLUMP,
    saturation: CONFIG.SPACE_FLOW_SATURATION,
    lightness: CONFIG.SPACE_FLOW_LIGHTNESS,
    colors: CONFIG.SPACE_FLOW_COLORS,
    parallax: CONFIG.SPACE_FLOW_PARALLAX,
    minSize: CONFIG.SPACE_FLOW_MIN_SIZE,
    maxSize: CONFIG.SPACE_FLOW_MAX_SIZE,
    minLife: CONFIG.SPACE_FLOW_MIN_LIFE,
    maxLife: CONFIG.SPACE_FLOW_MAX_LIFE,
    fadeFraction: CONFIG.SPACE_FLOW_FADE_FRACTION,
  };
}

/**
 * 建立一個可重現的流場 / Build a reproducible flow field.
 *
 * 三個函式都共用同一顆種子與同一個 noise 實例：粒子位置、顏色與生命週期因此彼此
 * 相關（走在一起的一批粒子會是同一批顏色），這正是流場該有的樣子。
 *
 * All three draws share one seed and one noise instance: position, colour and
 * lifetime are therefore correlated, so a cluster of particles moving together is
 * also a cluster of colour — which is what a flow field should look like.
 *
 * @param seed - 種子字串 / the seed string
 * @returns 一顆粒子 / one particle
 */
export function spawnParticle(seed: string, options: FlowFieldOptions, initial: boolean): FlowParticle {
  const rng = createRng(seed);
  const maxLife = options.minLife + rng.float(0, options.maxLife - options.minLife);
  return {
    x: rng.float(0, 1),
    y: rng.float(0, 1),
    // 初始播種時讓生命錯開，否則所有粒子會同時淡入、同时重生，看起來像在呼吸 /
    // Stagger the initial lives, or every particle fades in and respawns together
    // and the layer looks like it is breathing
    life: initial ? rng.float(0, maxLife) : 0,
    maxLife,
    hue: rng.float(0, 1),
    size: options.minSize + rng.float(0, options.maxSize - options.minSize),
    speed: 0.4 + rng.float(0, 0.8),
  };
}

/**
 * 依噪聲決定下一步的方向 / The direction the field points at a given moment.
 *
 * `noise3d` 回傳約 −1..1；乘上 2π 就得到一個角度。這是整個效果的靈魂：連續的場
 * 讓相鄰粒子朝相近的方向走，於是形成絲帶。
 *
 * `noise3d` returns roughly −1..1; scaling by 2π turns that into an angle. This is
 * the heart of the effect: because the field is continuous, neighbouring
 * particles head in nearly the same direction and so form ribbons.
 *
 * @param noise - 噪聲實例 / the noise instance
 * @param x - 螢幕 x / screen x
 * @param y - 螢幕 y / screen y
 * @param fieldTime - 已推進的場時間 / elapsed field time
 * @param options - 場參數 / the field options
 * @returns 弧度 / radians
 */
export function flowAngle(
  noise: SimplexNoise,
  x: number,
  y: number,
  fieldTime: number,
  options: FlowFieldOptions,
): number {
  return (
    noise.noise3d(x * options.noiseScale, y * options.noiseScale, fieldTime * options.timeScale) *
    Math.PI *
    2
  );
}

/**
 * 噪聲的梯度方向，指向值更高的地方 / The noise gradient, pointing uphill.
 *
 * 這是「團塊」的來源。純粹的流場只能形成**細長的線**，因為場的等值線本來就是長條；
 * 加上「往噪聲更高的方向走」，粒子就會聚成團塊、渦流與空洞，而不只是絲帶。
 *
 * This is where the clumping comes from. A plain flow field can only make *thin lines*,
 * because the field's level sets are long strips; adding "walk toward higher noise" makes
 * the particles gather into blobs, vortices and voids rather than ribbons alone.
 *
 * 用中心差分取梯度，量級很小，所以之後要正規化。/
 * A central difference gives the gradient; it is tiny, so it is normalised after.
 *
 * @param noise - 噪聲實例 / the noise instance
 * @param x - 螢幕 x / screen x
 * @param y - 螢幕 y / screen y
 * @param fieldTime - 已推進的場時間 / elapsed field time
 * @param options - 場參數 / the field options
 * @returns 單位長度、指向噪聲更高的方向 / unit length, pointing toward higher noise
 */
export function noiseClimb(
  noise: SimplexNoise,
  x: number,
  y: number,
  fieldTime: number,
  options: FlowFieldOptions,
): { dx: number; dy: number } {
  // 偏移量要與採樣尺度成反比，否則在細密的場裡梯度會被雜訊主導 /
  // The offset must scale inversely with the sample scale, or a fine field makes the
  // gradient pure noise
  const h = options.hueScale * 40;
  const s = options.noiseScale;
  const t = fieldTime * options.timeScale;
  const dx = noise.noise3d((x + h) * s, y * s, t) - noise.noise3d((x - h) * s, y * s, t);
  const dy = noise.noise3d(x * s, (y + h) * s, t) - noise.noise3d(x * s, (y - h) * s, t);
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-9) return { dx: 0, dy: 0 };
  return { dx: dx / mag, dy: dy / mag };
}

/**
 * 粒子的不透明度，含淡入淡出 / A particle's opacity, including the fade.
 *
 * 淡入淡出各佔 `fadeFraction`，中間滿值。這裡回傳 0..1 的**倍率**，實際 alpha 由
 * 上限 `SPACE_FLOW_MAX_ALPHA` 決定——兩者分開，是為了讓「生命曲線」可以獨立測。
 *
 * Fade in and out each take `fadeFraction`, flat in between. This returns a 0..1
 * **factor**; the actual alpha comes from the `SPACE_FLOW_MAX_ALPHA` ceiling.
 * Splitting them keeps the life curve independently testable.
 *
 * @param life - 已活的幀數 / frames lived
 * @param maxLife - 總壽命 / total life
 * @param fadeFraction - 淡入淡出比例 / the fade fraction
 * @returns 0..1 / 0..1
 */
export function lifeFade(life: number, maxLife: number, fadeFraction: number): number {
  if (maxLife <= 0) return 0;
  const ratio = life / maxLife;
  if (ratio < fadeFraction) return ratio / fadeFraction;
  if (ratio > 1 - fadeFraction) return (1 - ratio) / fadeFraction;
  return 1;
}

/**
 * 粒子的色相 / A particle's hue.
 *
 * 色相**取自它所在位置的噪聲值**，所以同一條絲帶上的粒子共享色相——當分組隨場
 * 改變，顏色的分組也跟著改。這是「顏色跟隨流動」唯一有意義的做法：若色相各自抽
 * 一次，一條絲帶裡會同時出現所有顏色，看不出任何結構。
 *
 * The hue is read from the noise **at the particle's position**, so every particle
 * on one ribbon shares a hue and, as the grouping shifts with the field, the colour
 * grouping shifts with it. This is the only meaningful reading of "colour follows
 * the flow": with per-particle hues, a single ribbon contains every colour at once
 * and no structure is visible.
 *
 * 取樣尺度比流動**更細**（`hueScale`），所以同色帶比絲帶窄，會在絲帶內部再分層；
 * 漂移也**更慢**（`hueTimeScale`），所以顏色不會跟著流動一起翻騰。
 *
 * The hue samples at a **finer** scale than the flow (`hueScale`), so a colour band
 * is narrower than a ribbon and layers inside it; and it drifts **slower**
 * (`hueTimeScale`), so the colour does not churn along with the motion.
 *
 * 回傳的是量化後的**索引**，不是角度：填色字串預先建好並依索引取用，每幀就零配置。
 *
 * Returns a quantised **index**, not an angle: the fill strings are pre-built and
 * indexed, so a frame allocates nothing.
 *
 * @param noise - 噪聲實例 / the noise instance
 * @param x - 螢幕 x / screen x
 * @param y - 螢幕 y / screen y
 * @param fieldTime - 已推進的場時間 / elapsed field time
 * @param options - 場參數 / the field options
 * @returns 0..(hueSteps-1) 的整數 / an integer in 0..hueSteps-1
 */
export function particleHueIndex(
  noise: SimplexNoise,
  x: number,
  y: number,
  fieldTime: number,
  options: FlowFieldOptions,
): number {
  const raw = noise.noise3d(
    x * options.hueScale,
    y * options.hueScale,
    fieldTime * options.hueTimeScale,
  );
  // noise 約 −1..1；映射到 0..1 再量化 / noise is roughly −1..1: map to 0..1, then quantise
  const unit = (raw + 1) / 2;
  const step = Math.floor(unit * options.hueSteps);
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(options.hueSteps - 1, step));
}

/**
 * 由量化索引取出實際色相角度 / The actual hue angle for a quantised index.
 *
 * @param index - 0..(hueSteps-1) / the quantised index
 * @param options - 場參數 / the field options
 * @returns 色相角度 / degrees
 */
export function hueForIndex(index: number, options: FlowFieldOptions): number {
  const unit = (index + 0.5) / options.hueSteps;
  return options.hueMin + unit * (options.hueMax - options.hueMin);
}

/** HSL → CSS 色字串 / HSL to a CSS colour string */
function hsl(hue: number, options: FlowFieldOptions, alpha: number): string {
  return `hsla(${hue.toFixed(1)}, ${options.saturation}%, ${options.lightness}%, ${alpha})`;
}

/**
 * 建立整層的填色字串 / Build the layer's fill strings.
 *
 * 兩條路徑，都是「每幀零配置」：
 * 1. `SPACE_FLOW_COLORS` 有給 → 直接使用那些顏色，開發者要什麼就是什麼。
 * 2. 沒給 → 由 `hueMin`..`hueMax` 均分 HueScale，HueScale + Saturation + Lightness
 *    全部來自 config。
 *
 * Two paths, both allocating nothing per frame:
 * 1. `SPACE_FLOW_COLORS` is set → those exact colours are used.
 * 2. Otherwise → the hue range is split evenly across the steps, with saturation
 *    and lightness from config.
 *
 * 顏色字串數量固定為 `hueSteps`，所以每幀只做一次陣列查詢。/
 * Always `hueSteps` strings, so a frame costs one array lookup per particle.
 *
 * @param options - 場參數 / the field options
 * @returns 依色階索引的填色字串 / fill strings indexed by hue step
 */
export function buildFlowStyles(options: FlowFieldOptions): string[] {
  const steps = options.hueSteps;
  const explicit = options.colors.filter((c) => c.trim().length > 0);

  if (explicit.length > 0) {
    // 有指定顏色就在這些顏色之間平分色階，並保留飽和度／亮度的意圖：把亮度當成
    // alpha 之外的第二個控制軸會太難預測，所以這裡仍用 HSL 之外的原色。/
    // With explicit colours, spread them across the steps and use them as-is:
    // deriving a second brightness axis on top of alpha is too unpredictable.
    const out: string[] = [];
    for (let i = 0; i < steps; i += 1) {
      const source = explicit[Math.min(explicit.length - 1, Math.floor((i / steps) * explicit.length))];
      const rgb = parseRgb(source);
      out.push(
        rgb === null
          ? hsl(Math.round(hueForIndex(i, options)), options, 1)
          : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
      );
    }
    return out;
  }

  const out: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    out.push(hsl(hueForIndex(i, options), options, 1));
  }
  return out;
}

/** 解析 `r,g,b` 或 `#rrggbb` / Parse `r,g,b` or `#rrggbb` */
function parseRgb(value: string): { r: number; g: number; b: number } | null {
  const text = value.trim();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    if (full.length !== 6) return null;
    const n = Number.parseInt(full, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const parts = text.split(',').map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return { r: parts[0] as number, g: parts[1] as number, b: parts[2] as number };
}

/** 一個已建好的流場 / A ready-to-use field */
export interface FlowField {
  noise: SimplexNoise;
  rng: Rng;
  options: FlowFieldOptions;
}

/**
 * 建立流場 / Build the field.
 *
 * @param seed - 種子 / the seed
 * @returns 流場 / the field
 */
export function createFlowField(seed: string): FlowField {
  return {
    // SimplexNoise 需要一個 `random()`；用專案既有的 mulberry32，而不是常數函式 /
    // SimplexNoise needs a `random()`; give it the project's mulberry32 rather than
    // a constant, which would collapse the permutation table
    noise: new SimplexNoise(createRng(seed)),
    rng: createRng(`${seed}:respawn`),
    options: flowOptions(),
  };
}