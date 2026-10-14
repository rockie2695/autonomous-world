// ============================================================================
// 階段 2.5：生育
// Phase 2.5: Childbirth
// ============================================================================
// 年齡落在可生子區間的存活將領，每回合有一定機率生下一名成年子女。
// A living leader inside the childbearing age window has a per-round chance of
// producing one child, who is born already mature.
//
// 規則（來自規格）/ Rules (from spec):
// - 父子年齡須落在 [CHILD_PARENT_AGE_MIN, CHILD_PARENT_AGE_MAX] / Father must be aged within the window
// - 子女上限 CHILD_MAX_COUNT，下限 CHILD_MIN_COUNT / Bounded by CHILD_MAX_COUNT / CHILD_MIN_COUNT
// - 子女與父親同姓、不同名 / Same surname as the father, different given name
// - 子女一出生即成年，且已在父親的勢力與所在地 / Born mature, already in the father's faction and place
// - 父子／父女立刻成為朋友 / Father and child become friends immediately
// - 沒有子女時，王死後仍走原本的勢力崩解流程 / With no children, a dead king still collapses the faction as before
//
// 使用方式 / Usage:
//   const born = await childbirth(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generateChildName } from '@/lib/nameGenerator/person';

/**
 * 讓可育齡的將領有機會生下子女。
 * Let eligible leaders produce a child.
 *
 * 子女直接進父親的勢力，並繼承父親的所在地：一名剛出生的 20 歲將領若落在無主之地，
 * 就永遠不會被分到地、也拿不到收入，那等於生成了一個不會存在的角色。
 * The child joins the father's faction and inherits his place: a newly born 20-year-old
 * dropped on unowned land would never be assigned a place, never earn income, and so would
 * be a character who effectively does not exist.
 *
 * @param worldId - 要處理的世界 ID / World to process
 * @param round - 當前回合數 / Current round number
 * @param rng - 用於生育判斷與屬性抽取的種子 RNG / Seeded RNG for the roll and the stat draws
 * @returns 本回合出生子女的角色 ID / IDs of children born this round
 */
export async function childbirth(
  worldId: string,
  round: number,
  rng: Rng
): Promise<string[]> {
  // 可生子的存活將領。只有有勢力的人才需要繼承：無主之地的角色生下孩子也無人承繼 /
  // Living leaders old enough to father a child. Only members matter: a character with no
  // faction has nothing for a child to inherit.
  const eligible = await prisma.character.findMany({
    where: {
      worldId,
      alive: true,
      factionId: { not: null },
      age: {
        gte: CONFIG.CHILD_PARENT_AGE_MIN,
        lte: CONFIG.CHILD_PARENT_AGE_MAX,
      },
    },
    select: {
      id: true,
      name: true,
      factionId: true,
      placeId: true,
    },
  });

  if (eligible.length === 0) return [];

  // 已用名字集合：子女的「名」不能撞上任何存活角色 /
  // Names in use: a child's given name must not collide with any living character.
  const aliveNames = await prisma.character.findMany({
    where: { worldId, alive: true },
    select: { name: true },
  });
  const taken = new Set(aliveNames.map((c) => c.name));

  const bornIds: string[] = [];

  for (const father of eligible) {
    // 現有子女數直接數關係，不存冗餘計數欄 /
    // The child count is counted through the relation; there is no stored counter.
    const childCount = await prisma.character.count({
      where: { parentId: father.id },
    });

    // 已達上限就不再嘗試；低於下限則不設障（上限才會擋住既有行為）/
    // At the cap there is nothing to do; the minimum never blocks anything.
    if (childCount >= CONFIG.CHILD_MAX_COUNT) continue;
    if (childCount < CONFIG.CHILD_MIN_COUNT) continue;

    // 每回合的生子機率 / The per-round roll
    if (!rng.chance(CONFIG.CHILD_BIRTH_CHANCE)) continue;

    // 姓名空間耗盡時跳過，不影響其他父親 /
    // Skip when the name space is exhausted; other fathers are unaffected.
    const name = generateChildName(rng, father.name, taken);
    if (name === null) continue;

    const maxAge = rng.int(CONFIG.CHAR_MAX_AGE_MIN, CONFIG.CHAR_MAX_AGE_MAX);

    const child = await prisma.character.create({
      data: {
        worldId,
        name,
        wu: rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX),
        tong: rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX),
        ti: rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX),
        jing: rng.int(CONFIG.CHAR_ABILITY_MIN, CONFIG.CHAR_ABILITY_MAX),
        speed: rng.gaussian(
          CONFIG.CHAR_SPEED_MEAN,
          CONFIG.CHAR_SPEED_SIGMA,
          CONFIG.CHAR_SPEED_MIN,
          CONFIG.CHAR_SPEED_MAX
        ),
        loyalty: 'SELF',
        ambition: rng.gaussian(
          CONFIG.CHAR_AMBITION_MEAN,
          CONFIG.CHAR_AMBITION_SIGMA,
          CONFIG.CHAR_AMBITION_MIN,
          CONFIG.CHAR_AMBITION_MAX
        ),
        // 子女一出生就是成年，且已到父親的所在地 /
        // Born already mature, and already at the father's place.
        age: CONFIG.CHILD_START_AGE,
        maxAge,
        placeId: father.placeId,
        factionId: father.factionId,
        parentId: father.id,
        troops: CONFIG.CHAR_START_TROOPS,
        gold: 0,
        alive: true,
        isKing: false,
      },
      select: { id: true },
    });

    taken.add(name);
    bornIds.push(child.id);

    // 父子／父女立刻成為朋友。aId 一律較小，與 relationships 的約定一致 /
    // Father and child are friends from the start. aId is always the smaller id, matching
    // the convention in relationships().
    const aId = father.id < child.id ? father.id : child.id;
    const bId = father.id < child.id ? child.id : father.id;
    const existing = await prisma.friendship.findUnique({
      where: { worldId_aId_bId: { worldId, aId, bId } },
    });
    if (!existing) {
      await prisma.friendship.create({
        data: { worldId, aId, bId, sinceRound: round },
      });
    }

    // 記錄出生事件 / Log the birth
    await prisma.event.create({
      data: {
        worldId,
        round,
        type: 'CHILD_BORN',
        data: {
          charId: child.id,
          charName: name,
          fatherId: father.id,
          fatherName: father.name,
          placeId: father.placeId,
          factionId: father.factionId,
          childIndex: childCount + 1,
        },
      },
    });
  }

  return bornIds;
}