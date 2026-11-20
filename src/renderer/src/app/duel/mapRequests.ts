// Feel-ii (spec 2026-11-18-feel-ii-design §1.1): what the Helm map's right button asked the duel mode to send since the
// last take: a held heading (a heading index 0..255, or −1 to clear it). Valkyrn spec §5.1: the Flight map's pointer bearing
// (the latest) and its right-button presses (torpedo launches). W-1 (pew pew spec §1): the Weapons map's left click,
// the pew's fine aim (the latest). W-2 (pew pew spec §2), W-4 spec §9: the reticle, the pointer's latest fine bearing on the
// open Weapons map (the laser fit's MANUAL laser fires along it; the Hound's MAN gun turret follows it), kept (peeked, not
// drained) until a new round. W-3 (pew pew spec §3): the MANUAL torpedo's held heading from
// the Weapons map's right button (the latest, drained). The scene turns the pointer into requests each frame; the runtime (Single player) or the online session drains them. Local to one screen.
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
  /** W-2, W-4 spec §9: the reticle: the pointer's fine bearing (0..65535) from the own ship's drawn marker while it is on
   *  the open Weapons map. */
  reticle(aim: number): void;
  /** W-2, W-4 spec §9: the reticle: the pointer's latest fine bearing on the open Weapons map (the laser fit's MANUAL laser
   *  fires along it; the Hound's MAN gun turret follows it), kept until a new round, or null before any. */
  reticleAim(): number | null;
  /** W-2: a new round starts with no reticle (the laser then aims along the nose). */
  resetReticle(): void;
  /** W-3, W-4 spec §7: the MANUAL torpedo's held heading from the Weapons map's LMB steer (a heading index 0..255). */
  torpHeading(h: number): void;
  /** W-3: the latest of those since the last take, or null. */
  takeTorpHeading(): number | null;
  /** W-4 spec §8, §9: whether the left button is held over the open Weapons map at the Hound's seat (the trigger), set
   *  every frame by the scene, and its latest value (peeked, not drained). */
  trigger(held: boolean): void;
  triggerHeld(): boolean;
}

export function createMapRequests(): MapRequests {
  let heading: number | null = null, steer: number | null = null, launches = 0, pew: number | null = null, reticleAim: number | null = null, torp: number | null = null;
  let trig = false;
  return {
    trigger(held) { trig = held; }, triggerHeld: () => trig,
    heading(h) { heading = h; },
    takeHeading() { const out = heading; heading = null; return out; },
    steer(h) { steer = h; },
    takeSteer() { const out = steer; steer = null; return out; },
    launch() { launches++; },
    takeLaunches() { const out = launches; launches = 0; return out; },
    pew(aim) { pew = aim; },
    takePew() { const out = pew; pew = null; return out; },
    reticle(aim) { reticleAim = aim; },
    reticleAim: () => reticleAim,
    resetReticle() { reticleAim = null; },
    torpHeading(h) { torp = h; },
    takeTorpHeading() { const out = torp; torp = null; return out; }
  };
}
