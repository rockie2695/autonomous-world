import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t, getLocale, setLocale, LOCALES, DEFAULT_LOCALE, getTranslations } from './index';

describe('i18n (Internationalization)', () => {
  // 模擬 localStorage 與 window / Mock localStorage and window
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    // 設定模擬 / Setup mocks
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    
    Object.defineProperty(global, 'window', {
      value: {
        location: {
          reload: vi.fn(),
        },
      },
      writable: true,
    });
    
    // 模擬 navigator.language / Mock navigator.language
    Object.defineProperty(global, 'navigator', {
      value: {
        language: 'en-US',
      },
      writable: true,
    });
    
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LOCALES', () => {
    it('should contain zh and en', () => {
      expect(LOCALES).toContain('zh');
      expect(LOCALES).toContain('en');
    });

    it('should have zh as first element', () => {
      expect(LOCALES[0]).toBe('zh');
    });
  });

  describe('DEFAULT_LOCALE', () => {
    it('should be zh', () => {
      expect(DEFAULT_LOCALE).toBe('zh');
    });
  });

  describe('getLocale', () => {
    it('should return zh by default', () => {
      expect(getLocale()).toBe('zh');
    });

    it('should return stored locale from localStorage', () => {
      localStorageMock.setItem('autonomous-world-locale', 'en');
      expect(getLocale()).toBe('en');
    });

    it('should return zh for Chinese browser language', () => {
      Object.defineProperty(navigator, 'language', {
        value: 'zh-TW',
        writable: true,
      });
      expect(getLocale()).toBe('zh');
    });

    it('should return en when localStorage has en', () => {
      localStorageMock.setItem('autonomous-world-locale', 'en');
      expect(getLocale()).toBe('en');
    });
  });

  describe('setLocale', () => {
    it('should store locale in localStorage', () => {
      setLocale('en');
      expect(localStorageMock.getItem('autonomous-world-locale')).toBe('en');
    });

    it('should trigger page reload', () => {
      const reloadSpy = vi.spyOn(window.location, 'reload');
      setLocale('en');
      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe('t (translation function)', () => {
    it('should return Chinese translation for general.title', () => {
      localStorageMock.setItem('autonomous-world-locale', 'zh');
      expect(t('general.title')).toBe('自治世界');
    });

    it('should return English translation for general.title', () => {
      localStorageMock.setItem('autonomous-world-locale', 'en');
      expect(t('general.title')).toBe('Autonomous World');
    });

    it('should handle nested keys', () => {
      localStorageMock.setItem('autonomous-world-locale', 'zh');
      expect(t('character.wu')).toBe('武力');
      expect(t('events.battle')).toBe('戰鬥');
    });

    it('should return the key itself if not found', () => {
      localStorageMock.setItem('autonomous-world-locale', 'zh');
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should handle interpolation', () => {
      localStorageMock.setItem('autonomous-world-locale', 'zh');
      const result = t('events.battleDesc', { attacker: '曹操', place: '洛陽' });
      expect(result).toBe('曹操 攻打 洛陽');
    });

    it('should leave unresolved placeholders', () => {
      localStorageMock.setItem('autonomous-world-locale', 'zh');
      const result = t('events.battleDesc', {});
      expect(result).toContain('{attacker}');
      expect(result).toContain('{place}');
    });
  });

  describe('getTranslations', () => {
    it('should return Chinese translations for zh locale', () => {
      const translations = getTranslations('zh');
      expect(translations.general.title).toBe('自治世界');
    });

    it('should return English translations for en locale', () => {
      const translations = getTranslations('en');
      expect(translations.general.title).toBe('Autonomous World');
    });

    it('should have the same structure for both locales', () => {
      const zhTranslations = getTranslations('zh');
      const enTranslations = getTranslations('en');
      
      // 檢查兩者有相同的頂層鍵 / Check that both have the same top-level keys
      expect(Object.keys(zhTranslations).sort()).toEqual(
        Object.keys(enTranslations).sort()
      );
    });
  });
});
