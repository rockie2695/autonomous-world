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
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
});
```

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
├── runRound.ts            # Main game loop orchestrator
└── phases/                # Individual game phases (14 total)
    ├── spawnPlaces.ts     # Phase 1
    ├── spawnCharacters.ts # Phase 2
    └── ...               # Phases 3-14
```

## Development Guidelines

### Adding New Features

1. **Game mechanics**: Add to `server/runRound.ts` or create new phase files in `server/phases/`
2. **UI components**: Create in `src/app/` or as shared components
3. **API routes**: Add to `src/app/api/` following existing patterns
4. **Config values**: Always add tunable values to `src/lib/gameConfig.ts`

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
```

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
pnpm build
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
