import { expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { step } from '../../src/renderer/src/sim/step';
import { Health } from '../../src/renderer/src/sim/components';
import { STREAM_NAMES, type SimState } from '../../src/renderer/src/sim/state';
import type { Intent } from '../../src/shared/intent';
import { firstDifference, projectGameplay } from './gameplayTrace';

type Input = [number, number, number];
type GateTrace = { name: string; initial: Record<string, unknown>; final?: Record<string, unknown>; minHull: number; minHealth: number; actions: { tick: number; through: number; inputs: Input[] }[]; rng: { tick: number; changed: Record<string, number> }[] };
type Recording = { trace: GateTrace; previousInputs: string; rng: number[] };
const active = new WeakMap<SimState, Recording>();
const fixture = 'tests/fixtures/net1a-gates.json';
const expected = existsSync(fixture) ? JSON.parse(readFileSync(fixture, 'utf8')) as { gates: GateTrace[] } : null;
export function beginGateTrace(s: SimState, name: string): void {
  active.set(s, { trace: { name, initial: projectGameplay(s), minHull: s.hull, minHealth: Math.min(...s.crew.map((eid) => Health.cur[eid]!)), actions: [], rng: [] }, previousInputs: '', rng: STREAM_NAMES.map((n) => s.rng[n].s) });
}
/** Real step, unchanged input values. The gate owns all setup and mid-run mutations. */
export function tracedStep(s: SimState, inputs: readonly Intent[]): void {
  const recording = active.get(s);
  if (!recording) throw new Error('gate trace must begin before its first step');
  const tick = s.tick;
  const values: Input[] = inputs.map((i) => [i.moveX, i.moveY, Number(i.interactHeld) | Number(i.interactPressed) << 1 | Number(i.confirmPressed) << 2 | Number(i.cancelPressed) << 3]);
  const text = JSON.stringify(values), last = recording.trace.actions.at(-1);
  if (text === recording.previousInputs && last) last.through = tick;
  else { recording.trace.actions.push({ tick, through: tick, inputs: values }); recording.previousInputs = text; }
  step(s, inputs);
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
    expect(firstDifference(baseline, actual), `first action/RNG/gameplay divergence in ${actual.name}`).toBeNull();
  }
  active.delete(s);
}
