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
import { CONFIG } from '@/lib/gameConfig';
import { generatePlaceName } from '@/lib/nameGenerator/place';
import { generatePersonName } from '@/lib/nameGenerator/person';
import { generateFactionName } from '@/lib/nameGenerator/faction';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── 主函數 / Main Function ──────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // ── 1. 建立世界 / Create World ──────────────────────────────────────────

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

  // ── 2. 建立 100 個地方 / Create 100 Places ────────────────────────────
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

  // ── 3. 建立道路 / Create Roads ──────────────────────────────────────────
  // 每個地方連接 1-3 條路到附近地方（每端最多 3 條路）
  // Each place connects 1-3 roads to nearby places (max 3 roads per end)

  const roadSet = new Set<string>();
  const roads = [];
  const roadCountPerPlace = new Map<string, number>(); // 計算每個地方的路數

  for (const place of places) {
    // 該地方已有的路數 / Roads already connected to this place
    const currentRoadCount = roadCountPerPlace.get(place.id) ?? 0;
    if (currentRoadCount >= CONFIG.ROAD_MAX_PER_PLACE) continue;

    // 可新增的路數 / How many new roads we can add
    const maxNew = Math.min(
      CONFIG.ROAD_MAX_PER_PLACE - currentRoadCount,
      rng.int(CONFIG.ROAD_NEW_PER_PLACE_MIN, CONFIG.ROAD_NEW_PER_PLACE_MAX)
    );

    // 隨機選擇其他地方連接 / Randomly select other places to connect
    const otherPlaces = rng.shuffle(
      places.filter((p) => {
        if (p.id === place.id) return false;
        const otherCount = roadCountPerPlace.get(p.id) ?? 0;
        return otherCount < CONFIG.ROAD_MAX_PER_PLACE; // 對方也未滿
      })
    ).slice(0, maxNew);

    for (const other of otherPlaces) {
      // 確保 aId < bId / Ensure aId < bId
      const [aId, bId] = place.id < other.id
        ? [place.id, other.id]
        : [other.id, place.id];

      const roadKey = `${aId}-${bId}`;

      if (!roadSet.has(roadKey)) {
        roadSet.add(roadKey);

        // 更新計數 / Update counts
        roadCountPerPlace.set(aId, (roadCountPerPlace.get(aId) ?? 0) + 1);
        roadCountPerPlace.set(bId, (roadCountPerPlace.get(bId) ?? 0) + 1);

        const road = await prisma.road.create({
          data: {
            worldId: world.id,
            aId,
            bId,
            createdAtRound: 0,
          },
        });
        roads.push(road);
      }
    }
  }

  console.log(`Created ${roads.length} roads`);

  // ── 3.5 計算初始佈局 / Calculate Initial Layout ─────────────────────────
  // 使用 ForceAtlas2 根據道路網路計算位置，讓連接的地方更近
  // Use ForceAtlas2 to calculate positions based on road network,
  // so connected places are naturally closer together

  console.log('Calculating initial layout with ForceAtlas2...');

  // 建立 graphology 圖形 / Create graphology graph
  const layoutGraph = new Graph();

  // 新增所有地方為節點 / Add all places as nodes
  for (const place of places) {
    layoutGraph.addNode(place.id, {
      x: rng.float(-100, 100), // 隨機初始位置 / Random initial position
      y: rng.float(-100, 100),
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
  const settings = forceAtlas2.inferSettings(layoutGraph);
  const positions = forceAtlas2(layoutGraph, {
    iterations: 100,
    settings: {
      ...settings,
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

  // ── 4. 建立 1 個角色 / Create 1 Character ──────────────────────────────
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

  // ── 5. 建立 1 個勢力 / Create 1 Faction ────────────────────────────────
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

  // ── 8. 設定行政官 / Set Administrators ─────────────────────────────────
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
