#!/usr/bin/env node
// ==============================================================================
// 主頁英雄區影片擷取 / Homepage hero video capture
// Records the live game screen (Sigma map + interactions), then transcodes it
// to public/hero.mp4, which the homepage <video> element plays as its
// background. Playwright's .webm output is a temp-dir intermediate only — it is
// never written to public/.
// 錄製遊戲畫面後轉成 public/hero.mp4 供首頁 <video> 播放；Playwright 的 .webm
// 只留在暫存目錄，不會進 public/。
//
// Usage:
//   1. Dev server must be running:  pnpm dev   (http://localhost:3000)
//   2. node scripts/capture-hero.mjs   (or: pnpm capture:hero)
//
// How auth works here: the game uses Auth.js JWT sessions (salt = cookie name
// "authjs.session-token"), so we forge a session cookie locally with AUTH_SECRET
// from .env — no Google login needed. /Usage of ADMIN_EMAIL grants the ▶ run-round
// button so the choreography can advance rounds and fill the event log.
// ==============================================================================

import { chromium } from 'playwright';
import { encode } from 'next-auth/jwt';
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3000';
const W = 1280;
const H = 720;
const VIDEO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-capture-'));
// Playwright can only record webm, so it stays an intermediate in the temp
// dir and never lands in public/ — the shipped asset is the mp4 alone.
// Playwright 只能錄 webm，所以它留在暫存目錄當中間檔，不進 public/；
// 對外只出 mp4。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Forge session cookie / 仿造 session cookie ──────────────────────────────
async function forgeSessionCookie() {
  const secret = process.env.AUTH_SECRET;
  const adminEmail = (process.env.ADMIN_EMAIL ?? '').split(',')[0].trim().toLowerCase();
  if (!secret) throw new Error('AUTH_SECRET missing in .env');
  if (!adminEmail) throw new Error('ADMIN_EMAIL missing in .env');

  const value = await encode({
    token: {
      name: 'Hero Recorder',
      email: adminEmail,
      sub: 'hero-recorder',
    },
    secret,
    // salt must equal the cookie name — Auth.js derives the encryption key from it
    salt: 'authjs.session-token',
    maxAge: 60 * 60 * 2, // 2h is plenty for a capture run
  });
  return { name: 'authjs.session-token', value, adminEmail };
}

// ── 2. Choreography / 運鏡腳本 ─────────────────────────────────────────────────
async function choreograph(page) {
  // 側欄頁籤與地點列都用 data-testid。**不要**改用 class 名稱或 emoji。
  //
  // 這兩個選擇器都因為 UI 改版而失效過，而腳本只會印一行 WARN 就安靜地少拍一段，
  // 沒有任何東西會看得出來：
  //   - `div.fixed.z-50 h3.font-orbitron` —— 地點詳情不再是浮動彈出視窗（改成側欄分頁
  //     內容），而且 `font-orbitron` 早就改名成 `font-display`。
  //   - `button` + hasText '📜' —— 換個圖示就會壞。
  //
  // Both of these selectors broke on a UI change, and the script only ever printed one
  // WARN line and quietly recorded a shorter video with nothing to notice it by:
  //   - `div.fixed.z-50 h3.font-orbitron` — the place detail stopped being a floating popup
  //     (it became side-panel tab content), and `font-orbitron` had already been renamed to
  //     `font-display`.
  //   - `button` + hasText '📜' — swapping the icon breaks it.
  const placeDetail = page.locator('[data-testid="place-detail"]');
  const placeRow = page.locator('[data-testid="place-list-row"]').first();
  const tab = (key) => page.locator(`[data-testid="side-tab-${key}"]`).first();
  const zoomIn = page.locator('button[aria-label*="Zoom in"]').first();
  const zoomOut = page.locator('button[aria-label*="Zoom out"]').first();
  const reset = page.locator('button[aria-label*="Reset view"]').first();
  const nextRound = page.locator('button', { hasText: '下一回合' }).first();

  // Load the game screen, wait for Sigma canvas + data query
  console.log('[capture] loading /game …');
  await page.goto(`${BASE}/game`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await sleep(3000); // initial render, worldState query, layout settle
  await page.screenshot({ path: path.join(VIDEO_DIR, 'shot-load.png') });

  // 1) Slow pan across the map / 平移地圖
  console.log('[capture] pan …');
  await page.mouse.move(700, 420);
  await page.mouse.down();
  await page.mouse.move(560, 380, { steps: 12 });
  await page.mouse.move(430, 330, { steps: 24 });
  await page.mouse.up();
  await sleep(600);

  // 2) Wheel zoom in / 滾輪放大
  console.log('[capture] wheel zoom …');
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -220);
    await sleep(200);
  }
  await sleep(700);

  // 3) Camera buttons (the new ⟳ / + / − controls) / 相機控制按鈕
  console.log('[capture] camera buttons …');
  await zoomIn.click().catch(() => {});
  await sleep(600);
  await zoomOut.click().catch(() => {});
  await zoomOut.click().catch(() => {});
  await sleep(500);
  await reset.click().catch(() => {});
  await sleep(1100);

  // 4) 地點詳情 —— 它現在是側欄的「地點」分頁內容，不再是蓋在地圖上的浮動彈出視窗。
  //    走 DOM（頁籤 → 清單第一列）而不是點地圖座標：節點是畫在 canvas 上的，命中率
  //    取決於世界資料與版面，舊腳本那 18 個硬編碼座標本來就只是猜的。
  //
  //    4) Place detail — it is the 地點 side-panel tab's content now, not a floating popup
  //    over the map. Drive it through the DOM (tab, then the first list row) rather than
  //    map coordinates: the nodes are painted on a canvas, so hit-testing depends on the
  //    world data and layout, and the old script's 18 hardcoded points were only ever guesses.
  console.log('[capture] place detail …');
  let opened = false;
  try {
    await tab('places').click({ timeout: 10_000 });
    await sleep(1200);
    await placeRow.click({ timeout: 10_000 });
    await placeDetail.waitFor({ state: 'visible', timeout: 10_000 });
    opened = true;
  } catch (e) {
    console.log('[capture] WARN place detail did not open:', e.message);
  }
  if (opened) {
    console.log('[capture] place detail open, dwelling …');
    await sleep(2400);
    await page.screenshot({ path: path.join(VIDEO_DIR, 'shot-place-detail.png') });
    // 用面板自己的 ✕ 關閉。舊腳本點 (24,24) 的背景，但浮動彈出視窗早就沒有了，
    // 那一下點到的是地圖。
    //
    // Close via the panel's own ✕. The old script clicked (24,24) expecting a backdrop;
    // the floating popup was long gone, so that click landed on the map.
    await tab('places').click().catch(() => {});
    await sleep(900);
  }

  // 5) Run 2 rounds (admin button) → event log fills / 執行 2 個回合
  console.log('[capture] running rounds …');
  for (let i = 0; i < 2; i++) {
    try {
      const respP = page.waitForResponse(
        (r) => r.url().includes('/api/admin/run-round') && r.request().method() === 'POST',
        { timeout: 40_000 },
      );
      await nextRound.click({ timeout: 10_000 });
      // 回合計算約 14 秒：期間輕輕來回平移鏡頭，避免影片卡在靜止畫面
      // The round takes ~14s to compute: drift the camera back and forth so
      // the recording doesn't sit on a frozen frame
      for (let k = 0; k < 24; k++) {
        const arrived = await Promise.race([
          respP.then(() => true),
          sleep(900).then(() => false),
        ]);
        if (arrived) break;
        const dir = k % 4 < 2 ? -1 : 1;
        await page.mouse.move(620, 420);
        await page.mouse.down();
        await page.mouse.move(620 + dir * 45, 400 + (k % 2) * 30, { steps: 18 });
        await page.mouse.up();
      }
      const resp = await respP;
      if (!resp.ok()) console.log(`[capture] WARN run-round HTTP ${resp.status()}`);
      else console.log(`[capture] round ${i + 1} done`);
      await sleep(1400); // 停留觀看更新後的 RND 與地圖 / dwell on the updated RND + map
    } catch (e) {
      console.log(`[capture] WARN round ${i + 1} skipped: ${e.message}`);
      break;
    }
  }

  // 6) Events tab → fresh events from the runs / 事件分頁 → 剛執行回合的最新事件
  // (stats tab skipped: RoundSnapshots only exist at interval milestones,
  //  so the chart would read "此回合尚無資料" during early rounds)
  console.log('[capture] events tab …');
  await tab('events').click({ timeout: 10_000 }).catch(() => {});
  await sleep(2400);
  await page.screenshot({ path: path.join(VIDEO_DIR, 'shot-events.png') });
  await sleep(1800);

  // 7) Final wide shot / 結尾拉回全景
  console.log('[capture] final reset …');
  await reset.click().catch(() => {});
  await sleep(600);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 180);
    await sleep(220);
  }
  await sleep(1400);
  await page.screenshot({ path: path.join(VIDEO_DIR, 'shot-end.png') });
}

// ── 3. Main / 主流程 ───────────────────────────────────────────────────────────
async function main() {
  const cookie = await forgeSessionCookie();
  console.log(`[capture] forged session for ${cookie.adminEmail}`);

  const browser = await chromium.launch({
    headless: true,
    // Chrome 137+ blocks software WebGL unless explicitly allowed
    // Chrome 137+ 預設封鎖軟體 WebGL，需顯式允許
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      locale: 'zh-TW',
      recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
    });
    await context.addCookies([
      {
        ...cookie,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await choreograph(page);

    const video = page.video();
    await context.close(); // finalizes the .webm on disk
    const webmPath = await video.path();

    const size = fs.statSync(webmPath).size;
    console.log(`[capture] recorded webm ${(size / 1024 / 1024).toFixed(2)} MB (temp intermediate)`);

    // Transcode webm → mp4 (H.264, universal playback) + poster frame
    // 轉檔為 mp4（H.264，全瀏覽器通用）與海報幀
    const OUT_MP4 = path.resolve('public', 'hero.mp4');
    const OUT_POSTER = path.resolve('public', 'hero-poster.jpg');
    fs.mkdirSync(path.dirname(OUT_MP4), { recursive: true });
    console.log('[capture] transcoding mp4 …');
    const mp4 = spawnSync(
      ffmpeg.path,
      ['-y', '-i', webmPath, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT_MP4],
      { encoding: 'utf8' },
    );
    if (mp4.status !== 0) {
      console.log('[capture] WARN mp4 transcode failed:', (mp4.stderr ?? '').slice(-400));
    } else {
      console.log(`[capture] saved ${OUT_MP4} (${(fs.statSync(OUT_MP4).size / 1024 / 1024).toFixed(2)} MB)`);
      const poster = spawnSync(
        ffmpeg.path,
        ['-y', '-ss', '2', '-i', OUT_MP4, '-frames:v', '1', '-q:v', '3', OUT_POSTER],
        { encoding: 'utf8' },
      );
      if (poster.status === 0) console.log(`[capture] saved ${OUT_POSTER}`);
      else console.log('[capture] WARN poster frame failed:', (poster.stderr ?? '').slice(-400));
    }
    console.log(`[capture] artifacts: ${VIDEO_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[capture] FAILED:', err);
  process.exitCode = 1;
});
