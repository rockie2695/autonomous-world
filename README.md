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
| Authentication | Auth.js v5 (next-auth) + Google Provider |
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
│   │   ├── game/                  # Main game page (with SigmaMap, EventLog, StatsCharts)
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
│   ├── LeaderAvatar.tsx           # Procedural leader head bust (seeded from character.id)
│   └── home/                      # Homepage sections (three.js scenes, live poller, hooks)
│                                  # (EventLog & StatsCharts are defined in game/page.tsx)
├── server/
│   ├── runRound.ts                # Main game loop orchestrator (14 phases + layout + snapshot)
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
│       ├── ambitionEvents.ts      # Phase 7: Ambition changes
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
- Characters only spawn at faction-controlled places (unowned places never generate generals), and a spawned general immediately joins that place's faction
- Characters spawned in a round never move in that round (they stay put until the next round)
- On spawn, the faction's king assigns the new leader as administrator of the spawn place: if the seat is vacant (or held by a dead admin) the new leader takes it directly; if the king himself holds it, he keeps it; otherwise they compare total ability (wu+tong+jing) and a strictly higher score wins the seat — the removed admin's ambition **increases** by `AMBITION_ADMIN_REPLACED_DELTA` (1), logged as an `ADMIN_REMOVED` event + an `AmbitionEvent`
- Every administrator assignment — spawn, auto-assign, battle capture, or manual API — applies a **temporary** ambition **decrease** of `AMBITION_ADMIN_ASSIGNED_DELTA` (1), which reverts +1 after `AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS` (10) if the character is still in office (logged as an `AMBITION_RECOVERED` event). If they are removed before then, the removal already paid `AMBITION_ADMIN_REPLACED_DELTA` and no revert happens
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
- Node labels follow one zoom rule: shown only when zoom ≥ `LABEL_SIZE_THRESHOLD` (8), via Sigma's `labelRenderedSizeThreshold`; labels always paint above the spotlight overlay
- **Spotlight rings** — places created or attacked in the displayed round only (`SPOTLIGHT_ROUNDS` = 1) pulse a glow ring on a 2D overlay canvas: cyan for created, red for attacked
- **Move animation** — each round's `CHARACTER_MOVED` events play a faction-colored dot traveling from → to place (1.5s travel + 2.5s pause, `MOVE_ANIM_DURATION`/`MOVE_ANIM_PAUSE`); the events endpoint enriches these rows with `fromPlaceName`/`toPlaceName` for the log
- **Node glow + drop shadow** — a second, static overlay canvas under the spotlight layer and under Sigma paints a soft faction-colored halo behind every place, scaled by its on-screen size; it redraws on camera moves only, so an idle map costs nothing
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

- **Character radar** — one polygon per faction showing its living characters' mean attributes
  across 武力 / 統領 / 經濟 / 速度 / 野心 / 年齡, with the world average as a dashed reference
- **Leader hover preview** — hovering a row of the leader table floats the leader's radar on the
  right and their procedurally generated head on the left
- **Leader avatars** are generated from the character id, so a leader always has the same face
  without storing anything; kings get a crown, high 武力 a helmet, age greys the hair, and the
  faction colors the robe
- Each axis on a radar normalises against its own maximum (age tops out far above the ability
  stats), so edge lengths are not comparable across axes — read the shape, not the numbers

### Battles
- Characters move 1 territory per turn
- When enemy characters meet, they battle
- Battle outcome depends on troops, martial/leadership stats, and fortress level
- Losers may escape to a nearby friendly place (based on speed difference) or die

### Economy
- Each territory generates income based on market level
- Income is split: 40% king, 30% administrator, 30% shared among others
- **Economy (jing)** scales what a leader pockets: a leader's cut is multiplied by
  `1 + (jing − 17.5) / 30`, so an average leader is unchanged, a high-`jing` one takes more
  and a low-`jing` one less. A lone leader (no king *or* no admin) already receives the whole
  income, so no multiplier applies — the total distributed can never exceed the place's income
- Characters can buy troops with personal gold

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Prisma](https://www.prisma.io/)
- Visualization with [Sigma.js](https://www.sigmajs.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Data fetching with [TanStack Query](https://tanstack.com/query)
- Validation with [Zod](https://zod.dev/)
- Optimized with [React Compiler](https://react.dev/learn/react-compiler)
