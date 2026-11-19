// Feel-ii (spec 2026-11-18-feel-ii-design §1.1): what the Helm map's right button asked the duel mode to send since the
// last take: a held heading (a heading index 0..255, or −1 to clear it). Valkyrn spec §5.1: the Flight map's pointer bearing
// (the latest) and its right-button presses (torpedo launches). The scene turns the pointer into requests each frame; the
// runtime (Single player) or the online session drains them. Local to one screen.
export interface MapRequests {
  heading(h: number): void;
  takeHeading(): number | null;
  /** Valkyrn spec §5.1: the pointer's bearing from the own ship's drawn marker on the Flight map (a heading index). */
  steer(h: number): void;
  takeSteer(): number | null;
  /** Valkyrn spec §5.1: a right-button press on the Flight map (a torpedo launch). */
  launch(): void;
  takeLaunches(): number;
}

export function createMapRequests(): MapRequests {
  let heading: number | null = null, steer: number | null = null, launches = 0;
  return {
    heading(h) { heading = h; },
    takeHeading() { const out = heading; heading = null; return out; },
    steer(h) { steer = h; },
    takeSteer() { const out = steer; steer = null; return out; },
    launch() { launches++; },
    takeLaunches() { const out = launches; launches = 0; return out; }
  };
}
