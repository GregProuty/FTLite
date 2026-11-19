// Audio-i spec section 4: the duel adapter over a real duel state.
import { describe, it, expect } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createDuelAudio } from '../src/renderer/src/app/duel/duelAudio';
import type { AudioOut } from '../src/renderer/src/app/audio';
import type { AudioStatus } from '../src/renderer/src/audio/musicState';
import type { SoundRequest } from '../src/renderer/src/audio/soundBank';

/** A frame's local player and crew at full health (duel polish i spec §C). */
const OK = { me: 0, crew: { health: [100, 100], downed: [false, false] }, dt: 1 / 60 };
function recorder() {
  const sounds: SoundRequest[] = [], cues: string[] = [], status: AudioStatus[] = [];
  const out: AudioOut = { play: (c) => { cues.push(c); }, sounds: (l) => { sounds.push(...l); }, status: (s) => { status.push(s); } };
  return { out, sounds, cues, status };
}

describe('the duel audio adapter (Audio-i spec section 4)', () => {
  it('reports engaged while the round runs, the hum, the fires and the duck, and plays the round-end cue', () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    try {
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 1 }, paused: false, pan: () => 0, ...OK, hostile: false });
      expect(r.status[0]).toMatchObject({ engaged: false, paused: false, duck: false, fires: 0, hum: { thrust: 1, charge: 0 } });   // calm through the Hunter's grace
      d.interior.rooms.fire[0] = 1; d.tactical.tick += 1;
      a.frame({ duel: d, events: [{ kind: 'laser', ship: 1, hit: true, stripped: false, room: 0, x1: 0, y1: 0, x2: 0, y2: 0 }], axes: { turn: 0, thrust: 0 }, paused: true, pan: () => 0, ...OK });
      expect(r.status[1]).toMatchObject({ engaged: true, paused: true, duck: true, fires: 1, hum: { thrust: 0 } });
      expect(r.sounds.map((s) => s.key)).toEqual(['laserLarge', 'impactMetal', 'lowBoom', 'thruster', 'alarm', 'alarm']);   // the fire alarm (duel polish i spec §C)
      d.tactical.outcome = Outcome.CrewWins; d.tactical.tick += 1;
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: false, pan: () => 0, ...OK });
      expect(r.cues).toEqual(['victory']); expect(r.status[2]!.engaged).toBe(false);
      a.reset(); d.tactical.tick += 1; d.interior.rooms.fire[1] = 1;
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: false, pan: () => 0, ...OK });
      expect(r.sounds).toHaveLength(6);   // after reset the next frame is a fresh baseline
    } finally { disposeDuel(d); }
  });
  it('reports no battle, hum or crackle from a frozen view (a lost online link)', () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    try {
      d.interior.rooms.fire[0] = 1;
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 1 }, paused: false, pan: () => 0, ...OK, live: false });
      expect(r.status[0]).toEqual({ engaged: false, paused: false, duck: false, fires: 0, hum: null });
      d.tactical.tick += 1;
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 1 }, paused: false, pan: () => 0, ...OK, live: true });
      expect(r.status[1]).toMatchObject({ engaged: true, fires: 1, hum: { thrust: 1 } });
    } finally { disposeDuel(d); }
  });
  it("the lock tone's steady tone does not repeat after a frozen or paused frame (Feel-ii §2.5)", () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    try {
      const torpedo = { locked: true, distance: 300, range: 360, target: 2 };
      const frame = (o: { live?: boolean; paused?: boolean }) => { d.tactical.tick += 1; a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: o.paused ?? false, pan: () => 0, ...OK, torpedo, ...(o.live === undefined ? {} : { live: o.live }) }); };
      frame({}); frame({ live: false }); frame({}); frame({ paused: true }); frame({});
      expect(r.sounds.filter((s) => s.key === 'jumpCharge')).toHaveLength(1);
    } finally { disposeDuel(d); }
  });
  it('the cold gas hiss plays only on a live, unpaused frame that vents (playtest2feedback §6, final review)', () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    try {
      const vent = { x: 1, y: 0, boosted: false, turn: 0 };
      const hisses = (): number => r.sounds.filter((s) => s.key === 'rcs').length;
      const frame = (o: { live?: boolean; paused?: boolean; vent?: typeof vent }) => { d.tactical.tick += 1; a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: o.paused ?? false, pan: () => 0, ...OK, ...(o.vent ? { vent: o.vent } : {}), ...(o.live === undefined ? {} : { live: o.live }) }); };
      frame({ vent }); expect(hisses()).toBe(1);   // venting starts: at once
      frame({ vent, paused: true }); expect(hisses()).toBe(1);   // paused: silent
      frame({ vent, live: false }); expect(hisses()).toBe(1);   // a frozen online copy: silent
      frame({ vent, live: true }); expect(hisses()).toBe(2);   // live again: a fresh start plays at once
      frame({}); frame({ vent: { x: 0, y: 0, boosted: true, turn: 1 } }); expect(hisses()).toBe(3);   // a boosted turn hisses too
      frame({ vent: { x: 0, y: 0, boosted: false, turn: 0 } }); frame({ vent: { x: 0, y: 0, boosted: false, turn: 0 } }); expect(hisses()).toBe(3);   // nothing vented: none
    } finally { disposeDuel(d); }
  });
  it('the hum thrust follows the magnitude of the axes thrust (a quarter throttle hums a quarter)', () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    try {
      for (const thrust of [0.25, -0.5, 1, 0, NaN]) a.frame({ duel: d, events: [], axes: { turn: 0, thrust }, paused: false, pan: () => 0, ...OK });
      expect(r.status.map((s) => s.hum?.thrust)).toEqual([0.25, 0.5, 1, 0, 0]);
    } finally { disposeDuel(d); }
  });
  it('trouble cues (duel polish i spec §C): the fire alarm once a second, downed and revived, the local heartbeat', () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    const frame = (o: { paused?: boolean; me?: number; health?: number[]; downed?: boolean[]; dt?: number } = {}) => {
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: o.paused ?? false, pan: () => 0, me: o.me ?? 0, dt: o.dt ?? 0.1,
        crew: { health: o.health ?? [100, 100], downed: o.downed ?? [false, false] } });
      d.tactical.tick += 1;
    };
    const keys = () => { const k = r.sounds.map((s) => s.key); r.sounds.length = 0; return k; };
    try {
      frame(); expect(keys()).toEqual([]);
      d.interior.rooms.fire[0] = 1; frame();
      expect(keys()).toEqual(['thruster', 'alarm', 'alarm']);
      d.interior.rooms.fire[1] = 1; frame();
      expect(keys()).toEqual(['thruster']);   // 0.1 s later: no second alarm
      frame({ downed: [false, true], health: [100, 0] }); expect(r.cues).toEqual(['alarm']);
      frame({ downed: [false, false], health: [100, 1] }); expect(r.cues).toEqual(['alarm', 'ready']);
      keys();
      frame({ health: [100, 10] }); expect(keys()).toEqual([]);   // the other character's low health is not ours
      frame({ health: [100, 10], me: 1 }); expect(r.sounds).toEqual([{ key: 'lowBoom', gain: 0.35, pan: 0, filter: { type: 'lowpass', from: 400 } }]); keys();
      frame({ health: [100, 10], me: 1 }); expect(keys()).toEqual([]);   // 0.1 s later
      for (let k = 0; k < 7; k++) frame({ health: [100, 10], me: 1 });
      expect(keys()).toEqual(['lowBoom']);   // 0.8 s after the first beat
      frame({ health: [100, 10], me: 1, paused: true }); frame({ health: [100, 30], me: 1 }); expect(keys()).toEqual([]);
    } finally { disposeDuel(d); }
  });
});
