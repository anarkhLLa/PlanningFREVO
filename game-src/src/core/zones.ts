import { buildGarage, buildRefuge, type CacheSpec, type ZoneMap } from './map';

/** Registre des zones : une zone = une carte construite de façon déterministe. */
export function buildZone(id: string, caches: CacheSpec[] = []): ZoneMap {
  if (id === 'garage') return buildGarage(4, caches);
  return buildRefuge(1);
}
