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

  /**
   * Contrôles. 'grid' (choix de l'utilisateur) : on avance parallèlement au monde, le long des lignes de la carte
   * (→ = vers le bas-droite de l'écran, ↓ = bas-gauche, ↑ = haut-droite, ← = haut-gauche) ; au joystick,
   * la direction est calée sur les axes de la carte. 'screen' = → va vers la droite de l'écran (comme Project Zomboid).
   */
  controls: 'grid' as 'screen' | 'grid',

  camera: {
    zoomMin: 0.75,
    zoomMax: 2.5,
    zoomDefaultDesktop: 1.6,
    zoomDefaultMobile: 1.15,
    followLerp: 0.12
  },

  inventory: {
    slots: 12, // petit sac
    maxWeight: 20, // capacité normale (cahier 10.2)
    overloadTolerance: 10, // au-delà de maxWeight : ralenti, pas de course ; au-delà de max+tolérance : impossible de ramasser
    overloadSpeed: 0.65
  },

  interact: {
    range: 1.7, // distance max (cases) entre le joueur et le centre de l'objet
    searchSeconds: 0.9 // durée de la fouille (petite attente satisfaisante, pas punitive)
  },

  /** Ressources de départ (cahier 13.4). */
  start: {
    capsules: 20,
    starterCrate: { wood: 10, scrap: 5 }, // la caisse de départ se remet à niveau une fois par jour
    starterRefillDaily: true
  },

  /** Combat et défaite (cahier 11). */
  combat: {
    gentle: false, // mode doux : aucune perte de butin en cas de défaite
    lossShare: 0.5, // part des ressources transportées laissée dans le sac perdu
    respawnHealth: 0.6, // santé au réveil au refuge
    hitInvuln: 0.5, // invulnérabilité après un coup reçu (s)
    dodge: { time: 0.22, speed: 2.6, stamina: 15, cooldown: 0.45 } // esquive : durée, multiplicateur, coût, recharge
  },

  /** Constructions / réparations (cahier 13.3). */
  build: {
    bench: { wood: 10, scrap: 5 } as Record<string, number>
  },

  /** Distance (en cases) à laquelle les blocs devant le joueur deviennent transparents. */
  occlusionRange: 3,
  occlusionAlpha: 0.3
} as const;

export type GameConfigT = typeof GameConfig;
