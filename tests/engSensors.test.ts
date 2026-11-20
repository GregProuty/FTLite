// Engineering spike spec §10.4 (Amendment 2): sensor range by Sensors bars, contacts seen within it, the sim gates
// (contactScan, laser and torpedo locks, designate: unavailable when unseen; a running scan pauses unseen; auto-fire
// needs the target seen), the scan rate table, and Sensors capacity lost to fire and breach in Ops.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { capacityOf, clampToCapacity, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { contactSeen, derelictPos, scanProgressRate, scanStep, sensorRange, shipSeen } from '../src/renderer/src/sim/tactical/science';
import { Contact, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../src/renderer/src/sim/tactical/tuning';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
/** Put the enemy `dist` units east of the crew ship. */
const enemyAt = (d: DuelState, dist: number) => { const a = d.tactical.ships[0], b = d.tactical.ships[1]; b.x = a.x + dist; b.y = a.y; };

describe('engineering spike: Sensors (spec §10.4)', () => {
  it('range and scan rate by bars', () => {
    const s = createTacticalState(1), sys = s.systems[0];
    expect([0, 1, 2, 3, 4].map((b) => { sys.bars[DuelSystem.Sensors] = b; return sensorRange(sys); })).toEqual([300, 900, 1400, 2000, 2800]);
    s.scan.rate = SCAN_RATE_SCIENCE;
    expect([0, 1, 2, 3, 4].map((b) => { sys.bars[DuelSystem.Sensors] = b; return scanProgressRate(s); })).toEqual([0, 5, 6, 7, 8]);
    s.scan.rate = SCAN_RATE_OTHER;
    expect([0, 1, 2, 3, 4].map((b) => { sys.bars[DuelSystem.Sensors] = b; return scanProgressRate(s); })).toEqual([0, 2, 2, 3, 3]);
  });
  it('seen within range of the crew ship\'s centre; a running scan pauses unseen', () => {
    const d = createDuel(HOUND, 13);
    try {
      const t = d.tactical;
      enemyAt(d, 800); expect(shipSeen(t, 1)).toBe(true); expect(contactSeen(t, Contact.Enemy)).toBe(true);
      enemyAt(d, 1000); expect(shipSeen(t, 1)).toBe(false); expect(contactSeen(t, Contact.Enemy)).toBe(false);
      { const p = derelictPos(t), a = t.ships[0], r = sensorRange(t.systems[0]); expect(contactSeen(t, Contact.Derelict)).toBe((p.x - a.x) ** 2 + (p.y - a.y) ** 2 <= r * r); }   // the wreck by derelictPos
      t.scan.contact = 0; t.scan.level = 1; t.scan.progress = 10; t.scan.rate = SCAN_RATE_SCIENCE;
      scanStep(t, true); expect(t.scan.progress).toBe(10);
      enemyAt(d, 500); scanStep(t, true); expect(t.scan.progress).toBe(15);
    } finally { disposeDuel(d); }
  });
  it('the gates: contactScan, laser and torpedo locks, and designate need the contact seen', () => {
    const d = createDuel(HOUND, 13, 0, 3, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit. a crew of 3: designate is the Science seat's (step.ts answers invalid-seat first)
    try {
      sitDown(d.interior, 0, d.nav); sitDown(d.interior, 1, d.weapons); sitDown(d.interior, 2, d.science); enemyAt(d, 1200);
      for (const [pid, c] of [[0, { kind: 'contactScan', contact: 0 }], [1, { kind: 'laserLock', room: 1 }], [1, { kind: 'torpLock', room: 2 }], [2, { kind: 'designate', contact: 0 }]] as [number, DuelCommand][])
        expect(step(d, [env(d, pid, c)])[0], c.kind).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      enemyAt(d, 600);
      expect(step(d, [env(d, 1, { kind: 'laserLock', room: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(step(d, [env(d, 2, { kind: 'designate', contact: 0 })])[0]).toMatchObject({ status: 'applied' });
      step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 })]);              // 0 bars: range 300, rate 0
      expect(step(d, [env(d, 0, { kind: 'contactScan', contact: 0 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      expect(step(d, [env(d, 1, { kind: 'laserLock', room: -1 })])[0]).toMatchObject({ status: 'applied' });   // clearing needs nothing seen
    } finally { disposeDuel(d); }
  });
  it('Sensors capacity loses a slot per hazard in its room (fire, breach), 0 while failed', () => {
    const d = createDuel(HOUND, 13);
    try {
      const O = d.systemRooms[DuelSystem.Sensors]!, site = d.interior.derived.siteRoom.findIndex((r) => r === O);
      expect(capacityOf(d, DuelSystem.Sensors)).toBe(4);
      igniteRoom(d.interior, O); expect(capacityOf(d, DuelSystem.Sensors)).toBe(3);
      activateBreach(d.interior, site); expect(capacityOf(d, DuelSystem.Sensors)).toBe(2);
      d.tactical.systems[0].bars[DuelSystem.Sensors] = 4; clampToCapacity(d);
      expect(d.tactical.systems[0].bars[DuelSystem.Sensors]).toBe(2);
      d.power.failed[DuelSystem.Sensors] = 1; expect(capacityOf(d, DuelSystem.Sensors)).toBe(0);
    } finally { disposeDuel(d); }
  });
});
