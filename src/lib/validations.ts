// ============================================================================
// Zod 驗證模式 — API 資料驗證 / Zod Validation Schemas — API Data Validation
// ============================================================================
// 使用 Zod 定義 API 路由的請求驗證模式。
// Uses Zod to define request validation schemas for API routes.
// 確保型別安全的 API 輸入驗證。
// Ensures type-safe API input validation.
// ============================================================================

import { z } from 'zod';

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
 */
export const EventsQuerySchema = z.object({
  round: z.coerce
    .number()
    .int()
    .min(0, '回合數必須為非負整數 / Round must be a non-negative integer'),
});

// ─── 型別匯出 / Type Exports ─────────────────────────────────────────────────

export type WorldStateQuery = z.infer<typeof WorldStateQuerySchema>;
export type ResetWorldBody = z.infer<typeof ResetWorldBodySchema>;
export type AssignAdminBody = z.infer<typeof AssignAdminBodySchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;
export type EventsQuery = z.infer<typeof EventsQuerySchema>;
