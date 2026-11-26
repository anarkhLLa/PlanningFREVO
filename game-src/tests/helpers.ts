import { computeRewards, type PlannerData } from '../src/core/economy';
import { post } from '../src/core/ledger';
import type { GameState } from '../src/core/state';

/** Même logique que game/bridge.ts, sans accès au navigateur. */
export function syncFromPlannerData(s: GameState, data: PlannerData, now: number) {
  for (const r of computeRewards(data, now)) post(s.ledger, r.key, r.amount, r.reason, r.at);
}
