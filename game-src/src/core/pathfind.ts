import { isSolid, type ZoneMap } from './map';

/**
 * A* sur la grille, 8 directions sans couper les coins (les ennemis ne traversent pas les murs, cahier 11.5).
 * Limité en nombre de cases explorées pour rester léger sur téléphone.
 */
export function findPath(map: ZoneMap, sx: number, sy: number, tx: number, ty: number, maxNodes = 900): [number, number][] | null {
  const W = map.w, key = (x: number, y: number) => y * W + x;
  const start = [Math.floor(sx), Math.floor(sy)], goal = [Math.floor(tx), Math.floor(ty)];
  if (isSolid(map, goal[0], goal[1])) return null;
  const g = new Map<number, number>(), came = new Map<number, number>();
  const open: { k: number; x: number; y: number; f: number }[] = [];
  const h = (x: number, y: number) => { const dx = Math.abs(x - goal[0]), dy = Math.abs(y - goal[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const s0 = key(start[0], start[1]);
  g.set(s0, 0); open.push({ k: s0, x: start[0], y: start[1], f: h(start[0], start[1]) });
  const closed = new Set<number>();
  let explored = 0;
  while (open.length && explored < maxNodes) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (closed.has(cur.k)) continue;
    if (cur.x === goal[0] && cur.y === goal[1]) {
      const path: [number, number][] = [];
      let k: number | undefined = cur.k;
      while (k !== undefined && k !== s0) { path.push([k % W, Math.floor(k / W)]); k = came.get(k); }
      return path.reverse();
    }
    closed.add(cur.k); explored++;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cur.x + dx, ny = cur.y + dy;
      if (isSolid(map, nx, ny)) continue;
      if (dx && dy && (isSolid(map, cur.x + dx, cur.y) || isSolid(map, cur.x, cur.y + dy))) continue; // pas de coin coupé
      const nk = key(nx, ny), ng = (g.get(cur.k) ?? 0) + (dx && dy ? 1.414 : 1);
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, cur.k); open.push({ k: nk, x: nx, y: ny, f: ng + h(nx, ny) }); }
    }
  }
  return null;
}

/** Ligne de vue sur la grille : aucune case solide entre deux points. */
export function lineOfSight(map: ZoneMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(map, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false;
  }
  return true;
}
