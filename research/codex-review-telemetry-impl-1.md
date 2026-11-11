# Codex review: 4-ii implementation (2026-11-11)

No production counting or flatten/unflatten defect found. Findings are test gaps. Direct probes passed; Vitest startup was blocked by `spawn EPERM`.

1. **Minor — tests/telemetry.test.ts:220:** Event-time assertions hide the required `+1`: every tested timestamp rounds identically without it. Add a rounding-boundary assertion:
   ```ts
   expect(eventSeconds(2)).toBe(0.1);
   expect(durationSeconds(2)).toBe(0);
   ```

2. **Minor — tests/telemetry.test.ts:47:** The offline-seat fixture checks manning only; it would miss treating an offline seated player as active. Assert seating survives and idle advances; cover zero allocation too:
   ```ts
   expect(Seated.station[s.crew[0]!]).toBe(n);
   expect(s.telemetry.idleRun[0]).toBe(1);
   s.stations.failed[n] = 0; s.stations.level[n] = 0;
   telemetrySystem(s);
   expect(s.telemetry.idleRun[0]).toBe(2);
   expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(10);
   ```

3. **Minor — tests/telemetry.test.ts:51:** No fixture exercises `shedPower` standing another seated operator during `step()`. The downed-operator fixture cannot detect counting a Conscious operator before shedding. Add:
   ```ts
   const s = makeState(2); quiet(s);
   const eng = s.derived.stationOfKind[StationKind.Engineering]!;
   const doors = s.derived.stationOfKind[StationKind.Doors]!;
   setSkill(s, 0, Skill.Engineering, 4);
   sitDown(s, 0, eng); sitDown(s, 1, doors);
   s.power.capacity = powerUsed(s) - 1;
   run(s, 1);
   run(s, 1, () => intents({ cancelPressed: true }, {}));
   expect([
     s.stations.level[doors], Seated.station[s.crew[1]!],
     s.telemetry.mannedTicks[StationKind.Doors], s.telemetry.idleRun[1]
   ]).toEqual([0, -1, 1, 1]);
   ```

4. **Minor — tests/telemetry.test.ts:83:** Revive completion is tested without a competing repair target, and never followed by another downing. Add fire to that fixture; verify revive priority, then repeat the lifecycle without overwriting the first event:
   ```ts
   // Before the completion step:
   igniteRoom(s, room(s, 'G'));
   // After completion:
   expect(s.rooms.fireRepair[room(s, 'G')]).toBe(0);
   expect(s.telemetry.prevLife[1]).toBe(LifeState.Conscious);
   run(s, 1);
   expect(s.telemetry.idleRun[0]).toBe(1);
   const first = [s.telemetry.firstDownTick, s.telemetry.firstDownPid];
   downCrew(s, 1); run(s, 1);
   expect(s.telemetry.prevLife[1]).toBe(LifeState.Downed);
   expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual(first);
   ```
   Record the original downing with `run(s, 1)` before completing the revive; otherwise the first event remains unset.

5. **Minor — tests/telemetry.test.ts:166:** The skipped-spawn branch asserts nothing, despite claiming skipped attempts increment nothing. Every fresh fixture has available targets. Add an explicit cap-rejection fixture:
   ```ts
   const capped = makeState(2); armSpawn(capped);
   capped.debris.active.fill(1);
   directorSystem(capped);
   expect(capped.director.lastType).toBe(-1);
   expect(Array.from(capped.telemetry.spawns)).toEqual([0, 0, 0, 0]);
   ```
   Also assert zero counters before the existing `continue`.