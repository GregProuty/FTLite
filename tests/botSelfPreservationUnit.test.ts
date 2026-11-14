// Synthetic, intentionally out-of-domain fire=1e6 fixtures. Exact original scenarios use owned whole-phase execution.
import { describe, it, expect } from 'vitest';
import { snapshotPhaseStep as step, snapshotPhaseClient } from './helpers/snapshotPhaseFixture';
import { botPolicyIntent, BOT_RECOVER_HEALTH } from './helpers/bot';
import { EVENTS } from '../src/renderer/src/sim/events';
import { NodeType } from '../src/renderer/src/sim/run';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom, extinguishRoom } from '../src/renderer/src/sim/hazards/fire';
import { downCrew } from '../src/renderer/src/sim/crew';
import { roomAt, conditionRoomAt, DoorState } from '../src/renderer/src/sim/grid';
import { Life, LifeState, Seated, Position, Health } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import type { SimState } from '../src/renderer/src/sim/state';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { makeState, quiet, mapM, setNodeTypes, setEvent, grantScrap, chargeJump, placeBoarder, teleport, setMap, MAP_M_NODES, MAP_M_MASKS } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { EndReason } from '../src/renderer/src/sim/crew';
import { SECTORS, SECTOR_COLUMNS } from '../src/renderer/src/sim/tuning';

/** A quiet two-Recruit state on map M, all Hazard, enemy and boarders silenced (spec Demo-i section 8). */
function calm(): SimState {
  const s = makeState(2, 1); quiet(s); mapM(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
  return s;
}
const botIntent = (s: SimState, player: number) => { const { view, ui } = snapshotPhaseClient(s); return botPolicyIntent(view, ui, player); };
const tick = (s: SimState): void => step(s, [botIntent(s, 0), botIntent(s, 1)]);
const nav = (s: SimState): number => s.derived.stationOfKind[StationKind.Navigation]!;

describe('bot self-preservation (spec Demo-ii section 10)', () => {
  const mbRoom = (s: SimState): number => s.derived.stationRoom[s.derived.stationOfKind[StationKind.Medbay]!]!;
  const roomOf = (s: SimState, pid: number): number => roomAt(s, Position.x[s.crew[pid]!]!, Position.y[s.crew[pid]!]!);
  const hurt = (s: SimState, pid: number, hp: number): void => { Health.cur[s.crew[pid]!] = hp; };
  const burn = (s: SimState, r: number): void => { igniteRoom(s, r); s.rooms.fire[r] = 1e6; };
  it('(a) at health 20 it never enters a burning corridor on its route to a hazard goal, and reaches the goal once the fire is out', () => {
    const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!);   // no Medbay to retreat to: ordinary duty
    failStation(s, 2); teleport(s, 1, 3.5, 9.5);   // room 6, below the corridor (room 5); Weapons (room 1) lies beyond it
    const lone = (): void => step(s, [NEUTRAL_INTENT, botIntent(s, 1)]);   // pid 0 stands still so only pid 1 can reach the console
    expect(roomOf(s, 1)).toBe(6); expect(s.derived.stationRoom[2]).toBe(1);
    burn(s, 5); hurt(s, 1, 20); hurt(s, 0, 100);
    for (let t = 0; t < 600; t++) { lone(); hurt(s, 1, 20); s.rooms.fire[5] = 1e6; expect(roomOf(s, 1)).not.toBe(5); }
    expect(s.stations.failed[2]).toBe(1);
    extinguishRoom(s, 5);
    let fixed = false;
    for (let t = 0; t < 3000 && !fixed; t++) { lone(); hurt(s, 1, 20); if (!s.stations.failed[2]) fixed = true; }
    expect(fixed).toBe(true);
  });
  it('(f) trapped at health 20 in a burning room with the corridor burning too, it fights or walks and never idles', () => {
    const s = calm(); teleport(s, 1, 7.5, 2.5); teleport(s, 0, 2.5, 9.5); burn(s, 1); burn(s, 5); hurt(s, 1, 20);
    let fought = 0, safe = false;
    for (let t = 0; t < 600 && !safe; t++) {
      const i = botIntent(s, 1), r = roomOf(s, 1);
      if (r >= 0 && s.rooms.fire[r]! <= 0) { safe = true; break; }   // reached a room that is not burning
      expect(i.interactHeld || i.moveX !== 0 || i.moveY !== 0).toBe(true);   // never idles while it burns
      if (i.interactHeld) fought++;
      step(s, [botIntent(s, 0), i]); hurt(s, 1, 20); s.rooms.fire[1] = 1e6; s.rooms.fire[5] = 1e6;
    }
    expect(safe || fought > 0).toBe(true);   // the fallback either walked it out to a fire-free room or it fought the fire it stood in
  });
  it('(g) the captain at 20 health with a ready drive and the Medbay offline never walks into a burning corridor', () => {
    const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!); chargeJump(s); burn(s, 5); hurt(s, 0, 20); hurt(s, 1, 100);
    for (let t = 0; t < 600; t++) { tick(s); hurt(s, 0, 20); s.rooms.fire[5] = 1e6; expect(roomOf(s, 0)).not.toBe(5); }
  });
  it('(b) at health 20 inside a burning room it leaves within 120 ticks', () => {
    const s = calm(); burn(s, 1); teleport(s, 1, 7.5, 2.5); hurt(s, 1, 20);
    let out = -1;
    for (let t = 0; t < 120 && out < 0; t++) { tick(s); hurt(s, 1, 20); s.rooms.fire[1] = 1e6; if (roomOf(s, 1) !== 1) out = t; }
    expect(out).toBeGreaterThanOrEqual(0);
  });
  it('(c) at health 20 with the Medbay online it walks there and stays until health 60 despite a hazard goal, then leaves', () => {
    const s = calm(); hurt(s, 1, 20); hurt(s, 0, 100); teleport(s, 0, 2.5, 3.5);
    const mr = mbRoom(s);
    let far = -1; for (let r = 0; r < s.rooms.fire.length && far < 0; r++) if (r !== mr && r !== roomOf(s, 1) && r !== roomOf(s, 0)) far = r;
    expect(far).toBeGreaterThanOrEqual(0);
    burn(s, far);   // a hazard goal exists before the bot reaches 30
    let arrived = false, healedAt = -1, leftAt = -1;
    for (let t = 0; t < 6000 && leftAt < 0; t++) {
      tick(s); s.rooms.fire[far] = 1e6;
      const hp = Health.cur[s.crew[1]!]!;
      if (roomOf(s, 1) === mr) arrived = true;
      if (arrived && hp < BOT_RECOVER_HEALTH) expect(roomOf(s, 1)).toBe(mr);
      if (healedAt < 0 && hp >= BOT_RECOVER_HEALTH) healedAt = t;
      if (healedAt >= 0 && roomOf(s, 1) !== mr) leftAt = t;
    }
    expect(arrived).toBe(true); expect(healedAt).toBeGreaterThan(0); expect(leftAt).toBeGreaterThan(healedAt);
  });
  // Demo-v (docs/superpowers/specs/2026-11-12-bot-fire-design.md): door (9, 7) joins the corridor (room 5) above to room 7 below; room 7's only way out is the corridor
  const atDoor = (s: SimState, pid: number): void => { teleport(s, pid, 9.5, 7.5); s.doors.state[s.derived.doorTileToEdge[7 * s.derived.width + 9]!] = DoorState.Open; };   // standing in the open doorway
  const inFire = (s: SimState, pid: number): boolean => { const r = conditionRoomAt(s, Position.x[s.crew[pid]!]!, Position.y[s.crew[pid]!]!); return r >= 0 && s.rooms.fire[r]! > 0; };
  it('(h) at health 20 in a doorway beside a burning corridor, with the Medbay cut off and a healthy teammate, it steps out of the doorway within 60 ticks', () => {
    const s = calm(); atDoor(s, 1); teleport(s, 0, 2.5, 9.5); burn(s, 5); hurt(s, 1, 20); hurt(s, 0, 100);
    expect(roomOf(s, 1)).toBe(-1); expect(inFire(s, 1)).toBe(true);
    let out = -1;
    for (let t = 0; t < 60 && out < 0; t++) { step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); hurt(s, 1, 20); s.rooms.fire[5] = 1e6; if (roomOf(s, 1) >= 0 && !inFire(s, 1)) out = t; }
    expect(out).toBeGreaterThanOrEqual(0);
  });
  for (const mate of [100, 20]) {
    it(`(i) at health 20 at a burning doorway with no safe Medbay (teammate at ${mate}) it leaves for good or holds Interact on the fire, and never dithers`, () => {
      const s = calm(); failStation(s, s.derived.stationOfKind[StationKind.Medbay]!);
      atDoor(s, 1); teleport(s, 0, 2.5, 9.5); burn(s, 5); hurt(s, 1, 20); hurt(s, 0, mate);
      let reversals = 0, lastX = 0, lastY = 0, outSince = -1, fightSince = -1;
      for (let t = 0; t < 600; t++) {
        const i = botIntent(s, 1);
        const sx = Math.sign(Math.round(i.moveX * 10)), sy = Math.sign(Math.round(i.moveY * 10));
        if (sx !== 0) { if (lastX !== 0 && sx !== lastX) reversals++; lastX = sx; }
        if (sy !== 0) { if (lastY !== 0 && sy !== lastY) reversals++; lastY = sy; }
        step(s, [NEUTRAL_INTENT, i]); hurt(s, 1, 20); hurt(s, 0, mate); s.rooms.fire[5] = 1e6;
        for (let r = 0; r < s.rooms.fire.length; r++) if (r !== 5 && s.rooms.fire[r]! > 0) extinguishRoom(s, r);   // a fixed state: no spread
        const out = roomOf(s, 1) >= 0 && !inFire(s, 1), fight = i.interactHeld && roomOf(s, 1) === 5;
        outSince = out ? (outSince < 0 ? t : outSince) : -1; fightSince = fight ? (fightSince < 0 ? t : fightSince) : -1;
      }
      expect(reversals).toBeLessThanOrEqual(2);
      expect(outSince >= 0 || fightSince >= 0).toBe(true);   // at the end it is out of the fire, or holding Interact in the burning corridor
      expect(Math.max(outSince, fightSince)).toBeLessThanOrEqual(300);   // and has been for at least the second half
      if (mate === 100) expect(outSince).toBeGreaterThanOrEqual(0);   // a healthy teammate is the one to fight it: the hurt bot waits outside
      else expect(fightSince).toBeGreaterThanOrEqual(0);   // nobody healthier: it fights the fire rather than idling while the ship burns
    });
  }
  it('(e) at health 80 it still walks into a burning room to fight the fire', () => {
    const s = calm(); burn(s, 1); hurt(s, 1, 80); hurt(s, 0, 80);
    let entered = false;
    for (let t = 0; t < 600 && !entered; t++) { tick(s); hurt(s, 1, 80); s.rooms.fire[1] = 1e6; if (roomOf(s, 1) === 1) entered = true; }
    expect(entered).toBe(true);
  });
});
