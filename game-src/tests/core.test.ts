import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/core/config';
import { screenDirToGrid, toScreen, toWorld } from '../src/core/iso';
import { buildRefuge, isSolid } from '../src/core/map';
import { collides, newPlayer, stepPlayer } from '../src/core/movement';

describe('projection isométrique', () => {
  it('suit la formule du cahier des charges', () => {
    expect(toScreen(3, 1)).toEqual({ x: (3 - 1) * 32, y: (3 + 1) * 16 });
    expect(toScreen(0, 0, 10).y).toBe(-10);
  });
  it('toWorld est l’inverse de toScreen', () => {
    for (const [x, y] of [[0, 0], [5.5, 2.25], [31, 7]]) {
      const s = toScreen(x, y), w = toWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(x); expect(w.y).toBeCloseTo(y);
    }
  });
  it('« haut » à l’écran = vers le coin nord de la grille, normalisé', () => {
    const d = screenDirToGrid(0, -1);
    expect(d.x).toBeCloseTo(-Math.SQRT1_2); expect(d.y).toBeCloseTo(-Math.SQRT1_2);
    const r = screenDirToGrid(1, 0); // droite écran : x+, y-, sans bouger verticalement
    expect(toScreen(r.x, r.y).y).toBeCloseTo(0);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(1);
  });
});

describe('carte du refuge', () => {
  const m = buildRefuge(1);
  it('fait 32 × 32 et est déterministe', () => {
    expect(m.w).toBe(32); expect(m.h).toBe(32);
    expect(JSON.stringify(buildRefuge(1))).toBe(JSON.stringify(m));
  });
  it('le point de départ est libre et les bords sont infranchissables', () => {
    expect(collides(m, m.spawn.x, m.spawn.y)).toBe(false);
    expect(isSolid(m, -1, 5)).toBe(true);
    expect(isSolid(m, 32, 5)).toBe(true);
  });
  it('la porte de la cabane est ouverte et les murs sont pleins', () => {
    expect(isSolid(m, 16, 13)).toBe(false);
    expect(isSolid(m, 16, 12)).toBe(true);
  });
});

describe('déplacement', () => {
  const m = buildRefuge(1);
  const dt = 1 / 60;
  it('marche à la vitesse configurée', () => {
    const p = newPlayer(20.5, 22.5); // zone dégagée de la cour/prairie
    // on cherche une case libre autour au besoin
    const x0 = p.x, y0 = p.y;
    for (let i = 0; i < 30; i++) stepPlayer(p, { sx: 1, sy: 0, run: false }, m, dt);
    const dist = Math.hypot(p.x - x0, p.y - y0);
    expect(dist).toBeLessThanOrEqual(GameConfig.player.walkSpeed * 0.5 + 1e-6);
  });
  it('ne traverse jamais un mur, même en courant longtemps', () => {
    const p = newPlayer(13.5, 13.5); // dans la cabane
    for (let i = 0; i < 600; i++) stepPlayer(p, { sx: -1, sy: -1, run: true }, m, 0.05);
    expect(collides(m, p.x, p.y)).toBe(false);
    expect(p.x).toBeGreaterThan(11); expect(p.y).toBeGreaterThan(11); // reste à l'intérieur
  });
  it('la course consomme l’endurance puis se bloque jusqu’au seuil', () => {
    const p = newPlayer(m.spawn.x, m.spawn.y);
    for (let i = 0; i < 60 * 12; i++) stepPlayer(p, { sx: 0.01, sy: 0.06, run: true }, m, dt);
    expect(p.exhausted || p.stamina < GameConfig.player.maxStamina).toBe(true);
    const q = newPlayer(m.spawn.x, m.spawn.y); q.stamina = 0;
    stepPlayer(q, { sx: 1, sy: 0, run: true }, m, dt);
    expect(q.running).toBe(false);
  });
  it('l’endurance remonte au repos', () => {
    const p = newPlayer(m.spawn.x, m.spawn.y); p.stamina = 50;
    stepPlayer(p, { sx: 0, sy: 0, run: false }, m, 1);
    expect(p.stamina).toBeCloseTo(50 + GameConfig.player.staminaRegen);
  });
});
