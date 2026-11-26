/**
 * Tous les réglages de jeu au même endroit (cahier des charges, partie 32).
 * Rien de « magique » ailleurs dans le code : on ajuste ici après les tests.
 */
export const GameConfig = {
  /** Taille graphique d'une tuile isométrique (px). */
  tileW: 64,
  tileH: 32,
  /** Hauteur d'un bloc (cube) à l'écran (px). */
  blockH: 32,

  player: {
    walkSpeed: 3.5, // cases / seconde
    runSpeed: 5,
    radius: 0.28, // rayon de collision (en cases)
    maxHealth: 100,
    maxStamina: 100,
    runCost: 12, // endurance / seconde en course
    staminaRegen: 8, // endurance / seconde hors course
    runMinStamina: 10 // en dessous, on ne peut pas relancer la course
  },

  camera: {
    zoomMin: 0.75,
    zoomMax: 2.5,
    zoomDefaultDesktop: 1.6,
    zoomDefaultMobile: 1.15,
    followLerp: 0.12
  },

  /** Distance (en cases) à laquelle les blocs devant le joueur deviennent transparents. */
  occlusionRange: 3,
  occlusionAlpha: 0.3
} as const;

export type GameConfigT = typeof GameConfig;
