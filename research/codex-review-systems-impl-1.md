# Codex review: Combat-ii implementation (2026-11-11)

No production correctness or flatten/unflatten asymmetry found. Boundary probes passed; Vitest startup was blocked by `spawn EPERM`.

1. **Minor — tests/snapshot.test.ts:282:** Round-trip values mask reader mistakes: engines HP equals its initial value (`0`), and Weapons/Shields repair timers both equal `-1`. Dropping the engines assignment or swapping those timers can pass. Add a serialization fixture with distinguishable values:

   ```ts
   s.enemy.sysHp.set([7, 11, 19]);
   s.enemy.sysRepairTick.set([111, 222, 333]);
   // After save/load:
   expect(Array.from(t.enemy.sysHp)).toEqual([7, 11, 19]);
   expect(Array.from(t.enemy.sysRepairTick)).toEqual([111, 222, 333]);
   ```

2. **Minor — tests/snapshot.test.ts:308:** Continuation covers Weapons repair but never saves an already-paused departure clock. Add an Engines-disabled fixture, run 100 ticks before saving, then continue through repair:

   ```ts
   expect(resumed.enemy.departTick).toBe(pushedDepart);
   run(whole, 50); run(resumed, 50);
   expect(resumed.enemy.departTick).toBe(pushedDepart + 20);
   expect(hashState(resumed)).toBe(hashState(whole));
   ```

   Set the repair deadline to tick 120 before the initial 100 ticks.

3. **Minor — tests/enemy.test.ts:344:** Direct `enemySystem` calls cannot catch console/repair ordering regressions. Add a nonlethal torpedo hit against disabled Weapons on its repair tick. Under §5, it damages hull only, then repair runs:

   ```ts
   // armedAt(ENEMY_WEAPONS_SLOT), torpedo loaded, combat pinned to 7:
   disableSystem(s, EnemySystem.Weapons);
   s.enemy.sysRepairTick[EnemySystem.Weapons] = s.tick;
   const tick = s.tick;
   run(s, 1, () => intents({ confirmPressed: true }, {}));
   expect(s.enemy.hull).toBe(65);
   expect(s.enemy.sysHp[EnemySystem.Weapons]).toBe(30);
   expect(s.telemetry.enemyDisables).toBe(0);
   expect(s.enemy.nextShotTick).toBe(tick + 300);
   ```

4. **Minor — tests/enemy.test.ts:163:** Leave coverage splits the important conditions across fixtures: two cursors with a successor, Weapons alone, and scanning on the hull. It misses Science on a subsystem with a paused object scan, and both consoles with no replacement. Add both cases:

   ```ts
   // Science cursor on Weapons row; Weapons cursor on Shields row:
   s.science.scanning = 1; s.debris.scan[b] = 0.4;
   leave(s, false);
   expect(s.science.scanning).toBe(0);
   expect(s.debris.scan[b]).toBe(0.4);
   expect([s.stations.cursor[w], s.stations.cursor[c]]).toEqual([b, b]);
   // Repeat with no objects:
   expect([alone.stations.cursor[w2], alone.stations.cursor[c2]])
     .toEqual([-1, -1]);
   ```

5. **Minor — tests/enemy.test.ts:400:** Scan tests omit station failure (§9) and completion on the destruction tick. Add a failure/pause/resume assertion, plus a full-step kill with `enemy.scan` one increment below completion:

   ```ts
   failStation(s, c);
   scanStep(s);
   expect(s.enemy.scan).toBe(kept);
   // Separate seated Weapons/Science fixture; lethal matched beam:
   run(k, 1, () => intents({ confirmPressed: true }, {}));
   expect([k.enemy.present, k.enemy.scan, k.enemy.scanned,
     k.science.scanning]).toEqual([0, 0, 0, 0]);
   ```

6. **Minor — tests/hud.test.ts:238:** The model reveals frequency only after Shields are disabled; formatter-only assertions do not verify the reader’s revealed, shields-up state. The required Weapons-only threat suffix is also skipped. Assert the intermediate states:

   ```ts
   s.enemy.scanned = 1;
   expect(readWeapons().targets[1])
     .toMatchObject({ frequency: 2, shieldsUp: true });
   disableSystem(s, EnemySystem.Weapons);
   expect(buildHudModel(s, slots(2), 'running', '').threats[0]!.text)
     .toBe('Enemy ship: hull 64% weapons DOWN');
   ```