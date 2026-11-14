import { describe, expect, it } from 'vitest';
import { entityExists, getAllEntities, query } from 'bitecs';
import * as sim from '../src/renderer/src/sim/state';
import { Health, Life, LifeState, Owner, Position, Seated, Stable } from '../src/renderer/src/sim/components';
import { flatten, unflatten } from '../src/renderer/src/sim/flatten';
import { hashState } from '../src/renderer/src/sim/hash';
import { loadSnapshot, saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { stepCommands } from '../src/renderer/src/sim/step';
import { HEALTH_MAX, SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { createHeadlessRunner } from '../src/renderer/src/headless/runner';
import { createAuthority } from '../src/renderer/src/authority/authority';
import { createLocalRuntime } from '../src/renderer/src/app/localRuntime';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { LAYOUT, RECRUITS } from './helpers/sim';

const cells = [Position.x, Position.y, Health.cur, Life.state, Life.bleed, Life.reviveProgress, Life.reviverPid, Stable.id, Owner.pid, Seated.station];
const highWater = () => cells.map(a => a.length);
const create = (seed = 1) => sim.createSimState(LAYOUT, 4, seed, RECRUITS);
const input = { held: [{ moveX: 1, moveY: 0, interactHeld: false }], commands: [] };

describe('simulation ownership', () => {
  // Missing removal, a global-index reset, or stale component cells breaks this gate.
  it('bounds 2,000 four-crew lifetimes without changing a live sentinel', () => {
    expect(sim.disposeSimState).toBeTypeOf('function');
    const sentinel = create(91), before = hashState(sentinel);
    const warm = create(); sim.disposeSimState(warm); const bound = highWater();
    try {
      for (let i = 0; i < 2000; i++) {
        const state = create(i), world = state.world, ids = [...state.crew];
        for (const eid of ids) { Health.cur[eid] = 1; Seated.station[eid] = 7; }
        sim.disposeSimState(state);
        expect(getAllEntities(world)).toEqual([]);
        expect(query(world, [Position])).toHaveLength(0);
        expect(ids.every(eid => !entityExists(world, eid))).toBe(true);
        for (const eid of ids) for (const cell of cells) expect(cell[eid] ?? 0).toBe(0);
        expect(highWater()).toEqual(bound);
      }
      expect(hashState(sentinel)).toBe(before);
      const recycled = create();
      try {
        for (let pid = 0; pid < recycled.playerCount; pid++) {
          const eid = recycled.crew[pid]!;
          expect([Health.cur[eid], Seated.station[eid], Life.state[eid], Life.bleed[eid], Life.reviveProgress[eid], Life.reviverPid[eid], Stable.id[eid], Owner.pid[eid]])
            .toEqual([HEALTH_MAX, -1, LifeState.Conscious, 0, 0, -1, pid + 1, pid]);
        }
        sim.disposeSimState(warm); // Repeated teardown must not remove newly recycled IDs.
        expect(getAllEntities(recycled.world)).toHaveLength(4);
        expect(getAllEntities(warm.world)).toEqual([]);
      } finally { sim.disposeSimState(recycled); }
    } finally { sim.disposeSimState(sentinel); }
  });

  it('rejects all public stepping and serialization after disposal, even for ended runs', () => {
    const state = create(), values = flatten(state); state.ended = 1;
    sim.disposeSimState(state); sim.disposeSimState(state);
    for (const action of [() => sim.assertSimStateLive(state), () => stepCommands(state, input), () => flatten(state), () => unflatten(state, values), () => saveSnapshot(state), () => hashState(state)])
      expect(action).toThrow(/disposed/);
    expect(state.crew).toEqual([]);
  });

  it('matches isolated runs while interleaving live worlds and snapshot loads', () => {
    const isolated = (seed: number) => {
      const state = create(seed);
      try { for (let t = 0; t < 60; t++) stepCommands(state, input); return hashState(state); }
      finally { sim.disposeSimState(state); }
    };
    const expected = [isolated(5), isolated(6)];
    let a = create(5), b = create(6);
    try {
      for (let t = 0; t < 60; t++) {
        stepCommands(a, input); stepCommands(b, input);
        if (t % 10 === 0) {
          const restored = loadSnapshot(LAYOUT, saveSnapshot(a));
          expect(hashState(restored)).toBe(hashState(a)); sim.disposeSimState(a); a = restored;
          const other = loadSnapshot(LAYOUT, saveSnapshot(b));
          expect(hashState(other)).toBe(hashState(b)); sim.disposeSimState(b); b = other;
        }
      }
      expect([hashState(a), hashState(b)]).toEqual(expected);
    } finally { sim.disposeSimState(a); sim.disposeSimState(b); }
  });

  // Failure after one spawn and after all spawns must both return IDs to the shared index.
  it.each(['spawn', 'bonuses', 'layout', 'values'] as const)('releases allocations when %s construction fails', (failure) => {
    const source = create(), snapshot = saveSnapshot(source), sentinelHash = hashState(source);
    const warm = create(); sim.disposeSimState(warm); const bound = highWater();
    try {
      for (let i = 0; i < 30; i++) {
        const badLayout = { ...LAYOUT, spawns: [LAYOUT.spawns[0]!] };
        expect(() => {
          if (failure === 'spawn') sim.createSimState(badLayout, 4, 1);
          else if (failure === 'bonuses') sim.createSimState(LAYOUT, 4, 1, RECRUITS, { get unlocked(): string[] { throw Error('bonus failure'); } });
          else if (failure === 'layout') loadSnapshot(LAYOUT, { ...snapshot, header: { ...snapshot.header, layoutHash: 'bad' } });
          else loadSnapshot(LAYOUT, { ...snapshot, values: [] });
        }).toThrow();
        const probe = create(); sim.disposeSimState(probe);
        expect(highWater()).toEqual(bound);
      }
      expect(hashState(source)).toBe(sentinelHash);
    } finally { sim.disposeSimState(source); }
  });

  it('disposes both headless worlds and invalidates borrowed views', () => {
    const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 4, seed: 1, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ });
    const view = runner.view(), ids = [...view.crew];
    runner.dispose(); runner.dispose();
    expect(() => hashState(view)).toThrow(/disposed/);
    expect(getAllEntities(view.world)).toEqual([]);
    expect(ids.every(id => Health.cur[id] === undefined || Health.cur[id] === 0)).toBe(true);
    expect(() => runner.view()).toThrow();
  });

  it.each(['headless', 'couch'] as const)('releases %s authority and replica allocations if startup throws after publication', (kind) => {
    const make = (factory = createAuthority) => kind === 'headless'
      ? createHeadlessRunner({ layout: LAYOUT, playerCount: 4, seed: 1, contentDigest: __GAMEPLAY_CONTENT_DIGEST__ }, factory)
      : createLocalRuntime({ layout: LAYOUT, playerCount: 4, seed: 1, characters: RECRUITS, unlocked: [], runId: 'couch-test', contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
        clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, frames: () => [], onCrash() {}, authorityFactory: factory });
    const warm = make();
    warm.dispose(); const bound = highWater();
    for (let i = 0; i < 20; i++) {
      expect(() => make(deps => {
        const authority = createAuthority(deps);
        return { ...authority, start(init) { authority.start(init); deps.beforeControls?.(); throw Error('startup failure'); } };
      })).toThrow(/startup failure/);
      expect(highWater()).toEqual(bound);
    }
  });

  it('owns adopted worlds and disposes them even if a lifecycle unsubscriber throws', () => {
    const state = create();
    const core = createFixtureAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, contentDigest: 'test', resolveLayout: () => LAYOUT, onCrash() {},
      bindLifecyclePause: () => () => { throw Error('unsubscribe failure'); },
      init: { runId: 'test', seed: 1, playerCount: 4, characters: RECRUITS, unlocked: [], layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest: 'test' } }, state);
    expect(() => core.dispose()).toThrow(/unsubscribe failure/);
    expect(() => hashState(state)).toThrow(/disposed/); expect(getAllEntities(state.world)).toEqual([]);
    expect(() => core.dispose()).not.toThrow();
  });

  it('retains the live authority when replacement construction fails and cancels the failed timer', () => {
    let fail = false;
    const timers = new Set<() => void>();
    const authority = createAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule(_delay, callback) { timers.add(callback); return () => { timers.delete(callback); }; } },
      contentDigest: 'test', resolveLayout: () => LAYOUT, onCrash() {}, bindLifecyclePause() { if (fail) throw Error('binding failed'); } });
    const init = { runId: 'replacement', seed: 1, playerCount: 4, characters: RECRUITS, unlocked: [], layoutId: LAYOUT.id,
      layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION, contentDigest: 'test' };
    try {
      authority.start(init);
      const warm = create(); sim.disposeSimState(warm); const bound = highWater();
      fail = true;
      for (let i = 0; i < 20; i++) {
        expect(() => authority.start(init)).toThrow(/binding failed/);
        expect(timers.size).toBe(1); expect(highWater()).toEqual(bound);
      }
      fail = false;
      for (let i = 0; i < 20; i++) { authority.start(init); expect(timers.size).toBe(1); expect(highWater()).toEqual(bound); }
    } finally { authority.dispose(); }
    expect(timers.size).toBe(0);
  });

  it('disposes an adopted world when the initial clock rejects construction', () => {
    const state = create();
    expect(() => createFixtureAuthority({ clock: { nowMs: () => NaN }, scheduler: { schedule: () => () => {} }, contentDigest: 'test', resolveLayout: () => LAYOUT, onCrash() {},
      init: { runId: 'test', seed: 1, playerCount: 4, characters: RECRUITS, unlocked: [], layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION, contentDigest: 'test' } }, state)).toThrow(/initial clock/);
    expect(() => hashState(state)).toThrow(/disposed/); expect(getAllEntities(state.world)).toEqual([]);
  });
});
