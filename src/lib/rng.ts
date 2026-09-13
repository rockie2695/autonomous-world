// ============================================================================
// 可播種的隨機數生成器 (RNG) / Seeded Random Number Generator (RNG)
// ============================================================================
// 提供可複製的隨機性，用於可重現的遊戲模擬。
// Provides deterministic randomness for reproducible game simulation.
// 基於 mulberry32 — 一個快速、高品質的 32 位元 PRNG。
// Based on mulberry32 — a fast, high-quality 32-bit PRNG.
//
// 使用方式 / Usage:
//   const rng = createRng('my-seed-123');
//   const value = rng.random();      // 0 ≤ value < 1
//   const int = rng.int(1, 10);      // 1 ≤ int ≤ 10
//   const pick = rng.pick([a, b]);   // 從陣列中隨機選取 / Random element from array
//   const gaussian = rng.gaussian(17, 5);  // 常態分佈 / Normal distribution
//
// 儲存/還原狀態以確保可複製性：
// To save/restore state for reproducibility:
//   const state = rng.getState();    // 回傳字串 / Returns string
//   const rng2 = createRng('seed', state);  // 還原狀態 / Restores state
// ============================================================================

export interface RngState {
  /** 內部 32 位元狀態 (0 到 2^32 - 1) / Internal 32-bit state (0 to 2^32 - 1) */
  s: number;
}

/**
 * 建立一個可播種的 RNG 實例。
 * Create a seeded RNG instance.
 * 使用 mulberry32 演算法產生快速、確定性的隨機數。
 * Uses mulberry32 algorithm for fast, deterministic random numbers.
 *
 * @param seed - 字串種子（會被雜湊為 32 位元整數）/ String seed (will be hashed to 32-bit integer)
 * @param initialState - 可選的序列化狀態以還原 / Optional serialized state to restore from
 */
export function createRng(seed: string, initialState?: string): Rng {
  // 使用 FNV-1a 將種子字串雜湊為 32 位元整數
  // Hash seed string to 32-bit integer using FNV-1a
  let h = 0x811c9dc5; // FNV offset basis / FNV 偏移基數
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime / FNV 質數
  }

  // 如果要還原狀態，使用該狀態而非種子雜湊
  // If restoring state, use that instead of seed hash
  const state: RngState = initialState
    ? JSON.parse(initialState)
    : { s: h >>> 0 };

  return new Rng(state);
}

/**
 * 具備多種隨機分佈方法的 RNG 類別。
 * RNG class with methods for various random distributions.
 *
 * 所有方法在相同的狀態序列下都是確定性的。
 * All methods are deterministic given the same state sequence.
 * 狀態可被序列化和還原以實現精確的可複製性。
 * The state can be serialized and restored for exact reproducibility.
 */
export class Rng {
  private state: RngState;

  constructor(state: RngState) {
    this.state = state;
  }

  /**
   * 產生隨機浮點數：0 ≤ value < 1
   * Generate a random float: 0 ≤ value < 1
   * 使用 mulberry32 演算法。
   * Uses mulberry32 algorithm.
   */
  random(): number {
    // mulberry32 PRNG 步驟 / mulberry32 PRNG step
    let t = (this.state.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 產生 [min, max] 範圍內的隨機整數（含兩端）。
   * Generate a random integer in range [min, max] (inclusive).
   * min 和 max 都是可能的結果。
   * Both min and max are possible outcomes.
   */
  int(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * 從陣列中隨機選取一個元素。
   * Pick a random element from an array.
   * 陣列為空時回傳 undefined。
   * Returns undefined if array is empty.
   */
  pick<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * 就地打亂陣列（Fisher-Yates 演算法）。
   * Shuffle an array in place (Fisher-Yates algorithm).
   * 回傳同一個陣列以支援鏈式呼叫。
   * Returns the same array for chaining.
   */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * 從常態（高斯）分佈產生一個值。
   * Generate a value from a normal (Gaussian) distribution.
   * 使用 Box-Muller 轉換產生高品質常態分佈樣本。
   * Uses Box-Muller transform for quality normal samples.
   *
   * @param mean - 分佈中心 (μ) / Distribution center (μ)
   * @param sigma - 標準差 (σ) / Standard deviation (σ)
   * @param min - 下限值 / Clamped minimum value
   * @param max - 上限值 / Clamped maximum value
   * @returns 限制在 [min, max] 的值 / Value clamped to [min, max]
   */
  gaussian(mean: number, sigma: number, min: number, max: number): number {
    // Box-Muller 轉換：將均勻分佈轉換為常態分佈
    // Box-Muller transform: converts uniform to normal distribution
    const u1 = this.random();
    const u2 = this.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    // 套用 mean 和 sigma，然後限制在有效範圍內
    // Apply mean and sigma, then clamp to valid range
    const value = z0 * sigma + mean;
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 產生 [min, max) 範圍內的隨機浮點數。
   * Generate a random float in range [min, max).
   */
  float(min: number, max: number): number {
    return this.random() * (max - min) + min;
  }

  /**
   * 根據給定機率產生布林值。
   * Generate a boolean with given probability of true.
   *
   * @param probability - 回傳 true 的機率 (0 到 1) / Chance of returning true (0 to 1)
   */
  chance(probability: number): boolean {
    return this.random() < probability;
  }

  /**
   * 序列化當前 RNG 狀態以供儲存/還原。
   * Serialize current RNG state for saving/restoring.
   * 使用此方法在儲存間保持可複製性。
   * Use this to preserve reproducibility across saves.
   */
  getState(): string {
    return JSON.stringify(this.state);
  }
}
