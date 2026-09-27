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
    └── nameGenerator/     # Name generation
```

### Server Code (Game Logic)

```
server/
├── runRound.ts            # Main game loop orchestrator (14 phases + layout + snapshot)
├── moveEvent.ts           # recordMove() — writes CHARACTER_MOVED events (used by aiMove + battle escape)
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
└── SigmaMap.tsx           # Interactive graph map (Sigma.js + graphology)
                           # - Nodes: faction-colored (HSL→hex), sized by troops
                           # - Edges: semi-transparent roads
                           # - Dynamic labels with faction-colored backgrounds
                           # - Overlay <canvas> animation layer (pointer-events-none):
                           #   pulsing spotlight rings (cyan=created, red=attacked) +
                           #   faction-colored travel dot for the displayed round's moves.
                           #   NOTE: canvas is a replaced element — keep `w-full h-full`
                           #   (inset-0 alone leaves it at intrinsic 300×150).

src/app/game/page.tsx also defines locally:
├── EventLog               # Bilingual event log (i18n t() with parameter substitution); header shows the displayed round zero-padded to 4 digits (`RND 0001` style)
└── StatsCharts            # SVG line charts for faction stats over time
```

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

### Faction-Controlled Place Rules

A place is "faction-controlled" when `place.factionId != null`. Unowned (無主之地) places must never gain these:

- **Character spawn**: `spawnCharacters.ts` queries `where: { factionId: { not: null } }` — no generals spawn at unowned places; a spawned general is created with `factionId: place.factionId` (it joins that place's faction)
- **Auto admin assignment**: `assignAdmins.ts` queries `where: { factionId: { not: null }, administratorId: null }`
- **Manual admin assignment**: `POST /api/admin/assign-admin` returns **400** `"Cannot assign administrator to an unowned place"` when `place.factionId` is null
- If legacy data violates this (e.g. an admin left behind after a rule change), clear it once: `prisma.place.updateMany({ where: { factionId: null, administratorId: { not: null } }, data: { administratorId: null } })`

### Spawn Round Rules (Phase 2 + Phase 9)

- `spawnCharacters.ts` returns `string[]` of IDs spawned this round (it also assigns admins, see below); `runRound.ts` passes them to `aiMove(worldId, round, rng, skipIds)` as a `Set` — **characters spawned in a round never move in that round** (no movement, no `CHARACTER_MOVED` event in the spawn round)
- **Spawn admin assignment** (done inside `spawnCharacters.ts` right after creation, so economy/assignAdmins see it the same round):
  1. Spawn place vacant (or its admin is dead) → assign the new leader directly (`lastPromotedRound = round`, `ADMIN_ASSIGNED` event)
  2. Current admin is the living **king** → king keeps his seat, no comparison
  3. Otherwise compare **total ability `wu + tong + jing`** (new leader vs current admin); only a **strictly greater** total replaces the admin
  4. On replacement: old admin's ambition **increases** by `CONFIG.AMBITION_ADMIN_REPLACED_DELTA` (1, clamped to `CHAR_AMBITION_MAX`), logged as an `ADMIN_REMOVED` Event **and** an `AmbitionEvent`
- `Place.administratorId` is globally unique (`@unique`) — a character administers at most one place

### Map Spotlight & Move Animation

- `GET /api/world/state?round=N` returns `spotlights: Array<{placeId, kind: 'created'|'attacked'}>` and `moves: Array<{fromPlaceId, toPlaceId, factionId}>` (computed from the events table; works for both snapshot and live paths)
- Spotlight window: rounds `N - CONFIG.SPOTLIGHT_ROUNDS + 1 .. N` (with `SPOTLIGHT_ROUNDS: 1` → only round `N`) over `PLACE_CREATED` (kind `created`) and `PLACE_CAPTURED`/`BATTLE_DEATH`/`ESCAPE_SUCCESS` (kind `attacked`; `created` wins ties)
- `moves` includes only `CHARACTER_MOVED` events with `round === N` (the displayed round exactly)
- `CHARACTER_MOVED` events are written by `server/moveEvent.ts#recordMove()` from all four `aiMove.ts` movement sites and the three `battle.ts` escape sites; no-op when `fromPlaceId === toPlaceId`
- Animation timing lives in `gameConfig.ts`: `SPOTLIGHT_ROUNDS: 1`, `MOVE_ANIM_DURATION: 1500`, `MOVE_ANIM_PAUSE: 2500`
- **Z-order**: the overlay `<canvas>` paints first (below), the sigma container div paints last (above) — so place labels always render on top of spotlight rings. Keep that DOM order.
- **Label visibility**: node labels use one zoom rule — `labelRenderedSizeThreshold: CONFIG.LABEL_SIZE_THRESHOLD` (8) in `SigmaMap.tsx`. Tune the threshold in `gameConfig.ts`, not inline.
- `GET /api/world/events?round=N` applies read-time enrichment to `CHARACTER_MOVED`: adds `fromPlaceName`/`toPlaceName` by joining `places` (events themselves store only placeIds)

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

---

*This guide is for AI agents working on the Autonomous World project. For human developers, see README.md.*

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
