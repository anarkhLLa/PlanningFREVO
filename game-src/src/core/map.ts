import { mulberry32 } from './rng';

/** Types de sol (couche 0). */
export type Ground = 'grass' | 'grass2' | 'dirt' | 'planks' | 'road' | 'gravel';
/** Types de blocs empilables (cubes façon Minecraft). */
export type Block = 'log' | 'leaves' | 'planks' | 'stone' | 'crate' | 'bench';

export interface Cell {
  ground: Ground;
  /** Pile de blocs, du sol vers le haut (index = niveau). */
  stack: Block[];
}

export interface ZoneMap {
  id: string;
  name: string;
  w: number;
  h: number;
  cells: Cell[]; // index = y * w + x
  spawn: { x: number; y: number };
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

  return { id: 'refuge', name: 'Le refuge', w, h, cells, spawn };
}
