import Phaser from 'phaser';
import './style.css';
import { RefugeScene } from './game/scenes/RefugeScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2230',
  pixelArt: true, // rendu net, façon blocs
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  input: { activePointers: 3 },
  scene: [RefugeScene]
});
