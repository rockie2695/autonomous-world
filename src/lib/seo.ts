// ─── 結構化資料 / Structured data (JSON-LD) ─────────────────────────────────
// 一個單純的物件建構器：讓 schema 的形狀有單一來源，首頁只負責注入。
// A plain object builder: one home for the schema shape, the page only injects.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export function webApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Autonomous World',
    alternateName: '自治世界',
    url: SITE_URL,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    description:
      'An infinitely running autonomous simulation. No victory conditions, only eternal evolution.',
    inLanguage: ['zh-TW', 'en'],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}
