// The Helm's throttle levels (Artemis spec 2026-11-17-artemis-consoles §5): one pure place that the sim (admission, the
// snapshot bounds, the step's thrust, the scripted pair) and the app (W/S, the notch clicks, the drawn prediction)
// share. −1 is reverse, 0 stop, and 1 to 4 are 25, 50, 75 and 100 % forward.
import { HEADING_COUNT } from '../tactical/tuning';

export const THROTTLE_MIN = -1;
export const THROTTLE_MAX = 4;

/** A level the helm module holds: an integer in −1..4. */
export function validThrottle(level: unknown): boolean {
  return typeof level === 'number' && Number.isInteger(level) && level >= THROTTLE_MIN && level <= THROTTLE_MAX;
}

/** A held heading the helm module holds (Feel-ii spec §1.1): −1 for none, or an integer heading index 0..255. */
export function validHoldHeading(h: unknown): boolean {
  return typeof h === 'number' && Number.isInteger(h) && h >= -1 && h < HEADING_COUNT;
}

/** The thrust axis a level flies at (spec §5.3): −1 for reverse, a quarter a notch forward. */
export function throttleThrust(level: number): number { return level < 0 ? -1 : level / 4; }

/** The nearest level to `level`: rounded, then clamped to −1..4. NaN and −0 give 0. */
export function clampThrottle(level: number): number {
  return Math.max(THROTTLE_MIN, Math.min(THROTTLE_MAX, Math.round(level))) || 0;
}
