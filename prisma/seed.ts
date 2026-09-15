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

    const place = await prisma.place.create({
      data: {
        worldId: world.id,
        name,
        garrison: rng.int(5, 20),
        fortress: rng.int(0, 2),
        market: rng.int(0, 2),
        barracks: rng.int(0, 2),
        layoutX: rng.float(0, 1000),
        layoutY: rng.float(0, 1000),
        createdAtRound: 0,
      },
    });
    places.push(place);
  }

  console.log(`Created ${places.length} places`);

  // ── 3. 建立道路 / Create Roads ──────────────────────────────────────────
  // 每個地方連接 1-3 條路到附近地方（使用 gameConfig）
  // Each place connects 1-3 roads to nearby places (using gameConfig)

  const roadSet = new Set<string>();
  const roads = [];

  for (const place of places) {
    // 隨機決定連接數 / Random connection count (using gameConfig)
    const connectionCount = rng.int(
      CONFIG.ROAD_NEW_PER_PLACE_MIN,
      CONFIG.ROAD_NEW_PER_PLACE_MAX
    );

    // 隨機選擇其他地方連接 / Randomly select other places to connect
    const otherPlaces = rng.shuffle(
      places.filter((p) => p.id !== place.id)
    ).slice(0, connectionCount);

    for (const other of otherPlaces) {
      // 確保 aId < bId / Ensure aId < bId
      const [aId, bId] = place.id < other.id
        ? [place.id, other.id]
        : [other.id, place.id];

      const roadKey = `${aId}-${bId}`;

      if (!roadSet.has(roadKey)) {
        roadSet.add(roadKey);
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
