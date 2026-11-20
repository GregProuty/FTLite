// W-4 spec §8: turretAim, the reticle's world bearing (a fine aim 0..65535; −1 or absent none), rides the held frame from
// the Weapons attendant into ShipInput.turretAim; anything else reads as none. It rides every held schema (optional,
// −1..65535), an expiry or a pause clears it (the pattern of w4PewFire.test.ts's weaponSel cases).
import { describe, expect, it } from 'vitest';
import { heldTurretAim } from '../src/renderer/src/sim/duel/step';
import { IDLE_INPUT, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import type { HeldInput } from '../src/renderer/src/net/contracts';
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

describe('turretAim (W-4 spec §8)', () => {
  it('heldTurretAim reads an integer 0..65535 and anything else as none', () => {
    const h = (turretAim?: number) => ({ moveX: 0, moveY: 0, interactHeld: false, ...(turretAim !== undefined ? { turretAim } : {}) });
    expect([0, 65535, 16384, -1, 65536, 1.5, undefined].map((a) => heldTurretAim(h(a)))).toEqual([0, 65535, 16384, -1, -1, -1, -1]);
  });
  it('the idle and uncrewed inputs carry no aim', () => {
    expect([IDLE_INPUT.turretAim, UNCREWED_INPUT.turretAim]).toEqual([-1, -1]);
  });
});

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 0, tick: 0, sequence: 1, held: { ...NONE, ...held } } });
const TIMEOUT_TICKS = Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60));

describe('turretAim on the wire (W-4 spec §8)', () => {
  it('the held frame carries turretAim -1..65535, optional; 65536, -2 and a non-integer are malformed', () => {
    const codec = duelCodec(DUEL_CREW_MAX);
    for (const good of [{ turretAim: 65535 }, { turretAim: -1 }, { turretAim: 0 }, {}]) expect(codec.decodeMessage(raw(frame(good)))).toEqual(frame(good));
    for (const bad of [{ turretAim: 65536 }, { turretAim: -2 }, { turretAim: 1.5 }, { turretAim: '1' }]) expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
  it('rides the duel checkpoint and the replay; both refuse 65536 and -2; the sector checkpoint takes it', () => {
    const live = liveDuel(duelInit(5, 'taim-wire'));
    live.held(0, { ...NONE, turretAim: 65535 });
    live.tick(2);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[0]).toEqual({ ...NONE, turretAim: 65535 });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    for (const bad of [65536, -2]) expect(() => validateDuelCheckpoint({ ...cp, held: [{ ...NONE, turretAim: bad }, cp.held[1]!] }, DIGEST, resolveCutter), String(bad)).toThrow();
    const replay = JSON.parse(JSON.stringify(live.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"turretAim":65535');
    for (const bad of ['65536', '-2']) {
      const broken = JSON.parse(JSON.stringify(replay).replaceAll('"turretAim":65535', `"turretAim":${bad}`)) as unknown;
      expect(() => parseEncounterReplay(duelRules, broken, DIGEST, resolveCutter), bad).toThrow(/turretAim/);
    }
    const h = checkpointRig(), scp = JSON.parse(JSON.stringify(h.authority.checkpoint([])));
    for (const good of [65535, -1]) {
      scp.held[0] = { ...NONE, turretAim: good };
      expect(() => validateCheckpoint(LAYOUT, scp, DIGEST), String(good)).not.toThrow();
    }
    for (const bad of [65536, -2]) {
      scp.held[0] = { ...NONE, turretAim: bad };
      expect(() => validateCheckpoint(LAYOUT, scp, DIGEST), String(bad)).toThrow();
    }
  });
  it('the authority expires a frame holding only turretAim, and a pause deletes it', () => {
    const weaponsDuel = (runId: string) => liveDuel(duelInit(5, runId), (s) => { sitDown(s.duel.interior, 0, s.duel.weapons); });
    const heldOf = (l: ReturnType<typeof weaponsDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[0]!;
    const e = weaponsDuel('taim-expire');
    e.held(0, { ...NONE, turretAim: 1000 }); e.tick();
    expect(heldOf(e)).toMatchObject({ turretAim: 1000 });
    e.tick(TIMEOUT_TICKS + 2);
    expect(heldOf(e).turretAim).toBeUndefined();
    const p = weaponsDuel('taim-pause');
    p.held(0, { ...NONE, turretAim: 1000 }); p.tick();
    p.command(0, { kind: 'setPaused', paused: true }); p.tick();
    expect('turretAim' in heldOf(p)).toBe(false);
  });
});
