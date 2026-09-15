# 自治世界 🌐

> 一個無限運行的自主模擬世界。沒有勝利條件，只有永恆的演化。

## 概述

自治世界是一個基於瀏覽器的模擬遊戲，數百個 AI 角色在動態地圖上建立勢力、征戰、結盟、背叛。世界自主運行，沒有終點 — 只有持續的演化。

**主要特色：**
- 🌐 **完全自主運行** — 世界自行演化，無需人工干預
- ⚡ **即時模擬** — 每回合自動計算所有事件
- ♾️ **無限世界** — 沒有終點，只有持續的變化
- 🎯 **純觀測** — 觀看與分析，無需玩家操作

## 技術架構

| 層級 | 技術 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 認證 | Auth.js v5 (next-auth) + Google Provider |
| 資料庫 | PostgreSQL + Prisma 7 |
| 地圖視覺化 | Sigma.js + graphology + forceatlas2 |
| UI | TailwindCSS 4 |
| 資料取得 | TanStack Query (React Query) |
| 驗證 | Zod |
| React 優化 | React Compiler |
| 測試 | Vitest |
| 排程 | GitHub Action (每小時 POST /api/admin/run-round) |

## 快速開始

### 前置需求

- Node.js 20+
- PostgreSQL 資料庫
- Google OAuth 憑證

### 安裝步驟

```bash
# 複製儲存庫
git clone <repository-url>
cd autonomous-world

# 安裝依賴
pnpm install

# 設定環境變數
cp .env.example .env.local
# 編輯 .env.local 填入你的設定值

# 執行資料庫遷移
npx prisma migrate dev

# 初始化遊戲種子資料
npx tsx prisma/seed.ts

# 啟動開發伺服器
pnpm dev
```

### 環境變數

| 變數 | 必要 | 說明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 連接字串 |
| `AUTH_SECRET` | ✅ | NextAuth.js session secret |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth Client Secret |
| `ADMIN_EMAIL` | ✅ | 管理員電子信箱（逗號分隔） |
| `ADMIN_TOKEN` | ❌ | GitHub Action 認證 Token |

## 專案結構

```
autonomous-world/
├── prisma/
│   ├── schema.prisma              # 資料庫 schema（Prisma 7 格式）
│   ├── seed.ts                    # 遊戲初始資料種子腳本
│   └── migrations/                # 資料庫遷移
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/ # Auth.js 路由處理器
│   │   │   ├── world/             # 世界資料 API 端點
│   │   │   │   ├── current/       # GET /api/world/current
│   │   │   │   ├── state/         # GET /api/world/state?round=N
│   │   │   │   ├── rounds/        # GET /api/world/rounds
│   │   │   │   ├── events/        # GET /api/world/events?round=N
│   │   │   │   └── stats/         # GET /api/world/stats?from=A&to=B
│   │   │   └── admin/             # 管理員專屬 API 端點
│   │   │       ├── run-round/     # POST /api/admin/run-round
│   │   │       ├── reset-world/   # POST /api/admin/reset-world
│   │   │       └── assign-admin/  # POST /api/admin/assign-admin
│   │   ├── game/                  # 主遊戲頁面
│   │   ├── layout.tsx             # 根佈局（含 QueryProvider）
│   │   ├── page.tsx               # 首頁
│   │   └── globals.css            # 全域樣式
│   └── lib/                       # 共用工具（透過 @/* 引入）
│       ├── auth.ts                # Auth.js v5 設定與輔助函數
│       ├── prisma.ts              # Prisma client 單例
│       ├── queryClient.tsx        # TanStack Query provider
│       ├── validations.ts         # Zod 驗證模式
│       ├── gameConfig.ts          # 所有可調整的遊戲數值
│       ├── rng.ts                 # 可複製的隨機數生成器 (mulberry32)
│       ├── snapshot.ts            # 快照壓縮/解壓縮
│       ├── i18n/                  # 國際化（中/英）
│       └── nameGenerator/         # 名稱生成工具
│           ├── person.ts          # 角色名稱
│           ├── place.ts           # 地點名稱
│           └── faction.ts         # 勢力名稱
├── server/
│   ├── runRound.ts                # 主遊戲迴圈協調器
│   └── phases/                    # 個別遊戲階段
│       ├── spawnPlaces.ts         # 階段 1：建立新地點
│       ├── spawnCharacters.ts     # 階段 2：生成角色
│       ├── ageAndDeath.ts         # 階段 3：老化 + 死亡檢查
│       ├── economy.ts             # 階段 4：收入 + 徵兵
│       ├── signals.ts             # 階段 5：信號進展
│       ├── relationships.ts       # 階段 6：友誼/不滿
│       ├── ambitionEvents.ts      # 階段 7：野心變化
│       ├── loyaltyCheck.ts        # 階段 8：叛變檢查
│       ├── aiMove.ts              # 階段 9：角色移動
│       ├── battle.ts              # 階段 10：戰鬥解決
│       ├── build.ts               # 階段 11：建築升級
│       ├── assignAdmins.ts        # 階段 12：自動指派行政官
│       ├── factionCollapse.ts     # 階段 13：勢力瓦解
│       └── factionDeath.ts        # 階段 14：勢力消滅
├── prisma.config.ts               # Prisma 7 設定
├── next.config.ts                 # Next.js 設定（React Compiler 已啟用）
├── tsconfig.json                  # TypeScript 設定
├── vitest.config.ts               # Vitest 測試設定
└── package.json                   # 依賴與腳本
```

## 遊戲規則

### 初始狀態
- **1 個角色**（國王）開始世界
- **1 個勢力**包含該國王
- **100 個地方**以道路相互連接
- 角色、勢力、地方會隨模擬增長

### 世界
- 單一共享世界，`active = true` 標記當前世界
- 所有玩家觀察同一個世界
- 沒有勝利條件 — 遊戲無限運行

### 角色
- 每個角色擁有：**武力 (wu)**、**統領 (tong)**、**經濟 (jing)**、**速度**
- 屬性範圍 5-30，速度使用常態分佈 (μ=17, σ=5)
- 角色每回合老化，最終因年老而死亡（50-80 歲）

### 勢力
- 角色可歸屬於某個勢力（王國/國家）
- 每個勢力有國王、顏色、領地
- 當國王死亡，勢力進入「瓦解中」狀態並逐漸解散

### 戰鬥
- 角色每回合移動 1 個領地
- 當敵方角色相遇時，會進行戰鬥
- 戰鬥結果取決於兵力、武力/統領屬性、堡壘等級
- 敗者可能逃脫（基於速度差異）或死亡

### 經濟
- 每個領地根據市場等級產生收入
- 收入分配：40% 國王、30% 行政官、30% 其他角色共享
- 角色可用個人金錢購買士兵

## API 端點

### 公開（需要認證）

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/world/current` | 取得當前世界資訊 |
| GET | `/api/world/state?round=N` | 取得特定回合的完整狀態 |
| GET | `/api/world/rounds` | 列出可用回合 |
| GET | `/api/world/events?round=N` | 取得特定回合的事件 |
| GET | `/api/world/stats?from=A&to=B` | 取得圖表資料 |

### 管理員專屬

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/admin/run-round` | 執行下一回合 |
| POST | `/api/admin/reset-world` | 建立新世界 |
| POST | `/api/admin/assign-admin` | 指派行政官 |

## 開發指南

### 程式碼風格

- **人類可讀**：所有程式碼以人為優先，機器其次
- **文件完善**：每個檔案都有標頭說明其用途
- **型別安全**：完整的 TypeScript 覆蓋與嚴格型別
- **一致性**：遵循既定模式

### 新增功能

1. **遊戲機制**：在 `server/runRound.ts` 新增或建立新的階段檔案
2. **UI 元件**：在 `components/` 建立並附上文件
3. **API 路由**：在 `src/app/api/` 遵循現有模式新增
4. **設定數值**：將可調整的數值新增至 `lib/gameConfig.ts`

### 測試

```bash
# 執行單元測試
pnpm test

# 監聽模式執行測試
pnpm test:watch

# 執行測試並產生覆蓋率報告
pnpm test:coverage

# 執行 TypeScript 型別檢查
pnpm typecheck
```

如需詳細技術文件，請參閱 [TECH.md](TECH.md)。

## 部署

### Vercel（推薦）

```bash
# 安裝 Vercel CLI
pnpm i -g vercel

# 部署
vercel
```

### Docker

```bash
# 建立映像
docker build -t autonomous-world .

# 執行容器
docker run -p 3000:3000 autonomous-world
```

#### 使用環境變數的 Docker

```bash
# 使用環境變數執行
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
# 啟動服務
docker compose up -d

# 檢視日誌
docker compose logs -f

# 停止服務
docker compose down
```

## 貢獻指南

1. Fork 儲存庫
2. 建立功能分支
3. 進行修改
4. 如適用，新增測試
5. 提交 Pull Request

## 授權條款

MIT 授權條款 — 詳見 [LICENSE](LICENSE)。

## 致謝

- 使用 [Next.js](https://nextjs.org/) 建構
- 由 [Prisma](https://www.prisma.io/) 提供動力
- 視覺化使用 [Sigma.js](https://www.sigmajs.org/)
- 樣式使用 [Tailwind CSS](https://tailwindcss.com/)
- 資料取得使用 [TanStack Query](https://tanstack.com/query)
- 驗證使用 [Zod](https://zod.dev/)
- 優化使用 [React Compiler](https://react.dev/learn/react-compiler)
