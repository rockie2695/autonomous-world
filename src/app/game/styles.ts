// ============================================================================
// 遊戲頁面共用的介面樣式 / Shared game-page surface styles
// ============================================================================
// 這些字串過去放在 page.tsx 頂端，但事件日誌、統計圖表與將領詳情-popup 都會用到
// 同一組面板／按鈕／骨架畫面。集中成一個模組才符合專案規則：同一個介面字串
// 不該在兩個檔案各寫一份，否則改樣式時很容易漏掉其中一處。
//
// These utility strings used to live at the top of page.tsx, but the event log,
// the stats charts and the leader detail popup all reuse the same
// panel / button / skeleton surfaces. One shared module keeps a single surface
// string from being duplicated across files, which is exactly what the project
// styling rule guards against.
// ============================================================================
/** 固定全視窗背景 / the fixed full-viewport backdrop */
export const GM_BACKDROP = 'pointer-events-none fixed inset-0 z-0 overflow-hidden';
export const GM_PHOTO = 'size-full object-cover opacity-[0.17] [filter:saturate(1.1)_contrast(1.04)]';
export const GM_VEIL =
  'absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(2,6,23,0.3)_0%,rgba(2,6,23,0.78)_55%,rgba(2,6,23,0.96)_100%),linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.7))]';

/** 世界觀測帶 / the telemetry band */
/** 觀測帶本體 / telemetry band, standalone row */
export const GM_STRIP =
  'relative z-10 overflow-hidden border-b border-[rgba(34,211,238,0.22)] ' +
  'bg-[linear-gradient(180deg,rgba(2,6,23,0.5),rgba(2,6,23,0.84))] backdrop-blur-[8px]';
/** 觀測帶併入頂部列：長成 flex 子項、拿掉自己的下邊線與左右留白，
 *  讓標頭與世界概況共用一行，地圖多出一整列的高度 /
 *  Telemetry band merged into the header row: grows as a flex child and drops
 *  its own bottom border and side padding, so the header and 世界概況 share one
 *  row and the map gets that height back */
export const GM_STRIP_INLINE =
  'relative overflow-hidden border-l border-[rgba(34,211,238,0.22)] ' +
  'bg-[linear-gradient(180deg,rgba(2,6,23,0.5),rgba(2,6,23,0.84))] backdrop-blur-[8px]';
export const GM_STRIP_PHOTO = 'size-full object-cover opacity-[0.55]';
export const GM_STRIP_VEIL =
  'absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.97)_0%,rgba(2,6,23,0.86)_45%,rgba(2,6,23,0.62)_100%),linear-gradient(180deg,rgba(2,6,23,0.2),rgba(2,6,23,0.68))]';

/** 觀測帶的 KPI / the band's readouts */
export const GM_KPI =
  'flex-none min-w-[6.5rem] border-l border-[rgba(34,211,238,0.22)] py-[0.15rem] pl-[1.1rem]';
export const GM_KPI_FIRST = 'flex-none min-w-[6.5rem] border-l-0 py-[0.15rem] pl-0';
export const GM_KPI_LABEL =
  'font-orbitron text-xs font-semibold tracking-[0.14em] text-[rgba(165,243,252,0.92)] uppercase';
export const GM_KPI_VALUE =
  'font-orbitron text-[clamp(1.3rem,2vw,1.65rem)] leading-[1.25] font-bold text-slate-50 ' +
  'tabular-nums [text-shadow:0_0_18px_rgba(34,211,238,0.35)]';

/** 面板與側軌 / panels and rails */
export const GM_PANEL =
  'relative rounded-ds-panel border border-ds-line ' +
  'bg-[linear-gradient(180deg,rgba(15,23,42,0.74),rgba(2,6,23,0.74))] backdrop-blur-[12px] ' +
  // 頂緣那條漸層細線：原本是 .ds-gm-panel::before
  // The top hairline, formerly .ds-gm-panel::before
  "before:absolute before:-top-px before:left-4 before:right-4 before:h-px before:pointer-events-none " +
  "before:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.55),transparent)] before:content-['']";
export const GM_TITLE =
  'font-orbitron text-sm font-semibold tracking-[0.14em] text-slate-400 uppercase';
export const GM_RAIL = 'bg-[linear-gradient(180deg,rgba(2,6,23,0.74),rgba(2,6,23,0.56))] backdrop-blur-[10px]';

/** HUD 按鈕 / HUD buttons。三條各自完整，沒有「基底 + 覆寫」的疊加關係，
 *  因為疊加在 utilities 層已經不可靠。三態（停用）用 disabled: 變體。
 * Three complete buttons, never base-plus-override: layering is unreliable in
 * a single layer. The disabled state rides the disabled: variant. */
export const GM_BTN =
  'inline-flex cursor-pointer items-center justify-center gap-[0.4rem] rounded-lg ' +
  'border border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.72)] text-slate-400 ' +
  'transition-[color,background-color,border-color] duration-200 ease-ds ' +
  'hover:border-[rgba(34,211,238,0.45)] hover:bg-[rgba(34,211,238,0.1)] hover:text-slate-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11 pointer-coarse:min-w-11';
export const GM_BTN_ACCENT =
  'inline-flex cursor-pointer items-center justify-center gap-[0.4rem] rounded-lg ' +
  'border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.08)] text-cyan-300 ' +
  'transition-[color,background-color,border-color] duration-200 ease-ds ' +
  'hover:border-[rgba(34,211,238,0.6)] hover:bg-[rgba(34,211,238,0.16)] hover:text-cyan-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11 pointer-coarse:min-w-11';
export const GM_BTN_DANGER =
  'inline-flex cursor-pointer items-center justify-center gap-[0.4rem] rounded-lg ' +
  'border border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.72)] text-[rgba(248,113,113,0.85)] ' +
  'transition-[color,background-color,border-color] duration-200 ease-ds ' +
  'hover:border-[rgba(248,113,113,0.45)] hover:bg-[rgba(248,113,113,0.1)] hover:text-red-300 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11 pointer-coarse:min-w-11';

/** LIVE 徽章 / the LIVE badge */
export const GM_BADGE =
  'rounded-full border border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.07)] py-[0.15rem] px-2';

/** 地圖 HUD 外框與角標 / the map HUD frame and its corner brackets */
export const GM_FRAME = 'pointer-events-none absolute inset-[10px] z-[5]';
export const GM_VIGNETTE =
  'pointer-events-none absolute inset-0 z-[4] bg-[radial-gradient(ellipse_at_50%_50%,transparent_58%,rgba(2,6,23,0.55)_100%)]';
/** 地圖 HUD 面板：圖例靠左、相機控制靠右，都貼齊地圖底部 /
 *  Map HUD panels: legend bottom-left, camera controls bottom-right */
export const GM_HUD_PANEL =
  'absolute bottom-4 z-[6] flex items-center gap-2 rounded-xl ' +
  'border border-[rgba(34,211,238,0.28)] bg-[rgba(2,6,23,0.74)] ' +
  'px-3 py-[0.55rem] backdrop-blur-[14px]';
/** 圖例：靠左；限寬並可橫向捲動，窄視窗下不會撞到右側控制列 /
 *  Legend: left, width-capped and horizontally scrollable so it cannot collide
 *  with the right-hand controls on narrow viewports */
export const GM_HUD_LEGEND = `${GM_HUD_PANEL} left-4 max-w-[min(55%,24rem)]`;
// 相機控制要避開右側面板（內容 19rem + 頁籤 rail 與間距，實測約 405px），
// 否則 reset/縮小/滑桿會被面板蓋住。面板展開時往左挪、收合時貼齊右緣。
// 窄視窗下 26rem 會把控制列推出畫面，所以只在 lg 以上套用，窄版維持右緣。
// Camera controls must clear the side panel (19rem of content plus the tab rail
// and gutter — measured at ~405px) or reset/zoom-out/the slider end up
// underneath it. Shift left while the panel is open, back to the edge when closed.
// A fixed 26rem offset pushes the controls off-screen on narrow viewports, so it
// only applies from lg up; narrow keeps them on the edge.
export const GM_HUD_CONTROLS_OPEN = `${GM_HUD_PANEL} right-4 lg:right-[26rem]`;
export const GM_HUD_CONTROLS_CLOSED = `${GM_HUD_PANEL} right-4`;
/**
 * 選擇回合：疊在地圖左緣，換取地圖寬度。圖例在左下、相機控制在右下，所以左上是
 * 唯一空著的位置；`left-12 top-12` 讓開 26px 的框角裝飾。
 * The round timeline is overlaid on the map's left edge to buy the map some width.
 * The legend sits bottom-left and the camera controls bottom-right, so the top-left
 * corner is the only free space; `left-12 top-12` clears the 26px corner brackets.
 */
export const GM_TIMELINE = 'absolute left-12 top-12 z-[7] hidden w-60 md:block';
export const GM_CORNER_BASE = 'absolute size-[26px] border-[rgba(34,211,238,0.55)] border-solid';
export const GM_CORNER_TL = `${GM_CORNER_BASE} top-0 left-0 border-w-[1px_0_0_1px]`;
export const GM_CORNER_TR = `${GM_CORNER_BASE} top-0 right-0 border-w-[1px_1px_0_0]`;
export const GM_CORNER_BL = `${GM_CORNER_BASE} bottom-0 left-0 border-w-[0_0_1px_1px]`;
export const GM_CORNER_BR = `${GM_CORNER_BASE} bottom-0 right-0 border-w-[0_1px_1px_0]`;

/** 圖例 / the legend rail */
export const GM_LEGEND = 'flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const GM_LEGEND_ITEM = 'flex flex-none items-center gap-[0.4rem]';

/** 統計格 / stat cells */
export const GM_STAT =
  'relative rounded-[10px] border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,42,0.6)] ' +
  'px-2 py-[0.6rem] text-center ' +
  "before:absolute before:top-0 before:left-[18%] before:right-[18%] before:h-px " +
  "before:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.55),transparent)] before:content-['']";
export const GM_STAT_VALUE = 'font-orbitron text-xl leading-[1.3] font-bold text-slate-50 tabular-nums';
export const GM_STAT_LABEL = 'mt-[0.15rem] text-xs tracking-[0.08em] text-slate-400 uppercase';

/** 對話框 / the detail modal */
export const GM_MODAL =
  'rounded-ds-panel border border-[rgba(34,211,238,0.28)] ' +
  'bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.97))] backdrop-blur-[16px]';
export const GM_MODAL_PHOTO = 'absolute inset-0 size-full object-cover opacity-[0.45]';
export const GM_MODAL_VEIL =
  'absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.2)_0%,rgba(2,6,23,0.9)_76%,rgba(2,6,23,0.97)_100%)]';

/** 跳動的 LIVE 指示燈 / the pulsing LIVE dot。動畫時長沿用原本的 1.9s，
 *  不是 Tailwind animate-ping 預設的 1s。
 * The pulsing dot keeps the original 1.9s cycle, not Tailwind's animate-ping
 * default of 1s. */
export const GM_LIVE =
  'relative inline-block size-[7px] rounded-full bg-ds-cyan shadow-[0_0_10px_rgba(34,211,238,0.9)] ' +
  "after:absolute after:inset-0 after:rounded-full after:bg-ds-cyan after:content-[''] " +
  'after:[animation:ds-ping_1.9s_cubic-bezier(0,0,0.2,1)_infinite]';

/** 載入骨架（永不只顯示裸 spinner）/ Loading skeleton, never a bare spinner */
export const GM_SKEL =
  'relative overflow-hidden rounded-lg bg-[rgba(148,163,184,0.08)] ' +
  "after:absolute after:inset-0 after:-translate-x-full after:content-[''] " +
  'after:bg-[linear-gradient(90deg,transparent,rgba(34,211,238,0.14),transparent)] ' +
  'after:animate-ds-shimmer';

