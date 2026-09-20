// ============================================================================
// API 請求輔助 — 統一處理 401 未授權 / API Fetch Helper — Unified 401 Handling
// ============================================================================
// 包裝 fetch，當 API 回傳 401 Unauthorized 時自動導向首頁。
// Wraps fetch and automatically routes to the home page when an API
// returns 401 Unauthorized (e.g. missing or expired session).
// 所有需要認證的 API 請求都應使用 apiFetch 而非原生 fetch。
// All authenticated API requests should use apiFetch instead of raw fetch.
// ============================================================================

/**
 * 401 未授權錯誤。 / Unauthorized error.
 * 當 API 回傳 401 時拋出，呼叫端不應將回應內容當作資料處理。
 * Thrown when the API returns 401; callers must not treat the body as data.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super('未登入，正在返回首頁 / Unauthorized, redirecting to home');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 包裝 fetch 的 API 請求函數。
 * API fetch wrapper around the global fetch.
 * 當回應狀態為 401 時，導向首頁並拋出 UnauthorizedError。
 * On a 401 response, routes to the home page and throws UnauthorizedError.
 */
export async function apiFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    // 401 未授權 — 導向首頁 / Unauthorized — route to home page
    // 使用 replace() 取代歷史紀錄，返回鍵不會回到 401 的頁面。
    // Use replace() so the history entry is replaced — Back won't return to the 401'd page.
    // 已在首頁時不重複導向，避免循環。 / Skip when already on home to avoid loops.
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.replace('/');
    }
    throw new UnauthorizedError();
  }

  return res;
}
