'use client';

// ============================================================================
// 將領頭像 / Leader Avatar
// ============================================================================
// 每位將領的頭像是**程序化生成**的：從角色 id 播種，畫出一張 SVG 半身像。
// 不需要任何圖檔、不需要資料庫欄位、也不需要新的相依套件。
// A leader's head is **procedurally generated**: seeded from the character id and
// assembled into an SVG bust. No art assets, no database column, no new dependency.
//
// 同一個 id 永遠得到同一張臉（抽取順序固定），所以頭像不需要存在資料庫裡。
// The same id always yields the same face (the draw order is fixed), so the
// avatar never needs to be stored.
//
// 真實資料會影響外觀，不只是隨機裝飾 / Real game data biases the result, it is
// not decoration:
//   君王 isKing      → 王冠 / crown
//   武力 wu          → 頭盔／額帶／疤痕 / helmet, headband, scar
//   統領 tong        → 肩章／素肩章／破肩章 / board, plain board, torn board
//   經濟 jing        → 算盤／銅錢／空錢袋 / abacus, cash coin, empty pouch
//   年長 age ≥ 60    → 髮色轉灰白 / hair greys out
//   野心 defectionBase ≥ 20 → 眉壓低 / brows angle down
//   陣營 factionId   → 衣袍與底色 / robe and backdrop tint
//
// ── 三條讓九個線索讀得懂的規則 / three rules that make all nine cues readable ──
// 1. **共用一套材質語言**：gold = 將軍、steel = 軍佐、hemp = 平民。三項能力
//    用同一組顏色分級，因此「階級」是橫向可比的，而不是九個各有各的顏色。
//    One shared material language: gold = officer, steel = lieutenant,
//    hemp = commoner. All three abilities band with the same three colours, so
//    rank reads *across* stats instead of nine unrelated hues.
// 2. **各占一個身體區域**：wu 在頭、tong 在肩、jing 在胸前中央。三者不重疊，
//    舊版把 sash／cord 與 beads／coin／patch 全擠在胸口與腰間，於是互相干擾。
//    One body region each: wu on the head, tong on the shoulders, jing centred on
//    the chest. The old design put every cue on the chest and waist, where they
//    collided.
// 3. **同一個物件逐級劣化，而不是換三個物件**：肩章是金→鋼→破，算盤是滿→一
//    枚→空袋。漸層看得見「順序」，三個無關物件則看不出來。
//    Each tier is the *same object degrading*, not three different objects: one
//    board going gold → steel → torn; a full abacus → one coin → an empty pouch.
//    A progression is readable, three unrelated shapes are not.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { createRng } from '@/lib/rng';
import { t } from '@/lib/i18n';
import { CONFIG } from '@/lib/gameConfig';

/** 頭像只需要這些欄位 / The only fields the avatar needs */
export interface AvatarCharacter {
  id: string;
  wu: number;
  /** 統領：決定肩章的材質 / Leadership: decides the shoulder board's material */
  tong: number;
  /** 經濟：決定頸前的算盤／銅錢／錢袋 / Economy: picks abacus, cash coin, or pouch */
  jing: number;
  /** 體魄：三段護具 decides the arm guard / Physique: picks the bracer, vambrace or wrap */
  ti: number;
  /** 速度：身後動勢線的數量 / Speed: how many motion lines trail the head */
  speed: number;
  defectionBase: number;
  age: number;
  isKing: boolean;
}

// ─── 特徵池 / Trait pools ───────────────────────────────────────────────────
// 這些是「內容」不是「設計 token」，跟名稱產生器的字庫同一類，因此留在程式碼裡。
// These are content pools, not design tokens — the same category as the name
// generator's word lists — so they live in code rather than @theme static.

/** 膚色 / Skin tones */
const SKIN_TONES = ['#e8c39e', '#d9a97e', '#c08e63', '#a9714a', '#8a5636'];

/** 臉型寬度倍率（圓 → 窄）/ Face width multipliers (round to narrow) */
const FACE_WIDTHS = [1.1, 1.0, 0.92];

/** 髮型 / Hair */
const HAIR_STYLES = ['short', 'topknot', 'long', 'side', 'balding', 'cropped'] as const;

/** 髮色 / Hair colours */
const HAIR_COLORS = ['#1c1917', '#3f2a1d', '#5c3a21', '#7a4a2b', '#9ca3af', '#e5e7eb'];

/** 鬍型 / Facial hair */
const FACIAL_HAIR = ['none', 'none', 'moustache', 'beard', 'goatee'] as const;

/** 眼形 / Eye shapes */
const EYE_SHAPES = ['dot', 'almond', 'wide'] as const;

/** 嘴形 / Mouth shapes */
const MOUTH_SHAPES = ['flat', 'smile', 'firm'] as const;

/** 資料門檻 / Data thresholds */
const GREY_HAIR_AGE = 60;
const SHARP_BROW_DEFECTION_BASE = 20;
/**
 * 三段式能力門檻：≥ `ABILITY_HIGH` 為 high、≥ `ABILITY_MID` 為 mid，其餘為 low。
 * 能力值域 5–30，所以 high 只有最頂端約兩成、mid 是最常見的一檔。舊規則只有
 * high 給配件，結果約八成的將領身上完全讀不出能力差異——看起來都一樣。
 * Three-band ability thresholds. The range is 5–30, so `high` is only the top
 * ~20% and `mid` is the common case. The old rule rewarded only `high`, which
 * left ~80% of leaders with no ability signal — they all looked alike.
 */
const ABILITY_HIGH = 25;
const ABILITY_MID = 18;

/** 能力三段 / The three ability bands */
export type AbilityTier = 'high' | 'mid' | 'low';

/** 把能力值分到三段 / Bucket an ability stat into its band */
function tierFor(value: number): AbilityTier {
  if (value >= ABILITY_HIGH) return 'high';
  if (value >= ABILITY_MID) return 'mid';
  return 'low';
}

// ─── 分級材質 / Tier materials ───────────────────────────────────────────────
// 三項能力共用這三種材質，階級因此可以橫向比較。
// All three abilities share these three materials, so rank compares sideways.

/** 將軍：主金色 + 暗金 / Officer: gold plus its shadow */
const TIER_GOLD = '#f5b544';
const TIER_GOLD_DARK = '#b45309';
/** 軍佐：鋼灰 + 暗鋼 / Lieutenant: steel plus its shadow */
const TIER_STEEL = '#94a3b8';
const TIER_STEEL_DARK = '#64748b';
/** 平民：麻色 + 暗麻 / Commoner: hemp plus its shadow */
const TIER_HEMP = '#cbbfa0';
const TIER_HEMP_DARK = '#8a7a58';

/** 每段對應的主色與暗色 / The main and shadow colour of each band */
const TIER_MATERIAL: Record<AbilityTier, { main: string; dark: string }> = {
  high: { main: TIER_GOLD, dark: TIER_GOLD_DARK },
  mid: { main: TIER_STEEL, dark: TIER_STEEL_DARK },
  low: { main: TIER_HEMP, dark: TIER_HEMP_DARK },
};

/** 疤痕色 / Scar colour */
const SCAR = '#8f3a2c';

/** 五官共用的線條粗細，避免整張臉粗細不一 / One stroke weight for every feature */
const LINE = 1.8;

interface LeaderAvatarProps {
  character: AvatarCharacter;
  /** 陣營色（hsl 或 hex）；無陣營時留空 / Faction colour (hsl or hex); omit when unaffiliated */
  factionColor?: string | null;
  /** 邊長（px）/ Edge length in px */
  size?: number;
  className?: string;
  /**
   * 是否讓頭像「呼吸」/ Whether the avatar breathes.
   *
   * 預設關閉。呼吸在 40px 的列表列幾乎看不出來，卻會讓整列表持續重繪；只有
   * 大尺寸的單一展示（詳情彈窗）才值得開，而且那裡本來就只掛一個實例。
   *
   * Off by default. Breathing is barely legible at the ~40px list size but keeps
   * a whole list repainting; it is only worth it for a single large presentation
   * (the detail modal), which has exactly one instance anyway.
   */
  breathe?: boolean;
}

/**
 * 一次呼吸的週期（秒）/ One breath cycle, in seconds.
 *
 * 真人的安靜呼吸約每分鐘 12–20 次，也就是 3–5 秒一輪。這裡取 4 秒。
 *
 * A resting human breathes 12–20 times a minute, i.e. a 3–5 second cycle. 4s it is.
 */
export const BREATH_PERIOD_S = 4;

/**
 * 某個相位下的呼吸量，0..1。純函式，所以可以在沒有 DOM 的情況下測。
 * The breath amount at a given phase, 0..1. Pure, so it is testable without a DOM.
 *
 * 用 `sin` 的**一半**週期（0 → 1 → 0），而不是整個週期：整個週期的話吸氣與
 * 呼氣會各佔一半但方向相反，看起來像「忽大忽小」而不是起伏。用半週期加一個偏置，
 * 上升比下降慢一點，才像真的在呼吸。
 *
 * Half a sine period (0 → 1 → 0), not a whole one: a whole period makes the rise
 * and fall symmetrical, which reads as "pulsing" rather than breathing. A half
 * period with a bias makes the inhale slower than the exhale.
 *
 * @param tSeconds - 自循環起點經過的秒數 / seconds since the cycle started
 * @returns 0（吐氣末端）到 1（吸氣頂點）/ 0 (end of exhale) to 1 (top of inhale)
 */
export function breathAmount(tSeconds: number): number {
  const cycle = (tSeconds % BREATH_PERIOD_S) / BREATH_PERIOD_S;
  // 峰值落在 0.45，不是 0.5 —— 讓吸氣比呼氣短，這才是呼吸而不是脈動 /
  // The peak sits at 0.45, not 0.5 — a shorter inhale is what makes it read as
  // breathing rather than pulsing
  const PEAK = 0.45;
  // 以峰值為中心取半個正弦，並用偏置把峰值拉回 1。`sin` 在 0.45 處並不是 1，
  // 所以正規化是必要的，否則這張臉永遠吸不到頂。
  //
  // A half sine centred on the peak, then normalised so the peak actually reaches
  // 1: `sin` is not 1 at 0.45, so without the normalisation the face never finishes
  // an inhale.
  const sine = cycle <= PEAK ? Math.sin((cycle / PEAK) * (Math.PI / 2)) : Math.sin(((1 - cycle) / (1 - PEAK)) * (Math.PI / 2));
  // 峰值處的 sine 值，用來反向正規化 /
  // `sin` at the peak, used to normalise in reverse
  const peakSine = Math.sin(Math.PI / 2);
  return Math.min(1, sine / peakSine);
}

/**
 * 眨眼曲線：大部分時間睜著，每 4 秒閉眼 0.14 秒。
 * The blink curve: eyes open almost always, shut for 0.14s every 4s.
 *
 * 用**三角波**而不是線性淡入淡出：眨眼是「啪地閉上、啪地張開」，拉長的過渡會看起來像
 * 在瞇眼而不是在眨。
 *
 * A triangle rather than a linear ramp: a blink *snaps* shut and open, and a long fade
 * reads as squinting instead.
 *
 * @param tSeconds - 動畫經過的秒數 / Seconds into the animation
 * @returns 0 = 睜開，1 = 完全閉上 / 0 open, 1 fully shut
 */
export function blinkAmount(tSeconds: number): number {
  const PERIOD = 4;
  const SHUT = 0.14;
  const phase = ((tSeconds % PERIOD) + PERIOD) % PERIOD;
  if (phase >= SHUT) return 0;
  return Math.sin((Math.PI * phase) / SHUT);
}

/**
 * 說話曲線：一段話裡嘴開合幾次，然後**停頓**。
 * The talking curve: the mouth opens and closes a few times, then **pauses**.
 *
 * 停頓是關鍵。沒有停頓的話嘴會像節拍器一樣不停開合，看起來像壞掉；有了停頓才像在說話。
 *
 * The pause is the point. Without one the mouth opens and closes on a metronome and looks
 * broken; the pause is what makes it read as speech.
 *
 * @param tSeconds - 動畫經過的秒數 / Seconds into the animation
 * @returns 0 = 閉著，1 = 全開 / 0 closed, 1 fully open
 */
export function talkAmount(tSeconds: number): number {
  const PERIOD = 3.4;
  const SPEECH = 2.0;
  const phase = ((tSeconds % PERIOD) + PERIOD) % PERIOD;
  if (phase >= SPEECH) return 0;
  // 一句話裡三次開合；偏移讓它不會從頭到尾對稱得像在擺動 /
  // Three mouth movements per utterance; the offset keeps it from swinging in perfect symmetry
  return 0.5 + 0.5 * Math.sin(((phase / SPEECH) * 3 - 0.35) * Math.PI);
}

/** 一張臉所有已解析的特徵 / Every resolved trait that makes up one face */
/**
 * 速度的三段顏色，與其他三個屬性的金／鋼／麻**刻意不同**。
 * The speed band's three colours, deliberately unlike the gold/steel/hemp of the abilities.
 *
 * 速度不是穿在身上的東西，而是身後的動勢，所以給它自己的色階；否則它又是一件戲服，
 * 跟其他三個屬性混在一起就分不出來了。
 *
 * Speed is not something worn, it is motion behind the head, so it gets its own ramp —
 * otherwise it is one more costume piece and reads as part of the ability set.
 */
/** 瞳派的中心高度（與 eyeY 保持一致）/ The eye line, matching `eyeY` */
const EYE_Y = 43.5;

/**
 * 嘴的上編高度：張嘴時無輯回這裡為輪軸。
 * The mouth's top edge — the pivot it opens from, so an opening mouth grows downward
 * rather than sliding upward.
 */
const MOUTH_Y = 54.2;

const SPEED_TIER_COLOR: Record<AbilityTier, string> = {
  high: '#fbbf24',
  mid: '#38bdf8',
  low: '#94a3b8',
};

/**
 * 每個速度分段畫幾條動勢線 / How many motion lines each speed band draws.
 *
 * 1 / 2 / 3，與 `avatar.cue.speed` 的 one / two / three streaks 一致。高階原本是**四**條，
 * 卻在提示裡寫 three streaks，圖和文字對不上來；現在是三條，兩邊一致。
 * One / two / three, matching the `avatar.cue.speed` wording. The high band used to draw
 * **four** while the tooltip said "three streaks", so the mark and its own label disagreed.
 */
const SPEED_LINES: Record<AbilityTier, readonly number[]> = {
  high: [24, 31, 38],
  mid: [27.5, 34.5],
  low: [31],
};

/**
 * 能力識別圖形的放大倍率 / How much larger the ability cue shapes are drawn.
 *
 * 三段分級本來靠顏色與尺寸，但五項（頭／肩／胸／臂／速）在 100×100 的 viewBox 裡各佔一小塊，
 * 縮到 40-56px 的列表縮圖時幾乎看不出差別。放大倍率讓每一項都能一眼認出，不用靠 tooltip。
 * The five cues each own a small slice of a 100×100 viewBox, so at the 40-56px list sizes the
 * three bands all but flatten into each other. One scale factor makes every cue legible
 * without a tooltip.
 */
/**

/**
 * 輪圓圖根換字機：衣袍上下比件暗、预算理例要更大的尺寸，這不能単靠方形等掉。
 * Per-region cue scale. The chest cue is deliberately SMALLER than the default: it sits
 * in the middle of the body where the abacus and the coin are large shapes, and at the
 * shared scale it crowded the robe and the shoulder boards.
 */
/**
 * 對象圖的 clipPath id。
 *
 * 每個頭像用同一個 id 是安全的：裁剪圖形在每個頭像里都完全一樣，所以重複的 id 會引到第一个也是一樣的。
 * 與獨、肩章相後是對兩個**已存在**的组加 clipPath 属性，不斷增任何 group——
 * 之前新增一個包裹組更幸讓 JSX 平衡失敗，對比照警誝。
 *
 * One shared clip id is safe: the clip shape is identical in every avatar, so a duplicate
 * id resolving to the first one is still the same rectangle. The clipPath is attached as
 * an ATTRIBUTE on the two groups that already exist (chest and head), so no wrapper is
 * added — a previous attempt that inserted one unbalanced the JSX.
 */
const AVATAR_CLIP_ID = "avatar-round-clip";

const TIER_CUE_SCALE = 1.45;
const TIER_CUE_SCALE_CHEST = 1.0;
const TIER_CUE_SCALE_ARM = 1.0;

export interface AvatarTraits {
  skin: string;
  widthMul: number;
  hairStyle: (typeof HAIR_STYLES)[number];
  hairColor: string;
  eyeShape: (typeof EYE_SHAPES)[number];
  mouthShape: (typeof MOUTH_SHAPES)[number];
  facialHair: (typeof FACIAL_HAIR)[number];
  /** 君王頭上的王冠 / The king's crown */
  crown: boolean;
  /** 眉壓低（野心高）/ Brows angled down (high defectionBase) */
  sharpBrow: boolean;
  /** 武力三段 → 頭盔／額帶／疤痕 / Martial band -> helmet, headband, scar */
  wuTier: AbilityTier;
  /** 統領三段 → 金肩章／素肩章／破肩章 / Leadership band -> gold, plain, torn board */
  tongTier: AbilityTier;
  /** 經濟三段 → 算盤／銅錢／空錢袋 / Economy band -> abacus, cash coin, empty pouch */
  jingTier: AbilityTier;
  /** 體魄三段 → 護腕／素臂鐔／赤膊布纏 / Physique band -> bracer, plain vambrace, bare forearm wrap */
  tiTier: AbilityTier;
  /** 速度三段 → 身後的動勢線數量（1/2/3）/ Speed band -> how many motion lines trail the head */
  speedTier: AbilityTier;
  /** 疤長在哪一邊（由 id 決定，兩邊都有疤的隊伍看起來會很整齊）/ Which side the scar sits on (id-seeded, so a unit is not symmetric to a fault) */
  scarRight: boolean;
}

/** 頭像提示中的一列 / One row of the avatar tooltip */
export interface AvatarCue {
  stat: 'wu' | 'tong' | 'jing' | 'ti' | 'speed';
  tier: AbilityTier;
}

/**
 * 由特徵取出提示要顯示的列，**不含任何文字**。
 * Pull the tooltip rows out of the traits, with **no strings**.
 *
 * 文字交給 i18n，所以這個對應關係可以在沒有 DOM、也沒有翻譯表的情況下測試。
 * The wording belongs to i18n, which keeps this mapping testable without a DOM
 * and without a translation table.
 *
 * @param traits - 已解析的特徵 / The resolved traits
 * @returns 依 武力／統領／經濟／體魄／速度 順序的五列 / The five rows, in wu / tong / jing / ti / speed order
 */
export function avatarCues(traits: AvatarTraits): AvatarCue[] {
  return [
    { stat: 'wu', tier: traits.wuTier },
    { stat: 'tong', tier: traits.tongTier },
    { stat: 'jing', tier: traits.jingTier },
    { stat: 'ti', tier: traits.tiTier },
    { stat: 'speed', tier: traits.speedTier },
  ];
}

/**
 * 由角色推導整張臉的特徵（純函式，不碰 React）。
 * Derive every trait of one face from the character (pure, no React).
 *
 * 抽取順序固定，所以同一個 id 永遠得到同一張臉；真實資料只在抽取之後覆寫，
 * 因此不會影響其他隨機特徵的分佈。
 * The draw order is fixed, so the same id always yields the same face. Real data
 * only overrides *after* the draws, so it cannot skew the other traits' spread.
 *
 * @param character - 種子與覆寫來源 / The seed and the source of the overrides
 * @returns 已解析的特徵 / The resolved traits
 */
export function deriveAvatarTraits(character: AvatarCharacter): AvatarTraits {
  const rng = createRng(character.id);
  const skin = SKIN_TONES[rng.int(0, SKIN_TONES.length - 1)] ?? SKIN_TONES[0];
  const widthMul = FACE_WIDTHS[rng.int(0, FACE_WIDTHS.length - 1)] ?? 1;
  const hairStyle = HAIR_STYLES[rng.int(0, HAIR_STYLES.length - 1)] ?? 'short';
  let hairColor = HAIR_COLORS[rng.int(0, HAIR_COLORS.length - 1)] ?? HAIR_COLORS[0];
  const eyeShape = EYE_SHAPES[rng.int(0, EYE_SHAPES.length - 1)] ?? 'dot';
  const mouthShape = MOUTH_SHAPES[rng.int(0, MOUTH_SHAPES.length - 1)] ?? 'flat';
  let facialHair = FACIAL_HAIR[rng.int(0, FACIAL_HAIR.length - 1)] ?? 'none';
  const beardRoll = rng.float(0, 1);
  const scarRight = rng.float(0, 1) < 0.5;

  // ── 真實資料覆蓋 / Real data overrides ───────────────────────────────────
  // 年長者頭髮轉灰白 / Age greys the hair out
  if (character.age >= GREY_HAIR_AGE) {
    hairColor = character.age >= GREY_HAIR_AGE + 12 ? '#e5e7eb' : '#9ca3af';
  }
  // 年長者更容易留鬍 / Age also makes facial hair likelier
  if (character.age >= GREY_HAIR_AGE && facialHair === 'none' && beardRoll > 0.55) {
    facialHair = 'goatee';
  }

  return {
    skin,
    widthMul,
    hairStyle,
    hairColor,
    eyeShape,
    mouthShape,
    facialHair,
    crown: character.isKing,
    sharpBrow: character.defectionBase >= SHARP_BROW_DEFECTION_BASE,
    // 三項能力各自分段且彼此獨立：富而不武、或勇而無謀，都是合理的 /
    // Each ability is banded independently — being rich without being a warrior,
    // or brave without being shrewd, are both perfectly legitimate
    wuTier: tierFor(character.wu),
    tongTier: tierFor(character.tong),
    jingTier: tierFor(character.jing),
    tiTier: tierFor(character.ti),
    speedTier: tierFor(character.speed),
    scarRight,
  };
}

/**
 * 產生將領頭像。
 * Render a leader's procedural head avatar.
 *
 * 幾何全部集中在此處常數化，讓五官之間維持一致的比例；註解記的是「為什麼
 * 在這個位置」，不是「畫了什麼」。
 * All geometry is centralised in these constants so the features keep a
 * consistent proportion. The comments record *why* something sits where it does,
 * not what it draws.
 *
 * @param character - 角色 id 決定外觀，其餘欄位影響外觀 / The id seeds the face, the rest biases it
 * @param factionColor - 陣營色，套用到衣袍與底色 / Faction colour for the robe and backdrop
 * @param size - 邊長（px）/ Edge length in px
 * @param className - 額外 class / Extra classes
 * @returns SVG 頭像 / The SVG avatar
 */
export function LeaderAvatar({
  character,
  factionColor,
  size = 96,
  className,
  breathe = false,
}: LeaderAvatarProps) {
  const traits = deriveAvatarTraits(character);
  const { skin, hairColor, hairStyle, eyeShape, mouthShape, facialHair, speedTier } = traits;
  // 眨眼與說話各動一個 <g>，每幀只寫 transform —— 逐幀 setState 會重繪整張臉 /
  // Blink and talk each drive one <g>; only the transform is written per frame, because a
  // per-frame setState would re-render the whole face
  const eyeRef = useRef<SVGGElement>(null);
  const mouthRef = useRef<SVGGElement>(null);
  const grey = hairColor === '#9ca3af' || hairColor === '#e5e7eb';
  // 提示預設收合，只有 hover 或鍵盤 focus 才出現 /
  // The tooltip stays collapsed until hover or keyboard focus
  const [showCues, setShowCues] = useState(false);

  // ── 呼吸 / Breathing ───────────────────────────────────────────────────────
  // 動畫用 `requestAnimationFrame` 直接寫 SVG 元素的 transform，**不進 React
  // state**：每幀一次 setState 會讓整個頭像（以及它的所有呼叫點）跟著重繪，而這裡
  // 要動的只有兩個節點。
  //
  // The animation drives `requestAnimationFrame` straight onto two SVG nodes and
  // keeps **out of React state**: a per-frame setState would re-render the whole
  // avatar and every call site, when only two nodes need to move.
  const chestRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!breathe) return;
    const chest = chestRef.current;
    const head = headRef.current;
    const eye = eyeRef.current;
    const mouth = mouthRef.current;
    if (!chest || !head || !eye || !mouth) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let start = 0;
    let reduced = motionQuery.matches;

    /**
     * 眼睛與嘴都從**自己的中心**縮放，否則閉眼會讓眼睛整個往上跑、張嘴會讓嘴往上長。
     * 所以先平移到中心、縮放、再平移回去。
     *
     * Both scale about **their own centre**, or a blink would slide the eyes upward and an
     * opening mouth would grow upward instead of opening downward. So: translate to the
     * centre, scale, translate back.
     */
    const applyFace = (seconds: number) => {
      const blink = blinkAmount(seconds);
      const talk = talkAmount(seconds);
      eye.setAttribute('transform', `translate(50 ${EYE_Y}) scale(1 ${(1 - 0.92 * blink).toFixed(4)}) translate(-50 ${-EYE_Y})`);
      // 嘴巴往下張開，所以中心固定在上緣；說話時張到 2.4 倍高 /
      // The mouth opens downward, so its centre is pinned to the top edge; speech opens it to 2.4x
      mouth.setAttribute('transform', `translate(50 ${MOUTH_Y}) scale(1 ${(1 + 1.4 * talk).toFixed(4)}) translate(-50 ${-MOUTH_Y})`);
    };

    const apply = (amount: number) => {
      // 胸口起伏 + 頭部微幅後仰：兩個節點不同相位才不會像整張圖在縮放 /
      // Chest rise plus a slight head tilt; the two nodes are out of phase so it
      // does not read as the whole image scaling
      const rise = 1 + amount * CONFIG.AVATAR_BREATH_RISE;
      chest.setAttribute('transform', `translate(0 ${(amount * CONFIG.AVATAR_BREATH_LIFT).toFixed(3)}) scale(1 ${rise.toFixed(4)})`);
      head.setAttribute('transform', `translate(0 ${(amount * CONFIG.AVATAR_BREATH_HEAD_LIFT).toFixed(3)})`);
    };

    // 收斂動態效果時只畫一格，不啟動迴圈 /
    // Under reduced motion, render a single frame and start no loop
    if (reduced) {
      apply(0);
      applyFace(0);
      return;
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (start === 0) start = now;
      const seconds = (now - start) / 1000;
      apply(breathAmount(seconds));
      applyFace(seconds);
    };
    raf = requestAnimationFrame(loop);

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) {
        cancelAnimationFrame(raf);
        raf = 0;
        apply(0);
        applyFace(0);
      } else if (raf === 0) {
        start = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    return () => {
      cancelAnimationFrame(raf);
      motionQuery.removeEventListener('change', onMotionChange);
    };
  }, [breathe]);
  const cueRows = avatarCues(traits).map((cue) => ({
    ...cue,
    statLabel: t(`character.${cue.stat}`),
    tierLabel: t(`avatar.tier.${cue.tier}`),
    cueLabel: t(`avatar.cue.${cue.stat}.${cue.tier}`),
  }));
  const ariaLabel = t('avatar.label', {
    detail: cueRows.map((row) => `${row.statLabel} ${row.tierLabel} ${row.cueLabel}`).join(', '),
  });

  const robe = factionColor ?? '#475569';
  /**
   * A darker tone from the *same* skin pool, for shading.
   *
   * Deriving it from SKIN_TONES rather than writing a second list of shadow colours keeps
   * every face inside one palette, and keeps the "no hardcoded colour outside the trait pools"
   * rule intact — the pools are content, and the shade is drawn from them.
   */
  const skinShade =
    SKIN_TONES[Math.max(0, SKIN_TONES.indexOf(skin) - 2)] ?? skin;
  const wu = TIER_MATERIAL[traits.wuTier];
  const tong = TIER_MATERIAL[traits.tongTier];
  const jing = TIER_MATERIAL[traits.jingTier];
  const tiColor = TIER_MATERIAL[traits.tiTier];

  // 頭部：y 25.5–60.5。刻意讓頭略小、脖子略短，舊版脖子長到像一根柱子 /
  // Head spans y 25.5–60.5. Deliberately smaller head and shorter neck — the
  // old neck was long enough to read as a bare column.
  const faceRx = 14.5 * traits.widthMul;
  const eyeY = 43.5;
  const browY = 37;

  return (
    // className 掛在包覆層而不是 svg：兩個呼叫點都用 mx-auto 置中，若留在svg
    // 上，置中會以 shrink-wrapping 的 inline-block 為基準而失效。
    // className goes on the wrapper, not the svg: both call sites centre with
    // mx-auto, and on the svg that would measure against the shrink-wrapped
    // inline-block wrapper instead of the panel.
    <span
      className={`relative inline-block ${className ?? ''}`}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onMouseEnter={() => setShowCues(true)}
      onMouseLeave={() => setShowCues(false)}
      onFocus={() => setShowCues(true)}
      onBlur={() => setShowCues(false)}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="block"
        aria-hidden="true"
        focusable="false"
      >
      {/* 底色：陣營色的極淡版本 + 底板 / Backdrop: a light wash of faction colour over a base plate */}
      <rect x="0" y="0" width="100" height="100" rx="14" fill={robe} opacity={0.18} />
      <rect x="0" y="0" width="100" height="100" rx="14" fill="var(--color-ds-void)" opacity={0.35} />

      {/* 頸：畫在衣袍「下面」，下緣伸進衣領，否則會變成一根長柱子 /
          Neck — drawn UNDER the robe with its bottom reaching past the neckline */}
      <rect x="44" y="56" width="12" height="22" rx="4" fill={skin} />
      {/* 頸部陰影：讓頭不會像貼在脖子上 / A neck shadow so the head is not pasted on */}
      <ellipse cx="50" cy="60.5" rx="7" ry="2.6" fill="#0f172a" opacity={0.22} />

      {/* ── 胸口起伏 / The breathing chest ──
          衣袍、肩章與頸前配件全部包在這一組裡，所以呼吸時它們會一起動；頭部另外
          一組，兩者不同相位。呼吸預設關閉（見 `breathe`），所以這兩個 transform
          在沒開時不會被寫入。
          The robe, shoulder board and neck pieces all live in this group so they
          rise together; the head is a second group, out of phase. Breathing is off
          by default (see `breathe`), so these transforms are never written unless
          it is on. */}
{/* 圍換的圍拷圖角：衣袍與肩章直接落到底邊，不切它會透出圍換 /
    The rounded plate: the robe and shoulder boards run right to the bottom edge, and
    without this they bleed outside the rounded square. */}
<defs>
  <clipPath id={AVATAR_CLIP_ID}>
    <rect x="0" y="0" width="100" height="100" rx="14" />
  </clipPath>
</defs>
      <g ref={chestRef}
        clipPath={`url(#${AVATAR_CLIP_ID})`}
      >
      {/* 衣袍與肩膀 / Robe and shoulders */}
      <path d="M5 100 Q50 40 95 100 Z" fill={robe} />

      {/* ── 前臂：護具下面是**一條真的手臂**，不是直接浮在衣袍上的色塊 ──
          少了手臂，護腕看起來就像貼在衣料上的一條貼紙，讀不出「這是四肢」；有了手臂，
          金／鋼／麻三種材質才有承托物可以對比。這一段刻意畫在**肩章之前**，肩章才會
          壓在肩膀上，而不是被手臂穿過去。
          The forearm is a real limb, not a coloured patch floating on the robe. Without it the
          guard reads as a sticker on cloth rather than an arm, and the gold/steel/hemp materials
          have nothing to contrast against. It is drawn *before* the shoulder board, so the board
          sits on top of the shoulder instead of the arm passing through it. */}
      {[false, true].map((mirror) => (
        <g key={`arm-${mirror ? 'r' : 'l'}`}>
          {/* 深色邊緣與衣袍分界 / A dark rim so the arm separates from the robe.
              上緣壓到肩章之下：手臂本來就在肩膀的位置，但畫出來的高一點就會從肩章的
              斜邊上方露出一塊皮膚，讀起來像脖子旁長了一塊。
              The top edge is tucked under the board: the arm does belong at the shoulder, but a
              little higher and a wedge of skin clears the board's diagonal and reads as a neck. */}
          <path
            d={mirror ? 'M77 77 L83 100 L70 100 L68 79 Z' : 'M23 77 L17 100 L30 100 L32 79 Z'}
            fill={skin}
            stroke="#0b1220"
            strokeWidth="1.2"
            strokeOpacity="0.5"
          />
          {/* 內側一道暗面，讓手臂是圓柱而不是一塊平色 / An inner shade, so the arm reads as a
              cylinder rather than a flat patch */}
          <path
            d={mirror ? 'M68.5 81 L71 100' : 'M31.5 81 L29 100'}
            stroke="#0f172a"
            strokeWidth="1"
            opacity="0.22"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* ── 統領：肩章 / Leadership: the shoulder board ──
          同一個物件逐級劣化，而且**大小也一起變**：寬板 + 流蘇（金）→ 素板（鋼）
          → 薄補丁（麻）。大小差異是刻意加的：只看顏色不夠，而讓低階的鋸齒外緣
          和高階的流蘇撞樣會更糟。
          One object degrading, and deliberately **shrinking too**: wide board with
          fringe (gold) → plain board (steel) → thin patched strap (hemp). Size
          carries the rank as well as colour — colour alone is not enough, and a
          ragged low edge that mimics the high tier's fringe would collide. */}
      {[false, true].map((mirror) => {
        const tier = traits.tongTier;
        const board =
          tier === 'high'
            ? mirror
              ? 'M87 80 L67 69 L61 76 L81 87 Z'
              : 'M13 80 L33 69 L39 76 L19 87 Z'
            : tier === 'mid'
              ? mirror
                ? 'M83 80 L67 72 L63 77 L79 85 Z'
                : 'M17 80 L33 72 L37 77 L21 85 Z'
              : mirror
                ? 'M80 80 L67 74.5 L64 78 L77 83.5 Z'
                : 'M20 80 L33 74.5 L36 78 L23 83.5 Z';
        const edge =
          tier === 'high'
            ? mirror
              ? 'M87 80 L67 69'
              : 'M13 80 L33 69'
            : tier === 'mid'
              ? mirror
                ? 'M83 80 L67 72'
                : 'M17 80 L33 72'
              : mirror
                ? 'M80 80 L67 74.5'
                : 'M20 80 L33 74.5';
        return (
          <g
            key={mirror ? 'r' : 'l'}
            /* 以每片肩章自己的中心放大，位置不變，只是變大 / Scale each board about its own
               centre, so the placement on the shoulder is unchanged and only the size grows */
            transform={`translate(${mirror ? 74 : 26} 78) scale(${TIER_CUE_SCALE}) translate(${mirror ? -74 : -26} -78)`}
          >
            <path d={board} fill={tong.main} />
            <path d={edge} stroke={tong.dark} strokeWidth="1.2" opacity={0.75} fill="none" />
            {/* 只有將軍級有流蘇，階級感來自裝飾本身 /
                Only the officer grade gets fringe — the rank reads from the
                ornament itself, not from the colour alone */}
            {tier === 'high' &&
              (mirror ? [81, 76, 71] : [19, 24, 29]).map((x, i) => (
                <path
                  key={x}
                  d={mirror ? `M${x} ${77 - i * 3} l2.5 4.5` : `M${x} ${77 - i * 3} l-2.5 4.5`}
                  stroke={tong.dark}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              ))}
            {/* 低階那條是補過的：縫線讓「破」看得出來 / The low strap is
                mended — the stitch is what makes "worn" legible */}
            {tier === 'low' && (
              <path
                d={mirror ? 'M70 78 L77 78' : 'M23 78 L30 78'}
                stroke={tong.dark}
                strokeWidth="1.1"
                strokeDasharray="2 2"
                opacity={0.9}
              />
            )}
          </g>
        );
      })}

      {/* ── 體魄：前臂護具 / Physique: the forearm guard ──
          位置在肩章**之下**、前臂之上，是四個部位（頭／肩／胸／臂）裡唯一還空著的
          一塊，所以四項能力可以一眼分開而不會互相蓋掉。
          三段**共用同一個尺寸**：階級改由材質（金／鋼／麻）、外框與飾線表達，而不是
          由大小表達。原本 mid 與 low 的護具比較小，結果低階的線索不是「弱」而是「幾乎
          看不見」——在 40px 的列表列上，那正是唯一承載體魄資訊的地方。
          The Physique cue sits *below* the shoulder board, on the forearm — the only free
          body region left once head / shoulders / chest are taken, so all four abilities stay
          separable at a glance. All three bands share **one size**: rank is carried by material
          (gold / steel / hemp), the rim and the detailing, not by extent. mid and low used to be
          smaller, which made the low band's signal "almost invisible" rather than "weak" — and
          that is precisely where the only ti signal lives at the 40px list size. */}
      {[false, true].map((mirror) => {
        const tier = traits.tiTier;
        // 同一段幾何，三階共用 / one geometry, shared by all three bands
        const band = mirror ? 'M66 85 L84 86 L83 94 L65 93 Z' : 'M16 86 L34 85 L35 93 L17 94 Z';
        return (
          <g
            key={`ti-${mirror ? 'r' : 'l'}`}
            /* 以自己的中心放大：座標不變，所以護腕仍然長在同一條前臂上，只是變大。
               Scaling about each band's own centre keeps the coordinates — and therefore the
               placement on the arm — untouched, and only makes the cue read at a glance. */
            transform={`translate(${mirror ? 74.5 : 25.5} 89) scale(${TIER_CUE_SCALE_ARM}) translate(${mirror ? -74.5 : -25.5} -89)`}
          >
            {/* 深色外框：四段階級本來靠顏色辨識，但麻/鋼這類低階色在深色衣袍上幾乎看不見，
                一圈外框讓輪廓在任何尺寸都站得住 / A dark rim. The three bands were read from
                colour alone, but hemp and steel all but vanish against a dark robe — the rim
                keeps the silhouette legible at every size. */}
            <path d={band} fill={tiColor.main} stroke="#0b1220" strokeWidth="1.2" strokeOpacity="0.55" opacity="0.95" />
            {/* 高階才有的甲片脊線 / Only the heavy band carries a ridge, so it cannot be
                mistaken for a plain strip */}
            {tier === 'high' && (
              <path
                d={mirror ? 'M68 88.5 L82 89' : 'M18 89 L32 88.5'}
                stroke={tiColor.dark}
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            )}
            {/* 低階是布纏，縫線讓「破」看得見。跨滿整段護具，否則尺寸統一之後縫線會縮成一小截 /
                The low wrap is stitched, which is what makes "worn" legible. It spans the whole
                guard now — left at the old narrow band's length it would read as a stray mark. */}
            {tier === 'low' && (
              <path
                d={mirror ? 'M67 89.5 L82 90' : 'M18 90 L33 89.5'}
                stroke={tiColor.dark}
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.9"
              />
            )}
          </g>
        );
      })}

      {/* ── 經濟：頸前，算盤（多）→ 銅錢（一）→ 空錢袋（無）/ Economy: full, one, then none ──
          銅錢一定要挖方孔，那個方孔才是「認得出是銅錢」的關鍵。 */}
      {traits.jingTier === 'high' && (
        <g
          transform={`translate(50 84) scale(${TIER_CUE_SCALE_CHEST}) translate(-50 -84)`}
        >
          <rect x="36" y="76" width="28" height="16" rx="2.5" fill="#0b1220" opacity="0.45" />
          <rect
            x="36"
            y="76"
            width="28"
            height="16"
            rx="2.5"
            fill="none"
            stroke={jing.main}
            strokeWidth="2"
          />
          {[81, 87].map((y) => (
            <path key={y} d={`M38 ${y} L62 ${y}`} stroke={jing.main} strokeWidth="1.3" />
          ))}
          {[41, 47, 53, 59].map((cx) => (
            <circle key={`a${cx}`} cx={cx} cy="81" r="1.9" fill={jing.main} />
          ))}
          {[44, 50, 56].map((cx) => (
            <circle key={`b${cx}`} cx={cx} cy="87" r="1.9" fill={jing.main} />
          ))}
        </g>
      )}
      {traits.jingTier === 'mid' && (
        <g>
          {/* 短繩 / short cord */}
          <path d="M50 75 L50 79" stroke={jing.dark} strokeWidth="1.4" />
          {/* 方孔銅錢：圓外形人人會畫，方孔才是辨識關鍵 /
              Cash coin: the round outline is easy, the square hole is the tell */}
          <circle cx="50" cy="86" r="7" fill={jing.main} />
          <rect x="47.1" y="83.1" width="5.8" height="5.8" fill="#0b1220" opacity="0.85" />
        </g>
      )}
      {traits.jingTier === 'low' && (
        <g>
          {/* 束口 + 塌陷的袋身：沒有露出的銅錢，就是「空」/ Cinched neck and a
              slumped body — no coins showing is what reads as "empty" */}
          <path d="M44 76 L56 76" stroke={jing.dark} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M44 76 Q39 87 42 92 Q50 96 58 92 Q61 87 56 76 Z" fill={jing.main} />
          <path
            d="M44 76 Q50 79.5 56 76"
            stroke={jing.dark}
            strokeWidth="1.2"
            fill="none"
          />
        </g>
      )}
      </g>

      {/* ── 頭部（呼吸時微幅後仰）/ The head, which tilts slightly while breathing ── */}
      <g ref={headRef}
        clipPath={`url(#${AVATAR_CLIP_ID})`}
      >
      {/* 耳（帶耳廓細節，不再是兩個圓）/ Ears, with a little inner fold so they are not
          two bare circles stuck on the sides */}
      {[-1, 1].map((side) => (
        <g key={side < 0 ? 'ear-l' : 'ear-r'}>
          <ellipse
            cx={50 + side * (faceRx - 0.5)}
            cy="46"
            rx="3.4"
            ry="4.6"
            fill={skin}
          />
          <path
            d={`M${50 + side * (faceRx - 0.5)} 43.4 q${side * -1.6} 0.6 ${side * -1.5} 2.8`}
            stroke={skinShade}
            strokeWidth="0.9"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* 頭 / Head. The jaw is drawn as a separate tapered shape over the skull ellipse:
          a single ellipse reads as a ball, and the taper is what turns it into a face. */}
      <ellipse cx="50" cy="43" rx={faceRx} ry="17.5" fill={skin} />
      <path
        d={`M${50 - faceRx + 1.2} 47 Q50 63 ${50 + faceRx - 1.2} 47 Q${50 + faceRx * 0.42} 55.5 50 55.5 Q${50 - faceRx * 0.42} 55.5 ${50 - faceRx + 1.2} 47 Z`}
        fill={skin}
      />

      {/* 顴骨與下顎的體積陰影 / Cheek and jaw volume. Two soft crescents are what make a flat
          disc read as a lit head; they use the skin pool's own darker tones, so no new colour
          is introduced and every face stays within its own palette. */}
      <path
        d={`M${50 - faceRx + 3.5} 44 Q${50 - faceRx + 5} 52 ${50 - faceRx * 0.34} 53.6`}
        stroke={skinShade}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d={`M${50 + faceRx - 3.5} 44 Q${50 + faceRx - 5} 52 ${50 + faceRx * 0.34} 53.6`}
        stroke={skinShade}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* 鼻 / Nose. A cartoon face with no nose has to be read entirely from the eyes, and
          it comes out blank. Two short strokes read as a bridge plus a nostril shadow. */}
      <path
        d="M50 46.4 q-1.5 2.4 -0.3 3.4"
        stroke={skinShade}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* 鬍（先畫，壓在下緣）/ Facial hair, drawn first so it sits under the jaw */}
      {facialHair === 'beard' && (
        <path
          d={`M50 ${62} Q${50 - faceRx - 1} 56 ${50 - faceRx + 3} 43 Q50 ${51} ${50 + faceRx - 3} 43 Q${50 + faceRx + 1} 56 50 ${62} Z`}
          fill={hairColor}
          opacity={grey ? 0.85 : 0.92}
        />
      )}
      {facialHair === 'goatee' && (
        <path d="M45.5 56 Q50 66 54.5 56 Q50 60 45.5 56 Z" fill={hairColor} />
      )}

      {/* 髮 / Hair */}
      {hairStyle === 'short' && (
        <path d="M33 40 Q35 22 50 22 Q65 22 67 40 Q59 31 50 31 Q41 31 33 40 Z" fill={hairColor} />
      )}
      {hairStyle === 'cropped' && (
        <path d="M34 39 Q36 25 50 25 Q64 25 66 39 Q58 33 50 33 Q42 33 34 39 Z" fill={hairColor} />
      )}
      {hairStyle === 'topknot' && (
        <>
          <path d="M33 40 Q35 22 50 22 Q65 22 67 40 Q59 32 50 32 Q41 32 33 40 Z" fill={hairColor} />
          <circle cx="50" cy="19" r="5.5" fill={hairColor} />
          <rect x="47.5" y="22.5" width="5" height="4" fill={hairColor} />
        </>
      )}
      {hairStyle === 'long' && (
        <>
          <path d="M32 42 Q34 21 50 21 Q66 21 68 42 Q59 32 50 32 Q41 32 32 42 Z" fill={hairColor} />
          <path d="M32 40 Q28 56 31 68 L39 66 Q36 54 38 42 Z" fill={hairColor} />
          <path d="M68 40 Q72 56 69 68 L61 66 Q64 54 62 42 Z" fill={hairColor} />
        </>
      )}
      {hairStyle === 'side' && (
        <>
          <path d="M32 41 Q34 21 50 21 Q67 22 68 44 Q56 30 39 33 Q35 37 32 41 Z" fill={hairColor} />
          <path d="M65 28 Q71 34 69 44 Q65 38 62 32 Z" fill={hairColor} />
        </>
      )}
      {hairStyle === 'balding' && (
        <>
          <path d="M33 42 Q32 38 35 35 Q41 31 50 32 Q61 32 66 37 Q67 40 66 43 Q59 36 50 36 Q41 36 33 42 Z" fill={hairColor} />
          <path d="M33 44 Q30 54 32 62 L38 60 Q36 52 38 45 Z" fill={hairColor} />
          <path d="M67 44 Q70 54 68 62 L62 60 Q64 52 62 45 Z" fill={hairColor} />
        </>
      )}

      {/* 眉 / Brows — defectionBase angles them downward. 統一線粗 /
          One shared stroke weight */}
      <path
        d={
          traits.sharpBrow
            ? `M40 ${browY + 2} L46 ${browY - 1} M54 ${browY - 1} L60 ${browY + 2}`
            : `M40 ${browY - 1} L46 ${browY + 1} M54 ${browY + 1} L60 ${browY - 1}`
        }
        stroke={hairColor}
        strokeWidth={LINE}
        strokeLinecap="round"
        fill="none"
      />

      {/* 速度：頭**左側**的動勢線，數量階速度分段 /
          Speed: motion lines to the **left** of the head, one to four by band.
          舊版畫在 x 27-41，正好落在頭的範圍（x 25-75）裡，所以整條被頭擋住，等於沒有畫。
          現在整組移到 x 4-21（頭緣在 25），並且加粗，方向收攏向頭、像一道拖曳的尾。
          Deliberately left of the head rather than behind it: the old x 27-41 sat entirely
          inside the head's own x 25-75 and was therefore fully occluded. The fan converges
          toward the head so the streaks read as motion trails. Pale on purpose — this is a
          rating mark, not another costume piece. */}
      <g aria-hidden="true" stroke={SPEED_TIER_COLOR[speedTier]} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" fill="none">
        {SPEED_LINES[speedTier].map((dy, i) => (
          <path key={i} d={`M${4 + i * 2} ${dy} H21`} />
        ))}
      </g>

      {/* 眼（会眨眼）/ Eyes (they blink) */}
      <g ref={eyeRef}>
      {eyeShape === 'dot' && (
        <>
          <circle cx="43.5" cy={eyeY} r="1.6" fill="#1f2937" />
          <circle cx="56.5" cy={eyeY} r="1.6" fill="#1f2937" />
        </>
      )}
      {eyeShape === 'almond' && (
        <>
          <ellipse cx="43.5" cy={eyeY} rx="2.5" ry="1.4" fill="#1f2937" />
          <ellipse cx="56.5" cy={eyeY} rx="2.5" ry="1.4" fill="#1f2937" />
        </>
      )}
      {eyeShape === 'wide' && (
        <>
          <circle cx="43.5" cy={eyeY} r="2.3" fill="#f8fafc" stroke="#1f2937" strokeWidth="0.9" />
          <circle cx="56.5" cy={eyeY} r="2.3" fill="#f8fafc" stroke="#1f2937" strokeWidth="0.9" />
          <circle cx="43.5" cy={eyeY} r="1" fill="#1f2937" />
          <circle cx="56.5" cy={eyeY} r="1" fill="#1f2937" />
        </>
      )}

      </g>

      {/* 鼻 / Nose */}
      <path
        d="M50 47 L48.8 51.2 L51.2 51.2"
        stroke="#0f172a"
        strokeOpacity="0.28"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* 嘴（會開合）/ Mouth (it opens and closes) */}
      <g ref={mouthRef}>
      {mouthShape === 'flat' && <path d="M46.5 55 L53.5 55" stroke="#7c4a3a" strokeWidth={LINE} strokeLinecap="round" fill="none" />}
      {mouthShape === 'smile' && <path d="M46.5 54 Q50 57.5 53.5 54" stroke="#7c4a3a" strokeWidth={LINE} fill="none" strokeLinecap="round" />}
      {mouthShape === 'firm' && <path d="M46 56 L54 54.6" stroke="#7c4a3a" strokeWidth={LINE + 0.2} strokeLinecap="round" fill="none" />}
      </g>
      {facialHair === 'moustache' && (
        <path d="M44.5 53 Q50 51 55.5 53 Q50 56 44.5 53 Z" fill={hairColor} />
      )}

      {/* ── 武力：頭部唯一的線索 / Martial: the head's only cue ──
          頭盔與額帶都屬於「頭飾」，所以王冠存在時兩者都不畫；疤痕不是頭飾，
          君王照樣帶——受過傷不等於是君王。
          The helmet and headband are both headwear, so neither is drawn when a
          crown is present. A scar is not headwear, so a king keeps it — being
          wounded is not the same as being royalty. */}
      {traits.wuTier === 'high' && !traits.crown && (
        <g>
          {/* 盔頂 + 金色盔帶 + 金色脊 / dome, gold band, gold fin */}
          <path d="M30 34 Q31 11 50 11 Q69 11 70 34 Q62 23 50 23 Q38 23 30 34 Z" fill={TIER_STEEL} />
          <path d="M47 12 L50 2 L53 12 Z" fill={TIER_GOLD} />
          <path d="M31.5 30 Q50 22 68.5 30 L68.5 33 Q50 25 31.5 33 Z" fill={TIER_GOLD} />
          {/* 盔緣壓在眉毛之上：原本的高度會直接橫切過雙眼 /
              The brim sits above the brows — at the old height it cut across the eyes */}
          <path d="M28.5 34 Q50 28 71.5 34 L71.5 37 Q50 31 28.5 37 Z" fill={TIER_STEEL_DARK} />
        </g>
      )}
      {traits.wuTier === 'mid' && !traits.crown && (
        <g>
          {/* 額帶 + 側邊的結與短帶，否則就是一條橫過眼睛的色塊 /
              Band plus a side knot and a short tail; without the knot it is just
              a stripe across the brow, and a horizontal tail reads as an antenna */}
          <path d="M33 32 Q50 28.5 67 32 L67 35.5 Q50 32 33 35.5 Z" fill={wu.main} />
          <circle cx="68" cy="33.6" r="2.8" fill={wu.dark} />
          <path d="M70 35 L75.5 41" stroke={wu.dark} strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      )}
      {traits.wuTier === 'low' && (
        <g>
          {/* 一道舊疤 + 一個短切口，兩邊由 id 決定，不會整隊對稱 /
              One healed scar and a short nick; the side is id-seeded so a unit
              is not symmetric to a fault */}
          <path
            d={traits.scarRight ? 'M55 32 L61 41' : 'M39 32 L45 41'}
            stroke={SCAR}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={traits.scarRight ? 'M56 38 L61 35' : 'M39 38 L44 35'}
            stroke={SCAR}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}

      {/* 王冠：君王 / Crown for the king */}
      {traits.crown && (
        <>
          <path
            d="M33 28 L36 14 L44 23 L50 11 L56 23 L64 14 L67 28 Z"
            fill={TIER_GOLD}
            stroke={TIER_GOLD_DARK}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <rect x="33" y="28" width="34" height="4" rx="1.5" fill={TIER_GOLD} />
          <circle cx="50" cy="9" r="2.4" fill="#ef4444" />
        </>
      )}
      </g>
      </svg>
      {showCues && (
        // pointer-events-none：滑鼠移到提示上不能讓它自己消失，否則 tooltip
        // 會在讀者還沒看完時關閉 /
        // pointer-events-none: moving the cursor onto the panel must not
        // dismiss it, or it closes before it can be read
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[17rem] -translate-x-1/2 rounded-lg border border-gray-700/60 bg-gray-900/95 px-2.5 py-2 shadow-xl shadow-black/50 backdrop-blur-md">
          {cueRows.map((row) => (
            <span
              key={row.stat}
              className="flex items-baseline gap-1.5 text-[13px] leading-relaxed"
            >
              <span className="text-gray-400">{row.statLabel}</span>
              <span className="font-display text-cyan-300">{row.tierLabel}</span>
              <span className="text-gray-100">{row.cueLabel}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}