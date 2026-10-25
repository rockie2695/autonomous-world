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
import { relationsOf, type Relation, type RelationPair } from '@/lib/relations';
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
        {/* 本體：`flex-1 min-h-0` 讓它成為這個 dialog（`flex flex-col` + `max-h`）的
            定高 item，內容比對話框矮時就撐滿、高時自己捲。裡面若有一個「撐滿高度」的
            元件（例如 FactionRanking），它才能拿到確定高度——沒有這一行，那種元件的
            flex-1 會落在一个 auto 高度的父層上而失效。
            The body: `flex-1 min-h-0` makes it a definite item of this dialog (a
            `flex flex-col` with a max height), filling the space when the content is
            short and scrolling it when it is tall. A full-height child (FactionRanking)
            needs that definite height — without it, its `flex-1` would resolve against an
            auto-height parent and do nothing. */}
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-auto ds-gm-scroll">{children}</div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/**
 * 將領的關係清單：朋友與不滿的人
 * A leader's relations: friends and people they are unhappy with
 *
 * 兩種關係的資料形狀完全相同（`{ aId, bId, sinceRound }`），只有讀取方式不同，所以
 * 共用一個清單元件；去重與「兩端都要掃」的邏輯放在 `relationsOf`（純函式、可測），
 * 這裡只負責排版。
 *
 * Both relations have the same data shape (`{ aId, bId, sinceRound }`) and differ only in
 * what they mean, so one list component serves both; the dedupe and the both-endpoints scan
 * live in `relationsOf` (pure and tested) and this only renders.
 *
 * 名稱可點：**點了就開那個人的彈窗**。關係是雙向的，所以從這一側點過去是唯一看得到
 * 「對方怎麼看我」的入口。
 * Names are clickable, opening that leader's popup. Relations are bidirectional, so this
 * is the only way in from one side to see how the other one sees it.
 */
export function LeaderRelations({
  charId,
  friendships,
  discontents,
  nameOf,
  onOpenLeader,
}: {
  charId: string;
  /** 全部友誼列 / every friendship row */
  friendships: ReadonlyArray<RelationPair>;
  /** 全部不滿列，每對兩列 / every discontent row, two per pair */
  discontents: ReadonlyArray<RelationPair>;
  /** id → 人名；查不到時回退為 '—' / id → name, falling back to '—' */
  nameOf: (id: string) => string;
  onOpenLeader: (id: string) => void;
}) {
  const friendList = relationsOf(charId, friendships);
  const discontentList = relationsOf(charId, discontents);

  const section = (
    title: string,
    rows: ReadonlyArray<Relation>,
    empty: string,
    emptyIcon: ReactNode
  ) => (
    <section className="space-y-1.5">
      <h4 className="flex items-center gap-1.5 text-xs text-gray-400">
        {title}
        <span className="font-display text-gray-500">{rows.length}</span>
      </h4>
      {rows.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 italic">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((relation) => (
            <li key={relation.id}>
              <button
                type="button"
                onClick={() => onOpenLeader(relation.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors duration-150 hover:bg-white/5"
              >
                <span className="w-4 shrink-0 text-gray-500">{emptyIcon}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-200">
                  {nameOf(relation.id)}
                </span>
                {/* 成立回合是關係的**年資**——一場三回合的友誼和一場六十回合的
                    不該看起來一樣重 / When it formed is the relationship's *age*: a
                    three-round friendship and a sixty-round one should not look alike */}
                <span className="shrink-0 text-[11px] text-gray-500 tabular-nums">
                  {t('character.sinceRound', { round: relation.sinceRound })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      {section(
        t('character.friends'),
        friendList,
        t('character.noFriends'),
        <Ic className="w-4 h-4">
          <circle cx="9" cy="12" r="3" />
          <circle cx="15" cy="12" r="3" />
        </Ic>
      )}
      {section(
        t('character.discontents'),
        discontentList,
        t('character.noDiscontents'),
        <Ic className="w-4 h-4">
          <path d="M6 8 12 14 18 8" />
        </Ic>
      )}
    </div>
  );
}

/** 勢力排行可排序的欄位 / the sortable columns of the faction ranking */
type FactionSortKey = 'name' | 'status' | 'king' | 'territories' | 'members' | 'troops' | 'gold';

/** 排行表的一列 / one row of the ranking */
interface FactionRow {
  faction: WorldState['factions'][0];
  members: number;
  territories: number;
  troops: number;
  gold: number;
  kingName: string | null;
}

/**
 * 勢力的三段狀態排序值：存歿 0 → 崩解中 1 → 已滅亡 2。
 * 三段而不是兩段，是因為「正在崩解」跟「已經沒了」是不同的事，排序上要能排在兩者之間。
 *
 * Rank the three-state faction status: alive 0 → collapsing 1 → destroyed 2.
 * Three states rather than two, because "collapsing" and "already gone" are different
 * things and must be able to sort between alive and destroyed.
 */
function statusRank(faction: WorldState['factions'][0]): number {
  if (!faction.alive) return 2;
  return faction.collapsing ? 1 : 0;
}

/**
 * 依欄位比較兩列。只回方向無關的順序，升降由呼叫端乘上 ±1。
 * Compare two rows by column; direction-agnostic, the caller applies ±1.
 */
  function compareFactionRows(a: FactionRow, b: FactionRow, key: FactionSortKey): number {
  switch (key) {
  case 'name':
  return a.faction.name.localeCompare(b.faction.name);
  case 'king':
  return (a.kingName ?? '').localeCompare(b.kingName ?? '');
  case 'status':
  return statusRank(a.faction) - statusRank(b.faction);
  default:
  return a[key] - b[key];
  }
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
  /**
   * 表格排序。與將領表同一套規則：表頭即按鈕、點同欄切換升降、換欄位時採用該欄位自己的
   * 預設方向（數字大的先、名字 A→Z），而不是沿用上一欄。
   *
   * Table sorting, same rules as the leader table: the header is the control, clicking the
   * same column toggles, and switching columns picks that column's own default direction
   * rather than inheriting the previous one.
   */
  const [sortKey, setSortKey] = useState<FactionSortKey>('territories');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: FactionSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      // 名字與君主用 A→Z；狀態用存歿優先（ascending 就是 rank 由小到大）；
      // 數字欄位一律大的先 / names and king go A→Z, status puts the living first (ascending
      // is simply the smaller rank first), and every numeric column starts largest-first
      setSortDir(key === 'name' || key === 'king' || key === 'status' ? 'asc' : 'desc');
    }
  };

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
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      // 先看生死（死掉的永遠沉底），再照選定的欄位排 /
      // Alive first, then by the chosen column: a dead faction always sinks
      const alive = Number(b.faction.alive) - Number(a.faction.alive);
      return (alive !== 0 ? alive : compareFactionRows(a, b, sortKey)) * (alive !== 0 ? 1 : dir);
    });

  return (
    // 撐滿面板高度：標題固定，名次表吃滿剩下的高度自己捲。這個元件同時被側欄分頁與
    // 彈窗（FactionRanking 嵌在 DetailModal 裡）使用，兩邊的容器都給定高，所以
    // `h-full` 在兩種場合都成立。
    //
    // Fill the container's height with plain flex-1 (no percentage `h-full`, which is
    // unreliable against a flex layout): the title stays put and the ranking takes the
    // rest and scrolls itself. Both hosts give it a definite height — the side panel's
    // content box and DetailModal's body (see the `flex-1 min-h-0` there), so this works
    // in the tab and inside the modal alike.
    <div className={`${GM_PANEL} flex flex-1 min-h-0 flex-col p-3`}>
      <button
        type="button"
        onClick={() => setShowDetail(true)}
        title={t('general.details')}
        className={`${GM_TITLE} mb-3 w-full shrink-0 flex items-center justify-between group hover:text-cyan-300 transition-colors duration-150`}
      >
        <span>{t('ranking.title')}</span>
        <Ic className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
          <path d="M7 17 17 7M9 7h8v8" />
        </Ic>
      </button>
      <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto ds-gm-scroll">
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
                <span className="font-display text-xs text-gray-400 w-4">{idx + 1}</span>
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: faction.color }}
                />
                <span className="flex-1 text-sm text-gray-200 truncate">{faction.name}</span>
                <span className="text-xs text-gray-400 font-display">{factionPlaces.length}{t('ranking.territories')}</span>
                <span className="text-xs text-gray-400 font-display">{totalTroops}{t('ranking.troops')}</span>
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
              {/* 名次不是可排序欄位，它就是排序的結果 / rank is not sortable: it *is* the result */}
              <th className="py-2 pr-3 font-medium">{t('ranking.rank')}</th>
              {(
                [
                  ['name', 'faction.name', 'left'],
                  // 沿用 general.status，不在 faction 區塊再抄一份 /
                  // Reuses general.status rather than duplicating the string into faction
                  ['status', 'general.status', 'left'],
                  ['king', 'faction.king', 'left'],
                  ['territories', 'faction.territories', 'right'],
                  ['members', 'faction.characters', 'right'],
                  ['troops', 'ranking.troops', 'right'],
                  ['gold', 'ranking.gold', 'right'],
                ] as const
              ).map(([key, labelKey, align]) => {
                const active = sortKey === key;
                return (
                  <th
                    key={key}
                    className={`py-2 pr-3 font-medium ${align === 'right' ? 'text-right' : ''}`}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`inline-flex items-center gap-0.5 hover:text-gray-200 transition-colors duration-150 ${
                        active ? 'text-cyan-300' : ''
                      }`}
                    >
                      {t(labelKey)}
                      {active && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row, idx) => (
              <tr
                key={row.faction.id}
                // 與將領表同一個做法：畫面外的列跳過排版與繪製，捲到才算 /
                // Same idiom as the leader table: rows outside the viewport skip layout and
                // paint until they scroll in
                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_37px]"
              >
                <td className="py-2 pr-3 text-gray-400 font-display">{idx + 1}</td>
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
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{row.territories}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{row.members}</td>
                <td className="py-2 pr-3 text-gray-300 font-display text-right">{row.troops}</td>
                <td className="py-2 text-gray-300 font-display text-right">{row.gold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>
    </div>
  );
}
