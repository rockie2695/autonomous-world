// ============================================================================
// 首頁共用 utility 組合 / Shared Homepage Utility Strings
// ============================================================================
// 遷移成 Tailwind 之後，這些組合在 page.tsx 與 HomeNav.tsx 都會用到。把它們收在
// 這裡，是為了「值只寫一次」這條規則——不是重造 CSS，而是避免同一串 Tailwind
// 類別在兩個檔案裡各寫一遍、將來只改到其中一處。
//
// After the Tailwind migration these combinations are needed by both page.tsx
// and HomeNav.tsx. Collecting them here keeps the "one value, one place" rule
// intact — this is not re-introducing CSS, it just stops the same utility
// string from being copy-pasted into two files and drifting apart.
//
// 全部都是 Tailwind v4 的原生 utility 或任意值 utility，沒有自訂屬性類別。
// Every entry is a native or arbitrary-value Tailwind utility. No bespoke
// component classes remain.
// ============================================================================

/** 導覽用的小標 / the small uppercase kicker above a heading */
export const EYEBROW =
  'font-orbitron text-ds-label font-semibold tracking-[0.24em] text-ds-cyan uppercase';

/** 標題下的漸層細線 / the gradient hairline under a heading */
export const HAIRLINE =
  'h-px w-24 bg-[linear-gradient(90deg,transparent,var(--ds-line-cyan),transparent)]';

/** 主行動鈕的結構（不含配色，配色由呼叫端決定）
    the primary action's structure; colour stays with the call site */
export const CTA_BASE =
  'group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-ds-control px-6 ' +
  'font-orbitron text-[0.9375rem] font-bold tracking-[0.06em] no-underline ' +
  'transition-[box-shadow,transform] duration-[260ms] ease-ds hover:-translate-y-px';

/** 主行動鈕的配色：亮底深字，深字在亮漸層上才過得了 4.5:1
    the primary action's colour: dark text on a bright gradient is the only
    combination that clears 4.5:1 here — white would fail */
export const CTA_PRIMARY =
  'bg-gradient-to-r from-cyan-500 to-blue-600 text-[#020617] shadow-[0_0_30px_rgba(34,211,238,0.3)] ' +
  'hover:shadow-[0_0_44px_rgba(34,211,238,0.5)]';

/** 次要行動鈕 / the secondary action */
export const CTA_SECONDARY =
  'inline-flex min-h-11 items-center gap-2 rounded-ds-control border border-cyan-500/30 ' +
  'bg-cyan-500/5 px-6 text-[0.9375rem] font-medium text-cyan-200 no-underline ' +
  'transition-colors duration-200 hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-100';

/** 玻璃面板 / the glass panel surface */
export const PANEL = 'relative rounded-ds-panel border border-ds-line bg-ds-panel backdrop-blur-[14px]';

/** 載入骨架（永不只顯示裸 spinner）/ Loading skeleton, never a bare spinner
    與遊戲頁的 GM_SKEL 同一組數值，只是住在首頁的 token 表裡 /
    Same values as the game page's GM_SKEL, just declared in the home token sheet */
export const SKELETON =
  'relative overflow-hidden rounded-lg bg-[rgba(148,163,184,0.08)] ' +
  "after:absolute after:inset-0 after:-translate-x-full after:content-[''] " +
  'after:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.14),transparent)] ' +
  'after:animate-ds-shimmer';
