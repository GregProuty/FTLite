# Codex review exchange: helm-h2a-ii-impl

Subject: `build/contentDigest.ts src/network/modes/duel.ts src/network/modes/duelProducers.ts src/network/modes/duelStream.ts src/network/modes/encounterMode.ts src/network/modes/remoteClient.ts src/network/modes/sectorStream.ts src/renderer/src/clientControl/clientRun.ts src/renderer/src/clientControl/duelClient.ts src/renderer/src/clientControl/streamClient.ts src/shared/hostProcessProtocol.ts tests/contentDigest.test.ts tests/duelOnline.test.ts tests/duelProducers.test.ts tests/duelRemoteClient.test.ts tests/helpers/linkPair.ts tests/helpers/onlineDuel.ts tests/networkBoundary.test.ts tests/streamClient.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 9fc44e7, effort high, 347 s, 1374905 in / 1264364 cached / 31661 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The ten-seed watchdog check reads only about half of each round's journal
The test counts watchdog frames when the loop counter hits k % 250 === 249. The authority's journal is not a rolling 300-tick window: `frames` is emptied at every tick % 300 boundary. So any frames journaled between a count and the next reset are never read. With the loop starting near tick 2, the counts land near ticks 252, 502, 752, 1002 and 1252. They miss ticks 252-300, 502-600, 752-900, 1002-1200 and 1252-1500, about 49% of the first 1500 ticks. A watchdog neutralisation in those windows passes the `toBe(0)` assertion. · tests/duelOnline.test.ts:L50-55 (`if (k % 250 === 249) watchdogCount += watchdogs()`), L69. core.ts:L458-459 (`boundary = tickOf() % 300 === 0` → `resetBaseline()`). core.ts:L252-258 (`frames = []`). core.ts:L573 (`replay()` returns the current `frames`). Plan L49 (Decision 8: 'no watchdog frame is journaled during the round (counted every 250 ticks, inside the 300-tick journal window)'). · Decision 8 promises the whole round is checked for watchdog neutralisation. As written, a regression that only sometimes starves held input (missed publications, a lagging sender, a round transition) can go unseen. That makes the proof too weak to catch a real regression. · Sample on the authority's tick, not on k. After each `rig.tick()`, read `watchdogs()` when `rig.session().duel.interior.tick % 300 === 299`, so each window is read just before its reset. Keep the final read after the loop. To also cover the boundary pump itself, add a test-only counter in the rig. Wrapping the authority's frames, or counting `begin({kind:'watchdog'})` through a probe, would let the test assert a cumulative zero.

### [P2] R1-F2 The ten-seed proof never asserts that each seat produced input
Each producer silently does nothing while its client's `commandStatus` is not 'ready' (L30). The final checks only look at the two seats combined: `results.length > 0`, the round's outcome, the replica and journal hashes, the round record, and laser releases summed over seeds. Suppose the Helm seat never became ready, or its held frames were never admitted. The hunter still decides the round, the gunner seat still yields results and laser releases, and every assertion passes. · tests/duelOnline.test.ts:L30 (early return when not 'ready'), L70-71 (results from both seats combined), L83 and L85-87 (`laserReleases[0]` summed). Plan L49 ('each seat's scripted pair ... sends its own player's held input on every one ... and its commands'). · The point of spec §10's proof is that both seats fly through their own clients. A seat-specific regression in the outbox, the ACK gate or held allocation would get through. · For each seat, assert that the final publication's `heldHighWater[seat]` is at least the number of running publications that seat saw (or > 0 at a minimum). Also assert that `pa.results` and `pb.results` each contain an 'applied' result for their own player.

### [P3] R1-F3 A presence still pending when another player pauses re-pauses with peer-lost after the resume (minor c)
`steward()` checks for the already-paused case only when no presence is pending. Take this order: the steward sends its presence; in the same pump, a player's Escape pause is applied before the tick. The presence then stays pending through the pause. On resume it applies, and `s.lost` triggers `pause('peer-lost')` right after the host chose to fly on alone. The window is one pump, and the result is one extra pause the host dismisses. · src/network/modes/duelProducers.ts:L162-163 in the diff (`if (s.done || s.pending || !p) return; if (p.phase === 'paused') { s.lost = false; ... }`). L159 (pause as soon as `done && lost`). Spec L197 (already paused: no peer-lost pause). No test covers it (tests/duelProducers.test.ts:L71-84 pauses before the loss). · Small UX glitch on a pause path. It does not contradict spec L196-198 outright, but it is untested. · In `steward()`, clear `s.lost` whenever `s.publication?.phase === 'paused'`, before the `s.pending` early return. Add a test: lose the peer, pause in the same pump, resume, and expect no peer-lost capture.

### [P3] R1-F4 validateDuelPublication's doc promises a tick check it does not make
The doc comment says the function checks 'the shared schema, the tick and the duel snapshot validator'. The body checks only the schema and `validateDuelSnapshot`; the tick and hash identity checks from `checkedPublication` are missing. Inside the stream client this is harmless, because `applyPublication` re-checks both. But the function is exported, so a future caller (H-2a-iii) using it on its own would get no identity check. · src/renderer/src/clientControl/duelClient.ts:L891-896 in the diff. streamClient.ts:L68 and L71 (the core's tick and hash checks). duelStream.ts:L28 (the checks `checkedPublication` makes). · A misleading contract on an exported validator. · Add `publication.tick === publication.snapshot.header.tick` and `publication.hash === hashF64(Float64Array.from(values))` to `validateDuelPublication`; they are cheap. Or correct the doc and say the core performs these checks.

### [P3] R1-F5 A replica replacement validates the publication twice
The core passes a snapshot that `validateDuelPublication` already validated to `replica.load`. `loadDuelSnapshot` then runs `validateDuelSnapshot` again. This happens on the first publication and on every new round. Decision 3 asks for one validation per received publication, and the WeakSet skip covers only `restore`. · duelClient.ts:L904 and L908 (load → loadDuelSnapshot). snapshot.ts:L174-175 (`loadDuelSnapshot` calls `validateDuelSnapshot`). Plan L44 (Decision 3). · It costs only CPU, and only on rare publications, but it differs from what Decision 3 says. · Add a load for snapshots that are already validated (`createDuel` + `writeBack`), used when `validated.has(snapshot)`. Or record in Decision 3 that a replacement load validates again.

## Verified
- Sector unchanged (check 5): streamClient.ts:L65-93 keeps the old clientRun's order (diff L695-737): run/sequence ignore, format/version ('state-version' on strict), tick check, receive-time watermark safety, hash ('state-checksum'), the JSON-cloned layout on load or an in-place restore. `publication` is set and the card hook runs (reconcileUi, then vote executions; clientRun.ts onAccepted, diff L720-722) before the held, auxiliary and outbox watermark loop, the startup sequence and the flush. acceptNotification (streamClient.ts:L99-115) keeps outbox ack → onResult (reconcileCommandResult, then vote execution; diff L751-758) → reserve → push → flush, which matches the old L743-769. `heldSequences` is backed by `ui.players[p].heldSequence`; `neutralize`'s `has` equals the old `if (!producer) return`.
- Sector remote client: remoteClient.ts:L435-486 matches the removed code (diff L553-629) line for line, including the error labels via `${label}`. `disconnect` order is receiver.dispose → client.dispose → onDisconnect (presentation.disconnect, previous/generations cleared) → removers, as before (diff L606-608). The clientRun's link.onClose(dispose) is still registered before the remote disconnect. `present` runs only on 'accepted' while open.
- Minor (b) triaged: after an internal core dispose, the wrapper's `publication` and `voteExecutions` are read only by reconcileVoteExecutions, and that runs only from the core's hooks, which no longer fire. The exposed `publication()` and `state()` are the core's (clientRun.ts `{...core, ...}`). No behaviour impact.
- Minor (a) triaged / validation (check 7): the remote duel path builds the publication unvalidated (duelStream.ts imageToDuelPublication with validate=false). It checks the image identity (sequence, tick, epoch) and passes the publication to acceptPublication → validateDuelPublication (schema + validateDuelSnapshot), then applyPublication re-checks tick === header.tick (streamClient.ts:L68) and the hash (L71) before load or restore. The strict byte path validates in loadDuelSnapshot or in restore's fallback (duelClient.ts:L910). No unvalidated or inconsistent publication reaches the replica.
- Decisions 2, 4, 9: onAccepted after the replica and before the watermarks (streamClient.ts:L78), onResult after the outbox and before queuing (L105). duelClient `command` stamps the confirmed tick with `next = max(next, commandHighWater+1)`, never rewound, and returns null unless canAllocate/canControl (duelClient.ts:L49-57). `held` takes the next held sequence (L59-67). The ReplicaAdapter is load(snapshot)/restore(replica, snapshot) plus `supported` (streamClient.ts:L20-35).
- Steward state machine (check 6): lost is recorded only for a bound (`human.detach`) 'remote' attachment (duelProducers cancel, diff L171-176). The debt moves to the steward at bind (`lost.delete`, L138) and is paid only after an applied result, or after two rejections (L156-159). The already-paused case clears it (L163). A new human clears it (L217), and a retired steward drops it. Local or no-origin attachments never pause. Retry sequences use max(hw+1, last+1) (L166). Presence is always 'applied' in both step paths (step.ts:L106-109, L147-151), so no 'noop' result can be mistaken for a rejection.
- b69ac2d tests would fail without the fix: tests/duelProducers.test.ts:L111-138. Without attachHuman's `lost.delete`, the third local attach leaves seat 1 owing the debt and `pauses` becomes ['peer-lost']. L105 expects sequence 5, where the old code reused 4 with hw 3.
- Wiring: encounterMode passes `attachOptions?.origin` to attachHuman (diff L376), and the pause closure validates the reason and calls the bound lifecycle request (L358). validStreamAttachmentOptions accepts only 'local'/'remote' (hostProcessProtocol diff L1185-1187). tests/duelProducers.test.ts:L141-163 checks a ModeHost peer-lost checkpoint.
- Boundaries: remoteClient.ts and duelProducers.ts are added to the network-boundary allow list (tests/networkBoundary.test.ts diff L1743), as Global Constraints L31 require. streamClient.ts and duelClient.ts join the content digest and its fixture (build/contentDigest.ts diff L43-44; tests/contentDigest.test.ts diff L1214-1216).
- Ten-seed proof is not vacuous on outcome and agreement (check 8): each seed requires an outcome, both replicas hashing as the authority's checkpoint, the journal replaying to its last tick hash, no stale-tick, round records equal to the authority's, and the summed crew laser releases > 0 with all ten seeds flown (tests/duelOnline.test.ts:L59-87). The gaps are the two findings above.

## Not verified
- I ran nothing (read-only review): suite, typecheck, determinism, smokes. The claims of 3519 tests passing and determinism PASS are the brief's.
- Whether the core's LifecyclePause request is idempotent when two stewards each owe a peer-lost pause, which happens if one remote attachment owned both seats. The duel never binds a remote link to both seats today, so I left it untriaged.
- Whether the H-2a-iii consumer will call validateDuelPublication on its own (relevant to the P3 on its doc).
- Beyond the manifest, to confirm findings, I read core.ts L245-259, L380-404, L450-481, L573 (journal reset and replay()), step.ts L88-157 (presence results), snapshot.ts L106-114 and L174-192 (validation in load and restore), commandOutbox.ts L17-56 (enqueue contiguity), encounterMode.ts L70-99, and spec L185-204.

---

# Round 1 response (implementation revised, 7d7fd1d)

Reviewed `round-1.json`. 4 accepted, 0 rejected, 1 deferred. The prepared diff is regenerated for 409a1e3..HEAD. Full suite 251 files, 3520 tests pass.

## R1-F1 [P1]: The ten-seed watchdog check reads only about half of each round's journal

Confirmed against `core.ts` (frames emptied at each tick % 300 boundary). The loop now reads the watchdog frames when the authority's tick is `% 300 === 299`, the last tick of each window, plus the final window after the loop, and asserts the number of windows read equals the full windows elapsed. All ten seeds still journal zero watchdog frames.

## R1-F2 [P2]: The ten-seed proof never asserts that each seat produced input

Confirmed. Each seat's `heldHighWater` must be above 0 and a command must be applied. A per-seat applied command was tried and is false on four seeds: the Helm can fly a whole round on held input alone, so it is not required.

## R1-F3 [P3]: A presence still pending when another player pauses re-pauses with peer-lost after the resume

Confirmed. The steward clears `lost` whenever its publication is paused, before the pending early return. A new test (presence in flight, pause, resume, applied) expects no pause and fails without the change.

## R1-F4 [P3]: validateDuelPublication's doc promises a tick check it does not make

Confirmed. It now checks the tick and the hash against the snapshot, as `checkedPublication` does (this also settles the task review's minor about the remote path), and the doc says so.

## R1-F5 [P3]: A replica replacement validates the publication twice

Deferred: a cost only, on the first publication and on a new round; every in-place restore validates once.

## Also changed

- (nothing)

## Files changed

- src/network/modes/duelProducers.ts
- src/renderer/src/clientControl/duelClient.ts
- tests/duelOnline.test.ts
- tests/duelProducers.test.ts

<!-- end -->

---

