// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3): the Weapons camera follows a MANUAL torpedo while it
// flies (the camera's existing missile follow) and goes back to its view when the flight ends: the ship, or a free view's
// centre. A camera the player moved during the flight is left where it is.
import { describe, expect, it } from 'vitest';
import { createCamera, pan, snapBack } from '../src/renderer/src/render/tactical/camera';
import { createTorpedoFollow, trackManualTorpedo } from '../src/renderer/src/app/duel/torpedoCamera';

describe('trackManualTorpedo (spec §3)', () => {
  it('follows the torpedo from its launch and goes back to the ship when it ends', () => {
    const cam = createCamera(10, 20), memo = createTorpedoFollow();
    trackManualTorpedo(cam, memo, false);
    expect(cam.follow).toBe('ship');
    trackManualTorpedo(cam, memo, true);
    expect(cam.follow).toBe('missile');
    trackManualTorpedo(cam, memo, true);   // still flying: nothing changes
    expect(cam.follow).toBe('missile');
    trackManualTorpedo(cam, memo, false);
    expect([cam.follow, memo.before]).toEqual(['ship', null]);
  });
  it('from a free view, goes back to that view\'s centre', () => {
    const cam = createCamera(0, 0, 1), memo = createTorpedoFollow();
    pan(cam, -100, 50);   // free, centred on (100, −50)
    expect([cam.follow, cam.centreX, cam.centreY]).toEqual(['free', 100, -50]);
    trackManualTorpedo(cam, memo, true);
    expect(cam.follow).toBe('missile');
    cam.centreX = 900; cam.centreY = 900;   // the follow moved it along the flight
    trackManualTorpedo(cam, memo, false);
    expect([cam.follow, cam.centreX, cam.centreY, cam.snap]).toEqual(['free', 100, -50, null]);
  });
  it('a camera the player moved during the flight is left alone', () => {
    const cam = createCamera(), memo = createTorpedoFollow();
    trackManualTorpedo(cam, memo, true);
    snapBack(cam, 'ship');   // C at Weapons: back to the ship
    trackManualTorpedo(cam, memo, false);
    expect(cam.follow).toBe('ship');
    const panned = createCamera(), m2 = createTorpedoFollow();
    trackManualTorpedo(panned, m2, true);
    pan(panned, 30, 0);
    const x = panned.centreX;
    trackManualTorpedo(panned, m2, false);
    expect([panned.follow, panned.centreX]).toEqual(['free', x]);
  });
});
