import { GameConfig } from '../core/config';
import type { PlayerState } from '../core/movement';

interface Zoomable { zoomBy(k: number): void }

/** Interface du jeu en HTML par-dessus le canvas : barres de vie / endurance, retour au planning, zoom. */
export class Hud {
  private hp: HTMLElement;
  private st: HTMLElement;
  private load: HTMLElement;
  private last = { hp: -1, st: -1, ex: false, load: '' };

  constructor(root: HTMLElement, zoom: Zoomable) {
    const top = document.createElement('div');
    top.className = 'hud-top';
    top.innerHTML = `
      <a class="hbtn back" href="../" title="Retour au planning">← Planning</a>
      <div class="hud-title"><b>LAST OUTPOST</b><small>Le refuge</small></div>
      <div class="bars">
        <div class="bar hp" title="Santé"><i></i><span>❤</span></div>
        <div class="bar st" title="Endurance"><i></i><span>⚡</span></div>
        <div class="load" title="Poids transporté"></div>
      </div>`;
    const zoomBox = document.createElement('div');
    zoomBox.className = 'zoom';
    zoomBox.innerHTML = '<button class="hbtn" data-z="1.15" aria-label="Zoomer">＋</button><button class="hbtn" data-z="0.87" aria-label="Dézoomer">－</button>';
    zoomBox.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) zoom.zoomBy(Number(b.dataset.z));
    });
    root.append(top, zoomBox);
    this.hp = top.querySelector('.hp i')!;
    this.st = top.querySelector('.st i')!;
    this.load = top.querySelector('.load')!;
  }

  update(p: PlayerState, weight = 0) {
    const P = GameConfig.player;
    const hp = Math.round((p.health / P.maxHealth) * 100), st = Math.round((p.stamina / P.maxStamina) * 100);
    if (hp !== this.last.hp) { this.hp.style.width = hp + '%'; this.last.hp = hp; }
    if (st !== this.last.st || p.exhausted !== this.last.ex) {
      this.st.style.width = st + '%';
      this.st.parentElement!.classList.toggle('low', p.exhausted);
      this.last.st = st; this.last.ex = p.exhausted;
    }
    const max = GameConfig.inventory.maxWeight;
    const txt = `🎒 ${(Math.round(weight * 10) / 10).toString().replace('.', ',')} / ${max}${p.overloaded ? ' · trop lourd : pas de course' : ''}`;
    if (txt !== this.last.load) { this.load.textContent = txt; this.load.classList.toggle('over', p.overloaded); this.last.load = txt; }
  }
}
