# Round 2 response (spec revised to rev after 833b0627)

Reviewed `round-2.json` against the subject at `833b0627`. 1 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F9 resolved.

## R2-F1 [P2]: Moving the digit keys off freqTo drops the gun fit's NO LASER cue and misses key-path tests

Confirmed: runtime.ts L453 refuses NO LASER on `k.freqTo`, and scienceInput.test.ts L38-L44 asserts that keydowns set `freqTo`. §9 now says the gun fit's Flight seat refuses on `freqKeyTo ?? freqTo`, and that `valkyrnRuntime.test.ts` holds `freqKeyTo`. The `freqKeyTo` bullet says it tunes only on a laser class and only raises NO LASER on the gun fit. §14.1's grep adds `freqTo|FREQ_CODES`, and a new "key path" rule ports scienceInput.test.ts: key asserts move to `freqKeyTo`, console asserts stay on `freqTo`, and there are new `gunFreqKeyTo` / `selectTo` asserts with the repeat and clear cases.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md

<!-- end -->
