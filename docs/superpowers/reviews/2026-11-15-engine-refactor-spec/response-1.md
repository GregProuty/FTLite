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
