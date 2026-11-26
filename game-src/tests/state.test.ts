import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/core/config';
import { addItem, countOf, newInventory, weightOf } from '../src/core/inventory';
import { balance, post } from '../src/core/ledger';
import { buildRefuge } from '../src/core/map';
import { capsules, findTarget, isOverloaded, migrate, newGame, openContainer, pickupLimit, put, take, takeAll } from '../src/core/state';

const map = buildRefuge(1);
const obj = (id: string) => map.objects.find(o => o.id === id)!;
const DAY = 864e5, T0 = Date.UTC(2026, 10, 26, 10);

describe('registre économique', () => {
  it('une même clé ne rapporte qu’une fois (idempotence)', () => {
    const s = newGame(map, T0);
    expect(capsules(s)).toBe(GameConfig.start.capsules);
    expect(post(s.ledger, 'evt_1:complete:v1', 60, 'tâche')).toBe(true);
    expect(post(s.ledger, 'evt_1:complete:v1', 60, 'tâche')).toBe(false);
    expect(balance(s.ledger)).toBe(GameConfig.start.capsules + 60);
  });
  it('une dépense ne peut pas rendre le solde négatif', () => {
    const s = newGame(map, T0);
    expect(() => post(s.ledger, 'achat:1', -9999, 'trop cher')).toThrow();
    expect(capsules(s)).toBe(GameConfig.start.capsules);
  });
});

describe('inventaire', () => {
  it('respecte les piles, les emplacements et le poids', () => {
    const inv = newInventory(2, 20);
    expect(addItem(inv, 'wood', 70)).toBe(20); // limité par le poids
    expect(weightOf(inv)).toBe(20);
    const big = newInventory(2, 0);
    expect(addItem(big, 'wood', 130)).toBe(100); // 2 piles de 50
  });
});

describe('conteneurs', () => {
  it('le butin est tiré une seule fois et identique à chaque partie', () => {
    const a = newGame(map, T0), b = newGame(map, T0);
    const ca = openContainer(a, obj('refuge:cabin-crate'), T0), cb = openContainer(b, obj('refuge:cabin-crate'), T0);
    expect(JSON.stringify(ca.items.items.map(i => [i.def, i.qty]))).toBe(JSON.stringify(cb.items.items.map(i => [i.def, i.qty])));
    takeAll(a, ca);
    const again = openContainer(a, obj('refuge:cabin-crate'), T0 + 5 * DAY);
    expect(again.items.items.length).toBe(0); // pas de réapparition
  });
  it('la caisse de départ donne de quoi commencer et se remet à niveau une fois par jour', () => {
    const s = newGame(map, T0);
    const c = openContainer(s, obj('refuge:starter'), T0);
    expect(countOf(c.items, 'wood')).toBe(10); expect(countOf(c.items, 'scrap')).toBe(5);
    takeAll(s, c);
    expect(countOf(openContainer(s, obj('refuge:starter'), T0 + 1000).items, 'wood')).toBe(0); // même jour : rien
    expect(countOf(openContainer(s, obj('refuge:starter'), T0 + DAY).items, 'wood')).toBe(10); // lendemain : remise à niveau
  });
  it('on ne peut pas dépasser la limite de ramassage ; la surcharge ralentit', () => {
    const s = newGame(map, T0);
    const c = openContainer(s, obj('refuge:starter'), T0);
    addItem(c.items, 'scrap', 40);
    takeAll(s, c);
    expect(weightOf(s.inventory)).toBeLessThanOrEqual(pickupLimit() + 1e-9);
    expect(isOverloaded(s)).toBe(true);
  });
  it('l’outil équipé ne peut pas être déposé', () => {
    const s = newGame(map, T0);
    const c = openContainer(s, obj('refuge:starter'), T0);
    expect(put(s, c, s.equipment.main!)).toBe(0);
    const w = s.inventory.items.find(i => i.def === 'tool_basic');
    expect(w).toBeTruthy();
    expect(take(s, c, 'inexistant')).toBe(0);
  });
});

describe('interaction et sauvegarde', () => {
  it('trouve la caisse de départ quand on est à côté', () => {
    expect(findTarget(map, 19.5, 15.3, Math.PI / 2)?.id).toBe('refuge:starter');
    expect(findTarget(map, 3.5, 30.5, 0)).toBeNull();
  });
  it('une sauvegarde rechargée est identique', () => {
    const s = newGame(map, T0);
    takeAll(s, openContainer(s, obj('refuge:starter'), T0));
    const back = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(back).toEqual(s);
    expect(migrate({ nimporte: 'quoi' })).toBeNull();
  });
});
