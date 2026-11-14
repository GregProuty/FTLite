import { expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { step } from './rawInput';
import { Health } from '../../src/renderer/src/sim/components';
import { STREAM_NAMES, type SimState } from '../../src/renderer/src/sim/state';
import type { Intent } from '../../src/shared/intent';
import type { ScriptedCommand } from '../../src/renderer/src/headless/runner';
import { firstDifference, projectGameplay } from './gameplayTrace';

type Input = [number, number, number];
export type GateTrace = { name: string; initial: Record<string, unknown>; final?: Record<string, unknown>; minHull: number; minHealth: number; actions: { tick: number; through: number; inputs: Input[] }[]; rng: { tick: number; changed: Record<string, number> }[] };
type Recording = { trace: GateTrace; previousInputs: string; rng: number[] };
const active = new WeakMap<SimState, Recording>();
const fixture = 'tests/fixtures/net1a-gates.json';
const expected = existsSync(fixture) ? JSON.parse(readFileSync(fixture, 'utf8')) as { gates: GateTrace[] } : null;
type Difference = { tick: number; field: string };
/** Compare action coverage rather than its compression, then choose the earliest observation. */
export function firstGateDifference(expected: GateTrace, actual: GateTrace): Difference | null {
  let actionDifference: Difference | null = null;
  let a = 0, b = 0, tick = Math.min(expected.actions[0]?.tick ?? Infinity, actual.actions[0]?.tick ?? Infinity);
  while (Number.isFinite(tick)) {
    while (expected.actions[a] && expected.actions[a]!.through < tick) a++;
    while (actual.actions[b] && actual.actions[b]!.through < tick) b++;
    const left = expected.actions[a], right = actual.actions[b];
    const leftCovered = left && left.tick <= tick, rightCovered = right && right.tick <= tick;
    if (!!leftCovered !== !!rightCovered) { actionDifference = { tick, field: `actions[${tick}].inputs` }; break; }
    if (leftCovered && rightCovered) {
      const difference = firstDifference(left.inputs, right.inputs);
      if (difference) { actionDifference = { tick, field: `actions[${tick}].inputs${difference.field}` }; break; }
      tick = Math.min(left.through, right.through) + 1;
    } else tick = Math.min(left?.tick ?? Infinity, right?.tick ?? Infinity);
  }
  let rngDifference: Difference | null = null;
  a = 0; b = 0;
  while (expected.rng[a] || actual.rng[b]) {
    const left = expected.rng[a], right = actual.rng[b];
    tick = Math.min(left?.tick ?? Infinity, right?.tick ?? Infinity);
    if (left?.tick !== right?.tick) { rngDifference = { tick, field: `rng[${tick}]` }; break; }
    const difference = firstDifference(left!.changed, right!.changed);
    if (difference) { rngDifference = { tick, field: `rng[${tick}].changed.${difference.field}` }; break; }
    a++; b++;
  }
  const initial = firstDifference(expected.initial, actual.initial);
  const final = firstDifference(expected.final, actual.final);
  // Minima carry no sample timestamp; their first known observation is the completed final state.
  const summary = firstDifference(
    { tick: expected.final?.tick ?? 0, name: expected.name, minHull: expected.minHull, minHealth: expected.minHealth },
    { tick: actual.final?.tick ?? 0, name: actual.name, minHull: actual.minHull, minHealth: actual.minHealth });
  const candidates = [initial && { ...initial, field: `initial.${initial.field}` }, actionDifference, rngDifference,
    final && { ...final, field: `final.${final.field}` }, summary];
  return candidates.reduce<Difference | null>((first, next) => next && (!first || next.tick < first.tick) ? next : first, null);
}
export function beginGateTrace(s: SimState, name: string): void {
  active.set(s, { trace: { name, initial: projectGameplay(s), minHull: s.hull, minHealth: Math.min(...s.crew.map((eid) => Health.cur[eid]!)), actions: [], rng: [] }, previousInputs: '', rng: STREAM_NAMES.map((n) => s.rng[n].s) });
}
/** Real step, unchanged input values. The gate owns all setup and mid-run mutations. */
export function tracedStep(s: SimState, inputs: readonly Intent[], commands?: readonly ScriptedCommand[]): void {
  const recording = active.get(s);
  if (!recording) throw new Error('gate trace must begin before its first step');
  const tick = s.tick;
  const values: Input[] = inputs.map((i) => [i.moveX, i.moveY, Number(i.interactHeld) | Number(i.interactPressed) << 1 | Number(i.confirmPressed) << 2 | Number(i.cancelPressed) << 3]);
  const text = JSON.stringify(values), last = recording.trace.actions.at(-1);
  if (text === recording.previousInputs && last) last.through = tick;
  else { recording.trace.actions.push({ tick, through: tick, inputs: values }); recording.previousInputs = text; }
  step(s, inputs, commands);
  const changed: Record<string, number> = {};
  STREAM_NAMES.forEach((name, i) => { const value = s.rng[name].s; if (value !== recording.rng[i]) { changed[name] = value; recording.rng[i] = value; } });
  if (Object.keys(changed).length) recording.trace.rng.push({ tick, changed });
  recording.trace.minHull = Math.min(recording.trace.minHull, s.hull);
  for (const eid of s.crew) recording.trace.minHealth = Math.min(recording.trace.minHealth, Health.cur[eid]!);
}
export function assertGateTrace(s: SimState): void {
  const recording = active.get(s); if (!recording) throw new Error('missing gate recording');
  const actual = recording.trace; actual.final = projectGameplay(s);
  const captureDirectory = process.env.NET1A_CAPTURE_GATE_OUTPUT;
  // Only the explicit capture command sets this. Tests never write expected fixtures.
  if (captureDirectory) writeFileSync(join(captureDirectory, actual.name.replace(':', '-') + '.json'), JSON.stringify(actual));
  else {
    const baseline = expected?.gates.find((g) => g.name === actual.name);
    expect(baseline, `missing pinned gate ${actual.name}`).toBeDefined();
    expect(firstGateDifference(baseline!, actual), `first action/RNG/gameplay divergence in ${actual.name}`).toBeNull();
  }
  active.delete(s);
}
