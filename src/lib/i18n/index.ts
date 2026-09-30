// ============================================================================
// i18n — 國際化系統 / Internationalization System
// ============================================================================
// 簡單的語言偵測 + 翻譯系統。
// Simple locale detection + translation system.
// 偵測瀏覽器語言並提供型別安全的翻譯。
// Detects browser language and provides typed translations.
//
// 使用方式 / Usage:
//   import { t, getLocale } from '@/lib/i18n';
//   const text = t('general.title');  // "自治世界" or "Autonomous World"
//
// 系統在首次載入時自動偵測瀏覽器語言。
// The system auto-detects browser language on first load.
// 使用者可透過語言切換手動切換。
// Users can manually switch via the language toggle.
// ============================================================================

import { zh, type ZhLocale } from './zh';
import { en, type EnLocale } from './en';

// ─── 支援的語言 / Supported Locales ───────────────────────────────────────

/** 所有支援的語言代碼 / All supported locale codes */
export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** 預設語言（繁體中文）/ Default locale (Traditional Chinese) */
export const DEFAULT_LOCALE: Locale = 'zh';

// ─── 翻譯對照表 / Translation Maps ────────────────────────────────────────

/**
 * 翻譯字典型別。
 * Translation dictionary type.
 * zh 和 en 必須有相同的結構，但字串值可以不同。
 * Both zh and en must have the same structure, but string values can differ.
 */
type TranslationDict = ZhLocale | EnLocale;

/** 原始翻譯資料（按語言）/ Raw translation data by locale */
const translations: Record<Locale, TranslationDict> = { zh, en };

// ─── 語言偵測 / Locale Detection ──────────────────────────────────────────

const LOCALE_KEY = 'autonomous-world-locale';

/**
 * 語系 cookie 名稱。與 localStorage 同一個字串，讓 server component
 * 也能讀到訪客選的語言（localStorage 對 server 不可見）。
 * Locale cookie name — mirrors the localStorage key so server components
 * can read the visitor's choice (localStorage is invisible to the server).
 */
const LOCALE_COOKIE = 'autonomous-world-locale';

/** cookie 存活時間（一年）/ Cookie lifetime (one year) */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 從 localStorage 取得當前語言，或從瀏覽器偵測。
 * Get the current locale from localStorage, or detect from browser.
 * 中文回傳 'zh'，其他語言回傳 'en'。
 * Returns 'zh' for Chinese, 'en' for everything else.
 */
export function getLocale(): Locale {
  // 先檢查 localStorage（使用者可能已手動切換）
  // Check localStorage first (user may have manually switched)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }

    // localStorage 沒有時退回 cookie（由 setLocale 同步寫入）
    // Fall back to the cookie (written by setLocale alongside localStorage)
    const fromCookie = readLocaleFromCookie();
    if (fromCookie) {
      return fromCookie;
    }

    // 從瀏覽器語言偵測 / Detect from browser language
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('zh')) {
      return 'zh';
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * 設定當前語言並持久化到 localStorage。
 * Set the current locale and persist to localStorage.
 * 觸發頁面重新載入以套用變更。
 * Triggers a page reload to apply changes.
 */
export function setLocale(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCALE_KEY, locale);
    // 同步寫入 cookie，讓 server component 下一次渲染讀得到同一語言
    // Mirror into the cookie so the next server render sees the same locale
    writeLocaleCookie(locale);
    // 重新載入以在所有元件套用語言變更
    // Reload to apply locale changes across all components
    window.location.reload();
  }
}

// ─── 語系 cookie / Locale Cookie ───────────────────────────────────────────

/**
 * 從 cookie 讀取語言。僅在瀏覽器可用；server 端呼叫時回傳 null，
 * server component 請改用 `createTranslator(cookieLocale)`。
 * Read the locale from the cookie. Browser only — returns null on the
 * server, where a server component should use `createTranslator(cookieLocale)`.
 */
export function readLocaleFromCookie(): Locale | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const prefix = `${LOCALE_COOKIE}=`;
  for (const part of document.cookie.split(';')) {
    const entry = part.trim();
    if (!entry.startsWith(prefix)) continue;
    const value = decodeURIComponent(entry.slice(prefix.length));
    if (LOCALES.includes(value as Locale)) {
      return value as Locale;
    }
  }
  return null;
}

/**
 * 把語言寫入 cookie（供 server 讀取）。path=/ 讓所有路由共用同一份。
 * Write the locale into a cookie for the server to read. path=/ shares it
 * across every route.
 */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(
    locale
  )}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

// ─── 翻譯函數 / Translation Function ──────────────────────────────────────

/**
 * 透過點分隔的鍵路徑取得翻譯字串。
 * Get a translated string by dot-separated key path.
 *
 * @example
 * t('general.title')          // "自治世界" / "Autonomous World"
 * t('character.wu')           // // "武力" / "Martial"
 * t('events.battleDesc')      // "{attacker} 攻打 {place}"
 *
 * 支援 {placeholder} 語法的插值：
 * Supports interpolation with {placeholder} syntax:
 * t('events.battleDesc', { attacker: '張飛', place: '洛陽' })
 * // "張飛 攻打 洛陽"
 */
export function t(
  key: string,
  params?: Record<string, string | number>
): string {
  const locale = getLocale();
  return translateIn(translations[locale], key, locale, params);
}

// ─── 綁定語言的翻譯器 / Locale-Bound Translator ───────────────────────────

/**
 * 建立一個綁定特定語言的翻譯函式，簽章與 `t()` 相同。
 * Create a translation function bound to an explicit locale, with the same
 * signature as `t()`.
 *
 * server component 必須用這個：`t()` 依賴 `getLocale()`，在 server 端
 * 永遠回傳 DEFAULT_LOCALE，無法反映訪客的選擇。
 * Server components must use this: `t()` depends on `getLocale()`, which
 * always returns DEFAULT_LOCALE on the server and cannot see the visitor's
 * choice.
 *
 * @example
 * // app/page.tsx
 * const locale = (await cookies()).get('autonomous-world-locale')?.value === 'en' ? 'en' : 'zh';
 * const t = createTranslator(locale);
 * t('home.hero.eyebrow');
 */
export function createTranslator(
  locale: Locale
): (key: string, params?: Record<string, string | number>) => string {
  return (key, params) => translateIn(translations[locale], key, locale, params);
}

/**
 * 查表 + 插值的共用核心。`t()` 與 `createTranslator()` 都走這裡，
 * 確保兩條路徑的行為完全一致。
 * Shared lookup + interpolation core. Both `t()` and `createTranslator()`
 * route through it so the two paths behave identically.
 */
function translateIn(
  dict: TranslationDict,
  key: string,
  locale: Locale,
  params?: Record<string, string | number>
): string {
  // 導覽點路徑：'events.battleDesc' → dict.events.battleDesc
  // Navigate dot path: 'events.battleDesc' → dict.events.battleDesc
  const keys = key.split('.');
  let value: unknown = dict;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      // 找不到鍵 — 回傳鍵本身作為後備
      // Key not found — return the key itself as fallback
      console.warn(`[i18n] 找不到鍵: ${key} (語言: ${locale}) / Missing key: ${key} (locale: ${locale})`);
      return key;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`[i18n] 鍵不是字串: ${key} / Key is not a string: ${key}`);
    return key;
  }

  // 套用插值：將 {placeholder} 替換為 params
  // Apply interpolation: replace {placeholder} with params
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, placeholder: string) => {
      return params[placeholder] !== undefined
        ? String(params[placeholder])
        : `{${placeholder}}`;
    });
  }

  return value;
}

// ─── 型別匯出 / Type Exports ──────────────────────────────────────────────

/** 型別安全的翻譯鍵路徑 / Type-safe key paths for translations */
export type TranslationKey = keyof ZhLocale;

/**
 * 取得特定語言的完整翻譯物件。
 * Get the full translation object for a locale.
 * 對需要完整字典的元件庫很有用。
 * Useful for component libraries that need the entire dict.
 */
export function getTranslations(locale: Locale): TranslationDict {
  return translations[locale];
}
