# Codex review: Run-iii plan 1b, tests (2026-11-11)

1. **Major — `tests/progression.test.ts`, quirk draw test:** The map stream pin is still `0`, with a placeholder comment. That value is not established by the listed tests or Task 1 code listings; replace it with the pre-feature `makeState(2, 1).rng.map.s` value recorded in Step 0.

2. **Major — `tests/progression.test.ts`, Old Drive test:** The “ready tick is 4500” assertion seats the navigator, runs one tick, then returns `s.tick`. Verify that the ready tick is counted from the seating tick: under the listed loop, the charge begins on that first run tick, so the expected ready tick is 4500 for Old Drive and 3600 for control.

3. **Major — `tests/progression.test.ts`, door test:** Edge 0 is the A–I door at tile `[2,4]`; moving both players to y=9.5 clears its zone, and the second player does not keep it open. The stated close counts of 60 and 120 ticks match the one and two second timers at 60 Hz.

4. **Major — `tests/progression.test.ts`, debris test:** `placeDebris(..., 1)` sets impact for `state.tick + 1`; one run tick reaches that due tick and resolves the impact. With Navigation unmanned, there is no evasion. The asserted Lucky Hull damage of 6 and control damage of 8 are consistent.

5. **Major — `tests/progression.test.ts`, start bonus test:** The listed Okoro and Lindqvist Repair levels (4 and 1 after veteran crew) match the requested 3→4 and 0→1 progression. The bogus unlock should leave the start bonus at zero and preserve the state hash.

6. **Major — `tests/progression.test.ts`, oxygen test:** Starter edge 0 connects A to I, and with the door Closed, `passageFor` uses the closed-door passage. Zero injection does not itself prevent flow. The factor-of-two assertion is consistent with doubling that passage, provided source demand does not trigger proportional scaling; the listed A-to-I fixture’s flow is small enough for the configured oxygen mass.

7. **Major — `tests/progression.test.ts`, heat test:** `overdrive` returns the Weapons station index and sets its level above base. Coolant defaults to zero, so the expected heat increase is `HEAT_RISE + 1` for Hot Reactor and `HEAT_RISE` for control.

8. **Major — `tests/progression.test.ts`, science lead test:** The listed values are consistent: unmanned lead is 4 seconds, and the seated level-one Science output gives 18 seconds, extended to 22 by Twitchy Sensors.

9. **Major — score examples in `tests/progression.test.ts`:** The values are correct: `1345` = 700 nodes + 500 victory + 145 earned scrap; `355` = 300 nodes + 45 scrap + 10 boarder kills; the state example is `235` = 200 nodes + 30 scrap + 5 boarder kill.

10. **Major — `tests/telemetry.test.ts`, exact-record fixture:** The proposed `score: 390` is correct: 300 nodes + 60 earned scrap + 20 enemy kill + 10 boarder kills. Add the proposed `run.quirk` and `run.unlocks` fixture fields as specified.

11. **Major — `tests/acceptance.test.ts`, table fixtures and regexes:** The header tail should be `scrap\s+score$`; row tails should include the appended score (`0\/0\s+0$`). The victory row’s score is `1345` for 3 nodes, 145 earned scrap, and victory, so `/145\/30\s+1345$/` is correct. Add `score: 0`, `quirk: 'Leaky Seals'`, and `unlocks: []` to the base fixture.

12. **Major — `tests/progression.test.ts`, direct victory sequence:** A direct victory from empty progress reaches all three unlock conditions at once: one run, seven best nodes, and one victory. The expected `['scrap-reserve', 'torpedo-rack', 'veteran-crew']` order matches the plan’s `UNLOCKS` order.