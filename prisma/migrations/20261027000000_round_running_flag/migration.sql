-- 回合執行旗標：背景工作的持久化狀態（重整後的頁面要立刻看到「正在跑」）
-- The round-running flag: the background job's persisted state (a refreshed page
-- must see "a round is running" immediately)
ALTER TABLE "World" ADD COLUMN "roundRunning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "World" ADD COLUMN "roundStartedAt" TIMESTAMP(3);
