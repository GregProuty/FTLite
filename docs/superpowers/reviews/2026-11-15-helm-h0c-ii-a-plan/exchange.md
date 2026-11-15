# Codex review exchange: helm-h0c-ii-a-plan

Subject: `docs/superpowers/plans/2026-11-15-helm-h0c-ii-a-headless-gates.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 69b6f61, effort high, 381 s, 3663606 in / 3547392 cached / 17037 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 The sector re-bless check can hide a gameplay change between checkpoints
The diff accepts arbitrary replay-frame hash changes, while the independent gameplay checks sample only every 60 ticks. · plan L2182-L2188 permits every `.hash` difference; tests/golden.test.ts:L27-L37 checks pinned gameplay projections at 60-tick checkpoints; scripts/determinism/fixture.ts:L87-L89 also samples every 60 ticks. · A sector state change that affects an intervening tick and reverses before the next checkpoint can change frame hashes while leaving the permitted diff, pinned projections, and fixture samples passing. The stated version-only proof therefore does not rule out a gameplay change. · Capture and compare version-independent canonical state after every replay tick before and after the bump. Reject any non-version difference before writing the re-blessed golden.

### [P1] R1-F2 The sector diff command is not executable in the supplied shell
Task 4 gives a Bash command without a shell invocation, but the checkout’s shell is Windows PowerShell 5.1. · plan L2180-L2186 uses `${TMPDIR:-/tmp}` and `&&`; the supplied shell reports PowerShell 5.1. · Those Bash constructs fail when the step is run verbatim in PowerShell, so the required version-only check cannot complete. · State an explicit Git Bash invocation for this step, or provide a PowerShell 5.1 command that writes the baseline JSON as UTF-8.

## Verified
- All 17 TypeScript blocks presented as created or whole-file replacements compiled together in a read-only, in-memory overlay under the web project’s strict TypeScript options: zero diagnostics.
- The consumed sim exports and signatures match the plan, including `predictPath`, `queryGrid`, `pursuitTurn`, `laserEligible`, `canLaunch`, and `stepDuelTick` (plan L979-L980; src/renderer/src/sim/tactical/predict.ts:L22; grid.ts:L24; hunter.ts:L20; weapons.ts:L36-L52; src/renderer/src/sim/duel/step.ts:L71).
- The scripted release uses `laserEligible`, which includes range, arc, and line of sight; the telemetry arc deliberately omits line of sight as stated (plan L100-L104, L927-L929, L1311-L1312; src/renderer/src/sim/tactical/weapons.ts:L48-L52).
- The gate tests cover seeds 1–10 with individual 60-second timeouts, both weapons per seed, the planet-contact threshold, the cap, median duration, and both outcomes (plan L1399-L1407, L1475-L1495; spec L104-L112).
- The hull edit is the sole change in the pasted tactical tuning file. The two pinned readout rows are updated, and the H-1b readout derives its displayed maximum from `SHIP_HULL` (plan L1573-L1576, L1644-L1675; tests/duelReadout.test.ts:L25-L26; src/renderer/src/render/duel/readoutModel.ts:L48-L56).
- The fixture re-bless compares all stored canonical sample fields except `$simVersion` and all stored boundaries before writing; its sampling limit is reflected in the first finding (plan L2154-L2165; scripts/determinism/protocol.ts:L3-L12).

## Not verified
- Jest/Vitest, bless, and the screenshot check were not run because this review is read-only and the user prohibited running the suite; the stated golden hashes and gate outcomes remain unverified by execution.
- The review run directory and ledger were unavailable in this checkout, so there were no prior finding IDs to reconcile.
- To validate consumed interfaces and strict compilation, I inspected supporting files beyond the reading manifest: tsconfig.web.json, sim/ship/derived.ts, sim/commands.ts, and render/duel/readoutModel.ts. No broader repository survey was performed.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at the brief commit. 2 accepted (1 P0, 1 P1), 0 rejected, 0 deferred.

## R1-F1 [P0]: The sector re-bless check can hide a gameplay change between checkpoints

Confirmed: the diff step accepted any `.hash` change, and the independent checks only sample every 60 ticks (`tests/golden.test.ts:L27-L37`, `scripts/determinism/fixture.ts:L87-L89`). Task 4 now adds `scripts/golden/canonical-trace.ts`. At every tick of the bless replay and all 19 determinism-v2 schedules, it hashes `flatten(state)` with index 0 (the version) zeroed. It has three modes:
- `baseline`, run before the bump;
- `check`, run after the bump, which exits 1 with "NOT version-only, bless nothing" unless every per-tick hash matches;
- `golden`, run after `npm run bless`.

The comparison covers 115,200 ticks (7,200 golden, 108,000 determinism-v2), all identical. The existing projection checks stay. The guard was shown to work: nudging `CREW_SPEED` from 4 to 4.001 made it fail at tick 1.

## R1-F2 [P1]: The sector diff command is not executable in the supplied shell

Confirmed. Every Run line is now a plain `npx` or `npm` call that works in PowerShell 5.1 and Git Bash. Temp paths come from `os.tmpdir()` in the script, and a Global Constraints line says so.

## Also changed

- Decision 12, the file table, the conflict note and the After section.
- Re-verified by extracting the plan task by task into a fresh worktree at master: each task's tests pass in order (130, 105, 56, 167), Task 4's steps run as written, and all 21 final files are byte-identical to the prototype. Full suite: 1,969 passed.

## Files changed

- docs/superpowers/plans/2026-11-15-helm-h0c-ii-a-headless-gates.md

<!-- end -->

---

# Round 2 (delta, reviewing 0496acc, effort medium, 66 s, 262008 in / 218368 cached / 2820 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — The plan now records version-independent canonical hashes at every tick before the bump and compares all 115,200 ticks before blessing (plan L1880-L1903, L1924-L1935, L2289-L2292).
- R1-F2: resolved — The replacement check uses a plain `npx tsx` command, with temporary paths chosen inside the script (plan L1875-L1876, L2303-L2304).

## Verified
- The trace uses the existing `runSemanticReplay` observer with `every = 1`; that observer runs after each replay tick (plan L1888; tests/helpers/semanticReplay.ts:L53-L58; src/renderer/src/authority/replay.ts:L85-L87).
- The determinism trace uses the existing `actions` and `coreFor` interfaces and records each tick action (plan L1889-L1901; scripts/determinism/fixture.ts:L42-L49, L52-L74).
- The sector flatten stores `SIM_VERSION` at index 0, which the trace zeroes before hashing (src/renderer/src/sim/flatten.ts:L45-L50; plan L1879-L1884).

## Not verified
- I did not execute the plan or run tests; the requested review was read-only.
- The named run-directory ledger was inaccessible in this sandbox.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1 and R1-F2 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

