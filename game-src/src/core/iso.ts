import { GameConfig } from './config';

/**
 * Projection isométrique (cahier des charges 2.4).
 * Coordonnées « monde » = cases logiques (flottantes). (0,0) = coin nord de la carte.
 */
export function toScreen(x: number, y: number, elevation = 0): { x: number; y: number } {
  return {
    x: ((x - y) * GameConfig.tileW) / 2,
    y: ((x + y) * GameConfig.tileH) / 2 - elevation
  };
}

/** Inverse de toScreen (au sol, élévation 0). */
export function toWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (GameConfig.tileW / 2);
  const b = sy / (GameConfig.tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Convertit une direction « écran » (haut = -1 en y) en direction sur la grille,
 * normalisée : la vitesse est la même dans toutes les directions de la grille.
 */
export function screenDirToGrid(sx: number, sy: number): { x: number; y: number } {
  if (sx === 0 && sy === 0) return { x: 0, y: 0 };
  // Une unité écran horizontale vaut 2 unités verticales en iso (tuile 2:1).
  const gx = sx + sy * 2;
  const gy = sy * 2 - sx;
  const len = Math.hypot(gx, gy);
  return { x: gx / len, y: gy / len };
}

/** Ordre d'affichage : plus (x+y) est grand, plus l'objet est « devant ». */
export function depthOf(x: number, y: number, z = 0): number {
  return (x + y) * 100 + z;
}
