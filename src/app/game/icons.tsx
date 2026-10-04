'use client';

// ============================================================================
// 圖示 / Icons（統一 1.5px 線寬、24 viewBox，不使用 emoji）
// ============================================================================
// 抽出來是因為頁面本體、事件日誌與統計圖表都要用到圖示；集中在一個模組才不會
// 三處各寫一份。
// Extracted because the page, the event log and the stats charts all need icons;
// keeping one copy stops the three from drifting apart.
// ============================================================================

import type { ReactNode } from 'react';
// ─── 圖示 / Icons（統一 1.5px 描邊、24 viewBox，不使用 emoji）─────────────────

export function Ic({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function Crown({ className, label }: { className?: string; label: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path d="M4.5 8.5 8.5 12 12 6l3.5 6 4-3.5L18 17H6z" />
    </svg>
  );
}

export function EventGlyph({ type }: { type: string }) {
  let body: ReactNode;
  switch (type) {
    case 'PLACE_CREATED':
    case 'PLACE_CAPTURED':
      body = (
        <>
          <path d="M12 21c4-4.5 6.5-7.7 6.5-11a6.5 6.5 0 1 0-13 0c0 3.3 2.5 6.5 6.5 11Z" />
          <circle cx="12" cy="10" r="2.4" />
        </>
      );
      break;
    case 'CHARACTER_SPAWNED':
    case 'ADMIN_ASSIGNED':
    case 'ADMIN_REMOVED':
    case 'AMBITION_RECOVERED':
      body = (
        <>
          <circle cx="12" cy="8.5" r="3.2" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
        </>
      );
      break;
    case 'CHARACTER_MOVED':
      body = <path d="M5 12h14M13 6l6 6-6 6" />;
      break;
    case 'DEATH':
    case 'BATTLE_DEATH':
      body = (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="m9.5 9.5 5 5m0-5-5 5" />
        </>
      );
      break;
    case 'ESCAPE_SUCCESS':
      body = (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M8 12h8m-3-3 3 3-3 3" />
        </>
      );
      break;
    case 'DEFECTION':
      body = (
        <>
          <path d="M6 21V4" />
          <path d="M6 5h11l-2.2 3.5L17 12H6z" />
        </>
      );
      break;
    case 'FACTION_COLLAPSE':
    case 'FACTION_ELIMINATED':
      body = (
        <>
          <path d="M12 4.5 21 20H3z" />
          <path d="M12 10.5v4M12 17.2h.01" />
        </>
      );
      break;
    case 'BUILDING_UPGRADE':
      body = (
        <>
          <rect x="5" y="9" width="14" height="11.5" rx="1.5" />
          <path d="M9 9V5.5h6V9" />
        </>
      );
      break;
    default:
      body = <circle cx="12" cy="12" r="3.2" />;
  }
  return <Ic className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400/75">{body}</Ic>;
}
