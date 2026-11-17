import { describe, expect, it } from 'vitest';
import { compareReports, browserExecutable, receiveBrowser } from '../scripts/determinism/protocol';
import { readFileSync } from 'node:fs';
import { executeSchedule, unpackFixture, packFixture, coreFor, actions, variantOf, VARIANTS } from '../scripts/determinism/fixture';
import { shipForCrew } from '../src/renderer/src/sim/ship/fleet';
import { Position } from '../src/renderer/src/sim/components';
import { CREW_SPEED, TRAIT_SLOW_SPEED, DT } from '../src/renderer/src/sim/tuning';

const report = () => ({ samples: [{ ship: 'skiff', seed: 7, runId: 'r', tick: 60, completed: 60, hash: 'abcd', fields: { hull: 100 } }], boundaries: [{ runId: 'r', tick: 0, results: ['applied'], events: ['pause'] }] });
describe('real-engine harness failures', () => {
  it('reports the first differing completed tick and named canonical field', () => {
    const a = report(), b = report(); b.samples[0]!.hash = 'ffff'; b.samples[0]!.fields.hull = 99;
    expect(() => compareReports(a, b)).toThrow(/skiff.*seed 7.*tick 60.*hull.*100.*99/);
  });
  it('compares command results separately even when all hashes match', () => {
    const a = report(), b = report(); b.boundaries[0]!.results = ['rejected'];
    expect(() => compareReports(a, b)).toThrow(/boundaries.*results/);
  });
  it('compares event order separately even when all hashes match', () => {
    const a = report(), b = report(); b.boundaries[0]!.events = ['ended', 'pause'];
    expect(() => compareReports(a, b)).toThrow(/boundaries.*events/);
  });
  it('rejects an actual page failure', async () => {
    const receiver = receiveBrowser(100); receiver.report({ error: 'page exploded' });
    await expect(receiver.promise).rejects.toThrow('page exploded');
  });
  it('fails a silent or hung renderer on timeout', async () => {
    await expect(receiveBrowser(5).promise).rejects.toThrow(/timeout/);
  });
  it('reports absent optional Firefox and refuses absent mandatory Chromium', () => {
    expect(browserExecutable('Firefox', undefined, false)).toBe('Firefox NOT RUN: executable unavailable');
    expect(() => browserExecutable('Chromium', undefined, true)).toThrow(/Chromium.*required/);
  });
  it('rejects malformed successful page reports', async () => {
    const receiver = receiveBrowser(100); receiver.report({ report: {} });
    await expect(receiver.promise).rejects.toThrow(/malformed/);
  });
});
describe('independently recorded semantic schedule coverage', () => {
  const fixture = unpackFixture(JSON.parse(readFileSync('tests/fixtures/determinism-v2.json', 'utf8')));
  it('covers the complete production fleet with its actual crew allocation', () => {
    expect(new Set(fixture.runs.map(r => r.ship))).toEqual(new Set([1, 2, 3, 4].map(shipForCrew)));
    for (const run of fixture.runs) expect(run.ship).toBe(shipForCrew(run.checkpoint.init.playerCount));
    expect(new Set(fixture.runs.map(variantOf))).toEqual(new Set(['hound-2', 'hound-3']));
    expect(VARIANTS.map(v => `${v.ship}-${v.playerCount}`)).toEqual(['hound-2', 'hound-3']);
    for (const run of fixture.runs) expect(run.checkpoint.init.runId.startsWith(`det-${variantOf(run)}-`)).toBe(true);
    for (const sample of fixture.expected.samples) expect(sample.variant).toBe(variantOf(fixture.runs.find(r => r.checkpoint.init.runId === sample.runId)!));
  });
  it('losslessly compresses expected canonical fields without compressing away changing values', () => {
    expect(unpackFixture(packFixture(fixture))).toEqual(fixture);
  });
  it('the recorded full diagonal is normalized by the production held phase', () => {
    const schedule = { ...fixture.runs.find(r => variantOf(r) === 'hound-2')!, ticks: 24 }, h = coreFor(schedule, __GAMEPLAY_CONTENT_DIGEST__);
    const mover = schedule.checkpoint.init.playerCount - 1;
    let checked = false;
    try {
      for (const action of actions(schedule)) {
        const eid = h.state.crew[mover]!, x = Position.x[eid]!, y = Position.y[eid]!, tick = h.state.tick;
        h.core.replayFrame({ tick, eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] });
        if (action.kind === 'tick' && tick === 23) {
          checked = true;
          expect(action.input.held[mover]).toMatchObject({ moveX: -1, moveY: -1 });
          const distance = CREW_SPEED * TRAIT_SLOW_SPEED * DT / Math.sqrt(2);
          expect(Position.x[eid]).toBeCloseTo(x - distance, 12); expect(Position.y[eid]).toBeCloseTo(y - distance, 12);
        }
      }
    } finally { h.core.dispose(); }
    expect(checked).toBe(true);
  });
  it.each(['hound-2', 'hound-3'])('%s: the recorded unit-length (.6, .8) segment really walks the unseated mover', variant => {
    const original = fixture.runs.find(r => variantOf(r) === variant)!, mover = original.checkpoint.init.playerCount - 1;
    const segment = original.held.filter(x => x.player === mover && x.held.moveX === .6 && x.held.moveY === .8 && x.tick > 22);
    expect(segment).toHaveLength(1);
    const start = segment[0]!.tick, end = original.held.find(x => x.player === mover && x.tick > start)!.tick;
    expect(end - start).toBeGreaterThan(0);
    const schedule = { ...original, ticks: end + 1, ended: false }, h = coreFor(schedule, __GAMEPLAY_CONTENT_DIGEST__);
    const distance = CREW_SPEED * TRAIT_SLOW_SPEED * DT;
    let checked = 0;
    try {
      for (const action of actions(schedule)) {
        const eid = h.state.crew[mover]!, x = Position.x[eid]!, y = Position.y[eid]!, tick = h.state.tick;
        h.core.replayFrame({ tick, eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] });
        if (action.kind === 'tick' && tick >= start && tick < end) {
          checked++;
          expect(action.input.held[mover]).toMatchObject({ moveX: .6, moveY: .8 });
          expect(Position.x[eid]).toBeCloseTo(x + .6 * distance, 12); expect(Position.y[eid]).toBeCloseTo(y + .8 * distance, 12);
        }
      }
    } finally { h.core.dispose(); }
    expect(checked).toBe(end - start);
  });
  it.each(['hound-2', 'hound-3'])('%s has exactly 54000 completed ticks, 900 samples and explicit terminal chains', variant => {
    const runs = fixture.runs.filter(r => variantOf(r) === variant), samples = fixture.expected.samples.filter(s => s.variant === variant);
    expect(runs.reduce((n, r) => n + r.ticks, 0)).toBe(54000);
    expect(samples.map(s => s.completed)).toEqual(Array.from({ length: 900 }, (_, i) => (i + 1) * 60));
    expect(runs.slice(0, -1).every(r => r.ended)).toBe(true);
    expect(new Set(runs.map(r => r.checkpoint.init.runId)).size).toBe(runs.length);
    expect(new Set(runs.map(r => r.checkpoint.init.seed)).size).toBeGreaterThan(1);
  });
  it.each(['hound-2', 'hound-3'])('%s executes meaningful non-neutral command and held coverage through production replay', variant => {
    const original = fixture.runs.find(r => variantOf(r) === variant)!;
    const actual = executeSchedule({ ...original, ticks: 960, ended: false }, __GAMEPLAY_CONTENT_DIGEST__, 0);
    const pinned = { samples: fixture.expected.samples.filter(s => s.runId === original.checkpoint.init.runId && s.tick <= 960), boundaries: fixture.expected.boundaries.filter((b: any) => b.runId === original.checkpoint.init.runId && b.tick < 960) };
    compareReports(pinned, actual);
    const resultAt = (tick: number) => actual.boundaries.filter((b: any) => b.tick === tick).flatMap((b: any) => b.results);
    expect(resultAt(300)).toContainEqual(expect.objectContaining({ status: 'applied' }));
    expect(actual.samples.at(-1)!.fields['telemetry.purchases']).toBeGreaterThan(0);
    expect(resultAt(1).filter(r => r.status === 'applied')).toHaveLength(original.checkpoint.init.playerCount);
    expect(actual.samples[1]!.fields['telemetry.eventsResolved']).toBe(1);
    expect(resultAt(61)).toContainEqual(expect.objectContaining({ reason: 'stale-target' }));
    expect((actual.samples[0]!.fields['debris.stableId'] as number[])[0]).toBe(101);
    expect(actual.boundaries.flatMap((b: any) => b.events).filter((e: any) => e.kind === 'pause')).toHaveLength(4);
    const mover = original.checkpoint.init.playerCount - 1;
    expect(actual.samples[0]!.fields[`crew.${mover}.x`]).not.toBe(actual.samples[2]!.fields[`crew.${mover}.x`]);
    // The mover's scan at the Ops group, its Ops tabs (Science -> Engineering -> Science), the reactor buy between
    // them and its stand all apply on both crew sizes.
    expect(resultAt(2)).toContainEqual(expect.objectContaining({ id: expect.objectContaining({ player: mover }), status: 'applied' }));
    for (const tick of [11, 12, 13, 22]) expect(resultAt(tick)).toEqual([expect.objectContaining({ id: expect.objectContaining({ player: mover }), status: 'applied' })]);
    expect(resultAt(700)).toEqual([expect.objectContaining({ reason: 'unsupported' })]);
    if (variant === 'hound-2') {
      // Two crew: Navigation and Weapons are separate seats, so player 0 stands, walks and sits between them.
      for (const tick of [20, 40, 290, 298, 300, 302, 311]) expect(resultAt(tick)).toEqual([expect.objectContaining({ id: expect.objectContaining({ player: 0 }), status: 'applied' })]);
      expect(resultAt(61)).toEqual([expect.objectContaining({ id: expect.objectContaining({ player: 0 }), reason: 'stale-target' })]);
    } else {
      // Three crew: player 1 is the gunner at Weapons.
      expect(resultAt(61)).toEqual([expect.objectContaining({ id: expect.objectContaining({ player: 1 }), reason: 'stale-target' })]);
    }
  });
});
