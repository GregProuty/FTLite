// W-4 spec §6, §8, §19.1 (W-4a): pewFire has no aim; its admission (seat, the pew, one a tick, pewReady); the round flies
// along the nose; weaponSel rides every held schema (optional, 0..2), an expiry or a pause clears it; gunHeld fires the
// autocannon only with it selected on a turret class, and the Valkyrn keeps today's trigger.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { heldWeaponSel, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { aimDir, pewAimFine } from '../src/renderer/src/sim/tactical/pew';
import { HEADING_COUNT } from '../src/renderer/src/sim/tactical/tuning';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { validateCheckpoint } from '../src/renderer/src/authority/checkpoint';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import { duelCodec } from '../src/renderer/src/net/codec';
import { REMOTE_HELD_TIMEOUT_MS } from '../src/renderer/src/net/receivePolicy';
import { DUEL_CREW_MAX } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { checkpointRig } from './helpers/checkpointRig';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';
import { LAYOUT } from './helpers/sim';
import { createSeatedDuel } from './helpers/duelSeat';
import { holdInSight } from './helpers/sensorSight';

const CUTTER = parseShip(cutter);
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });

describe('pewFire without an aim (W-4 spec §6)', () => {
  it('fires one round along the nose; a second in the tick is a noop; without a third it is unavailable; Helm is not-at-weapons', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    d.tactical.systems[0].pewManual = true;   // W-4 spec §4.3, §6 (W-4b): pewFire needs pew pew on MAN
    try {
      const t = d.tactical, s = t.systems[0]!;
      const r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 1), env(d, g, { kind: 'pewFire' }, 2), env(d, d.helmPlayer, { kind: 'pewFire' }, 1)] });
      // stepDuelTick sorts its results by player, then sequence (step.ts, its last line); the Helm is player 0 here.
      expect(d.helmPlayer).toBe(0);
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['rejected', 'not-at-weapons'], ['applied', null], ['noop', null]]);
      expect(s.pewShots).toBe(1);
      const round = t.pew.find((e) => e.active)!, [ux, uy] = aimDir(pewAimFine(t, 0));
      expect(pewAimFine(t, 0) % HEADING_COUNT).toBe(0);
      expect(round.vx / Math.hypot(round.vx, round.vy)).toBeCloseTo(ux, 9);
      expect(round.vy / Math.hypot(round.vx, round.vy)).toBeCloseTo(uy, 9);
      s.pewCharge = 0;
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 3)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    } finally { disposeDuel(d); }
  });
  it('is unavailable on the Valkyrn (no pew)', () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try { expect(stepDuelTick(v, { held: [], commands: [env(v, 1 - v.helmPlayer, { kind: 'pewFire' }, 1)] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' }); }
    finally { disposeDuel(v); }
  });
  it("every laser command from the Hound's Weapons seat is unavailable, except laserFrequency and laserLock (W-4 spec §2.1, §14 Loadout; amendment §3.2)", () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    try {
      holdInSight(d.tactical);   // the enemy seen, as before (laserLock's own cases are in tests/w4Rooms.test.ts)
      const laser: DuelCommand[] = [{ kind: 'laserCharge', held: true }, { kind: 'laserMode', manual: true }, { kind: 'laserFire', aim: 0, aimAcc: 0 }, { kind: 'rockLock', weapon: 'laser', rock: -1 }];
      const r = stepDuelTick(d, { held: [], commands: laser.map((c, k) => env(d, g, c, k + 1)) });
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual(laser.map(() => ['rejected', 'unavailable']));
      expect(stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'laserFrequency', freq: 1 }, 9)] })[0]).toMatchObject({ status: 'applied' });
    } finally { disposeDuel(d); }
  });
});

describe('weaponSel and the trigger (W-4 spec §8)', () => {
  it('heldWeaponSel reads 0..2 and anything else as none', () => {
    expect([0, 1, 2, 3, -1, 1.5, undefined].map((w) => heldWeaponSel({ moveX: 0, moveY: 0, interactHeld: false, ...(w !== undefined ? { weaponSel: w } : {}) }))).toEqual([0, 1, 2, -1, -1, -1, -1]);
  });
  it('on the Hound gunHeld fires the autocannon only with weaponSel 1; the Valkyrn keeps today\'s trigger', () => {
    const d = createSeatedDuel(CUTTER, 5), g = 1 - d.helmPlayer;
    try {
      const s = d.tactical.systems[0]!; s.bars[1] = 3; s.weaponPower = [1, 1, 1];
      s.gunManual = true;   // W-4 spec §4.3 (W-4b): a held trigger fires only the autocannon in hand (MAN and selected)
      const held = (weaponSel: number) => { const h = [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]; h[g] = { moveX: 0, moveY: 0, interactHeld: false, gunHeld: true, weaponSel } as never; return h; };
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(0), commands: [] });
      expect(s.gunShots).toBe(0);
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(1), commands: [] });
      expect(s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);   // the Valkyrn class at the Hound's Weapons seat: no weaponSel needed
    try {
      const vg = 1 - v.helmPlayer, h: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }];
      h[vg] = { moveX: 0, moveY: 0, interactHeld: false, gunHeld: true };
      for (let k = 0; k < 20; k++) stepDuelTick(v, { held: h, commands: [] });
      expect(v.tactical.systems[0]!.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(v); }
  });
});

// W-4 spec §8: weaponSel on the wire, in the checkpoints and the replay, and the authority's expiry and pause (the pattern of helmWire.test.ts).
const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 0, tick: 0, sequence: 1, held: { ...NONE, ...held } } });
const TIMEOUT_TICKS = Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60));

describe('weaponSel on the wire (W-4 spec §8)', () => {
  it('the held frame carries weaponSel 0..2, optional; 3, −1 and a non-integer are malformed', () => {
    const codec = duelCodec(DUEL_CREW_MAX);
    for (const good of [{ weaponSel: 0 }, { weaponSel: 2 }, {}]) expect(codec.decodeMessage(raw(frame(good)))).toEqual(frame(good));
    for (const bad of [{ weaponSel: 3 }, { weaponSel: -1 }, { weaponSel: 1.5 }, { weaponSel: '1' }]) expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
  it('pewFire {} round-trips and pewFire with an aim is malformed', () => {
    const codec = duelCodec(DUEL_CREW_MAX), env = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    const good = env({ kind: 'pewFire' });
    expect(codec.decodeMessage(codec.encodeMessage(good))).toEqual(good);
    expect(() => codec.encodeMessage(env({ kind: 'pewFire', aim: 0, aimAcc: 0 }))).toThrow();
  });
  it('rides the duel checkpoint and the replay; the checkpoint and the replay refuse 3; the sector checkpoint takes it', () => {
    const live = liveDuel(duelInit(5, 'wsel-wire'));
    live.held(0, { ...NONE, weaponSel: 2 });
    live.tick(2);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[0]).toEqual({ ...NONE, weaponSel: 2 });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    for (const bad of [3, -1]) expect(() => validateDuelCheckpoint({ ...cp, held: [{ ...NONE, weaponSel: bad }, cp.held[1]!] }, DIGEST, resolveCutter), String(bad)).toThrow();
    const replay = JSON.parse(JSON.stringify(live.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"weaponSel":2');
    for (const bad of ['3', '-1']) {
      const broken = JSON.parse(JSON.stringify(replay).replaceAll('"weaponSel":2', `"weaponSel":${bad}`)) as unknown;
      expect(() => parseEncounterReplay(duelRules, broken, DIGEST, resolveCutter), bad).toThrow(/weaponSel/);
    }
    const h = checkpointRig(), scp = JSON.parse(JSON.stringify(h.authority.checkpoint([])));
    scp.held[0] = { ...NONE, weaponSel: 1 };
    expect(() => validateCheckpoint(LAYOUT, scp, DIGEST)).not.toThrow();
    for (const bad of [3, -1]) {
      scp.held[0] = { ...NONE, weaponSel: bad };
      expect(() => validateCheckpoint(LAYOUT, scp, DIGEST), String(bad)).toThrow();
    }
  });
  it('the authority expires a frame holding only weaponSel, and a pause deletes it', () => {
    const weaponsDuel = (runId: string) => liveDuel(duelInit(5, runId), (s) => { sitDown(s.duel.interior, 0, s.duel.weapons); });
    const heldOf = (l: ReturnType<typeof weaponsDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[0]!;
    const e = weaponsDuel('wsel-expire');
    e.held(0, { ...NONE, weaponSel: 1 }); e.tick();
    expect(heldOf(e)).toMatchObject({ weaponSel: 1 });
    e.tick(TIMEOUT_TICKS + 2);
    expect(heldOf(e).weaponSel).toBeUndefined();
    const p = weaponsDuel('wsel-pause');
    p.held(0, { ...NONE, weaponSel: 1 }); p.tick();
    p.command(0, { kind: 'setPaused', paused: true }); p.tick();
    expect('weaponSel' in heldOf(p)).toBe(false);
  });
});
