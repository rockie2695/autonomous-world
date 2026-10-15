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
| 認證 | Auth.js v5 (next-auth) + Google Provider + argon2id 電子信箱／密碼 |
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
│   │   ├── game/                  # 主遊戲頁面 — page.tsx 負責協調，EventLog.tsx、
│   │   │                          # stats-charts.tsx、leader-detail.tsx、types/icons/styles 為其餘模組
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
│       ├── territory.ts           # 領地形力場（純邏輯，不碰 DOM）
│       ├── spaceGalaxy.ts          # 背景銀河：核、星雲、星點（純邏輯）
│       ├── spaceFog.ts             # 銀河之上、地圖之下的暖色星塵，緩慢漂移（純邏輯）
│       ├── spaceShared.ts          # 共用：sigma 的框化→視窗定位 + canvas 顏色工具
│       ├── i18n/                  # 國際化（中/英）
│       │   ├── index.ts           # 語言管理
│       │   ├── zh.ts              # 繁體中文翻譯
│       │   └── en.ts              # 英文翻譯
│       └── nameGenerator/         # 名稱生成工具
│           ├── person.ts          # 角色名稱（傳統 張飛／稱號 霜狼·蓋爾）
│           ├── place.ts           # 地點名稱（傳統 青碧城／稱號 霜狼關）
│           ├── faction.ts         # 勢力名稱（傳統 蒼龍盟／稱號 霜脊議會）
│           └── epithet.ts         # 共用的兩字稱號元件
├── src/components/
│   ├── SigmaMap.tsx               # 互動式圖形地圖（Sigma.js + graphology）
│   ├── mapShared.ts               # SigmaMap 的純邏輯：顏色換算、型別、MapCameraControls
│   ├── BattleReport.tsx           # 戰報彈窗（攻守算式）
│   ├── SpaceGalaxy.tsx             # 烘焙後自轉的銀河，最底層（Canvas 2D）
│   ├── SpaceFog.tsx                # 銀河之上、地圖之下的暖色星塵，緩慢漂移（Canvas 2D）
│   ├── SpaceFlow.tsx               # 疊在銀河之上的流場塵埃（Simplex noise，Canvas 2D）
│   ├── LeaderAvatar.tsx           # 程序化生成的將領頭像（以 character.id 播種）
│   └── home/                      # 首頁各區塊（three.js 場景、即時輪詢、hooks）
│                                  # （事件日誌與統計圖表位於 src/app/game/）
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
- 每個角色擁有：**武力 (wu)**、**統領 (tong)**、**經濟 (jing)**、**速度**
- 屬性範圍 5-30，速度使用常態分佈 (μ=17, σ=5)
- 角色每回合老化，最終因年老而死亡（50-80 歲）
- 新生的將领一後郡庫至少庫 **1 名士兵**（`CHAR_START_TROOPS`），不會一發現就完全無兵
- **體魌（小健）也有自己的頭像識別** — 前臂护具。頭、肩、胸占已經有了，前臂是剩下的部位，因此四項能力可以一眼分開；同样逐級殘陳（金碼护腕 → 素膀鑴 → 布繌臂），且每個級級都加深色辺框，不然麻、鋼那種低階色在深色衣袍上簄米看不見
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
- 節點標籤共用單一縮放規則：僅當鏡頭比例 ≤ `LABEL_ZOOM_RATIO`（0.6）時顯示，與兵力無關；標籤永遠疊在聚光燈覆蓋層之上。唯一的例外是「正在指向的地方」——被 hover 的節點、被選取的節點，以及被 hover 節點的相連鄰居，任何縮放下都保留地名，因此拉遠時也能看清某地連到哪裡
- **縮放控制** — 縮小與放大按鈕之間的滑桿直接拖曳鏡頭比例，並以百分比顯示目前層級（`MAP_ZOOM_MIN_RATIO` 0.05 ～ `MAP_ZOOM_MAX_RATIO` 3）。比例與鏡頭中心**都有上下限**，所以世界不可能被縮放或拖出畫面
- **領地視圖** — 拉遠超過 `TERRITORY_ZOOM_RATIO` 後，每個地方各自推出**一樣大的圓形力**，地圖標出
  這些力覆蓋的區域，也就是 CK3 map mode 與 Stellaris 星系圖的做法。同一勢力的力會**累加**，所以
  地方越多勢力推得越遠；不同勢力的力互相**抵擋**，邊界落在兩邊力相等處，因此由距離決定誰把邊界推
  得更遠。這是**蓋在原圖上的半透明色層**，不是重新畫一張地圖 —— 節點與道路都還看得見；而無主
  之地完全不上色，因為 CK3 也不會動未宣稱的土地。滑鼠停在某個**地方**上仍然顯示該地方的提示；停在
  勢力的一整片面積上才顯示勢力提示，並把該片打亮、其餘壓暗
- **勢力名永遠在自己領地裡面** — 錨點與字級都取自**同一個內切圓**，所以整塊文字在建構上就落在
  自己的領地內，完全不需要再夾位置。名字會先朝白色調亮，因為底下的填色是同一個勢力色疊在深色背景上，
  原色壓上去會整個暗掉；而且勢力名**正好在地方名消失的同一個縮放比例接手**，讓地圖不會出現一段
  兩種名字都沒有的空白
- **三層的太空背景** — 地圖底下有一顆緩慢自轉的銀河、一層緩慢漂移的暖色星塵霧氣，以及一層流場塵埃。
  - **銀河**是最底層：一團柔軟的暖核、幾團低飽和的星雲，以及往圓心集中的星點。
    它在 resize 時一次烤進離屏 canvas，之後每幀只做一次帶旋轉的 `drawImage`。整層**完全不使用噪聲**，
    而且在拉近時變暗（`SPACE_GALAXY_FADE_RATIO: 0.9`，下限 `SPACE_GALAXY_FADE_MIN: 0.55`，所以永遠
    不會消失，只是變暗）——精確跟隨 sigma 的縮放代表拉到最近時它會膨脹到約九倍視窗，糊成一層薄膜並吃掉
    道路對比。拉近的清晰度來自**提高的下限 + 更多星點與星雲**，而不是拿掉淡出。
  - **霧氣**是一層暖色種子星塵，畫在**銀河之上、地圖之下**——是深處的背景而不是蓋在地圖上的霧，所以道路
    與節點永遠在它之上。它帶 `pointer-events-none`（保留是為了安全），而且仍然畫在 HUD 底下。它**緩慢漂移**
    （20 分鐘一圈），而且**沒有縮放淡出**，因為它現在位於地圖之下、沒有東西需要遮蔽。**密度**才是讓它讀起來
    像雲而不是灰霧的原因——每個色塊抽一個值，同時決定它的 alpha 與半徑，所以濃的地方又白又大，稀的地方幾乎
    看不見。色盤刻意偏**暖**（近乎白的奶油到暗褐），所以讀起來像**被照亮的星塵**，而不是冷灰的霧。
  - **塵埃**是最上層的背景（仍在地圖之下），負責全部的結構與移動：粒子沿著 3D Simplex noise 場移動，所以
    會聚成絲帶、渦流與空洞而不是隨機亂飛；每顆粒子的顏色取自**它所在位置**的噪聲，所以一條絲帶就是一種顏色。
  - 銀河與霧氣**由 sigma 自己定位**（走 `framedGraphToViewport`），所以它們真的躺在**世界座標**裡，
    跟著地圖一起滾動與縮放。這取代了一個真實的 bug：手寫的平移方向算反，背景於是與地圖**反向**漂移。
    只有塵埃有自己的視差比例（`SPACE_FLOW_PARALLAX: 0.35`）——它是唯一浮在地圖上方、而非躺在世界裡的一層。
  - **領地面積層在拉近超過 `TERRITORY_INTERACTIVE_RATIO`（0.6）後不再可互動**：低於它時，滑鼠停在某一塊
    地面上不會再回答「這是誰的地」，也不會再把該勢力的色填亮起來——因為那一段看的是節點與道路，面積層只是底色。
    地點節點的 hover 與點擊不受影響。
  - **縮放百分比是一個可輸入的數字加上 `%` 標籤**，不是純顯示：`0` = 最遠、`100` = 最近，輸入數值會直接跳到那個縮放
    （Enter 套用，失焦也套用）。草稿是字串而不是數字，否則打「15」時第一個字就會被改寫成 1%。
  - 銀河**刻意比 Stellaris 參考圖暗**：參考圖的核是亮的，但它靠的是「細而亮」的連線。
  - 塵埃的調色盤被壓進**冷色半邊並降低彩度**（色相 `195 → 280`、飽和度 45、alpha 0.55）。它原本是
    0–320 的彩虹、飽和度 78，那是在它**唯一**是背景時調的。`spaceFlow.test.ts` 以「上限」斷言。
- **戰鬥只在一個地方呈現** — 也就是 `PLACE_CAPTURED` 的戰報。地圖上沒有戰鬥動畫：先前那支沿著
  戰線互相開火的艦隊被拿掉了，因為戰線是由「誰控制哪裡」推導的，於是兩個勢力一接壤就永遠
  「在打仗」。那是環境雜訊而不是資訊，而且會跟真正說明一場交戰的戰報搶注意力。地圖上唯一的
  戰鬥線索是顯示回合的重點光環：紅色代表被攻擊，青色代表新建
- **將領頭像的呼吸** — 詳情彈窗中 168px 的頭像會微微起伏（吸氣峰值在週期的 0.45，所以
  讀起來像呼吸而不是心跳）。列表與 hover 預覽不開，因為在那個尺寸看不出來、重繪卻是真的
- 將領／事件／統計面板**疊在地圖右緣**而非佔用版面寬度，地圖保留完整畫布；頁籤列常駐，只有內容面板會收合
- **再點一次已啟用的頁籤會關閉它的面板** — 是切換而不是只能開，所以頁籤列永遠能收起自己的面板
- **版面已經沒有任何一欄是走欄位配置的** — 選擇回合疊在地圖**左緣**，勢力排行則移進統計頁籤，因此地圖在任何寬度下都保留整個可視範圍
- **事件誌篩選** — 三種篩選以 AND 組合：勢力下拉選單、六種事件分類的複選晶片，以及 人物／地點／其他 的資訊種類切換。資訊種類不只是顯示篩選，它決定事件誌裡的名字是否變成可點的按鈕（點地點會聚焦該地，點將領會開啟其詳情）
- **聚光燈環** — 當前顯示回合（`SPOTLIGHT_ROUNDS` = 1）內生成或被攻擊的地方，在 2D 覆蓋畫布上顯示脈動發光環：青色＝新生成、紅色＝被攻擊
- **戰報** — 佔領的列有一個 **戰報** 按鈕，打開那一場的算式（攻方兵力 × 武力 × 隨機值
  對守方駐軍 × 堡壘 × 隨機值）。若該地沒有守軍，戰報會明白寫出「無守軍」，而不是留一格
  空白的算式——因為「打了一場」和「走進空城」在列表上看起來一模一樣
- **經濟事件** — 每個回合每個地方會寫一列 `INCOME`：該地的收益、徵到的兵，以及錢怎麼分給
  君王、行政官與其他人。一地方一列而不是一人一列，因為一列就已經寫出收款人是誰
- **購兵事件** — 當將領用**自己的**金幣買兵時，會寫一列 `TROOPS_BOUGHT`，寫明是誰、在哪裡、
  買了幾個兵、花了多少，以及買完之後剩下多少金與多少兵。它是金錢流向的另一半：只看 `INCOME`
  只會看到某人有進帳，卻看不到他把錢花去哪了
- **地方彈窗** — 每座建築都顯示等級、目前等級**實際**帶來的效果、再升一級會多多少，以及升級
  費用（依行政官是否買得起而上色）。另有**每回合產出**區塊，顯示徵兵、總收入，以及行政官
  **實際**拿到多少——沒有行政官時是一分都沒有，而不是印一個比例出來。所有數字都與模擬本身
  使用的是同一段計算，所以彈窗不可能顯示一個遊戲並沒有的數字
- **叛離事件會說清楚三方** — 離開哪個勢力、從哪個地方、加入了哪個勢力（或自己建立），
  而不是只有「某某 叛離了原勢力」
- **頭像會眨眼、說話，並顯示速度** — 嘴巴一開一合而且**會停頓**，所以讀起來像在說話而不像
  節拍器；眼睛會眨；速度以一到三條動勢線畫在身後，用**自己的色階**（刻意不用屬性共用的
  金／鋼／麻）
- **將領表排序** — 將領數的表頭可以排序：點欄位切換、再點反轉。換欄位時會採用該欄位自己的
  預設方向（數字大的先、名字 A→Z），而且從表格點進將領後有 **返回** 可以回到表格
- **移動動畫** — 每回合的 `CHARACTER_MOVED` 事件以陣營色光點從起點 → 終點行進（行進 1.5 秒 + 停頓 2.5 秒，`MOVE_ANIM_DURATION`/`MOVE_ANIM_PAUSE`）；事件端點會為這些列補上 `fromPlaceName`/`toPlaceName` 供事件誌顯示
- **鏡頭動畫** — 點擊地點會動畫置中，重設則動畫到「整個世界剛好放得下」（`MAP_CAMERA_ANIM_MS`；`prefers-reduced-motion` 時為 0）
- 聚光燈迴圈在地圖捲出視窗或分頁切到背景時會暫停

### 統計

統計分頁有九張時間序列圖，可切換四種樣式：

| 樣式 | 勢力圖 | 世界整體圖 |
|------|--------|-----------|
| 折線 | 每個勢力一條線 | 單一趨勢線 |
| 圓餅 | 最新回合的佔比圓環 | 相對歷史峰值的進度環 |
| 長條 | 每回合一根堆疊長條 | 每回合一根長條 |
| 區塊圖 | 勢力力量：每個勢力一個區塊（面積＝領地數），內部再切兵力／金幣／將領 | — |

選擇**區塊圖**會取代那九張圖，因為它是「勢力力量」的整合視角，而不是單一指標的另一種畫法。

- **滑鼠提示** — 四種樣式加上區塊圖共用同一個提示面板與同一組圖例，因此在哪裡 hover 讀起來都一樣。折線與長條會畫十字線並吸附到最近的回合；圓餅會命中游標下的扇區；進度環顯示 目前 vs 峰值。進度環與區塊圖**刻意不顯示回合標題**，因為兩者都是「目前」的快照而不是某一個回合。提示面板靠近右緣時會翻到游標左側，避免被面板邊界裁掉
- **將領雷達圖** — 每個勢力一個多邊形，畫的是該勢力存活將領在 武力／統領／經濟／速度／野心／年齡 的平均屬性，虛線為世界平均
- **將領列表 hover 預覽** — 滑鼠停在將領表格的某一列時，右側浮出該將領的雷達圖，左側浮出他的頭像
- **將領頭像** 以角色 id 生成，因此同一位將領永遠是同一張臉，且不必存任何資料：君王有王冠、年長者髮色轉灰、衣袍則用陣營色
- 武力／統領／經濟各自分成**三段**，因此**每位**將領都看得出能力，而不只是最強的那幾位；而且每個線索各有自己的身體位置，彼此不會干擾：

  | 段 | 武力（頭） | 統領（肩） | 經濟（胸前） |
  |----|------|--------|--------|
  | 高 | 有盔翎的頭盔 | 寬金肩章 + 流蘇 | 算盤 |
  | 中 | 有結的額帶 | 素鋼肩章 | 方孔銅錢 |
  | 低 | 疤痕 | 細麻補丁肩帶 | 空的束口袋 |

  三項能力共用同一套材質語言 —— 金色是將軍、鋼色是軍佐、麻色是平民，因此階級可以橫向比較；低段刻意做成破舊的樣子
- **滑鼠停在將領頭像上會解說這些線索**，列出三項（武力 高 · 頭盔）。同樣的文字也放在包覆層的 `aria-label`，鍵盤與螢幕閱讀器使用者也看得到
- 雷達圖每個軸用自己的最大值正規化（年齡上限本來就遠高於能力值），所以邊長不能跨軸比較 —— 看的是形狀，不是數字

### 戰鬥
- 角色每回合移動 1 個領地
- 當敵方角色相遇時，會進行戰鬥
- 戰鬥結果取決於兵力、武力/統領屬性、堡壘等級
- 敗者可能逃脫到附近友方地點（基於速度差異）或死亡

### 經濟
- 每個領地根據市場等級產生收入
- 收入分配：**君王 30%、行政官 40%、其他角色 30% 共享**。君王缺席或沒有其他角色時，缺席者的份額由在場者接手，因為總額固定而金錢不能憑空消失
- **沒有行政官就誰都不拿。** 行政官是實際管事的人，沒有他代表這個地方根本沒有人治理，把錢自動轉給遠方的國王等於付給一個不在場的人
- **經濟（jing）** 會放大領導者實得的份額：份額 × `1 + (jing − 17.5) / 30`，
  因此一般將領與原本完全相同，jing 高的多拿、低的少拿。若只有一位領導者（沒有君王或
  沒有總督），他本來就獨得全部，不套倍率 —— 分配總額永遠不會超過地點收入
- 角色可用個人金錢購買士兵

### 帳號

可使用 **Google** 或**電子信箱＋密碼**登入 —— 兩者共用同一張 `User` 表，所以同一個信箱兩種方式都能用。

- 密碼以 **argon2id** 雜湊，明文絕不落地、絕不進 log
- 信箱已存在時註冊會被拒絕，而**不會覆寫**既有帳號的密碼，因此不可能有人只因為知道某個 Google
  帳號的信箱就把它接管掉
- 要替 Google 帳號（含管理員）加上密碼，請先用 Google 登入，再呼叫
  `POST /api/auth/set-password` —— 這需要一個已驗證的 session，而持有 session 正是「證明自己擁有
  帳號」這件事本身
- 密碼長度下限為 8 個字元，不要求字元組成（依 NIST SP 800-63B）
- **不做 email 驗證，也不做密碼重設** —— 兩者都需要寄信服務，已明確延後，因此信箱在任何確認之前就能
  登入。公開環境還需要在這兩個認證端點前面加上速率限制

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

## 圖表：x 軸是絕對回合 / Charts: the x axis is the absolute round

動力的串列**不是从世界第一回合就采減的**，它只在該動力刕現的那回合才長一項，
所以 `values` 從 index 0 就開始，而世界可能已經到第 12 回合。若照險律画 index，每個動力都會被畫成
一直存在到最初。stats route 現在每個動力的數值旁該一個 `rounds[]`，圖表用 `startOffsetOf()` / `xOf()` /
`valueAt()` 去寫回真實的回合位置。

**同一個 bug 體讀正錯的數字。** 午朝線與 tooltip 曾用世界 index 去索引一個動力本局的
陣列，取到 `undefined`、被 `?? 0` 接下，把真實存在的動力從錯報成**零兵力**；且元素會
列出那一回合根本尚未存在的動力。現在已改用 `valueAt()` 與 `hasValueAt()`。

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

## 致謝

- 使用 [Next.js](https://nextjs.org/) 建構
- 由 [Prisma](https://www.prisma.io/) 提供動力
- 視覺化使用 [Sigma.js](https://www.sigmajs.org/)
- 樣式使用 [Tailwind CSS](https://tailwindcss.com/)
- 資料取得使用 [TanStack Query](https://tanstack.com/query)
- 驗證使用 [Zod](https://zod.dev/)
- 優化使用 [React Compiler](https://react.dev/learn/react-compiler)


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
