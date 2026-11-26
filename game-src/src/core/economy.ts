import { GameConfig } from './config';
import { hashSeed, mulberry32 } from './rng';

/**
 * Moteur de récompenses et de contrats (cahier, parties 4 à 7 et 24).
 *
 * Principe : tout est DÉDUIT des données du planning (tâches + journal d'événements, déjà
 * synchronisés entre appareils). Chaque récompense porte une clé stable et unique : la recalculer,
 * la resynchroniser ou rouvrir une tâche ne crée jamais de capsule en plus.
 * Ce fichier est pur (aucun accès navigateur) : il est compilé aussi pour le planning (economy.js).
 */

export type Difficulty = 'small' | 'medium' | 'hard';

export const EconomyConfig = {
  /** Seuls les événements postérieurs à l'activation du jeu rapportent (décision du 26/11). */
  activatedAt: Date.UTC(2026, 10, 26, 4, 0),
  /** Délai avant de compter un événement : laisse le temps au bouton « Annuler » du planning. */
  graceMs: 10_000,
  /** Démarrage validé après 3 min (cahier 4.3). */
  startMinMs: 3 * 60_000,
  rewards: { start: 10, small: 25, medium: 60, hard: 100, earlybird: 15 } as Record<string, number>,
  /** Bonus d'exécution rapide (en % de la récompense de fin) : fini en un clic, ou commencé et fini le même jour. */
  fastBonusPct: 20,
  /** Étapes intermédiaires (prochaine action faite) : prises dans l'enveloppe de la tâche, 3 max. */
  step: { amount: 5, max: 3 },
  /** Tâche étalée sur plusieurs jours : chaque journée faite verse une part de l'enveloppe. */
  slotShare: 0.7,
  /** Difficulté selon la durée renseignée dans le planning (modifiable). */
  difficultyByDuration: { xs: 'small', s: 'medium', m: 'medium', l: 'hard', none: 'medium' } as Record<string, Difficulty>,
  /** Catégorie du planning -> thème de récompense du jeu (cahier 5.1). Les autres catégories : « autre ». */
  categoryMap: { 'Pièce client': 'fabrication', Projet: 'conception', Vente: 'logistique', Autre: 'autre' } as Record<string, string>
};

/* ---------- données lues dans le planning (format de PlanningFREVO) ---------- */
export interface PlannerTask {
  id: string; title: string; cat?: string; status: string; created?: number;
  dur?: string; slots?: { d: string | null; ok: boolean }[]; startedAt?: number | null;
}
export interface PlannerEvent { id: string; at: number; day: string; kind: string; tid: string | null }
export interface PlannerData { tasks: PlannerTask[]; events: PlannerEvent[] }

export interface Reward { key: string; amount: number; reason: string; at: number; tid: string | null; kind: string }
export type ContractState = 'RUMOR' | 'READY' | 'IN_PROGRESS' | 'COMPLETED_IRL' | 'LOOT_AVAILABLE' | 'LOOT_CLAIMED' | 'ARCHIVED';
export interface Contract {
  id: string; taskId: string; theme: string; difficulty: Difficulty; seed: number;
  title: string; radio: string; place: string; state: ContractState; reward: number;
  loot: [string, number][];
}

/* ---------- difficulté et enveloppe ---------- */
export function difficultyOf(t: PlannerTask): Difficulty {
  let d = EconomyConfig.difficultyByDuration[t.dur || 'none'] || 'medium';
  if ((t.slots?.length || 0) > 1) d = 'hard'; // « projet » = grosse tâche étalée sur plusieurs jours
  return d;
}
export const envelopeOf = (t: PlannerTask) => EconomyConfig.rewards[difficultyOf(t)];

/* ---------- récompenses ---------- */
export function computeRewards(data: PlannerData, now = Date.now()): Reward[] {
  const C = EconomyConfig, out: Reward[] = [];
  const tasks = new Map(data.tasks.map(t => [t.id, t]));
  const evs = data.events.filter(e => e.at >= C.activatedAt && e.at <= now - C.graceMs).sort((a, b) => a.at - b.at);
  const byTask = new Map<string, PlannerEvent[]>();
  for (const e of evs) if (e.tid) (byTask.get(e.tid) || byTask.set(e.tid, []).get(e.tid)!).push(e);

  for (const [tid, list] of byTask) {
    const t = tasks.get(tid);
    if (!t) continue; // tâche supprimée : plus de nouvelle récompense (ce qui est déjà acquis reste dans le registre du jeu)
    const E = envelopeOf(t), n = Math.max(1, t.slots?.length || 1);
    const start = list.find(e => e.kind === 'start');
    const done = list.find(e => e.kind === 'done');
    let paid = 0;
    // démarrage validé après 3 min (et seulement si la tâche n'a pas été finie avant)
    if (start && t.status !== 'cancelled') {
      const until = done ? done.at : now;
      if (until - start.at >= C.startMinMs) out.push({ key: `task:${tid}:start`, amount: C.rewards.start, reason: 'Démarrage validé', at: start.at + C.startMinMs, tid, kind: 'start' });
    }
    // journées d'une tâche étalée : part de l'enveloppe, n journées au plus
    if (n > 1) {
      const per = Math.floor((E * C.slotShare) / n);
      list.filter(e => e.kind === 'slot').slice(0, n).forEach((e, i) => {
        out.push({ key: `task:${tid}:slot:${i + 1}`, amount: per, reason: `Journée ${i + 1}/${n}`, at: e.at, tid, kind: 'slot' });
        paid += per;
      });
    }
    // étapes (prochaine action faite) : prises dans l'enveloppe
    list.filter(e => e.kind === 'step').slice(0, C.step.max).forEach((e, i) => {
      const a = Math.min(C.step.amount, Math.max(0, E - paid - 1));
      if (a <= 0) return;
      out.push({ key: `task:${tid}:step:${i + 1}`, amount: a, reason: 'Étape franchie', at: e.at, tid, kind: 'step' });
      paid += a;
    });
    // fin : le reste de l'enveloppe + bonus d'exécution rapide. Une seule fois par tâche (rouvrir ne rapporte rien).
    if (done) {
      const fast = !start || start.day === done.day;
      const bonus = fast ? Math.round((E * C.fastBonusPct) / 100) : 0;
      out.push({ key: `task:${tid}:complete`, amount: Math.max(0, E - paid) + bonus, reason: fast ? 'Tâche terminée · bonus rapide' : 'Tâche terminée', at: done.at, tid, kind: 'complete' });
    }
  }
  // succès « Couché tôt, levé tôt »
  for (const e of evs) if (e.kind === 'earlybird') out.push({ key: `earlybird:${e.day}`, amount: C.rewards.earlybird, reason: 'Couché tôt, levé tôt', at: e.at, tid: null, kind: 'earlybird' });
  // dédoublonnage défensif par clé
  const seen = new Set<string>();
  return out.filter(r => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

/* ---------- contrats ---------- */
const TEMPLATES: Record<string, { title: string; radio: string; place: string }[]> = {
  fabrication: [
    { title: 'Le stock de l’atelier', radio: 'Un ancien atelier aurait encore du métal sur ses étagères.', place: 'Garage de Riverside' },
    { title: 'La caisse d’outillage', radio: 'Une caisse d’outils aurait été abandonnée près des établis.', place: 'Garage de Riverside' },
    { title: 'La machine démontée', radio: 'Des pièces d’une machine traînent encore dans l’atelier.', place: 'Garage de Riverside' }
  ],
  conception: [
    { title: 'Le plan industriel', radio: 'Un classeur de plans techniques aurait survécu au pillage.', place: 'Garage de Riverside' },
    { title: 'Le prototype abandonné', radio: 'Un prototype et ses composants dormiraient sous une bâche.', place: 'Garage de Riverside' },
    { title: 'Le terminal du bureau', radio: 'Un terminal du bureau contiendrait des données utiles.', place: 'Garage de Riverside' }
  ],
  logistique: [
    { title: 'La livraison perdue', radio: 'Un colis de livraison n’a jamais quitté le quai.', place: 'Garage de Riverside' },
    { title: 'La réserve du commerçant', radio: 'Un commerçant aurait caché sa réserve derrière le garage.', place: 'Garage de Riverside' }
  ],
  autre: [
    { title: 'Transmission interceptée', radio: 'Transmission captée : du matériel serait resté au garage.', place: 'Garage de Riverside' },
    { title: 'La cache oubliée', radio: 'Quelqu’un a laissé une cache sous une plaque de tôle.', place: 'Garage de Riverside' }
  ]
};
export const themeOf = (t: PlannerTask) => EconomyConfig.categoryMap[t.cat || ''] || 'autre';

/** Butin de la cache, tiré une fois pour toutes à partir de la graine du contrat (cahier 7.5). */
function lootFor(d: Difficulty, seed: number): [string, number][] {
  const r = mulberry32(seed), k = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  if (d === 'small') return [['wood', k(2, 4)], ['scrap', k(1, 3)]];
  if (d === 'medium') return [['wood', k(3, 6)], ['scrap', k(3, 5)], ['components', 1]];
  return [['wood', k(5, 8)], ['scrap', k(5, 8)], ['components', k(2, 3)]];
}

/**
 * Un contrat par tâche. `claimed` = contrats dont la cache a déjà été récupérée dans le jeu.
 * Une tâche terminée avant l'activation du jeu n'ouvre pas de cache.
 */
export function computeContracts(data: PlannerData, claimed: ReadonlySet<string> = new Set(), now = Date.now()): Contract[] {
  const C = EconomyConfig;
  const doneAt = new Map<string, number>();
  for (const e of data.events) if (e.kind === 'done' && e.tid && e.at >= C.activatedAt && e.at <= now - C.graceMs) doneAt.set(e.tid, e.at);
  return data.tasks.map(t => {
    const id = 'c_' + t.id, seed = hashSeed(id + ':v1'), theme = themeOf(t), d = difficultyOf(t);
    const list = TEMPLATES[theme] || TEMPLATES.autre, tpl = list[seed % list.length];
    let state: ContractState = 'RUMOR';
    if (t.status === 'cancelled') state = 'ARCHIVED';
    else if (t.status === 'done') state = doneAt.has(t.id) ? (claimed.has(id) ? 'LOOT_CLAIMED' : 'LOOT_AVAILABLE') : 'ARCHIVED';
    else if (t.startedAt) state = 'IN_PROGRESS';
    return { id, taskId: t.id, theme, difficulty: d, seed, title: tpl.title, radio: tpl.radio, place: tpl.place, state, reward: envelopeOf(t), loot: lootFor(d, seed) };
  });
}

/* ---------- vue commune planning / jeu ---------- */
export interface SaveView { ledgerKeys: Set<string>; ledgerBalance: number; claimed: Set<string> }

/** Lit le strict nécessaire dans une sauvegarde du jeu (format libre : tolérant). */
export function readSave(raw: unknown): SaveView {
  const s = (raw || {}) as { ledger?: { entries?: { key: string; amount: number }[] }; claimed?: string[] };
  const entries = s.ledger?.entries || [];
  return {
    ledgerKeys: new Set(entries.map(e => e.key)),
    ledgerBalance: entries.reduce((a, e) => a + e.amount, 0),
    claimed: new Set(s.claimed || [])
  };
}

/**
 * Solde affiché partout : registre du jeu + récompenses pas encore inscrites.
 * (Le jeu inscrit les récompenses dans son registre à l'ouverture ; le planning n'écrit jamais dans le jeu.)
 */
export function summary(data: PlannerData, rawSave: unknown, now = Date.now()) {
  const sv = readSave(rawSave);
  const rewards = computeRewards(data, now);
  const pending = rewards.filter(r => !sv.ledgerKeys.has(r.key));
  const balance = (rawSave ? sv.ledgerBalance : GameConfig.start.capsules) + pending.reduce((a, r) => a + r.amount, 0);
  const contracts = computeContracts(data, sv.claimed, now);
  return { balance, rewards, pending, contracts, toCollect: contracts.filter(c => c.state === 'LOOT_AVAILABLE') };
}
