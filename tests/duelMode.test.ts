// The duel as a registered Net-3 mode (engine refactor spec §6, R-1b acceptance), at the hostRuntime and utility-host
// level of Net-3's host-smoke gate: start → captureCheckpoint → restore round trips reproduce identical hashes for the
// sector and the duel, attach and detach work over loopback ports, a streamed attachment publishes duel state images,
// and a utility initialised as 'duel' runs it. No main-process or renderer wiring (H-2).
import { describe, expect, it } from 'vitest';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { sectorMode } from '../src/network/modes/sector';
import { duelMode } from '../src/network/modes/duel';
import { duelPublicationToImage, imageToDuelPublication, type DuelPublication } from '../src/network/modes/duelStream';
import { createUtilityHost } from '../src/network/utilityHost';
import { authorityModes } from '../src/worker/authorityModes';
import { readFileSync } from 'node:fs';
import type { ModeDefinition, ModeHostDeps } from '../src/network/modes/contracts';
import type { HostCommandInput } from '../src/shared/netSession';
import { classifyStreamPacket, decodeOpaquePacket, decodeState, decodeStatePacket, encodeControl, encodeOpaquePacket, inspectState } from '../src/network/state/imageCodec';
import { spaceModule } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { duelCodec } from '../src/renderer/src/net/codec';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { hashF64 } from '../src/shared/hash';
import { LAYOUT } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { portEndpoint } from './helpers/portEndpoint';
import { modeDuelInit as duelInit, resolveCutter } from './helpers/duelAuthority';

const encode = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
const decode = (x: Uint8Array) => JSON.parse(new TextDecoder().decode(x));
const codec = duelCodec(2);
function harness(mode: ModeDefinition) {
  let now = 0; const callbacks = new Set<() => void>();
  const deps: ModeHostDeps = { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => now },
    scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } }, onCrash() {} };
  const runtime = createHostRuntime(createModeRegistry([sectorMode, duelMode]), deps, { modeId: mode.modeId, schemaVersion: mode.schemaVersion, simVersion: mode.simVersion, hostGeneration: 1 });
  ownTestCleanup(() => runtime.dispose());
  let id = 0;
  return { runtime, advance(t: number) { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    command(input: HostCommandInput) { return runtime.handle({ ...input, requestId: ++id, hostGeneration: 1 }); } };
}
const sectorInit = () => ({ runId: 'mode-sector', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount: 1, characters: [0], unlocked: [] });
const ticks = (h: ReturnType<typeof harness>, from: number, n: number) => { for (let k = from + 1; k <= from + n; k++) h.advance(k * 1000 / 60 + 0.01); return from + n; };

describe('the duel mode over Net-3 (hostRuntime level)', () => {
  it.each([['sector', sectorMode, sectorInit()], ['duel', duelMode, duelInit(3, 'mode-duel')]] as const)('%s: start → captureCheckpoint → restore round trips reproduce identical hashes', async (_name, mode, init) => {
    const h = harness(mode);
    expect(h.command({ kind: 'start', initBytes: encode(init) }).ok).toBe(true);
    const at = ticks(h, 0, 120);
    const captured = await h.runtime.captureCheckpoint('periodic'), saved = decode(captured.bytes);
    expect(captured.capturedTick).toBe(saved.snapshot.header.tick);
    expect(saved.snapshot.header.tick).toBeGreaterThan(100);
    expect(h.command({ kind: 'restore', checkpointBytes: captured.bytes }).ok).toBe(true);
    const restored = h.command({ kind: 'checkpoint' });
    if (!restored.ok || !restored.checkpointBytes) throw Error('missing checkpoint');
    const again = decode(restored.checkpointBytes);
    expect(again.snapshot.values).toEqual(saved.snapshot.values);
    expect(hashF64(Float64Array.from(again.snapshot.values))).toBe(hashF64(Float64Array.from(saved.snapshot.values)));
    expect(again.phase).toBe('paused');
    if (mode === duelMode) { expect(again.snapshot.header.hash).toBe(saved.snapshot.header.hash); expect(again.modeMemory).toEqual(saved.modeMemory); }
    ticks(h, at, 30);   // the restored host stays paused, so no tick runs until a producer resumes it
    const still = h.command({ kind: 'checkpoint' });
    if (!still.ok || !still.checkpointBytes) throw Error('missing checkpoint');
    expect(decode(still.checkpointBytes).snapshot.values).toEqual(saved.snapshot.values);
  });
  it('attaches and detaches duel players over loopback ports: a duel command is applied and its result returns', () => {
    const h = harness(duelMode);
    h.command({ kind: 'start', initBytes: encode(duelInit(4, 'mode-duel')) });
    expect(() => h.runtime.attachPeer('third', [2], portEndpoint().port)).toThrow();
    const p = portEndpoint(), off = h.runtime.attachPeer('crew', [0, 1], p.port);
    ticks(h, 0, 5);
    p.receive({ version: 1, type: 'data', id: 1, kind: 'reliable-ordered', bytes: codec.encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-duel', id: { player: 1, sequence: 1 }, requestedTick: 5, command: { kind: 'presence', present: false } } }) });
    ticks(h, 5, 2);
    const messages = p.sent.filter((x: any) => x.type === 'data').map((x: any) => codec.decodeMessage(x.bytes));
    expect(messages.find((m) => m.kind === 'state')).toBeDefined();
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' }) }));
    p.receive({ version: 1, type: 'data', id: 2, kind: 'reliable-ordered', bytes: codec.encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-duel', id: { player: 0, sequence: 1 }, requestedTick: 7, command: { kind: 'laserCharge', held: true } } }) });
    ticks(h, 7, 2);
    const later = p.sent.filter((x: any) => x.type === 'data').map((x: any) => codec.decodeMessage(x.bytes));
    expect(later).toContainEqual(expect.objectContaining({ kind: 'result', result: expect.objectContaining({ id: { player: 0, sequence: 1 }, status: 'rejected', reason: 'not-at-weapons' }) }));
    off(); expect(p.closed).toBe(true); expect(p.listeners).toBe(0);
    const q = portEndpoint(); h.runtime.attachPeer('crew', [0], q.port); expect(q.closed).toBe(false);
  });
  it('a streamed duel attachment publishes state images that decode to the authority\'s publication', () => {
    const h = harness(duelMode);
    h.command({ kind: 'start', initBytes: encode(duelInit(6, 'mode-duel')) });
    const p = portEndpoint(); h.runtime.attachPeer('crew', [0, 1], p.port, { streamed: true, latestPayloadLimit: 4096 });
    ticks(h, 0, 3);
    const packets = p.sent.filter((x: any) => x.type === 'data').map((x: any) => x.bytes as Uint8Array).filter((b) => classifyStreamPacket(b).stream === 'state');
    expect(packets.length).toBeGreaterThan(0);
    const image = decodeState(decodeStatePacket(packets[0]!)), options = { resolveLayout: resolveCutter, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ };
    const publication = imageToDuelPublication(image, options);
    expect(publication.runId).toBe('mode-duel');
    expect(publication.hash).toBe(hashF64(image.values));
    expect(publication.snapshot.header.hash).toBe(publication.hash);
    expect(imageToDuelPublication(duelPublicationToImage(publication, options), options)).toEqual(publication);
    const tampered: DuelPublication = { ...publication, snapshot: { ...publication.snapshot, values: publication.snapshot.values.map((v, k) => k === 7 ? v + 1 : v) } };
    expect(() => duelPublicationToImage(tampered, options)).toThrow();
    // A rehashed out-of-bounds value (headingAcc rests in (-1, 1)): both hashes agree with the values, so only the
    // duel snapshot validator stands between it and the wire, on the host's toImage and on the image's way back.
    let at = 1;
    for (const f of spaceModule.fields(createTacticalState(6))) { if (f.name === 'ships.0.headingAcc') break; at += f.count; }
    const values = publication.snapshot.values.map((v, k) => k === at ? 1 : v), hash = hashF64(Float64Array.from(values));
    expect(values[at]).not.toBe(publication.snapshot.values[at]);
    const rehashed: DuelPublication = { ...publication, hash, snapshot: { header: { ...publication.snapshot.header, hash }, values } };
    expect(() => duelPublicationToImage(rehashed, options)).toThrow(/ships\.0\.headingAcc/);
    expect(() => imageToDuelPublication({ ...image, values: Float64Array.from(values),
      metadata: new TextEncoder().encode(JSON.stringify({ ...rehashed, snapshot: { header: rehashed.snapshot.header } })) }, options)).toThrow(/ships\.0\.headingAcc/);
  });
  it('a streamed duel attachment, once its full state is ACKed, applies a command and returns its result on duel-notification', () => {
    const h = harness(duelMode);
    h.command({ kind: 'start', initBytes: encode(duelInit(6, 'mode-duel')) });
    const p = portEndpoint(); h.runtime.attachPeer('crew', [0, 1], p.port, { streamed: true, latestPayloadLimit: 4096 });
    ticks(h, 0, 3);
    const data = () => p.sent.filter((x: any) => x.type === 'data').map((x: any) => x.bytes as Uint8Array);
    const full = data().find((b) => classifyStreamPacket(b).stream === 'state')!;
    let id = 0;
    const send = (bytes: Uint8Array) => p.receive({ version: 1, type: 'data', id: ++id, kind: 'reliable-ordered', bytes });
    send(encodeControl({ kind: 'ack', sequence: inspectState(decodeStatePacket(full)).sequence }, 1));
    send(encodeOpaquePacket('input', 'command', 2, codec.encodeMessage({ kind: 'command', envelope: {
      runId: 'mode-duel', id: { player: 1, sequence: 1 }, requestedTick: 3, command: { kind: 'presence', present: false } } })));
    ticks(h, 3, 2);
    expect(p.closed).toBe(false);
    const notifications = data().filter((b) => classifyStreamPacket(b).stream === 'duel-notification')
      .map((b) => codec.decodeMessage(decodeOpaquePacket(b).bytes.subarray(9)));   // after the envelope's version byte and publication floor
    expect(notifications).toContainEqual({ kind: 'result', runId: 'mode-duel', result: expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' }) });
  });
  it('the duel mode refuses a sector init and the sector mode a duel init, keeping the previous owner', () => {
    const duel = harness(duelMode), sector = harness(sectorMode);
    expect(duel.command({ kind: 'start', initBytes: encode(sectorInit()) }).ok).toBe(false);
    expect(sector.command({ kind: 'start', initBytes: encode(duelInit(1)) }).ok).toBe(false);
    expect(duel.command({ kind: 'start', initBytes: encode({ ...duelInit(1), playerCount: 5 }) }).ok).toBe(false);
    expect(duel.command({ kind: 'start', initBytes: encode({ ...duelInit(1), playerCount: 3 }) }).ok).toBe(true);   // Sci-2: a crew of three starts
    expect(duel.command({ kind: 'start', initBytes: encode(duelInit(1)) }).ok).toBe(true);
    expect(duel.command({ kind: 'restore', checkpointBytes: encode({ bad: true }) }).ok).toBe(false);
    expect(duel.command({ kind: 'checkpoint' }).ok).toBe(true);
  });
  it('the authority utility\'s own registry runs the duel: initialize, start, capture, restore, same hashes; and the sector', async () => {
    // authorityWorkerMain.ts is the host Worker's entry body (web build spec §3.2); the test drives the registry it is
    // built from, and checks that it is built from exactly that registry.
    expect(readFileSync('src/worker/authorityWorkerMain.ts', 'utf8')).toMatch(/createUtilityHost\(authorityModes, \{/);
    // The registry stores a frozen copy of each definition, so its entries are the definitions' own members.
    for (const mode of [duelMode, sectorMode]) {
      expect(authorityModes.get(mode.modeId)).toEqual(mode);
      expect(authorityModes.get(mode.modeId).createHost).toBe(mode.createHost);
    }
    const utility = (modeId: string, schemaVersion: number) => {
      let now = 0, request = 0; const messages: any[] = [], callbacks = new Set<() => void>();
      const owner = createUtilityHost(authorityModes, { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => now },
        scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } }, onCrash() {} }, m => messages.push(m));
      ownTestCleanup(() => owner.dispose());
      owner.receive({ kind: 'initialize', protocolVersion: 2, modeId, schemaVersion, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, hostGeneration: 3 }, []);
      expect(messages.at(-1)).toMatchObject({ kind: 'ready', modeId });
      const command = (c: object) => { owner.receive({ kind: 'command', command: { requestId: ++request, hostGeneration: 3, ...c } }, []); return messages.at(-1).response; };
      const capture = (cause: string) => { owner.receive({ kind: 'capture-checkpoint', requestId: ++request, hostGeneration: 3, cause }, []); };   // request ids are shared with commands
      return { owner, messages, command, capture, advance(n: number) { for (let k = 0; k < n; k++) { now += 1000 / 60; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } } } };
    };
    const u = utility('duel', duelMode.schemaVersion);   // the duel's schema version (Net-4a: 3)
    expect(u.command({ kind: 'start', initBytes: encode(duelInit(2, 'utility-duel')) }).ok).toBe(true);
    u.advance(90);
    u.capture('periodic');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const captured = u.messages.find((m) => m.kind === 'captured');
    expect(captured).toMatchObject({ ok: true });
    const saved = decode(captured.candidate.bytes);
    expect(saved.init.runId).toBe('utility-duel');
    expect(saved.snapshot.header).toMatchObject({ snapshotFormat: 1, seed: 2 });
    expect(saved.snapshot.header.tick).toBeGreaterThan(60);
    expect(u.command({ kind: 'restore', checkpointBytes: captured.candidate.bytes }).ok).toBe(true);
    const restored = decode(u.command({ kind: 'checkpoint' }).checkpointBytes);
    expect(restored.snapshot.values).toEqual(saved.snapshot.values);
    expect(restored.snapshot.header.hash).toBe(saved.snapshot.header.hash);
    expect(restored.modeMemory).toEqual(saved.modeMemory);
    const s = utility('sector', sectorMode.schemaVersion);
    expect(s.command({ kind: 'start', initBytes: encode(sectorInit()) }).ok).toBe(true);
    const sector = decode(s.command({ kind: 'checkpoint' }).checkpointBytes);
    expect(sector.snapshot.header).toMatchObject({ formatVersion: 2, layoutId: LAYOUT.id });
    expect(sector).not.toHaveProperty('modeMemory');
  });
});
