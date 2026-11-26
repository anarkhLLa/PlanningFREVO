/**
 * Registre économique append-only (cahier 6.5 et 24.2).
 * Le solde n'est jamais stocké : il est recalculé à partir des écritures.
 * Chaque écriture a une clé d'idempotence : la rejouer ne produit aucun nouveau gain.
 */
export interface LedgerEntry {
  id: string;
  key: string; // clé d'idempotence, ex. "evt_123:complete:v1"
  amount: number; // + gain, - dépense
  currency: 'capsules';
  reason: string;
  at: number;
}

export interface Ledger { entries: LedgerEntry[] }

export const newLedger = (): Ledger => ({ entries: [] });
export const balance = (l: Ledger) => l.entries.reduce((s, e) => s + e.amount, 0);
export const hasKey = (l: Ledger, key: string) => l.entries.some(e => e.key === key);

/** Enregistre un gain ou une dépense. Renvoie false si la clé existe déjà (rien n'est ajouté). */
export function post(l: Ledger, key: string, amount: number, reason: string, now = Date.now()): boolean {
  if (hasKey(l, key)) return false;
  if (amount < 0 && balance(l) + amount < 0) throw new Error('Solde insuffisant');
  l.entries.push({ id: `led_${now.toString(36)}_${l.entries.length}`, key, amount, currency: 'capsules', reason, at: now });
  return true;
}
