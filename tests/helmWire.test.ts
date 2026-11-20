// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §7): the three held fields on the codec, in the sector and
// duel checkpoints and the replay, optional, integers −1..1; the authority expires a held frame that holds only one of
// them, and a pause deletes all three.
import { describe, expect, it } from 'vitest';
import { validateCheckpoint } from '../src/renderer/src/authority/checkpoint';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { REMOTE_HELD_TIMEOUT_MS } from '../src/renderer/src/net/receivePolicy';
import { DUEL_CREW_MAX } from '../src/renderer/src/sim/duel/state';
import { THR_RAMP } from '../src/renderer/src/sim/duel/tuning';
import { sitDown } from '../src/renderer/src/sim/stations';
import { checkpointRig } from './helpers/checkpointRig';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';
import { LAYOUT } from './helpers/sim';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 0, tick: 0, sequence: 1, held: { ...NONE, ...held } } });
const TIMEOUT_TICKS = Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60));

describe('the held fields on the codec (spec §7)', () => {
  it('carry throttleHeld, rcsX and rcsY as −1, 0 or 1, each optional; anything else is refused', () => {
    const codec = duelCodec(DUEL_CREW_MAX), ok = frame({ throttleHeld: 1, rcsX: -1, rcsY: 0 });
    expect(codec.decodeMessage(raw(ok))).toEqual(ok);
    expect(codec.decodeMessage(raw(frame({})))).toEqual(frame({}));
    for (const bad of [{ throttleHeld: 2 }, { rcsX: -2 }, { rcsY: 0.5 }, { throttleHeld: '1' }, { rcsX: true }])
      expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
});

describe('the held fields in the checkpoints and the replay (spec §7)', () => {
  it('ride the duel authority\'s held frames into its checkpoint and replay, and the checkpoint refuses a bad one', () => {
    const live = liveDuel(duelInit(5, 'rcs-wire'));
    live.held(0, { ...NONE, throttleHeld: -1, rcsX: 1, rcsY: -1 });
    live.tick(2);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[0]).toEqual({ ...NONE, throttleHeld: -1, rcsX: 1, rcsY: -1 });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    for (const bad of [{ throttleHeld: 2 }, { rcsX: 0.5 }, { rcsY: -3 }]) expect(() => validateDuelCheckpoint({ ...cp, held: [{ ...NONE, ...bad }, cp.held[1]!] }, DIGEST, resolveCutter), JSON.stringify(bad)).toThrow();
    const replay = JSON.parse(JSON.stringify(live.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"rcsX":1');
    // Final review: the replay's parse refuses a bad held value (out of range or not whole), naming the field.
    for (const bad of ['2', '0.5', '-3']) {
      const broken = JSON.parse(JSON.stringify(replay).replaceAll('"rcsX":1', `"rcsX":${bad}`)) as unknown;
      expect(() => parseEncounterReplay(duelRules, broken, DIGEST, resolveCutter), bad).toThrow(/rcsX/);
    }
  });
  it('are optional in the sector checkpoint, and refused there out of range', () => {
    const h = checkpointRig(), cp = JSON.parse(JSON.stringify(h.authority.checkpoint([])));
    cp.held[0] = { ...NONE, throttleHeld: 1, rcsX: -1, rcsY: 1 };
    expect(() => validateCheckpoint(LAYOUT, cp, DIGEST)).not.toThrow();
    cp.held[0] = { ...NONE, rcsY: 2 };
    expect(() => validateCheckpoint(LAYOUT, cp, DIGEST)).toThrow();
  });
});

describe('the authority clears them (spec §7)', () => {
  const helmDuel = (runId: string) => liveDuel(duelInit(5, runId), (s) => { sitDown(s.duel.interior, 0, s.duel.nav); });
  const heldOf = (l: ReturnType<typeof helmDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[0]!;
  it('an expired held frame holding only throttleHeld is expired, and the throttle then stays where the stale W left it (helm round 2 §2.1)', () => {
    const l = helmDuel('thr-expire');
    l.held(0, { ...NONE, throttleHeld: 1 }); l.tick();
    expect(heldOf(l)).toMatchObject({ throttleHeld: 1 });
    l.tick(TIMEOUT_TICKS + 2);
    expect(heldOf(l).throttleHeld).toBeUndefined();
    const m = l.state.duel.thrMille;
    expect(m).toBeLessThanOrEqual(THR_RAMP * (TIMEOUT_TICKS + 3));   // a stale W adds at most a timeout's ramp
    l.tick(10);
    expect(l.state.duel.thrMille).toBe(m);
  });
  it('an expired frame holding only rcsX or only rcsY is expired too', () => {
    for (const held of [{ rcsX: -1 }, { rcsY: 1 }]) {
      const l = helmDuel(`rcs-expire-${held.rcsX ?? 0}-${held.rcsY ?? 0}`);
      l.held(0, { ...NONE, ...held }); l.tick();
      l.tick(TIMEOUT_TICKS + 2);
      const h = heldOf(l);
      expect([h.rcsX, h.rcsY], JSON.stringify(held)).toEqual([undefined, undefined]);
    }
  });
  it('a pause deletes all three', () => {
    const l = helmDuel('rcs-pause');
    l.held(0, { ...NONE, throttleHeld: 1, rcsX: 1, rcsY: -1 }); l.tick();
    l.command(0, { kind: 'setPaused', paused: true }); l.tick();
    expect(l.core.captureCheckpoint().phase).toBe('paused');
    const h = heldOf(l);
    expect(['throttleHeld' in h, 'rcsX' in h, 'rcsY' in h]).toEqual([false, false, false]);
  });
});
