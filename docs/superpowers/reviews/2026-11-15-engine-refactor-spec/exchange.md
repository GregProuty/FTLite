# Codex review exchange: engine-refactor-spec

Subject: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 8c3917d, effort high, 253 s, 817457 in / 706944 cached / 13071 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 R-3 cannot pass the stated version-only guard
R-3 removes telemetry fields from the canonical array but requires the existing version-only re-bless to pass. · spec L142, L209; src/renderer/src/sim/canonicalFields.ts:L38-L41; scripts/golden/versionOnly.ts:L30-L34, L73-L85 · That guard masks only SIM_VERSION and compares the entire remaining array at every tick. Removing fields necessarily changes the trace. · Specify a separate R-3 migration proof that compares retained named gameplay fields and telemetry outputs, then bless the new schema. Reserve the version-only guard for changes that leave the canonical array unchanged.

### [P0] R1-F2 The R-4 equivalence check does not prove unchanged behavior
The named-field trace compares state values but omits command results and player-to-crew behavior while R-4 replaces crew storage and controllers. · spec L78-L80, L166-L169, L210, L226; src/renderer/src/sim/step.ts:L30-L39, L64-L67; src/renderer/src/sim/canonicalFields.ts:L63-L64 · Two runs can have equal mapped state after a tick yet accept or reject a command differently. The old trace indexes crew by player; the new table needs an explicit identity rule to compare the same character. · Freeze a pre-refactor oracle that checks every old field, command result, event and player-to-stable-ID binding per tick. Define explicit old-to-new field aliases and fail on unmapped or duplicate fields.

### [P1] R1-F3 R-2 mixes a behavior change with a golden-neutral claim
R-2 says interior power and repairs act on the tactical systems record while requiring unchanged duel gates and golden hashes. · spec L85-L87, L208; src/renderer/src/sim/duel/state.ts:L22-L28; src/renderer/src/sim/duel/step.ts:L48-L61; src/renderer/src/sim/tactical/state.ts:L15-L28; src/renderer/src/sim/tactical/hash.ts:L17-L24 · The current duel holds separate interior and tactical values, and repair directly changes tactical room damage. Connecting previously separate power and damage behavior can change the fight; moving fields can also change the raw hash order. · State whether R-2 only relocates storage while preserving the current duel rules and canonical order. If it activates the full interior link, make that an explicit gameplay milestone with new expected outcomes and a separate regression proof.

### [P1] R1-F4 Player-to-crew binding is gameplay state outside the hash
The Session alone maps players to crew slots, although transfers change which body a player's commands control. · spec L41, L58-L59, L77-L78, L164; src/renderer/src/sim/step.ts:L30-L39 · Identical Encounter hashes could represent different command ownership after a transfer. A snapshot or replay of the hashed encounter would not establish which crew member receives the next input. · Put authoritative player-to-stable-ID bindings in canonical Encounter state, or define them as a deterministic derivation of hashed crew controller rows. Keep Session bindings as a validated mirror.

### [P1] R1-F5 Projection privacy and hash validation need a publication format
The spec describes filtering numeric partitions but does not define how to sanitize image metadata or validate a projected image against a full-state hash. · spec L174-L178, L212; src/renderer/src/sim/snapshot.ts:L10-L14, L23-L28; codex/net-3:src/network/modes/sectorStream.ts:L26-L47; codex/net-3:src/network/state/imageCodec.ts:L3 · Net-3 metadata includes the snapshot header and its RNG states. Its receiver also recomputes the published hash over the received values; a partial projection cannot match the full Encounter hash. · Define a projection-specific header with no private RNG or full-state fields, a projection manifest and hash, and separate server-only full-state desync diagnostics. Test both metadata and values for leaks.

### [P1] R1-F6 Lock-on changes the projection shape without a baseline rule
A lock-on adds an interior partition, yet the spec says deltas keep working because image length is fixed by capacity. · spec L173-L178; codex/net-3:src/network/state/imageCodec.ts:L47-L50; codex/net-3:src/network/state/sender.ts:L19-L29 · Adding or removing a partition changes value count unless every projection reserves fixed slots. Net-3 sends a full image when lengths differ; the spec gives no rule for lock-on loss, transfer, or clearing previously received private values. · Define fixed projection slots and redaction values, or require a new projection epoch, cleared client baseline and reliable full image whenever visibility changes. Test lock-on acquire, loss and ship transfer.

### [P1] R1-F7 R-6 filters images but leaves other publication paths unspecified
The privacy rule covers StateImage partitions while authority events, notifications and retained history can carry information to connections independently of those images. · spec L175-L181, L212; codex/net-3:src/renderer/src/authority/core.ts:L173-L188; codex/net-3:src/network/modes/sectorStream.ts:L115-L123 · Net-3 broadcasts authority events to every binding and sends notifications through a separate stream. Projecting state images alone cannot establish the R-6 claim that rival clients never receive private state. · Specify one per-recipient visibility policy for images, metadata, events, notifications, checkpoints and history exports. Include side-channel inspection in the R-6 privacy test.

### [P1] R1-F8 Canonical order for N ships and transfers is undefined
Module `fields(s)` is called canonical, but the spec does not fix ship-slot order, inactive slot encoding, missile-pool allocation, stable-ID allocation or per-ship RNG derivation. · spec L64-L66, L72-L80, L93, L104-L114, L173; src/renderer/src/sim/tactical/hash.ts:L15-L28; src/renderer/src/sim/state.ts:L65-L69, L150-L159 · Different implementations can produce different hashes or replay results for the same encounter, especially after boarding or when a ship slot is empty. · Define a versioned canonical manifest ordered by fixed ship slot, then fixed field and crew slot; specify empty-slot values, missile owner and slot order, a shared stable-ID allocator, and per-ship stream seeds and draw order.

### [P1] R1-F9 No milestone delivers the module-derived state contract
The spec requires modules to drive flatten, hash, snapshot, clone and completeness, but R-0 through R-8 never assign that migration or its acceptance check. · spec L101-L114, L200-L214; hash-completeness:tests/simStateCompleteness.test.ts:L17-L37; src/renderer/src/sim/duel/hash.ts:L11-L19 · R-0 only merges a guard for the current SimState, while the duel still has a hand-picked hash. Plan writers must choose when and how to replace both paths. · Assign the module contract and each consumer migration to named milestones, with a test showing an added field changes the relevant snapshot and hash or is explicitly excluded.

### [P1] R1-F10 The generic rules interface omits the ModeHost adapter boundary
EncounterRules defines state operations, but R-1 does not specify who encodes start and checkpoint bytes, restores a mode, attaches producers, or handles pause and streamed publications. · spec L116-L131, L207; codex/net-3:src/network/modes/contracts.ts:L6-L23; codex/net-3:src/network/modes/sector.ts:L27-L69 · Net-3 requires these ModeHost operations, and its sector mode currently implements them around the authority. A second registered duel mode needs an explicit adapter and publication codec to be independently playable in R-1. · Define the generic authority lifecycle API and the mode-owned byte codecs, attachment policy, pause behavior and publication adapter; make start, restore, attach and checkpoint round trips part of R-1 acceptance.

## Verified
- The subject was read from commit 470b515; it states that implementation waits for Net-3 to merge (spec L3, L202).
- The owner requires both capital-ship and multi-ship PvP, one gravity-well combat model, transfers and playtest gates (docs/vision/thesis-grill.md:L292-L319); the spec carries those goals (spec L27-L30, L37-L40).
- Net-3 has a ModeDefinition/ModeHost wrapper suitable in principle for a registered duel mode (codex/net-3:src/network/modes/contracts.ts:L6-L23; codex/net-3:src/network/modes/sector.ts:L75-L77).
- Net-3's delta codec requires equal-length value arrays and its sender falls back to a full image otherwise (codex/net-3:src/network/state/imageCodec.ts:L47-L50; codex/net-3:src/network/state/sender.ts:L19-L29).
- The hash-completeness branch tests current SimState coverage and an added-field failure case; it does not cover the duel state (hash-completeness:tests/simStateCompleteness.test.ts:L17-L47).
- The current sector authority retains Net-3's receive-time admission policy and player command ledger (codex/net-3:src/renderer/src/authority/core.ts:L233-L247; codex/net-3:src/renderer/src/authority/ledger.ts:L37-L85).

## Not verified
- The stated review ledger was absent at docs/superpowers/reviews/2026-11-15-engine-refactor-spec/ledger.md, so no awaited prior IDs or responses could be inspected.
- No Jest suite or other runtime tests were run, per the read-only review constraints; gameplay and performance outcomes remain unverified.
- To verify findings, scoped reads extended beyond the manifest to scripts/golden/versionOnly.ts and Net-3 sectorStream.ts and sectorProducers.ts. No broader source exploration was performed.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at the brief commit. 10 accepted (2 P0, 8 P1), 0 rejected, 0 deferred. Each claim was checked against the cited code, on master and on `codex/net-3`, and held.

## R1-F1 [P0]: R-3 cannot pass the stated version-only guard

Confirmed: R-3 removes telemetry from the canonical array (`canonicalFields.ts:L38-L41`), and `versionOnly.ts` compares the whole array apart from the version. §7 now gives R-3 its own **migration proof**:
1. Before the change, record per tick the named values of every retained field, every command result, and every telemetry counter.
2. After it, check at every tick that the retained values are equal and that the new event-derived telemetry equals the old counters.
3. Only then bless the new schema, as a `SIM_VERSION` bump.

The version-only guard is now reserved for changes that leave the array identical apart from the version. The R-3 row is updated.

## R1-F2 [P0]: The R-4 equivalence check does not prove unchanged behavior

Confirmed. §9 now freezes a **pre-refactor oracle** before R-4. Per tick, over the golden replay and every determinism-v2 schedule, it records:
- every old canonical field by name;
- every command result;
- every authority event and cue;
- the player → stable-id binding.

The post-refactor run goes through an alias table, generated from the module field declarations plus an explicit rename list. It fails on unmapped fields (unless declared dropped, with a reason), on duplicate mappings, and on any differing value, result, event or binding. Risk 2 is updated to match.

## R1-F3 [P1]: R-2 mixes a behavior change with a golden-neutral claim

Confirmed. R-2 is now **storage only**: today's duel rules are kept, and serialisation emits the moved fields in today's order, so the duel's canonical array, hash and golden stay byte-identical. The full interior link is a separate gameplay milestone, **R-2b**, with new expected outcomes: gates re-run, the duel golden re-blessed, and the owner's playtest. It follows H-2.

## R1-F4 [P1]: Player-to-crew binding is gameplay state outside the hash

Confirmed. §4 now makes the authoritative binding the hashed crew rows' `controller` column. A player controls the single active row, across all ship slots, whose controller is that player, and an invariant check enforces it. The Session keeps a mirror for the lobby, UI and seat tokens; it is rebuilt from the hashed rows after every restore, validated, and never authoritative.

## R1-F5 [P1]: Projection privacy and hash validation need a publication format

Confirmed against `codex/net-3` `sectorStream.ts` and `imageCodec.ts:L3`. §10 now defines:
- a projection header carrying only the projection id, encounter tick, slot visibility flags and a **projection hash** the host computes over the projected values;
- no random-number state, full-state fields or full-state hash in the header;
- a projection manifest version on each image.

Clients check the projection hash. Full-state hashes and desync diagnostics stay on the host. The privacy test checks metadata as well as values.

## R1-F6 [P1]: Lock-on changes the projection shape without a baseline rule

Confirmed: the delta encoder requires equal-length baselines (`imageCodec.ts:L47-L50`). Every projection now has one fixed layout: header, `space`, then for each ship slot an exterior-summary block and an interior block. An interior block holds the redaction value 0 with a `visible = 0` flag unless it is the recipient's own ship or a locked target. Lock-on, loss and transfer therefore change values, never length, so deltas keep working. These cases, plus a destroyed rival, are tested.

## R1-F7 [P1]: R-6 filters images but leaves other publication paths unspecified

Confirmed (`codex/net-3` `authority/core.ts:L173-L188`, `sectorStream.ts:L115-L123`). §10 now has **one per-recipient visibility policy** covering images and metadata, authority events and cues, command results, notifications, checkpoints (host-only in PvP), and flight-recorder and history exports. The R-6 privacy test records everything a rival connection receives over a scripted PvP fight and checks every channel.

## R1-F8 [P1]: Canonical order for N ships and transfers is undefined

Confirmed. §3 now fixes the order:
- fixed ship slots in slot order whether used or not, with an inactive slot written as `active = 0` and all fields 0;
- within a slot, the module field order, then crew-slot order;
- a missile pool in pool-slot order with an `owner`, filled from the lowest free slot;
- one encounter-level monotonic stable-id counter, which transfers keep;
- per-ship stream seeds drawn from the encounter master in slot order and a fixed stream-name order, with draws in phase order and ships in ascending slot order.

The manifest is part of `SIM_VERSION`.

## R1-F9 [P1]: No milestone delivers the module-derived state contract

Confirmed. §6 now stages the migration:
- R-1: the contract, plus the duel's space, interior wrapper, presence and repair;
- R-2: the systems record;
- R-4: the sector interior systems;
- R-5: the director and debris.

Each milestone's acceptance includes the added-field test (changes snapshot and hash, or must be declared excluded). R-1's row lists it.

## R1-F10 [P1]: The generic rules interface omits the ModeHost adapter boundary

Confirmed against `codex/net-3` `modes/contracts.ts:L6-L23` and `modes/sector.ts:L27-L69`. §6 now specifies:
- `createEncounterAuthority(rules, deps)`, with start, restore, attach, checkpoint, pause, pump and dispose;
- what each mode owns: init and checkpoint byte codecs, attachment validation, producers, and the stream publication adapter;
- `defineEncounterMode`, which builds a Net-3 `ModeDefinition`. `modes/sector.ts` becomes one call to it.

R-1's acceptance adds start, checkpoint and restore round trips for sector and duel, over loopback and Net-3.

## Also changed

- Milestone table: R-1, R-2, R-3, R-4 and R-6 rows rewritten; R-2b added; the ordering note mentions R-2b. Change log entry for round 1.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->

---

# Round 2 (delta, reviewing ac05a6e, effort medium, 127 s, 427896 in / 351104 cached / 6222 out)

Verdict: changes requested

## Findings

### [P0] R2-F1 R-2 cannot keep the duel canonical array byte-identical
R-2 adds canonical ship-slot and missile-owner data while requiring the duel's canonical array, hash and golden to remain byte-identical. · spec L67-L71, L95, L263; src/renderer/src/sim/tactical/hash.ts:L15-L24; src/renderer/src/sim/tactical/state.ts:L33-L34 · Today's missile slots encode no owner or ship-active flag. The new pool needs an owner because its slot no longer identifies the firing ship. Serializing these fields changes the array. · Specify a compatibility serialization for the two-ship duel that preserves the old array, or make R-2 a schema migration with an appropriate equivalence proof and new golden.

### [P0] R2-F2 The R-3 and R-4 migration comparisons include a field that must change
Both proofs compare every retained or old canonical field while requiring a SIM_VERSION bump. · spec L171-L175, L198-L209; src/renderer/src/sim/canonicalFields.ts:L29; src/renderer/src/sim/duel/hash.ts:L11-L12 · SIM_VERSION is the first canonical field. The stated comparisons cannot pass across the required bump. · Explicitly exclude or normalize the version field in both migration comparisons, while checking that the new version has the intended value.

### [P1] R2-F3 The R-6 privacy assertion rejects its own exterior summary
The projection always publishes rival room damage levels, but the privacy test forbids every field of a rival interior unless that interior is visible. · spec L218-L220, L233 · Room damage is an interior field, so a correct unlocked projection would fail the stated test. · Define an explicit public exterior-field allowlist and assert that no other rival interior fields or RNG state reach any channel without visibility.

## Prior findings
- R1-F1: resolved — R-3 now has a separate migration proof and reserves the version-only guard for version-only changes (spec L171-L175). The new proof has the version-field defect reported above.
- R1-F2: resolved — The R-4 oracle now covers fields, command results, events, cues and player-to-stable-ID bindings, with alias coverage checks (spec L198-L207). Its version-field defect is reported above.
- R1-F3: resolved — R-2 is storage-only and the gameplay link is assigned to R-2b (spec L95-L96). The separate canonical-byte contradiction is reported above.
- R1-F4: resolved — Crew controllers are authoritative hashed Encounter state; the Session binding is a validated mirror (spec L85).
- R1-F5: resolved — The projection header, manifest version and projected-value hash are specified separately from host-only full-state diagnostics (spec L222-L223).
- R1-F6: resolved — Fixed projection slots and redaction values keep image length stable across visibility changes (spec L215-L225).
- R1-F7: resolved — The visibility policy now covers images, metadata, events, results, notifications, checkpoints and exports (spec L226-L233). The test assertion conflict is reported above.
- R1-F8: resolved — The revision defines fixed ship and crew-slot order, empty slots, missile allocation, stable IDs and RNG draw ordering (spec L67-L74).
- R1-F9: resolved — Module-contract migration is assigned to R-1, R-2, R-4 and R-5, with an added-field acceptance check at each step (spec L123-L130).
- R1-F10: resolved — R-1 now assigns codecs, attachment validation, producers and publication to a ModeDefinition adapter and requires lifecycle round trips (spec L147-L155).

## Verified
- The reviewed subject is at ac05a6e; the revised sections and diff match the supplied round-2 scope.
- Net-3 StateImage supports fixed-length value arrays and mode-owned metadata; its sender uses acknowledged baselines for deltas (codex/net-3:src/network/state/imageCodec.ts:L3, L47-L50; codex/net-3:src/network/state/sender.ts:L19-L29).
- Net-3 ModeHost exposes the lifecycle the revised adapter targets (codex/net-3:src/network/modes/contracts.ts:L6-L23).
- The binding grill answers require multiple ships, PvP privacy, lock-on views, transfers and a playtest gate (docs/vision/thesis-grill.md Q28-Q31).

## Not verified
- The review ledger files were inaccessible in this read-only sandbox; the ledger and round-1 response supplied in the prompt were used.
- No test suite was run, as requested. This is a design and source review, not an implementation verification.

---

# Round 2 response (spec revised)

Reviewed `round-2.json`. 3 accepted (2 P0, 1 P1), 0 rejected, 0 deferred. Codex confirmed the round-1 fixes.

## R2-F1 [P0]: R-2 cannot keep the duel canonical array byte-identical

Confirmed. Slots, the missile pool's `owner` and the `active` flags add canonical values (`tactical/hash.ts:L15-L24`), so my round-1 "byte-identical" claim was wrong. R-2 is now a **schema migration** with the rules unchanged, proved like R-4:
1. Record a pre-R-2 oracle over the duel golden and the ten gate seeds: named fields, command results, events and telemetry, per tick.
2. Check the post-R-2 run through an alias table, with `active` and `owner` declared added.
3. Re-bless the duel golden as a version bump.

Gate outcomes must stay identical. §5 and the R-2 row are updated.

## R2-F2 [P0]: The R-3 and R-4 migration comparisons include a field that must change

Confirmed (`canonicalFields.ts:L29`, `duel/hash.ts:L11-L12`). Every migration comparison now excludes the version field (`$simVersion`, and `SIM_VERSION` at the head of the duel hash), then checks separately that the new version is exactly the old one plus 1. This is stated once in §7 and applies to R-2, R-3 and R-4.

## R2-F3 [P1]: The R-6 privacy assertion rejects its own exterior summary

Confirmed. §10 now defines the public exterior fields as an explicit allowlist: `active`, ship class id, hull, shield layers, room damage levels and kinematics. For a ship whose interior a recipient cannot see, the privacy test asserts that only allowlisted fields reach any channel, and that the ship's random-number state never does.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->

---

# Round 3 (delta, reviewing a215757, effort medium, 78 s, 305835 in / 252928 cached / 3666 out)

Verdict: changes requested

## Findings

### [P1] R3-F1 The full Space projection conflicts with the exterior allowlist
R-6 publishes the full Space partition, including per-ship AI controller rows, while the new allowlist says no other information about a rival ship is public. · spec L65, L222, L238-L239; src/renderer/src/sim/tactical/hash.ts:L25-L27 · A plan writer cannot implement both the full-Space layout and the stated privacy test. Today's tactical serialization includes the hunter's mode, room and timing state. · Define a projected Space field list and redact per-ship AI state outside it. Apply the allowlist test to the decoded Space partition as well as ship blocks and other publication channels.

## Prior findings
- R2-F1: resolved — R-2 now specifies a duel migration oracle and a versioned re-bless instead of requiring a byte-identical canonical array (spec L95-L98, L269).
- R2-F2: resolved — Migration comparisons now exclude the version field and separately require old version plus one (spec L179; src/renderer/src/sim/canonicalFields.ts:L29; src/renderer/src/sim/duel/hash.ts:L11-L12).
- R2-F3: resolved — The public exterior allowlist explicitly includes room damage, so the privacy assertion no longer rejects the specified summary (spec L223, L238-L239).

## Verified
- Checked the revision diff and current R-2, migration, projection and milestone text at commit a215757 (spec L90-L110, L170-L183, L216-L243, L266-L274).
- Checked the relevant source serialization and binding owner answers (src/renderer/src/sim/tactical/hash.ts:L15-L27; src/renderer/src/sim/duel/hash.ts:L11-L12; docs/vision/thesis-grill.md:L292-L319).

## Not verified
- The working-tree review ledger was inaccessible; its committed copy at a215757 was read instead.
- No tests were run under the read-only review constraint.

---

# Round 3 response (spec revised)

Reviewed `round-3.json`. 1 accepted, 0 rejected, 0 deferred. Codex confirmed R2-F1 to R2-F3 resolved.

## R3-F1 [P1]: The full Space projection conflicts with the exterior allowlist

Confirmed: the tactical flatten includes the hunter state (`tactical/hash.ts:L25-L27`). §10 now publishes a **projected space partition**: the map, every ship's kinematics, and the missile pool (position, velocity, heading, owner, age). The AI controller rows (mode, target, timers, random state) of ships the recipient does not control are redacted to 0; only the host sees them. The allowlist now covers the space partition, and the privacy test decodes every partition, space included. It asserts that no AI controller row or random-number state of a ship the recipient does not control appears anywhere.

## Also changed

- Change log entry for round 3.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->

---

