// ============================================================================
// 階段 6：人際關係
// Phase 6: Relationships
// ============================================================================
// 在鄰近角色間建立友誼與不滿。
// Forms friendships and discontent between nearby characters.
//
// 規則（來自規格）/ Rules (from spec):
// - 每回合：同地點或相鄰（1 條道路）的角色配對 / Each round: same place or adjacent (1 road) character pairs
// - FRIEND_FORM_CHANCE（5%）→ 友誼（雙向）/ FRIEND_FORM_CHANCE (5%) → Friendship (bidirectional)
// - DISCONTENT_FORM_CHANCE（5%）→ 不滿（單向）/ DISCONTENT_FORM_CHANCE (5%) → Discontent (unidirectional)
//
// 使用方式 / Usage:
//   await relationships(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';

/**
 * 在鄰近角色間建立關係。
 * Form relationships between nearby characters.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於關係建立的種子 RNG / Seeded RNG for relationship formation
 */
export async function relationships(
  worldId: string,
  round: number,
  rng: Rng
): Promise<void> {
  // 取得所有存活角色及其所在地 / Get all living characters with their places
  //
  // `name` 是為了友誼事件：要寫進事件日誌就得有人名。
  // `name` is here for the friendship event: an event row needs names to be readable.
  const characters = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: { id: true, name: true, placeId: true },
  });

  // 取得所有道路以找出相鄰地點 / Get all roads to find adjacent places
  const roads = await prisma.road.findMany({
    where: { worldId },
    select: { aId: true, bId: true },
  });

  // 地名：事件日誌的地名是**可點的**（帶 placeId 才能聚焦地圖），所以要連名字一起帶 /
  // Place names: the event log renders a place name as a **clickable** link (it needs the
  // placeId to focus the map), so the name has to come along
  const places = await prisma.place.findMany({
    where: { worldId },
    select: { id: true, name: true },
  });
  const placeName = new Map(places.map((place) => [place.id, place.name]));

  const nameOf = new Map(characters.map((c) => [c.id, c.name]));
  const placeOf = new Map(characters.map((c) => [c.id, c.placeId]));

  // **一次撈出既有的關係，而不是每一對各查一次。** 原本每對配對都要 `findUnique` 兩次；
  // 不滿改成雙向之後寫入的資料列多一倍，逐對查詢會把配對數乘上三。這裡先全部讀進
  // Set，查詢次數從「O(配對數)」變回 1。
  //
  // **Existing relationships are read once**, rather than queried per pair. The loop used
  // to call `findUnique` twice for every eligible pair; with discontent now writing both
  // directions, that per-pair query cost would triple. Reading them into Sets up front puts
  // the query count back at 1.
  //
  // 兩種關係都**正規化**成 `aId < bId` 才放進 Set：友誼本來就是這個慣例，不滿也必須
  // 一樣，否則同一對會以兩種順序各查一次而永遠查不到對方。
  //
  // Both relations are stored **normalised** as `aId < bId` before going into the sets.
  // Friendship already follows that convention and discontent now follows it too —
  // otherwise the same pair is looked up under two orderings and never matches.
  const [existingFriendships, existingDiscontents] = await Promise.all([
    prisma.friendship.findMany({ where: { worldId }, select: { aId: true, bId: true } }),
    prisma.discontent.findMany({ where: { worldId }, select: { aId: true, bId: true } }),
  ]);
  const friendPairs = new Set(
    existingFriendships.map((f) => `${f.aId}|${f.bId}`)
  );
  const discontentPairs = new Set(
    existingDiscontents.map((d) => `${d.aId}|${d.bId}`)
  );

  // 建立鄰接表 / Build adjacency map
  const adjacent = new Map<string, Set<string>>();
  for (const road of roads) {
    if (!adjacent.has(road.aId)) adjacent.set(road.aId, new Set());
    if (!adjacent.has(road.bId)) adjacent.set(road.bId, new Set());
    adjacent.get(road.aId)!.add(road.bId);
    adjacent.get(road.bId)!.add(road.aId);
  }

  // 找出符合條件的配對（同地點或相鄰）/ Find eligible pairs (same place or adjacent)
  const eligiblePairs: [string, string][] = [];

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i];
      const b = characters[j];

      // 同地點 / Same place
      if (a.placeId === b.placeId) {
        eligiblePairs.push([a.id, b.id]);
        continue;
      }

      // 相鄰地點 / Adjacent places
      const aAdjacent = adjacent.get(a.placeId);
      if (aAdjacent?.has(b.placeId)) {
        eligiblePairs.push([a.id, b.id]);
      }
    }
  }

  // 處理每組符合條件的配對 / Process each eligible pair
  for (const [aId, bId] of eligiblePairs) {
    // 正規化成一對唯一鍵：友誼與不滿都用 `aId < bId`，與 `childbirth.ts` 的父子友誼一致 /
    // Normalise to one canonical key: friendship and discontent both use `aId < bId`,
    // matching the father-child friendship in `childbirth.ts`
    const lo = aId < bId ? aId : bId;
    const hi = aId < bId ? bId : aId;
    const friendKey = `${lo}|${hi}`;

    // 建立友誼（雙向）/ Form friendship (bidirectional)
    //
    // **先擲骰、再查有沒有**，擲骰的位置不能動。RNG 的取用順序是這套模擬的決定性契約：
    // 少擲一次（或晚擲一次），之後每一次取樣都會錯位，同一個種子長出另一個世界。
    // 所以這裡刻意保留原本「無條件擲骰」的形狀，只把後面的查詢換成 Set 查詢。
    //
    // **Roll first, then check.** The position of the roll is load-bearing. The order in
    // which the RNG is drawn is the simulation's determinism contract: drop or move one
    // roll and every later draw shifts, so the same seed grows a different world. The
    // unconditional roll is therefore kept exactly as it was, and only the query behind it
    // changed from a database round-trip to a Set lookup.
    const wantsFriend = rng.chance(CONFIG.FRIEND_FORM_CHANCE);
    if (wantsFriend && !friendPairs.has(friendKey)) {
      await prisma.friendship.create({
        data: { worldId, aId: lo, bId: hi, sinceRound: round },
      });
      friendPairs.add(friendKey);

      const loName = nameOf.get(lo);
      const hiName = nameOf.get(hi);
      if (loName && hiName) {
        // 事件一定要寫：友誼現在**有後果**了（朋友叛逃會提高叛變值），
        // 讀者需要看得見誰跟誰走在一起。少了這一步，友誼是玩家完全看不到的機制。
        //
        // The event has to exist: friendship now **has a consequence** (a friend's
        // defection raises yours), so the reader needs to see who is close to whom.
        // Without this row, friendship is a mechanic the player cannot observe at all.
        const placeId = placeOf.get(lo) ?? null;
        await prisma.event.create({
          data: {
            worldId,
            round,
            type: 'FRIENDSHIP',
            data: {
              charId: lo,
              charName: loName,
              character1: loName,
              character2: hiName,
              friendId: hi,
              placeId,
              placeName: placeId ? (placeName.get(placeId) ?? null) : null,
            },
          },
        });
      }
    }

    // 建立不滿（**雙向**）/ Form discontent (**mutual**)
    //
    // 與友誼一樣是「互相的」：同一個配對只擲一次骰，兩個方向都寫入。舊版只寫 `a → b`
    // 一個方向，那不是「互相不滿」，而是一方單方面記住另一方。
    //
    // Mutual, exactly like friendship: one roll for the pair, both directions written. The
    // old version wrote only `a → b`, which is not two people resenting each other but one
    // of them quietly remembering the other.
    //
    // 一次擲骰、寫兩列，`DISCONTENT_FORM_CHANCE` 才是「這對互相不滿的機率」；
    // 分別擲兩次會讓機率變成 `1-(1-c)²` = 9.75%，那是在無聲中改掉一個設定值。
    //
    // One roll writing two rows is what keeps `DISCONTENT_FORM_CHANCE` meaning "the chance
    // this pair becomes mutually discontent". Rolling separately would make it
    // `1-(1-c)²` = 9.75%, which quietly changes a config value.
    const dLoHi = `${lo}|${hi}`;
    const dHiLo = `${hi}|${lo}`;
    const wantsDiscontent = rng.chance(CONFIG.DISCONTENT_FORM_CHANCE);
    if (
      wantsDiscontent &&
      !discontentPairs.has(dLoHi) &&
      !discontentPairs.has(dHiLo)
    ) {
      await prisma.discontent.createMany({
        data: [
          { worldId, aId: lo, bId: hi, sinceRound: round },
          { worldId, aId: hi, bId: lo, sinceRound: round },
        ],
      });
      discontentPairs.add(dLoHi);
      discontentPairs.add(dHiLo);
    }
  }
}
