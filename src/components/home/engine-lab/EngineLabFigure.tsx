// ============================================================================
// 星艦裝配線圖（Server Component）/ The starship assembly line figure (server component)
// ============================================================================
// 圖文合一：「世界如何運轉」那段裡，18 個階段的清單（RoundPipeline）旁邊的那條
// 線。它只講四件真事：
// ① **一個回合 = 一艘船**：回合推進時，線上走完 18 站、裝出一艘星艦，末端裝上
//    引擎並試車；上一個回合完工的船停在末端，下一回合被送出廠房。
// ② **一個工位 = 一個階段**：18 隻電子手就是 ROUND_PHASES 的 18 項，順序相同；
//    工具頭的種類由那個階段的**分組**決定（world/simulation/aftermath/persistence）。
// ③ **里程計滾的是真實回合數**（usePublicWorld 的 world.round，公開端點每 15 秒
//    輪詢）。
// ④ **船的完成度就是走線進度**：工作點走到第 n 站，前 n 批零件才裝上。
// 階段名稱永遠來自 ROUND_PHASES + i18n，不複製。
//
// Text and machine as one: in the "how the world runs" section, this is the line
// beside the 18-phase list (RoundPipeline). It states four true things:
// ① **one round = one ship**: a round advance walks the 18 stations, builds one
//    starship, fits its engine and test-fires it; the ship the previous round
//    finished waits at the end and is taken away by the next one;
// ② **one station = one phase**: the 18 electronic hands *are* ROUND_PHASES's 18
//    entries in the same order, and a tool head's kind comes from that phase's
//    **group** (world / simulation / aftermath / persistence);
// ③ **the odometer rolls the real round number** (usePublicWorld's world.round,
//    a public endpoint polled every 15 s);
// ④ **the ship's completeness is this pass's progress**: when the work point
//    reaches station n, batches 1..n are on.
// Phase names always come from ROUND_PHASES + i18n, never a copy.
// ============================================================================

import { Plate } from '@/components/iso/react/draw';
import { createTranslator, type Locale } from '@/lib/i18n';
import '@/components/iso/iso.css';
import { EngineLabLive } from './live';
import './engine-lab.css';

// locale 由呼叫端傳入（首頁是 server component，早就解析好了）。**不要**在這裡
// 用環境的 t()：server render 時它拿不到 localStorage / navigator，會落到預設語
// 系，於是英文版首屏是英文、注水後變中文——React 直接判定 hydration 失敗並重建
// 整棵樹。其他首頁元件（LiveStats / LiveWorld / SagaConstellation…）也都是收
// locale 這個 prop，這支只是漏了。
// The locale arrives from the caller (the homepage is a server component and has
// resolved it already). Do **not** reach for the ambient t() here: during SSR it
// cannot see localStorage / navigator and falls back to the default locale, so an
// English page renders English and then hydrates to Chinese — React declares a
// hydration failure and rebuilds the whole tree. Every other homepage component
// (LiveStats / LiveWorld / SagaConstellation…) already takes this prop; this one
// had simply been missed.
export function EngineLabFigure({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);

  return (
    // kit 慣例：所有 --anatomy-* 代幣掛在 class="iso" 的 wrapper 上（含卡片與圖例）
    // Kit convention: every --anatomy-* token hangs on a class="iso" wrapper
    // (card corners and legend included)
    <div className="iso">
      <Plate
        fig={t('home.engineLab.fig')}
        title={t('home.engineLab.title')}
        hint={t('home.engineLab.hint')}
        readout={t('home.engineLab.readoutIdle')}
        keys={[
          { mark: 'lit', label: t('home.engineLab.keySelected') },
          { mark: 'edge', label: t('home.engineLab.keyFlame') },
        ]}
        caption={t('home.engineLab.caption')}
      >
        <EngineLabLive locale={locale} label={t('home.engineLab.aria')} />
      </Plate>
    </div>
  );
}
