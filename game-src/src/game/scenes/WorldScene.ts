import Phaser from 'phaser';
import { GameConfig } from '../../core/config';
import { depthOf, toScreen, toWorld } from '../../core/iso';
import { type CacheSpec, type WorldObject, type ZoneMap } from '../../core/map';
import { facing8, stepPlayer, type PlayerState } from '../../core/movement';
import { carried, claimIfEmpty, findTarget, isOverloaded, newGame, openContainer, playerFromState, repairBench, storePlayer, type GameState } from '../../core/state';
import { buildWorld, regionAt } from '../../core/world';
import { syncFromPlanner, watchPlanner } from '../bridge';
import { CloudPush, reconcile } from '../cloud';
import { Hud } from '../hud';
import { Controls } from '../input';
import { Panels } from '../panels';
import { AutoSave } from '../save';
import { blockKey, GROUND_VARIANTS, groundKey, makeTextures, playerFrame } from '../textures';

interface BlockSprite { img: Phaser.GameObjects.Image; x: number; y: number; z: number }
interface Chunk { imgs: Phaser.GameObjects.GameObject[]; blocks: BlockSprite[] }
const CHUNK = 16; // cases par côté

/**
 * Scène du monde continu : une seule grande carte faite de régions (refuge, garage…),
 * affichée par morceaux de 16×16 cases autour de la caméra (on voit le monde apparaître
 * en avançant, sans transition). Gère le survivant, les interactions, la sauvegarde et le planning.
 * L'interface HTML (HUD, fenêtres, contrôles) est créée une seule fois.
 */
export class WorldScene extends Phaser.Scene {
  private map!: ZoneMap;
  private player!: PlayerState;
  private playerImg!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private chunks = new Map<string, Chunk>();
  private chunkTimer = 0;
  private regionId = '';
  private controls!: Controls;
  private hud!: Hud;
  private walkTime = 0;
  private state!: GameState;
  private panels!: Panels;
  private autosave!: AutoSave;
  private cloud!: CloudPush;
  private caches: CacheSpec[] = [];
  private target: WorldObject | null = null;
  private targetImg: Phaser.GameObjects.Image | null = null;
  private search: { obj: WorldObject; start: number } | null = null; // horloge réelle (indépendante des FPS)

  constructor() { super('world'); }

  create() {
    makeTextures(this);
    this.state = (this.registry.get('state') as GameState | null) ?? newGame(buildWorld());

    this.shadow = this.add.image(0, 0, 'shadow');
    this.playerImg = this.add.image(0, 0, 'pl_0_0').setOrigin(0.5, 64 / 76);

    const root = document.getElementById('hud')!;
    this.controls = new Controls(root);
    this.hud = new Hud(root, this);
    this.autosave = new AutoSave(() => { storePlayer(this.state, this.player); return this.state; }, () => this.cloud.soon());
    this.cloud = new CloudPush(() => this.state);
    this.panels = new Panels(root, () => this.state, () => this.onStateChanged(), () => this.interact(), this.controls.touch, () => this.doRepair());
    this.input.keyboard?.on('keydown-E', () => this.interact());

    this.syncPlanner(true);
    this.loadWorld();
    this.setupCamera();
    watchPlanner(() => this.syncPlanner(false));
    this.autosave.soon(100);
    void this.pullCloud();
    (window as unknown as { __scene: WorldScene }).__scene = this; // débogage / tests
  }

  /* ---------- monde continu, affiché par morceaux ---------- */
  private loadWorld() {
    this.clearChunks();
    this.target = null; this.targetImg = null; this.search = null;
    this.map = buildWorld(this.caches);
    this.state.zone = 'world';
    if (!this.player) this.player = playerFromState(this.state);
    this.updateCameraBounds();
    this.syncPlayerSprite(0);
    this.updateChunks();
    this.updateRegion();
  }

  private clearChunks() {
    for (const c of this.chunks.values()) for (const o of c.imgs) o.destroy();
    this.chunks.clear();
  }

  private get blocks(): BlockSprite[] {
    const out: BlockSprite[] = [];
    for (const c of this.chunks.values()) out.push(...c.blocks);
    return out;
  }

  /** Crée les morceaux visibles (+ une marge), détruit ceux qui sont loin. */
  private updateChunks() {
    const v = this.cameras.main.worldView;
    // les 4 coins de l'écran projetés sur la grille, + marge pour les blocs hauts
    const pts = [toWorld(v.x, v.y), toWorld(v.right, v.y), toWorld(v.x, v.bottom + 160), toWorld(v.right, v.bottom + 160)];
    const m = 4;
    const x0 = Math.floor((Math.min(...pts.map(p => p.x)) - m) / CHUNK), x1 = Math.floor((Math.max(...pts.map(p => p.x)) + m) / CHUNK);
    const y0 = Math.floor((Math.min(...pts.map(p => p.y)) - m) / CHUNK), y1 = Math.floor((Math.max(...pts.map(p => p.y)) + m) / CHUNK);
    const want = new Set<string>();
    for (let cy = Math.max(0, y0); cy <= Math.min(Math.ceil(this.map.h / CHUNK) - 1, y1); cy++)
      for (let cx = Math.max(0, x0); cx <= Math.min(Math.ceil(this.map.w / CHUNK) - 1, x1); cx++) want.add(cx + ',' + cy);
    for (const [k, c] of this.chunks) if (!want.has(k)) { for (const o of c.imgs) o.destroy(); this.chunks.delete(k); }
    for (const k of want) if (!this.chunks.has(k)) this.chunks.set(k, this.buildChunk(...(k.split(',').map(Number) as [number, number])));
  }

  private buildChunk(cx: number, cy: number): Chunk {
    const m = this.map, imgs: Phaser.GameObjects.GameObject[] = [], blocks: BlockSprite[] = [];
    const bench = m.objects.find(o => o.id === 'refuge:bench');
    const benchOk = this.state.built.includes('refuge:bench');
    for (let y = cy * CHUNK; y < Math.min(m.h, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(m.w, (cx + 1) * CHUNK); x++) {
      const c = m.cells[y * m.w + x];
      const p = toScreen(x + 0.5, y + 0.5);
      imgs.push(this.add.image(p.x, p.y, groundKey(c.ground) + ((x * 7 + y * 13) % GROUND_VARIANTS)).setDepth(-1e7));
      c.stack.forEach((b, z) => {
        const key = b === 'bench' && benchOk && bench && bench.x === x && bench.y === y ? 'bench_ok' : b;
        const img = this.add.image(p.x, p.y - z * GameConfig.blockH, blockKey(key)).setOrigin(0.5, 0.75).setDepth(depthOf(x + 0.5, y + 0.5, z));
        imgs.push(img); blocks.push({ img, x: x + 0.5, y: y + 0.5, z });
      });
    }
    return { imgs, blocks };
  }

  /** Nom de la région en haut de l'écran, mis à jour en marchant. */
  private updateRegion() {
    const r = regionAt(this.player.x, this.player.y);
    const id = r?.id ?? '';
    if (id === this.regionId) return;
    this.regionId = id;
    this.hud.setZone(r?.name ?? 'Terres abandonnées');
    if (r && this.regionToastReady) this.panels.toast('📍 ' + r.name);
    this.regionToastReady = true;
  }
  private regionToastReady = false;

  private setupCamera() {
    const cam = this.cameras.main, C = GameConfig.camera;
    cam.setBackgroundColor('#1d2230');
    cam.setZoom(this.controls.touch ? C.zoomDefaultMobile : C.zoomDefaultDesktop);
    cam.startFollow(this.playerImg, true, C.followLerp, C.followLerp);
    cam.setRoundPixels(true);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.9 : 1.1));
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
  private updateCameraBounds() {
    const a = toScreen(0, 0), b = toScreen(this.map.w, 0), c = toScreen(0, this.map.h), d = toScreen(this.map.w, this.map.h), pad = 96;
    this.cameras.main.setBounds(c.x - pad, a.y - pad * 2, b.x - c.x + pad * 2, d.y - a.y + pad * 3);
  }
  zoomBy(k: number) {
    const C = GameConfig.camera, cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * k, C.zoomMin, C.zoomMax));
  }

  /* ---------- boucle ---------- */
  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    const input = this.panels.open ? { sx: 0, sy: 0, run: false } : this.controls.read();
    if (this.search && (input.sx || input.sy)) this.search = null;
    stepPlayer(this.player, input, this.map, dt);
    this.syncPlayerSprite(dt);
    this.updateTarget();
    this.updateOcclusion();
    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0) { this.chunkTimer = 0.25; this.updateChunks(); this.updateRegion(); }
    this.hud.update(this.player, carried(this.state));
  }

  private syncPlayerSprite(dt: number) {
    const p = this.player, s = toScreen(p.x, p.y);
    if (p.moving) this.walkTime += dt * (p.running ? 11 : 8); else this.walkTime = 0;
    const frame = p.moving ? Math.floor(this.walkTime) % 2 : 0;
    const bob = p.moving ? Math.abs(Math.sin(this.walkTime * Math.PI)) * 2 : 0;
    const f = playerFrame(facing8(p.facing), frame);
    this.playerImg.setTexture(f.key).setFlipX(f.flip).setPosition(s.x, s.y - bob).setDepth(depthOf(p.x, p.y, 0.5));
    this.shadow.setPosition(s.x, s.y).setDepth(depthOf(p.x, p.y, 0.1));
  }

  /* ---------- interactions ---------- */
  private updateTarget() {
    const t = this.panels.open ? null : findTarget(this.map, this.player.x, this.player.y, this.player.facing);
    if (t !== this.target) {
      this.targetImg?.clearTint();
      this.target = t; this.search = null;
      this.targetImg = t ? this.blocks.find(b => b.z === 0 && b.x === t.x + 0.5 && b.y === t.y + 0.5)?.img ?? null : null;
      this.targetImg?.setTint(0xfff2b0);
    }
    if (this.search) {
      const k = (performance.now() - this.search.start) / 1000 / GameConfig.interact.searchSeconds;
      if (k >= 1) { const o = this.search.obj; this.search = null; this.openObject(o); }
      else this.panels.setTarget(t, k);
      return;
    }
    this.panels.setTarget(t);
  }

  interact() {
    const t = this.target;
    if (!t || this.panels.open || this.search) return;
    if (t.kind === 'bench') {
      if (t.id !== 'refuge:bench') { this.panels.toast('🔧 Un vieil établi rouillé. Rien d’utilisable.'); return; }
      this.panels.showBench(this.state.built.includes('refuge:bench'));
      return;
    }
    if (this.state.containers[t.id]?.searched) this.openObject(t);
    else this.search = { obj: t, start: performance.now() };
  }

  private openObject(o: WorldObject) {
    const c = openContainer(this.state, o);
    this.onStateChanged();
    this.panels.showContainer(o, c);
  }

  private doRepair(): boolean {
    const r = repairBench(this.state);
    if (!r.ok) return false;
    const img = this.blocks.find(b => b.z === 0 && this.map.objects.some(o => o.kind === 'bench' && b.x === o.x + 0.5 && b.y === o.y + 0.5))?.img;
    img?.setTexture(blockKey('bench_ok'));
    this.panels.toast('🔨 Établi réparé ! Ton refuge s’améliore.');
    this.onStateChanged();
    this.autosave.now();
    return true;
  }

  /* ---------- planning, sauvegarde, nuage ---------- */
  private syncPlanner(first: boolean) {
    const r = syncFromPlanner(this.state);
    this.panels.journal = { contracts: r.contracts, xp: r.xp };
    const caches = r.contracts.filter(c => c.state === 'LOOT_AVAILABLE').map(c => ({ contractId: c.id, title: c.title, loot: c.loot }));
    const changedCaches = JSON.stringify(caches.map(c => c.contractId)) !== JSON.stringify(this.caches.map(c => c.contractId));
    this.caches = caches;
    if (changedCaches && this.map && !this.panels.open) this.loadWorld(); // nouvelle cache : elle apparaît tout de suite
    if (r.added.length) {
      const total = r.added.reduce((a, x) => a + x.amount, 0);
      this.panels.toast(r.added.length === 1 ? `📻 +${total} 🧢 · ${r.added[0].reason}` : `📻 ${first ? 'Pendant ton absence' : 'Nouveau'} : +${total} 🧢 (${r.added.length} récompenses)`);
      this.autosave.soon(200);
    }
    this.panels.refreshBadge();
  }

  /** Au démarrage : récupère la partie de l'autre appareil et fusionne (capsules jamais doublées). */
  private async pullCloud() {
    try {
      const r = await reconcile(JSON.parse(JSON.stringify((storePlayer(this.state, this.player), this.state))));
      if (!r || !r.changed) return;
      this.state = r.state;
      this.player = playerFromState(this.state);
      this.syncPlanner(false);
      this.loadWorld();
      this.cameras.main.startFollow(this.playerImg, true, GameConfig.camera.followLerp, GameConfig.camera.followLerp);
      this.panels.toast('☁️ Partie synchronisée avec ton autre appareil');
      this.autosave.now();
    } catch { /* hors ligne : on joue en local */ }
  }

  private onStateChanged() {
    const was = this.player.overloaded;
    this.player.overloaded = isOverloaded(this.state);
    if (this.player.overloaded && !was) this.panels.toast('🎒 Trop lourd : tu avances moins vite et tu ne peux plus courir. Dépose des objets dans une caisse.');
    // cache vidée = contrat récupéré
    if (this.panels.openObject && claimIfEmpty(this.state, this.panels.openObject)) {
      this.panels.toast('📦 Cache récupérée ! Rapporte le butin au refuge.');
      this.syncPlanner(false);
    }
    this.panels.refreshBadge();
    storePlayer(this.state, this.player);
    this.autosave.soon();
  }

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
