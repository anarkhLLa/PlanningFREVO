import { mergeSaves, migrate, type GameState } from '../core/state';

/**
 * Synchronisation de la partie entre appareils (décision du 26/11) :
 * on réutilise le jeton et le Gist privé déjà configurés dans le planning
 * (Réglages → Synchronisation), et on y ajoute un second fichier.
 * Sans jeton, rien ne se passe : le jeu fonctionne en local.
 */
const SYNC_KEY = 'planning.sync', FILE = 'last-outpost-save.json';

interface Cfg { token: string; gistId: string }
function cfg(): Cfg | null {
  try { const s = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); return s.token && s.gistId ? s : null; } catch { return null; }
}
export const cloudEnabled = () => !!cfg();

async function gh(c: Cfg, method: string, body?: unknown) {
  const r = await fetch('https://api.github.com/gists/' + c.gistId, {
    method, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return r.json();
}

/** Lit la sauvegarde distante (null s'il n'y en a pas encore). */
export async function pullSave(): Promise<GameState | null> {
  const c = cfg(); if (!c) return null;
  const g = await gh(c, 'GET');
  const f = g.files?.[FILE];
  if (!f) return null;
  let text: string = f.content;
  if (f.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  try { return migrate(JSON.parse(text)); } catch { return null; }
}

export async function pushSave(s: GameState): Promise<void> {
  const c = cfg(); if (!c) return;
  await gh(c, 'PATCH', { files: { [FILE]: { content: JSON.stringify(s) } } });
}

/**
 * Récupère la version distante, fusionne avec la locale (sans jamais doubler les capsules)
 * et renvoie la partie à utiliser + si elle diffère de la locale.
 */
export async function reconcile(local: GameState): Promise<{ state: GameState; changed: boolean } | null> {
  if (!cfg()) return null;
  const remote = await pullSave();
  if (!remote) { await pushSave(local); return { state: local, changed: false }; }
  const merged = mergeSaves(local, remote);
  const changed = JSON.stringify(merged) !== JSON.stringify(local);
  await pushSave(merged);
  return { state: merged, changed };
}

/** Envoi régulier (regroupé) et à la fermeture. */
export class CloudPush {
  private timer = 0;
  private busy = false;
  constructor(private get: () => GameState) {
    addEventListener('visibilitychange', () => { if (document.hidden) this.now(); });
  }
  /** Envoi au plus tard dans `ms` : un envoi déjà prévu n'est pas repoussé (sinon la sauvegarde automatique le décalerait sans fin). */
  soon(ms = 15000) { if (!cloudEnabled() || this.timer) return; this.timer = window.setTimeout(() => { this.timer = 0; void this.now(); }, ms); }
  async now() {
    if (!cloudEnabled() || this.busy) return;
    clearTimeout(this.timer); this.timer = 0; this.busy = true;
    try { await pushSave(this.get()); } catch { /* réessai à la prochaine sauvegarde */ } finally { this.busy = false; }
  }
}
