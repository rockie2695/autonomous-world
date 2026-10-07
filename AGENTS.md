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
    ├── gameConfig.ts      # All tunable game values
    ├── rng.ts             # Seeded RNG
    ├── snapshot.ts        # Snapshot compression
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
                           # - TWO overlay <canvas> layers (both pointer-events-none),
                           #   stacked under the sigma container so WebGL paints the
                           #   node discs and labels on top:
                           #     1. glow/shadow (bottom): offset drop shadow then a
                           #        faction-colored radial glow per node. Sprites are
                           #        cached per colour and blitted with drawImage, and
                           #        it redraws on sigma's `afterRender` + `resize` —
                           #        no rAF, so an idle map costs nothing.
                           #     2. spotlight/move (top): pulsing rings (cyan=created,
                           #        red=attacked) + faction-colored travel dot for the
                           #        displayed round's moves; this is the only rAF loop.
                           #   NOTE: canvas is a replaced element — keep `w-full h-full`
                           #   (inset-0 alone leaves it at intrinsic 300×150).
                           # - Camera: clicking a node animates the view to centre it;
                           #   resetView animates to fit the whole graph (getBBox), not
                           #   ratio 1. Duration is CONFIG.MAP_CAMERA_ANIM_MS, or 0 when
                           #   prefers-reduced-motion is set.
├── LeaderAvatar.tsx        # Procedural leader head bust, seeded from character.id; pure trait logic in deriveAvatarTraits()
├── BattleFleet.tsx         # Ships trading fire along contested roads (Canvas 2D, game page). Pure derivation in lib/battleFleet.ts
├── SpaceFlow.tsx           # Flow-field space dust behind the map. Pure field logic in lib/spaceFlow.ts; every colour in gameConfig
└── home/                   # Homepage sections (three.js scenes, live poller, hooks)
                            #   FleetScene.tsx renders the same fleet over the 3D graph
                            #   (the event log and charts live in src/app/game/)

src/app/game/ is split into focused modules — page.tsx is the orchestrator, and
everything it delegates to lives in a sibling file:
├── page.tsx                # Orchestrator: GamePage, map HUD, RoundTimeline, MapSidePanel, CharacterList, PlaceDetail, ZoomSlider
├── types.ts                # Shared types: WorldInfo, WorldState, GameEvent. Its own module so the components below can share them without an import cycle
├── icons.tsx               # Ic, Crown, EventGlyph — one copy, shared by the page, the event log and the charts
├── styles.ts               # The `GM_*` surface strings (GM_PANEL, GM_BTN, GM_SKEL…). Shared because the page, the event log, the charts and the leader modal all render the same surfaces
├── EventLog.tsx            # Bilingual event log (i18n t() with parameter substitution) + the faction / category / info-kind filters; header shows the displayed round zero-padded to 4 digits (`RND 0001` style)
├── stats-charts.tsx        # Stats panel: 9 time-series charts in 4 switchable styles, the faction-power treemap, the character radar, and the shared ChartTooltip / ChartLegend. See "Stats Charts" below.
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
  4. On replacement: old admin's ambition **increases** by `CONFIG.AMBITION_ADMIN_REPLACED_DELTA` (1, clamped to `CHAR_AMBITION_MAX`), logged as an `ADMIN_REMOVED` Event **and** an `AmbitionEvent`
- `Place.administratorId` is globally unique (`@unique`) — a character administers at most one place

### Administrator Assignment, Ambition & Cooldown

All four admin-changing paths go through `server/adminAssign.ts` (`grantAdmin` / `revokeAdmin` / `isAdminChangeCoolingDown`) so the rules live in one place. **Never write `Place.administratorId` directly** — go through the helpers.

- **Grant** (`grantAdmin`, every path): sets `administratorId` + `Place.adminChangedRound = round`, `lastPromotedRound = round`, and applies a **temporary** `-CONFIG.AMBITION_ADMIN_ASSIGNED_DELTA` (1, clamped to `CHAR_AMBITION_MIN`) with an `AmbitionEvent`. The reduction auto-reverts **+1** at `round + CONFIG.AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS` (10) in phase 7 (logged as an `AMBITION_RECOVERED` Event)
  - If the character already has a pending reduction (continuous service, e.g. a seat transfer) the expiry is **extended only** — never deducted twice
  - If the clamped delta is 0 (already at the floor) nothing is deducted and **no revert is scheduled** (otherwise the revert would credit +1 for free)
- **Revoke** (`revokeAdmin`): `+CONFIG.AMBITION_ADMIN_REPLACED_DELTA` (clamped to `CHAR_AMBITION_MAX`) + `AmbitionEvent`, and **clears** `adminAmbitionRevertRound` — removal already paid the +1, so a later revert would double-count (hence "skip revert if removed")
- **Paths**: `spawnCharacters.ts` (phase 2, cooldown-gated) · `assignAdmins.ts` (phase 12, cooldown-gated) · `battle.ts` capture sites (phase 10, **not** gated — captures still apply) · `POST /api/admin/assign-admin` (manual, **not** gated)
- **Cooldown** (`CONFIG.ADMIN_CHANGE_COOLDOWN_ROUNDS` = 10): any administrator change (assign, revoke, or the seat-clearing in `grantAdmin`) stamps `Place.adminChangedRound`. While `round - adminChangedRound < 10` the **AI paths only** (phase 2 assignment, phase 12 `assignAdmins`) skip that place. `assignAdmins` filters in its `where` clause (`adminChangedRound: null` OR `<= round - 10`); `spawnCharacters` uses `isAdminChangeCoolingDown()`
- **The manual API revokes the outgoing admin** before granting (ambition +1 + `ADMIN_REMOVED` Event) and clears the incoming character's seat elsewhere for the unique constraint
- Every ambition delta is written to both the `AmbitionEvent` ledger and the visible Event `data.ambitionDelta` (rendered by `formatEvent` in `game/page.tsx` via `events.ambitionDelta`)

### Map Spotlight & Move Animation

- `GET /api/world/state?round=N` returns `spotlights: Array<{placeId, kind: 'created'|'attacked'}>` and `moves: Array<{fromPlaceId, toPlaceId, factionId}>` (computed from the events table; works for both snapshot and live paths)
- Spotlight window: rounds `N - CONFIG.SPOTLIGHT_ROUNDS + 1 .. N` (with `SPOTLIGHT_ROUNDS: 1` → only round `N`) over `PLACE_CREATED` (kind `created`) and `PLACE_CAPTURED`/`BATTLE_DEATH`/`ESCAPE_SUCCESS` (kind `attacked`; `created` wins ties)
- `moves` includes only `CHARACTER_MOVED` events with `round === N` (the displayed round exactly)
- `CHARACTER_MOVED` events are written by `server/moveEvent.ts#recordMove()` from all four `aiMove.ts` movement sites and the three `battle.ts` escape sites; no-op when `fromPlaceId === toPlaceId`
- Animation timing lives in `gameConfig.ts`: `SPOTLIGHT_ROUNDS: 1`, `MOVE_ANIM_DURATION: 1500`, `MOVE_ANIM_PAUSE: 2500`
- The spotlight layer is the map's **only** rAF loop and it obeys the animation rules: it pauses when the canvas leaves the viewport (`IntersectionObserver`) and when `document.hidden`, and under `prefers-reduced-motion` it renders a single static frame (`STATIC_FRAME_MS`) with no loop at all. It listens for a mid-session `matchMedia` change too. Keep the gate in `isAnimating()` and keep the initial `resize()` call **after** `isAnimating`/`renderFrame` are declared (an earlier call hits the temporal dead zone)
- **Z-order**: the two overlay `<canvas>` elements paint first (below, glow then spotlight), the sigma container div paints last (above) — so place labels always render on top of both. Keep that DOM order.
- **Label visibility**: labels are a **pure zoom rule** — they show only while `camera.ratio <= CONFIG.LABEL_ZOOM_RATIO` (0.6), regardless of garrison. `nodeReducer` sets `label = null` when zoomed out and `labelRenderedSizeThreshold` is pinned to `0`. Do **not** reintroduce `labelRenderedSizeThreshold`: it compares on-screen node **size**, so garrisoned places kept their names when zoomed out, and the camera ratio cancels out of that comparison, so it was never a zoom threshold. The camera's `updated` event (bound via `sigma.getCamera().on`, since sigma does not re-emit it) refreshes on each crossing. Tune `LABEL_ZOOM_RATIO` in `gameConfig.ts`, not inline.
- **One exception to the zoom rule**: the hovered node, the selected node, and the hovered node's graph neighbours always keep their label, so you can read a place and what it links to while zoomed out. `forceLabel` alone is **not** enough — it only bypasses `labelRenderedSizeThreshold`, so a `null` label has already left Sigma's label index and nothing can draw it. The gate must therefore read `if (!labelsVisibleRef.current && !isActive) res.label = null`, never null an active node.
- `GET /api/world/events?round=N` applies read-time enrichment to `CHARACTER_MOVED`: adds `fromPlaceName`/`toPlaceName` by joining `places` (events themselves store only placeIds)
- **Every character-bearing event carries `charId`**, so a log row links the leader by id. `CHARACTER_SPAWNED` is the one that had to be added (`created.id` in `spawnCharacters.ts`); the other sites already had it. Because the events table predates the column, the route also **backfills at read time**: rows whose `charId` is null but whose `charName` is set are matched against `characters` for that world, preferring `alive` first. The client then calls `leaderNode(charId, charName)` and prefers the id, falling back to the name — and prefers no action over opening the wrong leader.

### Map HUD, Side Panel & Round Playback

- The 將領 / 事件 / 統計 tabs are **absolutely positioned over the map's right edge** (`MapSidePanel`, `z-[8]`), not a layout column — the map keeps the full width. The vertical tab rail is always visible; only the 19rem content panel collapses (its own ✕), and content enters and exits with a right-to-left fade (`AnimatePresence`, `x: 28`)
- **Nothing is a layout column any more.** 選擇回合 (`RoundTimeline`, `GM_TIMELINE`) is absolutely positioned over the map's **left** edge (`absolute left-12 top-12 z-[7] w-60 hidden md:block`), and 勢力排行 (`FactionRanking`) moved into the **統計** tab above the charts. Both used to be a left sidebar; a sidebar column is what forced the map to share width with chrome. The mobile overlay drawer is unaffected — it still stacks timeline, leader list and event log
- `GM_HUD_CONTROLS_OPEN` shifts the zoom controls left by `26rem` so they clear the open panel, and **only from `lg` up** — a fixed offset would push them off-screen on narrow viewports, so narrow keeps `right-4`
- The **zoom slider** sits between the zoom-out and zoom-in buttons and scrubs the camera ratio directly (`setState`, no animation, so the handle tracks the pointer; Sigma still owns the real ratio). `MapCameraControls` carries `getZoom` / `setZoom` / `onZoomChange`; `ZoomSlider` subscribes in an effect and unsubscribes in its cleanup. Bounds: `MAP_ZOOM_MIN_RATIO: 0.05`, `MAP_ZOOM_MAX_RATIO: 8`
- Controls are held in **both a ref and state**: `onControlsReady` sets `mapControlsRef` (imperative calls) *and* `mapControls` state (rendering). Reading `ref.current` during render is a lint error ("Cannot access refs during render")
- The header renders `TelemetryStrip inline`, merging 世界概況 into the header row and handing the height back to the map
- **Autoplay floor is 5s**: `AUTOPLAY_MIN_MS: 5000`, `AUTOPLAY_MAX_MS: 15000`, `AUTOPLAY_DEFAULT_MS: 5000`. `CONFIG` is `as const`, so the slider state must be `useState<number>(CONFIG.AUTOPLAY_DEFAULT_MS)` or it pins to the literal and rejects every other speed
- **Loading skeletons** all use `GM_SKEL`: `MapSidePanel` shows `PanelSkeleton` while world state is pending, `EventLog` renders skeleton rows during its own fetch, and `StatsCharts` derives `statsPending = currentRound >= 1 && !data && !fetchFailed` so an unanswered request reads as *loading* rather than `game.noData`. `StatsCharts` fetches with a manual `useEffect`, not `useQuery`, so it has no `isLoading` to read

### Event Log Filters (`src/app/game/EventLog.tsx`)

Three independent filters compose by AND; the header reports how many of the round's
events survived, and says so when all of them were filtered out.

- **Faction** — a `<select>` (`#gm-evt-faction`) plus 全部. `factionOfEvent()` resolves an event's faction through **`charId` first, then `placeId`**. `charId` is the reliable link (every character-bearing event carries it, backfilled at read time — see above), so a `CHARACTER_MOVED` row filters under the mover's faction rather than the destination's
- **Category** — six multi-select chips, each an `aria-pressed` toggle. `EVENT_CATEGORY` maps an event `type` to one of `battle` / `character` / `economy` / `faction` / `admin` / `other`, and `EVENT_CATEGORIES` is the chip order. Chips are multi-select, not radio: any subset stays active
- **Info kind** — 人物 / 地點 / 其他 toggles, derived by `eventInfoOf()` from what the event's `data` carries. This is not a display filter: it decides whether a name renders as a clickable button (`onFocusPlace` / `onOpenLeaderDetail`) or as plain text, which is what makes names in the log navigable
- Filtering is derived (`filterKey` + `useMemo`), never applied by mutating the fetched list, so toggling filters back off restores the full set for free
- Rows are paged at `CONFIG.EVENT_LOG_PAGE_SIZE` (60); the total can reach tens of thousands

### Map Glow, Shadow & Camera

- The glow layer is **decoration, not animation**: it redraws on sigma's `afterRender` and `resize` only, so an idle map costs nothing. Do not add an rAF loop to it — the spotlight layer is the only rAF loop on the map
- Node colours come from the graph (runtime faction data, converted to hex by `hslToHex`); the **shadow colour comes from the `--color-ds-void` design token**, read once per redraw via `getComputedStyle`. Never hardcode a colour here — inline styles are for runtime data only
- Glow strength scales with the node's on-screen radius between `MAP_GLOW_MIN_ALPHA` and `MAP_GLOW_ALPHA`, so big places read as lit and small ones do not haze the map into fog. Nodes below `MAP_GLOW_MIN_RADIUS_PX` are skipped, as are nodes outside the viewport (`viewportToGraph` bounds)
- Sprites are cached per `color|alpha` and blitted with `drawImage`; a per-frame `createRadialGradient` per node would be far too slow at `PLACE_MAX_COUNT` (2000)
- Glow/shadow geometry and camera timing live in `gameConfig.ts`: `MAP_GLOW_*`, `MAP_SHADOW_*`, `MAP_CAMERA_ANIM_MS`, `MAP_FOCUS_ZOOM`, `MAP_FIT_PADDING`
- **Camera coordinates are FRAMED, not raw.** Sigma's `createNormalizationFunction` maps the whole graph into a unit square centred on `(0.5, 0.5)` whose larger axis is exactly `1`, and the camera operates in that space. `graph.getNodeAttributes()` returns **raw** pre-normalisation coordinates and `sigma.getBBox()` returns the **raw** extent — feeding either to `camera.animate()` parks the camera outside the world and renders a blank map. Use `sigma.getNodeDisplayData(node)` for anything the camera consumes
- Because the framed world is a unit square, "fit everything" is the **constant** centre `(0.5, 0.5)` + ratio `1` — independent of world size, node count, and viewport aspect (verified across 936×766, 500×900, 1600×400, 400×1200, 1200×1200). `MAP_FIT_PADDING` adds margin; `MAP_FOCUS_ZOOM` (<1) is a multiplier on that same baseline for `focusNode`, so the two views stay consistent. `resetView` uses this, **not** `animatedReset()`/`sigma.getBBox()`
- The map's inner vignette is a design token, not a bespoke class: `--shadow-ds-map-vignette` in `@theme static` (globals.css), applied as `shadow-ds-map-vignette`
- Camera animations run through `reducedMotionRef` (populated from `useReducedMotion`), giving `duration: 0`. It is a ref, not a direct closure, because the effect that builds the Sigma instance has an empty dependency array
- `extract-` note: `readDesignToken` is the only sanctioned way for a canvas layer in this component to obtain a design value

### Map Territory View (the zoom-out area map)

Zoomed out past `TERRITORY_ZOOM_RATIO`, each place projects a **claim** and the map marks the area
those claims cover — the CK3 map-mode / Stellaris galaxy-map idea. The territory is a *translucent
tint over the map*, not a replacement for it: the graph, roads and glow stay fully opaque, so you
read territory and topography at the same time.

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
  the labels; `neighbourMask()` reports which of a cell's four sides border a different owner.
  No DOM, so `territory.test.ts` runs under `node`. The same split is used by the two newer
  ambient layers: `battleFleet.ts` and `spaceFlow.ts` are pure and tested under `node`, with
  their renderers (`BattleFleet.tsx` / `SpaceFlow.tsx`) doing nothing but drawing.
- **The field is built during render**, in a `useMemo` over `places`, not inside the effect and
  pushed into state — `Place` already carries `layoutX`/`layoutY`, and setting state synchronously
  in an effect trips the cascading-render lint rule.
- **The claim radius is relative**, `TERRITORY_BLOB_RADIUS × meanNeighbourDistance()`. A fixed
  world-coordinate radius smears everything into one blob when places are dense and vanishes when
  they are sparse.
- **The rim is drawn on the cell's _own_ pixel**, not per side. The first version wrote rim
  bytes into the *neighbour's* pixel (`at ± 4`), but the paint loop then visited that neighbour
  and overwrote it with the body colour — so most of the rim was erased and only broken fragments
  survived, which read as "the edge isn't clear". A second pass cannot fix it either:
  `putImageData` replaces pixels rather than compositing, so it would wipe the fill. Because each
  cell writes only itself, two neighbouring factions each light their own side and the boundary
  reads as one continuous line. `neighbourMask()` still decides *whether* a cell is a border cell;
  `TERRITORY_RIM_LIGHT` sets contrast, and since the rim costs one cell of thickness, raising it
  changes brightness, not width.
- The bitmap is painted **once per data change** into an offscreen canvas and repainted only when
  the hovered *faction* changes — never per frame. `imageSmoothing` stays **on**: the field already
  computes the border as a curve, so smoothing only removes the last of the cell stepping.
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
  during a drag: the glow and spotlight layers repaint and the territory canvas stays
  byte-identical, so it becomes a frozen translucent underlay with the map sliding beneath it —
  which reads as the map jumping from one place to another. Calling `draw()` on each mousemove is
  wrong for the opposite reason (several mousemoves can land in one frame). The fix is
  `scheduleOverlay()`: coalesce into one `requestAnimationFrame` that repaints with the **final**
  camera state, so territory, glow, spotlight and graph all land in the same frame. Cleanup must
  `cancelAnimationFrame` the pending frame, or an effect re-run paints a detached canvas.
- **Do not measure camera movement by the territory bitmap's centroid.** It biases hard: the blob is
  small and clips at the canvas edge, so a 300px drag reported 150px — and the *glow* layer reported
  the identical 150px, which is the tell. Two layers agreeing exactly means the layers are in sync
  and the instrument is wrong. Measure a layer, and compare two: equal ratios mean sync.
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

### Battle Fleet (`src/lib/battleFleet.ts` + two renderers)

Ships are **derived from ownership, not pushed as events.** A road whose two ends belong to rival
factions *is* a front line. The two pages have very different data — the game page has
`CHARACTER_MOVED`, the home page only recent events from `/api/public/world` — so an event pipeline
would be needed to make them agree. This rule is derivable from both, and it is world state itself:
a faction dies or loses land, the front lines move that instant, with no need to wait for the next
round.

- `battleFleet.ts` is **pure, no DOM**, so it runs under `node`. Same-faction roads and roads with an
  unowned end are internal or non-combatant. Coincident endpoints are skipped, since a zero-length
  segment has no defined normal. Cap the simultaneous fronts by the smaller garrison of the two ends.
- Two renderers over the same fronts: `BattleFleet.tsx` (Canvas 2D, game page) and
  `home/FleetScene.tsx` (three.js orthographic, home page — depth affects **size and brightness
  only**, never position, or the engagement looks scrambled).
- **Initial phases are hashed from the front's `key`, never `Math.random()`.** Random phases reshuffle
  on every React remount and the whole fleet visibly jumps — the exact class of bug the map drag fix
  just eliminated. Both files have a test for determinism.

### Space Dust (`src/lib/spaceFlow.ts` + `src/components/SpaceFlow.tsx`)

A flow field: particles move along a **3D Simplex noise field**, so ribbons, vortices and voids emerge
— random but structured. What makes it work is the field's **continuity**: nearby positions return
similar angles, so particles flow along one shared field instead of scattering.

- **The noise comes from `three`, not a new dependency.** `three/examples/jsm/math/SimplexNoise` is
  the same algorithm and is already installed.
- **The seed must be a real PRNG, never a constant.** `createNoise3D(rand)` calls `rand` a couple of
  hundred times to build its permutation table; `() => 0.5` makes every gradient index identical and
  collapses the field into a smooth ramp, losing the one thing the technique is for. Use the project's
  `createRng()`.
- **Hue follows the field, read from the noise at the particle's position.** Per-particle hues put
  every colour inside one ribbon and no structure shows. The hue samples at a *finer* spatial scale
  than the flow (so bands layer inside a ribbon) and drifts *slower* (so colour does not churn with
  the motion). A respawn carries the old `size` but deliberately **not** the old hue — carrying it
  would decouple colour from position.
- **No translucent trail fill.** The sample's per-frame `fillRect('rgba(...)')` needs an *opaque*
  backdrop to fade against; this page's base is a gradient plus two nebula washes, so accumulating
  translucent fills smears it and never fully clears. Particles fade individually.
- **`lighter` blending is not used.** Additive overlap makes crossings glow, but the map underneath is
  already light and that eats the roads' contrast.
- **Every colour is in `gameConfig.ts`** (`SPACE_FLOW_HUE_MIN/MAX`, `SATURATION`, `LIGHTNESS`,
  `MAX_ALPHA`, `HUE_STEPS`, and an optional `SPACE_FLOW_COLORS` list of `r,g,b` or `#rrggbb` for
  exact colours). The component hard-codes none. To go brighter, raise `LIGHTNESS` or `MAX_ALPHA`
  before `SATURATION` — the map already carries faction colour.
- Hue is **quantised**, so the layer needs only `HUE_STEPS` pre-built fill strings and a frame
  allocates nothing.
- The dust must paint **before** sigma: DOM order is paint order, and sigma's container carries an
  opaque backdrop, which would hide the dust entirely. `SigmaMap`'s own wrapper therefore has **no**
  background — `bg-ds-space` (two `@theme static` tokens, not a bespoke `.space-bg` class) provides it.
- Opacities are written straight to the DOM rather than through React state — a per-frame
  `setState` would re-render the whole map.
- The graph→viewport mapping assumes **camera angle 0** (both camera animations pass `angle: 0`).

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
  `CHAR_AMBITION_MAX`, `CHAR_MAX_AGE_MAX` — age tops out far above the ability stats), so
  edge lengths are **not comparable across axes**. Read the shape, not the absolute numbers.
- Axis labels reuse the existing `character.*` i18n keys; do not add radar-specific ones.

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

### Initial Game State

The seed script (`prisma/seed.ts`) creates:
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

*This guide is for AI agents working on the Autonomous World project. For human developers, see README.md.*

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
