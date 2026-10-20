-- DropIndex
DROP INDEX "Character_parentId_idx";

-- AlterTable
ALTER TABLE "DefectionEvent" RENAME CONSTRAINT "AmbitionEvent_pkey" TO "DefectionEvent_pkey";

-- CreateTable
CREATE TABLE "BattleStrike" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "warRound" INTEGER NOT NULL,
    "placeId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "attackerName" TEXT NOT NULL,
    "attackerFactionId" TEXT,
    "defenderId" TEXT NOT NULL,
    "defenderName" TEXT NOT NULL,
    "defenderFactionId" TEXT,
    "attackPower" DOUBLE PRECISION NOT NULL,
    "defencePower" DOUBLE PRECISION NOT NULL,
    "roll" DOUBLE PRECISION NOT NULL,
    "damage" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,

    CONSTRAINT "BattleStrike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BattleStrike_worldId_round_idx" ON "BattleStrike"("worldId", "round");

-- CreateIndex
CREATE INDEX "BattleStrike_worldId_placeId_round_idx" ON "BattleStrike"("worldId", "placeId", "round");

-- RenameForeignKey
ALTER TABLE "DefectionEvent" RENAME CONSTRAINT "AmbitionEvent_charId_fkey" TO "DefectionEvent_charId_fkey";

-- RenameForeignKey
ALTER TABLE "DefectionEvent" RENAME CONSTRAINT "AmbitionEvent_worldId_fkey" TO "DefectionEvent_worldId_fkey";
