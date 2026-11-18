// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §5.1, §5.4, §9 UI): seat ids 0..n−1 in the app. A player in seat 2 has its own
// view and console station online, and its sit at Weapons is a sit (the card shows); the online source drives seat 2.
import { describe, expect, it } from 'vitest';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { consoleModel, consoleStation } from '../src/renderer/src/render/duel/consoleModel';
import { createSitTracker, resetSits, SIT_CARDS, sitCard, trackSit } from '../src/renderer/src/render/duel/sitModel';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { standAtStation } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** A crew-3 Cutter duel with player 2 sat at Weapons. */
function seat2AtWeapons(): DuelState {
  const d = createDuel(CUTTER, 5, 0, 3);
  standAtStation(d, 2, d.weapons);
  stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 2, sequence: 1 }, requestedTick: 0, command: { kind: 'sit', station: d.weapons } }] });
  return d;
}

describe('the sit tracker at n (spec §5.1)', () => {
  it('seat 2 sitting at Weapons is a sit, so the card shows; an unchanged seat is not', () => {
    resetSits();
    const tr = createSitTracker();
    expect(trackSit(tr, 2, [null, null, null])).toBe(false);
    expect(trackSit(tr, 2, [null, null, 'weapons'])).toBe(true);
    expect(trackSit(tr, 2, [null, null, 'weapons'])).toBe(false);
    expect(trackSit(tr, 0, ['helm', null, 'weapons'])).toBe(true);    // player 0's own seat went from none to the Helm: a sit
    expect(sitCard('weapons', 0, false)).toMatchObject({ seat: 'weapons', title: SIT_CARDS.weapons.title });
  });
});

describe('seat 2 online (spec §5.1)', () => {
  it('the console station and the online source follow seat 2', () => {
    const d = seat2AtWeapons();
    let replica: DuelState | null = null;
    try {
      expect(d.interior.stations.occupant[d.weapons]).toBe(2);
      expect(consoleStation(d, 2)).toBe('weapons');
      expect(consoleModel({ duel: d, me: 2, mode: 'online', hidden: false, held: NO_HELD_FLAGS, overlay: null })!.station).toBe('weapons');
      replica = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      const client = { state: () => replica, publication: () => ({ publicationSequence: 1, tick: d.interior.tick, phase: 'running' }) };
      const source = createOnlineDuelSource({ client: client as never, seat: 2, now: () => 0, viewport: { w: 1280, h: 720 } });
      source.frame(1 / 60, null, null);
      expect([source.active(), source.view()]).toEqual([2, 'weapons']);
    } finally { disposeDuel(d); if (replica) disposeDuel(replica); }
  });
});
