'use client';

// ============================================================================
// 登入 / 註冊表單 / Sign-in & registration form
// ============================================================================
// 同一張表單負責兩件事：信箱＋密碼登入，以及註冊。Google 登入是旁邊的另一條路。
// 已經登入的人會看到「為這個帳號設定密碼」—— 那是 Google 帳號取得密碼登入能力的
// 唯一安全路徑（見 set-password 路由的說明）。
// One form handles both password sign-in and registration; Google is the
// alternative path beside it. Someone already signed in is offered "add a password
// to this account" — the only safe way for a Google account to gain password sign-in
// (see the note in the set-password route).
//
// 語言 / Language
// `setLocale()` 會重新載入頁面，所以這裡不需要訂閱語言變更；在 render 時呼叫 `t()`
// 就足以取得當下正確的字串。
// `setLocale()` reloads the page, so there is nothing to subscribe to here — calling
// `t()` during render is enough to get the current strings.
// ============================================================================

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
// 密碼規則必須從**無依賴**的模組來：這個檔案是 client component，而 argon2 在
// package.json 宣告了 `browser: browser.js`，只要 client 連帶 import 到 argon2，
// webpack 就會去解析那個需要未安裝的 wasm 套件的檔案，整頁 500。
// The password rule must come from a **dependency-free** module: this file is a client
// component, and argon2 declares `browser: browser.js`, so a client that transitively
// imports argon2 makes webpack resolve a file needing an uninstalled wasm package —
// which 500s the whole page.
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

/** 表單欄位 / a form field */
const FIELD =
  'w-full min-h-11 rounded-ds-control border border-ds-line bg-white/[0.04] px-3.5 ' +
  'text-[0.9375rem] text-slate-100 placeholder:text-slate-500 outline-none ' +
  'transition-colors duration-200 focus:border-cyan-400/70 focus:bg-white/[0.07]';

/** 標籤 / a label */
const LABEL = 'block text-xs font-medium tracking-[0.08em] text-slate-400 uppercase';

/** 主要按鈕 / the primary submit button */
const SUBMIT =
  'w-full min-h-11 rounded-ds-control bg-gradient-to-r from-cyan-500 to-blue-600 ' +
  'font-orbitron text-[0.9375rem] font-bold tracking-[0.06em] text-[#020617] ' +
  'transition-[box-shadow,transform] duration-[260ms] ease-ds hover:-translate-y-px ' +
  'hover:shadow-[0_0_30px_rgba(34,211,238,0.35)] disabled:cursor-not-allowed ' +
  'disabled:opacity-60 disabled:hover:translate-y-0';

/** 次要按鈕（Google）/ the secondary Google button */
const SECONDARY =
  'w-full min-h-11 rounded-ds-control border border-cyan-500/30 bg-cyan-500/5 ' +
  'px-6 text-[0.9375rem] font-medium text-cyan-200 transition-colors duration-200 ' +
  'hover:border-cyan-400/60 hover:bg-cyan-500/15 hover:text-cyan-100';

/** 分隔線與文字 / the "or" divider */
const DIVIDER =
  'flex items-center gap-3 text-xs tracking-[0.2em] text-slate-500 uppercase';

export function SignInForm({ isSignedIn }: { isSignedIn: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (isSignedIn) {
        // 已登入 → 為現有（Google）帳號補一組密碼 /
        // Already signed in → add a password to the existing (Google) account
        const response = await fetch('/api/auth/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(data?.error ?? t('general.error'));
          return;
        }
        setNotice(t('auth.successSetPassword'));
        setPassword('');
        return;
      }

      if (mode === 'register') {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(data?.error ?? t('general.error'));
          return;
        }
        setNotice(t('auth.successRegister'));
      }

      // 註冊成功後直接用剛建立的密碼登入，省掉使用者再輸入一次 /
      // After registering, sign in straight away with the password just set, so the
      // visitor does not type it twice
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(t('general.error'));
        return;
      }
      router.push('/game');
      router.refresh();
    } catch {
      setError(t('general.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* 分頁：登入／註冊（已登入時不需要切換）/ Tabs: sign in / register (hidden when
          already signed in, since the form then only sets a password) */}
      {!isSignedIn && (
        <div
          role="tablist"
          aria-label={t('auth.signInTitle')}
          className="mb-6 grid grid-cols-2 gap-1 rounded-ds-control border border-ds-line bg-white/[0.03] p-1"
        >
          {(['signin', 'register'] as const).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
                setNotice(null);
              }}
              className={
                mode === value
                  ? 'min-h-11 rounded-[0.4rem] bg-cyan-500/15 font-orbitron text-xs font-bold tracking-[0.12em] text-cyan-300 uppercase transition-colors duration-200'
                  : 'min-h-11 rounded-[0.4rem] font-orbitron text-xs font-bold tracking-[0.12em] text-slate-400 uppercase transition-colors duration-200 hover:text-slate-200'
              }
            >
              {value === 'signin' ? t('auth.signInTab') : t('auth.registerTab')}
            </button>
          ))}
        </div>
      )}

      <h1 className="font-orbitron text-2xl font-bold tracking-wide text-white">
        {isSignedIn
          ? t('auth.setPassword')
          : mode === 'signin'
            ? t('auth.signInTitle')
            : t('auth.registerTitle')}
      </h1>
      <p className="mt-1.5 text-sm text-slate-400">
        {isSignedIn ? t('auth.setPasswordHint') : ''}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {!isSignedIn && (
          <div>
            <label className={LABEL} htmlFor="auth-email">
              {t('auth.email')}
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              className={`${FIELD} mt-1.5`}
            />
          </div>
        )}

        {mode === 'register' && !isSignedIn && (
          <div>
            <label className={LABEL} htmlFor="auth-name">
              {t('auth.name')}
            </label>
            <input
              id="auth-name"
              name="name"
              type="text"
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.namePlaceholder')}
              className={`${FIELD} mt-1.5`}
            />
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor="auth-password">
            {t('auth.password')}
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            // 登入時不要提示長度下限，那是註冊的規則；兩者共用同一個欄位 /
            // Don't hint the minimum on sign-in — that is a registration rule, and this
            // one field serves both
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'register' ? PASSWORD_MIN_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${FIELD} mt-1.5`}
          />
          {mode === 'register' && !isSignedIn && (
            <p className="mt-1.5 text-xs text-slate-500">
              {t('auth.passwordHint')}
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-ds-control border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-ds-control border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
          >
            {notice}
          </p>
        )}

        <button type="submit" disabled={busy} className={SUBMIT}>
          {busy
            ? t('auth.submitting')
            : isSignedIn
              ? t('auth.setPassword')
              : mode === 'signin'
                ? t('auth.signIn')
                : t('auth.register')}
        </button>
      </form>

      {!isSignedIn && (
        <>
          <div className={`${DIVIDER} my-6`}>
            <span className="h-px flex-1 bg-[var(--ds-line)]" />
            <span>{t('auth.orDivider')}</span>
            <span className="h-px flex-1 bg-[var(--ds-line)]" />
          </div>

          <button
            type="button"
            onClick={() => signIn('google')}
            className={SECONDARY}
          >
            {t('auth.continueWithGoogle')}
          </button>

          <p className="mt-6 text-center text-sm text-slate-400">
            {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'register' : 'signin');
                setError(null);
                setNotice(null);
              }}
              className="font-medium text-cyan-300 underline underline-offset-4 transition-colors duration-200 hover:text-cyan-100"
            >
              {mode === 'signin' ? t('auth.registerTab') : t('auth.signInTab')}
            </button>
          </p>
        </>
      )}
    </div>
  );
}