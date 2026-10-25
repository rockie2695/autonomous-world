'use client';

// ============================================================================
// 事件日誌 / Event Log
// ============================================================================
// 依回合抓取事件，並提供五種篩選：勢力下拉、**將領下拉**、**地點下拉**、
// 事件分類（可複選）、資訊種類（人物 / 地點 / 其他）。另有**回合下拉**切換抓取
// 哪一回合（與面板外的時間軸是同一個 state）。分類表與「事件 → 一句話」
// 的規則都住在 eventText.ts（與首頁 ticker 共用）；資訊種類則看事件 data 裡帶的
// 是角色還是地點，決定名字要不要做成可點的按鈕。
// 將領 / 地點的匹配規則（一個事件可能帶多個 id）住在 eventFilter.ts（純、有測試）。
//
// Fetches a round's events and offers five filters: a faction dropdown, a
// **leader dropdown**, a **place dropdown**, a multi-select of event categories,
// and info-kind toggles (people / place / other). A **round dropdown** switches
// which round is fetched (the same state as the timeline outside the panel).
// Both the category table and the event-to-sentence rules live in eventText.ts
// (shared with the homepage ticker); the info kind is derived from whether the
// event's data carries a character or a place, which is what decides if a name
// becomes a clickable button. The leader / place matching rule (one event can
// carry several ids) lives in eventFilter.ts (pure, tested).
// ============================================================================

import { useState, useMemo, useRef, useEffect, useLayoutEffect, Fragment, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { t } from '@/lib/i18n';
import { BattleReport } from './BattleReport';
import { hslToHex } from '@/components/mapShared';
import { CONFIG } from '@/lib/gameConfig';
import { apiFetch } from '@/lib/api';
import { EventGlyph } from './icons';
import { eventLeaderIds, eventPlaceIds } from './eventFilter';
import { describeEvent, EVENT_CATEGORY, type EventCategory, type EventParam } from '@/lib/eventText';
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

/** 事件帶的是「人」「地」還是其他資訊 / Which kind of information an event carries */
type EventInfo = 'people' | 'place' | 'other';

/**
 * 類別的**顯示順序**（篩選 chips 的排列）——純 UI，與 `eventText.ts` 的正典表
 * 分開放：正典表回答「每種事件屬於哪一類」，這裡只回答「chip 由左到右怎麼排」。
 * The categories' **display order** (the filter chips) — pure UI, kept apart
 * from the canonical table in `eventText.ts`: the table answers "which category
 * does an event belong to", this only answers "how do the chips read".
 */
const EVENT_CATEGORIES: readonly EventCategory[] = [
  'battle',
  'character',
  'economy',
  'faction',
  'admin',
  'place',
];

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
  round,
  worldId,
  factions,
  characters,
  places,
  onFocusPlace,
  onOpenLeaderDetail,
  onRoundChange,
  availableRounds,
}: {
  /** 正在看的回合：日誌只顯示這一回合的事件 / The round on view: the log shows only this round's events */
  round: number;
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
  /** 點回合選項 → 切換顯示的回合 / Clicking a round option switches the displayed round */
  onRoundChange: (round: number) => void;
  /** 可選的回合清單（1..最新回合）/ The selectable rounds (1..latest) */
  availableRounds: number[];
}) {
  const { data, isLoading } = useQuery<{ events: GameEvent[] }>({
    // **只看一回合**：日誌是「正在看的那一回合」的紀錄（時間軸選哪一回合就看哪一回合），
    // 而且先前它一次抓**所有回合**——26 回合就已經四千多筆，之後每回合再加一百多筆，
    // 載荷沒有上限。現在一回合一次（limit 500），篩選器作用的範圍也就是這一回合。
    //
    // **One round at a time**: the log is the record of the round you are looking at
    // (the timeline picks the round), and it used to fetch *all* rounds at once -
    // already four thousand rows at round 26, growing by a hundred-odd every round,
    // with no ceiling. Now it fetches one round (limit 500), and the filters act
    // on that round.
    queryKey: ['events', round],
    queryFn: async () => {
      const res = await apiFetch(`/api/world/events?round=${round}&limit=500`);
      if (!res.ok) return { events: [] };
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const events = data?.events ?? [];

  // ── 篩選狀態 ──/ Filter state
  const [factionFilter, setFactionFilter] = useState<string>('all');
  // 目前打開的戰報；null = 沒開 / the report currently open; null means none
  const factionColours = useMemo(() => {
    const map: Record<string, string> = {};
    for (const faction of factions) {
      map[faction.id] = hslToHex(faction.color);
    }
    return map;
  }, [factions]);
  const [openReport, setOpenReport] = useState<{
    placeId: string;
    placeName: string;
    round: number;
    kind: 'captured' | 'death' | 'escape';
    charName: string;
  } | null>(null);
  // 將領 / 地點下拉：'all' = 不篩。語意是「與此人（此地）**相關**的事件」——
  // 一個事件可能帶多個 id，命中任何一個就算（規則見 eventFilter.ts）。
  // Leader / place dropdowns: 'all' = no filter. The semantics are "events
  // **involving** this leader (or place)" — one event can carry several ids and a
  // match on any counts (the rule lives in eventFilter.ts).
  const [leaderFilter, setLeaderFilter] = useState<string>('all');
  const [placeFilter, setPlaceFilter] = useState<string>('all');
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
  const filterKey = `${factionFilter}|${leaderFilter}|${placeFilter}|${[
    ...categoryFilter,
  ]
    .sort()
    .join(',')}|${infoFilter.people ? 1 : 0}${infoFilter.place ? 1 : 0}${
    infoFilter.other ? 1 : 0
  }`;

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

  // 將領下拉的選項：按名字排序（localeCompare 讓中文排序合理）。已故的標 †——
  // 他們的事件還在日誌裡，篩得到。
  // The leader dropdown's options, name-sorted (localeCompare keeps Chinese
  // sensible). The dead carry † — their events remain in the log and stay filterable.
  const leaderOptions = useMemo(
    () =>
      [...characters]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, label: c.alive ? c.name : `${c.name} †` })),
    [characters]
  );
  const placeOptions = useMemo(
    () =>
      [...places]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, label: p.name })),
    [places]
  );

  const filtered = useMemo(
    () =>
      events.filter((event) => {
        if (!categoryFilter.has(EVENT_CATEGORY[event.type] ?? 'place')) return false;
        if (!infoFilter[eventInfoOf(event.data)]) return false;
        // 「與此人相關」＝事件提到的**任何**將領 id 命中（父子、朋友、君王與
        // 行政官都算）/ "Involving this leader" = any leader id the event mentions
        // matches (a father, a friend, the king and the administrator all count)
        if (leaderFilter !== 'all' && !eventLeaderIds(event.data).includes(leaderFilter)) {
          return false;
        }
        // 「與此地相關」＝發生地或移動的起訖命中 / "Involving this place" = where
        // it happened, or either endpoint of a move
        if (placeFilter !== 'all' && !eventPlaceIds(event.data).includes(placeFilter)) {
          return false;
        }
        if (factionFilter === 'all') return true;
        return factionOfEvent(event.data) === factionFilter;
      }),
    // factionOfEvent 是 useMemo 產生的新參考，每回合資料變動才會換 /
    // factionOfEvent is a fresh reference only when its inputs change
    [events, categoryFilter, infoFilter, factionFilter, leaderFilter, placeFilter, factionOfEvent]
  );

  /**
   * 舊的在上、新的在下（聊天式）。**直接畫 API 的順序，不要反轉。**
   *
   * 這個 `.reverse()` 原本是建立在一個錯誤前提上：註解說「來源 API 是新到舊」。
   * 但 `/api/world/events` 的回合內排序**一直是** `createdAt: 'asc'`，也就是舊到新——
   * 只有全回合分支寫過 `round: 'desc'`，那是**回合之間**的順序，不是回合內的。
   * 於是這個反轉把每一回合都翻成新的在上，日誌讀起來是「升級 → 佔領 → 任命 → 移動 →
   * 購兵 → 收益」：錢賺在最後，升級在最前。因果順序整個倒過來。
   *
   * 它也讓同一個檔案裡的其他註解全部自相矛盾：下面 `shown` 取**尾端**是為了「一進去看到
   * 最新的那一段」，而底部自動捲動也是為了停在最新的事件——兩者都只有在順序由舊到新時才
   * 成立。加上反轉之後，尾端變成最舊的一批，`hasOlder` 也答錯了。
   *
   * API 現在兩種模式都統一由舊到新，所以前端**不需要**任何反轉：最舊的在頂上、最新的在
   * 最下面，往上捲＝看更早，新事件從底下長出來。回合內也因此是因果順序。
   *
   * Oldest on top, newest at the bottom, chat-style. **Draw the API's order as-is — do not
   * reverse it.**
   *
   * This `.reverse()` rested on a false premise: its comment claimed the API returns
   * newest-first. But `/api/world/events` has *always* ordered within a round by
   * `createdAt: 'asc'` — oldest to newest. Only the all-rounds branch ever wrote
   * `round: 'desc'`, and that is the order *between* rounds, not within one. The reversal
   * therefore flipped every round to newest-first, and the log read "upgrade → capture →
   * appointed → moved → bought → income": the money earned last, the upgrade first. The
   * causal order was exactly inverted.
   *
   * It also made the rest of this file contradict itself. `shown` below deliberately takes
   * the **tail** so the reader lands on the newest slice, and the auto-scroll pins to the
   * bottom for the same reason — both only hold when the order runs oldest to newest. With
   * the reversal in place the tail became the oldest slice and `hasOlder` answered wrong.
   *
   * The API now returns oldest-to-newest in both modes, so the client needs no reversal at
   * all: the oldest row is at the top, the newest at the bottom, scrolling up goes back in
   * time, new rows arrive underneath — and within a round the rows are causal.
   */
  const ordered = useMemo(() => filtered, [filtered]);

  /**
   * 顯示的是 `ordered` 的**最後** visibleCount 筆，而不是前 visibleCount 筆。
   * 取尾端代表一開始看到的是最新的那一段，往上捲才把更早的補進來——若取前端，
   * 一進去看到的會是最舊的事件，等於要捲很久才看得到剛發生的事。
   *
   * The window is the LAST visibleCount entries, not the first: that way the reader lands on
   * the newest events and scrolling up brings in older ones. Taking the head would open on
   * the oldest events and bury whatever just happened.
   */
  const shown = useMemo(
    () => ordered.slice(Math.max(0, ordered.length - visibleCount)),
    [ordered, visibleCount]
  );
  const hasOlder = ordered.length > visibleCount;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** 往上捲載入更早的事件時，記下捲動錨點，否則畫面會整段往上跳 / Scroll anchor captured
   *  before older events are prepended, or the viewport jumps */
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  /**
   * 是否貼在底部。這裡必須用 state 而不是每次去量 DOM：onScroll 是事件處理器，在那裡
   * setState 沒有問題，但在 effect 裡同步 setState 會觸發 cascading-render 規則。
   *
   * Whether the reader is pinned to the bottom. This has to be state rather than a DOM read
   * at decision time: setState in an event handler is fine, setState in an effect is not.
   */
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [pendingNew, setPendingNew] = useState(false);

  const atBottom = (el: HTMLDivElement | null) => {
    if (!el) return true;
    // 留一點餘裕：像素完全相等時使用者多半只是在底部附近 / A little slack, because
    // sitting exactly at the bottom is rare and "nearly there" should still count
    return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const loadOlder = () => {
    const el = scrollRef.current;
    if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    setPage((p) => ({
      key: filterKey,
      count: (p.key === filterKey ? p.count : CONFIG.EVENT_LOG_PAGE_SIZE) +
        CONFIG.EVENT_LOG_PAGE_SIZE,
    }));
  };

  // 補上更早的事件之後，把視線釘回原本那筆上。少了這一步，捲到頂會看到畫面整片跳走。
  // Re-anchor after older rows are prepended; without this the view jumps on every load.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    anchorRef.current = null;
    const delta = el.scrollHeight - anchor.height;
    if (delta !== 0) el.scrollTop = anchor.top + delta;
  }, [shown]);

  /**
   * Keep the reader at the bottom. Only when they are already pinned there.
   *
   * This deliberately does NOT fire just once: measured, the first paint had only some
   * rows laid out, so a one-shot latch locked in a scroll position that was already too
   * high once the remaining rows arrived. Following pinnedToBottom means every arriving
   * row re-pins, which is also the correct chat behaviour.
   *
   * Loading older pages does not fight this: that path sets a scroll anchor and the reader
   * is at the top at the time, so pinnedToBottom is false.
   */
  useLayoutEffect(() => {
    if (!pinnedToBottom) return;
    const el = scrollRef.current;
    if (!el) return;

    /**
     * 只在 layout pass 裡捲一次是不夠的。
     *
     * 量測到的失敗點有三個，而且都在第一個 layout pass 之後才發生：列是分頁抓回來的，
     * 面板本身有進場動畫（那幾幀裡捲動容器高度還是 0），而字型也要換一個 frame 才套用。
     * 任何一個都會讓「捲到底」算在一個太矮的內容上，於是畫面停在半路——這正是它一直
     * 沒有生效的原因。
     *
     * Setting scrollTop once inside the layout pass is not enough.
     *
     * Three things measured to land *after* that first pass: the rows arrive paginated,
     * the panel has an entry animation (during which the scroll container is still 0 tall),
     * and the font swap applies a frame later. Any one of them measures the content while it
     * is still short, so the scroll lands mid-log — which is exactly why this never worked.
     *
     * 所以先同步捲一次（畫面沒有閃爍），再跨兩個 frame 與一個短延遲各捲一次。
     * 讀者一進來就看到最近的事，而不是事件的開頭。
     *
     * So pin synchronously (no visible flicker), then re-pin across two frames and one short
     * timeout. The reader lands on the newest events rather than the start of the log.
     */
    const pin = () => {
      el.scrollTop = el.scrollHeight;
    };
    pin();

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      pin();
      secondFrame = requestAnimationFrame(pin);
    });
    // 字型／版面真正穩定後的最後一次 / one last time once font and layout have settled
    const settle = window.setTimeout(pin, 160);

    // 清理是必要的：effect 重跑時若不取消，pending frame 會寫到已經卸載的節點 /
    // Cleanup matters: without it a re-run lets a pending frame write to a detached node
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(settle);
    };
  }, [shown, pinnedToBottom]);

  /**
   * 新回合帶來新事件時：讀者本來就在底部就直接捲到底，不在底部就不要硬拉，給一個提示就好。
   * When a new round brings events: auto-scroll only if the reader was already at the bottom.
   * Yanking someone away from what they were reading is the thing chat UIs are careful about.
   */
  const newestKey = ordered.length > 0 ? ordered[ordered.length - 1].id : '';
  const [seenNewest, setSeenNewest] = useState('');

  // 在 render 期間比較，而不是在 effect 裡 setState：這是 React 說的「adjusting state
  // when a prop changes」，本專案的 useChangedKeys 也是這麼做的。effect 裡同步 setState
  // 會被 cascading-render 規則擋下。
  //
  // Compared during render rather than set in an effect: this is React's documented
  // "adjusting state when a prop changes", and the same idiom useChangedKeys uses here.
  if (newestKey !== '' && newestKey !== seenNewest) {
    setSeenNewest(newestKey);
    if (!pinnedToBottom) setPendingNew(true);
  }

  // 這個 effect 只動 DOM（捲動），不 setState / This effect only writes to the DOM; it
  // never sets state, which is what keeps it clear of the cascading-render rule.
  useEffect(() => {
    if (!pinnedToBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestKey, pinnedToBottom]);

  const filtersActive =
    factionFilter !== 'all' ||
    leaderFilter !== 'all' ||
    placeFilter !== 'all' ||
    categoryFilter.size !== EVENT_CATEGORIES.length ||
    !infoFilter.people ||
    !infoFilter.place ||
    !infoFilter.other;

  /**
   * 一列事件的敘述。**句子的規則住在 eventText.ts**（事件日誌與首頁 ticker 共用
   * 同一份），這裡只負責把語段畫出來：每個語段灌進 fillTemplate，NameRef 依
   * kind 變成可點的按鈕（將領 → 詳情、地點 → 聚焦地圖）或純文字（勢力沒有彈窗）。
   * describeEvent 對缺欄位的語段整段省略、對未知類型回空陣列，所以收到空陣列
   * 時退回顯示事件類型本身——冷靜地印一個代號，好過印出 `{place}` 字面值或
   * 一句假話。
   *
   * One event row's sentence. **The wording rules live in eventText.ts** (the
   * event log and the homepage ticker share the one source); this only renders
   * segments: each goes through fillTemplate, and a NameRef becomes a clickable
   * button by kind (leader → detail, place → focus the map) or plain text
   * (factions have no popup). describeEvent drops segments on missing fields
   * and returns an empty array for unknown types, so on an empty array this
   * falls back to the event type itself — a calm code beats a `{place}` literal
   * or an invented sentence.
   */
  function formatEvent(event: GameEvent): ReactNode {
    const segments = describeEvent(event.type, event.data, t);
    if (segments.length === 0) return event.type;

    // NameRef → 節點：kind 決定可不可以點。id 永遠優先（名字可能被沿用，舊事件
    // 由 API 讀時回填）；沒有 id 就退回純文字——寧可不可點也不要開錯。
    // NameRef → node: kind decides clickability. The id always wins (names get
    // reused, and the API backfills it for legacy rows); without one we fall
    // back to plain text — inert beats opening the wrong thing.
    const nodeFor = (param: EventParam): ReactNode => {
      if (typeof param === 'string' || typeof param === 'number') return String(param);
      if (param.kind === 'faction') return param.name;
      if (param.kind === 'place') {
        // 先解構：屬性的 narrowing 進不了 callback，const 可以 /
        // Destructure first: property narrowing does not survive into a
        // callback, a const does
        const { id, name } = param;
        if (!id) return name;
        return (
          <button type="button" onClick={() => onFocusPlace(id)} className={GM_EVENT_LINK}>
            {name}
          </button>
        );
      }
      const key = param.id ?? param.name;
      return (
        <button type="button" onClick={() => onOpenLeaderDetail(key)} className={GM_EVENT_LINK}>
          {param.name}
        </button>
      );
    };

    // 複合事件（叛變、收益）是多個語段，段與段之間以 ' · ' 相連——與 ticker 的
    // 純文字版本用同一個分隔符，兩邊讀起來是同一種句子。
    // Compound events (defection, income) are several segments joined with
    // ' · ' — the same separator the ticker's plain-text rendering uses, so
    // both surfaces read as the same sentence.
    return (
      <>
        {segments.map((segment, index) => {
          const parts: Record<string, ReactNode> = {};
          for (const [key, value] of Object.entries(segment.params)) {
            parts[key] = nodeFor(value);
          }
          return (
            <Fragment key={index}>
              {index > 0 && ' · '}
              {fillTemplate(t(segment.key), parts)}
            </Fragment>
          );
        })}
      </>
    );
  }

  return (
    // 撐滿面板高度：標題與**整排篩選器**固定在上方，事件清單吃滿剩下的高度自己捲。
    // 用 flex column 而不是 `sticky`：sticky 只在「外層滾動」時有效，而這個面板要的是
    // 「內層滾動」——而且 sticky 元素還需要一塊不透明背景蓋住划過它底下的列，
    // flex 結構連那個都不需要，兩者效果相同但少一個會漂的元件。
    //
    // Fill the panel's height: the title and the **whole filter row** stay pinned above
    // while the event list takes the rest and scrolls itself. A flex column rather than
    // `sticky`: sticky only works when an *outer* element scrolls, and what this panel
    // needs is an *inner* scroller — plus a sticky element needs an opaque background to
    // cover the rows sliding under it. Same effect, one fewer element that can drift.
    <div className={`${GM_PANEL} flex flex-1 min-h-0 flex-col p-3`}>
      <h3 className={`${GM_TITLE} mb-3 flex shrink-0 items-center justify-between`}>
        <span>{t('events.title')}</span>
        <span className="flex items-center gap-2">
          {/* 回合徽章：日誌只顯示這一回合，所以徽章在標頭而不是每列 /
              The round badge: the log shows one round, so the badge sits in the
              header instead of on every row */}
          <span className="font-display text-cyan-300/90 tracking-widest">
            RND {String(round).padStart(4, '0')}
          </span>
          <span className="text-cyan-300/85 text-xs tracking-widest font-normal">
            {/* 有篩選時顯示篩選後的數量，否則顯示總數 —— 數字要跟下面看到的列一致 /
                Show the filtered count while filters are on, so the number matches
                the rows actually listed below */}
            {filtersActive ? filtered.length : events.length} {t('events.tab')}
          </span>
        </span>
      </h3>
      {/* ── 篩選列 / Filter row ──
          三組控制：勢力（下拉）、類別（多選 chip）、資訊種類（三個開關）。全部
          都是「顯示什麼」的表達方式，不改變事件本身，所以可以任意組合。
          Three controls: faction (dropdown), category (multi-select chips) and
          information kind (three toggles). All of them express "what to show"
          without changing the events, so they compose freely. */}
      <div className="mb-2.5 shrink-0 space-y-2">
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
                setLeaderFilter('all');
                setPlaceFilter('all');
                setCategoryFilter(new Set(EVENT_CATEGORIES));
                setInfoFilter({ people: true, place: true, other: true });
              }}
              className={`${GM_BTN} shrink-0 px-2 py-1 text-[11px]`}
            >
              {t('events.filterReset')}
            </button>
          )}
        </div>

        {/* ── 回合選擇器 / Round selector ──
            與左邊的時間軸同一個 state（selectedRound）：兩邊選的是同一個「正在看的回合」，
            這個下拉只是讓人不用離開面板就能跳回合。「全部回合」不會出現在這裡——日誌一次
            只抓一回合，要看歷史是時間軸的事。沒有可選回合（種子世界，一回合都還沒跑）時
            整列不出現，而不是顯示一個空下拉。
            The same state as the timeline on the left (selectedRound): both pick the one
            "round on view", and this dropdown only saves the reader from leaving the panel
            to jump rounds. "All rounds" is deliberately absent - the log fetches one round
            at a time and history is the timeline's job. With no rounds to pick (a seeded
            world, nothing run yet) the whole row is omitted rather than shown empty. */}
        {availableRounds.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0" htmlFor="gm-evt-round">
              {t('general.roundSelect')}
            </label>
            <select
              id="gm-evt-round"
              value={round}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!Number.isNaN(next)) onRoundChange(next);
              }}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-gray-900/80 px-2 py-1 text-xs text-gray-200 focus:border-cyan-400/50 focus:outline-none"
            >
              {availableRounds.map((r) => (
                <option key={r} value={r}>
                  RND {String(r).padStart(4, '0')}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* 將領 / 地點下拉：一列放兩組（label + select 各半）。全世界的將領與
            地點都在選項裡（清單來自 page 傳進來的 worldState，不是這一回合的事件），
            語意是「與此人（此地）相關的事件」。
            Leader / place dropdowns: two pairs on one row (each label + select takes
            half). Every leader and place in the world is an option — the list comes from
            the worldState the page passes in, not from this round's events — and the
            semantics are "events **involving** this leader (or place)". */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <label className="text-xs text-gray-400 shrink-0" htmlFor="gm-evt-leader">
              {t('events.filterByLeader')}
            </label>
            <select
              id="gm-evt-leader"
              value={leaderFilter}
              onChange={(e) => setLeaderFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-gray-900/80 px-2 py-1 text-xs text-gray-200 focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="all">{t('events.filterAll')}</option>
              {leaderOptions.map((leader) => (
                <option key={leader.id} value={leader.id}>
                  {leader.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <label className="text-xs text-gray-400 shrink-0" htmlFor="gm-evt-place">
              {t('events.filterByPlace')}
            </label>
            <select
              id="gm-evt-place"
              value={placeFilter}
              onChange={(e) => setPlaceFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-gray-900/80 px-2 py-1 text-xs text-gray-200 focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="all">{t('events.filterAll')}</option>
              {placeOptions.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.label}
                </option>
              ))}
            </select>
          </div>
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
                className={`rounded-full px-2 py-0.5 text-[11px] font-display tracking-wider transition-colors duration-150 ${
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
              className={`rounded-full px-2 py-0.5 text-[11px] font-display tracking-wider transition-colors duration-150 ${
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

      {/* 這一回合的事件：吃滿面板剩下的高度，自己上下捲 /
          This round's events: takes the panel's remaining height and scrolls itself */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          // 貼底狀態在事件裡更新：setState 放在事件處理器沒有 cascading-render 的問題，
          // 後面「要不要自動捲底」與「要不要顯示新訊息提示」都以它為準 /
          // Pinned-to-bottom is tracked here, in the event handler, where setState is fine.
          // Both the auto-scroll and the "new events" pill read it.
          const nowPinned = atBottom(el);
          setPinnedToBottom(nowPinned);
          // 使用者自己捲到底，代表已經追上最新消息，提示就沒必要了 /
          // Scrolling to the bottom by hand means the reader has caught up, so the pill goes
          if (nowPinned) setPendingNew(false);

          // 捲到接近頂端就把更早的事件補上來 / Scrolling near the top pulls in older events.
          // 46px 是一列的高度上下：真的碰到 0 會在彈回時反覆觸發 /
          // 46px is about a row: firing at exactly 0 re-triggers on every bounce back
          if (hasOlder && el.scrollTop < 46) {
            loadOlder();
          }
        }}
        className="flex-1 min-h-0 space-y-0.5 overflow-y-auto ds-gm-scroll"
      >
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
        {/* 更早的事件在**上方**，因為新的在下方。往上捲到頂會自動載入，這顆按鈕只是
            給不能捲（鍵盤、觸控板慣性）的人一個明確入口 /
            Older rows sit ABOVE, because newer ones arrive below. Scrolling to the top loads
            them automatically; this button is the explicit affordance for anyone who cannot
            scroll (keyboard, trackpad inertia). */}
        {hasOlder && (
          <button
            type="button"
            onClick={loadOlder}
            className={`${GM_BTN} w-full mb-2 py-2 text-xs font-display tracking-wider`}
          >
            {t('events.loadOlder', { count: ordered.length - visibleCount })}
          </button>
        )}
        {shown.map((event) => (
          <div key={event.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_44px]">
            <EventGlyph type={event.type} />
            <span className="text-sm text-gray-400 leading-relaxed">{formatEvent(event)}</span>
            {(
              event.type === 'PLACE_CAPTURED' ||
              event.type === 'BATTLE_DEATH' ||
              event.type === 'ESCAPE_SUCCESS'
            ) && (
              // 佔領與戰死都要能打開算式：佔領有兩種經過（打了守軍，或走進空城），
              // 戰死也有兩種（攻方被擊退後逃脫失敗，或守方兵敗陣亡）——日誌一行
              // 都看不出差別，而且以前失敗那場的報告**算完就丟了**，死在別人地盤上
              // 的仗打沒打過無從查起。現在死亡事件自己帶著 `report`。
              //
              // Both captures and deaths open the arithmetic: a capture has two
              // histories (fought a garrison, or walked in), and a death has two
              // (the attacker was repelled and failed to flee, or the defender fell).
              // A row cannot show the difference — and the losing side's report used
              // to be computed and thrown away, leaving a death on foreign ground
              // with nothing to inspect. Death events now carry their own `report`.
              <button
                type="button"
                onClick={() => {
                  const data = (event.data ?? {}) as Record<string, unknown>;
                  setOpenReport({
                    placeId: typeof data.placeId === 'string' ? data.placeId : '',
                    placeName: typeof data.placeName === 'string' ? data.placeName : '?',
                    round: event.round,
                    kind:
                      event.type === 'PLACE_CAPTURED'
                        ? 'captured'
                        : event.type === 'ESCAPE_SUCCESS'
                          ? 'escape'
                          : 'death',
                    charName: typeof data.charName === 'string' ? data.charName : '?',
                  });
                }}
                className="shrink-0 mt-0.5 rounded-full border border-cyan-400/30 px-1.5 py-0.5 text-[10px] font-display tracking-wider text-cyan-300 hover:bg-cyan-500/10"
              >
                {t('events.reportOpen')}
              </button>
            )}
          </div>
        ))}
      </div>
      {/* 讀者不在底部時，新事件不會把人硬拉下去，只在底部給一個提示；有焦點時也不能
          搶走焦點，所以用 pointer-events-none 的非互動容器以外的獨立按鈕 /
          When the reader is not at the bottom, new events do not yank them down — they get a
          pill at the bottom instead. The pill is a real button so keyboard users reach it. */}
      {pendingNew && (
        <div className="flex shrink-0 justify-center -mt-1 mb-1">
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setPendingNew(false);
            }}
            className={`${GM_BTN} rounded-full px-3 py-1 text-[10px] font-display tracking-wider`}
          >
            {t('events.newEvents')}
          </button>
        </div>
      )}
      {openReport && (
        <BattleReport
          placeId={openReport.placeId}
          placeName={openReport.placeName}
          round={openReport.round}
          kind={openReport.kind}
          charName={openReport.charName}
          factionColours={factionColours}
          onClose={() => setOpenReport(null)}
        />
      )}
    </div>
  );
}
