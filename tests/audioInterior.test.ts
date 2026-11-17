// Audio-i spec section 4c: doors, consoles and fire from interior state diffs.
import { describe, it, expect } from 'vitest';
import { OPEN_DOOR_STATES, interiorAudioView, interiorSounds, type InteriorAudioView } from '../src/renderer/src/audio/interiorSounds';
import { DoorState } from '../src/renderer/src/sim/grid';
import { HIT_FRESH_TICKS } from '../src/renderer/src/render/impactModel';
import { PAN_WIDTH } from '../src/renderer/src/audio/voices';
import { makeState } from './helpers/sim';

const view = (o: Partial<InteriorAudioView> = {}): InteriorAudioView => ({ tick: 5, doors: [0, 0], fire: [0, 0, 0], occupant: [-1, -1], doorPan: [-0.5, 0.5], stationPan: [0.2, -0.2], ...o });

describe('interior sounds (Audio-i spec section 4c)', () => {
  it('pins the copied door states', () => { expect(OPEN_DOOR_STATES).toEqual([DoorState.Open, DoorState.HeldOpen]); });
  it('a door opening or closing whooshes at its column; sealing and holding do not', () => {
    const w = interiorSounds(null, view()).watch;
    expect(interiorSounds(w, view({ tick: 6, doors: [DoorState.Open, 0] })).sounds).toEqual([{ key: 'doorOpen', gain: 0.6, pan: -0.5 }]);
    const open = interiorSounds(w, view({ tick: 6, doors: [0, DoorState.Open] })).watch;
    expect(interiorSounds(open, view({ tick: 7, doors: [0, DoorState.Closed] })).sounds).toEqual([{ key: 'doorClose', gain: 0.6, pan: 0.5 }]);
    expect(interiorSounds(open, view({ tick: 7, doors: [0, DoorState.HeldOpen] })).sounds).toEqual([]);
    expect(interiorSounds(w, view({ tick: 6, doors: [DoorState.Sealed, 0] })).sounds).toEqual([]);
  });
  it('sitting at a console blips at its column; standing is silent', () => {
    const w = interiorSounds(null, view()).watch;
    const sat = interiorSounds(w, view({ tick: 6, occupant: [1, -1] }));
    expect(sat.sounds).toEqual([{ key: 'console', gain: 0.5, pan: 0.2 }]);
    expect(interiorSounds(sat.watch, view({ tick: 7, occupant: [-1, -1] })).sounds).toEqual([]);
  });
  it('a room catching fire whooshes once, and the burning rooms are counted every frame', () => {
    const w = interiorSounds(null, view({ fire: [0, 2, 0] }));
    expect(w.fires).toBe(1);
    const lit = interiorSounds(w.watch, view({ tick: 6, fire: [0.1, 2, 0] }));
    expect(lit.sounds).toEqual([{ key: 'thruster', gain: 0.45, dur: 0.5, filter: { type: 'lowpass', from: 1200 } }]); expect(lit.fires).toBe(2);
    expect(interiorSounds(lit.watch, view({ tick: 7, fire: [0.3, 2, 0] })).sounds).toEqual([]);
  });
  it('re-baselines silently on no baseline, a tick backwards, a stale jump or a new layout, still counting fires', () => {
    const w = interiorSounds(null, view()).watch, busy = { doors: [1, 1], fire: [1, 0, 0], occupant: [0, 0] };
    for (const o of [{ tick: 4 }, { tick: 5 + HIT_FRESH_TICKS + 1 }, { doorPan: [0, 0, 0], doors: [1, 1, 1] }]) {
      const r = interiorSounds(w, view({ ...busy, ...o })); expect(r.sounds).toEqual([]); expect(r.fires).toBe(1);
    }
    expect(interiorSounds(null, view(busy)).sounds).toEqual([]);
  });
  it('reads a sim state: its doors, fire and stations, panned across the ship', () => {
    const s = makeState(2, 1), v = interiorAudioView(s);
    expect(v.tick).toBe(s.tick); expect(v.doors).toBe(s.doors.state); expect(v.fire).toBe(s.rooms.fire); expect(v.occupant).toBe(s.stations.occupant);
    expect(v.doorPan).toHaveLength(s.doors.state.length); expect(v.stationPan).toHaveLength(s.stations.occupant.length);
    for (const p of [...v.doorPan, ...v.stationPan]) { expect(p).toBeGreaterThanOrEqual(-PAN_WIDTH); expect(p).toBeLessThanOrEqual(PAN_WIDTH); }
    expect(interiorAudioView(s, 99).tick).toBe(99);
  });
});
