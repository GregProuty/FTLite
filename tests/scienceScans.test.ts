// Sci-1 (spec 2026-11-17-science-scans §4.3, §4.6, §10 Scans): scan progress through the duel step: the exact times from
// each console, a repeat, a faster seat taking over (also in the tick the slower seat's player stands), switching
// contacts, leaving or going away from the seat, known and scanDone.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { scanStep } from '../src/renderer/src/sim/tactical/science';
import { Contact, createTacticalState, idleScan } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [NONE, NONE], commands });
const scan = (contact: number): DuelCommand => ({ kind: 'contactScan', contact });
/** A fresh duel with player 0 at `a` and player 1 at `b`; the crew hull is huge so the long timing runs cannot end the round. */
function crew(a: 'nav' | 'weapons' | 'science', b: 'nav' | 'weapons' | 'science'): DuelState {
  const d = createDuel(CUTTER, 5);
  sitDown(d.interior, 0, d[a]); sitDown(d.interior, 1, d[b]);
  d.tactical.systems[0].hull = 10_000;
  return d;
}
/** Send `contactScan` from pid, then step until `known[contact]` reaches `level`; the steps taken, the admitting one included. */
function stepsToKnow(d: DuelState, pid: number, contact: 0 | 1, level: number): number {
  step(d, [cmd(d, pid, scan(contact))]);
  let n = 1;
  while (d.tactical.known[contact] !== level) { step(d); n++; if (n > 2000) throw new Error('the scan never finished'); }
  return n;
}

describe('scan times (spec §4.3)', () => {
  it('from Science: Level 1 in 180 steps and Level 2 in 360, each with one scanDone in its last step; then unavailable', () => {
    const d = crew('nav', 'science');
    try {
      expect(stepsToKnow(d, 1, Contact.Enemy, 1)).toBe(180);
      expect(d.tactical.events.filter((e) => e.kind === 'scanDone')).toEqual([{ kind: 'scanDone', contact: 0, level: 1 }]);
      expect(d.tactical.scan).toEqual(idleScan());
      expect(stepsToKnow(d, 1, Contact.Enemy, 2)).toBe(360);
      expect(stepsToKnow(d, 1, Contact.Derelict, 1)).toBe(180);
      expect(d.tactical.known).toEqual([2, 1]);
      expect(step(d, [cmd(d, 1, scan(0)), cmd(d, 1, scan(1))]).map((r) => r.reason)).toEqual(['unavailable', 'unavailable']);
    } finally { disposeDuel(d); }
  });
  it('from the Helm: Level 1 in 450 steps and Level 2 in 900; from Weapons the derelict in 450', () => {
    const d = crew('nav', 'weapons');
    try {
      expect(stepsToKnow(d, 0, Contact.Enemy, 1)).toBe(450);
      expect(stepsToKnow(d, 0, Contact.Enemy, 2)).toBe(900);
      expect(stepsToKnow(d, 1, Contact.Derelict, 1)).toBe(450);
    } finally { disposeDuel(d); }
  });
});

describe('who runs the scan (spec §4.3, §5)', () => {
  it('a repeat on the same contact and level is noop and keeps the progress', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 1, scan(0))]);
      for (let k = 1; k < 50; k++) step(d);
      expect(d.tactical.scan.progress).toBe(250);
      expect(step(d, [cmd(d, 1, scan(0))])[0]!.status).toBe('noop');
      expect(d.tactical.scan.progress).toBe(255);
    } finally { disposeDuel(d); }
  });
  it('a faster seat takes the scan over at its rate and station, keeping the progress', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 0, scan(0))]);
      for (let k = 1; k < 100; k++) step(d);
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 200, rate: 2, by: d.nav });
      expect(step(d, [cmd(d, 1, scan(0))])[0]!.status).toBe('applied');
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 205, rate: 5, by: d.science });
      let n = 0;
      while (d.tactical.known[0] === 0) { step(d); n++; }
      expect(n).toBe(139);
    } finally { disposeDuel(d); }
  });
  it('the Helm player stands while Science takes over in the same tick: the scan continues at Science\'s rate', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 0, scan(0))]);
      for (let k = 1; k < 100; k++) step(d);
      expect(step(d, [cmd(d, 0, { kind: 'stand' }), cmd(d, 1, scan(0))]).map((r) => r.status)).toEqual(['applied', 'applied']);
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 205, rate: 5, by: d.science });
    } finally { disposeDuel(d); }
  });
  it('the scanning seat emptied (a stand, or going away) cancels the scan in that tick; its progress is lost', () => {
    for (const leave of [{ kind: 'stand' }, { kind: 'presence', present: false }] as const) {
      const d = crew('nav', 'science');
      try {
        step(d, [cmd(d, 1, scan(1))]);
        for (let k = 1; k < 30; k++) step(d);
        step(d, [cmd(d, 1, leave)]);
        expect(d.tactical.scan, leave.kind).toEqual(idleScan());
        expect(d.tactical.known).toEqual([0, 0]);
      } finally { disposeDuel(d); }
    }
  });
  it('a scan of the other contact aborts this one; its first progress step is in the admitting tick', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 1, scan(0))]);
      for (let k = 1; k < 50; k++) step(d);
      step(d, [cmd(d, 1, scan(1))]);
      expect(d.tactical.scan).toEqual({ contact: 1, level: 1, progress: 5, rate: 5, by: d.science });
      expect(d.tactical.known).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('scanStep (spec §4.3)', () => {
  it('idle does nothing; an unattended scanner goes idle; otherwise it advances and finishes at its level\'s units', () => {
    const t = createTacticalState(5);
    scanStep(t, false); expect(t.scan).toEqual(idleScan());
    t.scan = { contact: 1, level: 1, progress: 895, rate: 5, by: 3 };
    scanStep(t, true);
    expect([t.known, t.scan, t.events]).toEqual([[0, 1], idleScan(), [{ kind: 'scanDone', contact: 1, level: 1 }]]);
    t.events = []; t.scan = { contact: 0, level: 1, progress: 10, rate: 2, by: 0 };
    scanStep(t, false);
    expect([t.scan, t.events]).toEqual([idleScan(), []]);
  });
});

describe('crew.scanner through the duel step (spec §4.6, §10)', () => {
  it('a Helm scan advances; the Helm player standing idles it that tick; standing while Science scans keeps it at the Science rate', () => {
    const d = crew('nav', 'science');
    try {
      step(d, [cmd(d, 0, scan(0))]);
      for (let k = 1; k < 20; k++) step(d);
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 40, rate: 2, by: d.nav });
      step(d, [cmd(d, 0, { kind: 'stand' })]);
      expect(d.tactical.scan).toEqual(idleScan());
      expect(d.tactical.known).toEqual([0, 0]);
      sitDown(d.interior, 0, d.nav);
      step(d, [cmd(d, 0, scan(0))]);
      expect(d.tactical.scan.progress).toBe(2);
      step(d, [cmd(d, 0, { kind: 'stand' }), cmd(d, 1, scan(0))]);
      expect(d.tactical.scan).toEqual({ contact: 0, level: 1, progress: 7, rate: 5, by: d.science });
      step(d);
      expect(d.tactical.scan.progress).toBe(12);
    } finally { disposeDuel(d); }
  });
});
