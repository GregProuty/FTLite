// W-4 spec §7 (W-4c): the Hound's Weapons seat around a MANUAL flight. The pure latch: no trigger and no left-click fire while
// it flies; when it ends, a torpedo selection goes back to the last gun and a left button still down (on the map or off it)
// makes the trigger stale until released. Then Single player and online: A/D select during a flight, LMB clicks fire
// nothing while it flies, the held trigger sends no gunHeld, R and Shift+R still work, a click-launch held down steers at once, and
// the online turret prediction counts no frames.
import { describe, expect, it } from 'vitest';
import { flightFrame, NO_FLIGHT } from '../src/renderer/src/app/duel/weaponsSeat';

// flightFrame(latch, flyingNow, sel, lastGun, triggerNow, buttonNow): the trigger is the map-gated one (the left button on
// the open map), the button the raw left button anywhere (Decision 7).
describe('flightFrame (W-4 spec §7)', () => {
  it('while flying: no trigger and no clicks; the selection is untouched', () => {
    const f = flightFrame(NO_FLIGHT, true, 2, 1, true, true);
    expect(f).toEqual({ latch: { flying: true, stale: false }, sel: 2, trigger: false, clicks: false });
  });
  it('the end frame: the torpedo selection returns to the last gun; a button still down goes stale', () => {
    const f = flightFrame({ flying: true, stale: false }, false, 2, 1, true, true);
    expect(f).toEqual({ latch: { flying: false, stale: true }, sel: 1, trigger: false, clicks: true });
  });
  it('a gun selected at the end stays; a button released at the end is not stale', () => {
    expect(flightFrame({ flying: true, stale: false }, false, 0, 1, false, false)).toEqual({ latch: { flying: false, stale: false }, sel: 0, trigger: false, clicks: true });
  });
  it('stale until the button is released, then a fresh hold fires', () => {
    let f = flightFrame({ flying: false, stale: true }, false, 1, 1, true, true);
    expect([f.trigger, f.latch.stale]).toEqual([false, true]);
    f = flightFrame(f.latch, false, 1, 1, false, false);
    expect([f.trigger, f.latch.stale]).toEqual([false, false]);
    f = flightFrame(f.latch, false, 1, 1, true, true);
    expect([f.trigger, f.latch.stale]).toEqual([true, false]);
  });
  it('the flight ends with the button down off the map (no trigger), then the pointer drags onto the map: still stale, no fire (review finding 8)', () => {
    let f = flightFrame({ flying: true, stale: false }, false, 1, 1, false, true);
    expect([f.trigger, f.latch.stale]).toEqual([false, true]);
    f = flightFrame(f.latch, false, 1, 1, true, true);   // onto the map, never let go
    expect([f.trigger, f.latch.stale]).toEqual([false, true]);
    f = flightFrame(f.latch, false, 1, 1, false, false);
    f = flightFrame(f.latch, false, 1, 1, true, true);   // a fresh press on the map
    expect([f.trigger, f.latch.stale]).toEqual([true, false]);
  });
  it('no flight at all: the trigger passes, clicks fire', () => {
    expect(flightFrame(NO_FLIGHT, false, 1, 1, true, true)).toEqual({ latch: NO_FLIGHT, sel: 1, trigger: true, clicks: true });
  });
});
