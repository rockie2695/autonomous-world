// ============================================================================
// 世界選擇器 / World Picker
// ============================================================================
// 頁首的小下拉：所有已登入使用者都能看、都能切換世界（選擇寫進 cookie，
// 見 src/lib/worldSelect.ts）。admin 額外有三個動作，全部作用在**目前選中**的
// 世界上：
//   ＋ 建立新世界 — POST /api/admin/worlds（與 seed / reset 共用 initWorld），
//     成功後伺服器已把 cookie 指向新世界，整頁重載落到它身上。
//   ⟲ 重置此世界 — POST /api/admin/worlds/reset：同一個 world id 就地拆除重練，
//     歷史歸零。**兩段式確認**（先點 ⟲、再點「確認重置」），因為這個操作無法復原。
//   🗑 刪除此世界 — DELETE /api/admin/worlds：拆除資料 + 刪 World 列。同樣兩段式
//     確認；最後一個世界不能刪（按鈕停用）。
//
// The header's small dropdown: every signed-in user can see and switch worlds
// (the choice lands in a cookie, see src/lib/worldSelect.ts). The admin
// additionally gets three actions, all aimed at the **currently selected** world:
//   ＋ new world — POST /api/admin/worlds (initWorld shared with seed / reset);
//     on success the server has pointed the cookie at the new world and a full
//     reload lands there.
//   ⟲ reset — POST /api/admin/worlds/reset: the SAME world id is torn down and
//     rebuilt in place, its history zeroed. **Two-step confirmation** (click ⟲,
//     then "Reset"), because the operation is irreversible.
//   🗑 delete — DELETE /api/admin/worlds: teardown + the World row. Also two-step;
//     the last world cannot be deleted (the button disables).
// ============================================================================

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { t } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { Ic } from './icons';
import { GM_BTN, GM_BTN_DANGER } from './styles';

/** 一列世界的客端視圖 / The client view of one world row */
interface WorldRow {
  id: string;
  name: string;
  currentRound: number;
  active: boolean;
}

interface WorldsPayload {
  worlds: WorldRow[];
  selectedId: string | null;
}

/** 待確認的動作 / The action awaiting confirmation */
type ConfirmMode = 'create' | 'reset' | 'delete';

export function WorldPicker({ isAdmin }: { isAdmin: boolean }) {
  const [switching, setSwitching] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmMode | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<WorldsPayload>({
    queryKey: ['worlds'],
    queryFn: async () => {
      const response = await apiFetch('/api/worlds');
      if (!response.ok) throw new Error('Failed to fetch worlds');
      return response.json();
    },
    staleTime: 60 * 1000,
  });

  const selectedId = data?.selectedId ?? null;
  const worlds = data?.worlds ?? [];
  const selected = worlds.find((w) => w.id === selectedId) ?? null;
  // 最後一個世界不能刪（伺服器也擋）：列表只剩一列時停用 🗑 /
  // The last world cannot be deleted (the server refuses too): disable 🗑 when the
  // list has a single row
  const deleteBlocked = worlds.length <= 1;

  const closeConfirm = () => {
    setConfirming(null);
    setNewName('');
  };

  const select = async (worldId: string) => {
    if (worldId === selectedId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await apiFetch('/api/worlds/select', {
        method: 'POST',
        body: JSON.stringify({ worldId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? 'Failed');
        setSwitching(false);
        return;
      }
      // cookie 已寫好 → 整頁重載：世界換了，每一個 query（世界狀態、事件、
      // 快照、檢查器）的語義都變了，逐一失效不如乾淨重來。
      // The cookie is set → reload: switching worlds changes the meaning of
      // every query (state, events, snapshots, inspector) — a clean reload
      // beats invalidating them one by one.
      window.location.reload();
    } catch {
      setError('Network error');
      setSwitching(false);
    }
  };

  const create = async () => {
    if (!newName.trim() || switching) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/worlds', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? 'Failed');
        setSwitching(false);
        return;
      }
      // 伺服器已把選擇 cookie 指向新世界 → 重載落到它身上 /
      // The server pointed the selection cookie at the new world → reload lands there
      window.location.reload();
    } catch {
      setError('Network error');
      setSwitching(false);
    }
  };

  const reset = async () => {
    if (!selectedId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/worlds/reset', {
        method: 'POST',
        body: JSON.stringify({ worldId: selectedId, confirm: true }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? 'Failed');
        setSwitching(false);
        return;
      }
      // 世界 id 不變、cookie 不變 → 重載後原地看見 round 1 /
      // The world id and the cookie are unchanged → reload shows round 1 in place
      window.location.reload();
    } catch {
      setError('Network error');
      setSwitching(false);
    }
  };

  const remove = async () => {
    if (!selectedId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/worlds', {
        method: 'DELETE',
        body: JSON.stringify({ worldId: selectedId, confirm: true }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? 'Failed');
        setSwitching(false);
        return;
      }
      // 若刪的是選中的世界，伺服器已清 cookie → 重載落到 active（預設）世界 /
      // If the deleted world was the selected one the server cleared the cookie →
      // the reload lands on the active (default) world
      window.location.reload();
    } catch {
      setError('Network error');
      setSwitching(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5">
      {/* 世界選擇。原生 <select> 在深色介面上樣式有限，但這裡要的是「能用、
          可鍵盤操作、mobile 不爆版面」，不是第二套控件系統。
          The world select. A native <select> is limited on dark surfaces, but
          what this needs is "works, keyboard-operable, does not break the mobile
          row" — not a second control system. */}
      <select
        aria-label={t('game.worldSelect')}
        title={t('game.worldSelect')}
        value={selectedId ?? ''}
        onChange={(e) => void select(e.target.value)}
        disabled={switching || worlds.length === 0}
        className="max-w-[9rem] sm:max-w-[11rem] rounded border border-cyan-400/25 bg-gray-950/90 px-2 py-1.5 text-xs font-display text-gray-200 outline-none focus:border-cyan-400/60 disabled:opacity-50"
      >
        {worlds.length === 0 && <option value="">—</option>}
        {worlds.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} · R{w.currentRound}
          </option>
        ))}
      </select>

      {isAdmin && confirming === null && (
        <>
          <button
            onClick={() => setConfirming('create')}
            disabled={switching}
            className={`${GM_BTN} px-2 py-1.5 text-xs`}
            title={t('game.worldNew')}
            aria-label={t('game.worldNew')}
          >
            <Ic className="w-3.5 h-3.5">
              <path d="M12 5v14M5 12h14" />
            </Ic>
          </button>
          <button
            onClick={() => setConfirming('reset')}
            disabled={switching || !selectedId}
            className={`${GM_BTN} px-2 py-1.5 text-xs`}
            title={t('game.worldReset')}
            aria-label={t('game.worldReset')}
          >
            <Ic className="w-3.5 h-3.5">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </Ic>
          </button>
          <button
            onClick={() => setConfirming('delete')}
            disabled={switching || !selectedId || deleteBlocked}
            className={`${GM_BTN} px-2 py-1.5 text-xs`}
            title={deleteBlocked ? t('game.worldLast') : t('game.worldDelete')}
            aria-label={t('game.worldDelete')}
          >
            <Ic className="w-3.5 h-3.5">
              <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
            </Ic>
          </button>
        </>
      )}

      {/* 兩段式確認面板：建新世界 / 重置 / 刪除共用同一個位置——三個動作都是
          「一鍵就毀掉東西」的等級，先攤開說明、再點確認，而不是 window.confirm。
          The two-step confirm panel: create / reset / delete share one slot — all
          three are one-click-destroys-things grade, so the consequence is laid out
          first and a second click confirms, instead of window.confirm. */}
      {isAdmin && confirming !== null && (
        <div className="absolute top-full right-0 mt-1 z-30 flex flex-col gap-1.5 rounded border border-cyan-400/30 bg-gray-950/95 p-2 shadow-lg">
          {confirming === 'create' ? (
            <>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create();
                  if (e.key === 'Escape') closeConfirm();
                }}
                placeholder={t('game.worldNamePlaceholder')}
                maxLength={100}
                className="w-36 rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan-400/60"
              />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => void create()}
                  disabled={!newName.trim() || switching}
                  className={`${GM_BTN} px-2 py-1 text-[11px]`}
                >
                  {t('game.worldCreate')}
                </button>
                <button
                  onClick={closeConfirm}
                  className={`${GM_BTN} px-2 py-1 text-[11px]`}
                >
                  {t('game.worldCancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="max-w-[15rem] text-[11px] leading-relaxed text-gray-300">
                {confirming === 'reset'
                  ? t('game.worldResetConfirm', { name: selected?.name ?? '' })
                  : t('game.worldDeleteConfirm', { name: selected?.name ?? '' })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => void (confirming === 'reset' ? reset() : remove())}
                  disabled={switching}
                  className={`${GM_BTN_DANGER} px-2 py-1 text-[11px]`}
                >
                  {confirming === 'reset'
                    ? t('game.worldResetGo')
                    : t('game.worldDeleteGo')}
                </button>
                <button
                  onClick={closeConfirm}
                  className={`${GM_BTN} px-2 py-1 text-[11px]`}
                >
                  {t('game.worldCancel')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute top-full right-0 mt-1 z-30 whitespace-nowrap rounded border border-red-500/30 bg-gray-950/95 px-2 py-1 text-xs text-red-300"
        >
          {error}
        </div>
      )}
    </div>
  );
}
