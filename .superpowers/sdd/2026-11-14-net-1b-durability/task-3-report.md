# Task 3 — transactional snapshot format 2

Implemented on `codex/net-1b` after task 2. No gameplay blessing, tuning changes, owner checkout edits, plan/ledger changes, or subagents.

## Public interfaces for task 4

From `src/renderer/src/sim/snapshot.ts`:

```ts
const SNAPSHOT_FORMAT = 2;
saveSnapshot(state: SimState, contentDigest?: string): Snapshot;
validateSnapshot(layout: ShipLayout, snap: unknown, expectedContentDigest?: string): Snapshot;
restoreSnapshot(state: SimState, snap: unknown, expectedContentDigest?: string): void;
loadSnapshot(layout: ShipLayout, snap: unknown, expectedContentDigest?: string): SimState;
snapshotContentDigest(explicit?: string): string;
```

`SnapshotHeader` now requires `contentDigest: string`. Digest arguments must be lowercase SHA-256 hex. Omission resolves the build-injected `__GAMEPLAY_CONTENT_DIGEST__`; an unbundled caller that omits it gets an explicit error. There is no dummy/default digest and a supplied expected digest is always checked. Authority publications and crash baselines use `deps.contentDigest`; headless/local runtimes explicitly pass their digest into the client. `createClientRun` options add `contentDigest?: string` with the same default resolution through snapshot APIs.

`validateSnapshot` returns a detached header/value-array representation after validation, without allocating a world. `restoreSnapshot` validates first, rejects mismatched player count, then writes into the same state, world, crew IDs, and numeric arrays. `loadSnapshot` validates before construction; `createSimState` owns partial-construction cleanup, and a failed post-construction decode disposes the allocated state. Client same-shape updates call `restoreSnapshot`; shape/layout replacement loads successfully before disposing the previous replica.

## Canonical schema and cache

`canonicalFields.ts` exports `canonicalFields(layout: ShipLayout, players: number): CanonicalField[]`; `flatten.ts` re-exports the function. Each descriptor has `{ name: string; count: number; offset: number; array: boolean; parts: string[] }`. `count` is one for a scalar and the shape-derived length for an array. Zero-length array descriptors are retained. Descriptors are internal read-only-by-convention plans: do not mutate them in callers.

Paths include ordinary `rooms.o2`/`run.vote` names, virtual root `$simVersion`, `$layoutId`, `$layoutHash`, `$crewCount`, virtual `weapons.$targetKind/$targetId/$targetRoom` (and Science equivalents), RNG stream names, and per-player `crew.0.id/x/y/health/life/bleed/reviveProgress/reviverPid/station`. The one plan drives both flatten and unflatten and supplies validation offsets; there is no second ordered field list in the validator. `FLATTEN_MANIFEST` is unchanged. Canonical field order and numeric values are unchanged.

A `WeakMap<ShipLayout, Map<string, CanonicalField[]>>` caches plans by layout identity plus player count and layout collection lengths. `snapshotValidation.ts` privately caches a flat range plan by descriptor-array identity. Same-shape publication validation reuses the replica's derived layout and performs one numeric pass, followed by two target-triplet consistency checks; it creates no temporary simulation/schema world. Portable validation derives layout tables without ECS allocation. Layout objects are treated as immutable while in use, as in the existing simulation.

The validator checks exact object members, format and sim version, expected digest, layout ID/hash, exact manifest ordering, exact value count, finite values, integer storage, domain enums/ranges, and duplicate header/canonical identity, tick, player/crew count and RNG consistency. Known bounds include flags, life/door/target kinds, positions/health, room/station/player/catalog references, map fields, frequencies, levels, progress and typed-array storage ranges. Tick stamps remain signed where gameplay/history uses signed stamps, including negative `run.arrivalTick`; inactive frequencies are zero and live frequencies are 1 through `FREQ_COUNT`. These are format/domain checks, not an attempt to reject every unreachable combination of otherwise valid gameplay fields.

## Fixture and compatibility handling

`tests/golden/basic.json` changes only snapshot header format (1 to 2) and adds the digest computed for this implementation. `tests/golden.test.ts` explicitly binds that fixture header to the current build digest because the digest includes serialization code. This adaptation touches no canonical values, ticks, expected hash vector, or final hash. It does not bypass validation: normal expected-digest matching still runs, with independent wrong-digest rejection tests. Runtime load rejects old format 1 explicitly, including a genuine old header with no digest member; no migration fallback was added.

Test semantic/legacy runner helpers now carry their explicit digest through save/load/client construction. The CLI publication profiler also computes and supplies its digest. Codec player-dependent bounds use `MAX_PLAYERS` instead of literal four, including metadata extraction, watermarks and telemetry arrays. The cap stays four; task 4 still owns injectable 16-limit wire/ledger coverage. Codec version numbers remain structurally positive; snapshot/client validation owns unsupported-version rejection, retaining the existing `state-version` close behavior.

## TDD and validation evidence

1. `npm test -- tests/snapshotV2.test.ts` before implementation: 24 tests, 17 failures. Existing load accepted wrong digest/manifest, non-finite values, invalid flags/ranges and inconsistent headers; the new public APIs were absent; saved format was 1.
2. First implementation: all 24 new tests passed; typecheck passed. Focused regressions caught the live frequency-3 case, the existing sim-version error wording contract, and the old golden representation. Those were fixed without changing gameplay assertions. Codec format rejection was kept at the existing client validation boundary so recovery's explicit close behavior remains unchanged.
3. Added field-bound, legacy-header, digest and transactional-publication/replacement tests. Red run: 46 tests, 5 failures (legacy error wording, three missing domain upper bounds, replacement behavior). After correcting the test to observe loopback's existing swallowed observer exceptions through state, replacement still failed because the old client refused valid shape changes. Implementation then passed all 46 tests.
4. `npm test -- tests/snapshot.test.ts tests/snapshotV2.test.ts tests/netCodec.test.ts tests/authorityRecovery.test.ts tests/golden.test.ts tests/netParity.test.ts tests/authorityEvents.test.ts tests/authorityClock.test.ts tests/cardController.test.ts --maxWorkers=2`: **9 files, 243 tests passed**, 9.34 s reported duration. Snapshot 49, new snapshot 46, codec 72, recovery 9, golden 4, parity 24, events 9, clock 18, cards 12.
5. `npm test -- tests/boundary.test.ts tests/determinismGuard.test.ts`: **2 files, 93 tests passed**, including actual sim/shared source traversal and the AST guard fixtures.
6. Final test-only typing/header provenance changes: `npm run typecheck` passed; `npm test -- tests/snapshotV2.test.ts tests/golden.test.ts --maxWorkers=2`: **50 tests passed**. `git diff --check` passed.
7. Direct JSON comparison against HEAD verified initial canonical values and every expected golden hash unchanged; final remains **`b87a0284`**, `SIM_VERSION` remains **35**. No bless command ran.
8. Unbundled `tsx` assertion verified `snapshotContentDigest()` without an explicit digest throws. `npx tsx scripts/profile-publication.ts` succeeded with explicit computed digest: 500 operations took approximately snapshot 14.55 ms, hash 8.23 ms, encode 17.86 ms, metadata 3.61 ms, decode 11.89 ms. Diagnostic only, not a benchmark gate.

The new tests also assert rejected restores/loads preserve live hashes, entities, component-cell population and array high-water, and verify same-shape publications retain world/arrays. A failed replacement leaves the prior world live; a successful replacement disposes it.

## Remaining scope

No known failing focused check. Full-suite/performance acceptance remains task 5 as assigned; this task did not repeat a full suite. Task 4 should pass explicit `init.contentDigest` for portable replay/checkpoint/crash work and keep fixture digest rebinding confined to clearly labeled test representation adaptation. Future canonical gameplay fields must be added to the shared canonical plan and receive an appropriate domain rule; timestamps and inactive sentinels must retain existing semantics.

## Review fix round 1 — C-001

Confirmed the review finding: `Array.prototype.some` skips missing entries when called on the incoming manifest. Changed only manifest comparison to iterate the trusted dense `FLATTEN_MANIFEST`, requiring a matching value at every expected index. Added wholly sparse and single-deleted-entry regression cases. The rejection matrix now explicitly exercises `validateSnapshot` as well as `restoreSnapshot` and `loadSnapshot`, and asserts unchanged live hash, entities, component-cell population and allocation high-water.

Red evidence: `npm test -- tests/snapshotV2.test.ts` reported **2 failed, 46 passed** before the production fix; both new sparse-manifest cases failed because `validateSnapshot` did not throw. Green evidence after the fix: the same command reported **48 passed** (1.01 s duration). `npm run typecheck` passed. No full suite, unrelated changes, fixture rebinding, or gameplay/hash changes were made for this correction.
