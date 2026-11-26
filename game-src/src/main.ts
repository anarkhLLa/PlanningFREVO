import Phaser from 'phaser';
import './style.css';
import { WorldScene } from './game/scenes/WorldScene';
import { loadGame } from './game/save';

const saved = await loadGame();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2230',
  pixelArt: true, // rendu net, façon blocs
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  input: { activePointers: 3 },
  scene: [WorldScene],
  callbacks: { preBoot: g => g.registry.set('state', saved) }
});
void game;
