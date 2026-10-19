// ============================================================================
// 資料庫種子腳本 / Database Seed Script
// ============================================================================
// 清空資料庫並種出一個完整可跑的世界。
// Wipes the database and grows one complete, runnable world.
//
// 初始化本體在 `server/initWorld.ts`——與「重置世界」端點**共用同一份**：
// 完整地方集、地理 MST + 補邊道路、ForceAtlas2 佈局、君王 + 勢力 + 行政官、
// round 0 快照後才推進到 round 1。
// The initialisation itself lives in `server/initWorld.ts` — **shared** with the
// reset-world endpoint: the full place set, geographic-MST roads, a ForceAtlas2
// layout, king + faction + administrators, and the round-0 snapshot before
// advancing to round 1.
// ============================================================================

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRng } from '@/lib/rng';
import { initializeWorld, finalizeWorldCreation } from '../server/initWorld';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── 主函數 / Main Function ──────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // ── 0. 清除舊資料 / Clean up existing data ─────────────────────
  // 按照外鍵約束順序刪除（先删子表，再删父表）
  // Delete in foreign key order (children first, then parents)
  // 順序：Event → DefectionEvent → Friendship → Discontent → Signal →
  //      RoundSnapshot → Road → Character → Faction → Place → World
  console.log('Cleaning up existing data...');
  await prisma.$executeRaw`DELETE FROM "Event"`;
  await prisma.$executeRaw`DELETE FROM "DefectionEvent"`;
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

  // ── 2. 初始化本體 + 收尾（與重置世界同一份）/
  //       Initialisation + finalisation (shared with reset-world) ──
  const result = await initializeWorld(world.id, rng);
  console.log(`Created ${result.placeCount} places, ${result.roadCount} roads`);
  console.log('Created 1 faction with king');
  await finalizeWorldCreation(world.id, rng);

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    // 種子程序可能因共用 Prisma 單例的連線池而掛起 → 明確退出
    // The seed process may hang on the shared Prisma singleton's pool → exit explicitly
    process.exit(0);
  });
