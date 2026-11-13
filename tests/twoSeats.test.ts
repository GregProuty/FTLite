import { describe, it, expect } from 'vitest';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { reachable, beaconIndex } from '../src/renderer/src/sim/run';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown, selectTab } from '../src/renderer/src/sim/stations';
import { Seated } from '../src/renderer/src/sim/components';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { botIntent } from '../src/renderer/src/sim/bot';
import { makeState, run, quiet, intents, chargeJump, seatNavigator, allHazard, RECRUITS } from './helpers/sim';

const SKIFF = parseShip(skiff);
/** Two players, a quiet hazard map, the drive charged, P1 (pid 0) seated at Navigation with the cursor on the first jump row. */
function ready() {
  const s = makeState(2); quiet(s); allHazard(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
  const n = seatNavigator(s, 0); run(s, 1); chargeJump(s); s.stations.cursor[n] = 0; return { s, n };
}
const seat = (s: ReturnType<typeof makeState>, pid: number, kind: number): number => { const i = s.derived.stationOfKind[kind]!; sitDown(s, pid, i); if (kind === StationKind.Engineering) s.stations.cursor[i] = StationKind.Navigation; return i; };   // Engineering's cursor on the Navigation row: a Confirm there cycles its coolant

describe('B1: any other player agrees to a jump (spec Demo-xi section 1)', () => {
  it('a seated non-Navigation Confirm agrees and is consumed: its card did not act', () => {
    const { s, n } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    const dest = reachable(s)[0]!, coolant = s.stations.coolant[n]!;   // Engineering's cursor 0 is the Navigation row: a Confirm there would cycle its coolant
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.jumpPending).toBe(beaconIndex(dest.column, dest.node));
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect([s.run.column, s.run.node, s.run.jumpPending]).toEqual([1, dest.node, -1]);
    expect(s.stations.coolant[n]).toBe(coolant);
  });
  it('without a pending jump the same seated Confirm acts on the card', () => {
    const { s, n } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    const coolant = s.stations.coolant[n]!;
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect(s.stations.coolant[n]).not.toBe(coolant);
  });
  it('the Navigation occupant\'s own Confirm does not agree', () => {
    const { s } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    run(s, 1, () => intents({ confirmPressed: true }, {})); run(s, 1);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.column).toBe(0); expect(s.run.jumpPending).toBeGreaterThanOrEqual(0);
  });
  it('a standing Confirm still agrees', () => {
    const { s } = ready();
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    run(s, 1, () => intents({}, { confirmPressed: true }));
    expect([s.run.column, s.run.jumpPending]).toEqual([1, -1]);
  });
  it('the Helm officer on the Skiff\'s Weapons tab is still the Navigation occupant: the Confirm does not agree (amendment 1)', () => {
    const s = createSimState(SKIFF, 2, 1, RECRUITS); quiet(s); allHazard(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, wpn = s.derived.stationOfKind[StationKind.Weapons]!, g = s.derived.stationGroup[nav]!;
    expect(g).toBeGreaterThanOrEqual(0); expect(s.derived.stationGroup[wpn]).toBe(g);
    sitDown(s, 0, nav); run(s, 1); chargeJump(s);
    const dest = reachable(s)[0]!; s.run.jumpPending = beaconIndex(dest.column, dest.node); s.run.jumpPendingTick = s.tick;
    selectTab(s, 0, g, s.derived.groupStations[g]!.indexOf(wpn)); expect(Seated.station[s.crew[0]!]).toBe(wpn);
    step(s, intents({ confirmPressed: true }, {}));
    expect([s.run.column, s.run.jumpPending]).toEqual([0, beaconIndex(dest.column, dest.node)]);
  });
  it('the captain bot still gets its jump agreed by the other bot (bot.ts)', () => {
    const { s } = ready(); run(s, 1, () => intents({ confirmPressed: true }, {}));
    step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); expect(s.run.column).toBe(1);
  });
});

describe('B1: seated bots agree from their seats (spec Demo-xi amendment 4)', () => {
  it('a bot seated at a non-Navigation console presses Confirm while a jump is pending, and the jump goes', () => {
    const { s } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    expect(botIntent(s, 1).confirmPressed).toBe(false);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(botIntent(s, 1).confirmPressed).toBe(true);
    step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); expect(s.run.column).toBe(1);
  });
  it('the seated captain bot never agrees to its own jump', () => {
    const { s } = ready(); seat(s, 1, StationKind.Engineering); run(s, 1);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    step(s, [botIntent(s, 0), NEUTRAL_INTENT]); expect(s.run.column).toBe(0);
  });
});
