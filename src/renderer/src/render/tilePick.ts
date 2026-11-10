/** Deterministic variant choice so the ship looks identical every run (spec §4). Knuth multiplicative hash; no RNG stream touched. */
export function pickVariant(seedIndex: number, count: number): number {
  if (count <= 1) return 0;
  return (Math.imul(seedIndex | 0, 0x9e3779b1) >>> 0) % count;
}

export function floorVariant(roomIndex: number): number { return pickVariant(roomIndex, 4); }

const WALLS = ['wall.plain', 'wall.vent', 'wall.pipes', 'wall.screen'] as const;
export function wallVariant(tileIndex: number): (typeof WALLS)[number] { return WALLS[pickVariant(tileIndex, WALLS.length)]!; }

/** Spec §2: a wall gets the tall front-wall sprite only when the tile above is not a floor (void, wall, out of bounds). Door tiles ('+') count as floor. */
export function wallKind(rows: readonly string[], tx: number, ty: number): 'tall' | 'flat' {
  if (ty === 0) return 'tall';
  const above = rows[ty - 1]!.charAt(tx);
  return above === '#' || above === ' ' || above === '' ? 'tall' : 'flat';
}
