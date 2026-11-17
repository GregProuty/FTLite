# Codex review exchange: helm-h2a-ii-plan

Subject: `docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 1fd401d, effort high, 1037 s, 9514701 in / 9294225 cached / 84187 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The ten-seed producer sends held input only when it changes, so the 250 ms receive-time watchdog zeroes the scripted Helm and repairs
Decision 8 and the Task 4 producer send a seat's held frame only when it differs from the last one sent. Receive-time attachments neutralise a non-zero held input that has not been refreshed for 250 ms. The scripted pair often holds a constant non-zero input for much longer than that: Helm axes are discrete (−1/0/1) and stay unchanged while accelerating or turning, and a repair holds `interactHeld: true` for its whole duration. So on every seed the authority silently zeroes the Helm's thrust or turn and stops repairs. The assertions cannot see this: an outcome is reached, the hashes agree and the journal replays (watchdog frames are journaled), so the seed passes even though the scripted pair is not the one flying. · plan L49 (Decision 8: 'sends its own player's held input (when it changed)'); plan L1625-L1626 (`if (!same(held, last)) { last = { ...held }; seat.client.held(seat.seat, held); }`); src/renderer/src/authority/core.ts:316 (heldReceipts stamped only for 'receive-time'), :326-330 (expire after REMOTE_HELD_TIMEOUT_MS, then neutralizeExpired), :319 (`begin({ kind: 'watchdog' ... })`); src/renderer/src/net/receivePolicy.ts:4 (250); src/renderer/src/sim/duel/scripted.ts:242 (constant `interactHeld: true` while in repair reach), :69 and :255 (discrete turn and thrust); spec L106 (one held frame per pump), L371 (held frames at 20 Hz through the client). · This is the spec's central headless proof that held input over the stream at 20 Hz drives the duel. As written, the risky path (sustained held input over unreliable-latest, refreshed under the watchdog) is never exercised, and the test passes with the authority overriding the scripted input. That is a test passing for the wrong reason. · In `producer.step`, call `seat.client.held(seat.seat, held)` on every new publication (every 50 ms, under the 250 ms watchdog) and drop the `same`/`last` gate. Amend Decision 8 to match. Add `expect(replay.frames.filter((f) => f.action.kind === 'watchdog')).toEqual([])` and one crew-activity assertion from the round record (for example a Weapons laser release or a finished repair greater than 0), so a passive crew cannot satisfy the seed.

### [P2] R1-F2 The content digest no longer covers the client protocol code that moves out of clientRun.ts
The gameplay and protocol content digest lists `clientControl/clientRun.ts` by name, not the clientControl directory. Plan ii moves everything protocol-relevant (acceptance and ordering, watermarks, outboxes, held and command sequencing, neutralize, notification budgets) into the new `clientControl/streamClient.ts`, and the duel's sequence allocation into `clientControl/duelClient.ts`. Neither is digested, so a later change to either leaves `__GAMEPLAY_CONTENT_DIGEST__`, and the compatibility check built on it, unchanged. · build/contentDigest.ts:13-15 (only `src/renderer/src/clientControl/clientRun.ts` from clientControl; src/network/modes is walked, so remoteClient.ts and duelProducers.ts are covered); tests/contentDigest.test.ts:40 (clientRun.ts is a pinned 'activation' source); plan L55-L57 and L196-L408 (the logic moves into streamClient.ts), L484-L554 (duelClient.ts). · Two builds whose client protocol behaviour differs would pass the compatibility check. Plan ii changes the digest anyway, so adding the files now costs nothing. · In Task 1, add `src/renderer/src/clientControl/streamClient.ts` and `duelClient.ts` to the path list in build/contentDigest.ts:15, and add both to the `sources` fixture in tests/contentDigest.test.ts. That second edit is required: computeContentDigest reads every listed path, so the fixture roots would otherwise throw ENOENT. Include the two files in Task 1's commit and test run.

### [P2] R1-F3 The ten-seed rig bypasses the duel mode host from authorityModes, and the deviation is not stated
Spec §10 builds the two-client loopback duel on 'a duel mode host from `authorityModes`'. The plan's `onlineDuel` rig instead composes `createEncounterAuthority` and `createDuelProducers` by hand, with its own lifecycle-pause binding and stream bindings, so it duplicates what `defineEncounterMode.createHost` wires. The only ModeHost-path test (the wiring test) plays no scripted duel. No Decision records the deviation. · spec L371; plan L1068-L1071 (the rig's comment claims 'the same parts the utility runs'), L1092-L1096 (hand-wired authority, pause and producers), L1102-L1103 (hand-built binding and attachHuman); plan L1238-L1260 (the wiring test only checks peer-lost); src/network/modes/encounterMode.ts:97-99, :113-116 (the real wiring, which Task 3 changes). · If encounterMode's wiring diverges from the rig (the pause closure, origin pass-through, `options.publication`, validStreamAttachmentOptions), the ten seeds still pass. · State it as a Decision (the rig needs `authority.replay()` and the session for `forceHunterDown`). Alternatively, run at least one seed of the scripted pair through `authorityModes.get('duel').createHost`, checking both replicas against `host.checkpoint()` and the round records.

### [P2] R1-F4 The round-record check matches five fields, not the authority's summary
Spec §10 requires that every `round` record matches the authority's summary. The test checks only `round`, `seed`, `baseTick`, `outcome` and `ticks` with `toMatchObject`, plus `telemetry.ticks`. The widened per-ship and per-player figures (laser releases and hits, missiles, repairs, losses) are never compared, so a client-side or codec mismatch in any of them would pass. · spec L376; plan L1652-L1658 (`expect(record).toMatchObject({ round: 0, seed, baseTick: 0, outcome: d.tactical.outcome, ticks: d.decidedTick })`). · The record is what the H-2b report reads. This is the test meant to prove the record a client receives equals the authority's. · Compare the whole record: `expect(record).toEqual({ ...rig.session().summary, round: 0, seed, baseTick: 0 })` (or plan i's round-record builder applied to the authority's accumulator), for both clients.

### [P3] R1-F5 ReplicaAdapter's signatures differ from spec §4 without a stated deviation
Spec §4 gives the adapter as `load(layout, snapshot, digest)` and `restore(replica, snapshot, digest)`. The plan's adapter is `load(snapshot)` and `restore(replica, snapshot)`, with the layout and digest closed over from options. It also adds a `supported` option. The design is reasonable, but it is not listed among the Decisions the way Decision 1 records the held-sequence deviation. · spec L136; plan L218-L224, L233. · The plans claim every deviation is stated. This one would confuse a reader checking §4 against the code. · Add a one-line Decision (the mode closes over its layout resolver and digest; `supported` carries the format and version check that clientRun.ts:50 had inline).

## Verified
- Sector createClientRun, line by line (old src/renderer/src/clientControl/clientRun.ts:48-77, 83-105, 177-196 against plan L263-L291, L297-L313, L385-L404, L448-L476). The order is unchanged: replica load or restore, then `publication = next`, reconcileUi and reconcileVoteExecutions (onAccepted), then the per-player held, auxiliary and outbox watermarks, then startupSequence, then flush. For results the order is outbox ack, reconcileCommandResult and vote executions (onResult), then reserveNotification and queue, then flush. neutralize keeps its `!ui.players[player]` guard via `heldSequences.has`. The held store reads and writes `ui.players[p].heldSequence` after reconcileUi, as before. A core-only dispose on link close leaves only wrapper-private state, which is never read after disposal.
- Sector remote client (src/network/modes/sectorStream.ts:75-141 against plan L756-L807 and L883-L911): the clientLink framing, the `${label}-*` close reasons ('sector-…'), the onClose registration order (client run first, then disconnect), and the disconnect order (receiver, client, presentation, removers) are all unchanged. The notification decode uses createMessageCodec(), the same codec as the old module-level decodeMessage. modeInputIdentity accepts a generic codec (streamBinding.ts:28).
- Every replace block occurs exactly once at its point in the plan: duelStream.ts:1-5, 10-11, 36-38, 41-43, 50-51; hostProcessProtocol.ts:22-25 and 28-31; encounterMode.ts:17-19, 24-25, 97-99, 114-116; networkBoundary.test.ts:27-29, and Task 3's block equals Task 2's `with:`. Plan i does not touch duelStream.ts, encounterMode.ts or hostProcessProtocol.ts.
- The consumed interfaces exist with the assumed shapes: MessageCodec<S>, duelCodec and duelPublicationSchema, sectorCodec as a factory, validatePublication (codec.ts:181-218); DUEL_PLAYERS, DUEL_SNAPSHOT_FORMAT, validateDuelSnapshot and loadDuelSnapshot (sim/duel/snapshot.ts); restoreDuelSnapshot(d, snapshot, digest) (plan i L584-L589); disposeDuel, hashDuel, Outcome; createLoopbackHarness().connectLocal() returning host, client, authorityLink and clientLink (loopback.ts:36); AttachOptions and Authority (authority.ts:10, 37); DuelControllers = readonly never[] (duelCheckpoint.ts:21); the test helpers GATE_SEEDS, CAP_TICKS, duelInit, resolveCutter, createFixtureAuthority, LAYOUT, makeState, quiet and ownTestCleanup.
- Decision 3: an unvalidated duel snapshot cannot reach restoreDuelSnapshot. acceptPublication re-parses with the schema plus validateDuelSnapshot and records the result in the WeakSet. The strict byte path is validated inside `restore` before the in-place restore. The hash and tick checks still run in the core after imageToDuelPublication(…, false).
- Decision 4: the duel `next` counter is raised in onAccepted before the outbox is created, at the same hw+1. Both advance together on enqueue, so the duel client never trips 'noncontiguous outbox command' (commandOutbox.ts:34). If the authority's high-water mark runs ahead, the outbox goes resync-required and `command` returns null.
- Steward ordering: the pause is requested only after an 'applied' result, or after two rejections. presence is always 'applied' (step.ts:94-98), so no noop is miscounted. When the steward's first publication shows the run paused, `lost` is cleared and presence waits for the resume. A human desired for the seat retires the steward before its results are read, which clears the debt. Only `origin === 'remote'` on a bound human records a loss. Old owners and stewards are detached before new humans attach, as the core's ownership check requires (core.ts:521). The lifecycle request from beforeControls enters the controlQueue and is applied in the same pump (core.ts:209-213, 468-474).
- Neutral held frames sent on unreliable-latest pass the input-identity check (streamBinding.ts:32), so the duel client's `held()` cannot trip duel-stream-invalid.
- The ten-seed final-hash comparison is aligned with the sender's cadence (sender.ts:46, tick % 3): the loop exits on a 3m publication and six more ticks follow, so the last ordinary publication is at the authority's current tick.

## Not verified
- The expected test counts (201, 108, 94 and 3431 tests, 244 files) and runtimes: I ran no tests, as instructed.
- Plan i helper and type shapes that plan ii's tests consume: duelInit's third parameter, telemetry.weaponsEmptyTicks, the DuelRoundRecord fields, the `round` event payload and the 'rematch' DuelCommand. I took these from plan i's text only.
- Whether the core drops or executes a retired steward's already-admitted presence command on detach (core.ts:524-540 was read only in part). Either outcome seems harmless because commandHighWater counts admitted IDs.
- The per-tick cost of a steward attached while the run is running (for example after the host's local port reloads): a full duel publication is encoded for the steward's loopback link and zod-decoded by the steward every tick, even after `done`. This was not measured against the §5 budget.
- Whether the utility's attach path passes `origin` through beyond validStreamAttachmentOptions, which hostRuntime.ts:78, utilityHost.ts:182 and hostProcess.ts:154 all call. Main setting 'local' or 'remote' is H-2a-iii's job.
- I read build/contentDigest.ts, tests/contentDigest.test.ts, tests/boundary.test.ts, tests/helpers/determinismGuard.ts, src/network/state/sender.ts, src/network/hostRuntime.ts, src/renderer/src/net/receivePolicy.ts and src/renderer/src/sim/duel/{scripted,step}.ts. They are outside the manifest, but the findings above needed them.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `22dfe97`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: The ten-seed producer sends held input only when it changes, so the 250 ms receive-time watchdog zeroes the scripted Helm and repairs

Confirmed. `src/renderer/src/authority/core.ts` neutralises receive-time held input not refreshed within `REMOTE_HELD_TIMEOUT_MS` (250, `net/receivePolicy.ts`), and the scripted pair holds discrete axes and `interactHeld` for long stretches. The Task 4 producer now calls `seat.client.held` on every new publication (the `same`/`last` gate is removed), Decision 8 says so, each seed asserts the authority replay has no `watchdog` frame, and a test after the ten seeds checks the summed crew `laserReleases[0]` is above 0. Task 4 now expects 14 tests, run as a whole file.

## R1-F2 [P2]: The content digest no longer covers the client protocol code that moves out of clientRun.ts

Confirmed against `build/contentDigest.ts` (only `clientRun.ts` from clientControl). New Task 1 Step 4b adds `streamClient.ts` and `duelClient.ts` to the digest list and stub entries to the `tests/contentDigest.test.ts` fixture; both join Task 1's files, test run and commit.

## R1-F3 [P2]: The ten-seed rig bypasses the duel mode host from authorityModes, and the deviation is not stated

Confirmed. Decision 10 states the deviation: the tests need `authority.replay()` and the duel session, which `ModeHost` does not expose; the ModeHost path is covered by the wiring test. The rig comment that claimed it used the same parts as the utility is corrected.

## R1-F4 [P2]: The round-record check matches five fields, not the authority's summary

Confirmed. Each client's record is now compared with `toEqual` against `duelRoundRecord(rig.session().summary!, 0, seed, 0)`.

## R1-F5 [P3]: ReplicaAdapter's signatures differ from spec §4 without a stated deviation

Confirmed. Decision 9 records it.

## Also changed

- The full-suite count in Task 5 is 3434 (three new tests).

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md

<!-- end -->

---

