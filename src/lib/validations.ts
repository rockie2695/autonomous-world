// ============================================================================
// Zod 驗證模式 — API 資料驗證 / Zod Validation Schemas — API Data Validation
// ============================================================================
// 使用 Zod 定義 API 路由的請求驗證模式。
// Uses Zod to define request validation schemas for API routes.
// 確保型別安全的 API 輸入驗證。
// Ensures type-safe API input validation.
// ============================================================================

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from './passwordPolicy';

// ─── 世界相關模式 / World-related Schemas ─────────────────────────────────────

/**
 * 取得世界狀態的查詢參數驗證。
 * Query parameter validation for getting world state.
 */
export const WorldStateQuerySchema = z.object({
  round: z.coerce
    .number()
    .int()
    .min(0, '回合數必須為非負整數 / Round must be a non-negative integer'),
});

/**
 * 重置世界的請求本體驗證。
 * Request body validation for resetting world.
 */
export const ResetWorldBodySchema = z.object({
  name: z
    .string()
    .min(1, '世界名稱為必填 / World name is required')
    .max(100, '世界名稱不能超過 100 個字元 / World name must be 100 characters or less'),
  confirm: z.literal(true, '需要確認 / Confirmation required'),
});

/**
 * 指派管理員的請求本體驗證。
 * Request body validation for assigning administrator.
 */
export const AssignAdminBodySchema = z.object({
  placeId: z
    .string()
    .min(1, '地點 ID 為必填 / Place ID is required'),
  characterId: z
    .string()
    .min(1, '角色 ID 為必填 / Character ID is required'),
});

// ─── 認證 / Authentication ────────────────────────────────────────────────
// 郵寄地址一律轉小寫：信箱大小寫在實務上不區分，但資料庫的 @unique 會區分，
// 不正規化的話 Someone@x.com 與 someone@x.com 會變成兩個帳號，之後誰也登不進去。
// Emails are lower-cased everywhere: mail addresses are case-insensitive in
// practice but the database's @unique is not, so without normalisation
// Someone@x.com and someone@x.com become two accounts and only one can sign in.

const emailField = z
  .string()
  .trim()
  .min(1, '電子信箱為必填 / Email is required')
  .email('電子信箱格式不正確 / Invalid email address')
  .transform((value) => value.toLowerCase());

/**
 * 註冊的請求本體驗證。
 * Request body validation for registration.
 *
 * 只限制長度下限，不要求字元組成 —— 複雜度規則實際上只會把人推向可預測的密碼，
 * 見 `PASSWORD_MIN_LENGTH` 的說明。
 * Only a minimum length, no composition rules: complexity rules mostly push people
 * toward predictable passwords (see the note on PASSWORD_MIN_LENGTH).
 */
export const RegisterBodySchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元 / Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    )
    // 密碼有上限：argon2id 的記憶體成本是固定的，但極長的輸入會浪費時間，
    // 而且極長密碼多半是自動產生或攻擊工具的產物，不是真實使用者 /
    // Cap the length: argon2id's memory cost is fixed, but an enormous input wastes
    // time and such a password is almost always machine-generated rather than human
    .max(200, '密碼不能超過 200 個字元 / Password must be 200 characters or less'),
  name: z
    .string()
    .trim()
    .max(100, '名稱不能超過 100 個字元 / Name must be 100 characters or less')
    .optional(),
});

/**
 * 為已登入的使用者設定密碼。
 * Set a password for the already signed-in user.
 *
 * 形狀和註冊相同，但走的是「必須先證明自己擁有這個帳號」的路徑 —— 見
 * `set-password` 路由的說明。
 * Same shape as registration, but it takes the "prove you already own this account"
 * path — see the note in the set-password route.
 */
export const SetPasswordBodySchema = z.object({
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元 / Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    )
    .max(200, '密碼不能超過 200 個字元 / Password must be 200 characters or less'),
});

// ─── 統計資料相關模式 / Statistics-related Schemas ────────────────────────────

/**
 * 取得統計資料的查詢參數驗證。
 * Query parameter validation for getting statistics.
 */
export const StatsQuerySchema = z.object({
  from: z.coerce
    .number()
    .int()
    .min(0, '起始回合必須為非負整數 / From round must be a non-negative integer'),
  to: z.coerce
    .number()
    .int()
    .min(0, '結束回合必須為非負整數 / To round must be a non-negative integer'),
}).refine((data) => data.from <= data.to, {
  message: '起始回合不能大於結束回合 / From round cannot be greater than to round',
});

// ─── 事件相關模式 / Event-related Schemas ─────────────────────────────────────

/**
 * 取得事件的查詢參數驗證。
 * Query parameter validation for getting events.
 *
 * round 省略時回傳所有回合的事件 / When round is omitted, returns events for all rounds.
 */
export const EventsQuerySchema = z.object({
  round: z.coerce
    .number()
    .int()
    .min(0, '回合數必須為非負整數 / Round must be a non-negative integer')
    .optional(),
});

// ─── 型別匯出 / Type Exports ─────────────────────────────────────────────────

export type WorldStateQuery = z.infer<typeof WorldStateQuerySchema>;
export type ResetWorldBody = z.infer<typeof ResetWorldBodySchema>;
export type AssignAdminBody = z.infer<typeof AssignAdminBodySchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;
export type EventsQuery = z.infer<typeof EventsQuerySchema>;
