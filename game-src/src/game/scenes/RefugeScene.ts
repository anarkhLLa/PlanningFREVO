import Phaser from 'phaser';
import { GameConfig } from '../../core/config';
import { depthOf, toScreen } from '../../core/iso';
import { buildRefuge, type ZoneMap } from '../../core/map';
import { facing8, newPlayer, stepPlayer, type PlayerState } from '../../core/movement';
import { Controls } from '../input';
import { Hud } from '../hud';
import { blockKey, GROUND_VARIANTS, groundKey, makeTextures, playerFrame } from '../textures';

interface BlockSprite { img: Phaser.GameObjects.Image; x: number; y: number; z: number }

/** Scène du refuge : carte isométrique, survivant contrôlable, caméra, transparence des murs. */
export class RefugeScene extends Phaser.Scene {
  private map!: ZoneMap;
  private player!: PlayerState;
  private playerImg!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private blocks: BlockSprite[] = [];
  private controls!: Controls;
  private hud!: Hud;
  private walkTime = 0;

  constructor() { super('refuge'); }

  create() {
    makeTextures(this);
    this.map = buildRefuge(1);
    this.player = newPlayer(this.map.spawn.x, this.map.spawn.y);
    this.drawMap();

    this.shadow = this.add.image(0, 0, 'shadow');
    this.playerImg = this.add.image(0, 0, 'pl_0_0').setOrigin(0.5, 64 / 76);

    const root = document.getElementById('hud')!;
    this.controls = new Controls(root);
    this.hud = new Hud(root, this);
    this.setupCamera();
    this.syncPlayerSprite(0);
    // accès de débogage (tests automatiques, console)
    (window as unknown as { __scene: RefugeScene }).__scene = this;
  }

  /** Sol (couche fixe) + cubes empilés triés en profondeur. */
  private drawMap() {
    const m = this.map;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const c = m.cells[y * m.w + x];
      const p = toScreen(x + 0.5, y + 0.5);
      const variant = (x * 7 + y * 13) % GROUND_VARIANTS;
      this.add.image(p.x, p.y, groundKey(c.ground) + variant).setDepth(-1e7);
      c.stack.forEach((b, z) => {
        // origine : centre du bas du cube posé au centre de la case, puis monté de z blocs
        const img = this.add.image(p.x, p.y - z * GameConfig.blockH, blockKey(b)).setOrigin(0.5, 0.75);
        img.setDepth(depthOf(x + 0.5, y + 0.5, z));
        this.blocks.push({ img, x: x + 0.5, y: y + 0.5, z });
      });
    }
  }

  private setupCamera() {
    const cam = this.cameras.main;
    const C = GameConfig.camera;
    cam.setBackgroundColor('#1d2230');
    // limites : les 4 coins de la carte projetés, avec une marge
    const a = toScreen(0, 0), b = toScreen(this.map.w, 0), c = toScreen(0, this.map.h), d = toScreen(this.map.w, this.map.h);
    const pad = 96;
    cam.setBounds(c.x - pad, a.y - pad * 2, b.x - c.x + pad * 2, d.y - a.y + pad * 3);
    cam.setZoom(this.controls.touch ? C.zoomDefaultMobile : C.zoomDefaultDesktop);
    cam.startFollow(this.playerImg, true, C.followLerp, C.followLerp);
    cam.setRoundPixels(true);

    // Molette : zoom
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.9 : 1.1));
    // Pincer : zoom à deux doigts
    let pinch = 0;
    this.input.addPointer(1);
    this.input.on('pointermove', () => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (pinch) this.zoomBy(d / pinch);
        pinch = d;
      } else pinch = 0;
    });
  }

  zoomBy(k: number) {
    const C = GameConfig.camera, cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * k, C.zoomMin, C.zoomMax));
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000); // pas de « saut » après un onglet en arrière-plan
    stepPlayer(this.player, this.controls.read(), this.map, dt);
    this.syncPlayerSprite(dt);
    this.updateOcclusion();
    this.hud.update(this.player);
  }

  private syncPlayerSprite(dt: number) {
    const p = this.player, s = toScreen(p.x, p.y);
    if (p.moving) this.walkTime += dt * (p.running ? 11 : 8); else this.walkTime = 0;
    const frame = p.moving ? Math.floor(this.walkTime) % 2 : 0;
    const bob = p.moving ? Math.abs(Math.sin(this.walkTime * Math.PI)) * 2 : 0;
    const f = playerFrame(facing8(p.facing), frame);
    this.playerImg.setTexture(f.key).setFlipX(f.flip).setPosition(s.x, s.y - bob);
    this.playerImg.setDepth(depthOf(p.x, p.y, 0.5));
    this.shadow.setPosition(s.x, s.y).setDepth(depthOf(p.x, p.y, 0.1));
  }

  /** Les blocs qui cachent le joueur deviennent transparents (cahier 2.4 / 9.5). */
  private updateOcclusion() {
    const p = this.player, R = GameConfig.occlusionRange, pd = p.x + p.y;
    const pb = this.playerImg.getBounds();
    for (const b of this.blocks) {
      let alpha = 1;
      if (b.x + b.y > pd && b.x - p.x > -1.5 && b.y - p.y > -1.5 && b.x - p.x < R + 1 && b.y - p.y < R + 1) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(pb, b.img.getBounds())) alpha = GameConfig.occlusionAlpha;
      }
      if (b.img.alpha !== alpha) b.img.setAlpha(alpha);
    }
  }
}
