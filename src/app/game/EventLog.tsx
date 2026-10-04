'use client';

// ============================================================================
// 事件日誌 / Event Log
// ============================================================================
// 依回合抓取事件，並提供三種篩選：勢力下拉、事件分類（可複選）、資訊種類
// （人物 / 地點 / 其他）。分類對應 EVENT_CATEGORY，資訊種類則看事件 data 裡
// 帶的是角色還是地點，決定名字要不要做成可點的按鈕。
//
// Fetches a round's events and offers three filters: a faction dropdown, a
// multi-select of event categories, and info-kind toggles (people / place /
// other). Categories come from EVENT_CATEGORY; the info kind is derived from
// whether the event's data carries a character or a place, which is what decides
// if a name becomes a clickable button.
// ============================================================================

import { useState, useMemo, Fragment, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { t } from '@/lib/i18n';
import { CONFIG } from '@/lib/gameConfig';
import { apiFetch } from '@/lib/api';
import { EventGlyph } from './icons';
import type { GameEvent, WorldState } from './types';
import { GM_BTN, GM_PANEL, GM_SKEL, GM_TITLE } from './styles';
/**
 * 把翻譯樣板中的 `{key}` 依序換成節點，其餘文字原樣輸出；由呼叫端決定每個
 * 位置要放可點擊按鈕還是純文字。事件日誌的人名／地名能點就是靠這個。
 * Fill a translation template's `{key}` slots with nodes and pass the remaining
 * text through, letting the caller decide whether each slot becomes a clickable
 * button or plain text — that is what makes names in the event log clickable.
 */
export function fillTemplate(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\{(\w+)\}/g;
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    if (match.index > last) {
      nodes.push(
        <Fragment key={`t${index++}`}>{template.slice(last, match.index)}</Fragment>
      );
    }
    const key = match[1];
    nodes.push(
      <Fragment key={`p${index++}`}>{key in parts ? parts[key] : match[0]}</Fragment>
    );
    last = match.index + match[0].length;
  }
  if (last < template.length) {
    nodes.push(<Fragment key="tail">{template.slice(last)}</Fragment>);
  }
  return nodes;
}

/** 事件日誌裡可點擊的人名 /地名 / Clickable name styling inside the event log */
const GM_EVENT_LINK =
  'text-cyan-300 hover:text-cyan-100 hover:underline underline-offset-2 transition-colors';

/** 事件日誌的篩選 / Event log filters ────────────────────────────────────────── */

/** 事件類別 / Event categories */
type EventCategory = 'battle' | 'character' | 'economy' | 'faction' | 'admin' | 'place';

/**
 * 事件類型 → 類別。篩選器直接吃這張表，所以新增事件類型時只要在這裡補一行，
 * 不會忘記把事件放進某一類。
 * Event type to category. The filter reads this table directly, so a new event
 * type only has to be added here — there is no way to forget to file it somewhere.
 *
 * 判斷依據是語意，不是畫面：戰死與逃脫都是戰鬥的結果，地方易主也是。 /
 * Assigned by meaning rather than by appearance: deaths and escapes are outcomes
 * of battle, and so is a place changing hands.
 */
const EVENT_CATEGORY: Record<string, EventCategory> = {
  BATTLE_DEATH: 'battle',
  ESCAPE_SUCCESS: 'battle',
  PLACE_CAPTURED: 'battle',
  CHARACTER_SPAWNED: 'character',
  CHARACTER_MOVED: 'character',
  DEATH: 'character',
  DEFECTION: 'character',
  BUILDING_UPGRADE: 'economy',
  FACTION_COLLAPSE: 'faction',
  FACTION_ELIMINATED: 'faction',
  ADMIN_ASSIGNED: 'admin',
  ADMIN_REMOVED: 'admin',
  AMBITION_RECOVERED: 'admin',
  PLACE_CREATED: 'place',
};

/** 類別顯示順序 / Display order for the categories */
const EVENT_CATEGORIES: readonly EventCategory[] = [
  'battle',
  'character',
  'economy',
  'faction',
  'admin',
  'place',
];

/** 事件帶的是「人」「地」還是其他資訊 / Which kind of information an event carries */
type EventInfo = 'people' | 'place' | 'other';

/**
 * 判斷一個事件屬於哪一類資訊：`data` 裡有人名就是人物、有地名就是地點，
 * 兩者都沒有就是其他。
 * Decide which kind of information an event carries: a leader name makes it a
 * people event, a place name makes it a place event, neither makes it other.
 *
 * 人物優先於地點：戰鬥事件兩者都有，但它講的是人，所以歸人物。這讓三個開關真正
 * 互斥，而不是地點開關永遠被人物事件塞滿。
 * People wins over place: a battle event has both, but it is about a person. That
 * keeps the three toggles genuinely disjoint instead of the place toggle being
 * permanently crowded with battles.
 */
function eventInfoOf(data: Record<string, unknown>): EventInfo {
  if (typeof data.charId === 'string' || typeof data.charName === 'string') return 'people';
  if (typeof data.placeId === 'string' || typeof data.placeName === 'string') return 'place';
  return 'other';
}

export function EventLog({
  worldId,
  factions,
  characters,
  places,
  onFocusPlace,
  onOpenLeaderDetail,
}: {
  worldId: string;
  /** 用來做勢力篩選與下拉選單 / Used for the faction filter and its dropdown */
  factions: WorldState['factions'];
  /** 用 `charId` 解析事件所屬勢力 / Resolves an event's faction via charId */
  characters: WorldState['characters'];
  /** 用 `placeId` 解析事件所屬勢力 / Resolves an event's faction via placeId */
  places: WorldState['places'];
  /** 點地名 → 鏡頭聚焦到該地點 / Clicking a place name focuses the camera on it */
  onFocusPlace: (placeId: string) => void;
  /** 點人名 → 開啟該將領的單一詳情 / Clicking a leader name opens their detail */
  onOpenLeaderDetail: (key: string) => void;
}) {
  const { data, isLoading } = useQuery<{ events: GameEvent[] }>({
    // 不帶 round → 回傳所有回合的事件 / Omit round → events for ALL rounds
    queryKey: ['events'],
    queryFn: async () => {
      const res = await apiFetch('/api/world/events');
      if (!res.ok) return { events: [] };
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const events = data?.events ?? [];

  // ── 篩選狀態 ──/ Filter state
  const [factionFilter, setFactionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<Set<EventCategory>>(
    () => new Set(EVENT_CATEGORIES)
  );
  const [infoFilter, setInfoFilter] = useState<Record<EventInfo, boolean>>({
    people: true,
    place: true,
    other: true,
  });

  // 篩選鍵：把三組篩選壓成一個字串，讓分頁狀態可以靠「相等」判斷是否過期。
  // 類別是 Set，順序不固定，所以要先排序，否則同樣的篩選會產生不同的鍵、
  // 分頁會被無意義地重置。
  // The filter key collapses all three filters into one string so the paging state
  // can tell whether it has gone stale by comparison alone. The category set has no
  // stable order, so it is sorted first — otherwise identical filters would produce
  // different keys and reset the page for no reason.
  const filterKey = `${factionFilter}|${[...categoryFilter].sort().join(',')}|${
    infoFilter.people ? 1 : 0
  }${infoFilter.place ? 1 : 0}${infoFilter.other ? 1 : 0}`;

  // 分批顯示：回合數增長後事件可能上萬筆，避免一次掛載全部 DOM。
  // 分頁狀態**連同當時的篩選鍵一起存**：篩選一變，鍵就不再相等，顯示筆數自動
  // 回到第一頁。這比「在 effect 裡 setState 歸零」好——後者會觸發 lint 的
  // cascading-render 規則，而且還要多一個 effect。
  // Batched rendering: events can reach tens of thousands as rounds grow, so only
  // the first page is mounted. The page is stored *together with the filter key it
  // was set under*: change a filter and the key stops matching, so the shown count
  // falls back to the first page on its own. That is better than resetting in an
  // effect, which trips the cascading-render lint rule and needs an extra effect.
  // CONFIG 是 `as const`，所以 EVENT_LOG_PAGE_SIZE 的型別會被鎖成字面值 60；
  // 不標註泛型 state 就只接受 60，之後「載入更多」加值會編譯不過。
  // CONFIG is `as const`, which pins EVENT_LOG_PAGE_SIZE to the literal 60, so the
  // state must be annotated or "load more" cannot add to it.
  const [page, setPage] = useState<{ key: string; count: number }>({
    key: '',
    count: CONFIG.EVENT_LOG_PAGE_SIZE,
  });
  const visibleCount =
    page.key === filterKey ? page.count : CONFIG.EVENT_LOG_PAGE_SIZE;

  // 勢力查找表：事件本身不記勢力，只能靠它的角色或地方反查。角色優先，理由同
  // eventInfoOf —— 戰鬥事件的兩邊都有，但人名才是它的主角。
  // A faction lookup, because events do not record one: it has to be resolved
  // from the character or the place. Character first, for the same reason as
  // eventInfoOf — a battle has both, but the person is the subject.
  const factionOfEvent = useMemo(() => {
    const byCharacter = new Map<string, string | null>();
    for (const character of characters) byCharacter.set(character.id, character.factionId);
    const byPlace = new Map<string, string | null>();
    for (const place of places) byPlace.set(place.id, place.factionId);
    return (data: Record<string, unknown>): string | null => {
      if (typeof data.charId === 'string') return byCharacter.get(data.charId) ?? null;
      if (typeof data.placeId === 'string') return byPlace.get(data.placeId) ?? null;
      return null;
    };
  }, [characters, places]);

  const filtered = useMemo(
    () =>
      events.filter((event) => {
        if (!categoryFilter.has(EVENT_CATEGORY[event.type] ?? 'place')) return false;
        if (!infoFilter[eventInfoOf(event.data)]) return false;
        if (factionFilter === 'all') return true;
        return factionOfEvent(event.data) === factionFilter;
      }),
    // factionOfEvent 是 useMemo 產生的新參考，每回合資料變動才會換 /
    // factionOfEvent is a fresh reference only when its inputs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, categoryFilter, infoFilter, factionFilter, factionOfEvent]
  );

  const filtersActive =
    factionFilter !== 'all' ||
    categoryFilter.size !== EVENT_CATEGORIES.length ||
    !infoFilter.people ||
    !infoFilter.place ||
    !infoFilter.other;

  function formatEvent(event: GameEvent): ReactNode {
    const p = event.data;
    // 野心增減附註（-1 / +1），無資料時為空字串 /
    // Ambition delta suffix (-1 / +1); empty when the event carries no delta
    const ambitionNote = (delta: unknown): string =>
      typeof delta === 'number' && delta !== 0
        ? t('events.ambitionDelta').replace('{delta}', String(delta))
        : '';
    // 人名一律可點（事件只存 charName，沒有 charId，所以由上層用名字解析）；
    // 地名帶 placeId，可直接聚焦地圖。缺 id 時退回純文字——寧可不可點也不要壞掉 /
    // Leader names are always clickable (events only store charName, so the page
    // resolves by name); places carry placeId and focus the map directly. Without
    // an id we fall back to plain text — inert beats broken.
    const leaderNode = (id: unknown, name: unknown): ReactNode => {
      const label = typeof name === 'string' ? name : '?';
      // 有 id 就用 id（名字可能被沿用），舊事件由 API 讀時回填 /
      // Prefer the id — names get reused. The API backfills it for legacy rows.
      const key = typeof id === 'string' && id ? id : label;
      return (
        <button type="button" onClick={() => onOpenLeaderDetail(key)} className={GM_EVENT_LINK}>
          {label}
        </button>
      );
    };
    const placeNode = (id: unknown, name: unknown): ReactNode => {
      const label = typeof name === 'string' ? name : '?';
      if (typeof id !== 'string') return label;
      return (
        <button type="button" onClick={() => onFocusPlace(id)} className={GM_EVENT_LINK}>
          {label}
        </button>
      );
    };
    const text = (v: unknown): string => (typeof v === 'string' ? v : '?');

    switch (event.type) {
      case 'PLACE_CREATED':
        return fillTemplate(t('events.newPlaceDesc'), {
          place: placeNode(p.placeId, p.placeName),
        });
      case 'CHARACTER_SPAWNED':
        return fillTemplate(t('events.spawnDesc'), { character: leaderNode(p.charId, p.charName) });
      case 'CHARACTER_MOVED':
        return fillTemplate(t('events.moveDesc'), {
          character: leaderNode(p.charId, p.charName),
          from: placeNode(p.fromPlaceId, p.fromPlaceName),
          to: placeNode(p.toPlaceId, p.toPlaceName),
        });
      case 'DEATH':
        return fillTemplate(t('events.deathDesc'), { character: leaderNode(p.charId, p.charName) });
      case 'BATTLE_DEATH':
        return fillTemplate(t('events.battleDeathDesc'), {
          character: leaderNode(p.charId, p.charName),
          place: placeNode(p.placeId, p.placeName),
        });
      case 'ESCAPE_SUCCESS':
        return fillTemplate(t('events.escapeSuccessDesc'), {
          character: leaderNode(p.charId, p.charName),
          place: placeNode(p.placeId, p.placeName),
        });
      case 'DEFECTION':
        return fillTemplate(t('events.defectionDesc'), { character: leaderNode(p.charId, p.charName) });
      case 'FACTION_COLLAPSE':
        return fillTemplate(t('events.collapseDesc'), { faction: text(p.factionName) });
      case 'FACTION_ELIMINATED':
        return fillTemplate(t('events.eliminationDesc'), { faction: text(p.factionName) });
      case 'BUILDING_UPGRADE':
        return fillTemplate(t('events.buildingDesc'), {
          place: placeNode(p.placeId, p.placeName),
          building: t(`map.${p.building as string}`),
          level: String(p.newLevel),
        });
      case 'ADMIN_ASSIGNED':
        return (
          <>
            {fillTemplate(t('events.adminAssignedDesc'), {
              character: leaderNode(p.charId, p.charName),
              place: placeNode(p.placeId, p.placeName),
            })}
            {ambitionNote(p.ambitionDelta)}
          </>
        );
      case 'ADMIN_REMOVED':
        return (
          <>
            {fillTemplate(t('events.adminRemovedDesc'), {
              character: leaderNode(p.charId, p.charName),
              place: placeNode(p.placeId, p.placeName),
              newAdmin: text(p.newAdminName),
            })}
            {ambitionNote(p.ambitionDelta)}
          </>
        );
      case 'AMBITION_RECOVERED':
        return (
          <>
            {fillTemplate(t('events.ambitionRecoveredDesc'), {
              character: leaderNode(p.charId, p.charName),
              place: placeNode(p.placeId, p.placeName),
            })}
            {ambitionNote(p.ambitionDelta)}
          </>
        );
      case 'PLACE_CAPTURED':
        return fillTemplate(t('events.placeCaptureDesc'), {
          character: leaderNode(p.charId, p.charName),
          place: placeNode(p.placeId, p.placeName),
        });
      default:
        return event.type;
    }
  }

  return (
    <div className={`${GM_PANEL} p-3`}>
      <h3 className={`${GM_TITLE} mb-3 flex items-center justify-between`}>
        <span>{t('events.title')}</span>
        <span className="text-cyan-300/85 text-xs tracking-widest font-normal">
          {/* 有篩選時顯示篩選後的數量，否則顯示總數 —— 數字要跟下面看到的列一致 /
              Show the filtered count while filters are on, so the number matches
              the rows actually listed below */}
          {filtersActive ? filtered.length : events.length} {t('events.tab')}
        </span>
      </h3>
      {/* ── 篩選列 / Filter row ──
          三組控制：勢力（下拉）、類別（多選 chip）、資訊種類（三個開關）。全部
          都是「顯示什麼」的表達方式，不改變事件本身，所以可以任意組合。
          Three controls: faction (dropdown), category (multi-select chips) and
          information kind (three toggles). All of them express "what to show"
          without changing the events, so they compose freely. */}
      <div className="mb-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 shrink-0" htmlFor="gm-evt-faction">
            {t('events.filterFaction')}
          </label>
          <select
            id="gm-evt-faction"
            value={factionFilter}
            onChange={(e) => setFactionFilter(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-white/10 bg-gray-900/80 px-2 py-1 text-xs text-gray-200 focus:border-cyan-400/50 focus:outline-none"
          >
            <option value="all">{t('events.filterAll')}</option>
            {factions.map((faction) => (
              <option key={faction.id} value={faction.id}>
                {faction.name}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setFactionFilter('all');
                setCategoryFilter(new Set(EVENT_CATEGORIES));
                setInfoFilter({ people: true, place: true, other: true });
              }}
              className={`${GM_BTN} shrink-0 px-2 py-1 text-[11px]`}
            >
              {t('events.filterReset')}
            </button>
          )}
        </div>

        {/* 類別多選 / Category multi-select */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-gray-400 mr-0.5">{t('events.filterCategory')}</span>
          {EVENT_CATEGORIES.map((category) => {
            const on = categoryFilter.has(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setCategoryFilter((previous) => {
                    const next = new Set(previous);
                    if (next.has(category)) next.delete(category);
                    else next.add(category);
                    return next;
                  })
                }
                className={`rounded-full px-2 py-0.5 text-[11px] font-orbitron tracking-wider transition-colors duration-150 ${
                  on
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'bg-white/5 text-gray-500 hover:text-gray-300'
                }`}
              >
                {t(`events.cat${category.charAt(0).toUpperCase()}${category.slice(1)}`)}
              </button>
            );
          })}
        </div>

        {/* 資訊種類開關：人物 / 地點 / 其他 / Information kind toggles */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-gray-400 mr-0.5">{t('events.filterShow')}</span>
          {(['people', 'place', 'other'] as const).map((info) => (
            <button
              key={info}
              type="button"
              aria-pressed={infoFilter[info]}
              onClick={() =>
                setInfoFilter((previous) => ({ ...previous, [info]: !previous[info] }))
              }
              className={`rounded-full px-2 py-0.5 text-[11px] font-orbitron tracking-wider transition-colors duration-150 ${
                infoFilter[info]
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'bg-white/5 text-gray-500 hover:text-gray-300'
              }`}
            >
              {t(`events.filter${info.charAt(0).toUpperCase()}${info.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {/* 所有回合的事件，高度加倍以便瀏覽 / All rounds' events, doubled height for browsing */}
      <div className="space-y-0.5 max-h-80 overflow-y-auto ds-gm-scroll">
        {isLoading && (
          <div className="space-y-1.5 pt-1" aria-busy="true" aria-label={t('general.loading')}>
            {[92, 78, 85, 64, 90].map((w, i) => (
              <div key={i} className={`${GM_SKEL} h-3`} style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {!isLoading && events.length === 0 && (
          <p className="text-gray-400 text-xs">{t('game.noData')}</p>
        )}
        {/* 有事件但被篩選清空：文案要區分「真的沒有事件」與「篩選後沒有」，
            否則使用者會以為世界壞了 / Events exist but the filters excluded all
            of them — a different message, or it reads as a broken world */}
        {!isLoading && events.length > 0 && filtered.length === 0 && (
          <p className="text-gray-400 text-xs">{t('events.filteredOut')}</p>
        )}
        {filtered.slice(0, visibleCount).map((event) => (
          <div key={event.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_44px]">
            <EventGlyph type={event.type} />
            {/* 回合徽章：所有回合的事件需標示來源回合 / Round badge: all-rounds events need their source round */}
            <span className="font-orbitron text-[10px] text-cyan-400/80 shrink-0 mt-1 tracking-wider">
              {String(event.round).padStart(4, '0')}
            </span>
            <span className="text-sm text-gray-400 leading-relaxed">{formatEvent(event)}</span>
          </div>
        ))}
        {filtered.length > visibleCount && (
          <button
            type="button"
            onClick={() =>
              setPage({ key: filterKey, count: visibleCount + CONFIG.EVENT_LOG_PAGE_SIZE })
            }
            className={`${GM_BTN} w-full mt-2 py-2 text-xs font-orbitron tracking-wider`}
          >
            載入更多（{filtered.length - visibleCount}）
          </button>
        )}
      </div>
    </div>
  );
}

