// ============================================================================
// 世界初始化（seed 與「重置世界」共用）/ World initialisation (shared by seed & reset)
// ============================================================================
// 「建一個能跑的新世界」只有**一條**路：
//   1. 完整地方集（`PLACE_INITIAL_COUNT`；國王座有初始建築與駐軍，其餘全 0）
//   2. 道路：地理 MST 打底保證連通 + 由近至遠補邊到 1-3 條（雙端度數上限）
//   3. ForceAtlas2 初始佈局
//   4. 君王 + 勢力 + 行政官
//   5. round 0 快照**先建**，才把 currentRound 推進到 1
//
// A world that can actually run is built exactly **one** way: the full place set
// (the king's seat with initial buildings and garrison, everything else at 0),
// geographic-MST roads with nearest-first extras (1-3 per place, degree-capped),
// a ForceAtlas2 initial layout, king + faction + administrators, and the round-0
// snapshot created **before** advancing currentRound to 1.
//
// 為什麼必須共用 / Why this must be shared
// ---------------------------------------------------------------------------
// 修復前「重置世界」端點只建 **10 個佔位地點**（圓圈擺位）：沒有道路、沒有勢力、
// 沒有君王、沒有駐軍——重置出的世界跑不起來（全是無主之地，spawnCharacters 只在
// 有主地生將，經濟完全不轉）。seed 與重置**必須**走同一份初始化，否則兩個入口
// 各自漂移。
//
// Before the fix the reset-world endpoint created just **10 placeholder places** on
// a circle: no roads, no faction, no king, no garrison — the reset world could not
// run (all land unowned, spawnCharacters only spawns at owned places, the economy
// never turns). Seed and reset must share ONE initialisation or the two entry
// points drift apart.
//
// RNG 序列 / The RNG sequence
// ---------------------------------------------------------------------------
// 抽籤順序**刻意**與原 seed 完全一致（地方名 → 圓盤座標 → 道路目標 → 君王屬性 →
// 勢力名/色 → 君王名 → 行政官）：同一個種子長出同一個世界，與重構前相同。
// The draw order is **deliberately** identical to the original seed (place names →
// disk positions → road targets → king stats → faction name/colour → king name →
// administrators): one seed grows the same world it always did.
// ============================================================================

import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { prisma } from '@/lib/prisma';
import { CONFIG, getScalingRatio } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generateUniquePlaceName } from '@/lib/nameGenerator/place';
import { generatePersonName } from '@/lib/nameGenerator/person';
import { uniqueAliveFactionName, uniqueAliveKingName } from './uniqueNames';
import { createSnapshot } from '@/lib/snapshot';

/** 初始化的結果統計 / What the initialisation produced */
export interface InitWorldResult {
  placeCount: number;
  roadCount: number;
  kingId: string;
  factionId: string;
}

/**
 * 建立世界的全部初始內容：地方、道路、佈局、君王、勢力、行政官。
 * Build everything a world starts with: places, roads, layout, king, faction,
 * administrators.
 *
 * 不建立也不更新 World 本身（名稱由呼叫端決定）；RNG 狀態的保存也在
 * {@link finalizeWorldCreation}。
 * Does not create or update the World row itself (the name is the caller's); the
 * RNG state is persisted by {@link finalizeWorldCreation}.
 */
export async function initializeWorld(
  worldId: string,
  rng: Rng
): Promise<InitWorldResult> {
  // ── 1. 完整地方集：只有國王座有初始建築與駐軍，其餘無主之地全部為 0 ──
  // ── The full place set: only the king's seat starts with buildings and a
  // garrison, every other place starts at 0 ──
  const places: Array<{ id: string }> = [];
  const takenPlaceNames = new Set<string>();
  for (let i = 0; i < CONFIG.PLACE_INITIAL_COUNT; i++) {
    const name = generateUniquePlaceName(rng, takenPlaceNames) ?? `地${i + 1}`;
    takenPlaceNames.add(name);

    const isKingPlace = i === 0;
    const place = await prisma.place.create({
      data: {
        worldId,
        name,
        garrison: isKingPlace ? CONFIG.PLACE_INITIAL_GARRISON : 0,
        fortress: isKingPlace ? CONFIG.PLACE_INITIAL_FORTRESS : 0,
        market: isKingPlace ? CONFIG.PLACE_INITIAL_MARKET : 0,
        barracks: isKingPlace ? CONFIG.PLACE_INITIAL_BARRACKS : 0,
        layoutX: 0, // 將由 ForceAtlas2 計算 / Will be calculated by ForceAtlas2
        layoutY: 0,
        createdAtRound: 0,
      },
    });
    places.push(place);
  }

  // ── 2. 道路：圓盤初始座標 → 地理 MST 打底 → 由近至遠補邊 ──
  // sqrt(rng()) 讓圓盤分佈均勻（避免中心聚集）/
  // sqrt(rng()) gives a uniform disk distribution (avoids centre clustering)
  const R = CONFIG.INITIAL_LAYOUT_RADIUS;
  const initialPos = places.map(() => {
    const angle = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.float(0, 1)) * R;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });

  const roadSet = new Set<string>();
  const pendingRoads: Array<[string, string]> = [];
  const roadCountPerPlace = new Map<string, number>();
  for (const place of places) {
    roadCountPerPlace.set(place.id, 0);
  }

  // 新增道路（雙端度數上限檢查）/ Add a road (checks the degree cap at both ends)
  const addRoad = (idA: string, idB: string): boolean => {
    const [aId, bId] = idA < idB ? [idA, idB] : [idB, idA];
    const key = `${aId}-${bId}`;
    if (roadSet.has(key)) return false;
    if ((roadCountPerPlace.get(aId) ?? 0) >= CONFIG.ROAD_MAX_PER_PLACE) return false;
    if ((roadCountPerPlace.get(bId) ?? 0) >= CONFIG.ROAD_MAX_PER_PLACE) return false;
    roadSet.add(key);
    roadCountPerPlace.set(aId, (roadCountPerPlace.get(aId) ?? 0) + 1);
    roadCountPerPlace.set(bId, (roadCountPerPlace.get(bId) ?? 0) + 1);
    pendingRoads.push([aId, bId]);
    return true;
  };

  // 地理 MST（Prim，保證全圖連通）：每次加入「連接樹內外、兩端度數未滿」的最短邊 /
  // Geographic MST (Prim, guarantees connectivity): each step adds the shortest edge
  // joining tree/outside with both ends under the degree cap
  const inMst = new Array<boolean>(places.length).fill(false);
  inMst[0] = true;
  let mstSize = 1;
  while (mstSize < places.length) {
    let bestFrom = -1;
    let bestTo = -1;
    let bestDist = Infinity;
    for (let i = 0; i < places.length; i++) {
      if (!inMst[i]) continue;
      if ((roadCountPerPlace.get(places[i]!.id) ?? 0) >= CONFIG.ROAD_MAX_PER_PLACE)
        continue;
      for (let j = 0; j < places.length; j++) {
        if (inMst[j]) continue;
        if ((roadCountPerPlace.get(places[j]!.id) ?? 0) >= CONFIG.ROAD_MAX_PER_PLACE)
          continue;
        const d = Math.hypot(
          initialPos[i]!.x - initialPos[j]!.x,
          initialPos[i]!.y - initialPos[j]!.y
        );
        if (d < bestDist) {
          bestDist = d;
          bestFrom = i;
          bestTo = j;
        }
      }
    }
    if (bestFrom === -1) break; // 理論上不可達（樹內必有未滿節點）/ Unreachable (the tree always has an unsaturated node)
    addRoad(places[bestFrom]!.id, places[bestTo]!.id);
    inMst[bestTo] = true;
    mstSize++;
  }

  // 由近至遠補邊（達目標 1-3 條）/ Extra edges nearest-first (to reach 1-3)
  for (let i = 0; i < places.length; i++) {
    const currentCount = roadCountPerPlace.get(places[i]!.id) ?? 0;
    if (currentCount >= CONFIG.ROAD_MAX_PER_PLACE) continue;

    const target = rng.int(
      CONFIG.ROAD_NEW_PER_PLACE_MIN,
      CONFIG.ROAD_NEW_PER_PLACE_MAX
    );
    if (target <= currentCount) continue;

    const candidates = places
      .map((p, j) => ({
        j,
        d: Math.hypot(
          initialPos[i]!.x - initialPos[j]!.x,
          initialPos[i]!.y - initialPos[j]!.y
        ),
      }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d);

    for (const { j } of candidates) {
      if ((roadCountPerPlace.get(places[i]!.id) ?? 0) >= target) break;
      addRoad(places[i]!.id, places[j]!.id);
    }
  }

  for (const [aId, bId] of pendingRoads) {
    await prisma.road.create({
      data: { worldId, aId, bId, createdAtRound: 0 },
    });
  }

  // ── 3. ForceAtlas2 初始佈局 ──
  // 地理建路已讓連接的地方彼此接近；FA2 依路網微調 /
  // Geo roads already place linked places close together; FA2 refines from the
  // road network
  const layoutGraph = new Graph();
  places.forEach((place, i) => {
    layoutGraph.addNode(place.id, {
      x: initialPos[i]!.x,
      y: initialPos[i]!.y,
    });
  });
  for (const [aId, bId] of pendingRoads) {
    if (layoutGraph.hasNode(aId) && layoutGraph.hasNode(bId)) {
      if (!layoutGraph.hasEdge(aId, bId)) {
        layoutGraph.addEdge(aId, bId);
      }
    }
  }

  const positions = forceAtlas2(layoutGraph, {
    iterations: CONFIG.INITIAL_LAYOUT_ITERATIONS,
    settings: {
      gravity: CONFIG.FA2_GRAVITY,
      // 動態 scalingRatio，避免 100 節點時太散 / dynamic scalingRatio, so 100 nodes
      // do not scatter
      scalingRatio: getScalingRatio(places.length),
      barnesHutOptimize: CONFIG.FA2_BARNES_HUT,
      barnesHutTheta: CONFIG.FA2_BARNES_HUT_THETA,
      adjustSizes: CONFIG.FA2_ADJUST_SIZES,
      linLogMode: CONFIG.FA2_LIN_LOG_MODE,
      edgeWeightInfluence: CONFIG.FA2_EDGE_WEIGHT_INFLUENCE,
      outboundAttractionDistribution: CONFIG.FA2_OUTBOUND_ATTRACTION_DISTRIBUTION,
      strongGravityMode: CONFIG.FA2_STRONG_GRAVITY_MODE,
      slowDown: 1,
    },
  });

  for (const place of places) {
    const pos = positions[place.id];
    if (pos) {
      await prisma.place.update({
        where: { id: place.id },
        data: { layoutX: pos.x, layoutY: pos.y },
      });
    }
  }

  // ── 4. 君王（只有 1 個角色，放在第一個地方）──
  // ── The king (the only character, placed at the first place) ──
  const name = generatePersonName(rng);
  const wu = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const tong = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const ti = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const jing = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const speed = rng.gaussianInt(
    CONFIG.CHAR_SPEED_MEAN,
    CONFIG.CHAR_SPEED_SIGMA,
    CONFIG.CHAR_SPEED_MIN,
    CONFIG.CHAR_SPEED_MAX
  );
  const defectionBase = rng.gaussianInt(
    CONFIG.CHAR_DEFECTION_BASE_MEAN,
    CONFIG.CHAR_DEFECTION_BASE_SIGMA,
    CONFIG.CHAR_DEFECTION_BASE_MIN,
    CONFIG.CHAR_DEFECTION_BASE_MAX
  );
  const maxAge = rng.int(CONFIG.CHAR_MAX_AGE_MIN, CONFIG.CHAR_MAX_AGE_MAX);
  const loyalty = rng.pick(['SELF', 'PATH', 'ALTRUISM'] as const) ?? 'SELF';

  const character = await prisma.character.create({
    data: {
      worldId,
      name,
      wu,
      tong,
      ti,
      jing,
      speed,
      loyalty,
      defectionBase,
      age: CONFIG.CHAR_START_AGE,
      maxAge,
      placeId: places[0]!.id,
      troops: rng.int(5, 15),
      gold: rng.int(50, 150),
    },
  });

  // ── 5. 勢力 + 王位 + 第一個地方歸該勢力 ──
  // ── Faction + throne + the first place belongs to it ──
  const faction = await prisma.faction.create({
    data: {
      worldId,
      name: await uniqueAliveFactionName(worldId, rng),
      color: `hsl(${rng.int(0, 360)}, 70%, 50%)`,
      createdAtRound: 0,
      kingId: character.id,
    },
  });

  // 君王名字須在存活君王中唯一 / The king's name must be unique among alive kings
  const kingName = await uniqueAliveKingName(worldId, character.id, name, rng);
  await prisma.character.update({
    where: { id: character.id },
    data: { factionId: faction.id, isKing: true, name: kingName },
  });
  await prisma.place.update({
    where: { id: places[0]!.id },
    data: { factionId: faction.id },
  });

  // ── 6. 行政官：每個有人的地方設一個（初始只有君王座有人）──
  // ── Administrators: one per inhabited place (initially only the king's seat) ──
  const charsAtKingPlace = [character].filter((c) => c.placeId === places[0]!.id);
  if (charsAtKingPlace.length > 0) {
    const admin = rng.pick(charsAtKingPlace);
    if (admin) {
      await prisma.place.update({
        where: { id: places[0]!.id },
        data: { administratorId: admin.id },
      });
    }
  }

  return {
    placeCount: places.length,
    roadCount: pendingRoads.length,
    kingId: character.id,
    factionId: faction.id,
  };
}

/**
 * 收尾：round 0 快照**先建**（此時 currentRound 仍為 0，快照內嵌 0 = 初始狀態、
 * 無事件），保存 RNG 狀態，再把 currentRound 推進到 1——「下一回合」第一次點擊
 * 執行 round 1，RND 標籤從 0000 前進。
 * Finalise: the round-0 snapshot is created **first** (currentRound is still 0, so
 * the snapshot embeds 0 = the initial state with no events), the RNG state is
 * saved, and only then does currentRound advance to 1 — the first "Next Round"
 * click runs round 1 and the RND label advances from 0000.
 */
export async function finalizeWorldCreation(
  worldId: string,
  rng: Rng
): Promise<void> {
  const snapshotBuffer = await createSnapshot(worldId);
  await prisma.roundSnapshot.create({
    data: {
      worldId,
      round: 0,
      data: Buffer.from(snapshotBuffer),
    },
  });

  await prisma.world.update({
    where: { id: worldId },
    data: { rngState: rng.getState(), currentRound: 1 },
  });
}
