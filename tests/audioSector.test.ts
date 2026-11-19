// Audio-i spec sections 4c-4d and 5: the sector's engaged rule, the jump swell and the adapter.
import { describe, it, expect } from 'vitest';
import { ADVENTURE_TICKS, chargeSwell, sectorEngaged, sectorMood } from '../src/renderer/src/audio/sectorSounds';
import { createSectorAudio } from '../src/renderer/src/app/sectorAudio';
import type { AudioOut } from '../src/renderer/src/app/audio';
import type { AudioStatus } from '../src/renderer/src/audio/musicState';
import type { SoundRequest } from '../src/renderer/src/audio/soundBank';
import type { Cue } from '../src/renderer/src/events/audioCues';
import { DoorState } from '../src/renderer/src/sim/grid';
import { makeState } from './helpers/sim';

const none = new Set<Cue>();

describe('the sector rules (Audio-i spec section 5)', () => {
  it('is engaged with an enemy present, a boarder aboard, or a combat cue this frame', () => {
    const s = makeState(2, 1);
    expect(sectorEngaged(s, none)).toBe(false);
    expect(sectorEngaged(s, new Set<Cue>(['alarm', 'ready']))).toBe(false);
    for (const c of ['shot', 'hit', 'impact'] as const) expect(sectorEngaged(s, new Set<Cue>([c]))).toBe(true);
    s.enemy.present = 1; expect(sectorEngaged(s, none)).toBe(true); s.enemy.present = 0;
    s.boarders.active[0] = 1; expect(sectorEngaged(s, none)).toBe(true);
  });
  it('picks the mood: combat, then intrigue, then adventure, then calm at an arrival beacon, else space (music spike)', () => {
    const s = makeState(2, 1);
    expect(s.run.calm).toBe(1); expect(sectorMood(s, none, 0)).toBe('calm');   // the peaceful start
    s.run.calm = 0; expect(sectorMood(s, none, 0)).toBe('space');
    s.run.arrivalTick = 100; s.tick = 100 + ADVENTURE_TICKS - 1; expect(sectorMood(s, none, 0)).toBe('adventure');
    s.tick = 100 + ADVENTURE_TICKS; expect(sectorMood(s, none, 0)).toBe('space');
    s.run.jumpPending = 2; expect(sectorMood(s, none, 0)).toBe('adventure');
    s.run.ambushState = 1; expect(sectorMood(s, none, 0)).toBe('adventure');   // a hidden ambusher never changes the music
    for (const set of [() => { s.run.ambushState = 2; }, () => { s.run.event = 0; }, () => { s.run.encounter = 1; }, () => { s.science.scanning = 1; }]) {
      s.run.ambushState = 0; s.run.event = -1; s.run.encounter = 0; s.science.scanning = 0;
      set(); expect(sectorMood(s, none, 0)).toBe('intrigue');
    }
    expect(sectorMood(s, none, 1)).toBe('combat');   // a room on fire
    expect(sectorMood(s, new Set<Cue>(['impact']), 0)).toBe('combat');
    s.run.encounter = 2; expect(sectorMood(s, none, 0)).toBe('combat');
    s.run.encounter = 0; s.enemy.present = 1; expect(sectorMood(s, none, 0)).toBe('combat');
  });
  it('swells the hum while the drive charges and drops it once ready', () => {
    expect([0, 0.5, 0.99, 1, Number.NaN].map(chargeSwell)).toEqual([0, 0.5, 0.99, 0, 0]);
  });
});

describe('the sector audio adapter (Audio-i spec section 4c)', () => {
  it('plays a door opening, and reports the music and the hum each frame', () => {
    const sounds: SoundRequest[] = [], status: AudioStatus[] = [];
    const out: AudioOut = { play() {}, sounds: (l) => { sounds.push(...l); }, status: (st) => { status.push(st); } };
    const s = makeState(2, 1), a = createSectorAudio(out), door = s.derived.doorEdges[0]!;
    s.doors.state[door] = DoorState.Closed; s.run.jumpCharge = 0.4;
    a.frame(s, false, none);
    expect(status[0]).toEqual({ mood: 'calm', paused: false, duck: false, fires: 0, hum: { thrust: 0, speed: 0, charge: 0.4 } });
    s.doors.state[door] = DoorState.Open; s.tick += 1;
    a.frame(s, true, new Set<Cue>(['shot']));
    expect(sounds.map((r) => r.key)).toEqual(['doorOpen']);
    expect(status[1]).toMatchObject({ mood: 'combat', paused: true });
    a.reset(); s.doors.state[door] = DoorState.Closed; s.tick += 1;
    a.frame(s, false, none);
    expect(sounds).toHaveLength(1);   // reset: a fresh baseline, no replay
  });
  it('reports no battle, hum or crackle from a frozen copy (the connection lost)', () => {
    const status: AudioStatus[] = [];
    const out: AudioOut = { play() {}, sounds() {}, status: (st) => { status.push(st); } };
    const s = makeState(2, 1), a = createSectorAudio(out);
    s.enemy.present = 1; s.run.jumpCharge = 0.4;
    a.frame(s, false, new Set<Cue>(['shot']), false);
    expect(status[0]).toEqual({ mood: 'calm', paused: false, duck: false, fires: 0, hum: null });
    a.frame(s, false, none, true);
    expect(status[1]).toMatchObject({ mood: 'combat', hum: { charge: 0.4 } });
  });
});
