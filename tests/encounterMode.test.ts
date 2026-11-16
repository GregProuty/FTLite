// The mode factory (engine refactor spec §6, R-1a): defineEncounterMode builds a Net-3 ModeDefinition whose host keeps
// the merged lifecycle. The sector mode is one call to it; the same call under another mode id runs identically.
import { describe, expect, it } from 'vitest';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { sectorMode } from '../src/network/modes/sector';
import { defineEncounterMode, jsonModeCodecs } from '../src/network/modes/encounterMode';
import { createSectorProducers } from '../src/network/modes/sectorProducers';
import { createSectorStreamBinding } from '../src/network/modes/sectorStream';
import type { ModeDefinition, ModeHostDeps } from '../src/network/modes/contracts';
import { sectorRules } from '../src/renderer/src/authority/sectorRules';
import { createAuthority, createEncounterAuthority } from '../src/renderer/src/authority/authority';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import type { HostCommandInput } from '../src/shared/netSession';
import type { Link } from '../src/renderer/src/net/contracts';

const encode = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
const decode = (x: Uint8Array) => JSON.parse(new TextDecoder().decode(x));
const resolveLayout = (id: string) => { if (id !== LAYOUT.id) throw Error('unknown layout'); return LAYOUT; };
/** The sector's rules under another mode id: the rules carry the id the core stamps on replays. */
const copyRules = { ...sectorRules, modeId: 'sector-copy' };
const copy = defineEncounterMode({ modeId: 'sector-copy', schemaVersion: 1, simVersion: SIM_VERSION, rules: copyRules, resolveLayout,
  codecs: jsonModeCodecs(copyRules, resolveLayout, 'sector-copy'),
  producers: ({ authority, init, contentDigest, restoredControllers }) => createSectorProducers({ authority, runId: init.runId, playerCount: init.playerCount, contentDigest, resolveLayout, restoredControllers }),
  publication: (link, options) => createSectorStreamBinding(link, options) });
function copyOptions() {
  return { schemaVersion: 1, simVersion: SIM_VERSION, resolveLayout, codecs: jsonModeCodecs(sectorRules, resolveLayout, 'x'),
    producers: () => { throw new Error('unused'); }, publication: () => { throw new Error('unused'); } };
}
const init = () => ({ runId: 'factory', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 9, playerCount: 2, characters: [0, 0], unlocked: [] });
function harness(mode: ModeDefinition) {
  let now = 0; const callbacks = new Set<() => void>();
  const deps: ModeHostDeps = { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => now },
    scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } }, onCrash() {} };
  const runtime = createHostRuntime(createModeRegistry([sectorMode, copy]), deps, { modeId: mode.modeId, schemaVersion: 1, simVersion: SIM_VERSION, hostGeneration: 1 });
  ownTestCleanup(() => runtime.dispose());
  let id = 0;
  return { runtime, deps, advance(t: number) { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    command(input: HostCommandInput) { return runtime.handle({ ...input, requestId: ++id, hostGeneration: 1 }); } };
}

describe('defineEncounterMode', () => {
  it('the same rules under another mode id run identically to the sector mode, start to captured checkpoint', async () => {
    const a = harness(sectorMode), b = harness(copy);
    for (const h of [a, b]) {
      expect(h.command({ kind: 'start', initBytes: encode(init()) }).ok).toBe(true);
      for (let k = 1; k <= 200; k++) h.advance(k * 1000 / 60 + 0.01);
    }
    const [x, y] = await Promise.all([a.runtime.captureCheckpoint('periodic'), b.runtime.captureCheckpoint('periodic')]);
    expect(decode(y.bytes)).toEqual(decode(x.bytes));
    expect(y.capturedTick).toBe(x.capturedTick);
  });
  it('one mode identity: the factory refuses rules with another mode id, and replays carry the rules\' id', () => {
    expect(() => defineEncounterMode({ ...copyOptions(), modeId: 'sector-copy', rules: sectorRules })).toThrow(/mode id sector-copy does not match its rules \(sector\)/);
    const deps = { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() {} };
    const renamed = createEncounterAuthority(copyRules, deps), sector = createAuthority(deps);
    ownTestCleanup(() => { renamed.dispose(); sector.dispose(); });
    renamed.start(init()); sector.start(init());
    expect(renamed.replay().mode).toBe('sector-copy');
    expect(sector.replay()).not.toHaveProperty('mode');
  });
  it('keeps the merged host lifecycle: no replacement while attached, bounded payloads, validated ownership', () => {
    const h = harness(copy), deps = h.deps, host = copy.createHost(deps);
    ownTestCleanup(() => host.dispose());
    expect(() => host.checkpoint()).toThrow(/sector-copy unavailable/);
    host.start(encode(init()));
    expect(() => host.attach(link(), [2], 'receive-time')).toThrow(/invalid sector-copy ownership/);
    const off = host.attach(link(), [0], 'receive-time');
    expect(() => host.start(encode(init()))).toThrow(/detach producers before replacing sector-copy/);
    off(); host.start(encode(init()));
    expect(() => host.start(new Uint8Array(262145))).toThrow(/sector-copy payload exceeds limit/);
    expect(decode(host.checkpoint()).init.runId).toBe('factory');
    expect(() => host.pause('')).toThrow();
  });
});

function link(): Link {
  return { peer: 'test', caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false }, send() {}, onMessage: () => () => {}, onClose: () => () => {},
    close() {}, stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
}
