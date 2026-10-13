-- 將領的親子關係：父親欄位 + self-referential Family relation
-- Character parent link: father column + self-referential "Family" relation.
--
-- 只有一個欄位：childCount 刻意**沒有**做成冗餘欄位。孩子數可以直接用
-- offspring 關係數出來，存一份計數只會有兩份資料不一致的風險。
-- Deliberately ONE column: there is no denormalised childCount. The number of children
-- is counted through the `offspring` relation, and a stored counter would be a second
-- source of truth that can only ever disagree with the relation.
--
-- Nullable with no default: an existing row is simply not a child, so no backfill is
-- needed and no historical leader is mislabelled as someone's offspring.
ALTER TABLE "Character" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Character_parentId_idx" ON "Character"("parentId");
ALTER TABLE "Character" ADD CONSTRAINT "Character_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;