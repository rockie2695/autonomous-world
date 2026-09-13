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
    // 重新載入以在所有元件套用語言變更
    // Reload to apply locale changes across all components
    window.location.reload();
  }
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
  const dict = translations[locale];

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
