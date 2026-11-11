import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { scanStep } from '../src/renderer/src/sim/science';
import { Seated } from '../src/renderer/src/sim/components';
import { DT, SCAN_TIME } from '../src/renderer/src/sim/tuning';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { makeState, intents, run, placeDebris, room, seconds, overdrive } from './helpers/sim';

const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const confirm = { confirmPressed: true }, down = { moveY: 1 }, cancel = { cancelPressed: true };

describe('scanning', () => {
  it('Confirm starts a scan of an unscanned target; progress is DT x output / SCAN_TIME per tick; completion marks scanned and stops', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, 1e6, 1, undefined, 2);
    sitDown(s, 0, i);                                                           // starter Science level 1: output 0.375
    run(s, 5);
    expect(s.debris.scan[0]).toBe(0); expect(s.science.scanning).toBe(0);     // seated but no Confirm: nothing
    run(s, 1, () => intents(confirm));
    expect(s.science.scanning).toBe(1); expect(s.debris.scan[0]).toBe(0);     // starts this tick, progresses from the next
    run(s, 1);
    expect(s.debris.scan[0]).toBeCloseTo(DT * 0.375 / SCAN_TIME);
    run(s, 1, () => intents(confirm));
    expect(s.science.scanning).toBe(1);                                        // Confirm while scanning never stops it
    run(s, seconds(16) + 1);
    expect(s.debris.scanned[0]).toBe(1); expect(s.debris.scan[0]).toBe(1); expect(s.science.scanning).toBe(0);
    run(s, 1, () => intents(confirm));
    expect(s.science.scanning).toBe(0);                                        // Confirm on a scanned object does nothing
    placeDebris(s, A, 1e6, 1, undefined, 1);                                   // slot 1, unscanned
    s.stations.cursor[i] = 1; run(s, 1, () => intents(confirm)); run(s, 30);
    const p1 = s.debris.scan[1]!; expect(p1).toBeGreaterThan(0);
    s.stations.cursor[i] = 0; run(s, 30);                                      // a scanned object is selected while scanning: nothing progresses
    expect(s.science.scanning).toBe(1); expect(s.debris.scan[1]).toBe(p1); expect(s.debris.scan[0]).toBe(1);
    run(s, 1, () => intents(cancel)); failStation(s, i);                       // revealed information survives a stand and a failure
    expect(s.debris.scanned[0]).toBe(1); expect(s.debris.frequency[0]).toBe(2);
    expect(buildHudModel(s, [{ status: 'active', key: 'kb:0' }], 'running', '').threats.map((t) => t.text).filter((x) => /F\d$/.test(x))[0]).toMatch(/F2$/);   // the Power threat precedes debris, so take the first debris one
  });
  it('Confirm with cursor -1, an inactive slot or an unwarned object starts nothing', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, i);
    run(s, 1, () => intents(confirm)); expect(s.science.scanning).toBe(0);                 // cursor -1
    s.stations.cursor[i] = 3; run(s, 1, () => intents(confirm)); expect(s.science.scanning).toBe(0);   // inactive slot
    const u = placeDebris(s, A, 1e6, 0); s.stations.cursor[i] = u;
    run(s, 1, () => intents(confirm));
    expect(s.science.scanning).toBe(0); expect(s.debris.scan[u]).toBe(0);                  // active but unwarned
  });
  it('same tick: Down + Confirm starts scanning the newly selected target', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, 1e6, 1, 10, 2); placeDebris(s, A, 1e6, 1, 20, 1);
    s.debris.scanned[0] = 1; s.debris.scan[0] = 1;                                           // the old target is scanned: Confirm on it would start nothing
    sitDown(s, 0, i);
    expect(s.stations.cursor[i]).toBe(0);
    run(s, 1, () => intents({ moveY: 1, confirmPressed: true }));
    expect(s.stations.cursor[i]).toBe(1); expect(s.science.scanning).toBe(1);                 // the stick edge moved the cursor first, then Confirm acted on slot 1
  });
  it('level 2 scans within 8 s; overdriven within 5.4 s; unmanned or offline never progresses', () => {
    const a = makeState(1), ia = sci(a), A = room(a, 'A');
    a.spawner.nextSpawnTick = 1e9; a.stations.level[ia] = 2; placeDebris(a, A, 1e6, 1); sitDown(a, 0, ia);
    run(a, 1, () => intents(confirm)); run(a, seconds(8) + 2);
    expect(a.debris.scanned[0]).toBe(1);
    const b = makeState(1), ib = overdrive(b, StationKind.Science);
    b.spawner.nextSpawnTick = 1e9; b.stations.coolant[ib] = 2; placeDebris(b, A, 1e6, 1); sitDown(b, 0, ib);   // held overdrive: no overheat during the scan
    run(b, 1, () => intents(confirm)); run(b, Math.ceil(seconds(6 / 1.125)) + 2);
    expect(b.debris.scanned[0]).toBe(1);
    const c = makeState(1), ic = sci(c);
    c.spawner.nextSpawnTick = 1e9; placeDebris(c, A, 1e6, 1); c.science.scanning = 1; c.stations.cursor[ic] = 0;
    run(c, seconds(5));
    expect(c.debris.scan[0]).toBe(0);                                           // nobody seated
    sitDown(c, 0, ic); run(c, 1, () => intents(confirm)); run(c, 30);
    const p = c.debris.scan[0]!; expect(p).toBeGreaterThan(0);
    failStation(c, ic);
    expect(Seated.station[c.crew[0]!]).toBe(-1); expect(c.science.scanning).toBe(0);
    run(c, 30); expect(c.debris.scan[0]).toBe(p);                               // the failure stood the operator and stopped the scan
    c.stations.occupant[ic] = 0; c.science.scanning = 1; scanStep(c);           // occupied but offline (failed stays 1)
    expect(c.debris.scan[0]).toBe(p);
    c.stations.occupant[ic] = -1;
  });
  it('switching targets pauses the first object and resumes the second from its own progress; Cancel clears scanning and a re-seat resumes', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, 1e6, 1, 10); placeDebris(s, A, 1e6, 1, 20);
    sitDown(s, 0, i);
    run(s, 1, () => intents(confirm)); run(s, seconds(4));
    run(s, 1, () => intents(down));                                              // scanStep precedes input: slot 0 advances once more on this tick, then the cursor moves
    const first = s.debris.scan[0]!; expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(1);
    run(s, seconds(2));                                                          // scanning continues on slot 1
    expect(s.stations.cursor[i]).toBe(1); expect(s.science.scanning).toBe(1);
    expect(s.debris.scan[0]).toBe(first); expect(s.debris.scan[1]).toBeGreaterThan(0);
    run(s, 1, () => intents(cancel));                                            // the Cancel tick still scanned once before the stand
    const second = s.debris.scan[1]!;
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.science.scanning).toBe(0);
    run(s, seconds(2));
    expect(s.debris.scan[1]).toBe(second);                                       // paused, not lost
    sitDown(s, 0, i); s.stations.cursor[i] = 1;
    run(s, 1, () => intents(confirm)); run(s, 1);
    expect(s.debris.scan[1]).toBeGreaterThan(second);                            // resumed from the kept progress
  });
  it('impact of the object being scanned discards its progress and retargets', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(3), 1, 10); placeDebris(s, A, 1e6, 1, 20);
    sitDown(s, 0, i);
    run(s, 1, () => intents(confirm)); run(s, seconds(1));
    expect(s.debris.scan[0]).toBeGreaterThan(0);
    run(s, seconds(2) + 1);                                                      // slot 0 impacts
    expect(s.debris.active[0]).toBe(0); expect(s.debris.scan[0]).toBe(0); expect(s.stations.cursor[i]).toBe(1);
    expect(s.science.scanning).toBe(1);                                          // still scanning: now the retargeted object
    scanStep(s);
    expect(s.debris.scan[1]).toBeGreaterThan(0);
  });
});
