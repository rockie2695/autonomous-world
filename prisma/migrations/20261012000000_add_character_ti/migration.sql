-- Add the 體魄 (ti) physique attribute: the defence term in leader-vs-leader battle,
-- taking over the role tong used to fill.
--
-- 既有角色要回填一個合理的值，而不是全部 0：體魄與其他屬性同樣是 5–30 的均勻分佈，
-- 所以用 17（略低於中位數 17.5）代表「一個_average_ 的老將領」，並同時把總督選任
-- 依據的屬性總和納入考量。
--
-- Existing rows are backfilled rather than defaulted to 0. ti uses the same uniform
-- 5–30 range as the other abilities, so a flat 0 would make every pre-existing leader
-- helpless in defence — instantly losing almost every battle they were about to win.
-- 17 sits just under the midpoint of that range, i.e. "an average leader".

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "ti" INTEGER NOT NULL DEFAULT 17;

-- Now that every row is populated, drop the default: new characters always get an
-- explicit rolled value from spawnCharacters, and a silent default would hide a bug
-- in that path rather than surface it.
ALTER TABLE "Character" ALTER COLUMN "ti" DROP DEFAULT;
