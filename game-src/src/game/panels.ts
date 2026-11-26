import { GameConfig } from '../core/config';
import { itemDef } from '../core/items';
import type { Inventory } from '../core/inventory';
import { capsules, carried, pickupLimit, take, takeAll, put, type ContainerState, type GameState } from '../core/state';
import type { WorldObject } from '../core/map';
import type { Contract } from '../core/economy';

/**
 * Fenêtres du jeu en HTML (inventaire, conteneur) et invite d'interaction.
 * Grandes zones tactiles, utilisables au doigt comme à la souris (cahier 9.4 / 21.4).
 */
export class Panels {
  private prompt: HTMLElement;
  private modal: HTMLElement;
  private actBtn?: HTMLButtonElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  open: null | 'inventory' | 'container' | 'journal' = null;
  /** Mis à jour par la scène à chaque synchronisation avec le planning. */
  journal: { contracts: Contract[]; xp: number } = { contracts: [], xp: 0 };
  private cont: { obj: WorldObject; c: ContainerState } | null = null;

  constructor(root: HTMLElement, private state: () => GameState, private changed: () => void, private onInteract: () => void, touch: boolean) {
    this.prompt = el('div', 'prompt');
    this.modal = el('div', 'modal hidden');
    this.toastEl = el('div', 'gtoast');
    root.append(this.prompt, this.modal, this.toastEl);
    const inv = el('button', 'hbtn invbtn');
    inv.innerHTML = '🎒<span class="cap"></span>';
    inv.setAttribute('aria-label', 'Inventaire (I)');
    inv.addEventListener('click', () => this.toggleInventory());
    const jr = el('button', 'hbtn jrbtn');
    jr.innerHTML = '📻<span class="dot"></span>';
    jr.setAttribute('aria-label', 'Journal radio (J)');
    jr.addEventListener('click', () => this.toggleJournal());
    root.append(inv, jr);
    if (touch) {
      this.actBtn = el('button', 'tbtn act') as HTMLButtonElement;
      this.actBtn.textContent = '✋'; this.actBtn.setAttribute('aria-label', 'Interagir');
      this.actBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.onInteract(); });
      root.append(this.actBtn);
    }
    this.modal.addEventListener('click', e => this.onClick(e));
    addEventListener('keydown', e => {
      if (e.code === 'KeyI') { this.toggleInventory(); e.preventDefault(); }
      else if (e.code === 'KeyJ') { this.toggleJournal(); e.preventDefault(); }
      else if (e.code === 'Escape') this.close();
    });
    this.refreshBadge();
  }

  /** Affiche l'invite « E · Fouiller : … » (ou la cache). */
  setTarget(obj: WorldObject | null, progress = 0) {
    if (!obj || this.open) { this.prompt.classList.remove('on'); this.actBtn?.classList.remove('on'); return; }
    const verb = obj.kind === 'container' ? (this.state().containers[obj.id]?.searched ? 'Ouvrir' : 'Fouiller') : 'Examiner';
    const key = this.actBtn ? '✋' : 'E';
    this.prompt.innerHTML = `<b>${key}</b> ${verb} : ${obj.name}${progress > 0 ? `<i style="width:${Math.round(progress * 100)}%"></i>` : ''}`;
    this.prompt.classList.add('on'); this.actBtn?.classList.add('on');
  }

  toast(msg: string) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), 2200);
  }

  /** Met à jour les pastilles ET la fenêtre du journal si elle est ouverte. */
  refreshBadge() {
    this.updateBadges();
    if (this.open === 'journal') this.render();
  }

  private updateBadges() {
    const cap = document.querySelector('.invbtn .cap');
    if (cap) cap.textContent = String(capsules(this.state()));
    const n = this.journal.contracts.filter(c => c.state === 'LOOT_AVAILABLE').length;
    const dot = document.querySelector('.jrbtn .dot') as HTMLElement | null;
    if (dot) { dot.textContent = n ? String(n) : ''; dot.style.display = n ? '' : 'none'; }
  }

  toggleJournal() { if (this.open === 'journal') this.close(); else { this.open = 'journal'; this.render(); } }

  toggleInventory() { if (this.open === 'inventory') this.close(); else { this.open = 'inventory'; this.render(); } }
  showContainer(obj: WorldObject, c: ContainerState) { this.cont = { obj, c }; this.open = 'container'; this.render(); }
  close() { this.open = null; this.cont = null; this.modal.classList.add('hidden'); this.modal.innerHTML = ''; }

  private render() {
    const s = this.state();
    const wt = carried(s), max = GameConfig.inventory.maxWeight;
    const head = `<div class="mhead"><b>${this.open === 'container' ? this.cont!.obj.name : 'Inventaire'}</b>
      <span class="cap-pill">🧢 ${capsules(s)} capsules</span><button class="mclose" data-a="close" aria-label="Fermer">✕</button></div>`;
    const weight = `<div class="weight${wt > max ? ' over' : ''}">Poids ${fmt(wt)} / ${max}${wt > max ? ` · surchargé (max ${pickupLimit()})` : ''}<i style="width:${Math.min(100, (wt / max) * 100)}%"></i></div>`;
    const equip = `<div class="equip">${[['Sac', s.equipment.bag ? '🎒 Petit sac' : '—'], ['Main', s.equipment.main ? `${itemDef(s.inventory.items.find(i => i.id === s.equipment.main)?.def ?? 'tool_basic').icon} Outil` : '—']].map(([k, v]) => `<span><small>${k}</small>${v}</span>`).join('')}</div>`;
    if (this.open === 'journal') {
      const cs = this.journal.contracts;
      const by = (st: string[]) => cs.filter(c => st.includes(c.state));
      const avail = by(['LOOT_AVAILABLE']), prog = by(['IN_PROGRESS', 'READY']), rumor = by(['RUMOR']);
      const card = (c: Contract, extra = '') => `<div class="ctr st-${c.state}"><b>${c.title}</b><small>${c.place} · ${{ small: 'petite', medium: 'moyenne', hard: 'grosse' }[c.difficulty]} · ~${c.reward} 🧢</small><p>${c.radio}</p>${extra}</div>`;
      const loot = (c: Contract) => `<div class="lootline">${c.loot.map(([d, q]) => `${itemDef(d).icon} ${q}`).join(' · ')}</div>`;
      const gains = s.ledger.entries.slice(-6).reverse().map(e => `<li><span>${e.reason}</span><b>${e.amount > 0 ? '+' : ''}${e.amount} 🧢</b></li>`).join('');
      this.modal.innerHTML = `<div class="mbox wide"><div class="mhead"><b>📻 Journal radio</b><span class="cap-pill">🧢 ${capsules(s)} · ⭐ ${this.journal.xp} XP</span><button class="mclose" data-a="close" aria-label="Fermer">✕</button></div>
        <h4 class="jh">📦 À récupérer (${avail.length})</h4>${avail.map(c => card(c, loot(c) + '<p class="hint">La cache t’attend au garage de Riverside, au bout de la route (ouverture dans la prochaine mise à jour).</p>')).join('') || '<p class="hint">Termine une tâche dans ton planning : sa cache apparaîtra ici.</p>'}
        <h4 class="jh">▶ En cours (${prog.length})</h4>${prog.slice(0, 6).map(c => card(c)).join('') || '<p class="hint">Démarre une tâche (« Je commence ») pour activer son contrat.</p>'}
        <h4 class="jh">📡 Pistes (${rumor.length})</h4>${rumor.slice(0, 3).map(c => card(c)).join('')}${rumor.length > 3 ? `<p class="hint">+ ${rumor.length - 3} autres pistes.</p>` : ''}
        <h4 class="jh">🧢 Derniers gains</h4><ul class="gains">${gains}</ul></div>`;
    } else if (this.open === 'inventory') {
      this.modal.innerHTML = `<div class="mbox">${head}${equip}${weight}${grid(s.inventory, 'inv', s.equipment.main)}<p class="hint">Les objets se rangent automatiquement. Ouvre un conteneur pour déposer ou prendre.</p></div>`;
    } else if (this.cont) {
      const c = this.cont.c;
      this.modal.innerHTML = `<div class="mbox wide">${head}
        <div class="cols"><div><h4>Dans ${this.cont.obj.name.toLowerCase()}</h4>${grid(c.items, 'cont')}
          ${c.items.items.length ? '<button class="mbtn primary" data-a="takeall">Tout prendre</button>' : '<p class="hint">Vide.</p>'}</div>
        <div><h4>Ton sac</h4>${weight}${grid(s.inventory, 'inv', s.equipment.main)}<p class="hint">Touche un objet pour le déplacer.</p></div></div></div>`;
    }
    this.modal.classList.remove('hidden');
    this.updateBadges();
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    if (t === this.modal) { this.close(); return; }
    const b = t.closest('[data-a]') as HTMLElement | null;
    if (!b) return;
    const s = this.state(), a = b.dataset.a;
    if (a === 'close') { this.close(); return; }
    if (!this.cont) return;
    if (a === 'takeall') {
      const r = takeAll(s, this.cont.c);
      if (r.left) this.toast(r.taken ? 'Sac plein : le reste attend dans la caisse' : 'Trop lourd : dépose quelque chose');
    } else if (a === 'cont') {
      if (!take(s, this.cont.c, b.dataset.id!)) this.toast('Trop lourd ou plus de place');
    } else if (a === 'inv') {
      if (b.dataset.id === s.equipment.main) { this.toast('Ton outil reste en main'); return; }
      put(s, this.cont.c, b.dataset.id!);
    }
    this.changed(); this.render();
  }
}

function grid(inv: Inventory, act: string, lockedId?: string) {
  const cells = inv.items.map(it => {
    const d = itemDef(it.def);
    return `<button class="slot r-${d.rarity}${it.id === lockedId ? ' locked' : ''}" data-a="${act}" data-id="${it.id}" title="${d.name} — ${d.desc}">
      <span class="ico">${d.icon}</span><span class="nm">${d.name}</span>${it.qty > 1 ? `<b class="qty">${it.qty}</b>` : ''}</button>`;
  });
  const free = inv.maxWeight ? Math.max(0, inv.slots - inv.items.length) : 0;
  for (let i = 0; i < free; i++) cells.push('<span class="slot empty"></span>');
  return `<div class="grid">${cells.join('')}</div>`;
}
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
function el(tag: string, cls: string) { const e = document.createElement(tag); e.className = cls; return e; }
