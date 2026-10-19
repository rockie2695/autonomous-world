// ============================================================================
// Sigma 地圖元件 / Sigma Map component
// ----------------------------------------------------------------------------
// 純邏輯（顏色換算、sprite 快取、資料型別、`MapCameraControls`）都在
// `./mapShared`，這個檔案只留元件本身。
//
// The pure logic (colour conversion, the sprite cache, the data shapes and
// `MapCameraControls`) lives in `./mapShared`; this file keeps only
// the component.
// ============================================================================

import {
  brightenColor,
  hexToRgb,
  hslToHex,
  linkedPlaceNames,
  placeLabelRect,
  pointInRect,
  solveLabelFontSize,
  starClassOf,
  starScaleAt,
  transparent,
  type StarClass,
  type Character,
  type Faction,
  type Place,
  type PlaceLeader,
  type Tooltip,
  type SigmaMapProps,
} from './mapShared';
import { useEffect, useMemo, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import { drawDiscNodeHover, drawDiscNodeLabel } from 'sigma/rendering';
import { useReducedMotion } from 'motion/react';
import { CONFIG } from '@/lib/gameConfig';
import { t } from '@/lib/i18n';
import { createRng } from '@/lib/rng';
import {
  buildTerritoryField,
  factionAt,
  factionOutlines,
  factionRegions,
  type TerritorySite,
} from '@/lib/territory';

// MapCameraControls lives in the shared module now, but callers already import it
// from here, so re-export it to keep that import working.
export type { MapCameraControls } from './mapShared';

/**
 * Sigma 地圖元件。 / Sigma Map Component.
 * 使用 WebGL 渲染互動式圖形地圖。 / Renders interactive graph map using WebGL.
 */
export function SigmaMap({
  places,
  factions,
  roads,
  characters,
  spotlights = [],
  moves = [],
  onPlaceClick,
  selectedPlaceId,
  onControlsReady,
  onCameraMove,
  showTerritory = true,
}: SigmaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  /** 領地圖層（最底層，area view）/ Territory layer (bottom-most, the area view) */
  const territoryRef = useRef<HTMLCanvasElement>(null);
  /**
   * 同時包住領地 canvas 與 sigma container 的那一層 /
   * The one element that wraps both the territory canvas and the sigma container.
   *
   * hover / 點選掛在這裡：sigma 的 container 在 DOM 上位於領地 canvas，而且必須保持
   * `pointer-events`，所以事件只能靠冒泡到這一層。
   *
   * Hover and selection bind here: the sigma container sits above the territory canvas
   * in the DOM and must keep its pointer events, so events only arrive by bubbling.
   */
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  /** 讓領地層的點擊能借用主 effect 裡的 focusNode，不必重複一份動畫邏輯 /
   *  Lets the territory layer reuse the main effect's focusNode instead of
   *  duplicating the camera animation */
  const focusPlaceRef = useRef<((node: string) => void) | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  /**
   * sigma 自己「目前」掛在某個節點上嗎？
   *
   * Is Sigma itself currently hovering a node?
   *
   * 領地層的 `onMove` 也會設定 hover refs（讓它與 `enterNode` 待遇一致），但那兩件事
   * 必須分開記：`onMove` 若什麼都沒指到要能清掉 refs，卻**不能**踩掉 sigma 真正掛著的
   * 節點。共用一個 ref 就分不出「是我設的」與「是 sigma 設的」。
   *
   * The territory layer's `onMove` also sets the hover refs (so both paths treat a place the
   * same), but those two facts have to be tracked separately: when `onMove` hits nothing it
   * must be able to clear the refs without trampling a node Sigma is genuinely hovering.
   * Sharing one ref makes "I set it" and "Sigma set it" indistinguishable.
   */
  const sigmaHoverRef = useRef<string | null>(null);
  /**
   * 地名文字寬度快取（`地點 id + 字級` → px）。放在元件層而不是效果層，是因為圖形重建的
   * 效果也要清它，而那個效果看不到領地層的區域變數。
   *
   * The label-width cache (`place id + size` → px). It lives at component level rather than in
   * an effect because the graph-rebuild effect has to clear it, and that effect cannot see the
   * territory layer's locals.
   */
  const labelWidthCacheRef = useRef(new Map<string, number>());
  const hoveredNeighborsRef = useRef<Set<string>>(new Set());
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  /** 目前是否顯示地名（純粹看鏡頭 ratio）/ Whether place names are currently shown (purely camera-ratio driven) */
  const labelsVisibleRef = useRef(false);
  const onPlaceClickRef = useRef(onPlaceClick);
  const onControlsReadyRef = useRef(onControlsReady);
  const onCameraMoveRef = useRef(onCameraMove);
  // 尊重「減少動態效果」偏好：鏡頭直接跳轉，不做過場動畫
  // Respect prefers-reduced-motion: the camera jumps instead of animating
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  /**
   * 鏡頭 ratio 的鏡像，供**穩定閉包**讀取。`onMove` 綁在 wrapper 上、effect 依賴為空，
   * 所以它不能直接抓到 sigma 實例；把 ratio 寫進 ref，它就能在每次 mousemove 時判斷
   * 「現在是否已經拉近到領地層不该互動」。
   *
   * A mirror of the camera ratio for the **stable closure** to read. `onMove` is bound to
   * the wrapper from an effect with empty dependencies, so it cannot reach the sigma
   * instance directly; mirroring the ratio into a ref lets every mousemove ask "are we
   * zoomed in past the point where the territory layer should be inert?".
   */
  const cameraRatioRef = useRef(1);
  /**
   * 是否已放大到星系層（圓盤變成太陽）。`nodeReducer` 與自訂的標籤繪製都需要讀它，
   * 而兩者都不能直接抓到 sigma 實例，所以鏡像成 ref。
   *
   * Whether we are zoomed into the star-system view (the disc becomes a sun). Both
   * `nodeReducer` and the custom label drawing need to read it and neither can reach the
   * sigma instance, so it is mirrored into a ref.
   */
  const starViewRef = useRef(false);
  /**
   * 星系尺寸相對於「剛進入星系層」的倍率。1 = 與改動前一模一樣；再放大就 > 1。
   *
   * The factor every star-system pixel constant is multiplied by, relative to the moment
   * star view was entered. 1 = exactly as before; zooming further in makes it grow.
   *
   * 放在這裡（而不是每次在繪製迴圈裡算）是因為 `nodeReducer` 也要讀它，而那裡沒有
   * sigma 實例。`syncStarView` 每個 camera `updated` 都更新一次。
   *
   * It is mirrored here rather than recomputed inside the draw loop because `nodeReducer`
   * needs it too and has no sigma instance. `syncStarView` refreshes it on every camera
   * `updated`.
   */
  const starScaleRef = useRef(1);
  /**
   * 星系名的抬升量（圖座標）。標籤程式畫在**圖座標**上，所以「星系外緣 + 間距」
   * 這段螢幕像素要先換算成圖座標；換算用的比例和太陽大小是同一個，所以兩者
   * 一定同步。
   *
   * The star system's name lift, in graph coordinates. The label program draws in graph
   * coordinates, so "system radius + gap" screen pixels has to be converted first; the
   * conversion uses the same factor as the sun's size, so the two can never disagree.
   */
  const starLabelLiftRef = useRef(0);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // 選中地點變更時（開啟或關閉彈窗）立即清除殘留的 tooltip。
  // Clear the lingering tooltip immediately when the selected place changes
  // (popup opened or closed). 使用 React 建議的「render 期間調整 state」模式。
  // Uses React's recommended "adjust state during render" pattern.
  const [prevSelectedPlaceId, setPrevSelectedPlaceId] = useState(selectedPlaceId);
  if (prevSelectedPlaceId !== selectedPlaceId) {
    setPrevSelectedPlaceId(selectedPlaceId);
    setTooltip(null);
  }

  // 同步最新 props 到 refs，讓一次性建立的事件處理器與 nodeReducer
  // 讀取最新值，Sigma 實例不需重建（地圖視角因此不會被重設）。
  // Sync latest props into refs so the once-created handlers and nodeReducer
  // read fresh values without re-creating the Sigma instance (the camera
  // position is therefore never reset).
  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
    onPlaceClickRef.current = onPlaceClick;
    onControlsReadyRef.current = onControlsReady;
  }, [selectedPlaceId, onPlaceClick, onControlsReady]);

  // ── 建立 Sigma 實例（僅一次）/ Create the Sigma instance (once) ──────────

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph();
    graphRef.current = graph;

    // 建立 Sigma 實例 / Create Sigma instance
    const sigma = new Sigma(graph, containerRef.current, {
      // 鏡頭 ratio 必須有上下限。sigma 的 minRatio/maxRatio 預設都是 null，而
      // getBoundedRatio 在它們是 null 時**完全不做任何夾限**，所以自訂的滾輪處理
      // 可以把 ratio 推到任意大 —— 拉遠視圖下滾幾下地圖就縮成一個小點，看起來像
      // 「地圖消失」。設定之後，sigma 自己的滾輪、雙擊、縮放滑桿，以及領地層的
      // onWheel 全部共用同一組上下限，行為一致。
      // The camera ratio has to be bounded. Sigma's minRatio/maxRatio both default to
      // null, and getBoundedRatio does *no* clamping while they are null, so a custom
      // wheel handler can push the ratio arbitrarily far out — in the zoomed-out view a
      // few scroll ticks shrink the world to a dot and the map looks like it vanished.
      // Bounding it here makes Sigma's own wheel, double-click, the zoom slider and the
      // territory layer's onWheel all share one limit.
      minCameraRatio: CONFIG.MAP_ZOOM_MIN_RATIO,
      maxCameraRatio: CONFIG.MAP_ZOOM_MAX_RATIO,
      // 切換桌機／手機時容器會短暫量到 0 高 Sigma 預設直接丟
      // "Container has no height"，整個錯誤邊界就炸掉。容器只是暫時沒有
      // 尺寸，下一次 resize 會補上，所以照官方建議放行 /
      // While switching desktop <-> mobile the container briefly measures zero
      // height and Sigma throws "Container has no height" by default, which
      // takes down the error boundary. The size is transient and the next
      // resize fixes it, so take the library's own escape hatch.
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      defaultEdgeColor: CONFIG.MAP_ROAD_COLOR, // 深藍色道路 / Deep blue roads
      defaultNodeColor: CONFIG.MAP_UNOWNED_NODE_COLOR,
      labelFont: 'monospace',
      labelSize: 14,
      labelColor: { attribute: 'labelColor' },
      labelWeight: 'bold',
      renderLabels: true,
      // 地名標籤只跟著鏡頭縮放走，不看兵力；真正的門檻在 nodeReducer 裡用
      // camera.ratio 判斷。這裡必須設 0，否則 sigma 仍會用「節點尺寸」過濾一次，
      // 讓兵多的地名在拉遠時偷偷留著。
      // Place labels follow the camera zoom only; the real gate lives in
      // nodeReducer via camera.ratio. This must be 0, or sigma filters once more
      // by node size and garrisoned names sneak through when zoomed out.
      labelRenderedSizeThreshold: 0,
      // 自訂 hover 渲染：只在節點「目前」hover / 選中 / 相連時畫白色底框，
      // 過濾掉 sigma 內部殘留的 hoveredNode / highlightedNodes 狀態。
      // 這兩個內部狀態沒有公開清除 API，只靠 mousemove 轉移更新；彈窗
      // 關閉後若不過濾會殘留空白標籤底框。
      // Custom hover renderer: only draw the white pill for nodes that are
      // CURRENTLY hovered / selected / neighbor — filter out sigma's sticky
      // internal hoveredNode / highlightedNodes (no public clear API; they
      // are only updated by mousemove transitions, so after the popup closes
      // a stale blank pill would otherwise remain).
      defaultDrawNodeHover: (context, data, settings) => {
        const nodeId = (data as { key?: string }).key;
        const isActive =
          !!nodeId &&
          (nodeId === hoveredNodeRef.current ||
            nodeId === selectedPlaceIdRef.current ||
            hoveredNeighborsRef.current.has(nodeId));
        if (!isActive) return;
        drawDiscNodeHover(context, data, settings);
      },
      // 星系層的地名畫在星系「正上方」，像 Stellaris 的星系名。
      //
      // The place name is drawn ABOVE the system at star zoom, like a Stellaris system name.
      //
      // sigma 內建的標籤程式固定把文字畫在節點右側（`x + size + 3`），沒有任何垂直
      // 偏移選項，所以這一層自己畫；**非星系層完全委派回內建程式**，行為一字不改。
      //
      // Sigma's built-in label program always draws the text to the RIGHT of the node
      // (`x + size + 3`) and offers no vertical offset, so this layer draws it itself.
      // Outside star view the built-in program is delegated to, completely unchanged.
      defaultDrawNodeLabel: (context, data, settings) => {
        if (!starViewRef.current || !data.label) {
          drawDiscNodeLabel(context, data, settings);
          return;
        }
        const size = settings.labelSize;
        context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
        const attribute = settings.labelColor.attribute;
        const fromAttribute = attribute
          ? ((data as Record<string, unknown>)[attribute] as string | undefined)
          : undefined;
        context.fillStyle =
          fromAttribute ?? settings.labelColor.color ?? '#000';
        const width = context.measureText(data.label).width;
        // 星系外緣再留一段間距，否則名字會壓在最外側那顆行星上 /
        // Clear of the system's outer edge, or the name lands on the outermost planet
        context.fillText(
          data.label,
          data.x - width / 2,
          data.y - starLabelLiftRef.current
        );
      },
      nodeReducer: (node, data) => {
        const res = { ...data };
        // 節點越大，標籤越清晰 / Larger nodes get clearer labels
        res.labelSize = Math.max(14, Math.min(20, data.size / 2));

        // ── 星系層：地點圓盤變成一顆太陽 / Star view: the place disc becomes a sun ──
        // 太陽的**螢幕**大小是 `MAP_STAR_SUN_SCREEN_PX × starScale`，而節點大小是圖座標，
        // 所以要用 `pxPerUnit` 換算回來。少了換算，拉遠時太陽會跟著圓盤一起縮水。
        //
        // The sun's **screen** size is `MAP_STAR_SUN_SCREEN_PX × starScale`, but the node
        // size is in graph coordinates, so it has to be converted back through `pxPerUnit`.
        // Without the conversion the sun shrinks with the disc as you pull back.
        //
        // `starScale` 就是讓星系**跟著鏡頭走**的那個倍率（見 mapShared 的 `starScaleAt`）：
        // 剛跨進星系層那一幀是 1×，繼續放大就長大。
        //
        // `starScale` is what makes the system follow the camera (see `starScaleAt` in
        // mapShared): exactly 1× on the frame that enters star view, growing from there.
        if (starViewRef.current) {
          const pxPerUnit = sigmaRef.current?.scaleSize(1) || 1;
          const starScale = starScaleRef.current;
          res.size = (CONFIG.MAP_STAR_SUN_SCREEN_PX * starScale) / pxPerUnit;
          starLabelLiftRef.current =
            ((CONFIG.MAP_STAR_SYSTEM_RADIUS_PX + CONFIG.MAP_STAR_LABEL_GAP_PX) *
              starScale) /
              pxPerUnit;
          // 暖色，不帶陣營色：陣營色留給軌道 /
          // Warm, and carrying no faction colour — that goes to the orbits
          res.color = ((data.starClass ?? starClassOf(node)) as StarClass).core;
        }

        // 正在指向的地方（hover／選中／其鄰居）永遠保留地名 /
        // The place you are pointing at always keeps its name
        const isActive =
          node === hoveredNodeRef.current ||
          node === selectedPlaceIdRef.current ||
          hoveredNeighborsRef.current.has(node);

        // 拉遠時整張圖都不顯示地名（與兵力無關）；放近才統一出現。
        // 例外是 isActive：forceLabel 只繞過 labelRenderedSizeThreshold，
        // 標籤一旦被設成 null 就脫離 label index，再怎麼 forceLabel 也畫不出來，
        // 所以這裡絕不能清掉 active 節點的 label。
        // Zoomed out, no place is labelled regardless of garrison; names appear
        // together once you zoom in. isActive is the exception: forceLabel only
        // bypasses labelRenderedSizeThreshold, so a null label drops out of the
        // label index and nothing can draw it — never null an active node.
        if (!labelsVisibleRef.current && !isActive) res.label = null;

        // hover / 選中 時標籤變青色，連接節點也高亮 / Label turns cyan on hover/select, connected nodes also highlighted
        if (hoveredNodeRef.current === node) {
          res.labelColor = CONFIG.MAP_LABEL_COLOR; // 霓虹青綠 / Neon cyan
          res.zIndex = 1;
          res.highlighted = true;
          // forceLabel 會跳過縮放門檻，讓「正在看的地方」一定看得到名字 /
          // forceLabel bypasses the zoom gate so the place you are pointing at
          // is always named
          res.forceLabel = true;
        } else if (selectedPlaceIdRef.current === node) {
          res.labelColor = CONFIG.MAP_LABEL_COLOR;
          res.highlighted = true;
          res.forceLabel = true;
        } else if (hoveredNeighborsRef.current.has(node)) {
          res.labelColor = CONFIG.MAP_LABEL_COLOR;
          res.highlighted = true;
          // 相連地點也強制顯示名字：拉遠時地圖只有線，hover 就能看清連到哪 /
          // Connected places are named too — zoomed out the map is just lines,
          // so hovering reveals what this place links to
          res.forceLabel = true;
        } else {
          res.labelColor = CONFIG.MAP_LABEL_FALLBACK_COLOR; // 預設淺灰 / Default light gray
        }

        return res;
      },
    });

    // ── Hover 事件 / Hover Events ──────────────────────────────────────────

    sigma.on('enterNode', ({ node }) => {
      hoveredNodeRef.current = node;
      sigmaHoverRef.current = node;
      // 找出所有連接的鄰居 / Find all connected neighbors
      const neighborIds = graph.neighbors(node);
      hoveredNeighborsRef.current = new Set(neighborIds);
      sigma.refresh(); // 強制重繪以觸發 nodeReducer / Force redraw to trigger nodeReducer

      const attrs = graph.getNodeAttributes(node);
      const viewportPos = sigma.graphToViewport({
        x: attrs.x,
        y: attrs.y,
      });

      setTooltip({
        kind: 'place',
        x: viewportPos.x,
        y: viewportPos.y,
        place: attrs.placeData,
        faction: attrs.factionData,
        leaderTroops: attrs.leaderTroops,
        administratorName: attrs.administratorName,
        factionRulerName: attrs.factionRulerName,
        leaders: attrs.leaders,
        // 走**共用**的 helper，不要在這裡再寫一份鄰居→名字的邏輯 /
        // Through the **shared** helper — do not re-derive neighbour→name here.
        linkedPlaces: linkedPlaceNames(graph, node),
      });

      if (containerRef.current) {
        containerRef.current.style.cursor = 'pointer';
      }
    });

    sigma.on('leaveNode', () => {
      hoveredNodeRef.current = null;
      sigmaHoverRef.current = null;
      hoveredNeighborsRef.current = new Set();
      sigma.refresh(); // 強制重繪以觸發 nodeReducer / Force redraw to trigger nodeReducer
      setTooltip(null);

      if (containerRef.current) {
        containerRef.current.style.cursor = '';
      }
    });

    // ── 鏡頭動畫 / Camera Animation ─────────────────────────────────────────
    // reducedMotion 用 ref 讀取：建立 Sigma 的 effect 依賴陣列是空的，
    // 直接閉包捕捉會拿到首次渲染的值。
    // reducedMotion is read through a ref: the effect that builds Sigma has an
    // empty dependency array, so closing over the value would freeze the first
    // render's answer.

    const animMs = () => (reducedMotionRef.current ? 0 : CONFIG.MAP_CAMERA_ANIM_MS);

    /** 鏡頭移到某節點並置中；若目前拉太遠則一併放大到可辨識的比例 */
    /** Move the camera to a node and centre it; zoom in first if it is too far out */
    // 必須用 getNodeDisplayData()（framed 座標），不能用
    // graph.getNodeAttributes() 的原始座標：sigma 會把圖正規化置中，
    // 鏡頭 operates 在 framed 空間。直接餵原始座標會讓鏡頭停在節點之外，
    // 畫面全黑且關閉彈窗後不會回來。
    // Must use getNodeDisplayData() (framed space), not the raw
    // getNodeAttributes() coordinates: sigma normalises and centres the graph,
    // and the camera works in framed space. Feeding raw coordinates parks the
    // camera off the node — the map goes blank and never recovers on close.
    const focusNode = (node: string) => {
      if (!graph.hasNode(node)) return;
      const display = sigma.getNodeDisplayData(node);
      if (!display) return;
      const camera = sigma.getCamera();
      // framed 空間裡「全覽」是固定的 ratio（見 fitWorld），聚焦就是從全覽
      // 再拉近 MAP_FOCUS_ZOOM 倍——用同樣的基準才能讓兩種視角一致。
      // In framed space "fit everything" is a fixed ratio (see fitWorld), so
      // focusing is simply that zoomed in by MAP_FOCUS_ZOOM — sharing the
      // baseline keeps the two views consistent.
      const focusRatio = CONFIG.MAP_FIT_PADDING * CONFIG.MAP_FOCUS_ZOOM;
      void camera.animate(
        {
          x: display.x,
          y: display.y,
          ratio: Math.min(camera.ratio, focusRatio),
          angle: 0,
        },
        { duration: animMs() }
      );
    };
    // 領地層點擊時借用同一個 focusNode，避免複製一份鏡頭動畫 /
    // The territory layer borrows this same focusNode rather than duplicating
    // the camera animation
    focusPlaceRef.current = focusNode;

    /** 鏡頭動畫到「整個世界剛好放得下」/ Animate the camera to fit the whole world */
    const fitWorld = () => {
      const camera = sigma.getCamera();
      // sigma 的正規化（createNormalizationFunction）把整張圖映射成
      // 「以 (0.5,0.5) 為中心、較大軸恰為 1」的單位方形，所以全覽視角是固定值：
      // 中心 (0.5,0.5)、ratio 1，再乘 MAP_FIT_PADDING 留白。實測五種視窗比例
      // （含 1600×400、400×1200）都能容納全部節點。
      // Sigma's normalisation maps the whole graph into a unit square centred on
      // (0.5, 0.5) whose larger axis is exactly 1, so "fit everything" is a
      // constant: centre (0.5, 0.5), ratio 1, times MAP_FIT_PADDING for margin.
      // Verified to contain every node across five viewport aspects.
      //
      // 不可用 sigma.getBBox()：它回傳原始座標範圍（正規化之前），拿來算中心
      // 會讓鏡頭停在世界之外，reset 之後地圖會變成一片空白（實測 0 個節點可見）。
      // Must NOT use sigma.getBBox(): it returns the RAW extent (pre-normalisation),
      // so centring on it parks the camera outside the world — measured 0 nodes
      // visible, i.e. a blank map after reset.
      void camera.animate(
        {
          x: 0.5,
          y: 0.5,
          ratio: camera.getBoundedRatio(CONFIG.MAP_FIT_PADDING),
          angle: 0,
        },
        { duration: animMs() }
      );
    };

    // sigma .. ratio /...**..... camera.x / y**.........
    // Sigma bounds the ratio; it puts **no bound at all** on camera.x / y.
    //
    // ..**.....**... reset (..) .......
    //
    // Panning is **deliberately unbounded** . the space is infinite, so the camera may
    // leave the world entirely; the reset button brings the view back at any time.
    //
    // ..[0, 1]....75% ...... mousemove .....
    //
    // The old [0, 1] clamp was wrong, and wrong in a worse way than the bug it replaced:
    // not "the map vanishes" but "the map sticks and jitters". The camera lives in
    // framed space, so once you zoom out past ~75% the world occupies only a small
    // patch in the middle of the viewport . dragging that patch across the screen
    // *requires* camera.x / y to leave [0, 1]. Clamped, every mousemove hit the limit,
    // so the map stopped tracking the cursor and the travel no longer matched the
    // cursor travel at all. Infinite space is the correct behaviour.
    // ── 點擊事件 / Click Event ─────────────────────────────────────────────

    sigma.on('clickNode', (event: { node: string }) => {
      const attrs = graph.getNodeAttributes(event.node);
      // 點擊後鏡頭滑向該地點，長地圖上尤其明顯
      // Slide the camera to the clicked place — very noticeable on a large map
      focusNode(event.node);
      onPlaceClickRef.current?.(attrs.placeData);
    });

    // 鏡頭變動時重算「地名要不要顯示」。只有跨過門檻才 refresh，避免每幀
    // 重跑 nodeReducer。綁在 camera 上——sigma 只在內部自己監聽這個事件，
    // 不會轉發給 sigma.on()。
    // Recompute label visibility as the camera moves, refreshing only when the
    // threshold is crossed so nodeReducer is not re-run every frame. Bound on
    // the camera: sigma consumes this event internally and does not re-emit it.
    const syncLabelVisibility = () => {
      const visible = sigma.getCamera().ratio <= CONFIG.LABEL_ZOOM_RATIO;
      if (visible === labelsVisibleRef.current) return;
      labelsVisibleRef.current = visible;
      sigma.refresh();
    };
    labelsVisibleRef.current = sigma.getCamera().ratio <= CONFIG.LABEL_ZOOM_RATIO;
    sigma.getCamera().on('updated', syncLabelVisibility);

    // 星系層的門檻（0.2）與地名門檻（0.6）是**兩個不同的門檻**，所以跨過星系門檻
    // 時上面那個判斷不會變、`refresh()` 也就不會被呼叫 —— 圓盤就永遠不會變成太陽。
    // 這裡另外監聽一次，只在跨門檻時 refresh。
    //
    // The star threshold (0.2) and the label threshold (0.6) are **different
    // thresholds**, so crossing the star one leaves the check above unchanged and never
    // calls `refresh()` — the discs would never become suns. Listen for it separately and
    // refresh only on the crossing.
    const syncStarView = () => {
      const ratio = sigma.getCamera().ratio;
      const star = ratio <= CONFIG.MAP_STAR_ZOOM_RATIO;
      const flipped = star !== starViewRef.current;
      starViewRef.current = star;
      // 星系大小跟著鏡頭走，所以倍率每次都要重算。它放在 ref 裡是因為 `nodeReducer`
      // 需要讀它，而那裡抓不到 sigma 實例。
      //
      // The system's size follows the camera, so the factor is recomputed every time. It
      // lives in a ref because `nodeReducer` needs it and cannot reach the sigma instance.
      starScaleRef.current = star ? starScaleAt(ratio) : 1;
      // 星系層**每幀**都要 refresh：太陽大小是鏡頭的函數，節點大小必須每次跟著換算；
      // 只在跨門檻時 refresh 會讓太陽在繼續縮放時停在舊大小。
      // 不在星系層時只有跨門檻那一次需要。
      //
      // Refreshing every frame at star zoom: the sun's size is a function of the camera, so
      // the node size has to be recomputed each time. Refreshing only on the crossing would
      // freeze the sun at the size it had when the threshold was passed. Outside star view
      // the crossing alone is enough.
      if (star || flipped) sigma.refresh();
    };
    starViewRef.current = sigma.getCamera().ratio <= CONFIG.MAP_STAR_ZOOM_RATIO;
    sigma.getCamera().on('updated', syncStarView);

    // ── 縮放滑桿 / Zoom slider ───────────────────────────────────────────
    // sigma 的 ratio 越小越近，滑桿要「越往右越近」所以整段反轉。
    // Sigma's ratio shrinks as you zoom in; the slider reads right = closer, so
    // the whole scale is inverted. Bounds come from the camera itself, with
    // config fallbacks when Sigma leaves them unset (null).
    const camera = sigma.getCamera();
    const maxRatio = camera.maxRatio ?? CONFIG.MAP_ZOOM_MAX_RATIO;
    const minRatio = camera.minRatio ?? CONFIG.MAP_ZOOM_MIN_RATIO;
    /** ratio → 0..1（1 = 最近）/ ratio to 0..1 (1 = closest) */
    const ratioToZoom = (ratio: number): number =>
      1 - (ratio - minRatio) / Math.max(maxRatio - minRatio, 1e-9);
    const zoomToRatio = (zoom: number): number =>
      minRatio + (1 - Math.max(0, Math.min(1, zoom))) * (maxRatio - minRatio);

    const zoomSubscribers = new Set<(zoom: number) => void>();
    const emitZoom = () => {
      const z = ratioToZoom(camera.ratio);
      for (const cb of zoomSubscribers) cb(z);
    };
    camera.on('updated', emitZoom);

    // 鏡頭位置也訂閱出去，讓疊層做視差。分開一個訂閱而不是併進 emitZoom，因為滑桿
    // 只需要比例、每幀都會收到；而塵埃要的是位置，而且可以用 ref 直接寫、不必進
    // React state。
    //
    // The camera position is subscribed out too, so overlays can do parallax. It is a
    // separate subscription rather than part of emitZoom: the slider only needs the
    // ratio and gets it every frame, while the dust needs the position and can write
    // straight to a ref without React state.
    const emitCamera = () => {
      onCameraMoveRef.current?.(camera.x, camera.y, camera.ratio);
    };
    camera.on('updated', emitCamera);

    sigmaRef.current = sigma;

    // 將視角控制交給父層（浮動縮放 / 重設按鈕使用）
    // Hand camera controls to the parent (used by floating zoom / reset buttons)
    onControlsReadyRef.current?.({
      zoomIn: () => {
        void sigma.getCamera().animatedZoom({ duration: animMs() });
      },
      zoomOut: () => {
        void sigma.getCamera().animatedUnzoom({ duration: animMs() });
      },
      resetView: () => {
        // 全覽整個世界（而非回到 ratio 1）：世界通常遠大於視窗，
        // animatedReset 會讓地圖塞得滿滿的
        // Fit the whole world (rather than ratio 1): the world is normally much
        // larger than the viewport, so animatedReset crops it
        fitWorld();
      },
      focusPlace: (placeId: string) => {
        // 節點不存在（例如極舊回合的事件、該地已消失）時 focusNode 會自行跳過 /
        // focusNode no-ops when the node is gone (very old events, destroyed place)
        focusNode(placeId);
      },
      getZoom: () => ratioToZoom(camera.ratio),
      // 直接 setState（非動畫）：滑桿拖曳時每幀都要跟手，動畫反而會拖慢手感 /
      // setState rather than an animation: a dragged slider must track the
      // pointer每frame, and an animation would lag behind the drag
      setZoom: (t: number) => {
        camera.setState({ ratio: zoomToRatio(t) });
        emitZoom();
      // `setState` **只更新狀態並發出 `updated`，它不會排程重繪**。少了這一行，
      // sigma 的 WebGL canvas 與覆蓋層都停在最後一個畫面：百分比會變、地圖不會。
        //
        // `setState` only updates the state and emits `updated`; it does **not** schedule a
        // render. Without this line Sigma's WebGL canvas and the overlay both stay on the
        // last painted frame: the percentage changes and the map does not.
        //
        // 覆蓋層會在下一個 rAF 影格自己追上（它每幀都從**活的**鏡頭狀態重畫），所以這裡
        // 只需要讓 sigma 畫這一幀。
        //
        // The overlay catches up on the next rAF tick (it redraws from the *live* camera
        // state every frame), so all that is needed here is to make Sigma paint this frame.
        sigma.refresh();
      },
      onZoomChange: (cb: (zoom: number) => void) => {
        zoomSubscribers.add(cb);
        cb(ratioToZoom(camera.ratio));
        return () => {
          zoomSubscribers.delete(cb);
        };
      },
      // sigma 自己的「框化座標 → 視窗像素」對應。背景銀河與霧氣層必須走這條路，
      // **不可**從 camera.x / y / ratio 自行推導——
      //
      // Sigma's own framed → viewport mapping. The backdrop layers must use this and
      // must NOT re-derive pan and zoom from camera.x / y / ratio:
      //
      //   * 手推的平移**方向是反的**。sigma 的對應是
      //     `screen = (framed - camera.position) × scale + centre`，所以 camera.x 變大時
      //     世界內容往**左**移；而 `centre + (camera.x - 0.5) × k` 會讓背景往**右**移——
      //     背景於是與地圖反向漂移，平移時看起來「不跟著地圖走」。
      //   * 縮放的比例因子也拿不到精確值，`zoomRel ^ n` 只是近似。
      //
      //   * a hand-rolled pan has the **wrong sign**. Sigma's mapping is
      //     `screen = (framed - camera.position) × scale + centre`, so raising
      //     camera.x moves world content **left**, whereas
      //     `centre + (camera.x - 0.5) × k` moves the backdrop **right** — so the
      //     backdrop drifts against the map and reads as "not following it".
      //   * the exact zoom factor is likewise unavailable, so `zoomRel ^ n` is only
      //     ever an approximation.
      framedGraphToViewport: (p: { x: number; y: number }) => sigma.framedGraphToViewport(p),
    });

    return () => {
      onControlsReadyRef.current?.(null);
      zoomSubscribers.clear();
      camera.removeListener('updated', emitZoom);
      sigma.kill();
      sigmaRef.current = null;
      // 清除 hover 狀態，避免殘留舊的高亮標籤
      // Clear hover state to avoid stale highlighted labels
      hoveredNodeRef.current = null;
      hoveredNeighborsRef.current = new Set();
    };
  }, []);

  // ── 資料變更時重建圖形（不重建 Sigma 實例，保留地圖視角）
  // ── Rebuild the graph on data changes (without re-creating the Sigma
  //    instance, preserving the camera position) ────────────────────────────

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;

    // ── 先記住鏡頭，因為 graph.clear() 會把圖清空 ──
    // 清空圖之後 sigma 有可能把鏡頭狀態重置（節點集合變空時某些版本會重新界定範圍），
    // 所以在清空**之前**把 x / y / ratio / angle 存下來，之後原樣還回去。
    // 少了這一步，每按一次「下一回合」地圖就會跳回預設視角。
    //
    // Remember the camera **before** clearing: emptying the graph can reset sigma's camera
    // state (some versions re-derive its bounds when the node set empties). Snapshotting
    // x / y / ratio / angle up front and putting them back afterwards is what stops the map
    // jumping to a default view on every "Next Round".
    const camera = sigma.getCamera();
    const saved = {
      x: camera.x,
      y: camera.y,
      ratio: camera.ratio,
      angle: camera.angle,
    };

    graph.clear();
    // 地名寬度快取跟著圖一起作廢：地方會死掉、會新增，節點 id 對應的名字也不再一樣 /
    // The label-width cache dies with the graph: places die and are added, and a node id no
    // longer means the same name.
    labelWidthCacheRef.current.clear();

    // 建立勢力顏色對照 / Create faction color map
    const factionMap = new Map<string, Faction>();
    for (const faction of factions) {
      factionMap.set(faction.id, faction);
    }

    // 計算每個地方的將領與總兵力 / The leaders based at each place, and their total troops
    const troopsPerPlace = new Map<string, number>();
    /**
     * 每個地方有哪些存活將領，依兵力由大到小。
     *
     * **提示要印的是名字，不是數字。** 原本只有 `👥 將領: 3`——讀者知道有三個人，卻不知道
     * 是誰，而「這個地方現在是誰的地盤」正是 hover 一個節點最想得到的答案。名字連同
     * 各自的兵力一起給，節點大小的來源才真的讀得出來。
     *
     * Who is based at each place, largest troop count first.
     *
     * **The tooltip needs names, not a number.** It used to print `👥 將領: 3` — the reader
     * learns that three people are here but not *who*, and "who holds this place right now"
     * is the whole reason to hover a node. Names plus their own troops also make the node's
     * size legible, which a bare count never could.
     *
     * 排序用兵力而不是 id 或名字：提示裡最上面那一列應該是最有存在感的那位，而不是
     * 資料庫剛好回傳的那一位。
     *
     * Sorted by troops rather than by id or name: the top line of a tooltip should be the
     * most consequential person standing there, not whichever one the database returned first.
     */
    const leadersPerPlace = new Map<string, Character[]>();
    // 單一迴圈。`charsPerPlace`（數人數）與 `troopsPerPlace`（數兵力）原本是兩個迴圈，
    // 現在 `leadersPerPlace`（帶名字的人）取代了前者——它的 `.length` **就是**人數。
    // 留著兩個迴圈只會讓人以為「數人數」與「列名字」是兩件不同的事，而它們其實是同一
    // 份資料的兩種投影；而且多一趟 `characters` 的掃描只會更慢。
    //
    // One pass. `charsPerPlace` (counting) and `troopsPerPlace` (summing) were two loops, and
    // `leadersPerPlace` now supersedes the former — its `.length` **is** the count. Keeping
    // both would suggest that counting people and naming them are separate facts, when they
    // are two projections of the same data, and the extra pass over `characters` is only
    // slower.
    for (const char of characters) {
      if (!char.alive) continue;
      troopsPerPlace.set(char.placeId, (troopsPerPlace.get(char.placeId) ?? 0) + char.troops);
      const list = leadersPerPlace.get(char.placeId);
      if (list) list.push(char);
      else leadersPerPlace.set(char.placeId, [char]);
    }
    for (const list of leadersPerPlace.values()) {
      list.sort((a, b) => b.troops - a.troops);
    }
    /** 依 id 查人，供「這個地方的行政官是誰」「這個勢力的君主是誰」使用 /
        Look a leader up by id, for "who administers this place" and "who rules this faction" */
    const charById = new Map(characters.map((c) => [c.id, c]));

    // 新增地方節點 / Add place nodes
    for (const place of places) {
      const faction = place.factionId ? factionMap.get(place.factionId) : null;
      const leaderTroops = troopsPerPlace.get(place.id) ?? 0;
      const totalTroops = leaderTroops + place.garrison;

      // 節點大小：使用 log 刻度避免少數巨點吃掉畫面
      // Node size: use log scale to prevent a few huge nodes from dominating
      // size = 4 + log(troops + 1) × 2
      const nodeSize = 4 + Math.log(totalTroops + 1) * 2;

      // 有勢力的地方用勢力色（轉換為 hex），無主之地用深灰色
      // Owned places use faction color (converted to hex), unowned use dark gray
      const color = faction ? hslToHex(faction.color) : CONFIG.MAP_UNOWNED_COLOR;

      graph.addNode(place.id, {
        x: place.layoutX,
        y: place.layoutY,
        size: nodeSize,
        color,
        label: place.name,
        // 太陽的光譜級在**建圖時**決定並存在節點上，而不是各自去抽。
        //
        // The star's spectral class is decided **here**, at build time, and stored on the node
        // rather than drawn separately by each consumer.
        //
        // `nodeReducer`（畫圓盤）與覆蓋層（畫柔光）是兩個地方，兩邊各自 `createRng(node)`
        // 抽一次並不會出錯，但那是兩次雜湊、而且**要靠「實作剛好一樣」才會一致**。
        // 節點層是唯一的事實來源，改動時不可能只改到一邊。
        //
        // `nodeReducer` (the disc) and the overlay (the glow) are two different places. Both
        // calling `createRng(node)` would not actually be wrong, but it is two hashes and it
        // only agrees because the two implementations happen to match. One source of truth on
        // the node means a change cannot land on one side only.
        starClass: starClassOf(place.id),
        // 儲存額外資料 / Store extra data for tooltips
        placeData: place,
        factionData: faction,
        leaderTroops,
        totalTroops,
        // 人名在**建圖時**算好存在節點上，兩條 hover 路徑（sigma 的 `enterNode` 與
        // wrapper 的 `mousemove`）都只讀這一份。這跟 `leaderTroops` 是同一個理由：
        // 兩邊各自推導不會出錯，但那是兩份實作，只要一邊漏掉更新就會看到兩個不同的提示。
        //
        // The names are resolved **here**, at build time, and stored on the node; both hover
        // paths (sigma's `enterNode` and the wrapper's `mousemove`) read this one value.
        // Same reason as `leaderTroops`: deriving them in both places would not be *wrong*,
        // but it is two implementations, and one missed update shows the reader two
        // different tooltips for the same place.
        administratorName: place.administratorId
          ? (charById.get(place.administratorId)?.name ?? null)
          : null,
        // 勢力的君主是 `faction.kingId`，**不是**這個地方的行政官。兩者經常不是同一人，
        // 合成一列會讓人誤以為地方與勢力共用同一個首腦。
        //
        // The faction's ruler is `faction.kingId`, **not** this place's administrator. The
        // two are routinely different people, and collapsing them reads as though place and
        // faction share one head.
        factionRulerName: faction?.kingId
          ? (charById.get(faction.kingId)?.name ?? null)
          : null,
        leaders: (leadersPerPlace.get(place.id) ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          troops: c.troops,
          isKing: c.isKing,
          isAdministrator: c.id === place.administratorId,
        })),
      });
    }

    // 新增道路邊緣 / Add road edges
    for (const road of roads) {
      if (graph.hasNode(road.aId) && graph.hasNode(road.bId)) {
        if (!graph.hasEdge(road.aId, road.bId)) {
          graph.addEdge(road.aId, road.bId, {
            size: 1,
            color: CONFIG.MAP_ROAD_COLOR,
          });
        }
      }
    }

    // ── 把鏡頭放回去，資料更新不應該改變使用者正在看的畫面 ──
    // setState 是瞬間的（不是動畫）：使用者剛剛主動調整過視角，正在進行的相機動畫
    // 早就結束了，這裡要的是「立刻回到原本的位置」，不是慢慢滑回去。
    //
    // Put the camera back: a data refresh must not change the view the user is looking at.
    // `setState` is instantaneous rather than animated — the user just adjusted the view by
    // hand, so any camera animation has long finished; what is wanted here is an immediate
    // return to where they were, not a slow glide.
    camera.setState(saved);

    // 資料重建後清除 hover 狀態並重繪 / Clear hover state and redraw after rebuild
    hoveredNodeRef.current = null;
    hoveredNeighborsRef.current = new Set();
    sigma.refresh();
  }, [places, factions, roads, characters]);

  // ── 選中地點變更時清除 hover 狀態並重繪標籤
  // ── Clear hover state and redraw labels when the selected place changes
  //    （彈窗開啟或關閉時，overlay 攔截了滑鼠事件，leaveNode 不會觸發，
  //      必須在此清除殘留的高亮，否則節點會殘留白色標籤底框）
  //    (while the popup overlay intercepts mouse events, leaveNode never
  //     fires — clear stale highlights here or nodes keep a white pill) ────

  // ── 領地密度場 ──/ Territory density field
  // 在 render 期間就從 places / factions 算出來，而不是在 effect 裡算完再 setState：
  // 後者會觸發 lint 的 cascading-render 規則，而 Place 本身就帶 layoutX/layoutY，
  // 並不必要等 sigma 的 graph 建好。
  // Computed during render from places/factions rather than built inside the effect
  // and pushed into state: the latter trips the cascading-render lint rule, and
  // Place already carries layoutX/layoutY, so there is no reason to wait for sigma.
  const territory = useMemo(() => {
    const sites: TerritorySite[] = places.map((place) => ({
      id: place.id,
      x: place.layoutX,
      y: place.layoutY,
      faction: place.factionId,
    }));
    return {
      sites,
field: buildTerritoryField(
      sites,
      CONFIG.TERRITORY_MAX_RESOLUTION,
      CONFIG.TERRITORY_MARGIN,
      CONFIG.TERRITORY_BLOB_RADIUS,
      CONFIG.TERRITORY_MIN_FORCE,
      CONFIG.TERRITORY_CORE_FORCE,
      CONFIG.TERRITORY_CORE_RADIUS
    ),
    };
  }, [
    places,
    CONFIG.TERRITORY_BLOB_RADIUS,
    CONFIG.TERRITORY_MIN_FORCE,
    CONFIG.TERRITORY_CORE_FORCE,
    CONFIG.TERRITORY_CORE_RADIUS,
  ]);

  // 要標名字的勢力區域；同時當成位置表與名字表的共同來源，兩者才會對齊 /
  // The regions worth labelling. This is the single source for both the positions
  // and the names, so the two lists cannot drift out of index alignment.
  const territoryRegions = useMemo(() => {
    if (!territory.field) return [];
    return factionRegions(territory.field)
      .filter(
        (region) =>
          region.cellCount >= CONFIG.TERRITORY_MIN_LABEL_CELLS
      )
      .slice(0, CONFIG.TERRITORY_MAX_LABELS);
  }, [territory]);

  const territoryLabels = useMemo(
    () =>
      territoryRegions.map((region) => {
        const faction = factions.find((entry) => entry.id === region.key);
        const raw = faction?.color ?? CONFIG.MAP_LABEL_FALLBACK_FACTION;
        return {
          id: region.key,
          name: faction?.name ?? '',
          // 名字壓在半透明的同色領地上會整個暗掉，所以朝白色調亮；色相不變 /
          // The name sits on a translucent tint of its own colour and goes muddy on it,
          // so mix toward white; the hue is unchanged
          color: brightenColor(raw, CONFIG.TERRITORY_LABEL_LIGHTEN),
        };
      }),
    [territoryRegions, factions]
  );

  // ── 勢力名字的 DOM 元素 / DOM elements for the faction names
  // 位置每幀用 transform 寫，不進 state / Positioned per frame with a transform, never state
  const territoryLabelEls = useRef<Array<HTMLSpanElement | null>>([]);

  // ── 領地圖層 / Territory layer ──────────────────────────────────────────────
// 拉遠時把「節點 + 道路」換成「每個地方所佔的面積」，類似 Stellaris 星系圖或
// CK3 省份圖。這是最底層，掛 afterRender 重繪（沒有額外 rAF，閒置時零成本），
// 而且只有鏡頭確實拉遠時才開啟互動。
// When zoomed out this replaces "nodes + roads" with the area each place covers,
// like a Stellaris galaxy map or CK3's province map. It is the bottom-most
// layer, redrawn on afterRender (no extra rAF, so an idle map costs nothing),
// and it only takes pointer events while the
// camera is genuinely zoomed out.
useEffect(() => {
  const sigma = sigmaRef.current;
  const graph = graphRef.current;
  const canvas = territoryRef.current;
  const container = containerRef.current;
  const surface = surfaceRef.current;
  if (!sigma || !graph || !canvas || !container || !surface) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

// 密度場與調色盤都在 render 期間算好了（見上方 useMemo），這裡只負責畫 /
  // The field and palette were computed during render (see the useMemo above);
  // this effect only draws
  const { sites, field } = territory;
  if (!field) return;
  // **不要**在這裡把 `territoryLabelEls.current` 重設成 null。這個 effect 跑在
  // render/commit 之後，而 `<span>` 的 ref 回呼是由 React 在 commit 階段填的；重設
  // 會把剛綁好的元素清掉，於是 draw() 的 label 迴圈每次都 `continue`，名字就永遠
  // 停在 opacity 0 且沒有 transform（實測：元素在 DOM 裡、文字與顏色都正確，但
  // 停在 left:0/top:0）。
  //
  // **Never** reset `territoryLabelEls.current` here. This effect runs after
  // render/commit, while the `<span>` refs are attached by React during commit;
  // resetting wipes the elements that were just bound, so draw()'s label loop hits
  // `continue` every time and the names stay at opacity 0 with no transform.
  // Measured symptom: the element is in the DOM with the right text and colour, but
  // pinned at left:0/top:0.
  //
  // 元素數只增不減：多出來的槽位是 `undefined`，同樣會被 `continue` 跳過，所以不需要
  // 在這裡對齊長度。
  // The array only ever grows; surplus slots are `undefined` and are skipped by the
  // same guard, so there is no length bookkeeping to do here.

  // 每個勢力索引的 RGB；索引順序對應 field.factions。顏色一律經過 hslToHex，
  // 因為勢力色在資料庫裡是 hsl，WebGL 與 canvas 都要 hex。
  // RGB per faction index, in field.factions order. Colours always go through
  // hslToHex because faction colours are stored as hsl and both WebGL and canvas
  // need hex
  const colourOf = new Map<string, [number, number, number]>(
    factions.map((faction) => [faction.id, hexToRgb(hslToHex(faction.color))])
  );
  const palette: [number, number, number][] = field.factions.map(
    (key) => colourOf.get(key) ?? [55, 65, 81]
  );

  // ── 領地圖層的兩樣東西 / The two things the territory layer needs ─────────
  // **填色與邊界共用同一組平滑曲線**，所以兩者的邊緣完全一致：把封閉曲線填滿就是領地，
  // 再沿著同一條曲線描邊就是邊界。這取代了先前的離屏點陣圖——點陣圖的解析度等於格子
  // 解析度，拉近時邊緣永遠是階梯或糊的，而路徑填色是向量，任何縮放都平滑。
  //
  // **The fill and the border share one set of smoothed loops**, so their edges match
  // exactly: filling the closed curve is the territory, stroking the same curve is the
  // border. This replaces the offscreen bitmap — a bitmap's resolution is the grid's, so
  // zoomed in its edge is always a staircase or a blur, while a path fill is vector and
  // stays smooth at any zoom.
  const outlines = factionOutlines(field, 2);
  /** 邊界色 / the border colour */
  const borderRgb = CONFIG.TERRITORY_BORDER_RGB.split(',').map((v) => Number.parseInt(v.trim(), 10));
  /** 路徑快取：每個勢力的填色路徑只建一次 / one Path2D per faction, built once */
  const fillPaths = outlines.map((outline) => {
    const path = new Path2D();
    for (const loop of outline.loops) {
      path.moveTo(loop[0]!.x, loop[0]!.y);
      for (let i = 1; i < loop.length; i++) path.lineTo(loop[i]!.x, loop[i]!.y);
      path.closePath();
    }
    return path;
  });


  let viewWidth = 0;
  let viewHeight = 0;
  let dpr = 1;
  let lit: string | null = null;
  let hoveredPlaceId: string | null = null;

  const resize = () => {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    viewWidth = rect.width;
    viewHeight = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    draw();
  };

  const draw = () => {
    // 領地**永遠**可見，不隨縮放淡出。這是 Stellaris 的做法：星系地圖就是那張地圖，
    // 拉近只是看同一片的細節，而不是換成另一張「節點＋道路」的圖。舊版會在拉近時把
    // alpha 降到 0，於是那層半透明色塊整片消失，看起來像一層霧被吹散 —— 使用者指出
    // 的正是這個。
    //
    // The territory is **always** visible and never fades with zoom. This is the
    // Stellaris behaviour: the galaxy map *is* the map, and zooming in reveals detail
    // on the same surface rather than swapping in a different "nodes and roads" map.
    // The earlier version dropped alpha to 0 when zooming in, so the whole translucent
    // wash blew away and read as fog clearing — which is exactly what was reported.
    //
    // 因此 `territoryAlpha` 不再參與；`TERRITORY_ZOOM_RATIO` 仍留著，因為它決定什麼
    // 時候開始**顯示**領地（而不是淡出）。
    //
    // `territoryAlpha` is therefore out of the path; `TERRITORY_ZOOM_RATIO` stays,
    // because it still decides when the territory starts being *shown*.
    // 領地**永遠**可見（開關打開時），完全不看縮放比例。
    //
    // 先前的寫法是 `territoryAlpha(ratio, X, X)`，看起來像「把淡出區間收成一點」，
    // 但 `territoryAlpha` 是 `if (ratio >= fullAt) return 1; if (ratio <= goneAt) return 0;`
    // —— 兩個界限相等時，只有 `ratio >= X` 會回 1，`ratio < X`（也就是**拉近**）反而
    // 回到 0。所以那不是修好，只是把霧反過來：拉遠看得到、拉近看不到。
    //
    // The territory is **always** visible when the toggle is on, with no dependence on
    // zoom. The previous form, `territoryAlpha(ratio, X, X)`, looked like "collapse the
    // fade band to a point", but `territoryAlpha` reads
    // `if (ratio >= fullAt) return 1; if (ratio <= goneAt) return 0;` — with both bounds
    // equal, only `ratio >= X` returns 1, and `ratio < X` (zoom *in*) returns 0. So that
    // did not fix the fog, it merely inverted it: visible far out, gone up close.
    const alpha = showTerritory ? 1 : 0;

    // 這些不透明度由鏡頭即時決定，屬於執行期資料，所以直接寫在 DOM 上而不走
    // React state —— 每幀 setState 會讓整張地圖重新渲染 /
    // These opacities are camera-driven runtime data, so they are written
    // straight to the DOM instead of React state — a per-frame setState would
    // re-render the whole map
    // 領地是**疊在原圖上的半透明色層**，所以圖表本身**不會**淡出——這與較早的
    // 版本相反，那個版本把節點與道路淡到 0，等於把地圖整張換掉，正是使用者指出的
    // 「 Stellaris / CK3 是用地圖標出面積、不是另外畫一張圖」。
    // 節點發光層已經移除，所以這裡只有領地本身的 opacity。
    // The node glow layer is gone, so the territory's own opacity is the only one
    // written here.
    canvas.style.opacity = String(alpha);
    container.style.opacity = '1';
    // sigma 的 container **無條件**保留指標事件。它以前會在領地層啟用時被關掉，讓下面
    // 那層 canvas 收得到 hover / click —— 而那也正是本元件自己實作拖曳與滾輪的原因。
    // 兩者都已移除：相機歸 sigma 管，hover / 點選掛在外層 wrapper（見 surfaceRef），
    // 所以不必再把 container 移出指標路徑。把任何一個加回來就會讓雙寫入的 bug 重現。
    //
    // The sigma container keeps its pointer events **unconditionally**. It used to be
    // switched off while the territory layer was active so the canvas underneath could
    // receive hover and click — which is also why this component hand-rolled its own
    // drag and wheel. Both are gone: sigma owns the camera, and hover / selection bind
    // to the wrapper (see surfaceRef), so the container never has to leave the pointer
    // path. Re-adding either would resurrect the two-writer bug.

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    if (alpha <= 0) {
      // 領地關掉時要在這裡就把標籤收掉。否則會踩到這個 early return：下面的標籤迴圈
      // 根本不會執行，於是名字停在**上一次**的 opacity（實測是 1），領地沒了但名字
      // 還掛在畫面上。
      //
      // The labels must be hidden *here*, before the early return. Otherwise the label
      // loop below never runs and the names keep whatever opacity they last had
      // (measured: 1) — the territory is gone but its names stay on screen.
      for (const el of territoryLabelEls.current) {
        if (el) el.style.opacity = '0';
      }
      return;
    }

    // 把格子範圍對應到 viewport。這裡假設 camera angle 為 0（本專案兩處鏡頭
    // 動畫都明確傳了 angle: 0），因此圖→viewport 只是縮放加平移。
    // Map the grid extent onto the viewport. This assumes camera angle 0 — both
    // camera animations here pass angle: 0 explicitly — so graph→viewport is a
    // scale plus a translation.
    const litIndexForBorder = lit === null ? -1 : field.factions.indexOf(lit);
    const topLeft = sigma.graphToViewport({ x: field.minX, y: field.minY });
    const bottomRight = sigma.graphToViewport({ x: field.maxX, y: field.maxY });
    const sx = (bottomRight.x - topLeft.x) / (field.maxX - field.minX);
    const sy = (bottomRight.y - topLeft.y) / (field.maxY - field.minY);

    // 邊界要清楚，所以**關閉**平滑：開著會把 Voronoi 的格子糊成一片漸層，
    // 那正是「不像 Stellaris」的原因。rim light 也只有在硬邊下才看得見。
    // Crisp boundaries need smoothing OFF — with it on, the Voronoi cells blur
    // into gradients, which is exactly why this did not read as Stellaris. The
    // rim light is only visible on hard edges too.
    // 這裡要**開啟**平滑：密度場本來就已經把邊界算成曲線，開平滑只是讓格子邊界
    // 不再露出階梯，得到星雲一樣的有機形狀。這與 Voronoi 版本相反 —— 那個版本
    // 關了平滑會變像素塊，開了則糊掉。
    // Smoothing stays ON here, the opposite of the Voronoi version: the density
    // field already computes the border as a curve, so smoothing only removes the
    // last of the cell stepping and gives the organic nebula-like shape.
    // 填色用平滑貼上：密度場本身就把邊界算成曲線，平滑只去掉最後的格子階梯 / 
    // The fill is blitted smoothed: the density field already computes the border as a
    // curve, so smoothing only removes the last of the cell stepping.
    // 填色**關閉**平滑：整塊領地要是同一個顏色，開平滑會把邊緣糊成漸層（就是那個
    // 「霧」）。每個格子用同一個顏色與同一個 alpha 填滿，所以區塊內部完全一致；邊緣的
    // 階梯由上面那條向量邊界線蓋掉，所以關平滑不會變成馬賽克。
    //
    // The fill is drawn with smoothing **off**: an area must be one flat colour, and
    // smoothing blurs its edge into a gradient — the fog. Every cell of a faction uses
    // the same colour and the same alpha, so the interior is uniform, and the staircase
    // at the rim is covered by the vector border stroked on top, so it does not turn
    // into a mosaic.
    ctx.transform(sx, 0, 0, sy, topLeft.x - field.minX * sx, topLeft.y - field.minY * sy);

    // 填色：直接把同一組平滑曲線填滿。這是**平塗**（單一顏色、單一 alpha），所以不會
    // 有霧；而它的邊緣就是那條曲線，與邊界完全重合。
    //
    // Fill: flood the same smoothed loops. It is **flat** (one colour, one alpha), so
    // there is no fog, and its edge *is* the curve — identical to the border.
    for (let i = 0; i < outlines.length; i++) {
      const outline = outlines[i]!;
      const colour = palette[outline.faction] ?? [55, 65, 81];
      // 被 hover 的勢力整片打亮、其餘壓暗，一眼看出「這塊是誰的」/
      // Lighten the hovered faction's whole region and dim the rest
      const fillAlpha =
        litIndexForBorder < 0
          ? CONFIG.TERRITORY_FILL_ALPHA
          : outline.faction === litIndexForBorder
            ? Math.min(1, CONFIG.TERRITORY_FILL_ALPHA + CONFIG.TERRITORY_HOVER_ALPHA)
            : CONFIG.TERRITORY_FILL_ALPHA * 0.45;
      ctx.fillStyle = `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${fillAlpha})`;
      ctx.fill(fillPaths[i]!);
    }

    // 邊界：平滑曲線，用同一個 transform 以 stroke 畫，所以線寬與解析度都跟螢幕一致。
    // 線寬以螢幕像素指定，所以要除掉這個 transform 的平均縮放。
    //
    // The border is stroked under the **same transform**, so its width and resolution
    // track the screen rather than the grid. The width is in screen pixels, so divide out
    // the transform's average scale.
    const borderScale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
    ctx.lineWidth = CONFIG.TERRITORY_BORDER_PX / borderScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const rgb = `${borderRgb[0] ?? 226}, ${borderRgb[1] ?? 240}, ${borderRgb[2] ?? 255}`;
    for (const outline of outlines) {
      // 被 hover 的那一塊畫亮一點，其餘維持一般透明度 /
      // The hovered claim is stroked brighter; the rest keep the normal alpha
      const alphaFor =
        litIndexForBorder < 0
          ? CONFIG.TERRITORY_BORDER_ALPHA
          : outline.faction === litIndexForBorder
            ? CONFIG.TERRITORY_BORDER_HOVER_ALPHA
            : CONFIG.TERRITORY_BORDER_ALPHA * 0.6;
      ctx.strokeStyle = `rgba(${rgb}, ${alphaFor})`;
      for (const loop of outline.loops) {
        ctx.beginPath();
        ctx.moveTo(loop[0]!.x, loop[0]!.y);
        for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i]!.x, loop[i]!.y);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 勢力名字：位置由重心算，但每幀只寫 transform，不進 React state /
    // Faction names: positioned from the centroid, but only the transform is
    // written per frame — never React state
    // 名稱只在**夠遠**的時候顯示。拉近到看得清某個地點時就收起來，讓節點與地名自己
    // 說話——否則帝國名會壓在它自己的城市上面。門檻在 config。
    //
    // Names show only while **far enough** out. Zoomed in to where a place is readable,
    // they are hidden so the node and place name are unobstructed — otherwise the empire
    // name sits on top of its own city. The threshold is config.
    const showLabels =
      alpha > 0.6 && sigma.getCamera().ratio >= CONFIG.TERRITORY_LABEL_SHOW_ABOVE_RATIO;
    for (let i = 0; i < territoryLabelEls.current.length; i++) {
      const el = territoryLabelEls.current[i];
      const region = territoryRegions[i];
      if (!el || !region) continue;
      if (!showLabels) {
        el.style.opacity = '0';
        continue;
      }

      // ── 錨點與字級必須用**同一個座標系**──
      //
      // `territoryRegions` 已經決定了名字會不會轉、以及矩形沿哪個座標系量，並且驗證過
      // 整塊矩形都落在自己領地內。**這裡只負責照著畫**，不再從 `elongation` 重新判斷一次
      // —— 那正是「名字跑到領地外面」的成因：一塊 elongation 1.42、主軸歪 57° 的領地，
      // 這裡不轉（水平畫），但矩形是沿那條歪軸量的，於是四個角有三個落在自己地盤之外。
      //
      // The anchor and the size must come from the **same frame**. `territoryRegions` has
      // already decided whether the name rotates and measured the rectangle in that same
      // frame, verified to lie wholly inside this faction's claim. This block only **draws**
      // that decision and never re-derives it from `elongation` — which is exactly what put
      // names off their own land: an elongation-1.42 claim with a 57° axis was drawn
      // horizontally while its rectangle was measured along that tilted axis, so three of
      // four corners landed outside.
      const anchor = sigma.graphToViewport({ x: region.labelX, y: region.labelY });

      // 這個 transform 的平均縮放：把圖座標的半徑換成螢幕像素 /
      // the transform's average scale, to turn a graph-space radius into screen pixels
      const scale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;

      // 先量「100px 時文字多大」再解字級，兩邊都必須是實測值 /
      // Measure the text at 100px first, then solve; both inputs are real measurements
      el.style.fontSize = '100px';
      const { fontSize, legible } = solveLabelFontSize({
        widthAt100: el.offsetWidth || 1,
        heightAt100: el.offsetHeight || 1,
        radiusPx: region.labelRadius * scale,
        // 驗證過整塊都在自己領地內、而且沿**畫字用的那個座標系**量出來的矩形：
        // 這才是「可以用到哪裡」/
        // The rectangle measured in **the frame the name is drawn in**, verified to lie
        // wholly inside this faction's claim — that is the space the name may actually use
        availAlongPx: region.halfAlong * scale,
        availAcrossPx: region.halfAcross * scale,
        fit: CONFIG.TERRITORY_LABEL_FIT,
        fontMax: CONFIG.TERRITORY_LABEL_FONT_MAX,
        fontMin: CONFIG.TERRITORY_LABEL_FONT_MIN,
        // 光暈（em）算成名字大小的一部分 / the glow (in em) counts toward the name's size
        glowEm: CONFIG.TERRITORY_LABEL_GLOW_EM,
      });
      // 小到看不清就整個不畫。**不要**把它放大到看得見——放大正是會讓它溢出領地的那件事，
      // 而領地裡一個四像素的髒點比沒有名字更糟。拉近時字級本來就會變大，名字會自己回來。
      //
      // Too small to read means not drawn at all. Do **not** scale it up until it reads: that is
      // precisely the operation that would push it off its claim, and a four-pixel smudge inside
      // a territory is worse than no name. Zooming in grows the size, so it comes back on its own.
      if (!legible) {
        el.style.opacity = '0';
        continue;
      }
      el.style.fontSize = `${fontSize.toFixed(1)}px`;

      // 旋轉與角度都是 `territoryRegions` 算好的，這裡只讀不推 —— 見上面的說明 /
      // The rotation and its angle were both decided in `territoryRegions`; read them, do
      // not re-derive them — see the note above
      const deg = region.labelAngleDeg;

      // `origin-top-left` 是**必要**的，旋轉時尤其。`transform-origin` 預設 `50% 50%`，
      // 於是整條變換鏈（含 `translate(-50%,-50%)`）都會繞元素自己的中心旋轉：名字被推開
      // `(R(deg) − I)·(−hw, −hh)`。deg = 0 時剛好為 0，所以未旋轉的名字一直正常；轉起來
      // 之後偏移和名字一樣大 —— −78° 的四字名在 62×14 的框上偏了 (17.7, 35.9)px，整個跑到
      // 領地外面。`origin-top-left` 讓 `translate(-50%,-50%)` 之後的 (0,0) 落在左上角，
      // 於是旋轉繞錨點發生，中心就精確落在錨點上。
      //
      // `origin-top-left` is **load-bearing**, and especially once the name rotates.
      // `transform-origin` defaults to `50% 50%`, so the whole chain — including
      // `translate(-50%,-50%)` — is rotated about the element's own centre, displacing the
      // name by `(R(deg) − I)·(−hw, −hh)`. That is exactly 0 at deg = 0, which is why
      // unrotated names were always fine; once rotated the offset is as large as the name
      // itself — a −78° four-glyph name in a 62×14 box shifted by (17.7, 35.9)px and landed
      // off its claim entirely. With `origin-top-left` the `translate(-50%,-50%)` puts the
      // origin at the top-left corner, so the rotation happens about the anchor and the box
      // lands on it exactly.
      el.style.opacity = '1';
      el.style.transform = `translate(${anchor.x}px, ${anchor.y}px) rotate(${deg}deg) translate(-50%, -50%)`;
    }
  };

  // 勢力的總兵力需要「每個地方的將領兵力」。這與建圖時那份 `troopsPerPlace` 是同一份
  // 資料，所以要重算一次——兩處各自快取只會有一份過期，而勢力提示會安靜地少報兵力。
  //
  // The faction total needs each place's leader troops. It is the same data as the
  // graph-build `troopsPerPlace`, so it is recomputed here: two independent caches means one
  // of them goes stale, and the faction tooltip silently under-reports its troops.
  const troopsAtPlace = new Map<string, number>();
  for (const char of characters) {
    if (!char.alive) continue;
    troopsAtPlace.set(char.placeId, (troopsAtPlace.get(char.placeId) ?? 0) + char.troops);
  }

  // 勢力 id → 名稱 / 色 / 控制的地方數 / 兵力 / 將領數 / 君主，tooltip 用 /
  // Faction id → name / colour / owned place count / troops / leader count / king, for the
  // tooltip. Counted from the places rather than the density field, so the numbers match
  // what the rest of the UI calls this faction's holdings.
  //
  // **兵力用「駐軍 + 將領兵力」，與地方提示和節點大小同一個定義。** 若勢力提示改用另一個
  // 口徑（例如只有駐軍），讀者會看到「這個勢力 300 兵」，點進某個地方卻寫「將領兵力 200」
  // —— 兩個數字沒有任何關係可推。
  //
  // **Troops use "garrison + leader troops", the same definition as the place tooltip and the
  // node size.** If the faction tooltip used a different basis (garrison only), the reader
  // would see "this faction has 300 troops" and then open a place reading "leader troops 200",
  // with no way to relate the two.
  const factionInfo = new Map<
    string,
    {
      name: string;
      color: string;
      placeCount: number;
      troops: number;
      leaderCount: number;
      kingName: string | null;
    }
  >(
    factions.map((faction) => [
      faction.id,
      {
        name: faction.name,
        color: faction.color,
        placeCount: 0,
        troops: 0,
        leaderCount: 0,
        kingName: null,
      },
    ])
  );
  const kingNameById = new Map(characters.map((c) => [c.id, c.name]));
  for (const faction of factions) {
    const entry = factionInfo.get(faction.id);
    if (entry && faction.kingId) {
      entry.kingName = kingNameById.get(faction.kingId) ?? null;
    }
  }
  // 勢力的將領數只算**活著的**，而且是依 `factionId` 算，不是依「站在哪個地方」。
  // 一位已經離開本勢力地盤、但還沒轉投別人的將領，他仍然算這個勢力的人——這跟
  // `loans`/勢力排行用的是同一個口徑，所以三個面板的數字才會一致。
  for (const char of characters) {
    if (!char.alive || !char.factionId) continue;
    const entry = factionInfo.get(char.factionId);
    if (entry) entry.leaderCount += 1;
  }
  for (const place of places) {
    if (!place.factionId) continue;
    const entry = factionInfo.get(place.factionId);
    if (!entry) continue;
    entry.placeCount += 1;
    // 節點大小的同一個算式 / the node-size formula, unchanged
    entry.troops += (place.garrison + (troopsAtPlace.get(place.id) ?? 0));
  }

  /**
   * 地名字級，必須和 `nodeReducer` 用**完全相同**的算式 —— 這裡算錯，標籤的命中框就會
   * 和實際畫出來的文字對不準，而那正是這個功能唯一要做的事。
   *
   * The label size, and it must use **exactly** the same expression as `nodeReducer`: get this
   * wrong and the hit box stops lining up with the text actually drawn, which is the only
   * thing this feature has to get right.
   */
  const labelSizeOf = (size: number): number =>
    Math.max(14, Math.min(20, size / 2));

  /**
   * 地名文字寬度，**量**出來而不是用字數估算。中文約 1em、拉丁約 0.55em，用字數估出來的
   * 數字會整個錯一個量級，於是命中框不是太寬就是太窄。
   *
   * The label's text width, **measured** rather than estimated from the character count. CJK
   * runs about 1em and Latin about 0.55em, so a character-count estimate is wrong by an order
   * of magnitude and the hit box comes out far too wide or too narrow.
   *
   * 結果依 `地點 + 字級` 快取：每次 mousemove 都對每個地點量一次太貴，而名字不會變，
   * 字級也只在兵力跨過門檻時才動。快取在圖形重建時清掉。
   *
   * Cached per `place + size`: measuring every place on every mousemove is far too expensive,
   * and a name never changes while the size only moves when the garrison crosses a threshold.
   * The cache is cleared when the graph is rebuilt.
   */
  const measureLabelWidth = (
    node: string,
    label: string,
    size: number
  ): number => {
    const cache = labelWidthCacheRef.current;
    const key = `${node}:${size}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    // 字體必須和 sigma 的 `labelFont` / `labelWeight` 一致，否則量到的是另一種字寬 /
    // The font has to match Sigma's `labelFont` / `labelWeight`, or a different width is
    // measured.
    ctx.font = `bold ${labelSizeOf(size)}px monospace`;
    const w = ctx.measureText(label).width;
    cache.set(key, w);
    return w;
  };

  /**
   * 游標是否指在某個**地方**節點上（螢幕距離）。
   * Whether the cursor is over a *place* node, in screen distance.
   *
   * 領地視圖裡地方節點仍然可見（只是被半透明的領地層蓋住），所以游標指到某個地方時
   * **仍然要顯示地方提示**；只有指在勢力的一整片面積上時才顯示勢力提示。這兩種
   * 提示的差別不在於「有沒有節點」，而在於「節點是不是真的在游標底下」。
   *
   * Place nodes stay visible under the translucent territory layer, so pointing
   * *at a place* must still show the place tooltip; the faction tooltip is for when
   * the cursor is over a whole area of someone's land. The distinction is not "are
   * there nodes" but "is a node actually under the cursor".
   */
  const placeUnderCursor = (vx: number, vy: number): TerritorySite | null => {
    let best: TerritorySite | null = null;
    // `CONFIG` 是 `as const`，所以 `CONFIG.TERRITORY_PLACE_HOVER_PX` 的型別是字面值
    // `14` 而不是 `number`。若讓型別從它推斷，`bestDistance` 就會被鎖成 `14`，
    // 接著 `bestDistance = d`（number）就編譯不過。必須顯式標成 `number`。
    // `CONFIG` is `as const`, so that value's type is the literal `14`, not `number`.
    // Inferred, `bestDistance` would be pinned to `14` and assigning a plain `number`
    // would not compile. It has to be annotated explicitly.
    let bestDistance: number = CONFIG.TERRITORY_PLACE_HOVER_PX;
    for (const site of sites) {
      const vp = sigma.graphToViewport({ x: site.x, y: site.y });
      const d = Math.hypot(vp.x - vx, vp.y - vy);
      if (d < bestDistance) {
        bestDistance = d;
        best = site;
        continue;
      }
      // 圓盤之外不算「指到這個地方」—— **但地名標籤算**。
      //
      // Outside the disc does not mean "not pointing at this place" — but its **name label**
      // does. Sigma's built-in label sits to the *right* of the disc, so the name is routinely
      // under the cursor while the forced labels (its own and its neighbours') are on screen.
      // Without this, moving onto the name made every one of those labels vanish while the
      // cursor was still resting on one of them.
      //
      // 星系層的地名畫在**正上方**，而且星系本身就很大，所以圓盤命中已經涵蓋得到，那裡
      // 不特別處理標籤。
      //
      // At star zoom the name is drawn *above* the system and the system is already large, so
      // the disc hit covers it and the label needs no special case there.
      if (cameraRatioRef.current <= CONFIG.MAP_STAR_ZOOM_RATIO) continue;
      // **地名沒有被畫出來時，它就不能算命中區。** 拉遠到 `LABEL_ZOOM_RATIO` 之上，
      // `nodeReducer` 會把 label 設成 `null` —— 名字根本不在螢幕上，卻還讓它攔截游標的話，
      // 就會出現「這裡明明什麼都沒有，游標卻一直黏著某個地方」。
      //
      // A name that is **not drawn** must not be a hit target. Past `LABEL_ZOOM_RATIO`,
      // `nodeReducer` nulls every label: nothing is on screen, so letting it capture the
      // cursor produces "there is visibly nothing here, yet the cursor stays glued to a place".
      if (!labelsVisibleRef.current) continue;
      const attrs = graph.getNodeAttributes(site.id) as {
        size: number;
        label?: unknown;
      };
      if (typeof attrs.label !== 'string' || attrs.label.length === 0) continue;
      const rect2 = placeLabelRect({
        cx: vp.x,
        cy: vp.y,
        radius: sigma.scaleSize(attrs.size),
        textWidth: measureLabelWidth(site.id, attrs.label, attrs.size),
        labelSize: labelSizeOf(attrs.size),
      });
      if (pointInRect(vx, vy, rect2)) {
        // 標籤命中算「零距離」：它比圓盤命中更貼近意圖，必須贏過任何圓盤 /
        // A label hit counts as distance zero: it is closer to the reader's intent than any
        // disc hit, so it must win.
        bestDistance = 0;
        best = site;
      }
    }
    return best;
  };

  const onMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const vx = event.clientX - rect.left;
    const vy = event.clientY - rect.top;
    const graphPoint = sigma.viewportToGraph({ x: vx, y: vy });
    const territoryInteractive =
      showTerritory && cameraRatioRef.current >= CONFIG.TERRITORY_INTERACTIVE_RATIO;

    // ── 指到某個地方 → 地方提示 ──
    // 勢力領地是「面積」，但地方節點還是看得見、也還能互動，所以指到它就顯示它。
    // 先做這一步，否則下面用密度場回答「這塊是誰的」會讓地方自己的提示永遠被蓋掉。
    //
    // Pointing at a place → the place tooltip. Territory is an *area*, but the place
    // nodes are still visible and still interactive under it, so pointing at one has to
    // show that one. This runs first, otherwise answering "whose ground is this" from
    // the density field would permanently mask the place's own tooltip.
    const site = placeUnderCursor(vx, vy);
    if (site) {
      const attrs = graph.getNodeAttributes(site.id) as {
        placeData: Place;
        factionData: Faction | null;
        leaderTroops: number;
        administratorName: string | null;
        factionRulerName: string | null;
        leaders: PlaceLeader[];
      };
      setTooltip({
        kind: 'place',
        x: vx,
        y: vy,
        place: attrs.placeData,
        faction: attrs.factionData,
        leaderTroops: attrs.leaderTroops,
        administratorName: attrs.administratorName,
        factionRulerName: attrs.factionRulerName,
        leaders: attrs.leaders,
        // 與 `enterNode` **走同一個 helper**。
        //
        // Through the **same helper** as `enterNode`.
        //
        // 這裡原本是空的 `[]`，註解寫「這個視圖裡道路是隱藏的」—— 那是錯的：道路無條件
        // 加入圖（`graph.addEdge`，沒有任何 `hidden` 設定），在領地視圖裡完全看得見。
        //
        // It used to be a literal `[]`, commented "roads are hidden in this view" — which is
        // false: edges are added unconditionally (`graph.addEdge`, with no `hidden` setting
        // anywhere) and are fully visible in the territory view.
        //
        // 而且這個空白其實**永遠看不到**，因為它寫得太晚：wrapper 的 `mousemove` 是冒泡
        // 到 sigma container 之後才跑的，所以它覆蓋掉 `enterNode` 剛寫好的完整提示。
        // 於是指向節點時會有兩個提示在搶，最後留下的一定是沒有「相連地點」的那一個。
        //
        // And the empty version was never actually visible anyway, because it wrote too
        // late: this wrapper's `mousemove` bubbles *after* sigma's container listener, so it
        // overwrote the complete tooltip `enterNode` had just written. Two tooltips were
        // fighting over the same place and the one without the linked places always won.
        linkedPlaces: linkedPlaceNames(graph, site.id),
      });
      // 這一條路徑也要設定 hover 狀態，否則指到節點時不會像 `enterNode` 那樣把相連
      // 地點的名稱強制顯示出來 —— 同一個節點，兩條路徑給兩種待遇。
      //
      // This path has to set the hover state too, or pointing at a node does not force its
      // neighbours' names the way `enterNode` does — the same node, two different treatments.
      if (hoveredNodeRef.current !== site.id) {
        hoveredNodeRef.current = site.id;
        hoveredNeighborsRef.current = new Set(graph.neighbors(site.id));
        sigma.refresh();
      }
      canvas.style.cursor = 'pointer';
      hoveredPlaceId = site.id;

      // 仍然把游標底下那格的勢力打亮，維持「這片是誰的」 /
      // Still light whichever faction owns the ground under the cursor, so
      // "whose land is this" keeps reading. Skipped when zoomed in past the interactive
      // ratio: there the area layer is only a backdrop, and lighting it would be the area
      // taking over the cursor from the node the pointer is actually on.
      const litKey = territoryInteractive
        ? factionAt(field, graphPoint.x, graphPoint.y)
        : null;
      if (litKey !== lit) {
        lit = litKey;
        draw();
      }
      return;
    }

    // ── 什麼都沒指到 → 把 hover refs 清掉 ──
    // 這一段是**必要**的，不是保險。上面這條路徑會設定 hover refs，而先前唯一的清除來源是
    // sigma 的 `leaveNode`；於是「離開圓盤、也離開地名」這一種情況，就完全沒有任何人負責
    // 清除 —— 地名與相連地名會一直留在畫面上，游標早就不知道自己在哪了。
    //
    // This branch is **load-bearing**, not a belt-and-braces. The branch above sets the hover
    // refs, and the only thing that used to clear them was Sigma's `leaveNode`. So the one case
    // of "off the disc and off the name" had nobody clearing them: the name and its neighbours'
    // names stayed on screen long after the cursor had lost track of them.
    //
    // **不能**踩掉 sigma 真正掛著的節點：`leaveNode` 與 `mousemove` 是同一個事件裡的兩個
    // 監聽器，若順序反過來，這裡會把 sigma 剛設好的 hover 清掉，節點名稱反而會閃一下不見。
    //
    // It must not trample a node Sigma is genuinely hovering: `leaveNode` and `mousemove` are two
    // listeners on one event, and if they run in the other order this would wipe the hover Sigma
    // just set, making the node's own name flash off.
    if (sigmaHoverRef.current === null && hoveredNodeRef.current !== null) {
      hoveredNodeRef.current = null;
      hoveredNeighborsRef.current = new Set();
      sigma.refresh();
    }

    // ── 指在勢力的一片面積上 → 勢力提示 ──
    // 問的是「游標底下這塊地屬於誰」，由**密度場**回答。用最近的地方會得到一個幾乎
    // 永遠跟游標無關的小節點，於是 hover 一整片領地卻顯示別的地方名字。
    // Over a faction's area → the faction tooltip. The *density field* answers "whose
    // ground is this". Asking for the nearest place instead names some unrelated node,
    // so hovering a whole region would report somewhere else entirely.
    // 領地圖層關掉時，這裡就不該再回答「這塊地是誰的」：那一層根本沒畫，提示會憑空
    // 冒出一個看不到的領地。地點提示（上面那段）不受影響，因為節點與道路還在。
    //
    // With the territory layer off, this must stop answering "whose ground is this":
    // the layer is not drawn, so the tooltip would describe a claim that is not on
    // screen. The place tooltip above is unaffected — nodes and roads remain.
    //
    // 拉近到 `TERRITORY_INTERACTIVE_RATIO` 以下時也一樣：那一段畫的是**節點與道路**，
    // 面積層只是底色，卻還會搶走游標的解讀權並把勢力色亮起來，看起來像 bug。
    //
    // The same applies once zoomed in past `TERRITORY_INTERACTIVE_RATIO`: that range is
    // showing **nodes and roads**, so the area layer is only a backdrop — yet it would
    // still take over the cursor's reading and light a faction's fill, which reads as a
    // bug.
    if (!territoryInteractive) {
      canvas.style.cursor = '';
      hoveredPlaceId = null;
      if (lit !== null) {
        lit = null;
        draw();
      }
      setTooltip(null);
      return;
    }

    const key = factionAt(field, graphPoint.x, graphPoint.y);
    if (key === null) {
      // 無主之地或空白：完全沒有提示，而不是錯顯示鄰居的勢力 /
      // Unowned or blank land: no tooltip at all, rather than wrongly naming a
      // neighbour whose claim would otherwise flow over it
      canvas.style.cursor = '';
      hoveredPlaceId = null;
      setTooltip(null);
      if (lit !== null) {
        lit = null;
        draw();
      }
      return;
    }

    const owner = factionInfo.get(key);
    setTooltip({
      kind: 'faction',
      x: vx,
      y: vy,
      name: owner?.name ?? key,
      color: owner?.color ?? CONFIG.MAP_TERRITORY_FALLBACK,
      placeCount: owner?.placeCount ?? 0,
      troops: owner?.troops ?? 0,
      leaderCount: owner?.leaderCount ?? 0,
      kingName: owner?.kingName ?? null,
    });
    canvas.style.cursor = 'default';
    // 點在勢力面積上不聚焦任何地方（用戶要求：面積上不顯示地方提示）/
    // Clicking a faction's area focuses nothing — hovering an area must not surface a
    // place tooltip
    hoveredPlaceId = null;

    if (key !== lit) {
      lit = key;
      draw();
    }
  };

  const onLeave = () => {
    canvas.style.cursor = '';
    hoveredPlaceId = null;
    setTooltip(null);
    // `onMove` 現在也會設定 hover refs（與 `enterNode` 同一套待遇），所以離開這一層
    // 時必須一起清掉，否則會留下一個永遠亮著、還強制顯示名稱的節點。
    //
    // `onMove` now sets the hover refs too (the same treatment `enterNode` gets), so leaving
    // has to clear them, or a node is left permanently highlighted with a forced label.
    hoveredNodeRef.current = null;
    hoveredNeighborsRef.current = new Set();
    sigmaRef.current?.refresh();
    if (lit !== null) {
      lit = null;
      draw();
    }
  };

  // ── 縮放與平移 ──/ Zoom and pan
  // 領地層啟用時 sigma 容器是 pointer-events:none（否則底下的這層收不到
  // hover），代價是 sigma 自己的 wheel/drag 監聽也一起失效——於是拉遠視圖
  // 完全不能縮放與平移。這裡直接驅動相機補回來。
  // While the territory layer owns the pointer, the sigma container is
  // pointer-events:none (otherwise this lower layer never sees hover), and the
  // cost is that sigma's own wheel/drag handlers go deaf too — so the zoomed-out
  // view could not be zoomed or panned at all. Drive the camera directly here.

  // 拖曳與縮放**完全交給 sigma**。
  //
  // Drag and zoom belong to sigma, full stop.
  //
  // 這裡曾經自己實作一套拖曳：把 viewport 像素位移乘上 `graphToViewport` 算出來的
  // 比例，再寫進 camera。那是錯的 —— camera 的 x / y 活在 sigma 的**框化（framed）**
  // 空間，而 `graphToViewport` 的比例是從圖座標推出來的，兩者相差一個 normalization
  // 比例，所以每次移動的量都不對。
  //
  // The hand-rolled version scaled the viewport pixel delta by a ratio derived from
  // `graphToViewport` and wrote the camera itself. That was wrong: the camera's x / y
  // live in sigma's **framed** space, while that ratio is derived in graph space, and
  // the two differ by the normalization ratio — so every pan moved the wrong distance.
  //
  // 真正的問題是**有兩個寫入者**。sigma 的 MouseCaptor 把 mousedown 掛在 container、
  // mousemove 掛在 `document`，會自己算增量並寫 camera；而 `draw()` 又把 container 的
  // `pointer-events` 關掉、讓位給下面那層 canvas，於是本層接手拖曳 —— 兩套邏輯互相
  // 覆蓋。這就是為什麼 shake **只在 territory 模式出現**：非 territory 模式走 sigma
  // 的路徑，完全正常。
  //
  // The real defect was **two writers**. Sigma's MouseCaptor binds mousedown to the
  // container and mousemove to `document`, computes the delta and writes the camera;
  // `draw()` then switched the container's `pointer-events` off to let the canvas
  // underneath take over, and this layer panned as well. Two implementations
  // overwriting each other is why the shake appeared **only** in territory view — the
  // non-territory path went through sigma and was fine.
  //
  // 現在只留「有沒有在拖曳」，給 hover 與 click-after-drag 用。鏡頭一次都不碰。
  // All that remains is whether a drag is in progress, which hover and
  // click-after-drag need. The camera is never written from this component.
  let dragging = false;
  let draggedFar = false;
  /** 一次影格只重畫一次覆蓋層 / one overlay repaint per animation frame */
  let overlayFrame = 0;
  const gestureStart = { px: 0, py: 0 };

  const onSurfaceDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    draggedFar = false;
    gestureStart.px = event.clientX;
    gestureStart.py = event.clientY;
  };

  const onSurfaceMove = (event: MouseEvent) => {
    if (dragging) {
      // 拖曳中不做 hover：`onMove` 每一次 mousemove 都會掃過全部據點，並且
      // `setTooltip` 會觸發一次 React render。拖曳時游標每秒能送幾十次
      // mousemove，那份成本只會讓低倍率下的地圖看起來在抖。
      //
      // No hover while dragging: `onMove` scans every place and `setTooltip` forces a
      // React render, on every mousemove. A drag delivers dozens per second, and that
      // cost only shows up as the map appearing to judder.
      if (
        Math.abs(event.clientX - gestureStart.px) > 3 ||
        Math.abs(event.clientY - gestureStart.py) > 3
      ) {
        draggedFar = true;
      }
      return;
    }
    onMove(event);
  };

  const onSurfaceUp = () => {
    dragging = false;
  };

  const onClick = () => {
    // 拖曳之後瀏覽器還是會送 click；那時不該順手把地點聚焦 /
    // The browser still fires click after a drag, and focusing a place then
    // would be an accident
    if (draggedFar) {
      draggedFar = false;
      return;
    }
    if (hoveredPlaceId) focusPlaceRef.current?.(hoveredPlaceId);
  };

  // hover / 點選掛在**外層 wrapper**，不是領地 canvas：sigma 的 container 在 DOM 上位於
  // 領地 canvas，而且必須保持 `pointer-events`，所以事件只能靠冒泡到這一層。
  //
  // Hover and selection bind to the wrapper, not the territory canvas: the sigma
  // container sits above the canvas in the DOM and must keep its pointer events, so
  // events only reach the wrapper by bubbling.
  surface.addEventListener('mousemove', onSurfaceMove);
  surface.addEventListener('mouseleave', onLeave);
  surface.addEventListener('click', onClick);
  surface.addEventListener('mousedown', onSurfaceDown);
  window.addEventListener('mouseup', onSurfaceUp);
  sigma.on('afterRender', draw);
  // 領地層的投影完全取決於鏡頭，所以**任何**改到鏡頭的來源都必須重畫它。綁在
  // afterRender 上不可靠 —— 實測拖曳時 afterRender 不一定叫得到這裡，領地層就變成
  // 凍住的半透明底圖，被正在移動的圖層從下面拖走。
  //
  // The territory projection comes entirely from the camera, so *any* source that
  // moves it must repaint it. `afterRender` is not reliable here: measured, it does not
  // always reach this handler during a drag.
  const scheduleOverlay = () => {
    // 鏡頭每次移動都把 ratio 寫進 ref，供 `onMove` 那個穩定閉包讀取 /
    // Mirror the ratio into the ref on every camera move, for the stable `onMove` closure
    cameraRatioRef.current = sigma.getCamera().ratio;
    // 跨過 `TERRITORY_INTERACTIVE_RATIO` 時，已經亮起來的勢力色與地點提示必須**立刻**
    // 清掉：它們是在比例還算大的時候產生的，若留著，玩家在拉近之後仍會看到一個已經
    // 不該互動的面積層留下來的殘影（而且沒有任何游標移動去觸發重新判定）。
    //
    // Crossing `TERRITORY_INTERACTIVE_RATIO` must clear the highlight and tooltip at
    // once: they were produced while the ratio was still large, and left in place they
    // would linger as the residue of an area layer that is no longer interactive — with
    // no cursor movement to trigger a fresh decision.
    const interactive =
      showTerritory && cameraRatioRef.current >= CONFIG.TERRITORY_INTERACTIVE_RATIO;
    if (!interactive && (lit !== null || hoveredPlaceId !== null)) {
      lit = null;
      hoveredPlaceId = null;
      canvas.style.cursor = '';
      setTooltip(null);
    }
    if (overlayFrame) return;
    overlayFrame = window.requestAnimationFrame(() => {
      overlayFrame = 0;
      draw();
    });
  };
  sigma.getCamera().on('updated', scheduleOverlay);
  sigma.on('resize', resize);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(surface);

  resize();

  return () => {
    surface.removeEventListener('mousemove', onSurfaceMove);
    surface.removeEventListener('mouseleave', onLeave);
    surface.removeEventListener('click', onClick);
    surface.removeEventListener('mousedown', onSurfaceDown);
    window.removeEventListener('mouseup', onSurfaceUp);
    sigma.off('afterRender', draw);
    // 重畫掛在鏡頭上，所以監聽也必須一起拆掉；沒排队的影格也要取消，否則
    // effect 重跑時會畫到已經被卸載的畫布上。
    // The repaint rides on the camera, so its listener must come off too, and any
    // queued frame must be cancelled or an effect re-run paints a detached canvas.
    sigma.getCamera().removeListener('updated', scheduleOverlay);
    if (overlayFrame) window.cancelAnimationFrame(overlayFrame);
    overlayFrame = 0;
    sigma.off('resize', resize);
    resizeObserver.disconnect();
    // 離開時一定要還原，否則 sigma 會永久失去指標事件 /
    // Restore on the way out, or sigma loses pointer events for good
    container.style.opacity = '';
    canvas.style.opacity = '';
  };
  }, [places, factions, showTerritory]);

  useEffect(() => {
    // 清除 hover refs 並重繪。sigma 內部的 hoveredNode / highlightedNodes
    // 殘留由自訂 defaultDrawNodeHover 過濾，因此這裡只需清除 refs。
    // Clear hover refs and redraw. Residual sigma internal hover state is
    // filtered out by the custom defaultDrawNodeHover, so only refs need clearing.
    hoveredNodeRef.current = null;
    hoveredNeighborsRef.current = new Set();
    sigmaRef.current?.refresh();
  }, [selectedPlaceId]);


  // ── 聚光燈環 + 移動動畫（覆蓋畫布）────────────────────────────────────────
  // 每幀用當前鏡頭座標重繪：新生成 / 被攻擊地點顯示脈動發光環；
  // 本回合的移動以光點沿起點 → 終點行進（週期：行進 → 停頓）。
  // Spotlight rings + move animation (overlay canvas): every frame redraws
  // with current camera coordinates — newly created/attacked places get a
  // pulsing glow ring; this round's moves travel as glowing dots from → to
  // (cycle: travel → pause).
  //
  // 這是地圖上唯一的 rAF 迴圈，因此必須照 AGENTS.md 的動畫規範：
  // 捲出視窗（IntersectionObserver）、分頁在背景（document.hidden）都暫停，
  // 並在 prefers-reduced-motion 下只畫一幀靜態圖。
  // This is the map's only rAF loop, so it follows the animation rules: pause
  // when scrolled out of view (IntersectionObserver) or when the tab is hidden
  // (document.hidden), and draw a single static frame under
  // prefers-reduced-motion. ─────────────────────────────────────────────────

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    const canvas = overlayRef.current;
    if (!sigma || !graph || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const validMoves = moves.filter(
      (m) => graph.hasNode(m.fromPlaceId) && graph.hasNode(m.toPlaceId)
    );
    const visibleSpotlights = spotlights.filter((s) =>
      graph.hasNode(s.placeId)
    );

    // 高解析度畫布同步（devicePixelRatio）/ Sync canvas backing store (dpr)
    // 初次呼叫必須留到 isAnimating / renderFrame 宣告之後，否則會撞到 TDZ
    // The first call must come after isAnimating / renderFrame are declared,
    // otherwise it hits the temporal dead zone.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!isAnimating()) renderFrame(STATIC_FRAME_MS);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // 動畫點顏色 = 移動者陣營色（無陣營用青綠）/
    // Move dot color = mover's faction color (teal fallback)
    const factionColors = new Map<string, string>();
    for (const faction of factions) {
      factionColors.set(faction.id, hslToHex(faction.color));
    }

    /** 靜態幀的時間點：脈動與光點都停在一個代表性的中間相位 / A representative mid-animation phase for the static frame */
    const STATIC_FRAME_MS = CONFIG.MOVE_ANIM_DURATION / 2;

    let raf = 0;
    let onScreen = true;
    let start = performance.now();

    /** 只有「在畫面上 + 分頁可見 + 允許動態」才跑 / Animate only when on screen, the tab is visible, and motion is allowed */
    const isAnimating = () =>
      onScreen && !document.hidden && !reducedMotionRef.current;

    /** 依經過時間畫一幀 / Draw one frame for the given elapsed time */
    const renderFrame = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // ── 節點白邊 + 黑影 / Node white border + shadow ─────────────────────────
      // 星雲與深空底會吃掉節點邊界：沒有邊的圓盤會糊進背景裡。白邊把它分開，黑影
      // 讓它浮起來。兩者都畫在覆蓋層上 —— 覆蓋層的 DOM 在 sigma 的 WebGL canvas
      // **之前**，所以只有落在圓盤**之外**的那一圈會露出來。
      //
      // A star cloud and a near-black backdrop eat node edges: a disc with no border
      // smears into the background. The white border separates it and the shadow lifts
      // it. Both are drawn on the overlay, which sits BEFORE sigma's WebGL canvas, so
      // only the part landing **outside** the disc is ever visible.
      //
      // 星系層不做：太陽自帶柔光，再套一圈白邊會像貼紙。
      //
      // Not done at star zoom: the sun carries its own glow, and a white ring round it
      // would read as a sticker.
      const starView = sigma.getCamera().ratio <= CONFIG.MAP_STAR_ZOOM_RATIO;

      // 只畫視窗內的節點：2000 個節點時世界大半都在視窗外，畫它們只是浪費 /
      // Only nodes inside the viewport: at 2000 nodes most of the world is off-screen.
      const tl = sigma.viewportToGraph({ x: 0, y: 0 });
      const br = sigma.viewportToGraph({ x: rect.width, y: rect.height });
      const pad = CONFIG.MAP_NODE_SHADOW_SPREAD + CONFIG.MAP_NODE_BORDER_WIDTH;
      const minX = Math.min(tl.x, br.x) - pad;
      const maxX = Math.max(tl.x, br.x) + pad;
      const minY = Math.min(tl.y, br.y) - pad;
      const maxY = Math.max(tl.y, br.y) + pad;

      // ── 道路白邊 / Road casing ──────────────────────────────────────────────
      // 和節點白邊**完全同一個理由**：星雲與近黑的底會吃掉邊界，`MAP_ROAD_COLOR`
      // 是一條深藍 (#1e3a5f)，壓在星雲上幾乎看不見。節點加了白邊之後看得見了，
      // 道路卻還是幽靈線 —— 整張圖變成「看得見的地方、看不見的路」。
      //
      // Exactly the node border's reason: a star cloud and a near-black backdrop eat
      // edges, and `MAP_ROAD_COLOR` is a deep blue (#1e3a5f) that barely survives on top of
      // one. Once the nodes gained a border the roads became the only thing left invisible —
      // the map read as "places you can see, roads you cannot".
      //
      // 手法也一樣，而且**必須**一樣：覆蓋層在 sigma 的 canvas **之前**，所以在這裡描
      // 一條**比較粗的**白線，sigma 的道路正好壓在白線中間，兩側各露出一條白邊。這就是
      // 一個「外框」而不是第二條路。**不需要**新開一張 canvas（會蓋住地名標籤），
      // 也不需要 `EdgeClampedProgram`（會改掉整個邊的渲染）。
      //
      // The trick is the same, and has to be: the overlay sits BEFORE sigma's canvas, so a
      // **wider** white stroke here shows on both sides while sigma's road paints over the
      // middle. That makes a casing rather than a second road. It needs no second canvas
      // (which would cover the place labels) and no `EdgeClampedProgram` (which would change
      // edge rendering wholesale).
      //
      // 與節點白邊相遇時兩者都是白的，讀起來就是一條連續的白邊，不會打架。
      //
      // Where a road meets a place both this and the node border are white, so they read as
      // one continuous casing rather than fighting.
      const pxPerUnit = sigma.scaleSize(1);
      ctx.strokeStyle = CONFIG.MAP_ROAD_BORDER_COLOR;
      ctx.lineCap = 'round';
      graph.forEachEdge((_edge, attrs, source, target) => {
        const a = graph.getNodeAttributes(source) as { x: number; y: number };
        const b = graph.getNodeAttributes(target) as { x: number; y: number };
        // 只畫「有端點在視窗內」的道路。用端點判斷而不是線段對 AABB 逐格測試：道路
        // 連的是相鄰據點（ForceAtlas2 + 每地最多 4 條），兩端都遠在視窗外卻橫穿畫面
        // 的情形幾乎不存在，而逐格測試每幀要多付一次線段運算。
        //
        // Only roads with an endpoint in the viewport. Testing "either endpoint" rather than
        // a proper segment-vs-AABB overlap: roads join neighbouring places (ForceAtlas2,
        // at most 4 each), so an edge crossing the frame with both ends far outside is
        // vanishingly unlikely, and a real segment test costs arithmetic per edge per frame.
        const aIn = a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY;
        const bIn = b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY;
        if (!aIn && !bIn) return;
        const va = sigma.graphToViewport({ x: a.x, y: a.y });
        const vb = sigma.graphToViewport({ x: b.x, y: b.y });
        // 道路本身在螢幕上的粗細，用和節點**同一套**換算（`scaleSize`），所以兩層的
        // 相對比例在任何縮放下都一致。
        //
        // The road's own on-screen thickness, converted with the **same** `scaleSize` the
        // nodes use, so the casing keeps its proportion to the road at every zoom.
        const roadPx = pxPerUnit * ((attrs.size as number) ?? 1);
        ctx.lineWidth = roadPx + CONFIG.MAP_ROAD_BORDER_WIDTH * 2;
        ctx.beginPath();
        ctx.moveTo(va.x, va.y);
        ctx.lineTo(vb.x, vb.y);
        ctx.stroke();
      });
      ctx.lineCap = 'butt';

      if (!starView) {
        for (const node of graph.nodes()) {
          const attrs = graph.getNodeAttributes(node) as {
            x: number;
            y: number;
            size: number;
          };
          if (attrs.x < minX || attrs.x > maxX) continue;
          if (attrs.y < minY || attrs.y > maxY) continue;

          const radius = sigma.scaleSize(attrs.size);
          const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
          const spread = CONFIG.MAP_NODE_SHADOW_SPREAD;

          // 黑影：幾圈同心描邊、透明度逐圈遞減，於是外緣是柔和的。這比「每個節點
          // 建立一個 radial gradient」便宜得多 —— 後者是每幀上千個漸層物件。
          //
          // The shadow: concentric strokes at falling alpha, so the outer edge is soft.
          // Far cheaper than one radial gradient per node, which would be a thousand
          // gradient objects every frame.
          ctx.strokeStyle = CONFIG.MAP_NODE_SHADOW_COLOR;
          for (let layer = 0; layer < CONFIG.MAP_NODE_SHADOW_LAYERS; layer++) {
            ctx.globalAlpha =
              CONFIG.MAP_NODE_SHADOW_ALPHA *
              Math.pow(
                CONFIG.MAP_NODE_SHADOW_LAYER_FALLOFF,
                layer
              );
            ctx.lineWidth =
              spread * CONFIG.MAP_NODE_SHADOW_LAYER_WIDTH;
            ctx.beginPath();
            ctx.arc(
              vp.x,
              vp.y,
              radius + spread * CONFIG.MAP_NODE_SHADOW_LAYER_OFFSET * (layer + 1),
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          // 白邊壓在黑影之上，否則圓盤與背景的分界會糊掉 /
          // The white border goes on top of the shadow, or the disc's edge stays mushy
          ctx.beginPath();
          ctx.arc(
            vp.x,
            vp.y,
            radius + CONFIG.MAP_NODE_BORDER_WIDTH / 2,
            0,
            Math.PI * 2
          );
          ctx.strokeStyle = CONFIG.MAP_NODE_BORDER_COLOR;
          ctx.lineWidth = CONFIG.MAP_NODE_BORDER_WIDTH;
          ctx.stroke();
        }
      }

      // ── 星系：放大到星系層，地點不再是「一個點」，而是一整套太陽系 ──
      // Star systems: zoomed into a system, a place is no longer a dot but a whole solar
      // system — a sun, planets around it, moons around those.
      //
      // 太陽由 sigma 的節點圓盤畫（見 nodeReducer），所以這裡只畫柔光、軌道、行星與
      // 月球 —— 全都落在圓盤之外，所以覆蓋層在圓盤下面完全沒有影響。
      //
      // The sun is drawn by Sigma's own node disc (see nodeReducer), so this only draws
      // the glow, the orbits, the planets and the moons — all of which land outside the
      // disc, so being behind it costs nothing.
      //
      // 畫在聚光燈**之前**：星系是裝飾，聚光燈是資訊（本回合建立／被攻擊），
      // 資訊必須永遠蓋得住裝飾。
      // Drawn BEFORE the spotlight rings: a star system is decoration, a spotlight is
      // information (created / attacked this round), and information has to stay legible
      // on top of decoration.
      //
      // 它跑在既有的 rAF 迴圈裡，**沒有**新增第二個迴圈 — 這一點是刻意的：地圖只有
      // 一個動畫迴圈是效能與正確性的前提。
      // It rides the existing rAF loop and adds no second one: the map having exactly one
      // animation loop is what keeps it cheap and keeps the pause rules enforceable.
      if (starView) {
        // 星系**跟著鏡頭走**：所有 `*_PX` 都是「剛進入星系層」時的大小，實際畫出來要乘上
        // 這個倍率。倍率由 `syncStarView` 在每個 camera `updated` 更新，所以這一幀讀到的
        // 一定是當下的鏡頭，而不是開始繪製時的舊值。
        //
        // The system follows the camera: every `*_PX` is the size at the moment star view
        // was entered, and what gets drawn is multiplied by this. `syncStarView` refreshes
        // the factor on every camera `updated`, so this frame reads the current camera
        // rather than a stale value from when drawing started.
        const starScale = starScaleRef.current;
        const systemRadius = CONFIG.MAP_STAR_SYSTEM_RADIUS_PX * starScale;
        const sunPulse =
          0.5 + 0.5 * Math.sin((t / CONFIG.MAP_STAR_SUN_PULSE_MS) * Math.PI);
        const moonPhase =
          (t / CONFIG.MAP_STAR_MOON_ORBIT_MS) * Math.PI * 2;

        for (const node of graph.nodes()) {
          const attrs = graph.getNodeAttributes(node) as {
            x: number;
            y: number;
            color?: string;
            factionData?: { color: string } | null;
            starClass?: StarClass;
          };
          if (attrs.x < minX || attrs.x > maxX) continue;
          if (attrs.y < minY || attrs.y > maxY) continue;

          const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
          // 軌道是勢力色 —— 放大到星系層之後，這是唯一還看得到陣營的地方。
          // **不能**退回節點自己的顏色：無主之地的節點色是刻意壓暗的灰，在近黑背景上
          // 幾乎等於沒畫，整個星系會塌成一個光點。所以無主之地改用一個站得住的冷色 /
          // Orbits carry the faction colour — the only place ownership survives at this zoom.
          // It must NOT fall back to the node's own colour: an unowned node's colour is a
          // deliberately dimmed grey, which on a near-black background is almost the same as
          // nothing, collapsing the whole system into a single dot. Unowned land gets a
          // colour that actually holds up instead.
          const factionHsl = attrs.factionData?.color;
          const orbitColor = factionHsl
            ? hslToHex(factionHsl)
            : CONFIG.MAP_STAR_ORBIT_COLOR_UNOWNED;

          // 太陽柔光 / The sun's glow
          // 柔光跟著星星一起放大。不跟的話，拉遠時太陽長大而光暈縮成一圈小點。
          //
          // 柔光用**同一個**光譜級的外圈色 —— 圓盤由 sigma 畫、柔光在這裡畫，兩邊不同步
          // 就會變成「一個核心配著別顆星的光暈」。`attrs.starClass` 是建圖時就存好的，
          // 所以它和 `nodeReducer` 讀的是同一份，不靠兩邊「剛好抽到一樣」。
          //
          // The glow uses **the same** class's edge colour: the disc is painted by Sigma and
          // the glow right here, and if the two drift you get one core wearing another star's
          // halo. `attrs.starClass` was stored at build time, so this and `nodeReducer` read
          // one value rather than both happening to draw the same one.
          const starClass = (attrs.starClass ?? starClassOf(node)) as StarClass;
          const sunRadiusPx = CONFIG.MAP_STAR_SUN_SCREEN_PX * starScale;
          const glowOuter =
            sunRadiusPx * (1 + CONFIG.MAP_STAR_SUN_PULSE_AMP * sunPulse) +
            CONFIG.MAP_STAR_SUN_GLOW * starScale;
          const glow = ctx.createRadialGradient(
            vp.x,
            vp.y,
            sunRadiusPx * 0.75,
            vp.x,
            vp.y,
            glowOuter
          );
          // 外圈是**同一個顏色的全透明版**（`#rrggbb00`），所以漸層一定收在太陽的色相上。
          // 原本這裡寫死 `rgba(255, 154, 46, 0)` —— 那是其中一種太陽的顏色，太陽一換色就
          // 對不上了，而且那個 rgba 沒有任何設定值在管它。
          //
          // The outer stop is **the same hue at zero alpha** (`#rrggbb00`), so the gradient can
          // only ever fade out in the sun's own colour. It used to be a hardcoded
          // `rgba(255, 154, 46, 0)` — one sun's colour, which stops matching the moment a sun
          // changes colour, and not a single config value governed it.
          glow.addColorStop(0, starClass.edge);
          glow.addColorStop(1, transparent(starClass.edge));
          ctx.globalAlpha = CONFIG.MAP_STAR_SUN_GLOW_ALPHA;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(vp.x, vp.y, glowOuter, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          // 行星與月球純粹從地點 id 抽出來，所以同一個地點每次都長得一樣，
          // 換一台機器也一樣。純裝飾，不參與任何模擬。
          //
          // Planets and moons are derived from the node id alone, so a place always
          // looks the same and every client agrees without storing anything. Purely
          // decorative — they take no part in the simulation.
          const rng = createRng(node);
          const planetCount = rng.int(
            CONFIG.MAP_STAR_PLANET_MIN,
            CONFIG.MAP_STAR_PLANET_MAX
          );
          // 每個星系洗一次牌，四顆行星各拿一個**不重複**的顏色。`[... ]` 是必要的：
          // `CONFIG` 是 `as const`，`shuffle` 會就地改寫，不複製會動到設定本身。
          //
          // One shuffle per system, so the planets take distinct colours. The `[... ]` matters:
          // `CONFIG` is `as const` and `shuffle` mutates in place, so copying is what keeps the
          // config itself intact.
          const planetColors = rng.shuffle([...CONFIG.MAP_STAR_PLANET_COLORS]);

          for (let i = 0; i < planetCount; i++) {
            const orbit =
              systemRadius *
              (CONFIG.MAP_STAR_PLANET_INNER_RATIO +
                i * CONFIG.MAP_STAR_PLANET_ORBIT_STEP);
            const tilt =
              (rng.float(
                -CONFIG.MAP_STAR_PLANET_TILT_DEG,
                CONFIG.MAP_STAR_PLANET_TILT_DEG
              ) *
                Math.PI) /
              180;
            // 抽的是**倍率**不是像素：同一顆行星在放大時會跟著長大，而重抽的結果（哪些地點有幾顆
          // 行星、哪顆是氣態巨行星）不變 —— 那是從地點 id 抽出來的，不該因為縮放而改變。
          //
          // The draw is a **factor**, not a pixel count: the same planet grows as you zoom,
          // while what was drawn (how many planets, which one is the gas giant) is derived
          // from the place id and must not change with the camera.
          const radius =
            rng.float(
              CONFIG.MAP_STAR_PLANET_MIN_PX,
              CONFIG.MAP_STAR_PLANET_MAX_PX
            ) * starScale;
            // 同一個星系裡的行星**顏色不重複**。原本每顆各自 `pick`，所以四顆行星有時會抽到同一個顏色，
            // 看起來就像同一顆行星畫了兩次 —— 而「這是一個有四顆行星的星系」正是這一層要說的
            // 事情。做法是**先洗牌再取前 N 個**，不是逐顆重抽：重抽會讓 rng 的狀態多走一步，
            // 而 rng 是從地點 id 種出來的，多走一步就代表這個星系整組抽樣都換了。
            //
            // Planets within one system **never share a colour**. Each used to `pick` its own,
            // so four planets could come up the same colour and read as one planet drawn twice
            // — while "this system has four planets" is the whole point of the layer. The fix is
            // **shuffle once, then take the first N**, not re-picking per planet: re-picking
            // advances the RNG one extra step, and since the RNG is seeded from the place id,
            // one extra step re-rolls this system's entire draw.
            const color = planetColors[i % planetColors.length];
            const moonCount = rng.int(0, CONFIG.MAP_STAR_MOON_MAX);

            // 開普勒第三式：內圈轉得比外圈快，否則四顆行星像同一個時鐘 /
            // Kepler's third law: inner orbits run faster, or the four planets share one
            // clock
            const inner = systemRadius * CONFIG.MAP_STAR_PLANET_INNER_RATIO;
            const speed =
              (Math.PI * 2) /
              CONFIG.MAP_STAR_PLANET_ORBIT_MS /
              Math.pow(orbit / inner, 1.5);
            const angle = rng.float(0, Math.PI * 2) + t * speed;

            // 軌道：壓扁的橢圓，每顆行星有自己的傾斜，否則四顆疊在同一條線上 /
            // Orbit: a squashed ellipse with its own tilt, or all four stack on one line
            ctx.beginPath();
            ctx.ellipse(
              vp.x,
              vp.y,
              orbit,
              orbit * CONFIG.MAP_STAR_PLANET_SQUASH,
              tilt,
              0,
              Math.PI * 2
            );
            ctx.strokeStyle = orbitColor;
            ctx.globalAlpha = CONFIG.MAP_STAR_ORBIT_COLOR_ALPHA;
            ctx.lineWidth = CONFIG.MAP_STAR_ORBIT_WIDTH * starScale;
            ctx.stroke();
            ctx.globalAlpha = 1;

            // 行星就在那條橢圓上，套用同樣的傾斜 /
            // The planet rides that same ellipse, with the same tilt applied
            const ex = orbit * Math.cos(angle);
            const ey = orbit * CONFIG.MAP_STAR_PLANET_SQUASH * Math.sin(angle);
            const px = vp.x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
            const py = vp.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);

            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            // 月球繞的是**行星**，軌道半徑在行星之外 /
            // Moons orbit the **planet**, at a radius outside it
            for (let m = 0; m < moonCount; m++) {
              // 行星本身已經是螢幕像素（含倍率），所以這裡的間距只要同樣乘上倍率，
              // 月球就不會變成「行星變大、月球還擠在同樣距離」的比例失真。
              //
              // The planet radius is already screen pixels (scale included), so the gaps
              // take the same factor — otherwise the planet grows while the moon stays
              // pinned at the same distance, which distorts the proportion.
              const moonOrbit =
                radius +
                (CONFIG.MAP_STAR_MOON_GAP_PX + m * CONFIG.MAP_STAR_MOON_STEP_PX) *
                  starScale;
              const a =
                moonPhase * (1 + m * CONFIG.MAP_STAR_MOON_SPEED_STEP) +
                (m / CONFIG.MAP_STAR_MOON_MAX) * Math.PI * 2;
              ctx.beginPath();
              ctx.arc(
                px + moonOrbit * Math.cos(a),
                py + moonOrbit * Math.sin(a),
                CONFIG.MAP_STAR_MOON_SIZE * starScale,
                0,
                Math.PI * 2
              );
              // 每顆月球各抽一個顏色。單一顏色的月球在四顆並排時會看起來像四個一樣的點。
              //
              // Each moon draws its own colour. With one colour, four moons in a row read as
              // four identical dots.
              ctx.fillStyle =
                rng.pick([...CONFIG.MAP_STAR_MOON_COLORS]) ??
                CONFIG.MAP_STAR_MOON_COLORS[0];
              ctx.fill();
            }
          }
        }
      }

      // 聚光燈：脈動發光環（半徑用 scaleSize 隨鏡頭縮放，永遠畫在節點圓外）
      // Spotlight: pulsing glow ring (radius uses scaleSize so it tracks zoom
      // and always sits outside the node circle)
      const pulse = 0.5 + 0.5 * Math.sin((t / CONFIG.SPOTLIGHT_RING_PULSE_MS) * Math.PI);
      ctx.lineWidth = CONFIG.SPOTLIGHT_RING_WIDTH;
      for (const sp of visibleSpotlights) {
        const attrs = graph.getNodeAttributes(sp.placeId);
        const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
        // 節點的螢幕半徑（與 Sigma 渲染同一套縮放）+ 間距 + 脈動
        // Node's on-screen radius (same scaling Sigma renders with) + gap + pulse
        const nodeRadius = sigma.scaleSize(attrs.size as number);
        const radius =
          nodeRadius +
          CONFIG.SPOTLIGHT_RING_OFFSET +
          CONFIG.SPOTLIGHT_RING_PULSE_AMP * pulse;
        const color = sp.kind === 'created' ? CONFIG.MAP_SPOTLIGHT_CREATED : CONFIG.MAP_SPOTLIGHT_ATTACKED;
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur =
          CONFIG.SPOTLIGHT_RING_SHADOW +
          CONFIG.SPOTLIGHT_RING_SHADOW_PULSE * pulse;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // 移動點：行進（帶尾跡）→ 停頓，週期循環 /
      // Move dot: travel (with trail) → pause, looping
      const cycle = CONFIG.MOVE_ANIM_DURATION + CONFIG.MOVE_ANIM_PAUSE;
      const phase = (t % cycle) / CONFIG.MOVE_ANIM_DURATION;
      if (phase <= 1) {
        // easeInOutQuad / 緩入緩出
        const p = phase;
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        for (const m of validMoves) {
          const a = graph.getNodeAttributes(m.fromPlaceId);
          const b = graph.getNodeAttributes(m.toPlaceId);
          const va = sigma.graphToViewport({ x: a.x, y: a.y });
          const vb = sigma.graphToViewport({ x: b.x, y: b.y });
          const x = va.x + (vb.x - va.x) * eased;
          const y = va.y + (vb.y - va.y) * eased;
          const color =
            (m.factionId ? factionColors.get(m.factionId) : undefined) ??
            CONFIG.MAP_MOVE_DOT_FALLBACK;

          // 尾跡 / Trail
          const tailT = Math.max(0, eased - 0.12);
          ctx.beginPath();
          ctx.moveTo(va.x + (vb.x - va.x) * tailT, va.y + (vb.y - va.y) * tailT);
          ctx.lineTo(x, y);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // 光點 / Glowing dot
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // 脈動環在暫停時仍留一幀，畫面不會變空白 /
      // A paused ring still leaves one frame on screen, so it never blanks out
    };

    // 這裡**不能**因為「沒有聚光燈也沒有移動點」就提早返回。
    //
    // There must be NO early return here for "no spotlights and no moves".
    //
    // 那個判斷原本是合理的：迴圈只為了那兩個會動的東西而存在，沒有事件就不必燒
    // requestAnimationFrame。但現在這個迴圈還負責**常駐裝飾** —— 節點白邊、黑影，
    // 以及星系層的柔光、軌道、行星與月球。少了它們，一個剛重灌、還沒有任何事件的
    // 世界（回合 1、零 PLACE_CREATED、零 CHARACTER_MOVED）就會整片空白：地點看得到，
    // 因為圓盤是 sigma 自己畫的，而覆蓋層從來沒有啟動過。
    //
    // That check was once reasonable: the loop existed for those two animated things, so no
    // events meant no reason to burn requestAnimationFrame. But the loop now also owns
    // **persistent decoration** — the node border and shadow, and at star zoom the glow,
    // orbits, planets and moons. Skipping it leaves a freshly seeded world (round 1, zero
    // PLACE_CREATED, zero CHARACTER_MOVED) drawing nothing at all: the places stay visible
    // because Sigma paints the discs itself, while the overlay never started.
    //
    // 減少動態效果時 `isAnimating()` 為 false，仍然只畫一幀靜態畫面 —— 那條規則沒有變，
    // 也不需要為此讓步。/ Under reduced motion `isAnimating()` is false and a single static
    // frame is still drawn — that rule is unchanged and needs no concession here.

    const tick = (now: number) => {
      if (!isAnimating()) {
        raf = 0;
        return;
      }
      renderFrame(now - start);
      raf = requestAnimationFrame(tick);
    };

    /** 開始／續播 / Start or resume the loop */
    const play = () => {
      if (raf !== 0 || !isAnimating()) return;
      start = performance.now();
      raf = requestAnimationFrame(tick);
    };

    /** 暫停 / Pause the loop */
    const pause = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // 先把畫布尺寸與 transform 設定好，再決定要播還是畫一幀 /
    // Size the backing store first, then decide whether to animate or draw a frame
    resize();

    // 捲出視窗就停，回到畫面才續播（離開時補一幀，回來不會看到空白）/
    // Pause when scrolled out of view and resume on return (a frame is drawn on
    // the way out so the canvas is never blank when it comes back)
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      onScreen = entry.isIntersecting;
      if (onScreen) play();
      else {
        pause();
        renderFrame(STATIC_FRAME_MS);
      }
    });
    intersectionObserver.observe(canvas);

    // 分頁切到背景就停 / Pause while the tab is in the background
    const onVisibilityChange = () => {
      if (document.hidden) pause();
      else play();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 使用者中途開啟「減少動態效果」也要立刻停 / Honour a mid-session switch
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => {
      if (motionQuery.matches) {
        pause();
        renderFrame(STATIC_FRAME_MS);
      } else {
        play();
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    if (isAnimating()) {
      play();
    } else {
      // 減少動態效果：只畫一幀，不啟動迴圈 /
      // Reduced motion: one static frame, no loop
      renderFrame(STATIC_FRAME_MS);
    }

    return () => {
      pause();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionQuery.removeEventListener('change', onMotionChange);
      resizeObserver.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [spotlights, moves, factions]);

  return (
    // Sigma 的 kill() 會清空整個 container，因此 tooltip 必須放在
    // sigma container 的兄弟節點，避免 React 移除已被刪除的節點而拋錯。
    // Sigma's kill() empties the whole container, so the tooltip must be a
    // SIBLING of the sigma container — otherwise React later tries to remove
    // an already-deleted node and throws 'removeChild' errors.
    // 四內陰影讓世界聚焦在中央（token 在 globals.css 的 @theme static）/
    // The inner vignette frames the world and focuses the centre (token lives in
    // globals.css @theme static)
    //
    // 這裡**不畫底色**：深空底色由上層的 `bg-ds-space` 提供，本層若再鋪一層不透明
    // 底，底下的太空塵埃就會被完全蓋掉。
    //
    // No backdrop at this level: the deep-space base comes from `bg-ds-space`
    // above, and an opaque fill here would hide the space dust underneath.
    <div ref={surfaceRef} className="w-full h-full relative shadow-ds-map-vignette">
      {/* 領地圖的勢力名字（DOM 而非 canvas：字體與 i18n 直接沿用現有設定，
          每幀只改 transform）/ Faction names on the territory map. Rendered as DOM
          rather than on the canvas so they inherit the app's fonts and i18n, and
          positioned per frame with a transform only. */}
      {territoryLabels.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[3]">
          {territoryLabels.map((label, index) => (
            <span
              key={label.id}
              ref={(el) => {
                territoryLabelEls.current[index] = el;
              }}
              className="absolute left-0 top-0 origin-top-left whitespace-nowrap font-display leading-none tracking-widest opacity-0"
              style={{
                color: label.color,
                // 勢力色是執行期資料；文字陰影讓名字在深色與淺色領地上都讀得到。
                // 半徑是設定值，不是字面量 —— 求解字級時也要把它算成名字的大小，
                // 否則光暈會自己溢出領地（見 TERRITORY_LABEL_FIT）。
                //
                // Faction colour is runtime data. The shadow keeps the name legible on both
                // dark and light territory. The radius is config, not a literal: the font
                // solve counts it as part of the name's size, otherwise the glow spills off
                // the claim on its own (see TERRITORY_LABEL_FIT).
                textShadow: `0 0 ${CONFIG.TERRITORY_LABEL_GLOW_EM}em ${CONFIG.MAP_SHADOW_FALLBACK}, 0 1px 2px ${CONFIG.MAP_SHADOW_FALLBACK}`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      {/* 領地圖層（最底層：拉遠時的面積視圖）/ Territory layer (bottom-most: the area view when zoomed out)
          DOM 順序：領地層 → 聚光燈層 → sigma container。領地是背景，聚光燈與節點都壓在它上面。
          刻意不加 pointer-events-none：拉遠時這一層要自己收 hover / click（經由外層 wrapper 的
          冒泡），而 sigma 的 container 則**無條件**保留指標事件。
          DOM order: territory → spotlight overlay → sigma container. The territory is
          the background, with the spotlight and the nodes painted on top of it. It is
          deliberately NOT pointer-events-none: while zoomed out this layer handles hover
          and click (via the wrapper's bubbling), and the sigma container keeps its
          pointer events **unconditionally**. */}
      <canvas ref={territoryRef} className="absolute inset-0 w-full h-full" />
      {/* 聚光燈環 + 移動動畫覆蓋層（不攔截滑鼠事件）/ Spotlight rings + move animation overlay (never intercepts mouse events)
          w-full h-full 必須：canvas 是替換元素，absolute inset-0 不會自動撐滿（intrinsic 300×150）
          w-full h-full is required: canvas is a replaced element — absolute inset-0 alone leaves it at its intrinsic 300×150
          DOM 順序：覆蓋層必須在 sigma container「之前」——sigma 的 WebGL canvas
          背景透明，後畫的 sigma 會疊在覆蓋層上，地名標籤才能壓過聚光燈環。
          DOM order: the overlay MUST come BEFORE the sigma container — sigma's
          WebGL canvas is transparent, so painting sigma last puts place labels
          on top of the spotlight rings. */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div ref={containerRef} className="absolute inset-0" />
      {/* 工具提示 / Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-900/95 backdrop-blur-md rounded-xl p-3.5 text-base shadow-2xl shadow-black/50 border border-gray-700/60"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          {/* 頂部發光線 / Top glow line */}
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

          {/* 拉遠的領地視圖顯示**勢力**；拉近才顯示地方細節 /
           * The zoomed-out territory view describes a *faction*; only the zoomed-in
           * view has a single place to describe */}
          {tooltip.kind === 'faction' ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: tooltip.color }}
                />
                <span className="font-display font-bold text-lg text-white tracking-wide">
                  {tooltip.name}
                </span>
              </div>
              <div className="text-gray-400 text-sm">
                {t('map.controlledPlaces')}:{' '}
                <span className="text-cyan-400 font-display">{tooltip.placeCount}</span>
              </div>
              {/* 勢力層補上兵力、將領數與君主。這三個數字回答的是「這片領地是誰的、靠什麼
                  撐著」，而原本只有一個地方數——勢力排行與雷達都有這些數字，只有地圖提示
                  沒有，三個面板於是各說各話。
                  君主要**單獨**列出：勢力可以沒有君主（君主剛死、還沒繼承），那就不印，
                  而不是印「無」。

                  The faction panel adds troops, leader count and the ruler. Together with the
                  place count these answer "whose ground is this and what holds it up" — and the
                  place count alone left the faction ranking and the radar carrying numbers the
                  map never showed, so three panels disagreed about the same faction.
                  The ruler is listed **separately** because a faction may have none (the king
                  just died, no heir yet), and then the row is omitted rather than printed as
                  "none". */}
              <div className="text-gray-400 text-sm">
                {t('map.troops')}:{' '}
                <span className="text-cyan-400 font-display">{tooltip.troops}</span>
              </div>
              <div className="text-gray-400 text-sm">
                {t('map.leaders')}:{' '}
                <span className="text-cyan-400 font-display">{tooltip.leaderCount}</span>
              </div>
              {tooltip.kingName && (
                <div className="text-gray-400 text-sm">
                  👑 {t('map.factionRuler')}:{' '}
                  <span className="text-white">{tooltip.kingName}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="font-display font-bold text-lg text-white mb-1 tracking-wide">
                {tooltip.place.name}
              </div>
              {tooltip.faction && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: tooltip.faction.color }}
                  />
                  <span className="text-gray-300 text-sm">{tooltip.faction.name}</span>
                </div>
              )}
              <div className="space-y-0.5 text-gray-400 text-sm">
                {/* 駐軍與將領兵力分開列：節點大小本來就是兩者相加，只印駐軍會讓節點看起來
                    比實際兵力弱很多。總和另外給一個小字，讀者就能對上節點的大小 /
                    Garrison and leader troops are listed separately, because node size has
                    always been their sum. The total is given alongside so the node's size
                    can be accounted for. */}
                <div>⚔️ {t('map.garrison')}: <span className="text-cyan-400 font-display">{tooltip.place.garrison}</span></div>
                <div>🛡️ {t('map.leaderTroops')}: <span className="text-cyan-400 font-display">{tooltip.leaderTroops}</span></div>
                <div className="text-[11px] text-gray-500">
                  {t('map.troopTotal')} {tooltip.place.garrison + tooltip.leaderTroops}
                </div>
                <div>🏰 {t('map.fortress')}: <span className="text-gray-400 font-display">{tooltip.place.fortress}</span></div>
                <div>🏪 {t('map.market')}: <span className="text-gray-400 font-display">{tooltip.place.market}</span></div>
                <div>🏯 {t('map.barracks')}: <span className="text-gray-400 font-display">{tooltip.place.barracks}</span></div>
              </div>
              {/* 「誰在管這個地方」與「誰是這個勢力的君主」分成兩列。
                  兩者經常不是同一人——行政官是被任命的治理者，君主是勢力的最高權力——
                  合成一列會讓人誤以為地方與勢力共用一個首腦。兩者都可能是 null：
                  無主之地就沒有君主，還沒任命的地點就沒有行政官，那一列就整個不印，
                  而不是印一個空白或「無」。
                  The place's **administrator** and the controlling faction's **ruler** are two
                  separate lines. They are routinely different people — the administrator is
                  the appointed governor, the king is the faction's highest authority — so one
                  line would read as though place and faction share a single head. Either can
                  be null: unowned land has no ruler, an unassigned place has no administrator,
                  and then the row is omitted entirely rather than printed blank or "none". */}
              {(tooltip.administratorName || tooltip.factionRulerName) && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-800/60 space-y-0.5 text-gray-400 text-sm">
                  {tooltip.administratorName && (
                    <div>
                      👤 {t('map.administrator')}:{' '}
                      <span className="text-white">{tooltip.administratorName}</span>
                    </div>
                  )}
                  {tooltip.factionRulerName && (
                    <div>
                      👑 {t('map.factionRuler')}:{' '}
                      <span className="text-white">{tooltip.factionRulerName}</span>
                    </div>
                  )}
                </div>
              )}
              {/* 將領列出**名字**與各自的兵力，而不再只是一個數字。行政官與君主也在
                  這份名單裡（用 👤 / 👑 標出）——把某個人在上面單獨印一次、又在名單裡出現
                  第二次，讀者會以為是兩個人。
                  上限是 `MAP_TOOLTIP_MAX_LEADERS`，多出來的收成「另有 N 位」：提示跟著游標
                  走，列太多會蓋住地圖本身。

                  Leaders are listed **by name with their own troops**, not as a bare count. The
                  administrator and the ruler are in this list too (flagged 👤 / 👑) — printing
                  one of them separately above and again in the list makes the reader think
                  they are two people. Capped at `MAP_TOOLTIP_MAX_LEADERS`, with the remainder
                  collapsed into "+N more": the tooltip follows the cursor, so an unbounded
                  list ends up covering the map it is describing. */}
              {tooltip.leaders.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-800/60">
                  <div className="text-gray-400 text-sm mb-0.5">
                    👥 {t('map.leaders')}:
                  </div>
                  {tooltip.leaders.slice(0, CONFIG.MAP_TOOLTIP_MAX_LEADERS).map((l) => (
                    <div
                      key={l.id}
                      className="text-gray-400 text-sm pl-3 flex items-baseline gap-1.5"
                    >
                      <span className="text-gray-500 shrink-0" aria-hidden="true">
                        {l.isKing ? '👑' : l.isAdministrator ? '👤' : '·'}
                      </span>
                      <span className="truncate" title={l.name}>
                        {l.name}
                      </span>
                      <span className="text-cyan-400 font-display tabular-nums shrink-0 ml-auto">
                        {l.troops}
                      </span>
                    </div>
                  ))}
                  {tooltip.leaders.length > CONFIG.MAP_TOOLTIP_MAX_LEADERS && (
                    <div className="text-gray-500 text-[11px] pl-3">
                      {t('map.moreLeaders', {
                        n: tooltip.leaders.length - CONFIG.MAP_TOOLTIP_MAX_LEADERS,
                      })}
                    </div>
                  )}
                </div>
              )}
              {tooltip.linkedPlaces.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-800/60 text-gray-400 text-sm">
                  🛣️ {t('map.linkedPlaces')}: {tooltip.linkedPlaces.join('、')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
