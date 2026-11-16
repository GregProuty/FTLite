// Art-pixel grid checks (Art-i spec section 4): one art pixel is 2 world units, so every procedural rectangle is even at even offsets.
export interface GridRect { x: number; y: number; w: number; h: number }

/** True when x, y, w and h are all even whole numbers. */
export function onGrid(r: GridRect): boolean { return [r.x, r.y, r.w, r.h].every((v) => Number.isInteger(v) && v % 2 === 0); }

/** The band a Pixi 8 stroke paints around a rectangle path: alignment 1 inside, 0.5 centred, 0 outside. `outer` and `inner` bound the painted ring. */
export function strokeBand(r: GridRect, width: number, alignment: number): { outer: GridRect; inner: GridRect } {
  const out = (1 - alignment) * width, inn = alignment * width;
  return {
    outer: { x: r.x - out, y: r.y - out, w: r.w + 2 * out, h: r.h + 2 * out },
    inner: { x: r.x + inn, y: r.y + inn, w: r.w - 2 * inn, h: r.h - 2 * inn }
  };
}
