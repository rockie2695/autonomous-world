// ============================================================================
// 事件敘述 — 單一來源 / Event Text — The ONE Sentence Formatter
// ============================================================================
// 事件 log 與首頁 ticker 各自寫過一份「事件 → 一句話」的 switch，兩份必然失去
// 同步：舊版 ticker 漏了五個事件類型，落進「第 N 回合發生了一件事」的假句子，
// 也要承認它自己也不知道發生了什麼。現在規則只寫在這裡，兩個消費端都吃同一份：
//
//   - `describeEvent(type, data, t)` 把事件拆成**語段**（EventSegment），每個語段
//     是一個 i18n 模板鍵加上它需要的參數。複合事件（叛變、收益）回傳多個語段。
//   - 事件日誌把每個語段灌進 `fillTemplate`，人名地名做成可點按鈕；
//     ticker 把同一批語段用純文字插值。
//
// 缺欄位的規則：**寧可少一句，不要破句子**。語段需要的名字若缺（舊事件沒存的
// 欄位），整個語段直接省略；模板裡永遠不會殘留 `{place}` 這種字面值，也不會
// 印出 `?`。未知的事件類型回傳空陣列——ticker 省略整列，比假句子誠實。
// The event log and the homepage ticker each used to carry their own
// event-to-sentence switch, and the two could only drift: the old ticker missed
// five event types and fell into "something happened in round N" — a sentence
// that admits it knows nothing. The rule now lives only here, and both
// consumers read this one source:
//
//   - `describeEvent(type, data, t)` splits an event into **segments**
//     (EventSegment), each an i18n template key plus the parameters it needs.
//     Compound events (defection, income) return several segments.
//   - The event log fills each segment through `fillTemplate` with clickable
//     name buttons; the ticker interpolates the same segments as plain text.
//
// Missing fields: **better one clause short than a broken sentence**. When a
// segment lacks a name it needs (columns legacy rows never stored), the whole
// segment is dropped; a `{place}` literal can never survive into the template,
// and neither can a `?`. An unknown event type returns an empty array — the
// ticker omits the row, which is more honest than a fake sentence.
// ============================================================================

/** 事件類型的正典清單 / The canonical set of event types */
export type EventType =
  | 'BATTLE_DEATH'
  | 'ESCAPE_SUCCESS'
  | 'PLACE_CAPTURED'
  | 'CHARACTER_SPAWNED'
  | 'CHARACTER_MOVED'
  | 'DEATH'
  | 'CHILD_BORN'
  | 'FRIENDSHIP'
  | 'DEFECTION'
  | 'BUILDING_UPGRADE'
  | 'INCOME'
  | 'TROOPS_BOUGHT'
  | 'FACTION_COLLAPSE'
  | 'FACTION_ELIMINATED'
  | 'KING_INHERITED'
  | 'SIGNAL_ISSUED'
  | 'ADMIN_ASSIGNED'
  | 'ADMIN_REMOVED'
  | 'PLACE_CREATED';

/** 事件分類 / Event categories */
export type EventCategory = 'battle' | 'character' | 'economy' | 'faction' | 'admin' | 'place';

/**
 * 事件類型 → 類別，**正典表**。篩選器與 ticker 都吃這張表；`Record<EventType,…>`
 * 讓漏掉一個新事件類型直接編譯失敗。
 * Event type → category, the canonical table. The filter and the feed both read
 * it, and `Record<EventType,…>` turns a missing new type into a compile error.
 *
 * 判斷依據是語意，不是畫面：戰死與逃脫都是戰鬥的結果，地方易主也是。 /
 * Assigned by meaning rather than by appearance: deaths and escapes are outcomes
 * of battle, and so is a place changing hands.
 */
export const EVENT_CATEGORY: Record<EventType, EventCategory> & {
  [type: string]: EventCategory | undefined;
} = {
  BATTLE_DEATH: 'battle',
  ESCAPE_SUCCESS: 'battle',
  PLACE_CAPTURED: 'battle',
  CHARACTER_SPAWNED: 'character',
  CHARACTER_MOVED: 'character',
  DEATH: 'character',
  CHILD_BORN: 'character',
  FRIENDSHIP: 'character',
  DEFECTION: 'character',
  BUILDING_UPGRADE: 'economy',
  INCOME: 'economy',
  TROOPS_BOUGHT: 'economy',
  FACTION_COLLAPSE: 'faction',
  FACTION_ELIMINATED: 'faction',
  KING_INHERITED: 'faction',
  SIGNAL_ISSUED: 'faction',
  ADMIN_ASSIGNED: 'admin',
  ADMIN_REMOVED: 'admin',
  PLACE_CREATED: 'place',
};

/** 正典 19 類 / The canonical 19 types, derived from the table so they cannot fork */
export const EVENT_TYPES = Object.keys(EVENT_CATEGORY) as EventType[];

/**
 * 一個名字：是將領、地點還是勢力，加上可點擊用的 id。消費端決定要不要做成
 * 按鈕——純文字的 ticker 只讀 `name`。
 * One named participant: leader, place or faction, plus the id a clickable
 * consumer needs. Plain-text consumers only read `name`.
 */
export type NameRef = {
  kind: 'leader' | 'place' | 'faction';
  id?: string;
  name: string;
};

/** 語段參數：NameRef（可點的名字）或純值 / A segment parameter: a NameRef or a plain value */
export type EventParam = NameRef | string | number;

/** 一個語段：模板鍵 + 參數 / One segment: a template key and its parameters */
export type EventSegment = {
  key: string;
  params: Record<string, EventParam>;
};

/** 翻譯函式簽章，與 i18n 的 `t()` / `createTranslator()` 相同 / Same signature as the i18n `t()` */
export type Translator = (
  key: string,
  params?: Record<string, string | number>
) => string;

// ─── 欄位讀取 / Field Readers ─────────────────────────────────────────────

/**
 * 事件的 `data` 來自資料庫 JSON 欄，所有欄位一律視為 `unknown`。缺字串回 null，
 * 由呼叫端決定「省略語段」。
 * An event's `data` comes out of a JSON column, so every field is `unknown`.
 * A missing string reads as null and the caller drops the clause.
 */
function str(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 同上，但預設 0——數字只是量，缺了用 0 說話，不破句子 / Same, defaulting to 0: a quantity, not a clause */
function num(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 名字參數的便利函式 / Convenience builders for NameRef params */
const leader = (data: Record<string, unknown>, idKey: string, nameKey: string): NameRef | null => {
  const name = str(data, nameKey);
  if (!name) return null;
  const id = str(data, idKey);
  return id ? { kind: 'leader', id, name } : { kind: 'leader', name };
};
const place = (data: Record<string, unknown>, idKey: string, nameKey: string): NameRef | null => {
  const name = str(data, nameKey);
  if (!name) return null;
  const id = str(data, idKey);
  return id ? { kind: 'place', id, name } : { kind: 'place', name };
};
/** 勢力純文字：勢力沒有彈窗，id 沒有用處，但仍帶著以備未來 / A faction name is plain text — no popup exists — but the id is still carried */
const faction = (data: Record<string, unknown>, idKey: string, nameKey: string): NameRef | null => {
  const name = str(data, nameKey);
  if (!name) return null;
  const id = str(data, idKey);
  return id ? { kind: 'faction', id, name } : { kind: 'faction', name };
};

/**
 * ADMIN_REMOVED 沒有接任者時的佔位詞。這是**說明缺漏的標點**，不是編造的名字。
 * The placeholder word when ADMIN_REMOVED has no successor. It is punctuation
 * *describing* the absence, never an invented name.
 */
const FALLBACK_WORD = { kind: 'leader' as const, name: '—' };

// ─── 主函式 / The Formatter ───────────────────────────────────────────────

/**
 * 事件 → 語段。未知類型回傳 `[]`；缺名字的語段整段省略。
 * An event → its segments. Unknown types return `[]`; a segment missing a name
 * it needs is dropped whole.
 */
export function describeEvent(
  type: string,
  data: unknown,
  t: Translator
): EventSegment[] {
  // data 一律是物件（JSON 欄），防禦式收斂 / The data is always an object, but defensively narrow it
  const d: Record<string, unknown> =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  switch (type) {
    case 'PLACE_CREATED': {
      const p = place(d, 'placeId', 'placeName');
      return p ? [{ key: 'events.newPlaceDesc', params: { place: p } }] : [];
    }

    // 「在哪裡誕生」是讀者接下來一定會問的問題：這個勢力多了一個人，而那個人的
    // 位置決定了他下一回合能做什麼。缺 `placeName`（本次改動之前的事件）時整列省略。
    // "Where" is the obvious next question: this faction has gained a person, and
    // where that person stands decides what they can do next round. Rows written
    // before this change carry no `placeName`, so they are dropped whole.
    case 'CHARACTER_SPAWNED': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      return c && p ? [{ key: 'events.spawnDesc', params: { character: c, place: p } }] : [];
    }

    case 'CHARACTER_MOVED': {
      const c = leader(d, 'charId', 'charName');
      const from = place(d, 'fromPlaceId', 'fromPlaceName');
      const to = place(d, 'toPlaceId', 'toPlaceName');
      return c && from && to
        ? [{ key: 'events.moveDesc', params: { character: c, from, to } }]
        : [];
    }

    case 'CHILD_BORN': {
      const child = leader(d, 'charId', 'charName');
      const father = leader(d, 'fatherId', 'fatherName');
      return child && father
        ? [{ key: 'events.childBornDesc', params: { character: child, father } }]
        : [];
    }

    // 友誼的另一方是 `character2`（由 friendId 攜帶），不是 charName /
    // The friend is `character2`, carried by friendId — not charName
    case 'FRIENDSHIP': {
      const first = leader(d, 'charId', 'charName');
      const second = leader(d, 'friendId', 'character2');
      return first && second
        ? [{ key: 'events.friendshipDesc', params: { character1: first, character2: second } }]
        : [];
    }

    case 'KING_INHERITED': {
      const c = leader(d, 'charId', 'charName');
      const father = leader(d, 'fatherId', 'fatherName');
      return c && father
        ? [{ key: 'events.kingInheritedDesc', params: { character: c, father } }]
        : [];
    }

    case 'DEATH': {
      const c = leader(d, 'charId', 'charName');
      return c ? [{ key: 'events.deathDesc', params: { character: c } }] : [];
    }

    case 'BATTLE_DEATH': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      return c && p
        ? [{ key: 'events.battleDeathDesc', params: { character: c, place: p } }]
        : [];
    }

    // 「逃離」要說實話：有友方（或無主）鄰居可退才是真的逃離；無路可退時只是
    // 撿回一命、留駐原地（troops 歸 0）。舊事件沒有 `escaped` 欄位，預設 true
    // 維持原措辭。
    // The wording has to tell the truth: escaping means a friendly (or unowned)
    // neighbour actually took them in; with no way out they merely survived in
    // place (troops zeroed). Legacy rows predate `escaped` and default to the
    // original wording.
    case 'ESCAPE_SUCCESS': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      if (!c || !p) break;
      return [
        {
          key: d.escaped === false ? 'events.escapeSurvivedDesc' : 'events.escapeSuccessDesc',
          params: { character: c, place: p },
        },
      ];
    }

    // 號令是勢力層唯一的動員紀錄：誰下的令、令全軍去哪、是進攻還是馳援。
    // The call is the only faction-level mobilisation record: who commanded it,
    // where the host is sent, and whether it is an assault or a relief.
    case 'SIGNAL_ISSUED': {
      const c = leader(d, 'charId', 'charName');
      const f = faction(d, 'factionId', 'factionName');
      const p = place(d, 'placeId', 'placeName');
      if (!c || !f || !p) break;
      return [
        {
          key: d.intent === 'defend' ? 'events.signalDefendDesc' : 'events.signalAttackDesc',
          params: { character: c, faction: f, place: p },
        },
      ];
    }

    // 叛離要說清楚三件事：**離開哪個勢力**、**人在哪個地方**、**加入了哪個勢力**
    // （加入既有勢力，或自己建立一個新的）。每段各自缺欄各自省略，但第一句
    // （叛離本人）的角色缺了就整列省略——沒有主詞的句子不能成立。
    //
    // A defection has to answer three things: which faction was **left**, which
    // **place** they left from, and which faction they **joined** — an existing
    // one, or a brand-new one they founded. Each clause independently drops
    // itself on a missing field, but the defector's own clause is the subject:
    // without it the row is dropped altogether.
    case 'DEFECTION': {
      const c = leader(d, 'charId', 'charName');
      if (!c) break;
      const oldName = faction(d, 'oldFactionId', 'oldFactionName');
      const at = place(d, 'placeId', 'placeName');
      const joined = faction(d, 'newFactionId', 'newFactionName');
      const founded =
        d.reason === 'created_new_faction' || (d.reason === 'admin_defection' && !!joined);
      const segments: EventSegment[] = [
        { key: 'events.defectionDesc', params: { character: c } },
      ];
      if (oldName) {
        segments.push({ key: 'events.defectionLeft', params: { faction: oldName } });
      }
      if (at) {
        segments.push({ key: 'events.defectionAt', params: { place: at } });
      }
      if (joined) {
        segments.push({
          key: founded ? 'events.defectionFounded' : 'events.defectionJoined',
          params: { faction: joined },
        });
      }
      return segments;
    }

    case 'FACTION_COLLAPSE': {
      const f = faction(d, 'factionId', 'factionName');
      return f ? [{ key: 'events.collapseDesc', params: { faction: f } }] : [];
    }

    case 'FACTION_ELIMINATED': {
      const f = faction(d, 'factionId', 'factionName');
      return f ? [{ key: 'events.eliminationDesc', params: { faction: f } }] : [];
    }

    case 'BUILDING_UPGRADE': {
      const p = place(d, 'placeId', 'placeName');
      const building = str(d, 'building');
      if (!p || !building) break;
      // 建築名稱是 `map.*` 的鍵（fortress / market / barracks），在這裡翻譯成
      // 字串參數——它不是可點的名字。
      // The building is a `map.*` key (fortress / market / barracks), translated
      // here into a plain string param — it is not a clickable name.
      return [
        {
          key: 'events.buildingDesc',
          params: {
            place: p,
            building: t(`map.${building}`),
            level: num(d, 'newLevel'),
          },
        },
      ];
    }

    case 'ADMIN_ASSIGNED': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      return c && p
        ? [{ key: 'events.adminAssignedDesc', params: { character: c, place: p } }]
        : [];
    }

    case 'ADMIN_REMOVED': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      if (!c || !p) break;
      // 接任者欄位可空（席位清空的路徑沒有接任者）；模板需要一個詞，退回破折號
      // 而不是殘留 `{newAdmin}` 字面值。
      // The successor is nullable (seat-clearing paths have none); the template
      // needs a word, so fall back to a dash rather than a `{newAdmin}` literal.
      const successor = leader(d, 'newAdminId', 'newAdminName');
      return [
        {
          key: 'events.adminRemovedDesc',
          params: { character: c, place: p, newAdmin: successor ?? FALLBACK_WORD },
        },
      ];
    }

    case 'PLACE_CAPTURED': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      return c && p
        ? [{ key: 'events.placeCaptureDesc', params: { character: c, place: p } }]
        : [];
    }

    // 一個地方一筆：收益、徵兵，以及錢進了誰的口袋。
    //
    // **增加量與總量都要**（「得 3 金」不夠，要能看出「現在有多少」），而且當君王
    // 與行政官是**同一個人**時必須合併成一行 —— 他一開始會拿到兩份（40% + 30%），
    // 分成兩行就會出現「黎志 得 3 金 · 黎志 得 2 金」這種像是重複的紀錄。
    // 領錢的名字帶 charId（kingId / adminId 就是本人的 id）。
    //
    // One row per place: income, recruitment, and who was paid.
    //
    // **Both the increase and the total** ("got 3 gold" is not enough — you need to see
    // the new balance), and when the king *is* the administrator the two shares must
    // merge into one row: he legitimately receives both (40% + 30%), but split across
    // two lines it reads as a duplicate. The paid leader carries charId (kingId /
    // adminId *is* that leader's id).
    case 'INCOME': {
      const p = place(d, 'placeId', 'placeName');
      if (!p) break;
      const segments: EventSegment[] = [
        {
          key: 'events.incomeDesc',
          params: {
            place: p,
            gold: num(d, 'income'),
            recruits: num(d, 'recruits'),
            total: num(d, 'garrisonAfter'),
          },
        },
      ];
      // 君王 / 行政官的分成：同一人坐兩個位子就合併成一段，否則各自一段；
      // 每段缺了名字就自己省略。
      // The king / administrator share: merged into one clause when one person
      // holds both seats, otherwise one clause each; every clause drops itself
      // on a missing name.
      const kingId = str(d, 'kingId');
      const adminId = str(d, 'adminId');
      const kingGold = num(d, 'kingGold');
      const adminGold = num(d, 'adminGold');
      const king = leader(d, 'kingId', 'kingName');
      const admin = leader(d, 'adminId', 'adminName');
      // 同一個人坐兩個位子 / one person holding both seats
      const sameLeader = kingId !== null && kingId === adminId;
      if (sameLeader && king && kingGold + adminGold > 0) {
        segments.push({
          key: 'events.incomeLeader',
          params: {
            leader: king,
            gold: kingGold + adminGold,
            total: num(d, 'adminGoldAfter'),
          },
        });
      }
      if (!sameLeader && king && kingGold > 0) {
        segments.push({
          key: 'events.incomeLeader',
          params: {
            leader: king,
            gold: kingGold,
            total: num(d, 'kingGoldAfter'),
          },
        });
      }
      if (!sameLeader && admin && adminGold > 0) {
        segments.push({
          key: 'events.incomeLeader',
          params: {
            leader: admin,
            gold: adminGold,
            total: num(d, 'adminGoldAfter'),
          },
        });
      }
      return segments;
    }

    // 一筆購兵 = 誰、在哪、花多少、買到幾個，以及**換完之後**剩下什麼。
    // One purchase per row: who, where, what it cost, how many troops it bought,
    // and what is left afterwards.
    case 'TROOPS_BOUGHT': {
      const c = leader(d, 'charId', 'charName');
      const p = place(d, 'placeId', 'placeName');
      if (!c || !p) break;
      return [
        {
          key: 'events.troopsBought',
          params: {
            leader: c,
            place: p,
            bought: num(d, 'bought'),
            cost: num(d, 'cost'),
            gold: num(d, 'goldAfter'),
            troops: num(d, 'troopsAfter'),
          },
        },
      ];
    }
  }

  // 未知的事件類型：空陣列＝ticker 省略整列。日誌則由呼叫端決定退回什麼。
  // An unknown event type: an empty array = the ticker omits the row. The log's
  // own fallback is the caller's to decide.
  return [];
}

/**
 * 純文字渲染：語段 → 一句話，供 ticker 使用。NameRef 只讀 `name`，同段之間
 * 以 ' · ' 相連，與事件日誌的複合字串完全一致。
 * Plain-text rendering, for the ticker: segments → one string. A NameRef reads
 * only `name`, and segments join with ' · ' — identical to the log's compound
 * rows.
 */
export function describeEventText(type: string, data: unknown, t: Translator): string {
  return describeEvent(type, data, t)
    .map((segment) => {
      const params: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(segment.params)) {
        params[k] = typeof v === 'string' || typeof v === 'number' ? v : v.name;
      }
      return t(segment.key, params);
    })
    .join(' · ');
}
