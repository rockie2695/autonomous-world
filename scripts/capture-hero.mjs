#!/usr/bin/env node
// ==============================================================================
// 主頁英雄區影片擷取 / Homepage hero video capture
// Records the live game screen (Sigma map + interactions) to a .webm file,
// which the homepage <video> element plays as its background.
//
// Usage:
//   1. Dev server must be running:  pnpm dev   (http://localhost:3000)
//   2. node scripts/capture-hero.mjs
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
const OUT_WEBM = path.resolve('public', 'hero.webm');

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
  const popup = page.locator('div.fixed.z-50 h3.font-orbitron').first();
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

  // 4) Click a place node → detail popup / 點擊地點開啟詳情
  console.log('[capture] place popup …');
  // Coordinates read from shot-load.png (post-reset view = default camera view)
  // 座標取自 shot-load.png（reset 後的預設視圖與載入時相同）
  const points = [
    [730, 585], // 龜水 — 王的大節點，命中率最高 / king node, largest hit area
    [642, 344], [641, 412], [645, 449], [650, 500], [660, 550], // 中央鏈 / center chain
    [575, 284], [550, 314], [533, 409], [512, 448], [494, 494], // 左側 / left branches
    [717, 160], [745, 215], [744, 275], [860, 320], [875, 250], // 上方群/右鏈 / top + right
    [530, 605], [620, 634], [668, 634], // 底部迴圈 / bottom loop
  ];
  let opened = false;
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    await sleep(650);
    opened = await popup.isVisible().catch(() => false);
    if (opened) break;
  }
  if (opened) {
    console.log('[capture] popup opened, dwelling …');
    await sleep(2200);
    await page.screenshot({ path: path.join(VIDEO_DIR, 'shot-popup.png') });
    await page.mouse.click(24, 24); // dismiss via backdrop / 點背景關閉
    await sleep(700);
  } else {
    console.log('[capture] WARN: no place popup opened, skipping');
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
  await page.locator('button', { hasText: '📜' }).first().click().catch(() => {});
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

    fs.mkdirSync(path.dirname(OUT_WEBM), { recursive: true });
    fs.copyFileSync(webmPath, OUT_WEBM);
    const size = fs.statSync(OUT_WEBM).size;
    console.log(`[capture] saved ${OUT_WEBM} (${(size / 1024 / 1024).toFixed(2)} MB)`);

    // Transcode webm → mp4 (H.264, universal playback) + poster frame
    // 轉檔為 mp4（H.264，全瀏覽器通用）與海報幀
    const OUT_MP4 = path.resolve('public', 'hero.mp4');
    const OUT_POSTER = path.resolve('public', 'hero-poster.jpg');
    console.log('[capture] transcoding mp4 …');
    const mp4 = spawnSync(
      ffmpeg.path,
      ['-y', '-i', OUT_WEBM, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
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
