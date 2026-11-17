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

function recorder() {
  const sounds: SoundRequest[] = [], cues: string[] = [], status: AudioStatus[] = [];
  const out: AudioOut = { play: (c) => { cues.push(c); }, sounds: (l) => { sounds.push(...l); }, status: (s) => { status.push(s); } };
  return { out, sounds, cues, status };
}

describe('the duel audio adapter (Audio-i spec section 4)', () => {
  it('reports engaged while the round runs, the hum, the fires and the duck, and plays the round-end cue', () => {
    const d = createDuel(parseShip(hound), 1), r = recorder(), a = createDuelAudio(r.out);
    try {
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 1 }, paused: false, pan: () => 0 });
      expect(r.status[0]).toMatchObject({ engaged: true, paused: false, duck: false, fires: 0, hum: { thrust: 1, charge: 0 } });
      d.interior.rooms.fire[0] = 1; d.tactical.tick += 1;
      a.frame({ duel: d, events: [{ kind: 'laser', ship: 1, hit: true, stripped: false, room: 0, x1: 0, y1: 0, x2: 0, y2: 0 }], axes: { turn: 0, thrust: 0 }, paused: true, pan: () => 0 });
      expect(r.status[1]).toMatchObject({ engaged: true, paused: true, duck: true, fires: 1, hum: { thrust: 0 } });
      expect(r.sounds.map((s) => s.key)).toEqual(['laserLarge', 'impactMetal', 'lowBoom', 'thruster']);
      d.tactical.outcome = Outcome.CrewWins; d.tactical.tick += 1;
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: false, pan: () => 0 });
      expect(r.cues).toEqual(['victory']); expect(r.status[2]!.engaged).toBe(false);
      a.reset(); d.tactical.tick += 1; d.interior.rooms.fire[1] = 1;
      a.frame({ duel: d, events: [], axes: { turn: 0, thrust: 0 }, paused: false, pan: () => 0 });
      expect(r.sounds).toHaveLength(4);   // after reset the next frame is a fresh baseline
    } finally { disposeDuel(d); }
  });
});
