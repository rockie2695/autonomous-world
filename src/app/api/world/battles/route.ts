// ============================================================================
// API 路由 — 一個地方的戰爭出手紀錄 / API Route — a place's war strike log
// ============================================================================
// 戰報彈窗的戰爭回放資料來源：回傳該地方**所有**的出手紀錄（按回合、出手順序排好），
// 用戶端自行分組出戰爭（連續回合＝同一場戰爭）。
//
// The war replay's data source for the battle report: returns **all** strikes at the
// place (ordered by round, then strike order); the client groups them into wars (a
// contiguous run of rounds = one war).
//
// 直接查 `BattleStrike` 表（**不依賴快照**）——歷史回合也能回放。
// Reads the `BattleStrike` table directly (**no snapshot dependency**) — historical
// rounds replay too.
//
// GET /api/world/battles?placeId=…
// 回應 / Response: { strikes: BattleStrike[] }
// ============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const BattlesQuerySchema = z.object({
  placeId: z.string().min(1),
});

export async function GET(request: Request) {
  // 檢查認證 / Check authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = BattlesQuerySchema.safeParse({
    placeId: url.searchParams.get('placeId') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const strikes = await prisma.battleStrike.findMany({
    where: { placeId: parsed.data.placeId },
    orderBy: [{ round: 'asc' }, { seq: 'asc' }],
  });

  return NextResponse.json({ strikes });
}
