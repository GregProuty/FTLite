// Sci-1 (spec 2026-11-17-science-scans §6.2, §6.3 step 1): the science tactical module and each laser's freq, at their
// step-1 neutral values; their order, validation, clone and snapshot round trip; the 44 → 45 alias table. Task 6
// replaces the neutral-values test with the drawn values.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { flattenTactical, scienceModule, shipModule, TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { classOf, cloneTactical, CONTACT_MAX_LEVEL, createTacticalState, HunterMode, idleScan, Loot } from '../src/renderer/src/sim/tactical/state';
import { aliasPlan, duelSchema, MIGRATIONS } from '../scripts/golden/duelOracle';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const FIELDS = ['startTick', 'hostileAt', 'known', 'scan.contact', 'scan.level', 'scan.progress', 'scan.rate', 'scan.by', 'designated', 'weakFreq',
  'derelict.orbitR', 'derelict.phase', 'derelict.loot', 'derelict.trapped', 'derelict.salvage', 'derelict.salvaged'];

describe('the science module (spec §6.2)', () => {
  it('sits after ship in both module lists, names its fields in order, and owns the three commands', () => {
    expect(TACTICAL_MODULES.map((m) => m.id)).toEqual(['space', 'ship', 'science']);
    expect(DUEL_MODULES.map(({ module }) => module.id)).toEqual(['space', 'ship', 'science', 'presence', 'repair', 'round', 'helm', 'interior']);
    const st = createTacticalState(3);
    expect(scienceModule.fields(st).map((f) => f.name)).toEqual(FIELDS);
    expect(scienceModule.fields(st).map((f) => f.count)).toEqual([1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([scienceModule.commands, scienceModule.reasons]).toEqual([[], []]);   // Task 2 fills both
    const ship = shipModule.fields(st).map((f) => f.name);
    for (const i of [0, 1]) expect(ship.indexOf(`systems.${i}.freq`)).toBe(ship.indexOf(`systems.${i}.lock`) + 1);
    expect(CONTACT_MAX_LEVEL).toEqual([2, 1]);
  });
  it('holds the step-1 neutral values (spec §6.3): Hunt and hostile from tick 0, the scan idle, freq 0, the derelict already salvaged', () => {
    const st = createTacticalState(3);
    expect({ startTick: st.startTick, hostileAt: st.hostileAt, mode: st.hunter.mode, known: st.known, scan: st.scan, designated: st.designated, weakFreq: st.weakFreq, derelict: st.derelict })
      .toEqual({ startTick: 0, hostileAt: 0, mode: HunterMode.Hunt, known: [0, 0], scan: idleScan(), designated: -1, weakFreq: 0,
        derelict: { orbitR: 700, phase: 0, loot: Loot.Hull, trapped: false, salvage: 0, salvaged: true } });
    expect(st.systems.map((y) => y.freq)).toEqual([0, 0]);
    expect(st.systems[1].shields).toBe(classOf(st, 1).shields.layers);
    expect(idleScan()).toEqual({ contact: -1, level: 0, progress: 0, rate: 0, by: 0 });
  });
  it('the clone builds fresh known, scan and derelict containers and copies every value', () => {
    const st = createTacticalState(3);
    st.known[0] = 1; st.scan.contact = 0; st.scan.level = 2; st.scan.progress = 40; st.scan.rate = 5; st.scan.by = 3; st.derelict.salvage = 7;
    const copy = cloneTactical(st);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    expect([copy.known === st.known, copy.scan === st.scan, copy.derelict === st.derelict]).toEqual([false, false, false]);
    copy.known[1] = 1; copy.scan.progress = 99; copy.derelict.salvaged = false;
    expect([st.known[1], st.scan.progress, st.derelict.salvaged]).toEqual([0, 40, true]);
  });
});

describe('the science fields in the snapshot (spec §6.2)', () => {
  it('a step-1 snapshot validates and restores; out-of-range values are refused even rehashed, and the edges are accepted', () => {
    const d = createDuel(CUTTER, 3);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), at = new Map<string, number>();
      let k = 1;
      for (const m of TACTICAL_MODULES) for (const f of m.fields(d.tactical)) { at.set(f.name, k); k += f.count; }
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST);
      try { expect(hashDuel(r)).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      const edit = (name: string, j: number, value: number) => { const s = structuredClone(snap); s.values[at.get(name)! + j] = value; s.header.hash = hashF64(Float64Array.from(s.values)); return s; };
      const bad: [string, number, number, RegExp][] = [
        ['hunter.mode', 0, 3, /hunter\.mode/], ['systems.1.shields', 0, 4, /systems\.1\.shields/], ['systems.0.freq', 0, 3, /systems\.0\.freq/], ['systems.1.freq', 0, -1, /systems\.1\.freq/],
        ['startTick', 0, -1, /startTick/], ['hostileAt', 0, -2, /hostileAt/], ['hostileAt', 0, 0.5, /hostileAt/], ['known', 0, 3, /known/], ['known', 1, 2, /known/],
        ['scan.contact', 0, 2, /scan\.contact/], ['scan.contact', 0, -2, /scan\.contact/], ['scan.level', 0, 3, /scan\.level/], ['scan.progress', 0, 0.5, /scan\.progress/],
        ['scan.rate', 0, 3, /scan\.rate/], ['scan.by', 0, -1, /scan\.by/], ['designated', 0, -2, /designated/], ['designated', 0, 2, /designated/], ['weakFreq', 0, 3, /weakFreq/],
        ['derelict.orbitR', 0, 699, /derelict\.orbitR/], ['derelict.orbitR', 0, 1200, /derelict\.orbitR/], ['derelict.orbitR', 0, 1600, /derelict\.orbitR/], ['derelict.orbitR', 0, 700.5, /derelict\.orbitR/],
        ['derelict.phase', 0, 256, /derelict\.phase/], ['derelict.loot', 0, 3, /derelict\.loot/], ['derelict.trapped', 0, 2, /derelict\.trapped/],
        ['derelict.salvage', 0, -1, /derelict\.salvage/], ['derelict.salvaged', 0, 2, /derelict\.salvaged/]
      ];
      for (const [name, j, value, error] of bad) expect(() => validateDuelSnapshot(CUTTER, edit(name, j, value), DIGEST), `${name}[${j}] = ${value}`).toThrow(error);
      const good: [string, number, number][] = [
        ['hunter.mode', 0, HunterMode.Patrol], ['systems.1.shields', 0, 3], ['systems.0.freq', 0, 2], ['hostileAt', 0, -1], ['known', 0, 2], ['known', 1, 1],
        ['scan.contact', 0, 1], ['scan.level', 0, 2], ['scan.rate', 0, 2], ['scan.rate', 0, 5], ['designated', 0, 1], ['weakFreq', 0, 2],
        ['derelict.orbitR', 0, 1000], ['derelict.orbitR', 0, 1400], ['derelict.orbitR', 0, 1599], ['derelict.phase', 0, 255], ['derelict.loot', 0, 2], ['derelict.trapped', 0, 1], ['derelict.salvaged', 0, 0]
      ];
      for (const [name, j, value] of good) expect(() => validateDuelSnapshot(CUTTER, edit(name, j, value), DIGEST), `${name}[${j}] = ${value}`).not.toThrow();
    } finally { disposeDuel(d); }
  });
});

describe('the 44 → 45 alias table (spec §6.3)', () => {
  it('declares the science module and every freq added, and maps every other field to itself', () => {
    const m = MIGRATIONS[44]!;
    expect(m.change).toBe('Sci-1: science scans');
    const d = createDuel(CUTTER, 1);
    try {
      const now = duelSchema(d), fresh = (n: string): boolean => /^science\./.test(n) || /^ship\.systems\.\d+\.freq$/.test(n);
      expect(now.names.filter(fresh)).toEqual([...FIELDS.map((f) => `science.${f}`), 'ship.systems.0.freq', 'ship.systems.1.freq'].sort((a, b) => now.names.indexOf(a) - now.names.indexOf(b)));
      const oldNames = now.names.filter((n) => !fresh(n)), oldCounts = now.counts.filter((_, i) => !fresh(now.names[i]!));
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts, m).problems).toEqual([]);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts).problems).toContain('new field science.startTick is neither mapped nor declared added');
    } finally { disposeDuel(d); }
  });
});
