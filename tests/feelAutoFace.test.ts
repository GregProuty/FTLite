// Feel-i (spec 2026-11-17-console-feel-design §2, §3): the Helm's auto-face (Space held, a held `face` flag admitted from
// the Helm's attendant like the turn, A/D overriding it) and the laser's SHIELDS opener every round.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { autoFaceTurn } from '../src/renderer/src/sim/tactical/hunter';
import { inArc } from '../src/renderer/src/sim/tactical/geometry';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AUTO_FACE_SIN, HUNTER_LEAD_S, LASER_ARC_COS } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const FACE: HeldInput = { ...NONE, face: true };
const step = (d: DuelState, held: HeldInput[]) => stepDuelTick(d, { held, commands: [] });
/** The angle error (radians, unsigned) between ship 0's nose and its target's lead point. */
function leadError(t: TacticalState): number {
  const me = t.ships[0], e = t.ships[1];
  const dx = e.x - me.x + e.vx * HUNTER_LEAD_S, dy = e.y - me.y + e.vy * HUNTER_LEAD_S;
  return Math.abs(Math.atan2(hx(me.heading) * dy - hy(me.heading) * dx, hx(me.heading) * dx + hy(me.heading) * dy));
}

describe('autoFaceTurn (console feel spec §2)', () => {
  it('turns toward the lead point, settles inside the dead band, and turns clockwise for a point dead astern', () => {
    const t = createTacticalState(5), me = t.ships[0], e = t.ships[1];
    Object.assign(me, { x: 0, y: 0, vx: 0, vy: 0, heading: 0 }); Object.assign(e, { vx: 0, vy: 0 });
    const ahead = (deg: number): void => { const r = (deg * Math.PI) / 180; e.x = 1000 * (hx(0) * Math.cos(r) - hy(0) * Math.sin(r)); e.y = 1000 * (hy(0) * Math.cos(r) + hx(0) * Math.sin(r)); };
    ahead(0); expect(autoFaceTurn(t, 0)).toBe(0);
    ahead(2); expect(autoFaceTurn(t, 0)).toBe(0);   // inside sin 2.5°
    ahead(10); expect(autoFaceTurn(t, 0)).toBe(1);
    ahead(-10); expect(autoFaceTurn(t, 0)).toBe(-1);
    ahead(180); expect(autoFaceTurn(t, 0)).toBe(1);
    expect(Math.asin(AUTO_FACE_SIN) * 180 / Math.PI).toBeCloseTo(2.5, 6);
  });
  it('leads a moving target by HUNTER_LEAD_S of its velocity', () => {
    const t = createTacticalState(5), me = t.ships[0], e = t.ships[1];
    Object.assign(me, { x: 0, y: 0, vx: 0, vy: 0, heading: 0 });
    Object.assign(e, { x: 1000 * hx(0), y: 1000 * hy(0), vx: 0, vy: 0 });
    expect(autoFaceTurn(t, 0)).toBe(0);
    e.vx = -hy(0) * 400; e.vy = hx(0) * 400;   // 200 u to its clockwise side in 0.5 s, about 11°
    expect(autoFaceTurn(t, 0)).toBe(1);
  });
});

describe('the duel admits face from the Helm like the turn (console feel spec §2)', () => {
  it('holding face at the Helm brings the nose onto the lead point and holds it in the laser arc', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(leadError(d.tactical)).toBeGreaterThan(0.2);
      for (let k = 0; k < 120; k++) step(d, [FACE, NONE]);
      expect(leadError(d.tactical)).toBeLessThan(0.06);
      const me = d.tactical.ships[0], e = d.tactical.ships[1];
      expect(inArc(me.heading, e.x - me.x, e.y - me.y, LASER_ARC_COS)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('A/D overrides it, Weapons cannot send it, and a standing Helm turns nothing', () => {
    const a = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn), b = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn), c = createSeatedDuel(CUTTER, 5), w = createSeatedDuel(CUTTER, 5), n = createSeatedDuel(CUTTER, 5);
    try {
      for (let k = 0; k < 30; k++) {
        step(a, [{ ...FACE, moveX: -1 }, NONE]); step(b, [{ ...NONE, moveX: -1 }, NONE]);   // A/D wins
        step(w, [NONE, FACE]); step(n, [NONE, NONE]);   // Weapons' face is ignored
      }
      expect(a.tactical.ships[0].heading).toBe(b.tactical.ships[0].heading);
      expect(w.tactical.ships[0].heading).toBe(n.tactical.ships[0].heading);
      const h0 = c.tactical.ships[0].heading;
      stepDuelTick(c, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: c.interior.tick, command: { kind: 'stand' } }] });
      for (let k = 0; k < 30; k++) step(c, [FACE, NONE]);
      expect(c.tactical.ships[0].heading).toBe(h0);
    } finally { [a, b, c, w, n].forEach(disposeDuel); }
  });
  it('is deterministic: two duels fed the same face input stay identical', () => {
    const a = createSeatedDuel(CUTTER, 7), b = createSeatedDuel(CUTTER, 7);
    try {
      for (let k = 0; k < 600; k++) { const h = k % 90 < 60 ? FACE : NONE; step(a, [h, NONE]); step(b, [h, NONE]); }
      expect([a.tactical.ships[0].x, a.tactical.ships[0].heading, a.tactical.ships[0].headingAcc]).toEqual([b.tactical.ships[0].x, b.tactical.ships[0].heading, b.tactical.ships[0].headingAcc]);
    } finally { disposeDuel(a); disposeDuel(b); }
  });
  it('rides the held wire: the codec keeps face and still takes a frame without it', () => {
    const wire = duelCodec(2);
    const frame = (held: HeldInput) => ({ kind: 'held' as const, frame: { runId: 'r', player: 0, tick: 3, sequence: 1, held } });
    for (const held of [FACE, NONE]) expect(wire.decodeMessage(wire.encodeMessage(frame(held)))).toEqual(frame(held));
  });
});

describe('the SHIELDS opener (console feel spec §3)', () => {
  it('every round starts with the crew laser targeted at Shields, the rematch included; the hunter stays untargeted', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const s = d.tactical.systems;
      expect([s[0].laserTargeted, s[0].lock, s[0].torpLock]).toEqual([true, Room.Shields, -1]);
      expect(s[1].laserTargeted).toBe(false);
      d.tactical.outcome = 1;
      stepDuelTick(d, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(d.round).toBe(1);
      expect([d.tactical.systems[0].laserTargeted, d.tactical.systems[0].lock]).toEqual([true, Room.Shields]);
    } finally { disposeDuel(d); }
  });
});
