// ============================================================================
// 戰線推導 / Battle front derivation
// ----------------------------------------------------------------------------
// 這裡是**純邏輯**：從「誰控制哪裡」推导出哪裡在交戰。不碰 DOM，所以可以在 node
// 環境下測。
//
// This is **pure logic**: it derives where fighting is happening from who owns
// what. It touches no DOM, so it runs under `node` in vitest.
//
// 為什麼不用事件推播 / Why not an event stream
// 首頁與遊戲頁的資料來源完全不同：遊戲頁拿得到 `CHARACTER_MOVED`，首頁只有
// `/api/public/world` 的近期事件。要讓兩邊顯示同一批交戰，就得另外做一條事件
// 管線；而「道路兩端屬於不同勢力」這個規則**兩邊都算得出來**，而且是世界狀態
// 本身 —— 勢力一死、领地一易手，戰線立刻跟著變，不需要等下一個回合。
//
// The two pages have very different data: the game page has `CHARACTER_MOVED`,
// the home page only has recent events from `/api/public/world`. Making both
// show the same engagements would need a separate event pipeline — but "a road
// whose ends belong to rival factions" is derivable from **both**, and it is
// world state itself: a faction dies or loses land, the front lines move that
// instant, with no need to wait for the next round.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';

/** 一個據點（只要座標與屬主）/ one settlement (coordinates and owner only) */
export interface FleetSite {
  id: string;
  x: number;
  y: number;
  /** null = 無主，不參與交戰 / null means unowned, so it is not a combatant */
  factionId: string | null;
  /** 駐軍，��用來在超過上限時挑較大的戰線 / garrison, used to pick the biggest fronts when over the cap */
  garrison: number;
}

/** 一條道路 / one road */
export interface FleetRoad {
  aId: string;
  bId: string;
}

/**
 * 一條戰線。兩端的勢力色都帶著，因為交戰是雙方的 /
 * One front line. Both factions' colours travel with it, because a battle has
 * two sides.
 */
export interface BattleFront {
  key: string;
  /** 兩端點（世界座標）/ the two endpoints, in world coordinates */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 線段長度（世界單位）/ segment length in world units */
  length: number;
  /** 垂直於戰線的單位法向量 / unit normal perpendicular to the line */
  nx: number;
  ny: number;
  /** A 端勢力色 / faction colour at the A end */
  colorA: string;
  /** B 端勢力色 / faction colour at the B end */
  colorB: string;
  /** 兩端駐軍較小者：前線的「分量」/ the smaller garrison of the two ends: how much this front matters */
  weight: number;
}

/**
 * 把據點與道路收斂成戰線清單 / Reduce settlements and roads into front lines.
 *
 * 只保有一個「同時作戰上限」，因為畫面上同時跑太多條線會變成雜訊——戰線是
 * 氣氛，不是資訊。
 *
 * There is a cap on simultaneous fronts: too many at once is noise, and the
 * fleet is atmosphere, not information.
 */
export function battleFronts(
  sites: FleetSite[],
  roads: FleetRoad[],
  colors: Record<string, string>,
  maxFronts: number = CONFIG.BATTLE_FLEET_MAX_FRONTS,
): BattleFront[] {
  const byId = new Map<string, FleetSite>();
  for (const s of sites) byId.set(s.id, s);

  const out: BattleFront[] = [];
  for (const road of roads) {
    const a = byId.get(road.aId);
    const b = byId.get(road.bId);
    // 無主之地不交戰：少了任何一端就沒有對手 / unowned land does not fight: without
    // both ends there is no opponent
    if (!a || !b) continue;
    if (!a.factionId || !b.factionId) continue;
    // 同勢力之間是內路，不是戰線 / a road inside one faction is internal, not a front
    if (a.factionId === b.factionId) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    // 重疊據點會讓線段長度為 0，法向量無定義 / coincident sites give a zero-length
    // segment with an undefined normal
    if (length < 1e-6) continue;

    out.push({
      key: `${road.aId}|${road.bId}`,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      length,
      nx: -dy / length,
      ny: dx / length,
      colorA: colors[a.factionId] ?? '#64748b',
      colorB: colors[b.factionId] ?? '#64748b',
      weight: Math.min(a.garrison, b.garrison),
    });
  }

  // 分量大的戰線優先，保留前 N 條 / the heaviest fronts win the cap
  out.sort((p, q) => q.weight - p.weight);
  return out.length > maxFronts ? out.slice(0, maxFronts) : out;
}