// ============================================================================
// 遊戲頁面共用型別 / Shared game-page types
// ============================================================================
// 這些型別同時被頁面本體、事件日誌與統計圖表使用，所以拆成獨立模組讓三方
// 都能引用，而不必互相 import 造成循環依賴。
// These types are shared by the page itself, the event log and the stats charts,
// so they live in their own module and all three can import them without an
// import cycle between the components.
// ============================================================================
// ─── 型別 / Types ────────────────────────────────────────────────────────────────

/** GET /api/world/current — 世界進度，用來定位最新已執行的回合 / World progress, used to resolve the latest executed round */
export interface WorldInfo {
  id: string;
  name: string;
  currentRound: number;
}

export interface WorldState {
  world: {
    id: string;
    name: string;
    currentRound: number;
  };
  places: Array<{
    id: string;
    name: string;
    factionId: string | null;
    administratorId: string | null;
    garrison: number;
    fortress: number;
    market: number;
    barracks: number;
    layoutX: number;
    layoutY: number;
  }>;
  factions: Array<{
    id: string;
    name: string;
    color: string;
    alive: boolean;
    collapsing: boolean;
    /** 君王 id；地方彈窗要靠它重算「這個地方實際給行政官多少」/
        King id; the place popup needs it to recompute what this place really pays its admin */
    kingId: string | null;
  }>;
  characters: Array<{
    id: string;
    name: string;
    factionId: string | null;
    wu: number;
    tong: number;
  ti: number;
    jing: number;
    speed: number;
    loyalty: string;
    ambition: number;
    age: number;
    troops: number;
    gold: number;
    placeId: string;
    alive: boolean;
    isKing: boolean;
  }>;
  roads: Array<{
    id: string;
    aId: string;
    bId: string;
  }>;
  /** 地圖聚光燈：近 K 回合內新生成 / 被攻擊的地點 / Map spotlight: places created/attacked within the last K rounds */
  spotlights?: Array<{ placeId: string; kind: 'created' | 'attacked' }>;
  /** 本回合移動（供地圖動畫）/ This round's moves (for the map animation) */
  moves?: Array<{ fromPlaceId: string; toPlaceId: string; factionId: string | null }>;
  /**
   * 本回合的 AmbitionEvent：叛變值的事件部分就是這些 delta 的總和。
   *
   * 將領詳情用它列出「哪些事件把這個數字推高／壓低」，因為一個沒有來源的數字等於
   * 沒有解釋——讀者看得到結果，看不到原因。
   *
   * This round's AmbitionEvents: their deltas are the "events" part of the defection value.
   *
   * The leader detail lists which events pushed the number up or down. A number with no
   * visible source is not an explanation — the reader can see the result but not the cause.
   */
  roundAmbitionEvents?: Array<{ charId: string; delta: number; reason: string }>;
}

export interface GameEvent {
  id: string;
  type: string;
  // 事件資料（API 回傳 Prisma 的 data 欄位）/ Event payload (API returns Prisma's data field)
  data: Record<string, unknown>;
  round: number;
}

// ─── 語言訂閱 / Locale Subscription ─────────────────────────────────────────

