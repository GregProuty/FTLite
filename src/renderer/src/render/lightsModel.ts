// Lights and ambient life (Art-i spec sections 5 and 8): posterised glows on the art-pixel grid, the console, fire and
// lamp light levels, the lamp flicker, the console screen blink and the two-layer starfield. Pure: no Pixi. Times are
// presentation seconds; every per-object constant comes from the particle generator's hash of the layout.
import type { DoorRect } from './doorModel';
import type { Band } from './worldFit';
import { hash2 } from './particles/random';

/** One run of a glow: a rectangle in world units (centred on 0, 0) and its alpha step. */
export interface GlowRun extends DoorRect { alpha: number }
export const GLOW_STEPS = [0.14, 0.26, 0.42] as const;

/**
 * A posterised round glow of `radius` art pixels: each art pixel (2 world units) takes the alpha step of its distance
 * band (outer, middle, inner thirds), with hard edges; merged into horizontal runs per row and step. On the grid.
 */
export function glowRuns(radius: number): GlowRun[] {
  const out: GlowRun[] = [];
  for (let j = -radius; j < radius; j++) {
    let run: GlowRun | null = null;
    for (let i = -radius; i <= radius; i++) {
      const d = Math.hypot(i + 0.5, j + 0.5) / radius;
      const alpha = i < radius && d < 1 ? GLOW_STEPS[d < 1 / 3 ? 2 : d < 2 / 3 ? 1 : 0] : -1;
      if (run && run.alpha === alpha) { run.w += 2; continue; }
      if (run && run.alpha >= 0) out.push(run);
      run = { x: i * 2, y: j * 2, w: 2, h: 2, alpha };
    }
  }
  return out;
}

export const CONSOLE_GLOW = { free: 0.5, occupied: 0.85 } as const, FIRE_GLOW = [0.45, 0.6, 0.75] as const;
export const LAMP_ALERT = 0.9, LAMP_CALM = 0.55;

/** A console's light: steady, brighter while someone sits there; a console that is down gives none. */
export function consoleGlow(look: 'free' | 'occupied' | 'down'): number { return look === 'down' ? 0 : CONSOLE_GLOW[look]; }

/** A burning tile's light flickers between three steps, changing ten times a second, out of step tile to tile. */
export function fireGlow(seed: number, tile: number, t: number): number {
  return FIRE_GLOW[Math.floor(hash2(seed ^ tile, Math.floor(t * 10)) * 3)]!;
}

/** Each lamp's schedule: a period of 3 to 7 s with its own phase; it goes dark for 0.08 s, comes back for 0.08 s, then
 *  drops again for 0.06 s, once a period. */
export function lampLit(seed: number, room: number, t: number): boolean {
  const period = 3 + 4 * hash2(seed, room * 2), phase = hash2(seed, room * 2 + 1) * period;
  const local = (((t + phase) % period) + period) % period;
  return !(local < 0.08 || (local >= 0.16 && local < 0.22));
}

/** A room lamp's colour and light: lampOn and steady in alert, else lampOff on its flicker schedule. */
export function lampLight(alert: boolean, lit: boolean): { on: boolean; alpha: number } {
  return alert ? { on: true, alpha: LAMP_ALERT } : { on: false, alpha: lit ? LAMP_CALM : 0 };
}

/** A console screen's blink: screenA or screenB, at 1 to 2 Hz with its own phase. */
export function screenPhase(seed: number, station: number, t: number): 'A' | 'B' {
  const hz = 1 + hash2(seed, 1000 + station), phase = hash2(seed, 2000 + station);
  return Math.floor((t * hz + phase) * 2) % 2 === 0 ? 'A' : 'B';
}

/** The blinking readout on a console screen: 2 x 1 art pixels (1 x 2 on a side wall), one art pixel in from the
 *  screen's start, in ship world units. `screen` is tile-local and on the art-pixel grid (consoleModel's deskPicture,
 *  one art pixel deep), `x`/`y` the tile's origin, so the cursor is on the grid and inside the screen. */
export function screenCursor(x: number, y: number, screen: DoorRect): DoorRect {
  return screen.w >= screen.h
    ? { x: x + screen.x + 2, y: y + screen.y, w: 4, h: 2 }
    : { x: x + screen.x, y: y + screen.y + 2, w: 2, h: 4 };
}

/** The starfield: two layers drifting left at 4 and 10 art pixels a second, stars one art pixel square on whole art
 *  pixels from the band's corner, wrapping inside the band. The band is in internal pixels, so `artPx` is the size of
 *  one art pixel there: 2 x the world scale (the snapped fit makes it whole screen pixels, Art-i spec section 4). */
export const STAR_LAYERS = [{ count: 48, speed: 4 }, { count: 20, speed: 10 }] as const;
export interface Star { x: number; y: number; layer: number }
export function stars(seed: number, band: Band, t: number, artPx: number): Star[] {
  const out: Star[] = [], snap = (v: number): number => artPx * Math.floor(v / artPx);
  STAR_LAYERS.forEach((l, layer) => {
    for (let k = 0; k < l.count; k++) {
      const x0 = hash2(seed, layer * 1000 + k * 2) * band.w, y0 = hash2(seed, layer * 1000 + k * 2 + 1) * (band.h - artPx);
      const x = (((x0 - l.speed * artPx * t) % band.w) + band.w) % band.w;
      out.push({ x: band.x + snap(Math.min(x, band.w - artPx)), y: band.y + snap(y0), layer });
    }
  });
  return out;
}
