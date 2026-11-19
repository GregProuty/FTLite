// The duel checkpoint through the generic authority core (engine refactor spec §6, R-1b): the continuation proof with
// the end summary, duel replays, the size bound and checkpoint validation; and the duel codec's command kinds.
import { describe, expect, it } from 'vitest';
import { createEncounterAuthority } from '../src/renderer/src/authority/authority';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { runModeReplay, replayMode } from '../src/renderer/src/authority/replay';
import { MAX_HOST_BYTES } from '../src/shared/netSession';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { Outcome, placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';
import { jsonModeCodecs } from '../src/network/modes/encounterMode';
import { createDriver, duelCore, duelInit, resolveCutter, stepScripted, throughBytes, type DuelCore } from './helpers/duelAuthority';
import type { ReplayFrame } from '../src/renderer/src/sim/replay';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';
import { checkpointRig } from './helpers/checkpointRig';
import { LAYOUT } from './helpers/sim';
import { runReplay } from '../src/renderer/src/authority/replay';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** Seed 10's scripted duel is a crew loss at tick 9953 (the merge of the Engineering spike with W-1, W-2 and W-3; at SPLIT 6283;
 *  seeds 1 to 9 do at 8026, 6102, 5952, 5050, 6342, 6059, 5963, 6253 and 6107). It was a crew loss at tick 8363 (SIM_VERSION 55, W-1's pew merged with asteroids-ii, HUNTER_PEW_ERROR 16; at SPLIT 6233;
 *  seeds 5 and 7 have no qualifying tick, seeds 1 to 4, 6, 8 and 9 do at 5000, 7904, 7588, 7956, 6055, 6328 and 6014; on the W-1 branch,
 *  SIM_VERSION 54, seed 6 was a crew loss at tick 9700 at SPLIT 5000). Seed 2 was used before: a crew loss at tick 14424 (SIM_VERSION 53, spike ii with the fan split at r 13; at SPLIT 7195;
 *  seeds 1, 5 and 7 to 9 have no qualifying tick, seeds 3, 4, 6 and 10 do at 5823, 6156, 6055 and 9861). Before the fan
 *  tuning it was a crew win at tick 25426 (SIM_VERSION 53, spike ii billiard asteroids; at SPLIT 7195; seeds
 *  1 and 4 to 10 had no qualifying tick, seed 3 did at 9599). Seed 1 was used before: a crew win at tick 5980 (SIM_VERSION 50,
 *  Feel-i's opener and auto-face; at SPLIT 5000; seeds 3 to 8 and 10 had no qualifying tick, seed 2 and 9 did at 10146 and 5125). Seed 5 was used before: a crew win at tick
 *  14986 (SIM_VERSION 49, FTL targeting; at SPLIT 5434). Seed 3 was used before: a crew win at tick 15361 (SIM_VERSION 48, the weapons
 *  update; at SPLIT 5395). Seed 6 was used before: a crew win at tick 11401 (SIM_VERSION 47, Sci-1 merged with the Hunter grace; at SPLIT 6249;
 *  seed 9 has no qualifying tick since). Seed 9 was used before: a crew loss at tick 8777 (SIM_VERSION 46, homing
 *  torpedoes; at SPLIT 5108). Seed 4 before that: a crew loss at tick 8859 with SPLIT 5193 (SIM_VERSION 45, the Hunter's grace; now a crew win at 9346); seed 7 before that: a crew loss at tick 8069 (8311 before Artemis-ii, SIM_VERSION 43; 7282 before duel health, SIM_VERSION 41; 8832 before duel fire), short enough to run to its end twice.
 *  SPLIT is the first tick from 5000 on that ends with a missile in flight, a damaged crew room and a repair in
 *  progress (found by stepping the scripted duel; the test asserts all three). */
const SEED = 10, SPLIT = 6283;   // merge of the Engineering spike with W-1, W-2 and W-3: was 6233 (master, SIM 57); the spike alone used seed 2 at 6104
function runToEnd(h: DuelCore, driver: ReturnType<typeof createDriver>, hashes: string[], frames: ReplayFrame[] = [], until = Infinity) {
  while (h.state.duel.tactical.outcome === Outcome.Running && duelRules.tick(h.state) < until) {   // to the round's decision (H-2: the run itself never ends)
    for (const frame of stepScripted(h, driver)) { frames.push(frame); if (frame.action.kind === 'tick') hashes.push(frame.after!.hash); }
  }
}

describe('the duel checkpoint through the generic core (spec §6)', () => {
  it('continuation proof: N ticks, checkpoint through bytes, restore, M ticks equals N + M uninterrupted, end summary included', () => {
    const reference = duelCore(duelInit(SEED)), referenceHashes: string[] = [];
    const split = duelCore(duelInit(SEED)), splitHashes: string[] = [], driver = createDriver(SEED);
    try {
      runToEnd(reference, createDriver(SEED), referenceHashes);
      runToEnd(split, driver, splitHashes, [], SPLIT);
      const at = split.state.duel;
      expect(at.tactical.missiles.some((m) => m.active), 'a missile in flight at the split').toBe(true);
      expect(at.tactical.systems[0].rooms.some((r) => r > 0), 'a damaged crew room at the split').toBe(true);
      expect(at.repair.some((r) => r > 0), 'a repair in progress at the split').toBe(true);
      const cp = throughBytes(split.core.captureCheckpoint());
      expect(cp.snapshot.header.tick).toBe(SPLIT);
      expect(cp).toHaveProperty('modeMemory.version', 1);
      const resumed = duelCore(cp.init, cp);
      try {
        expect(duelRules.hash(resumed.state)).toBe(splitHashes.at(-1));
        runToEnd(resumed, driver, splitHashes);
        expect(splitHashes).toEqual(referenceHashes);
        // A decided round is the end card, never the end of the run (H-2 spec §7): its summary is the session's.
        expect(duelRules.terminal(reference.state, reference.init)).toEqual({ ended: false, endRecord: null });
        const end = reference.state.summary;
        expect(resumed.state.summary).toEqual(end);
        expect(resumed.core.captureCheckpoint().modeMemory, 'the final telemetry accumulator of the restored run').toEqual(reference.core.captureCheckpoint().modeMemory);
        expect(end).toMatchObject({ outcome: Outcome.EnemyWins, ticks: referenceHashes.length,
          terminal: [['missile'], []], laserReleases: [2, 24], laserHits: [2, 24], missilesLaunched: [2, 5], missileHits: [0, 3], repairsFinished: [1, 7] });   // seed 10, merged with the Engineering spike (pinned whole-run numbers, kind b): was [['downed'], []], [1, 23], [2, 23], [2, 4], [1, 3], [5, 10] (SIM_VERSION 55, W-1 merged with asteroids-ii; seed 2 at SIM_VERSION 53, spike ii: [['laser'], []], [13, 24], [22, 24], [6, 7], [3, 3], [3, 9]; seed 6 on the W-1 branch at 54: [['laser'], []], [1, 22], [2, 22], [2, 4], [1, 2], [4, 14])
        expect(Object.isFrozen(end)).toBe(true);
        expect(referenceHashes.length).toBeGreaterThan(SPLIT);
        console.log(`continuation proof: seed ${SEED}, ${SPLIT} + ${referenceHashes.length - SPLIT} ticks; summary ${JSON.stringify(end)}`);
      } finally { resumed.core.dispose(); }
    } finally { reference.core.dispose(); split.core.dispose(); }
  }, 120_000);
  it('a recorded duel replay re-runs to the same final hash; a live authority replay names its mode', () => {
    const h = duelCore(duelInit(5)), driver = createDriver(5), hashes: string[] = [], frames: ReplayFrame[] = [];
    try {
      const initial = h.core.captureCheckpoint();
      runToEnd(h, driver, hashes, frames, 1500);
      const replay = { version: 2, mode: 'duel', init: initial.init, initial: initial.snapshot, checkpoint: initial, frames };
      const result = runModeReplay(JSON.parse(JSON.stringify(replay)), DIGEST, resolveCutter);
      expect(result.hashes).toEqual(hashes);
      expect(result.hashes.at(-1)).toBe(duelRules.hash(h.state));
      expect(() => runModeReplay({ ...replay, mode: 'sector' }, DIGEST, resolveCutter)).toThrow();
    } finally { h.core.dispose(); }
    let now = 0;
    const live = createEncounterAuthority(duelRules, { contentDigest: DIGEST, resolveLayout: resolveCutter, clock: { nowMs: () => now },
      scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } });
    try {
      live.start(duelInit(9));
      for (let k = 1; k <= 90; k++) { now = k * 1000 / 60 + 0.01; live.pump(); }
      const recorded = live.replay();
      expect(replayMode(recorded)).toBe('duel');
      const rerun = runModeReplay(JSON.parse(JSON.stringify(recorded)), DIGEST, resolveCutter), ticks = recorded.frames.filter((f) => f.action.kind === 'tick');
      expect(ticks.length).toBeGreaterThan(80);
      expect(rerun.hashes).toEqual(ticks.map((f) => f.after!.hash));
      expect((rerun.checkpoint.snapshot as DuelSnapshot).header.hash).toBe(live.checkpoint([]).snapshot.header.hash);
    } finally { live.dispose(); }
  }, 60_000);
  it('runModeReplay looks modes up by own property only, and a sector replay without `mode` runs as the sector', () => {
    for (const mode of ['nope', 'constructor', '__proto__', 'toString']) expect(() => runModeReplay({ version: 2, mode, frames: [] }, DIGEST, resolveCutter)).toThrow(/unknown replay mode/);
    const h = checkpointRig();   // owns its cleanup
    {
      h.send({ kind: 'command', envelope: { runId: h.init.runId, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } }); h.pump();
      const { mode: _mode, ...sector } = h.authority.replay() as { mode?: string };
      expect(replayMode(sector)).toBe('sector');
      const viaMode = runModeReplay(JSON.parse(JSON.stringify(sector)), h.init.contentDigest, () => LAYOUT);
      expect(viaMode.checkpoint).toEqual(runReplay(LAYOUT, JSON.parse(JSON.stringify(sector)), h.init.contentDigest).checkpoint);
      expect(viaMode.checkpoint).toMatchObject({ phase: 'paused' });
    }
  });
  it('size: a checkpoint at the duel\'s largest state stays far under MAX_HOST_BYTES', () => {
    const h = duelCore(duelInit(1)), driver = createDriver(1);
    try {
      runToEnd(h, driver, [], [], 2400);
      const t = h.state.duel.tactical, third = 1 / 3;
      for (const [i, ship] of t.ships.entries()) { t.systems[i]!.rooms = [2, 2, 2]; ship.x += third; ship.y -= third; ship.vx = third * (i + 1); }
      for (const i of [0, 1]) { removeMissile(t, i); placeMissile(t, i, { x: 1234.567891234567 + i, y: -987.6543210987654, vx: third, vy: -third, heading: 17, headingAcc: third, age: 211 }); }
      h.state.duel.repair = [959, 481, 7];
      const cp = h.core.captureCheckpoint(), bytes = jsonModeCodecs(duelRules, resolveCutter, 'duel').encodeCheckpoint(cp);
      expect(bytes.length).toBeLessThan(MAX_HOST_BYTES);
      expect(throughBytes(cp).snapshot.header.hash).toBe(duelRules.hash(h.state));
      console.log(`duel checkpoint at its largest state: ${bytes.length} bytes (${(bytes.length / 1024).toFixed(1)} KiB of ${MAX_HOST_BYTES / 1024} KiB), ${cp.snapshot.values.length} values`);
    } finally { h.core.dispose(); }
  });
  it('restore validation: a checkpoint whose telemetry, phase or seed disagrees is refused', () => {
    const h = duelCore(duelInit(4)), driver = createDriver(4);
    try {
      runToEnd(h, driver, [], [], 300);
      const cp = JSON.parse(JSON.stringify(h.core.captureCheckpoint()));
      expect(() => throughBytes({ ...cp, modeMemory: { ...cp.modeMemory, version: 2 } })).toThrow();
      const telemetry = (patch: (t: any) => void) => { const copy = structuredClone(cp); patch(copy.modeMemory.telemetry); return copy; };
      expect(() => throughBytes(telemetry(() => {}))).not.toThrow();
      expect(() => throughBytes(telemetry((t) => { t.prev.grace[1] = t.prev.grace[1].slice(1); })), 'a wrong-length grace copy').toThrow(/telemetry/);
      expect(() => throughBytes(telemetry((t) => { t.prev.grace[0][0] = 2 ** 31; })), 'a grace value outside signed 32 bits').toThrow();
      expect(cp.snapshot.values[5], 'the snapshot outcome (values[5]) is Running').toBe(Outcome.Running);
      expect(() => throughBytes(telemetry((t) => { t.outcome = Outcome.CrewWins; })), 'an accumulator outcome the snapshot does not have').toThrow(/inconsistent duel telemetry/);
      expect(() => throughBytes(telemetry((t) => { t.terminal[0] = ['planet']; })), 'terminal causes while running').toThrow(/inconsistent duel telemetry/);
      expect(() => throughBytes({ ...cp, modeMemory: { ...cp.modeMemory, telemetry: { ...cp.modeMemory.telemetry, ticks: 299 } } })).toThrow(/telemetry/);
      expect(() => throughBytes({ ...cp, phase: 'ended' })).toThrow(/terminal phase/);
      expect(() => throughBytes({ ...cp, init: { ...cp.init, seed: 5 } })).toThrow(/seed/);
      expect(() => throughBytes({ ...cp, botControllers: [{}] })).toThrow();
      const { modeMemory: _memory, ...noMemory } = cp;
      expect(() => throughBytes(noMemory)).toThrow();
      expect(() => duelRules.restore(cp.snapshot, resolveCutter)).toThrow(/telemetry memory/);
    } finally { h.core.dispose(); }
  });
  it('the duel codec admits exactly the duel modules\' command kinds plus the core\'s setPaused', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    const examples: Record<string, unknown> = { sit: { kind: 'sit', station: 0 }, stand: { kind: 'stand' }, presence: { kind: 'presence', present: true },
      laserLock: { kind: 'laserLock', room: 1 }, torpLock: { kind: 'torpLock', room: -1 }, rockLock: { kind: 'rockLock', weapon: 'laser', rock: 0 }, laserCharge: { kind: 'laserCharge', held: true }, missileLaunch: { kind: 'missileLaunch' }, rematch: { kind: 'rematch' }, throttle: { kind: 'throttle', level: 2 }, heading: { kind: 'heading', heading: 64 }, contactScan: { kind: 'contactScan', contact: 0 }, designate: { kind: 'designate', contact: 1 }, laserFrequency: { kind: 'laserFrequency', freq: 2 }, pewFire: { kind: 'pewFire', aim: 12, aimAcc: 34 }, laserMode: { kind: 'laserMode', manual: true }, laserFire: { kind: 'laserFire', aim: 56, aimAcc: 78 }, torpMode: { kind: 'torpMode', manual: true },
      shipPower: { kind: 'shipPower', system: 1, delta: -1 }, shipCoolant: { kind: 'shipCoolant', system: 0 }, shipDoor: { kind: 'shipDoor', edge: 2 }, shipAirlock: { kind: 'shipAirlock', index: 1 }, weaponPower: { kind: 'weaponPower', slot: 1, delta: 1 } };
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]);
    expect(kinds.sort()).toEqual(Object.keys(examples).sort());
    for (const command of [...kinds.map((k) => examples[k]), { kind: 'setPaused', paused: true }]) expect(codec.decodeMessage(codec.encodeMessage(envelope(command)))).toEqual(envelope(command));
    for (const command of [{ kind: 'moveTo', tile: 3 }, { kind: 'fire', station: 0 }, { kind: 'presence' }]) expect(() => codec.encodeMessage(envelope(command))).toThrow();
  });
});
