
## R-1a final-review fixes
- Fix 1: authority-trace.ts gains scenario `ended` (zeroed-hull checkpoint restored on a fresh authority, ticked to ended; results, events, publications, bare end record hash, safe-point capture, replay round trip). Ended events normalised to the bare record (also in replayRoundTrip and the golden scenario); branch-only check in `same` that every ended event is tagged 'sector'. Baseline re-recorded at 8755199 (all five scenarios). Bite proof: score+1 in the sector terminal -> `same` failed at ended[7].event.payload.record.score: 0 -> 1; reverted.
- Fix 2: sectorRules.validateInit uses `(value as RunInit | null)?.layoutId`; test: JSON null init gives 'unknown sector layout'.
- Fix 3: core throws `<mode> rules reported ended without an end record` (before mutating phase); Terminal type unchanged; stub-rules test.
- Fix 4: jsonModeCodecs label defaults to rules.modeId; test.
- Fix 5: encounterMode.test regexes, plus the real sector mode literal 'invalid sector ownership'.
