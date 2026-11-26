/** Définitions des objets (cahier 12). Données pures : faciles à équilibrer. */
export type ItemCategory = 'resource' | 'tool' | 'equipment' | 'consumable' | 'part' | 'blueprint' | 'quest' | 'deco';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'exceptional';

export interface ItemDef {
  id: string;
  name: string;
  icon: string; // emoji provisoire, remplacé par les sprites plus tard
  category: ItemCategory;
  weight: number; // par unité
  stack: number; // taille de pile max
  rarity: Rarity;
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: 'Bois', icon: '🪵', category: 'resource', weight: 0.5, stack: 50, rarity: 'common', desc: 'Planches et bûches. Construction, palissades, établi.' },
  scrap: { id: 'scrap', name: 'Ferraille', icon: '🔩', category: 'resource', weight: 0.5, stack: 50, rarity: 'common', desc: 'Métal récupéré. Indispensable aux installations.' },
  components: { id: 'components', name: 'Composants', icon: '🔌', category: 'part', weight: 0.25, stack: 30, rarity: 'uncommon', desc: 'Électronique de récupération : générateur, radio…' },
  tool_basic: { id: 'tool_basic', name: 'Outil rudimentaire', icon: '🔧', category: 'tool', weight: 2, stack: 1, rarity: 'common', desc: 'Un vieux pied-de-biche tordu. Mieux que rien.' },
  bag_small: { id: 'bag_small', name: 'Petit sac', icon: '🎒', category: 'equipment', weight: 0, stack: 1, rarity: 'common', desc: 'Sac de départ : 20 de capacité.' }
};

export const itemDef = (id: string): ItemDef => {
  const d = ITEMS[id];
  if (!d) throw new Error('Objet inconnu : ' + id);
  return d;
};
