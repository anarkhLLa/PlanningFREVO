import { describe, expect, it } from 'vitest';
import { addItem } from '../src/core/inventory';
import { GARAGE_CACHE_SLOTS, isSolid } from '../src/core/map';
import { buildWorld, regionAt, regionOffset } from '../src/core/world';
import { newPlayer, stepPlayer } from '../src/core/movement';
import { capsules, claimIfEmpty, mergeSaves, migrate, newGame, openContainer, repairBench, takeAll } from '../src/core/state';
import { post } from '../src/core/ledger';
import { buildZone } from '../src/core/zones';

const caches = [{ contractId: 'c_a', title: 'Le stock', loot: [['wood', 4], ['scrap', 3], ['components', 1]] as [string, number][] }];

describe('monde continu', () => {
  const W = buildZone();
  it('le refuge et le garage sont sur une seule carte, reliés par la route', () => {
    expect(W.w).toBe(32); expect(W.h).toBe(64);
    expect(regionAt(18, 14)?.id).toBe('refuge'); expect(regionAt(27, 40)?.id).toBe('garage');
    // on part du refuge et on suit la route vers le sud sans jamais être bloqué
    const p = newPlayer(27.5, 20.5);
    for (let i = 0; i < 400 && p.y < 45; i++) stepPlayer(p, { sx: -0.5, sy: 1, run: true }, W, 0.05);
    expect(p.y).toBeGreaterThan(45);
    expect(regionAt(p.x, p.y)?.id).toBe('garage');
  });
  it('le garage est ouvert côté route et ses caches sont posées à leur place', () => {
    const g = buildWorld(caches), off = regionOffset('garage');
    expect(isSolid(g, 20 + off.x, 13 + off.y)).toBe(false); // grande porte
    const cache = g.objects.find(o => o.contractId === 'c_a')!;
    expect([cache.x - off.x, cache.y - off.y]).toEqual(GARAGE_CACHE_SLOTS[0]);
    expect(isSolid(g, cache.x, cache.y)).toBe(true);
  });
  it('le monde est déterministe', () => {
    expect(JSON.stringify(buildWorld(caches))).toBe(JSON.stringify(buildWorld(caches)));
  });
  it('une ancienne sauvegarde (zone garage) est convertie sans rien perdre', () => {
    const old = newGame(buildZone()) as unknown as Record<string, unknown> & { player: { y: number }; zone: string; schema: number };
    old.schema = 1; old.zone = 'garage'; old.player.y = 5;
    const s = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(s.zone).toBe('world'); expect(s.player.y).toBe(37); expect(s.schema).toBe(2);
  });
});

describe('caches de contrats', () => {
  it('la cache contient le butin du contrat ; vidée = récupérée une seule fois', () => {
    const s = newGame(buildZone('refuge'));
    const g = buildWorld(caches), obj = g.objects.find(o => o.contractId === 'c_a')!;
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
