import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/core/config';
import { defeat, detects, ENEMIES, playerAttack, spawnEnemies, stepEnemy, WEAPONS, type Enemy } from '../src/core/combat';
import { addItem, countOf } from '../src/core/inventory';
import { buildRefuge, isSolid } from '../src/core/map';
import { newPlayer, startDodge, stepPlayer } from '../src/core/movement';
import { findPath, lineOfSight } from '../src/core/pathfind';
import { newGame } from '../src/core/state';
import { buildWorld } from '../src/core/world';

const R = buildRefuge(1), W = buildWorld();
const enemyAt = (x: number, y: number, facing = 0): Enemy => ({ id: 't', def: 'walker', x, y, homeX: x, homeY: y, hp: ENEMIES.walker.hp, state: 'idle', facing, t: 5, cd: 0, path: [], repath: 0, hurt: 0, wander: null });
const rnd = () => 0.5;

describe('recherche de chemin', () => {
  it('contourne la cabane sans traverser les murs ni couper les coins', () => {
    const path = findPath(R, 9.5, 13.5, 17.5, 13.5)!; // de l'ouest de la cabane à sa porte est
    expect(path).not.toBeNull();
    for (const [x, y] of path) expect(isSolid(R, x, y)).toBe(false);
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      if (ax !== bx && ay !== by) expect(isSolid(R, bx, ay) || isSolid(R, ax, by)).toBe(false);
    }
  });
  it('les murs bloquent la vue', () => {
    expect(lineOfSight(R, 13.5, 13.5, 13.5, 9.5)).toBe(false); // à travers le mur nord de la cabane
    expect(lineOfSight(R, 18.5, 14.5, 22.5, 14.5)).toBe(true);
  });
});

describe('rôdeur', () => {
  it('voit devant lui, pas derrière ; sent de très près ; pas à travers un mur', () => {
    const p = newPlayer(22.5, 22.5);
    expect(detects(enemyAt(18.5, 22.5, 0), p, R)).toBe(true);
    expect(detects(enemyAt(18.5, 22.5, Math.PI), p, R)).toBe(false);
    expect(detects(enemyAt(21.5, 22.5, Math.PI), p, R)).toBe(true); // tout près : il sent
    const inside = newPlayer(13.5, 13.5);
    expect(detects(enemyAt(13.5, 9.5, Math.PI / 2), inside, R)).toBe(false);
  });
  it('poursuit, frappe avec un temps de recharge, puis rentre s’il s’éloigne trop', () => {
    const p = newPlayer(22.5, 22.5), e = enemyAt(19.5, 22.5, 0);
    let dmg = 0;
    for (let i = 0; i < 200; i++) dmg += stepEnemy(e, p, R, 0.05, rnd); // 10 s
    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThanOrEqual(ENEMIES.walker.damage * Math.ceil(10 / ENEMIES.walker.cooldown));
    // le joueur s'enfuit très loin : le rôdeur abandonne et rentre
    p.x = 22.5; p.y = 31; e.homeX = 19.5; e.x = 19.5 + ENEMIES.walker.leash + 1; e.state = 'chase';
    stepEnemy(e, p, R, 0.05, rnd);
    expect(e.state).toBe('return');
  });
});

describe('le joueur se défend', () => {
  it('le coup touche devant, pas derrière ; l’ennemi meurt à 0 PV', () => {
    const p = newPlayer(20.5, 20.5);
    const front = enemyAt(21.5, 20.5), back = enemyAt(19.5, 20.5);
    playerAttack(p, 0, WEAPONS.tool_basic, [front, back], R);
    expect(front.hp).toBe(ENEMIES.walker.hp - WEAPONS.tool_basic.damage);
    expect(back.hp).toBe(ENEMIES.walker.hp);
    for (let i = 0; i < 5; i++) { front.x = 21.5; playerAttack(p, 0, WEAPONS.tool_basic, [front], R); }
    expect(front.state).toBe('dead');
  });
  it('l’esquive coûte de l’endurance, rend invulnérable et déplace vite', () => {
    const p = newPlayer(20.5, 22.5); p.facing = 0;
    expect(startDodge(p)).toBe(true);
    expect(p.stamina).toBe(GameConfig.player.maxStamina - GameConfig.combat.dodge.stamina);
    expect(p.invuln).toBeGreaterThan(0);
    stepPlayer(p, { sx: 0, sy: 0, run: false }, R, 0.1);
    expect(p.x).toBeGreaterThan(20.6);
    expect(startDodge(p)).toBe(false); // recharge
  });
});

describe('défaite douce', () => {
  it('retour au refuge, santé partielle, une partie du butin dans un sac perdu ; capsules intactes', () => {
    const s = newGame(W); addItem(s.inventory, 'wood', 10); addItem(s.inventory, 'scrap', 6);
    const p = newPlayer(20.5, 45.5); p.health = 0;
    const caps = s.ledger.entries.length;
    const r = defeat(s, p, W.spawn, Date.UTC(2026, 10, 26, 12));
    expect([p.x, p.y]).toEqual([W.spawn.x, W.spawn.y]);
    expect(p.health).toBe(GameConfig.player.maxHealth * GameConfig.combat.respawnHealth);
    expect(r.bagId).not.toBeNull();
    const bag = s.containers[r.bagId!];
    expect(countOf(bag.items, 'wood') + countOf(s.inventory, 'wood')).toBe(10); // rien ne disparaît : déplacé dans le sac
    expect(s.inventory.items.some(i => i.def === 'tool_basic')).toBe(true); // l'outil reste
    expect(s.ledger.entries.length).toBe(caps);
    expect(s.lostBags[0]).toMatchObject({ x: 20, y: 45 });
  });
  it('mode doux : rien n’est perdu', () => {
    const C = GameConfig.combat as { gentle: boolean };
    C.gentle = true;
    try {
      const s = newGame(W); addItem(s.inventory, 'wood', 10);
      const r = defeat(s, newPlayer(20.5, 45.5), W.spawn);
      expect(r.bagId).toBeNull(); expect(countOf(s.inventory, 'wood')).toBe(10);
    } finally { C.gentle = false; }
  });
});

describe('apparition', () => {
  it('aucun rôdeur au refuge ; un rôdeur abattu revient le lendemain seulement', () => {
    const s = newGame(W), T = Date.UTC(2026, 10, 26, 12);
    const all = spawnEnemies(s, T);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every(e => e.y >= 32)).toBe(true); // tous dans la région du garage
    s.killed[all[0].id] = '2026-11-26';
    expect(spawnEnemies(s, T).length).toBe(all.length - 1);
    expect(spawnEnemies(s, T + 864e5).length).toBe(all.length);
    for (const e of all) expect(isSolid(W, Math.floor(e.x), Math.floor(e.y))).toBe(false);
  });
});
