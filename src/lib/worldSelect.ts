// ============================================================================
// 世界選擇 / World Selection
// ============================================================================
// 「我現在在看哪個世界」的伺服器端真相：一個 cookie。多世界之後，所有需要世界
// id 的路由都走 `getSelectedWorldId()`——cookie 有效就用它，否則回退到 active
// 世界（沒有 cookie 的首訪、或 cookie 指向已被刪除的世界）。
//
// The server-side truth of "which world am I looking at": one cookie. With
// multiple worlds, every route that needs a world id goes through
// `getSelectedWorldId()` — a valid cookie wins, otherwise fall back to the
// active world (a first visit without the cookie, or one pointing at a world
// that no longer exists).
//
// 選擇是 **per-session** 的（cookie），不分角色：admin 與一般使用者都可以切換
// 世界；「建立新世界」才是 admin 限定。
// The selection is **per-session** (the cookie) and role-blind: admins and
// regular users can all switch worlds; only "create a new world" is admin-only.
// ============================================================================

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/** 世界選擇 cookie 的名字 / The world-selection cookie's name */
export const WORLD_COOKIE = 'aw_world';

/** cookie 有效期：一年 / Cookie lifetime: one year */
export const WORLD_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 目前選中的世界 id；沒有任何世界時為 null。
 * The selected world's id, or null when no world exists at all.
 *
 * 兩次 DB 往返的最壞情況只發生在「cookie 指向不存在的世界」——正常訪問要麼第一發
 * 就命中，要麼只有一次 active 查詢。
 * The worst case (two round trips) only happens when the cookie points at a world
 * that is gone; a normal visit either hits on the first try or runs one active query.
 */
export async function getSelectedWorldId(): Promise<string | null> {
  const store = await cookies();
  const cookieId = store.get(WORLD_COOKIE)?.value;
  if (cookieId) {
    const found = await prisma.world.findUnique({
      where: { id: cookieId },
      select: { id: true },
    });
    if (found) return found.id;
  }
  // 無 cookie（或失效）→ active 世界 / No (or stale) cookie → the active world
  const active = await prisma.world.findFirst({
    where: { active: true },
    select: { id: true },
  });
  return active?.id ?? null;
}
