// ============================================================================
// Prisma Client 單例 / Prisma Client Singleton
// ============================================================================
// 防止在開發環境中建立多個 Prisma Client 實例（Next.js 熱重載）。
// 在生產環境中，單一實例即可。
// Prevents multiple Prisma Client instances in development (Next.js hot reload).
// In production, a single instance is fine.
//
// 使用方式 / Usage:
//   import { prisma } from '@/lib/prisma';
//   const worlds = await prisma.world.findMany();
//
// 這是此程式碼庫中唯一引入 Prisma client 的方式。
// This is the ONLY way to import the Prisma client in this codebase.
// 請勿在其他地方直接引入 @prisma/client。
// Never import @prisma/client directly elsewhere.
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── 單例模式 / Singleton Pattern ─────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * 建立 Prisma Client（使用 driver adapter）
 * Create Prisma Client (with driver adapter)
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from '@prisma/client';
