// ============================================================================
// 提示定位（純邏輯）/ Tooltip placement (pure)
// ============================================================================
// 四個提示面（將領彈窗屬性列、雷達 hover、地圖地點提示、雷達讀值）各自寫過
// 「上方還是下方」的規則——地圖那個甚至**恆定**在光標上方（translateY(-100%)），
// 光標在屏幕上半部時直接被上緣裁掉。這裡收斂成**一條**規則，四處共用：
//
// Four tooltip surfaces (the leader popup's ability rows, the radar hover, the map's
// place tooltip, the radar readout) each wrote their own above-or-below rule — the
// map's was even **always above** the cursor (translateY(-100%)), which clipped it
// off the top edge whenever the cursor was in the upper half. One rule lives here
// and all four consume it:
//
//   1. **預設在下方**：光標錨點 = 面板左上角貼近光標（x+gap、y+gap）；
//      元素錨點 = 水平置中於元素、面板頂貼元素底。
//      **Below by default**: a cursor anchor puts the panel's top-left near the
//      cursor (x+gap, y+gap); an element anchor centres horizontally on the element
//      with the panel's top at the element's bottom.
//   2. **上方只在真的放不下時**：下方會溢出視口底部、且上方有空間才翻——所以
//      光標在屏幕上半部**永遠在下方**。
//      **Above only when it genuinely does not fit**: flip only when below would
//      overflow the box's bottom AND there is room above — so a cursor in the top
//      half is **always** served from below.
//   3. **左右夾邊**：右側放不下 → 面板右緣貼到錨點左側；元素錨點夾在框內。
//      **Horizontal clamp**: flip to the anchor's left when the panel would overflow
//      the right edge; element anchors are clamped inside the box.
// ============================================================================

/** 定位輸入 / What the placement needs */
export interface TooltipPlacementInput {
  /** 錨點（光標或元素錨）在參考框內的座標 / The anchor (cursor or element) in the box's coordinates */
  ax: number;
  ay: number;
  /** 面板尺寸（量測值或保守估計）/ Panel size (measured, or a conservative estimate) */
  panelW: number;
  panelH: number;
  /** 可用框（視窗或地圖容器）尺寸 / The usable box (window or map container) */
  boxW: number;
  boxH: number;
  /** 面板與錨點的間距 / Gap between the panel and the anchor */
  gap: number;
  /** cursor = 面板左上貼近光標；element = 水平置中於元素 / cursor anchors hug the cursor; element anchors centre on it */
  anchor: 'cursor' | 'element';
}

/** 定位結果 / Where the panel goes */
export interface TooltipPlacement {
  /** 面板左上角（參考框座標）/ The panel's top-left, in the box's coordinates */
  x: number;
  y: number;
  /** true = 面板在錨點**上方**（底緣貼錨點）/ true = the panel sits above the anchor */
  above: boolean;
}

/**
 * 依上面的三條規則定位。面板比框還寬時夾回 0；上下都放不下時選空間大的一側。
 * Place by the three rules above. A panel wider than the box clamps to 0; when
 * neither side fits, the side with more room wins.
 */
export function placeTooltip(input: TooltipPlacementInput): TooltipPlacement {
  const { ax, ay, panelW, panelH, boxW, boxH, gap, anchor } = input;

  // ── 水平 ──
  // cursor：左緣貼光標；右側放不下 → 右緣貼光標左側。element：置中後夾在框內。
  // ── Horizontal ──
  // cursor: the left edge hugs the cursor, flipping to the cursor's left when the
  // right side would overflow. element: centred, then clamped inside the box.
  let x: number;
  if (anchor === 'cursor') {
    x = ax + gap;
    if (x + panelW > boxW) x = ax - gap - panelW;
  } else {
    x = ax - panelW / 2;
  }
  if (x < 0) x = 0;
  if (x + panelW > boxW) x = Math.max(0, boxW - panelW);

  // ── 垂直 ──
  // 預設下方；下方放不下且上方放得下才翻。兩邊都放不下 → 選剩餘空間大的一側。
  // ── Vertical ──
  // Below by default; flip only when below overflows AND above fits. When neither
  // fits, take the side with more room.
  const roomBelow = boxH - (ay + gap);
  const fitsBelow = roomBelow >= panelH;
  const fitsAbove = ay - gap >= panelH;
  const above = !fitsBelow && (fitsAbove || ay - gap > roomBelow);
  const y = above ? ay - gap - panelH : ay + gap;
  // 夾回框內（面板比框高時貼頂）/
  // Clamp back into the box (a panel taller than the box pins to the top)
  const clampedY = Math.max(0, Math.min(y, Math.max(0, boxH - panelH)));

  return { x, y: clampedY, above };
}
