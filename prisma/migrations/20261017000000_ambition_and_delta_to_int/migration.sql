-- Ambition and the ledger delta are integers, not floats.
--
-- Two reasons these were ever floats, and why both are gone:
--   1. `ambition` came from a gaussian draw and was never rounded, so the column held values
--      like 19.197562277970952 while every other ability column is an integer.
--   2. `AmbitionEvent.delta` was fractional because two of its sources were fractional:
--      `AMBITION_NO_PROMOTION_DELTA` (now 1) and the king's-tong reduction (now removed --
--      tong does not suppress defection at all).
--
-- The `::numeric` casts are not optional. Postgres has no single-argument
-- `round(double precision)`, so `ROUND("ambition")` on its own raises
-- "function round(double precision) does not exist". Round in numeric, then cast.
--
-- `speed` needed no migration: its column was already integer, and the stored value was only
-- an integer because the database coerced the float on the way in. That is now explicit at
-- the call site via `Rng.gaussianInt`.
ALTER TABLE "Character"     ALTER COLUMN "ambition" TYPE INTEGER USING ROUND("ambition"::numeric)::integer;
ALTER TABLE "AmbitionEvent" ALTER COLUMN "delta"    TYPE INTEGER USING ROUND("delta"::numeric)::integer;