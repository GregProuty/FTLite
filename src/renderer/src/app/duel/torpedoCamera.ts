// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3): the Weapons map follows a MANUAL torpedo while it flies
// (the camera's existing missile follow) and goes back to the view it had when the flight ends. Pure camera state, local
// to one screen; the Single player runtime and the online source call it on the Weapons camera every frame.
import { followBody, type Camera, type Follow } from '../../render/tactical/camera';

/** Whether a MANUAL torpedo flew last frame, and the camera's follow and centre from before its flight (null: none). */
export interface TorpedoFollow { flying: boolean; before: { follow: Follow; x: number; y: number } | null }

/** A fresh memo: no flight seen (each new round's cameras start one). */
export function createTorpedoFollow(): TorpedoFollow { return { flying: false, before: null }; }

/** One frame, before the camera's follow update, with whether the crew's MANUAL torpedo flies now. At a flight's start it
 *  remembers the camera's follow and centre and follows the missile (eased, as C's snap). At its end, if the camera still
 *  follows the missile, it goes back: to the ship (eased), or from a free view to that view's centre. A camera the player
 *  changed during the flight (C, a pan) is left as it is. */
export function trackManualTorpedo(cam: Camera, memo: TorpedoFollow, flying: boolean): void {
  if (flying && !memo.flying) {
    memo.before = { follow: cam.follow, x: cam.centreX, y: cam.centreY };
    followBody(cam, 'missile');
  } else if (!flying && memo.flying) {
    const b = memo.before;
    if (b && cam.follow === 'missile') {
      if (b.follow === 'free') { cam.follow = 'free'; cam.snap = null; cam.anchor = null; cam.centreX = b.x; cam.centreY = b.y; }
      else followBody(cam, b.follow);
    }
    memo.before = null;
  }
  memo.flying = flying;
}
