# Autonomous World — 技術文檔 / Technology Documentation

本文檔詳細說明 Autonomous World 專案使用的所有技術及其運作方式。
This document details all technologies used in the Autonomous World project and how they work together.

---

## 目錄 / Table of Contents

1. [技術架構總覽 / Technology Stack Overview](#技術架構總覽--technology-stack-overview)
2. [Next.js 16 (App Router)](#nextjs-16-app-router)
3. [Auth.js v5 (next-auth)](#authjs-v5-next-auth)
4. [Prisma 7](#prisma-7)
5. [TypeScript](#typescript)
6. [TailwindCSS 4](#tailwindcss-4)
7. [TanStack Query (React Query)](#tanstack-query-react-query)
8. [Zod (Schema Validation)](#zod-schema-validation)
9. [React Compiler](#react-compiler)
10. [Vitest (測試框架)](#vitest-測試框架)
11. [遊戲核心系統 / Game Core Systems](#遊戲核心系統--game-core-systems)
12. [國際化 / Internationalization (i18n)](#國際化--internationalization-i18n)
13. [部署與環境 / Deployment & Environment](#部署與環境--deployment--environment)

---

## 技術架構總覽 / Technology Stack Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  React 19   │  │ TailwindCSS │  │     i18n (zh/en)       │ │
│  │  (Server    │  │     4       │  │                         │ │
│  │  Components)│  │             │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js 16 (App Router)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Routes    │  │    API      │  │     Server Actions      │ │
│  │   (SSR)     │  │   Routes    │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Server Layer (server/)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  runRound   │  │   Phases    │  │     Game Logic          │ │
│  │  (主迴圈)   │  │  (14 phases)│  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Database Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Prisma    │  │ PostgreSQL  │  │     Game State          │ │
│  │     7       │  │             │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next.js 16 (App Router)

### 版本資訊 / Version Info
- **Next.js**: 16.x (最新穩定版)
- **React**: 19.x
- **Node.js**: 20+

### App Router 架構 / App Router Architecture

Next.js 16 使用 App Router（基於檔案系統的路由）：

```
src/app/
├── api/                    # API 路由 (REST endpoints)
│   ├── auth/              # Auth.js 認證端點
│   │   └── [...nextauth]/ # OAuth 回調處理
│   ├── world/             # 遊戲世界資料端點
│   │   ├── state/         # GET /api/world/state
│   │   ├── characters/    # GET /api/world/characters
│   │   ├── factions/      # GET /api/world/factions
│   │   ├── places/        # GET /api/world/places
│   │   ├── roads/         # GET /api/world/roads
│   │   └── round/         # POST /api/world/round
│   └── admin/             # 管理員端點
│       └── round/         # POST /api/admin/round
├── page.tsx                # 首頁 (Server Component)
├── layout.tsx              # 全域佈局
└── globals.css             # 全域樣式
```

### Server Components vs Client Components

**Server Components (預設)**：
```typescript
// src/app/page.tsx
import { auth } from '@/lib/auth';

export default async function Page() {
  const session = await auth(); // 直接在伺服器端執行
  return <div>Welcome!</div>;
}
```

**Client Components (需要互動性)**：
```typescript
'use client';

import { useState } from 'react';

export function InteractiveComponent() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

### API Routes (REST Endpoints)

所有 API 路由位於 `src/app/api/`：

```typescript
// src/app/api/world/state/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const world = await prisma.world.findFirst({ where: { active: true } });
  return NextResponse.json(world);
}
```

---

## Auth.js v5 (next-auth)

### 版本資訊 / Version Info
- **next-auth**: 5.0.0-beta.32 (v5 beta)
- **@auth/prisma-adapter**: 2.x

### 認證流程 / Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │   Next.js    │     │   Google     │
│   (Browser)  │     │   Server     │     │   OAuth      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  1. Click Login    │                    │
       │───────────────────>│                    │
       │                    │  2. Redirect to    │
       │                    │     Google OAuth   │
       │<───────────────────│                    │
       │                    │                    │
       │  3. User grants    │                    │
       │     permission     │                    │
       │────────────────────────────────────────>│
       │                    │                    │
       │  4. Callback with  │                    │
       │     auth code      │                    │
       │<────────────────────────────────────────│
       │                    │                    │
       │                    │  5. Exchange code  │
       │                    │     for tokens     │
       │                    │───────────────────>│
       │                    │                    │
       │                    │  6. Return user    │
       │                    │     info           │
       │                    │<───────────────────│
       │                    │                    │
       │  7. Set session    │                    │
       │     cookie         │                    │
       │<───────────────────│                    │
```

### Auth.js v5 API 差異 / Auth.js v5 API Differences

**重要**：v5 API 與 v4 有顯著差異：

```typescript
// ❌ v4 (已棄用)
import { getSession } from 'next-auth/react';
const session = await getSession();

// ✅ v5 (正確)
import { auth } from '@/lib/auth';
const session = await auth();
```

### JWT 策略 / JWT Strategy

本專案使用 JWT 策略進行 session 管理：

```typescript
// src/lib/auth.ts
const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',  // 使用 JWT 而非資料庫 session
  },
  callbacks: {
    async jwt({ token, user }) {
      // 首次登入時，將使用者 email 加入 token
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      // 將 email 加入 session 物件
      if (session.user && token.email) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
});
```

### 管理員偵測 / Admin Detection

```typescript
export async function isAdmin(session: Session | null): Promise<boolean> {
  if (!session?.user?.email) return false;

  const adminEmails = (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(session.user.email.toLowerCase());
}
```

---

## Prisma 7

### 版本資訊 / Version Info
- **prisma**: 7.10.0
- **@prisma/client**: 7.10.0
- **Database**: PostgreSQL

### Prisma 7 配置差異 / Prisma 7 Configuration Differences

**重要**：Prisma 7 需要 `prisma.config.ts` 檔案：

```typescript
// prisma.config.ts (專案根目錄)
import 'dotenv/config';  // 必須先載入 .env 檔案
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),  // 使用 env() 助手函數
  },
});
```

**重要**：
1. 必須安裝 `dotenv` 套件：`pnpm add dotenv`
2. 必須先 `import 'dotenv/config'` 載入環境變數
3. 使用 `env('DATABASE_URL')` 而非 `process.env.DATABASE_URL`

**schema.prisma 差異**：
```prisma
// ❌ Prisma 6 (已棄用)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Prisma 7 不再使用
}

// ✅ Prisma 7 (正確)
datasource db {
  provider = "postgresql"
  // url 由 prisma.config.ts 處理
}
```

### 資料模型 / Data Models

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model World {
  id          String   @id @default(cuid())
  name        String
  currentRound Int     @default(0)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // 關聯 / Relations
  places      Place[]
  characters  Character[]
  factions    Faction[]
  roads       Road[]

  // 反向關聯（Prisma 7 必需）
  @@index([active])
}

model Place {
  id            String   @id @default(cuid())
  name          String
  factionId     String?
  administratorId String?
  garrison      Int      @default(0)
  fortress      Int      @default(0)
  market        Int      @default(0)
  barracks      Int      @default(0)
  layoutX       Float
  layoutY       Float

  // 關聯
  world         World    @relation(fields: [worldId], references: [id])
  worldId       String
  faction       Faction? @relation(fields: [factionId], references: [id])
  administrator Character? @relation(fields: [administratorId], references: [id])

  @@index([factionId])
  @@index([administratorId])
}

model Character {
  id          String   @id @default(cuid())
  name        String
  factionId   String?
  wu          Int      @default(0)  // 武力 / Martial
  tong        Int      @default(0)  // 統御 / Command
  jing        Int      @default(0)  // 智謀 / Strategy
  speed       Int      @default(0)  // 速度 / Speed
  loyalty     String   @default("SELF")
  ambition    Int      @default(0)
  age         Int
  placeId     String?
  troops      Int      @default(0)
  gold        Int      @default(0)
  alive       Boolean  @default(true)
  isKing      Boolean  @default(false)

  // 關聯
  world       World    @relation(fields: [worldId], references: [id])
  worldId     String
  faction     Faction? @relation(fields: [factionId], references: [id])
  place       Place?   @relation(fields: [placeId], references: [id])

  @@index([factionId])
  @@index([placeId])
  @@index([alive])
}

model Faction {
  id          String   @id @default(cuid())
  name        String
  color       String
  alive       Boolean  @default(true)
  collapsing  Boolean  @default(false)
  kingId      String?

  // 關聯
  world       World    @relation(fields: [worldId], references: [id])
  worldId     String
  king        Character? @relation(fields: [kingId], references: [id])
  places      Place[]
  characters  Character[]

  @@index([alive])
}

model Road {
  id    String @id @default(cuid())
  aId   String
  bId   String

  // 關聯
  world  World  @relation(fields: [worldId], references: [id])
  worldId String

  @@unique([aId, bId])
  @@index([aId])
  @@index([bId])
}
```

### Prisma Client 使用方式 / Prisma Client Usage

```typescript
import { prisma } from '@/lib/prisma';

// 單例模式 (避免多個連接)
export const prisma = new PrismaClient();

// 查詢
const world = await prisma.world.findFirst({
  where: { active: true },
  include: {
    places: true,
    characters: true,
    factions: true,
  },
});

// 建立
const newCharacter = await prisma.character.create({
  data: {
    name: '曹操',
    wu: 25,
    tong: 28,
    jing: 20,
    speed: 18,
    age: 35,
    worldId: world.id,
  },
});

// 更新
await prisma.character.update({
  where: { id: newCharacter.id },
  data: { troops: 500 },
});

// 批次操作
await prisma.character.updateMany({
  where: { alive: true, age: { gte: 70 } },
  data: { alive: false },
});
```

---

## TypeScript

### 版本資訊 / Version Info
- **TypeScript**: 5.x
- **Strict Mode**: 啟用

### 路徑別名 / Path Aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**使用方式**：
```typescript
// ✅ 正確
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// ❌ 錯誤
import { prisma } from '../../lib/prisma';
```

### 型別安全 / Type Safety

```typescript
// 自訂型別
type Locale = 'zh' | 'en';

interface WorldState {
  world: World;
  places: Place[];
  characters: Character[];
  factions: Faction[];
  roads: Road[];
}

// 嚴格型別檢查
function getConfig(key: ConfigKey): number {
  return CONFIG[key];
}

// 不使用 as any 或 @ts-ignore
```

---

## TailwindCSS 4

### 版本資訊 / Version Info
- **TailwindCSS**: 4.x
- **PostCSS**: 8.x

### 設定 / Configuration

```css
/* src/app/globals.css */
@import 'tailwindcss';
```

### 使用方式 / Usage

```typescript
// Server Component
export function Card({ title }: { title: string }) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  );
}

// Client Component
'use client';

export function Button({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
    >
      Click me
    </button>
  );
}
```

---

## TanStack Query (React Query)

### 版本資訊 / Version Info
- **@tanstack/react-query**: 5.x

### 概述 / Overview

TanStack Query 是一個強大的資料取得和快取庫，用於管理伺服器狀態。它自動處理：
- 載入和錯誤狀態
- 資料快取和背景重新整理
- 請求去重和合併
- 離線支援

### 設定 / Configuration

```typescript
// src/lib/queryClient.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 60 秒
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### 使用方式 / Usage

```typescript
// src/app/game/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';

export default function GamePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['worldState', selectedRound],
    queryFn: async () => {
      const response = await fetch(`/api/world/state?round=${selectedRound}`);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    staleTime: 30 * 1000, // 30 秒內資料是新鮮的
  });

  if (isLoading) return <div>載入中...</div>;
  if (error) return <div>錯誤：{error.message}</div>;
  
  return <div>{/* 渲染資料 */}</div>;
}
```

### 為什麼使用 TanStack Query？/ Why TanStack Query？

| 問題 | 解決方案 |
|------|----------|
| setState 在 effect 中導致級聯渲染 | 自動管理載入/錯誤狀態 |
| 手動快取 | 內建快取和背景重新整理 |
| 重複請求 | 請求去重和合併 |
| 離線支援 | 離線快取和重新驗證 |

---

## Zod (Schema Validation)

### 版本資訊 / Version Info
- **zod**: 4.x

### 概述 / Overview

Zod 是一個 TypeScript-first 的schema 驗證庫，用於：
- API 請求參數驗證
- 表單輸入驗證
- 資料轉換和清理
- 型別安全的錯誤處理

### 設定 / Configuration

```typescript
// src/lib/validations.ts
import { z } from 'zod';

// 取得世界狀態的查詢參數驗證
export const WorldStateQuerySchema = z.object({
  round: z.coerce
    .number()
    .int()
    .min(0, '回合數必須為非負整數'),
});

// 重置世界的請求本體驗證
export const ResetWorldBodySchema = z.object({
  name: z
    .string()
    .min(1, '世界名稱為必填')
    .max(100, '世界名稱不能超過 100 個字元'),
  confirm: z.literal(true, '需要確認'),
});

// 型別匯出
export type WorldStateQuery = z.infer<typeof WorldStateQuerySchema>;
export type ResetWorldBody = z.infer<typeof ResetWorldBodySchema>;
```

### 使用方式 / Usage

```typescript
// src/app/api/world/state/route.ts
import { WorldStateQuerySchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // 使用 Zod 驗證查詢參數
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
  // round 已經是 number 型別，可以直接使用
}
```

### 為什麼使用 Zod？/ Why Zod？

| 優勢 | 說明 |
|------|------|
| 型別安全 | 自動推斷 TypeScript 型別 |
| 運行時驗證 | 在 API 邊界驗證所有輸入 |
| 可讀的錯誤訊息 | 中英文錯誤訊息 |
| 轉換功能 | 自動轉換字串為數字等 |

---

## React Compiler

### 版本資訊 / Version Info
- **babel-plugin-react-compiler**: 1.0.0

### 概述 / Overview

React Compiler 是一個自動優化工具，它：
- 自動記憶化元件和 Hooks
- 減少不必要的重新渲染
- 無需手動使用 `useMemo`、`useCallback`
- 提升應用程式效能

### 設定 / Configuration

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 啟用 React Compiler — 自動優化元件渲染
  reactCompiler: true,
};

export default nextConfig;
```

### 工作原理 / How It Works

React Compiler 在建置時分析您的程式碼：
1. 識別元件和 Hooks
2. 分析依賴關係
3. 自動插入記憶化程式碼
4. 優化重新渲染

### 為什麼使用 React Compiler？/ Why React Compiler？

| 傳統方式 | React Compiler |
|----------|----------------|
| 手動 `useMemo` | 自動記憶化 |
| 手動 `useCallback` | 自動優化 |
| 容易遺漏優化 | 自動分析所有依賴 |
| 程式碼冗餘 | 程式碼更簡潔 |

### 注意事項 / Notes

- React Compiler 目前不支援所有進階模式
- 某些邊緣情況可能需要手動優化
- 建議在啟用前進行效能測試

---

## Vitest (測試框架)

### 版本資訊 / Version Info
- **vitest**: 5.0.0
- **@testing-library/react**: 16.x
- **@testing-library/jest-dom**: 6.x

### 設定 / Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 測試範例 / Test Examples

```typescript
// src/lib/rng.test.ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('RNG', () => {
  it('should be deterministic with same seed', () => {
    const rng1 = createRng('test-seed');
    const rng2 = createRng('test-seed');
    
    for (let i = 0; i < 100; i++) {
      expect(rng1.random()).toBe(rng2.random());
    }
  });

  it('should generate different values with different seeds', () => {
    const rng1 = createRng('seed-1');
    const rng2 = createRng('seed-2');
    
    const values1 = Array.from({ length: 10 }, () => rng1.random());
    const values2 = Array.from({ length: 10 }, () => rng2.random());
    
    expect(values1).not.toEqual(values2);
  });
});
```

### 執行測試 / Running Tests

```bash
# 執行所有測試
pnpm test

# 監聽模式
pnpm test:watch

# 覆蓋率報告
pnpm test:coverage
```

---

## 遊戲核心系統 / Game Core Systems

### 隨機數生成器 (RNG)

確定性隨機數生成器，使用 seed 確保可重現：

```typescript
// src/lib/rng.ts
import seedrandom from 'seedrandom';

export type Rng = {
  random: () => number;
  chance: (p: number) => boolean;
  int: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T | undefined;
  shuffle: <T>(arr: T[]) => T[];
};

export function createRng(seed: string): Rng {
  const rng = seedrandom(seed);
  return {
    random: () => rng(),
    chance: (p) => rng() < p,
    int: (min, max) => Math.floor(rng() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    shuffle: (arr) => [...arr].sort(() => rng() - 0.5),
  };
}
```

### 名稱生成器 / Name Generators

#### 人名生成器
```typescript
// src/lib/nameGenerator/person.ts
export function generatePersonName(rng: Rng): string {
  const surname = rng.pick(SURNAMES);  // 百家姓
  const given1 = rng.pick(GIVEN_CHARS);  // 常用名字字
  
  if (rng.chance(0.2)) {
    // 20% 機率產生 3 字名
    const given2 = rng.pick(GIVEN_CHARS);
    return `${surname}${given1}${given2}`;
  }
  return `${surname}${given1}`;
}
```

#### 地名生成器
```typescript
// src/lib/nameGenerator/place.ts
export function generatePlaceName(rng: Rng): string {
  const adj = rng.pick(ADJECTIVES);  // 形容詞
  const terrain = rng.pick(TERRAINS);  // 地形
  return `${adj}${terrain}`;  // 例如：青雲城、落霞關
}
```

#### 勢力名稱生成器
```typescript
// src/lib/nameGenerator/faction.ts
export function generateFactionName(rng: Rng): string {
  const desc = rng.pick(DESCRIPTORS);  // 描述詞
  const noun = rng.pick(NOUNS);  // 名詞
  const suffix = rng.pick(SUFFIXES);  // 組織後綴
  
  const roll = rng.random();
  if (roll < 0.4) return `${desc}${noun}${suffix}`;  // 3字
  if (roll < 0.7) return `${desc}${noun}${rng.pick(NOUNS)}${suffix}`;  // 4字
  // ...
}
```

### 快照壓縮 / Snapshot Compression

使用 gzip 壓縮遊戲狀態以減少資料傳輸：

```typescript
// src/lib/snapshot.ts
import { gzipSync, gunzipSync } from 'zlib';

export function compressSnapshot(state: WorldState): Buffer {
  const json = JSON.stringify(state);
  return gzipSync(Buffer.from(json, 'utf-8'));
}

export function decompressSnapshot(compressed: Buffer): WorldState {
  const json = gunzipSync(compressed).toString('utf-8');
  return JSON.parse(json) as WorldState;
}
```

### 遊戲設定 / Game Configuration

所有可調整的遊戲數值集中在 `gameConfig.ts`：

```typescript
// src/lib/gameConfig.ts
export const CONFIG = {
  // 地點 / Places
  PLACE_INITIAL_COUNT: 100,      // 初始地方數量
  PLACE_MAX_COUNT: 2000,         // 最大地方數量
  PLACE_NEW_PER_ROUND: 1,        // 每回合新增地方

  // 道路 / Roads
  ROAD_MAX_PER_PLACE: 3,         // 每個地方最多連接道路
  ROAD_NEW_PER_PLACE_MIN: 1,     // 新地方最少道路
  ROAD_NEW_PER_PLACE_MAX: 3,     // 新地方最多道路

  // 角色 / Characters
  CHAR_START_AGE: 20,
  CHAR_MAX_AGE_MIN: 50,
  CHAR_MAX_AGE_MAX: 80,
  CHAR_ABILITY_MIN: 5,
  CHAR_ABILITY_MAX: 30,
  CHAR_SPEED_MEAN: 17,           // 速度常態分佈平均值
  CHAR_SPEED_SIGMA: 5,           // 速度常態分佈標準差
  CHAR_AMBITION_MEAN: 17,        // 野心常態分佈平均值
  CHAR_AMBITION_SIGMA: 5,        // 野心常態分佈標準差

  // 經濟 / Economy
  PLACE_BASE_INCOME: 10,
  INCOME_KING_SHARE: 0.40,
  INCOME_ADMIN_SHARE: 0.30,
  INCOME_OTHER_SHARE: 0.30,

  // 戰鬥 / Battle
  BATTLE_RANDOM_MIN: 0.85,
  BATTLE_RANDOM_MAX: 1.15,

  // 信號 / Signals
  SIGNAL_RANGE: 2,
  SIGNAL_DURATION: 5,
  SIGNAL_COOLDOWN: 10,
} as const;
```

### 種子腳本 / Seed Script

`prisma/seed.ts` 初始化遊戲世界：
- 使用 `createRng()` 確保可重現性
- 使用 `generatePlaceName()` 生成地方名稱
- 使用 `generatePersonName()` 生成角色名稱
- 使用 `generateFactionName()` 生成勢力名稱
- 所有數值來自 `CONFIG`

初始狀態：
- 1 個世界
- 100 個地方
- 道路連接
- 1 個角色（國王）
- 1 個勢力

---

## 國際化 / Internationalization (i18n)

### 支援語言 / Supported Languages
- **zh** (繁體中文) — 預設
- **en** (English)

### 翻譯檔案結構 / Translation File Structure

```typescript
// src/lib/i18n/zh.ts
export const zh = {
  general: {
    title: '自治世界',
    subtitle: '瀏覽器中的三國模擬',
  },
  character: {
    wu: '武力',
    tong: '統御',
    jing: '智謀',
    speed: '速度',
  },
  events: {
    battle: '戰鬥',
    battleDesc: '{attacker} 攻打 {place}',
  },
} as const;
```

### 使用方式 / Usage

```typescript
import { t, getLocale, setLocale } from '@/lib/i18n';

// 取得翻譯
const title = t('general.title');  // "自治世界" 或 "Autonomous World"

// 帶插值的翻譯
const desc = t('events.battleDesc', { attacker: '曹操', place: '洛陽' });
// "曹操 攻打 洛陽"

// 切換語言
setLocale('en');  // 儲存到 localStorage 並重新載入

// 取得當前語言
const locale = getLocale();  // 'zh' 或 'en'
```

---

## 部署與環境 / Deployment & Environment

### 環境變數 / Environment Variables

```bash
# .env.example
DATABASE_URL="postgresql://user:password@localhost:5432/autonomous_world"
AUTH_SECRET="your-auth-secret-here"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
ADMIN_EMAIL="admin@example.com,other@example.com"
```

### 開發指令 / Development Commands

```bash
# 安裝依賴
pnpm install

# 開發伺服器
pnpm dev

# 建構
pnpm build

# 啟動
pnpm start

# 型別檢查
pnpm typecheck

# 程式碼檢查
pnpm lint

# 測試
pnpm test

# Prisma 操作
pnpm prisma:generate    # 產生 Prisma Client
pnpm prisma:migrate     # 執行遷移

# 資庫種子
npx tsx prisma/seed.ts  # 初始化遊戲資料
```

### 資料庫遷移 / Database Migrations

```bash
# 建立新遷移
pnpm prisma migrate dev --name add_new_field

# 套用遷移到生產環境
pnpm prisma migrate deploy

# 重置資料庫（危險！）
pnpm prisma migrate reset
```

---

## 總結 / Summary

Autonomous World 使用現代化的技術棧：

1. **Next.js 16** — 提供 SSR、API Routes、Server Components
2. **Auth.js v5** — 處理 Google OAuth 認證
3. **Prisma 7** — 型別安全的資料庫 ORM
4. **TypeScript** — 嚴格型別檢查
5. **TailwindCSS 4** — 實用優先的 CSS 框架
6. **Vitest** — 快速的單元測試框架

這些技術共同提供：
- ✅ 型別安全 (Type Safety)
- ✅ 高效能 (Performance)
- ✅ 可維護性 (Maintainability)
- ✅ 開發者體驗 (Developer Experience)
- ✅ 國際化支援 (i18n Support)

---

*最後更新 / Last Updated: 2026-09-14*
