'use client';

// ============================================================================
// 首屏回合標籤 / Hero Round Tag
// ============================================================================
// 首屏最有說服力的一行字：不是「數百個 AI 角色」這種形容，而是「現在是第幾回合」
// ——而且它會跟著世界一起跳。載入完成前不渲染任何數字，不拿假值佔位。
// The most convincing line on the hero is not "hundreds of AI characters" but
// "which round are we on" — and it moves with the world. Nothing renders until
// the real value arrives; no placeholder number ever stands in for it.
// ============================================================================

import { usePublicWorld } from './usePublicWorld';
import { createTranslator, type Locale } from '@/lib/i18n';

type LiveRoundProps = {
  locale: Locale;
};

export default function LiveRound({ locale }: LiveRoundProps) {
  const t = createTranslator(locale);
  const { payload } = usePublicWorld();

  if (!payload) return null;

  return (
    <>
      <span
        className="relative inline-block size-2 shrink-0 rounded-full bg-ds-cyan after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-ds-cyan after:content-['']"
        aria-hidden="true"
      />
      <span>{t('home.hero.roundTag', { round: payload.world.round })}</span>
    </>
  );
}
