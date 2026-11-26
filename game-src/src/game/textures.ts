import Phaser from 'phaser';
import { mulberry32 } from '../core/rng';
import type { Block, Ground } from '../core/map';

/**
 * Textures « en blocs » façon Minecraft, dessinées par le code (aucun fichier image, aucune licence).
 * Chaque face d'un cube est une grille 8×8 de « pixels » projetés en isométrique.
 */
const TW = 64, TH = 32, BH = 32, N = 8;

type RGB = [number, number, number];
const hex = (c: RGB, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

/** Palette : chaque matériau = fonction (u,v,rnd) -> couleur, pour dessiner ses « pixels ». */
type Painter = (i: number, j: number, rnd: () => number, face: 'top' | 'side') => RGB;
const jitter = (c: RGB, rnd: () => number, amt = 0.12): RGB => { const k = 1 - amt + rnd() * amt * 2; return [c[0] * k, c[1] * k, c[2] * k]; };

const PAINT: Record<string, Painter> = {
  grass: (_i, _j, r) => jitter([96, 148, 64], r, 0.14),
  grass2: (_i, _j, r) => (r() < 0.12 ? jitter([128, 170, 72], r) : jitter([88, 138, 60], r, 0.12)),
  dirt: (_i, _j, r) => (r() < 0.15 ? jitter([112, 84, 58], r) : jitter([134, 100, 68], r, 0.1)),
  road: (_i, _j, r) => (r() < 0.06 ? [150, 150, 140] : jitter([70, 72, 76], r, 0.08)),
  gravel: (_i, _j, r) => jitter(r() < 0.5 ? [128, 124, 118] : [104, 100, 96], r, 0.1),
  planks: (i, j, r, face) => {
    // lattes : lignes sombres toutes les 2 rangées (côtés) / 2 colonnes (dessus)
    const line = face === 'top' ? i % 4 === 3 : j % 3 === 2;
    return line ? [104, 74, 44] : jitter([164, 124, 76], r, 0.08);
  },
  log: (i, _j, r, face) => face === 'top' ? jitter(i % 3 === 0 ? [150, 118, 74] : [170, 136, 86], r, 0.06) : jitter(i % 2 ? [92, 66, 40] : [104, 76, 46], r, 0.08),
  leaves: (_i, _j, r) => (r() < 0.18 ? [52, 92, 40] : jitter([74, 128, 52], r, 0.16)),
  stone: (_i, _j, r) => jitter(r() < 0.2 ? [110, 110, 112] : [138, 138, 140], r, 0.08),
  crate: (i, j, r) => {
    const frame = i === 0 || j === 0 || i === N - 1 || j === N - 1 || i === j;
    return frame ? [96, 66, 36] : jitter([178, 134, 78], r, 0.06);
  },
  bench: (i, j, r, face) => face === 'top' ? (i % 4 === 3 ? [96, 70, 44] : jitter([158, 118, 70], r, 0.06)) : (j > 5 || (i > 0 && i < N - 1 && j > 1) ? [38, 30, 26] : jitter([126, 92, 54], r, 0.06))
};

/** Point sur la face du dessus : u,v dans [0,1]. Origine = coin haut du losange. */
const top = (u: number, v: number, oy = 0): [number, number] => [TW / 2 + (u - v) * (TW / 2), oy + (u + v) * (TH / 2)];
/** Face gauche (vers +y) : u le long de l'arête, h vers le bas. */
const left = (u: number, h: number): [number, number] => [u * (TW / 2), TH / 2 + u * (TH / 2) + h * BH];
/** Face droite (vers +x). */
const right = (u: number, h: number): [number, number] => [TW / 2 + u * (TW / 2), TH - u * (TH / 2) + h * BH];

function quad(ctx: CanvasRenderingContext2D, p: [number, number][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
  for (let k = 1; k < p.length; k++) ctx.lineTo(p[k][0], p[k][1]);
  ctx.closePath(); ctx.fill();
  // léger débord pour éviter les fines lignes entre « pixels »
  ctx.strokeStyle = color; ctx.lineWidth = 0.6; ctx.stroke();
}

function paintTop(ctx: CanvasRenderingContext2D, paint: Painter, rnd: () => number, shade = 1) {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
    quad(ctx, [top(u0, v0), top(u1, v0), top(u1, v1), top(u0, v1)], hex(paint(i, j, rnd, 'top'), shade));
  }
}
function paintSide(ctx: CanvasRenderingContext2D, f: typeof left, paint: Painter, rnd: () => number, shade: number) {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u0 = i / N, u1 = (i + 1) / N, h0 = j / N, h1 = (j + 1) / N;
    quad(ctx, [f(u0, h0), f(u1, h0), f(u1, h1), f(u0, h1)], hex(paint(i, j, rnd, 'side'), shade));
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

export const groundKey = (g: Ground) => 'g_' + g;
export const blockKey = (b: Block) => 'b_' + b;
export const GROUND_VARIANTS = 3;

export function makeTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  // Sols : plusieurs variantes par matériau pour éviter l'effet « papier peint »
  for (const g of ['grass', 'grass2', 'dirt', 'road', 'gravel', 'planks'] as Ground[]) {
    for (let v = 0; v < GROUND_VARIANTS; v++) {
      const { c, ctx } = canvas(TW, TH);
      paintTop(ctx, PAINT[g], mulberry32(1000 + v * 31 + g.length * 7));
      tex.addCanvas(groundKey(g) + v, c);
    }
  }
  // Cubes : dessus + face gauche (ombre 0.78) + face droite (ombre 0.62)
  for (const b of ['log', 'leaves', 'planks', 'stone', 'crate', 'bench'] as Block[]) {
    const { c, ctx } = canvas(TW, TH + BH);
    const rnd = mulberry32(5000 + b.length * 13);
    paintSide(ctx, left, PAINT[b], rnd, 0.78);
    paintSide(ctx, right, PAINT[b], rnd, 0.62);
    paintTop(ctx, PAINT[b], rnd, 1);
    tex.addCanvas(blockKey(b), c);
  }
  makePlayer(scene);
  // Ombre au sol du personnage
  const { c, ctx } = canvas(40, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(20, 10, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  tex.addCanvas('shadow', c);
}

/* ---------- personnage en blocs ---------- */
// Boîte isométrique générique en coordonnées locales (u vers +x, v vers +y, z vers le haut), unité = px de grille.
function box(ctx: CanvasRenderingContext2D, ox: number, oy: number, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, col: RGB, faceDetail?: (ctx: CanvasRenderingContext2D, side: 'left' | 'right') => void) {
  const P = (u: number, v: number, z: number): [number, number] => [ox + (u - v), oy + (u + v) / 2 - z];
  quad(ctx, [P(u0, v1, z1), P(u1, v1, z1), P(u1, v1, z0), P(u0, v1, z0)], hex(col, 0.8)); // face gauche (v = v1)
  quad(ctx, [P(u1, v0, z1), P(u1, v1, z1), P(u1, v1, z0), P(u1, v0, z0)], hex(col, 0.64)); // face droite (u = u1)
  quad(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], hex(col, 1)); // dessus
  if (faceDetail) { faceDetail(ctx, 'left'); faceDetail(ctx, 'right'); }
}

/**
 * 4 orientations × 2 images de marche. Orientation : 0 = face vers +x (bas-droite écran),
 * 1 = face vers +y (bas-gauche), 2 = dos (haut-gauche), 3 = dos (haut-droite).
 */
function makePlayer(scene: Phaser.Scene) {
  const SKIN: RGB = [214, 168, 128], SHIRT: RGB = [62, 108, 140], PANTS: RGB = [58, 62, 86], HAIR: RGB = [70, 48, 32], BAG: RGB = [110, 86, 52];
  for (let o = 0; o < 4; o++) for (let f = 0; f < 2; f++) {
    const { c, ctx } = canvas(48, 72);
    const ox = 24, oy = 60; // pied au centre bas
    const swing = f === 0 ? 0 : 3;
    // jambes (alternance pour la marche)
    box(ctx, ox, oy, -6, -1, -3, 3, 0, 18 + (f ? swing : 0) * 0, PANTS);
    box(ctx, ox, oy, 1, 6, -3, 3, f ? 2 : 0, 18, PANTS);
    // corps
    box(ctx, ox, oy, -7, 7, -4, 4, 18, 36, SHIRT);
    // sac à dos, sur le dos (donc visible quand le personnage s'éloigne)
    if (o === 2) box(ctx, ox, oy, 7, 10, -5, 5, 21, 33, BAG);
    if (o === 3) box(ctx, ox, oy, -5, 5, 4, 7, 21, 33, BAG);
    // bras
    box(ctx, ox, oy, -10, -7, -2 + (f ? -swing : 0), 2, 20, 35, SKIN);
    box(ctx, ox, oy, 7, 10, -2, 2 + (f ? swing : 0), 20, 35, SKIN);
    // tête
    const faceToward = o === 0 ? 'right' : o === 1 ? 'left' : null;
    box(ctx, ox, oy, -6, 6, -6, 6, 36, 50, o >= 2 ? HAIR : SKIN, (cx, side) => {
      if (side !== faceToward) return;
      // yeux + bouche dessinés sur la face visible
      cx.fillStyle = '#1b1b24';
      const P = (u: number, v: number, z: number) => [ox + (u - v), oy + (u + v) / 2 - z];
      const dot = (u: number, v: number, z: number) => { const [x, y] = P(u, v, z); cx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); };
      if (side === 'right') { dot(6, -3, 44); dot(6, 3, 44); } else { dot(-3, 6, 44); dot(3, 6, 44); }
    });
    // cheveux
    box(ctx, ox, oy, -6, 6, -6, 6, 50, 53, HAIR);
    scene.textures.addCanvas(`pl_${o}_${f}`, c);
  }
}

/** Choisit la texture selon la direction (8 directions logiques -> 4 dessins + miroir). */
export function playerFrame(dir8: number, walkFrame: number): { key: string; flip: boolean } {
  // dir8 : 0=+x(bas-droite) 1=+x+y(bas) 2=+y(bas-gauche) 3=-x+y(gauche) 4=-x(haut-gauche) 5=-x-y(haut) 6=-y(haut-droite) 7=+x-y(droite)
  const map: Record<number, [number, boolean]> = { 0: [0, false], 1: [0, false], 2: [1, false], 3: [1, false], 4: [2, false], 5: [2, false], 6: [3, false], 7: [0, false] };
  const [o, flip] = map[dir8];
  return { key: `pl_${o}_${walkFrame}`, flip };
}
