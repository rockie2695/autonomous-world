'use client';

// ============================================================================
// 將領詳情視窗與勢力排行 / Leader detail modal + faction ranking
// ============================================================================
// 這兩個元件必須住在一起：視窗裡會嵌入排行，而雷達圖的悬浮預覽又會開啟視窗。
// 若各自留在 page.tsx，統計圖表就要反向 import 頁面本體，形成循環依賴。
//
// These two have to live together: the modal embeds the ranking, and the radar's
// hover preview opens the modal. Left inside page.tsx, the charts module would
// have to import the page back, which is an import cycle.
// ============================================================================

import { useEffect, useState, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { t } from '@/lib/i18n';
import { Ic } from './icons';
import type { WorldState } from './types';
import { GM_BTN, GM_MODAL, GM_PANEL, GM_TITLE } from './styles';
/**
 * 詳細資料彈窗 / Detail info modal
 * Portal 到 body：側欄卡片有 backdrop-filter，會使子層 fixed 定位失效 /
 * Portaled to body: sidebar cards use backdrop-filter, which breaks
 * fixed positioning for descendant elements
 */
export function DetailModal({
  open,
  onClose,
  onBack,
  canGoBack,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** 返回上一個彈窗（彈窗堆疊 > 1 時才顯示）/ Go back to the previous popup (shown only when the stack is deeper than one) */
  onBack?: () => void;
  canGoBack?: boolean;
  title: string;
  children: ReactNode;
}) {
  // open 只會在使用者點擊後於客戶端變 true（SSR 時恒為 false），
  // 因此不需 mounted effect，也不會在伺服器端存取 document /
  // open only flips true after a user click on the client (always false
  // during SSR), so no mounted effect is needed and document is never
  // touched on the server
  // 鍵盤關閉路徑：Esc 收合彈窗（對話框標準行為）/
  // Keyboard dismissal: Escape closes the dialog (standard dialog behaviour)
  // 開啟時記住觸發元素、關閉後歸還焦點；onClose 走 ref，
  // 避免父層輪詢重繪時重掛監聽並把焦點從對話框搶走 /
  // Remember the trigger on open and return focus on close; read onClose
  // through a ref so parent re-renders don't rebind and steal focus
  const onCloseRef = useRef(onClose);
  // 最新 onClose 只在 effect 中同步（不可在 render 期間寫 ref，否則會觸發
  // react-hooks/refs 錯誤，且 render 期間的寫入在並行模式下不安全）。
  // 此 effect 宣告在鍵盤 effect 之前，因此每次 commit 後 ref 都是最新值 /
  // Sync the latest onClose in an effect, never during render (the render-time
  // write trips react-hooks/refs and is unsafe under concurrent rendering).
  // Declared before the keydown effect so the ref is fresh after every commit.
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full max-w-3xl max-h-[80vh] overflow-hidden ${GM_MODAL} shadow-2xl flex flex-col`}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          {canGoBack && onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t('general.back')}
              title={t('general.back')}
              className={`${GM_BTN} w-7 h-7 shrink-0`}
            >
              <Ic className="w-4 h-4"><path d="m15 6-6 6 6 6" /></Ic>
            </button>
          )}
          <h3 className={`${GM_TITLE} text-gray-200! flex-1`}>
            {title}
          </h3>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className={`${GM_BTN} w-7 h-7`}
            aria-label="關閉"
          >
            <Ic className="w-4 h-4"><path d="m6 6 12 12M18 6 6 18" /></Ic>
          </button>
        </div>
        <div className="p-4 overflow-auto ds-gm-scroll">{children}</div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

export function FactionRanking({
  factions,
  characters,
  places,
}: {
  factions: WorldState['factions'];
  characters: WorldState['characters'];
  places: WorldState['places'];
}) {
  const [showDetail, setShowDetail] = useState(false);

  // 彈窗用完整資料：含全部勢力（不只前 10 名）/
  // Full data for the modal: all factions (not just top 10)
  const detailRows = factions
    .map((faction) => {
      const factionChars = characters.filter(
        (c) => c.factionId === faction.id && c.alive
      );
      const factionPlaces = places.filter((p) => p.factionId === faction.id);
      const king = factionChars.find((c) => c.isKing);
      return {
        faction,
        members: factionChars.length,
        territories: factionPlaces.length,
        troops: factionChars.reduce((sum, c) => sum + c.troops, 0),
        gold: factionChars.reduce((sum, c) => sum + c.gold, 0),
        kingName: king?.name ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.faction.alive) - Number(a.faction.alive) ||
        b.territories - a.territories
    );

  return (
    <div className={`${GM_PANEL} p-3`}>
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        title={t('general.details')}
        className={`${GM_TITLE} mb-3 w-full flex items-center justify-between group hover:text-cyan-300 transition-colors duration-150`}
      >
        <span>{t('ranking.title')}</span>
        <Ic className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
          <path d="M7 17 17 7M9 7h8v8" />
        </Ic>
      </button>
      <div className="space-y-1.5">
        {factions.filter((f) => f.alive).length === 0 && (
          <p className="text-gray-400 text-xs">{t('game.noData')}</p>
        )}
        {factions
          .filter((f) => f.alive)
          .slice(0, 10)
          .map((faction, idx) => {
            const factionChars = characters.filter(
              (c) => c.factionId === faction.id && c.alive
            );
            const factionPlaces = places.filter(
              (p) => p.factionId === faction.id
            );
            const totalTroops = factionChars.reduce(
              (sum, c) => sum + c.troops,
              0
            );
            const totalGold = factionChars.reduce(
              (sum, c) => sum + c.gold,
              0
            );

            return (
              <div key={faction.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors duration-150">
                <span className="font-orbitron text-xs text-gray-400 w-4">{idx + 1}</span>
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="flex-1 text-sm text-gray-200 truncate">{faction.name}</span>
                <span className="text-xs text-gray-400 font-orbitron">{factionPlaces.length}{t('ranking.territories')}</span>
                <span className="text-xs text-gray-400 font-orbitron">{totalTroops}{t('ranking.troops')}</span>
              </div>
            );
          })}
      </div>

      <DetailModal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={t('ranking.title')}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-400 text-left border-b border-white/10">
              <th className="py-2 pr-3 font-medium">{t('ranking.rank')}</th>
              <th className="py-2 pr-3 font-medium">{t('faction.name')}</th>
              <th className="py-2 pr-3 font-medium">{t('general.status')}</th>
              <th className="py-2 pr-3 font-medium">{t('faction.king')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('faction.territories')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('faction.characters')}</th>
              <th className="py-2 pr-3 font-medium text-right">{t('ranking.troops')}</th>
              <th className="py-2 font-medium text-right">{t('ranking.gold')}</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row, idx) => (
              <tr
                key={row.faction.id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-150"
              >
                <td className="py-2 pr-3 text-gray-400 font-orbitron">{idx + 1}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: row.faction.color }}
                    />
                    <span className="text-gray-200">{row.faction.name}</span>
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={
                      row.faction.alive && !row.faction.collapsing
                        ? 'text-emerald-400'
                        : row.faction.collapsing
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }
                  >
                    {row.faction.alive
                      ? row.faction.collapsing
                        ? t('faction.collapsing')
                        : t('faction.alive')
                      : t('faction.collapsed')}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-300">
                  {row.kingName ?? t('faction.noKing')}
                </td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{row.territories}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{row.members}</td>
                <td className="py-2 pr-3 text-gray-300 font-orbitron text-right">{row.troops}</td>
                <td className="py-2 text-gray-300 font-orbitron text-right">{row.gold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>
    </div>
  );
}
