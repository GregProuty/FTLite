// Sci-1 (spec 2026-11-17-science-scans §5, §6.1): the three duel commands on the wire, their admission order and
// reasons against the seats, what a scan command does to the scanner, and the Science seat. Task 4 adds the progress.
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { Position } from '../src/renderer/src/sim/components';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { DUEL_NOT_SNAPSHOTTED } from '../src/renderer/src/sim/duel/modules';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { scanCommand } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../src/renderer/src/sim/tactical/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [NONE, NONE], commands });
const reasons = (r: ReturnType<typeof step>) => r.map((x) => [x.id.player, x.reason ?? x.status]);
/** A fresh duel (both standing) with each player seated where `seats` says (a station index, or −1 to stay standing). */
function seated(seats: [number | 'nav' | 'weapons' | 'science' | -1, number | 'nav' | 'weapons' | 'science' | -1]): DuelState {
  const d = createDuel(CUTTER, 5);
  seats.forEach((s, pid) => { if (s !== -1) sitDown(d.interior, pid, typeof s === 'number' ? s : d[s]); });
  return d;
}

describe('the Science seat (spec §6.1)', () => {
  it('DuelState.science is the layout\'s Science console, declared not snapshotted', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(d.science).toBe(d.interior.derived.stationOfKind[StationKind.Science]);
      expect(d.science).toBeGreaterThanOrEqual(0);
      expect(DUEL_NOT_SNAPSHOTTED.science).toBe('the Science station index, from the layout');
    } finally { disposeDuel(d); }
  });
  it('a standing player in reach sits at Science; any other non-role console is still not-in-duel', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const tile = d.interior.derived.stationTile[d.science]!, W = d.interior.derived.width, eid = d.interior.crew[1]!;
      Position.x[eid] = (tile % W) + 0.5; Position.y[eid] = Math.floor(tile / W) + 0.5;
      expect(step(d, [cmd(d, 1, { kind: 'sit', station: d.science })]).map((r) => r.status)).toEqual(['applied']);
      expect(d.interior.stations.occupant[d.science]).toBe(1);
      const medbay = d.interior.derived.stationOfKind[StationKind.Medbay]!;
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: medbay })])[0]).toMatchObject({ status: 'rejected', reason: 'not-in-duel' });
    } finally { disposeDuel(d); }
  });
});

describe('laserFrequency (spec §5)', () => {
  it('stale-tick, then not-at-weapons, then malformed, then noop; the last applied wins', () => {
    const d = seated(['nav', 'weapons']);
    try {
      const r = step(d, [
        cmd(d, 1, { kind: 'laserFrequency', freq: 1 }, d.interior.tick + 1),
        cmd(d, 0, { kind: 'laserFrequency', freq: 1 }),
        cmd(d, 1, { kind: 'laserFrequency', freq: 3 }), cmd(d, 1, { kind: 'laserFrequency', freq: -1 }), cmd(d, 1, { kind: 'laserFrequency', freq: 0.5 }),
        cmd(d, 1, { kind: 'laserFrequency', freq: 0 }),
        cmd(d, 1, { kind: 'laserFrequency', freq: 2 }), cmd(d, 1, { kind: 'laserFrequency', freq: 1 })
      ]);
      expect(reasons(r)).toEqual([[0, 'not-at-weapons'], [1, 'stale-tick'], [1, 'malformed'], [1, 'malformed'], [1, 'malformed'], [1, 'noop'], [1, 'applied'], [1, 'applied']]);
      expect(d.tactical.systems.map((y) => y.freq)).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('designate (spec §5)', () => {
  it('stale-tick, then invalid-seat (only the Science attendant), then malformed, then noop; the last applied wins', () => {
    const d = seated(['nav', 'science']);
    try {
      const r = step(d, [
        cmd(d, 1, { kind: 'designate', contact: 0 }, d.interior.tick + 1),
        cmd(d, 0, { kind: 'designate', contact: 0 }),
        cmd(d, 1, { kind: 'designate', contact: 2 }), cmd(d, 1, { kind: 'designate', contact: -2 }),
        cmd(d, 1, { kind: 'designate', contact: -1 }),
        cmd(d, 1, { kind: 'designate', contact: 1 }), cmd(d, 1, { kind: 'designate', contact: 0 })
      ]);
      expect(reasons(r)).toEqual([[0, 'invalid-seat'], [1, 'stale-tick'], [1, 'malformed'], [1, 'malformed'], [1, 'noop'], [1, 'applied'], [1, 'applied']]);
      expect(d.tactical.designated).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('an away Science player is invalid-seat', () => {
    const d = seated(['nav', 'science']);
    try {
      step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
      expect(step(d, [cmd(d, 1, { kind: 'designate', contact: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      expect(d.tactical.designated).toBe(-1);
    } finally { disposeDuel(d); }
  });
});

describe('contactScan (spec §5)', () => {
  it('stale-tick, then invalid-seat (standing), then malformed, then unavailable (fully known)', () => {
    const d = seated(['science', -1]);
    try {
      d.tactical.known = [2, 0];
      const r = step(d, [
        cmd(d, 1, { kind: 'contactScan', contact: 0 }, d.interior.tick + 1),
        cmd(d, 1, { kind: 'contactScan', contact: 1 }),
        cmd(d, 0, { kind: 'contactScan', contact: 2 }), cmd(d, 0, { kind: 'contactScan', contact: -1 }),
        cmd(d, 0, { kind: 'contactScan', contact: 0 }),
        cmd(d, 0, { kind: 'contactScan', contact: 1 })
      ]);
      expect(reasons(r)).toEqual([[0, 'malformed'], [0, 'malformed'], [0, 'unavailable'], [0, 'applied'], [1, 'stale-tick'], [1, 'invalid-seat']]);
      expect(d.tactical.scan).toMatchObject({ contact: 1, level: 1, rate: SCAN_RATE_SCIENCE, by: d.science });   // progress is Task 4's (scanStep runs in the admitting tick)
    } finally { disposeDuel(d); }
  });
  it('starts at the sender\'s station and rate: the Helm and Weapons at 2, Science at 5', () => {
    for (const [seat, rate] of [['nav', SCAN_RATE_OTHER], ['weapons', SCAN_RATE_OTHER], ['science', SCAN_RATE_SCIENCE]] as const) {
      const d = seated([seat, -1]);
      try {
        expect(step(d, [cmd(d, 0, { kind: 'contactScan', contact: 0 })])[0]!.status).toBe('applied');
        expect(d.tactical.scan).toMatchObject({ contact: 0, level: 1, rate, by: d[seat] });   // progress is Task 4's
      } finally { disposeDuel(d); }
    }
  });
  it('a decided round answers all three duel-decided', () => {
    const d = seated(['weapons', 'science']);
    try {
      d.tactical.systems[1].hull = 0; step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      const r = step(d, [cmd(d, 0, { kind: 'laserFrequency', freq: 1 }), cmd(d, 1, { kind: 'designate', contact: 1 }), cmd(d, 1, { kind: 'contactScan', contact: 0 })]);
      expect(r.map((x) => x.reason)).toEqual(['duel-decided', 'duel-decided', 'duel-decided']);
    } finally { disposeDuel(d); }
  });
});

describe('scanCommand (spec §5): what an admitted scan does to the scanner', () => {
  it('starts idle; a repeat keeps the progress (noop); a faster station takes over; a slower never; the other contact aborts', () => {
    const t = createTacticalState(5);
    expect(scanCommand(t, 0, SCAN_RATE_OTHER, 7)).toBe('applied');
    expect(t.scan).toEqual({ contact: 0, level: 1, progress: 0, rate: 2, by: 7 });
    t.scan.progress = 100;
    expect(scanCommand(t, 0, SCAN_RATE_OTHER, 9)).toBe('noop');
    expect(t.scan).toEqual({ contact: 0, level: 1, progress: 100, rate: 2, by: 7 });
    expect(scanCommand(t, 0, SCAN_RATE_SCIENCE, 3)).toBe('applied');
    expect(t.scan).toEqual({ contact: 0, level: 1, progress: 100, rate: 5, by: 3 });
    expect(scanCommand(t, 0, SCAN_RATE_OTHER, 7)).toBe('noop');
    expect(scanCommand(t, 1, SCAN_RATE_OTHER, 7)).toBe('applied');
    expect(t.scan).toEqual({ contact: 1, level: 1, progress: 0, rate: 2, by: 7 });
    t.known[0] = 1;
    expect(scanCommand(t, 0, SCAN_RATE_SCIENCE, 3)).toBe('applied');
    expect(t.scan).toEqual({ contact: 0, level: 2, progress: 0, rate: 5, by: 3 });
  });
});

describe('the three commands on the wire (spec §5)', () => {
  it('round-trip any integer and refuse a missing, non-integer or non-numeric value, or an extra key', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const c of [{ kind: 'contactScan', contact: 0 }, { kind: 'contactScan', contact: 7 }, { kind: 'designate', contact: -1 }, { kind: 'laserFrequency', freq: 2 }])
      expect(codec.decodeMessage(codec.encodeMessage(envelope(c)))).toEqual(envelope(c));
    for (const bad of [{ kind: 'contactScan' }, { kind: 'contactScan', contact: 0.5 }, { kind: 'designate', contact: '1' }, { kind: 'laserFrequency', freq: 1, extra: 1 }, { kind: 'laserFrequency', freq: Infinity }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});
