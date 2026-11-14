import { fixtureCouchViewer } from './helpers/cardUi';
import { describe, it, expect } from 'vitest';
import { calloutFor, pressCallouts, bubbles, flashingKinds, CALLOUT_SECONDS, type Callout } from '../src/renderer/src/render/calloutModel';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { createDeviceManager, type SourceSample } from '../src/renderer/src/input/deviceManager';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation, baseMax } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import { downCrew } from '../src/renderer/src/sim/crew';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, room, teleport } from './helpers/sim';

const T = TICK_HZ;
const calm = (n = 2) => { const s = makeState(n); quiet(s); s.tick = 1000; return s; };

describe('callout text (spec Coop-i section 3)', () => {
  it('seated at a station below its maximum power: Power to <Station>!, and that station kind flashes', () => {
    const s = calm(), w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w);
    expect(s.stations.level[w]!).toBeLessThan(baseMax(s, StationKind.Weapons));
    expect(calloutFor(s, 0)).toEqual({ text: 'Power to Weapons!', icon: 'icon.power', flash: StationKind.Weapons });
    const sc = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 1, sc); s.stations.level[sc] = baseMax(s, StationKind.Science);
    expect(calloutFor(s, 1)).toEqual({ text: 'Over here!', icon: null, flash: null });   // at full power there is nothing to ask for
  });
  it('standing next to a fire, a breach or a failed station; otherwise Over here!', () => {
    const s = calm();
    expect(calloutFor(s, 0)).toEqual({ text: 'Over here!', icon: null, flash: null });
    igniteRoom(s, room(s, 'G')); teleport(s, 0, 3.5, 9.5);
    expect(calloutFor(s, 0)).toEqual({ text: 'Fire here!', icon: 'icon.fire', flash: null });
    const b = calm(); activateBreach(b, 6); teleport(b, 0, 2.5, 10.5);
    expect(calloutFor(b, 0)).toEqual({ text: 'Breach here!', icon: 'icon.breach', flash: null });
    const p = calm(), eng = p.derived.stationOfKind[StationKind.Engineering]!; failStation(p, eng); teleport(p, 0, 18.5, 9.5);
    expect(calloutFor(p, 0)).toEqual({ text: 'Repair here!', icon: 'icon.repair', flash: null });
  });
  it('a downed crew member calls Help!', () => {
    const s = calm(); downCrew(s, 1);
    expect(calloutFor(s, 1).text).toBe('Help!');
  });
});

describe('bubbles and the Engineering flash', () => {
  it('a press shows a bubble for CALLOUT_SECONDS; a later press replaces it; the text is fixed at the press', () => {
    const s = calm(); let c: Callout[] = [];
    c = pressCallouts(c, s, [0]);
    expect(bubbles(s, c, s.tick)).toEqual([{ pid: 0, text: 'Over here!', icon: null }]);
    expect(bubbles(s, c, s.tick + CALLOUT_SECONDS * T - 1)).toHaveLength(1);
    expect(bubbles(s, c, s.tick + CALLOUT_SECONDS * T)).toEqual([]);
    igniteRoom(s, room(s, 'G')); teleport(s, 0, 3.5, 9.5);
    expect(bubbles(s, c, s.tick)[0]!.text).toBe('Over here!');
    s.tick += 30; c = pressCallouts(c, s, [0]);
    expect(c.filter((x) => x.pid === 0)).toHaveLength(1); expect(bubbles(s, c, s.tick)[0]!.text).toBe('Fire here!');
  });
  it('a downed player shows Help! with no press, and only while downed; the dead show nothing', () => {
    const s = calm(3); downCrew(s, 2);
    expect(bubbles(s, [], s.tick)).toEqual([{ pid: 2, text: 'Help!', icon: 'icon.medical' }]);
    Life.state[s.crew[2]!] = LifeState.Dead; expect(bubbles(s, [], s.tick)).toEqual([]);
  });
  it('the Power callout flashes its row on the Engineering card for the same 3 s; the HUD model carries the kinds', () => {
    const s = calm(), w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w);
    const c = pressCallouts([], s, [0, 1]);
    expect(flashingKinds(c, s.tick)).toEqual([StationKind.Weapons]);
    expect(flashingKinds(c, s.tick + CALLOUT_SECONDS * T)).toEqual([]);
    const slots = [{ status: 'active' as const, key: 'kb:0' }, { status: 'active' as const, key: 'kb:1' }];
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots, phase: 'running', message: '', credits: null, progress: null, calloutFlash: flashingKinds(c, s.tick) }).calloutFlash).toEqual([StationKind.Weapons]);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots, phase: 'running', message: '' }).calloutFlash).toEqual([]);
  });
});

describe('the callout button reaches the app, never the sim', () => {
  const smp = (key: string, o: Partial<SourceSample> = {}): SourceSample => ({ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, any: false, ...o });
  it('the device manager reports callout press edges per slot, held or counted, outside the input frames', () => {
    const dm = createDeviceManager(2);
    dm.update([smp('gp:0', { interact: true })], true);
    let r = dm.update([smp('gp:0', { callout: true, any: true })], false);
    expect(r.callouts).toEqual([1, 0]); expect(Object.keys(r.frames[0]!).sort()).toEqual(['cancelPresses', 'confirmPresses', 'interactHeld', 'interactPresses', 'moveX', 'moveY']);
    r = dm.update([smp('gp:0', { callout: true, any: true })], false); expect(r.callouts).toEqual([1 - 1, 0]);   // held, not a new edge
    const kb = createDeviceManager(2);
    kb.update([smp('kb:0', { interact: true, presses: { interact: 1, confirm: 0, cancel: 0, any: 1 } })], true);
    r = kb.update([smp('kb:0', { presses: { interact: 0, confirm: 0, cancel: 0, any: 1, callout: 2 } })], false); expect(r.callouts).toEqual([2, 0]);
  });
  it('a lobby callout press joins nobody', () => {
    const dm = createDeviceManager(2);
    const r = dm.update([smp('kb:0', { presses: { interact: 0, confirm: 0, cancel: 0, any: 0, callout: 1 } })], true);
    expect(r.joinedCount).toBe(0);
  });
});
