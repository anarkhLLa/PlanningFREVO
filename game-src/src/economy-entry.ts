/**
 * Petit module autonome chargé par le planning (game/economy.js) :
 * le planning affiche le même solde et les mêmes caches que le jeu, sans dépendre de Phaser.
 */
import { computeContracts, EconomyConfig, summary } from './core/economy';

(window as unknown as { LOEconomy: unknown }).LOEconomy = { summary, computeContracts, EconomyConfig, SAVE_KEY: 'last-outpost.save', PLANNER_KEY: 'planning.v1' };
