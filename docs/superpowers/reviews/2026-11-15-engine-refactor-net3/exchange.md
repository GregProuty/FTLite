# Codex review exchange: engine-refactor-net3

Subject: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 3464e44, effort high, 261 s, 1086915 in / 972544 cached / 12275 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 The mode factory omits a required checkpoint method
The stated complete ModeHost lifecycle leaves out synchronous checkpoint(). · spec L173-L178; src/network/modes/contracts.ts:L8-L16; src/network/hostRuntime.ts:L65-L71 · A factory implementing the listed methods cannot satisfy ModeHost, and hostRuntime calls checkpoint() for a host command. · Add checkpoint(): Uint8Array to the factory contract and specify its bounded-byte behavior separately from async captureCheckpoint().

### [P0] R1-F2 EncounterRules cannot supply the duel tick to the generic core
The rules interface has no tick accessor, but the core repeatedly reads state.tick and DuelState has no top-level tick. · spec L143-L160; src/renderer/src/authority/core.ts:L133-L138,L261-L268,L426-L429; src/renderer/src/sim/duel/state.ts:L22-L35; src/renderer/src/sim/duel/step.ts:L74,L126-L127 · The R-1 generic core cannot compile or publish a duel from the specified interface. · Define a tick(state) hook or an explicit common state constraint, and state how the duel interior and tactical ticks stay equal through step and restore.

### [P1] R1-F3 Duel completion has no specified wire record
terminal() returns an optional unknown endRecord, while the existing ended event requires a strict sector TelemetryRecord. · spec L149-L160,L179-L181; src/renderer/src/authority/core.ts:L435-L437; src/renderer/src/net/contracts.ts:L81-L87; src/renderer/src/net/codec.ts:L80-L100 · Implementers must invent a duel completion payload or omit a required authority event; an arbitrary record fails the merged codec. · Define the common or mode-tagged ended-event type and codec, including the duel record and behavior when no end record exists.

### [P1] R1-F4 The duel snapshot format leaves restore rules undecided
The R-1 codec requirement names four areas but does not say which tactical and interior fields are stored, regenerated, or excluded, or how the encoded checkpoint stays within 256 KiB. · spec L153-L155,L179,L317-L318; src/renderer/src/sim/duel/state.ts:L22-L58; src/renderer/src/sim/tactical/state.ts:L58-L65,L89-L109; src/renderer/src/sim/tactical/hash.ts:L15-L28; src/shared/netSession.ts:L3 · Two implementations could restore the same immediate hash yet differ on later ticks, especially for seed-derived map/grid data and tactical random state. · Specify the snapshot header and field manifest, derived-field reconstruction and validation, post-restore continuation proof, and an encoded-size boundary test.

### [P1] R1-F5 The generic replay contract is unspecified
R-1 promises the Authority replay surface and preservation of V2/V3/V4 semantics, but the merged replay parser and runner require sector layout, checkpoint, snapshot, and message validation. · spec L165-L167,L318; src/renderer/src/authority/replay.ts:L29-L33,L44-L64,L77-L81; src/renderer/src/sim/replay.ts:L25-L30 · A plan writer must decide whether duel replay is portable in R-1 and how its mode-specific data is validated before constructing state. · Define mode-aware replay parsing and restoration for the duel, and add an observable V2/V3/V4 replay check to R-1 acceptance.

### [P1] R1-F6 The R-1 history ring has no bound or proof
R-1 delivers a bounded ring, but the spec calls it only a small ring and gives no segment, byte, or export limit or acceptance check. · spec L290-L292,L318; src/renderer/src/authority/core.ts:L237-L245,L413,L441,L460; src/network/utilityHost.ts:L45-L65 · Implementers must choose retention and failure behavior, and the stated R-1 proof cannot show that history remains bounded. · Set retention and byte limits, eviction and oversized-segment behavior, export scope, and a test that exceeds each bound.

### [P1] R1-F7 The unchanged-deps claim omits resolveLayout
The spec says the generic authority keeps the merged deps unchanged but its list omits required resolveLayout. · spec L165-L166; src/renderer/src/authority/authority.ts:L24-L33,L56-L61,L74-L79 · R-1 implementers must guess whether layout resolution remains a dependency or moves into the rules and checkpoint codec. · Include resolveLayout in the retained sector deps, or explicitly assign layout resolution to EncounterRules and describe the sector adapter.

### [P2] R1-F8 Risk 3 understates deferred projection changes
Risk 3 says only image selection per connection is new, while §10 requires new metadata, client acceptance, event filtering, and a re-host checkpoint policy. · spec L261-L276,L341; src/network/modes/sectorStream.ts:L26-L49; src/renderer/src/authority/core.ts:L284-L287 · The risk statement contradicts the deferred R-6 design and would understate its later scope. · Revise risk 3 to name those additional R-6 changes while keeping PvP deferred.

## Verified
- R-0's version rationale matches the parked branch: master and hash-completeness both declare SIM_VERSION 36, while the branch changes the duel flatten and adds a field-completeness guard. spec L204,L317; src/renderer/src/sim/duel/hash.ts:L11-L16; hash-completeness:src/renderer/src/sim/duel/hash.ts:L11-L20; hash-completeness:tests/simStateCompleteness.test.ts:L41-L47.
- The retained result statuses and wire-only admission behavior match the merged ledger and outbox. spec L192-L199; src/renderer/src/authority/ledger.ts:L30-L32,L59-L63,L117-L121; src/renderer/src/clientControl/commandOutbox.ts:L46-L56.
- R-1 can be exercised at the stated hostRuntime level after registering a duel mode; online sector wiring remains separate. spec L180-L184; src/network/hostRuntime.ts:L8-L11,L18-L24,L43-L60,L77-L100; src/utility/authorityHost.ts:L11; src/main/network/onlineSector.ts:L27-L39.
- The PvP deferral matches the owner amendment and the R-6 milestone. spec L251-L252,L324,L331; docs/vision/thesis-grill.md:L294-L301.
- The corrected per-connection sender and sector image metadata descriptions match the merged implementation. spec L261-L267; src/network/modes/sectorStream.ts:L33-L47,L75-L82,L115-L123.

## Not verified
- The review run's ledger and round outputs were inaccessible in the workspace and were not present at cdbb842; round 1 therefore has no prior IDs.
- No tests, bless command, or merge simulation were run under the read-only review constraints; runtime behavior and the claimed clean merge were not verified.
- The requested src/utility/utilityHost.ts does not exist at a5b772f; the relevant implementation was read at src/network/utilityHost.ts. To substantiate findings, I also read the narrowly related tactical/hash.ts, sim/replay.ts, and parked-branch completeness and duel-golden tests; broader files outside the manifest were not reviewed.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `cdbb842` and the merged code. 8 accepted (2 P0, 5 P1, 1 P2), 0 rejected, 0 deferred. Each claim was checked at the cited lines and held.

## R1-F1 [P0]: The mode factory omits a required checkpoint method

Confirmed (`contracts.ts:L8-L16`; `hostRuntime.ts:L65-L71` calls it). The factory lifecycle now lists the synchronous `checkpoint(): Uint8Array`. It encodes the current checkpoint immediately and throws if the result would exceed `MAX_HOST_BYTES`. The async `captureCheckpoint` stays as the safe-point capture used for uploads.

## R1-F2 [P0]: EncounterRules cannot supply the duel tick to the generic core

Confirmed: the core reads `state.tick` (`core.ts:133-138, 261-268, 426-429`), and `DuelState` has no top-level tick. `EncounterRules` gains `tick(state)`. For the duel it returns `interior.tick`. `stepDuelTick` advances the interior and tactical ticks together, and restore rejects a snapshot where they differ.

## R1-F3 [P1]: Duel completion has no specified wire record

Confirmed (`contracts.ts:81-87`, `codec.ts:80-100`). The `ended` event becomes mode-tagged: `{ mode, record: EndRecord | null }`, where `EndRecord` is a codec-validated discriminated union. The sector `TelemetryRecord` is unchanged. The duel record is the duel telemetry summary. A mode with nothing to report sends `record: null`, which the codec accepts.

## R1-F4 [P1]: The duel snapshot format leaves restore rules undecided

Confirmed. The duel snapshot is now specified:
- **Header:** format, sim version, digest, layout and seed.
- **Stored:** the interior through the sector snapshot path; the tactical state in `flattenTactical` order, including the hunter and the tactical random-number state; presence and repair.
- **Regenerated:** the map from the seed (it must validate, and its hash must match), the grid, the repair points and `Derived`.
- **Excluded:** the per-tick events.
- **Validation on restore:** versions, value count, equal ticks, and the duel hash.
- **Continuation proof:** N ticks, checkpoint, restore, M ticks, with identical per-tick hashes to an uninterrupted N + M run.
- **Size test:** at the duel's largest state, under 256 KiB.

## R1-F5 [P1]: The generic replay contract is unspecified

Confirmed (`authority/replay.ts:29-33, 44-64, 77-81`; `sim/replay.ts:25-30`). Replays now record a `mode`; absent means `sector`, so existing V2/V3/V4 files parse unchanged. The parser and runner use the mode's rules and validators. R-1's acceptance adds the existing sector replay tests passing unchanged, and a duel replay re-running to the same final hash.

## R1-F6 [P1]: The R-1 history ring has no bound or proof

Confirmed. The ring moves out of R-1 into R-8, with the flight recorder; R-1 only keeps segment rotation intact. Its bounds:
- the newest 6 segments and at most 4 MiB, oldest evicted first;
- a single segment over 1 MiB is skipped and counted;
- host-side file export only, never over the IPC crash channel;
- a test exceeding each bound.

## R1-F7 [P1]: The unchanged-deps claim omits resolveLayout

Confirmed (`authority/authority.ts:24-33, 56-61, 74-79`). `resolveLayout` is now in the retained deps, and it is passed to the rules' `create`, `restore` and `validateCheckpoint`. The duel resolves the Cutter through it.

## R1-F8 [P2]: Risk 3 understates deferred projection changes

Confirmed. Risk 3 now names everything R-6 needs: new metadata, a client acceptance path, `emit` filtering and a re-host checkpoint policy. All of it stays unbuilt while PvP is out of scope.

## Also changed

- R-1 and R-8 milestone rows; change log entry.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->

---

# Round 2 (delta, reviewing b510ecd, effort medium, 110 s, 335541 in / 262784 cached / 4572 out)

Verdict: changes requested

## Prior findings
- R1-F1: resolved — The factory now includes synchronous checkpoint() and retains async captureCheckpoint (spec L181-L185), matching ModeHost and hostRuntime (contracts.ts:L8-L16; hostRuntime.ts:L65-L71).
- R1-F2: resolved — The tick hook and equal-tick restore rule are specified (spec L148,L161-L162), matching the duel's interior and tactical tick updates (duel/step.ts:L126-L127).
- R1-F3: still open — The wire record remains underspecified. The spec calls EndRecord a discriminated union while keeping the sector TelemetryRecord unchanged (spec L163); that record has no mode discriminator (net/codec.ts:L80-L100). The named duel telemetry is a mutable accumulator containing prev and manoeuvre state, with no defined wire summary or checkpoint lifecycle (duel/telemetry.ts:L36-L55,L68-L75). Specify the tagged wire variants and how duel telemetry survives restore.
- R1-F4: still open — Restore must compare a stored map hash, but neither the header nor stored-value list contains one (spec L189-L195). The existing tactical flatten stores only the map's asteroid count (tactical/hash.ts:L15-L16). Add the map-hash field and its calculation and validation rule.
- R1-F5: resolved — Mode selection, legacy sector default, mode-specific replay validation and a duel replay check are now specified (spec L173-L175,L345).
- R1-F6: resolved — The ring moved to R-8; its limits, eviction, export scope and tests are specified there (spec L313-L319,L345,L353).
- R1-F7: still open — resolveLayout is listed as a retained dependency, but the spec says to pass it to rules.create, restore and validateCheckpoint (spec L164,L172) while their declared signatures accept no resolver (spec L143-L156). Add the resolver to those signatures or specify how the rules receive it without an argument.
- R1-F8: resolved — Risk 3 now names metadata, client acceptance, event filtering and re-host policy, and keeps R-6 deferred (spec L368).

## Verified
- Reviewed the revision at b510ecd against the cited merged code at a5b772f.
- The PvP deferral in the touched text matches the owner's amendment (spec L274,L351,L358; thesis-grill.md Q28 amendment).

## Not verified
- No tests were run, as requested; replay compatibility, checkpoint continuation and encoded-size claims remain unexecuted.

---

# Round 2 response (spec revised)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1, R1-F2, R1-F5, R1-F6 and R1-F8 resolved, and re-raised three with precise gaps, all confirmed. Fixed again; 0 rejected, 0 deferred.

## R1-F3 [P1]: Duel completion has no specified wire record (still open, fixed again)

Confirmed: the sector `TelemetryRecord` has no discriminator (`codec.ts:L80-L100`), and the duel accumulator is mutable state (`duel/telemetry.ts:L36-L55, L68-L75`). Three changes:
- The tag now lives on a wrapper: `EndRecord = { mode: 'sector', record: TelemetryRecord } | { mode: 'duel', record: DuelEndSummary | null }`. The codec validates it as a discriminated union on `mode`.
- `DuelEndSummary` is a frozen value of integers and enums, computed once when the duel ends.
- The live accumulator is mode memory: it is not hashed, it is saved in the duel checkpoint as its own versioned blob, and it is restored with it. The continuation proof also compares end summaries.

## R1-F4 [P1]: The duel snapshot format leaves restore rules undecided (still open, fixed again)

Confirmed: the tactical flatten stores only the asteroid count (`tactical/hash.ts:L15-L16`). The header now has `mapHash`: `hashF64` over the planet, each asteroid's x, y and r in index order, the belt count, the cluster sizes, the gaps and the spawns, computed at creation. Restore regenerates the map from the seed, requires `validateMap` to pass, and requires the recomputed hash to equal the header's.

## R1-F7 [P1]: The unchanged-deps claim omits resolveLayout (still open, fixed again)

Confirmed. `resolveLayout` is now an explicit argument in the signatures of `create`, `restore` and `validateCheckpoint`.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->

---

