import { computeContracts, computeRewards, type Contract, type PlannerData, type Reward } from '../core/economy';
import { post } from '../core/ledger';
import type { GameState } from '../core/state';

/**
 * Pont avec le planning (même site => même stockage du navigateur).
 * Le jeu ne modifie JAMAIS les tâches : il lit, puis inscrit les récompenses dans SON registre.
 */
const PLANNER_KEY = 'planning.v1';

export function readPlanner(): PlannerData & { xp: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANNER_KEY) || 'null');
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
    const events = Array.isArray(raw?.events) ? raw.events : [];
    const xp = events.reduce((a: number, e: { xp?: number }) => a + (e.xp || 0), 0);
    return { tasks, events, xp };
  } catch { return { tasks: [], events: [], xp: 0 }; }
}

export interface SyncResult { added: Reward[]; contracts: Contract[]; xp: number }

/** Inscrit dans le registre toutes les récompenses dues et pas encore inscrites (idempotent). */
export function syncFromPlanner(s: GameState, now = Date.now()): SyncResult {
  const data = readPlanner();
  const added: Reward[] = [];
  for (const r of computeRewards(data, now)) {
    if (post(s.ledger, r.key, r.amount, r.reason, r.at)) added.push(r);
  }
  return { added, contracts: computeContracts(data, new Set(s.claimed), now), xp: data.xp };
}

/** Prévient quand le planning change (autre onglet) + vérification régulière (délai d'annulation). */
export function watchPlanner(onChange: () => void) {
  addEventListener('storage', e => { if (e.key === PLANNER_KEY) onChange(); });
  addEventListener('focus', onChange);
  setInterval(onChange, 15_000);
}
