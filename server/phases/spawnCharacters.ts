// ============================================================================
// Phase 2: Spawn Characters
// ============================================================================
// Generates new characters at places each round.
//
// Rules (from spec):
// - Each place has a chance to spawn a character
// - Spawn rate decreases as world grows: 5% at 100 places → 1% at 2000 places
// - Stats: wu/tong/jing uniform 5-30, speed normal μ=17 σ=5 (clamped 5-30)
// - Ambition: normal distribution μ=17 σ=5 (clamped 5-30)
// - Age: starts at 20, maxAge random 50-80
// - Loyalty: random from SELF/PATH/ALTRUISM
//
// Usage:
//   const spawned = await spawnCharacters(worldId, round, rng);
// ============================================================================

import { prisma } from '@/lib/prisma';
import { CONFIG } from '@/lib/gameConfig';
import { type Rng } from '@/lib/rng';
import { generatePersonName } from '@/lib/nameGenerator/person';

/**
 * Spawn new characters at random places.
 *
 * @param worldId - The world to add characters to
 * @param round - Current round number
 * @param rng - Seeded RNG for reproducibility
 * @returns Number of characters spawned
 */
export async function spawnCharacters(
  worldId: string,
  round: number,
  rng: Rng
): Promise<number> {
  // Get all places in the world
  const places = await prisma.place.findMany({
    where: { worldId },
    select: { id: true },
  });

  if (places.length === 0) return 0;

  // Calculate spawn rate based on world progress
  // Linear interpolation from START to END rate
  const progress = Math.min(
    1,
    (places.length - 100) / (CONFIG.PLACE_MAX_COUNT - 100)
  );
  const spawnRate =
    CONFIG.CHAR_SPAWN_RATE_START -
    progress *
      (CONFIG.CHAR_SPAWN_RATE_START - CONFIG.CHAR_SPAWN_RATE_END);

  let spawned = 0;

  for (const place of places) {
    // Random chance to spawn at this place
    if (!rng.chance(spawnRate)) continue;

    // Generate character stats
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

    // Random loyalty tag (doesn't affect gameplay directly)
    const loyaltyOptions = ['SELF', 'PATH', 'ALTRUISM'] as const;
    const loyalty = rng.pick([...loyaltyOptions]) ?? 'SELF';

    // Create the character
    await prisma.character.create({
      data: {
        worldId,
        name,
        wu,
        tong,
        jing,
        speed,
        loyalty,
        ambition,
        age: CONFIG.CHAR_START_AGE,
        maxAge,
        placeId: place.id,
        troops: 0,
        gold: 0,
        alive: true,
        isKing: false,
      },
    });

    spawned++;
  }

  return spawned;
}
