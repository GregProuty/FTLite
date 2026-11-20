// Artemis-ii (spec 2026-11-17-artemis-consoles §5.1, §5.2, §5.6): the helm module's throttle, its command and wire, its
// snapshot bounds and the 42 → 43 alias table. Task 2 adds the flight (§5.3).
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES, helmModule } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { clampThrottle, THROTTLE_MAX, THROTTLE_MIN, throttleThrust, validThrottle } from '../src/renderer/src/sim/duel/throttle';
import { createTacticalState, Outcome, type Axes, type Ship } from '../src/renderer/src/sim/tactical/state';
import { predictPath } from '../src/renderer/src/sim/tactical/predict';
import { edgeAccel, engineFactor, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { hx, hy, wrapHeading } from '../src/renderer/src/sim/tactical/direction';
import { CUTTER_CLASS, HUNTER_CLASS, ShipClass, type ShipClassDef } from '../src/renderer/src/sim/tactical/defs';
import { DEFAULT_FLIGHT, DT, THRUST, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { aliasPlan, duelSchema, MIGRATIONS } from '../scripts/golden/duelOracle';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const throttle = (level: number): DuelCommand => ({ kind: 'throttle', level });
/** Playtest2feedback Decision 17: the throttle levels are the Valkyrn's; the Cutter holds its throttle. */
const seatedValkyrn = (seed: number): DuelState => createSeatedDuel(CUTTER, seed, 0, 2, ShipClass.Valkyrn);
/** The flattened offset of helm.throttle: after SIM_VERSION and every module before helm. */
function helmOffset(d: DuelState): number {
  let at = 1;
  for (const { module, state } of DUEL_MODULES) { if (module.id === 'helm') return at; at += moduleLength(module as SimModule<unknown>, state(d)); }
  throw new Error('no helm module');
}
// createDuel seats player 0 at the Helm (nav) and player 1 at Weapons.

describe('the throttle levels (Artemis spec §5.1, §5.3)', () => {
  it('are the integers −1..4; thrust is −1 for reverse and a quarter a notch forward; clamping rounds into range', () => {
    expect([THROTTLE_MIN, THROTTLE_MAX]).toEqual([-1, 4]);
    expect([-1, 0, 1, 2, 3, 4].map((v) => validThrottle(v))).toEqual(Array(6).fill(true));
    expect([-2, 5, 0.5, NaN, Infinity, '2', null].map((v) => validThrottle(v))).toEqual(Array(7).fill(false));
    expect([-1, 0, 1, 2, 3, 4].map(throttleThrust)).toEqual([-1, 0, 0.25, 0.5, 0.75, 1]);
    expect([-5, -1, 0, 2.4, 9, NaN, -0.2].map(clampThrottle)).toEqual([-1, -1, 0, 2, 4, 0, 0]);
    expect(Object.is(clampThrottle(-0.2), 0)).toBe(true);
  });
});

describe('the helm module (Artemis spec §5.1)', () => {
  it('sits after round and before interior, owns throttle, and its field moves the duel hash', () => {
    expect(DUEL_MODULES.map(({ module }) => module.id)).toEqual(['space', 'ship', 'science', 'presence', 'repair', 'round', 'helm', 'power', 'interior']);   // Engineering spike spec §7: the power module, after helm and before interior
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading', 'throttleCut'], ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']]);   // Feel-ii adds the held heading; playtest2feedback: unavailable (the crew Helm's class; Engineering's cap); owner 2026-11-19: no helmPower; helm round 2 §2.3: throttleCut
    const d = seatedValkyrn(5);
    try {
      expect(d.throttle).toBe(0);
      const base = hashDuel(d);
      d.throttle = 2; expect(hashDuel(d)).not.toBe(base);
      d.throttle = 0; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle command (Artemis spec §5.2)', () => {
  it('admits in order: stale-tick, then invalid-seat, then malformed, then noop, else applied', () => {
    const d = seatedValkyrn(5);
    try {
      const r = step(d, [
        cmd(d, 1, throttle(9), d.interior.tick + 1),   // stale comes before the seat
        cmd(d, 1, throttle(9)),                        // Weapons is not the Helm: the seat comes before malformed
        cmd(d, 0, throttle(5)), cmd(d, 0, throttle(-2)), cmd(d, 0, throttle(0.5)), cmd(d, 0, throttle(NaN)),
        cmd(d, 0, throttle(0)),                        // already at 0
        cmd(d, 0, throttle(3))
      ]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([
        [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'noop'], [0, 'applied'], [1, 'stale-tick'], [1, 'invalid-seat']
      ]);
      expect(d.throttle).toBe(3);
    } finally { disposeDuel(d); }
  });
  it('envelope order holds within a tick and the last applied level wins; a repeat of the new level is noop', () => {
    const d = seatedValkyrn(5);
    try {
      d.tactical.systems[0].bars[DuelSystem.Engines] = 4;   // Engineering spike spec §10.2 (fallout a): Engines starts at 3 bars (cap 3), so a throttle of 4 needs the 4th bar
      expect(step(d, [cmd(d, 0, throttle(2)), cmd(d, 0, throttle(4)), cmd(d, 0, throttle(4))]).map((x) => x.status)).toEqual(['applied', 'applied', 'noop']);
      expect(d.throttle).toBe(4);
    } finally { disposeDuel(d); }
  });
  it('only the present Helm attendant may set it: an away Helm player and an empty Helm are invalid-seat', () => {
    const d = seatedValkyrn(5);
    try {
      step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
      expect(step(d, [cmd(d, 0, throttle(2))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      step(d, [cmd(d, 0, { kind: 'presence', present: true })]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect(step(d, [cmd(d, 0, throttle(2))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      expect(d.throttle).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('is kept across stand and sit, answered duel-decided on the end card, and reset to 0 by a new round', () => {
    const d = seatedValkyrn(5);
    try {
      step(d, [cmd(d, 0, throttle(3))]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect(d.throttle).toBe(3);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]!.status).toBe('applied');
      expect(d.throttle).toBe(3);
      d.tactical.systems[1].hull = 0; step(d);   // the hunter is down: the round is decided
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(step(d, [cmd(d, 0, throttle(1))])[0]).toMatchObject({ status: 'rejected', reason: 'duel-decided' });
      expect(d.throttle).toBe(3);
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.throttle]).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle on the wire (Artemis spec §5.2)', () => {
  it('the duel codec round-trips any finite level and refuses a missing, non-numeric or infinite one, or an extra key', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const level of [-1, 0, 4, 0.5, 9]) expect(codec.decodeMessage(codec.encodeMessage(envelope({ kind: 'throttle', level })))).toEqual(envelope({ kind: 'throttle', level }));
    for (const bad of [{ kind: 'throttle' }, { kind: 'throttle', level: '2' }, { kind: 'throttle', level: Infinity }, { kind: 'throttle', level: 1, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});

describe('the throttle in the snapshot (Artemis spec §5.1)', () => {
  it('round-trips mid-throttle and refuses a level that is not an integer in −1..4, even rehashed', () => {
    const d = seatedValkyrn(5);
    try {
      step(d, [cmd(d, 0, throttle(-1))]);
      const snap = saveDuelSnapshot(d, DIGEST), at = helmOffset(d);
      expect(snap.values[at]).toBe(-1);
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST);
      try { expect([r.throttle, hashDuel(r)]).toEqual([-1, hashDuel(d)]); } finally { disposeDuel(r); }
      for (const bad of [7, 0.5, -2]) {
        const s = structuredClone(snap); s.values[at] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `throttle ${bad}`).toThrow(new RegExp(`throttle ${bad} is invalid`));
      }
    } finally { disposeDuel(d); }
  });
});

describe('the 42 → 43 alias table (Artemis spec §5.6)', () => {
  it('declares helm.throttle added, after the round module, and maps every other field to itself', () => {
    const m = MIGRATIONS[42]!;
    expect(m.change).toBe('Artemis-ii: helm throttle');
    const d = seatedValkyrn(1);
    try {
      const now = duelSchema(d), k = now.names.indexOf('helm.throttle');
      expect(k).toBe(now.names.indexOf('round.decidedTick') + 1);
      const oldNames = now.names.filter((_, i) => i !== k), oldCounts = now.counts.filter((_, i) => i !== k);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts, m).problems).toEqual([]);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts).problems).toEqual(['new field helm.throttle is neither mapped nor declared added']);
    } finally { disposeDuel(d); }
  });
});

/** flyShip as it was at SIM_VERSION 42: both axes quantised by sign. A frozen reference, never to be changed. */
function flyShipBySign(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  const turn = Math.sign(axes.turn) || 0, thrust = Math.sign(axes.thrust) || 0;
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  const idle = turn === 0 && thrust === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  let ax = 0, ay = 0;
  if (tuning.gravity) { const [gx, gy] = gravityAccel(s.x, s.y); ax += gx; ay += gy; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); ax += ex; ay += ey; }
  if (thrust > 0) { ax += h0 * cls.thrust * f; ay += h1 * cls.thrust * f; }
  else if (thrust < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;
  s.x += s.vx * DT; s.y += s.vy * DT;
}

describe('quarter-thrust flight (Artemis spec §5.3)', () => {
  const start = (): Ship => ({ ...createTacticalState(3).ships[0], x: 900, y: -400, vx: 30, vy: 60, heading: 40, headingAcc: 0.25 });
  it('whole axes (the hunter, levels 4 and −1, the flight view) fly exactly as the sign-quantised flight did, for every class and Engines level', () => {
    for (const cls of [CUTTER_CLASS, HUNTER_CLASS]) for (const engines of [0, 1, 2]) for (const turn of [-1, 0, 1]) for (const thrust of [-1, 0, 1]) {
      const a = start(), b = start();
      for (let t = 0; t < 120; t++) { flyShip(a, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); flyShipBySign(b, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); }
      expect(a, `${cls.id} engines ${engines} turn ${turn} thrust ${thrust}`).toEqual(b);
    }
  });
  it('playtest2feedback §3: thrust is rounded to thousandths, not quarters, and reverse is proportional', () => {
    const NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: DEFAULT_FLIGHT.stabilise };
    const push = (thrust: number): number => {
      const s: Ship = { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 };
      flyShip(s, { turn: 0, thrust }, NO_FIELD);
      return s.vy;
    };
    expect(push(1)).toBeCloseTo(-THRUST * DT, 12);
    expect(push(0.5)).toBeCloseTo(-0.5 * THRUST * DT, 12);
    expect(push(0.3)).toBeCloseTo(-0.3 * THRUST * DT, 12);
    expect(push(-0.25)).toBeCloseTo(0.25 * 0.5 * THRUST * DT, 12); expect(push(-1)).toBeCloseTo(0.5 * THRUST * DT, 12);   // helm round 2 §2.2: the Hound reverses at 50 %
    expect(push(NaN)).toBe(push(0));
  });
});

describe('the throttle flies the duel (Artemis spec §5.3)', () => {
  it('levels 4, 2 and −1 fly the held-thrust path 1, 0.5 and −1 tick for tick while the Helm is crewed', () => {
    for (const [level, thrust] of [[4, 1], [2, 0.5], [-1, -1]] as const) {
      const d = seatedValkyrn(5);
      try {
        d.tactical.systems[0].bars[DuelSystem.Engines] = 4;   // Engineering spike spec §10.2 (fallout a): Engines starts at 3 bars (cap 3), so a throttle of 4 needs the 4th bar
        const path = predictPath(d.tactical, 0, { turn: 0, thrust }, 60, 1), s = d.tactical.ships[0];
        expect(path).toHaveLength(60);
        step(d, [cmd(d, 0, throttle(level))]);
        for (let k = 0; k < 60; k++) {
          if (k > 0) step(d);
          expect([level, k, s.x, s.y]).toEqual([level, k, path[k]!.x, path[k]!.y]);
        }
        expect([s.planetHits, s.asteroidHits, s.shipHits]).toEqual([0, 0, 0]);
      } finally { disposeDuel(d); }
    }
  });
  it('held W no longer thrusts; an empty Helm coasts and keeps its level, and the next pilot flies at it', () => {
    const d = seatedValkyrn(5), coast = seatedValkyrn(5);
    try {
      d.tactical.systems[0].bars[DuelSystem.Engines] = 4;   // Engineering spike spec §10.2 (fallout a): Engines starts at 3 bars (cap 3), so a throttle of 4 needs the 4th bar
      step(d, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]); step(coast);
      expect([d.tactical.ships[0].vx, d.tactical.ships[0].vy]).toEqual([coast.tactical.ships[0].vx, coast.tactical.ships[0].vy]);
      step(d, [cmd(d, 0, throttle(4))]);
      const s = d.tactical.ships[0], drift = predictPath(d.tactical, 0, { turn: 0, thrust: 0 }, 30, 1);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      for (let k = 0; k < 30; k++) { if (k > 0) step(d); expect([k, s.x, s.y]).toEqual([k, drift[k]!.x, drift[k]!.y]); }
      expect(d.throttle).toBe(4);
      const resume = predictPath(d.tactical, 0, { turn: 0, thrust: 1 }, 1, 1);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]!.status).toBe('applied');
      expect([s.x, s.y]).toEqual([resume[0]!.x, resume[0]!.y]);
    } finally { disposeDuel(d); disposeDuel(coast); }
  });
});
