'use client';

// ============================================================================
// 將領頭像 / Leader Avatar
// ============================================================================
// 每位將領的頭像是**程序化生成**的：從角色 id 播種，畫出一張由多種特徵拼成的
// SVG 半身像。不需要任何圖檔、不需要資料庫欄位、也不需要新的相依套件。
// A leader's head is **procedurally generated**: seeded from the character id and
// assembled from a set of traits into an SVG bust. No art assets, no database
// column, no new dependency.
//
// 同一個 id 永遠得到同一張臉（抽取順序固定），所以頭像不需要存在資料庫裡。
// The same id always yields the same face (the draw order is fixed), so the
// avatar never needs to be stored.
//
// 真實資料會影響外觀，不只是隨機裝飾 / Real game data biases the result, it is
// not decoration:
//   君王 isKing      → 王冠 / crown
//   武力高 wu        → 頭盔 / helmet
//   年長 age ≥ 60    → 髮色轉灰白 / hair greys out
//   野心高 ambition  → 眉壓低、眼神較兇 / brows angle down
//   陣營 factionId   → 衣袍與底色 / robe and backdrop tint
// ============================================================================

import { createRng } from '@/lib/rng';

/** 頭像只需要這些欄位 / The only fields the avatar needs */
export interface AvatarCharacter {
  id: string;
  wu: number;
  /** 統領：高的話戴領巾 / Leadership: a high value earns the sash */
  tong: number;
  /** 經濟：高的話掛算珠 / Economy: a high value earns the abacus beads */
  jing: number;
  ambition: number;
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

/** 髮型：短髮、髮髻、長髮、側分、禿頂、灰白短髮 / Hair: short, topknot, long, side-part, balding, cropped */
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
const HELMET_WU = 25;
const SHARP_BROW_AMBITION = 20;
const SASH_TONG = 25;
const BEADS_JING = 25;

interface LeaderAvatarProps {
  character: AvatarCharacter;
  /** 陣營色（hsl 或 hex）；無陣營時留空 / Faction colour (hsl or hex); omit when unaffiliated */
  factionColor?: string | null;
  /** 邊長（px）/ Edge length in px */
  size?: number;
  className?: string;
}

/** 一張臉所有已解析的特徵 / Every resolved trait that makes up one face */
export interface AvatarTraits {
  skin: string;
  widthMul: number;
  hairStyle: (typeof HAIR_STYLES)[number];
  hairColor: string;
  eyeShape: (typeof EYE_SHAPES)[number];
  mouthShape: (typeof MOUTH_SHAPES)[number];
  facialHair: (typeof FACIAL_HAIR)[number];
  /** 頭盔（武力高且非君王）/ Helmet (high martial ability, and not the king) */
  helmet: boolean;
  /** 君王頭上的王冠 / The king's crown */
  crown: boolean;
  /** 眉壓低（野心高）/ Brows angled down (high ambition) */
  sharpBrow: boolean;
  /** 領巾（統領高，帶兵者）/ Collar sash (high leadership) */
  sash: boolean;
  /** 算珠（經濟高，帳房氣質）/ Abacus beads (high economy) */
  beads: boolean;
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
    // 頭盔壓過髮型，否則頭髮會穿出來 / A helmet overrides the hair so it cannot poke through
    helmet: !character.isKing && character.wu >= HELMET_WU,
    crown: character.isKing,
    sharpBrow: character.ambition >= SHARP_BROW_AMBITION,
    // 統領與經濟各給一個配件，和頭盔／王冠同一套邏輯：數值到了就戴 /
    // Leadership and economy each grant an accessory, on the same
    // threshold logic as the helmet and crown: cross the number, wear the item
    sash: character.tong >= SASH_TONG,
    beads: character.jing >= BEADS_JING,
  };
}

/**
 * 產生將領頭像。
 * Render a leader's procedural head avatar.
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
}: LeaderAvatarProps) {
  const traits = deriveAvatarTraits(character);
  const { skin, hairColor, hairStyle, eyeShape, mouthShape, facialHair } = traits;
  const grey = hairColor === '#9ca3af' || hairColor === '#e5e7eb';

  const robe = factionColor ?? '#475569';
  const faceRx = 15 * traits.widthMul;
  const eyeY = 46;
  const browY = 39;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {/* 底色：陣營色的極淡版本 / Backdrop: a very light wash of the faction colour */}
      <rect x="0" y="0" width="100" height="100" rx="14" fill={robe} opacity={0.18} />
      <rect x="0" y="0" width="100" height="100" rx="14" fill="var(--color-ds-void)" opacity={0.35} />

      {/* 頸 / Neck — 畫在衣袍「下面」，且下緣必須伸進衣袍：衣領頂緣約在 y=76，
          若脖子畫在衣袍之上會變成一根長長的柱子 / Neck — drawn UNDER the robe
          with its bottom reaching past the neckline (top edge ≈ y=76). Drawn on
          top it reads as a long bare column instead. */}
      <rect x="43" y="58" width="14" height="34" rx="4" fill={skin} />

      {/* 衣袍與肩膀 / Robe and shoulders */}
      <path d="M8 100 Q50 52 92 100 Z" fill={robe} />

      {/* 統領高 → 斜披領巾（壓在衣袍上）/ High leadership -> sash across the robe */}
      {traits.sash && (
        <path
          d="M26 100 L74 62 L80 70 L36 100 Z"
          fill="var(--color-ds-void)"
          opacity={0.55}
        />
      )}
      {/* 經濟高 → 頸前算珠 / High economy -> abacus beads at the collar */}
      {traits.beads && (
        <>
          <rect x="34" y="74" width="32" height="3" rx="1.5" fill="var(--color-ds-void)" opacity={0.6} />
          {[38, 44, 50, 56, 62].map((cx) => (
            <circle key={cx} cx={cx} cy="75.5" r="2.1" fill="var(--color-ds-cyan)" opacity={0.9} />
          ))}
        </>
      )}

      {/* 耳 / Ears */}
      <circle cx={50 - faceRx + 1} cy="48" r="3.4" fill={skin} />
      <circle cx={50 + faceRx - 1} cy="48" r="3.4" fill={skin} />

      {/* 頭 / Head */}
      <ellipse cx="50" cy="45" rx={faceRx} ry="19" fill={skin} />

      {/* 鬍（先畫，壓在下緣）/ Facial hair, drawn first so it sits under the jaw */}
      {facialHair === 'beard' && (
        <path
          d={`M50 ${64 - 2} Q${50 - faceRx - 1} 58 ${50 - faceRx + 3} 44 Q50 ${52} ${50 + faceRx - 3} 44 Q${50 + faceRx + 1} 58 50 ${64 - 2} Z`}
          fill={hairColor}
          opacity={grey ? 0.85 : 0.92}
        />
      )}
      {facialHair === 'goatee' && (
        <path d="M45 58 Q50 68 55 58 Q50 62 45 58 Z" fill={hairColor} />
      )}

      {/* 髮 / Hair */}
      {hairStyle === 'short' && (
        <path d="M32 42 Q34 24 50 24 Q66 24 68 42 Q60 32 50 32 Q40 32 32 42 Z" fill={hairColor} />
      )}
      {hairStyle === 'cropped' && (
        <path d="M33 41 Q35 27 50 27 Q65 27 67 41 Q58 35 50 35 Q42 35 33 41 Z" fill={hairColor} />
      )}
      {hairStyle === 'topknot' && (
        <>
          <path d="M32 42 Q34 24 50 24 Q66 24 68 42 Q60 33 50 33 Q40 33 32 42 Z" fill={hairColor} />
          <circle cx="50" cy="20" r="6" fill={hairColor} />
          <rect x="47" y="24" width="6" height="5" fill={hairColor} />
        </>
      )}
      {hairStyle === 'long' && (
        <>
          <path d="M31 44 Q33 23 50 23 Q67 23 69 44 Q60 33 50 33 Q40 33 31 44 Z" fill={hairColor} />
          <path d="M31 42 Q27 58 30 70 L38 68 Q35 56 37 44 Z" fill={hairColor} />
          <path d="M69 42 Q73 58 70 70 L62 68 Q65 56 63 44 Z" fill={hairColor} />
        </>
      )}
      {hairStyle === 'side' && (
        <>
          <path d="M31 43 Q33 23 50 23 Q68 24 69 44 Q56 30 38 34 Q34 38 31 43 Z" fill={hairColor} />
          <path d="M66 30 Q72 36 70 46 Q66 40 63 34 Z" fill={hairColor} />
        </>
      )}
      {hairStyle === 'balding' && (
        <>
          <path d="M32 44 Q31 40 34 37 Q40 33 50 34 Q62 34 67 39 Q68 42 67 45 Q60 38 50 38 Q40 38 32 44 Z" fill={hairColor} />
          <path d="M32 46 Q29 56 31 64 L37 62 Q35 54 37 47 Z" fill={hairColor} />
          <path d="M68 46 Q71 56 69 64 L63 62 Q65 54 63 47 Z" fill={hairColor} />
        </>
      )}

      {/* 眉 / Brows — ambition angles them downward */}
      <path
        d={
traits.sharpBrow
            ? `M40 ${browY + 2} L46 ${browY - 1} M54 ${browY - 1} L60 ${browY + 2}`
            : `M40 ${browY - 1} L46 ${browY + 1} M54 ${browY + 1} L60 ${browY - 1}`
        }
        stroke={hairColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* 眼 / Eyes */}
      {eyeShape === 'dot' && (
        <>
          <circle cx="43" cy={eyeY} r="1.7" fill="#1f2937" />
          <circle cx="57" cy={eyeY} r="1.7" fill="#1f2937" />
        </>
      )}
      {eyeShape === 'almond' && (
        <>
          <ellipse cx="43" cy={eyeY} rx="2.6" ry="1.5" fill="#1f2937" />
          <ellipse cx="57" cy={eyeY} rx="2.6" ry="1.5" fill="#1f2937" />
        </>
      )}
      {eyeShape === 'wide' && (
        <>
          <circle cx="43" cy={eyeY} r="2.4" fill="#f8fafc" stroke="#1f2937" strokeWidth="0.9" />
          <circle cx="57" cy={eyeY} r="2.4" fill="#f8fafc" stroke="#1f2937" strokeWidth="0.9" />
          <circle cx="43" cy={eyeY} r="1" fill="#1f2937" />
          <circle cx="57" cy={eyeY} r="1" fill="#1f2937" />
        </>
      )}

      {/* 鼻 / Nose */}
      <path d="M50 49 L48.6 53.5 L51.4 53.5" stroke="#00000022" strokeWidth="1.1" fill="none" strokeLinecap="round" />

      {/* 嘴 / Mouth */}
      {mouthShape === 'flat' && <path d="M46 58 L54 58" stroke="#7c4a3a" strokeWidth="1.4" strokeLinecap="round" />}
      {mouthShape === 'smile' && <path d="M46 57 Q50 60.5 54 57" stroke="#7c4a3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {mouthShape === 'firm' && <path d="M45.5 59 L54.5 57.6" stroke="#7c4a3a" strokeWidth="1.6" strokeLinecap="round" />}
      {facialHair === 'moustache' && (
        <path d="M44 55.5 Q50 53.5 56 55.5 Q50 58.5 44 55.5 Z" fill={hairColor} />
      )}

      {/* 頭盔：武力極高者 / Helmet for very high martial ability */}
      {traits.helmet && (
        <>
          <path d="M29 44 Q30 18 50 18 Q70 18 71 44 Q62 32 50 32 Q38 32 29 44 Z" fill="#94a3b8" />
          <path d="M29 44 Q50 36 71 44 L71 47 Q50 39 29 47 Z" fill="#64748b" />
          <circle cx="50" cy="20" r="3" fill="#f5b544" />
        </>
      )}

      {/* 王冠：君王 / Crown for the king */}
      {traits.crown && (
        <>
          <path
            d="M33 30 L36 16 L44 25 L50 13 L56 25 L64 16 L67 30 Z"
            fill="#f5b544"
            stroke="#b45309"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <rect x="33" y="30" width="34" height="4" rx="1.5" fill="#f5b544" />
          <circle cx="50" cy="11" r="2.4" fill="#ef4444" />
        </>
      )}
    </svg>
  );
}