// Explicit one-time fixture authoring. The gate never invokes this file or rewrites expectations.
import { existsSync, writeFileSync } from 'node:fs';
import { computeContentDigest } from '../../build/contentDigest';
import { createSimState } from '../../src/renderer/src/sim/state';
import { createAuthorityCore } from '../../src/renderer/src/authority/core';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { layouts, actions, coreFor, executeFixture, packFixture, type Fixture, type Schedule } from './fixture';
import { ENEMY_SYS_HP } from '../../src/renderer/src/sim/tuning';
const path = 'tests/fixtures/determinism-v2.json';
if (existsSync(path)) throw Error('fixture already exists; no automatic overwrite or blessing');
const digest = computeContentDigest(process.cwd()), fixture: Fixture = { version: 2, runs: [], expected: { samples: [], boundaries: [] } };
for (const ship of ['cutter', 'skiff'] as const) {
  let completed = 0, run = 0;
  while (completed < 54_000) {
    const playerCount = ship === 'cutter' ? 3 : 2, mover = playerCount - 1;
    const seed = 20261114 + run, layout = layouts[ship], state = createSimState(layout, playerCount, seed, Array(playerCount).fill(0), { quirk: 0 });
    const nav = 0, weapon = ship === 'cutter' ? 2 : 1, science = ship === 'cutter' ? 3 : 2;
    state.run.column = 1; state.run.nodeType[4] = 2; state.run.calm = 0; state.run.wakeTick = 0;
    state.run.scrap = 200; state.run.event = 0; state.run.eventChoice = -1;
    state.debris.active[0] = 1; state.debris.stableId[0] = 99; state.debris.room[0] = 0;
    state.debris.impactTick[0] = 5; state.debris.warned[0] = 1; state.debris.frequency[0] = 1; state.nextStableId = 100;
    // An already-arrived enemy fires at tick 30: slot 0 was released at tick 5 and is reused by a new StableId.
    state.run.encounter = 2; state.run.encounterTick = 0;
    state.enemy.present = 1; state.enemy.hull = state.enemy.maxHull = 100; state.enemy.stableId = state.nextStableId++;
    state.enemy.sysHp.fill(ENEMY_SYS_HP); state.enemy.sysRepairTick.fill(-1); state.enemy.shieldFreq = 1;
    state.enemy.shieldLayers = 1; state.enemy.shieldRotateTick = 600; state.enemy.nextShotTick = 30;
    state.enemy.departTick = 18000; state.enemy.shotArmTick = 0;
    sitDown(state, 0, nav); sitDown(state, 1, ship === 'cutter' ? weapon : science);
    state.weapons.charge = 1;
    const init = { runId: `det-${ship}-${run}`, layoutId: ship, layoutHash: deriveLayout(layout).layoutHash, simVersion: SIM_VERSION, contentDigest: digest, seed, playerCount, characters: Array(playerCount).fill(0), unlocked: [], quirk: 0 };
    const core = createAuthorityCore({ init, contentDigest: digest, resolveLayout: () => layout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash: r => { throw Error(r.error); } }, state);
    const checkpoint = core.captureCheckpoint(); core.dispose();
    const visit = { sector: 0, beacon: 4, arrivalTick: 0 }, event = { visit, eventId: 0 };
    const schedule: Schedule = { ship, checkpoint, ticks: 54_000 - completed, ended: false, pauses: [60, 901],
      held: [
        { tick: 0, player: mover, held: { moveX: .6, moveY: .8, interactHeld: false } },
        { tick: 23, player: mover, held: { moveX: -1, moveY: -1, interactHeld: true } },
        { tick: 80, player: mover, held: { moveX: .125, moveY: -.75, interactHeld: true } },
        { tick: 144, player: mover, held: { moveX: 0, moveY: 0, interactHeld: false } },
        { tick: 450, player: mover, held: { moveX: 1, moveY: .33, interactHeld: false } },
        { tick: 510, player: mover, held: { moveX: 0, moveY: 0, interactHeld: true } }
      ], commands: [
        { tick: 0, player: 0, command: { kind: 'buy', station: nav, visit, item: 2, expectedOffer: 0 } },
        ...Array.from({ length: playerCount }, (_, player) => ({ tick: 1, player, command: { kind: 'vote' as const, event, choice: 0 } })),
        { tick: 2, player: 1, command: ship === 'cutter' ? { kind: 'selectTarget', station: weapon, target: { kind: 'object', stableId: 99 } } : { kind: 'scan', station: science, target: { kind: 'object', stableId: 99 } } },
        ...(ship === 'skiff' ? [
          { tick: 10, player: 0, command: { kind: 'tab' as const, group: 0, station: weapon } },
          { tick: 11, player: 1, command: { kind: 'tab' as const, group: 1, station: 3 } },
          { tick: 12, player: 1, command: { kind: 'buyReactor' as const, station: 3, expectedBonus: 0 } },
          { tick: 13, player: 1, command: { kind: 'tab' as const, group: 1, station: science } }
        ] : []),
        { tick: 61, player: ship === 'cutter' ? 1 : 0, command: { kind: 'fire', station: weapon, weapon: { selector: 0, expectedWeaponId: 1 }, target: { kind: 'object', stableId: 99 } } },
        ...(ship === 'skiff' ? [{ tick: 22, player: 1, command: { kind: 'stand' as const } }] : []),
        ...(ship === 'skiff' ? [{ tick: 299, player: 0, command: { kind: 'tab' as const, group: 0, station: nav } }] : []),
        { tick: 300, player: 0, command: { kind: 'buy', station: nav, visit, item: 2, expectedOffer: 0 } },
        ...(ship === 'skiff' ? [{ tick: 301, player: 0, command: { kind: 'tab' as const, group: 0, station: weapon } }] : []),
        { tick: 600, player: ship === 'cutter' ? 1 : 0, command: { kind: 'selectTarget', station: weapon, target: { kind: 'object', stableId: 99 } } },
        { tick: 700, player: mover, command: { kind: 'moveTo', tile: 0 } }
      ] };
    // Determine only the explicit end boundary during authoring. Commands never inspect state.
    const h = coreFor(schedule, digest);
    try {
      for (const action of actions(schedule)) {
        h.core.replayFrame({ tick: h.state.tick, eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] });
        if (h.state.ended) { schedule.ticks = h.state.tick; schedule.ended = true; break; }
      }
    } finally { h.core.dispose(); }
    schedule.held = schedule.held.filter(x => x.tick < schedule.ticks); schedule.commands = schedule.commands.filter(x => x.tick < schedule.ticks); schedule.pauses = schedule.pauses.filter(x => x < schedule.ticks);
    fixture.runs.push(schedule); completed += schedule.ticks; run++;
    console.log(`${ship} seed ${seed}: ${schedule.ticks} ticks, ended ${schedule.ended}, composite ${completed}`);
  }
}
fixture.expected = executeFixture(fixture, digest, false);
writeFileSync(path, JSON.stringify(packFixture(fixture)));
console.log(`Saved ${path}, ${fixture.expected.samples.length} samples`);
