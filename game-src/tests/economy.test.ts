import { describe, expect, it } from 'vitest';
import { computeContracts, computeRewards, EconomyConfig as C, summary, type PlannerData, type PlannerEvent, type PlannerTask } from '../src/core/economy';
import { buildRefuge } from '../src/core/map';
import { newGame } from '../src/core/state';
import { syncFromPlannerData } from './helpers';

const T = C.activatedAt + 3600e3; // une heure après l'activation
const MIN = 60e3, DAY = 864e5;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const task = (id: string, extra: Partial<PlannerTask> = {}): PlannerTask => ({ id, title: 'Tâche ' + id, status: 'todo', cat: 'Projet', created: T, slots: [{ d: null, ok: false }], ...extra });
let n = 0;
const ev = (kind: string, tid: string | null, at: number): PlannerEvent => ({ id: 'e' + ++n, kind, tid, at, day: day(at) });
const total = (r: { amount: number }[]) => r.reduce((a, x) => a + x.amount, 0);
const NOW = T + 30 * DAY;

describe('récompenses', () => {
  it('créer une tâche ne rapporte rien', () => {
    expect(computeRewards({ tasks: [task('a')], events: [] }, NOW)).toEqual([]);
  });
  it('terminée en un clic : récompense + bonus rapide', () => {
    const r = computeRewards({ tasks: [task('a', { status: 'done' })], events: [ev('done', 'a', T)] }, NOW);
    expect(r.map(x => x.key)).toEqual(['task:a:complete']);
    expect(r[0].amount).toBe(C.rewards.medium + Math.round((C.rewards.medium * C.fastBonusPct) / 100));
  });
  it('commencée et finie le même jour : même bonus ; un autre jour : pas de bonus', () => {
    const same = computeRewards({ tasks: [task('a', { status: 'done' })], events: [ev('start', 'a', T), ev('done', 'a', T + 30 * MIN)] }, NOW);
    expect(same.find(x => x.kind === 'complete')!.amount).toBe(72);
    expect(same.find(x => x.kind === 'start')!.amount).toBe(C.rewards.start);
    const later = computeRewards({ tasks: [task('b', { status: 'done' })], events: [ev('start', 'b', T), ev('done', 'b', T + 2 * DAY)] }, NOW);
    expect(later.find(x => x.kind === 'complete')!.amount).toBe(C.rewards.medium);
  });
  it('le démarrage n’est validé qu’après 3 minutes', () => {
    const r1 = computeRewards({ tasks: [task('a')], events: [ev('start', 'a', T)] }, T + 2 * MIN);
    expect(r1.length).toBe(0);
    const r2 = computeRewards({ tasks: [task('a', { status: 'done' })], events: [ev('start', 'a', T), ev('done', 'a', T + 2 * MIN)] }, NOW);
    expect(r2.some(x => x.kind === 'start')).toBe(false); // fini en 2 min : pas de bonus de démarrage, mais la fin + bonus rapide
  });
  it('rouvrir puis refermer une tâche ne rapporte pas une 2e fois', () => {
    const r = computeRewards({ tasks: [task('a', { status: 'done' })], events: [ev('done', 'a', T), ev('done', 'a', T + DAY)] }, NOW);
    expect(r.filter(x => x.kind === 'complete').length).toBe(1);
  });
  it('une grosse tâche étalée ne rapporte jamais plus que son enveloppe (+ bonus)', () => {
    const t = task('p', { status: 'done', slots: [{ d: 'x', ok: true }, { d: 'y', ok: true }, { d: 'z', ok: true }] });
    const evs = [ev('slot', 'p', T), ev('slot', 'p', T + DAY), ev('slot', 'p', T + 2 * DAY), ev('slot', 'p', T + 3 * DAY), ev('step', 'p', T + 3 * DAY), ev('done', 'p', T + 4 * DAY)];
    const r = computeRewards({ tasks: [t], events: evs }, NOW);
    expect(total(r)).toBeLessThanOrEqual(C.rewards.hard + Math.round((C.rewards.hard * C.fastBonusPct) / 100));
    expect(r.filter(x => x.kind === 'slot').length).toBe(3); // pas plus de journées que prévu
  });
  it('rien avant l’activation, rien pendant le délai d’annulation', () => {
    const old = computeRewards({ tasks: [task('a', { status: 'done' })], events: [ev('done', 'a', C.activatedAt - DAY)] }, NOW);
    expect(old).toEqual([]);
    const fresh = computeRewards({ tasks: [task('a', { status: 'done' })], events: [ev('done', 'a', T)] }, T + 3000);
    expect(fresh).toEqual([]);
  });
  it('une tâche supprimée ne crée plus de récompense', () => {
    expect(computeRewards({ tasks: [], events: [ev('done', 'zz', T)] }, NOW)).toEqual([]);
  });
  it('« Couché tôt, levé tôt » : une fois par jour', () => {
    const r = computeRewards({ tasks: [], events: [ev('earlybird', null, T), ev('earlybird', null, T + 60e3)] }, NOW);
    expect(r.length).toBe(1); expect(r[0].amount).toBe(C.rewards.earlybird);
  });
});

describe('contrats', () => {
  const data: PlannerData = {
    tasks: [task('r'), task('g', { startedAt: T }), task('d', { status: 'done' }), task('x', { status: 'cancelled' }), task('old', { status: 'done' })],
    events: [ev('done', 'd', T), ev('done', 'old', C.activatedAt - DAY)]
  };
  it('états : piste, en cours, cache disponible, archivé', () => {
    const cs = Object.fromEntries(computeContracts(data, new Set(), NOW).map(c => [c.taskId, c.state]));
    expect(cs).toEqual({ r: 'RUMOR', g: 'IN_PROGRESS', d: 'LOOT_AVAILABLE', x: 'ARCHIVED', old: 'ARCHIVED' });
    expect(computeContracts(data, new Set(['c_d']), NOW).find(c => c.taskId === 'd')!.state).toBe('LOOT_CLAIMED');
  });
  it('titre et butin stables (graine enregistrée)', () => {
    const a = computeContracts(data, new Set(), NOW), b = computeContracts(data, new Set(), NOW + DAY);
    expect(a.map(c => c.title + JSON.stringify(c.loot))).toEqual(b.map(c => c.title + JSON.stringify(c.loot)));
  });
});

describe('solde commun planning / jeu', () => {
  it('le planning voit le même solde que le jeu, avant et après inscription', () => {
    const data: PlannerData = { tasks: [task('a', { status: 'done' })], events: [ev('done', 'a', T)] };
    const before = summary(data, null, NOW).balance; // pas encore de partie : 20 de départ + 72
    expect(before).toBe(20 + 72);
    const g = newGame(buildRefuge(1), T);
    syncFromPlannerData(g, data, NOW);
    syncFromPlannerData(g, data, NOW); // deuxième passage : rien de plus
    expect(summary(data, JSON.parse(JSON.stringify(g)), NOW).balance).toBe(before);
    expect(g.ledger.entries.length).toBe(2);
  });
});
