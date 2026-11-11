# Codex review: Boarders-i implementation (2026-11-11)

No production defect found in the requested edge cases or flatten/unflatten symmetry. Vitest startup was blocked by sandbox `EPERM`; direct in-memory probes passed.

1. **Important — [tests/boarders.test.ts:135](/C:/Users/djuar/FTLite/tests/boarders.test.ts:135):** The Medbay ordering assertion passes with healing before damage: at 50 health, both orders produce 49.925. Start at full health so the healing cap distinguishes ordering. Remove `Health.cur[...] = 50` and assert:
   ```ts
   expect(Health.cur[s.crew[0]!]).toBeCloseTo(
     HEALTH_MAX - BOARDER_DPS * DT + MEDBAY_HEAL * stationOutput(s, mb) * DT, 9);
   ```

2. **Minor — [tests/boarders.test.ts:98](/C:/Users/djuar/FTLite/tests/boarders.test.ts:98):** The level-10 fixture checks only one blow; section 9’s 282nd-blow kill is untested. After the existing first tick, add:
   ```ts
   run(ten, 280, () => intents(hold));
   expect(ten.boarders.active[k3]).toBe(1);
   run(ten, 1, () => intents(hold));
   expect(ten.boarders.active[k3]).toBe(0);
   expect(Health.cur[ten.crew[0]!]).toBeCloseTo(
     HEALTH_MAX - 281 * BOARDER_DPS * DT * (1 - 10 * COMBAT_DEFENCE), 9);
   ```

3. **Minor — [tests/boarders.test.ts:212](/C:/Users/djuar/FTLite/tests/boarders.test.ts:212):** “Falls through to the fire in B” accepts any movement, including movement toward sealed A. Assert the actual first step toward B:
   ```ts
   expect(si.moveX).toBeGreaterThan(0);
   expect(si.moveY).toBeCloseTo(0, 9);
   ```

4. **Minor — [tests/gate-boarding.test.ts:16](/C:/Users/djuar/FTLite/tests/gate-boarding.test.ts:16):** The minimum-health diagnostic excludes Downed crew, dropping the lethal tick and potentially reporting a positive minimum despite a temporary downing. Sample every crew member:
   ```ts
   for (const eid of s.crew)
     minHealth = Math.min(minHealth, Health.cur[eid]!);
   ```