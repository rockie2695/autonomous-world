// ============================================================================
// 君王號令（純邏輯）/ King's signal policy (pure)
// ============================================================================
// 君王的**性格**（spending.ts 的 posture，與消費同一份推導）決定他對勢力下什麼
// 號令：武人王開戰、守將王馳援、商人王少下令、均衡王只打贏面大的。發令側一直
// 沒有實作——信號表從未被寫入，aiMove 的接令行軍等的是一個永遠不會來的號令。
//
// The king's **posture** (spending.ts — the same derivation his spending uses)
// decides what he commands the faction to do: an aggressive king attacks, a
// guardian relieves, a merchant rarely calls, a balanced one only fights winnable
// borders. The issuing side never existed — the Signal table was never written,
// and aiMove's rally marching waited on a signal that could never come.
//
// 輸入都是**算好的數字**：自家族地的攻防差（margin = 估計防禦 − 相鄰敵將最強
// 估計攻擊，warEstimate.ts）與邊界敵地的估計防禦。純函式不碰資料庫，node 下可測。
// The inputs are **computed numbers**: each own place's margin (estimated defence
// minus the strongest adjacent hostile leader's estimated attack, warEstimate.ts)
// and each border enemy place's estimated defence. Pure, no database, testable
// under node.
// ============================================================================

import { CONFIG } from '@/lib/gameConfig';
import type { SpendingPosture } from '@/lib/spending';

/** 號令的意圖 / What the signal asks the host to do */
export type SignalIntent = 'attack' | 'defend';

/** 君王號令決策的輸入 / What the policy needs to decide */
export interface KingSignalInput {
  posture: SpendingPosture;
  /**
   * 自家每一個地方：margin = 估計防禦 − 相鄰敵將最強估計攻擊。越負越危急 /
   * Each own place: margin = estimated defence minus the strongest adjacent hostile
   * leader's estimated attack. More negative = more urgent.
   */
  ownMargins: ReadonlyArray<{ placeId: string; margin: number }>;
  /**
   * 邊界敵地（與任一自家地方相鄰的敵對地方）的估計防禦 /
   * Border enemy places (hostile places adjacent to any own place) with their
   * estimated defence.
   */
  borderTargets: ReadonlyArray<{ placeId: string; defence: number }>;
  /** 勢力裡最強將領的估計攻擊（均衡王的可勝門檻用）/ The faction's strongest leader's estimated attack (the balanced king's feasibility bar) */
  strongestAttack: number;
}

/** 號令決策 / What the king commands */
export interface KingSignalDecision {
  intent: SignalIntent;
  targetPlaceId: string;
}

/**
 * 君王的號令。回 `null` = 這個回合不發號。
 * The king's signal. `null` = no call this round.
 *
 * - 危急自家的地方（margin < 0）**永遠**優先馳援——任何性格的君王都不會眼看城池
 *   要丟還去開新戰線 /
   - A place about to fall (margin < 0) is **always** relieved first — no king of any
   posture opens a new front while a city is falling
 * - 沒有危急時：武人王進攻最弱的邊界；守將王與商人王按兵不動（商人王少下令是
 *   靠**雙倍冷卻**，在呼叫端處理）；均衡王只在他**有人贏得動**的邊界開戰
 *   （最弱邊界防禦 ≤ 最強將領估計攻擊 ÷ AI_ATTACK_ADVANTAGE——與 aiMove 同一
 *   道門檻）/
   - With nothing urgent: the aggressive king attacks the weakest border; the
   guardian and merchant stand down (the merchant calls less often via a **doubled
   cooldown**, applied by the caller); the balanced king attacks only a border
   **someone can actually take** (weakest border defence ≤ strongest leader's
   estimated attack ÷ AI_ATTACK_ADVANTAGE — the same bar aiMove uses)
 */
export function kingSignal(input: KingSignalInput): KingSignalDecision | null {
  const { posture, ownMargins, borderTargets, strongestAttack } = input;

  // 最危急的地方：margin 最小者；平手用 placeId 裁決——**必須**確定性，同一個
  // 種子長同一個世界 /
  // The most urgent place: the smallest margin; ties break by placeId — the choice
  // must be deterministic, one seed one world
  const mostUrgent = [...ownMargins].sort(
    (a, b) => a.margin - b.margin || a.placeId.localeCompare(b.placeId)
  )[0];
  const threatened = mostUrgent !== undefined && mostUrgent.margin < 0;

  if (threatened && mostUrgent) {
    return { intent: 'defend', targetPlaceId: mostUrgent.placeId };
  }

  // 邊界目標：估計防禦最低者；同樣用 placeId 裁決平手 /
  // Border target: the lowest estimated defence; ties break by placeId the same way
  const weakestBorder = [...borderTargets].sort(
    (a, b) => a.defence - b.defence || a.placeId.localeCompare(b.placeId)
  )[0];
  if (!weakestBorder) return null;

  switch (posture) {
    case 'aggressive':
      return { intent: 'attack', targetPlaceId: weakestBorder.placeId };
    case 'guardian':
    case 'merchant':
      return null;
    case 'balanced':
      // 只打贏面大的：邊界防禦要過得了「最強將領 ÷ 開打門檻」這一關 /
      // Only a winnable border: its defence must clear the strongest leader divided
      // by the engagement bar
      return weakestBorder.defence <=
        strongestAttack / CONFIG.AI_ATTACK_ADVANTAGE
        ? { intent: 'attack', targetPlaceId: weakestBorder.placeId }
        : null;
  }
}
