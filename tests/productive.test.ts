import { describe, it, expect } from 'vitest';
import { recent, isProductive } from '../src/renderer/src/sim/productive';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Health } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Skill } from '../src/renderer/src/sim/skills';
import { PRODUCTIVE_WINDOW_TICKS, HAZARD_EVERY, HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, overdrive, setSkill, teleport } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const confirm = { confirmPressed: true }, right = { moveX: 1 }, down = { moveY: 1 };

describe('recent', () => {
  it('an unset stamp is never recent, a set one is recent until the window elapses', () => {
    expect(recent(-1, 0, 300)).toBe(false); expect(recent(-1, 1000, 300)).toBe(false);
    expect(recent(100, 100, 300)).toBe(true); expect(recent(100, 399, 300)).toBe(true); expect(recent(100, 400, 300)).toBe(false);
    expect(recent(100, 99, 300)).toBe(false);                                   // a stamp from the future is not recent
  });
});

describe('isProductive', () => {
  it('Navigation and Science: a warned object; Science scanning alone with nothing warned is not enough', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation), sci = idx(s, StationKind.Science), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, nav); sitDown(s, 1, sci);
    expect(isProductive(s, nav)).toBe(false); expect(isProductive(s, sci)).toBe(false);
    s.science.scanning = 1; s.stations.cursor[sci] = 0;                          // no valid target: the scan branch needs one
    expect(isProductive(s, sci)).toBe(false);
    placeDebris(s, A, 600, 1);
    expect(isProductive(s, nav)).toBe(true); expect(isProductive(s, sci)).toBe(true);
    s.science.scanning = 0;
    expect(isProductive(s, sci)).toBe(true);                                      // warned alone suffices
  });
  it('Engineering: overdrive, a shortfall covered by bonus bars, or a recent change', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, eng);
    expect(isProductive(s, eng)).toBe(false);                                     // stamps unset at tick 0
    s.stations.cursor[eng] = StationKind.Doors; run(s, 1, () => intents(right)); // Doors 1 -> 2 (the spare bar): a change, and an overdrive
    expect(s.skills.lastEngChangeTick).toBe(0); expect(isProductive(s, eng)).toBe(true);
    run(s, 1, () => intents({ moveX: -1 }));                                      // back to 1: no overdrive, but the change is recent
    expect(isProductive(s, eng)).toBe(true);
    run(s, PRODUCTIVE_WINDOW_TICKS);
    expect(s.tick - s.skills.lastEngChangeTick).toBeGreaterThanOrEqual(PRODUCTIVE_WINDOW_TICKS); expect(isProductive(s, eng)).toBe(false);
    s.stations.cursor[eng] = StationKind.Weapons; run(s, 1, () => intents(right)); run(s, 1);   // Weapons 1 -> 2 takes the spare bar without overdrive (its max is 3)
    const stamp = s.skills.lastEngChangeTick; run(s, 1, () => intents(right));   // refused: the pool is empty, so no re-stamp
    expect(s.skills.lastEngChangeTick).toBe(stamp);
    run(s, PRODUCTIVE_WINDOW_TICKS + 1); expect(isProductive(s, eng)).toBe(false);
    s.stations.cursor[eng] = StationKind.Weapons; run(s, 1, () => intents(confirm));   // coolant 0 -> 1 on Weapons: a change
    expect(s.stations.coolant[idx(s, StationKind.Weapons)]).toBe(1); expect(s.skills.lastEngChangeTick).toBe(s.tick - 1); expect(isProductive(s, eng)).toBe(true);
    run(s, PRODUCTIVE_WINDOW_TICKS + 1);
    s.stations.cursor[eng] = StationKind.Engineering; run(s, 1, () => intents(confirm));   // refused: the Engineering row holds no coolant
    expect(isProductive(s, eng)).toBe(false);
    const t = makeState(1), engT = idx(t, StationKind.Engineering), doors = idx(t, StationKind.Doors);
    t.spawner.nextSpawnTick = 1e9; setSkill(t, 0, Skill.Engineering, 8); sitDown(t, 0, engT);
    const navT = idx(t, StationKind.Navigation), sciT = idx(t, StationKind.Science), medT = idx(t, StationKind.Medbay);
    t.stations.level[navT] = 2; t.stations.level[sciT] = 2; t.stations.level[medT] = 2;   // usage 12 against base 10, nothing overdriven (all three have max 2): covered by the two bonus bars
    expect(t.stations.level[doors]).toBe(1); expect(isProductive(t, engT)).toBe(true);
    t.stations.level[navT] = 1; t.stations.level[sciT] = 1; t.stations.level[medT] = 1;   // back under base capacity
    expect(isProductive(t, engT)).toBe(false);
  });
  it('Life Support: recent delivery only; Medbay: a hurt Conscious patient in the room', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport), med = idx(s, StationKind.Medbay);
    s.spawner.nextSpawnTick = 1e9;
    expect(isProductive(s, ls)).toBe(false);
    const drained = room(s, 'A'); activateBreach(s, 0);   // site 0 is in room A; every room is full, and the only room with free volume is the breached one, so no delivery
    for (let r = 0; r < s.rooms.o2.length; r++) if (r !== drained) s.rooms.o2[r] = s.derived.volume[r]!;
    for (let pid = 0; pid < s.playerCount; pid++) teleport(s, pid, 2.5, 2.5);                                 // crew in the breached room: breathing makes no room elsewhere
    run(s, 1); expect(s.skills.lsDeliveredTick).toBe(-1); expect(isProductive(s, ls)).toBe(false);
    s.skills.lsDeliveredTick = 10; s.tick = 15; expect(isProductive(s, ls)).toBe(true);
    s.tick = 16; expect(isProductive(s, ls)).toBe(false); expect(HAZARD_EVERY + 1).toBe(6);
    s.tick = 0; sitDown(s, 0, med);
    expect(isProductive(s, med)).toBe(false);                                     // the operator sits in the Medbay but is at full health
    Health.cur[s.crew[0]!] = HEALTH_MAX - 1;
    expect(isProductive(s, med)).toBe(true);
  });
  it('Doors: a fire or breach anywhere, or a recent remote toggle; local toggles do not count', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, doors);
    expect(isProductive(s, doors)).toBe(false);
    igniteRoom(s, room(s, 'G'));
    expect(isProductive(s, doors)).toBe(true);
    s.rooms.fire[room(s, 'G')] = 0;
    teleport(s, 1, 2.5, 8.5); run(s, 1, () => intents({}, confirm));            // player 1 toggles a door locally
    expect(s.skills.lastDoorToggleTick).toBe(-1); expect(isProductive(s, doors)).toBe(false);
    run(s, 1, () => intents(confirm, {}));                                       // the seated operator toggles remotely
    expect(s.skills.lastDoorToggleTick).toBe(s.tick - 1); expect(isProductive(s, doors)).toBe(true);
    run(s, PRODUCTIVE_WINDOW_TICKS - 2); expect(s.tick - s.skills.lastDoorToggleTick).toBe(PRODUCTIVE_WINDOW_TICKS - 1); expect(isProductive(s, doors)).toBe(true);
    run(s, 1); expect(isProductive(s, doors)).toBe(false);                      // exactly PRODUCTIVE_WINDOW_TICKS old: expired
    run(s, 1, () => intents(down, {}));                                          // moving the cursor is not a toggle
    expect(isProductive(s, doors)).toBe(false);
  });
  it('Weapons (director predicate only): a recent shot', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons);
    expect(isProductive(s, wpn)).toBe(false);
    s.skills.lastShotTick = 0; s.tick = PRODUCTIVE_WINDOW_TICKS - 1; expect(isProductive(s, wpn)).toBe(true);
    s.tick = PRODUCTIVE_WINDOW_TICKS; expect(isProductive(s, wpn)).toBe(false);
  });
  it('a Doors overdrive is not Engineering productivity for a station that is not Engineering', () => {
    const s = makeState(1), doors = overdrive(s, StationKind.Doors);
    sitDown(s, 0, doors);
    expect(isProductive(s, doors)).toBe(false);
  });
});
