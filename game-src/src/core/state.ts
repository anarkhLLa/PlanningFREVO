import { GameConfig } from './config';
import { addItem, countOf, newId, newInventory, removeItem, roomFor, weightOf, type Inventory } from './inventory';
import { itemDef } from './items';
import { balance, newLedger, post, type Ledger } from './ledger';
import type { WorldObject, ZoneMap } from './map';
import { newPlayer, type PlayerState } from './movement';
import { hashSeed, mulberry32 } from './rng';

/** Version du format de sauvegarde : à incrémenter avec une migration (cahier 25.3). */
export const SCHEMA = 2;

export interface ContainerState {
  items: Inventory;
  generated: boolean; // butin tiré une fois pour toutes (jamais retiré au hasard)
  searched: boolean;
  refillDay?: string; // caisse de départ : dernier jour de remise à niveau
}

export interface GameState {
  schema: number;
  createdAt: number;
  savedAt: number;
  zone: string;
  player: Pick<PlayerState, 'x' | 'y' | 'facing' | 'health' | 'stamina'>;
  inventory: Inventory;
  equipment: { bag?: string; main?: string }; // identifiants d'instance
  ledger: Ledger;
  containers: Record<string, ContainerState>;
  claimed: string[]; // contrats dont la cache a été récupérée (lu aussi par le planning)
  built: string[]; // constructions / réparations faites (ex. « refuge:bench »)
  killed: Record<string, string>; // ennemis abattus -> jour (ils reviennent le lendemain)
  lostBags: { id: string; x: number; y: number; at: number }[]; // sacs perdus après une défaite
}

export function newGame(map: ZoneMap, now = Date.now()): GameState {
  const P = GameConfig.player, I = GameConfig.inventory;
  const inv = newInventory(I.slots, I.maxWeight);
  addItem(inv, 'tool_basic', 1);
  const bag = { id: newId(), def: 'bag_small', qty: 1 }; // porté (équipement), pas dans les emplacements
  const s: GameState = {
    schema: SCHEMA, createdAt: now, savedAt: now, zone: map.id,
    player: { x: map.spawn.x, y: map.spawn.y, facing: Math.PI / 4, health: P.maxHealth, stamina: P.maxStamina },
    inventory: inv,
    equipment: { bag: bag.id, main: inv.items[0].id },
    ledger: newLedger(),
    containers: {},
    claimed: [],
    built: [],
    killed: {},
    lostBags: []
  };
  post(s.ledger, 'start:capsules:v1', GameConfig.start.capsules, 'Capsules de départ', now);
  return s;
}

/** Met une ancienne sauvegarde au format actuel, sans jamais perdre la base (cahier 25.3). */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as GameState;
  if (typeof s.schema !== 'number' || !s.inventory || !s.ledger) return null;
  // v1 -> v2 : zones séparées -> monde continu. Le garage est désormais 32 cases plus au sud.
  if (s.schema < 2) {
    if (s.zone === 'garage') s.player.y += 32;
    s.zone = 'world';
    s.schema = 2;
  }
  s.containers ||= {};
  s.claimed ||= [];
  s.built ||= [];
  s.killed ||= {};
  s.lostBags ||= [];
  s.equipment ||= {};
  return s;
}

export const capsules = (s: GameState) => balance(s.ledger);
export const carried = (s: GameState) => weightOf(s.inventory);
/** Limite stricte de ramassage : capacité + tolérance de surcharge (cahier 12.5). */
export const pickupLimit = () => GameConfig.inventory.maxWeight + GameConfig.inventory.overloadTolerance;
export const isOverloaded = (s: GameState) => carried(s) > GameConfig.inventory.maxWeight + 1e-9;

export function playerFromState(s: GameState): PlayerState {
  const p = newPlayer(s.player.x, s.player.y);
  Object.assign(p, s.player);
  p.overloaded = isOverloaded(s);
  return p;
}
export function storePlayer(s: GameState, p: PlayerState) {
  s.player = { x: p.x, y: p.y, facing: p.facing, health: p.health, stamina: p.stamina };
}

/* ---------- butin ---------- */
type LootTable = (rnd: () => number) => [string, number][];
const between = (rnd: () => number, a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
export const LOOT: Record<string, LootTable> = {
  starter: () => Object.entries(GameConfig.start.starterCrate),
  cabin: r => [['wood', between(r, 3, 5)], ['scrap', between(r, 2, 3)], ['components', 1]],
  garage_box: r => [['scrap', between(r, 4, 6)], ['components', 1]],
  garage_locker: r => [['wood', between(r, 2, 4)], ['scrap', between(r, 1, 3)]]
};

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Fouille un conteneur : le butin est tiré UNE fois (graine = identifiant du conteneur),
 * puis conservé. La caisse de départ se remet à niveau une fois par jour pour qu'on ne soit
 * jamais bloqué, sans permettre de « farmer » (cahier 13.4 / 6.6).
 */
export function openContainer(s: GameState, obj: WorldObject, now = Date.now()): ContainerState {
  let c = s.containers[obj.id];
  if (!c) c = s.containers[obj.id] = { items: newInventory(16, 0), generated: false, searched: false };
  if (!c.generated && (obj.loot || obj.lootItems)) {
    const rnd = mulberry32(hashSeed(obj.id + ':loot:v1'));
    const loot = obj.lootItems ?? LOOT[obj.loot!](rnd);
    for (const [def, qty] of loot) addItem(c.items, def, qty);
    c.generated = true;
    if (obj.loot === 'starter') c.refillDay = dayOf(now);
  } else if (obj.loot === 'starter' && GameConfig.start.starterRefillDaily && c.refillDay !== dayOf(now)) {
    for (const [def, qty] of Object.entries(GameConfig.start.starterCrate)) {
      const missing = qty - countOf(c.items, def);
      if (missing > 0) addItem(c.items, def, missing);
    }
    c.refillDay = dayOf(now);
  }
  c.searched = true;
  return c;
}

/** Prend une pile du conteneur, dans la limite de ce que le joueur peut porter. */
export function take(s: GameState, c: ContainerState, stackId: string, qty?: number): number {
  const st = c.items.items.find(x => x.id === stackId); if (!st) return 0;
  const want = Math.min(qty ?? st.qty, st.qty);
  const k = Math.min(want, roomFor(s.inventory, st.def, pickupLimit()));
  if (k <= 0) return 0;
  addItem(s.inventory, st.def, k, pickupLimit());
  removeItem(c.items, st.def, k);
  return k;
}

/** Dépose une pile de l'inventaire dans le conteneur (l'outil équipé reste en main). */
export function put(s: GameState, c: ContainerState, stackId: string, qty?: number): number {
  if (stackId === s.equipment.main) return 0;
  const st = s.inventory.items.find(x => x.id === stackId); if (!st) return 0;
  const k = addItem(c.items, st.def, Math.min(qty ?? st.qty, st.qty));
  if (k > 0) removeItem(s.inventory, st.def, k);
  return k;
}

export function takeAll(s: GameState, c: ContainerState): { taken: number; left: number } {
  let taken = 0;
  for (const st of [...c.items.items]) taken += take(s, c, st.id);
  return { taken, left: c.items.items.reduce((n, x) => n + x.qty, 0) };
}

/** Objet interactif le plus proche à portée (devant le joueur de préférence). */
export function findTarget(map: ZoneMap, px: number, py: number, facing: number): WorldObject | null {
  let best: WorldObject | null = null, bestScore = Infinity;
  for (const o of map.objects) {
    const dx = o.x + 0.5 - px, dy = o.y + 0.5 - py, d = Math.hypot(dx, dy);
    if (d > GameConfig.interact.range) continue;
    const ahead = d > 0 ? (dx * Math.cos(facing) + dy * Math.sin(facing)) / d : 1; // 1 = pile devant
    const score = d - ahead * 0.4;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

export const describeStack = (def: string, qty: number) => `${itemDef(def).icon} ${itemDef(def).name}${qty > 1 ? ' ×' + qty : ''}`;

/**
 * Une cache de contrat est « récupérée » quand elle a été ouverte et vidée.
 * Renvoie true la première fois (pour afficher un message), false ensuite.
 */
export function claimIfEmpty(s: GameState, obj: WorldObject): boolean {
  if (!obj.contractId || s.claimed.includes(obj.contractId)) return false;
  const c = s.containers[obj.id];
  if (!c || !c.generated || c.items.items.length > 0) return false;
  s.claimed.push(obj.contractId);
  return true;
}

/** Réparer l'établi : consomme les ressources du sac (une seule fois). */
export function repairBench(s: GameState): { ok: boolean; missing: [string, number][] } {
  if (s.built.includes('refuge:bench')) return { ok: false, missing: [] };
  const cost = Object.entries(GameConfig.build.bench);
  const missing = cost.map(([d, q]) => [d, q - countOf(s.inventory, d)] as [string, number]).filter(([, q]) => q > 0);
  if (missing.length) return { ok: false, missing };
  for (const [d, q] of cost) removeItem(s.inventory, d, q);
  s.built.push('refuge:bench');
  return { ok: true, missing: [] };
}

/**
 * Fusion de deux sauvegardes (deux appareils) : on part de la plus récente,
 * puis on réunit ce qui ne doit JAMAIS se perdre ni se doubler :
 * registre des capsules (union par clé d'idempotence), caches récupérées, constructions.
 * On n'additionne jamais deux soldes (cahier 24.3).
 */
export function mergeSaves(a: GameState, b: GameState): GameState {
  const [base, other] = (a.savedAt || 0) >= (b.savedAt || 0) ? [a, b] : [b, a];
  const out: GameState = JSON.parse(JSON.stringify(base));
  const keys = new Set(out.ledger.entries.map(e => e.key));
  for (const e of other.ledger.entries) if (!keys.has(e.key)) { out.ledger.entries.push(e); keys.add(e.key); }
  out.ledger.entries.sort((x, y) => x.at - y.at);
  out.claimed = [...new Set([...(out.claimed || []), ...(other.claimed || [])])];
  out.built = [...new Set([...(out.built || []), ...(other.built || [])])];
  // une caisse vidée sur un appareil reste vidée (pas de butin doublé)
  for (const [id, c] of Object.entries(other.containers || {})) {
    const mine = out.containers[id];
    if (!mine) out.containers[id] = c; // sinon : la version la plus récente fait foi
  }
  return out;
}
