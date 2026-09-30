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

## 專案結構

```
autonomous-world/
├── prisma/
│   ├── schema.prisma              # 資料庫 schema（Prisma 7 格式）
│   ├── seed.ts                    # 遊戲初始資料種子腳本（含 ForceAtlas2 佈局）
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
│   │   │   ├── public/            # 免登入唯讀端點（僅供首頁）
│   │   │   │   └── world/         # GET /api/public/world
│   │   │   └── admin/             # 管理員專屬 API 端點
│   │   │       ├── run-round/     # POST /api/admin/run-round
│   │   │       ├── reset-world/   # POST /api/admin/reset-world
│   │   │       └── assign-admin/  # POST /api/admin/assign-admin
│   │   ├── game/                  # 主遊戲頁面（含 SigmaMap、EventLog、StatsCharts）
│   │   ├── layout.tsx             # 根佈局（含 QueryProvider）
│   │   ├── page.tsx               # 首頁
│   │   └── globals.css            # 全域樣式
│   └── lib/                       # 共用工具（透過 @/* 引入）
│       ├── auth.ts                # Auth.js v5 設定與輔助函數
│       ├── prisma.ts              # Prisma client 單例（使用 PrismaPg adapter）
│       ├── api.ts                 # apiFetch 輔助函數（401 統一導向首頁）
│       ├── queryClient.tsx        # TanStack Query provider
│       ├── validations.ts         # Zod 驗證模式
│       ├── gameConfig.ts          # 所有可調整的遊戲數值
│       ├── rng.ts                 # 可複製的隨機數生成器 (mulberry32)
│       ├── snapshot.ts            # 快照壓縮/解壓縮（gzip）
│       ├── i18n/                  # 國際化（中/英）
│       │   ├── index.ts           # 語言管理
│       │   ├── zh.ts              # 繁體中文翻譯
│       │   └── en.ts              # 英文翻譯
│       └── nameGenerator/         # 名稱生成工具
│           ├── person.ts          # 角色名稱
│           ├── place.ts           # 地點名稱
│           └── faction.ts         # 勢力名稱
├── src/components/
│   └── SigmaMap.tsx               # 互動式圖形地圖（Sigma.js + graphology）
│                                  # （EventLog 與 StatsCharts 定義於 game/page.tsx）
├── server/
│   ├── runRound.ts                # 主遊戲迴圈協調器（14 階段 + 佈局 + 快照）
│   ├── adminAssign.ts             # grantAdmin/revokeAdmin — 共用的行政官任命規則（野心 + 冷卻）
│   ├── graph/
│   │   └── layout.ts              # ForceAtlas2 佈局計算
│   └── phases/                    # 個別遊戲階段
│       ├── spawnPlaces.ts         # 階段 1：建立新地點（增量佈局）
│       ├── spawnCharacters.ts     # 階段 2：生成角色
│       ├── ageAndDeath.ts         # 階段 3：老化 + 死亡檢查
│       ├── economy.ts             # 階段 4：收入 + 徵兵
│       ├── signals.ts             # 階段 5：信號進展
│       ├── relationships.ts       # 階段 6：友誼/不滿
│       ├── ambitionEvents.ts      # 階段 7：野心變化
│       ├── loyaltyCheck.ts        # 階段 8：叛變檢查
│       ├── aiMove.ts              # 階段 9：角色移動（信號 + 敵方目標）
│       ├── battle.ts              # 階段 10：戰鬥解決（含逃脫移動）
│       ├── build.ts               # 階段 11：建築升級
│       ├── assignAdmins.ts        # 階段 12：自動指派行政官
│       ├── factionCollapse.ts     # 階段 13：勢力瓦解
│       └── factionDeath.ts        # 階段 14：勢力消滅
├── prisma.config.ts               # Prisma 7 設定
├── next.config.ts                 # Next.js 設定（React Compiler 已啟用）
├── tsconfig.json                  # TypeScript 設定
├── vitest.config.ts               # Vitest 測試設定
└── package.json                   # 依賴與腳本（build: prisma generate && next build）
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
- 每個角色擁有：**武力 (wu)**、**統領 (tong)**、**智謀 (jing)**、**速度**
- 屬性範圍 5-30，速度使用常態分佈 (μ=17, σ=5)
- 角色每回合老化，最終因年老而死亡（50-80 歲）
- 角色只會在勢力控制的地方生成（無主之地不會產生將領），且新生成的將領會立即加入該地所屬勢力
- 同一回合生成的角色在該回合不移動（出生回合原地待命）
- 生成時由該勢力國王指派新將領管理出生地：席位空缺（或現任已死亡）→ 直接指派；現任是國王本人 → 國王保留席位；否則比較總能力（武力+統領+智謀），**嚴格較高**者取得席位 —— 被免職者野心 **上升** `AMBITION_ADMIN_REPLACED_DELTA`（1），記錄 `ADMIN_REMOVED` 事件 + `AmbitionEvent`
- 所有任命路徑（出生指派、自動指派、戰役奪取、管理員手動指派）都會讓新任者野心**暫時下降** `AMBITION_ADMIN_ASSIGNED_DELTA`（1），若 `AMBITION_ADMIN_ASSIGNED_DURATION_ROUNDS`（10）回合後仍在職則回復 +1（記錄 `AMBITION_RECOVERED` 事件）；若期間被免職，免職本身已給 `AMBITION_ADMIN_REPLACED_DELTA`，不再重複回復
- 任一地點換過領導者後，`ADMIN_CHANGE_COOLDOWN_ROUNDS`（10）回合內 AI 不得再更換該地領導（僅限制 AI 路徑：戰役奪取與手動指派仍可進行）

### 勢力
- 角色可歸屬於某個勢力（王國/國家）
- 每個勢力有國王、顏色、領地
- 當國王死亡，勢力進入「瓦解中」狀態並逐漸解散
- 只有勢力控制的地方才能被指派行政官（自動指派略過無主之地；管理員 API 對無主之地回傳 400）
- 地點彈窗顯示該地的行政官（管理者姓名，國王加 👑），無人管理時顯示「無行政官」

### 地圖視覺化

遊戲使用 Sigma.js 提供互動式力導向圖地圖：

- **節點** = 地方（按勢力著色，按駐軍 + 兵力調整大小）
- **邊** = 連接地方的道路
- **ForceAtlas2** 佈局讓連接的地方自然靠近
- **增量佈局** — 新地方在母節點附近生成
- **HSL → Hex 轉換**（WebGL 需要 hex/rgb 格式）
- 節點大小：`4 + log(totalTroops + 1) × 2`（對數成長）
- 節點標籤共用單一縮放規則：僅當縮放 ≥ `LABEL_SIZE_THRESHOLD`（8）時顯示（Sigma 的 `labelRenderedSizeThreshold`）；標籤永遠疊在聚光燈覆蓋層之上
- **聚光燈環** — 當前顯示回合（`SPOTLIGHT_ROUNDS` = 1）內生成或被攻擊的地方，在 2D 覆蓋畫布上顯示脈動發光環：青色＝新生成、紅色＝被攻擊
- **移動動畫** — 每回合的 `CHARACTER_MOVED` 事件以陣營色光點從起點 → 終點行進（行進 1.5 秒 + 停頓 2.5 秒，`MOVE_ANIM_DURATION`/`MOVE_ANIM_PAUSE`）；事件端點會為這些列補上 `fromPlaceName`/`toPlaceName` 供事件誌顯示

### 戰鬥
- 角色每回合移動 1 個領地
- 當敵方角色相遇時，會進行戰鬥
- 戰鬥結果取決於兵力、武力/統領屬性、堡壘等級
- 敗者可能逃脫到附近友方地點（基於速度差異）或死亡

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

### 公開（免認證）

首頁只服務未登入訪客，因此需要一條不需要 session 的讀取路徑。這個端點是唯一的一條。

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/public/world` | 取得世界運作現況的聚合快照 |

它嚴格唯讀：沒有任何寫入路徑，也沒有 admin 或 session 相關的表面，並且不回傳
任何個人資料——只有據點名稱、勢力名稱與聚合計數。計數永遠是完整值；據點圖譜會
下采樣到 400 個節點（`graph.truncated` 會標示是否被截斷），讓世界成長到 2000 個
據點時輪詢成本仍然可控。

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
- **Tailwind 優先**：設計值只寫一次於 `src/app/globals.css` 的 `@theme static`
  區塊，並由 Tailwind 產生原生 utility。表面以 utility 表達，不使用自訂 CSS 類別。
  重複使用的表面，utility 字串會以模組層級常數宣告在擁有它的檔案裡。完整規則見
  [TECH.md](./TECH.md#tailwindcss-4)。

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

建構腳本會自動在 `next build` 前執行 `prisma generate`：

```bash
# 建構指令（在 package.json 中設定）
prisma generate && next build

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
