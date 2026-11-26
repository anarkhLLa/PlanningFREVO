import { describe, expect, it } from 'vitest';
import { addItem } from '../src/core/inventory';
import { buildGarage, exitAt, GARAGE_CACHE_SLOTS, isSolid } from '../src/core/map';
import { collides, newPlayer, stepPlayer } from '../src/core/movement';
import { capsules, claimIfEmpty, mergeSaves, newGame, openContainer, repairBench, takeAll } from '../src/core/state';
import { post } from '../src/core/ledger';
import { buildZone } from '../src/core/zones';

const caches = [{ contractId: 'c_a', title: 'Le stock', loot: [['wood', 4], ['scrap', 3], ['components', 1]] as [string, number][] }];

describe('zones et sorties', () => {
  it('la route du refuge mène au garage et inversement', () => {
    const r = buildZone('refuge'), g = buildZone('garage');
    const e1 = exitAt(r, 27.5, 31.5)!; expect(e1.to).toBe('garage');
    const e2 = exitAt(g, 27.5, 0.5)!; expect(e2.to).toBe('refuge');
    // les points d'arrivée sont libres et ne sont pas eux-mêmes des sorties (pas de ping-pong)
    expect(collides(g, e1.entry.x, e1.entry.y)).toBe(false); expect(exitAt(g, e1.entry.x, e1.entry.y)).toBeNull();
    expect(collides(r, e2.entry.x, e2.entry.y)).toBe(false); expect(exitAt(r, e2.entry.x, e2.entry.y)).toBeNull();
  });
  it('le garage est ouvert côté route et les caches sont accessibles', () => {
    const g = buildGarage(4, caches);
    expect(isSolid(g, 20, 13)).toBe(false); // grande porte
    const p = newPlayer(27.5, 2);
    // on marche vers la porte puis vers l'intérieur
    for (let i = 0; i < 400; i++) stepPlayer(p, { sx: 0, sy: 1, run: false }, g, 0.05);
    expect(collides(g, p.x, p.y)).toBe(false);
    const cache = g.objects.find(o => o.contractId === 'c_a')!;
    expect([cache.x, cache.y]).toEqual(GARAGE_CACHE_SLOTS[0]);
    expect(isSolid(g, cache.x, cache.y)).toBe(true);
  });
  it('le garage est déterministe', () => {
    expect(JSON.stringify(buildGarage(4, caches))).toBe(JSON.stringify(buildGarage(4, caches)));
  });
});

describe('caches de contrats', () => {
  it('la cache contient le butin du contrat ; vidée = récupérée une seule fois', () => {
    const s = newGame(buildZone('refuge'));
    const g = buildGarage(4, caches), obj = g.objects.find(o => o.contractId === 'c_a')!;
    const c = openContainer(s, obj);
    expect(c.items.items.map(i => i.def + i.qty)).toEqual(['wood4', 'scrap3', 'components1']);
    expect(claimIfEmpty(s, obj)).toBe(false); // pas encore vidée
    takeAll(s, c);
    expect(claimIfEmpty(s, obj)).toBe(true);
    expect(claimIfEmpty(s, obj)).toBe(false);
    expect(s.claimed).toEqual(['c_a']);
  });
});

describe('établi', () => {
  it('se répare avec 10 bois + 5 ferraille, une seule fois', () => {
    const s = newGame(buildZone('refuge'));
    expect(repairBench(s).ok).toBe(false);
    addItem(s.inventory, 'wood', 10); addItem(s.inventory, 'scrap', 5);
    expect(repairBench(s).ok).toBe(true);
    expect(s.built).toEqual(['refuge:bench']);
    expect(s.inventory.items.some(i => i.def === 'wood' || i.def === 'scrap')).toBe(false);
    addItem(s.inventory, 'wood', 10); addItem(s.inventory, 'scrap', 5);
    expect(repairBench(s).ok).toBe(false); // déjà fait : rien n'est consommé
  });
});

describe('synchronisation entre appareils', () => {
  it('fusion : capsules ni perdues ni doublées, caches et constructions conservées', () => {
    const base = newGame(buildZone('refuge'), 1000);
    const phone = JSON.parse(JSON.stringify(base)), pc = JSON.parse(JSON.stringify(base));
    post(phone.ledger, 'task:a:complete', 72, 'a'); phone.claimed.push('c_a'); phone.savedAt = 5000;
    post(pc.ledger, 'task:a:complete', 72, 'a'); post(pc.ledger, 'task:b:complete', 25, 'b'); pc.built.push('refuge:bench'); pc.savedAt = 4000;
    const m = mergeSaves(phone, pc);
    expect(capsules(m)).toBe(20 + 72 + 25);
    expect(m.claimed).toEqual(['c_a']); expect(m.built).toEqual(['refuge:bench']);
    expect(capsules(mergeSaves(m, m))).toBe(capsules(m)); // refusionner ne change rien
    expect(m.savedAt).toBe(5000); // la plus récente fait foi pour la position, le sac…
  });
});
