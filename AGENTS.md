# Autonomous World — AI Agent Guide

This document provides comprehensive guidance for AI agents working on the Autonomous World codebase.

## Project Overview

Autonomous World is a browser-based autonomous simulation game built with:
- **Next.js 16** (App Router)
- **Auth.js v5** (next-auth beta) for authentication
- **Prisma 7** for database ORM
- **TypeScript** with strict mode
- **TailwindCSS 4** for styling
- **TanStack Query** for data fetching and caching
- **Zod** for API input validation
- **React Compiler** for automatic component optimization
- **Vitest** for unit testing

## Critical Architecture Decisions

### 1. Path Aliases

The project uses `@/*` path alias that maps to `./src/*`:

```typescript
// tsconfig.json
"paths": {
  "@/*": ["./src/*"]
}
```

**IMPORTANT**: The `lib/` directory is located at `src/lib/`, NOT at the project root. All imports should use:

```typescript
// ✅ Correct
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { CONFIG } from '@/lib/gameConfig';

// ❌ Wrong - will cause module resolution errors
import { prisma } from '../../lib/prisma';
```

### 2. Prisma 7 Configuration

Prisma 7 requires a `prisma.config.ts` file at the project root:

```typescript
// prisma.config.ts
import 'dotenv/config';  // Must load .env first
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),  // Use env() helper
  },
});
```

**Important**: 
- Install `dotenv`: `pnpm add dotenv`
- Must `import 'dotenv/config'` to load environment variables
- Use `env('DATABASE_URL')` not `process.env.DATABASE_URL`

The `datasource` block in `schema.prisma` should NOT include the `url`:

```prisma
// ✅ Correct for Prisma 7
datasource db {
  provider = "postgresql"
}

// ❌ Wrong - will cause validation error
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 3. Auth.js v5 API

NextAuth v5 uses a different API than v4. The correct pattern:

```typescript
// src/lib/auth.ts
import NextAuth from 'next-auth';

const { handlers, auth, signIn, signOut } = NextAuth({
  // config...
});

export const { GET, POST } = handlers;
export { auth, signIn, signOut };
```

**Key differences from v4:**
- `auth()` is a function that returns a Promise<Session | null>
- `getSession()` does NOT exist — use `auth()` instead
- Callbacks receive typed parameters (not Record<string, unknown>)

### 4. Server Components vs Route Handlers

In Next.js App Router:
- **Server Components**: Use `auth()` directly
- **Route Handlers**: Export GET/POST from the auth config

```typescript
// Server Component (src/app/page.tsx)
import { auth } from '@/lib/auth';

export default async function Page() {
  const session = await auth(); // ✅ Correct
}

// Route Handler (src/app/api/.../route.ts)
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth(); // ✅ Correct
}
```

## File Organization

### Source Code Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # API routes (REST endpoints)
│   │   ├── auth/          # Authentication (Auth.js)
│   │   ├── world/         # World data endpoints
│   │   └── admin/         # Admin-only endpoints
│   └── *.tsx              # Page components
└── lib/                   # Shared utilities and configurations
    ├── auth.ts            # Auth.js configuration
    ├── prisma.ts          # Prisma client singleton
    ├── api.ts             # apiFetch helper (unified 401 handling)
    ├── queryClient.tsx    # TanStack Query provider
    ├── validations.ts     # Zod validation schemas
    ├── gameConfig.ts      # All tunable game values (the project's ONE config)
    ├── rng.ts             # Seeded RNG (mulberry32, FNV-1a hashed seed, serialisable state)
    ├── snapshot.ts        # Snapshot compression (gzip)
    ├── defection.ts       # Defection value + chance, PURE — the stat is never stored
    ├── placeEffects.ts    # Building effects + place output, one definition four consumers
    ├── relations.ts       # Friend / discontent inversion (pure logic, dedupes)
    ├── password.ts        # argon2id hashing (SERVER ONLY — never import from a client)
    ├── passwordPolicy.ts  # Password length rule; imports NOTHING (see Authentication)
    ├── publicWorld.ts     # Unauthenticated world read for the home page
    ├── territory.ts       # Territory force field (pure logic, no DOM)
    ├── spaceGalaxy.ts     # Background galaxy: core, nebula, stars (pure logic)
    ├── spaceFog.ts        # Warm star-dust drift (pure logic)
    ├── spaceFlow.ts       # Flow-field dust (pure logic; the only layer using noise)
    ├── spaceShared.ts     # framedPlacement() + colour helpers shared by the space layers
    ├── utils.ts           # Small shared helpers
    ├── i18n/              # Internationalization
    └── nameGenerator/     # Name generation (pure functions + unique-name scans)
        ├── person.ts      # Character names (classic 張飛 / epithet 霜狼·蓋爾)
        ├── place.ts       # Place names (classic 青碧城 / epithet 霜狼關)
        ├── faction.ts     # Faction names (classic 蒼龍盟 / epithet 霜脊議會)
        └── epithet.ts     # Shared epithet components (heads × tails, used by all three)
```

### Server Code (Game Logic)

```
server/
├── runRound.ts            # Main game loop orchestrator (14 phases + layout + snapshot)
├── moveEvent.ts           # recordMove() — writes CHARACTER_MOVED events (used by aiMove + battle escape)
├── adminAssign.ts         # grantAdmin/revokeAdmin — the ONLY writers of Place.administratorId
├── income.ts              # splitIncome() + othersOf() — king 30% / admin 40% / the controlling faction's others 30%
├── battleReport.ts        # PLACE_CAPTURED arithmetic behind the event log's 戰報 panel
├── uniqueNames.ts         # DB-backed alive-only uniqueness scans over the pure name generators
├── tx.ts                  # Transaction helpers — only where a half-write destroys something
├── graph/
│   └── layout.ts          # ForceAtlas2 layout calculation (recalculateLayout, shouldRecalculate)
└── phases/                # Individual game phases (14 total)
    ├── spawnPlaces.ts     # Phase 1 (incremental layout near parent, road limit enforced)
    ├── spawnCharacters.ts # Phase 2 (faction-controlled places only; returns spawned IDs + assigns spawn-place admin)
    └── ...               # Phases 3-14
```

### Components

```
src/components/
├── SigmaMap.tsx           # Interactive graph map (Sigma.js + graphology)
                           # - Nodes: faction-colored (HSL→hex), sized by troops
                           # - Edges: semi-transparent roads
                           # - Dynamic labels with faction-colored backgrounds
                           # - ONE overlay <canvas> (pointer-events-none) under the sigma
                           #   container, so WebGL paints the node discs and labels on top:
                           #     spotlight/move: pulsing rings (cyan=created, red=attacked)
                           #     + faction-colored travel dot for the displayed round's
                           #     moves; this is the only rAF loop, and it also owns the
                           #     persistent decoration: every node's white border + black
                           #     shadow (non-star zoom) and, at star zoom, the sun glow,
                           #     orbits, planets and moons. The loop must never be
                           #     short-circuited when there are no events — see
                           #     "Map Spotlight & Move Animation".
                           #   The old radial glow sprite stays removed; do not add a
                           #   second canvas back.
                           #   NOTE: canvas is a replaced element — keep `w-full h-full`
                           #   (inset-0 alone leaves it at intrinsic 300×150).
                           # - Camera: clicking a node animates the view to centre it;
                           #   resetView animates to fit the whole graph (getBBox), not
                           #   ratio 1. Duration is CONFIG.MAP_CAMERA_ANIM_MS, or 0 when
                           #   prefers-reduced-motion is set.
├── mapShared.ts            # SigmaMap's pure half: colour maths, shapes, MapCameraControls
├── LeaderAvatar.tsx        # Procedural leader head bust, seeded from character.id; pure trait logic in deriveAvatarTraits()
├── SpaceGalaxy.tsx         # Baked rotating galaxy, bottom layer. Pure geometry in lib/spaceGalaxy.ts
├── SpaceFog.tsx            # Warm seeded star-dust drifting slowly, above the galaxy and UNDER the map (no zoom fade). Pure logic in lib/spaceFog.ts
├── SpaceFlow.tsx           # Flow-field dust over the galaxy. Pure field logic in lib/spaceFlow.ts
└── home/                   # Homepage sections (three.js scenes, live poller, hooks)
                            #   (the event log and charts live in src/app/game/)

src/app/game/ is split into focused modules — page.tsx is the orchestrator, and
everything it delegates to lives in a sibling file:
├── page.tsx                # Orchestrator: GamePage, map HUD, RoundTimeline, MapSidePanel, CharacterList, PlaceDetail, ZoomSlider
├── types.ts                # Shared types: WorldInfo, WorldState, GameEvent. Its own module so the components below can share them without an import cycle
├── icons.tsx               # Ic, Crown, EventGlyph — one copy, shared by the page, the event log and the charts
├── styles.ts               # The `GM_*` surface strings (GM_PANEL, GM_BTN, GM_SKEL…). Shared because the page, the event log, the charts and the leader modal all render the same surfaces
├── EventLog.tsx            # Bilingual event log (i18n t() with parameter substitution) + the faction / category / info-kind filters; header shows the displayed round zero-padded to 4 digits (`RND 0001` style)
├── stats-charts.tsx        # Stats panel: 9 time-series charts in 4 switchable styles, the faction-power treemap, the character radar, and the shared ChartTooltip / ChartLegend. See "Stats Charts" below.
├── BattleReport.tsx       # 戰報 panel for PLACE_CAPTURED; portalled to document.body so it does not scroll away with the log
└── leader-detail.tsx       # DetailModal + FactionRanking. These two MUST stay together: the modal embeds the ranking, and the radar's hover preview opens the modal — splitting them would make stats-charts.tsx import page.tsx back
```

**Why `leader-detail.tsx` exists.** `stats-charts.tsx` needs `DetailModal`
(`CharacterRadarHover` opens it), and `DetailModal` renders `FactionRanking`.
If both stayed in `page.tsx`, the charts module would have to import the page
that imports it — a cycle. Co-locating them breaks it at the source.

### Styling surface (`src/components/home/`)

```
src/components/home/
├── tokens.ts              # Shared Tailwind utility strings (EYEBROW, CTA_*, PANEL…)
├── Motion.tsx             # Reveal / Parallax primitives; both collapse under reduced motion
├── HomeNav.tsx            # Scroll-spy nav, mobile menu, language switch
├── VoidCanvas.tsx         # dynamic(ssr:false) wrapper for the backdrop body
├── VoidScene.tsx          # three.js black hole: thin-lens deflection + crystalline lattice
├── HeroReticle.tsx        # SVG instrument frame over the hero product view
├── SagaChart.tsx          # Self-drawing SVG star chart for #saga
├── WorldGraph.tsx         # dynamic(ssr:false) frame; owns the graph's a11y semantics
├── WorldGraphScene.tsx    # three.js real faction graph, built from live world data
├── LiveWorld.tsx          # Graph + faction legend
├── LiveStats.tsx          # Live counts from the public endpoint
├── LiveRound.tsx          # "Round N" tag in the hero
├── SignalFeed.tsx         # Ticker carrying real events
├── usePublicWorld.ts      # Module-level singleton poller; one request chain, many subscribers. Read through `useSyncExternalStore` — do NOT reintroduce a `setState` inside the subscribe effect
└── useChangedKeys.ts      # Flags which numbers moved since the last poll so LiveStats/FactionNebula can flash them. Diffs during render (React's "adjust state" pattern), never a synchronous setState in an effect
```

**Styling convention.** Design values live once in `@theme static` in
`src/app/globals.css`. Surfaces are expressed with Tailwind utilities. A surface
used more than once has its utility string declared as a module-scope `const` at
the top of the file that owns it — `src/app/page.tsx` for the home page,
`src/app/game/styles.ts` for the game page. `styles.ts` is its own module
because the page, the event log, the charts and the leader modal all render the
same surfaces; a string used by two files belongs in that shared module rather
than being duplicated. **Do not add a bespoke CSS class for a surface.** The only two
classes left in the project are `ds-gm-scroll` and `ds-gm-noscroll`, kept
because scrollbar pseudo-elements cannot be expressed as utilities.

**Two overrides need `!`.** Bespoke classes used to sit in `@layer components`
while utilities sat in `utilities`, so a class always lost to a utility. Both are
in one layer now, so a deliberate override must use Tailwind's important
modifier: `text-xs!`, `text-gray-200!`, `border-red-500/30!`. Hover variants
(`hover:`) already carry higher specificity and need nothing.

**The one inline-style exception** is faction colour, which is runtime data read
from the database. It is applied as an inline `style` on a swatch and annotated
as such. Never use an inline style for a design token.

### Database

```
prisma/
├── schema.prisma          # Database schema (Prisma 7 format)
├── seed.ts                # Initial game data seed script
└── migrations/            # Database migrations
```

## Development Guidelines

### Adding New Features

1. **Game mechanics**: Add to `server/runRound.ts` or create new phase files in `server/phases/`
2. **UI components**: Create in `src/app/` or as shared components
3. **API routes**: Add to `src/app/api/` following existing patterns
4. **Config values**: Always add tunable values to `src/lib/gameConfig.ts`

### Road Creation Rules

When creating roads between places, always enforce the `ROAD_MAX_PER_PLACE` limit:
- Query existing road counts per place before selecting targets
- Filter out places that already have `ROAD_MAX_PER_PLACE` (4) roads
- Apply this check in both seed scripts and runtime phases
- Prevents any place from exceeding the road capacity limit

### Name Generation Rules

Person, faction **and place** names each mix **two styles**, gated by `gameConfig.ts`:

| Style | Person | Faction | Place |
|-------|--------|---------|-------|
| classic (65%) | 張飛 — `[surname][given]` | 蒼龍盟 — `[descriptor][noun][suffix]` | 青碧城 — `[adj][adj][terrain]` |
| epithet (35%) | 霜狼·蓋爾 — `[epithet]·[foreign]` | 霜脊議會 — `[epithet][org type]` | 霜狼關 — `[epithet][terrain]` |

- `CONFIG.PERSON_EPITHET_NAME_RATE` / `CONFIG.FACTION_EPITHET_NAME_RATE` / `CONFIG.PLACE_EPITHET_NAME_RATE` control the mix; set to `0` to disable that style
- Epithet components live in `src/lib/nameGenerator/epithet.ts` (shared by all three): `EPITHET_HEADS` (nature/material) × `EPITHET_TAILS` (animal/terrain/force) = 576 epithets
- Person adds `FOREIGN_GIVEN_NAMES` (24 two-char transliterations); faction adds `ORG_TYPES` (12 two-char org types — 議會, 軍團, 聯邦…); place reuses the existing `PLACE_TERRAINS`
- Place modifiers (`PLACE_ADJECTIVES`, 81) mix atmosphere adjectives **and** concrete features (岩/狼/龍) so the home page demo names (灰岩高地, 沉星渡口, 裂風關, 黑曜要塞, 霧海前哨) are all generatable — `place.test.ts` guards this, so extending a pool means re-checking that test
- `generatePersonName` / `generateFactionName` / `generatePlaceName` pick a style with a single `rng.chance()` roll — **any change to these functions or the pools changes every world generated from a given seed**
- Uniqueness: `generateUnique{Person,Faction,Place}Name` keep the 64-try fast path, then scan the classic space and the epithet space in order, so alive names never collide across styles. When adding a new pool, extend the matching scan too
- **Place capacity is a union, not a sum**: the two styles overlap (10,659 names like 雲影城 are reachable from either), so `PLACE_TOTAL_NAME_CAPACITY = 369,360 + 32,832 − 10,659 = 391,533` is computed from the pools at module load. Do not replace it with a plain sum — the "N distinct names" guarantee and the exhaustion test depend on it
- `server/uniqueNames.ts` builds the `taken` set from the DB (alive only) and calls those pure generators — do not write name-collision logic anywhere else

### Faction-Controlled Place Rules

A place is "faction-controlled" when `place.factionId != null`. Unowned (無主之地) places must never gain these:

- **Character spawn**: `spawnCharacters.ts` queries `where: { factionId: { not: null } }` — no generals spawn at unowned places; a spawned general is created with `factionId: place.factionId` (it joins that place's faction)
- **Auto admin assignment**: `assignAdmins.ts` queries `where: { factionId: { not: null }, administratorId: null }`
- **Manual admin assignment**: `POST /api/admin/assign-admin` returns **400** `"Cannot assign administrator to an unowned place"` when `place.factionId` is null
- If legacy data violates this (e.g. an admin left behind after a rule change), clear it once: `prisma.place.updateMany({ where: { factionId: null, administratorId: { not: null } }, data: { administratorId: null } })`

### Spawn Round Rules (Phase 2 + Phase 9)

- `spawnCharacters.ts` returns `string[]` of IDs spawned this round (it also assigns admins, see below); `runRound.ts` passes them to `aiMove(worldId, round, rng, skipIds)` as a `Set` — **characters spawned in a round never move in that round** (no movement, no `CHARACTER_MOVED` event in the spawn round)
- **Spawn admin assignment** (done inside `spawnCharacters.ts` right after creation, so economy/assignAdmins see it the same round):
  1. Spawn place vacant (or its admin is dead) → assign the new leader directly
  2. Current admin is the living **king** → king keeps his seat, no comparison
  3. Otherwise compare **total ability `wu + tong + jing`** (new leader vs current admin); only a **strictly greater** total replaces the admin
  4. On replacement: old admin's ambition **increases** by `CONFIG.DEFECTION_ADMIN_REPLACED_DELTA` (1, clamped to `CHAR_DEFECTION_BASE_MAX`), logged as an `ADMIN_REMOVED` Event **and** a `DefectionEvent`
- `Place.administratorId` is globally unique (`@unique`) — a character administers at most one place

### Administrator Assignment, Ambition & Cooldown

All four admin-changing paths go through `server/adminAssign.ts` (`grantAdmin` / `revokeAdmin` / `isAdminChangeCoolingDown`) so the rules live in one place. **Never write `Place.administratorId` directly** — go through the helpers.

- **Grant** (`grantAdmin`, every path): sets `administratorId` + `Place.adminChangedRound = round`, `lastPromotedRound = round`, and writes a `-CONFIG.DEFECTION_ADMIN_ASSIGNED_DELTA` (1) `DefectionEvent` — that is, it moves the **defection value**, not the fixed base
- **Revoke** (`revokeAdmin`): a `+CONFIG.DEFECTION_ADMIN_REPLACED_DELTA` (1) `DefectionEvent`
- **The temporary-reduction machinery is GONE, and this section used to be wrong about it.** It
  claimed the −1 auto-reverted after `DEFECTION_ADMIN_ASSIGNED_DURATION_ROUNDS` (10) via an
  `AMBITION_RECOVERED` Event. None of that runs: `adminAmbitionRevertRound` had been referenced
  only from comments for some time and the column is now dropped, `AMBITION_RECOVERED` was never
  emitted by anything, and the only `eventData` any caller passes is `{ oldTotal, newTotal }`.
  Those three dead paths — the column, the event type and its EventLog/icons/SignalFeed branches —
  were deleted together. `DEFECTION_ADMIN_ASSIGNED_DELTA` itself is still used: as a **permanent**
  ledger entry, with no revert. Do not reintroduce the revert without reading this first.
- **Paths**: `spawnCharacters.ts` (phase 2, cooldown-gated) · `assignAdmins.ts` (phase 12, cooldown-gated) · `battle.ts` capture sites (phase 10, **not** gated — captures still apply) · `POST /api/admin/assign-admin` (manual, **not** gated)
- **Cooldown** (`CONFIG.ADMIN_CHANGE_COOLDOWN_ROUNDS` = 10): any administrator change (assign, revoke, or the seat-clearing in `grantAdmin`) stamps `Place.adminChangedRound`. While `round - adminChangedRound < 10` the **AI paths only** (phase 2 assignment, phase 12 `assignAdmins`) skip that place. `assignAdmins` filters in its `where` clause (`adminChangedRound: null` OR `<= round - 10`); `spawnCharacters` uses `isAdminChangeCoolingDown()`
- **The manual API revokes the outgoing admin** before granting (defection value +1 + `ADMIN_REMOVED` Event) and clears the incoming character's seat elsewhere for the unique constraint
- **The ledger is the only destination.** Deltas go to the `DefectionEvent` table and nowhere else:
  there is no `Event.data.ambitionDelta` any more, and no visible ambition suffix in the log. That
  suffix existed only because the `ADMIN_ASSIGNED` / `ADMIN_REMOVED` rows used to carry it; the
  `ambitionDelta` i18n key and its two false "ambition changed" clauses went with it, because
  ambition has not changed for a leader in a long time and the log was still claiming it had.
- **A ledger row is summed only on the round its `round` names** — `loyaltyCheck` (phase 8) reads
  `round === current` and nothing else. Every writer therefore has to stamp the round whose
  **check** it wants to feed: the spawn path (phase 2) and the manual API write the current / next
  round, which phase 8 of that round reads. **The capture path must pass `ledgerRound: round + 1`**
  (Oct 2026): a capture happens in phase 10, after that round's check has run, so the revoke's
  `+DEFECTION_ADMIN_REPLACED_DELTA` was being written and then never counted by any roll — the
  "lost their place, more likely to defect" effect did not exist. `transferAdminSeat` passes it;
  the popup's 本回合影響 (which reads the same per-round table) shows the row from the next round on,
  so the tooltip's arithmetic and the roll stay identical.

### Map Spotlight & Move Animation

- `GET /api/world/state?round=N` returns `spotlights: Array<{placeId, kind: 'created'|'attacked'}>` and `moves: Array<{fromPlaceId, toPlaceId, factionId}>` (computed from the events table; works for both snapshot and live paths)
- Spotlight window: rounds `N - CONFIG.SPOTLIGHT_ROUNDS + 1 .. N` (with `SPOTLIGHT_ROUNDS: 1` → only round `N`) over `PLACE_CREATED` (kind `created`) and `PLACE_CAPTURED`/`BATTLE_DEATH`/`ESCAPE_SUCCESS` (kind `attacked`; `created` wins ties)
- `moves` includes only `CHARACTER_MOVED` events with `round === N` (the displayed round exactly)
- `CHARACTER_MOVED` events are written by `server/moveEvent.ts#recordMove()` from all four `aiMove.ts` movement sites and the three `battle.ts` escape sites; no-op when `fromPlaceId === toPlaceId`
- Animation timing lives in `gameConfig.ts`: `SPOTLIGHT_ROUNDS: 1`, `MOVE_ANIM_DURATION: 1500`, `MOVE_ANIM_PAUSE: 2500`
- The spotlight layer is the map's **only** rAF loop and it obeys the animation rules: it pauses when the canvas leaves the viewport (`IntersectionObserver`) and when `document.hidden`, and under `prefers-reduced-motion` it renders a single static frame (`STATIC_FRAME_MS`) with no loop at all. It listens for a mid-session `matchMedia` change too. Keep the gate in `isAnimating()` and keep the initial `resize()` call **after** `isAnimating`/`renderFrame` are declared (an earlier call hits the temporal dead zone)
- **Do NOT reintroduce an early return for "no spotlights and no moves".** One existed, and it silently blanked the map. It was originally sound — the loop existed only for those two animated things — but the loop now also owns **persistent decoration**: the node border and shadow, and at star zoom the sun glow, orbits, planets and moons. A freshly seeded world is at round 1 with zero `PLACE_CREATED` and zero `CHARACTER_MOVED`, so both arrays are empty and that gate tripped: the places stayed visible (sigma paints the discs itself) while the whole overlay never started. **The symptom is a split screen — bare discs, no decoration — which looks like a rendering bug rather than a skipped loop.** Under `prefers-reduced-motion` the single static frame is still drawn, so nothing has to give for that rule.
- **Z-order**: the single spotlight/move overlay `<canvas>` paints before the sigma container div, so place labels always render on top of it. Keep that DOM order. (The node glow/shadow canvas that used to sit below it is removed.)
- **Label visibility**: labels are a **pure zoom rule** — they show only while `camera.ratio <= CONFIG.LABEL_ZOOM_RATIO` (0.6), regardless of garrison. `nodeReducer` sets `label = null` when zoomed out and `labelRenderedSizeThreshold` is pinned to `0`. Do **not** reintroduce `labelRenderedSizeThreshold`: it compares on-screen node **size**, so garrisoned places kept their names when zoomed out, and the camera ratio cancels out of that comparison, so it was never a zoom threshold. The camera's `updated` event (bound via `sigma.getCamera().on`, since sigma does not re-emit it) refreshes on each crossing. Tune `LABEL_ZOOM_RATIO` in `gameConfig.ts`, not inline.
- **One exception to the zoom rule**: the hovered node, the selected node, and the hovered node's graph neighbours always keep their label, so you can read a place and what it links to while zoomed out. `forceLabel` alone is **not** enough — it only bypasses `labelRenderedSizeThreshold`, so a `null` label has already left Sigma's label index and nothing can draw it. The gate must therefore read `if (!labelsVisibleRef.current && !isActive) res.label = null`, never null an active node.
- `GET /api/world/events?round=N` applies read-time enrichment to `CHARACTER_MOVED`: adds `fromPlaceName`/`toPlaceName` by joining `places` (events themselves store only placeIds)
- **Every character-bearing event carries `charId`**, so a log row links the leader by id. `CHARACTER_SPAWNED` is the one that had to be added (`created.id` in `spawnCharacters.ts`); the other sites already had it. Because the events table predates the column, the route also **backfills at read time**: rows whose `charId` is null but whose `charName` is set are matched against `characters` for that world, preferring `alive` first. The client then calls `leaderNode(charId, charName)` and prefers the id, falling back to the name — and prefers no action over opening the wrong leader.

### Map HUD, Side Panel & Round Playback

- The 將領 / 事件 / 統計 tabs are **absolutely positioned over the map's right edge** (`MapSidePanel`, `z-[8]`), not a layout column — the map keeps the full width. The vertical tab rail is always visible; only the 19rem content panel collapses (its own ✕), and content enters and exits with a right-to-left fade (`AnimatePresence`, `x: 28`)
- **Clicking the already-active tab closes its panel.** `onTabChange` checks `rightTab === tab` first and, on a match, does `setRightTab(null)` + `setRightPanelOpen(false)` — a toggle, not open-only, so the rail can always dismiss its own panel
- **Nothing is a layout column any more.** 選擇回合 (`RoundTimeline`, `GM_TIMELINE`) is absolutely positioned over the map's **left** edge (`absolute left-12 top-12 z-[7] w-60 hidden md:block`), and 勢力排行 (`FactionRanking`) moved into the **統計** tab above the charts. Both used to be a left sidebar; a sidebar column is what forced the map to share width with chrome. The mobile overlay drawer is unaffected — it still stacks timeline, leader list and event log
- `GM_HUD_CONTROLS_OPEN` shifts the zoom controls left by `31rem` so they clear the open panel, and **from `md` up** (Oct 2026: was `lg`/`26rem`, which left the 768-1023px tablet band with the controls underneath the open panel) — below md the panel is an overlay drawer and the controls keep `right-4`
- The **zoom slider** sits between the zoom-out and zoom-in buttons and scrubs the camera ratio directly (`setState`, no animation, so the handle tracks the pointer; Sigma still owns the real ratio). `MapCameraControls` carries `getZoom` / `setZoom` / `onZoomChange`; `ZoomSlider` subscribes in an effect and unsubscribes in its cleanup. Bounds: `MAP_ZOOM_MIN_RATIO: 0.05`, `MAP_ZOOM_MAX_RATIO: 3`
- **The percentage is an `<input type="number">` plus a literal `%` label**, not a display. It reads `0` = furthest, `100` = closest, and typing a value jumps the camera there (`Enter` commits, and so does blur — Enter alone would leave the text unapplied for someone who tabs away). The draft is a **string**, never a number: a numeric value would reformat `15` to `1` on the first keystroke and throw the caret to the end. Dragging the slider clears the draft so the field follows the zoom again. The `%` is a separate `<span>` beside the input so the number stays the editable body and `%` is only its unit
- Controls are held in **both a ref and state**: `onControlsReady` sets `mapControlsRef` (imperative calls) *and* `mapControls` state (rendering). Reading `ref.current` during render is a lint error ("Cannot access refs during render")
- **The camera must survive a data refresh.** The graph-rebuild effect runs on every `[places, factions, roads,
  characters]` change, i.e. every time a round advances, and it calls `graph.clear()` — emptying the graph can
  reset sigma's camera state. Snapshot `x / y / ratio / angle` **before** the clear and `camera.setState(saved)`
  afterwards, or the map snaps to a default view on every "Next Round". Use `setState`, not an animation:
  the user adjusted the view by hand, so what is wanted is an immediate return, not a glide.
- **The camera never gets the chance to break, because the map is never unmounted.** The
  world-state query carries `placeholderData: keepPreviousData`. Without it, changing rounds
  changes the `queryKey`, so `worldState` becomes `undefined`, so the guard
  `if ((isLoading || worldInfoPending) && !worldState)` fires and **the entire page swaps to the
  skeleton with `SigmaMap` inside it**. Sigma is then rebuilt from scratch — galaxy, both
  overlays, every rAF loop — and the camera returns to its default view. It reads as "the screen
  refreshed", which is exactly what the user reported for **both** Next Round and picking a round
  from the timeline: both go through `setSelectedRound`, so they are one bug, not two.
  `keepPreviousData` keeps the old round on screen until the new one arrives, so only the node set
  changes. Verified by marking the container element and watching a `MutationObserver` across four
  round switches: **1 unmount before, 0 after**, camera zoom unchanged at 68 throughout.
  - This is why the skeleton's `&& !worldState` guard is load-bearing rather than cosmetic —
    it is what turns "pending" into "unmounted" for the whole page.
  - `StatsCharts` does *not* need this. It fetches with a manual `useEffect` and only calls
    `setData` on success, so it holds the previous payload while refetching. Do not "fix" it by
    clearing `data` first.
- The header renders `TelemetryStrip inline`, merging 世界概況 into the header row and handing the height back to the map
- **Autoplay floor is 5s**: `AUTOPLAY_MIN_MS: 5000`, `AUTOPLAY_MAX_MS: 15000`, `AUTOPLAY_DEFAULT_MS: 5000`. `CONFIG` is `as const`, so the slider state must be `useState<number>(CONFIG.AUTOPLAY_DEFAULT_MS)` or it pins to the literal and rejects every other speed
- **Loading skeletons** all use `GM_SKEL`: `MapSidePanel` shows `PanelSkeleton` while world state is pending, `EventLog` renders skeleton rows during its own fetch, and `StatsCharts` derives `statsPending = currentRound >= 1 && !data && !fetchFailed` so an unanswered request reads as *loading* rather than `game.noData`. `StatsCharts` fetches with a manual `useEffect`, not `useQuery`, so it has no `isLoading` to read

### Event Log Filters (`src/app/game/EventLog.tsx`)

Five independent filters compose by AND; the header reports how many of the round's
events survived, and says so when all of them were filtered out.

- **Faction** — a `<select>` (`#gm-evt-faction`) plus 全部. `factionOfEvent()` resolves an event's faction through **`charId` first, then `placeId`**. `charId` is the reliable link (every character-bearing event carries it, backfilled at read time — see above), so a `CHARACTER_MOVED` row filters under the mover's faction rather than the destination's
- **Leader** — a `<select>` (`#gm-evt-leader`) listing every character in the world, name-sorted (`localeCompare`), the dead suffixed `†` (their events remain in the log). The semantics are "events **involving** this leader": `eventLeaderIds()` (`src/app/game/eventFilter.ts`, pure and tested) collects **every** leader id an event's data carries — `charId`, `fatherId`, `friendId`, `kingId`, `adminId`, `newAdminId` — and a match on any counts. Without that, filtering by a leader would drop the rows where they appear as a father, a friend, the king or an `INCOME` recipient
- **Place** — a `<select>` (`#gm-evt-place`) listing every place, name-sorted. Same semantics: `eventPlaceIds()` matches `placeId` **or either endpoint of a move** (`fromPlaceId` / `toPlaceId`), so a move into or out of the place shows up. The matching rule lives in `eventFilter.ts`, not inline in the component — it is the kind of "which fields count" rule that silently drifts when written twice
- **Category** — six multi-select chips, each an `aria-pressed` toggle. `EVENT_CATEGORY` maps an event `type` to one of `battle` / `character` / `economy` / `faction` / `admin` / `other`, and `EVENT_CATEGORIES` is the chip order. Chips are multi-select, not radio: any subset stays active
- **Info kind** — 人物 / 地點 / 其他 toggles, derived by `eventInfoOf()` from what the event's `data` carries. This is not a display filter: it decides whether a name renders as a clickable button (`onFocusPlace` / `onOpenLeaderDetail`) or as plain text, which is what makes names in the log navigable
- Filtering is derived (`filterKey` + `useMemo`), never applied by mutating the fetched list, so toggling filters back off restores the full set for free
- Rows are paged at `CONFIG.EVENT_LOG_PAGE_SIZE` (60); the total can reach tens of thousands

### Event Log ordering: oldest to newest, and why that is causal

The log reads **oldest at the top**. Three separate defects produced a timeline that ran
backwards, and all three had to be fixed — fixing the display alone would have hidden the
other two rather than repairing them.

- **`EventLog.tsx` had `[...filtered].reverse()`**, on a false premise. Its comment claimed "the
  API returns newest-first", but `/api/world/events` has *always* ordered within a round by
  `createdAt: 'asc'`. Only the all-rounds branch ever wrote `round: 'desc'`, and that is the order
  *between* rounds, not within one. The reversal therefore flipped every round to newest-first, and
  the log read "upgrade → capture → appointed → moved → bought → income": the money earned last,
  the upgrade first.
  - It also made the rest of the file contradict itself. `shown` deliberately takes the **tail** so
    the reader lands on the newest slice, and the auto-scroll pins to the bottom for the same
    reason — both only hold oldest-to-newest. With the reversal in place the tail became the
    *oldest* slice and `hasOlder` answered wrong. **Do not reintroduce it.**
- **One endpoint returned opposite orders depending on the query.** The single-round branch had
  `{ createdAt: 'asc' }` and the all-rounds branch `[{ round: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }]`.
  Both are now `[{ round: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]` — one order, no reversal on
  either side.
  - **The `id` tiebreak is load-bearing, not decorative.** Postgres compares timestamps at
    millisecond resolution and events written back to back within a round routinely land in the same
    millisecond, leaving their order *undefined* without it. That is what makes an ordering bug look
    intermittent instead of consistently wrong.
- **The simulation wrote the appointment before the capture.** In `battle.ts`, `grantAdmin()` ran
  *before* the `PLACE_CAPTURED` create, so the log read "appointed administrator of X" **before**
  "captured X" — appointed first, captured second. Both are sequential `await`s with no race, so the
  database order was decided entirely by the order of the statements. Swapping them fixes it;
  gameplay is untouched, because the administrator still arrives before the build phase (11), so
  "captured this round, upgraded this round" still holds. Only the log's ordering changes.
  - `server/battle.eventOrder.test.ts` guards it. It reads the **source** rather than testing
    behaviour: the test environment is `node` with no database, and the only checkable invariant is
    which statement comes first — the same approach as `territoryLabelPlacement.test.ts`, which
    guards a CSS declaration. Verified in both directions: it fails on the old order with
    `expected 13395 to be less than 13102`. A second case checks `grantAdmin` stays **inside** the
    `if (captured)` block, which the relative-position check alone cannot catch.
- **Existing rounds keep their stored order.** The log is append-only and nothing rewrites rows;
  back-dating entries to make a story read better would destroy the thing that makes it
  trustworthy. Only rounds run after the fix show capture-before-admin.

### Map Node Border, Shadow & Camera

- **A white border and a small black shadow are drawn on every place, at every non-star zoom.** A
  star cloud and a near-black backdrop eat node edges: a disc with no border smears into the
  background and becomes genuinely hard to find. The user's words: "otherwise the star cloud and dark
  space background make place is difficult to see."
- Both layers go on the **existing** overlay `<canvas>`, and both must sit **outside** the node disc,
  because the overlay is behind sigma's WebGL canvas. A new canvas *above* sigma would cover the place
  labels, and the project forbids that (see "Space Backdrop" — one rAF loop, one overlay).
- **Sigma 3.0.3's ESM build has no node-border support.** The `borders` option only exists in a stale
  `sigma.min.js` UMD artifact and is not importable, so a border cannot be configured on the node
  program. This is why the border is painted by hand. Do not try to reintroduce node borders.
- The shadow is **concentric strokes at falling alpha** (`MAP_NODE_SHADOW_LAYERS`,
  `MAP_NODE_SHADOW_LAYER_FALLOFF`), not one `createRadialGradient` per node — the latter is a thousand
  gradient objects every frame.
- **A black shadow on a near-black background is close to a no-op.** That is real physics, not a bug:
  it only registers where the galaxy is genuinely bright. That is precisely the case the user asked
  for, so keep it, but do not expect it to be visible over pure void.
- Config: `MAP_NODE_BORDER_COLOR` / `MAP_NODE_BORDER_WIDTH` / `MAP_NODE_SHADOW_COLOR` /
  `MAP_NODE_SHADOW_SPREAD` and the `MAP_NODE_SHADOW_LAYER_*` group.
- **Node radius maths, because it governs every size choice here.** Sigma's `scaleSize` is
  `size / sqrt(camera.ratio)` with the default `itemSizesReference: "screen"` — nothing else. So a
  `size: 5.7` node is ~3.3px of radius at ratio 3, ~5.25px at the default fit (~1.18) and ~20px at
  ratio 0.08. Anything drawn "1.3px" around a default-zoom disc is a hairline by arithmetic, not by
  taste. Tune against those numbers, not by eye.
- **Roads paint over the border** where they meet a place, because the overlay is behind sigma. It
  reads as roads attaching to the place. Sigma's `EdgeClampedProgram` would stop them at the ring, but
  that changes edge rendering wholesale and was deliberately not done.
- The old **radial glow sprite** stays removed. Only the border and shadow came back;
  `getGlowSprite`, `SPRITE_SIZE`, `readDesignToken` and `MAP_GLOW_*` are still gone from
  `mapShared.ts` / `gameConfig.ts`, and `MAP_SHADOW_FALLBACK` survives for the **label** text shadow only.
- **Roads get the same treatment, for the same reason, with the same trick.** `MAP_ROAD_COLOR` is a
  deep blue (`#1e3a5f`) and on a near-black star cloud it is very hard to see. Once the nodes had
  a border the roads became the only thing left invisible — the map read as "places you can see,
  roads you cannot". The overlay sits BEFORE sigma's canvas, so a **wider** white stroke on the
  overlay shows on both sides while sigma's road paints over the middle: that is a casing, not a
  second road. It needs no second canvas (which would cover the place labels) and no
  `EdgeClampedProgram` (which would change edge rendering wholesale).
  - **The casing width is the road's own width plus the border on each side**, with the road's
    width converted through the *same* `sigma.scaleSize(1)` the nodes use, so the casing keeps its
    proportion to the road at every zoom.
  - **Cull on "either endpoint inside the padded viewport"**, not a proper segment-vs-AABB test. **The padded viewport box must be built from ALL FOUR viewport corners** — under a rotated camera the viewport is a *skewed* rectangle in graph space, and a box from just the two diagonal corners is too small, culling the decorations near the map's corners (white borders/casings vanish → "dark places and roads", reported and fixed Oct 2026). At angle 0 the four-corner box is identical to the two-corner one
    Roads join neighbouring places (ForceAtlas2, at most `ROAD_MAX_PER_PLACE` each), so an edge
    crossing the frame with both ends far outside is vanishingly unlikely, and a real segment test
    costs arithmetic per edge per frame.
  - **Where a road meets a place both casings are white**, so they read as one continuous casing
    rather than fighting. The old trade-off here (roads painting over the node ring) is unchanged.
  - `MAP_ROAD_BORDER_COLOR` / `MAP_ROAD_BORDER_WIDTH`. No dark casing was added: the request was a
    white border, and on this backdrop the white one already carries it.

- Camera timing lives in `gameConfig.ts`: `MAP_CAMERA_ANIM_MS`, `MAP_FOCUS_ZOOM`, `MAP_FIT_PADDING`
- **Camera coordinates are FRAMED, not raw.** Sigma's `createNormalizationFunction` maps the whole graph into a unit square centred on `(0.5, 0.5)` whose larger axis is exactly `1`, and the camera operates in that space. `graph.getNodeAttributes()` returns **raw** pre-normalisation coordinates and `sigma.getBBox()` returns the **raw** extent — feeding either to `camera.animate()` parks the camera outside the world and renders a blank map. Use `sigma.getNodeDisplayData(node)` for anything the camera consumes
- Because the framed world is a unit square, "fit everything" is the **constant** centre `(0.5, 0.5)` + ratio `1` — independent of world size, node count, and viewport aspect (verified across 936×766, 500×900, 1600×400, 400×1200, 1200×1200). `MAP_FIT_PADDING` adds margin; `MAP_FOCUS_ZOOM` (<1) is a multiplier on that same baseline for `focusNode`, so the two views stay consistent. `resetView` uses this, **not** `animatedReset()`/`sigma.getBBox()`
- The map's inner vignette was **removed** (Oct 2026): the `GM_VIGNETTE` radial-gradient overlay and the `shadow-ds-map-vignette` inset shadow darkened the places and roads near the viewport edges, which read as a rendering bug. Do not reintroduce either — the four HUD corner brackets (`GM_FRAME`) are the only edge furniture left
- Camera animations run through `reducedMotionRef` (populated from `useReducedMotion`), giving `duration: 0`. It is a ref, not a direct closure, because the effect that builds the Sigma instance has an empty dependency array

- **`camera.setState()` does not schedule a render — it only updates state and emits `updated`.**
  Every programmatic camera write in this file therefore has to call `sigma.refresh()` after it.
  `setZoom` (the zoom slider and the percentage box) did not, and the symptom was genuinely strange:
  **the percentage changed and the map did not**. The backdrop layers looked fine because they
  repaint from the camera's own `updated` event, and the map looked "stuck" only because it was.
  It also meant the star systems could never be judged by zooming, since zoom did not repaint them.
  If you add a camera write, put the `refresh()` next to it.

### Map Star Systems (Stellaris-style, zoomed in)

Past `MAP_STAR_ZOOM_RATIO` (0.2) a place stops being a dot and reads as a system: a sun, planets
around it, moons around those. Sigma's ratio is **smaller when closer**, so "zoomed in" is
`camera.ratio <= MAP_STAR_ZOOM_RATIO`. That is ~95% of the zoom slider's travel, so **at any normal
zoom there are no systems at all** — do not go looking for a bug when a default view has none.

- **The sun is sigma's own node disc, NOT overlay canvas.** The overlay sits before sigma's WebGL
  canvas in the DOM, so anything painted there gets roads drawn over it — a dark line straight
  through a bright sun. Letting sigma draw the disc keeps the order "roads → sun", identical to a
  normal node. `nodeReducer` sets `res.color` to that class's `core` and
  `res.size = MAP_STAR_SUN_SCREEN_PX * starScale / sigma.scaleSize(1)`.
- **The sun has a colour per place, not one colour for every sun.** `starClassOf(placeId)` picks
  one `MAP_STAR_SUN_CLASSES` entry (a `core`/`edge` pair) from the place id.
  - **The class is decided ONCE, at graph-build time, and stored as the node's `starClass`.**
    The disc is painted by `nodeReducer` and the glow by the overlay — two code paths in two
    places. Both calling `createRng(node)` would not be *wrong*, but it is two hashes and it
    only agrees because the two implementations happen to match. One value on the node means a
    change cannot land on one side only.
  - **`core` and `edge` travel together.** Split them and a sun wears another star's halo.
  - **`createRng(placeId)`, never `id.charCodeAt(0) % n`.** The latter only sees the first
    character, and ids often share a prefix, which would hand a whole batch of places one sun.
  - **`core` must carry the class itself — this is the load-bearing rule.** The six `core`
    values used to be **all white** (0–37 from pure white; closest pair 7.2 apart in RGB), so
    the disc carried *no* class information at all and every sun rendered as the same white
    dot. The only variation sat in the 16px, 0.5-alpha glow *behind* the disc — and a star is
    identified by its **body**, not by the halo behind it. So it read as "identical white suns
    wearing slightly different jackets", which is not the Stellaris behaviour the reference
    has. The cores now take the class hue (closest pair 56.6).
    - The palette must *have colour*, **not** "every class is tinted": a white star really is
      white, and among tinted discs it is the easiest one to pick out. The regression to guard
      is *all six near white*, so `mapShared.test.ts` asserts **at least half** the cores clear
      a 50-unit distance from pure white, that every pair is ≥ 55 apart, and that every core
      stays at luminance ≥ 140. Verified: the wash-out assertion fails on the old palette with
      `expected 0 to be greater than or equal to 3`.
  - **"No deep red, no deep blue" became "bright, not pale."** The original reason stands — the
    *orbits* are the faction channel, and the sun is the largest block of colour in the system —
    but the actual conflict is **darkness**, not hue. Every `core` now sits at luminance 152–255,
    which is how real bright stars look, while the sun is an 11px disc and the orbits are thin
    rings: the body glows and the faction colour stays on the rings. Do not "fix" a future
    complaint that suns are coloured by flattening them back toward white — that is the exact
    failure described above.
  - **The glow's outer stop is `transparent(edge)` (`#rrggbb00`), not a hardcoded rgba.** It used
    to be `rgba(255, 154, 46, 0)` — one sun's colour, which stops matching the moment a sun
    changes, and no config value governed it.
- **Size follows the camera, through one multiplier.** Every `MAP_STAR_*_PX` is the size *at the
  moment star view is entered*; what actually gets drawn is multiplied by `starScale`, computed by
  `starScaleAt(ratio)` in `mapShared.ts`:
  `clamp((MAP_STAR_ZOOM_RATIO / ratio) ^ MAP_STAR_ZOOM_SCALE_EXPONENT, MIN, MAX)`.
  - **Anchored on `MAP_STAR_ZOOM_RATIO`, so the frame that crosses the threshold is exactly 1×.**
    There is no jump on the way in. Anchoring anywhere else would make the systems pop.
  - **Exponent 0.5 is sigma's own `size / sqrt(ratio)`**, so a system reacts to zoom exactly the
    way a place node does. Across the whole star band (ratio 0.2 → 0.05) that is 1× → 2×: sun
    11 → 22px, system radius 46 → 92px. `MAP_STAR_ZOOM_SCALE_MAX` is what stops the systems
    overlapping at the closest zoom; the `MIN` floor of 1 is what keeps "pull back a little and you
    are back to how it looked on entry" true, rather than a trail of unreadable specks.
  - **What was drawn must not change with the camera.** Planet *count*, tilt and colour come from
    `createRng(node)` and stay put; only the *radii* scale. Drawing a fresh radius per frame would
    make a planet re-roll on every zoom.
- **Planets within one system never share a colour, and neither do moons.** Each planet used to
  `pick` its own from `MAP_STAR_PLANET_COLORS`, so four planets could come up the same colour and
  read as one planet drawn twice — while "this system has four planets" is the entire point of the
  layer. Fix: **shuffle once, then take the first N**, not re-pick per planet. Re-picking advances
  the RNG an extra step, and since the RNG is seeded from the place id, one extra step re-rolls
  the system's whole draw. The `[... ]` before `shuffle` is load-bearing: `CONFIG` is `as const`
  and `shuffle` mutates in place.
- **Moons are a palette, not one colour** (`MAP_STAR_MOON_COLORS`). They were all the same
  near-white, so a planet with four moons read as four identical dots. Kept desaturated and lunar:
  a moon is tiny, so anything vivid is noise and steals attention from its planet.
- `starScale` lives in `starScaleRef`, because `nodeReducer` needs it and cannot reach the sigma
  instance. `syncStarView` refreshes it on **every** camera `updated` while in star view and calls
  `sigma.refresh()` there — not only on the threshold crossing, or the sun freezes at the size it
  had when you crossed. This is a separate listener from `syncLabelVisibility` because 0.2 and
  `LABEL_ZOOM_RATIO` (0.6) are two different thresholds, and crossing one does not fire the other.
- **Planets and moons are derived from the place id alone** (`createRng(node)`), so a place always
  looks the same and every client agrees with nothing stored. Purely decorative: giving them gameplay
  meaning would need a simulation for it, and a mock would only look like one.
- **Moon orbits are outside the planet** (`planetRadius + (GAP + n * STEP) * starScale`).
  The first version used `0.34 × node radius`, so every moon sat *inside* the disc — which is exactly
  the "moons and planets are inside the place" complaint. Do not reintroduce a radius relative to the
  node. The gaps take `starScale` too: the planet radius is already scaled, so unscaled gaps would
  keep the moon pinned while its planet grew.
- **Orbits carry the faction colour, read from `attrs.factionData?.color`, never from
  `attrs.color`.** An unowned node's colour is a deliberately dimmed grey, and at partial alpha on a
  near-black background it is indistinguishable from nothing — the whole system collapses to a bare
  sun. Unowned land gets `MAP_STAR_ORBIT_COLOR_UNOWNED` instead. This was found by looking, not by
  reading: the code was correct and the feature was still invisible.
- **The place name is drawn above the system**, so there is a `defaultDrawNodeLabel` that centres
  the text at `-(MAP_STAR_SYSTEM_RADIUS_PX + MAP_STAR_LABEL_GAP_PX) * starScale` converted into graph
  units. Sigma's built-in label program only draws text to the *right* of a node and offers no
  vertical offset, so it is delegated to unchanged outside star view. The conversion factor is
  shared with the sun size, so the two can never disagree — and both carry `starScale`, so the name
  cannot outrun the system it names.
- The trade-off: at this zoom **the garrison is no longer readable** (system size follows the camera,
  not the garrison). That is the accepted cost; what this level of zoom is for is the number and
  spread of systems.

### Map Place Tooltip

- **Placement goes through `placeTooltip`** (`src/lib/tooltipPlacement.ts`, pure): **below the anchor by
  default** with the panel's top-left near it, flipping above only when below does not fit, clamped inside
  the map container. The old panel was *always* above the cursor (`translateY(-100%)`), which the top
  half clipped. The panel also has a width cap (`max-w-[min(20rem,calc(100%-1.5rem))]`) so it can never
  be squeezed to slivers at the edges.
- **Touch devices get no hover tooltip** — a tap already opens the place detail panel, and a hover card
  vanishes the moment the finger lifts. Guarded by `coarseRef` (the `(pointer: coarse)` mirror).
- **It prints names, not just a count.** It used to end at `👥 將領: 3` — the reader learns that
  three people are there but not *who*, and "who holds this place right now" is the whole reason
  to hover a node. Three blocks now sit below the buildings, and each can legitimately be absent:
  - `👤 行政官` — the place's `administratorId`, omitted when unowned or unassigned.
  - `👑 勢力君主` — the **controlling faction's** `kingId`, omitted when there is no ruler. This is
    a *different row on purpose*: the administrator is the appointed governor and the king is the
    faction's highest authority, and they are routinely not the same person. One row would read as
    though place and faction shared a single head. On the king's own seat both rows print the same
    name — which is exactly why merging them would have been misleading.
  - `👥 將領` — the living leaders based here with **their own troops**, sorted by troops desc and
    capped at `MAP_TOOLTIP_MAX_LEADERS` (4), remainder as "另有 N 位" / "+N more". The tooltip
    follows the cursor, so an unbounded list ends up covering the map it is describing.
  - The administrator and the ruler are **also in that list**, flagged 👤/👑, rather than being
    excluded. With both role rows present, printing one of them separately above *and* below is
    unavoidable; the flags make it one person shown twice instead of two different people.
- **Names are resolved once, at graph-build time, and stored on the node** (`administratorName`,
  `factionRulerName`, `leaders`), so both hover paths read one value — same reason `leaderTroops`
  already worked that way. Deriving them in both places would not be *wrong*, but it is two
  implementations, and one missed update shows the reader two different tooltips for one place.
- **`characterCount` and the `charsPerPlace` map were deleted.** The named list *is* the count
  (`leaders.length`), so they were written on every node and read by nothing. Dead data on a node
  invites the next reader to think it drives something. The two loops over `characters` merged
  into one pass at the same time.
- **The whole tooltip is localised.** It used to be entirely hardcoded Chinese (`⚔️ 駐軍:`), and
  the new rows landed in the middle of it — a half-localised panel reads as broken in English.
  `t('map.*')` now covers every label in both branches.
- **There are two hover paths, and they used to disagree.** `sigma.on('enterNode')` fires from
  sigma's own container listener; the territory layer's `onMove` fires from the **wrapper** that
  contains the container, so it runs on the bubble phase — *after* sigma's. Both wrote a place
  tooltip for the same node, and the one that ran last won.
- The loser used to pass `linkedPlaces: []`, commented "roads are hidden in this view". **That was
  false**: edges are added unconditionally (`graph.addEdge`, no `hidden` setting anywhere) and are
  fully visible in the territory view. The user-visible result was "two tooltips on a place, one
  shows the linked places and one does not" — and because the empty one wrote last, **the empty one
  is the only one you ever saw**.
- **Both paths now go through `linkedPlaceNames(graph, nodeId)`** in `mapShared.ts`. One helper is
  the fix; anything else leaves the two free to drift apart again. It is pure and tested.
- **Only string labels count.** `nodeReducer` nulls `label` when zoomed out (that is the zoom rule),
  so listing every neighbour would put a column of blanks in the tooltip. Note the helper reads the
  **stored** attribute, which `nodeReducer` never writes back — so the names are available at every
  zoom, which is exactly when the tooltip is most needed.
- **The territory path also sets `hoveredNodeRef` / `hoveredNeighborsRef`** and refreshes, so
  pointing at a place forces its neighbours' labels there too. `onLeave` clears both. Without this
  the same node got two different treatments depending on which listener noticed it.
- **Whoever sets the hover refs has to be able to clear them.** The territory path sets them, and
  the only thing that used to clear them was Sigma's `leaveNode` — so the one case of "off the disc
  and off the name" had nobody clearing them, and the place name plus its neighbours' names stayed
  on screen long after the cursor had lost track of them. `onMove` therefore clears the refs when it
  hits nothing **and** `sigmaHoverRef.current === null`.
  - **`sigmaHoverRef` exists only for that check.** `leaveNode` and `mousemove` are two listeners on
    one event; if they ran in the other order, clearing here would wipe the hover Sigma had just set
    and the node's own name would flash off. Sharing `hoveredNodeRef` for both makes "I set it" and
    "Sigma set it" indistinguishable, which is exactly what would break it.
- **A place's hover target includes its own name label, and nothing that is not drawn.** Sigma draws
  the name to the *right* of the disc, so the cursor routinely rests on a name while that name and
  its neighbours' names are being force-shown. Without the label in the target, moving onto the name
  made all of them vanish while the pointer was still on one of them. `placeLabelRect()` +
  `pointInRect()` in `mapShared.ts` are pure and tested; `measureLabelWidth` **measures** the text
  with the same font and the same `labelSizeOf()` expression `nodeReducer` uses, because a
  character-count estimate is wrong by an order of magnitude for CJK (≈1em vs ≈0.55em) and the hit
  box has to line up with the ink.
  - **A label that is not drawn must not be a hit target.** Past `LABEL_ZOOM_RATIO` `nodeReducer`
    nulls every label, so allowing the hit would mean "there is visibly nothing here, yet the cursor
    stays glued to a place". Gated on `labelsVisibleRef`.
  - **At star zoom the label is skipped**: it is drawn *above* the system, and the system is large
    enough that the disc hit already covers it. A second geometry would only be a second thing to
    get wrong.
  - **A label hit beats any disc hit** (it scores distance 0). It is closer to the reader's intent
    than being inside the disc of some other place.
  - The width cache is keyed `place id + size` and cleared in the graph-rebuild effect, because a
    dead place must not leave a stale width behind.

### Map Territory View (the zoom-out area map)

Zoomed out past `TERRITORY_ZOOM_RATIO`, each place projects a **claim** and the map marks the area
those claims cover — the CK3 map-mode / Stellaris galaxy-map idea. The territory is a *translucent
tint over the map*, not a replacement for it: the graph and roads stay fully opaque, so you
read territory and topography at the same time.

- **The faction tooltip answers "whose ground is this, and what holds it up"** — place count,
  **total troops**, **leader count**, and the **ruler's name**. It carried only a place count
  before, so the faction ranking and the radar were showing numbers the map never displayed and
  three panels disagreed about the same faction.
  - **Troops use `garrison + leader troops`, the same basis as the place tooltip and the node
    size.** A different basis here (garrison only) would show "this faction has 300 troops" beside
    a place reading "leader troops 200", with no way to relate the two. Verified against the DB:
    31 garrison + 81 leader troops = the 112 the tooltip printed.
  - **Leader count is by `factionId`, not by where the person stands.** Someone still alive but no
    longer standing on this faction's ground is still its person — and that is the same basis the
    faction ranking uses, which is what keeps the two panels agreeing.
  - The ruler comes from the controlling faction's `kingId`, resolved through a `characters` lookup.
    It is **omitted** when there is none (the king just died, no heir yet) rather than printed as
    "none", and it is deliberately a *separate row* from the place tooltip's administrator — see
    "Map Place Tooltip" above for why those two must not be merged.
  - `troopsAtPlace` is recomputed in the territory effect rather than shared with the graph-build
    pass. Two independent caches means one of them goes stale, and the faction tooltip silently
    under-reports its troops.

- **It is a force field, not a Voronoi partition.** An earlier version assigned each grid cell to
  the nearest place. That was wrong twice over: it rendered as visible cell steps, and it drew a
  border between two *adjacent places of the same faction* — the exact artefact that made it look
  like pixel art rather than Stellaris. Instead each place projects a smooth **circular force**
  (squared falloff, so both the value and its slope reach zero at the rim and the boundary stays
  C1-continuous), and the field resolves per cell as "strongest faction wins".
- **Every place emits an equal force, and same-faction force *accumulates*** (`density[f] += w`),
  so a faction holding more places sums to more force and reaches further — the extent is decided
  by how much force there is. Rival forces push against each other, so a border lands where the two
  are equal and distance decides who pushes it further out. Adjacent same-faction places therefore
  fuse into one continuous region with no internal seam.
- **A cell must clear `TERRITORY_MIN_FORCE` to count as held.** This is the load-bearing part, and
  it is easy to miss: with plain `argmax` and no threshold, *any* positive force beats "no faction",
  so the territory is always exactly the union of the per-place discs and **four places draw the same
  area as one**. The threshold is what makes accumulated force decide reach — a lone place holds
  ~65% of the claim radius, four together ~83%.
- **The old probabilistic OR (`1 - Π(1 - wᵢ)`) was removed**, and so was the reason for it. OR
  saturates at 1, so a faction with ten places pushed exactly as far as one with a single place —
  faction size had *no* effect on the map at all, which is the opposite of the intended rule. Its
  original justification ("a plain sum inflates forever") was wrong: we take the argmax, so an
  unbounded sum never decides anything by magnitude alone.
- **Unowned land (`faction === null`) is masked by a nearest-site rule, not by force.** A cell
  nearer to an unowned place than to any owned place is that place's own ground and stays blank.
  Comparing *force* cannot work here: once same-faction force accumulates, one faction's summed
  force swamps any single unowned place at nearly every point, so the unowned place simply gets
  absorbed — which is the bug this rule exists to prevent. Unowned places still count toward
  `meanNeighbourDistance()`, because the claim radius has to match the density of the whole map.
- **`factionAt(field, gx, gy)` answers hover from the field, not from the nearest node.** The
  zoomed-out view draws *areas*, so "whose ground is this" is answered by the cell under the cursor;
  using the nearest node names an unrelated place and reports somewhere the cursor isn't.
- **Hovering a *place* still shows the place tooltip.** The place nodes remain visible and
  interactive under the translucent layer, so `onMove` first hit-tests them in **screen pixels**
  (`TERRITORY_PLACE_HOVER_PX`) and shows the place tooltip on a hit; only when the cursor is *not*
  over a node does it fall through to the faction tooltip. Measuring in screen pixels rather than
  graph units is deliberate: a graph-space threshold becomes so large when zoomed out that the whole
  region counts as "a place" and the faction readout could never appear.
- **The ratio is bounded, but panning is deliberately not.** Sigma bounds `camera.ratio`; it puts no
  bound at all on `camera.x` / `y`, and that is intentional.
  dragged out of frame — measured: a short drag left the map as a scrap in one corner, which reads
  as the map vanishing. `clampCameraToWorld()` clamped the camera centre to `[0, 1]` on the camera's
  `updated` event. **That clamp was worse than the bug it fixed, and must not come back.** The camera
  works in **framed** space, where sigma's normalization fits the graph into a unit square centred on
  `(0.5, 0.5)`, so zooming out past ~75% leaves the world as a small patch in the middle of the
  viewport, and dragging that patch across the screen *requires* `camera.x` / `y` to leave `[0, 1]`.
  Clamped, every `mousemove` hit the limit, so the map stopped tracking the cursor (reading as "it
  won't drag" plus a jitter) and the travel no longer matched the cursor travel at all. The ratio
  stays bounded so the world cannot be zoomed to a speck; panning is deliberately infinite, and the
  reset (↺) button is how you get your bearings back.
- **The territory layer's own drag/wheel must use the *framed* helpers, and should copy sigma.**
  `viewportToGraph()` returns **raw** pre-normalisation coordinates, but the camera's x/y live in
  **framed** space — sigma's `matrixFromCamera()` consumes the camera state directly, so the two
  differ by the normalization ratio. Feeding a raw delta to the camera scales the pan and the
  zoom-centre wrongly, and the drift compounds until the map stops tracking the cursor. Use the
  framed pair (`viewportToFramedGraph` / `framedGraphToViewport`) or, better, sigma's own:
  - **wheel** → `sigma.getViewportZoomedState(viewportPoint, newRatio)`. That *is* "zoom to
    `newRatio` while keeping the point under the cursor fixed"; sigma's built-in captor calls it
    too. Hand-rolling the before/after difference misses the case where the point ends up outside
    the viewport, and any miss makes the zoom centre drift.
  - **drag** → convert both pixel positions with `viewportToFramedGraph` and add
    `(previous - current)` to the camera, which is exactly sigma's `mouse.captor` `handleMove`.
    Note it negates **both** axes identically; a `+ dy` on one axis runs the map away from the
    cursor vertically.
- **`minCameraRatio` / `maxCameraRatio` must be passed to the `Sigma` constructor.** Sigma defaults
  both to `null`, and `getBoundedRatio` does *no* clamping while they are null — so any custom wheel
  handler can push the ratio arbitrarily far. `MAP_ZOOM_MIN_RATIO` / `MAP_ZOOM_MAX_RATIO` used to be
  used only as slider *fallbacks*, which left the wheel unbounded. Note that sigma's ratio is
  **smaller when closer**, so wheel-up must reduce it (`TERRITORY_ZOOM_RATE ** notches` where
  `notches = deltaY / 100`, clamped); the old `1 - step * deltaY` zoomed the *wrong way*.
  `MAP_ZOOM_MAX_RATIO` is 3, not the old 8 — at 8 the world shrank to a speck, and since "fit
  everything" is only ~1.18 there is nothing useful past 3.
- **`src/lib/territory.ts` is pure logic** — `buildTerritoryField()` returns a per-cell faction index
  plus the covered extent; `nearestSite()` answers click in one scan (deliberately *not* a grid: one
  query is one scan, and scanning 2000 places is cheaper than maintaining a grid);
  `factionAt()` answers hover from the field; `factionRegions()` returns per-faction centroids for
  the labels; `factionOutlines()` + `smoothLoop()` turn the boundary into smoothed curves for the
  border stroke, and `factionRegions()` also returns each region's label anchor, radius and axis.
  No DOM, so `territory.test.ts` runs under `node`. The same split is used by both ambient space
  layers: `spaceGalaxy.ts` and `spaceFlow.ts` are pure and tested under `node`, with their renderers
  (`SpaceGalaxy.tsx`, `SpaceFlow.tsx`) doing nothing but drawing.
- **The field is built during render**, in a `useMemo` over `places`, not inside the effect and
  pushed into state — `Place` already carries `layoutX`/`layoutY`, and setting state synchronously
  in an effect trips the cascading-render lint rule.
- **The claim radius is relative**, `TERRITORY_BLOB_RADIUS × meanNeighbourDistance()`. A fixed
  world-coordinate radius smears everything into one blob when places are dense and vanishes when
  they are sparse.
- **The fill is a flat solid colour; the border is a smoothed vector curve.** No fog, no
  staircase, and the two are independent. `imageSmoothingEnabled = false` on the fill, because a
  territory must be one flat colour and smoothing blurs the rim into a gradient — that *is* the fog.
  Turning smoothing off would normally expose the cell staircase, but the border is drawn on top of
  those exact cell boundaries, so it covers them. (An earlier version lightened the faction colour to
  make a "rim", which is white mixed into the same hue and reads as a gradient; the two
  `*_RIM_LIGHT` tunables that drove it were **removed** with it. `neighbourMask` survives as an
  exported helper with its own tests, but the renderer does not call it.)
- **`factionOutlines()` in `territory.ts` builds the border** as closed loops, then `smoothLoop()`
  applies Chaikin corner cutting. A bitmap's resolution *is* the grid's, so zoomed in it can never be
  sharp; stroking raw cell edges gives a staircase. Chaining the boundary into loops and smoothing it
  gives a curve at screen resolution. A faction can have several loops (a hole, or two disconnected
  holdings), hence an array of arrays. Points stay inside the original hull, so a curve never
  overshoots. Skips cells whose faction key is missing, matching `factionRegions`.
- **The label sits at the centre of a verified inscribed *rectangle*, aligned to the frame the name is
  drawn in.** `factionRegions()` returns `halfAlong` / `halfAcross` for it, and
  `solveLabelFontSize()` in `mapShared.ts` solves for the largest font whose text box fits inside that
  rectangle. An estimate from the character count is always wrong, because CJK glyphs are ~1em and
  Latin ~0.55em, so both dimensions come from the text's real measured size at 100px.
  - **The measuring frame and the drawing frame must be the *same* frame, and `factionRegions()`
    decides it once.** This was the "faction name is not inside its own territory" bug. The
    rectangle was *always* measured along the principal axis, but the renderer only rotated the text
    onto that axis above `elongation > 1.5`. A claim at elongation 1.42 with a 57° axis therefore
    got a **horizontal** name fitted into a rectangle tilted 57° — and because the rectangle is
    verified to lie wholly on the faction's land, the corners that left the rectangle left the land
    too: **3 of 4** on the worst synthetic case. Now `labelRotated` and `labelAngleDeg` come out of
    `factionRegions()` and the renderer only reads them; the rectangle is measured along
    `labelRotated ? angle : 0`. **Never re-derive the rotation in the component from `elongation`** —
    that independence is the whole bug. The threshold lives in `gameConfig.ts` as
    `TERRITORY_LABEL_ROTATE_ELONGATION` precisely because geometry and drawing must share it.
    - The cost is deliberate: a near-circular claim measured axis-aligned gets a *smaller* rectangle,
      so some names shrink or drop out as unreadable. A name that fits beats a bigger name that
      lies, and zooming in grows the size back.
    - `territory.test.ts` guards the **drawn text box's four corners**, not the rectangle. Sweeping
      the rectangle along `angle` guarded a box nobody draws in, which is how this survived; the
      test now sweeps `labelRotated ? angle : 0`, and the regression case is a fixed 14-site
      configuration that yields an elongation-1.05, 16°-axis claim.
  - **The circle alone is too conservative, and that was the "label doesn't fill the territory"
    bug.** `labelRadius` (a two-pass chamfer distance transform) reports only "how wide this is at
    the roomiest point", which for an elongated claim is a sliver. A name could run a long way along
    the axis and was still capped at the circle's diameter, filling ~80% of the circle and a small
    fraction of the claim. The rectangle measured 15.9px → 19.5px on real data.
  - **The rectangle must be *searched*, not walked-and-shrunk.** `measureClaimRect()` sweeps thickness
    as the outer variable and binary-searches the largest feasible length for each, scoring by the
    font it would yield. The obvious alternative — walk to the end, then shrink both sides — converges
    on something small and *squat*, because a long thin claim's rectangle pokes out at the corners
    the moment it is any thicker. That is the opposite of filling the claim.
  - **Score length and thickness at their real relative worth.** The font is
    `min(200·a/w100, 200·b/h100)`, so a unit of length is worth `LABEL_NAME_ASPECT` (4.4) times a
    unit of thickness. Getting that ratio backwards picks squat rectangles whose font is *smaller*
    than the circle it replaced.
  - **Containment cannot rest on the search's own sampling density.** There are gaps *between*
    samples, and when the anchor sits on a cell boundary an 11×11 grid steps over a sliver that a
    21×21 grid catches. The result therefore carries a 2% inset and a final 21×21 re-check that
    shrinks until clean. That final pass is the only place the rectangle is guaranteed to lie wholly
    on the faction's own land, and `territory.test.ts` asserts it on a 21×21 sweep.
  - **Do not reintroduce the covariance half-length/half-width.** For a bent or crescent claim the
    covariance half-length far exceeds the real extent, which is why sizing from it spilled. And do
    not clamp into the region's **bounding box** either: an L-shaped claim's box contains its own
    notch, which is not its land. Neither the box nor the covariance is a subset of the claim; the
    verified rectangle is.
  - **The faction-name span needs `origin-top-left`, and this is the real "not inside the faction
  area" bug.** Its chain is `translate(anchor) rotate(deg) translate(-50%, -50%)`, and
  `transform-origin` defaults to `50% 50%` — so the **whole chain, including the centring
  shift, is rotated about the element's own centre**. The displacement is
  `(R(deg) − I)·(−hw, −hh)`, which is **exactly 0 at deg = 0** and as large as the name itself
  once rotated. Measured on the live world: a 62×14, four-glyph, −78° name shifted
  **(17.7, 35.9)px** and sat entirely off its claim. `origin-top-left` puts the origin at the
  corner, so `translate(-50%,-50%)` then the rotation happens about the anchor.
  - **Nothing in `territory.ts` was wrong**, and no geometry test could have found this: the
    rectangle was verified, the frame matched the drawing, and the *unrotated* names were
    pixel-perfect. Only the rotated ones moved. `territoryLabelPlacement.test.ts` guards the
    declaration, because the project runs vitest under `node` with no DOM — a displaced name
    looks like a geometry bug, not a CSS one.
  - **Verify label placement against the right canvas.** The territory layer is *not*
    `document.querySelectorAll('canvas')[0]` — the space backdrop layers come first and they
    are non-zero almost everywhere, so sampling index 0 reports every label as comfortably
    inside while it is actually off its claim. Select it structurally instead: the canvas that
    is a child of the label container's parent and does **not** carry `pointer-events-none`.
- **Too small to read means not drawn, never scaled up.** Scaling up to reach `TERRITORY_LABEL_FONT_MIN`
    is the one operation that would push the text outside its claim. Zooming in grows the size, so a
    hidden name returns on its own.
  - **The name includes its glow, and `solveLabelFontSize` counts it in the font's budget.**
    Every label carries `text-shadow: 0 0 TERRITORY_LABEL_GLOW_EM`. Leaving that to
    `TERRITORY_LABEL_FIT` cannot work: that slack is a **proportion**, so on a thin claim it is
    a couple of pixels while a glow is a fixed size — the glow then spills onto a neighbour and
    reads as exactly "the label is not fully inside the faction area". The solve is
    `fs·(halfExtentPerPx + glowEm) ≤ avail·fit`, so **name-plus-halo** never exceeds `avail·fit`
    and the clearance beyond the halo is at least `avail·(1−fit)` — positive everywhere, and it
    scales with the claim. `TERRITORY_LABEL_FIT` stays at **0.82**.
    - **The glow is in `em`, not px, and that is load-bearing.** A fixed 6px subtracted from both
      sides of a thin claim leaves almost nothing: the solve collapsed to 8px and **3 of 4 rounds
      lost their label entirely**. Scaling with the font gives a small name a small halo.
      Measured over 1709 regions: 99.9% still legible, 31.7px mean font, and clearance beyond
      the halo of 6.75px minimum / 21.2px median, with **no** halo crossing a boundary.
    - `territory.test.ts` measures the gap from the ink box to the **smoothed outline that gets
      drawn**, not to the cell grid — Chaikin cuts convex corners inward, so the drawn curve is the
      real boundary. It compares against **that label's own** halo (`GLOW_EM × fontSize`), not a
      fixed radius. Its sample has to exceed ~400 labels: the violations are in the tail, and a
      small sample passes for the wrong reason.
- **The anchor is the cell that makes the name largest, not the deepest cell.** The deepest cell
  (the centre of the largest inscribed circle) answers a **circular** question; the label needs a
  **rectangle**. A claim can have a point that is very round — flesh on every side — yet narrow,
  while a less round point holds a markedly wider rectangle. Measured over 102 regions, the
  inscribed-circle anchor reached only **1/1.48** of the best anchor on average and **1/3.21** at
  worst; the live world's claim gained `103×26 → 155×38`. Leaving the anchor on the deepest cell
  is what "the label does not use the largest space" looks like. `angle` / `elongation` still come
  from the covariance, and rotation still applies only past elongation 1.5, because a near-circular
  region has an unstable axis; the screen angle negates the graph angle (screen y is flipped) and
  normalises to ±90° so text is never upside-down.
  - Two phases, because scoring every cell is far too costly (each walk runs both axes to the
    boundary) and a claim can hold thousands of cells: a **cheap proxy** ranks the sampled cells,
    then the real rectangle search runs for the finalists
    (`TERRITORY_LABEL_ANCHOR_SAMPLES` / `..._CANDIDATES`). 320/10 reaches the exhaustive optimum
    in 3–11ms; exhaustive itself costs 31–40ms.
  - **The proxy's `ownsCell` must take the faction index.** Asking only "does anyone own this"
    lets the walk run straight through a neighbour's claim, so every cell near a border looks
    roomy and the ranking becomes noise — measured as picking a cell worth 0.14 when 0.43 was
    available. A plausible-looking ranking earns no credit.
  - **The frame is chosen by comparison, not by `elongation`.** The old rule — "rotate above
    elongation 1.5" — describes the **shape** and is not the answer to "how big". Measured over 27
    claims, **horizontal beat the principal axis in 17 of them**: the rule was wrong more often
    than right. Both frames now run the anchor search and the larger font wins, for a mean gain of
    **1.103×**. Sweeping the angle in 10° steps over a whole claim is worth only ~1.03× more, so
    two candidates is nearly all of it.
    - **It needs hysteresis** (`TERRITORY_LABEL_ROTATE_MARGIN`, 1.08): without it a name flips
      between horizontal and tilted every round when the two are close, which is visual noise.
      The tilted frame has to be clearly better to be taken.
    - The tilted frame stays **ineligible** below `TERRITORY_LABEL_ROTATE_ELONGATION`, because on
      a near-circular claim the principal axis is noise and rotating to it would jitter.
    - Only claims that can actually be labelled pay for the two searches
      (`TERRITORY_MAX_LABELS`), so the cost is bounded regardless of how many factions exist.
  - `labelRadius` must be the chamfer distance **at the chosen cell**, or the circle fallback
    describes a different place than the name.
  - `territory.test.ts` measures the margin by probing **outward from the ink box** until it
      leaves the claim — doubling plus bisection, never a linear scan. It must **not** measure
      "distance to the nearest outline vertex": a vertex on the far side of a thin arm sits close
      to the box yet expanding the box that way never touches it, which reported a phantom 2.9px
      margin against a 6.9px halo and failed the test while the geometry was correct.
  - `territory.test.ts` states the requirement outright: the returned rectangle must match the
    best one found by trying **every** cell the faction owns, so narrowing or short-circuiting the
    search fails the test.
- **The anchor is never the centroid.** A centroid lands in the concave notch of an L-shaped
  claim, which is not its own land.
- **The name is brightened, not the raw faction colour.** The territory fill is that same faction
  colour composited translucently over a dark backdrop, so the raw colour goes muddy on top of it.
  `brightenColor()` (also `mapShared.ts`) mixes toward white by `TERRITORY_LABEL_LIGHTEN`, which
  keeps the hue — so the name still reads as *that* faction's colour. It is computed once per label in
  a `useMemo`, never per frame.sh the text outside its claim. Zooming in grows the size, so a
    hidden name returns on its own.
- The label is anchored at `labelX`/`labelY` (that deepest cell), **not** the centroid: a centroid
  lands in the concave notch of an L-shaped claim, which is not its own land. `angle` / `elongation`
  come from the cell positions' covariance; rotation only applies past elongation 1.5, because a
  near-circular region has an unstable axis. The screen angle negates the graph angle (screen y is
  flipped) and normalises to ±90° so text is never upside-down. The covariance half-length/half-width
  and the region bbox were **removed** — they existed only to feed the sizing and clamp that are
  gone, and neither is a subset of the claim.
- **The name is brightened, not the raw faction colour.** The territory fill is that same faction colour
  composited translucently over a dark backdrop, so the raw colour goes muddy on top of it.
  `brightenColor()` (also `mapShared.ts`) mixes toward white by `TERRITORY_LABEL_LIGHTEN`, which keeps
  the hue — so the name still reads as *that* faction's colour. It is computed once per label in a
  `useMemo`, never per frame.
- Faction names show only while `camera.ratio >= TERRITORY_LABEL_SHOW_ABOVE_RATIO` — a larger sigma
  ratio is *further out*. Zoomed in past it, the name hides so the node and its place name are
  unobstructed; this is the Stellaris / CK3 rule that an empire name belongs to the galaxy level.
  **That threshold is deliberately equal to `LABEL_ZOOM_RATIO` (0.6)**, the place-name rule. When the two
  differ, the band between them shows *no* text at all — place names already gone, faction names not yet
  arrived — so equal values make the faction name take over at the exact ratio the place names vanish.
  The label layer is `z-[3]`, above sigma's container, so the text may overlap nodes and roads.
- The fill and border are **vector paths** (`Path2D` built once per data change from the smoothed
  loops), not an offscreen bitmap — a bitmap's resolution is the grid's, so zoomed in its edge is always a
  staircase. Stroking the same closed curve draws the border, so fill and border can never disagree.
- **The projection is a full 2×3 affine solved from THREE mapped points** (top-left, right, bottom of the
  field extent through `sigma.graphToViewport`) — the old two-corner sx/sy could only express
  axis-aligned scaling, which broke the moment the camera rotated (the territory stopped following the
  map). At angle 0 the affine degenerates to exactly the old numbers.
- **The map rotates** (touch pinch on mobile; right-drag or Shift+drag on desktop, context menu
  suppressed). Rotation is safe because every layer is rotation-aware: the territory affine above, the
  faction-name angle **measured through sigma** (map the region axis's unit vector and take the atan2 —
  at angle 0 it degenerates to the old `labelAngleDeg`), the place-label hit test
  (`pointInRotatedRect` in `mapShared.ts` — the cursor is rotated by −angle about the label centre),
  and the overlay's viewport-culling box built from **all four** viewport corners (a box from just the
  two diagonal corners is too small under rotation, which used to strip the white borders/casings near
  the map's corners — "dark places and roads").
- **The map surface is `overflow-hidden`** — a territory faction name near the top edge used to
  overflow the map and paint over the header. A label belongs to the map.
- **The vignette is gone** (Oct 2026): `GM_VIGNETTE` and `shadow-ds-map-vignette` darkened the
  places and roads near the edges, which read as a rendering bug. Do not reintroduce either.
- **Sigma owns the camera. Do not hand-roll pan or zoom in this component.** The territory layer
  used to switch the container's `pointer-events` off so the canvas underneath could receive hover
  and click, and then implement its own `onWheel` / `onDrag` — which is what produced a shake that
  appeared **only** in territory view. Two writers fought over every gesture: `MouseCaptor` binds
  `mousedown` / `wheel` to the **container** but `mousemove` / `mouseup` to **`document`**, and
  document events ignore hit-testing, so switching the container to `none` never actually deafened
  it. Sigma's write is **incremental** (`lastMouse − mouse`); the hand-rolled one scaled pixels by a
  `graphToViewport` ratio and wrote **absolute** — and that ratio is derived in graph space while the
  camera lives in sigma's **framed** space, so every pan also moved the wrong distance.
  - The container now keeps `pointer-events: auto` unconditionally. Hover and selection bind to the
    wrapper element (`surfaceRef`) that contains both the container and the territory canvas, because
    events only reach it by bubbling — the canvas is *below* the container and can never get one.
  - `pointer-events: none` is **not** a way to disable a sigma captor. `getMouseCaptor().enabled` is,
    but the answer is not to disable it: there should only ever be one writer.
  - The territory repaint rides on the **camera's** `updated` event, coalesced into one
    `requestAnimationFrame` per frame, because the layer's projection comes entirely from the
    camera. `sigma.on('afterRender')` alone is not reliable — measured, it does not always reach the
    handler during a drag, leaving a frozen translucent underlay with the map sliding beneath it.
  - **`sigma.refresh()` is required after any camera write.** `camera.setState` only updates state and
    emits `updated`; it does **not** schedule a render. Without it the map freezes solid, silently.
  - **Do not measure camera movement by the territory bitmap's centroid.** It clips at the canvas
    edge, so it under-reports. Measure two layers: equal shifts mean they are in sync.
- **The territory layer must repaint itself, once per animation frame.** `draw()` is bound to
  `sigma.on('afterRender', draw)`, but measured, that event does **not** fire on every mousemove
  during a drag: the spotlight layer repaints and the territory canvas stays
  byte-identical, so it becomes a frozen translucent underlay with the map sliding beneath it —
  which reads as the map jumping from one place to another. Calling `draw()` on each mousemove is
  wrong for the opposite reason (several mousemoves can land in one frame). The fix is
  `scheduleOverlay()`: coalesce into one `requestAnimationFrame` that repaints with the **final**
  camera state, so territory, spotlight and graph all land in the same frame. Cleanup must
  `cancelAnimationFrame` the pending frame, or an effect re-run paints a detached canvas.
- **Do not measure camera movement by the territory bitmap's centroid.** It biases hard: the blob is
  small and clips at the canvas edge, so a 300px drag reported 150px — and the *spotlight* layer
  reported the identical 150px, which is the tell. Two layers agreeing exactly means the layers are
  in sync and the instrument is wrong. Measure a layer, and compare two: equal ratios mean sync.
- **`sigma.refresh()` is required after a camera write.** `camera.setState` only updates state and
  emits `updated`; it does **not** schedule a render. Removing the `refresh()` from the drag path
  freezes the map solid with no error.
- Faction names are **DOM**, not canvas: they inherit the app's fonts and i18n for free, and are
  positioned per frame by writing a `transform` (never React state). Regions smaller than
  `TERRITORY_MIN_LABEL_CELLS`, and unowned land, are left unlabelled.
  - **Never reset `territoryLabelEls.current` inside the territory effect.** The `<span>` refs are
    attached by React *during commit*, while that effect runs *after* commit — so resetting the
    array to `null`s wipes the elements that were just bound, `draw()`'s label loop hits
    `continue` on every frame, and the names stay at `opacity-0` with no transform. The symptom is
    deceptive: the element is in the DOM with the correct text and colour, just pinned at
    `left: 0 / top: 0`. Let the array grow and skip the surplus slots instead.
  - The loop guards with `if (!el || !region) continue`, and `showLabels` needs `alpha > 0.6`. With
    `TERRITORY_ZOOM_RATIO` 1.02 and `TERRITORY_FADE_RATIO` 0.74 that is ratio ≤ 0.91, so labels are
    visible across most of the zoomed-out range but **not** at the far end (ratio 3 is "fully
    zoomed out" on the slider).

### Battle feedback lives only in the event log report

**Do not add a battle animation to the map.** A fleet of ships trading fire along contested roads
was removed from both pages: it was derived from ownership, so it was permanently "at war" everywhere
two factions touched, which is ambient noise rather than information. It also competed with the thing
that actually reports a battle.

The battle report (`BattleReport.tsx`) is now a **war replay** (Oct 2026): opened from the 戰報 / Report
button on any casualty row (`PLACE_CAPTURED` / `BATTLE_DEATH`), it fetches the place's whole strike log
(`GET /api/world/battles?placeId=…`, reading the `BattleStrike` table directly — no snapshot dependency,
so historical wars replay) and animates the war round by round in a small in-modal arena: leaders lunging
at each other, impact flashes scaled by the damage, the fallen fading. Controls: play/pause, previous/next
strike, and the round indicator (第 n / total 輪); the per-strike arithmetic sits under the arena.
`prefers-reduced-motion` renders a single static final frame (the project's animation rule). The map
itself still shows only the **spotlight ring** — do not move the replay onto the map (see the ban above).

### Battles are multi-round wars

`server/phases/battle.ts` resolves a contested place as a **war spanning several simulation rounds**
(Oct 2026 — it was one combined engagement per round before, and a relay of 1v1 duels before that; both
ended every battle instantly, which made a signalled army worthless). **Troops are HP**: a strike costs
the target `max(1, floor(attackPower / (defenceFactor × BATTLE_HITS_PER_KILL)))` troops instead of
removing it — **a landed strike always costs at least one troop** (Oct 2026). Without the floor a
1-troop army dealt `floor(~1.3 / (defence × 8))` = **0** damage every round: a war between tiny armies
grounded through eight rounds of nothing and ended in a coin-flip retreat whose escape roll usually
killed the invader (17 of 24 living leaders had ≤ 1 troop, so this was most wars). "8 hits per troop"
still holds for armies of 8+, where the floor is already ≥ 1. The war continues until one side breaks.

Per war round (one phase-10 run): every combatant strikes **in speed order** — attackers hit the
**walls first** (garrison damage, then the defending leaders once the walls fall), defenders hit the
strongest attacker; each strike rolls its own dice and writes one `BattleStrike` row (**never an event**
— a war is dozens of strikes and would flood the log). Everyone fatigues per round
(`BATTLE_WAR_FATIGUE`); the fortress's damage reduction gives the defence the long-war edge. The war
ends four ways: the defence gone → capture (the strongest remaining attacker takes the place); the
attackers gone → hold; the attackers below `BATTLE_ROUT_RATIO` of the defence → rout; `BATTLE_MAX_ROUNDS`
reached → the attackers retreat. **Stateless by design**: "hostile leaders keep standing on enemy ground"
*is* the war — no Battle table; the round count is reconstructed from the BattleStrike log (a contiguous
run of rounds). Reinforcements emerge naturally: leaders arriving next round simply join, which is what
makes signals matter.

**Co-located enemies always fight, the same round they meet** (Oct 2026). Two gaps used to keep enemy
leaders standing in one place from ever engaging — the reported case: 玄影·芬妮 and 姜勇 shared
華唧峽谷 for a round and no strike was recorded:

- **The unowned branch had no leader-vs-leader combat.** Everyone present was an "attacker" of the
  walls; with garrison 0 the *fastest* arrival simply took the place and the intruder was ignored.
  Fix: the owned places are **re-fetched after the unowned branch** — a place captured this round
  (with intruders still standing in it) enters the war rounds below in the *same* round. The
  escape-destination map is refreshed with them, so a routed leader cannot flee into a place just
  captured as if it were unowned land. Do not move that fetch back above the unowned loop: the war
  rounds want the world *after* the captures.
- **`aiMove` only looked at adjacent places** (see "AI movement"): a defender abandoned their own
  place with an enemy inside it to grab a defence-0 empty neighbour, and an invader never stayed to
  press the attack — both walked apart before the battle phase could see them. Fixed there with
  "an enemy at my feet: stay and fight".

**A capture hands the administrator seat to the capturer** (`transferAdminSeat`, Oct 2026). The old
rule only appointed when the seat was vacant, so the *old owner's* administrator kept the seat after
a capture and collected the new owner's 40% every round. Now the old seat is revoked first
(`revokeAdmin`: a `+DEFECTION_ADMIN_REPLACED_DELTA` ledger row + an `ADMIN_REMOVED` event — only
when the holder is alive and is not the capturer; a corpse's seat counts as vacant), then the
capturer is granted (`grantAdmin`; when replaced, only the `ADMIN_REMOVED` is logged — the same
convention as the spawn path). Capture paths stay **not** cooldown-gated, and every seat change still
goes through the `adminAssign.ts` helpers — never a direct `administratorId` write.
`battle.eventOrder.test.ts` guards that each handover call site sits right after its `PLACE_CAPTURED`.

**A late capture pass closes the escape gap** (Oct 2026). The war rounds' **escapes** drop a routed
leader on a neighbouring place — and the unowned-place pass ran **before** they landed, so the round
ended with "an unowned place with an enemy leader standing on it" and the capture deferred a full
round (the reported case: 芬妮 fled to 沙海塘 in round 25 and the place stayed unowned). Fix:
`resolveRouted` records every escape landing spot in `lateCaptureCandidates`, and after the war
rounds the battle phase re-scans **exactly those spots**: if still unowned and garrison 0, the free
capture runs there and then — same `PLACE_CAPTURED` + `transferAdminSeat` as the first pass, and
the capturer may be the escapee themselves (the fatigue loop has floored them back to 1 troop). The
"who captures" rule lives in one pure function, `captureLeaderOf()` (`src/lib/capture.ts` —
factioned, troop-bearing, fastest), quoted by **both** the first pass and the late pass; do not
restate it inline. **A siege is deliberately not re-run** — it spans rounds by design (reinforcements
simply join), and running it twice in one round would double the damage and the fatigue.

### Every living leader keeps at least one soldier

`survivorTroops` (`battle.ts`) floors every post-combat troop count at **1**: routs and fatigue never
disarm a living leader (a 0-troop leader can neither march nor fight — `aiMove` would strand them). New
leaders start at `CHAR_START_TROOPS` (1). Only death ends a leader's soldiers.

If a map-level battle visual is ever wanted again, it must be scoped to the round being displayed and
tied to a real `PLACE_CAPTURED` event, not derived from standing ownership.

### Space Backdrop: three space layers, four canvases

DOM order is paint order, and the fog sits **between** the galaxy and the map.

| order | element | role |
|---|---|---|
| 1 | `SpaceGalaxy` (`src/lib/spaceGalaxy.ts` + `src/components/SpaceGalaxy.tsx`) | the deep field: warm core, nebula patches, stars |
| 2 | `SpaceFog` (`src/lib/spaceFog.ts` + `src/components/SpaceFog.tsx`) | warm star-dust over the galaxy and **under** the map; drifts slowly, no zoom fade |
| 3 | `SpaceFlow` (`src/lib/spaceFlow.ts` + `src/components/SpaceFlow.tsx`) | the drifting ribbons: **all** of the parallax motion |
| 4 | `SigmaMap` | the map itself: roads, nodes, territory |

All four are `absolute inset-0 pointer-events-none`.

- **The galaxy, the fog and the dust must come BEFORE `SigmaMap`**, because sigma's container carries
  an opaque backdrop that would hide them entirely. `SigmaMap`'s own wrapper therefore has **no**
  background — `bg-ds-space` (two `@theme static` tokens, not a bespoke `.space-bg` class) provides it.
- **The fog used to come AFTER `SigmaMap`**, as a haze over the roads. It now sits *under* the map, above
  the galaxy: it is a warm star-dust backdrop, so roads and nodes always sit on top of it and are never
  veiled. It is still `pointer-events-none` (kept for consistency and safety), so it can never interfere.
- **The fog does not cover the chrome**, and that is *structural, not guaranteed*: `GameGraph` is
  `<main>`'s **first** child, and every HUD element (the round timeline, the side rail, the corner
  brackets) is a **later** sibling, so they paint above it. Reorder `GameGraph` and the fog starts
  covering the HUD.
- **The territory area layer stops being interactive when zoomed in.** `TERRITORY_INTERACTIVE_RATIO: 0.6`
  gates the *area* layer only: below it, pointing at a patch of ground no longer answers "whose land is
  this" and no longer lights that faction's fill, because that range is showing **nodes and roads** and
  the area layer is only a backdrop — yet it would still take over the cursor's reading, which reads as a
  bug. Place **node** hover and click are unaffected. The gate is read from `cameraRatioRef`, a mirror of
  the camera ratio, because `onMove` is a stable closure that cannot reach the sigma instance; crossing
  the threshold clears the highlight and tooltip immediately rather than waiting for a mousemove.
- Only the dust has a parallax factor of its own (`SPACE_FLOW_PARALLAX: 0.35`), because it is the
  one layer that is **not** in world space — it floats above the map. The galaxy and the fog have
  **no parallax at all**: they are placed by sigma and therefore scroll and zoom with the map exactly.

#### Placement is sigma's job — do not hand-roll it

`SigmaMap` exposes sigma's own framed→viewport mapping through `MapCameraControls`:

```ts
framedGraphToViewport: (p: { x: number; y: number }) => { x: number; y: number };
```

`framedPlacement(mapper, radiusFraction)` — in `src/lib/spaceShared.ts`, which is the shared module
for both backdrop layers — calls it twice: once for the world centre `(0.5, 0.5)`, once to measure
pixels-per-world-unit from the gap between two adjacent framed points. `spaceShared.ts` also holds
the two colour helpers (`parseHex` / `withAlpha`) both layers need, so neither has to import from
the other.

- **This replaced a real bug.** Sigma's mapping is
  `screen = (framed − camera.position) × scale + centre`, so raising `camera.x` moves world content
  **left**. The galaxy used to add `(camera.x − 0.5) × k` to its centre, which moved it **right** — so
  the backdrop drifted *against* the map and read as "not following it". `SPACE_GALAXY_PARALLAX`,
  `SCALE_EXPONENT`, `SCALE_CLAMP_MIN/MAX` and `REF_RATIO` are **gone**; they existed only to paper
  over the fact that neither pan nor zoom was actually following sigma. `spaceGalaxy.test.ts` asserts
  they stay absent, and that the centre comes from the mapper rather than from camera x/y.
- **The galaxy and the fog are world objects**, so panning genuinely slides them off frame. That is
  correct anchoring, not a defect.
- **Scale is `pixelsPerWorldUnit × radiusFraction`**, and it inherits sigma's exact zoom. Because the
  mapper argument is injected, the module stays pure and testable with a stub.

#### Galaxy zoom-in fade

Following sigma exactly means scale really is `1 / ratio`, and sigma's ratio spans 0.05–3. At 0.05
the disc would be ~9× the viewport: a flat warm film that destroys road contrast.
`SPACE_GALAXY_RADIUS_FRACTION: 0.85` makes the disc most of the world, so it is a real backdrop rather
than a small glow (raised from 0.72: the request was "larger"). `SPACE_GALAXY_FADE_RATIO: 0.9` starts to
dim it as you zoom in, but **never to nothing** — `SPACE_GALAXY_FADE_MIN: 0.55` is the floor, so the
galaxy always remains part of the background (fading to 0 left a pure-black frame that read as broken,
and a low floor read as an invisible film when the user asked to see the galaxy *more* clearly zoomed
in). Clarity at deep zoom comes from the **raised floor plus more detail** (`STAR_COUNT` 900,
`NEBULA_BLOBS` 12), **not** from removing the fade: a bright disc at deep zoom is a warm wash over the
roads, so road contrast is carried by the map having lost its node glow layer instead. The offscreen bake
is sized for the largest radius still visible, so it never blurs before it fades.

#### Fog (`SPACE_FOG_*`)

A warm seeded star-dust drawn from its own offscreen canvas. It **drifts slowly** — unlike the galaxy it
must not read as a rotating prop: 20 minutes a turn is depth, not spin. It has **no zoom fade**: it now
lives *under* the map, so there is nothing for it to veil, and it stays present at every zoom.

- **It sits under the map and above the galaxy**, and `spaceFog.test.ts` asserts it carries no zoom-fade
  thresholds (`zoomRatio` / `fadeRatio` are gone) and that its drift behaves (one turn per period, bounded
  to 0..2π, disabled when the period is ≤ 0, and slower than the galaxy's).
- **"Random" means seeded.** The same seed always yields the same fog, so a remount cannot make the
  layer jump — the project-wide convention.
- **Density is what makes it read as a cloud, not a grey sheet.** Each patch draws one 0..1 value and
  maps it into `SPACE_FOG_DENSITY_MIN..MAX` (`0.1..1`), and that single value drives **both** its alpha
  and its radius — so a dense patch is also a large one, and thin patches nearly vanish. Drawing them
  independently produced big transparent patches, which read as a bug. `spaceFog.test.ts` asserts the
  spread: the densest patch is near the ceiling, the thinnest under 30% of it, and the **mean** sits well
  below the ceiling so it is never a solid sheet.
- **`SPACE_FOG_ALPHA` is 0.5, and that is deliberate.** It used to be 0.16, tuned when the fog painted
  *over* the map; against the near-black void it was simply invisible, so the whole layer read as absent.
  What stops it becoming a uniform white sheet is the density range above, not the ceiling.
- **The palette is warm** (`SPACE_FOG_COLORS`: `#f2e6c8` → `#5c4c38`, near-white cream to dark umber).
  The point is that it reads as *lit star dust*, not a cold grey haze; `spaceFog.test.ts` asserts every
  colour's red channel dominates its blue so it cannot drift back.
- **It keeps the full visibility gate**, so the drift pauses off-viewport and on a hidden tab, and
  `prefers-reduced-motion` renders a single static frame — exactly like the other layers.

#### Shared galaxy notes

- **The galaxy is baked once into an offscreen canvas, then rotated.** A frame is one blit,
  independent of the star count. The fog is likewise one blit of its own bitmap.
- **Neither layer uses any noise.** The galaxy used to carry brown dust lanes whose texture came from
  wobbling the radius with Simplex noise; with the lanes removed the noise had no remaining purpose,
  so `three`'s `SimplexNoise` is no longer imported. Both are pure seeded geometry.
- **The lanes were removed on purpose, and the cost is real.** They were the galaxy's *only* spiral
  structure — without them this reads as a soft glowing star cloud, not a recognisable spiral. The
  trade is deliberate: structure and motion now come from the flow-field layer, and the core stops
  being crossed by brown tubes. `spaceGalaxy.test.ts` asserts those keys are absent.
- **The offscreen canvas must carry the DPR transform** (`setTransform(dpr, …)` and `clearRect` in CSS
  pixels). Its backing store is sized in device pixels, so drawing in CSS pixels without it puts the
  galaxy in 1/dpr of the surface and then stretches it back — soft on any 4K display.
- **Paint order inside the galaxy bake is largest-first: core, nebula, stars.** Stars go last or the
  translucent nebula covers them and blurs them, and blur is the one thing this layer can least
  afford because roads sit under it.
- **The galaxy's rotation clock is accumulated, not read from a wall clock.** `dt` does not advance
  while paused (off-viewport, hidden tab), so returning to the tab resumes rather than spinning
  forward. `rotateAt` takes the angle modulo a full turn, so it never grows into an astronomical
  number.
- **Outside the disc the canvas is transparent**, so `bg-ds-space` and `bg-ds-space-nebula` show
  through.
- **The galaxy is deliberately dimmer than the reference.** The Stellaris reference core is bright,
  but it gets away with that because its hyperlanes are thin *bright* lines. Ours are semi-transparent
  dark blue `#1e3a5f` with up to 2000 nodes above them, so this takes the reference's **composition
  and hues, not its exposure**. `spaceGalaxy.test.ts` asserts those ceilings so they cannot be
  quietly raised.
- **The nebula token was desaturated with it.** `--color-ds-space-nebula` was a saturated purple and
  blue; against a warm core those cool corners fight it. They are now muted plum and slate.
- **No translucent trail fill and no `lighter` blending.** Additive overlap makes star crossings glow,
  which reads as light — and the map underneath is already light, so that eats the roads' contrast.
- **Every colour is in `gameConfig.ts`** (`SPACE_GALAXY_COLOR_CORE/MID`, `NEBULA_COLORS`,
  `STAR_COLORS`, `SPACE_FOG_COLORS`). No component hard-codes one.
- Stars are drawn **largest-first into the bake**, with a `1 - d³` rim fade so the disc edge does not
  show as a hard cut. `StarSpeck` stores `x`/`y`, so the distance is derived, not read.
- Neither layer draws React state, only canvas transforms. A per-frame `setState` would re-render the
  whole map.
- The graph→viewport mapping assumes **camera angle 0** (both camera animations pass `angle: 0`).

#### Flow-Field Dust (`src/lib/spaceFlow.ts` + `src/components/SpaceFlow.tsx`)

The foreground layer, stacked **over** the galaxy. Particles move along a **3D Simplex noise field**,
so ribbons, vortices and voids emerge — random but structured. What makes it work is the field's
**continuity**: nearby positions return similar angles, so particles flow along one shared field
instead of scattering.

- **The noise comes from `three`, not a new dependency.** `three/examples/jsm/math/SimplexNoise` is
  the same algorithm and is already installed. This is the **only** canvas layer that uses noise.
- **The seed must be a real PRNG, never a constant.** `createNoise3D(rand)` calls `rand` a couple of
  hundred times to build its permutation table; `() => 0.5` makes every gradient index identical and
  collapses the field into a smooth ramp, losing the one thing the technique is for. Use the project's
  `createRng()`.
- **Hue follows the field, read from the noise at the particle's position.** Per-particle hues put
  every colour inside one ribbon and no structure shows. The hue samples at a *finer* spatial scale
  than the flow (so bands layer inside a ribbon) and drifts *slower* (so colour does not churn with
  the motion). A respawn carries the old `size` but deliberately **not** the old hue — carrying it
  would decouple colour from position.
- **The palette was deliberately pushed into the cool half and down in chroma**, and this is asserted
  as a *ceiling*. The dust used to be a full 0–320 sweep at saturation 78 / alpha 0.72, which was
  tuned when it was the *only* backdrop. Over a warm galaxy and a map that already carries faction
  colour those ribbons fought both and cost the roads their contrast, so `HUE_MIN/MAX` are now
  `195 → 280`, `SATURATION` 45 and `MAX_ALPHA` 0.4. `spaceFlow.test.ts` asserts saturation < 60,
  alpha < 0.5 and a hue span < 200°, so it can never drift back into a rainbow.
- **No translucent trail fill.** The sample's per-frame `fillRect('rgba(...)')` needs an *opaque*
  backdrop to fade against; this page's base is a gradient plus two nebula washes, so accumulating
  translucent fills smears it and never fully clears. Particles fade individually.
- **`lighter` blending is not used.** Additive overlap makes crossings glow, but the map underneath is
  already light and that eats the roads' contrast.
- **Every colour is in `gameConfig.ts`** (`SPACE_FLOW_HUE_MIN/MAX`, `SATURATION`, `LIGHTNESS`,
  `MAX_ALPHA`, `HUE_STEPS`, and an optional `SPACE_FLOW_COLORS` list of `r,g,b` or `#rrggbb` for
  exact colours). The component hard-codes none.
- Hue is **quantised**, so the layer needs only `HUE_STEPS` pre-built fill strings and a frame
  allocates nothing.
- Parallax is damped to **0.35** against the galaxy's 1.0, which is what reads as depth; the test
  asserts the two differ.
- Opacities are written straight to the DOM rather than through React state — a per-frame
  `setState` would re-render the whole map.

### Income Split, Abilities & Troop Purchases

- **The shares are 30% king / 40% administrator / 30% everyone else** (shared equally), all in
  `server/income.ts`. The administrator takes the largest cut because they are the one actually
  running the place. **The three shares always sum to `income`.** "Everyone else" is `othersOf()` —
  the **controlling faction's** leaders present, minus the king and the administrator. A leader of
  another faction standing in the place (an invader) is **not** paid from it: the ground they stand
  on belongs to someone else, and so does its income (Oct 2026 — they used to share the 30% bucket).
- **No administrator means nobody is paid** — this deliberately inverts the old rule, which routed
  a vacant administrator's share to the king. Paying a king who is not present is worse than paying
  nobody, so the gold stays with the place. This check runs **first**, because it is the only branch
  that zeroes the total.
- A vacant **king** or an empty **"everyone else"** bucket has its share absorbed by whoever is
  present (the multiplier is applied once to the combined portion, never twice). When the
  scale-back leaves a remainder and there is nobody else, that remainder goes to the administrator —
  returning `others: 0` there made gold **vanish**, which is exactly what the sum-equals-income test
  caught.
- `jing` is **經濟 / Economy** and its multiplier is `1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX`,
  and **a place's income is shaped by the administrator's jing alone**: the pie is
  `placeIncome(market) × jingIncomeMultiplier(adminJing)` at the caller, before the split. The **king's
  and the others' shares are flat ratios of that grown pie** — no personal jing multiplier acts on them.
  This makes "every jing applies at most once" *structural*: the founding king is usually the administrator
  himself, and the same person's jing acting on both the pie and his own share would be ×jing² (reported
  and fixed Oct 2026 — the king's personal multiplier and the split's proportional scale-back were removed
  with it; the scale-back was dead code once no multiplier remained inside the split). It is not 智謀 and
  not intelligence.
- **The pie is whole gold at the source**: `placeOutput(market, adminJing)` (`server/income.ts`) =
  `floor(placeIncome(market) × the multiplier)` — `Character.gold` is an `Int` column, and an
  unfloored pie once produced a fractional `9.166666666666668` administrator payout (reported and fixed
  Oct 2026). `economy.ts` and the place popup both call it — one definition, so the preview cannot drift.
- **The popup's 叛變值 tooltip shows the breakdown** (Oct 2026): ambition + the
  loyalty penalty + this round's ledger deltas, listed term by term with the
  loyalty-difference visible as its own `+2`. The numbers come from
  `defectionBreakdown()` and `defectionValue()` delegates to it — the value, the
  breakdown, and the simulation's roll share **one source**. The 叛變機率 row's
  tooltip states the formula and the "below the midpoint it is 0" rule.
- **The place popup lists the recipients' take** (`本回合分成`): the king (`split.king`, tagged 在別處 when
  he lives elsewhere — his gold still comes from this place), the administrator (`split.admin`), and the
  controlling faction's other leaders present at `floor(split.others / count)` each (the remainder stays
  with the place, the same floor as the simulation). The count and the list share **one** `othersOf()`
  result, so they cannot drift; foreign-faction leaders standing here appear under 駐紮將領 but **not** in
  the split. No administrator → 無人領取.
- **`tong` is 統領 / Leadership and now does exactly one thing: it scales the size of a single troop
  purchase** — the base batch is `CHAR_BUY_TROOP_BASE (30) × tongPurchaseMultiplier(tong)`, jittered
  ±`CHAR_BUY_TROOP_JITTER` (25%), hard-capped by gold and the spec's batch max (100). The old cap
  (`CHAR_BUY_TROOP_MAX × the multiplier`) almost never bound — a leader's per-round gold rarely
  affords 100 troops — so tong was effectively decorative; the base batch keeps it inside the range
  where gold actually binds. `tongPurchaseMultiplier` is asserted to return the same value as
  `jingIncomeMultiplier` for the same input, so the two cannot drift apart.
  - **`tong` does not touch defection at all — this took two passes.** The original
    `AMBITION_KING_TONG_REDUCE` multiply in `loyaltyCheck.ts` was removed first, but that was
    **not the end of it**: `AMBITION_KING_TONG_DELTA` kept living in `defectionEvents.ts`, reading
    the king's `tong` and writing a negative ledger delta, which `loyaltyCheck` then summed into
    the defection value. Retiring the multiplier left a second path running, and the rule above
    was documented as if it were gone. Both keys and the whole block are now deleted, and the
    character's `select` in that phase no longer reads `factionId` or `ambition` — they existed
    only for this. Leadership is not loyalty.
  - **`tong` no longer defends.** That is 體魄 / `ti` now (`BATTLE_DEF_TI_MULT`). Both use
    `× (1 + x/30)`, but they answer different questions: `wu` is "how hard they hit", `ti` is "how
    well they hold", and `tong` is "how many troops can they buy at once".
- **A new king destabilises the faction** (Oct 2026). When a faction crowns a new king — an heir
  after a natural or battle death (`KING_INHERITED`) — its leaders get
  `+DEFECTION_NEW_KING_DELTA` (2) per round for `DEFECTION_NEW_KING_ROUNDS` (10) rounds, written by
  `defectionEvents` (phase 7), one row per round like the cooling. The window is rebuilt from the
  `Event` table (KING_INHERITED's `data` carries `factionId`); several successions inside one
  window take the **earliest** — two kings in a row is still one unstable period, and stacking a
  second window would double-count the same signal. The king himself is **not** on the list: he
  never defects (`loyaltyCheck` does not roll kings), and he is the transition's beneficiary, not
  the wavering party. Timing mirrors the friend rule: a battle succession is written in phase 10
  after phase 7 has run, so it starts the next round; a natural succession (phase 3) starts the same
  round. Defector-founded and collapse-founded factions get no window — there is no
  `KING_INHERITED` row, and a faction those leaders chose to join is not a power vacuum.
- **`defectionBase` and `DefectionEvent.delta` are integers**, migration
  `20261017000000_ambition_and_delta_to_int`. Both were `Float`.
  - **`Rng.gaussianInt(mean, sigma, min, max)` is what draws them**, not `Math.round` at each call
    site. A float written into an `Int` column is *accepted*, so the mistake could never surface
    as an error — it just left columns whose type no longer matched what the code was sending.
    `gaussianInt` is exactly `Math.round(gaussian(...))`, so the distribution shape is unchanged
    and a given seed produces the same world it always did.
  - **`speed` was already an `Int` column but was drawn with `gaussian()`** — an integer only
    because the database coerced it. It used `gaussianInt` too, in the same pass.
  - **The `::numeric` cast in the migration is not optional.** Postgres has no single-argument
    `round(double precision)`, so a plain `ROUND("defectionBase")` raises *function round(double
    precision) does not exist*. Round in numeric, then cast.
  - **`DEFECTION_NO_PROMOTION_DELTA` went 0.5 → 1**, which is a balance change, not a formality:
    against a −2 defection cooling the no-promotion drip was 1:4 and is now **1:2**. Do not
    "fix" a pacing surprise without reading that first.
  - Six config keys were deleted as dead: `AMBITION_DEFECT_BASE_MULT`, `AMBITION_DIFF_LOYALTY_MULT`,
    `AMBITION_FRIEND_DEFECT_MULT`, `AMBITION_FRIEND_DEFECT_DELTA`, `AMBITION_LARGE_FACTION_MULT`,
    `AMBITION_LARGE_FACTION_THRESHOLD`. All were referenced only by their own definition —
    leftovers from the pre-ledger design, and the friend-defect check they served is still a
    `TODO` in `defectionEvents.ts`.
- **`ti` is 體魄 / Physique**, 5–30 uniform, the defence term in **leader-vs-leader** battle only.
  Migration `20261012000000_add_character_ti` adds the column and backfills **17**, not 0: a flat 0
  would make every pre-existing leader helpless in defence and lose nearly every fight they were
  about to win. Do not run `prisma migrate reset` against this database.

### Building effects — one definition, four consumers

`src/lib/placeEffects.ts` owns **what every building level actually does**, the upgrade price,
and a place's per-round output. `build.ts`, `economy.ts`, `battle.ts` **and the place popup** all read
it, so the popup cannot quote a number the simulation does not use. A preview that restates the
rules separately will drift from them; that is the whole reason the module exists.

| building | per level | consumed by |
|---|---|---|
| 堡壘 `fortress` | +20% defence | `fortressDefenceMult()` in **both** battle paths |
| 市場 `market` | +5 gold | `placeIncome()` in the economy phase |
| 兵營 `barracks` | +3 recruits | `placeRecruits()` in the economy phase |

- Cost is `BUILDING_UPGRADE_COST_BASE × MULT^level` (100, 200, 400, 800, 1600) and the cap is
  `BUILDING_MAX_LEVEL = 5`. **Both used to be inline** — the cap was a bare `5` in `build.ts` and the
  cost a literal expression. They are exported now so the popup shows the same numbers.
- Each building's effect carries its **unit** with it (`percent` / `gold` / `troops`), so the popup
  never has to guess how to render it.
- The popup also shows what the administrator **actually** pockets, by calling `placeOutput()` +
  `splitIncome()` themselves rather than printing "40%" — the pie already carries the administrator's
  jing multiplier (see the Income section), and the market building row's per-round output passes the same
  multiplier through `placeEffectLabel`. With no administrator nobody is paid, so a printed ratio would
  read as though he still got paid. This needed `kingId` on the faction payload, because the king's
  share comes off the grown pie, and a **dead king does not count** (alive-filtered, same as the
  simulation).

### The building row quotes the price that is actually charged

The level list and the summary card used to quote **two different prices for the same target**:
the list printed the running total (`totalCostToReach(2)` = 300 = 100 + 200) while the card
printed the single step (`upgradeCost(1)` = 200) — and `build.ts` charges 200. Two prices for one
upgrade, one of which nobody was ever billed.

- **The printed effect is the place's total output, not the building's own contribution.**
  This was the *other* half of the same class of bug, and it was the one a reader reported: the
  row printed `+5 金錢 → +10 金錢` at market level 1 while the expanded level table in the
  **same component** printed `15 金錢 / 每回合`. Both were true and neither matched the other —
  and taking `+5` at level 1 concludes level 0 earns nothing, when the place still earns
  `PLACE_BASE_INCOME`. Market level 1 is **15**, barracks level 1 is **5**.
  - `placeEffectLabel(kind, level)` is the **single** answer: `placeOutputAt` when there is a
    total, otherwise the cumulative effect. Fortress keeps its percentage because defence is a
    multiplier on the garrison, not an output.
  - **Three call sites print this** — the row summary, the level dots' tooltips, and the
    expanded table. All three go through `placeEffectLabel`. They did not always: the table was
    already printing totals while the row and the dots printed `buildingTotal`, so a level had
    two numbers depending on where you looked.
  - `placeEffectLabel` is asserted against `placeIncome` / `placeRecruits` — the numbers the
    simulation actually uses — so the popup cannot quote a figure the round does not produce.

- **The price is the single step**: `costToReachLevel(level)` = `upgradeCost(level - 1)`, which is
  exactly what `build.ts` charges. The old `totalCostToReach` is gone; a price list that does not
  list prices is the bug.
- **The card shows the next level too**: `+20% → +40%`. The next value is
  `buildingTotal(kind, level + 1)` — the **cumulative** effect, not the per-level one, so a
  level-1 fortress reads +20% → +40% and not +20% → +20%. `nextUpgradeGain()` already existed
  for this and was called by nothing; it is now the null-gate (at max level there is no next).
- **The price is labelled `place.upgradeCost`**, not `character.gold`. The market's effect is
  *also* gold ("+5 金錢"), so a price labelled 金錢 next to an effect labelled 金錢 reads as two
  quantities of the same thing.
- The `level - 1` used to sit inline in the JSX, so "what the list prints" and "what gets
  charged" were two independently written expressions with nothing binding them. That is how they
  came to disagree; `costToReachLevel` is the single binding.

### Friends, discontent, and the relations tab

Friendship and discontent are both **mutual**, and both are shipped as flat `{aId, bId,
sinceRound}` pairs — the same shape as `roads` — so the client can invert them.

- **Discontent writes two rows per pair** (`a→b` and `b→a`), from **one roll**.
  `DISCONTENT_FORM_CHANCE` therefore means "the chance this pair becomes *mutually* discontent".
  Rolling twice would make it `1-(1-c)²` = 9.75%, which quietly changes a config value.
- **The RNG roll position is load-bearing.** The roll happens *before* the existence check,
  unconditionally, exactly as before. The order in which the RNG is drawn is the simulation's
  determinism contract: move or drop one roll and every later draw shifts, so the same seed
  grows a different world. Only the query behind the roll changed (a `Set` lookup instead of a
  per-pair `findUnique`, because writing two rows per pair would have tripled that cost).
- **A friend's defection raises the defection value**: `+DEFECTION_FRIEND_DELTA` (2) per friend
  who defected inside `DEFECTION_FRIEND_ROUNDS` (10), written to the `DefectionEvent` ledger.
  Positive, the opposite sign to the cooling.
- **A friend who defected twice counts once.** The repeat is already billed by the cooling;
  billing it a second time under a second rule is double-counting.
- **The friendship must have existed at the moment of the betrayal** (`sinceRound <= the
  defection's round`). Otherwise someone who defected first and became a friend later is still
  billed for it — which is "made friends afterwards", not "left behind by a friend".
- **It lands one round late, on purpose.** `defectionEvents` (phase 7) runs *before*
  `loyaltyCheck` (phase 8), which is what actually decides who defects, so this round's
  defections do not exist yet. A betrayal in round N bills friends from N+1 through N+10.
- `relationsOf()` (`src/lib/relations.ts`, pure and tested) does the inversion. **It dedupes**,
  and that is not optional: mutual discontent stores two rows per pair, so a naive scan lists the
  same person twice.
- The **relations tab** on the leader popup (`LeaderRelations` in `leader-detail.tsx`) lists
  friends and the people they are unhappy with, each name clickable into that leader's popup.
  `DetailModal` itself has no tab support, and must not grow any: it is also the faction-ranking
  shell, where a "friends" tab makes no sense.
- The data reaches the client through `/api/world/state` — **both** the live path and the
  snapshot path. `snapshot.ts` embeds the two arrays, and `decompressSnapshot` defaults them to
  `[]` for the blobs written before the fields existed.
- A `FRIENDSHIP` event is written when a friendship forms. It is the only way the player can see
  friendship at all, and friendship now has a consequence, so it matters. It needed
  `EVENT_CATEGORY` and a glyph in `icons.tsx`, or it falls through to the default dot.

### Co-located relations change combat ability — and nothing else

A friend standing at the **same place** raises that leader's `wu` (attack) and `ti` (defence);
someone they are unhappy with at the same place lowers them. `FRIEND_SAME_PLACE_DELTA` is `+1`
and `DISCONTENT_SAME_PLACE_DELTA` is `-1`, so the **sign lives in the config**.

- **Nothing is stored.** The modifier is re-derived from current positions on every
  calculation, so "reverts when they are not at the same place" is automatic — there is no
  state to expire, so it cannot forget to expire or get stuck.
- **One pass over the relation rows.** For a row `(a, b)`: if the two are at the same place, it
  counts for **both**; if they are apart, it counts for neither. That formulation *is* the
  definition of "the other one is at my place", and it costs O(relations) once instead of a
  scan per combatant.
- **`placeOf` holds living characters only.** Relations outlive their owners and a dead
  character's `placeId` stays in the database, so without this a dead friend would keep
  affecting the place they used to stand in.
- **`RELATION_SAME_PLACE_MAX` (3) caps each relation kind separately.** Uncapped, ten friends
  standing together would be `+10 wu` while the whole ability band is 5–30 — one swing swamping
  the entire scale.
- **The floor is 1 and there is no ceiling.** Attack power is `troops × (1 + wu/30)`, so a wu
  below zero would make attack power *negative* — that is not "very weak", it is wrong. But a
  leader at 30 with four friends gets 34, and that bonus is the point of the rule.
- **Only three arithmetic sites change**, all in `server/phases/battle.ts`: the two `atk` sites
  use the effective `wu`, and the leader-vs-leader `def` site uses the effective `ti`. The
  garrison defence has no commander, so it is untouched. `tong` is not involved at all — it
  stopped being a defence stat when `ti` took over, and it now only sizes a troop purchase.
- **The battle report quotes the *effective* `wu`.** It prints
  `atk = troops × (1 + attackerWu/30) × roll`, so a report quoting the base value would not add
  up to the `attackPower` printed beside it.
- **The leader popup shows the effective value** (`21 (20+1)`) and the **leader table shows the
  raw one**. The popup is the combat readout, and the rule is that a panel may not quote a
  number the simulation did not use; the table is a sortable roster, and a location-dependent
  number would make its sort order shift as people walk around.
- The client recomputes it with the **same** pure function (`buildRelationCombatDeltas` in
  `src/lib/relationCombat.ts`), the same way `defectionValue()` is shared. Re-deriving the rule
  by hand in the component is what would produce a "the panel says 24 but it behaved like 20"
  divergence that nothing would ever catch.

### The leader popup's data tab is three groups, and modified values explain themselves

The data tab is split into **基礎 / basics** (age, place, gold, troops), **戰力 / power** (the
five abilities) and **忠誠 / loyalty** (loyalty tag, ambition, defection value, defection
chance).

- **The grouping is a reading, not a layout preference.** Mixed into one table, the reader has
  to work out for themselves which numbers decide whether he wins a fight and which are merely
  facts about him. In three groups the power group contains *only* the numbers that affect a
  fight.
- **A value that a rule moved carries a tooltip.** The parenthetical (`21 (20+1)`) is the
  *result*; the tooltip is the *reason*. Only `wu` and `ti` can be moved today, and only when
  relations are co-located, so only they get one — a tooltip on every row would be noise.
- **The display face goes on the value, not on the `<dd>`.** The place row's value is a button,
  and a button inherits its parent's font: putting `font-display` on the `<dd>` would silently
  switch the place name to the display face, which is a typographic change nobody asked for.
- **A group heading is 14px, and the blocks are divided by a hairline.** Both halves are
  load-bearing. `GM_TITLE` is already 14px, and `text-xs!` was forcing the heading back down to
  **exactly** the 12px of the row labels — so the group titles were typographically identical to
  the data they introduce and did not read as headings at all. A `border-t border-white/10` on
  every block but the first is what makes the three groups separable without heavy chrome.
  **The spacing total stays at 12px on purpose**: the container's `space-y-1` (4px) plus the
  rule's `pt-2` (8px) is precisely what `space-y-3` used to be. The headings carry **no**
  bottom margin — there is a rule above them and every row below has its own `border-b` and
  `py-1`, so the extra 4px only pushed the panel 1px past its box and produced a scrollbar on a
  popup that otherwise fitted exactly. Do not "helpfully" add a margin here.
- The 本回合影響 block is a **peer `<section>`**, not a separate panel. It is the evidence for
  the 忠誠 group, so it takes the same rule and sits in the same stack.
- `DetailModal` itself still has no tab support, and must not grow any — it is also the
  faction-ranking shell. The 資料 / 關係 tabs live in the leader popup's body.

### The defection row names all three parties

A `DEFECTION` event now carries `oldFactionName` and `placeName` alongside the ids, and the row
reads "left *X* · at *Y* · joined/founded *Z*". Two of the three write sites previously stored
**neither** the old faction's name nor the place's, so the log could only say "某某 defected" — the
most useful part was left for the player to guess.

- `oldFactionName` comes from the `faction` relation already included on the character query, and
  `placeName` from a newly included `place: { select: { name: true } }`.
- The `joined_nearby` site has no faction name in scope (roads carry only `factionId`), so it costs
  one `findUnique`. That branch is rare and the lookup is not on a hot path.
- `reason` distinguishes `created_new_faction` from joining an existing one, so the row says
  建立/加入了 accordingly rather than always "joined".
- A faction renders as **plain text** (`factionNode`), never a link: there is no faction popup to
  open, and falling back to an id would leak a raw `cmus...` string into the UI.

### Faction Ranking: the status column header

`FactionRanking` renders the alive / collapsing / destroyed state in the `<tbody>` but the `<thead>`
must carry the matching `<th>` **between name and king**, or the columns shift under their own
data. It is sortable through the shared `compareFactionRows`, ranked by `statusRank()` — three
states, not two, because "collapsing" and "already gone" must sort *between* alive and destroyed.
It reuses the existing `general.status` key rather than duplicating the string into `faction`.

### The line chart x axis is absolute rounds, not array indices

A faction's series is **not dense from the world's first round**: it only gains an entry in the
round it first appears, so its `values` array starts at index 0 while the world may start at round
12. Plotting by array index therefore drew every faction as if it had existed since the beginning.
The stats route now carries a per-faction `rounds[]` beside each value, and the chart resolves the
offset with `startOffsetOf()` / `xOf()` / `valueAt()`.

**The same bug was reading wrong numbers, not just drawing in the wrong place.** The crosshair and
the tooltip indexed `values` by a *world* index against a faction-local array, got `undefined`, fell
through `?? 0`, and reported a real faction as **zero troops**. They now use `valueAt()` and
`hasValueAt()`, and a round lists only factions that actually existed then.

### Battle Report & Economy Events

- **`INCOME` is a new event type**, written once per place per round by `economy.ts`. It carries
  the place, the round's income, the recruited troops, and who was paid how much
  (`kingGold` / `adminGold` / `othersGold`). **One event per place, not per leader**: a world holds
  hundreds of places, and per-leader rows would be hundreds of events a round for no extra
  information — one row already answers "where did it come from and how much". Names are fetched
  with the characters specifically so the log can name the recipient.
- **`TROOPS_BOUGHT` is written once per purchase**, by the same phase. It carries `charId` +
  `charName`, `placeId` + `placeName`, `bought`, `cost`, and the resulting `goldAfter` /
  `troopsAfter`. It exists because `INCOME` only reports what a *place* paid out: without it the log
  shows "某某 got 5 gold" and never says how many troops that became, so the money's path stops
  mid-sentence. The resulting balances are carried for the same reason `INCOME` carries its own —
  the cost alone cannot answer whether the leader can afford another batch. It is filed under the
  `economy` category and gets a coin-and-up-arrow glyph, so it must be added to `EVENT_CATEGORY` in
  `EventLog.tsx` **and** to the `EventGlyph` switch, or it silently falls through to the default dot.
- **`PLACE_CAPTURED` now carries a `report`** — the arithmetic behind the engagement
  (`attackerTroops`, `attackerWu`, `attackRoll`, `attackPower`, `defenderGarrison`,
  `defenderFortress`, `defenceRoll`, `defencePower`, `outcome`). `outcome` is
  `'assault'`, `'repelled'` — or the report is **`null`**, which *is* the no-defenders case.
  A capture has two very different histories (fought a garrison, or walked into an empty place)
  and a log row cannot show the difference, so `BattleReport.tsx` states it explicitly rather
  than leaving a blank the reader would take for a bug.
- The row's **戰報 / Report** button opens `BattleReport.tsx`, which is portalled to
  `document.body` — the log is a scroll container, and an absolutely positioned panel inside it
  would scroll away with the rows.
- Editing either phase: both files use **CRLF**, so a scripted edit must normalise line endings
  first or its anchors silently fail to match.

### Leader Table: sorting & returning from the detail

- The 將領數 table head **is** the sort control: each `<th>` renders a button, the active column is
  tinted, and a ▲/▼ shows the direction. `compareLeaderRows()` returns direction-agnostic order and
  the caller applies ±1, because handling the direction in two places drifts apart. Strings use
  `localeCompare` so Chinese sorts sensibly.
- **Switching columns picks that column's own default direction** (numbers descending, names A→Z)
  instead of inheriting the previous column's, which would make clicking "name" start at Z→A.
  Re-sorting also resets the paging, since the old scroll position is meaningless.
- **Opening a leader from the table keeps a way back.** The table is itself a modal and closes when
  the detail opens (two stacked modals fight over Escape), so "back" cannot be just `popupBack()` —
  that closes to the map rather than to the table. `leaderTableReturn` holds the reopen action, and
  `DetailModal`'s existing `onBack` / `canGoBack` props surface it.

### Stats Charts

The stats tab renders two independent things — nine time-series charts in four
switchable styles, and a faction-power treemap — plus a character radar panel.

**1. Nine time-series charts in four switchable styles.** The type lives in one
`ChartType` union plus a `CHART_TYPE_LABEL_KEYS` map; each style has its own component
(`LineChart`, `PieChart`, `GaugeChart`, `BarChart`) and `renderChart()` picks between them.

| Type | Faction charts (one series per faction) | World charts (single series) |
|------|------------------------------------------|------------------------------|
| `line` | one polyline per faction + latest-point markers | single trend line |
| `pie` | donut of the latest round's share, legend with % | **gauge ring** (value vs. historical peak) |
| `square` | stacked bar per round (last `BAR_MAX_ROUNDS` = 24) | bar per round |
| `treemap` | *replaces all nine charts* — see below | — |

**Hover tooltips.** All four styles plus the treemap share one `ChartTooltip` DOM panel and
one `ChartLegend`, so hover reads identically wherever it appears. It is
`pointer-events-none` — a panel that sits over the chart must not steal the pointer, or the
crosshair jitters as the tooltip chases the cursor.

- `LineChart` / `BarChart` draw a crosshair and **snap to the nearest round index** rather
  than interpolating, so the `回合 N` heading lines up with the integer tick labels
- `PieChart` hit-tests the slice under the cursor and labels the **latest** round
- `GaugeChart` shows 目前 vs 峰值
- **The round heading is optional** (`round?: number`). The gauge and the treemap omit it:
  both are current snapshots rather than one round. Passing an array index as `round` was an
  actual bug — the gauge has no `rounds` prop, so there is nothing to index
- **The tooltip flips to the cursor's left past `CHART_TIP_FLIP_AT`.** The chart is only
  ~240px wide inside the panel and the panel is at least `min-w-[9rem]` (144px), so past
  roughly 85px there is no room on the right and it would be clipped by the panel edge
- Chart geometry is **config, not local constants**: `CHART_W` / `CHART_H` / `CHART_PAD` /
  `CHART_TIP_FLIP_AT` / `BAR_MAX_ROUNDS` / `TREEMAP_*` / `RADAR_*` live in `gameConfig.ts` and
  are destructured once at the top of `stats-charts.tsx`. These are **viewBox units**, not px;
  the on-screen size comes from the `w-full` container. Do not reintroduce a local `const` for
  any of them

**2. A character radar**, its own panel below the charts. It ignores the type toggle.
One polygon per faction showing the **mean attributes of its living characters**, over six
axes — `wu`, `tong`, `jing`, `speed`, `ambition`, `age` — with the world average as a
dashed reference ring. Capped at `RADAR_MAX_FACTIONS` (6) polygons, largest faction first;
past that the shapes just overlap. It reads `WorldState.characters` / `.factions` from the
game page, **not** the stats endpoint, so it needs those two props threaded into
`StatsCharts` at both call sites (desktop rail and mobile overlay).

**3. A hover radar on the leader table** — *not* in the stats tab: `CharacterList` (characters tab)
opens a `DetailModal` with the 12-column leader table, and hovering a row floats that character's
radar beside the table, with their faction's living mean as the dashed reference. It is portalled
to `document.body` and `position: fixed`, because the modal body is a scroll container — an
absolutely positioned panel would scroll away with the rows.
- The panel is `pointer-events-none`. Without that, moving the cursor onto it fires the row's
  `mouseleave` and the panel flickers itself out of existence.
- The hover row shows **two** floating panels: the `LeaderAvatar` head on the **left**, the radar
  on the **right**. Both are `pointer-events-none`, and both read the one `hoverPreview` state.
- The row's viewport position is read in the `mouseenter` **handler**, never during render, and
  the vertical clamp happens there too so render never touches `window`.
- The whole `<table>` gets `onMouseLeave` so the preview also collapses in the gaps between rows.
- `radarPoints()` / `RadarGrid` / `RadarAxisLabels` are shared by the sidebar radar and this
  preview — `radarPoints` takes `(values, size, radius)` because the two sizes differ. Add new
  radar consumers through those helpers, not by copying the SVG.

### Treemap Rules

- Treemap is a **combined** view of faction power, not another rendering of a single metric,
  so selecting it replaces the nine per-metric charts rather than trying to force a
  treemap onto a time series.
- Outer block area = territory count; each block subdivides into troops / gold / characters.
- **The three metrics are normalised against their own world maximum** before the split —
  troops can be a thousand times character counts, so raw values would make the
  character segment invisible. This means block area mixes a faction's *scale* with its
  *internal mix*; that is a deliberate trade-off, not an oversight.
- `layoutTreemap()` is slice-and-dice along the longer side, recursing into each parent's
  own rectangle. Non-positive values are skipped, so an all-zero payload renders the
  "no data" message instead of empty rectangles.
- Capped at `TREEMAP_MAX_FACTIONS` (12), largest by territory first.
- Segment swatches come from `--color-ds-cyan` / `--color-ds-amber` / `--color-ds-purple`;
  faction blocks use the runtime faction colour. No colour is hardcoded.
- **Hit-testing picks the smallest containing rect**, not the first match. A child segment
  sits *inside* its parent's rect, so `placed.find(...)` always returned the parent and the
  subdivided segments could never be hovered at all.
- A `TreemapNode` carries **two numbers**: `value` is the normalised 0..1 used for the
  layout split, and `display` is the real count the tooltip prints. Printing `value` verbatim
  reads as "0.42". The tooltip uses `display ?? value`.
- Child labels are prefixed with the faction name (`原暉堂 · 兵力`). Hovering a segment on its
  own would otherwise read as a bare metric name with no indication of whose troops it is.
- The tooltip prints `node.label`, **not** `node.key` — `key` is the faction id, and rendering
  it leaks a raw id like `cmusjwryl007dlswzzsbwf1bz14` into the UI.

### Radar Caveats

- Each axis normalises against **its own** maximum (`CHAR_ABILITY_MAX`, `CHAR_SPEED_MAX`,
  `CHAR_DEFECTION_BASE_MAX`, `CHAR_MAX_AGE_MAX` — age tops out far above the ability stats), so
  edge lengths are **not comparable across axes**. Read the shape, not the absolute numbers.
- Axis labels reuse the existing `character.*` i18n keys; do not add radar-specific ones.

### Avatar: blinking, talking, and speed

- `blinkAmount(t)` and `talkAmount(t)` are **pure exports**, so both curves are testable without a
  DOM. Blink is a **triangle** over 0.14s every 4s — a linear ramp reads as squinting, not blinking.
- Talking is three mouth movements then a **pause**. The pause is the point: without one the mouth
  opens on a metronome and looks broken rather than like speech.
- Both scale about their **own centre**, and the mouth pivots from its **top edge** so it opens
  downward. An eye group that scales about its own origin slides the eyes upward as it shuts, which
  reads as a rendering glitch.
- All three animations ride the **existing** rAF loop and write `transform` only — a per-frame
  `setState` would re-render the face and every call site. `applyFace(0)` also runs on mount, on
  cleanup and under `prefers-reduced-motion`, so a still avatar is drawn in its settled frame
  rather than its un-animated default.
- **Speed is a fourth cue**, not a fourth costume piece: 1/2/3 motion lines behind the head, in its
  own colour ramp (`SPEED_TIER_COLOR`). It deliberately does **not** reuse the gold/steel/hemp
  `TIER_MATERIAL` the three abilities share — otherwise it reads as part of the ability set. The
  lines are drawn *before* the head so they trail behind it.
- `avatarCues()` returns **four** rows now (wu / tong / jing / speed), so the hover tooltip explains
  the speed lines too. `AvatarCharacter` gained `speed`.

### Leader Avatars (`src/components/LeaderAvatar.tsx`)

Each leader's head is a **procedurally generated SVG bust** — no art assets, no database
column, no new dependency.

- **Seeded from `character.id`** via the existing `createRng` (it FNV-1a hashes the string).
  The draw order is fixed, so the same id always yields the same face — which is why nothing
  needs to be stored.
- **Real data biases the result**, applied *after* the draws so it cannot skew the other
  traits: `isKing` → crown · `age ≥ 60` → grey/white hair and a likelier beard ·
  `ambition ≥ 20` → brows angle down · faction colour → robe and backdrop.
- **Each ability is banded three ways** rather than rewarded only at the top. `tierFor()` splits
  the 5–30 range at `ABILITY_HIGH` (25) and `ABILITY_MID` (18) into `high` / `mid` / `low`, and
  `AvatarTraits` exposes `wuTier` / `tongTier` / `jingTier`. The old rule rewarded only `high`, so
  ~80% of leaders carried **no** ability signal at all and every one of them looked alike. `mid`
  being the common band is exactly what makes the population readable at a glance.

  | Band | `wu` (head) | `tong` (shoulders) | `jing` (chest) |
  |------|------|--------|--------|
  | high | plumed helmet | wide gold board + fringe | abacus |
  | mid | knotted headband | plain steel board | square-holed cash coin |
  | low | scar | thin patched hemp strap | empty drawstring pouch |

  The low band deliberately reads as **worn, not merely different**, so the power structure is
  legible without a tooltip. Four rules make all nine cues readable, and every one of them was
  learned from rendering the full 27-combination grid, not from reasoning about it:
  - **One shared material language.** `TIER_MATERIAL` maps `high`/`mid`/`low` to gold / steel /
    hemp, and **all three abilities use it**, so rank compares *across* stats. Nine unrelated
    hues meant the tiers had to be memorised one at a time.
  - **One body region each, never overlapping.** `wu` on the head, `tong` on the shoulders, `jing`
    centred on the chest. The first version put the sash/cord at the chest and waist alongside
    the beads/coin/patch, and they cancelled each other out.
  - **Each tier is the *same object* degrading, not three different objects.** One board going
    gold → steel → a thin mended strap; a full abacus → one coin → an empty pouch. A progression
    is readable; three unrelated shapes are not. The shoulder board also **shrinks** as it
    degrades, so size carries the rank as well as colour — and the `low` strap is a plain strip
    because a frayed edge would have mimicked the `high` board's fringe.
  - **Every weak cue is drawn lighter than the robe, and never in a robe colour.** A dark belt on
    a dark robe is invisible and a robe-coloured stitch is no stitch at all — either one silently
    puts the low tier back to no signal. The helmet is raised clear of the brows for the same
    class of reason: at its original height the brim cut straight across the eyes.
- **The crown suppresses headwear** but nothing else. A king never wears the `high` helmet or the
  `mid` headband, yet keeps the `low` scar — a scar is not headwear, and being wounded is not
  being royalty. The tiers still report the number honestly; suppression belongs to the renderer,
  which is what keeps `deriveAvatarTraits` testable without a DOM.
- **Trait logic is a pure exported function**, `deriveAvatarTraits(character)`; the component
  only renders. That's what `LeaderAvatar.test.ts` tests — it needs no DOM, so it runs under
  the project's `node` vitest environment. Keep new traits in the pure function, not in JSX.
- The trait pools (`SKIN_TONES`, `HAIR_COLORS`, …) are **content, not design tokens** — the
  same category as the name generator's word lists, so they live in code. The faction colour is
  runtime data and is applied inline, as everywhere else.
- Currently used for the leader-table hover preview (left side, mirroring the radar on the
  right). Reuse it anywhere a leader needs to be recognisable.
- **Hovering the avatar explains the cues** — three rows (`武力 高 · 頭盔`), because a plumed helmet
  and a gold board are only meaningful once you know what they encode. The wrapper is focusable and
  carries the same text in `aria-label`, so keyboard and screen-reader users get it too. The row
  mapping is a pure exported function, `avatarCues(traits)`, with **no strings in it** — the wording
  is i18n's job, which keeps the mapping testable without a DOM. `className` goes on the **wrapper**,
  not the `<svg>`: both call sites centre with `mx-auto`, which would measure against the
  shrink-wrapped wrapper if it stayed on the SVG. The tooltip is `pointer-events-none` so moving the
  cursor onto it cannot dismiss it before it is read
- **Idle breathing (`breathe` prop, off by default)** — chest rise plus a slight head tilt, driven by
  `requestAnimationFrame` writing `transform` onto two `<g>` nodes directly. **Never React state**: a
  per-frame `setState` re-renders the avatar and every call site when only two nodes move. The curve
  `breathAmount()` is a pure exported function, so it is testable without a DOM.
  - The peak sits at **0.45** of the cycle, not 0.5: a shorter inhale is what reads as breathing
    rather than pulsing. A symmetric half-sine reads as a heartbeat. The first implementation got this
    wrong and the test caught it.
  - `breathe` is enabled **only** on the detail modal's 168px avatar. The list rows and the hover
    preview leave it off: at 40–56px the motion is invisible but the repaints are real, and those
    call sites render dozens at a time.
- The hover preview panel is itself `pointer-events-none` (it must be, or entering it fires the row's
  `mouseleave` and the panel flickers itself away), so the tooltip is reachable in the **detail
  modal** but not in the transient table preview

### Authentication (Google + email/password)

Two sign-in methods share one `User` table. Google accounts have `passwordHash === null`;
only password accounts have one, which is exactly why that column is nullable.

- **Hashing lives in `src/lib/password.ts` (server only)** — argon2id via `@node-rs/argon2`, at
  OWASP's floor (19 MiB / t=2 / p=1). The encoded PHC string carries its own parameters, so
  raising them later never locks existing users out. `algorithm` is deliberately omitted: the
  library already defaults to argon2id, and `Algorithm` is an ambient `const enum` that cannot be
  read under `isolatedModules`.
- **`PASSWORD_MIN_LENGTH` lives in `src/lib/passwordPolicy.ts`, which imports nothing.** This is
  not tidiness — `@node-rs/argon2` declares a top-level `browser: browser.js`, and Next's webpack
  prefers the browser field for the **client** bundle. That file needs
  `@node-rs/argon2-wasm32-wasi`, which is not installed, so any client component that transitively
  imports argon2 **500s the whole page**. Keep `SignInForm` importing the policy module, never
  `password.ts`.
- **`authorize()` returns `null` for every failure** — wrong password, unknown email, and Google
  account alike. Distinguishing them turns the sign-in form into an account-enumeration oracle.
- **`POST /api/auth/register` returns 409 on an existing email and never overwrites its password.**
  The tempting alternative ("the address exists, so just set the password") is an **account
  takeover hole**: anyone who knows a Google user's address could register a password and sign in
  as them. Addresses are easy to learn.
- **`POST /api/auth/set-password` is the only safe way for a Google account to gain a password** —
  including admins, who are matched by `ADMIN_EMAIL`. It requires a verified session, and holding
  one *is* the proof of ownership. It returns 409 if a password already exists rather than
  overwriting, because silently replacing credentials is not acceptable.
- **No email verification and no password reset.** Both need a mail provider, and were explicitly
  deferred. The consequence is that an address can sign in with its password before any
  confirmation — an accepted trade-off, not an oversight.
- **There is no rate limiting** on either route. A public deployment needs something in front
  (Upstash, Vercel WAF, or middleware); registration especially, since it writes to the database.
- No composition rules, only the length floor: complexity rules mostly push people toward
  predictable `Password1!`-style strings (NIST SP 800-63B).
- The migration `20261005000000_align_admin_columns_and_add_password_hash` re-adds
  `Place.adminChangedRound` and `Character.adminAmbitionRevertRound` with `IF NOT EXISTS`. Those
  had been applied with `prisma db push` and never recorded, so `migrate dev` saw them as drift and
  demanded a **reset** — which would have wiped the running world. The two earlier migrations were
  baselined with `prisma migrate resolve --applied` first. **Do not run `prisma migrate reset`
  against this database.**

### Signals: the king calls, the AI follows

Phase 5 (`signals.ts`) **issues** signals — for years it only expired them and decremented cooldowns, so
the Signal table was never written and `aiMove`'s rally marching waited on a call that could never come.
Each alive faction's **king** issues at most one signal (the faction's only sender), gated by
`SIGNAL_COOLDOWN` (merchant kings take double — sparing with any call). The policy
(`src/lib/kingSignal.ts`, pure) keys off the king's **spending posture**: a place about to fall
(margin < 0, margin = estimated defence − the strongest adjacent hostile leader's estimated attack) is
**always relieved first**; with nothing urgent, the aggressive king attacks the **weakest border** (lowest
estimated defence), guardian/merchant stand down, and the balanced king attacks only a border someone can
actually take (border defence ≤ strongest leader's attack ÷ `AI_ATTACK_ADVANTAGE`). Issuing writes a
`SIGNAL_ISSUED` event (faction category, banner glyph) and the king's cooldown.

**Followers** (`aiMove` priority 1) march toward the signal target through friendly territory only, and a
**hostile target needs the same estimate gate** as a self-chosen assault — the king's call is not a
suicide order.

### AI movement: estimate before engaging, defend when threatened

`server/phases/aiMove.ts` no longer `rng.pick`s an enemy neighbour and charges in. Per adjacent enemy
place the estimated attack (`estimateAttack`, `src/lib/warEstimate.ts` — the same coefficients as
`battle.ts`, rolls at their expected 1.0) must clear the estimated defence
(`estimatePlaceDefence`: garrison + defending leaders × fortress) times `AI_ATTACK_ADVANTAGE` (0.8 —
"do I dare bite this", not "can I win in one round"); among the viable ones it attacks the **weakest**.
No winnable target → **wait in place** (the economy phase re-arms it). A troops-0 survivor never
charges. And a **threatened administrator stays home**
(`isThreatened`: some hostile leader present or adjacent whose estimated attack clears the local defence
— a lower bar than the attacking side, defence wakes before offence commits): marching the admin out
would drop the place's defence by its strongest defender. The king's signal outranks staying.

**An enemy at my feet means stay and fight** (Oct 2026): when the place a leader is standing in hosts
a hostile leader — the defender's own ground, or the invader standing on enemy land — they do not
move this round; the battle phase resolves the war. Before this, `aiMove`'s enemy search covered only
*adjacent* places, and among the "viable" ones the weakest wins the sort — a defence-0 unowned
neighbour always beat the enemy actually standing there. The defender walked off their own contested
place, the invader wandered off too, and since `aiMove` runs *before* the battle the two were never
co-located when it mattered. A signal outranks staying; a factionless leader never fights, so they
keep marching.

**The enemy search compares against the character's own faction, not the place they stand on**
(Oct 2026). Both the attack search and the signal-march stepping stones used `currentPlaceFaction`
as the reference, which is wrong twice over: a leader standing on **unowned** land saw their own
faction's neighbours as targets, and a leader standing on **enemy** ground could only route through
enemy territory (their own faction's places looked hostile too). The reference is now
`char.factionId` — hostile-owned neighbours are the enemy, and unowned plus friendly land is
passable. For a leader standing on their own faction's place the two references agree, which is why
this stayed invisible for so long.

### Spending postures: each leader spends differently

`src/lib/spending.ts` derives a posture from a **strict** dominance of wu / ti / jing (ties are
balanced): aggressive / guardian / merchant / balanced. **Administrators keep a posture reserve** before
buying troops (aggressive 0, balanced 0.25, guardian/merchant 0.5 — non-administrators keep none, a
reserve without a building is dead money), and the posture orders the building preferences. The build
phase (`build.ts`) is no longer `rng.pick`: under threat the fortress always comes first, otherwise the
posture decides, and the `BUILDING_UPGRADE` event carries the `reason` (posture or `threatened`).
Threat itself comes from `warEstimate.ts` — the same numbers the attacking side uses.

### Tooltips: one placement rule, a bottom sheet on touch

`src/lib/tooltipPlacement.ts` (pure) is the single above-or-below rule for all tooltip surfaces:
**below by default** with the panel's **top-left near the cursor**, flipping above only when below
genuinely does not fit — a cursor in the top half is always served from below (the map's tooltip used to
be *always* above and clipped at the top edge). On `(pointer: coarse)` the ability tooltips open a
**bottom sheet** instead (tap to open, ✕ / backdrop / Esc to close — a floating tooltip is unreadable on
touch: the finger lifts, mouseleave fires). Touch devices get **no map hover tooltip** — a tap already
opens the place detail panel.

### Map rotation is fully supported

Touch pinch (sigma's built-in) and a desktop gesture (right-drag or Shift+drag, context menu suppressed)
rotate the camera. Every layer is rotation-aware: the territory affine, faction labels measured through
sigma, `pointInRotatedRect` for the label hit test, and the overlay's four-corner culling box (see the
territory section). `focusNode` **keeps the current angle**; only the reset (↺) returns to 0. The
graph-rebuild effect already snapshots and restores `angle`.

### World initialisation is shared by seed and reset

`server/initWorld.ts` is the **only** way a runnable world is built — the full place set (the king's
seat with initial buildings and garrison), geographic-MST roads (1-3 per place, degree-capped), a
ForceAtlas2 layout, king + faction + administrators, and the round-0 snapshot before advancing to round 1.
`prisma/seed.ts` and the reset-world endpoint both call it; the reset endpoint used to create ten
placeholder places (no roads, no faction, no king), which produced a world that could not run. The RNG
draw order is identical to the original seed — one seed grows one world.

### Type Safety

- All code must be fully typed with TypeScript strict mode
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`
- Use proper Prisma types for database queries
- Use Auth.js types for session/auth operations

### Error Handling

- All API routes must return proper HTTP status codes
- Use NextResponse.json() with appropriate error messages
- Log errors for debugging in development

### Testing

```bash
# Run TypeScript type checking
npx tsc --noEmit

# Run ESLint
pnpm lint

# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Seed initial game data
npx tsx prisma/seed.ts
```

### Bilingual Text Integrity (`src/lib/textIntegrity.test.ts`)

This project's comments and docs are bilingual, and they are the only source that gets written
through a shell. The failure mode that matters is **a character replaced by another equally valid
character of the same script** — and *nothing* catches that automatically, because the byte stream
stays perfectly well-formed.

The real case: `顏色` ("colour", 顏 = U+984F) was written as `題色` (題 = U+984C, "question"). <!-- text-integrity:allow-example -->
`題色` is not a Chinese word, while the English on the same line stayed correct <!-- text-integrity:allow-example -->
(`/ Check 2 hops for color conflicts`). **The tell is "nonsense Chinese, correct English."**
Scanning for `U+FFFD` catches none of it, because both characters are valid code points — which is
exactly why a mojibake scan reporting "clean" is not evidence of anything.

- **The test pins the known-bad sequences; it is deliberately not a general validator.** No general
  validator catches this class of bug. What catches it is pinning a specific sequence someone
  already got wrong. Add to `KNOWN_BAD` when you find a new one.
- **The bad strings are written as code point escapes** (`'\u984c\u8272'`), never as literals. A
  guard must not be able to fail alongside the thing it guards.
- **The guard excludes itself.** Its own comment has to *name* the corrupted form as an example,
  so it necessarily contains it. Without the exclusion it finds itself, fails every run, and gets
  switched off — a guard that always fails is worse than no guard.
- **Proven to fail:** drop a file containing the bad sequence into `src/` and the test names the
  exact `file:line`. Verified, not assumed.

### Initial Game State

The seed script (`prisma/seed.ts`) shares its initialisation with the reset-world endpoint
(`server/initWorld.ts` — one definition, see the World-initialisation section above) and creates:
- **1 world** (global, unique)
- **100 places** with roads connecting them
- **1 character** (king) with 1 faction
- Uses project functions: `createRng()`, `generateUniquePlaceName()`, `generatePersonName()`, plus `uniqueAliveFactionName()`/`uniqueAliveKingName()` from `server/uniqueNames.ts`
- Place names are **two distinct adjectives + terrain** (adj1 ≠ adj2; 60×59×51 = 180,540 capacity, guaranteed unique); alive faction names and alive king names are each unique (death releases a name)
- Creates the **round-0 snapshot first**, then sets `currentRound: 1` — so the first "Next Round" click runs round 1 and the `RND` counter advances 0000 → 0001 (reset-world does the same)
- All values from `CONFIG` in `gameConfig.ts`
- **ForceAtlas2 layout** calculates initial positions based on road network
- **Unowned places** have building level 0 and garrison 0
- **King's place** gets initial buildings/garrison from CONFIG

## Common Patterns

### API Route Structure

```typescript
// src/app/api/example/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  // 1. Check authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 2. Business logic
  const data = await prisma.world.findMany();

  // 3. Return response
  return NextResponse.json(data);
}
```

### Prisma Query Pattern

```typescript
import { prisma } from '@/lib/prisma';

// Always use the singleton
const world = await prisma.world.findFirst({
  where: { active: true },
  include: {
    places: true,
    characters: true,
  },
});
```

### TanStack Query Pattern

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';

function GamePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['worldState', round],
    queryFn: async () => {
      const response = await fetch(`/api/world/state?round=${round}`);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{/* Render data */}</div>;
}
```

### Zod Validation Pattern

```typescript
import { z } from 'zod';

// Define schema
const WorldStateQuerySchema = z.object({
  round: z.coerce.number().int().min(0),
});

// Validate in API route
const queryResult = WorldStateQuerySchema.safeParse({
  round: searchParams.get('round'),
});

if (!queryResult.success) {
  return NextResponse.json(
    { error: queryResult.error.issues[0].message },
    { status: 400 }
  );
}

const { round } = queryResult.data;
```

## Environment Variables

Required environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth.js session secret |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `ADMIN_EMAIL` | Comma-separated admin emails |

## Debugging

### Common Issues

1. **Module resolution errors**: Ensure imports use `@/*` alias, not relative paths
2. **Prisma errors**: Check that `prisma generate` has been run
3. **Auth errors**: Verify `AUTH_SECRET` is set in environment
4. **Type errors**: Run `npx tsc --noEmit` to check

### Useful Commands

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Type check the project
npx tsc --noEmit

# Start development server
pnpm dev
```

## Code Style

- Use TypeScript for all files
- Follow existing patterns in the codebase
- Add JSDoc comments for public APIs
- Keep functions focused and small
- Use meaningful variable names

### Styling

- **Add design values to `@theme static`** in `src/app/globals.css`. Never
  hardcode a colour, font size, spacing, radius, shadow, or duration in TSX.
- **Express surfaces with Tailwind utilities.** Do not add a bespoke CSS class
  for a surface; the two that remain (`ds-gm-scroll`, `ds-gm-noscroll`) exist
  only because scrollbar pseudo-elements have no utility equivalent.
- **Repeated surfaces get a module-scope `const`** at the top of the owning module
  (`src/app/page.tsx` for the home page, `src/app/game/styles.ts` for the game
  page), not a CSS class. Anything the page *and* a sibling module both render
  belongs in that shared module rather than being written twice.
- **Pseudo-elements go through `before:` / `after:`**, not hand-written `::`
  rules. Use `@utility` when a pseudo-element must compose with a variant.
- **Deliberate same-layer overrides need the important modifier** (suffix `!`),
  e.g. `text-xs!`. Hover variants do not.
- **Inline styles are for runtime data only** (faction colour). Never for a
  design token.
- Respect the contrast floor: body text ≥ 4.5:1, meaningful text ≥ 13px, body
  ≥ 16px, touch targets ≥ 44×44.

### Animation

- Every animation loop must pause when it leaves the viewport
  (`IntersectionObserver`) and when `document.hidden`, and must render a single
  static frame under `prefers-reduced-motion`.
- `three.js` scenes must dispose every geometry, material, and renderer on
  unmount.
- Scroll-driven motion belongs to the hero and the star chart; everything else
  animates once on first view and then stops.

## Security Notes

- Never expose API keys or secrets in code
- Always validate user input in API routes
- Use proper authentication checks before operations
- Admin operations require both auth and admin status check

## OpenCode Configuration

This project includes OpenCode configuration files:

### Project Config (`.opencode/config.json`)
Contains project-specific settings, rules, and MCP configurations.

### Package Scripts
```bash
# Type checking
pnpm typecheck

# Prisma operations
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:studio

# Development
pnpm dev
pnpm build  # Runs: prisma generate && next build
pnpm lint
```

### Key Rules for AI Agents
1. **Imports**: Always use `@/*` path alias, never relative paths to `lib/`
2. **Prisma 7**: Run `pnpm prisma:generate` after schema changes
3. **Auth**: Use `auth()` function, not `getSession()`
4. **Types**: Never use `as any` or `@ts-ignore`
5. **Error Handling**: All API routes must return proper HTTP status codes
6. **Data Fetching**: Use TanStack Query for client-side data fetching
7. **Validation**: Use Zod for API input validation
8. **Testing**: Run `pnpm test` to verify changes
9. **Styling**: Design values go in `@theme static`; surfaces use Tailwind
   utilities; do not add bespoke CSS classes. See "Styling" above.
10. **Type checking**: `pnpm typecheck`. If it reports errors inside
    `.next/**/types/`, that is a stale or half-written Next.js generated file,
    not a source problem — delete `.next/dev/types` and let `next dev` or
    `next build` regenerate it. Never reach for `tsconfig` changes or
    `@ts-ignore` to silence it.

---

### 顯示字型與前臂 / The display face and the forearm

**Orbitron 換成 Chakra Petch，`font-orbitron` 改名為 `font-display`。**
Orbitron 在這個介面上「不清楚」不是主觀問題，而是結構性的：字幅很寬、x-height 低、
字形切角又特殊，而它最常出現的地方——事件列標頭、圖表刻度、`RND` 計數、eyebrow 標籤——
都是 11–13px 的小字，在那些尺寸下筆畫會糊成一團。Chakra Petch 保留科幻的方正感，但切角是
「刀」而不是「面」，筆畫對比更高、字幅更窄；斜切的收尾也帶一點武備感，剛好補上奇幻那一半。
它只有 latin，中文一律落到 `PingFang TC`，與舊設定相同。類別與 CSS 變數一起改名
（`--font-orbitron` → `--font-display`、`.font-orbitron` → `.font-display`），因為留著舊名字
會指向一個根本沒有載入的字型。
Orbitron's illegibility here was structural: very wide, low x-height, unusual geometric cuts,
and it spends most of its life at 11–13px in this UI, where those traits smear together.
Chakra Petch keeps the squarish sci-fi feel with blade-like terminals, higher stroke contrast
and narrower letterforms, and the angled cuts read as martial, which supplies the fantasy half.
The class and CSS variable were renamed along with it, because keeping the old name would point
at a font that is no longer loaded.

**體魄現在畫在一條真的手臂上，三段共用同一個尺寸。**
原本只有護具，直接浮在衣袍上，看起來像貼在布上的色條而不是四肢；現在手臂畫在**肩章之前**，
肩章才壓在肩膀上而不是被手臂穿過去。手臂上緣刻意壓低——高一點就會從肩章的斜邊上方露出一塊
皮膚，讀起來像脖子旁多了一塊。
三段護具**不再各自縮小**：階級改由材質（金／鋼／麻）、深色外框與飾線（高階甲片脊線、低階
縫線）表達。mid 與 low 原本比較小，結果低階的線索不是「弱」而是「幾乎看不見」——而 40px 的
列表列上，那正是唯一承載體魄資訊的地方。
The Physique cue now sits on a real limb rather than floating on cloth, and all three bands share
**one size**. Rank is carried by material, the dark rim and the detailing (a ridge for the heavy
band, stitching for the worn one), not by extent — a smaller mid/low guard made the low band's
signal "almost invisible" rather than "weak", and at the 40px list size that is where the only
ti signal lives.

## 頁面提升（今日） / UI changes (today)

### 新將領一後庫 1 名士兵 / A new leader starts with one soldier

新生的將領一後郡庫 `CHAR_START_TROOPS`（1）名士兵，不會一發現就完全無兵。只改為 `spawnCharacters.ts`；設定用本来就是 `rng.int(5, 15)`，不需要變更。

### 圖表：x 軸是絕對回合數字 / Charts: the x axis is the absolute round

動力的串列**不是从世界第一回合就采減的**，它只在該動力刕現的那回合才長一項，所以 `values` 從 index 0 就開始，而世界可能已經到第 12 回合。照險律畫 index，每個動力都會被畫成一直存在到最初。stats route 現在每個動力的數值旁該 `rounds[]`，圖表用 `startOffsetOf()` / `xOf()` / `valueAt()` 去寫回真實的回合位置。

**同一個 bug 體讀正錯的數字。** 午朝線與 tooltip 曾用世界 index 去索引一個動力本局的陣列，取到 `undefined`、被 `?? 0` 接下，把真實存在的動力從錯報成**零兵力**；且元素会列出那一回合根本尚未存在的動力。現在改用 `valueAt()` 與 `hasValueAt()`。

### 顯像：體魌識別、動勢線移位、侧腽陳影 / Avatar: the ti cue, moved speed lines, cheek shading

**體魌（ti）是第四個能力識別，位置在前臂。** 武力（頭鑪）、統領（肩章）、經濟（胸前）已各占一個身体部位，前臂是唯一留下的，四項才會一眼分得開。它同樣逐級殘陳：金碼护腕 → 素膀鑴（鋼）→ 布繌臂（麻），且尺寸一起窄。`avatarCues()` 因此回傳**五列**。

**動勢線改宜頭的左側是程式性的錯誤，不是美忌問題。** 舊布局的 x 坐落在 27-41，而頭部本身就是 x 25-75 的圍囊。整組動勢線因此全數落在頭的內裡，完全看不到，實際上等於沒绘。現在改為 x 4-21，形成收攒朝頭部的斜派。

**每個級級都加了深色辺框，並加上侧體、尾、辺下願、顔骨陳影与經相限的脸部体程。** 光是拿皮色調下來的（`SKIN_TONES` 里的深色），所以不引入新的颜色。低級本来靠顖色辨識，但麻與鋼對深色衣袍寫的不對，辺框讓轮廓在任何尺寸都站得住。詳細尺寸 168 → 216。

*This guide is for AI agents working on the Autonomous World project. For human developers, see README.md.*

### 事件日誌、雷達提示與地點兵力 / Event log, the radar tooltip and a place's soldiers

**事件日誌要「捲到底」捲好幾次，不是只捲一次。** `useLayoutEffect` 裡設一次
`scrollTop = scrollHeight` 是不夠的：三件事都發生在那個 layout pass **之後**——列是分頁抓
回來的、面板有進場動畫（那幾幀裡捲動容器高度還是 0）、字型也要下一個 frame 才套用。任何一個
都會讓「捲到底」算在一個太矮的內容上，於是停在半路。現在先同步捲一次（沒有閃爍），再跨兩個
`requestAnimationFrame` 與一個 160ms 的 `setTimeout` 各捲一次，並在 cleanup 取消——否則 effect
重跑會讓 pending frame 寫到已卸載的節點。
Setting `scrollTop` once inside the layout pass is not enough: rows arrive paginated, the panel
has an entry animation (the container is still 0 tall during it), and the font applies a frame
later — so the scroll lands mid-log. Pin synchronously, then re-pin across two frames plus a
160ms timeout, all cancelled on cleanup.

**統計頁的雷達讀值改成浮動提示，不再塞進版面。** 原本 hover 會在圖下面插入一個 `div`，
每次 hover 都把下面的圖表推下去——讀者只是在讀一列數字，版面卻在跳動。現在提示浮在圖上，
位置規則與 `CharacterRadarHover` 相同（游標在上半部就貼在上方）。鍵盤也要看得到讀值，
而鍵盤沒有游標，所以 focus 與方向鍵時提示釘在圖的中央。
The radar's per-axis readout now floats over the chart instead of being inserted into the
layout, where every hover pushed the charts below it down. It follows the same positioning rule
as `CharacterRadarHover`, and pins to the middle of the chart for keyboard users, who have no
pointer to follow.

**地點提示分開列「駐軍」與「將領兵力」。** 節點大小本來就是 `garrison + 將領兵力`，但提示
只印 `garrison`，於是一個節點看起來比實際兵力弱很多，而且讀者無從得知節點大小是怎麼來的。
兩者分開列出，另外給一個小字的合計。`leaderTroops` 隨後加進節點屬性與 `PlaceTooltip`
（territory 視圖點擊的那條路徑也補上，否則型別不過）。
The place tooltip lists garrison and leader troops separately. Node size has always been their
sum, but the tooltip printed only the garrison, so a node read as far weaker than it was and
the size had no visible explanation. `leaderTroops` now rides on the node attributes and on
`PlaceTooltip` — including the territory-view click path, which otherwise fails to typecheck.

### 關閉面板必須連帶清掉選取 / Closing the panel must clear the selection

**所有關閉路徑都走同一個 `closePanel()`。** 面板只是把地點詳情「搬進」分頁而已，選取狀態
仍然住在 `popupStack`；任何一條關閉路徑若只關面板而不清 stack，地圖上的節點就會繼續維持選取
樣式（高亮 + 強制顯示地名）——畫面上看起來就是「面板關了卻還選著」。
**All close routes go through one `closePanel()`.** The panel only *hosts* the place detail as a
tab; the selection itself lives in `popupStack`. A close path that closes the panel without
emptying the stack leaves the map node highlighted (selected colour plus a forced label), so
the map reads as "the panel closed but it's still selected".

**曾經有三條各自為政的關閉路徑，其中兩條忘了清選取。** 分頁再點一次、分頁自己的 ✕、
詳情自己的 ✕。修好其中兩條之後，把它收斂成一個函式——否則第四條路徑還是會忘。第四條路徑
現在沒有東西可以忘記。
There were three separate close routes — re-clicking the active tab, the panel's own ✕, and
the detail's own ✕ — and two of them forgot. Fixing those two wasn't enough on its own, so
they're now one function; a fourth path has nothing to forget.

**建築列不能帶 `overflow-hidden`。** 提示畫在卡片**外面**（上一張卡的上方），而
`overflow-hidden` 會把它整個裁掉——**裁切與堆疊順序是兩件事，z 再高也沒用**。正確的寫法是
拿掉 `overflow-hidden`，改為在展開時把**卡片自己**提到 `z-30`，這樣後面的同層卡片才不會蓋掉
提示。
The building card must not carry `overflow-hidden`. The tooltip renders *outside* that card, over
the card above it, and `overflow-hidden` clips it away entirely — clipping and stacking order
are different things, and no z-index undoes a clip. The fix is to drop `overflow-hidden` and
instead raise the **card itself** to `z-30` while expanded, so a later sibling cannot paint
over it.

> **不要把任何東西放進 `nextjs-agent-rules` 區塊。** `next dev` 會**整段重寫**那對
> BEGIN／END 標記之間的內容，放在裡面的手寫段落會在下次啟動時**被刪掉**——連放在裡面的警告
> 都一樣。專案自己的說明段落請寫在這對標記**之外**。
>
> **更麻煩的是：連在文字裡「引用」那對標記都不行。** 生成器是按字面比對的，所以警告裡若寫出
> 標記本身，它會把警告中間當成區塊的起點，然後從那裡一路重寫到 END 標記為止——於是警告自己
> 被從中間劈開。要提到標記，請用文字描述，不要照抄。
>
> **Never put anything inside the `nextjs-agent-rules` block.** `next dev` rewrites the whole
> region between the BEGIN and END markers, and any hand-written section placed inside it is
> **deleted** on the next start — including a warning about this very trap.
>
> **Worse: do not even *quote* the markers in your prose.** The generator matches them
> literally, so a warning that spells them out makes it treat the middle of that warning as the
> start of the block and rewrite from there to the END marker — splitting the warning in half.
> Describe the markers; do not reproduce them.
>
> Keep this project's own notes *outside* the markers. 專案自己的說明段落請寫在這對標記之外。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


### 野心不動了，變的是叛變值 / Ambition is fixed; the defection value moves

**野心是固定初始值，事件不再改寫它。** `defectionEvents` 階段與 `adminAssign` 原本
到處寫 `character.ambition`（「未升遷 +0.5」「取得職務 −1、十回合後回 +1」「被免職 +1」），
現在全部退休：那個扣了再回的機制連同 `adminAmbitionRevertRound` 都沒有意義了。
`defectionEvents` 現在只寫**帳本**——每回合產生 `DefectionEvent`，一行都不改 `Character`。
Ambition is a fixed initial stat and events no longer rewrite it. The whole
deduct-then-revert machinery, `adminAmbitionRevertRound` included, is retired;
`defectionEvents` now only writes the ledger and touches no `Character` row.

**帳本不是裝飾：忠誠檢查每回合把本回合的 delta 加總成「叛變值」。**

    value  = defectionBase
           + (忠誠標籤與君王不同 ? 2 : 0)
           + 本回合此人的 DefectionEvent **delta 總和**

    chance = (value − 17.5) / 17.5 × 0.05        // 17.5 = (5+30)/2

只有忠誠標籤是寫死的：它是 `Loyalty` 標籤的**比較**，不會產生 `DefectionEvent`，
所以沒有 delta 可加。其餘全部來自資料庫的真實 delta。**曾經寫成「每筆 +1」是錯的**——
每筆事件各有各的差值，`−2` 的一筆就該是 `−2`，而一筆 `+3` 就該是 `+3`。
只有忠誠標籤是寫死的，因為它是標籤比較、不會產生事件，沒有 delta 可讀。

Only the loyalty tag is hardcoded: it is a *comparison* of `Loyalty` tags that never
produces a `DefectionEvent`, so there is no delta to add. Everything else is summed from
real deltas. Writing it as "a flat +1 per event" was wrong — each event carries its own
magnitude.

**注意機率在平均以下就是 0。** `value ≤ 17.5` 時 `chance` 為 0，而野心的平均是 **17**，
所以大約一半的將領**永遠不會叛變**。這是公式的直接結果（0.05 是梯度不是下限）；
若要讓平均野心也有基礎機率，公式應該是 `(value / 17.5) × 0.05`。
Below the midpoint the chance is exactly 0, and ambition averages 17 — so roughly half of
all leaders can never defect. That follows from the formula as written (0.05 is a gradient,
not a floor); a floor would need `(value / 17.5) × 0.05`.

**建立新勢力與叛變都「不」重骰野心。** 原本有五處用
`CHAR_NEW_FACTION_AMBITION_RESET_MIN..MAX`（`factionCollapse.ts` 兩處、`loyaltyCheck.ts` 三處）
把野心拉回 5–15，設定值已一併刪除。取而代之的是**帳本冷卻**：`defectionEvents` 每回合為
視窗內每一次叛變寫一筆 `DEFECTION_COOLING_DELTA`（−2），持續
`DEFECTION_COOLING_ROUNDS`（20）回合。**每次叛變各自一筆，所以會疊加**：短時間叛變兩次是
−4。這是刻意選的——連續叛變本身就是更強傾向的證據，封頂 −2 等於把訊息丟掉。
`charId` 存在 `Event.data` JSON 裡（事件表比欄位老），所以冷卻是查出 `DEFECTION` 事件後在
JS 裡分組計數，不是 Prisma groupBy。**只寫帳本、不寫可見 Event**：符合條件的人每回合上百，
逐筆寫進日誌只會淹掉其他資訊；`DefectionEvent.reason` 已記錄原因。

Founding a faction and defecting both **no longer** re-roll ambition. All five re-roll sites
(`factionCollapse.ts` ×2, `loyaltyCheck.ts` ×3) and the config keys are gone. What replaced it is
**cooling in the ledger**: `defectionEvents` writes one `DEFECTION_COOLING_DELTA` (−2) row per
defection inside a `DEFECTION_COOLING_ROUNDS` (20) round window. **One row per defection, so
they stack** — two defections in quick succession is −4. That is deliberate: defecting twice in a
row is itself the evidence, and capping at −2 would throw it away. `charId` lives inside the
`Event.data` JSON (the events table predates the column), so the window is counted in JS rather
than with a Prisma `groupBy`. **Ledger only, no visible Event**: a hundred-odd leaders match per
round and per-row events would drown the log; `DefectionEvent.reason` already carries the reason.

### 長條圖的 x 軸與市場的「每回合產出」/ The bar axis and a market's real output

**`BarChart` 的取值也要走 `valueAt()`，不能走 `s.values[i]`。** 長條圖的**軸標籤**本來
就是真回合數，但它用 `s.values[start + i]` 取值，於是晚成立的勢力被畫成**別人的數字**。
線圖早就修過同一個 bug，但 `startOffsetOf` / `valueAt` / `hasValueAt` 三個幫手被關在
`LineChart` 裡面，`BarChart` 用不到，就各自重犯了一次。現在三個幫手提升到模組層，兩張圖共用。
The bar chart already labelled its axis with real round numbers while reading values by array
index, so a later-founded faction was drawn with another faction's numbers. The line chart had
this fixed long ago, but its three helpers were trapped inside `LineChart`, so `BarChart` could
not reuse them and re-broke it independently. They are now module-scope and shared.

**市場 0/5 的「每回合產出」是 10，不是 0。** `buildingTotal('market', 0)` 是 0，但地方
照樣有 `PLACE_BASE_INCOME`，所以印 0 會讓讀者以為這棟建築毫無用處。`placeOutputAt()`
印的是**此地此刻的總產出**；堡壘回傳 `null`，因為防禦是乘在守軍上的倍率，沒有「總產出」
可言，硬印一個數字只會是說謊。
At market level 0 the building's own contribution is 0, but the place still earns its base
income, so printing 0 reads as "this building is worthless". `placeOutputAt()` prints the
place's actual total. Fortress returns `null` on purpose: defence is a multiplier, so there is
no total and inventing one would be a lie.

### 區塊圖與地點列表 / The treemap and the place list

**區塊圖改成「每個指標一張」，和折線圖一樣。** 以前**沒有**metric 參數：一張圖把每個
勢力切成兵力／金幣／將領三段，於是每一格都在同時回答三個問題，結果三個都讀不太出來。
現在 `FactionTreemap` 接受 `metric`，每張圖只回答一個問題，面板數值由**各指標自己的
正規化基準**算出（`maxOfThis`），所以每張圖都代表「這個指標的全體分布」。
`TREEMAP_SEGMENT_KEYS` 原本還有個「當值」用法（分段圖例），圖例隨細分段一起移除後，
它只剩下型別用途，所以改成 `TreemapMetric` 型別聯集——把一個只被當型別用的
`const` 留在檔案裡，會讓下一個人以為它還有行為。
The treemap is now **one chart per metric**, matching the line chart. It previously had no
metric parameter: a single chart cut each faction into troops / gold / characters, so every
cell was answering three questions at once and answered none of them well. `FactionTreemap`
now takes a `metric` and answers exactly one question, with each metric normalised against
its own base (`maxOfThis`) so every chart shows that metric's own distribution.
`TREEMAP_SEGMENT_KEYS` used to have one *value* consumer — the segment legend — and once the
subdivision and its legend were removed only the type use remained, so it became a
`TreemapMetric` union. Leaving a `const` that is only used as a type invites the next reader
to think it still does something.

**面板寬度在 md 檔收窄**（`w-[20rem] md:w-[24rem]`，Oct 2026）：512px 的地圖欄上 384px 的面板
蓋掉 75%，平板帶先收窄。`max-w-[80vw]` 保留。
**The side panel narrows at md** (`w-[20rem] md:w-[24rem]`, Oct 2026): on a 512px map column a 384px
panel covered 75% of it, so the tablet band gets the narrower width first. `max-w-[80vw]` stays.

**地點列表加上搜尋、擁有權過濾，以及「無窮載入」。** 世界可以到 2000 個地點，而這個面板
只有 24rem 寬，一次建立所有列等於每次開分頁都重建整個列表。所以只畫
`CONFIG.PLACE_LIST_PAGE_SIZE`（100）列，捲到接近底部再載入下一頁。
**改變過濾條件時必須重設已顯示筆數**，否則那個數字會指向另一個集合的尾端，畫面看起來
就像「沒反應」。
The place list gained search, an ownership filter and incremental loading. The world can hold
2000 places and this panel is only 24rem wide, so building every row means rebuilding the
whole list each time the tab opens. Only `CONFIG.PLACE_LIST_PAGE_SIZE` (100) rows render,
with the next page revealed on scroll. **The revealed count has to reset when the filter
changes**, or it points into the tail of a different set and the list looks unresponsive.

**`CONFIG` 是 `as const`，所以頁數要用 `useState<number>(...)`。** 否則 state 會被推成字面值
`100`，setter 只接受回傳 `100`，第一次「再載入 100 筆」就編譯不過。這和自動播放速度 slider
是同一個坑。
`CONFIG` is `as const`, so the row count must be `useState<number>(...)`. Otherwise the state
infers the literal `100` and the setter cannot return a larger number, so the very first
"load 100 more" fails to compile — the same trap as the autoplay-speed slider.

**面板寬度改動會連帶影響相機控制的偏移。** `GM_HUD_CONTROLS_OPEN` 的 `md:right-[31rem]`
是由「面板 24rem + 頁籤 rail 與間距約 7rem」推出來的，不是拍腦袋的數字（Oct 2026 從 `lg` 提前到
`md`，平板帶 768-1023 不再被面板蓋住控制列）。面板寬度一改就必須重算，否則 reset／縮小／
滑桿會被面板蓋住。
The camera-control offset follows the panel width. `md:right-[31rem]` is derived from 24rem of
panel plus roughly 7rem of rail and gutter — it is not a guess (Oct 2026: moved from `lg` to `md` so the
768-1023px tablet band no longer hides the controls under the panel). Change the panel width and it
must be recomputed, or reset/zoom-out/the slider end up underneath the panel.

### 生育與王位繼承 / Childbirth & throne inheritance

年齡落在 `CHILD_PARENT_AGE_MIN..CHILD_PARENT_AGE_MAX` 的存活將領，每回合有
`CHILD_BIRTH_CHANCE` 的機率生下一名子女。子女一出生就是 `CHILD_START_AGE`（已成年），
且直接加入父間的勝力與所在地——否則一名初生在無主之地的將領沒有地、沒有收入，等於生成了
一個不存在的角色。父子／父女立即成為朋友（寫正的 `aId < bId` 約定）。
A living leader aged within `CHILD_PARENT_AGE_MIN..CHILD_PARENT_AGE_MAX` has a
`CHILD_BIRTH_CHANCE` per-round chance of a child. The child is born already mature at
`CHILD_START_AGE` and joins the father's faction **and his place** — a newborn dropped on
unowned land would never hold a place, never earn income, and so would be a character that
effectively does not exist. Father and child become friends immediately.

**同姓不同名需要一個姓的維度，而不是直接拼字。** 公司不同的名字結構就不同：
classic 是 `[姓][名]`，姓就是第一個字；稱號風格是 `[稱號]·[外來名]`，姓相当於
`·` 之前的部分。`surnameOf()` 分別處理這兩種，`generateChildName()` 沿用父姓、重抽名，
并在命名空間耗尽時回傳 `null`（不影響其他父亲）。
**The same surname needs a surname dimension, not string concatenation.** The two name styles
are structurally different: classic is `surname + given`, epithet is `epithet·foreign` where the
part before `·` plays the surname's role. `surnameOf()` tells them apart and
`generateChildName()` keeps the father's surname, redraws the given name, and returns `null` when
the name space is exhausted rather than colliding or blocking other fathers.

**部分子不能綟父姓——那屬於邊個人。** `Character.parentId` 只存一個欄位，
子女數直接數 `offspring` 關係，**不做冗餘計數欄位**（两份數据只會不一致）。
**A child cannot inherit the father's surname and name — that would be a different person.**
`Character.parentId` is the only new column; the child count is counted through the `offspring`
relation, never denormalised into a counter that could disagree with it.

**王位繼承：有子女由最年長的紙承，沒有子女才走原本的崩解。**
按 `age desc` 取得就是長子，因為早下的子女一款就大一款年。
**「沒有子女就走原本行為」是刻意的：繼承只律增加一條路徑。
Ordering by age gives the first-born. "No children keeps the original behaviour" is deliberate:
inheritance only **adds** a path, so it cannot quietly swallow the collapse rule when no heir exists.

**戰死也走同一條繼承路**（Oct 2026）：以前只有自然死亡觸發繼承／崩解——君王戰死時
`faction.kingId` 永遠指向屍體，勢力永不崩解。現在 `server/afterDeath.ts` 的
`processDeadLeaders` 由 `battle.ts`（收尾一次）與 `ageAndDeath.ts` **共用**：君王死亡 →
最年長子女繼位或勢力崩解；**行政官席位清空**也是同一個善後（以前死人佔著席位領分成）。
席位清空**不蓋冷卻錨點**——死亡不是任何人的主動操作，蓋了會讓該地 10 回合請不到
行政官。不畫 RNG，戰鬥的亂數序列不變。
**Battle deaths take the same succession path** (Oct 2026): only natural death used to trigger
succession/collapse — a battle-dead king left `faction.kingId` on a corpse forever. `processDeadLeaders`
(`server/afterDeath.ts`) is shared by `battle.ts` (once, at the end of the phase) and `ageAndDeath.ts`:
king death → oldest child inherits or the faction collapses; **dead administrators' seats are cleared**
by the same aftermath (a corpse used to hold the seat and keep collecting its share). The seat clearing
stamps **no cooldown** — a death is nobody's deliberate act, and stamping would freeze the place out of
the assignment phase for 10 rounds. No RNG draws, so the battle phase's random sequence is unchanged.

**生育必須跑在老化舍死的後面。** 若先生子下了回合、父亲亡名事发在此刻，
那个子女出生的瞬間就成為君玉，「生育」变成存欽術。
**Childbirth must run AFTER age and death.** A child conceived in the same round must not
inherit from a parent who just died, or childbirth becomes a resurrection spell.

**事件**：`CHILD_BORN`（填在 character 類別）與 `KING_INHERITED`（faction 類別），
兩者都在 `EventLog.tsx` 的 `EVENT_CATEGORY` 與 `icons.tsx` 的 glyph switch 登記，否則會静默落到預記點。
`CHILD_BORN` (category `character`) and `KING_INHERITED` (category `faction`) are registered in
`EVENT_CATEGORY` and given glyphs, or they would silently fall through to the default dot.
