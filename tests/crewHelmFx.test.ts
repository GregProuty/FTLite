// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §6): the cold gas puffs at the hull edge opposite each push
// (a boosted turn at the bow and stern on opposite sides), the dashed steering marker from the ship to the cursor, and the
// sfx.rcs hiss retriggered while venting.
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { RCS_HISS, RCS_HISS_GAP_S, rcsHiss } from '../src/renderer/src/audio/duelSounds';
import { SFX, sfxFiles } from '../src/renderer/src/audio/soundBank';
import { noVent, ventOf } from '../src/renderer/src/sim/duel/helmFlight';
import { RCS_TURN_BOOST } from '../src/renderer/src/sim/tactical/tuning';

const vp = { w: 1280, h: 720 };
function model(over: Partial<TacticalModelInput>) {
  const st = createTacticalState(5), s = st.ships[0];
  Object.assign(s, { heading: 0, headingAcc: 0 });
  const cam = createCamera(s.x, s.y, 1);
  return tacticalModel({ state: st, prev: st.ships.map((b) => ({ x: b.x, y: b.y, h: b.heading + b.headingAcc })), alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0, ...over });
}

describe('the puffs (spec §6)', () => {
  it('none without venting; a forward push puffs at the stern, a starboard push at the port side', () => {
    expect(model({}).puffs ?? []).toEqual([]);
    expect(model({ vent: { x: 0, y: 0, boosted: false, turn: 0 } }).puffs ?? []).toEqual([]);
    const ship = model({}).ships[0]!;
    const [aft] = model({ vent: { x: 0, y: 1, boosted: false, turn: 0 } }).puffs!;
    expect(aft!.y).toBeGreaterThan(ship.y); expect(aft!.dx).toBeCloseTo(0, 9); expect(aft!.dy).toBeCloseTo(1, 9);   // nose north: the stern is down the screen
    const [port] = model({ vent: { x: 1, y: 0, boosted: false, turn: 0 } }).puffs!;
    expect(port!.x).toBeLessThan(ship.x); expect(port!.dx).toBeCloseTo(-1, 9);
  });
  it('a boosted clockwise turn puffs at the bow to port and at the stern to starboard', () => {
    const ship = model({}).ships[0]!, p = model({ vent: { x: 0, y: 0, boosted: true, turn: 1 } }).puffs!;
    expect(p).toHaveLength(2);
    expect([p[0]!.y < ship.y, p[0]!.dx < 0, p[1]!.y > ship.y, p[1]!.dx > 0]).toEqual([true, true, true, true]);
  });
  it("the puffs' sides follow the vent's own turn, not the drawn axes (final review M2)", () => {
    const ship = model({}).ships[0]!, p = model({ vent: { x: 0, y: 0, boosted: true, turn: -1 }, axes: { turn: 0, thrust: 0 } }).puffs!;
    expect(p).toHaveLength(2);
    expect([p[0]!.y < ship.y, p[0]!.dx > 0, p[1]!.y > ship.y, p[1]!.dx < 0]).toEqual([true, true, true, true]);   // anticlockwise: the mirror
    const q = model({ vent: { x: 0, y: 0, boosted: true, turn: 1 }, axes: { turn: -1, thrust: 0 } }).puffs!;
    expect(q[0]!.dx).toBeLessThan(0);   // clockwise, whatever the axes say
  });
  it("ventOf records the boosted turn's direction, and 0 unboosted", () => {
    expect(ventOf({ turn: -1, thrust: 0, turnBoost: RCS_TURN_BOOST })).toEqual({ x: 0, y: 0, boosted: true, turn: -1 });
    expect(ventOf({ turn: 1, thrust: 0, turnBoost: 1 })).toEqual({ x: 0, y: 0, boosted: false, turn: 0 });
    expect(noVent()).toEqual({ x: 0, y: 0, boosted: false, turn: 0 });
  });
});

describe('the steering marker (spec §6)', () => {
  it('runs from the ship to the cursor while it is given', () => {
    const m = model({ steerTo: { x: 900, y: 200 } });
    expect(m.helm?.steer).toEqual({ from: { x: m.helm!.origin.x, y: m.helm!.origin.y }, to: { x: 900, y: 200 } });
    expect(model({}).helm?.steer ?? null).toBeNull();
  });
});

describe('the hiss (spec §6, Decision 12)', () => {
  it('sfx.rcs is thrusterFire_002; the thruster keeps 000 and 001', () => {
    expect(SFX.rcs).toEqual({ pack: 'sci', stem: 'thrusterFire', numbers: [2] });
    expect(SFX.thruster.numbers).toEqual([0, 1]);
    expect(sfxFiles().filter((f) => f.key === 'rcs').map((f) => f.name)).toEqual(['sfx.rcs.0']);
    expect(RCS_HISS.key).toBe('rcs');
  });
  it('plays at once when venting starts, then every RCS_HISS_GAP_S, and stops with the venting', () => {
    let s = rcsHiss(null, true, 0);
    expect(s).toEqual({ next: RCS_HISS_GAP_S, play: true });
    s = rcsHiss(s.next, true, 0.05); expect(s.play).toBe(false);
    s = rcsHiss(s.next, true, RCS_HISS_GAP_S); expect(s.play).toBe(true);
    expect(rcsHiss(s.next, false, 1)).toEqual({ next: null, play: false });
  });
});
