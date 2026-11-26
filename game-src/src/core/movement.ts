import { GameConfig } from './config';
import { screenDirToGrid } from './iso';
import { isSolid, type ZoneMap } from './map';

export interface PlayerState {
  x: number; // position en cases (flottant)
  y: number;
  facing: number; // angle en radians, sur la grille
  health: number;
  stamina: number;
  running: boolean;
  exhausted: boolean; // endurance vidée : course bloquée jusqu'au seuil
  moving: boolean;
  overloaded: boolean; // calculé par la partie à partir du poids transporté
}

/** Intention envoyée par les contrôles (clavier, joystick… ou réseau plus tard). */
export interface MoveInput {
  sx: number; // direction écran : -1..1 (droite positive)
  sy: number; // -1..1 (bas positif)
  run: boolean;
}

export function newPlayer(x: number, y: number): PlayerState {
  const P = GameConfig.player;
  return { x, y, facing: Math.PI / 4, health: P.maxHealth, stamina: P.maxStamina, running: false, exhausted: false, moving: false, overloaded: false };
}

/** Le cercle du joueur touche-t-il une case solide ? */
export function collides(map: ZoneMap, x: number, y: number, r = GameConfig.player.radius): boolean {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!isSolid(map, tx, ty)) continue;
    // distance du centre au rectangle de la case
    const nx = Math.max(tx, Math.min(x, tx + 1)), ny = Math.max(ty, Math.min(y, ty + 1));
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
  }
  return false;
}

/**
 * Avance la simulation du joueur de dt secondes. Fonction pure sur l'état :
 * la même logique servira côté serveur en multijoueur (cahier 48.1).
 */
export function stepPlayer(p: PlayerState, input: MoveInput, map: ZoneMap, dt: number): void {
  const P = GameConfig.player;
  const len = Math.hypot(input.sx, input.sy);
  const strength = Math.min(1, len);
  const dir = GameConfig.controls === 'grid' ? gridDir(input.sx, input.sy) : screenDirToGrid(input.sx, input.sy);
  p.moving = strength > 0.05;

  // Endurance (cahier 9.2)
  if (p.stamina <= 0) p.exhausted = true;
  if (p.exhausted && p.stamina >= P.runMinStamina) p.exhausted = false;
  p.running = p.moving && input.run && !p.exhausted && p.stamina > 0 && !p.overloaded;
  if (p.running) p.stamina = Math.max(0, p.stamina - P.runCost * dt);
  else p.stamina = Math.min(P.maxStamina, p.stamina + P.staminaRegen * dt);

  if (!p.moving) return;
  p.facing = Math.atan2(dir.y, dir.x);
  const speed = (p.running ? P.runSpeed : P.walkSpeed) * strength * (p.overloaded ? GameConfig.inventory.overloadSpeed : 1);
  // Déplacement axe par axe : on glisse le long des murs au lieu de se bloquer.
  // Sous-pas pour ne jamais traverser un mur fin, même à faible FPS.
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
  const dx = (dir.x * speed * dt) / steps, dy = (dir.y * speed * dt) / steps;
  for (let i = 0; i < steps; i++) {
    if (!collides(map, p.x + dx, p.y)) p.x += dx;
    if (!collides(map, p.x, p.y + dy)) p.y += dy;
  }
}

/** Mode 'grid' : droite = +x, bas = +y sur la carte. */
function gridDir(sx: number, sy: number) {
  const l = Math.hypot(sx, sy);
  return l ? { x: sx / l, y: sy / l } : { x: 0, y: 0 };
}

/** Direction d'affichage parmi 8 (0 = vers +x sur la grille, sens horaire). */
export function facing8(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
}
