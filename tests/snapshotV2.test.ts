import { describe, expect, it } from 'vitest';
import { getAllEntities } from 'bitecs';
import { createSimState, saveSnapshot, loadSnapshot, ownTestCleanup } from './helpers/simLifetime';
import * as snapshots from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { CUTTER, LAYOUT } from './helpers/sim';
import { Stable } from '../src/renderer/src/sim/components';
import { canonicalFields } from '../src/renderer/src/sim/flatten';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { encodeMessage } from '../src/renderer/src/net/codec';
import { hashF64 } from '../src/shared/hash';
import type { Snapshot } from '../src/renderer/src/sim/snapshot';
import type { SimState } from '../src/renderer/src/sim/state';

describe('transactional snapshot format 2', () => {
  it('binds format and content metadata', () => {
    const snap = saveSnapshot(createSimState(LAYOUT, 2, 13));
    expect(snap.header.formatVersion).toBe(2);
    expect(snap.header).toHaveProperty('contentDigest', __GAMEPLAY_CONTENT_DIGEST__);
  });
  it.each([
    ['old format', (s: Snapshot) => { s.header.formatVersion = 1; }],
    ['sim version', (s: Snapshot) => { s.header.simVersion++; }],
    ['layout id', (s: Snapshot) => { s.header.layoutId = 'wrong'; }],
    ['layout hash', (s: Snapshot) => { s.header.layoutHash = '00000000'; }],
    ['content digest', (s: Snapshot) => { s.header.contentDigest = '0'.repeat(64); }],
    ['manifest', (s: Snapshot) => { s.header.manifest.reverse(); }],
    ['wholly sparse manifest', (s: Snapshot) => { s.header.manifest = new Array<string>(s.header.manifest.length); }],
    ['deleted manifest entry', (s: Snapshot) => { delete s.header.manifest[3]; }],
    ['truncated', (s: Snapshot) => { s.values.pop(); }],
    ['excess', (s: Snapshot) => { s.values.push(0); }],
    ['NaN', (s: Snapshot) => { s.values[20] = NaN; }],
    ['Infinity', (s: Snapshot) => { s.values[20] = Infinity; }],
    ['tick mismatch', (s: Snapshot) => { s.header.tick++; }],
    ['rng mismatch', (s: Snapshot) => { s.header.rngStates.hazards = s.header.rngStates.hazards! + 1; }],
    ['player mismatch', (s: Snapshot) => { s.values[5] = s.values[5]! + 1; }],
    ['crew mismatch', (s: Snapshot) => { s.values[9] = s.values[9]! + 1; }],
    ['fractional tick', (s: Snapshot) => { s.header.tick = s.values[3] = 0.5; }],
    ['invalid flag', (s: Snapshot) => { s.values[7] = 2; }],
    ['invalid end reason', (s: Snapshot) => { s.values[8] = 99; }],
    ['negative hull', (s: Snapshot) => { s.values[6] = -1; }],
    ['missing header', (s: Snapshot) => { delete (s as Partial<Snapshot>).header; }],
    ['missing rng stream', (s: Snapshot) => { delete s.header.rngStates.hazards; }],
    ['extra member', (s: Snapshot) => { (s as unknown as Record<string, unknown>).extra = true; }],
    ['non-numeric value', (s: Snapshot) => { (s.values as unknown[])[20] = '1'; }]
  ])('rejects %s without touching live state or allocating crew', (_name, corrupt) => {
    const state = createSimState(LAYOUT, 2, 13), hash = hashState(state);
    const snap = saveSnapshot(state), entities = [...getAllEntities(state.world)];
    const allocation = [Stable.id.length, Object.keys(Stable.id).length];
    corrupt(snap);
    expect(() => snapshots.validateSnapshot(LAYOUT, snap)).toThrow();
    expect(() => snapshots.restoreSnapshot(state, snap)).toThrow();
    expect(hashState(state)).toBe(hash);
    expect(getAllEntities(state.world)).toEqual(entities);
    expect(() => loadSnapshot(LAYOUT, snap)).toThrow();
    expect([Stable.id.length, Object.keys(Stable.id).length]).toEqual(allocation);
  });
  it('restores in place and accepts signed historical arrival ticks', () => {
    const state = createSimState(LAYOUT, 2, 13), world = state.world, rooms = state.rooms.o2, crew = state.crew;
    state.run.arrivalTick = -600;
    const snap = saveSnapshot(state), expected = hashState(state);
    state.hull = 25;
    snapshots.restoreSnapshot(state, snap);
    expect(hashState(state)).toBe(expected);
    expect(state.world).toBe(world); expect(state.rooms.o2).toBe(rooms); expect(state.crew).toBe(crew);
    expect(snapshots.validateSnapshot(LAYOUT, snap)).toEqual(snap);
  });
  it('explicitly rejects legacy format 1 even without the new digest member', () => {
    const snap = saveSnapshot(createSimState(LAYOUT, 1, 1));
    const { contentDigest: _digest, ...header } = snap.header;
    expect(() => snapshots.validateSnapshot(LAYOUT, { ...snap, header: { ...header, formatVersion: 1 } })).toThrow(/format 1 not supported/);
  });
  it('binds an explicit unbundled digest and rejects a different expected digest', () => {
    const state = createSimState(LAYOUT, 1, 1), digest = 'a'.repeat(64);
    const snap = saveSnapshot(state, digest);
    expect(snapshots.validateSnapshot(LAYOUT, snap, digest).header.contentDigest).toBe(digest);
    expect(() => snapshots.validateSnapshot(LAYOUT, snap, 'b'.repeat(64))).toThrow(/content digest/);
    expect(() => snapshots.restoreSnapshot(state, snap, 'b'.repeat(64))).toThrow(/content digest/);
    expect(() => loadSnapshot(LAYOUT, snap, 'b'.repeat(64))).toThrow(/content digest/);
  });
  it.each([
    ['doors.state', 4], ['debris.frequency', 4], ['stations.occupant', 2], ['crew.0.station', 100],
    ['crew.0.life', 3], ['crew.0.health', -1], ['crew.0.x', 1e6], ['boarders.room', 100],
    ['weapons.$targetKind', 3], ['weapons.selector', 100], ['run.nodeType', 5], ['run.sector', 3],
    ['run.upgrades', 4], ['stations.heat', 0.25], ['run.vote', -2], ['crewCharacter', 255],
    ['enemy.sysHp', 31], ['boarders.health', 61], ['science.systemResult', 1e6]
  ])('rejects invalid %s before restoring any earlier fields', (name, value) => {
    const state = createSimState(LAYOUT, 2, 1), before = hashState(state), snap = saveSnapshot(state);
    snap.header.tick = snap.values[3] = 99;
    const field = canonicalFields(LAYOUT, 2).find(f => f.name === name)!;
    snap.values[field.offset] = value;
    expect(() => snapshots.restoreSnapshot(state, snap)).toThrow();
    expect(hashState(state)).toBe(before);
  });
  it('validates every publication and validates a replacement before disposing its prior world', () => {
    const digest = __GAMEPLAY_CONTENT_DIGEST__, transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: digest });
    const pair = transport.connectLocal(), client = createClientRun(pair.clientLink, [0], { runId: 'snapshot-v2', resolveLayout: id => id === LAYOUT.id ? LAYOUT : CUTTER });
    ownTestCleanup(() => { client.dispose(); pair.host.close('done'); pair.client.close('done'); });
    const initial = createSimState(LAYOUT, 1, 1), replacement = createSimState(CUTTER, 2, 1);
    const publish = (state: SimState, snap: Snapshot, sequence: number): void => {
      const water = Array.from({ length: state.playerCount }, () => 0);
      pair.authorityLink.send('reliable-ordered', encodeMessage({ kind: 'state', state: { runId: 'snapshot-v2', tick: snap.header.tick,
        publicationSequence: sequence, snapshot: snap, hash: hashF64(Float64Array.from(snap.values)), phase: 'running', pauseOwner: null,
        pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: water, heldHighWater: water, auxiliaryHighWater: water, eventSequence: 0 } }));
      transport.drain();
    };
    publish(initial, saveSnapshot(initial), 1);
    const replica = client.state()!, world = replica.world, rooms = replica.rooms.o2, before = hashState(replica);
    const bad = saveSnapshot(initial); bad.header.manifest.reverse();
    publish(initial, bad, 2);
    expect(client.state()).toBe(replica); expect(hashState(replica)).toBe(before);
    initial.hull = 75; publish(initial, saveSnapshot(initial), 2);
    expect(client.state()).toBe(replica); expect(replica.world).toBe(world); expect(replica.rooms.o2).toBe(rooms);
    const wrong = saveSnapshot(replacement); wrong.values[7] = 3;
    publish(replacement, wrong, 3);
    expect(client.state()).toBe(replica); expect(getAllEntities(world)).toHaveLength(1);
    publish(replacement, saveSnapshot(replacement), 3);
    expect(client.state()).not.toBe(replica); expect(getAllEntities(world)).toHaveLength(0);
    expect(hashState(client.state()!)).toBe(hashState(replacement));
  });
});
