# Codex review: 4-ii plan half 2 (2026-11-11)

1. **Medium — Task 3, Step 3, `appendTelemetry` (lines 816–825):** The inner catch treats a throwing `getItem` as malformed JSON and proceeds to write. This violates §7 and fails the planned `writes === 0` assertion. **Fix:** Read storage outside the JSON-parsing catch, letting the outer catch abort on access failure.

2. **Medium — Task 3, HUD fixture/implementation (lines 788, 852–856):** The fixture expects `Never manned: Doors, Medbay`; iterating actual `StationKind` order produces `Never manned: Medbay, Doors`. **Fix:** Sort the HUD names before joining to match the specified example and fixture; retain StationKind order in `telemetryRecord`.

3. **Medium — Task 2, Step 5, `runAcceptanceCli` (lines 637–640):** Seeds are not deduplicated. `['1', '5', '5']` makes six calls, violating §8’s prohibition on duplicate combinations. Existing tests miss this. **Fix:** Deduplicate parsed seeds while preserving order; assert exactly three calls for that input.

4. **Medium — Task 3, Step 3, `main.ts` wiring (line 838):** Evaluating `localStorage` can itself throw before `appendTelemetry` begins. Because the callback runs inside the session’s sim-fault catch, this turns a normal game over into an error and crash report. **Fix:** Catch storage acquisition inside the wired callback and verify denied access still permits game over.

5. **Low — Task 2, record tests (lines 416–450):** No test exercises populated `telemetryRecord.firstDeath`; the HUD death fixture bypasses that function. **Fix:** Set a distinct death pid/tick and assert the resulting name and rounded seconds, including an ending-tick value.

6. **Low — Task 3, four-player HUD test (lines 798–799):** Checking only length eight does not establish the required line order or four distinct crew skill rows. **Fix:** Assert the complete eight-line array.

7. **Low — Task 2, fixture guidance (line 455):** The prose incorrectly calls Lindqvist’s head start “Weapons 3.” It is **Engineering 3**; `[0, 3, 0, 0, 0, 0]` is already correct because Engineering has index 1. **Fix:** Correct the prose without changing the expected row.