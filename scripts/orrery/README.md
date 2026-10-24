# 發條星儀 Roundworks Orrery — design note

Anatomy **Figure** tier (40–80 parts). One mechanism: the orrery models the
game's heartbeat — **winding the key once advances the world one round.**

## Concept (one sentence)

A brass bench orrery driven by a mainspring: the sun (world core) sits still at
the top of the column, three faction planets ride flat truss arms on three
stacked collars — each geared off the stem at its own ratio (4 / 6 / 8 rounds
per orbit) — moons swing round their planets on 2 / 3 / 4-round periods, a
round dial counts rounds (zero-padded `RND 0001`, game style) and a sub-dial
sweeps the current round's 18 phases.

## Mapping

| orrery | game |
|---|---|
| sun | the world core (rounds as time) |
| flat truss arms at three heights | the three factions |
| faction-coloured planet drums on arm tips | factions |
| moons on wires | places (faction sizes 2 / 3 / 1 = 6) |
| engraved orbit rings + tick rings | round progress around the ring |
| mainspring barrel, ratchet, click, crank knurl | the winding action that spends itself to run a round |
| 回數 dial (60 ticks) | round counter (`RND 0001…`) |
| 副針 (18 stations) | the round's 18 phases (single source `roundPhases.ts`) |

## Numbers are the model (`model.mjs`)

- orbit radii 24 / 36 / 48; rounds per orbit 4 / 6 / 8 (printed on the label
  plate: `I·144 II·216 III·288` — arm ratio = drive 72 ÷ arm wheel)
- moon periods 2 / 3 / 4 rounds; moon count 2 / 3 / 1
- one crank turn = one round (crank web 30 → stem 60)
- phase sub-dial: 18 stations per round; sun r 5.6, planets r 3.4, moons r 1.3

## Build

`node scripts/orrery/build.mjs` → `public/orrery.html` (dark theme, embedded
hero mode via `?embed=1`, film mode via `?film=1`). `--light` also writes a
light-theme page. Kit home override: `ANATOMY_HOME` env var.
