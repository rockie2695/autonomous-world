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

- **It is a density field, not a Voronoi partition.** An earlier version assigned each grid cell to
  the nearest place. That was wrong twice over: it rendered as visible cell steps, and it drew a
  border between two *adjacent places of the same faction* — the exact artefact that made it look
  like pixel art rather than Stellaris. Instead each place projects a smooth falloff
  (`falloff`, squared so both the value and its slope reach zero at the rim, keeping the boundary
  C1-continuous) and a faction's claims combine with `1 - Π(1 - wᵢ)` — a **probabilistic OR**.
  A plain sum would let a sprawling faction accumulate density forever and inflate across the map;
  OR saturates at 1, so a faction can only win where it genuinely holds nearby ground. Because the
  field is smooth, a cell's border is where two fields are *equal*, which is what makes distance
  decide the border and same-faction places fuse with no internal seam.
- **Unowned land claims nothing and is never painted.** `TerritorySite.faction` is `string | null`,
  and `null` means "present on the map but claims no territory". Those places still count toward
  `meanNeighbourDistance()` — the claim radius has to match the density of the whole map — but the
  field skips them entirely. Painting unowned land as one giant grey faction was the second
  mistake: it buried the map under a slab, when CK3's map modes leave unclaimed land untouched.
- **`src/lib/territory.ts` is pure logic** — `buildTerritoryField()` returns a per-cell faction index
  plus the covered extent; `nearestSite()` answers hover/click in one scan (deliberately *not* a
  grid: one mousemove is one query, and scanning 2000 places is cheaper than maintaining a grid);
  `factionRegions()` returns per-faction centroids for the labels; `neighbourMask()` reports which
  of a cell's four sides border a different owner. No DOM, so `territory.test.ts` runs under `node`.
- **The field is built during render**, in a `useMemo` over `places`, not inside the effect and
  pushed into state — `Place` already carries `layoutX`/`layoutY`, and setting state synchronously
  in an effect trips the cascading-render lint rule.
- **The claim radius is relative**, `TERRITORY_BLOB_RADIUS × meanNeighbourDistance()`. A fixed
  world-coordinate radius smears everything into one blob when places are dense and vanishes when
  they are sparse.
- **The rim is drawn per side.** `neighbourMask()` returns a bitmask and only that side's row of
  pixels is lightened, so the border is a hairline. Lighting whole boundary cells instead produces a
  thick white band, and painting a shared seam leaves a two-pixel double line.
- The bitmap is painted **once per data change** into an offscreen canvas and repainted only when
  the hovered *faction* changes — never per frame. `imageSmoothing` stays **on**: the field already
  computes the border as a curve, so smoothing only removes the last of the cell stepping.
- **The territory canvas sits *under* sigma**, so `draw()` sets `container.style.pointerEvents =
  'none'` while the layer is active. That also deafens Sigma's own wheel/drag handlers, so the layer
  drives the camera itself (`onWheel` zooms about the cursor, `onDrag` pans) — otherwise the
  zoomed-out view could not be zoomed at all. Cleanup must restore `pointerEvents` or sigma loses
  pointer events for good.
- Faction names are **DOM**, not canvas: they inherit the app's fonts and i18n for free, and are
  positioned per frame by writing a `transform` (never React state). Regions smaller than
  `TERRITORY_MIN_LABEL_CELLS`, and unowned land, are left unlabelled.
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
- The hover preview panel is itself `pointer-events-none` (it must be, or entering it fires the row's
  `mouseleave` and the panel flickers itself away), so the tooltip is reachable in the **detail
  modal** but not in the transient table preview

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
