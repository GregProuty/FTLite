# Codex review: Combat-i implementation (2026-11-11)

1. **Minor — tests/enemy.test.ts:200:** The “frequency ignored” assertion passes under the incorrect debris beam formula too: combat seed 7 hits even at the mismatched-frequency threshold. Use a discriminating roll for every beam selector:
   ```ts
   for (const selector of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {
     const { s } = armed();
     s.weapons.selector = selector;
     s.rng.combat.s = 6; // 0.526: enemy hits; mismatched debris misses
     expect(fireWeapon(s)).toBe(true);
     expect(s.enemy.hull).toBe(85);
   }
   ```

2. **Minor — tests/enemy.test.ts:242:** `breaches + fire === 1` accepts the wrong hazard branch despite pinning a breach-first roll. Section 9 requires the selected effect. Replace with `expect([breaches, fire]).toEqual([1, 0]);`; add a fresh fixture using hazards seed 1 and assert `[0, 1]`.

3. **Minor — tests/hud.test.ts:188:** Panel fixtures contain debris and the enemy, but no shot. Handcrafted `targetRowText` inputs cannot catch the model incorrectly mapping shots to debris or losing their scanned frequency. Add a scanned shot before building the model:
   ```ts
   const k = placeShot(s, A, 420, 1, undefined, 2);
   s.debris.scanned[k] = 1;
   // After building wp and sp:
   for (const panel of [wp, sp])
     expect(panel.targets.find(t => t.stableId === s.debris.stableId[k]))
       .toMatchObject({ kind: 'shot', frequency: 2, eta: 7, hull: null });
   ```

No implementation or flatten/unflatten defect found in scope; direct edge-case checks passed. Vitest startup was blocked by sandbox `spawn EPERM`. No files modified.