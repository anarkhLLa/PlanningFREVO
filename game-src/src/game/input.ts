import type { MoveInput } from '../core/movement';

/**
 * Contrôles unifiés : clavier (ZQSD / WASD / flèches, Maj = courir)
 * et, sur écran tactile, joystick virtuel + bouton de course (cahier 9.3 / 9.4).
 * Produit une MoveInput : la même structure pourra être envoyée au serveur.
 */
export class Controls {
  private keys = new Set<string>();
  private joy = { x: 0, y: 0, active: false, id: -1 };
  private runToggle = false;
  readonly touch: boolean;

  constructor(private root: HTMLElement) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    addEventListener('keydown', e => { if (!isTyping(e)) this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.buildTouch();
  }

  read(): MoveInput {
    const k = (...c: string[]) => c.some(x => this.keys.has(x));
    // e.code est indépendant de la disposition : KeyW = Z sur AZERTY, KeyA = Q.
    let sx = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    let sy = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
    if (this.joy.active) { sx = this.joy.x; sy = this.joy.y; }
    const run = k('ShiftLeft', 'ShiftRight') || this.runToggle;
    return { sx, sy, run };
  }

  private buildTouch() {
    if (!this.touch) return;
    const pad = document.createElement('div');
    pad.className = 'joy';
    pad.innerHTML = '<div class="joy-knob"></div>';
    const knob = pad.firstElementChild as HTMLElement;
    const R = 46;
    const move = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // zone morte au centre, puis intensité progressive
      const m = Math.hypot(dx, dy) / R;
      this.joy.x = m < 0.15 ? 0 : dx / R;
      this.joy.y = m < 0.15 ? 0 : dy / R;
    };
    pad.addEventListener('pointerdown', e => { this.joy.active = true; this.joy.id = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (this.joy.active && e.pointerId === this.joy.id) move(e); });
    const end = (e: PointerEvent) => { if (e.pointerId !== this.joy.id) return; this.joy = { x: 0, y: 0, active: false, id: -1 }; knob.style.transform = ''; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);

    const run = document.createElement('button');
    run.className = 'tbtn run'; run.textContent = '🏃';
    run.setAttribute('aria-label', 'Courir');
    run.addEventListener('pointerdown', e => { this.runToggle = !this.runToggle; run.classList.toggle('on', this.runToggle); e.preventDefault(); });
    this.root.append(pad, run);
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}
