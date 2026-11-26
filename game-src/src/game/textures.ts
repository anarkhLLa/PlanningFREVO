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
  concrete: (i, j, r) => (i % 4 === 0 && j % 4 === 0 ? [120, 120, 118] : jitter([150, 150, 146], r, 0.05)),
  brick: (i, j, r, face) => face === 'top' ? jitter([150, 70, 56], r, 0.08) : ((j % 2 === 1) || ((i + (j % 4 === 0 ? 0 : 2)) % 4 === 0) ? [190, 184, 170] : jitter([156, 72, 56], r, 0.1)),
  cache: (i, j, r, face) => {
    if (face === 'top') return i === 3 || i === 4 ? [230, 190, 60] : jitter([88, 104, 60], r, 0.06);
    const frame = i === 0 || j === 0 || i === N - 1 || j === N - 1;
    return frame ? [58, 70, 40] : j === 3 ? [230, 190, 60] : jitter([96, 112, 64], r, 0.06);
  },
  bench_ok: (i, j, r, face) => face === 'top' ? (i % 4 === 3 ? [110, 80, 48] : jitter([186, 140, 84], r, 0.05)) : (j > 5 || (i > 0 && i < N - 1 && j > 1) ? [70, 52, 34] : jitter([150, 110, 64], r, 0.05)),
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
  for (const g of ['grass', 'grass2', 'dirt', 'road', 'gravel', 'planks', 'concrete'] as Ground[]) {
    for (let v = 0; v < GROUND_VARIANTS; v++) {
      const { c, ctx } = canvas(TW, TH);
      paintTop(ctx, PAINT[g], mulberry32(1000 + v * 31 + g.length * 7));
      tex.addCanvas(groundKey(g) + v, c);
    }
  }
  // Cubes : dessus + face gauche (ombre 0.78) + face droite (ombre 0.62)
  for (const b of ['log', 'leaves', 'planks', 'stone', 'crate', 'bench', 'bench_ok', 'cache', 'brick'] as Block[]) {
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

/* ---------- personnage en blocs, 8 vraies orientations ---------- */
type Pt = [number, number];
interface Part { u0: number; u1: number; v0: number; v1: number; z0: number; z1: number; col: RGB; face?: boolean }

/**
 * Dessine un modèle fait de boîtes, tourné d'un angle quelconque autour de l'axe vertical.
 * Le modèle regarde vers +u ; la caméra regarde depuis +x+y (faces visibles : celles tournées vers elle).
 */
function drawModel(ctx: CanvasRenderingContext2D, ox: number, oy: number, parts: Part[], angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rot = (u: number, v: number): Pt => [u * c - v * s, u * s + v * c];
  const P = (u: number, v: number, z: number): Pt => { const [x, y] = rot(u, v); return [ox + (x - y), oy + (x + y) / 2 - z]; };
  // ordre du peintre : du fond (x+y petit) vers l'avant, puis du bas vers le haut
  const sorted = parts.map(p => { const [x, y] = rot((p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2); return { p, d: x + y + p.z0 * 0.002 }; }).sort((a, b) => a.d - b.d);
  for (const { p } of sorted) {
    const { u0, u1, v0, v1, z0, z1, col } = p;
    // 4 faces latérales : [coins (u,v) du bas], normale locale
    const sides: { a: Pt; b: Pt; n: Pt; front: boolean }[] = [
      { a: [u1, v0], b: [u1, v1], n: [1, 0], front: true },
      { a: [u0, v1], b: [u0, v0], n: [-1, 0], front: false },
      { a: [u1, v1], b: [u0, v1], n: [0, 1], front: false },
      { a: [u0, v0], b: [u1, v0], n: [0, -1], front: false }
    ];
    for (const f of sides) {
      const [nx, ny] = rot(f.n[0], f.n[1]);
      const view = (nx + ny) / Math.SQRT2; // > 0 : face tournée vers la caméra
      if (view <= 0.02) continue;
      const light = 0.58 + 0.3 * Math.max(0, ny * 0.8 + nx * 0.2) + 0.1 * view;
      quad(ctx, [P(f.a[0], f.a[1], z1), P(f.b[0], f.b[1], z1), P(f.b[0], f.b[1], z0), P(f.a[0], f.a[1], z0)], hex(col, light));
      if (p.face && f.front) {
        // yeux sur la face avant de la tête
        ctx.fillStyle = '#1b1b24';
        const zEye = z0 + (z1 - z0) * 0.55;
        for (const vv of [v0 + (v1 - v0) * 0.28, v0 + (v1 - v0) * 0.72]) {
          const [x, y] = P(u1, vv, zEye);
          ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
        }
      }
    }
    quad(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], hex(col, 1));
  }
}

interface Look { skin: RGB; shirt: RGB; pants: RGB; hair: RGB; bag?: RGB; shoe: RGB; zombie?: boolean }
const SURVIVOR: Look = { skin: [214, 168, 128], shirt: [62, 108, 140], pants: [58, 62, 86], hair: [70, 48, 32], bag: [110, 86, 52], shoe: [40, 34, 30] };
const WALKER: Look = { skin: [128, 146, 104], shirt: [92, 74, 62], pants: [56, 58, 64], hair: [44, 40, 36], shoe: [36, 32, 30], zombie: true };

function characterParts(L: Look, f: number): Part[] {
  const st = f ? 3 : 0; // foulée
  const parts: Part[] = [
    { u0: -2 + st, u1: 3 + st, v0: -5, v1: -1, z0: 0, z1: 3, col: L.shoe },
    { u0: -2 - st, u1: 3 - st, v0: 1, v1: 5, z0: 0, z1: 3, col: L.shoe },
    { u0: -2 + st / 2, u1: 2 + st / 2, v0: -5, v1: -1, z0: 3, z1: 18, col: L.pants },
    { u0: -2 - st / 2, u1: 2 - st / 2, v0: 1, v1: 5, z0: 3, z1: 18, col: L.pants },
    { u0: -3, u1: 3, v0: -6, v1: 6, z0: 18, z1: L.zombie ? 34 : 36, col: L.shirt }
  ];
  if (L.bag) parts.push({ u0: -6, u1: -3, v0: -4, v1: 4, z0: 21, z1: 33, col: L.bag });
  if (L.zombie) {
    // bras tendus en avant, tête un peu basse
    parts.push({ u0: 0, u1: 11 + st, v0: -9, v1: -6, z0: 27, z1: 31, col: L.skin });
    parts.push({ u0: 0, u1: 11 - st, v0: 6, v1: 9, z0: 27, z1: 31, col: L.skin });
    parts.push({ u0: -4, u1: 6, v0: -5, v1: 5, z0: 34, z1: 46, col: L.skin, face: true });
    parts.push({ u0: -4.5, u1: 4, v0: -5.5, v1: 5.5, z0: 46, z1: 48, col: L.hair });
    parts.push({ u0: -2, u1: 2, v0: -2, v1: 2, z0: 22, z1: 26, col: [120, 40, 36] }); // tache sur la chemise
  } else {
    parts.push({ u0: -2 - st, u1: 2 - st, v0: -9, v1: -6, z0: 20, z1: 35, col: L.skin });
    parts.push({ u0: -2 + st, u1: 2 + st, v0: 6, v1: 9, z0: 20, z1: 35, col: L.skin });
    parts.push({ u0: -5, u1: 5, v0: -5, v1: 5, z0: 36, z1: 48, col: L.skin, face: true });
    parts.push({ u0: -5.5, u1: 5, v0: -5.5, v1: 5.5, z0: 48, z1: 51, col: L.hair });
    parts.push({ u0: -5.5, u1: -4.8, v0: -5.5, v1: 5.5, z0: 38, z1: 48, col: L.hair });
  }
  return parts;
}

function makeCharacter(scene: Phaser.Scene, prefix: string, L: Look) {
  for (let d = 0; d < 8; d++) for (let f = 0; f < 2; f++) {
    const { c, ctx } = canvas(56, 76);
    drawModel(ctx, 28, 64, characterParts(L, f), (d * Math.PI) / 4);
    scene.textures.addCanvas(`${prefix}_${d}_${f}`, c);
  }
}

function makePlayer(scene: Phaser.Scene) {
  makeCharacter(scene, 'pl', SURVIVOR);
  makeCharacter(scene, 'wk', WALKER);
  // sac perdu (posé au sol)
  const { c, ctx } = canvas(40, 36);
  drawModel(ctx, 20, 30, [{ u0: -7, u1: 7, v0: -5, v1: 5, z0: 0, z1: 10, col: [110, 86, 52] }, { u0: -4, u1: 4, v0: -3, v1: 3, z0: 10, z1: 13, col: [90, 70, 42] }], 0.4);
  scene.textures.addCanvas('lostbag', c);
  // arc du coup porté
  const a = canvas(96, 96);
  a.ctx.strokeStyle = 'rgba(255,255,255,0.85)'; a.ctx.lineWidth = 6; a.ctx.lineCap = 'round';
  a.ctx.beginPath(); a.ctx.arc(48, 48, 36, -0.9, 0.9); a.ctx.stroke();
  a.ctx.strokeStyle = 'rgba(255,240,200,0.5)'; a.ctx.lineWidth = 12; a.ctx.beginPath(); a.ctx.arc(48, 48, 30, -0.6, 0.6); a.ctx.stroke();
  scene.textures.addCanvas('slash', a.c);
}

/** Texture du personnage pour une des 8 directions de la grille (0 = +x, sens horaire). */
export function playerFrame(dir8: number, walkFrame: number): { key: string; flip: boolean } {
  return { key: `pl_${dir8}_${walkFrame}`, flip: false };
}
