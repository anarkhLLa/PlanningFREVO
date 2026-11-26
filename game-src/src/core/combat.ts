import { GameConfig } from './config';
import { addItem, newInventory } from './inventory';
import { itemDef } from './items';
import type { ZoneMap } from './map';
import { collides, type PlayerState } from './movement';
import { findPath, lineOfSight } from './pathfind';
import { mulberry32 } from './rng';
import type { GameState } from './state';
import { regionOffset } from './world';

/** Ennemis (cahier 11.4). La V1 commence avec le seul rôdeur. */
export interface EnemyDef { id: string; name: string; hp: number; walk: number; chase: number; damage: number; reach: number; cooldown: number; sight: number; fov: number; sense: number; leash: number }
export const ENEMIES: Record<string, EnemyDef> = {
  walker: { id: 'walker', name: 'Rôdeur', hp: 36, walk: 0.9, chase: 1.9, damage: 7, reach: 0.85, cooldown: 1.5, sight: 6, fov: 140, sense: 1.6, leash: 12 }
};

export type AIState = 'idle' | 'patrol' | 'alert' | 'chase' | 'attack' | 'return' | 'dead';
export interface Enemy {
  id: string; def: string; x: number; y: number; homeX: number; homeY: number;
  hp: number; state: AIState; facing: number;
  t: number; // minuteur générique de l'état courant
  cd: number; // recharge d'attaque
  path: [number, number][]; repath: number;
  hurt: number; // flash de dégâts (s)
  wander: [number, number] | null;
}

/** Points d'apparition (coordonnées locales à une région). Le refuge reste sûr : aucun ennemi. */
export const SPAWNS: { id: string; region: string; x: number; y: number; def: string }[] = [
  { id: 'gar-w1', region: 'garage', x: 5, y: 23, def: 'walker' },
  { id: 'gar-w2', region: 'garage', x: 11, y: 26, def: 'walker' },
  { id: 'gar-w3', region: 'garage', x: 14, y: 4, def: 'walker' },
  { id: 'gar-w4', region: 'garage', x: 23, y: 24, def: 'walker' }
];

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Crée les ennemis de la session. Un rôdeur abattu ne revient que le lendemain (pas de butin : rien à « farmer »). */
export function spawnEnemies(s: GameState, now = Date.now()): Enemy[] {
  const today = dayOf(now);
  return SPAWNS.filter(p => s.killed[p.id] !== today).map(p => {
    const o = regionOffset(p.region), d = ENEMIES[p.def];
    const x = o.x + p.x + 0.5, y = o.y + p.y + 0.5;
    return { id: p.id, def: p.def, x, y, homeX: x, homeY: y, hp: d.hp, state: 'idle', facing: 0, t: 1 + (x % 2), cd: 0, path: [], repath: 0, hurt: 0, wander: null };
  });
}

const angDiff = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

/** Le rôdeur voit-il / sent-il le joueur ? Champ de vision simplifié + murs (cahier 11.5). */
export function detects(e: Enemy, p: PlayerState, map: ZoneMap): boolean {
  const d = ENEMIES[e.def], dist = Math.hypot(p.x - e.x, p.y - e.y);
  const noise = p.running ? 2 : 0;
  if (dist <= d.sense + noise * 0.5) return true; // sent de très près
  if (dist > d.sight + noise) return false;
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  if (angDiff(a, e.facing) > ((d.fov / 2) * Math.PI) / 180) return false;
  return lineOfSight(map, e.x, e.y, p.x, p.y);
}

function moveToward(e: Enemy, tx: number, ty: number, speed: number, map: ZoneMap, dt: number) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 0.02) return true;
  const step = Math.min(d, speed * dt);
  e.facing = Math.atan2(dy, dx);
  const nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
  if (!collides(map, nx, e.y, 0.3)) e.x = nx;
  if (!collides(map, e.x, ny, 0.3)) e.y = ny;
  return d <= step + 0.02;
}

/** Suit le chemin A* vers une cible (recalculé régulièrement). */
function follow(e: Enemy, tx: number, ty: number, speed: number, map: ZoneMap, dt: number) {
  e.repath -= dt;
  if (e.repath <= 0 || !e.path.length) { e.path = findPath(map, e.x, e.y, tx, ty) ?? []; e.repath = 0.5; }
  if (!e.path.length) { moveToward(e, tx, ty, speed, map, dt); return; }
  const [cx, cy] = e.path[0];
  if (moveToward(e, cx + 0.5, cy + 0.5, speed, map, dt)) e.path.shift();
}

/**
 * Avance un ennemi de dt secondes. Renvoie les dégâts infligés au joueur ce tour-ci.
 * États : idle → patrol → alert → chase → attack → return (cahier 11.5).
 */
export function stepEnemy(e: Enemy, p: PlayerState, map: ZoneMap, dt: number, rnd: () => number): number {
  if (e.state === 'dead') return 0;
  const d = ENEMIES[e.def], dist = Math.hypot(p.x - e.x, p.y - e.y);
  e.cd = Math.max(0, e.cd - dt); e.hurt = Math.max(0, e.hurt - dt); e.t -= dt;
  const sees = p.health > 0 && detects(e, p, map);
  const fromHome = Math.hypot(e.x - e.homeX, e.y - e.homeY);
  switch (e.state) {
    case 'idle':
      if (sees) { e.state = 'alert'; e.t = 0.6; break; }
      if (e.t <= 0) { e.state = 'patrol'; e.wander = [e.homeX + (rnd() - 0.5) * 6, e.homeY + (rnd() - 0.5) * 6]; e.t = 6; }
      break;
    case 'patrol':
      if (sees) { e.state = 'alert'; e.t = 0.6; break; }
      if (!e.wander || e.t <= 0 || moveToward(e, e.wander[0], e.wander[1], d.walk, map, dt)) { e.state = 'idle'; e.t = 1.5 + rnd() * 2.5; }
      break;
    case 'alert': // un temps de réaction : on voit le rôdeur se tourner avant qu'il ne charge
      e.facing = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.t <= 0) e.state = 'chase';
      break;
    case 'chase':
      if (dist <= d.reach) { e.state = 'attack'; e.t = 0.45; break; } // élan avant le coup
      if (fromHome > d.leash || (!sees && e.t < -4)) { e.state = 'return'; e.path = []; break; }
      if (sees) e.t = 0;
      follow(e, p.x, p.y, d.chase, map, dt);
      break;
    case 'attack': {
      e.facing = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.t > 0) break;
      e.state = 'chase'; e.t = 0;
      if (dist <= d.reach + 0.25 && e.cd <= 0) { e.cd = d.cooldown; return d.damage; }
      break;
    }
    case 'return':
      if (sees && fromHome < d.leash * 0.7) { e.state = 'chase'; break; }
      follow(e, e.homeX, e.homeY, d.walk * 1.3, map, dt);
      if (Math.hypot(e.x - e.homeX, e.y - e.homeY) < 0.6) { e.state = 'idle'; e.t = 2; e.hp = Math.min(d.hp, e.hp + 10); }
      break;
  }
  return 0;
}

/* ---------- le joueur frappe ---------- */
export interface Weapon { damage: number; reach: number; arc: number; cooldown: number; stamina: number; knock: number }
export const WEAPONS: Record<string, Weapon> = {
  hands: { damage: 5, reach: 0.95, arc: 90, cooldown: 0.5, stamina: 6, knock: 0.2 },
  tool_basic: { damage: 12, reach: 1.25, arc: 110, cooldown: 0.65, stamina: 9, knock: 0.45 }
};
export function weaponOf(s: GameState): Weapon {
  const main = s.inventory.items.find(i => i.id === s.equipment.main);
  return (main && WEAPONS[main.def]) || WEAPONS.hands;
}

/** Coup porté dans la direction `angle` : touche les ennemis à portée, dans l'arc. Renvoie ceux touchés. */
export function playerAttack(p: PlayerState, angle: number, w: Weapon, enemies: Enemy[], map: ZoneMap): Enemy[] {
  const hit: Enemy[] = [];
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const dx = e.x - p.x, dy = e.y - p.y, dist = Math.hypot(dx, dy);
    if (dist > w.reach + 0.3) continue;
    if (dist > 0.35 && angDiff(Math.atan2(dy, dx), angle) > ((w.arc / 2) * Math.PI) / 180) continue;
    e.hp -= w.damage; e.hurt = 0.25;
    // recul, sans traverser les murs
    const k = w.knock / Math.max(dist, 0.1), nx = e.x + dx * k, ny = e.y + dy * k;
    if (!collides(map, nx, ny, 0.3)) { e.x = nx; e.y = ny; }
    if (e.state !== 'attack') { e.state = 'chase'; e.t = 0; }
    if (e.hp <= 0) { e.hp = 0; e.state = 'dead'; }
    hit.push(e);
  }
  return hit;
}

/* ---------- défaite douce (cahier 11.6) ---------- */
/**
 * Retour au refuge, santé partiellement rendue. En mode normal, une partie des ressources
 * transportées reste dans un sac perdu à l'endroit de la défaite (récupérable). En mode doux : rien n'est perdu.
 * Jamais touchés : capsules, bâtiments, déblocages, progression IRL, outil équipé.
 */
export function defeat(s: GameState, p: PlayerState, spawn: { x: number; y: number }, now = Date.now()): { bagId: string | null; lost: [string, number][] } {
  const C = GameConfig.combat;
  const lost: [string, number][] = [];
  let bagId: string | null = null;
  if (!C.gentle) {
    const bag = newInventory(16, 0), rnd = mulberry32(Math.floor(now / 1000));
    for (const it of [...s.inventory.items]) {
      if (it.id === s.equipment.main || itemDef(it.def).category === 'equipment') continue;
      const q = Math.floor(it.qty * C.lossShare + rnd() * 0.5);
      if (q <= 0) continue;
      addItem(bag, it.def, q);
      it.qty -= q;
      lost.push([it.def, q]);
    }
    s.inventory.items = s.inventory.items.filter(i => i.qty > 0);
    if (lost.length) {
      bagId = 'lostbag:' + now.toString(36);
      s.lostBags.push({ id: bagId, x: Math.floor(p.x), y: Math.floor(p.y), at: now });
      s.containers[bagId] = { items: bag, generated: true, searched: true };
    }
  }
  p.x = spawn.x; p.y = spawn.y;
  p.health = Math.round(GameConfig.player.maxHealth * C.respawnHealth);
  p.stamina = GameConfig.player.maxStamina;
  return { bagId, lost };
}
