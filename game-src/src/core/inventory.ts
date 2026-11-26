import { itemDef } from './items';

/** Une pile d'objets. `id` = identifiant d'instance (propriété, échanges futurs). */
export interface ItemStack { id: string; def: string; qty: number }

export interface Inventory {
  slots: number;
  maxWeight: number; // 0 = pas de limite de poids (coffres)
  items: ItemStack[];
}

let counter = 0;
/** Identifiant unique d'instance (horodatage + compteur + aléa). */
export function newId(prefix = 'it'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const newInventory = (slots: number, maxWeight: number): Inventory => ({ slots, maxWeight, items: [] });
export const weightOf = (inv: Inventory) => inv.items.reduce((w, s) => w + itemDef(s.def).weight * s.qty, 0);
export const countOf = (inv: Inventory, def: string) => inv.items.filter(s => s.def === def).reduce((n, s) => n + s.qty, 0);

/**
 * Combien d'unités de `def` peuvent entrer (piles existantes + emplacements libres + poids).
 * `weightLimit` permet d'appliquer la tolérance de surcharge du joueur.
 */
export function roomFor(inv: Inventory, def: string, weightLimit = inv.maxWeight): number {
  const d = itemDef(def);
  let n = 0;
  for (const s of inv.items) if (s.def === def) n += d.stack - s.qty;
  n += (inv.slots - inv.items.length) * d.stack;
  if (weightLimit > 0 && d.weight > 0) n = Math.min(n, Math.floor((weightLimit - weightOf(inv) + 1e-9) / d.weight));
  return Math.max(0, n);
}

/** Ajoute jusqu'à `qty` unités ; renvoie le nombre réellement ajouté. */
export function addItem(inv: Inventory, def: string, qty: number, weightLimit = inv.maxWeight): number {
  const d = itemDef(def);
  let left = Math.min(qty, roomFor(inv, def, weightLimit));
  const added = left;
  for (const s of inv.items) {
    if (left <= 0) break;
    if (s.def !== def || s.qty >= d.stack) continue;
    const k = Math.min(left, d.stack - s.qty); s.qty += k; left -= k;
  }
  while (left > 0) {
    const k = Math.min(left, d.stack);
    inv.items.push({ id: newId(), def, qty: k }); left -= k;
  }
  return added;
}

/** Retire jusqu'à `qty` unités ; renvoie le nombre retiré. */
export function removeItem(inv: Inventory, def: string, qty: number): number {
  let left = qty;
  for (let i = inv.items.length - 1; i >= 0 && left > 0; i--) {
    const s = inv.items[i];
    if (s.def !== def) continue;
    const k = Math.min(left, s.qty); s.qty -= k; left -= k;
    if (s.qty === 0) inv.items.splice(i, 1);
  }
  return qty - left;
}

/** Déplace une pile (ou une partie) d'un inventaire à l'autre. Renvoie la quantité déplacée. */
export function moveStack(from: Inventory, stackId: string, to: Inventory, qty?: number, weightLimit = to.maxWeight): number {
  const s = from.items.find(x => x.id === stackId);
  if (!s) return 0;
  const want = Math.min(qty ?? s.qty, s.qty);
  const k = addItem(to, s.def, want, weightLimit);
  if (k > 0) removeItem(from, s.def, k);
  return k;
}
