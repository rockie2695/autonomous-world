// ============================================================================
// 資料庫種子腳本 / Database Seed Script
// ============================================================================
// 初始化遊戲世界資料。
// Initializes game world data per SPEC v1.0/v1.1.
//
// 初始狀態 / Initial State:
// - 1 個世界 / 1 world
// - 100 個地方 / 100 places (PLACE_INITIAL_COUNT)
// - 100 個角色 / 100 characters (1 per place)
// - 道路連接 / Roads connecting nearby places
// ============================================================================

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { createRng } from '@/lib/rng';
import { CONFIG, getScalingRatio } from '@/lib/gameConfig';
import { generatePlaceName } from '@/lib/nameGenerator/place';
import { generatePersonName } from '@/lib/nameGenerator/person';
import { generateFactionName } from '@/lib/nameGenerator/faction';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── 主函數 / Main Function ──────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // ── 0. 清除舊資料 / Clean up existing data ─────────────────────
  // 刪除所有舊資料，確保乾淨的初始狀態
  // Delete all existing data to ensure a clean initial state
  console.log('Cleaning up existing data...');

  // 按照外鍵約束順序刪除（先删子表，再删父表）
  // Delete in foreign key order (children first, then parents)
  // 順序：Event → AmbitionEvent → Friendship → Discontent → Signal →
  //      RoundSnapshot → Road → Character → Faction → Place → World
  await prisma.$executeRaw`DELETE FROM "Event"`;
  await prisma.$executeRaw`DELETE FROM "AmbitionEvent"`;
  await prisma.$executeRaw`DELETE FROM "Friendship"`;
  await prisma.$executeRaw`DELETE FROM "Discontent"`;
  await prisma.$executeRaw`DELETE FROM "Signal"`;
  await prisma.$executeRaw`DELETE FROM "RoundSnapshot"`;
  await prisma.$executeRaw`DELETE FROM "Road"`;
  await prisma.$executeRaw`DELETE FROM "Character"`;
  await prisma.$executeRaw`DELETE FROM "Faction"`;
  await prisma.$executeRaw`DELETE FROM "Place"`;
  await prisma.$executeRaw`DELETE FROM "World"`;

  console.log('Existing data cleaned');

  // ── 1. 建立世界 / Create World ──────────────────────────────────

  const seed = String(Date.now());
  const rng = createRng(seed);

  const world = await prisma.world.create({
    data: {
      name: 'Autonomous World',
      seed,
      rngState: rng.getState(),
      active: true,
    },
  });

  console.log(`Created world: ${world.id}`);

  // ── 2. 建立 100 個地方 / Create 100 Places ────────────────────
  // 使用專案的 nameGenerator 和 gameConfig
  // Using project's nameGenerator and gameConfig

  const places = [];
  for (let i = 0; i < CONFIG.PLACE_INITIAL_COUNT; i++) {
    const name = generatePlaceName(rng);

    // 只有國王的位置有初始建築和駐軍，其餘無主之地全部為 0
    // Only the king's place has initial buildings and garrison, all unowned places start at 0
    const isKingPlace = i === 0;

    const place = await prisma.place.create({
      data: {
        worldId: world.id,
        name,
        garrison: isKingPlace ? CONFIG.PLACE_INITIAL_GARRISON : 0,
        fortress: isKingPlace ? CONFIG.PLACE_INITIAL_FORTRESS : 0,
        market: isKingPlace ? CONFIG.PLACE_INITIAL_MARKET : 0,
        barracks: isKingPlace ? CONFIG.PLACE_INITIAL_BARRACKS : 0,
        layoutX: 0,  // 將由 ForceAtlas2 計算 / Will be calculated by ForceAtlas2
        layoutY: 0,  // 將由 ForceAtlas2 計算 / Will be calculated by ForceAtlas2
        createdAtRound: 0,
      },
    });
    places.push(place);
  }

  console.log(`Created ${places.length} places`);

  // ── 3. 建立道路 / Create Roads ──────────────────────────────────
  // 初始道路為隨機連接，非地理鄰近（因為 seed 階段尚無佈局）
  // 執行期新地點才會用「鄰居重心 + 隨機偏移」增量佈局
  // Initial roads are random connections, not geographic neighbors
  // (no layout exists yet at seed time; runtime new places use neighbor centroid layout)
  // 保證連通性：先建 MST（最小生成樹），再隨機加邊
  // Guarantee connectivity: MST first, then random extra edges
  // 每個地方最終 1-3 條路（每端最多 3 條）
  // Each place ends up with 1-3 roads (max 3 per end)

  const roadSet = new Set<string>();
  const roads = [];
  const roadCountPerPlace = new Map<string, number>();

  // 初始化路數計數 / Initialize road counts
  for (const place of places) {
    roadCountPerPlace.set(place.id, 0);
  }

  // ── 3.1 MST 打底（保證全圖連通）/ Step 1: MST (guarantee connectivity) ──
  // 從 place[0] 開始，逐步加入未連接節點
  const visited = new Set<string>([places[0].id]);
  const unvisited = new Set<string>(places.slice(1).map((p) => p.id));

  while (unvisited.size > 0) {
    // 隨機選一個未訪問節點
    const uId = Array.from(unvisited)[Math.floor(rng.float(0, unvisited.size))];
    // 從已訪問且未滿的節點中隨機選一個
    const candidates = Array.from(visited).filter((vId) => {
      if (vId === uId) return false;
      if ((roadCountPerPlace.get(vId) ?? 0) >= CONFIG.ROAD_MAX_PER_PLACE) return false;
      const key = vId < uId ? `${vId}-${uId}` : `${uId}-${vId}`;
      return !roadSet.has(key);
    });

    if (candidates.length === 0) break; // 無法連接（所有節點都滿了）

    const vId = candidates[Math.floor(rng.float(0, candidates.length))];
    const [aId, bId] = vId < uId ? [vId, uId] : [uId, vId];
    const roadKey = `${aId}-${bId}`;

    roadSet.add(roadKey);
    roadCountPerPlace.set(aId, (roadCountPerPlace.get(aId) ?? 0) + 1);
    roadCountPerPlace.set(bId, (roadCountPerPlace.get(bId) ?? 0) + 1);
    visited.add(uId);
    unvisited.delete(uId);

    const road = await prisma.road.create({
      data: { worldId: world.id, aId, bId, createdAtRound: 0 },
    });
    roads.push(road);
  }

  // ── 3.2 隨機加額外邊（達到目標度數）/ Step 2: Random extra edges ──
  // 確保每個地方至少 1 條路（fallback），再隨機補到 1-3 條
  for (const place of places) {
    const currentCount = roadCountPerPlace.get(place.id) ?? 0;
    if (currentCount >= CONFIG.ROAD_MAX_PER_PLACE) continue;

    // 目標：1-3 條路 / Target: 1-3 roads
    const target = rng.int(CONFIG.ROAD_NEW_PER_PLACE_MIN, CONFIG.ROAD_NEW_PER_PLACE_MAX);
    let needed = target - currentCount;
    if (needed <= 0) continue;

    // 隨機選擇可連接的其他地方
    const candidates = rng.shuffle(
      places.filter((p) => {
        if (p.id === place.id) return false;
        return (roadCountPerPlace.get(p.id) ?? 0) < CONFIG.ROAD_MAX_PER_PLACE;
      })
    );

    for (const other of candidates) {
      if (needed <= 0) break;
      const [aId, bId] = place.id < other.id ? [place.id, other.id] : [other.id, place.id];
      const key = `${aId}-${bId}`;

      if (!roadSet.has(key)) {
        roadSet.add(key);
        roadCountPerPlace.set(aId, (roadCountPerPlace.get(aId) ?? 0) + 1);
        roadCountPerPlace.set(bId, (roadCountPerPlace.get(bId) ?? 0) + 1);

        const road = await prisma.road.create({
          data: { worldId: world.id, aId, bId, createdAtRound: 0 },
        });
        roads.push(road);
        needed--;
      }
    }
  }

  console.log(`Created ${roads.length} roads`);

  // ── 3.5 計算初始佈局 / Calculate Initial Layout ─────────────────
  // 使用 ForceAtlas2 根據道路網路計算位置，讓連接的地方更近
  // Use ForceAtlas2 to calculate positions based on road network,
  // so connected places are naturally closer together

  console.log('Calculating initial layout with ForceAtlas2...');

  // 建立 graphology 圖形 / Create graphology graph
  const layoutGraph = new Graph();

  // 新增所有地方為節點 / Add all places as nodes
  // 使用 sqrt(rng()) 讓分佈均勻（避免中心聚集）
  // Use sqrt(rng()) for uniform distribution (avoids center clustering)
  const R = CONFIG.INITIAL_LAYOUT_RADIUS;
  for (const place of places) {
    const angle = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.float(0, 1)) * R; // sqrt 讓分佈均勻
    layoutGraph.addNode(place.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }

  // 新增道路為邊緣 / Add roads as edges
  for (const road of roads) {
    if (layoutGraph.hasNode(road.aId) && layoutGraph.hasNode(road.bId)) {
      if (!layoutGraph.hasEdge(road.aId, road.bId)) {
        layoutGraph.addEdge(road.aId, road.bId);
      }
    }
  }

  // 運行 ForceAtlas2 / Run ForceAtlas2
  // 使用 CONFIG 中的設定，確保一致性
  const positions = forceAtlas2(layoutGraph, {
    iterations: CONFIG.INITIAL_LAYOUT_ITERATIONS,
    settings: {
      gravity: CONFIG.FA2_GRAVITY,
      scalingRatio: getScalingRatio(places.length), // 動態 scalingRatio，避免 100 節點時太散
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

  // 更新所有地方的位置 / Update all places with calculated positions
  for (const place of places) {
    const pos = positions[place.id];
    if (pos) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          layoutX: pos.x,
          layoutY: pos.y,
        },
      });
    }
  }

  console.log('Initial layout calculated');

  // ── 4. 建立 1 個角色 / Create 1 Character ──────────────────────
  // 只有 1 個角色（國王），放在第一個地方
  // Only 1 character (king), placed at first place

  const name = generatePersonName(rng);
  const wu = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const tong = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const jing = rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX);
  const speed = rng.gaussian(
    CONFIG.CHAR_SPEED_MEAN,
    CONFIG.CHAR_SPEED_SIGMA,
    CONFIG.CHAR_SPEED_MIN,
    CONFIG.CHAR_SPEED_MAX
  );
  const ambition = rng.gaussian(
    CONFIG.CHAR_AMBITION_MEAN,
    CONFIG.CHAR_AMBITION_SIGMA,
    CONFIG.CHAR_AMBITION_MIN,
    CONFIG.CHAR_AMBITION_MAX
  );
  const maxAge = rng.int(CONFIG.CHAR_MAX_AGE_MIN, CONFIG.CHAR_MAX_AGE_MAX);
  const loyalty = rng.pick(['SELF', 'PATH', 'ALTRUISM'] as const) ?? 'SELF';

  const character = await prisma.character.create({
    data: {
      worldId: world.id,
      name,
      wu,
      tong,
      jing,
      speed,
      loyalty,
      ambition,
      age: CONFIG.CHAR_START_AGE,
      maxAge,
      placeId: places[0].id,
      troops: rng.int(5, 15),
      gold: rng.int(50, 150),
    },
  });

  const characters = [character];

  console.log('Created 1 character');

  // ── 5. 建立 1 個勢力 / Create 1 Faction ────────────────────────
  // 只有 1 個國王，其餘角色無所屬
  // Only 1 king, rest are unaffiliated

  const faction = await prisma.faction.create({
    data: {
      worldId: world.id,
      name: generateFactionName(rng),
      color: `hsl(${rng.int(0, 360)}, 70%, 50%)`,
      createdAtRound: 0,
      kingId: characters[0].id,
    },
  });

  // 設定第一個角色為王
  await prisma.character.update({
    where: { id: characters[0].id },
    data: { factionId: faction.id, isKing: true },
  });

  // 第一個地方歸該勢力
  await prisma.place.update({
    where: { id: places[0].id },
    data: { factionId: faction.id },
  });

  console.log('Created 1 faction with king');

  // ── 8. 設定行政官 / Set Administrators ─────────────────────────
  // 每個地方設定一個行政官（隨機角色）
  // Set one administrator per place (random character)

  for (const place of places) {
    // 找出在該地方的角色 / Find characters at this place
    const charsAtPlace = characters.filter((c) => c.placeId === place.id);
    if (charsAtPlace.length > 0) {
      // 隨機選一個當行政官 / Randomly select one as administrator
      const admin = rng.pick(charsAtPlace);
      if (admin) {
        await prisma.place.update({
          where: { id: place.id },
          data: { administratorId: admin.id },
        });
      }
    }
  }

  console.log('Set administrators');

  // 更新世界 RNG 狀態 / Update world RNG state
  await prisma.world.update({
    where: { id: world.id },
    data: { rngState: rng.getState() },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
