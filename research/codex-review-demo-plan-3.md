# Codex review: Demo-i plan Tasks 3-5 (2026-11-11)

1. **P1 — Task 4, Step 1; spec §11.4.** The plan calls for notice tests “incl. A11.4 rule 1b” and its priority, but §11.4 in the spec ends mid-sentence in the threat-row rule; it supplies no rule 1b or surrender-notice behavior. An implementer cannot determine its exact trigger, text, or priority from these documents. **Fix:** complete §11.4 rule 1b with those details, then point Task 4 at it.

2. **P2 — Task 4, Step 1; spec §4 pixel budget.** “A scratch script over the font’s advance table” does not identify the table’s location or how to measure widths. The spec also leaves the implementation method open. **Fix:** name the advance table and give a concrete runnable measurement method, such as a small Node/TypeScript script.

3. **P2 — Task 3, Step 1; `tests/acceptance.test.ts`.** The new Vitest assertion runs three five-minute simulations. The task gives no timeout or guidance on keeping this live soak from making the suite slow or flaky; the existing 20-minute acceptance test already has an explicit timeout. **Fix:** specify an appropriate test timeout and confirm the three-run test’s expected runtime, or keep the full soak as a separate acceptance gate if it is too costly for Vitest.

4. **P2 — Task 5.** “Every automated entry checked now” does not explicitly name the spec’s final `typecheck`, `npm test`, and `build` gate or the acceptance gate’s exact four-player `running`, no-first-death criteria. **Fix:** enumerate the §9 entries and preserve their exact assertions in the recorded gate section.

The task order is coherent: Task 4 follows Task 1, which defines `fleeSecondsLeft`, and Task 3 follows Task 2’s balance tuning. The spec gives a basis for `nodesReached >= 3` in the two- and four-player acceptance rows: it expects node 4 or 5 by five minutes and sets 3 as the floor.