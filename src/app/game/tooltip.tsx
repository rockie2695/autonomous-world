'use client';

/**
 * 共用的屬性提示 / The shared ability tooltip
 * ============================================================================
 * 一個面板、兩個宿主：將領詳情彈窗「戰力」的五列，與統計 tab「將領屬性」放大
 * 雷達的軸標籤與逐勢力數值。共用**同一個**元件與**同一份**內容產生器
 * {@link abilityTipLines}，兩處才不會各寫一份然後漂移。
 *
 * One panel, two hosts: the five ability rows on the leader popup's data tab,
 * and the axis labels plus per-faction values of the stats tab's enlarged
 * 「將領屬性」radar. Sharing **one** component and **one** content builder
 * {@link abilityTipLines} is what keeps the two from drifting apart.
 *
 * 定位 / Positioning
 * ---------------------------------------------------------------------------
 * 兩個宿主的內文都是 `overflow-auto` 捲動容器（彈窗外框還是 `overflow-hidden`），
 * 所以面板**必須** `position: fixed` + portal 到 `document.body`——絕對定位會被
 * 裁掉，這與 `CharacterRadarHover` 必須 portal 是同一個理由。位置在**事件處理器**
 * 裡量 rect（render 不碰 `window`），下方空間不足就翻到上方，左右夾在視窗內。
 *
 * Both hosts scroll their body with `overflow-auto` (the modal shell is even
 * `overflow-hidden`), so the panel **must** be `position: fixed` + portalled to
 * `document.body` — absolute positioning gets clipped, the same reason
 * `CharacterRadarHover` portals. The position is measured in the **event
 * handler** (render never touches `window`), the panel flips above when there
 * is no room below, and the horizontal centre is clamped to the viewport.
 *
 * 捲動即收起 / Dismissed by scrolling
 * ---------------------------------------------------------------------------
 * 面板是 fixed，內文一捲動它就停在舊位置——所以開啟時捕獲任何捲動並收起。
 * The panel is fixed, so one scroll of the host would strand it at the old
 * position — while open, any scroll (captured, so nested containers count)
 * dismisses it.
 *
 * 鍵盤 / Keyboard
 * ---------------------------------------------------------------------------
 * 觸發元素帶 `tabIndex={0}`，`focus` 也會開提示、`blur` 收起——不能只靠 hover。
 * The trigger carries `tabIndex={0}`; `focus` opens the tip and `blur` closes
 * it — hover alone is not enough.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/lib/i18n';
import { CONFIG } from '@/lib/gameConfig';
import {
  attackMultiplier,
  defectionChance,
  defenceMultiplier,
  jingIncomeMultiplier,
  tongPurchaseMultiplier,
} from '@/lib/abilityEffects';
import { GM_TIP } from './styles';

/** 有提示內容的軸 / The axes that carry tip content */
export type AbilityTipKey =
  | 'wu'
  | 'ti'
  | 'tong'
  | 'jing'
  | 'speed'
  | 'defectionBase'
  | 'age';

/** 面板與觸發元素之間的間距 / Gap between the panel and the trigger */
const TIP_GAP = 8;
/** 最多三行的保守高度估計，用來決定翻不翻到上方 / A conservative height estimate for ≤3 lines, deciding the flip */
const TIP_ESTIMATED_HEIGHT = 96;
/** 面板半寬的保守值（max-w 17rem = 272px），左右夾邊用 / A conservative half-width (max-w 17rem = 272px) for the horizontal clamp */
const TIP_HALF_WIDTH = 140;

const fmtMult = (m: number): string => `×${m.toFixed(2)}`;
const fmtPct = (p: number): string => `${(p * 100).toFixed(1)}%`;

/**
 * 一條軸的提示行：第 1 行是規則，第 2 行是模擬實際算出的數字（年齡沒有）。
 * 倍率對屬性是**線性**的，所以雷達傳入「勢力平均」時，算出的倍率恰好等於
 * 平均倍率——是精確值，不是近似（`abilityEffects.test.ts` 釘住這條）。
 *
 * The tip lines for one axis: line 1 is the rule, line 2 the number the
 * simulation actually derives (age has none). The multipliers are **linear** in
 * the ability, so a faction mean fed in here yields exactly the mean multiplier
 * — a precise value, not an approximation (`abilityEffects.test.ts` pins this).
 */
export function abilityTipLines(key: AbilityTipKey, value: number): readonly string[] {
  switch (key) {
    case 'wu':
      return [
        t('character.tipRuleWu'),
        t('character.tipAttack', { value: fmtMult(attackMultiplier(value)) }),
      ];
    case 'ti':
      return [
        t('character.tipRuleTi'),
        t('character.tipDefence', { value: fmtMult(defenceMultiplier(value)) }),
      ];
    case 'tong':
      return [
        t('character.tipRuleTong', { base: CONFIG.CHAR_BUY_TROOP_MAX }),
        t('character.tipBuyTroops', { value: fmtMult(tongPurchaseMultiplier(value)) }),
      ];
    case 'jing':
      return [
        t('character.tipRuleJing'),
        t('character.tipIncome', { value: fmtMult(jingIncomeMultiplier(value)) }),
      ];
    case 'speed':
      // 逃脫機率取決於**與對手的速度差**，沒有單一數字；如實列規則的兩個常數 /
      // The escape chance depends on the **speed difference to the opponent**, so
      // there is no single number; the rule's two constants are stated as they are
      return [
        t('character.tipRuleSpeed'),
        t('character.tipEscape', {
          base: fmtPct(CONFIG.SPEED_ESCAPE_BASE),
          per: fmtPct(CONFIG.SPEED_ESCAPE_PER_DIFF),
        }),
      ];
    case 'defectionBase':
      return [
        t('character.tipRuleDefection'),
        t('character.tipDefectionRate', { value: fmtPct(defectionChance(value)) }),
      ];
    case 'age':
      // 年齡不進任何戰鬥算式——硬湊一個數字會是謊言，只有規則行 /
      // Age feeds no combat arithmetic — inventing a number would be a lie, so rule only
      return [t('character.tipRuleAge')];
  }
}

/** 提示的開啟狀態 / The open tip's state */
export interface TipState {
  lines: readonly string[];
  /** 選擇性標題（例：勢力名）。顏色是執行期資料，走 inline style（專案唯一的例外）/
   * Optional title (e.g. a faction name). The colour is runtime data, so inline style —
   * the project's one documented exception */
  title?: string;
  titleColor?: string;
  x: number;
  y: number;
  above: boolean;
}

/**
 * `useAbilityTip`：回傳觸發元素的 props 與要渲染的面板。掛在**擁有提示的元件**
 * 裡（`LeaderDetail`、統計 tab 的雷達面板），面板 portal 到 `document.body`。
 *
 * `useAbilityTip`: returns trigger props and the panel to render. Mounted in the
 * component that owns the tips (`LeaderDetail`, the stats radar panel); the
 * panel portals to `document.body`.
 */
export function useAbilityTip() {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback(
    (
      lines: readonly string[],
      el: Element,
      opts?: { title?: string; titleColor?: string }
    ) => {
      // 位置在**處理器**裡量，render 不碰 `window`（與 `CharacterRadarHover` 同一條規則）/
      // Measured in the **handler**; render never touches `window` (the same rule as
      // `CharacterRadarHover`)
      const rect = el.getBoundingClientRect();
      const above =
        window.innerHeight - rect.bottom < TIP_ESTIMATED_HEIGHT &&
        rect.top > TIP_ESTIMATED_HEIGHT;
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, TIP_HALF_WIDTH),
        window.innerWidth - TIP_HALF_WIDTH
      );
      setTip({
        lines,
        title: opts?.title,
        titleColor: opts?.titleColor,
        x,
        y: above ? rect.top - TIP_GAP : rect.bottom + TIP_GAP,
        above,
      });
    },
    []
  );

  const hide = useCallback(() => setTip(null), []);

  /**
   * 以**游標座標**開啟提示：雷達圖的 hover 是「圖上哪一格」，定位跟著游標走，
   * 而不是以整張 SVG 為中心。翻轉與夾邊規則與 `show` 相同 /
   * Open the tip at **cursor coordinates**: a radar's hover is "which spoke am I
   * on", so the panel follows the pointer rather than centring on the whole SVG.
   * The flip and clamp rules match `show`.
   */
  const showAt = useCallback(
    (
      lines: readonly string[],
      clientX: number,
      clientY: number,
      opts?: { title?: string; titleColor?: string }
    ) => {
      const above =
        window.innerHeight - clientY < TIP_ESTIMATED_HEIGHT &&
        clientY > TIP_ESTIMATED_HEIGHT;
      const x = Math.min(Math.max(clientX, TIP_HALF_WIDTH), window.innerWidth - TIP_HALF_WIDTH);
      setTip({
        lines,
        title: opts?.title,
        titleColor: opts?.titleColor,
        x,
        y: above ? clientY - TIP_GAP : clientY + TIP_GAP,
        above,
      });
    },
    []
  );

  /**
   * 觸發元素的 props：hover 與 focus 都開。`lines` 每次渲染都是同一個陣列實例
   * （呼叫端用常量或 useMemo），這裡不做深度比較 /
   * Trigger props: both hover and focus open the tip. `lines` is expected to be a
   * stable array per render (the caller passes literals or memoised values); no
   * deep comparison is done here.
   */
  const triggerProps = useCallback(
    (
      lines: readonly string[],
      opts?: { title?: string; titleColor?: string }
    ) => ({
      tabIndex: 0 as const,
      onMouseEnter: (e: ReactMouseEvent<HTMLElement>) =>
        show(lines, e.currentTarget, opts),
      onMouseLeave: hide,
      onFocus: (e: ReactFocusEvent<HTMLElement>) => show(lines, e.currentTarget, opts),
      onBlur: hide,
    }),
    [show, hide]
  );

  // 開啟時捕獲**任何**捲動（capture 連內層捲動容器都算得到）並收起，否則 fixed
  // 面板會停在舊位置，與內容對不上 /
  // While open, capture **any** scroll (capture reaches nested scroll containers
  // too) and dismiss — otherwise the fixed panel strands at its old position,
  // no longer matching the content
  const open = tip !== null;
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setTip(null);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [open]);

  const panel =
    tip !== null ? (
      createPortal(
        <div
          role="tooltip"
          className={GM_TIP}
          style={{
            left: tip.x,
            top: tip.y,
            transform: tip.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
        >
          {/* 標題（勢力名）先行，之後才是規則／數字／原因行。勢力色是執行期資料，
              走 inline style——專案唯一允許 inline style 的地方 /
              The title (faction name) comes first, then the rule / number / reason
              lines. Faction colour is runtime data on an inline style — the project's
              one documented exception */}
          {tip.title !== undefined && (
            <p
              className="text-[13px] font-medium leading-relaxed"
              style={tip.titleColor ? { color: tip.titleColor } : undefined}
            >
              {tip.title}
            </p>
          )}
          {/* 行樣式按位置：第 1 行規則（灰）、第 2 行數字（顯示字體 + 青）、其後
              是「關係改動」的原因行（琥珀）。三種行色讓規則與數字一眼分開 /
              Line style by position: line 1 the rule (grey), line 2 the derived
              number (display face + cyan), the rest the "relations moved it"
              reason (amber). Three tones separate rule from number at a glance */}
          {tip.lines.map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? 'text-[13px] leading-relaxed text-gray-400'
                  : i === 1
                    ? 'font-display text-[13px] leading-relaxed text-cyan-300'
                    : 'text-[13px] leading-relaxed text-amber-300'
              }
            >
              {line}
            </p>
          ))}
        </div>,
        document.body
      )
    ) : null;

  return { triggerProps, panel, show, showAt, hide };
}
