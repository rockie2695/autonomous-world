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
12. [地圖視覺化 / Map Visualization](#地圖視覺化--map-visualization)
13. [國際化 / Internationalization (i18n)](#國際化--internationalization-i18n)
14. [部署與環境 / Deployment & Environment](#部署與環境--deployment--environment)

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
│   │   ├── current/       # GET /api/world/current
│   │   ├── state/         # GET /api/world/state?round=N
│   │   ├── rounds/        # GET /api/world/rounds
│   │   ├── events/        # GET /api/world/events?round=N
│   │   └── stats/         # GET /api/world/stats?from=A&to=B
│   ├── public/            # 免登入唯讀端點（僅供首頁）/ unauthenticated read-only, homepage only
│   │   └── world/         # GET /api/public/world
│   └── admin/             # 管理員端點
│       ├── run-round/     # POST /api/admin/run-round
│       ├── reset-world/   # POST /api/admin/reset-world
│       └── assign-admin/  # POST /api/admin/assign-admin
├── game/                  # 主遊戲頁面（含 SigmaMap、EventLog、StatsCharts）
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

#### 認證分界 / The Authentication Boundary

`/api/world/*` 與 `/api/admin/*` 全部需要登入。首頁只服務**未登入**訪客（已登入者
會被 `redirect('/game')` 導走），所以首頁若要顯示真實世界資料，必須有一條不需
認證的讀取路徑——這就是 `GET /api/public/world` 存在的原因。
Every `/api/world/*` and `/api/admin/*` route requires a session. The homepage
serves **signed-out** visitors only (a signed-in visitor is redirected to
`/game`), so the homepage needs an unauthenticated read path to show real world
data. That is the only reason `GET /api/public/world` exists.

| 端點 / Endpoint | 認證 / Auth | 用途 / Purpose |
|---|---|---|
| `/api/world/*` | 需要 / required | 遊戲頁的完整世界狀態 / the game page's full state |
| `/api/admin/*` | 管理員 / admin | 推進回合、重置世界 / run rounds, reset the world |
| `/api/public/world` | **刻意不需要** / intentionally none | 首頁的聚合現況 / the homepage's aggregated snapshot |

`/api/public/world` 的邊界 / The boundaries of `/api/public/world`:

- **嚴格唯讀**：沒有任何寫入路徑，也沒有 admin 或 session 相關的表面。
  Strictly read-only: no mutation path, no admin or session surface.
- **不回傳個人資料**：只有據點名稱、勢力名稱與聚合計數。
  No personal data: settlement names, faction names, and aggregate counts only.
- **計數永遠完整，圖譜會下采樣**。世界最大可有 `CONFIG.PLACE_MAX_COUNT`（2000）
  個據點，首頁只取 400 個（`graph.truncated` 標示是否被截斷）。抽樣方式是先把
  佈局切成方格、格內依駐軍排序、再每格輪流取值——直接「依駐軍取前 400」會挑出
  空間上散落的據點，圖會退化成一堆孤立光點。
  Counts are always complete; the graph is down-sampled. The world can hold up to
  `CONFIG.PLACE_MAX_COUNT` (2000) settlements and the homepage takes 400, with
  `graph.truncated` saying so. Sampling buckets the layout into a grid, ranks each
  bucket by garrison, then fills round-robin — taking the top 400 by garrison
  directly would scatter them and collapse the graph into loose dots.
- 這個取捨是為了讓首頁的輪詢成本可控。`response` 帶 `Cache-Control: no-store`。
  The trade-off exists to keep the homepage's polling cost bounded. The response
  carries `Cache-Control: no-store`.

回應型別定義在 `src/lib/publicWorld.ts`，而不是 route 檔本身——元件不該從
`app/api` 反向引入型別。
The response type lives in `src/lib/publicWorld.ts` rather than in the route
file, so components never import types back out of the API layer.

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
  tong        Int      @default(0)  // 統領 / Leadership
  jing        Int      @default(0)  // 經濟 / Economy
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

// 單例模式（使用 PrismaPg driver adapter，避免多個連接）
// Singleton pattern (uses PrismaPg driver adapter to avoid multiple connections)
// 實際建立方式 / Actual creation:
//   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
//   return new PrismaClient({ adapter });

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

### 設計 token 層 / Design Token Layer

本專案**不使用 CSS 變數搭配自訂元件類**。所有設計值只寫一次，放在
`globals.css` 的 `@theme static` 區塊，由 Tailwind 產生原生 utility。
This project does **not** use CSS variables paired with bespoke component
classes. Every design value is written exactly once in the `@theme static`
block in `globals.css`, and Tailwind turns it into native utilities.

```css
@theme static {
  --color-ds-void: #020617;                              /* bg-ds-void   */
  --color-ds-cyan: #22d3ee;                              /* text-ds-cyan */
  --color-ds-amber: #f5b544;                             /* 結晶格環用 / lattice ring only */
  --color-ds-panel: rgba(15, 23, 42, 0.55);              /* bg-ds-panel  */
  --text-ds-label: 0.8125rem;                            /* text-ds-label */
  --radius-ds-panel: 14px;                               /* rounded-ds-panel */
  --shadow-ds-hero: 0 24px 70px rgba(2, 6, 23, 0.8);     /* shadow-ds-hero */
  --ease-ds: cubic-bezier(0.22, 0.61, 0.36, 1);          /* ease-ds      */
  --animate-ds-shimmer: ds-shimmer 1.6s ease-in-out infinite;
}
```

**為什麼是 `static`**：Tailwind 預設會搖掉沒被任何 utility 用到的主題變數。
若宣告成 `@theme`（非 static），一旦某個變數暫時沒有 utility 引用，它就不會被
輸出到 `:root`，而下面那些相容別名就會指向未定義。`static` 強制全部輸出。
**Why `static`**: by default Tailwind tree-shakes theme variables nothing uses. A
plain `@theme` block would stop emitting a variable the moment no utility
referenced it, and the compatibility aliases below would dangle. `static`
forces every one of them out.

### `:root` 相容別名 / `:root` Compatibility Aliases

`:root` 裡的 `--ds-*` **不是**另一份值，而是指回 `@theme` 的別名。
The `--ds-*` names in `:root` are not a second copy of the values — they are
aliases pointing back at `@theme`.

```css
:root {
  --ds-cyan: var(--color-ds-cyan);
  --ds-panel: var(--color-ds-panel);
  /* … */
}
```

**唯一的例外是 `--ds-section-y`**（區段間距）。`@theme` 沒有對應的命名空間，
所以它直接留在 `:root`。
The one exception is `--ds-section-y` (section rhythm). `@theme` has no
namespace for it, so it stays in `:root`.

### 使用規則 / Rules

1. **新增設計值 → 加在 `@theme static`**，不要在 TSX 裡寫死色票、字級、間距、
   圓角、陰影或時長。
   New design value → add it to `@theme static`. Never hardcode a colour, size,
   spacing, radius, shadow, or duration in TSX.
2. **用 utility 表達表面**，不要新增自訂元件類別。`src/app/page.tsx` 與
   `src/app/game/page.tsx` 頂端各有一組模組層級的常數，把重複的 utility 字串
   收在一處，避免同一串類別在多檔之間漂移。
   Express surfaces with utilities; do not add bespoke component classes. Each
   of `src/app/page.tsx` and `src/app/game/page.tsx` declares its repeated
   utility strings once at module scope so the same class list cannot drift
   between files.
3. **同層覆寫要加 important 修飾符（後綴 `!`）**。過去自訂類別在
   `@layer components`、utility 在 `utilities` 層，前者永遠輸給後者。現在兩者
   同層，這條保護消失，刻意要覆寫時必須寫 `text-xs!`。
   Intra-layer overrides need the important modifier (suffix `!`). Bespoke
   classes used to live in `@layer components` and utilities in `utilities`, so
   the class always lost. Both are now in one layer, so a deliberate override
   must say `text-xs!`.
4. **偽元素用 `before:` / `after:` 變體**，不要寫 `::before` 規則。
   Pseudo-elements go through the `before:` / `after:` variants.
5. **指標相關行為**用 `@media (hover: hover)` 包裹；觸控目標用 Tailwind 的
   `pointer-coarse:` 變體。
   Pointer-only behaviour goes inside `@media (hover: hover)`; touch targets use
   Tailwind's `pointer-coarse:` variant.

### 僅存的兩個自訂類別 / The Only Two Custom Classes

整個專案只剩下兩條自訂類別，理由只有一個：捲軸偽元素不是 utility 能表達的東西。
Only two custom classes remain in the whole project, for a single reason:
scrollbar pseudo-elements are not something a utility can express.

```css
.ds-gm-scroll   /* scrollbar-width / scrollbar-color + ::-webkit-scrollbar */
.ds-gm-noscroll /* 完全隱藏捲軸 / hides the scrollbar entirely */
```

另有三類規則以純 CSS 保留，因為它們本質上就是選擇器而非樣式：
Three kinds of rule also stay as plain CSS, because they are selectors rather
than styles:

| 規則 / Rule | 為什麼 / Why |
|---|---|
| `:where(button, a, …):focus-visible` | 偽類別選擇器 / pseudo-class selector |
| `@media (pointer: coarse) { [role='tab'] { … } }` | role 屬性選擇器 / role attribute selector |
| `@layer base { button:not(:disabled) { cursor: pointer } }` | 全域預設值 / a global default |

以及一個 `@utility`：`ds-nav-underline`。用 `@utility` 而非普通類別，是為了讓
`aria-current` 變體仍然能疊加上它的 `::after`。
And one `@utility`: `ds-nav-underline`. It is an `@utility` rather than a plain
class so the `aria-current` variant still composes with its `::after`.

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

### 字型 / Fonts

`src/app/layout.tsx` 以 `next/font` 載入 **Orbitron**（顯示字體）與 **Inter**
（內文），並透過 CSS 變數 `--font-orbitron` / `--font-inter` 暴露。中文 fallback
為 `'PingFang TC', 'Microsoft JhengHei', sans-serif`。
`src/app/layout.tsx` loads **Orbitron** (display) and **Inter** (body) through
`next/font` and exposes them as `--font-orbitron` / `--font-inter`. The CJK
fallback chain is `'PingFang TC', 'Microsoft JhengHei', sans-serif`.


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
- **@testing-library/jest-dom**: 7.x

### 設定 / Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', '__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'server/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'server/**/*.test.ts', '**/*.d.ts'],
    },
    testTimeout: 10000,
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
// src/lib/rng.ts — mulberry32 實作（無外部依賴）
// src/lib/rng.ts — mulberry32 implementation (no external dependency)

export interface RngState {
  s: number;  // 內部 32 位元狀態 / Internal 32-bit state
}

export function createRng(seed: string, initialState?: string): Rng {
  // FNV-1a 雜湊種子字串為 32 位元整數
  // Hash seed string to 32-bit integer using FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  const state: RngState = initialState
    ? JSON.parse(initialState)
    : { s: h >>> 0 };

  return new Rng(state);
}

export class Rng {
  // random(), int(min,max), pick(arr), shuffle(arr),
  // gaussian(mean,sigma,min,max), float(min,max), chance(p),
  // getState() → JSON 字串 / JSON string
  // mulberry32 步驟 / mulberry32 step:
  //   let t = (this.state.s += 0x6d2b79f5);
  //   t = Math.imul(t ^ (t >>> 15), t | 1);
  //   t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  //   return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
```

### 名稱生成器 / Name Generators

人名、勢力名與地名各有**兩種風格**，依 `gameConfig.ts` 的機率混合產生：

| 風格 | 機率設定 | 人名 | 勢力名 | 地名 |
|------|---------|------|--------|------|
| 傳統 / classic | 預設 65% | 張飛（姓+名） | 蒼龍盟（修飾+名詞+後綴） | 青碧城（修飾×2+地形） |
| 稱號 / epithet | 預設 35% | 霜狼·蓋爾（稱號+外來名） | 霜脊議會（稱號+組織類型） | 霜狼關（稱號+地形） |

```typescript
// src/lib/gameConfig.ts
PERSON_EPITHET_NAME_RATE: 0.35,   // 設為 0 可完全關閉稱號風格
FACTION_EPITHET_NAME_RATE: 0.35,
PLACE_EPITHET_NAME_RATE: 0.35,
```

#### 共用稱號元件
```typescript
// src/lib/nameGenerator/epithet.ts
export const EPITHET_SEPARATOR = '·';
export const EPITHET_HEADS: readonly string[];  // 24 個自然／材質字（霜 赤 幽 鐵 灰 潮…）
export const EPITHET_TAILS: readonly string[];  // 24 個動物／地形／力量字（狼 潮 光 壁 鷲 聲…）
export const EPITHET_COUNT = EPITHET_HEADS.length * EPITHET_TAILS.length;  // 576

export function epithetAt(index: number): string;  // 線性索引取稱號（掃描用，不消耗 RNG）
export function generateEpithet(rng: Rng): string;  // 例：霜狼
```

#### 人名生成器
```typescript
// src/lib/nameGenerator/person.ts
export function generatePersonName(rng: Rng): string {
  if (rng.chance(CONFIG.PERSON_EPITHET_NAME_RATE)) {
    return generateEpithetPersonName(rng);  // 霜狼·蓋爾
  }
  const surname = rng.pick(SURNAMES);  // 百家姓
  const given1 = rng.pick(GIVEN_CHARS);  // 常用名字字

  if (rng.chance(0.2)) {
    const given2 = rng.pick(GIVEN_CHARS);
    return `${surname}${given1}${given2}`;  // 3 字名
  }
  return `${surname}${given1}`;
}

// 專用產生器（測試與明確需求時直接呼叫）/ Explicit generator (tests, explicit needs)
export function generateEpithetPersonName(rng: Rng): string;  // [稱號]·[兩字外來名]
export function generatePersonNames(rng: Rng, count: number): string[];  // 允許重複
```

#### 地名生成器
```typescript
// src/lib/nameGenerator/place.ts
export const PLACE_ADJECTIVES: readonly string[] = [/* 81 個修飾字：氛圍形容詞 + 具体地物（岩/狼/龍）*/];
export const PLACE_TERRAINS: readonly string[] = [/* 57 個地形（含高地、前哨、津、埠、磯、峽）*/];

// 傳統風格容量（m1 ≠ m2）/ Classic capacity (m1 !== m2)
export const PLACE_NAME_CAPACITY =
  PLACE_ADJECTIVES.length * (PLACE_ADJECTIVES.length - 1) * PLACE_TERRAINS.length; // 369,360
// 稱號風格容量 / Epithet capacity
export const PLACE_EPITHET_CAPACITY = EPITHET_COUNT * PLACE_TERRAINS.length;  // 32,832
// 跨風格重疊（稱號首尾字都屬修飾字池）/ Cross-style overlap
export const PLACE_EPITHET_OVERLAP;  // 10,659 — 例如「雲影城」兩種風格都組得出
// 並集容量 = 369,360 + 32,832 − 10,659 / Union capacity
export const PLACE_TOTAL_NAME_CAPACITY;  // 391,533

export function generatePlaceName(rng: Rng): string {
  if (rng.chance(CONFIG.PLACE_EPITHET_NAME_RATE)) {
    return generateEpithetPlaceName(rng);  // 霜狼關
  }
  const m1 = rng.int(0, PLACE_ADJECTIVES.length - 1);
  let m2 = rng.int(0, PLACE_ADJECTIVES.length - 2);  // 排除 m1 / excludes m1
  if (m2 >= m1) m2++;
  return `${PLACE_ADJECTIVES[m1]}${PLACE_ADJECTIVES[m2]}${rng.pick([...PLACE_TERRAINS])}`;
  // 例如：青碧城, 灰岩高地, 黑曜要塞
}

// 已取名集合存在時走 fast path（64 次重試），否則確定性掃描傳統空間再掃稱號空間 → 保證唯一
export function generateUniquePlaceName(rng: Rng, taken: ReadonlySet<string>): string | null;
export function generatePlaceNames(rng: Rng, count: number): string[]; // 批量唯一命名
```

> `PLACE_TOTAL_NAME_CAPACITY` 必須是**並集**而非兩空間相加，否則「N 個不重複名稱」的
> 保證會少算重疊的 10,659 個。`place.test.ts` 會實際填滿整個並集來驗證。
> The total must be the union, not the sum, or the distinct-name guarantee
> under-counts the 10,659 overlapping names. `place.test.ts` fills the whole
> union to verify.

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

// 稱號風格：[稱號][兩字組織類型] / Epithet style: [epithet][2-char org type]
export function generateEpithetFactionName(rng: Rng): string;
export function generateFactionNames(rng: Rng, count: number): string[];  // 批量唯一命名
```

#### 名稱唯一性 / Unique Names

兩種風格都在掃描空間內，因此存活名稱不會跨風格撞名。
Both styles are covered by the scan spaces, so alive names never collide across styles.

```typescript
// fast path（64 次重試）+ 確定性掃描，掃描依序走兩個空間：
// Fast path (64 retries) + deterministic scan over two spaces, in order:
//   人名：SURNAMES×GIVEN_CHARS（8,000）→ 稱號×外來名（576×24 = 13,824）
//   勢力：DESCRIPTORS×NOUNS×SUFFIXES（40,000）→ 稱號×組織類型（576×12 = 6,912）
//   地名：PLACE_ADJECTIVES²（m1≠m2, 369,360）→ 稱號×地形（576×57 = 32,832）
export function generateUniqueFactionName(rng: Rng, taken: ReadonlySet<string>): string | null;
export function generateUniquePersonName(rng: Rng, taken: ReadonlySet<string>): string | null;
```

掃描起點取自 RNG，因此相同種子必定得到相同結果。
Scan start comes from the RNG, so the same seed always yields the same result.

#### 存活名稱唯一性 / Unique Alive Names

資料庫層唯一性由 `server/uniqueNames.ts` 提供（taken 集合只查 `alive: true`）：

```typescript
// server/uniqueNames.ts
export async function uniqueAliveFactionName(worldId: string, rng: Rng): string;
export async function uniqueAliveKingName(
  worldId: string, charId: string, currentName: string, rng: Rng): string;
// 國王：若現名在存活國王中唯一則直接回傳（零 RNG 消耗），否則改名
// 兩者皆有 numeric-suffix 不可達兜底；呼叫點：seed.ts、loyaltyCheck.ts、factionCollapse.ts
```

規則：**存活勢力名稱彼此唯一、存活國王名稱彼此唯一**；死亡後名稱釋放，不保證跨生命週期唯一。

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
- 使用 `generateUniquePlaceName()` 生成**兩個不相同形容詞 + 地形**的唯一地方名稱（adj1 ≠ adj2，容量 180,540）
- 使用 `generatePersonName()` 生成角色名稱
- 使用 `uniqueAliveFactionName()` / `uniqueAliveKingName()` 生成唯一存活勢力名稱與國王名稱
- 所有數值來自 `CONFIG`
- **先建立 round-0 快照**（此時 `currentRound` 仍為 0），**再**把 `currentRound` 設為 1：第一次「下一回合」執行回合 1、回傳 `round: 1`、`RND` 從 0000 前進到 0001（重設世界同理）
- 成功後 `process.exit(0)` 關閉 Prisma 連線池（否則共享 singleton 會讓腳本掛住）

初始狀態：
- 1 個世界
- 100 個地方
- 道路連接
- 1 個角色（國王）
- 1 個勢力
- round-0 快照 + `currentRound: 1`

### 遊戲數值公式 / Game Formulas

所有常數定義於 `src/lib/gameConfig.ts`（唯一真實來源）。以下公式與程式碼逐一核對。
All constants live in `src/lib/gameConfig.ts` (single source of truth). Every formula below is verified against the code.

#### 屬性作用 / What Each Stat Affects

| 屬性 Stat | 影響 Effect |
|---|---|
| `wu` 武力 | 戰鬥攻擊力 Battle attack power（`× (1 + wu/30)`） |
| `tong` 統領 | 戰鬥防禦力 Battle defense（`× (1 + tong/30)`，僅將領對戰）；降低部下叛變機率（`× (1 − 0.01 × king.tong)`） |
| `jing` 經濟 | 領導者實得的收入份額（`× (1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX)`）；並參與總督比較（`wu+tong+jing`） |
| `speed` 速度 | 移動順序（快者先動）；逃跑機率（每點速度差 ±2%） |
| `ambition` 野心 | 叛變機率基礎（`base = ambition × 0.5`） |

> ⚠️ `CHAR_TROOP_CAP_BASE: 100` / `CHAR_TROOP_CAP_PER_TONG: 20` 已定義但**未被任何遊戲邏輯使用**（僅 `gameConfig.ts` 與測試引用）— 兵力目前無上限。

#### 初始值 / Initial Values（`prisma/seed.ts`）

| 項目 | 公式 |
|---|---|
| 國王 `wu` / `tong` / `jing` | `rng.int(5, 30)` 均勻分佈 |
| 國王 `speed` / `ambition` | `rng.gaussian(17, 5, 5, 30)` 常態分佈（截斷 5–30） |
| 國王 `age` / `maxAge` | `age = 20`；`maxAge = rng.int(50, 80)` |
| 國王 `troops` | `rng.int(5, 15)` |
| 國王 **`gold`（初始金錢）** | **`rng.int(50, 150)`** |
| 國王 `loyalty` | `rng.pick(['SELF', 'PATH', 'ALTRUISM'])` |
| 國王所在地點 | `garrison = 10`，`fortress/market/barracks = 1` |
| 其他地點 | `garrison = 0`，三建築皆 0；無主之地 `factionId = null` |

#### 角色生成 / Character Spawn（`server/phases/spawnCharacters.ts`）

- **僅出現在有勢力控制的地點**（`factionId != null`），新角色 `factionId = place.factionId`（加入該勢力）
- 生成率線性遞減：`rate = 5% − progress × (5% − 1%)`，其中 `progress = min(1, (地點數 − 100) / (2000 − 100))`
  - 100 地點 → 每地點 5%；2000 地點 → 1%
- 屬性：`wu/tong/jing = int(5,30)`；`speed/ambition = gaussian(17,5)`；`maxAge = int(50,80)`；`age = 20`；`troops = 0`；`gold = 0`
- **回傳值**：`string[]` — 本回合生成的角色 ID；`runRound.ts` 將其以 `Set` 傳給 `aiMove(..., skipIds)`，**出生者該回合不移動**（無 `CHARACTER_MOVED` 事件）
- **行政官指派（同回合內、於生成後立即執行）**：
  1. 出生地無行政官（或行政官已死亡）→ 直接指派：`place.administratorId = 新角色`、`lastPromotedRound = round`、寫入 `ADMIN_ASSIGNED` 事件
  2. 現任行政官是存活的**國王** → 國王保留席位，不比較
  3. 否則比較**總能力 `wu + tong + jing`**（新將領 vs 現任），僅**嚴格較大**才取代（平手不動）
  4. 取代時：被免職者野心 **＋`AMBITION_ADMIN_REPLACED_DELTA`（1）**，以 `CHAR_AMBITION_MAX` 封頂；寫入 `ADMIN_REMOVED` 事件（含 `newAdminName`/`oldTotal`/`newTotal`）**及** `AmbitionEvent`（`delta` = 實際套用量、`reason` 含地點與接任者）
- `Place.administratorId` 為全域 `@unique` — 一個角色同時只能管理一個地點

#### 經濟 / Economy（`server/phases/economy.ts`）

**地點收入 / Place income：**
```
income = PLACE_BASE_INCOME(10) + market × PLACE_MARKET_INCOME_PER_LV(5)
```
例：market 3 級 → 10 + 3×5 = 25 金/回合。

**分配 / Distribution**（每地點每回合）：

| 情況 | 結果 |
|---|---|
| 有國王 + 有總督 | 國王 `floor(income × 0.4 × jing倍率)`；總督 `floor(income × 0.3 × jing倍率)`；剩餘平均分給該地點其他角色（`floor`，餘數不分配） |
| 僅國王（無總督） | **國王得全部 `income`（100%）**，其他人得 0 |
| 僅總督（無國王） | 總督得全部 `income`（100%） |
| 無國王無總督 | 無人分配（收入蒸發） |

**jing = 經濟 / jing is Economy**

`jing` 是領導者的**經濟能力**，會放大他自己實得的份額（不是「智力」也不是「策略」）：

```typescript
// server/income.ts
mul = 1 + (jing − INCOME_JING_MIDPOINT(17.5)) / CHAR_ABILITY_MAX(30)
// jing 5 → ×0.58     jing 17.5 → ×1.00     jing 30 → ×1.42
```

以**平均值**為基準，所以一般將領與舊規則（40/30/30）完全相同，高 jing 多拿、低 jing
少拿；否則連平均的領導者都會從部屬身上多拿，悄悄改變整個世界的經濟基準。

兩條不變量 / two invariants:

- **總額永不超過 `income`**：兩位高 jing 領導者加總可能超過收入，此時按比例縮回並保留
  兩人的相對高低 / when the two requested shares exceed the income, both are scaled back
  proportionally, preserving which leader is richer
- **只有一位領導者時不套倍率**：他本來就獨得全部，套倍率會印錢 / a lone leader already
  takes everything, so a multiplier would mint gold

規則與分配拆在純函式 `server/income.ts#splitIncome`，不需要資料庫就能測試
（`server/income.test.ts` 會驗證「平均 jing 時與舊的 40/30/30 完全相同」這個回歸點）。

**徵兵 / Garrison recruitment**（僅有勢力的地點）：
```
garrison += PLACE_BASE_RECRUIT(2) + barracks × PLACE_BARRACKS_RECRUIT_PER_LV(3)
```

**購兵 / Troop purchase**（每個在地點的存活角色）：
- `maxBuyable = floor(gold / CHAR_BUY_TROOP_PRICE(2))`；若 `maxBuyable ≥ 10` 才購買
- `buyCount = rng.int(10, min(100, maxBuyable))`；花費 `buyCount × 2` 金，`troops += buyCount`

#### 建築 / Buildings（`server/phases/build.ts`）

- 每地點每回合隨機挑一種建築升級；僅有總督的地點可升級；總督付錢
- **費用：`cost = BUILDING_UPGRADE_COST_BASE(100) × 2^currentLevel`**（指數成長：0→1 級 100、1→2 級 200、2→3 級 400、3→4 級 800、4→5 級 1600）
- 最高等級 5

#### 戰鬥 / Battle（`server/phases/battle.ts`）

**通用隨機數：** `rand = rng.float(0.85, 1.15)`（atk / def 各自獨立擲骰）

**A. 攻堅駐軍（無主地點或無將領駐軍）：**
```
atk = attacker.troops × (1 + attacker.wu × 1/30) × atkRand
def = place.garrison  × (1 + fortress × 0.2)   × defRand   // 駐軍無統帥，tong 不計
```
- `atk > def` → 駐軍全滅、攻擊者 `troops = floor(troops × 0.9)`（疲勞）後佔領
- 否則攻擊者逃跑：`escapeChance = clamp(0.5 + attacker.speed × 0.02, 0.1, 0.9)`（駐軍速度視為 0）

**B. 將領對戰（攻擊者 vs 地點守將）：**
```
atk = attacker.troops × (1 + attacker.wu × 1/30) × atkRand
def = defender.troops × (1 + defender.tong × 1/30) × (1 + fortress × 0.2) × defRand
```
- 攻擊者勝：守將逃跑（公式同下）；攻擊者 `troops = floor(troops × 0.9)`
- 守將勝：攻擊者逃跑，`speedDiff = attacker.speed − defender.speed`

**逃跑 / Escape（兩者共用）：**
```
escapeChance = clamp(SPEED_ESCAPE_BASE(0.5) + speedDiff × 0.02, 0.1, 0.9)
```
- 成功 → 移動到鄰近「同勢力或無主」地點，`troops = 0`；找不到落腳點 → 留在原地 `troops = 0`
- 失敗 → 死亡（`BATTLE_DEATH`）

#### 叛變 / Defection（`server/phases/loyaltyCheck.ts`）

國王與叛變者不會被檢查（`isKing: false` 過濾）。基礎機率：
```
base = ambition × AMBITION_DEFECT_BASE_MULT(0.5)
```
依序乘算修正，最後 `rng.chance(base / 100)` 擲骰：

| 條件 | 乘數 |
|---|---|
| `loyalty ≠ king.loyalty` | `× 1.2` |
| 國王統率加成（無條件） | `× (1 − 0.01 × king.tong)`（tong 30 → ×0.7） |
| 朋友於 5 回合內叛逃 | `× 1.5` ⚠️ 實作備註：查詢的事件型別為 `'DEFECT'`，但事件實際寫入為 `'DEFECTION'` → **此乘數目前永遠不會觸發** |
| 同勢力存活角色 > 500 | `× 0.8`（注意：比對的是**角色數**，非地點數） |
| 有 Discontent（不滿） | `× 1.3` |

#### 野心變化 / Ambition Changes（`server/phases/ambitionEvents.ts`）

每回合對每個角色計算 `delta`，最終 `clamp(5, 30)`：
- `+ AMBITION_NO_PROMOTION_DELTA(0.5)`：若 ≥ 20 回合未升遷（`roundsSincePromotion ≥ 20`，從未升遷者以 `round` 計算）
- `− 0.5 × (king.tong / 30)`：國王統率越高，部下野心降越多（tong 30 → −0.5）
- 朋友叛逃 `+2`：**未實作**（程式碼標註 `TODO`，該區段被跳過）
- **行政官暫時減免到期**：`adminAmbitionRevertRound <= round` 且仍存活、仍在職者 `+ AMBITION_ADMIN_ASSIGNED_DELTA` 回復，並記 `AMBITION_RECOVERED` 事件；已被免職（欄位已清空）或已死亡者只清欄位、不回復

#### 行政官任命 / Administrator Assignment（`server/adminAssign.ts`）

四條任命路徑共用 `grantAdmin` / `revokeAdmin` / `isAdminChangeCoolingDown`：

- **任命 `grantAdmin`**：清除該角色在其他地點的職務（`administratorId` 全域 `@unique`）→ 寫入 `administratorId`、`Place.adminChangedRound = round`、`lastPromotedRound` → 野心**暫時** `− AMBITION_ADMIN_ASSIGNED_DELTA(1)`（`clamp` 到 `CHAR_AMBITION_MIN`）並記 `AmbitionEvent`；`AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS(10) 回合後於階段 7 自動 `+1` 回復
  - 已有未到期減免（連任／換地點）→ **只順延到期回合**，不重複扣減
  - 已處於最低值（實際扣減為 0）→ 不排定回復，避免到期憑空 `+1`
- **免職 `revokeAdmin`**：野心 `+ AMBITION_ADMIN_REPLACED_DELTA(1)`（`clamp` 到 `CHAR_AMBITION_MAX`）並**清掉** `adminAmbitionRevertRound`（免職已回補，回復會重複計算）
- **路徑**：階段 2 `spawnCharacters`（受冷卻限制）· 階段 12 `assignAdmins`（受冷卻限制）· 階段 10 `battle.ts` 奪取（**不受**冷卻限制）· `POST /api/admin/assign-admin` 手動指派（**不受**冷卻限制，且會先免職舊任者）
- **冷卻 `ADMIN_CHANGE_COOLDOWN_ROUNDS(10)`**：任何行政官異動都寫入 `Place.adminChangedRound`；`round - adminChangedRound < 10` 時**僅 AI 路徑**跳過該地點（`assignAdmins` 以 `where` 過濾，`spawnCharacters` 以 `isAdminChangeCoolingDown()` 判斷）

#### 老化與死亡 / Aging & Death（`server/phases/ageAndDeath.ts`）

- 所有存活角色 `age += 1`（每回合）
- `age >= maxAge` → 自然死亡（`DEATH`，reason `old_age`）；`maxAge` 於生成時 `int(50, 80)`

#### 信號 / Signals（`server/phases/signals.ts`）

- 持續 `SIGNAL_DURATION(5)` 回合、冷卻 `SIGNAL_COOLDOWN(10)` 回合、範圍 2 跳（`SIGNAL_RANGE`）、每勢力同時最多 1 個啟動中
- 國王 / 總督可發送；移動 AI 目標優先序：信號 > 勢力敵人 > 最近無主地 > 原地不動；每回合移 1 格，依 `speed` 降序執行
- `aiMove(worldId, round, rng, skipIds?)`：`skipIds` 為本回合出生的角色 ID 集合，命中者直接跳過 —— **出生者該回合完全不移動**（即使有信號/敵人/行軍目標）

#### 地圖節點大小 / Map Node Size（`src/components/SigmaMap.tsx`）

```
nodeSize = 4 + log(troops + 1) × 2     // troops = garrison + 該地點所有角色 troops
```

#### 世界佈局 / World Layout

- ForceAtlas2 全域重算每 `LAYOUT_RECALC_INTERVAL(100)` 回合
- 新節點：鄰居重心 + 隨機偏移 `radius ∈ [20, 50]`；最小節點間距 15，碰撞重試 10 次

#### 統計圖表 / Stats Charts（`src/app/game/page.tsx`）

統計分頁畫兩件獨立的東西：九張時間序列圖（可切四種樣式），加上一張勢力力量區塊圖
與一張將領雷達圖。

The stats tab renders two independent things: nine time-series charts in four switchable
styles, plus a faction-power treemap and a character radar.

```
// 圖表類型只有一個 union，renderChart() 依此分派 / one union, dispatch in renderChart()
type ChartType = 'line' | 'pie' | 'square' | 'treemap';

line    → LineChart   折線（每個勢力一條 + 最新點標記）
pie     → PieChart    圓餅（最新回合佔比）／單一序列改用 GaugeChart 進度環
square  → BarChart    長條（每回合一根堆疊長條，最後 BAR_MAX_ROUNDS=24 回合）
treemap → FactionTreemap  勢力力量區塊圖（取代上面九張）
```

九張圖 = 勢力 4 張（領地／兵力／金錢／將領）＋ 世界 5 張（存活勢力／總將領／無主之地／
總駐軍／道路數）。資料來自 `GET /api/world/stats?from=0&to=N`，每個勢力一條時間序列，
外加 `world` 物件的世界整體序列。

##### 區塊圖 / Treemap

外層面積 = 領地數，區塊內再切兵力／金幣／將領。三個指標量級差很多（兵力可以是將領數的
千倍），所以**各指標先除以自己的世界最大值**再取比例 —— 不正規化的話將領那一段會薄到
看不見。這代表區塊面積同時混入了勢力的「量級」與「內部組成」，是刻意的取捨。

```typescript
// slice-and-dice：沿較長的一邊切，父節點遞迴切自己的矩形
// Slice-and-dice along the longer side, recursing into each parent's rectangle
function layoutTreemap(nodes, rect) {
  const usable = nodes.filter((n) => n.value > 0);   // 零值略過 → 全零時顯示「無資料」
  const horizontal = rect.width >= rect.height;
  // ...
}
// 上限 TREEMAP_MAX_FACTIONS = 12（依領地數取前 12）
```

##### 雷達圖 / Radar

每個勢力一個多邊形，畫的是該勢力**存活將領的平均屬性**，六個軸
`wu`／`tong`／`jing`／`speed`／`ambition`／`age`，虛線是全世界的平均值當參考。
上限 `RADAR_MAX_FACTIONS = 6`（依存活將領人數取前 6），再多就只是互相蓋住。

雷達圖讀的是 `WorldState.characters` / `.factions`（不是 stats 端點），所以要把這兩個
prop 從遊戲頁傳進 `StatsCharts`（桌面側軌與手機覆蓋層兩處都要）。

**雷達圖的先天限制**：每個軸用自己的最大值正規化（年齡上限本來就遠高於能力值），
所以邊長**不能跨軸比較** —— 看的是形狀，不是絕對數字。軸標籤沿用既有的
`character.*` i18n 鍵，不另開一套。

##### 將領列表 hover 雷達 / Leader Table Hover Radar

將領分頁的 `CharacterList` 點開 `DetailModal`，裡面是 12 欄的將領表格。游標停在某一列時，
表格右側會浮出**該名將領**自己的雷達圖，虛線是**同勢力**存活將領的平均值當參考。

```typescript
// 列的 mouseenter 裡讀位置（不在 render 期間讀），並順便夾在視窗內，
// 這樣 render 就不需要碰 window
// Read the row's position in the handler — never during render — and clamp it
// there so render never touches window
const rect = e.currentTarget.getBoundingClientRect();
setHoverPreview({ char, top: clamp(rect.top) });

// 面板掛在 body 上、fixed 定位：彈窗內容層本身是捲動容器，
// 用絕對定位的話面板會跟著捲動跑掉
// The modal body is a scroll container, so an absolute panel would scroll away;
// portal to the body and position it fixed instead.
createPortal(<div className="fixed z-[110] pointer-events-none">…</div>, document.body);
```

兩個必要的細節 / two details that are not optional:

- 面板一定要 `pointer-events-none`，否則游標移過去會觸發底下那一列的 `mouseleave`，
  面板立刻自己消失（閃爍）。 / The panel must be `pointer-events-none`: otherwise moving
  the cursor onto it fires the row's `mouseleave` and it flickers itself away.
- 整張 `<table>` 也要掛 `onMouseLeave`，指標移到列與列之間的空隙時預覽才會收起來。 /
  The whole `<table>` gets `onMouseLeave` so the preview also collapses in the gaps
  between rows.

雷達的格線、軸標籤、點座標都跟側欄那張共用 `RadarGrid` / `RadarAxisLabels` /
`radarPoints(values, size, radius)`（尺寸不同，所以 size/radius 要參數化）。新增雷達的
呼叫端請走這些共用元件，不要複製整段 SVG。

##### 將領頭像 / Leader Avatar（`src/components/LeaderAvatar.tsx`）

每位將領的頭像是**程序化生成**的 SVG 半身像：從 `character.id` 播種，用多種特徵拼出來。
不需要圖檔、不需要資料庫欄位、也不需要新的相依套件。

```typescript
// 沿用既有的 createRng（內部 FNV-1a 雜湊字串），不自己寫雜湊
// Reuse the existing createRng — it already FNV-1a hashes the string
const rng = createRng(character.id);
const skin      = SKIN_TONES[rng.int(0, SKIN_TONES.length - 1)];
const hairStyle = HAIR_STYLES[rng.int(0, HAIR_STYLES.length - 1)];
// …固定抽取順序 → 同一個 id 永遠同一張臉

// 真實資料只在抽取「之後」覆寫，因此不會影響其他特徵的分佈
// Real data overrides only *after* the draws, so it cannot skew their spread
if (character.age >= GREY_HAIR_AGE) hairColor = ...;
return { ..., helmet: !isKing && wu >= HELMET_WU, crown: isKing };
```

資料如何影響外觀 / how real data shows up:

| 資料 | 影響 |
|------|------|
| `isKing` | 王冠（且**不**戴頭盔，否則王冠會被蓋掉） |
| `wu ≥ 25` | 頭盔 |
| `age ≥ 60` | 髮色轉灰／白，且較容易留鬍 |
| `ambition ≥ 20` | 眉壓低， 看起來較兇 |
| 陣營色 | 衣袍與底色 |

**特徵邏輯是純函式** `deriveAvatarTraits(character)`，元件只負責畫。測試因此不需要 DOM，
可以在專案既有的 `node` vitest 環境下跑（`LeaderAvatar.test.ts`）—— 專案的 vitest 只收
`src/**/*.test.ts` 且 `environment: 'node'`，所以新增特徵請加在純函式裡，不要塞進 JSX。

特徵池（膚色、髮色…）是**內容**不是設計 token，跟名稱產生器的字庫同一類，所以放在程式碼裡；
只有陣營色是執行期資料，用 inline style 套用。

---

## 地圖視覺化 / Map Visualization

### 版本資訊 / Version Info
- **sigma**: 3.x
- **graphology**: 0.26.x
- **graphology-layout-forceatlas2**: 0.10.x

### 概述 / Overview

遊戲使用 Sigma.js 與 graphology 建構互動式力導向圖地圖，視覺化地方、道路與勢力關係。

### 架構 / Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SigmaMap (Client Component)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  graphology  │  │  ForceAtlas2 │  │      Sigma.js          │ │
│  │  (Graph)     │  │  (Layout)    │  │      (Renderer)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 節點屬性 / Node Properties

```typescript
// 每個地方節點 / Each place node
graph.addNode(place.id, {
  x: place.layoutX,           // ForceAtlas2 計算的位置
  y: place.layoutY,
  size: 4 + Math.log(totalTroops + 1) * 2, // 對數成長 / logarithmic growth
  color: hslToHex(faction.color), // HSL → Hex 轉換（WebGL 需要）
  label: place.name,
  // 儲存額外資料 / Store extra data for tooltips
  placeData: place,
  factionData: faction,
  characterCount: charCount,
  totalTroops,
});
```

標籤顯示規則 / Label visibility：`labelRenderedSizeThreshold: CONFIG.LABEL_SIZE_THRESHOLD`（8，定義於 `gameConfig.ts`）—— 僅當縮放達門檻才渲染節點文字；覆蓋 `<canvas>`（聚光燈層）畫在 sigma 容器之下，故標籤永遠疊在光環之上。

### 顏色轉換 / Color Conversion

Sigma.js/WebGL 不支援 HSL 格式，需轉換為 hex：

```typescript
// src/components/SigmaMap.tsx
function hslToHex(hsl: string): string {
  // 解析 "hsl(120, 70%, 50%)" 格式
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return '#666666';

  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;

  // HSL → RGB → Hex 轉換
  // ...
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
```

### ForceAtlas2 佈局 / ForceAtlas2 Layout

#### 初始佈局（種子腳本）
```typescript
// prisma/seed.ts
const layoutGraph = new Graph();

// 新增所有地方為節點
for (const place of places) {
  layoutGraph.addNode(place.id, {
    x: rng.float(-100, 100), // 隨機初始位置
    y: rng.float(-100, 100),
  });
}

// 新增道路為邊緣
for (const road of roads) {
  layoutGraph.addEdge(road.aId, road.bId);
}

// 運行 ForceAtlas2
const positions = forceAtlas2(layoutGraph, {
  iterations: 100,
  settings: { ...settings, slowDown: 1 },
});

// 更新所有地方的位置
for (const place of places) {
  const pos = positions[place.id];
  if (pos) {
    await prisma.place.update({
      where: { id: place.id },
      data: { layoutX: pos.x, layoutY: pos.y },
    });
  }
}
```

#### 增量佈局（新地方）
```typescript
// server/phases/spawnPlaces.ts
// 新節點放在母節點附近隨機偏移
const layoutX = parent.layoutX + rng.float(-20, 20);
const layoutY = parent.layoutY + rng.float(-20, 20);
```

#### 全域重算（每 100 回合）
```typescript
// server/graph/layout.ts
export function shouldRecalculate(currentRound: number): boolean {
  return currentRound % CONFIG.LAYOUT_RECALC_INTERVAL === 0;
}

export async function recalculateLayout(worldId: string): Promise<void> {
  // 從資料庫讀取所有地方和道路
  // 建立 graphology 圖形
  // 運行 ForceAtlas2
  // 更新所有地方的位置
}
```

### 使用方式 / Usage

```typescript
// src/app/game/page.tsx
'use client';

import dynamic from 'next/dynamic';

// Sigma.js 需要 WebGL，必須禁用 SSR
const SigmaMap = dynamic(() => import('@/components/SigmaMap'), {
  ssr: false,
  loading: () => <div>載入地圖中...</div>,
});

export default function GamePage() {
  return <SigmaMap worldId={worldId} round={round} />;
}
```

### 聚光燈與移動動畫 / Spotlight & Move Animation

#### 資料來源 / Data Source

`GET /api/world/state?round=N` 依事件表計算兩個欄位（快照與即時路徑共用）：

```typescript
// src/app/api/world/state/route.ts (回傳形狀 / response shape)
spotlights: Array<{ placeId: string; kind: 'created' | 'attacked' }>
moves: Array<{ fromPlaceId: string; toPlaceId: string; factionId: string | null }>
```

- 聚光燈視窗：回合 `N - CONFIG.SPOTLIGHT_ROUNDS + 1 .. N`
  - `PLACE_CREATED` → kind `created`（同地點 `created` 優先）
  - `PLACE_CAPTURED` / `BATTLE_DEATH` / `ESCAPE_SUCCESS` → kind `attacked`
- `moves` 只含 `round === N`（當前顯示回合）的 `CHARACTER_MOVED` 事件
- `CHARACTER_MOVED` 由 `server/moveEvent.ts#recordMove()` 寫入，涵蓋 `aiMove.ts` 四個移動點與 `battle.ts` 三個逃脫點
- `GET /api/world/events?round=N` 對 `CHARACTER_MOVED` 做**讀取時補強**：join `places` 加上 `fromPlaceName` / `toPlaceName`（事件本身只存 placeId），供事件誌顯示「X 從 A 移動到 B」

#### 渲染 / Rendering

覆蓋一層絕對定位的 `<canvas>`（`pointer-events-none w-full h-full` — canvas 是替換元素，
僅 `inset-0` 不會撐滿，會停在內建 300×150）：

```typescript
// src/components/SigmaMap.tsx — RAF 迴圈 / RAF loop
const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y }); // 每幀用當前鏡頭座標
// 聚光燈：脈動發光環 pulse = 0.5 + 0.5 * sin(t / 320)
//   created → #22d3ee（青）、attacked → #f87171（紅）
// 移動點：easeInOutQuad 行進（尾跡 0.12），週期
//   MOVE_ANIM_DURATION (1500ms) 行進 + MOVE_ANIM_PAUSE (2500ms) 停頓
//   顏色 = 移動者陣營色（hslToHex），無陣營 → #5eead4
```

時序常數位於 `src/lib/gameConfig.ts`：`SPOTLIGHT_ROUNDS`、`MOVE_ANIM_DURATION`、`MOVE_ANIM_PAUSE`。

##### 節點發光與陰影 / Node Glow & Shadow

第二張覆蓋 `<canvas>`，位於聚光燈層**之下**、sigma 容器**之上**：先鋪一層往右下偏移的
暗影，再鋪一層依勢力色的柔和發光。節點圓盤由 WebGL 畫在更上面，因此看起來像「從地圖
發亮起來」，而不是一張張貼圖。

這一層**不是動畫**：只掛在 sigma 的 `afterRender` 與 `resize` 上重繪，閒置時零成本，
也沒有額外 rAF（地圖上唯一的 rAF 是聚光燈層）。

```typescript
// 以「色碼 + 透明度」快取 sprite，每次重繪只是 drawImage
// Sprites are cached per `color|alpha`; each redraw is just a drawImage.
// 2000 個節點時，若每幀 createRadialGradient 會慢到不可用。
// A per-frame createRadialGradient per node would be far too slow at 2000 nodes.
const sprite = getGlowSprite(sprites, color, alpha);

// 發光強度隨節點螢幕半徑變化，避免小節點把地圖糊成一片霧
// Glow strength scales with on-screen radius so small nodes don't haze the map
const strength = Math.min(1, Math.max(MAP_GLOW_MIN_ALPHA / MAP_GLOW_ALPHA,
  radius / MAP_GLOW_REFERENCE_PX));

sigma.on('afterRender', draw);  // 鏡頭移動 / 兵力變化 / refresh 都會觸發
```

效能守則 / performance rules:

- 只畫視窗內的節點（`viewportToGraph` 求邊界），並跳過 `MAP_GLOW_MIN_RADIUS_PX` 以下的節點
- 畫布尺寸快取起來，不要每幀讀 `getBoundingClientRect`（會觸發版面重排）
- 陰影色取自 `--color-ds-void` 設計 token（`readDesignToken`），**不在 TSX hardcode 顏色**
- 幾何常數：`MAP_GLOW_SCALE`、`MAP_GLOW_ALPHA`、`MAP_GLOW_MIN_ALPHA`、`MAP_GLOW_MIN_RADIUS_PX`、`MAP_GLOW_REFERENCE_PX`、`MAP_SHADOW_SCALE`、`MAP_SHADOW_ALPHA`、`MAP_SHADOW_OFFSET_PX`
- 地圖內陰影是設計 token `--shadow-ds-map-vignette`（`globals.css` 的 `@theme static`），以 `shadow-ds-map-vignette` 使用

##### 鏡頭動畫 / Camera Animation

鏡頭運作在 **framed 空間**：Sigma 的 `createNormalizationFunction` 會把整張圖映射成
「以 `(0.5, 0.5)` 為中心、較大軸恰為 `1`」的單位方形。`graph.getNodeAttributes()` 回傳的是
**正規化之前**的原始座標，`sigma.getBBox()` 也是原始範圍——把這兩者餵給鏡頭會讓鏡頭停在
世界之外，畫面整片空白（實測 0 個節點可見）。鏡頭要用的座標一律取
`sigma.getNodeDisplayData(node)`。

The camera works in **framed space**: Sigma's `createNormalizationFunction` maps the graph
into a unit square centred on `(0.5, 0.5)` whose larger axis is exactly `1`.
`graph.getNodeAttributes()` returns **raw** pre-normalisation coordinates and
`sigma.getBBox()` returns the **raw** extent — feeding either to the camera parks it outside
the world and renders a blank map (measured: 0 nodes visible). Always take camera
coordinates from `sigma.getNodeDisplayData(node)`.

```typescript
// 點擊節點 → 鏡頭動畫置中；太遠時一併放大（framed 座標）
const display = sigma.getNodeDisplayData(node);
const focusRatio = MAP_FIT_PADDING * MAP_FOCUS_ZOOM;
camera.animate({ x: display.x, y: display.y, ratio: Math.min(camera.ratio, focusRatio), angle: 0 },
               { duration: MAP_CAMERA_ANIM_MS });

// 重設 → 動畫到「整個世界剛好放得下」
// framed 世界是單位方形，所以全覽視角是固定值，與世界大小／節點數／視窗比例無關
camera.animate({ x: 0.5, y: 0.5, ratio: MAP_FIT_PADDING, angle: 0 },
               { duration: MAP_CAMERA_ANIM_MS });
```

`resetView` 走「中心 `(0.5, 0.5)` + ratio `1` × `MAP_FIT_PADDING`」這個**固定值**，而不是
`getBBox()` 或 `animatedReset()`：framed 世界本身就是單位方形，所以全覽不需要依世界大小
計算。`MAP_FOCUS_ZOOM`（<1）是同一個基準的倍數，讓聚焦與全覽保持一致。

`resetView` uses that constant rather than `getBBox()` or `animatedReset()`: the framed world
is already a unit square, so "fit everything" needs no per-world computation.
`MAP_FOCUS_ZOOM` (<1) is a multiplier on the same baseline, keeping focus and fit consistent.

`prefers-reduced-motion` 時 `duration` 為 0（直接跳轉），值透過 `reducedMotionRef`
讀取，因為建立 Sigma 的 effect 依賴陣列是空的。

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
    subtitle: '瀏覽器中的多國模擬',
  },
  character: {
    wu: '武力',
    tong: '統領',
    jing: '經濟',
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

# 建構（自動執行 prisma generate）
pnpm build  # Runs: prisma generate && next build

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
npx tsx prisma/seed.ts  # 初始化遊戲資料（含 ForceAtlas2 佈局）
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
3. **Prisma 7** — 型別安全的資料庫 ORM（使用 PrismaPg driver adapter）
4. **TypeScript** — 嚴格型別檢查
5. **TailwindCSS 4** — 實用優先的 CSS 框架
6. **Sigma.js + graphology** — 互動式力導向圖地圖
7. **ForceAtlas2** — 自動佈局演算法
8. **TanStack Query** — 客戶端資料取得與快取
9. **Zod** — API 輸入驗證
10. **Vitest** — 快速的單元測試框架

這些技術共同提供：
- ✅ 型別安全 (Type Safety)
- ✅ 高效能 (Performance)
- ✅ 可維護性 (Maintainability)
- ✅ 開發者體驗 (Developer Experience)
- ✅ 國際化支援 (i18n Support)
- ✅ 互動式地圖 (Interactive Map)
- ✅ 自動佈局 (Automatic Layout)

---

*最後更新 / Last Updated: 2026-09-23*
