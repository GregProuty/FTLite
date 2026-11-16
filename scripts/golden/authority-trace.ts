// The authority boundary trace (engine refactor R-1, Codex plan review F3): everything the sector authority shows the
// outside world, recorded from the authority as it stands BEFORE a refactor and compared after it. The per-tick
// canonical trace (canonical-trace.ts) proves the sim state; this proves the boundary: every command result (with
// admission metadata), every event with its payload, every publication (sequence, tick, channel, phase, hash), every
// checkpoint capture (cause and bytes hash), the crash record and the replay a run records. It uses only the public
// sector entry points (createAuthority, runReplay), which exist unchanged before and after R-1. The content digest is
// masked: it covers the authority's own sources, so a refactor changes it by design.
// Usage (no shell features; the baseline lives in the git-ignored out/ folder):
//   npx tsx scripts/golden/authority-trace.ts baseline   before the refactor: records out/authority-trace/baseline.json
//   npx tsx scripts/golden/authority-trace.ts same       after it: exits 1 on the first difference
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { computeContentDigest } from '../../build/contentDigest';
import { createAuthority } from '../../src/renderer/src/authority/authority';
import { runReplay } from '../../src/renderer/src/authority/replay';
import type { ChannelKind, ClientMessage, CommandEnvelope, Link, PublishedState } from '../../src/renderer/src/net/contracts';
import { decodeMessage, encodeMessage } from '../../src/renderer/src/net/codec';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { scriptedSemanticReplay } from '../../tests/helpers/script';

const DIR = 'out/authority-trace', FILE = `${DIR}/baseline.json`;
const LAYOUT = parseShip(starter), digest = computeContentDigest(process.cwd());
/** A short hash of a value's JSON with the content digest masked: every source edit changes the digest, never the boundary. */
const sha = (value: unknown): string => createHash('sha256').update(JSON.stringify(value).replaceAll(digest, '<content-digest>')).digest('hex').slice(0, 16);
type Entry = Record<string, unknown>;

function publication(state: PublishedState, channel: ChannelKind): Entry {
  return { pub: state.publicationSequence, tick: state.tick, channel, phase: state.phase, hash: state.hash, pauseOwner: state.pauseOwner, pauseReason: state.pauseReason,
    controlRevision: state.controlRevision, highWater: [state.commandHighWater, state.heldHighWater, state.auxiliaryHighWater], eventSequence: state.eventSequence };
}
/** A link that records everything the authority sends, decoded, and lets the scenario deliver client messages. */
function recordingLink(name: string, out: Entry[], failSends = { after: Infinity }) {
  const listeners = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  let sends = 0;
  const link: Link = { peer: name, caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) {
      if (++sends > failSends.after) throw new Error('injected send failure');
      const m = decodeMessage(bytes);
      if (m.kind === 'state') out.push({ link: name, ...publication(m.state, kind) });
      else if (m.kind === 'result') out.push({ link: name, channel: kind, result: m.result });
      else if (m.kind === 'event') out.push({ link: name, channel: kind, event: m.event });
    },
    onMessage(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    close(reason) { out.push({ link: name, closed: reason }); for (const cb of [...closes]) cb(reason); },
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, deliver(message: ClientMessage, kind: ChannelKind = 'reliable-ordered') { for (const cb of [...listeners]) cb(kind, encodeMessage(message)); } };
}
function init(players: number, seed: number, runId: string) {
  return { runId, layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION, contentDigest: digest, seed, playerCount: players, characters: Array(players).fill(0), unlocked: [] };
}
function host(out: Entry[], gate?: { allowed: boolean }) {
  let now = 0; const callbacks = new Set<() => void>();
  let pause: ((control: { paused: boolean; reason: string }) => void) | undefined;
  const authority = createAuthority({ contentDigest: digest, resolveLayout: () => LAYOUT, clock: { nowMs: () => now },
    scheduler: { schedule(_delay, cb) { callbacks.add(cb); return () => { callbacks.delete(cb); }; } },
    onCrash(record) { out.push({ crash: sha({ ...record, error: record.error }), error: record.error, tick: record.tick, replayVersion: record.replayVersion, frames: record.frames.length }); },
    onCheckpoint(cp, cause) { out.push({ capture: cause, tick: cp.snapshot.header.tick, bytes: sha(cp) }); },
    ...(gate ? { sessionGate: { check: () => ({ allowed: gate.allowed, revision: 0, reason: null }) } } : {}),
    bindLifecyclePause(request) { pause = request; return () => { pause = undefined; }; } });
  return { authority, lifecycle: (paused: boolean, reason: string) => pause?.({ paused, reason }),
    tick(n: number) { for (let k = 0; k < n; k++) { now += 1000 / 60; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } authority.pump(); } } };
}
const command = (runId: string, player: number, sequence: number, requestedTick: number, c: CommandEnvelope['command']): ClientMessage =>
  ({ kind: 'command', envelope: { runId, id: { player, sequence }, requestedTick, command: c } });
const tickOf = (out: Entry[]): number => { for (let k = out.length - 1; k >= 0; k--) if (typeof out[k]!.tick === 'number' && 'pub' in out[k]!) return out[k]!.tick as number; return 0; };
function replayRoundTrip(out: Entry[], replay: unknown): void {
  const r = replay as { version: number; frames: unknown[] };
  out.push({ replay: r.version, frames: r.frames.length, bytes: sha(replay) });
  const result = runReplay(LAYOUT, replay, digest, undefined, { retainFrames: true });
  out.push({ rerun: result.hashes.length, last: result.hashes.at(-1) ?? null, results: sha(result.results), events: sha(result.events), checkpoint: sha(result.checkpoint) });
}

/** The scenarios, in order; each returns its entries. */
async function scenarios(): Promise<Record<string, Entry[]>> {
  const all: Record<string, Entry[]> = {};

  // 1. The golden replay run through the authority's replay executor: every frame's results, events and outcome.
  const golden: Entry[] = all.golden = [];
  const replay = scriptedSemanticReplay(2026, 4, 60 * 120, digest);
  const result = runReplay(LAYOUT, replay, digest, undefined, { retainTrace: false, onFrame(frame) {
    if (frame.results.length || frame.events.length || frame.action.kind === 'tick' && frame.tick % 60 === 59) golden.push({ tick: frame.tick, action: frame.action.kind, results: frame.results, events: frame.events, after: frame.after ?? null });
  } });
  golden.push({ checkpoint: sha(result.checkpoint) });

  // 2. A live host with a strict and a receive-time binding: setPaused, stale-tick, duplicates, gaps and conflicts,
  //    held input, a 300-tick boundary, a requested capture, an end of the session, and the replay it recorded.
  const live: Entry[] = all.live = [];
  const h = host(live), id = 'trace-live';
  h.authority.start(init(2, 11, id));
  const strict = recordingLink('strict', live), late = recordingLink('receive-time', live);
  h.authority.attach(strict.link, [0], { admissionPolicy: 'strict' }); h.authority.attach(late.link, [1], { admissionPolicy: 'receive-time' });
  h.tick(5);
  strict.deliver(command(id, 0, 1, tickOf(live), { kind: 'setPaused', paused: true })); h.tick(3);
  strict.deliver(command(id, 0, 2, tickOf(live), { kind: 'setPaused', paused: false })); h.tick(3);
  strict.deliver(command(id, 0, 3, 0, { kind: 'stand' }));                                  // stale tick
  strict.deliver(command(id, 0, 3, 0, { kind: 'stand' }));                                  // the same envelope again
  strict.deliver(command(id, 0, 3, 0, { kind: 'moveTo', tile: 3 }));                        // a conflicting duplicate
  strict.deliver(command(id, 0, 9, tickOf(live), { kind: 'stand' }));                       // a sequence gap
  strict.deliver(command(id, 0, 4, tickOf(live), { kind: 'stand' }));
  strict.deliver(command(id, 0, 4, tickOf(live), { kind: 'stand' }));                       // a duplicate while still pending
  late.deliver(command(id, 1, 1, Math.max(0, tickOf(live) - 2), { kind: 'stand' }));        // receive-time admission metadata
  late.deliver({ kind: 'held', frame: { runId: id, player: 1, tick: tickOf(live), sequence: 1, held: { moveX: 1, moveY: 0, interactHeld: false } } }, 'unreliable-latest');
  late.deliver({ kind: 'callout', runId: id, player: 1, sequence: 1, calloutKind: 'contextual' });
  h.tick(310);
  const captured = await h.authority.requestCheckpoint('safe-point');
  live.push({ requested: captured.cause, tick: captured.checkpoint.snapshot.header.tick, bytes: sha(captured.checkpoint) });
  live.push({ sealed: sha(h.authority.checkpoint([])) });
  replayRoundTrip(live, h.authority.replay());
  h.authority.dispose();

  // 3. The session lease gate: bootstrap pause, completeBootstrap, a fence while a lifecycle resume is queued (the
  //    seal that discards it makes the replay V4), resetPausedEpoch on reopening, then a crash.
  const lease: Entry[] = all.lease = [];
  const gate = { allowed: false }, g = host(lease, gate), lid = 'trace-lease';
  g.authority.start(init(1, 5, lid));
  const seat = recordingLink('seat', lease, { after: Infinity });
  g.authority.attach(seat.link, [0], { admissionPolicy: 'receive-time' });
  g.tick(3);
  gate.allowed = true; g.authority.completeBootstrap(); g.tick(30);
  g.lifecycle(true, 'focus'); g.tick(2);
  g.lifecycle(false, 'focus'); gate.allowed = false; g.tick(4);          // the resume is queued, then the gate closes
  seat.deliver(command(lid, 0, 1, tickOf(lease), { kind: 'stand' })); g.tick(2);
  gate.allowed = true; g.tick(5);
  seat.deliver(command(lid, 0, 2, tickOf(lease), { kind: 'setPaused', paused: false })); g.tick(20);
  replayRoundTrip(lease, g.authority.replay());
  g.authority.dispose();

  const crash: Entry[] = all.crash = [];
  const c = host(crash), cid = 'trace-crash', failing = { after: Infinity };
  c.authority.start(init(1, 9, cid));
  const doomed = recordingLink('doomed', crash, failing);
  c.authority.attach(doomed.link, [0], { admissionPolicy: 'strict' });
  c.tick(20); failing.after = 0; c.tick(3);
  c.authority.dispose();
  return all;
}

function firstDifference(a: unknown, b: unknown, path: string): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDifference((a as Entry)[k], (b as Entry)[k], `${path}.${k}`); if (d) return d; }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 160)} → ${JSON.stringify(b)?.slice(0, 160)}`;
}
const counts = (t: Record<string, Entry[]>): string => Object.entries(t).map(([k, v]) => `${k} ${v.length}`).join(', ');

async function main(): Promise<void> {
  const mode = process.argv[2], now = await scenarios();
  if (mode === 'baseline') {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify({ simVersion: SIM_VERSION, scenarios: now }));
    console.log(`authority trace baseline: ${counts(now)} entries; written to ${FILE}`);
  } else if (mode === 'same') {
    if (!existsSync(FILE)) { console.error(`no authority trace baseline at ${FILE}: run \`authority-trace.ts baseline\` before the refactor`); process.exit(1); }
    const was = (JSON.parse(readFileSync(FILE, 'utf8')) as { scenarios: Record<string, Entry[]> }).scenarios;
    for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) {
      const a = was[name] ?? [], b = now[name] ?? [];
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        const d = firstDifference(a[k], b[k], `${name}[${k}]`);
        if (d) { console.error(`authority boundary CHANGED at ${d}`); process.exit(1); }
      }
    }
    console.log(`authority boundary unchanged: ${counts(now)} entries`);
  } else throw Error('usage: npx tsx scripts/golden/authority-trace.ts baseline|same');
}
main().catch((error: unknown) => { console.error(error); process.exit(1); });
