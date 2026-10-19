# Autonomous World 🌐

> An infinitely running autonomous simulation. No victory conditions, only eternal evolution.

[中文版](README.zh-TW.md)

## Overview

Autonomous World is a browser-based simulation game where hundreds of AI characters build factions, conquer territories, form alliances, and betray each other on a dynamic map. The world runs autonomously with no end state — only perpetual evolution.

**Key Features:**
- 🌐 **Fully Autonomous** — The world evolves without human intervention
- ⚡ **Real-time Simulation** — Each round calculates all events automatically
- ♾️ **Infinite World** — No endpoint, only continuous change
- 🎯 **Purely Observational** — Watch and analyze, no player actions needed

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Authentication | Auth.js v5 (next-auth) + Google Provider + argon2id email/password |
| Database | PostgreSQL + Prisma 7 |
| Map Visualization | Sigma.js + graphology + forceatlas2 |
| UI | TailwindCSS 4 |
| Data Fetching | TanStack Query (React Query) |
| Validation | Zod |
| React Optimization | React Compiler |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Google OAuth credentials

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd autonomous-world

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Run database migrations
npx prisma migrate dev

# Seed initial game data
npx tsx prisma/seed.ts

# Start development server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `AUTH_SECRET` | ✅ | NextAuth.js session secret |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth Client Secret |
| `ADMIN_EMAIL` | ✅ | Email(s) of admin users (comma-separated) |

## Project Structure

```
autonomous-world/
├── prisma/
│   ├── schema.prisma              # Database schema (Prisma 7 format)
│   ├── seed.ts                    # Initial game data seed script (with ForceAtlas2 layout)
│   └── migrations/                # Database migrations
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/ # Auth.js route handler
│   │   │   ├── world/             # World data API endpoints
│   │   │   │   ├── current/       # GET /api/world/current
│   │   │   │   ├── state/         # GET /api/world/state?round=N
│   │   │   │   ├── rounds/        # GET /api/world/rounds
│   │   │   │   ├── events/        # GET /api/world/events?round=N
│   │   │   │   └── stats/         # GET /api/world/stats?from=A&to=B
│   │   │   ├── public/            # Unauthenticated read-only (homepage only)
│   │   │   │   └── world/         # GET /api/public/world
│   │   │   └── admin/             # Admin-only API endpoints
│   │   │       ├── run-round/     # POST /api/admin/run-round
│   │   │       ├── reset-world/   # POST /api/admin/reset-world
│   │   │       └── assign-admin/  # POST /api/admin/assign-admin
│   │   ├── game/                  # Main game page — page.tsx orchestrates; EventLog.tsx,
│   │   │                          # stats-charts.tsx, leader-detail.tsx, types/icons/styles hold the rest
│   │   ├── layout.tsx             # Root layout (with QueryProvider)
│   │   ├── page.tsx               # Homepage
│   │   └── globals.css            # Global styles
│   └── lib/                       # Shared utilities (imported via @/*)
│       ├── auth.ts                # Auth.js v5 configuration & helpers
│       ├── prisma.ts              # Prisma client singleton (with PrismaPg adapter)
│       ├── api.ts                 # apiFetch helper (unified 401 → redirect home)
│       ├── queryClient.tsx        # TanStack Query provider
│       ├── validations.ts         # Zod validation schemas
│       ├── gameConfig.ts          # All tunable game values
│       ├── rng.ts                 # Seeded RNG (mulberry32)
│       ├── snapshot.ts            # Snapshot compression/decompression (gzip)
│       ├── territory.ts           # Territory force field (pure logic, no DOM)
│       ├── spaceGalaxy.ts         # Background galaxy: core, nebula, stars (pure logic)
│       ├── spaceFog.ts            # Seeded cloud layer over the map, faded by zoom (pure logic)
│       ├── spaceShared.ts         # Shared: sigma's framed→viewport placement + canvas colour helpers
│       ├── i18n/                  # Internationalization (zh/en)
│       │   ├── index.ts           # Locale management
│       │   ├── zh.ts              # Traditional Chinese translations
│       │   └── en.ts              # English translations
│       └── nameGenerator/         # Name generation utilities
│           ├── person.ts          # Character names (classic 張飛 / epithet 霜狼·蓋爾)
│           ├── place.ts           # Place names (classic 青碧城 / epithet 霜狼關)
│           ├── faction.ts         # Faction names (classic 蒼龍盟 / epithet 霜脊議會)
│           └── epithet.ts         # Shared two-character epithet components
├── src/components/
│   ├── SigmaMap.tsx               # Interactive graph map (Sigma.js + graphology)
│   ├── mapShared.ts               # SigmaMap's pure half: colour maths, shapes, MapCameraControls
│   ├── LeaderAvatar.tsx           # Procedural leader head bust (seeded from character.id)
│   ├── BattleReport.tsx           # Battle report popup (the attack/defence arithmetic)
│   ├── SpaceGalaxy.tsx            # Baked rotating galaxy, bottom layer (Canvas 2D)
│   ├── SpaceFog.tsx               # Warm seeded star-dust drifting slowly, over the galaxy and under the map (Canvas 2D)
│   ├── SpaceFlow.tsx              # Flow-field dust over the galaxy (Simplex noise, Canvas 2D)
│   └── home/                   # Homepage sections (three.js scenes, live poller, hooks)
│                                #   (the event log and charts live in src/app/game/)
├── server/
│   ├── runRound.ts                # Main game loop orchestrator (14 phases + layout + snapshot)
│   ├── battleReport.ts           # Pure battle-report builder (no DB, so it is testable)
│   ├── battle.eventOrder.test.ts  # Guards that PLACE_CAPTURED is written before grantAdmin
│   ├── adminAssign.ts             # grantAdmin/revokeAdmin — shared admin assignment rules (ambition + cooldown)
│   ├── graph/
│   │   └── layout.ts              # ForceAtlas2 layout calculation
│   └── phases/                    # Individual game phases
│       ├── spawnPlaces.ts         # Phase 1: Create new places (incremental layout)
│       ├── spawnCharacters.ts     # Phase 2: Spawn characters
│       ├── ageAndDeath.ts         # Phase 3: Age + death check
│       ├── economy.ts             # Phase 4: Income + recruitment
│       ├── signals.ts             # Phase 5: Signal progression
│       ├── relationships.ts       # Phase 6: Friendships/discontent
│       ├── defectionEvents.ts      # Phase 7: Ambition changes
│       ├── loyaltyCheck.ts        # Phase 8: Defection check
│       ├── aiMove.ts              # Phase 9: Character movement (signal + enemy targeting)
│       ├── battle.ts              # Phase 10: Battle resolution (with escape movement)
│       ├── build.ts               # Phase 11: Building upgrades
│       ├── assignAdmins.ts        # Phase 12: Auto-assign admins
│       ├── factionCollapse.ts     # Phase 13: Faction collapse
│       └── factionDeath.ts        # Phase 14: Faction elimination
├── prisma.config.ts               # Prisma 7 configuration
├── next.config.ts                 # Next.js configuration (React Compiler enabled)
├── tsconfig.json                  # TypeScript configuration
├── vitest.config.ts               # Vitest test configuration
└── package.json                   # Dependencies and scripts (build: prisma generate && next build)
```

## Game Rules

### Initial State
- **1 character** (king) starts the world
- **1 faction** with the king
- **100 places** with roads connecting them
- Characters, factions, and places grow over time through simulation

### World
- Single shared world, `active = true` marks the current world
- All players observe the same world
- No victory conditions — the game runs infinitely

### Characters
- Each character has: **Martial (wu)**, **Leadership (tong)**, **Economy (jing)**, **Speed**
- Stats range 5-30, with speed using normal distribution (μ=17, σ=5)
- Characters age each round and eventually die of old age (50-80 years)
- A newly spawned leader starts with **1 soldier** (`CHAR_START_TROOPS`), so a new general is never
  completely empty on arrival
- Characters only spawn at faction-controlled places (unowned places never generate generals), and a spawned general immediately joins that place's faction
- Characters spawned in a round never move in that round (they stay put until the next round)
- On spawn, the faction's king assigns the new leader as administrator of the spawn place: if the seat is vacant (or held by a dead admin) the new leader takes it directly; if the king himself holds it, he keeps it; otherwise they compare total ability (wu+tong+jing) and a strictly higher score wins the seat — the removed admin's ambition **increases** by `DEFECTION_ADMIN_REPLACED_DELTA` (1), logged as an `ADMIN_REMOVED` event + a `DefectionEvent`
- Every administrator assignment — spawn, auto-assign, battle capture, or manual API — writes a `DefectionEvent` of `DEFECTION_ADMIN_ASSIGNED_DELTA` (−1) to the ledger. It is **permanent**: the old temporary reduction and its automatic +1 revert are gone (`adminAmbitionRevertRound` was dropped, and `AMBITION_RECOVERED` was never emitted by anything)
- After any leader change, that place cannot change leader again for `ADMIN_CHANGE_COOLDOWN_ROUNDS` (10) rounds — but this blocks **AI paths only**: battle captures and manual assignment still work

### Factions
- Characters can belong to a faction (kingdom/nation)
- Each faction has a king, color, and set of territories
- When a king dies, the faction enters "collapsing" state and dissolves
- Only faction-controlled places can be assigned an administrator (auto-assign skips unowned places; the admin API returns 400 for them)
- The place popup shows who manages the place (administrator name, 👑 if the king), or "No Administrator"

### Map Visualization

The game features an interactive force-directed graph map using Sigma.js:

- **Nodes** = Places (colored by faction, sized by garrison + troops)
- **Edges** = Roads connecting places
- **ForceAtlas2** layout keeps connected places close together
- **Incremental layout** — new places spawn near their parent
- **HSL → Hex conversion** for faction colors (WebGL requires hex/rgb)
- Node size: `4 + log(totalTroops + 1) × 2` (logarithmic growth)
- **White border + black shadow on every place** — a star cloud and a near-black backdrop swallow a disc that has no edge, so each node gets a crisp `MAP_NODE_BORDER_WIDTH` ring and a soft dark halo (`MAP_NODE_SHADOW_SPREAD`). Both are painted on the existing overlay canvas, **outside** the disc, because the overlay sits behind sigma's WebGL canvas; that also means roads cross the ring where they meet a place, which reads as roads attaching. Sigma 3.0.3's ESM build has no node-border support, so this cannot be configured on the node program
- **White casing on every road**, same reason as the places: `MAP_ROAD_COLOR` is a deep blue
  (`#1e3a5f`) that barely survives on a near-black star cloud, so once the nodes had a border the
  roads became the only thing left invisible. The overlay sits behind sigma's canvas, so a slightly
  wider white stroke underneath shows on both sides while sigma's road paints over the middle — a
  casing, not a second road, and no second canvas (which would cover the place names)
- **Star systems scale with the camera.** Every `MAP_STAR_*_PX` is the size at the moment you enter
  star view; what gets drawn is multiplied by
  `clamp((MAP_STAR_ZOOM_RATIO / ratio) ^ MAP_STAR_ZOOM_SCALE_EXPONENT)` with a `0.5` exponent, which
  is sigma's own `size / sqrt(ratio)` — so a system reacts to zoom exactly the way a place node does.
  Anchoring on `MAP_STAR_ZOOM_RATIO` means the frame that crosses the threshold is exactly 1× and
  nothing pops on the way in. Across the star band (ratio 0.2 → 0.05) that is 1× → 2×. Planet counts,
  tilts and colours still come from the place id alone, so zooming never re-rolls a planet
- **Star systems past `MAP_STAR_ZOOM_RATIO` (0.2)** — zoom in and a place stops being a dot and reads as a system: a warm **sun** (sigma's own node disc, so roads never cut across it), 1–4 **planets** on tilted elliptical orbits, and **moons orbiting each planet from outside it**. Orbit lines carry the faction colour; unowned land uses `MAP_STAR_ORBIT_COLOR_UNOWNED`, because an unowned node's deliberately dimmed grey is invisible at partial alpha on black. Planets and moons derive from the place id alone, so a place always looks the same and nothing is stored. The place name is drawn **above** the system. The trade-off: at this zoom the garrison is no longer readable — the size is fixed on screen. Note this is ~95% of the zoom slider's travel, so a normal view has no systems at all
- **Every system is a different colour.** The sun draws one of six spectral classes
  (`MAP_STAR_SUN_CLASSES`, a `core`/`edge` pair) from the place id, so no two systems look alike.
  The class is picked **once, at graph-build time**, and stored on the node: the disc is painted
  by Sigma and the glow by the overlay, and one stored value is what keeps the two in step instead
  of two separate draws that happen to match. Planets within one system never share a colour
  (the palette is shuffled once, then taken in order), and each moon draws its own. Nothing is
  stored in the database.
- **The disc itself carries the class — that is what makes the colours readable.** The six `core`
  values used to be *all white* (0–37 from pure white; closest pair 7.2 apart in RGB), so the disc
  held no class information and every sun rendered as the same white dot, with the only variation in
  a 16px glow *behind* it. A star is identified by its **body**, not by the halo behind it, so it
  read as identical white suns wearing slightly different jackets. The cores now take the class hue
  (closest pair 56.6). The old "no deep red, no deep blue" rule survives as **"bright, not pale"**:
  the real conflict is with the faction-coloured **orbits**, and it is *darkness* that competes,
  not hue. Every core sits at luminance 152–255, the sun is an 11px disc and the orbits are thin
  rings, so the body glows and the faction colour stays on the rings. A test asserts the palette has
  colour (at least half the cores ≥ 50 units from white), that every pair is ≥ 55 apart, and that
  every core stays at luminance ≥ 140 — verified to fail on the old palette with
  `expected 0 to be greater than or equal to 3`
- Node labels follow one **pure zoom** rule: shown only while the camera ratio is at or below `LABEL_ZOOM_RATIO` (0.6), independent of garrison; labels always paint above the spotlight overlay. The hovered place, the selected place, and the hovered place's connected neighbours are the one exception — they keep their names at any zoom, so you can read what a place links to
- **A place's hover target includes its own name label.** Sigma draws the name to the right of the
  disc, so the cursor routinely rests on a name while that name and its neighbours' names are being
  force-shown. The hit box is measured from the real rendered text (same font, same label size as
  the renderer) rather than estimated from the character count, because CJK is ~1em per glyph and
  Latin ~0.55em, so a count-based estimate misses by an order of magnitude. Moving off both the disc
  and the name clears the place name, the linked names and the tooltip - the same effect as moving
  off the place. A name that is **not drawn** (zoomed out past `LABEL_ZOOM_RATIO`) is not a hit
  target either, so the cursor is never glued to a place with nothing on screen
- **Hovering a place names its people.** The tooltip ends with the place's **administrator**
  (`administratorId`), the **controlling faction's ruler** (`kingId`), and the **living leaders based
  here with their own troops**, sorted by troops and capped at `MAP_TOOLTIP_MAX_LEADERS` (4) with the
  remainder collapsed to "+N more". It used to print `👥 將領: 3`, which tells you three people are
  there but not who — and "who holds this place right now" is the whole reason to hover a node. The
  administrator and the ruler are **separate rows on purpose**: they are routinely different people,
  and one row would read as though place and faction share a single head. Both also appear in the
  leader list, flagged 👤/👑, rather than being excluded. The whole tooltip is localised — it used to
  be entirely hardcoded Chinese, and half-localising it reads as broken in English.
- **Hovering a faction's area answers "what holds it up"** — place count, **total troops**,
  **leader count** and the **ruler's name**. Troops use `garrison + leader troops`, the same basis
  as the place tooltip and the node size, so no two panels disagree about the same number; the
  leader count is by `factionId` rather than by where someone stands, which is what the faction
  ranking also uses. The ruler row is omitted when a faction has none rather than printed as "none".
- **The map never unmounts when the round changes.** The world-state query uses
  `placeholderData: keepPreviousData`, so switching rounds keeps the previous round on screen until
  the new one arrives. Without it the `queryKey` change set `worldState` to `undefined`, the
  page-wide `if ((isLoading || worldInfoPending) && !worldState)` skeleton fired, and `SigmaMap`
  went with it — rebuilding sigma, both overlays and every rAF loop from scratch and dropping the
  camera back to its default view. It read as "the screen refreshed", on both Next Round and the
  round timeline, because both go through `setSelectedRound`. Verified by marking the container
  element and watching a `MutationObserver` across four round switches: 1 unmount before, 0 after,
  camera zoom unchanged throughout.
- **Zoom controls** — a slider between the zoom-out and zoom-in buttons scrubs the camera ratio directly and shows the level as a percentage (`MAP_ZOOM_MIN_RATIO` 0.05 – `MAP_ZOOM_MAX_RATIO` 3). The **ratio** is bounded, so the world can never be zoomed to a speck; **panning is deliberately unbounded**, because the space is infinite — the reset (↺) button brings the view back
- **Drag tracks the cursor 1:1 at any zoom** — panning is sigma's own maths (both the pixel positions converted to *framed* coordinates, then `previous − current` added to the camera), which matters most when zoomed out: an earlier version clamped the camera centre to `[0, 1]`, and since the framed world is a unit square, anything below ~75% zoom needs to leave that range to be dragged across the screen — so every move hit the limit and the map stuck and jittered instead of following the pointer
- **Territory view** — zoom out past `TERRITORY_ZOOM_RATIO` and every place projects an equal
  circular **force**, marking the area those forces cover: the CK3 map-mode / Stellaris galaxy-map
  idea. Same-faction force **accumulates**, so a faction holding more places reaches further, and
  rival forces push against each other — the border lands where two forces are equal, so distance
  decides it. It is a translucent tint **over** the map, not a repaint of it — the graph and roads
  stay visible underneath — and unowned land is never coloured, because CK3 leaves unclaimed
  land untouched. Hovering a *place* still shows that place's tooltip; hovering open territory shows
  the faction's, and lifting a region dims the rest. Each faction's **name** is DOM over its region
- **Faction names always sit inside their own territory** — both the anchor and the font size come from
  the same inscribed circle, so the whole text box is inside the claim by construction (no clamping).
  A name is brightened toward white first, because the fill beneath it is that same colour over a dark
  backdrop; and faction names take over at the exact zoom where the place names disappear, so no band
  of the map is left with no label at all
- **A three-layer space backdrop** — the map sits on a slowly rotating galaxy, a warm star-dust fog
  that drifts slowly, and a drift-field dust layer.
  - The **galaxy** is the deep field at the bottom: a soft warm core, desaturated nebula patches
    and stars that concentrate toward the centre. Baked once into an offscreen canvas; every frame is
    one rotated `drawImage`. It uses **no noise at all**, and it dims as you zoom in
    (`SPACE_GALAXY_FADE_RATIO: 0.9`) — following sigma's zoom exactly would otherwise grow it to ~9×
    the viewport and flatten it into a film that costs the roads their contrast. The fade is floored at
    `SPACE_GALAXY_FADE_MIN: 0.55`, so the galaxy never disappears — it only dims, and deeper zoom stays
    legible thanks to the raised floor plus more stars and nebula patches.
  - The **fog** is a warm seeded star-dust layer painted **over the galaxy and under the map** — a
    deep backdrop rather than a haze, so the roads and nodes always sit on top of it. It is
    `pointer-events-none` (kept for safety), and it still paints *below* the HUD chrome. It **drifts
    slowly** (20 minutes a turn) and has **no zoom fade**, because it now lives under the map and
    nothing needs veiling. Its **density** is what makes it read as a cloud rather than a grey sheet —
    each patch draws one value that drives both its alpha and its size, so dense patches are bright
    and large while thin ones nearly vanish. The palette is deliberately **warm** (near-white cream to
    dark umber), so it reads as *lit star dust*, not a cold grey haze.
  - The **dust** is the topmost backdrop layer (still under the map), supplying all of the structure
    and motion: particles follow a 3D Simplex noise field, so they gather into ribbons, vortices and
    voids rather than scattering at random, and each particle's colour is read from the noise **at its
    position**, so one ribbon is one colour band.
  - The galaxy and fog are **placed by sigma itself**, through `framedGraphToViewport`, so they sit in
    *world* coordinates and scroll and zoom with the map. This replaced a real bug: a hand-rolled pan
    had the wrong sign, so the backdrop drifted *against* the map. Only the dust has a parallax factor
    of its own (`SPACE_FLOW_PARALLAX: 0.35`) — it is the one layer that floats above the map rather
    than lying in it.
  - The **territory area layer stops being interactive when zoomed in** past `TERRITORY_INTERACTIVE_RATIO`
    (0.6): below it, pointing at a patch of ground no longer answers "whose land is this" and no longer
    lights that faction's fill, because that range is showing nodes and roads and the area layer is only
    a backdrop. Place node hover and click are unaffected.
  - The **zoom percentage is an editable input plus a `%` label**, not a display: it reads `0` = furthest,
    `100` = closest, and typing a value jumps the camera there (Enter commits, and so does blur). The
    draft is a string, never a number, or `15` would reformat to `1` on the first keystroke.
  - The galaxy is deliberately **dimmer than the Stellaris reference**, which gets away with a bright
    core because its hyperlanes are thin *bright* lines.
  - The dust palette was pushed into the **cool half and down in chroma** (hue `195 → 280`,
    saturation 45, alpha 0.55). It used to be a full 0–320 rainbow at saturation 78, tuned when it was
    the *only* backdrop; over a warm galaxy those ribbons fought it. `spaceFlow.test.ts` asserts
    ceilings so it cannot drift back.
- **Battles are shown in one place only** — the `PLACE_CAPTURED` report. There is no map-level battle
  animation: an earlier fleet of ships trading fire along contested roads was removed because it was
  derived from *ownership*, so it was permanently "at war" everywhere two factions touched. That is
  ambient noise rather than information, and it competed with the report that actually explains an
  engagement. The map's only battle cue is the spotlight ring for the displayed round — red for
  attacked, cyan for created
- The 將領 / 事件 / 統計 panels are **overlaid on the map's right edge** rather than taking layout width, so the map keeps the full canvas; the tab rail is always visible and only the content collapses
- **Clicking the already-active tab closes its panel** — a toggle, not open-only, so the rail can always dismiss its own panel
- **Nothing is a layout column any more** — 選擇回合 (the round timeline) is overlaid on the map's **left** edge and 勢力排行 (faction ranking) lives in the 統計 tab, so the map keeps the whole viewport at any width
- **Event log filters** — three independent filters compose by AND: a faction dropdown, a multi-select of six event categories, and 人物 / 地點 / 其他 info-kind toggles. The info kind is not just a display filter: it decides whether a name in the log becomes a clickable button that focuses that place or opens that leader
- **The log reads oldest to newest, and that order is causal** — earn income → buy soldiers → move →
  capture → be appointed → upgrade. Three separate defects had to be fixed, because the display alone
  would have *hidden* the other two rather than repairing them:
  - `EventLog.tsx` reversed the array on a false premise. Its comment claimed the API returns
    newest-first, but it has always sorted within a round by `createdAt: 'asc'`; only the all-rounds
    branch ever wrote `round: 'desc'`, and that is the order *between* rounds. The log therefore read
    "upgrade → capture → appointed → moved → bought → income" — the money earned last. It also made
    the rest of the file self-contradictory: `shown` deliberately takes the **tail** so the reader
    lands on the newest slice, and the auto-scroll pins to the bottom, which only hold oldest-first.
  - One endpoint returned **opposite orders depending on the query**. Both branches are now
    `[{ round: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]`. The `id` tiebreak is load-bearing:
    Postgres compares timestamps at millisecond resolution and events written back to back routinely
    land in the same millisecond, leaving their order *undefined* without it — which is what makes an
    ordering bug look intermittent instead of consistently wrong.
  - The simulation wrote the appointment *before* the capture (`grantAdmin()` ran before the
    `PLACE_CAPTURED` create), so the log read "appointed administrator of X" before "captured X".
    Both are sequential `await`s with no race, so the database order was decided entirely by statement
    order. Swapping them changes no gameplay — the administrator still arrives before the build
    phase, so "captured this round, upgraded this round" still holds.
    `server/battle.eventOrder.test.ts` guards it by reading the source (there is no database in the
    `node` test environment, so "which statement comes first" is the only checkable invariant).
  - **Existing rounds keep their stored order.** The log is append-only; back-dating rows to make a
    story read better would destroy what makes it trustworthy.
- **Battle report** — a 佔領 row carries a **戰報 / Report** button opening the arithmetic behind
  that engagement (attacker troops × wu × roll vs defenders garrison × fortress × roll). When the
  place had no garrison the report says so outright instead of showing a blank calculation, because
  a fought-over capture and a walk-in look identical in the list
- **Economy events** — every round each place writes one `INCOME` row: its income, the troops it
  recruited, and how the gold was split between the king, the administrator and the others. One row
  per place rather than per leader, since a row already names the recipients
- **Troop purchases** — when a leader spends their **own** gold on soldiers, that writes a
  `TROOPS_BOUGHT` row naming them, the place, how many troops they bought, what it cost, and what
  they were left with. It is the other half of the money trail: `INCOME` alone shows a leader being
  paid but never what they spent it on
- **Place popup** — every building shows its level, what that level **currently** grants, what one
  more would add, and the upgrade price (coloured by whether the administrator can afford it).
  A **每回合產出** block shows the garrison recruits, the total income, and what the administrator
  **actually** gets — which is nothing at all when a place has no administrator, rather than a
  nominal percentage. All of it is computed from the same module the simulation uses, so the popup
  can never quote a number the game does not apply
- **Defection rows name all three parties** — the faction left, the place left from, and the faction
  joined (or founded), instead of only "某某 defected"
- **The avatar blinks, talks and shows speed** — the mouth opens and closes with a pause so it reads
  as speech rather than a metronome, the eyes blink, and speed appears as one to three motion
  lines **to the left of** the head in its own colour (deliberately not the gold/steel/hemp the
  abilities share). They sit on the left because the original placement was inside the head's own
  bounding box and was therefore hidden entirely
- **體魄 (Physique) has its own avatar cue** — a forearm guard, which is the one body region left once
  head, shoulders and chest are taken, so all four abilities stay separable at a glance. It
  degrades like the others: heavy bracer → plain vambrace → bare forearm wrap. Every tier cue carries a
  dark rim, because hemp and steel all but vanish against a dark robe
- **Leader table sorting** — the 將領數 table head sorts: click a column, click again to reverse.
  Switching columns starts from that column's own sensible direction (numbers descending, names A→Z),
  and opening a leader from the table keeps a **back** action to return to it
- **Spotlight rings** — places created or attacked in the displayed round only (`SPOTLIGHT_ROUNDS` = 1) pulse a glow ring on a 2D overlay canvas: cyan for created, red for attacked
- **Move animation** — each round's `CHARACTER_MOVED` events play a faction-colored dot traveling from → to place (1.5s travel + 2.5s pause, `MOVE_ANIM_DURATION`/`MOVE_ANIM_PAUSE`); the events endpoint enriches these rows with `fromPlaceName`/`toPlaceName` for the log
- **Camera transitions** — clicking a place animates the view to centre it, and reset animates to fit the whole world (`MAP_CAMERA_ANIM_MS`, forced to 0 under `prefers-reduced-motion`)
- The spotlight loop pauses when the map scrolls out of view or the tab is hidden

### Statistics

The stats tab renders nine time-series charts in four switchable styles:

| Style | Per-faction charts | World-wide charts |
|-------|--------------------|-------------------|
| Line | one line per faction | single trend line |
| Pie | donut of the latest round's share | gauge ring vs. historical peak |
| Bar | stacked bar per round | bar per round |
| Treemap | faction power: one block per faction sized by territory, subdivided into troops / gold / characters | — |

Selecting **Treemap** replaces the nine charts with the single combined view, since it is a
view of faction power rather than another rendering of one metric.

- **Hover tooltips** — all four styles plus the treemap share one tooltip panel and one legend,
  so hover reads the same everywhere. Line and bar draw a crosshair that snaps to the nearest
  round; pie hit-tests the slice under the cursor; the gauge shows 目前 vs 峰值. The gauge and
  the treemap deliberately show **no round heading** — both are current snapshots rather than
  one round. The panel flips to the cursor's left near the right edge so it is never clipped
- **Character radar** — one polygon per faction showing its living characters' mean attributes
  across 武力 / 統領 / 經濟 / 速度 / 野心 / 年齡, with the world average as a dashed reference
- **Leader hover preview** — hovering a row of the leader table floats the leader's radar on the
  right and their procedurally generated head on the left
- **Leader avatars** are generated from the character id, so a leader always has the same face
  without storing anything; kings get a crown, age greys the hair, and the faction colors the robe.
  The 168px avatar in the leader detail modal **breathes** gently (chest rise plus a slight head tilt,
  peaking at 0.45 of a 4s cycle so it reads as breathing rather than a heartbeat); list rows and the
  hover preview stay still, because the motion is invisible at their size but the repaints are real
- Each of 武力 / 統領 / 經濟 is banded **three** ways, so *every* leader carries a readable cue
  instead of only the strongest few, and each cue owns its own body region so they never overlap:

  | Band | 武力 (head) | 統領 (shoulders) | 經濟 (chest) |
  |------|------|--------|--------|
  | high | plumed helmet | wide gold board + fringe | abacus |
  | mid | knotted headband | plain steel board | square-holed cash coin |
  | low | scar | thin patched hemp strap | empty drawstring pouch |

  All three abilities share one material language — gold is an officer, steel a lieutenant, hemp
  a commoner — so rank compares across stats, and the low band is deliberately made to look worn
- **Hovering a leader's avatar explains those cues**, listing all three (武力 高 · 頭盔). The same
  text is on the wrapper's `aria-label`, so keyboard and screen-reader users get it too
- Each axis on a radar normalises against its own maximum (age tops out far above the ability
  stats), so edge lengths are not comparable across axes — read the shape, not the numbers

### Battles
- Characters move 1 territory per turn
- When enemy characters meet, they battle
- Battle outcome depends on troops, martial/leadership stats, and fortress level
- Losers may escape to a nearby friendly place (based on speed difference) or die

### Economy
- Each territory generates income based on market level
- Income is split: **30% king, 40% administrator, 30% shared among everyone else**. A vacant king or an empty "everyone else" bucket has its share absorbed by whoever is present, because the total is fixed and gold cannot vanish 
- **No administrator means nobody is paid.** The administrator is the person actually running the place, so without one the place is ungoverned, and quietly routing the money to a distant king would pay someone who is not there
- **Economy (jing)** scales what a leader pockets: a leader's cut is multiplied by
  `1 + (jing − 17.5) / 30`, so an average leader is unchanged, a high-`jing` one takes more
  and a low-`jing` one less. A lone leader (no king *or* no admin) already receives the whole
  income, so no multiplier applies — the total distributed can never exceed the place's income
- Characters buy troops with personal gold: 2 gold per troop, in batches of 10-100. The **cap on one purchase is scaled by 統領 (tong)** with the same average-centred formula jing uses for income, so leadership decides how many soldiers one purchase can buy 
- **統領 (tong) only does that.** It does not affect defection at all, and it does not defend — that is **體魄 (ti)**. Removing the defection link took two passes: the multiplier went first, then a delta that was still quietly feeding the defection value through the ledger. Leadership is not loyalty.
- **Ambition (ambition)** is an integer 5-30, drawn from a normal distribution (mean 17, sigma 5) via
  `Rng.gaussianInt`. Both the stat and the ledger deltas are `Int` columns; they were `Float`
  until migration `20261017000000_ambition_and_delta_to_int`. Ambition itself is a **fixed initial
  value** — nothing rewrites it, and what moves each round is the *defection value*, which sums the
  ambition plus this round's ledger deltas. Leadership (`tong`) has no effect on defection at all

### Accounts

Sign in with **Google** or with **email + password** — both share one `User` table, so either works
for the same address.

- Passwords are hashed with **argon2id** and never stored or logged in plaintext
- Registering with an address that already has an account is refused rather than overwriting it, so
  a Google account can never be taken over by someone who merely knows its address
- To give a Google account a password (admins included), sign in with Google first and then use
  `POST /api/auth/set-password` — that requires a verified session, which *is* the proof of ownership
- The minimum password length is 8 characters, with no composition rules (NIST SP 800-63B)
- **There is no email verification and no password reset** — both need a mail provider and were
  deferred, so an address can sign in before any confirmation. A public deployment also needs rate
  limiting in front of both auth routes

## API Endpoints

### Public (requires authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/world/current` | Get active world info |
| GET | `/api/world/state?round=N` | Get full state for a round |
| GET | `/api/world/rounds` | List available rounds |
| GET | `/api/world/events?round=N` | Get events for a round |
| GET | `/api/world/stats?from=A&to=B` | Get chart data |

### Public (no authentication)

The homepage is only shown to signed-out visitors, so it needs one read path
that does not require a session. This endpoint is the only one.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/world` | Aggregated snapshot of the running world |

It is strictly read-only: there is no mutation path and no admin or session
surface, and it returns no personal data — only settlement names, faction names,
and aggregate counts. Counts are always complete; the settlement graph is
down-sampled to 400 nodes (`graph.truncated` reports whether it was cut down) to
keep polling cheap on a world of up to 2,000 settlements.

### Admin only

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/run-round` | Execute next round |
| POST | `/api/admin/reset-world` | Create new world |
| POST | `/api/admin/assign-admin` | Assign administrator |

## Development

### Code Style

- **Human-readable**: All code is written for humans first, computers second
- **Well-documented**: Every file has a header explaining its purpose
- **Type-safe**: Full TypeScript coverage with strict types
- **Consistent**: Follows established patterns throughout
- **Tailwind-first**: Design values live once in the `@theme static` block in
  `src/app/globals.css` and become native utilities. Surfaces are expressed
  with utilities, not bespoke CSS classes. A surface used more than once gets
  its utility string declared as a module-scope constant in the file that owns
  it. See [TECH.md](./TECH.md#tailwindcss-4) for the full rules.

### Adding New Features

1. **Game mechanics**: Add to `server/runRound.ts` or create new phase files
2. **UI components**: Create in `components/` with proper documentation
3. **API routes**: Add to `src/app/api/` following existing patterns
4. **Config values**: Always add tunable values to `lib/gameConfig.ts`

### Testing

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run TypeScript type checking
pnpm typecheck
```

For detailed technology documentation, see [TECH.md](TECH.md).

## Deployment

### Vercel (Recommended)

The build script automatically runs `prisma generate` before `next build`:

```bash
# Build command (configured in package.json)
prisma generate && next build

# Install Vercel CLI
pnpm i -g vercel

# Deploy
vercel
```

### Docker

```bash
# Build image
docker build -t autonomous-world .

# Run container
docker run -p 3000:3000 autonomous-world
```

#### Docker with Environment Variables

```bash
# Run with environment variables
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@localhost:5432/autonomous_world" \
  -e AUTH_SECRET="your-auth-secret" \
  -e GOOGLE_CLIENT_ID="your-google-client-id" \
  -e GOOGLE_CLIENT_SECRET="your-google-client-secret" \
  -e ADMIN_EMAIL="admin@example.com" \
  autonomous-world
```

#### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/autonomous_world
      - AUTH_SECRET=${AUTH_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=autonomous_world
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

- **The chart x axis is the round number**, not the index. A faction's series only gains an entry in
  the round it first appears, so plotting by array index drew every faction as if it had existed since
  round 0. The stats route now carries a per-faction `rounds[]`, and the chart resolves the real offset
  (`startOffsetOf()`). The same bug made the crosshair read a world index against a faction-local array,
  land on `undefined`, fall through `?? 0`, and report a real faction as **zero troops** — the readout now
  goes through `valueAt()` / `hasValueAt()`, and a round lists only factions that existed then


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

**生育必須跑在老化舍死的後面。** 若先生子下了回合、父亲亡名事发在此刻，
那个子女出生的瞬間就成為君玉，「生育」变成存欽術。
**Childbirth must run AFTER age and death.** A child conceived in the same round must not
inherit from a parent who just died, or childbirth becomes a resurrection spell.

**事件**：`CHILD_BORN`（填在 character 類別）與 `KING_INHERITED`（faction 類別），
兩者都在 `EventLog.tsx` 的 `EVENT_CATEGORY` 與 `icons.tsx` 的 glyph switch 登記，否則會静默落到預記點。
`CHILD_BORN` (category `character`) and `KING_INHERITED` (category `faction`) are registered in
`EVENT_CATEGORY` and given glyphs, or they would silently fall through to the default dot.
## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License — see [LICENSE](LICENSE) for details.

### 顯像、提示與地點分頁（今日） / Avatar, tooltips and the place tab (today)

**識別圖形的放大個數目前穫不調，每部位統一個個數（寫作統一的試驗結果）。** `TIER_CUE_SCALE_ARM` 1.0、`TIER_CUE_SCALE_CHEST` 1.0、基準 1.45。

**對象圖用一個共用的 `clipPath` id，作用在**已存在**的胸口與頭部两個组上。** 衣袍與肩章直接落到底邊，不切它會透出圍換。共用 id 是安全的：
裁剪圖形在每個頭像里完全一樣。先前曾試國斷增一個包裹组，結果 JSX 平衡失敗；直接加属性才是安全的做法。
The avatar clips to a rounded plate via one shared clipPath id, attached as an ATTRIBUTE on
the two groups that already exist (chest and head). The robe and shoulder boards run to the
bottom edge and bled outside the plate without it. A shared id is safe: the clip shape is
identical in every avatar. An earlier attempt that inserted a wrapper group unbalances the
JSX — adding the attribute does not.

**提示在游標面上半部時改贴在游標上方。** 提示原本以游標垂直置中，一靠近容器頂端，面板就有一半裁掉。現在量容器高度（`offsetParent` + `ResizeObserver`），
游標在上半部就翻到上方。改在 `ChartTooltip` 內部，五個圖表呼叫點全部受益。
The tooltip flips above the pointer when it is in the top half. It was vertically centred, so
near the container top half of it was clipped away. The container height is now measured
(`offsetParent` + `ResizeObserver`) inside `ChartTooltip`, so all five chart call sites
inherit the behaviour with no signature change.

**將領詳情：位置可點、動力色塊在左、電轉圖可交互。** 體轉圖在詳情彌窗里使用斷的 `interactive` 属性——將領表那一列的浮動預稿必須維持 `pointer-events-none`，
否則面板會觸發那一列的 `mouseleave` 而閃烁消失；後者是窗口內的固定圖表，可以很自然地接受游標。游標指向哪一條輪就显示該值與同動力平均，并在輪尾圍一圈。
Leader detail: 位置 is clickable, the faction swatch sits left of the name, and the radar takes
the pointer. The radar uses a new `interactive` prop — the leader-table hover preview must
stay `pointer-events-none` or it flickers away on that row mouseleave, while the modal copy can
take the pointer freely. The tooltip names the hovered axis and shows the faction mean.

**「地點」分頁沒选中時列出所有地點。** 只放一句提示等於進證回地圖自己點；面板已經在這裡，就該把它們摊開。依名稱排序，因為這個列表沒有位置內容。
With nothing selected the 地點 tab lists every place instead of a one-line prompt: the panel
is already there, so it should show them. Sorted by name, because the list has no spatial cue.

**建立列改成「一級一點」，數字改在提示。** 後要上所有位座執的每一級效果表常驛時，在 19rem 寬的面板里把真正要看的「現在幾級」埋掉。現在每座下方是一排點（已達到填满、現在級為 active、未達到只剩外框），
數字在游標停在點點上時的 tooltip 才出現。提示固定贴在點點上方：點點本來就在卡片底邊。
Each building row is now a row of dots, one per level: reached levels filled, the current one
in the active colour, unreached ones reduced to an outline. The numbers live in a tooltip on
hover. The tooltip is anchored above the dots because the dots already sit at the card edge.

**`cn` 是已安裝的包，不要自己寫一份。** `src/lib/utils.ts` 已經重新察出它。它有真正的 Tailwind 矛盾解析（`cn('p-2', 'p-4')` → `'p-4'`），
手寫的版本只會把兩個串接在一起。在空白就擁斷寫一份、沒先確認實際存在是有過 / **`cn` is an installed package — do not hand-roll another.** `src/lib/utils.ts`
already re-exports it, and it does real Tailwind conflict resolution, which a truthy-join
cannot. Check whether a dependency is absent before writing a replacement for it.


### 交易只用在「半寫入會永久毀掉東西」的地方 / Transactions only where a half-write destroys something

`server/tx.ts` 提供 `inTransaction()`。**這個回合裡 90 個寫入點，只有兩個包進交易。**

判斷標準只有一條：**之後有沒有任何一條程式路徑會把它修回來。** 沒有 → 必須交易。有 → 不必。

A round is a simulation that may stop halfway — the next round resumes from wherever it
stopped — so most partial writes are self-correcting. Wrapping all ~90 write sites would buy
hundreds of transactions a round and no matching correctness. The test is one question: **does
any later code path repair this?**

**包起來的兩個 / The two that are wrapped**

- `adminAssign.grantAdmin` / `revokeAdmin` — 崗位搬過了而野心沒扣，就永遠不會有回復的排程；
  這個角色從此比規則允許的更沉靜，而且沒有任何東西會把那一點還給他。免職那邊的風險相反：
  `+1` 入了帳卻沒清掉未到期的減免，排定的回復會再記一次 `+1`。
  A seat that moves without the ambition delta is the worst kind of half-write: no revert is
  ever scheduled, so the deduction is simply permanent. Revoking moves no seat — its risk is the
  mirror image, a `+1` landing while the pending reduction is not cleared, so the scheduled
  revert would credit a second `+1`.
- `economy` 的單一地點發放 — `splitIncome` 保證三份加總剛好等於 `income`，所以在兩次
  `increment` 之間崩潰，不會有任何一筆錢移動到別處：它就是消失了，而沒有任何階段會對帳。
  `splitIncome` is exact, so a crash between two increments moves the missing gold nowhere. It
  ceases to exist, and no later phase reconciles totals.

**刻意排除 / Deliberately excluded**

- **回合快照** (`runRound.ts`) — 快照是「已完成的某一回合」的快取。把它放進回合的交易裡，
  等於讓一個交易橫跨全部 14 個階段地開著。
- **每筆事件列** — Event 是一行日誌。少一行損失的是敘事，不是狀態。

**陷阱 / The trap.** `inTransaction` 的 `fn` **只**能使用傳進去的 `tx`。在 `fn` 裡呼叫模組層級的
`prisma` 會逃出這筆交易，不會隨之回滾——這個輔助存在的理由就是把這個陷阱寫在程式碼裡。

逾時是 `TX_TIMEOUT_MS`（20 秒），比 Prisma 預設的 5 秒寬，因為一個地點的發放可能超過它。

### 顯示字型與前臂 / The display face and the forearm

**Orbitron 換成 Chakra Petch，`font-orbitron` 改名為 `font-display`。**
Orbitron 在這個介面上「不清楚」不是主觀問題，而是結構性的：字幅很寬、x-height 低、
字形切角又特殊，而它最常出現的地方——事件列標頭、圖表刻度、`RND` 計數、eyebrow
標籤——都是 11–13px 的小字，在那些尺寸下筆畫會糊成一團。Chakra Petch 保留科幻的方正感，
但切角是「刀」而不是「面」，筆畫對比更高、字幅更窄；斜切的收尾也帶一點武備感，剛好補上
奇幻那一半。它只有 latin，中文一律落到 `PingFang TC`，與舊設定相同。
類別與 CSS 變數一起改名（`--font-orbitron` → `--font-display`、`.font-orbitron` →
`.font-display`），因為留著舊名字會指向一個根本沒有載入的字型。
Orbitron's illegibility here was structural: very wide, low x-height, unusual geometric cuts,
and it spends most of its life at 11–13px in this UI, where those traits smear together.
Chakra Petch keeps the squarish sci-fi feel with blade-like terminals, higher stroke contrast
and narrower letterforms, and the angled cuts read as martial, which supplies the fantasy half.
The class and CSS variable were renamed along with it, because keeping the old name would
point at a font that is no longer loaded.

**體魄現在畫在一條真的手臂上，三段共用同一個尺寸。**
原本只有護具，直接浮在衣袍上，看起來像貼在布上的色條而不是四肢；現在手臂畫在**肩章之前**，
肩章才壓在肩膀上而不是被手臂穿過去。手臂上緣刻意壓低——高一點就會從肩章的斜邊上方露出
一塊皮膚，讀起來像脖子旁多了一塊。
三段護具**不再各自縮小**：階級改由材質（金／鋼／麻）、深色外框與飾線（高階甲片脊線、
低階縫線）表達。mid 與 low 原本比較小，結果低階的線索不是「弱」而是「幾乎看不見」——
而 40px 的列表列上，那正是唯一承載體魄資訊的地方。
The Physique cue now sits on a real limb rather than floating on cloth, and all three bands
share **one size**. Rank is carried by material, the dark rim and the detailing (a ridge for
the heavy band, stitching for the worn one), not by extent — a smaller mid/low guard made the
low band's signal "almost invisible" rather than "weak", and at the 40px list size that is
where the only ti signal lives.

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
There were three separate close routes — re-clicking the active tab, the panel's own ✕, and the
detail's own ✕ — and two of them forgot. Fixing those two was not enough on its own, so they are
now one function; a fourth path has nothing to forget.

**建築列不能帶 `overflow-hidden`。** 提示畫在卡片**外面**（上一張卡的上方），而
`overflow-hidden` 會把它整個裁掉——**裁切與堆疊順序是兩件事，z 再高也沒用**。正確的寫法是
拿掉 `overflow-hidden`，改為在展開時把**卡片自己**提到 `z-30`，這樣後面的同層卡片才不會蓋掉
提示。
The building card must not carry `overflow-hidden`. The tooltip renders *outside* that card, over
the card above it, and `overflow-hidden` clips it away entirely — clipping and stacking order are
different things, and no z-index undoes a clip. The fix is to drop `overflow-hidden` and instead
raise the **card itself** to `z-30` while expanded, so a later sibling cannot paint over it.

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

**建立新勢力與叛變都「不」重骰野心。** 原本五處用 `CHAR_NEW_FACTION_AMBITION_RESET_MIN..MAX`
把野心拉回 5–15，設定值已刪除。取而代之是**帳本冷卻**：`defectionEvents` 每回合為視窗內
每一次叛變寫一筆 −2（`DEFECTION_COOLING_DELTA`），持續 20 回合
（`DEFECTION_COOLING_ROUNDS`）。**每次叛變各自一筆，所以會疊加**：叛變兩次就是 −4。
只寫帳本、不寫可見 Event，因為符合條件的人每回合上百。
Founding a faction and defecting both **no longer** re-roll ambition — all five re-roll sites and
the config keys are gone. What replaced it is **cooling in the ledger**: one −2 row
(`DEFECTION_COOLING_DELTA`) per defection inside a 20-round window
(`DEFECTION_COOLING_ROUNDS`). **They stack**, so two defections is −4. Ledger only, no visible
Event: a hundred-odd leaders match per round.

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

**勢力過濾是一個下拉選單，不是又一排按鈕。** 地點清單現在有搜尋、擁有權過濾
（全部／有主／無主）與勢力過濾。勢力動輒上百個，一排按鈕排不下，所以用 `<select>`——
樣式與事件日誌的勢力過濾一致。**選了勢力會把擁有權過濾切回「全部」**，因為「某勢力 +
無主」在定義上永遠是空集合，留著只會給人一個看不懂的空清單。已滅亡與瓦解中的勢力仍然
列出（地點會留下來，仍然找得到），但用既有的 `faction.collapsed` / `faction.collapsing`
標出來，不另造字串。三個控制項都必須重設已顯示筆數。
The faction filter is a **dropdown, not another chip row**: there can be hundreds of factions,
which no row of buttons can hold, so it is a `<select>` styled to match the event log's. Picking
a faction **switches the ownership filter back to All**, because "this faction + unowned" is
empty by construction and leaving it selectable only produces a list nobody can read. Destroyed
and collapsing factions stay in the list (their places persist) but are marked with the existing
`faction.collapsed` / `faction.collapsing` words. All three controls must reset the revealed
count.

**`CONFIG` 是 `as const`，所以頁數要用 `useState<number>(...)`。** 否則 state 會被推成字面值
`100`，setter 只接受回傳 `100`，第一次「再載入 100 筆」就編譯不過。這和自動播放速度 slider
是同一個坑。
`CONFIG` is `as const`, so the row count must be `useState<number>(...)`. Otherwise the state
infers the literal `100` and the setter cannot return a larger number, so the very first
"load 100 more" fails to compile — the same trap as the autoplay-speed slider.

**面板寬度改動會連帶影響相機控制的偏移。** `GM_HUD_CONTROLS_OPEN` 的 `lg:right-[31rem]`
是由「面板 24rem + 頁籤 rail 與間距約 7rem」推出來的，不是拍腦袋的數字。面板寬度一改就
必須重算，否則 reset／縮小／滑桿會被面板蓋住。
The camera-control offset follows the panel width. `lg:right-[31rem]` is derived from 24rem of
panel plus roughly 7rem of rail and gutter — it is not a guess. Change the panel width and it
must be recomputed, or reset/zoom-out/the slider end up underneath the panel.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Prisma](https://www.prisma.io/)
- Visualization with [Sigma.js](https://www.sigmajs.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Data fetching with [TanStack Query](https://tanstack.com/query)
- Validation with [Zod](https://zod.dev/)
- Optimized with [React Compiler](https://react.dev/learn/react-compiler)
