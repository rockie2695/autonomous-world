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
| Scheduling | GitHub Action (hourly POST /api/admin/run-round) |

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
| `ADMIN_TOKEN` | ❌ | Token for GitHub Action authentication |

## Project Structure

```
autonomous-world/
├── prisma/
│   ├── schema.prisma              # Database schema (Prisma 7 format)
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
│   │   │   └── admin/             # Admin-only API endpoints
│   │   │       ├── run-round/     # POST /api/admin/run-round
│   │   │       ├── reset-world/   # POST /api/admin/reset-world
│   │   │       └── assign-admin/  # POST /api/admin/assign-admin
│   │   ├── game/                  # Main game page
│   │   ├── layout.tsx             # Root layout (with QueryProvider)
│   │   ├── page.tsx               # Homepage
│   │   └── globals.css            # Global styles
│   └── lib/                       # Shared utilities (imported via @/*)
│       ├── auth.ts                # Auth.js v5 configuration & helpers
│       ├── prisma.ts              # Prisma client singleton
│       ├── queryClient.tsx        # TanStack Query provider
│       ├── validations.ts         # Zod validation schemas
│       ├── gameConfig.ts          # All tunable game values
│       ├── rng.ts                 # Seeded RNG (mulberry32)
│       ├── snapshot.ts            # Snapshot compression/decompression
│       ├── i18n/                  # Internationalization (zh/en)
│       └── nameGenerator/         # Name generation utilities
│           ├── person.ts          # Character names
│           ├── place.ts           # Place names
│           └── faction.ts         # Faction names
├── server/
│   ├── runRound.ts                # Main game loop orchestrator
│   └── phases/                    # Individual game phases
│       ├── spawnPlaces.ts         # Phase 1: Create new places
│       ├── spawnCharacters.ts     # Phase 2: Spawn characters
│       ├── ageAndDeath.ts         # Phase 3: Age + death check
│       ├── economy.ts             # Phase 4: Income + recruitment
│       ├── signals.ts             # Phase 5: Signal progression
│       ├── relationships.ts       # Phase 6: Friendships/discontent
│       ├── ambitionEvents.ts      # Phase 7: Ambition changes
│       ├── loyaltyCheck.ts        # Phase 8: Defection check
│       ├── aiMove.ts              # Phase 9: Character movement
│       ├── battle.ts              # Phase 10: Battle resolution
│       ├── build.ts               # Phase 11: Building upgrades
│       ├── assignAdmins.ts        # Phase 12: Auto-assign admins
│       ├── factionCollapse.ts     # Phase 13: Faction collapse
│       └── factionDeath.ts        # Phase 14: Faction elimination
├── prisma.config.ts               # Prisma 7 configuration
├── next.config.ts                 # Next.js configuration (React Compiler enabled)
├── tsconfig.json                  # TypeScript configuration
├── vitest.config.ts               # Vitest test configuration
└── package.json                   # Dependencies and scripts
```

## Game Rules

### World
- Single shared world, `active = true` marks the current world
- All players observe the same world
- No victory conditions — the game runs infinitely

### Characters
- Each character has: **Martial (wu)**, **Leadership (tong)**, **Economy (j ing)**, **Speed**
- Stats range 5-30, with speed using normal distribution (μ=17, σ=5)
- Characters age each round and eventually die of old age (50-80 years)

### Factions
- Characters can belong to a faction (kingdom/nation)
- Each faction has a king, color, and set of territories
- When a king dies, the faction enters "collapsing" state and dissolves

### Battles
- Characters move 1 territory per turn
- When enemy characters meet, they battle
- Battle outcome depends on troops, martial/leadership stats, and fortress level
- Losers may escape (based on speed difference) or die

### Economy
- Each territory generates income based on market level
- Income is split: 40% king, 30% administrator, 30% shared among others
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

```bash
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
