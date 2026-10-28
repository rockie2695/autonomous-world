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
12. [經濟與戰報 / Economy & Battle Report](#經濟與戰報--economy--battle-report)
13. [地圖視覺化 / Map Visualization](#地圖視覺化--map-visualization)
14. [氛圍圖層 / Ambient Layers](#氛圍圖層--ambient-layers)
15. [國際化 / Internationalization (i18n)](#國際化--internationalization-i18n)
16. [部署與環境 / Deployment & Environment](#部署與環境--deployment--environment)
17. [總結 / Summary](#總結--summary)
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
├── game/                  # 主遊戲頁面（頁面本體 + 事件日誌 + 統計圖表等模組，見下）/ Main game page (orchestrator plus the EventLog / stats-charts modules)
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
import { getSelectedWorldId } from '@/lib/worldSelect';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 多世界：目前選中的世界由 cookie 決定（見 src/lib/worldSelect.ts）/
  // Multiple worlds: the selected world comes from a cookie (see src/lib/worldSelect.ts)
  const worldId = await getSelectedWorldId();
  const world = worldId
    ? await prisma.world.findUnique({ where: { id: worldId } })
    : null;
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

### 電子信箱 + 密碼登入 / Email + Password Sign-in

除了 Google OAuth，還可以用「電子信箱 + 密碼」登入。兩者共用同一張 `User` 表：
Google 帳號的 `passwordHash` 為 `null`，只有信箱密碼帳號才有 —— 這個欄位可空是兩種
登入能並存的前提。

Besides Google OAuth, users can sign in with an email and password. Both share one
`User` table: a Google account has a `passwordHash` of `null` and only password
accounts have one — which is exactly why that column is nullable.

```
註冊 / Register                     登入 / Sign in
──────────────                     ─────────────
POST /api/auth/register             Auth.js Credentials provider
  ├ Zod 驗證（email / password）      ├ 1. email 轉小寫後查 User
  ├ 信箱已存在 → 409，不覆寫          ├ 2. passwordHash 為 null → null（Google 帳號）
  └ argon2id 雜湊後寫入              ├ 3. argon2id 驗證失敗 → null
                                       └ 4. 通過 → 回傳 user，發 session
```

#### 密碼雜湊 / Password hashing

- **`src/lib/password.ts`（僅 server）** — argon2id via `@node-rs/argon2`，OWASP 最低建議值
  （19 MiB / t=2 / p=1）。編碼後的 PHC 字串自帶參數，所以之後調高參數不會讓舊帳號
  驗證失敗。刻意**不寫** `algorithm`：套件預設就是 argon2id，而 `Algorithm` 是 ambient
  `const enum`，在本專案開了 `isolatedModules` 時無法取值。
- **`PASSWORD_MIN_LENGTH` 住在 `src/lib/passwordPolicy.ts`，而這個檔案不 import 任何東西。**
  這不是潔癖：`@node-rs/argon2` 在 package.json 有頂層的 `browser: browser.js`，Next 的
  webpack 在**client** bundle 會優先採用 browser 欄位，而那個檔案需要沒安裝的
  `@node-rs/argon2-wasm32-wasi` —— 只要任何 client component 連帶 import 到 argon2，
  整頁就會 500。`SignInForm` 必須 import 政策模組，永遠不要 import `password.ts`。
  This is not tidiness: `@node-rs/argon2` declares a top-level `browser: browser.js`,
  webpack prefers it for the client bundle, and that file needs an uninstalled wasm
  package — so any client component that transitively imports argon2 **500s the whole
  page**. `SignInForm` must import the policy module, never `password.ts`.
- **不限制字元組成，只限制長度下限 8** —— NIST SP 800-63B 明確建議不要再加複雜度規則，
  因為它只會把人推向 `Password1!` 這種可預測的密碼。
  No composition rules, only the 8-character floor: NIST SP 800-63B explicitly advises
  against composition rules, which mostly push people toward predictable passwords.

#### 為什麼需要 set-password 這個端點 / Why a separate set-password route

Google 帳號的 `passwordHash` 是 `null`，因此無法用密碼登入。理論上有兩種做法：

| 做法 | 結果 |
|------|------|
| (a) 註冊時若信箱已存在，直接幫它設密碼 | **帳號接管漏洞**：任何知道某個 Google 使用者信箱的人都能註冊密碼並登入成他。信箱容易得知（公開 commit、截圖、猜測） |
| (b) 要求先證明自己擁有帳號 | ✅ 安全：需要一個已驗證的 session，而取得 session 正是「證明身份」這件事本身 |

採 (b)，也就是 `POST /api/auth/set-password`。它**已經有密碼時回 409**，不覆寫 ——
無聲地改掉使用者的憑證不應該發生，要換密碼應該是一個明確的動作（先重新輸入舊密碼之類的），
而這一版刻意不實作那個流程。管理員也在此列：以 `ADMIN_EMAIL` 判定的管理員若只有 Google
帳號，同樣走這條路取得密碼登入能力。

- **`authorize()` 對所有失敗都回 `null`** —— 密碼錯、信箱不存在、或是 Google 帳號，
  一律相同。區分它們會把登入表單變成一個帳號列舉工具。
- **不做 email 驗證、不做密碼重設**，兩者都需要寄信服務，已明確延後。代價是信箱在任何
  確認之前就能用密碼登入 —— 這是「先不做驗證」的已知取捨。
- **兩個端點都沒有速率限制。** 公開環境需要在前面加一層（Upstash、Vercel WAF 或中介層），
  註冊端點尤其需要，因為它會寫入資料庫。

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
  defectionBase Int      // the fixed base of the defection value (5-30)
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

// 查詢（多世界：路由請走 worldSelect.ts 的 getSelectedWorldId()；這裡只示範 Prisma 用法）
// A query (multi-world: routes must go through worldSelect.ts's getSelectedWorldId();
// this only demonstrates Prisma usage)
const world = await prisma.world.findUnique({
  where: { id: worldId },
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
   `src/app/game/styles.ts` 各有一組模組層級的常數，把重複的 utility 字串
   收在一處，避免同一串類別在多檔之間漂移。遊戲頁之所以把常數獨立成
   `styles.ts`，是因為頁面本體、事件日誌、統計圖表與將領彈窗都會用到同一組
   面板／按鈕／骨架字串。
   Express surfaces with utilities; do not add bespoke component classes.
   `src/app/page.tsx` and `src/app/game/styles.ts` each declare their repeated
   utility strings once at module scope so the same class list cannot drift
   between files. The game page keeps them in a separate module because the page
   itself, the event log, the stats charts and the leader modal all render the
   same panel / button / skeleton surfaces.
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
  ROAD_MAX_PER_PLACE: 4,         // 每個地方最多連接道路
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
  CHAR_DEFECTION_BASE_MEAN: 17,        // 野心常態分佈平均值
  CHAR_DEFECTION_BASE_SIGMA: 5,        // 野心常態分佈標準差

  // 經濟 / Economy
  PLACE_BASE_INCOME: 10,
  INCOME_KING_SHARE: 0.30,
  INCOME_ADMIN_SHARE: 0.40,
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

初始狀態（**每一個**世界如此；seed／reset／create-world 共用同一份 `initWorld`）：
- 1 個世界（種子建立第一個；之後可再建立更多——見「多世界」一節）
- 100 個地方
- 道路連接
- 1 個角色（國王）
- 1 個勢力
- round-0 快照 + `currentRound: 1`

Initial state (**per world**; seed / reset / create-world share the same `initWorld`):
- 1 world (the seed creates the first; more can be created later — see "Multiple worlds")
- 100 places, roads connecting them
- 1 character (king)
- 1 faction
- round-0 snapshot + `currentRound: 1`

### 遊戲數值公式 / Game Formulas

所有常數定義於 `src/lib/gameConfig.ts`（唯一真實來源）。以下公式與程式碼逐一核對。
All constants live in `src/lib/gameConfig.ts` (single source of truth). Every formula below is verified against the code.

#### 屬性作用 / What Each Stat Affects

| 屬性 Stat | 影響 Effect |
|---|---|
| `wu` 武力 | 戰鬥**攻擊力** Battle attack power（`× (1 + wu/30)`）；並參與總督比較（`wu+tong+jing`）；同地點關係可調整它 |
| `ti` 體魄 | 戰鬥**防禦力** Battle defence power（`× (1 + ti/30)`，乘在守軍兵力上）；同地點關係可調整它 |
| `tong` 統領 | **購兵量上限** how many troops one purchase can buy（`× (1 + (tong − INCOME_TONG_MIDPOINT) / CHAR_ABILITY_MAX)`）；並參與總督比較（`wu+tong+jing`）。**不影響防禦，也不影響叛變** |
| `jing` 經濟 | 領導者實得的**收入份額** the leader's cut of a place's income（`× (1 + (jing − INCOME_JING_MIDPOINT) / CHAR_ABILITY_MAX)`）；並參與總督比較（`wu+tong+jing`） |
| `speed` 速度 | 移動順序（快者先動）；逃跑機率（每點速度差 ±2%） |
| `defectionBase` 野心 | 叛變值的**固定基底** the fixed base of the defection value（5–30，**永不改寫**；會變的是帳本裡的 delta） |
| `age` 年齡 | 老化與死亡；生育的年齡窗 |

> **`tong` 與 `ti` 沒有任何關係**，它們是兩個各自獨立的屬性：`ti` 決定守軍擋不擋得住，
> `tong` 決定一次買得到幾個兵。過去 `tong` 確實是防禦屬性，那時防禦公式寫的是
> `(1 + tong/30)`；`ti` 上線後防禦改用 `ti`，而 `tong` 被改派去管購兵量。所以**沒有**
> 「`(1 + tong/30)`」這種公式——那個片段是舊公式的殘留。
>
> **`tong` and `ti` are unrelated**: two independent abilities. `ti` decides whether a garrison
> holds; `tong` decides how many troops a single purchase can buy. `tong` *was* the defence
> stat, back when the formula read `(1 + tong/30)`; when `ti` arrived, defence moved to `ti`
> and `tong` was reassigned to purchase size. So there is **no** `(1 + tong/30)` formula
> anywhere — that fragment is a leftover of the old one.

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
  4. 取代時：被免職者野心 **＋`DEFECTION_ADMIN_REPLACED_DELTA`（1）**，以 `CHAR_DEFECTION_BASE_MAX` 封頂；寫入 `ADMIN_REMOVED` 事件（含 `newAdminName`/`oldTotal`/`newTotal`）**及** `DefectionEvent`（`delta` = 實際套用量、`reason` 含地點與接任者）
- `Place.administratorId` 為全域 `@unique` — 一個角色同時只能管理一個地點

#### 經濟 / Economy（`server/phases/economy.ts`）

**地點收入 / Place income：**
```
income = PLACE_BASE_INCOME(10) + market × PLACE_MARKET_INCOME_PER_LV(5)
```
例：market 3 級 → 10 + 3×5 = 25 金/回合。

**行政官的 jing 放大整塊餅 / The administrator's jing scales the whole pie：**
```
pie = floor(income × jingIncomeMultiplier(adminJing))
```
`jing` 是**行政官**的經濟能力：他讓地方更富裕（倍率 `1 + (jing − 17.5) / 30`，
jing 5 → ×0.58、jing 17.5 → ×1.00、jing 30 → ×1.42）。倍率**只作用一次**——在
split 裡再乘就是 ×jing²。沒有行政官時誰都不領（見下），餅照算但一分不發。

**分配 / Distribution**（每地點每回合，比例為**固定**的、對放大後的餅抽成；Oct 2026
由 30/40/30 改為 10/60/30，把君王的 20% 挪給實際管事的行政官）：

| 情況 | 結果 |
|---|---|
| 有國王 + 有行政官 + 有其他將領 | 國王 `floor(pie × 0.1)`；行政官 `floor(pie × 0.6)`；其餘 30% 平分給該地其他角色（`floor`，餘數留在地方） |
| 有國王 + 有行政官，無其他將領 | 國王 `floor(pie × 0.1)`；行政官拿**剩餘全部**（≈ 90%） |
| 無國王（在場或缺席皆同） | 國王的 10% 併入行政官 → 行政官 70%，其他人 30% |
| 無國王也無其他將領 | 行政官 100% |
| **無行政官** | **無人分配**（收入留在地方） |

兩條不變量 / two invariants:

- **三份加總永遠等於 pie**（「其他人」是剩餘額；無其他角色時行政官拿 `floor(pie − king)`，
  餘數不會蒸發）/ the three shares always sum to the pie ("everyone else" is the remainder;
  with no other characters the administrator takes `floor(pie − king)` — the remainder never
  vanishes)
- **只有一位領導者時不套倍率**：倍率已在餅上作用一次，split 是固定抽成 / the multiplier
  already acted once on the pie; the split is a flat cut

規則與分配拆在純函式 `server/income.ts#splitIncome`，不需要資料庫就能測試
（`server/income.test.ts` 會驗證「平均 jing 時與舊的 40/30/30 完全相同」這個回歸點）。

**徵兵 / Garrison recruitment**（僅有勢力的地點）：
```
garrison += PLACE_BASE_RECRUIT(2) + barracks × PLACE_BARRACKS_RECRUIT_PER_LV(3)
```

**購兵 / Troop purchase**（每個在地點的存活角色）：
- `maxBuyable = floor(gold / CHAR_BUY_TROOP_PRICE(2))`；若 `maxBuyable ≥ CHAR_BUY_TROOP_MIN(10)` 才購買
- `buyCount = purchaseBatch(tong, maxBuyable, rng.float(-1, 1))`：基準批量
  `CHAR_BUY_TROOP_BASE(30) × tongPurchaseMultiplier(tong)`，隨機 ±25% 抖動，金幣與規格
  上限（100）是硬上限（見 `server/income.ts#purchaseBatch`）

##### 建築效果共用模組 / Shared building effects

`src/lib/placeEffects.ts` 是這些數字的**唯一**來源：每級效果（連同單位）、升級費用、每回合產出。
`build.ts`、`economy.ts`、`battle.ts` 與地方彈窗全部讀它，所以彈窗不可能顯示一個模擬並沒有用到的數字。
預覽若另外重寫一份規則，兩者遲早會對不上——這正是這個模組存在的理由。

| 建築 | 每級 | 誰在用 |
|---|---|---|
| 堡壘 `fortress` | +20% 防禦 | `fortressDefenceMult()`，**兩條**戰鬥路徑都用 |
| 市場 `market` | +5 金 | `placeIncome()` |
| 兵營 `barracks` | +3 名徵兵 | `placeRecruits()` |

- 費用 = `BUILDING_UPGRADE_COST_BASE × MULT^level`（100/200/400/800/1600），上限 `BUILDING_MAX_LEVEL = 5`。
  這兩者**過去都是內嵌寫死**（上限是 `build.ts` 裡一個光禿禿的 `5`），現在都匯出來，彈窗才不會
  顯示一個模擬並沒有用到的價格。
- 每個建築的效果**連單位一起帶著走**（`percent` / `gold` / `troops`），彈窗因此不必自己猜怎麼排版。
- 彈窗顯示行政官**實際**拿到多少，是直接呼叫 `splitIncome()`；沒有行政官時是一分不發，所以印
  「40%」會讓人以為他照樣有錢。這需要勢力資料帶上 `kingId`，因為君王的份額先被扣掉。
- `src/lib/placeEffects.test.ts` 鎖的是**規則**（等比費用、線性累加、等級 0 的防禦倍率必須
  恰好是 1），而不是某個常數。

#### 人際關係 / Relationships（`server/phases/relationships.ts`）

每回合把**同地點或相隔一條道路**的存活角色配對，每對各擲一次骰：
- `FRIEND_FORM_CHANCE(5%)` → 友誼（**雙向**，一列，正規化為 `aId < bId`）
- `DISCONTENT_FORM_CHANCE(5%)` → 不滿（**互相的**，**兩列**：`a→b` 與 `b→a`）

- **不滿是「一次擲骰、寫兩列」**，所以 `DISCONTENT_FORM_CHANCE` 仍然是「這一對互相不滿的機率」。
  分別擲兩次會變成 `1-(1-c)²` = 9.75%，等於在無聲中改掉一個設定值。
- **擲骰的位置不能動。** 擲骰在「查有沒有」**之前**、無條件進行，與原本完全相同。RNG 的取用
  順序是這套模擬的決定性契約：少擲一次或晚擲一次，之後每一次取樣都會錯位，同一個種子會長出
  另一個世界。改的只有擲骰**後面**的查詢（`Set` 查詢取代逐對 `findUnique`，因為每對要寫兩列，
  逐對查詢會變成三倍）。
- `FRIENDSHIP` 事件在友誼成立時寫入：**友誼現在有後果了**（朋友叛逃會提高叛變值），而這是
  玩家唯一能看見友誼的管道。它需要在 `EventLog` 的 `EVENT_CATEGORY` 與 `icons.tsx` 註冊，
  否則會靜默落到預設點。
- 兩種關係都以**扁平的一對**送到客戶端（`{aId, bId, sinceRound}`，與 `roads` 同形），
  由 `src/lib/relations.ts` 的 `relationsOf()` 反轉。**去重不是選配**：不滿的同一對有兩列，
  不去重就會把同一個人在名單裡印兩次。
- 將領彈窗有「關係」分頁列出朋友與不滿的人（`LeaderRelations`，在 `leader-detail.tsx`），
  名字可點進對方的彈窗。`DetailModal` 本身**不能**加分頁——它同時是勢力排行的外殼。

#### 建築 / Buildings（`server/phases/build.ts`）

- 每地點每回合隨機挑一種建築升級；僅有總督的地點可升級；總督付錢
- **費用：`cost = BUILDING_UPGRADE_COST_BASE(100) × 2^currentLevel`**（指數成長：0→1 級 100、1→2 級 200、2→3 級 400、3→4 級 800、4→5 級 1600）
- 最高等級 5
- **UI 印的價格必須是「這一步」的價錢**，也就是 `costToReachLevel(level) = upgradeCost(level - 1)`，
  與 `build.ts` 收的完全相同。原本等級清單印的是「從 0 累積到這裡」的總額（`totalCostToReach(2)`
  = 300），而卡片印 200 —— 同一個目標兩個價錢，其中一個從未被收過。`totalCostToReach` 已刪除。
- **卡片同時印下一級的效果**：`+20% → +40%`（**累積**值 `buildingTotal(kind, level + 1)`，
  不是每級值）。價格標籤用 `place.upgradeCost`（「升級費用」）而不是「金錢」，否則市場的
  效果（+5 金錢）與價格（金錢）同名，讀起來像同一件事的兩個數量。

#### 戰鬥 / Battle（`server/phases/battle.ts`）

**通用隨機數：** `rand = rng.float(0.85, 1.15)`（atk / def 各自獨立擲骰）

**A. 攻堅駐軍（無主地點或無將領駐軍）：**
```
atk = attacker.troops × (1 + effectiveWu × 1/30) × atkRand
def = place.garrison  × (1 + fortress × 0.2)   × defRand   // 駐軍無統帥，ti 不計
```
- `atk > def` → 駐軍全滅、攻擊者 `troops = floor(troops × 0.9)`（疲勞）後佔領
- 否則攻擊者逃跑：`escapeChance = clamp(0.5 + attacker.speed × 0.02, 0.1, 0.9)`（駐軍速度視為 0）

**B. 將領對戰（攻擊者 vs 地點守將）：**
```
atk   = attacker.troops  × (1 + effectiveWu   × 1/30) × atkRand
def   = defender.troops  × (1 + effectiveTi   × 1/30) × (1 + fortress × 0.2) × defRand
```
- 攻擊者勝：守將逃跑（公式同下）；攻擊者 `troops = floor(troops × 0.9)`

**C. 同地點關係對戰鬥力的影響 / Co-located relations and combat ability**
- 朋友在**同一個地點** → 該將領的 `wu` 與 `ti` **+1**（`FRIEND_SAME_PLACE_DELTA`）
- 不滿的人在**同一個地點** → 該將領的 `wu` 與 `ti` **−1**（`DISCONTENT_SAME_PLACE_DELTA`）
- `effectiveWu = max(1, wu + delta)`、`effectiveTi = max(1, ti + delta)`
- **不寫入資料庫**：`Character` 的欄位完全不動，delta 每次都從目前位置重新推導，
  所以「離開就回復」是自動的，沒有任何狀態需要撤銷
- **每種關係各自最多計 `RELATION_SAME_PLACE_MAX`(3) 位**：沒有上限的話十位同地點朋友
  就是 +10 武力，而整個能力區間只有 5–30
- 計算在 `src/lib/relationCombat.ts`（純函式），**伺服器與客戶端共用**同一個：
  `battle.ts` 用它算交戰，將領彈窗用它顯示面板上的數字，兩邊不可能對不上
- 戰報印的是**有效** `wu`，因為它同時印出
  `atk = troops × (1 + attackerWu/30) × roll`——印基礎值會跟旁邊的 `attackPower` 對不上
- 守將勝：攻擊者逃跑，`speedDiff = attacker.speed − defender.speed`

**逃跑 / Escape（兩者共用）：**
```
escapeChance = clamp(SPEED_ESCAPE_BASE(0.5) + speedDiff × 0.02, 0.1, 0.9)
```
- 成功 → 移動到鄰近「同勢力或無主」地點，`troops = 0`；找不到落腳點 → 留在原地 `troops = 0`
- 失敗 → 死亡（`BATTLE_DEATH`）

#### 叛變 / Defection（`server/phases/loyaltyCheck.ts`）

國王與叛變者不會被檢查（`isKing: false` 過濾）。叛變值是**加法**的，不是乘法的：
```
value  = defectionBase
       + (忠誠標籤與君王不同 ? DEFECTION_VALUE_LOYALTY_PENALTY(2) : 0)
       + 本回合此人的 DefectionEvent **delta 總和**

chance = (value − DEFECTION_MIDPOINT(17.5)) / 17.5 × DEFECTION_BASE_RATE(0.05)
```
- **沒有乘數。** 舊版的乘算鏈（`defectionBase × 0.5`、忠誠 `× 1.2`、朋友叛逃 `× 1.5`、
  大勢力 `× 0.8`、不滿 `× 1.3`）**已經移除**。乘數會疊乘，沒有任何單一因子能被單獨讀出
  來，而且「朋友叛逃 × 1.5」乘的是**機率**而不是**風險**。朋友叛逃現在是**帳本裡的一筆
  `+DEFECTION_FRIEND_DELTA`**，見下。
- **No multipliers.** The old multiplicative chain (`defectionBase × 0.5`, loyalty `× 1.2`,
  friend-defection `× 1.5`, large faction `× 0.8`, discontent `× 1.3`) is **retired**.
  Multipliers compound, so no single factor could be read off on its own, and "friend
  defected × 1.5" doubled the *probability* rather than the *risk*. A friend's defection is
  now a ledger row of `+DEFECTION_FRIEND_DELTA` — see below.
- 17.5 = (5 + 30) / 2，是 `defectionBase` 的中點。**低於中點時機率為 0**（不是負數）。
- 忠誠標籤是**唯一**寫死的加項：它是標籤比較，不會產生 `DefectionEvent`，所以沒有
  delta 可加。其餘全部來自資料庫裡的真實 delta。

#### 野心變化 / Defection-value changes（`server/phases/defectionEvents.ts`）

每回合對每個角色計算 `delta`，最終 `clamp(5, 30)`：
- `+ DEFECTION_NO_PROMOTION_DELTA(1)`：若 ≥ 20 回合未升遷（`roundsSincePromotion ≥ 20`，從未升遷者以 `round` 計算）
- 國王統率降低叛變值的規則**已移除**（統領現在只影響購兵量）
- **朋友叛逃 `+ DEFECTION_FRIEND_DELTA(2)`**（每個叛逃的朋友各 +2，影響 `DEFECTION_FRIEND_ROUNDS(10)` 回合）
  - 與冷卻**相反號**：朋友走了，自己也更想走
  - **每一位朋友只算一次**：同一人叛逃兩次，重複的那次已由冷卻記過帳
  - **友誼必須在背叛當時就存在**（`Friendship.sinceRound ≤ 叛逃回合`），否則事後才成為朋友
    的人仍然會被記上一筆
  - **晚一回合生效**：本階段（7）在 `loyaltyCheck`（8）之前跑，所以本回合的叛逃此刻還不存在。
    第 N 回合的背叛，是從第 N+1 回合起影響到 N+10
  - 查詢只做一次：冷卻視窗（20 回合）較長，由它決定查詢範圍；朋友視窗（10 回合）在同一趟裡過濾
- 叛變冷卻 `− DEFECTION_COOLING_DELTA(−2)`：視窗內每有一次叛變就各寫一筆，所以會疊加

#### 行政官任命 / Administrator Assignment（`server/adminAssign.ts`）

四條任命路徑共用 `grantAdmin` / `revokeAdmin` / `isAdminChangeCoolingDown`：

- **任命 `grantAdmin`**：清除該角色在其他地點的職務（`administratorId` 全域 `@unique`，**只清 `administratorId`、不打冷卻錨點**，見下）→ 寫入新地的 `administratorId`、`Place.adminChangedRound = round`、`lastPromotedRound` → 寫入一筆 `− DEFECTION_ADMIN_ASSIGNED_DELTA(1)` 的 `DefectionEvent`。**沒有自動回復**——這是永久的帳本項目。
- **免職 `revokeAdmin`**：寫入一筆 `+ DEFECTION_ADMIN_REPLACED_DELTA(1)` 的 `DefectionEvent`。
- **「暫時減免＋到期回復」整組機制已經移除**：欄位 `adminAmbitionRevertRound`（已刪）、`AMBITION_RECOVERED` 事件型態（從未被任何程式寫出）、以及三個消費它的 UI 分支，都已一併刪除。這段文字以前把它描述成運作中的行為，那是錯的。
- **路徑**：階段 2 `spawnCharacters`（受冷卻限制）· 階段 12 `assignAdmins`（受冷卻限制）· 階段 10 `battle.ts` 奪取（**不受**冷卻限制）· `POST /api/admin/assign-admin` 手動指派（**不受**冷卻限制，且會先免職舊任者）
- **冷卻 `ADMIN_CHANGE_COOLDOWN_ROUNDS(10)`**：**授予與免職**都寫入該地的 `Place.adminChangedRound`；`round - adminChangedRound < 10` 時**僅 AI 路徑**跳過該地點（`assignAdmins` 以 `where` 過濾，`spawnCharacters` 以 `isAdminChangeCoolingDown()` 判斷）
- **搬 seat 的清空刻意不打點**（Oct 2026，`server/adminAssign.noStamp.test.ts` 鎖住 `data:` 物件）：將領到新地任職時，清空動作讓**舊地**變空——那裡沒有比較、沒有戰鬥，並非「異動」。打點會讓空著的舊地在 `assignAdmins` 凍結整整十回合（`where` 只讀 `adminChangedRound`），40% 的行政官分成一直沒人領；因此舊地**下一回合**就有資格被指派新行政官。新地照樣打點。
- **地方彈窗顯示冷卻**（Oct 2026）：`adminChangedRound` 隨 `/api/world/state` 兩條路徑送出，`PlaceDetail` 的「行政官冷卻」列在冷卻中以青色顯示剩餘回合、結束後轉灰（`上次異動 RND 000N`）。舊快照沒有此欄位（`undefined`）與 `null`（從未異動）都不顯示列，且兩者刻意區分——`undefined` 是「這份歷史資料不帶此欄」，不是「從未異動」。

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

#### 統計圖表 / Stats Charts（`src/app/game/stats-charts.tsx`）

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

##### 頭像動畫與叛離事件 / Avatar animation and defection rows

- `blinkAmount(t)` 與 `talkAmount(t)` 都是**純匯出函式**，不碰 DOM 就能測。眨眼是**三角波**
  （0.14 秒、每 4 秒一次）——線性淡入淡出看起來像瞇眼，不像眨眼。說話是一次話裡三次開合
  然後**停頓**；少了停頓，嘴會像壞掉的節拍器而不是在說話。
- 眼睛與嘴都從**自己的中心**縮放，嘴以**上緣**為樞紐往下張開。從元素原點縮放會讓眼睛閉上時
  整個往上跑，看起來像渲染錯誤。
- 三個動畫（呼吸、眨眼、說話）共用既有的 rAF 迴圈、只寫 `transform`；逐幀 `setState` 會重繪
  整張臉與每個呼叫端。掛載、清除與 `prefers-reduced-motion` 時都會畫一次 `applyFace(0)`，
  所以靜止的頭像是停在它收斂後的那一格，而不是未動畫的預設格。
- **速度是第四個線索**：身後 1/2/3 條動勢線，用自己的色階（`SPEED_TIER_COLOR`），刻意**不**
  沿用三個屬性共用的金／鋼／麻，否則它看起來又是一件戲服。線畫在頭部**之前**才會像拖在身後。
  `avatarCues()` 因此回傳**四**列，hover 提示也會說明速度線代表什麼。
- `DEFECTION` 事件現在帶 `oldFactionName` 與 `placeName`，列會寫出「離開了 X · 在 Y · 加入了 Z」
  （或「建立了新勢力 Z」）。三個寫入點中有**兩個**原本連勢力名與地名都沒存，所以日誌只能寫
  「某某 叛離了原勢力」，把最該說清楚的資訊留給玩家自己猜。勢力名以純文字顯示、不可點擊，
  也**絕不**退回顯示 id——那會把 `cmus...` 這種原始字串洩漏到介面上。

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
return { ..., crown: isKing, wuTier: tierFor(character.wu) };
```

資料如何影響外觀 / how real data shows up:

| 資料 | 影響 |
|------|------|
| `isKing` | 王冠（且**不**戴頭飾，否則王冠會被蓋掉） |
| `age ≥ 60` | 髮色轉灰／白，且較容易留鬍 |
| `ambition ≥ 20` | 眉壓低，看起來較兇 |
| 陣營色 | 衣袍、額帶與底色 |

三項能力各自分**三段**（`high` / `mid` / `low`），門檻集中在 `gameConfig` 之外的一組常數：
`tierFor()` 以 `ABILITY_HIGH = 25`、`ABILITY_MID = 18` 切開 5–30 的值域。

| 段 | `wu`（頭） | `tong`（肩） | `jing`（胸前） |
|----|------|--------|--------|
| high | 有盔翎的頭盔 | 寬金肩章 + 流蘇 | 算盤 |
| mid | 有結的額帶 | 素鋼肩章 | 方孔銅錢 |
| low | 疤痕 | 細麻補丁肩帶 | 空的束口袋 |

舊規則只有 `high` 給配件，結果約八成的將領身上完全讀不出能力差異。`mid` 是最常見的一檔，
所以「大多數將領有額帶、素肩章、銅錢」本身就是資訊；`low` 則刻意畫成破舊的樣子，讓強弱一眼可辨。

`TIER_MATERIAL` 把三段對應到**三種材質**（金 / 鋼 / 麻），三項能力共用同一組顏色，所以階級
是橫向可比的。銅錢一定要挖方孔——圓外形人人會畫，方孔才是辨識關鍵。

四條渲染規則是實際渲染 27 種組合後才發現的 / four rendering rules, each learned from
rendering all 27 combinations:

1. **各占一個身體區域**：`wu` 在頭、`tong` 在肩、`jing` 在胸前中央。舊版把披巾／細繩與
   算盤珠／銅錢／補丁全擠在胸口與腰間，於是互相干擾而看不清楚。
2. **同一個物件逐級劣化**：肩章是金寬板 → 素鋼板 → 細麻補丁；經濟是滿算盤 → 一枚銅錢 → 空袋。
   漸層看得見「順序」，三個無關物件則看不出來。肩章劣化時**還會變小**，因此大小也帶著階級。
3. **弱的線索要比衣袍亮，且絕不用衣袍的顏色**：深色腰帶疊在深色衣袍上等於看不見，與衣袍同色的
   縫線等於沒有縫線——兩者都會讓 `low` 段悄悄地退回「沒有訊號」。`low` 肩帶刻意是一條素帶，
   因為毛邊會模仿 `high` 肩章的流蘇。頭盔也往上挪到眉毛之上，原本的高度讓盔緣直接橫切過雙眼。
4. **王冠壓掉頭飾**：君王不戴 `high` 頭盔、也不戴 `mid` 額帶，但保留 `low` 疤痕——疤痕不是
   頭飾，受過傷不等於是君王。分級本身如實回報數值，抑制是渲染層的工作，這樣
   `deriveAvatarTraits` 才測得到分級。

**特徵邏輯是純函式** `deriveAvatarTraits(character)`，元件只負責畫。測試因此不需要 DOM，
可以在專案既有的 `node` vitest 環境下跑（`LeaderAvatar.test.ts`）—— 專案的 vitest 只收
`src/**/*.test.ts` 且 `environment: 'node'`，所以新增特徵請加在純函式裡，不要塞進 JSX。

特徵池（膚色、髮色…）是**內容**不是設計 token，跟名稱產生器的字庫同一類，所以放在程式碼裡；
只有陣營色是執行期資料，用 inline style 套用。

---

## 經濟與戰報 / Economy & Battle Report

### 經濟 / Economy

- **無主之地完全不進入經濟循環**：不產出、不徵兵、也不寫事件。無主之地沒有勢力在其上收稅或養兵，
  讓它出現在事件日誌只會被讀成「這裡有人在收錢」。
- **一個地方要有住在這裡的角色才算被掌握**：`place.characters` 為空時，連國王的份也不發——否則一座
  空城照樣把收益送給遠方的國王。作法是把空位視為未填補（`kingId` / `adminId` 都是 `null`），
  於是三個分配分支都不會執行。
- 收益分配：**君王 10%、行政官 60%、其他人 30%**（Oct 2026 由 30/40/30 改來，把君王的 20% 挪給實際管事的行政官；「其他人」＝**受控勢力**的駐場將領，`othersOf()`；異勢力的將領站在這裡不領這裡的錢）；`jing`（經濟）會放大領導者實拿的金額（見 `server/income.ts`）。行政官拿最大的一份，因為實際管事的是他。
  **當君王與行政官是同一個人**時，他理所當然拿到兩份（10% + 60%），事件日誌必須合併成一行，
  否則會出現「某某 得 3 金 · 某某 得 2 金」這種看起來像重複的紀錄。
- **徵兵**（`PLACE_BASE_RECRUIT` + `barracks × PLACE_BARRACKS_RECRUIT_PER_LV`）加的是**地方的駐軍**，
  不會變成任何角色的個人兵力。
- **領導者的個人兵力只能買**：`CHAR_BUY_TROOP_PRICE` 每兵 2 金，一次買 10–100，前提是可負擔至少 10 兵
  （即 20 金）。戰鬥只會讓兵力下降：獲勝 `CHAR_FATIGUE_PER_WIN`（×0.9），撤退或陣亡歸零。
  新生成的角色 `troops: 0`。

### 缺位時的分配，以及 tong 的新角色 / Vacancies, and tong's new role

- **沒有行政官 → 誰都不拿。** 舊規則是「總督份額歸國王」，現在相反。行政官是實際管事的人，
  沒有他代表這個地方沒有人治理，把錢轉給遠方的國王等於付給一個不在場的人；錢留在地方上。
- **沒有其他人 → 行政官拿 90%**（60% + 30%；君王仍拿 10%）。倍率只作用一次，所以不會被重複放大。
- **沒有君王 → 行政官拿 100%**（60% + 10% + 30%——君王的 10% 與其他人的 30% 都無人可分時）。
- 三份加起來**永遠等於 income**。縮放回來之後的餘額在沒有其他人時歸行政官——早期版本直接回傳
  `others: 0`，那筆錢會憑空消失，是測試抓出來的。
- **彈窗的每一列分成帶**有效**比例，餅要推導出來**（Oct 2026——用戶回報：總收入 10 旁邊印
  👑 +2、👤 +5，讀起來像帳目不平）。`splitIncome` 的回傳多了 `portions`
  `{ king, admin, others }`：**含缺位吸收**的有效比例（君王缺席時行政官 70%、沒有其他人時
  再吸掉 30% → 90%）。地方彈窗的「總收入」列印**基礎**收入，底下跟一行推導
  （`總收入 10 × 經濟倍率 1.42（行政官 jing 30）→ 產出 14`），因為分成對著**放大後的餅**
  （`placeOutput`）算——直接對基礎收入印，加總永遠對不上，讀者會以為錢憑空少了。
  「其他人」印成一列合計（`其他人 ×N（30%）`，金額是**實發**的 `floor(others/N) × N`），
  floor 的餘數註明留在地方。**絕不印死 60%**——寫死的比例會讓列加總對不上餅。
  The place popup's split rows carry their **effective** portions and the pie is derived, not
  implied (Oct 2026 — a user report read 總收入 10 beside 👑 +2 / 👤 +5 as an unbalanced
  ledger). `splitIncome` now returns `portions { king, admin, others }`: absorption-inclusive
  (70% for an absent king, +30% more → 90% when nobody else is present). The popup's 總收入 row prints
  the **base** income with a derivation line under it, because the split is computed against the
  **grown** pie (`placeOutput`) — against the base alone the rows can never sum, and the reader
  concludes gold vanished. The others bucket prints as one lead-in row with the **actually paid**
  total, and the floor remainder is stated as staying with the place. **Never print a hard 40%.**
- **tong（統領）現在只影響購兵量**：
  `上限 = CHAR_BUY_TROOP_MAX × (1 + (tong − INCOME_TONG_MIDPOINT) / CHAR_ABILITY_MAX)`，
  與 `jingIncomeMultiplier` 完全同形（測試直接斷言兩者對同一輸入給出同一答案）。
- **tong 完全不影響叛變**（`AMBITION_KING_TONG_REDUCE` 與 `AMBITION_KING_TONG_DELTA` 皆已移除，後者曾透過帳本持續影響叛變值）
  防禦改由新的**體魄 (ti)** 負責。

### `INCOME` 事件 / The `INCOME` event

- 由 `economy.ts` 每回合**每地寫一筆**，不是每人一筆：世界有上百個地方，每人一筆每回合就是數百筆事件，
  而一筆就已經回答「錢從哪裡來、給了多少」。
- 攜帶 `income`、`recruits`、`garrisonAfter`，以及每位收款人的 `*Gold` 與**發完後的總額** `*GoldAfter`。
  「增加量」與「總量」都要，日誌才說得出「現在有多少」。
- 只記錄**真的發出**的金額：沒有控制者時 split 仍算得出數字，但那些錢沒發出去，照抄會讓日誌顯示
  「收益 10 金」卻沒有收款人。

### `TROOPS_BOUGHT` 事件 / The `TROOPS_BOUGHT` event

- 由 `economy.ts` 在**每次購買**時寫一筆：`charId` + `charName`、`placeId` + `placeName`、`bought`、
  `cost`，以及成交後的 `goldAfter` / `troopsAfter`。
- **為什麼需要它**：`INCOME` 只記錄「一個地方發了多少錢」，所以單看它，日誌會顯示「某某 得 5 金」
  卻永遠不會說那筆錢換成了幾個兵——金錢的流向會斷在半路。帶上**花完後的餘額與兵力**，日誌才說得出
  「他現在買不買得起下一批」，光有花費是不夠的。
- 帶 `charId`（不只是名稱）才能點回該將領；帶 `placeId` 則可以把地圖鏡頭帶到成交的地點。
- 分在 `economy` 類別，圖示是「硬幣 + 上行箭頭」。新增事件型別時必須同時加進 `EventLog.tsx` 的
  `EVENT_CATEGORY` **與** `EventGlyph` 的 switch，否則會靜靜地掉到預設圓點。

### `PLACE_CAPTURED` 的戰報 / The capture report

- `PLACE_CAPTURED` 現在帶著 `report`：攻守雙方算式的每一項（`attackerTroops`、`attackerWu`、`attackRoll`、
  `attackPower`、`defenderGarrison`、`defenderFortress`、`defenceRoll`、`defencePower`、`outcome`）。
- **`report` 是 `null` 就是「無守軍」**。一場佔領有兩種完全不同的經過（打了一場守軍，或走進空城），
  事件列看不出差別，所以 `BattleReport.tsx` 明白寫出「無守軍」，而不是留一格空白讓人以為是 bug。
- 建構子抽在 `server/battleReport.ts`（**純函式、不碰資料庫**），所以三種情況都能直接測——`battle.ts`
  在載入時就建立 prisma client，想測那段邏輯就必須連上資料庫。
- 戰報彈窗被 portal 到 `document.body`：事件日誌是捲動容器，絕對定位的面板會跟著列捲走。

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

標籤顯示規則 / Label visibility：**純粹看縮放** —— 只有 `camera.ratio <= CONFIG.LABEL_ZOOM_RATIO`（0.5，定義於 `gameConfig.ts`）才渲染地名，與兵力無關；由 `nodeReducer` 在拉遠時把 `label` 設為 `null`，並把 `labelRenderedSizeThreshold` 釘為 `0`。不要改回用節點尺寸過濾：那样兵多的地名在拉遠時仍會留著，而且縮放比例在該比較中會被抵消，本來就不是縮放門檻。跨過門檻時由 camera 的 `updated` 事件觸發 `refresh()`。覆蓋 `<canvas>`（聚光燈層）畫在 sigma 容器之下，故標籤永遠疊在光環之上。

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

##### 節點發光與陰影 — 已移除 / Node Glow & Shadow — removed

**地圖上的節點發光與陰影層已經移除，任何縮放都不再有。** 原本這裡是第二張覆蓋 `<canvas>`，
位於聚光燈層**之下**、sigma 容器**之上**：先鋪一層往右下偏移的暗影，再鋪一層依勢力色的柔和發光。

拿掉之後地圖比較平，但道路與節點本身的對比更乾淨，而且銀河與霧氣不再需要跟發光搶注意力。
**不要把它加回來**：`getGlowSprite`、`SPRITE_SIZE`、`readDesignToken` 與共用的 `withAlpha`
已從 `mapShared.ts` 一起移除，`MAP_GLOW_*` / `MAP_SHADOW_*` 也從 `gameConfig.ts` 移除。
`MAP_SHADOW_FALLBACK` 只為一件事留下：**地名標籤的文字陰影**。

**The node glow and drop shadow layer is removed, at every zoom.** It used to be a second overlay
`<canvas>` (below the spotlight layer, above the sigma container) that painted an offset shadow then a
faction-coloured glow. Do not add it back: `getGlowSprite`, `SPRITE_SIZE`, `readDesignToken` and the
shared `withAlpha` are gone from `mapShared.ts`, and `MAP_GLOW_*` / `MAP_SHADOW_*` from
`gameConfig.ts`. `MAP_SHADOW_FALLBACK` remains for the **label** text shadow only.

地圖內陰影仍是設計 token `--shadow-ds-map-vignette`（`globals.css` 的 `@theme static`），以
`shadow-ds-map-vignette` 使用。

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

### 縮放滑桿 / The Zoom Slider

鏡頭比例由 Sigma 擁有，但 HUD 需要一個能追蹤它的滑桿。做法是把比例**反向包裝**成
`0 = 最近、1 = 最遠`，再包進 `MapCameraControls`：

The camera ratio belongs to Sigma, but the HUD needs a slider that tracks it. The ratio is
**inverted** into `0 = closest, 1 = furthest` and exposed through `MapCameraControls`:

```typescript
// SigmaMap.tsx — 以實際 bounds 正規化，bounds 讀不到時退回 CONFIG
const MIN = camera.minRatio ?? CONFIG.MAP_ZOOM_MIN_RATIO;
const MAX = camera.maxRatio ?? CONFIG.MAP_ZOOM_MAX_RATIO;
const ratioToZoom = (r: number) => 1 - (r - MIN) / (MAX - MIN);

// page.tsx — 直接 setState、不做動畫，讓滑桿跟著指標走
<input type="range" min={0} max={1} step={0.01} value={zoom}
       onChange={(e) => { const next = Number(e.target.value); setZoom(next); controls?.setZoom(next); }} />
```

`onZoomChange` 回傳退訂函式，`ZoomSlider` 在 effect 裡訂閱、cleanup 裡退訂。控制物件必須
**同時**存進 ref（給命令式呼叫）與 state（給渲染）：render 期間讀 `ref.current` 會觸發
lint "Cannot access refs during render"。

`onZoomChange` returns an unsubscribe function; `ZoomSlider` subscribes in an effect and
unsubscribes in its cleanup. The controls object must live in **both** a ref (imperative calls)
and state (rendering): reading `ref.current` during render trips the lint rule above.

**百分比是 `<input type="number">`，不是純顯示。** 它讀 `0` = 最遠、`100` = 最近，輸入數值會直接跳到
那個縮放（Enter 套用，失焦也套用——只用 blur 的話按 Enter 後文字不會生效；兩者都留著才能涵蓋
「習慣按 Enter」與「習慣點別處」）。草稿是**字串**而不是數字：數值會在第一個按鍵就把 `15` 改寫成
`1%` 並把游標甩到最後。拖曳滑桿會清掉草稿，讓欄位重新跟著縮放走。

The percentage is an `<input type="number">`, not a display. It reads `0` = furthest, `100` = closest,
and typing a value jumps the camera there (`Enter` commits, and so does blur — Enter alone would leave
the text unapplied for someone who tabs away). The draft is a **string**, never a number: a numeric
value would reformat `15` to `1` on the first keystroke and throw the caret to the end. Dragging the
slider clears the draft so the field follows the zoom again.

### 標籤的可見性例外 / The Label Visibility Exception

縮放規則是純粹的 `camera.ratio <= LABEL_ZOOM_RATIO`，而 `nodeReducer` 用 `label = null`
隱藏標籤。但 `forceLabel` **只**繞過 `labelRenderedSizeThreshold`——標籤被設成 `null` 時
就已經離開 Sigma 的 label index，`forceLabel` 什麼都畫不出來。因此 gate 必須排除
active 節點：

The zoom rule is purely `camera.ratio <= LABEL_ZOOM_RATIO`, and `nodeReducer` hides labels by
setting `label = null`. But `forceLabel` only bypasses `labelRenderedSizeThreshold` — a `null`
label has already left Sigma's label index, so `forceLabel` cannot bring it back. The gate
must therefore exclude active nodes:

```typescript
const isActive = node === hoveredNodeRef.current
              || node === selectedPlaceIdRef.current
              || hoveredNeighborsRef.current.has(node);
if (!labelsVisibleRef.current && !isActive) res.label = null; // 絕不 null active 節點
```

### 面板疊在地圖上 / The Overlaid Panel

將領／事件／統計不是版面欄位，而是絕對定位覆蓋在地圖右緣（`z-[8]`），地圖因此保留完整
寬度。HUD 的相機控制會在面板展開時左移 `26rem` 讓位，而且**只在 `lg` 以上**——固定偏移在
窄視窗會把控制推出畫面。**再點一次已啟用的頁籤會關閉它的面板**（`rightTab === tab` 時
`setRightTab(null)` + `setRightPanelOpen(false)`）——這是切換語意，讓頁籤列永遠能收起自己。

The 將領 / 事件 / 統計 tabs are absolutely positioned over the map's right edge (`z-[8]`)
rather than being a layout column, so the map keeps its full width. The HUD camera controls
shift left by `26rem` while the panel is open, and **only from `lg` up** — a fixed offset
pushes them off-screen on narrow viewports. **Clicking the already-active tab closes its
panel** (`rightTab === tab` → `setRightTab(null)` + `setRightPanelOpen(false)`) — a toggle,
so the rail can always dismiss its own panel.


### 白邊、黑影與星系 / Node border, shadow and star systems

**每個地點都有一圈白邊與一層柔和黑影。** 星雲與近黑的底會吞掉沒有邊界的圓盤
（"otherwise the star cloud and dark space background make place is difficult to see"）。
兩者都畫在**既有的覆蓋層**上、且必須落在圓盤**之外**，因為覆蓋層的 DOM 在 sigma 的 WebGL
canvas **之前** —— 只有圓盤外面那一圈會露出來。新開一張 canvas 蓋在 sigma 上面會擋住地名
標籤，而專案規則禁止那樣做。

**Sigma 3.0.3 的 ESM 組建沒有節點邊框支援。** `borders` 選項只存在於過期的 `sigma.min.js`
UMD 產物、不可匯入，所以邊框無法設定在節點程式上，只能手繪 —— 這就是它畫在覆蓋層的原因。

黑影用**幾圈同心描邊、透明度逐圈遞減**（`MAP_NODE_SHADOW_LAYERS` / `_FALLOFF`），
而不是每個節點一個 `createRadialGradient`：後者是每幀上千個漸層物件。**近黑底上的黑影
本來就近乎無效** —— 那是真實物理，不是 bug，它只在銀河真正亮的地方才看得出來，而那正是
使用者要求的場景。

**節點半徑的數學，因為它決定了這裡每一個尺寸。** Sigma 的 `scaleSize` 就是
`size / sqrt(camera.ratio)`（預設 `itemSizesReference: "screen"`，沒有別的因子）。所以
`size: 5.7` 的節點在 ratio 3 時半徑約 3.3px、預設視野（約 1.18）約 5.25px、ratio 0.08 約 20px。
在預設縮放下圍著圓盤畫「1.3px」是算術上的細線，不是美感問題 —— 請對著數字調，不要靠眼睛。

**放大到 `MAP_STAR_ZOOM_RATIO`（0.2）以下，地點變成星系。** sigma 的 ratio 越小越近，
所以那是縮放滑桿約 95% 的位置 —— **一般視圖完全沒有星系**，別把「沒有」當成 bug。
太陽 **不再是同一個顏色**：`starClassOf(placeId)` 由地點 id 抽一個 `MAP_STAR_SUN_CLASSES`
（`core` / `edge` 成對），在**建圖時**就存進節點的 `starClass`。圓盤由 sigma 畫、柔光由覆蓋層
畫，是兩條路徑；讓兩邊各自抽並不會錯，但那是兩次雜湊，而且只靠「實作剛好一致」才會保持同步 ——
節點層是唯一的事實來源，改動時不可能只改到一邊。`nodeReducer` 設 `res.color = starClass.core`，
柔光用同一組的 `edge`，外圈是 `transparent(edge)`（`#rrggbb00`）而不是寫死的 rgba。
大小是 `MAP_STAR_SUN_SCREEN_PX * starScale / sigma.scaleSize(1)`，所以跟著鏡頭走。
**刻意不選深紅與深藍**：軌道才是勢力的通道，而太陽是星系裡最大的一塊顏色。
The sun is **no longer one colour**: `starClassOf(placeId)` draws one `MAP_STAR_SUN_CLASSES`
entry (a `core`/`edge` pair) from the place id and stores it on the node as `starClass` **at
graph-build time**. The disc is painted by Sigma and the glow by the overlay, two code paths;
letting both draw their own is not wrong, but it is two hashes that agree only because the two
implementations happen to match. `nodeReducer` sets `res.color = starClass.core` and the glow
uses the same `edge`, with `transparent(edge)` for its outer stop rather than a hardcoded rgba.
之下，畫在那裡會被道路壓過，太陽中央就多一道黑線。讓 sigma 畫圓盤才能維持「道路 → 太陽」
的順序。因為大小是螢幕固定的，`nodeReducer` 必須跟著鏡頭重算，所以 `syncStarView` 在
星系層是**每個 camera `updated` 都 `refresh()`**，不只是跨門檻時 —— 只在跨門檻 refresh 會讓
太陽停在剛跨過時的大小。它與 `syncLabelVisibility` 是兩個不同的監聽，因為 0.2 與 0.6 是
兩個不同門檻，跨過其中一個不會觸發另一個。

**月球的軌道在行星之外**（`planetRadius + MAP_STAR_MOON_GAP_PX + n × _STEP_PX`）。第一版
用 `0.34 × 節點半徑`，所以每顆月球都在圓盤裡面 —— 那正是「月球和行星都跑到地點裡面去」的
來源。**軌道的勢力色要讀 `attrs.factionData?.color`，不能退回 `attrs.color`**：無主節點的
顏色是刻意壓暗的灰，在近黑背景上疊半透明幾乎等於沒畫，整個星系會塌成一個光點。
行星與月球純粹由地點 id 決定，什麼都不存。地名畫在星系**上方**，靠 `defaultDrawNodeLabel`；
sigma 內建的標籤程式只會把文字畫在節點右側、沒有垂直偏移，所以非星系層完全委派回去。

**不要為「沒有聚光燈也沒有移動點」提早返回。** 這段 early return 存在過，而且會無聲地讓
地圖整片空白：迴圈原本只為那兩個會動的東西存在，現在還負責**常駐裝飾**（白邊、黑影、
星系）。剛重灌的世界是回合 1、零 `PLACE_CREATED`、零 `CHARACTER_MOVED`，於是兩個陣列都
是空的、門檻就觸發了 —— 地點還看得見（圓盤是 sigma 畫的），但覆蓋層從未啟動。**症狀是
「地點還在但裝飾全沒了」，看起來像渲染 bug 而不像迴圈沒跑。**
### 領地圖 / Territory View

每個地方各自推出**一個一樣大的圓形力**，同勢力的力**累加**，不同勢力的力互相**抵擋**，
邊界落在兩邊力相等處 —— 也就是 Stellaris / CK3 的做法。**領地是蓋在原圖上的半透明色層**：
節點、道路、光暈都保持不透明，無主之地不上色，所以地形與領地可以同時閱讀。

Every place projects an **equal circular force**; same-faction force **accumulates** and
rival forces **push against** each other, so the border lands where the two are equal —
the Stellaris / CK3 idea. The territory is a **translucent tint over the map**: nodes,
roads stay opaque and unowned land is never coloured, so topography and territory
read at the same time.

#### 勢力提示的三個數字 / The faction tooltip's three numbers

勢力提示回答的是「這塊地是誰的、靠什麼撐著」，因此除了地方數，還印**總兵力**、
**將領數**與**君主**。原本只有地方數，於是勢力排行與雷達都顯示著地圖從未呈現的數字，
三個面板對同一個勢力各說各話。

The faction tooltip answers "whose ground is this, and what holds it up", so beyond the
place count it also prints **total troops**, **leader count** and the **ruler**. It carried
only a place count before, so the faction ranking and the radar showed numbers the map
never displayed and three panels disagreed about the same faction.

| 欄位 / field | 來源 / source | 為這樣定義 / why |
|---|---|---|
| `troops` | 該勢力所有地方的 `garrison + 將領兵力` / `garrison + leader troops` over all its places | **與地方提示和節點大小同一個口徑。** 若只算駐軍，讀者會看到「這個勢力 300 兵」而點進某地寫「將領兵力 200」，兩個數字推不出關係 / **The same basis as the place tooltip and the node size.** Garrison-only would show "300 troops" beside a place reading "leader troops 200", with no way to relate them |
| `leaderCount` | 依 `factionId` 計算存活將領 / living leaders counted by `factionId` | 還活著但已離開本勢力地盤的人仍然算這個勢力的人 —— 與勢力排行同一口徑 / Someone alive but no longer standing on this faction's ground is still its person, which is what the ranking also uses |
| `kingName` | `faction.kingId` → `characters` 查找 / resolved through a `characters` lookup | 沒有君主時**整列不印**，而不是印「無」；且與地方提示的行政官**分開兩列** / Omitted entirely when there is none rather than printed as "none", and deliberately a **separate row** from the place tooltip's administrator |

已對資料庫驗證：31 駐軍 + 81 將領兵力 = 提示印出的 112。`troopsAtPlace` 是在領地 effect 裡
重算的，而不是與建圖那一趟共用快取 —— 兩份獨立快取必定有一份會過期，而勢力提示會安靜地
少報兵力。

Verified against the database: 31 garrison + 81 leader troops = the 112 the tooltip printed.
`troopsAtPlace` is recomputed inside the territory effect rather than shared with the
graph-build pass: two independent caches means one goes stale, and the faction tooltip
silently under-reports its troops.

`src/lib/territory.ts` 是**純邏輯**，所以可以在專案的 `node` vitest 環境下直接測：

```typescript
// faction 為 null 代表「此地不宣稱任何領土」，並且會把別人的領地挖開一個洞
const field = buildTerritoryField(sites, MAX_RES, MARGIN, BLOB_RADIUS, MIN_FORCE);
const key = factionAt(field, gx, gy);   // hover 勢力面積：問密度場，不是最近節點
const site = nearestSite(sites, gx, gy); // 點擊：一次查詢就夠，不做網格
const mask = neighbourMask(field, px, py); // 邊界畫在哪些邊
```

### 為什麼不能用 Voronoi / Why not a Voronoi partition

最直覺的作法是「每格歸給最近的地方」。那是錯的，理由有兩個，而第二個更要緊：

1. 格子邊界會露出階梯，看起來像像素圖。
2. **同一勢力相鄰的兩個地方之間會多出一條邊界。** 這正是「看起來像 pixel art 而不是
   Stellaris」的主因。

正確做法是**力場**：每個地方投出一個平滑的圓形衰減 `falloff`，同勢力的力**相加**
（`density[f] += w`），每格由力最大的勢力取得。場是平滑的，所以邊界是兩條場相等處的曲線 ——
這就是「距離決定邊界」，而相鄰同勢力因為力直接相加，自然融合成一整片。

**這裡必須有一個最低力量門檻**，而這一點最容易漏掉：單純取最大值時，**任何微小的正值都會
贏過「沒有勢力」**，於是領地永遠等於各地方圓盤的聯集 —— 四個地方畫出來和一個地方一樣大，
勢力大小對面積毫無影響。門檻讓累積的力真的決定能推多遠：一個地方靠自己維持到約 65% 半徑，
四個地方合力推到約 83%。調高門檻＝領地收縮、界線明確；調低＝領地膨脹、彼此擠壓。

The correct model is a **force field**: each place emits a smooth circular `falloff`,
same-faction force **sums** (`density[f] += w`), and each cell goes to the strongest faction.
The field is smooth, so a border is a curve where two fields are equal — which is what makes
distance decide it — and adjacent same-faction places fuse because their force adds directly.

**A minimum-force threshold is load-bearing here, and easy to miss**: with a plain argmax, *any*
tiny positive force beats "no faction", so the territory is always exactly the union of the
per-place discs — four places draw the same area as one and faction size has no effect on it.
The threshold is what makes accumulated force decide reach: a lone place holds ~65% of the
radius, four together ~83%.

### 六個容易踩到的地雷

1. **無主之地不能上色，而且要用「離誰近」而不是「力多大」來判定。** 把它當成一個巨大的灰色
   勢力會把地圖整張蓋掉；CK3 的 map mode 是把勢力色當成**蓋在地圖上的半透明色層**，未宣稱的
   土地完全不動。`TerritorySite.faction` 因此是 `string | null`。比較**力**是行不通的：力一旦
   開始累加，一個有十個地方的勢力在任一點的總力遠大於單一無主地方的力，無主之地會直接被吞掉。
   正確做法是**最近鄰規則**：離無主地方比離任何有主地方更近的格子，就是無主之地自己的地盤，
   留白不畫。`null` 仍然算進最近鄰距離，因為宣稱半徑必須跟整張地圖的疏密一致。
   Comparing *force* cannot work here: once force accumulates, a faction's summed force
   swamps any single unowned place at nearly every point, so the unowned place gets absorbed.
   The rule is **nearest-site**: a cell nearer unowned land than to any owned place is that
   place's own ground and goes unpainted.
2. **半徑要相對。** 用「最近鄰距離平均 × 倍數」，不要用固定世界座標常數，否則地方一多
   就糊成一片、地方一少就小到看不見。
3. **邊界要逐邊畫。** 把整格點亮會變成厚白塊；共用接縫又會變成兩條線。要用
   `neighbourMask()` 逐邊只點亮該方向那一排像素。
4. **領地層在 sigma「之下」**，所以 `draw()` 必須把 `container.style.pointerEvents` 設成
   `none`；代價是 sigma 自己的 wheel/drag 也失效了，於是本層要自己驅動相機
   （`onWheel` 以游標為中心縮放、`onDrag` 平移），離開時一定要還原。
5. **縮放一定要有上下限，而且方向別搞反。** sigma 的 `minRatio`/`maxRatio` 預設都是 `null`，
   而 `getBoundedRatio` 在它們是 `null` 時**完全不做任何夾限** —— 自訂的滾輪處理可以把 ratio
   推到任意大，實測拉遠視圖滾幾下地圖就縮成一個小點、看起來像「地圖消失」。所以要在
   `new Sigma()` 傳 `minCameraRatio` / `maxCameraRatio`。另外 sigma 的 ratio **越小越近**，
   往上滾必須讓 ratio 變小；舊的 `1 - step * deltaY` 方向相反，往上滾會拉遠。
   Bounds must be passed to the `Sigma` constructor, and note that a smaller ratio is closer.
6. **相機的 x / y 也要夾住。** sigma 只限制 ratio，對 `camera.x`/`y` **完全不設限**，所以可以把
   整個世界拖出畫面 —— 實測拖一段之後地圖只剩畫面角落的一小塊。鏡頭 operates 在**框化
   （framed）**空間（sigma 把整張圖塞進以 (0.5,0.5) 為中心、較長邊為 1 的單位正方框），
   所以把鏡頭中心夾在 `[0, 1]` 就等於「鏡頭永遠在世界上空」，同時在 ratio 0.05 時仍可完整平移。
   已在範圍內時必須直接返回，否則每一幀都會遞迴 `setState`。
   Sigma bounds the ratio but nothing else, so the world can be dragged out of frame;
   clamping the camera centre to `[0, 1]` in framed space fixes it.

### hover 要分兩種 / Two different hover readouts

領地視圖畫的是**面積**，但地方節點仍然可見、仍然可互動，所以提示要分兩種：

- **指在某個地方節點上 → 顯示該地方的提示。** 先用**螢幕像素**命中測試
  （`TERRITORY_PLACE_HOVER_PX`）判斷有沒有指到節點，有就顯示地方細節。
  用圖座標距離是錯的：拉遠時同一個門檻會大到整片區域都被算成「指到某個地方」，
  勢力提示就永遠不會出現。
- **指在勢力的一片面積上（不在節點上）→ 顯示勢力提示**，由 `factionAt()` 問**密度場**
  「游標底下這塊是誰的」。用最近節點會得到一個幾乎永遠跟游標無關的小節點。
- 滑鼠停在無主之地或空白處 → **完全沒有提示**，而不是錯顯示鄰居的勢力。
- **拉近到 `TERRITORY_INTERACTIVE_RATIO`（0.9）以下時，面積層完全不可互動。** 低於它時，游標停在
  一塊地面上**不再**回答「這是誰的地」，也**不再**把該勢力的色填亮起來——因為那一段看的是**節點與
  道路**，面積層只是底色，卻還會搶走游標的解讀權，看起來像 bug。
  
  地點**節點**的 hover 與點擊不受影響：那屬於地圖本身。
  
  門檻讀自 `cameraRatioRef`（鏡頭 ratio 的鏡像），因為 `onMove` 是穩定閉包、拿不到 sigma 實例；
  跨過門檻時會**立刻**清掉已亮起的顏色與提示，而不是等下一次 mousemove——那些提示是在比例還算大時
  產生的，留著會變成一個已不該互動的面積層留下的殘影。
  
  Below `TERRITORY_INTERACTIVE_RATIO` (0.9) the area layer is fully inert: pointing at a patch of
  ground no longer answers "whose land is this" and no longer lights that faction's fill, because that
  range is showing **nodes and roads** and the area layer is only a backdrop. Place **node** hover and
  click are unaffected.
  
  The threshold is read from `cameraRatioRef`, a mirror of the camera ratio, because `onMove` is a
  stable closure that cannot reach the sigma instance; crossing it clears the highlight and tooltip at
  once rather than waiting for a mousemove — they were produced while the ratio was still large, and
  left in place they would linger as the residue of an area layer that is no longer interactive.

力場在 **render 期間**用 `useMemo` 從 `places` 算出來，不在 effect 裡算完再 setState：
`Place` 本來就帶 `layoutX`/`layoutY`，而 effect 內同步 setState 會觸發 lint 的
cascading-render 規則。`imageSmoothing` 保持**開啟**：場本身已把邊界算成曲線，平滑只是
去掉最後一點格子階梯。

---

## 氛圍圖層 / Ambient Layers

### 背景銀河與霧氣 / Background galaxy and fog

DOM 順序就是繪製順序，而**霧氣夾在銀河與地圖之間**：

| 順序 | 元素 | 角色 |
|---|---|---|
| 1 | `SpaceGalaxy`（`src/lib/spaceGalaxy.ts` + `src/components/SpaceGalaxy.tsx`） | 深處的場：暖核、星雲、星點 |
| 2 | `SpaceFog`（`src/lib/spaceFog.ts` + `src/components/SpaceFog.tsx`） | 暖色星塵，疊在銀河之上、**地圖之下**；緩慢漂移，沒有縮放淡出 |
| 3 | `SpaceFlow`（`src/lib/spaceFlow.ts` + `src/components/SpaceFlow.tsx`） | 漂移的絲帶：**全部**的視差動態 |
| 4 | `SigmaMap` | 地圖本身：道路、節點、領地 |

四者全部是 `absolute inset-0 pointer-events-none`。

- **銀河、霧氣與塵埃都必須在 `SigmaMap` 之前**，因為 sigma 的容器帶一層不透明底色，會把它們完全
  蓋掉。`SigmaMap` 的外層底色也已經拿掉，改由上層的 `bg-ds-space` 提供。
- **霧氣原本放在 `SigmaMap` 之後**，當作蓋在道路上的霧。它現在移到地圖**之下**、銀河**之上**：
  它是暖色星塵背景，所以道路與節點永遠在它之上、不會被它蒙住。它仍帶 `pointer-events-none`
  （保留是為了安全與一致），所以永遠不會干擾。
- **霧氣不會蓋到 HUD**，而這是**結構性的，不是保證**：`GameGraph` 是 `<main>` 的**第一個**子節點，
  而每一個 HUD 元素（回合時間軸、右欄、框角）都是**後面**的兄弟節點，所以它們畫在它之上。
  若哪天把 `GameGraph` 改成後面繪製，霧氣就會開始蓋住 HUD。
- 只有塵埃有自己的視差比例（`SPACE_FLOW_PARALLAX: 0.35`），因為它是唯一**不在世界座標**裡的一層。
  銀河與霧氣**完全沒有視差**：它們由 sigma 定位，所以與地圖的滾動、縮放完全一致。

#### 位置與縮放完全交給 sigma，不可自行推導

`SigmaMap` 透過 `MapCameraControls` 暴露 sigma 自己的框化→視窗對應：

```ts
framedGraphToViewport: (p: { x: number; y: number }) => { x: number; y: number };
```

`framedPlacement(mapper, radiusFraction)` 呼叫它兩次——一次取世界中心 `(0.5, 0.5)`，一次量出
「兩個相鄰框化點之間」得到每世界單位的像素數。它住在 `src/lib/spaceShared.ts`，那是兩層共用的
模組，同時也放著兩個顏色工具（`parseHex` / `withAlpha`），所以任一層都不必 import 另一層。

- **這取代了一個真實的 bug。** sigma 的對應是
  `screen = (framed − camera.position) × scale + centre`，所以 `camera.x` 變大時世界內容往**左**移。
  銀河先前是把自己的中心加上 `(camera.x − 0.5) × k`，那會讓它往**右**移——背景於是與地圖**反向**
  漂移，看起來「不跟著地圖走」。`SPACE_GALAXY_PARALLAX`、`SCALE_EXPONENT`、
  `SCALE_CLAMP_MIN/MAX`、`REF_RATIO` 皆已**移除**；它們的存在只是為了掩蓋「平移與縮放根本沒有
  在跟 sigma」。`spaceGalaxy.test.ts` 會斷言它們維持不存在，且中心來自 mapper 而非 camera x/y。
- **銀河與霧氣是世界物體**，所以平移時它們真的會滑出畫面。那是正確錨定，而不是缺陷。
- **縮放 = `pixelsPerWorldUnit × radiusFraction`**，完全繼承 sigma 的縮放。因為 mapper 是引數，
  這個模組仍是純的、可用 stub 測。

#### 銀河的拉近淡出

精確跟隨 sigma 代表縮放真的是 `1 / ratio`，而 sigma 的 ratio 跨 0.05..3。拉到 0.05 時圓盤大約是
視窗的九倍——一整片暖色薄膜，道路對比會消失。`SPACE_GALAXY_RADIUS_FRACTION: 0.85` 讓圓盤佔掉世界的大部分，所以它是真正的背景而不是小光點（由 0.72 提高：使用者要求「更大」）。
`SPACE_GALAXY_FADE_RATIO: 0.9` 在拉近時開始變暗，但**不是降到零**——`SPACE_GALAXY_FADE_MIN: 0.55`
是下限，所以銀河永遠不會消失，只是變暗（降到 0 會讓畫面變成一片純黑深空，看起來像壞掉；下限太低
則在使用者要求「拉近看得更清楚」時變成一層看不見的薄膜）。拉近的清晰度來自**提高的下限 + 更多細節**
（`STAR_COUNT` 900、`NEBULA_BLOBS` 12），**不是**拿掉淡出——拉近時一顆明亮的圓盤就是蓋在道路上的
暖色水洗。離屏的烘焙解析度以「還看得見的最大半徑」決定，所以它永遠不會在淡出之前先糊掉。

#### 霧氣（`SPACE_FOG_*`）

種子化的**暖色星塵**，畫在自己的離屏 canvas 上。它**緩慢漂移**——與銀河不同，它不能讀起來像在轉：
20 分鐘一圈是深度，不是旋轉。它**沒有縮放淡出**：現在位於地圖**之下**，沒有東西需要它遮蔽，所以
任何縮放都保持存在。

- **它在地圖之下、銀河之上**，`spaceFog.test.ts` 斷言它不再有縮放淡出門檻（`zoomRatio` /
  `fadeRatio` 已移除），且漂移行為正確（一圈一週期、限在 0..2π、週期 ≤ 0 時停用、比銀河慢）。
- **「隨機」是種子的**：同一個種子永遠得到同一團霧，所以重新掛載不會讓整層跳動——全專案的慣例。
- **密度才是讓它讀起來像雲的原因，不是灰霧。** 每個色塊抽一個 0..1 的值，映射到
  `SPACE_FOG_DENSITY_MIN..MAX`（`0.1..1`），而那個值**同時**決定它的 alpha 與半徑：濃的地方又白又大，
  稀的地方幾乎看不見。分開抽會讓兩者打架（出現又大又透明的色塊），看起來像 bug。
  `spaceFog.test.ts` 會斷言這個分布：最濃的接近上限、最稀的低於上限的 30%，而**平均值**遠低於上限，
  所以它永遠不會是一整片實心白。
- **`SPACE_FOG_ALPHA` 是 0.5，而且是刻意的。** 它原本是 0.16，那是在霧氣畫在**地圖之上**時調的；
  放到近黑的深空上它根本等於不存在，整層讀起來像沒有東西。讓它不會變成一整片白的是上面的密度區間，
  不是上限。
- **色盤是暖的**（`SPACE_FOG_COLORS`：`#f2e6c8` → `#5c4c38`，近乎白的奶油到暗褐）。重點是它讀起來像
  **被照亮的星塵**，不是冷灰的霧；`spaceFog.test.ts` 斷言每個顏色的紅通道都大於藍通道，所以它不會
  漂回冷色。
- **它保留完整的可見性閘門**：漂移在離開視窗與分頁隱藏時暫停，`prefers-reduced-motion` 下只畫一幀
  靜態圖——與其他圖層完全相同。

#### 銀河本身的注意事項

- **來源**：`src/lib/spaceGalaxy.ts`（純邏輯，`node` 環境可測）+ `src/components/SpaceGalaxy.tsx`
  （只負責烘焙、畫與迴圈）
- 整顆銀河在 resize 時一次烤進離屏 canvas，之後每幀只做一次帶旋轉的 `drawImage`；霧氣同樣是一幀
  一次貼上自己的圖。兩者都不論星點數量。
- **兩層都不使用任何噪聲**：銀河曾經有褐色塵帶，紋理靠 Simplex 擾動半徑；塵帶拿掉後噪聲沒有用途，
  所以 `three` 的 `SimplexNoise` 已不再被 import。兩層都只是種子化的幾何。
- **塵帶是刻意拿掉的，而且代價是真的**：它是唯一的螺旋結構。沒有它，這是一團柔軟發光的星雲而不是
  可辨認的螺旋——這是刻意取捨，結構與移動交給流場層，核心也不再被褐色管子橫穿。
- **離屏畫布必須帶 DPR 變換**（`setTransform(dpr, …)`、`clearRect` 用 CSS 像素），否則 4K 螢幕上會糊掉。
- **銀河內部的繪製順序由大到小：核 → 星雲 → 星點**。星點放最後，否則會被半透明星雲蓋掉而變模糊，
  而模糊正是這層最不能有的毛病，因為底下是道路。
- **銀河的旋轉時間是累加出來的**，不是讀時鐘。`dt` 在暫停時不累加；`rotateAt` 取模成一圈。
- **圓盤外是透明的**，讓 `bg-ds-space` 與 `bg-ds-space-nebula` 透出來。
- **銀河刻意比參考圖暗**：參考圖的核是亮的，但它靠的是「細而亮」的連線；我們底下是半透明深藍
  `#1e3a5f`，而節點最多兩千個。所以取它的**構圖與色相，不取曝光**。
- **星雲 token 也跟著降飽和**：`--color-ds-space-nebula` 原本是飽和的紫與藍，現在是灰紫與石板。
- **不做半透明拖尾填色，也不用 `lighter` 混合**：疊加會吃掉道路的對比。
- **所有顏色都在 `gameConfig.ts`**（`SPACE_GALAXY_COLOR_CORE/MID`、`NEBULA_COLORS`、
  `STAR_COLORS`、`SPACE_FOG_COLORS`）。
- 星點以 `1 - d³` 的邊緣淡出畫進烘焙圖，圓盤邊緣才不會出現突兀的截斷。

### 流場太空塵埃 / Flow-field dust

- **來源**：`src/lib/spaceFlow.ts`（純邏輯，`node` 環境可測）+ `src/components/SpaceFlow.tsx`（只負責畫與迴圈）
- **疊在銀河之上**：銀河與霧氣提供深處的暖光、星點與雲層，這一層提供結構與移動。它是唯一有
  視差的一層（0.35），因為它是浮在地圖上方的塵埃。
- 粒子沿著一個 **3D Simplex noise 場**移動，所以會自然聚成絲帶、渦流與空洞——「隨機但有結構」。
  關鍵是場的**連續性**：鄰近位置回傳相近的角度，粒子才會沿著同一片場流動。
- **這是全專案唯一使用噪聲的 canvas 層。**
- **噪聲來自 `three`，不是新相依**：`three/examples/jsm/math/SimplexNoise`。
- **種子必須是真正的 PRNG**：傳入常數函式會讓所有梯度索引相同，場退化成平滑斜坡。
- **色相取自粒子所在位置的噪聲**，所以同一條絲帶共享一種顏色。
- **調色盤刻意壓進冷色半邊並降低彩度，而且斷言的是「上限」**：原本是 0–320 全色相、飽和度 78、
  alpha 0.72，那是在它**唯一**是背景時調的。放到暖色銀河上，那些絲帶會打架並吃掉道路對比，
  所以現在是 `195 → 280`、飽和度 45、alpha 0.55。`spaceFlow.test.ts` 斷言飽和度 < 60、
  alpha < 0.6、色相跨度 < 200°。
- **不做半透明拖尾填色，也不用 `lighter` 混合**。
- **所有顏色都在 `gameConfig.ts`**（`SPACE_FLOW_*`）。
- 色相是**量化**的，每幀零配置。


### 體魄 (ti)：防禦屬性 / Physique: the defence attribute

- `ti` 與其他屬性同樣是 5–30 的均勻分佈，遷移時既有角色一律回填 **17**（略低於中位數）。
  回填 0 會讓所有舊角色在防禦上毫無作用，幾乎輸掉每一場本來該贏的仗。
- 防守端：`def = troops × (1 + ti/30) × (1 + fortress×0.2) × rand(0.85, 1.15)`。
  這個位置**只適用於將領對將領**；地方守軍走的是另一條公式，堡壘加成不變。
- 原本這個位置用的是 `tong`。兩者公式相同（都走 `× (1 + x/30)`），但講的是不同的事：
  `wu` 是「打得多痛」、`ti` 是「守得多穩」，而 `tong` 現在只管購兵量。
- 設定鍵從 `BATTLE_DEF_TONG_MULT` 改名為 `BATTLE_DEF_TI_MULT`，避免留下誤導性的舊名。

### 戰鬥回饋只在戰報裡 / Battle feedback lives only in the report

- 地圖上**沒有**戰鬥動畫。先前那支沿著戰線交火的艦隊（`battleFleet.ts` + `BattleFleet.tsx` +
  `FleetScene.tsx`）已整個刪除，連同它的 `BATTLE_FLEET_*` 設定與測試。
- **移除的理由**：戰線是由「誰控制哪裡」推導的，所以兩個勢力只要接壤就一直「在打仗」。那是環境雜訊而不是
  資訊，而且它跟真正說明一場交戰的那份報告競爭注意力。
- 現在唯一呈現交戰的地方是事件日誌的 **`PLACE_CAPTURED` 戰報**（`BattleReport.tsx`）：攻守算式加上
  攻防重播動畫。地圖只保留顯示回合的**重點光環**（紅＝被攻擊、青＝新建），它標示的是「什麼時候、哪裡」，
  而不是一場華麗的戰鬥。
- 若日後真的要地圖級的戰鬥視覺，它必須**綁定正在顯示的那一回合與真實的 `PLACE_CAPTURED` 事件**，
  而不能由「長期存在的控制關係」推導。


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
## 頁面提升（今日） / UI changes (today)

### 新將領一後庫 1 名士兵 / A new leader starts with one soldier

新生的將領一後郡庫 `CHAR_START_TROOPS`（1）名士兵，避免一發現就完全無兵。設定用的是 `rng.int(5, 15)`，本来就满足，所以只需要改 `spawnCharacters.ts`。

### 圖表：絕對回合的 x 軸 / Charts: the x axis is the absolute round

動力的串列**不是从世界第一回合就采減的**，它只在該動力刕現的那回合才長一項，所以 `values` 從 index 0 就開始，而世界可能已經到第 12 回合。若照險律畫 index，每個動力都會被畫成一直存在到最初。stats route 現在每個動力的數值旁該一個 `rounds[]`，圖表用 `startOffsetOf()` / `xOf()` / `valueAt()` 去寫回真實的回合位置。

**同一個 bug 體讀正錯的數字。** 午朝線與 tooltip 曾用世界 index 去索引一個動力本局的陣列，取到 `undefined`、被 `?? 0` 接下，把真實存在的動力從錯報成**零兵力**；且元素會列出那一回合根本尚未存在的動力。現在改用 `valueAt()` 與 `hasValueAt()`。

### 顯像：體魌識別、動勢線移位、侧體陳影 / Avatar: the ti cue, moved speed lines, cheek shading

**體魌（ti）是第四個能力識別，位置在前臂。** 武力（頭鑪）、統領（肩章）、經濟（胸前）已各占一個身体部位，前臂是唯一留下的，四項才會一眼分得開。它同樣逐級殘陳：金碼护腕 → 素膀鑴（鋼）→ 布繌臂（麻），且尺寸一起窄。`avatarCues()` 因此回傳**五列**。

**動勢線改宜頭的左側是程式性的錯誤。** 舊布局的 x 坐落在 27-41，而頭部本身就是 x 25-75 的圍囊。整組動勢線因此全數落在頭的內裡，完全看不到，實際上等於沒绘。現在改為 x 4-21，形成收攒朝頭部的斜派。

**每個級級都加了深色辺框，並加上侧體、尾、辺下願、顔骨陳影與經相限的脸部体程。** 陳影取自 `SKIN_TONES` 裡的深色，所以不引入新颜色。低級本来靠顖色辨識，但麻與鋼對深色衣袍寫的不對，辺框讓轮廓在任何尺寸都站得住。詳細尺寸 168 → 216。

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
- `economy` 的**整階段**發放 — `splitIncome` 保證三份加總剛好等於 `income`，所以寫到一半
  崩潰，不會有任何一筆錢移動到別處：部分世界的金幣就是消失了，而沒有任何階段會對帳（每
  個金額都是算出來的，不是從某個總帳扣的，所以無從對回）。整階段一筆交易同時解決了成本：
  交易裡只有**三句話**（見下一節）。
  The economy phase's payout is atomic because `splitIncome` is exact: a half-written phase
  moves the missing gold nowhere - part of the world's gold simply ceases to exist, and no
  later phase reconciles totals (every amount is computed, not derived from a stored total,
  so there is nothing to reconcile against). Batched into one transaction it also costs less:
  the transaction holds exactly **THREE statements** (see the next section).

**刻意排除 / Deliberately excluded**

- **回合快照** (`runRound.ts`) — 快照是「已完成的某一回合」的快取。把它放進回合的交易裡，
  等於讓一個交易橫跨全部 14 個階段地開著。
- **每筆事件列** — Event 是一行日誌。少一行損失的是敘事，不是狀態。

**陷阱 / The trap.** `inTransaction` 的 `fn` **只**能使用傳進去的 `tx`。在 `fn` 裡呼叫模組層級的
`prisma` 會逃出這筆交易，不會隨之回滾——這個輔助存在的理由就是把這個陷阱寫在程式碼裡。

逾時是 `TX_TIMEOUT_MS`（**60 秒**，2026-10 由 20 秒提高），比 Prisma 預設的 5 秒寬——
曾是整階段一筆交易、時鐘覆蓋 2000 個地點 × 每地 5–8 次依序寫入；現在交易裡只剩三句話
（見下一節），60 秒是餘裕。
`TX_TIMEOUT_MS` is **60 seconds** (raised from 20s in Oct 2026), wider than Prisma's 5s
default — the phase's transaction used to cover 2000 places × 5–8 sequential writes each;
it now holds only three statements (next section), and the 60s is headroom.

### 經濟階段只提交一次，交易裡只有三句話 / The economy phase commits once, in three statements (batched transaction)

**每個地點一筆交易改成整階段一筆，而且交易裡只有三句話**（Oct 2026）：一段合併的角色
`UPDATE ... FROM (VALUES ...)`（把每個角色的金幣／兵力淨增量一次套上）、一段合併的地方
`UPDATE`（駐軍招募），與一次 `event.createMany`（全部 INCOME 與 TROOPS_BOUGHT，
**陣列順序＝模擬順序**——cuid 由用戶端按序產生，事件日誌的
`{ round asc, createdAt asc, id asc }` 排序因此仍還原原序）。
One transaction **per place** became one transaction **per phase**, and the transaction holds
only **THREE statements** (Oct 2026): one merged characters `UPDATE ... FROM (VALUES ...)`
(every character's net gold/troop delta in a single statement), one merged places `UPDATE`
(garrison recruits), and one `event.createMany` of every INCOME and TROOPS_BOUGHT row
(**array order = simulation order** — cuid ids are client-generated monotonic, so the log's
`{ round asc, createdAt asc, id asc }` ordering restores the original sequence).

**事件裡的「之後餘額」來自模擬帳本，不是寫入回傳值。** 金額（發多少、買多少）全部在
計算時已知；舊的逐列 `update().gold` 唯一提供的東西是事件要印的餘額。記憶體帳本從讀取
快照播種（`charInitial`），按昔日逐筆更新**同一個迴圈順序**累加每筆增量
（`runningGold` / `runningTroops`），逐位元組重現同一組數字——資料庫本來就是把同樣的
增量按同樣的順序疊上去。購兵決策照舊讀快照 `char.gold`，語義不變。
**The events' `*After` balances come from a simulated ledger, not a write's return value.**
The amounts are all known at computation time; the old per-row `update().gold` provided only
the after-balance the events print. The in-memory ledger seeds from the read snapshots
(`charInitial`) and accumulates every increment **in the same loop order** the old sequential
updates applied them (`runningGold` / `runningTroops`), reproducing the numbers
byte-for-byte — the database was stacking the same increments in the same order anyway.
Purchase decisions still read the snapshot `char.gold` — unchanged semantics.

**同批合併的還有 aiMove 與 loyaltyCheck。** aiMove 的每個決策只讀迴圈前的快照，所以移動
先收進 `moveRows`、階段結尾一次合併 placeId UPDATE + 一次 `CHARACTER_MOVED` createMany
（不包交易——與昔日逐筆各自落地相同；`recordMove` 的 import 已移除，檔案仍服務
`battle.ts`）。若未來有規則需要「剛搬到的地點的落寫狀態」，整個收集-再清寫的形狀要重新
思考，不能默默改回逐筆。loyaltyCheck 則用一次 `findMany` 把所有君王的忠誠標籤抓成
map（不過濾 alive——與昔日每角色 `findUnique` 的基準完全一致）。
**aiMove and loyaltyCheck got the same treatment.** aiMove's decisions read only pre-loop
snapshots, so its moves are collected into `moveRows` and flushed once at the end of the
phase: one merged placeId UPDATE plus one `CHARACTER_MOVED` createMany (not in a
transaction — the old per-statement non-atomicity; `recordMove`'s import is gone, the file
still serves `battle.ts`). If a future rule needs the just-moved-to place's post-write
state, the collect-then-flush shape must be rethought, not quietly re-inlined.
`loyaltyCheck` fetches all kings' loyalty tags with one `findMany` into a map (no alive
filter — exactly the old per-character `findUnique`'s basis).

**計算順序完全沒變，這不是併發化。** 交易只包住 DB 寫入；收益、購買批次與每一次
`rng.float` 的抽取順序與昔日逐一相同，同一個種子仍然長出同一個世界。把寫入改成併發會讓
rng 的順序取決於排程——那是模擬的災難，所以刻意不做。
**The computation order is unchanged — this is not concurrency.** The transaction wraps only
the DB writes; income, purchase batches and every `rng.float` draw happen in exactly the same
order as before, so one seed still grows one world. Making the writes concurrent would let
scheduling decide the draw order, which is a simulation disaster.

### 回合執行旗標與看門狗 / The round-running flag and the watchdog

**「下一回合正在跑」不只是記憶體狀態，也是資料庫欄位**（Oct 2026）。工作登記簿住在
`globalThis`（行程重啟就沒了），但重整後的頁面必須**立刻**鎖住「下一回合」按鈕——
`World.roundRunning` + `roundStartedAt` 就是那個真相：`startRoundJob` 入隊時置 true，
背景工作的 `finally` 清掉（成功與失敗都清）。
**"A round is running" is not only in-memory state, it is database columns** (Oct 2026).
The job registry lives on `globalThis` (gone with the process), but a refreshed page must
lock the next-round button **immediately** — `World.roundRunning` + `roundStartedAt` are
that truth: set by `startRoundJob` on enqueue, cleared in the background job's `finally`
(on success and failure alike).

**看門狗 `reconcileRoundRunFlag()` 在三個入口被常態呼叫**：輪詢 GET、入隊 POST、以及
每一個人的 world-state 請求。旗標掛著超過 `ROUND_RUNNING_WATCHDOG_MS`（5 分鐘，設定值）
**而本行程沒有 running 的工作** → 自癒清掉。旗標掛著而工作真的還在跑（遠端資料庫上
一回合超過 5 分鐘）**不自癒**，否則會把還在跑的回合解鎖成可再點。
**The watchdog `reconcileRoundRunFlag()` is called routinely at three entry points**: the
polling GET, the enqueue POST, and every client's world-state request. A flag standing past
`ROUND_RUNNING_WATCHDOG_MS` (5 minutes, a config value) **with no running job in this
process** heals to false. A flag up while the job is genuinely still executing is **left
alone**, or the watchdog would unlock a round that is still running.

**關瀏覽器不會停止回合**（Oct 2026，`server/roundJob.detach.test.ts` 守住）。POST 先回
202，回合以 **void 脫鉤的 IIFE** 在伺服器行程裡跑——沒有任何東西 await 它，兩個處理器
都不讀 `request.signal`，所以客端斷線對回合**零影響**。入隊路徑上沒有
`await runRound`（等它就等於把回合綁回請求生命週期），而且**旗標寫入失敗不能攔下
回合**：入隊時 DB 抖一下，旗標可能缺席，但回合照樣開跑——另一個結局是 registry 裡
卡著一個沒有回合在跑的幽靈 'running' 工作。已驗證：入隊約 100ms、4.5 秒後回合在
沒有任何客端的情況下跑完、世界前進、旗標清除。
**Closing the browser never stops a round** (Oct 2026, guarded by
`server/roundJob.detach.test.ts`). The POST answers 202 first and the round executes as a
**void-detached IIFE** inside the server process — nothing awaits it, neither handler reads
`request.signal`, so a client disconnect has ZERO effect on the round. The enqueue path
never does `await runRound` (that would tie the round back to the request lifecycle), and a
**failed flag write must not stop the round**: a DB blip at enqueue time may leave the flag
unset, but the round still starts — the alternative is a phantom 'running' registry entry
with no round behind it. Verified: enqueue ~100ms, the round finished ~4.5s later with no
client attached, the world advanced, the flag cleared.

**客端：掛載即查一次 + 每次輪詢同步旗標。** 重整後若旗標還掛著（別的分頁或前一個行程
留下的回合），按鈕立刻鎖上並接上進度輪詢。輪詢只在 `job.status === 'done'` 時導航到
剛跑完的回合——工作在別的行程收尾（看門狗自癒、job 為 null）時靜默解鎖、不導航。
**Client: probe once on mount, mirror the flag on every poll.** After a refresh with the
flag still standing (a round left by another tab or the previous process), the button locks
immediately and adopts the progress polling. Navigation to the just-run round happens only
on `job.status === 'done'` — a job that finished in another process (the watchdog healed,
job null) unlocks silently without navigating.

### 多世界 / Multiple worlds

**「我在看哪個世界」是一個 cookie**（`aw_world`，`src/lib/worldSelect.ts`），不是全域也
不是角色屬性：有效 cookie 優先，否則回退 active 世界。**選擇不分角色**——所有已登入
使用者都能切換（`POST /api/worlds/select`，頁首 `WorldPicker`）；只有**建立**世界
（`POST /api/admin/worlds`，與 seed/reset 共用 `initWorld`）與**跑回合**是 admin 限定。
建立成功時 cookie 已指向新世界，客端整頁重載（換世界改寫了每個 query 的語義，逐一失效
不如乾淨重來）。
**"Which world am I looking at" is a cookie** (`aw_world`, `src/lib/worldSelect.ts`), not a
global and not a role attribute: a valid cookie wins, otherwise fall back to the active
world. **Selection is role-blind** — every signed-in user can switch (`POST
/api/worlds/select`, the header `WorldPicker`); only **creating** a world (`POST
/api/admin/worlds`, sharing `initWorld` with seed/reset) and **running rounds** are
admin-gated. On success the cookie already points at the new world, and the client reloads
(the switch rewrites every query's meaning — a clean reload beats invalidating one by one).

**`World.active` 從「互斥開關」降級為「預設世界」標記。** 資料庫從來沒有 unique 索引——
唯一性只是 `findFirst({ where: { active: true } })` 裡的應用層假設。reset-world 保留
「重置＝新世界成為唯一預設」的語義；create-world 不動任何既有世界。
**`World.active` is demoted from an exclusive switch to a "default world" mark.** The
database never had a unique index — the uniqueness was only ever an application assumption
inside `findFirst({ where: { active: true } })`. Reset-world keeps its "reset = the new world
becomes the sole default" semantics; create-world touches nothing else.

**admin 的世界管理動作（頁首選擇器，全部兩段式確認）**（Oct 2026）：
- **⟲ 重置此世界** — `POST /api/admin/worlds/reset` `{ worldId, confirm: true }`：該世界的
  全部遊戲資料被拆除（`server/teardownWorld.ts`，**一筆交易**），然後對**同一個 world id**
  重新跑 `initWorld`——世界還在、名字不變、歷史歸零、`currentRound` 回到 1。與
  `POST /api/admin/reset-world` 的差別：那條路「建一個新世界並讓它成為唯一預設」；這裡是
  「把你指著的這個世界打掉重練」。
- **🗑 刪除此世界** — `DELETE /api/admin/worlds` `{ worldId, confirm: true }`：拆除後連
  World 列一起刪。**最後一個世界不能刪**（400）；刪的是選中世界時清掉選擇 cookie，讓
  fallback（active 世界）接手。
- 兩者在該世界**有回合正在跑**時都回 **409**（記憶體工作或 DB 旗標都算）——絕不在跑動中
  的回合底下拆資料。
- `teardownWorldData` 先把 schema 的兩個**外鍵環**清成 null
  （`Place.administratorId` ↔ `Character.placeId`、`Faction.kingId` ↔
  `Character.factionId`），再按依賴序在一筆 `inTransaction` 裡刪除。`BattleStrike` 刻意
  無外鍵（戰史要比參與者長命），按 worldId 直接刪。
- **以明確 worldId 跑回合**（Oct 2026）：`POST /api/admin/run-round` 的 body 可帶
  `worldId`、`GET` 可帶 `?worldId=`——admin 不用切換 cookie 就能對**任何**世界跑／查回合；
  不帶參數就是選中的世界。這需要移除 `runRound` 舊的 `if (!world.active) throw` 檢查：
  `active` 降級後它只是單世界時代的殘留，會讓所有非 active 世界永遠跑不了回合。
  可跑性 = 「世界存在 + `expectedRound` 對得上」，僅此而已。
**Admin world actions (header picker, all two-step confirmed)** (Oct 2026):
- **⟲ Reset this world** — `POST /api/admin/worlds/reset`: the dataset is torn down
  (`server/teardownWorld.ts`, one transaction) and `initWorld` runs again against the SAME
  world id — the world survives, history zeroed, `currentRound` back to 1. Unlike
  `POST /api/admin/reset-world` (a NEW world becomes the sole default), this is "tear down
  and rebuild the world you are pointing at".
- **🗑 Delete this world** — `DELETE /api/admin/worlds`: teardown, then the World row. The
  last world cannot be deleted (400); deleting the selected world clears the selection
  cookie so the fallback takes over.
- Both refuse with **409 while a round is running** for that world (in-memory job or the DB
  flag) — never tear data down under a running round.
- `teardownWorldData` nulls the schema's two **FK cycles** first, then deletes in dependency
  order inside one `inTransaction`. `BattleStrike` has no FKs by design.
- **Running a round by explicit world id** (Oct 2026): `POST /api/admin/run-round` takes an
  optional `worldId` in the body; `GET` takes `?worldId=` — an admin runs/polls **any** world
  without switching cookies; without the param, the selected world. This required removing
  `runRound`'s old `if (!world.active) throw` gate: a single-world leftover that made every
  non-active world un-runnable. Runnability = "the world exists + `expectedRound` matches".

**所有 session 路由都走 `getSelectedWorldId()`**：world/current、world/state、
world/events、world/inspect、world/rounds、world/stats、admin/run-round（GET+POST）、
admin/assign-admin。**不要在 session 路由重新引入裸的 `findFirst({ active: true })`**——
兩個世界時它把所有讀者釘在預設世界上，選擇器讀起來就是「選了卻沒反應」。首頁的
`/api/public/world` 刻意保留 active-world 讀取：訪客沒有 session，帶不了選擇 cookie。
**Every session route resolves the world through `getSelectedWorldId()`**: world/current,
world/state, world/events, world/inspect, world/rounds, world/stats, admin/run-round
(GET+POST), admin/assign-admin. **Do not reintroduce a bare `findFirst({ active: true })` in
a session route** — with two worlds it pins every reader to the default world and the picker
reads as "selected but nothing happened". The home page's `/api/public/world` deliberately
keeps the active-world read: visitors carry no session, so no selection cookie.

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

### 事件日誌的順序 / Event log ordering

事件誌**由舊到新**讀，而這個順序就是因果順序：收益 → 購兵 → 移動 → 佔領 → 任命 → 升級。
這裡有三個**各自獨立**的缺陷，必須同時修 —— 只修顯示層等於把另外兩個**藏起來**。

The log reads **oldest to newest**, and that order is causal: earn → buy → move → capture →
appointed → upgrade. Three **independent** defects had to be fixed together, because repairing
the display alone would *hide* the other two rather than repair them.

**1. 前端把一個本來就已經是舊到新的陣列反轉。**
`EventLog.tsx` 原本是 `[...filtered].reverse()`，而它的註解說「來源 API 是新到舊」。那是錯的：
`/api/world/events` 回合內**一直**是 `createdAt: 'asc'`；只有全回合分支寫過 `round: 'desc'`，
而那是**回合之間**的順序。於是日誌讀成「升級 → 佔領 → 任命 → 移動 → 購兵 → 收益」—— 錢賺在
最後、升級在最前。它也讓同一個檔案自相矛盾：`shown` 刻意取**尾端**（「一進去看到最新的一段」）、
底部自動捲動（停在最新），兩者只有在由舊到新時才成立；加上反轉之後尾端變成最舊的一批，
`hasOlder` 也答錯了。**不要再加回去。**

`EventLog.tsx` used to reverse an array that was *already* oldest-first. Its comment claimed the
API returns newest-first, but the route has always sorted within a round by `createdAt: 'asc'`;
only the all-rounds branch ever wrote `round: 'desc'`, and that is the order *between* rounds. The
log therefore read "upgrade → capture → appointed → moved → bought → income". It also made the
rest of the file self-contradictory: `shown` deliberately takes the **tail** so the reader lands
on the newest slice, and the auto-scroll pins to the bottom, which only hold oldest-first — with
the reversal the tail became the *oldest* slice and `hasOlder` answered wrong.

**2. 同一個 endpoint 依查詢方式回傳相反的順序。**

```typescript
// 兩種模式統一 / both modes, one order
orderBy: [{ round: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
```

`id` 破平手是**必要的**，不是裝飾：Postgres 的 timestamp 比較到毫秒，同一回合裡連續寫入的事件
經常落在同一毫秒，沒有它先後是**未定義**的。這正是「順序有時候對、有時候錯」而不是穩定錯掉的
原因。

The `id` tiebreak is load-bearing: Postgres compares timestamps at millisecond resolution, and
events written back to back within a round routinely land in the same millisecond, leaving their
order *undefined* without it. That is what makes an ordering bug look intermittent rather than
consistently wrong.

**3. 模擬把任命寫在佔領之前。**
`server/phases/battle.ts` 原本先 `grantAdmin()` 再寫 `PLACE_CAPTURED`，所以日誌讀成先「被任命為
某地行政官」後「佔領某地」。兩者都是循序的 `await`、沒有競爭，所以資料庫裡的先後**完全**由
陳述順序決定。對調之後遊戲行為不變：行政官仍在 build 階段（第 11 階段）之前到位，所以「當回合
佔領、當回合升級」依然成立，改變的只有日誌裡的先後。

`server/phases/battle.ts` called `grantAdmin()` *before* the `PLACE_CAPTURED` create, so the log
read "appointed administrator of X" before "captured X". Both are sequential `await`s with no
race, so the database order was decided entirely by statement order. Swapping them changes no
gameplay: the administrator still arrives before the build phase (11), so "captured this round,
upgraded this round" still holds.

**4. 守住它：`server/battle.eventOrder.test.ts`。**
它讀**原始碼**而不是測行為 —— 測試環境是 `node`、沒有資料庫，而這兩個 `await` 沒有競爭，
所以唯一能驗證的不變量就是「哪一句寫在前面」。這與 `territoryLabelPlacement.test.ts` 守住一段
CSS 宣告是同一種做法。已雙向驗證：換回舊順序會以 `expected 13395 to be less than 13102` 失敗；
第二個案例還檢查 `grantAdmin` 必須留在 `if (captured)` 區塊內，因為單靠相對位置抓不到那種情況。

It reads the **source** rather than testing behaviour: the environment is `node` with no database,
and with no race the only checkable invariant is which statement comes first — the same approach
as `territoryLabelPlacement.test.ts`, which guards a CSS declaration. Verified in both directions;
a second case also checks `grantAdmin` stays **inside** the `if (captured)` block.

**5. 既有回合維持已儲存的順序。**
事件誌是唯讀追加的，没有任何機制會回頭改寫；為了讓故事讀起來合理而回填，會摧毀它之所以
可信的那件事。只有修好之後執行的回合才會顯示「先佔領、後任命」。

**Existing rounds keep their stored order.** The log is append-only and nothing rewrites rows;
back-dating entries to make a story read better would destroy what makes it trustworthy.

### 回合切換不會讓地圖重整 / Switching rounds does not rebuild the map

「下一回合」與時間軸選回合**是同一個 bug**，因為兩者都走 `setSelectedRound`。世界狀態查詢現在
帶 `placeholderData: keepPreviousData`，所以切換回合時舊回合會留在畫面上，直到新回合到達。

"Next Round" and picking a round from the timeline are **one bug**, because both go through
`setSelectedRound`. The world-state query now carries `placeholderData: keepPreviousData`, so the
previous round stays on screen until the new one arrives.

```typescript
useQuery({
  queryKey: ['worldState', round],
  // ...
  placeholderData: keepPreviousData,
})
```

**沒有它的話會發生什麼：** `queryKey` 改變 → `worldState` 變成 `undefined` → 全頁的
`if ((isLoading || worldInfoPending) && !worldState)` 成立 → **整頁換成骨架畫面，`SigmaMap` 跟著
被卸載** → sigma 實例、兩張覆蓋層與所有 rAF 迴圈全部重建 → 鏡頭回到預設視角。讀起來就是
「畫面重新整理了一次」。骨架上那個 `&& !worldState` 因此是**承重**的，不是裝飾：它就是把
「載入中」變成「整頁被卸載」的東西。

Without it: the `queryKey` change sets `worldState` to `undefined`, the page-wide
`if ((isLoading || worldInfoPending) && !worldState)` skeleton fires, and **`SigmaMap` unmounts
with it** — sigma, both overlays and every rAF loop rebuilt from scratch, camera back to default.
That is why the skeleton's `&& !worldState` guard is load-bearing rather than cosmetic: it is what
turns "pending" into "the whole page unmounted".

已驗證：在地圖容器元素上留一個記號，並用 `MutationObserver` 觀察四次回合切換。修前 **1 次卸載**
（相機縮放不變，因為卸載後新 sigma 的預設視角恰好相同，這也是它不易察覺的原因），修後
**0 次卸載**，相機全程停在 68。

Verified by marking the container element and watching a `MutationObserver` across four round
switches: **1 unmount before, 0 after**. The camera zoom read 68 throughout — it only looked
"fine" beforehand because a freshly rebuilt sigma happens to default to a similar view.

`StatsCharts` **不需要**這個：它用手動 `useEffect` 抓資料，而且只在成功時 `setData`，所以重抓期間
仍握著上一份 payload。不要為了「一致性」在開頭先 `setData(null)`。

`StatsCharts` does **not** need it: it fetches with a manual `useEffect` and only calls `setData`
on success, so it holds the previous payload while refetching. Do not "fix" it by clearing `data`
first.

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

### 地點詳情自己帶 scrollbar / The place detail scrolls itself

**地點詳情加入了「撐滿面板高度」那一套（Oct 2026）。** 它過去維持內容高度、由
`MapSidePanel` 的外層容器捲——外層照樣捲得到，但讀者要的是**彈窗自己**帶 scrollbar，而
外層捲動會讓影像標頭跟著內文一起滾出視線。現在根節點是
`flex flex-1 min-h-0 flex-col`，影像標頭 `shrink-0`，內文 `flex-1 min-h-0 overflow-y-auto
ds-gm-scroll p-4 space-y-4`——與將領數／事件日誌同一個結構，兩個分支（列表／詳情）在
同一個 flex 容器裡是同一種東西。於是「全高」分頁現在有三個 + 一個：將領數、事件日誌、
勢力排行、地點詳情；統計與系統仍由外層捲。
**The place detail joined the full-height tab structure (Oct 2026).** It used to keep its
content height and be scrolled by `MapSidePanel`'s outer container — reachable, but the
reader asked for the popup **itself** to carry a scrollbar, and an outer scroll rolls the
imagery header out of view along with the body. The root is now
`flex flex-1 min-h-0 flex-col`, the header `shrink-0`, and the body `flex-1 min-h-0
overflow-y-auto ds-gm-scroll p-4 space-y-4` — the same structure as the leader list and the
event log, so both branches (list / detail) are one kind of thing in the same flex container.
The full-height set is now the leader list, the event log, the faction ranking **and** the
place detail; 統計 and 系統 remain content-height, scrolled by the outer container.

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
把野心拉回 5–15，設定值已一併刪除。取而代之的是**帳本冷卻**：`defectionEvents` 每回合為視窗內
每一次叛變寫一筆 `DEFECTION_COOLING_DELTA`（−2），持續 `DEFECTION_COOLING_ROUNDS`（20）回合。
**每次叛變各自一筆，所以會疊加**：短時間叛變兩次是 −4 —— 連續叛變本身就是更強傾向的證據，
封頂 −2 等於把它丟掉。只寫帳本、不寫可見 Event，因為符合條件的人每回合上百。

Founding a faction and defecting both **no longer** re-roll ambition: all five re-roll sites
and the config keys are gone. What replaced it is **cooling in the ledger** — one
`DEFECTION_COOLING_DELTA` (−2) row per defection inside a 20-round window
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

**勢力過濾是一個下拉選單，不是又一排按鈕。** 地點清單有搜尋、擁有權過濾（全部／有主／無主）
與勢力過濾。勢力動輒上百個，一排按鈕排不下，所以用 `<select>`，樣式與事件日誌的勢力過濾
一致。**選了勢力會把擁有權過濾切回「全部」**，因為「某勢力 + 無主」在定義上永遠是空集合，
留著只會給人一個看不懂的空清單。已滅亡與瓦解中的勢力仍然列出（地點會留下來，仍然找得到），
但用既有的 `faction.collapsed` / `faction.collapsing` 標出來，不另造字串 —— 這三個狀態正是
`leader-detail.tsx` 的 `statusRank()` 排序用的同一組。三個控制項都必須重設已顯示筆數。
The faction filter is a **dropdown, not another chip row**: hundreds of factions will not fit in
a row of buttons, so it is a `<select>` styled to match the event log's. Picking a faction
switches ownership back to All, because "this faction + unowned" is empty by construction.
Destroyed and collapsing factions stay listed — their places persist — but are marked with the
existing `faction.collapsed` / `faction.collapsing` words. All three controls reset the count.

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

## 總結 / Summary

Autonomous World 使用現代化的技術棧：

1. **Next.js 16** — 提供 SSR、API Routes、Server Components
2. **Auth.js v5** — 處理 Google OAuth 與電子信箱／密碼（argon2id）認證 / handles Google OAuth plus email + password (argon2id) authentication
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
