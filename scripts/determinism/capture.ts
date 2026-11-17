// Explicit one-time fixture authoring. The gate never invokes this file or rewrites expectations.
import { existsSync, writeFileSync } from 'node:fs';
import { computeContentDigest } from '../../build/contentDigest';
import { createSimState } from '../../src/renderer/src/sim/state';
import { createAuthorityCore } from '../../src/renderer/src/authority/core';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import { layouts, actions, coreFor, executeFixture, packFixture, VARIANTS, variantName, type Fixture, type Schedule } from './fixture';
import { ENEMY_SYS_HP } from '../../src/renderer/src/sim/tuning';
import { StationKind } from '../../src/renderer/src/sim/stationKinds';
import type { Command, HeldInput } from '../../src/renderer/src/net/contracts';
const path = 'tests/fixtures/determinism-v2.json';
if (existsSync(path)) throw Error('fixture already exists; no automatic overwrite or blessing');
/** Schedules list entries in tick then player order (actions() keeps array order within one tick). */
const byTick = <T extends { tick: number; player: number }>(xs: T[]): T[] => xs.sort((a, b) => a.tick - b.tick || a.player - b.player);
const digest = computeContentDigest(process.cwd()), fixture: Fixture = { version: 2, runs: [], expected: { samples: [], boundaries: [] } };
// The production fleet is the Hound at every crew size (spec Art-iv-b). It is recorded at two crew sizes: two players
// (the Skiff's old role) and three (the Cutter's old role). Seats come from the layout's stations, never hard-coded.
for (const { ship, playerCount } of VARIANTS) {
  let completed = 0, run = 0;
  const layout = layouts[ship], d = deriveLayout(layout), variant = variantName(ship, playerCount), mover = playerCount - 1;
  const nav = d.stationOfKind[StationKind.Navigation]!, weapon = d.stationOfKind[StationKind.Weapons]!;
  const science = d.stationOfKind[StationKind.Science]!, engineering = d.stationOfKind[StationKind.Engineering]!;
  const ops = d.stationGroup[science]!;   // the Ops console group: Science, Engineering, Doors
  if ([nav, weapon, science, engineering].some(i => i < 0) || ops < 0 || d.stationGroup[engineering] !== ops || d.stationGroup[nav]! >= 0 || d.stationGroup[weapon]! >= 0)
    throw Error(`${variant}: expected separate Navigation and Weapons seats and an Ops group holding Science and Engineering`);
  while (completed < 54_000) {
    const seed = 20261114 + run, state = createSimState(layout, playerCount, seed, Array(playerCount).fill(0), { quirk: 0 });
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
    // Player 0 commands at Navigation; the mover starts at the Ops group; with three crew player 1 is the gunner.
    sitDown(state, 0, nav); sitDown(state, mover, science); if (playerCount === 3) sitDown(state, 1, weapon);
    state.weapons.charge = 1;
    const init = { runId: `det-${variant}-${run}`, layoutId: ship, layoutHash: d.layoutHash, simVersion: SIM_VERSION, contentDigest: digest, seed, playerCount, characters: Array(playerCount).fill(0), unlocked: [], quirk: 0 };
    const core = createAuthorityCore({ init, contentDigest: digest, resolveLayout: () => layout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash: r => { throw Error(r.error); } }, state);
    const checkpoint = core.captureCheckpoint(); core.dispose();
    const visit = { sector: 0, beacon: 4, arrivalTick: 0 }, event = { visit, eventId: 0 };
    const target = { kind: 'object' as const, stableId: 99 }, gunner = playerCount === 3 ? 1 : 0;
    const still: HeldInput = { moveX: 0, moveY: 0, interactHeld: false }, up: HeldInput = { moveX: 0, moveY: -1, interactHeld: false }, down: HeldInput = { moveX: 0, moveY: 1, interactHeld: false };
    // Two crew: Navigation and Weapons are separate seats (no group-0 tabs), so player 0 walks between them instead:
    // stand, a short held walk inside the Bridge, sit. The ticks mirror the Skiff's old group-0 tabs (10, 299, 301).
    const walk = (tick: number, dir: HeldInput) => [{ tick, player: 0, held: dir }, { tick: tick + 6, player: 0, held: still }];
    const commuteHeld = playerCount === 2 ? [...walk(24, up), ...walk(291, down), ...walk(303, up)] : [];
    const commute: { tick: number; player: number; command: Command }[] = playerCount === 2 ? [
      { tick: 20, player: 0, command: { kind: 'stand' } }, { tick: 40, player: 0, command: { kind: 'sit', station: weapon } },
      { tick: 290, player: 0, command: { kind: 'stand' } }, { tick: 298, player: 0, command: { kind: 'sit', station: nav } },
      { tick: 302, player: 0, command: { kind: 'stand' } }, { tick: 311, player: 0, command: { kind: 'sit', station: weapon } }
    ] : [];
    const schedule: Schedule = { ship, checkpoint, ticks: 54_000 - completed, ended: false, pauses: [60, 901],
      held: byTick<Schedule['held'][number]>([
        { tick: 0, player: mover, held: { moveX: .6, moveY: .8, interactHeld: false } },
        { tick: 23, player: mover, held: { moveX: -1, moveY: -1, interactHeld: true } },
        { tick: 80, player: mover, held: { moveX: .125, moveY: -.75, interactHeld: true } },
        { tick: 144, player: mover, held: { moveX: 0, moveY: 0, interactHeld: false } },
        { tick: 450, player: mover, held: { moveX: 1, moveY: .33, interactHeld: false } },
        { tick: 510, player: mover, held: { moveX: 0, moveY: 0, interactHeld: true } },
        ...commuteHeld
      ]), commands: byTick<Schedule['commands'][number]>([
        { tick: 0, player: 0, command: { kind: 'buy', station: nav, visit, item: 2, expectedOffer: 0 } },
        ...Array.from({ length: playerCount }, (_, player) => ({ tick: 1, player, command: { kind: 'vote' as const, event, choice: 0 } })),
        ...(playerCount === 3 ? [{ tick: 2, player: 1, command: { kind: 'selectTarget' as const, station: weapon, target } }] : []),
        { tick: 2, player: mover, command: { kind: 'scan', station: science, target } },
        // The Ops group's tabs (group-1 tabs on the Skiff): Science -> Engineering, buy reactor, back to Science.
        { tick: 11, player: mover, command: { kind: 'tab', group: ops, station: engineering } },
        { tick: 12, player: mover, command: { kind: 'buyReactor', station: engineering, expectedBonus: 0 } },
        { tick: 13, player: mover, command: { kind: 'tab', group: ops, station: science } },
        { tick: 22, player: mover, command: { kind: 'stand' } },
        ...commute,
        { tick: 61, player: gunner, command: { kind: 'fire', station: weapon, weapon: { selector: 0, expectedWeaponId: 1 }, target } },
        { tick: 300, player: 0, command: { kind: 'buy', station: nav, visit, item: 2, expectedOffer: 0 } },
        { tick: 600, player: gunner, command: { kind: 'selectTarget', station: weapon, target } },
        { tick: 700, player: mover, command: { kind: 'moveTo', tile: 0 } }
      ]) };
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
    console.log(`${variant} seed ${seed}: ${schedule.ticks} ticks, ended ${schedule.ended}, composite ${completed}`);
  }
}
fixture.expected = executeFixture(fixture, digest, false);
writeFileSync(path, JSON.stringify(packFixture(fixture)));
console.log(`Saved ${path}, ${fixture.expected.samples.length} samples`);
