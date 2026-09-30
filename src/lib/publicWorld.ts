// ============================================================================
// 公開世界資料型別 / Public World Data Types
// ============================================================================
// 放在這裡而不是 route.ts，是為了讓元件不必從 app/api 反向引入型別。
// Live in their own module so components never import types back out of the
// API layer. 這是 /api/public/world 的回應結構定義，格式與該路由一致。
// This describes the /api/public/world response and stays in sync with it.
// ============================================================================

/** 單一勢力（僅存活勢力）/ one surviving faction */
export type PublicFaction = {
  id: string;
  name: string;
  /** 資料庫的色票，客戶端直接拿去上色 / the stored colour, used as-is by the client */
  color: string;
  places: number;
  characters: number;
  troops: number;
};

/** 單一據點（圖譜節點）/ one settlement (a graph node) */
export type PublicPlace = {
  id: string;
  /** null = 無主 / null means unclaimed */
  factionId: string | null;
  /** 原始 ForceAtlas2 座標 / raw ForceAtlas2 coordinates */
  x: number;
  y: number;
  garrison: number;
};

/** 單一道路（圖譜邊）/ one road (a graph edge) */
export type PublicRoad = {
  aId: string;
  bId: string;
};

/** 單一事件 / one event */
export type PublicEvent = {
  type: string;
  round: number;
  /**
   * 事件原始欄位，結構同 /api/world/events；CHARACTER_MOVED 已補上
   * fromPlaceName / toPlaceName。
   * Raw event payload, same shape as /api/world/events; CHARACTER_MOVED is
   * pre-enriched with fromPlaceName / toPlaceName.
   */
  data: unknown;
};

export type PublicWorldPayload = {
  world: { name: string; round: number };
  /** 計數一律完整，不受圖譜下采樣影響 / counts are always complete, never down-sampled */
  counts: {
    factions: number;
    characters: number;
    places: number;
    ownedPlaces: number;
    unownedPlaces: number;
    roads: number;
    troops: number;
  };
  factions: PublicFaction[];
  graph: {
    places: PublicPlace[];
    roads: PublicRoad[];
    /** true = 世界上游的據點沒全部送出 / true = the graph was cut down */
    truncated: boolean;
  };
  recentEvents: PublicEvent[];
  generatedAt: string;
};
