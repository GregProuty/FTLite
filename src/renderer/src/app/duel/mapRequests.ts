// Feel-ii (spec 2026-11-18-feel-ii-design §1.1): what the Helm map's right button asked the duel mode to send since the
// last take: a held heading (a heading index 0..255, or −1 to clear it). Valkyrn spec §5.1: the Flight map's pointer bearing
// (the latest) and its right-button presses (torpedo launches). W-1 (pew pew spec §1): the Weapons map's left click,
// the pew's fine aim (the latest). W-2 (pew pew spec §2): the laser's aim, the pointer's latest fine bearing on the open
// Weapons map, kept (peeked, not drained) until a new round. The scene turns the pointer into requests each frame; the runtime (Single player) or the online session drains them. Local to one screen.
export interface MapRequests {
  heading(h: number): void;
  takeHeading(): number | null;
  /** Valkyrn spec §5.1: the pointer's bearing from the own ship's drawn marker on the Flight map (a heading index). */
  steer(h: number): void;
  takeSteer(): number | null;
  /** Valkyrn spec §5.1: a right-button press on the Flight map (a torpedo launch). */
  launch(): void;
  takeLaunches(): number;
  /** W-1: a left click on the Weapons map, the pew's fine aim (0..65535) from the own ship's drawn marker. */
  pew(aim: number): void;
  takePew(): number | null;
  /** W-2: the pointer's fine bearing (0..65535) from the own ship's drawn marker while it is on the open Weapons map. */
  aimLaser(aim: number): void;
  /** W-2: the latest of those, kept until resetLaserAim (the MANUAL laser fires along it), or null before any. */
  laserAim(): number | null;
  /** W-2: a new round starts with no aim (the laser then aims along the nose). */
  resetLaserAim(): void;
}

export function createMapRequests(): MapRequests {
  let heading: number | null = null, steer: number | null = null, launches = 0, pew: number | null = null, laserAim: number | null = null;
  return {
    heading(h) { heading = h; },
    takeHeading() { const out = heading; heading = null; return out; },
    steer(h) { steer = h; },
    takeSteer() { const out = steer; steer = null; return out; },
    launch() { launches++; },
    takeLaunches() { const out = launches; launches = 0; return out; },
    pew(aim) { pew = aim; },
    takePew() { const out = pew; pew = null; return out; },
    aimLaser(aim) { laserAim = aim; },
    laserAim: () => laserAim,
    resetLaserAim() { laserAim = null; }
  };
}
