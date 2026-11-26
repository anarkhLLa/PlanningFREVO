'use strict';
/* =====================================================================
   Mode « Maintenant » : énergie, paquet de cartes, missions, XP, atelier,
   « Je suis bloqué », capture rapide, revue en un geste.
   Chargé AVANT le script principal : ne contient que des déclarations ;
   tout ce qui touche à S / ui / render… s'exécute plus tard.
   ===================================================================== */
const ENERGY = [['low', '🪫', 'Basse'], ['mid', '🔋', 'Moyenne'], ['high', '⚡', 'Haute']];
const EN_RANK = { low: 0, mid: 1, high: 2 };
const EN_ICON = { low: '🪫', mid: '🔋', high: '⚡' };
const DUR_MIN = { xs: 5, s: 15, m: 45, l: 120 };
const TIMES = [[0, 'Peu importe'], [5, '5 min'], [15, '15 min'], [45, '45 min'], [120, '1 h +']];
// gains : uniquement pour un vrai progrès (jamais pour un simple clic)
const XPV = { start: 5, slot: 15, done: 20, high: 10, heavy: 10, step: 8, need: 5, unblock: 5, mission: 15, stuck: 5, next: 3, classify: 2 };
const DAILY_GOAL = 60;
const PASSES = 3;             // changements de carte autorisés par choix d'énergie
const ATELIER = [[0, '🪵', 'un établi'], [40, '🔨', 'un marteau'], [100, '💡', 'une lampe'], [180, '🪚', 'une scie'], [280, '🪴', 'une plante'], [400, '🖨️', 'une imprimante 3D'], [550, '🧰', 'une caisse à outils'], [730, '⚙️', 'une CNC'], [950, '📐', 'une table à dessin'], [1200, '🎧', 'un casque'], [1500, '🛋️', 'un coin détente'], [1850, '🏆', 'le trophée de l’atelier']];
// boutons « momentanés » : chaque appui passe à la valeur suivante
const CYCLES = {
  energy: [[undefined, '❔', 'Énergie ?'], ['low', '🪫', 'Énergie basse'], ['mid', '🔋', 'Énergie moyenne'], ['high', '⚡', 'Énergie haute']],
  dur: [[undefined, '⏱️', 'Durée ?'], ['xs', '⏱️', '≤ 5 min'], ['s', '⏱️', '15 min'], ['m', '⏱️', '30–60 min'], ['l', '⏱️', '1 h +']],
  feel: [[undefined, '😐', 'Neutre'], ['fun', '😊', 'Motivante'], ['heavy', '😩', 'Me pèse']],
  prio: [['red', '🔴', 'Urgent'], ['orange', '🟠', 'Important'], ['yellow', '🟡', 'Normal'], ['white', '⚪', 'Faible']],
  hard: [[undefined, '🗓️', 'Simple intention'], [true, '📌', 'Échéance réelle']]
};
const STUCK_GENERIC = [
  'Ouvre juste le fichier ou le dossier de ta prochaine tâche. Rien d’autre.',
  'Range ton plan de travail pendant 2 minutes.',
  'Prépare l’outil ou la pièce dont tu auras besoin ensuite.',
  'Écris en une phrase ce qui te bloque.',
  'Bois un verre d’eau, étire-toi, puis reviens ici.'
];

const tEn = t => t.energy || 'mid';
const fxOn = k => !(S.settings.fx && S.settings.fx[k] === false);
const xpTotal = () => (S.events || []).reduce((k, e) => k + (e.xp || 0), 0);
const xpDay = d => (S.events || []).filter(e => e.day === d).reduce((k, e) => k + (e.xp || 0), 0);
function atelierLevel(xp) { let n = 0; ATELIER.forEach((a, i) => { if (xp >= a[0]) n = i; }); return n; }

/* ---------- récompenses ---------- */
function award(kind, t, xp, label) {
  const e = { id: uid(), at: Date.now(), day: today(), kind, tid: t ? t.id : null, xp, label: label || (t ? t.title : '') };
  S.events.push(e);
  if (kind !== 'mission') missionsOnEvent(e, t);
  return e;
}
let actx = null;
function chime(big) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime, notes = big ? [659, 880, 1319] : [784, 1047];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), s = t0 + i * 0.09;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.16, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
      o.connect(g).connect(actx.destination); o.start(s); o.stop(s + 0.45);
    });
  } catch (e) {}
}
// à appeler APRÈS commit() : son, vibration, « +XP » qui s'envole
function celebrate(xp, big) {
  const bonus = ui.missionXP || 0; ui.missionXP = 0;
  xp = (xp || 0) + bonus; if (!xp) return;
  if (bonus) big = true;
  const tot = xpTotal(), lvUp = atelierLevel(tot) > atelierLevel(tot - xp);
  if (fxOn('sound')) chime(big || lvUp);
  if (fxOn('vib')) navigator.vibrate?.(big || lvUp ? [12, 50, 18] : 14);
  if (fxOn('anim') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const el = document.createElement('div');
    el.className = 'xp-float' + (big ? ' big' : ''); el.textContent = `+${xp} XP`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 1000);
  }
  if (bonus) setTimeout(() => toast('🎯 Mission accomplie !'), 350);
  if (lvUp) { const a = ATELIER[atelierLevel(tot)]; setTimeout(() => toast(`🎉 Ton atelier s'agrandit : ${a[1]} ${a[2]}`), bonus ? 2600 : 400); }
}
const doneXP = t => XPV.done + (tEn(t) === 'high' ? XPV.high : 0) + (t.feel === 'heavy' ? XPV.heavy : 0);
function startTask(t) { if (t.startedAt || t.status !== 'todo') return 0; t.startedAt = Date.now(); award('start', t, XPV.start); return XPV.start; }
// « Fait » : la journée prévue si la tâche est étalée sur plusieurs jours, sinon toute la tâche
function finishTask(t) {
  const d = today(), open = t.slots.filter(s => !s.ok), i = t.slots.findIndex(s => s.d && s.d <= d && !s.ok);
  if (t.slots.length > 1 && open.length > 1 && i >= 0) { t.slots[i].ok = true; award('slot', t, XPV.slot); return [XPV.slot, false, 'Journée faite ✓']; }
  const xp = doneXP(t); award('done', t, xp); setStatus(t, 'done'); t.startedAt = null;
  return [xp, true, 'Terminée ✓'];
}
// branché sur les actions manuelles (menu d'une tâche, besoins, attentes)
function rewardManual(kind, t) {
  if (kind === 'done') return award('done', t, doneXP(t)).xp;
  if (kind === 'slot') return award('slot', t, XPV.slot).xp;
  if (kind === 'need') return award('need', t, XPV.need).xp;
  if (kind === 'unblock') return award('unblock', t, XPV.unblock).xp;
  return 0;
}

/* ---------- recommandation ---------- */
function score(t, en) {
  const d = today(); let s = 0;
  if (t.startedAt) s += 40;                                    // reprise
  s += (3 - PRIO_RANK[t.prio]) * 8;                            // importance
  const ds = t.slots.filter(x => x.d && !x.ok).map(x => x.d).sort()[0];
  if (ds) { if (ds <= d) s += 25; else if (diffDays(d, ds) <= 2) s += 10; }
  if (t.hard && ds && diffDays(d, ds) <= 3) s += 20;            // vraie échéance proche
  if (en === 'high' && t.feel === 'fun') s += 12;               // pic de motivation
  if (en === 'high' && tEn(t) === 'high') s += 8;
  if (en === 'low' && t.dur === 'xs') s += 10;
  if (t.feel === 'heavy' && t.next) s += 6;                     // tâche qui pèse mais prochaine action claire
  if (t.feel === 'heavy' && ds === d) s += 10;                  // son moment prévu
  if (unmet(t).length) s -= 15;
  return s;
}
function candidates(en, mins) {
  const d = today(), r = EN_RANK[en];
  return S.tasks.filter(t => t.status === 'todo' && t.snooze !== d && EN_RANK[tEn(t)] <= r && (!mins || !t.dur || DUR_MIN[t.dur] <= mins))
    .sort((a, b) => score(b, en) - score(a, en) || a.created - b.created);
}
function F() {
  const f = S.settings.focus || (S.settings.focus = {});
  if (f.day !== today()) Object.assign(f, { day: today(), ids: [], passes: 0 });
  if (!Array.isArray(f.ids)) f.ids = [];
  return f;
}
// le paquet garde ses positions ; on complète seulement à 5 cartes (après une vraie action)
function fillDeck(f) {
  const d = today(), ids = f.ids.filter(id => { const t = find(id); return t && t.status === 'todo' && t.snooze !== d; });
  if (f.en) for (const t of candidates(f.en, f.mins)) { if (ids.length >= 5) break; if (!ids.includes(t.id)) ids.push(t.id); }
  f.ids = ids;
}

/* ---------- missions ---------- */
function ensureMissions() {
  const d = today();
  if (S.missions && S.missions.day === d) return S.missions;
  const prev = S.missions;
  const carry = prev && prev.day < d ? prev.list.filter(m => !m.done && !m.skipped && !m.carried).slice(0, 1).map(m => ({ ...m, carried: true, n: 0 })) : [];
  const act = S.tasks.filter(isActive), pool = [];
  if (act.some(t => t.dur === 'xs')) pool.push({ kind: 'quick', icon: '⏱️', label: 'Lance une tâche de 5 minutes' });
  if (act.some(t => t.status === 'blocked' || unmet(t).length)) pool.push({ kind: 'unblock', icon: '🔓', label: 'Débloque un projet (un besoin obtenu ou une attente reçue)' });
  if (act.some(t => t.feel === 'heavy')) pool.push({ kind: 'heavy', icon: '🪨', label: 'Avance un peu une tâche qui te pèse' });
  if (act.some(t => t.startedAt)) pool.push({ kind: 'resume', icon: '🔁', label: 'Avance une tâche déjà commencée' });
  if (act.some(t => !t.energy)) pool.push({ kind: 'classify', icon: '🗂️', label: 'Classe 5 tâches en mode revue', need: 5 });
  if (act.some(t => t.feel === 'heavy' && !t.next)) pool.push({ kind: 'next', icon: '✍️', label: 'Écris la prochaine action d’une tâche qui pèse' });
  pool.push({ kind: 'start', icon: '▶️', label: 'Démarre une tâche' });
  pool.push({ kind: 'done2', icon: '✅', label: 'Termine 2 tâches (ou journées)', need: 2 });
  const shift = parseInt(d.replace(/-/g, ''), 10) % pool.length;   // varie chaque jour, stable dans la journée
  const rot = pool.slice(shift).concat(pool.slice(0, shift)).filter(m => !carry.some(c => c.kind === m.kind));
  const list = carry.concat(rot.slice(0, 3 - carry.length).map(m => ({ id: uid(), ...m, n: 0, done: false })));
  S.missions = { day: d, list, passUsed: false };
  return S.missions;
}
function missionMatch(m, e, t) {
  const k = e.kind, prog = ['start', 'done', 'slot', 'step'];
  switch (m.kind) {
    case 'quick': return !!t && t.dur === 'xs' && prog.includes(k);
    case 'unblock': return k === 'need' || k === 'unblock';
    case 'heavy': return !!t && t.feel === 'heavy' && (prog.includes(k) || k === 'next');
    case 'resume': return !!t && !!t.startedAt && ['done', 'slot', 'step'].includes(k);
    case 'classify': return k === 'classify';
    case 'next': return !!t && t.feel === 'heavy' && k === 'next';
    case 'start': return k === 'start';
    case 'done2': return k === 'done' || k === 'slot';
  }
  return false;
}
const missionLock = ms => ms.list.some(m => m.carried && !m.done && !m.skipped);
function missionsOnEvent(e, t) {
  const ms = ensureMissions(), locked = missionLock(ms);
  for (const m of ms.list) {
    if (m.done || m.skipped || (locked && !m.carried)) continue;
    if (!missionMatch(m, e, t)) continue;
    m.n = (m.n || 0) + 1;
    if (m.n >= (m.need || 1)) { m.done = true; award('mission', null, XPV.mission, 'Mission : ' + m.label); ui.missionXP = (ui.missionXP || 0) + XPV.mission; }
  }
}

/* ---------- « Je suis bloqué » ---------- */
function stuckIdeas() {
  const act = S.tasks.filter(t => t.status === 'todo'), out = [];
  act.filter(t => t.dur === 'xs').sort((a, b) => score(b, 'low') - score(a, 'low')).slice(0, 2)
    .forEach(t => out.push({ tid: t.id, text: `Fais juste « ${t.title} » : moins de 5 minutes.` }));
  act.filter(t => t.startedAt && t.next).slice(0, 1).forEach(t => out.push({ tid: t.id, text: `Sur « ${t.title} », fais seulement : ${t.next}` }));
  act.filter(t => t.feel === 'heavy' && !t.next).slice(0, 1).forEach(t => out.push({ tid: t.id, write: true, text: `Écris la toute première petite étape de « ${t.title} ».` }));
  const g = parseInt(today().replace(/-/g, ''), 10);
  for (let i = 0; i < STUCK_GENERIC.length; i++) out.push({ text: STUCK_GENERIC[(g + i) % STUCK_GENERIC.length] });
  return out;
}
function openStuck() {
  const ideas = stuckIdeas(), i = Math.min(ui.stuckI || 0, ideas.length - 1), it = ideas[i], left = Math.max(0, 2 - (ui.stuckI || 0));
  ui.stuck = it;
  openSheet(`<h3>🧭 Une seule petite chose</h3>
    <div class="stuck-card">${esc(it.text)}</div>
    ${it.write ? `<form id="fStuckNext" class="need-add"><input name="next" placeholder="Ex : appeler le client, mesurer la pièce…" required maxlength="160"><button class="btn primary">OK</button></form>` : ''}
    <p class="hint">Moins de 3 minutes. Pas besoin de choisir un projet : fais juste ça.</p>
    <div class="grid2" style="margin-top:12px">${it.write ? '' : B('f-stuck-done', '✓ C’est fait', 'ok')}${left ? B('f-stuck-next', `Autre idée (${left})`) : B('close', 'Fermer')}</div>`);
}

/* ---------- résumé positif ---------- */
const SEEN_KEY = 'planning.seen';
function seenGet() { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch (e) { return 0; } }
function seenSet(v) { try { localStorage.setItem(SEEN_KEY, String(v)); } catch (e) {} }
function summaryParts(ev) {
  const n = k => ev.filter(e => e.kind === k).length, parts = [];
  if (n('done')) parts.push(`${n('done')} tâche${n('done') > 1 ? 's' : ''} terminée${n('done') > 1 ? 's' : ''}`);
  if (n('slot')) parts.push(`${n('slot')} journée${n('slot') > 1 ? 's' : ''} avancée${n('slot') > 1 ? 's' : ''}`);
  if (n('step')) parts.push(`${n('step')} étape${n('step') > 1 ? 's' : ''} franchie${n('step') > 1 ? 's' : ''}`);
  if (n('start')) parts.push(`${n('start')} démarrage${n('start') > 1 ? 's' : ''}`);
  if (n('need') + n('unblock')) parts.push(`${n('need') + n('unblock')} déblocage${n('need') + n('unblock') > 1 ? 's' : ''}`);
  if (n('mission')) parts.push(`${n('mission')} mission${n('mission') > 1 ? 's' : ''}`);
  return parts;
}
function summaryHTML() {
  const since = ui.seenAt; if (!since) return '';
  const ev = S.events.filter(e => e.at > since && e.xp), gap = Date.now() - since;
  if (!ev.length && gap < 2 * 864e5) return '';
  let h = '';
  if (gap >= 2 * 864e5) h += `<b>Content de te revoir 👋</b><p>Rien à rattraper. On reprend tranquillement, une chose à la fois.</p>`;
  if (ev.length) {
    const xp = ev.reduce((k, e) => k + e.xp, 0), proj = new Set(ev.filter(e => e.tid).map(e => e.tid)).size;
    h += `<p>Depuis ta dernière visite : <b>${summaryParts(ev).join(', ')}</b> · +${xp} XP${proj ? ` · ${proj} projet${proj > 1 ? 's ont' : ' a'} avancé` : ''}.</p>`;
  }
  return `<div class="fsec fsum">${h}<button class="btn sm" data-act="f-sum-ok">OK 👍</button></div>`;
}

/* ---------- écran « Maintenant » ---------- */
function bar(id, pct) {
  const from = (ui.barW && ui.barW[id] != null) ? ui.barW[id] : pct;
  (ui.barW || (ui.barW = {}))[id] = pct;
  return `<div class="fbar"><i data-bar="${id}" data-to="${pct}" style="width:${from}%"></i></div>`;
}
function cardHTML(t, f) {
  if (!t) return '';
  const st = t.startedAt, nu = unmet(t), dur = t.dur ? CYCLES.dur.find(c => c[0] === t.dur)[2] : '';
  const meta = [EN_ICON[tEn(t)] + ' ' + ENERGY.find(e => e[0] === tEn(t))[2], dur && '⏱️ ' + dur, t.feel === 'fun' && '😊 motivante', t.feel === 'heavy' && '😩 me pèse', t.hard && '📌 échéance', nu.length && `🛒 ${nu.length} besoin${nu.length > 1 ? 's' : ''}`].filter(Boolean);
  const next = t.next ? `<div class="fnext"><span>Prochaine action</span><b>${esc(t.next)}</b></div>`
    : `<form class="fnext-form need-add" data-id="${t.id}"><input name="next" placeholder="Quelle est la toute prochaine action ?" maxlength="160"><button class="btn">OK</button></form>`;
  const enter = ui.fEnter ? ` enter-${ui.fEnter}` : ''; ui.fEnter = '';
  return `<div class="fcard${enter}" data-swipe="deck" data-id="${t.id}" data-p="${t.prio}">
    <div class="fcard-top"><span class="fcard-kicker">${st ? '▶ En cours' : 'Maintenant'}</span><button class="fopen" data-act="f-open" data-id="${t.id}" aria-label="Détails">⋯</button></div>
    <div class="fcard-title">${esc(t.title)}</div>
    <div class="fcard-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>
    ${next}
    <div class="fcard-actions">
      ${st ? `${B('f-done', '✓ C’est fait', 'ok', `data-id="${t.id}"`)}${t.next ? B('f-step', '✓ Étape faite', 'okl', `data-id="${t.id}"`) : B('f-block', '⛔ Bloqué', '', `data-id="${t.id}"`)}`
         : `${B('f-start', '▶ Je commence', 'primary', `data-id="${t.id}"`)}${B('f-done', '✓ Déjà fait', 'okl', `data-id="${t.id}"`)}`}
    </div>
    <div class="fcard-sub">
      ${B('f-other', `↷ Autre proposition${f.passes < PASSES ? ` (${PASSES - f.passes})` : ''}`, 'sm', f.passes >= PASSES ? 'disabled' : '')}
      ${B('f-later', '⏸ Plus tard', 'sm', `data-id="${t.id}"${f.passes >= PASSES ? ' disabled' : ''}`)}
    </div>
    <div class="fswipe-hint"><span>⟵ plus tard</span><span>je commence ⟶</span></div>
  </div>`;
}
function renderNow() {
  $('#viewTitle').textContent = 'Maintenant';
  $('#headerTools').innerHTML = '';
  const f = F(), d = today(); fillDeck(f); ensureMissions();
  const tot = xpTotal(), lv = atelierLevel(tot), cur = ATELIER[lv], nxt = ATELIER[lv + 1];
  const pctLv = nxt ? Math.round((tot - cur[0]) * 100 / (nxt[0] - cur[0])) : 100;
  const xd = xpDay(d), pctDay = Math.min(100, Math.round(xd * 100 / DAILY_GOAL));
  const wk = S.events.filter(e => diffDays(e.day, d) < 7 && e.xp);
  const doneToday = S.events.filter(e => e.day === d && (e.kind === 'done' || e.kind === 'slot')).length;
  const resume = S.tasks.filter(t => t.status === 'todo' && t.startedAt).sort((a, b) => b.startedAt - a.startedAt);
  const card = f.en ? find(f.ids[0]) : null;
  const ms = S.missions, locked = missionLock(ms);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const prog = S.tasks.filter(t => isActive(t) && (t.startedAt || (t.slots.length > 1 && t.slots.some(s => s.ok)))).slice(0, 4);
  const noEn = S.tasks.filter(t => isActive(t) && !t.energy).length;

  let h = summaryHTML();
  // 1. capture en une phrase
  h += `<form id="fCap" class="fsec fcap"><input name="title" placeholder="＋ Ajouter une tâche en une phrase…" autocomplete="off" maxlength="200">
    ${SR ? '<button type="button" class="fmic" id="fMic" data-act="f-mic" aria-label="Dicter">🎤</button>' : ''}<button class="btn primary">Ajouter</button></form>`;
  // 2. progression (atelier + aujourd'hui)
  h += `<div class="fsec fprog">
    <div class="fprog-row"><div class="fatelier" title="Ton atelier">${ATELIER.slice(0, lv + 1).map(a => `<span>${a[1]}</span>`).join('')}${nxt ? `<span class="fnext-item">${nxt[1]}</span>` : ''}</div>
      <div class="flv"><b>Atelier niv. ${lv + 1}</b><small>${nxt ? `${nxt[0] - tot} XP avant ${nxt[2]}` : 'Atelier complet 🏆'}</small></div></div>
    ${bar('lv', pctLv)}
    <div class="fprog-row small"><span>Aujourd'hui : <b>+${xd} XP</b>${doneToday ? ` · ${doneToday} fait${doneToday > 1 ? 's' : ''}` : ''}</span><span>Cette semaine : ${summaryParts(wk).slice(0, 2).join(', ') || 'ça commence ici'}</span></div>
    ${bar('day', pctDay)}</div>`;
  // 3. état d'énergie (un geste)
  h += `<div class="fsec"><div class="fq">Comment est ton énergie là, maintenant ?</div>
    <div class="fen">${ENERGY.map(([k, ic, l]) => `<button class="fen-b${f.en === k ? ' on' : ''}" data-act="f-en" data-v="${k}"><span>${ic}</span>${l}</button>`).join('')}</div>
    <div class="ftimes">${TIMES.map(([m, l]) => `<button class="chip${(f.mins || 0) === m ? ' on' : ''}" data-act="f-min" data-v="${m}">${l}</button>`).join('')}</div></div>`;
  // 4. la carte
  if (!f.en && resume.length) {
    const t = resume[0];
    h += `<div class="fsec fresume"><span>🔁 Tu étais sur</span><b>${esc(t.title)}</b>${t.next ? `<small>Prochaine action : ${esc(t.next)}</small>` : ''}
      <div class="grid2" style="margin-top:10px">${B('f-done', '✓ C’est fait', 'ok', `data-id="${t.id}"`)}${B('f-open', 'Détails', '', `data-id="${t.id}"`)}</div></div>`;
  }
  if (f.en) {
    h += card ? `<div class="fdeck"><div class="fstack" data-n="${Math.max(0, f.ids.length - 1)}"></div>${cardHTML(card, f)}</div>
      <div class="fdeck-info">${f.ids.length > 1 ? `${f.ids.length - 1} autre${f.ids.length > 2 ? 's' : ''} carte${f.ids.length > 2 ? 's' : ''} dans ton paquet` : 'Dernière carte du paquet'} · de nouvelles arrivent quand tu avances</div>`
      : `<div class="fsec fempty">Rien ne correspond à cette énergie pour l'instant.<br>${noEn ? `<b>${noEn}</b> tâche${noEn > 1 ? 's n’ont' : ' n’a'} pas encore d’énergie : ${B('f-review', 'les classer', 'sm', 'data-v="noenergy"')}` : 'Essaie une autre énergie ou ajoute une tâche ci-dessus.'}</div>`;
  }
  // 5. je suis bloqué
  h += `<button class="fstuck" data-act="f-stuck">🧭 Je suis bloqué</button>`;
  // 6. missions
  h += `<div class="fsec"><div class="fsec-h">🎯 Missions du jour</div>
    ${ms.list.map(m => {
      const lockedM = locked && !m.carried && !m.done, need = m.need || 1;
      return `<div class="fmis${m.done ? ' done' : ''}${lockedM ? ' locked' : ''}${m.carried && !m.done ? ' carried' : ''}${m.skipped ? ' skipped' : ''}">
        <span class="fmis-i">${m.done ? '✓' : lockedM ? '🔒' : m.icon}</span>
        <span class="fmis-l">${esc(m.label)}${m.carried && !m.done && !m.skipped ? '<small>prévue hier · les autres se débloquent après elle</small>' : ''}</span>
        ${need > 1 && !m.done ? `<small class="fmis-n">${Math.min(m.n || 0, need)}/${need}</small>` : ''}
        ${m.carried && !m.done && !m.skipped && !ms.passUsed ? B('f-mpass', 'Passer', 'sm') : ''}</div>`;
    }).join('')}</div>`;
  // 7. projets qui avancent
  if (prog.length) h += `<div class="fsec"><div class="fsec-h">🚧 Ça avance</div>${prog.map(t => {
    const n = t.slots.length, ok = t.slots.filter(s => s.ok).length, pct = n > 1 ? Math.round((ok + (t.startedAt ? 0.3 : 0)) * 100 / n) : 40 + Math.min(40, (t.stepsDone || 0) * 15);
    return `<div class="fproj" data-act="f-open" data-id="${t.id}"><span>${esc(t.title)}</span><small>${n > 1 ? `${ok}/${n} jours` : (t.stepsDone ? `${t.stepsDone} étape${t.stepsDone > 1 ? 's' : ''}` : 'commencée')}</small>${bar('p' + t.id, Math.min(100, pct))}</div>`;
  }).join('')}</div>`;
  // 8. revue
  h += `<div class="fsec frev">${B('f-review', '🔁 Revue rapide des tâches', '', 'data-v="all"')}${noEn ? `<small>${noEn} sans énergie</small>` : ''}</div>`;
  $('#main').innerHTML = `<div class="fwrap">${h}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-bar]').forEach(el => { el.style.width = el.dataset.to + '%'; })));
}

/* ---------- revue en un geste ---------- */
function rvIds(filter) {
  const old = Date.now() - 14 * 864e5, d = today();
  let l = S.tasks.filter(isActive);
  if (filter === 'noenergy') l = l.filter(t => !t.energy);
  if (filter === 'inactive') l = l.filter(t => (t.u || t.created || 0) < old && !t.slots.some(s => s.d && s.d >= d));
  return l.sort((a, b) => a.created - b.created).map(t => t.id);   // ordre stable
}
function cycleVal(k, v) { return CYCLES[k].findIndex(c => c[0] === v || (c[0] === undefined && (v === undefined || v === null || v === false || v === ''))); }
function toggleHTML(t) {
  const s0 = t.slots[0], dayLbl = s0 && s0.d ? fmtRel(s0.d) : 'Pas de jour';
  return `<div class="tg-grid">${Object.keys(CYCLES).map(k => {
    const c = CYCLES[k][Math.max(0, cycleVal(k, t[k]))];
    return `<button class="tg tg-${k}${c[0] === undefined ? ' unset' : ''}" data-act="f-tg" data-k="${k}" data-id="${t.id}"><span>${c[1]}</span>${c[2]}</button>`;
  }).join('')}<button class="tg" data-act="f-tg" data-k="day" data-id="${t.id}"><span>📅</span>${dayLbl}</button></div>
  <div class="need-add" style="margin-top:8px"><input class="tg-next" data-id="${t.id}" value="${esc(t.next || '')}" placeholder="Prochaine action (ex : mesurer la pièce)" maxlength="160"></div>`;
}
function execSheetHTML(t) { return `<h4>Mode Maintenant</h4>${toggleHTML(t)}<p class="hint">Chaque bouton change à chaque appui.</p>`; }
function renderReview() {
  $('#viewTitle').textContent = 'Revue';
  $('#headerTools').innerHTML = B('f-rv-exit', 'Terminer', 'sm');
  const filter = S.settings.rvF || 'all';
  if (!ui.rv || ui.rv.f !== filter) ui.rv = { f: filter, ids: rvIds(filter), i: 0 };
  const rv = ui.rv; rv.ids = rv.ids.filter(id => find(id));
  if (rv.i >= rv.ids.length) rv.i = Math.max(0, rv.ids.length - 1);
  const cnt = k => rvIds(k).length, t = find(rv.ids[rv.i]);
  let h = `<div class="chips">${[['all', 'Toutes'], ['noenergy', 'Sans énergie'], ['inactive', 'Inactives (14 j)']].map(([k, l]) => `<button class="chip${filter === k ? ' on' : ''}" data-act="f-rv-f" data-v="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join('')}</div>`;
  if (!t) { $('#main').innerHTML = `<div class="fwrap">${h}<div class="fsec fempty">Rien à revoir ici 👌</div>${B('f-rv-exit', '← Retour', 'full')}</div>`; return; }
  const enter = ui.fEnter ? ` enter-${ui.fEnter}` : ''; ui.fEnter = '';
  const done = !isActive(t);
  h += `<div class="rv-nav">${B('f-rv-prev', '‹', '', rv.i ? '' : 'disabled')}<span>${rv.i + 1} / ${rv.ids.length}</span>${B('f-rv-next', '›', '', rv.i < rv.ids.length - 1 ? '' : 'disabled')}</div>
  <div class="fcard rv-card${enter}${done ? ' is-done' : ''}" data-swipe="review" data-p="${t.prio}">
    <div class="fcard-top"><span class="fcard-kicker">${done ? (t.status === 'done' ? '✓ Terminée' : '✕ Barrée') : esc(catLabel(t.cat))}</span><button class="fopen" data-act="f-open" data-id="${t.id}" aria-label="Détails">⋯</button></div>
    <div class="fcard-title">${esc(t.title)}</div>
    ${toggleHTML(t)}
    <div class="rv-state">
      ${done ? B('f-rv-reopen', '↺ Rouvrir', '', `data-id="${t.id}"`) : `${B('f-done', '✓ Fait', 'ok', `data-id="${t.id}"`)}${B('f-start', t.startedAt ? '▶ Commencée' : '▶ Commencer', t.startedAt ? 'primary' : '', `data-id="${t.id}"`)}${B('f-block', '⛔ Bloquée', '', `data-id="${t.id}"`)}${B('f-rv-cancel', '✕ Barrer', 'danger', `data-id="${t.id}"`)}`}
    </div>
    ${filter === 'inactive' && !done ? `<div class="rv-decide"><small>Pas touchée depuis 2 semaines. Une seule décision :</small><div class="grid3">${B('f-rv-keep', 'Garder', '', `data-id="${t.id}"`)}${B('f-rv-tomorrow', 'Demain', '', `data-id="${t.id}"`)}${B('f-rv-cancel', 'Abandonner', 'danger', `data-id="${t.id}"`)}</div></div>` : ''}
    <div class="fswipe-hint"><span>⟵ suivante</span><span>précédente ⟶</span></div>
  </div>`;
  $('#main').innerHTML = `<div class="fwrap">${h}</div>`;
}
function rvMove(step) {
  const rv = ui.rv; if (!rv) return;
  const n = rv.i + step; if (n < 0 || n >= rv.ids.length) { render(); return; }
  rv.i = n; ui.fEnter = step > 0 ? 'right' : 'left'; render();
}
function cycleTask(t, k) {
  if (k === 'day') {
    const d = today(), opts = [null, d, addDays(d, 1), addDays(monday(d), 7)], cur = t.slots[0].d;
    let i = opts.indexOf(cur); i = (i + 1) % opts.length;
    moveSlot(t, 0, opts[i]); return 0;
  }
  const c = CYCLES[k], i = (cycleVal(k, t[k]) + 1) % c.length, v = c[i][0];
  const was = t[k];
  if (v === undefined) delete t[k]; else t[k] = v;
  if (k === 'energy' && !was && v && !S.events.some(e => e.kind === 'classify' && e.tid === t.id)) return award('classify', t, XPV.classify).xp;
  return 0;
}
function setNext(t, txt) {
  txt = (txt || '').trim(); if (txt === (t.next || '')) return 0;
  t.next = txt;
  if (txt && !S.events.some(e => e.kind === 'next' && e.tid === t.id && e.day === today())) return award('next', t, XPV.next).xp;
  return 0;
}

/* ---------- actions ---------- */
function focusAct(a, el) {
  const f = F(), t = el && el.dataset && el.dataset.id ? find(el.dataset.id) : null;
  switch (a) {
    case 'f-en': f.en = el.dataset.v; f.ids = []; f.passes = 0; fillDeck(f); ui.fEnter = 'up'; save(); render(); return;
    case 'f-min': f.mins = +el.dataset.v || 0; f.ids = []; fillDeck(f); ui.fEnter = 'up'; save(); render(); return;
    case 'f-start': { if (!t) return; const u = snapshot(); const xp = startTask(t); fillDeck(f); commit(xp ? 'C’est parti ▶' : 'Déjà commencée', u); celebrate(xp); return; }
    case 'f-done': {
      if (!t || !isActive(t)) return;
      if (t.status === 'blocked') setStatus(t, 'todo');
      const u = snapshot(), [xp, big, msg] = finishTask(t);
      f.ids = f.ids.filter(id => id !== t.id); fillDeck(f); ui.fEnter = 'up';
      closeSheet(); commit(msg, u); celebrate(xp, big); return;
    }
    case 'f-step': {
      if (!t) return; const u = snapshot(), was = t.next;
      t.stepsDone = (t.stepsDone || 0) + 1; t.next = '';
      award('step', t, XPV.step, 'Étape : ' + was); commit('Étape faite ✓ Quelle est la suivante ?', u); celebrate(XPV.step); return;
    }
    case 'f-other':
      if (f.passes >= PASSES) { toast('Choisis une de ces cartes 🙂 (ou « Je suis bloqué »)'); render(); return; }
      if (f.ids.length > 1) f.ids.push(f.ids.shift());
      f.passes++; ui.fEnter = 'left'; save(); render(); return;
    case 'f-later': {
      const tt = t || find(f.ids[0]); if (!tt) return;
      if (f.passes >= PASSES) { toast('Choisis une de ces cartes 🙂 (ou « Je suis bloqué »)'); render(); return; }
      tt.snooze = today(); f.ids = f.ids.filter(id => id !== tt.id); f.passes++; ui.fEnter = 'left';
      commit('Plus tard : elle reviendra demain, sans retard'); return;
    }
    case 'f-block': if (t) { ui.cur = t.id; openBlock(t); } return;
    case 'f-open': if (t) openTask(t.id); return;
    case 'f-stuck': ui.stuckI = 0; openStuck(); return;
    case 'f-stuck-next': ui.stuckI = (ui.stuckI || 0) + 1; openStuck(); return;
    case 'f-stuck-done': { const u = snapshot(), it = ui.stuck || {}; award('stuck', it.tid ? find(it.tid) : null, XPV.stuck, it.text); closeSheet(); commit('Bien joué, ça compte ✓', u); celebrate(XPV.stuck); return; }
    case 'f-sum-ok': ui.seenAt = Date.now(); seenSet(ui.seenAt); render(); return;
    case 'f-mpass': { const ms = ensureMissions(), m = ms.list.find(x => x.carried && !x.done && !x.skipped); if (m) { m.skipped = true; ms.passUsed = true; } commit('Mission passée, pas de souci'); return; }
    case 'f-mic': dictate(); return;
    case 'f-review': S.settings.rvF = el.dataset.v || 'all'; S.settings.view = 'review'; ui.rv = null; closeSheet(); save(); render(false); $('#main').scrollTop = 0; return;
    case 'f-rv-f': S.settings.rvF = el.dataset.v; ui.rv = null; save(); render(false); return;
    case 'f-rv-exit': S.settings.view = 'now'; ui.rv = null; save(); render(false); return;
    case 'f-rv-prev': rvMove(-1); return;
    case 'f-rv-next': rvMove(1); return;
    case 'f-rv-reopen': if (t) { const u = snapshot(); setStatus(t, 'todo'); commit('Rouverte', u); } return;
    case 'f-rv-cancel': if (t) { const u = snapshot(); setStatus(t, 'cancelled'); commit('Barrée', u); if (S.settings.view === 'review') rvMove(1); } return;
    case 'f-rv-keep': if (t) { t.kept = today(); commit('On la garde'); rvMove(1); } return;
    case 'f-rv-tomorrow': if (t) { const u = snapshot(); moveSlot(t, 0, addDays(today(), 1)); commit('Prévue demain', u); rvMove(1); } return;
    case 'f-tg': {
      if (!t) return; const xp = cycleTask(t, el.dataset.k);
      commit(); celebrate(xp);
      if (!$('#sheet').classList.contains('hidden')) refreshSheet();
      return;
    }
  }
}
function onSwipe(kind, dir, el) {
  if (kind === 'deck') focusAct(dir === 'right' ? 'f-start' : 'f-later', el);
  else if (kind === 'review') rvMove(dir === 'left' ? 1 : -1);
}
function focusSubmit(f, fd) {
  if (f.id === 'fCap') {
    const title = (fd.get('title') || '').trim(); if (!title) return true;
    S.tasks.push({ id: uid(), title, cat: '', prio: 'yellow', note: '', status: 'todo', slots: [{ d: null, p: 'am', ok: false, o: 0 }], needs: [], color: pickColor(S.tasks), created: Date.now(), block: null });
    commit('Ajoutée ✓ Classe-la plus tard en revue, si tu veux');
    setTimeout(() => $('#fCap [name=title]')?.focus(), 30);
    return true;
  }
  if (f.classList.contains('fnext-form')) {
    const t = find(f.dataset.id); if (!t) return true;
    const xp = setNext(t, fd.get('next')); commit(); celebrate(xp); return true;
  }
  if (f.id === 'fStuckNext') {
    const it = ui.stuck || {}, t = it.tid && find(it.tid); if (!t) return true;
    const u = snapshot(), xp = setNext(t, fd.get('next'));
    closeSheet(); commit('Première étape notée ✓ Elle n’est plus floue', u); celebrate(xp + (xp ? 0 : 0)); return true;
  }
  return false;
}
function dictate() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Dictée non disponible sur ce navigateur'); return; }
  const r = new SR(), btn = $('#fMic');
  r.lang = 'fr-FR'; r.interimResults = false; r.maxAlternatives = 1;
  btn?.classList.add('rec');
  r.onresult = e => { const inp = $('#fCap [name=title]'); if (inp) { inp.value = ((inp.value ? inp.value + ' ' : '') + e.results[0][0].transcript).trim(); inp.focus(); } };
  r.onerror = () => toast('Micro indisponible');
  r.onend = () => btn?.classList.remove('rec');
  try { r.start(); } catch (e) { btn?.classList.remove('rec'); }
}
function focusSettingsHTML() {
  const c = k => fxOn(k) ? ' checked' : '';
  return `<div class="card"><h3>⚡ Mode Maintenant</h3>
    <p>Petits retours quand tu avances vraiment (tâche commencée, terminée, mission). Jamais pour un simple clic.</p>
    <label class="chk"><input type="checkbox" data-fx="sound"${c('sound')}> Petit son</label>
    <label class="chk"><input type="checkbox" data-fx="vib"${c('vib')}> Vibration discrète</label>
    <label class="chk"><input type="checkbox" data-fx="anim"${c('anim')}> Animations</label>
    <p style="margin-top:8px">Ton atelier : niveau ${atelierLevel(xpTotal()) + 1} · ${xpTotal()} XP au total. Il ne se dégrade jamais, même si tu fais une pause.</p></div>`;
}

/* ---------- gestes ---------- */
let sw = null;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest('[data-swipe]');
  if (!el || e.target.closest('button,input,textarea,select,a,label,form')) return;
  sw = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, active: false };
});
document.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
  if (!sw.active) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) { sw.active = true; sw.el.classList.add('swiping'); try { sw.el.setPointerCapture(e.pointerId); } catch (x) {} }
    else if (Math.abs(dy) > 12) { sw = null; return; } else return;
  }
  sw.dx = dx;
  sw.el.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
  sw.el.dataset.dir = dx > 50 ? 'right' : dx < -50 ? 'left' : '';
});
function swipeEnd(e, cancel) {
  if (!sw || (e && e.pointerId !== sw.id)) return;
  const s = sw; sw = null; if (!s.active) return;
  justDragged = Date.now();
  s.el.classList.remove('swiping');
  const th = Math.min(110, s.el.offsetWidth * 0.28);
  if (cancel || Math.abs(s.dx) < th) { s.el.style.transform = ''; s.el.dataset.dir = ''; return; }
  const dir = s.dx > 0 ? 'right' : 'left';
  s.el.style.transition = 'transform .32s ease, opacity .32s ease';
  s.el.style.transform = `translateX(${dir === 'right' ? 520 : -520}px) rotate(${dir === 'right' ? 16 : -16}deg)`;
  s.el.style.opacity = '0';
  setTimeout(() => onSwipe(s.el.dataset.swipe, dir, s.el), 230);
}
document.addEventListener('pointerup', e => swipeEnd(e, false));
document.addEventListener('pointercancel', e => swipeEnd(e, true));
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.fx) { (S.settings.fx || (S.settings.fx = {}))[el.dataset.fx] = el.checked; save(); if (el.checked && el.dataset.fx === 'sound') chime(false); }
  else if (el.classList && el.classList.contains('tg-next')) { const t = find(el.dataset.id); if (t) { const xp = setNext(t, el.value); commit(); celebrate(xp); } }
});
document.addEventListener('keydown', e => {
  if (S.settings.view !== 'review' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !$('#sheet').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); rvMove(1); }
  else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); rvMove(-1); }
}, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) seenSet(Date.now());
  else if (typeof S !== 'undefined') { ui.seenAt = seenGet() || ui.seenAt; if (S.settings.view === 'now') render(); }
});
