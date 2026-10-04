// ============================================================================
// 登入頁 / Sign-in Page
// ============================================================================
// Google 與「信箱＋密碼」兩種登入方式的入口。表單本身在 SignInForm.tsx（client
// component），這個檔案是 server component，只負責讀 session 以決定要不要顯示
// 「為現有帳號設定密碼」。
// The entry point for both Google and email + password sign-in. The form itself is in
// SignInForm.tsx (a client component); this file is a server component whose only job
// is to read the session so it can decide whether to offer "set a password on your
// existing account".
//
// 這裡**不**在 session 存在時把使用者轉走：已經登入的人來這個頁面，目的很可能正是
// 要替 Google 帳號補一組密碼，直接 redirect 會讓那條路徑沒有入口。
// It deliberately does **not** redirect an already signed-in visitor away: someone
// arriving here while signed in is most likely on their way to add a password to a
// Google account, and bouncing them would remove that path's only entry point.
// ============================================================================

import { auth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { EYEBROW, HAIRLINE, PANEL } from '@/components/home/tokens';
import { SignInForm } from './SignInForm';

export default async function SignInPage() {
  const session = await auth();

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
      {/* 背景 / backdrop: the same deep-space field the homepage uses */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(2,6,23,0.3)_0%,rgba(2,6,23,0.78)_55%,rgba(2,6,23,0.96)_100%),linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.7))]"
      />

      <div className="relative z-10 flex flex-col items-center">
        <p className={EYEBROW}>{t('general.title')}</p>
        <div className={`${HAIRLINE} mt-3`} />

        <div className={`${PANEL} mt-8 w-full max-w-md px-7 py-9`}>
          <SignInForm isSignedIn={Boolean(session?.user)} />
        </div>
      </div>
    </main>
  );
}