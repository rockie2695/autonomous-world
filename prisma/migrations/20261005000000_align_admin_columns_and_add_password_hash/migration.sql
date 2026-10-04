-- 把「遷移記錄」補齊到資料庫的實際狀態，並新增密碼登入需要的欄位。
-- Brings the migration history in line with the database's actual schema and adds
-- the column that email + password sign-in needs.
--
-- 為什麼這支遷移是「補齊」而不是「建立」？
-- 前面的 admin / cooldown 欄位（Place.adminChangedRound、Character.adminAmbitionRevertRound）
-- 是用 `prisma db push` 直接套到資料庫的，從來沒有寫進遷移記錄，於是
-- `prisma migrate dev` 會把它們視為 drift 並要求 reset（會清掉整個世界）。
-- 這裡用 `IF NOT EXISTS` 補上這兩欄（資料庫裡已經有了，所以是 no-op），
-- 順便加上 User.passwordHash，於是遷移記錄終於和資料庫一致，
-- 之後 `migrate dev` 就不會再要求 reset。
--
-- Why is this migration "aligning" rather than "creating"? The admin / cooldown
-- columns were applied straight to the database with `prisma db push` and never
-- recorded in the migration history, so `prisma migrate dev` saw them as drift and
-- demanded a reset — which would have wiped the running world. Re-adding them with
-- `IF NOT EXISTS` is a no-op against the current database, and adding
-- User.passwordHash alongside brings the history and the database back into
-- agreement so future `migrate dev` runs stay non-destructive.
--
-- 三個欄位都是「可空」且只是新增，所以對既有資料沒有任何影響。
-- All three columns are nullable additions, so existing rows are untouched.

-- Round when a temporary admin ambition reduction reverts (phase 7)
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "adminAmbitionRevertRound" INTEGER;

-- Last round the administrator changed, anchoring ADMIN_CHANGE_COOLDOWN_ROUNDS
ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "adminChangedRound" INTEGER;

-- Argon2id hash for email + password sign-in. Nullable so Google-only accounts
-- (which have no password) keep working in the same table.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;