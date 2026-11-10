import { describe, it, expect } from 'vitest';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../src/renderer/src/sim/interact';
import { Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { DoorState } from '../src/renderer/src/sim/grid';
import { REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REVIVE_TIME, HEALTH_MAX, REVIVE_HEALTH_FRAC } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, room, seconds } from './helpers/sim';
import { failStation } from '../src/renderer/src/sim/power';

describe('targets', () => {
  it('fire in own room is a target anywhere in the room; none when nothing is near', () => {
    const s = makeState(1);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.None, index: -1 });
    igniteRoom(s, room(s, 'G'));
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Fire, index: room(s, 'G') });
  });
  it('a breach site is a target when its wall tile is in reach', () => {
    const s = makeState(1);
    activateBreach(s, 6); // G bottom wall at (2,11)
    teleport(s, 0, 2.5, 10.5);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Breach, index: 6 });
    teleport(s, 0, 5.5, 8.5);
    expect(interactTarget(s, 0).kind).toBe(TargetKind.None);
  });
  it('revive outranks repair', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'G'));
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 30;
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Revive, index: 1 });
  });
  it('confirm target is the nearest door in reach', () => {
    const s = makeState(1);
    teleport(s, 0, 5.5, 9.5);              // the spawn tile itself is exactly REACH from the G door
    expect(confirmTarget(s, 0).kind).toBe(ConfirmKind.None);
    teleport(s, 0, 2.5, 8.5);
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Door, index: 5 });
  });
  it('fire outranks a power failure in the same room', () => {
    const s = makeState(2);
    const eng = s.derived.stationOfKind[3]!;
    failStation(s, eng);
    teleport(s, 0, 18.5, 9.5);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Power, index: eng });
    igniteRoom(s, room(s, 'C'));
    expect(interactTarget(s, 0).kind).toBe(TargetKind.Fire);
  });
});

describe('interactSystem', () => {
  it('two players pressing Confirm on the same door on the same tick leave it Sealed', () => {
    const s = makeState(2);
    teleport(s, 0, 2.5, 8.5); teleport(s, 1, 2.5, 8.5);
    run(s, 1, () => intents({ confirmPressed: true }, { confirmPressed: true }));
    expect(s.doors.state[5]).toBe(DoorState.Sealed);
  });
  it('holding Interact in a burning room extinguishes it after REPAIR_TIME_FIRE', () => {
    const s = makeState(1);
    const G = room(s, 'G');
    igniteRoom(s, G);
    run(s, seconds(REPAIR_TIME_FIRE) - 5, () => intents({ interactHeld: true }));
    expect(s.rooms.fire[G]).toBeGreaterThan(0);
    run(s, 10, () => intents({ interactHeld: true }));
    expect(s.rooms.fire[G]).toBe(0);
  });
  it('two repairers add their progress', () => {
    const s = makeState(2);
    const G = room(s, 'G');
    igniteRoom(s, G);
    run(s, seconds(REPAIR_TIME_FIRE / 2) + 5, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(s.rooms.fire[G]).toBe(0);
  });
  it('repairs a breach', () => {
    const s = makeState(1);
    activateBreach(s, 6);
    teleport(s, 0, 2.5, 10.5);
    run(s, seconds(REPAIR_TIME_BREACH) + 5, () => intents({ interactHeld: true }));
    expect(s.breaches.active[6]).toBe(0);
  });
  it('revives a downed teammate after REVIVE_TIME, interrupted progress decays', () => {
    const s = makeState(2);
    const downed = s.crew[1]!;
    Life.state[downed] = LifeState.Downed; Life.bleed[downed] = 30; Health.cur[downed] = 0;
    run(s, seconds(REVIVE_TIME / 2), () => intents({ interactHeld: true }));
    expect(Life.reviveProgress[downed]).toBeCloseTo(0.5, 1);
    expect(Life.reviverPid[downed]).toBe(0);
    run(s, seconds(REVIVE_TIME / 4), () => intents({ interactHeld: false }));
    expect(Life.reviveProgress[downed]).toBeCloseTo(0.25, 1);
    expect(Life.reviverPid[downed]).toBe(-1);
    run(s, seconds(REVIVE_TIME) , () => intents({ interactHeld: true }));
    expect(Life.state[downed]).toBe(LifeState.Conscious);
    expect(Health.cur[downed]).toBe(HEALTH_MAX * REVIVE_HEALTH_FRAC);
  });
  it('only the lowest PlayerId revives when two players try at once', () => {
    const s = makeState(3);
    const downed = s.crew[2]!;              // spawns at (4.5, 9.5)
    teleport(s, 0, 3.5, 10.5);             // both P1 and P2 within REACH of the casualty
    teleport(s, 1, 3.5, 9.5);
    Life.state[downed] = LifeState.Downed; Life.bleed[downed] = 30;
    run(s, 10, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(Life.reviverPid[downed]).toBe(0);
    expect(Life.reviveProgress[downed]).toBeCloseTo(10 / 60 / REVIVE_TIME, 5); // not doubled
  });
  it('Confirm at a door toggles its seal', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 8.6);
    run(s, 1, () => intents({ confirmPressed: true }));
    expect(s.doors.state[5]).toBe(DoorState.Sealed);
    run(s, 1, () => intents({ confirmPressed: true }));
    expect(s.doors.state[5]).toBe(DoorState.Closed);
  });
  it('downed crew cannot repair or confirm', () => {
    const s = makeState(1);
    const G = room(s, 'G');
    igniteRoom(s, G);
    Life.state[s.crew[0]!] = LifeState.Downed; Life.bleed[s.crew[0]!] = 30;
    run(s, 10, () => intents({ interactHeld: true, confirmPressed: true }));
    expect(s.rooms.fireRepair[G]).toBe(0);
  });
});
