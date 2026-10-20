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
 * 裁掉。位置由 `placeTooltip`（`src/lib/tooltipPlacement.ts`）統一決定：
 * **預設在錨點下方**（光標錨點的左上角貼近光標）、只有下方真的放不下才翻到上方、
 * 左右夾在視窗內——光標在屏幕上半部時**永遠在下方**。
 *
 * Both hosts scroll their body with `overflow-auto` (the modal shell is even
 * `overflow-hidden`), so the panel **must** be `position: fixed` + portalled to
 * `document.body` — absolute positioning gets clipped. Placement is decided by
 * `placeTooltip` (`src/lib/tooltipPlacement.ts`): **below the anchor by default**
 * (a cursor anchor hugs the cursor with its top-left), flipping above only when
 * below genuinely does not fit, clamped inside the viewport — a cursor in the top
 * half is **always** served from below.
 *
 * 觸摸設備：底部卡片 / Touch devices: a bottom sheet
 * ---------------------------------------------------------------------------
 * 觸摸設備沒有 hover——點一下抬起手就觸發 mouseleave，浮動提示根本讀不到。
 * `(pointer: coarse)` 時改走**底部卡片**：點擊開啟、✕／遮罩／Esc 關閉，內容
 * 同一份。滑鼠設備維持原 hover 提示。
 * Touch has no hover — a tap lifts the finger, mouseleave fires, and a floating
 * tooltip is gone before it can be read. On `(pointer: coarse)` the tip becomes a
 * **bottom sheet**: tap to open, ✕ / backdrop / Esc to close, same content. Mouse
 * devices keep the hover tooltip unchanged.
 *
 * 捲動即收起（僅浮動提示） / Dismissed by scrolling (floating panel only)
 * ---------------------------------------------------------------------------
 * 浮動面板是 fixed，內文一捲動它就停在舊位置——開啟時捕獲任何捲動並收起。
 * 底部卡片有遮罩擋住底下內容，捲動不會讓它失位，不套用此規則。
 * The floating panel is fixed, so one scroll of the host would strand it at the
 * old position — while open, any scroll (captured, so nested containers count)
 * dismisses it. The sheet sits over a backdrop and cannot be stranded, so the
 * rule does not apply there.
 *
 * 鍵盤 / Keyboard
 * ---------------------------------------------------------------------------
 * 觸發元素帶 `tabIndex={0}`，`focus` 也會開提示、`blur` 收起——不能只靠 hover。
 * The trigger carries `tabIndex={0}`; `focus` opens the tip and `blur` closes
 * it — hover alone is not enough.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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
import { placeTooltip } from '@/lib/tooltipPlacement';
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

/** 面板與錨點之間的間距 / Gap between the panel and the anchor */
const TIP_GAP = 8;
/** 面板寬度估計（max-w 17rem = 272px）/ Panel width estimate (max-w 17rem = 272px) */
const TIP_ESTIMATED_WIDTH = 272;
/** 最多三行的高度保守估計，供 placeTooltip 決定翻不翻 / A conservative height estimate for ≤3 lines, feeding placeTooltip's flip */
const TIP_ESTIMATED_HEIGHT = 96;

const fmtMult = (m: number): string => `×${m.toFixed(2)}`;
const fmtPct = (p: number): string => `${(p * 100).toFixed(1)}%`;

/**
 * 觸摸設備偵測：`(pointer: coarse)`。用 `useSyncExternalStore` 訂閱，與
 * page.tsx 的 `NARROW_MQ` 同一個形狀——伺服器端與首次渲染回 false，避免水合
 * 不一致（桌面為主）。
 * Touch detection: `(pointer: coarse)`, subscribed with `useSyncExternalStore` in
 * the same shape as page.tsx's `NARROW_MQ` — the server and the first render
 * report false to avoid a hydration mismatch (desktop is the default).
 */
export function useCoarsePointer(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia('(pointer: coarse)');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  const get = useCallback(() => window.matchMedia('(pointer: coarse)').matches, []);
  return useSyncExternalStore(subscribe, get, () => false);
}

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
        t('character.tipRuleTong', { base: CONFIG.CHAR_BUY_TROOP_BASE }),
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

/** 提示的開啟狀態。x/y 只在浮動面板（滑鼠）有值；底部卡片只要內容 /
 * The open tip's state. x/y exist only for the floating panel (mouse); the sheet needs content only */
export interface TipState {
  lines: readonly string[];
  /** 選擇性標題（例：勢力名）。顏色是執行期資料，走 inline style（專案唯一的例外）/
   * Optional title (e.g. a faction name). The colour is runtime data, so inline style —
   * the project's one documented exception */
  title?: string;
  titleColor?: string;
  /** 面板**左上角**的視窗座標（placeTooltip 已夾邊）/ The panel's **top-left** in viewport coordinates (already clamped by placeTooltip) */
  x?: number;
  y?: number;
}

/** 提示內容（底部卡片只需要內容，不需要座標）/ Tip content (the sheet needs no coordinates) */
interface TipContent {
  lines: readonly string[];
  title?: string;
  titleColor?: string;
}

/**
 * 提示內容本體：底部卡片與浮動面板**共用同一份**行渲染，兩種形態才不會漂移。
 * The tip's body: the sheet and the floating panel share **one** line renderer so
 * the two forms cannot drift.
 */
function TipBody({ tip }: { tip: TipContent }) {
  return (
    <>
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
    </>
  );
}

/**
 * `useAbilityTip`：回傳觸發元素的 props 與要渲染的面板。掛在**擁有提示的元件**
 * 裡（`LeaderDetail`、統計 tab 的雷達面板），面板 portal 到 `document.body`。
 * 觸摸設備上改開**底部卡片**（見上方說明）。
 *
 * `useAbilityTip`: returns trigger props and the panel to render. Mounted in the
 * component that owns the tips (`LeaderDetail`, the stats radar panel); the
 * panel portals to `document.body`. On touch devices it opens a **bottom sheet**
 * instead (see above).
 */
export function useAbilityTip() {
  const coarse = useCoarsePointer();
  // 座標只對**浮動面板**有意義；底部卡片只需要內容 /
  // Coordinates only matter for the floating panel; the sheet needs content only
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
      const content: TipContent = {
        lines,
        title: opts?.title,
        titleColor: opts?.titleColor,
      };
      if (coarse) {
        setTip(content);
        return;
      }
      const rect = el.getBoundingClientRect();
      const p = placeTooltip({
        ax: rect.left + rect.width / 2,
        ay: rect.bottom,
        panelW: TIP_ESTIMATED_WIDTH,
        panelH: TIP_ESTIMATED_HEIGHT,
        boxW: window.innerWidth,
        boxH: window.innerHeight,
        gap: TIP_GAP,
        anchor: 'element',
      });
      setTip({ ...content, x: p.x, y: p.y });
    },
    [coarse]
  );

  const hide = useCallback(() => setTip(null), []);

  /**
   * 以**游標座標**開啟提示：雷達圖的 hover 是「圖上哪一格」，定位跟著游標走，
   * 面板**左上角貼近游標**、預設在下方（屏幕上半部不翻上去）/
   * Open the tip at **cursor coordinates**: a radar's hover is "which spoke am I
   * on", so the panel follows the pointer — its **top-left hugs the cursor**,
   * below by default (never flipped up in the top half).
   */
  const showAt = useCallback(
    (
      lines: readonly string[],
      clientX: number,
      clientY: number,
      opts?: { title?: string; titleColor?: string }
    ) => {
      const content: TipContent = {
        lines,
        title: opts?.title,
        titleColor: opts?.titleColor,
      };
      if (coarse) {
        setTip(content);
        return;
      }
      const p = placeTooltip({
        ax: clientX,
        ay: clientY,
        panelW: TIP_ESTIMATED_WIDTH,
        panelH: TIP_ESTIMATED_HEIGHT,
        boxW: window.innerWidth,
        boxH: window.innerHeight,
        gap: TIP_GAP,
        anchor: 'cursor',
      });
      setTip({ ...content, x: p.x, y: p.y });
    },
    [coarse]
  );

  /**
   * 觸發元素的 props：滑鼠 = hover + focus 開；觸摸 = **click** 開（hover 在
   * 觸摸上不存在，點擊抬起即 mouseleave，浮動面板讀不到）。
   * Trigger props: mouse = hover + focus opens; touch = **click** opens (hover
   * does not exist there — the finger lifts, mouseleave fires, a floating panel
   * is unreadable).
   */
  const triggerProps = useCallback(
    (
      lines: readonly string[],
      opts?: { title?: string; titleColor?: string }
    ) =>
      coarse
        ? {
            onClick: (e: ReactMouseEvent<HTMLElement>) => {
              e.stopPropagation();
              show(lines, e.currentTarget, opts);
            },
          }
        : {
            tabIndex: 0 as const,
            onMouseEnter: (e: ReactMouseEvent<HTMLElement>) =>
              show(lines, e.currentTarget, opts),
            onMouseLeave: hide,
            onFocus: (e: ReactFocusEvent<HTMLElement>) =>
              show(lines, e.currentTarget, opts),
            onBlur: hide,
          },
    [coarse, show, hide]
  );

  // 浮動面板開啟時捕獲**任何**捲動（capture 連內層捲動容器都算得到）並收起，
  // 否則 fixed 面板會停在舊位置。底部卡片有遮罩，不套用 /
  // While the floating panel is open, capture **any** scroll (capture reaches
  // nested scroll containers too) and dismiss — otherwise the fixed panel strands
  // at its old position. The sheet sits over a backdrop and is exempt.
  const open = tip !== null;
  useEffect(() => {
    if (!open || coarse) return;
    const onScroll = () => setTip(null);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [open, coarse]);

  // 底部卡片：Esc 關閉 / Sheet: Esc closes
  useEffect(() => {
    if (!open || !coarse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, coarse]);

  const panel =
    tip === null
      ? null
      : coarse
        ? createPortal(
            <>
              {/* 遮罩：點外面關閉 / Backdrop: tap outside to close */}
              <div
                className="fixed inset-0 z-[109] bg-black/40"
                onClick={hide}
                aria-hidden
              />
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-x-0 bottom-0 z-[110] max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-gray-700/60 bg-gray-900/95 px-4 pb-6 pt-3 shadow-2xl shadow-black/60 backdrop-blur-md"
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <span className="font-display text-xs tracking-wider text-cyan-300">
                    {t('character.abilityTipTitle')}
                  </span>
                  <button
                    type="button"
                    onClick={hide}
                    aria-label="關閉"
                    className="text-gray-400 hover:text-gray-200"
                  >
                    ✕
                  </button>
                </div>
                <TipBody tip={tip} />
              </div>
            </>,
            document.body
          )
        : createPortal(
            <div
              role="tooltip"
              className={GM_TIP}
              style={{ left: tip.x ?? 0, top: tip.y ?? 0 }}
            >
              <TipBody tip={tip} />
            </div>,
            document.body
          );

  return { triggerProps, panel, show, showAt, hide, coarse };
}
