import { migrate, type GameState } from '../core/state';

/**
 * Sauvegarde locale (cahier 25.1) : IndexedDB, avec repli sur localStorage.
 * Sauvegarde après chaque action importante, périodiquement et à la fermeture.
 */
const DB = 'last-outpost', STORE = 'saves', SLOT = 'slot1', LS_KEY = 'last-outpost.save';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadGame(): Promise<GameState | null> {
  let fromDb: GameState | null = null, fromLs: GameState | null = null;
  try {
    const db = await openDb();
    const raw = await new Promise<unknown>((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(SLOT);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    fromDb = migrate(raw);
  } catch { /* IndexedDB indisponible */ }
  try { fromLs = migrate(JSON.parse(localStorage.getItem(LS_KEY) || 'null')); } catch { /* rien */ }
  // on garde la plus récente des deux copies
  if (fromDb && fromLs) return (fromLs.savedAt || 0) > (fromDb.savedAt || 0) ? fromLs : fromDb;
  return fromDb || fromLs;
}

export async function saveGame(s: GameState): Promise<void> {
  s.savedAt = Date.now();
  const json = JSON.stringify(s), copy = JSON.parse(json);
  // 1) copie immédiate et synchrone : survit à une fermeture brutale de l'onglet
  try { localStorage.setItem(LS_KEY, json); } catch { /* quota */ }
  // 2) sauvegarde structurée
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(copy, SLOT);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  } catch { /* la copie localStorage suffit */ }
}

/** Planifie une sauvegarde (regroupe les changements rapprochés). */
export class AutoSave {
  private timer = 0;
  constructor(private get: () => GameState) {
    setInterval(() => this.now(), 10000);
    addEventListener('visibilitychange', () => { if (document.hidden) this.now(); });
    addEventListener('pagehide', () => this.now());
  }
  soon(ms = 600) { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.now(), ms); }
  now() { clearTimeout(this.timer); void saveGame(this.get()); }
}
