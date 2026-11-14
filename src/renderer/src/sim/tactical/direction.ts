import { HEADING_X, HEADING_Y } from './headings';
import { HEADING_COUNT } from './tuning';

/** Any integer heading index to 0..255. */
export function wrapHeading(i: number): number { return ((i % HEADING_COUNT) + HEADING_COUNT) % HEADING_COUNT; }
export function hx(i: number): number { return HEADING_X[wrapHeading(i)]!; }
export function hy(i: number): number { return HEADING_Y[wrapHeading(i)]!; }

/** Unit direction between heading i and i + 1 at fraction f in [0, 1). Used where 256 directions are too coarse (map layout). */
export function dirBetween(i: number, f: number): [number, number] {
  const ax = hx(i), ay = hy(i), bx = hx(i + 1), by = hy(i + 1);
  const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
  const l = Math.sqrt(x * x + y * y);
  return [x / l, y / l];
}
