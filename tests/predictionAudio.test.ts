// Net-4a §3.6: the audio's one-shot watchers (the outcome's cue, a torpedo's launch) read the confirmed state; a
// prediction that decides the round early plays nothing until the confirmed state does.
import { describe, expect, it } from 'vitest';
import { createDuelAudio } from '../src/renderer/src/app/duel/duelAudio';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { NO_AXES, Outcome } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
describe('one-shot sounds from the confirmed state (Net-4a §3.6)', () => {
  it('the victory cue waits for the confirmed outcome, not the predicted one', () => {
    const c = createSeatedDuel(CUTTER, 3), p = loadDuelSnapshot(CUTTER, saveDuelSnapshot(c, DIGEST), DIGEST);
    const cues: string[] = [], audio = createDuelAudio({ play: (cue) => cues.push(cue), sounds() {}, status() {} });
    const life = { health: [100, 100], downed: [false, false] };
    const frame = () => audio.frame({ duel: p, confirmed: c, events: [], axes: NO_AXES, paused: false, pan: () => 0, me: 0, crew: life, confirmedCrew: life, dt: 1 / 60 });
    try {
      frame();
      stepDuelTick(p, { held: [], commands: [] }); stepDuelTick(c, { held: [], commands: [] });
      p.tactical.outcome = Outcome.CrewWins; frame();
      expect(cues).toEqual([]);
      c.tactical.outcome = Outcome.CrewWins; frame();
      expect(cues).toEqual(['victory']);
    } finally { disposeDuel(c); disposeDuel(p); }
  });
});
