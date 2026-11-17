// Audio-i spec sections 4c-4d and 5: the sector's engaged rule, the jump swell and the adapter.
import { describe, it, expect } from 'vitest';
import { chargeSwell, sectorEngaged } from '../src/renderer/src/audio/sectorSounds';
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
    expect(status[0]).toEqual({ engaged: false, paused: false, duck: false, fires: 0, hum: { thrust: 0, speed: 0, charge: 0.4 } });
    s.doors.state[door] = DoorState.Open; s.tick += 1;
    a.frame(s, true, new Set<Cue>(['shot']));
    expect(sounds.map((r) => r.key)).toEqual(['doorOpen']);
    expect(status[1]).toMatchObject({ engaged: true, paused: true });
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
    expect(status[0]).toEqual({ engaged: false, paused: false, duck: false, fires: 0, hum: null });
    a.frame(s, false, none, true);
    expect(status[1]).toMatchObject({ engaged: true, hum: { charge: 0.4 } });
  });
});
