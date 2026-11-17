// The presentation clock (Art-i spec section 7): the time particles, sprite animation, the shake and the ambient life
// run on. A hitstop stops it for a moment; the sim, its interpolation and tick-counted effects (the flash) never read
// it, so they keep running. Pure: no Pixi.

export interface PresentClock {
  /** Presentation seconds since the clock was made (frozen during a hitstop). */
  readonly t: number;
  /** True while a hitstop holds the clock. */
  readonly stopped: boolean;
  /** Advance by a frame's real seconds; returns the presentation seconds that passed (dt minus any hitstop it used). */
  advance(dt: number): number;
  /** Stop the clock for `seconds` from now; a longer stop already running is kept. */
  hitstop(seconds: number): void;
  /** Let a running hitstop pass `seconds` of real time without advancing `t` (a pause). */
  drain(seconds: number): void;
  reset(): void;
}

export function createPresentClock(): PresentClock {
  let t = 0, stop = 0;
  return {
    get t() { return t; },
    get stopped() { return stop > 0; },
    advance(dt) {
      const held = Math.min(stop, dt);
      stop -= held;
      const run = dt - held;
      t += run;
      return run;
    },
    drain(seconds) { stop = Math.max(0, stop - seconds); },
    hitstop(seconds) { stop = Math.max(stop, seconds); },
    reset() { t = 0; stop = 0; }
  };
}
