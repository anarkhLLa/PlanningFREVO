import { mulberry32 } from './rng';

/** Types de sol (couche 0). */
export type Ground = 'grass' | 'grass2' | 'dirt' | 'planks' | 'road' | 'gravel' | 'concrete';
/** Types de blocs empilables (cubes façon Minecraft). */
export type Block = 'log' | 'leaves' | 'planks' | 'stone' | 'crate' | 'bench' | 'bench_ok' | 'cache' | 'brick';

export interface Cell {
  ground: Ground;
  /** Pile de blocs, du sol vers le haut (index = niveau). */
  stack: Block[];
}

export type ObjectKind = 'container' | 'bench';
/** Objet interactif posé sur une case (conteneur, établi…). */
export interface WorldObject {
  id: string; // identifiant stable, ex. "refuge:starter"
  kind: ObjectKind;
  name: string;
  x: number; // case
  y: number;
  loot?: string; // table de butin (conteneurs)
  lootItems?: [string, number][]; // butin imposé (caches de contrats, tiré à l'avance)
  contractId?: string; // cache liée à un contrat du planning
}

/** Sortie de zone : rectangle de cases qui mène ailleurs. */
export interface Exit { x0: number; y0: number; x1: number; y1: number; to: string; entry: { x: number; y: number }; label: string }

export interface ZoneMap {
  id: string;
  name: string;
  w: number;
  h: number;
  cells: Cell[]; // index = y * w + x
  spawn: { x: number; y: number };
  objects: WorldObject[];
  exits: Exit[];
}

/** Blocs qui ne bloquent pas le passage (aucun pour l'instant, prévu pour les décors bas). */
const PASSABLE: ReadonlySet<Block> = new Set();

export function cellAt(map: ZoneMap, x: number, y: number): Cell | undefined {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return undefined;
  return map.cells[y * map.w + x];
}

/** Une case est solide si elle est hors carte ou si son bloc du bas bloque le passage. */
export function isSolid(map: ZoneMap, x: number, y: number): boolean {
  const c = cellAt(map, x, y);
  if (!c) return true;
  const b = c.stack[0];
  return b !== undefined && !PASSABLE.has(b);
}

function blank(w: number, h: number): Cell[] {
  return Array.from({ length: w * h }, () => ({ ground: 'grass' as Ground, stack: [] as Block[] }));
}

/**
 * Refuge initial 32×32 (cahier 8.2, région 1) : une cabane, une route à l'est,
 * un chemin de terre, des arbres en lisière de forêt, la caisse de départ.
 * Entièrement déterministe : la même graine redonne exactement la même carte.
 */
export function buildRefuge(seed = 1): ZoneMap {
  const w = 32, h = 32, rnd = mulberry32(seed);
  const cells = blank(w, h);
  const at = (x: number, y: number) => cells[y * w + x];
  const reserved = new Set<number>(); // cases à ne pas encombrer d'arbres
  const keep = (x: number, y: number) => reserved.add(y * w + x);

  // Herbe variée
  for (const c of cells) if (rnd() < 0.35) c.ground = 'grass2';

  // Route goudronnée nord-sud sur le bord est (x = 26..28) : sortie vers le garage
  for (let y = 0; y < h; y++) for (let x = 26; x <= 28; x++) { at(x, y).ground = 'road'; keep(x, y); }
  for (let y = 0; y < h; y++) { at(25, y).ground = 'gravel'; at(29, y).ground = 'gravel'; keep(25, y); keep(29, y); }

  // Cabane : murs en planches (2 blocs de haut), plancher, porte au sud-est
  const cx0 = 10, cy0 = 11, cx1 = 16, cy1 = 16;
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
    keep(x, y);
    const edge = x === cx0 || x === cx1 || y === cy0 || y === cy1;
    at(x, y).ground = 'planks';
    if (edge) at(x, y).stack = ['planks', 'planks'];
  }
  // porte (côté est, face à la route)
  at(cx1, 14).stack = []; at(cx1, 13).stack = [];
  // établi déjà présent (cassé : sera réparé/construit à l'étape suivante) et une caisse
  at(11, 12).stack = ['bench'];
  at(15, 12).stack = ['crate'];

  // Chemin de terre de la porte jusqu'à la route
  for (let x = cx1 + 1; x <= 25; x++) for (const y of [13, 14]) { at(x, y).ground = 'dirt'; keep(x, y); }
  // Petite cour devant la cabane
  for (let y = 12; y <= 16; y++) for (let x = 17; x <= 20; x++) { if (at(x, y).ground !== 'dirt') at(x, y).ground = rnd() < 0.5 ? 'dirt' : 'grass2'; keep(x, y); }

  // Caisse de départ permanente dans la cour (cahier 13.4)
  at(19, 16).stack = ['crate']; keep(19, 16);

  // Point d'apparition devant la porte
  const spawn = { x: 18.5, y: 14.5 };
  for (let y = 13; y <= 16; y++) for (let x = 17; x <= 20; x++) keep(x, y);

  // Lisière de forêt : beaucoup d'arbres à l'ouest et au nord, quelques-uns ailleurs
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < 25; x++) {
    if (reserved.has(y * w + x)) continue;
    const forest = x < 8 || y < 7;
    const p = forest ? 0.22 : 0.035;
    if (rnd() < p && !nearTree(x, y)) {
      const tall = rnd() < 0.4;
      at(x, y).stack = tall ? ['log', 'log', 'leaves', 'leaves'] : ['log', 'leaves', 'leaves'];
    }
  }
  function nearTree(x: number, y: number) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = cells[(y + dy) * w + (x + dx)];
      if (c && c.stack[0] === 'log') return true;
    }
    return false;
  }
  // Quelques rochers
  for (let i = 0; i < 6; i++) {
    const x = 2 + Math.floor(rnd() * 22), y = 18 + Math.floor(rnd() * 12);
    if (!reserved.has(y * w + x) && at(x, y).stack.length === 0) at(x, y).stack = ['stone'];
  }

  const objects: WorldObject[] = [
    { id: 'refuge:starter', kind: 'container', name: 'Caisse de départ', x: 19, y: 16, loot: 'starter' },
    { id: 'refuge:cabin-crate', kind: 'container', name: 'Vieille caisse', x: 15, y: 12, loot: 'cabin' },
    { id: 'refuge:bench', kind: 'bench', name: 'Établi cassé', x: 11, y: 12 }
  ];
  const exits: Exit[] = [{ x0: 26, y0: 31, x1: 28, y1: 31, to: 'garage', entry: { x: 27.5, y: 1.6 }, label: 'Garage de Riverside' }];
  return { id: 'refuge', name: 'Le refuge', w, h, cells, spawn, objects, exits };
}

/** Emplacements des caches de contrats dans le garage (dedans d'abord, puis la cour). */
export const GARAGE_CACHE_SLOTS: [number, number][] = [
  [10, 9], [12, 9], [14, 9], [16, 9], [18, 9], [10, 17], [12, 17], [14, 17], [16, 17], [18, 17],
  [4, 22], [6, 22], [8, 22], [10, 22], [12, 22], [4, 25], [6, 25], [8, 25], [10, 25], [12, 25]
];

export interface CacheSpec { contractId: string; title: string; loot: [string, number][] }

/**
 * Garage de Riverside (cahier 8.2, région 4) : la route continue depuis le refuge,
 * un garage en briques ouvert côté route, une cour. Les caches des contrats terminés y sont posées.
 */
export function buildGarage(seed = 4, caches: CacheSpec[] = []): ZoneMap {
  const w = 32, h = 32, rnd = mulberry32(seed);
  const cells = blank(w, h);
  const at = (x: number, y: number) => cells[y * w + x];
  for (const c of cells) if (rnd() < 0.35) c.ground = 'grass2';
  for (let y = 0; y < h; y++) { for (let x = 26; x <= 28; x++) at(x, y).ground = 'road'; at(25, y).ground = 'gravel'; at(29, y).ground = 'gravel'; }
  // parking devant le garage
  for (let y = 10; y <= 16; y++) for (let x = 21; x <= 24; x++) at(x, y).ground = 'road';
  // bâtiment : sol béton, murs de briques (2 blocs), grande porte côté route
  const x0 = 8, y0 = 7, x1 = 20, y1 = 19;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    at(x, y).ground = 'concrete';
    if (x === x0 || x === x1 || y === y0 || y === y1) at(x, y).stack = ['brick', 'brick'];
  }
  for (let y = 11; y <= 15; y++) at(x1, y).stack = [];
  // établis et étagères de l'atelier (décor) + deux conteneurs ordinaires
  for (const x of [11, 13, 15]) at(x, 13).stack = ['crate'];
  at(9, 13).stack = ['bench'];
  // cour de stockage (gravier) au sud-ouest
  for (let y = 21; y <= 27; y++) for (let x = 3; x <= 14; x++) at(x, y).ground = 'gravel';
  // arbres en bordure ouest/nord (hors bâtiment et cour)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < 7; x++) {
    if (y >= 20 && y <= 28) continue;
    if (rnd() < 0.25 && at(x, y).stack.length === 0) at(x, y).stack = rnd() < 0.4 ? ['log', 'log', 'leaves', 'leaves'] : ['log', 'leaves', 'leaves'];
  }
  const objects: WorldObject[] = [
    { id: 'garage:toolbox', kind: 'container', name: 'Caisse à outils', x: 13, y: 13, loot: 'garage_box' },
    { id: 'garage:locker', kind: 'container', name: 'Casier du mécanicien', x: 15, y: 13, loot: 'garage_locker' }
  ];
  caches.slice(0, GARAGE_CACHE_SLOTS.length).forEach((c, i) => {
    const [x, y] = GARAGE_CACHE_SLOTS[i];
    at(x, y).stack = ['cache'];
    objects.push({ id: 'cache:' + c.contractId, kind: 'container', name: '📦 ' + c.title, x, y, lootItems: c.loot, contractId: c.contractId });
  });
  const exits: Exit[] = [{ x0: 26, y0: 0, x1: 28, y1: 0, to: 'refuge', entry: { x: 27.5, y: 30.4 }, label: 'Le refuge' }];
  return { id: 'garage', name: 'Garage de Riverside', w, h, cells, spawn: { x: 27.5, y: 2 }, objects, exits };
}

/** Case de sortie sous le joueur, le cas échéant. */
export function exitAt(map: ZoneMap, x: number, y: number): Exit | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  return map.exits.find(e => cx >= e.x0 && cx <= e.x1 && cy >= e.y0 && cy <= e.y1) || null;
}
