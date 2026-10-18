-- Rename the ambition vocabulary to match what it actually is.
--
-- `Character.ambition` is a FIXED initial stat: nothing rewrites it, ever. What moves every
-- round is the *defection value*, which is computed as
--
--     value = ambition + loyalty penalty + this round's ledger delta sum
--
-- Every name said "ambition", which is exactly the wrong mental model -- it reads as "this
-- number drifts upwards over time" when in fact the column is frozen at spawn and only the
-- ledger deltas move.
--
--   "Character".ambition   -> "defectionBase"   the fixed base of the defection value
--   "AmbitionEvent"        -> "DefectionEvent"  the ledger of adjustments to that value
--
-- `adminAmbitionRevertRound` is dropped: the temporary-revert machinery was retired earlier and
-- the column had been referenced only from comments ever since. Nothing reads or writes it.
--
-- These are pure renames plus a drop -- no data is rewritten and no value changes. The
-- round-0 snapshot still holds the pre-migration fractional ambition (19.197562277970952),
-- because a snapshot is a gzipped JSON blob and a column type change never touched it; that is
-- handled at read time in decompressSnapshot, which maps the old key and rounds.
ALTER TABLE "Character" RENAME COLUMN "ambition" TO "defectionBase";

ALTER TABLE "AmbitionEvent" RENAME TO "DefectionEvent";

ALTER TABLE "Character" DROP COLUMN "adminAmbitionRevertRound";