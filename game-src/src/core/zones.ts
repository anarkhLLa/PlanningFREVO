import type { CacheSpec, ZoneMap } from './map';
import { buildWorld } from './world';

/** Il n'y a plus qu'une carte : le monde continu (les anciennes « zones » sont des régions). */
export function buildZone(_id = 'world', caches: CacheSpec[] = []): ZoneMap {
  return buildWorld(caches);
}
