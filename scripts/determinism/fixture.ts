import hound from '../../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { loadSnapshot } from '../../src/renderer/src/sim/snapshot';
import { canonicalFields } from '../../src/renderer/src/sim/canonicalFields';
import { flatten } from '../../src/renderer/src/sim/flatten';
import { hashState } from '../../src/renderer/src/sim/hash';
import { createAuthorityCore } from '../../src/renderer/src/authority/core';
import { runReplay } from '../../src/renderer/src/authority/replay';
import type { Checkpoint, Command, CommandEnvelope, HeldInput } from '../../src/renderer/src/net/contracts';
import type { ReplayAction, ReplayFrame, ReplayV2 } from '../../src/renderer/src/sim/replay';
import { compareReports, firstDifference, type Report, type Sample } from './protocol';

export const layouts = { hound: parseShip(hound) };
/** The production fleet (`shipForCrew`) recorded at two crew sizes (spec Art-iv-b): each variant is one ship at one
 *  player count, with its own 54 000 completed ticks and 900 samples. */
export const VARIANTS = [{ ship: 'hound', playerCount: 2 }, { ship: 'hound', playerCount: 3 }] as const;
export const variantName = (ship: string, playerCount: number) => `${ship}-${playerCount}`;
export const variantOf = (schedule: Schedule) => variantName(schedule.ship, schedule.checkpoint.init.playerCount);
export interface Schedule {
  ship: keyof typeof layouts; checkpoint: Checkpoint; ticks: number; ended: boolean;
  held: { tick: number; player: number; held: HeldInput }[];
  commands: { tick: number; player: number; command: Command }[];
  pauses: number[];
}
export interface Fixture { version: 2; runs: Schedule[]; expected: Report; fieldEncoding?: 'delta-v1' }
/** Lossless expected-field deltas keep the fixture reviewable without repeating static arrays 1800 times. */
export function packFixture(fixture: Fixture): Fixture {
  const packed = structuredClone(fixture), prior = new Map<string, Record<string, unknown>>();
  packed.fieldEncoding = 'delta-v1';
  for (const sample of packed.expected.samples) {
    const previous = prior.get(sample.runId) ?? {}, full = sample.fields;
    sample.fields = Object.fromEntries(Object.entries(full).filter(([key, value]) => firstDifference(previous[key], value) !== undefined));
    prior.set(sample.runId, full);
  }
  return packed;
}
export function unpackFixture(value: Fixture): Fixture {
  const fixture = structuredClone(value), prior = new Map<string, Record<string, unknown>>();
  if (fixture.fieldEncoding === 'delta-v1') for (const sample of fixture.expected.samples) {
    sample.fields = { ...prior.get(sample.runId), ...sample.fields }; prior.set(sample.runId, sample.fields);
  }
  delete fixture.fieldEncoding;
  return fixture;
}
const neutral = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
export function coreFor(schedule: Schedule, digest: string) {
  // Test-only source provenance rebinding. No canonical values/inputs/expected outcomes change.
  const checkpoint = structuredClone(schedule.checkpoint);
  checkpoint.init.contentDigest = checkpoint.snapshot.header.contentDigest = digest;
  const layout = layouts[schedule.ship], state = loadSnapshot(layout, checkpoint.snapshot, digest);
  const core = createAuthorityCore({ init: checkpoint.init, contentDigest: digest, resolveLayout: () => layout,
    clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash: r => { throw Error(r.error); } }, state, checkpoint);
  return { core, state, checkpoint, layout };
}
/** Inputs depend only on the checked-in schedule and tick, never observed gameplay. */
export function* actions(schedule: Schedule): Generator<ReplayAction> {
  const cp = schedule.checkpoint, players = cp.held.map((_, p) => p), held = cp.held.map(h => ({ ...h }));
  const sequences = cp.commandHighWater.slice(), heldSequences = cp.heldHighWater.slice();
  let order = cp.receiveOrder;
  for (let tick = 0; tick < schedule.ticks; tick++) {
    if (schedule.pauses.includes(tick)) {
      for (const paused of [true, false]) {
        const envelope: CommandEnvelope = { runId: cp.init.runId, requestedTick: tick, id: { player: 0, sequence: ++sequences[0]! }, command: { kind: 'setPaused', paused } };
        yield { kind: 'admission', entries: [{ binding: 1, players, order: ++order, message: { kind: 'command', envelope } }] };
        yield { kind: 'controls' };
        if (paused) held.splice(0, held.length, ...players.map(neutral));
      }
    }
    const entries: Extract<ReplayAction, { kind: 'admission' }>['entries'] = [];
    for (const segment of schedule.held.filter(s => s.tick === tick)) {
      held[segment.player] = { ...segment.held }; heldSequences[segment.player]!++;
      entries.push({ binding: 1, players, order: ++order, message: { kind: 'held', frame: { runId: cp.init.runId, player: segment.player, tick, sequence: heldSequences[segment.player]!, held: segment.held } } });
    }
    const commands = schedule.commands.filter(c => c.tick === tick).map(c => ({ runId: cp.init.runId, requestedTick: tick, id: { player: c.player, sequence: ++sequences[c.player]! }, command: c.command }));
    for (const envelope of commands) entries.push({ binding: 1, players, order: ++order, message: { kind: 'command', envelope } });
    if (entries.length) yield { kind: 'admission', entries };
    yield { kind: 'tick', input: { held: held.map(h => ({ ...h })), commands }, heldSequences: heldSequences.slice() };
  }
}
function sample(schedule: Schedule, state: ReturnType<typeof coreFor>['state'], completed: number): Sample {
  const values = flatten(state), fields: Record<string, unknown> = {};
  for (const field of canonicalFields(state.layout, state.playerCount)) fields[field.name] = field.array ? Array.from(values.slice(field.offset, field.offset + field.count)) : values[field.offset];
  return { ship: schedule.ship, variant: variantOf(schedule), seed: schedule.checkpoint.init.seed, runId: schedule.checkpoint.init.runId, tick: state.tick, completed, hash: hashState(state), fields };
}
export function executeSchedule(schedule: Schedule, digest: string, completedBefore: number, verifyReplay = true): Report {
  const h = coreFor(schedule, digest), report: Report = { samples: [], boundaries: [] }, frames: ReplayFrame[] = [];
  try {
    for (const action of actions(schedule)) {
      const frame = h.core.replayFrame({ tick: h.state.tick, eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] });
      if (verifyReplay) frames.push(frame);
      if (frame.results.length || frame.events.length) report.boundaries.push({ ship: schedule.ship, variant: variantOf(schedule), runId: schedule.checkpoint.init.runId, tick: frame.tick, action: action.kind, results: frame.results, events: frame.events });
      if (action.kind === 'tick' && (completedBefore + h.state.tick) % 60 === 0) report.samples.push(sample(schedule, h.state, completedBefore + h.state.tick));
      if (h.state.ended && h.state.tick !== schedule.ticks) throw Error(`unexpected end ${variantOf(schedule)} seed ${schedule.checkpoint.init.seed} at tick ${h.state.tick}, expected ${schedule.ticks}`);
    }
    if (Boolean(h.state.ended) !== schedule.ended) throw Error(`terminal chain mismatch ${schedule.checkpoint.init.runId}`);
    if (verifyReplay) {
      const replay: ReplayV2 = { version: 2, init: h.checkpoint.init, initial: h.checkpoint.snapshot, checkpoint: h.checkpoint, frames };
      const replayed: Report = { samples: [], boundaries: [] };
      const result = runReplay(h.layout, replay, digest, state => {
        if ((completedBefore + state.tick) % 60 === 0) replayed.samples.push(sample(schedule, state, completedBefore + state.tick));
      }, { retainTrace: false, onFrame: frame => { if (frame.results.length || frame.events.length) replayed.boundaries.push({ ship: schedule.ship, variant: variantOf(schedule), runId: schedule.checkpoint.init.runId, tick: frame.tick, action: frame.action.kind, results: frame.results, events: frame.events }); } });
      compareReports(report, replayed);
      const difference = firstDifference(h.core.captureCheckpoint(), result.checkpoint, 'replay checkpoint');
      if (difference) throw Error(difference);
      // Actual durable resume: split at an arbitrary completed boundary, parse/execute the suffix from the returned checkpoint.
      const split = frames.findIndex(f => f.after?.tick === Math.min(777, schedule.ticks));
      const prefix = runReplay(h.layout, { ...replay, frames: frames.slice(0, split + 1) }, digest, undefined, { retainTrace: false });
      const resumed = runReplay(h.layout, { ...replay, initial: prefix.checkpoint.snapshot, checkpoint: prefix.checkpoint, frames: frames.slice(split + 1) }, digest, undefined, { retainTrace: false });
      const restoreDifference = firstDifference(result.checkpoint, resumed.checkpoint, 'restored checkpoint');
      if (restoreDifference) throw Error(restoreDifference);
    }
    return report;
  } finally { h.core.dispose(); }
}
export function executeFixture(fixture: Fixture, digest: string, verifyReplay = true): Report {
  const report: Report = { samples: [], boundaries: [] }, names = VARIANTS.map(v => variantName(v.ship, v.playerCount));
  const completed = new Map(names.map(name => [name, 0]));
  for (const schedule of fixture.runs) {
    const variant = variantOf(schedule), before = completed.get(variant);
    if (before === undefined) throw Error(`${variant}: not a production fleet variant`);
    const out = executeSchedule(schedule, digest, before, verifyReplay);
    completed.set(variant, before + schedule.ticks); report.samples.push(...out.samples); report.boundaries.push(...out.boundaries);
  }
  for (const variant of names) {
    if (completed.get(variant) !== 54_000 || report.samples.filter(s => s.variant === variant).length !== 900) throw Error(`${variant}: requires 54000 completed ticks and 900 samples`);
  }
  // Keep two independent worlds alive and alternate every boundary, then compare their canonical samples.
  const schedules = names.map(variant => fixture.runs.find(r => variantOf(r) === variant)!);
  const live = schedules.map(s => coreFor(s, digest)), iterators = schedules.map(s => actions({ ...s, ticks: 600 }));
  try {
    for (let active = true; active;) {
      active = false;
      for (let i = 0; i < live.length; i++) {
        const next = iterators[i]!.next(); if (next.done) continue; active = true;
        const h = live[i]!, s = schedules[i]!;
        h.core.replayFrame({ tick: h.state.tick, eventSequenceBefore: h.core.cursors().eventSequence, action: next.value, results: [], events: [] });
        if (next.value.kind === 'tick' && h.state.tick % 60 === 0) {
          const actual = sample(s, h.state, h.state.tick), expected = report.samples.find(x => x.runId === actual.runId && x.tick === actual.tick)!;
          compareReports({ samples: [expected], boundaries: [] }, { samples: [actual], boundaries: [] });
        }
      }
    }
  } finally { for (const h of live) h.core.dispose(); }
  return report;
}
