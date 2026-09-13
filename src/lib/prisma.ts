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

import { PrismaClient } from '@prisma/client';

// ─── 單例模式 / Singleton Pattern ─────────────────────────────────────────

/**
 * 全域 Prisma client 參考。
 * Global Prisma client reference.
 * 在開發環境中，儲存在 globalThis 以在熱重載後保留。
 * In development, we store it on globalThis to survive hot reloads.
 * 在生產環境中，每次冷啟動建立新實例。
 * In production, we create a new client per cold start.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma client 實例。
 * The Prisma client instance.
 *
 * 開發環境：跨熱重載重用現有實例。
 * In development: reuses existing instance across hot reloads.
 * 生產環境：每次建立新的 client。
 * In production: creates a fresh client each time.
 *
 * @example
 * import { prisma } from '@/lib/prisma';
 *
 * // 建立世界 / Create a world
 * const world = await prisma.world.create({
 *   data: { name: 'My World', seed: 'abc123' }
 * });
 *
 * // 關聯查詢 / Query with relations
 * const places = await prisma.place.findMany({
 *   where: { worldId: world.id },
 *   include: { faction: true, characters: true }
 * });
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 僅在 debug 模式記錄查詢 / Only log queries in debug mode
    log: process.env.DEBUG === 'true'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
  });

// 在開發環境儲存參考以在熱重載後保留
// Store reference in development for hot reload survival
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ─── 輔助型別 / Helper Types ──────────────────────────────────────────────

/**
 * 取得 Prisma 模型結果的型別。
 * Get the type of a Prisma model result.
 * 對 API 回應型別定義很有用。
 * Useful for typing API responses.
 *
 * @example
 * type WorldType = Prisma.WorldGetPayload<{}>;
 * type WorldWithPlaces = Prisma.WorldGetPayload<{
 *   include: { places: true }
 * }>;
 */
export type { Prisma } from '@prisma/client';
