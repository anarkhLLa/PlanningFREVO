import { buildGarage, buildRefuge, type CacheSpec, type Cell, type WorldObject, type ZoneMap } from './map';

/**
 * Monde continu (décision du 26/11) : les régions sont posées côte à côte sur UNE grande carte.
 * On passe de l'une à l'autre en marchant, sans transition. Pour ajouter une région :
 * la construire (fonction déterministe) et lui donner une position (ox, oy) en cases.
 */
export interface RegionDef { id: string; name: string; ox: number; oy: number; build: (caches: CacheSpec[]) => ZoneMap }

export const REGIONS: RegionDef[] = [
  { id: 'refuge', name: 'Le refuge', ox: 0, oy: 0, build: () => buildRefuge(1) },
  // la route du refuge (x 26-28) continue tout droit vers le sud jusqu'au garage
  { id: 'garage', name: 'Garage de Riverside', ox: 0, oy: 32, build: caches => buildGarage(4, caches) }
];

export const regionOffset = (id: string) => { const r = REGIONS.find(x => x.id === id); return r ? { x: r.ox, y: r.oy } : { x: 0, y: 0 }; };

export function buildWorld(caches: CacheSpec[] = []): ZoneMap {
  const built = REGIONS.map(r => ({ r, m: r.build(caches) }));
  const w = Math.max(...built.map(({ r, m }) => r.ox + m.w)), h = Math.max(...built.map(({ r, m }) => r.oy + m.h));
  const cells: Cell[] = Array.from({ length: w * h }, () => ({ ground: 'grass', stack: [] }));
  const objects: WorldObject[] = [];
  for (const { r, m } of built) {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) cells[(y + r.oy) * w + (x + r.ox)] = m.cells[y * m.w + x];
    for (const o of m.objects) objects.push({ ...o, x: o.x + r.ox, y: o.y + r.oy });
  }
  const refuge = built[0];
  return { id: 'world', name: 'Le monde', w, h, cells, objects, exits: [], spawn: { x: refuge.m.spawn.x + refuge.r.ox, y: refuge.m.spawn.y + refuge.r.oy } };
}

/** Région sous une position (pour afficher son nom). */
export function regionAt(x: number, y: number): RegionDef | null {
  // on teste à l'envers : une région posée plus tard « par-dessus » l'emporte
  for (let i = REGIONS.length - 1; i >= 0; i--) {
    const r = REGIONS[i];
    if (x >= r.ox && y >= r.oy && x < r.ox + 32 && y < r.oy + 32) return r;
  }
  return null;
}
