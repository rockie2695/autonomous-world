'use client';

// ============================================================================
// 首屏產品影片 / The hero's product recording
// ============================================================================
// 一支無限循環、muted 的裝飾性錄影。無障礙指引要求「自動播放超過五秒的動態」
// 必須能被停止，而專案自己的規則是「每個迴圈離開視口就暫停」；這支元件把兩條
// 都補上，而且只用一個 IntersectionObserver + 一次 useStillness，沒有新的迴圈。
//
// An endless muted decorative recording. The web interface guidelines require
// autoplay motion that runs past five seconds to be stoppable, and this project's
// own rule is that every loop pauses off-screen; this component does both with
// one IntersectionObserver and the shared stillness detector — no new frame loop.
//
// **不要用 useReducedMotion 直接分支**：伺服器上沒有 matchMedia，第一筆渲染就
// 分歧會讓 hydration 屬性不匹配。useStillness 是確定性偵測（第一筆渲染兩端一
// 致，掛載後才讀設定），與 Reveal / Parallax 同一條規則。
// Do **not** branch on useReducedMotion: matchMedia does not exist on the server,
// so the first render would differ and hydration attributes would mismatch.
// useStillness is the deterministic detector (identical first render, preference
// read after mount) — the same rule Reveal / Parallax follow.
//
// 靜態偏好下仍會有一帧的播放：autoPlay 必須留在伺服器輸出裡，否則沒有 JS 的
// 使用者會看到一張永遠不動的海報。一帧的代價比這小。
// One frame of playback still happens under the static preference: autoPlay has
// to stay in the server output, or a no-JS visitor gets a poster that never
// moves. That trade is cheaper.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useStillness } from './Motion';

type HeroVideoProps = {
  /** 錄影本體 / the recording itself */
  src: string;
  /** 量測過的 16:9 海報 / the measured 16:9 poster */
  poster: string;
  /** 影片元素的類別 / the video element's classes */
  className?: string;
};

export default function HeroVideo({ src, poster, className }: HeroVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const still = useStillness();

  // 兩個條件（靜態偏好、是否在視口內）共用同一個判斷：寫成兩支 effect 會讓同一個
  // 「該不該播」有兩個寫入者，而且觀察器會因為 still 變一次就整個重建一次。
  // Both conditions (the static preference and visibility) feed one decision:
  // two effects would give the same "should it play" question two writers, and
  // rebuild the observer every time `still` flips.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // play() 在任何「使用者手勢前就被暫停」的情境下會 reject（例如省電模式），
    // 那是預期行為，不是錯誤——吞掉它，不要讓它變成未處理的 rejection。
    // play() rejects whenever playback is blocked before a gesture (battery
    // saver, for one). That is expected, not an error: swallow it rather than
    // letting it surface as an unhandled rejection.
    const onScreen = { current: true };
    const apply = () => {
      if (still || !onScreen.current) video.pause();
      else void video.play().catch(() => {});
    };

    // 靜態偏好：停下來，就停在當下那一帧（不重設 currentTime）
    // The static preference: stop, and stay on whichever frame it reached
    apply();

    // 離開視口就暫停，回來再跑（專案對每個迴圈的要求）
    // Off-screen pauses, back-on-screen resumes (the project's rule for every loop)
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      onScreen.current = entry.isIntersecting;
      apply();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [still]);

  return (
    // 裝飾性媒體：整段對輔助科技隱藏，名稱由旁邊的標題承載
    // Decorative media: hidden from assistive tech; the heading beside it names it
    <video
      ref={ref}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
