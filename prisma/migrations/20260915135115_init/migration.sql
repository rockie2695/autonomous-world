-- CreateEnum
CREATE TYPE "Loyalty" AS ENUM ('SELF', 'PATH', 'ALTRUISM');

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "seed" TEXT NOT NULL,
    "rngState" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "collapsing" BOOLEAN NOT NULL DEFAULT false,
    "createdAtRound" INTEGER NOT NULL,
    "endedAtRound" INTEGER,
    "kingId" TEXT,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factionId" TEXT,
    "administratorId" TEXT,
    "garrison" INTEGER NOT NULL DEFAULT 0,
    "fortress" INTEGER NOT NULL DEFAULT 0,
    "market" INTEGER NOT NULL DEFAULT 0,
    "barracks" INTEGER NOT NULL DEFAULT 0,
    "layoutX" DOUBLE PRECISION NOT NULL,
    "layoutY" DOUBLE PRECISION NOT NULL,
    "createdAtRound" INTEGER NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Road" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "createdAtRound" INTEGER NOT NULL,

    CONSTRAINT "Road_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factionId" TEXT,
    "wu" INTEGER NOT NULL,
    "tong" INTEGER NOT NULL,
    "jing" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "loyalty" "Loyalty" NOT NULL,
    "ambition" DOUBLE PRECISION NOT NULL,
    "age" INTEGER NOT NULL DEFAULT 20,
    "maxAge" INTEGER NOT NULL,
    "placeId" TEXT NOT NULL,
    "troops" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "isKing" BOOLEAN NOT NULL DEFAULT false,
    "diedAtRound" INTEGER,
    "signalCooldown" INTEGER NOT NULL DEFAULT 0,
    "lastPromotedRound" INTEGER,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "sinceRound" INTEGER NOT NULL,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discontent" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "sinceRound" INTEGER NOT NULL,

    CONSTRAINT "Discontent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "targetPlaceId" TEXT NOT NULL,
    "createdRound" INTEGER NOT NULL,
    "expireRound" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundSnapshot" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "RoundSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbitionEvent" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "charId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "AmbitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Faction_kingId_key" ON "Faction"("kingId");

-- CreateIndex
CREATE UNIQUE INDEX "Place_administratorId_key" ON "Place"("administratorId");

-- CreateIndex
CREATE UNIQUE INDEX "Road_worldId_aId_bId_key" ON "Road"("worldId", "aId", "bId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_worldId_aId_bId_key" ON "Friendship"("worldId", "aId", "bId");

-- CreateIndex
CREATE UNIQUE INDEX "Discontent_worldId_aId_bId_key" ON "Discontent"("worldId", "aId", "bId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundSnapshot_worldId_round_key" ON "RoundSnapshot"("worldId", "round");

-- CreateIndex
CREATE INDEX "Event_worldId_round_idx" ON "Event"("worldId", "round");

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Road" ADD CONSTRAINT "Road_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Road" ADD CONSTRAINT "Road_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Road" ADD CONSTRAINT "Road_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discontent" ADD CONSTRAINT "Discontent_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discontent" ADD CONSTRAINT "Discontent_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discontent" ADD CONSTRAINT "Discontent_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_targetPlaceId_fkey" FOREIGN KEY ("targetPlaceId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSnapshot" ADD CONSTRAINT "RoundSnapshot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbitionEvent" ADD CONSTRAINT "AmbitionEvent_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbitionEvent" ADD CONSTRAINT "AmbitionEvent_charId_fkey" FOREIGN KEY ("charId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
