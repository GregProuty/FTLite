## Role
<!-- reuse -->

The subject is a design spec for client-side prediction in FTLite's online duel (a deterministic 60 Hz TypeScript sim, one host-side authority streaming full-state deltas at 20 Hz over WebRTC, clients that today draw the confirmed state one publication behind). The spec adds a second, predicted `DuelState` on each client, stepped ahead with the real `stepDuelTick` from the latest confirmed state using the client's own unacknowledged inputs and every player's held input carried in the publication; a publication is verified by hash and the prediction re-simulated only on a mismatch. It will be turned into an implementation plan executed task by task by fresh subagents, so it must be exact enough that two implementers would build the same thing, every claim it makes about the existing authority, stream client and online session must be true of the source, and its gates must be testable. It must not change any sim rule, golden hash or `SIM_VERSION`.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md` at commit `8e975767`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- It must conform to the networking decision record, `docs/superpowers/specs/2026-11-13-networking-decision.md` (§3 items 3 to 5, §4's Net-4 row). Where the subject departs from it (it predicts the partner's ship from carried held input; it keeps effects on confirmed counters, not event IDs), the departure must be stated in the subject.
- The code it changes is on master: the authority core, the stream and duel clients, the online duel session and its view source (paths in the manifest).
- The rock code it measures against is on the Asteroids-iii branch, read from its worktree inside this repo: `.worktrees/asteroids-iii/` (branch `spike/asteroids-iii`). Use it only for the subject's §2 and §4 claims about rocks; every other claim is judged against master.
- The run dir `docs/superpowers/reviews/2026-11-19-net-4a-prediction-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **What the authority's watermarks really mean (subject §3.2, §3.4).** Trace `core.ts`: when `heldSequences` and the ledger's high water move relative to `executeTick`, `publishCompletedState` and the reliable control publications. Is "entries with `heldSequence <= h` are in the confirmed state" true? Is "a command with sequence `<= c` has its effect or refusal in the confirmed state" true for an ordinary tick publication, and what happens on a publication made between admission and execution? Does the held input a tick used equal the `held` array at the publication that follows it? Does a pause, the 250 ms expiry or a neutralize change `held` without a held sequence, and does the subject's verify rule survive that?
8. **The input-to-tick mapping (subject §3.3, §3.4 step 2).** The authority latches the newest held frame and does not apply frames by tick. Is "tick T + j uses the j-th unacknowledged entry" a sound estimate, is it stated as an estimate, and are the cases covered: a lost held frame, two frames in one authority tick, no frame in a tick, commands on the reliable channel arriving later than the held frame sent beside them, more than one local tick in one pump?
9. **Stepping a second `DuelState` (subject §3.1, §3.3, §4.1).** Does `stepDuelTick` on a copy restored with `restoreDuelSnapshot` need anything the snapshot does not hold (module-level caches, WeakMaps keyed by state, the bitECS world, the seed and layout caches in `snapshot.ts`, per-tick events, telemetry)? Can two live `DuelState`s of the same seed and layout coexist and be disposed independently? Are the values `flattenDuel` gives exactly the values a publication hashes? Does the step check `requestedTick`, and is the subject's restamping rule right?
10. **The local tick (subject §3.3).** Against `onlineDuel.ts`'s pump: what else rides one pump today (press edges, `crewHelmPrev`, `staleHeld`, the leave prompt, `heldStamps`, the ping, focus and blocked input, `stopInput` and `neutralize`) and does "the first due tick takes the presses, later ones repeat the held keys" leave any of it undefined? Is dropping ticks beyond 4 consistent with the held sequence and the log?
11. **Reset and edge states (subject §3.4, §3.5).** A new round, a rematch, the decided end card, pause and resume, a reconnect with a new stream client, the frozen copy, the first publication after attach, a full (reliable) image on a tick that is not a multiple of 3, `PREDICT_MAX_TICKS` when the lead exceeds it. Is each one defined, and is "P is never more than 30 ticks past the confirmed tick" consistent with step 4's `T + min(N, PREDICT_MAX_TICKS)` and with §3.5?
12. **What is drawn from which state (subject §3.6, §3.7, §3.9).** Can the scene and the view source (`DuelViewSource`, `onlineSource.ts`) draw one state for the world and another for other players' characters as written? Does anything the subject says to remove have a reader it does not name? Is "an effect tied to a ship is drawn at that ship's predicted position" exact enough for each `gapEvents` kind? Does reading hull, outcome-adjacent values or the seat from `P` conflict with the rows that read `C`?
13. **The wire change (subject §3.2).** `PublishedState` is shared by both modes: the schemas in `net/codec.ts`, the image metadata and its size bound, checkpoints, the replay journal, the loopback path that sends whole publications, and where `schemaVersion` is checked at the handshake. Is anything that must change unnamed?
14. **The gates (subject §6).** Is each of G1 to G8 observable with the named rig, and are the numbers consistent with §2's measurements? Is G1 achievable given item 8's jitter (does "partner's input constant" suffice for hash equality when this seat's own frames map to ticks only approximately)?

Controller's own low-confidence items:

15. §3.4 step 3's claim that "hash equal at T, the same inputs after T, tick within 2" implies P equals what a re-simulation would produce. The tolerance of 2 ticks means P may sit at a different tick than `T + N`; check the rule is coherent (which inputs do the extra or missing ticks use) and that it cannot drift without bound.
16. §3.3 says the hash is recorded "on ticks where a publication can fall (every third tick)". `STATE_CADENCE_TICKS` is in `network/state/sender.ts`; the predictor lives in `renderer/src/clientControl`. Check the dependency direction is allowed and that the authority's tick numbering makes "every third tick" line up with `P`'s ticks.
17. §3.2's byte figure (45 to 110 bytes a player) and §2's packet sizes are estimates, not captures.
18. §3.9 was written from reading `onlineSource.ts` and `onlineDuel.ts` only; other readers of `thrMille`, `helmVent`, `throttleBase` or `unacked` (the scene, the HUD sinks, tests) were not searched.
19. Whether the host's own window, which attaches through a port to the worker authority like a guest, has any path (the `strict` admission policy, `remoteStreaming` false) where the subject's rules do not apply.
20. §4.3 and §5 speak about Asteroids-iv, which has no spec yet; check they claim nothing about it as fact.

## Reading manifest

- `docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md:L1-L194`: the subject, all of it.
- `docs/superpowers/specs/2026-11-13-networking-decision.md:L32-L58`: the decision and the milestones (Net-4).
- `docs/superpowers/specs/2026-11-19-perf-i-design.md:L15-L40`: the publish cadence and the shared image (what the host does per tick today).
- `src/renderer/src/net/contracts.ts:L32-L45`, `src/renderer/src/net/contracts.ts:L130-L202`: `HeldInput`, `HeldFrame`, `CommandEnvelope`, `PublishedState`, `Checkpoint`.
- `src/renderer/src/net/codec.ts`: grep for `heldHighWater`, `PublicationSchema`, `strict()` (the publication schemas of both modes).
- `src/renderer/src/net/receivePolicy.ts:L1-L7`: the admission policies and the held timeout.
- `src/renderer/src/authority/core.ts:L50-L90`, `src/renderer/src/authority/core.ts:L160-L190`, `src/renderer/src/authority/core.ts:L240-L335`, `src/renderer/src/authority/core.ts:L334-L445`, `src/renderer/src/authority/core.ts:L442-L510`: held and sequences, restore, publish, `acceptHeld`, expiry, ingress and admission, controls and pause, `executeTick`, `pump`.
- `src/renderer/src/authority/ledger.ts:L1-L133`: when a command's high water moves.
- `src/renderer/src/authority/tickDriver.ts:L1-L69`: the time-driven tick the subject copies.
- `src/renderer/src/authority/duelRules.ts:L28-L77`: the duel's step, cues and records.
- `src/renderer/src/clientControl/streamClient.ts:L47-L219`: accepting a publication, the replica adapter, results and events with their floors, `held` and `send`.
- `src/renderer/src/clientControl/duelClient.ts:L1-L81`: the duel replica, `command`, `held`.
- `src/renderer/src/clientControl/commandOutbox.ts:L1-L66`: the receive-time outbox.
- `src/network/modes/duelStream.ts:L1-L70`, `src/network/modes/remoteClient.ts:L1-L94`: publication to image and back, the remote client.
- `src/network/state/sender.ts:L1-L80`, `src/network/state/receiver.ts:L1-L59`: the cadence, the acknowledged base.
- `src/network/modes/duel.ts:L1-L24`, `src/network/modes/sector.ts:L1-L26`, `src/network/online/onlineDuel.ts:L15-L25`, `src/network/hostRuntime.ts:L1-L20`: the schema versions and where they are compared.
- `src/renderer/src/sim/duel/snapshot.ts:L30-L120`, `src/renderer/src/sim/duel/snapshot.ts:L200-L227`: the snapshot, its caches, `loadDuelSnapshot`, `restoreDuelSnapshot`.
- `src/renderer/src/sim/duel/hash.ts:L1-L39`, `src/renderer/src/sim/duel/state.ts:L20-L138`: `flattenDuel`, `DuelState`, `createDuel`, `disposeDuel`.
- `src/renderer/src/sim/duel/step.ts:L271-L485`: `stepDuelTick` (commands, `requestedTick`, held input, the round and rematch).
- `src/renderer/src/app/duel/onlineSource.ts:L1-L218`: the view source: interpolation, `gapEvents`, the local predictions.
- `src/renderer/src/app/duel/onlineDuel.ts:L58-L170`, `src/renderer/src/app/duel/onlineDuel.ts:L200-L260`, `src/renderer/src/app/duel/onlineDuel.ts:L353-L469`: the session: the in-flight holds, `observe`, `pump`, `schedule`, `attach`, `frame`, freeze.
- `src/renderer/src/app/duel/scene.ts:L60-L100`: `DuelViewSource`.
- `src/renderer/src/app/duel/runtime.ts:L120-L160`, `src/renderer/src/app/duel/runtime.ts:L285-L400`, `src/renderer/src/app/duel/runtime.ts:L565-L635`: how Single player draws between ticks and gathers events.
- `src/renderer/src/net/duelRecord.ts:L1-L80`, `src/renderer/src/render/duel/latencyOverlay.ts`: the playtest record and the F3 overlay.
- `tests/helpers/linkPair.ts:L1-L42`, `tests/helpers/liveDuel.ts`: the rigs the new test helper builds on.
- For item 18: grep `src/renderer/src` and `tests` for `thrMille(`, `helmVent(`, `throttleBase(`, `unacked(`, `UNACKED_MAX`.
- `.worktrees/asteroids-iii/src/renderer/src/sim/tactical/rocks.ts:L1-L135`: the rock pool, rails read from the tick, the memo and per-step table (subject §2, §4.1, §4.3).
- `.worktrees/asteroids-iii/docs/superpowers/specs/2026-11-19-asteroids-iii-design.md:L100-L112`, `.worktrees/asteroids-iii/docs/superpowers/specs/2026-11-19-asteroids-iii-design.md:L290-L300`, `.worktrees/asteroids-iii/docs/superpowers/specs/2026-11-19-asteroids-iii-design.md:L405-L425`: the memo's safety across restore, guests and rock events, what Asteroids-iii left out of scope.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The networking decision record: one host-side authority sending state, clients predicting by re-simulation with the deterministic sim; no lockstep, no input relay.
- The subject's §8: the duel only; built after Asteroids-iii merges; one predicted timeline for the ship world with other players' characters interpolated; effects on confirmation; Net-4b, the wire format and Net-4c as later changes in that order.
- No sim rule, golden hash or `SIM_VERSION` changes. The determinism guard stays.
- The numbers in §2 are measurements of a scripted run, and the constants (`PREDICT_MAX_TICKS = 30`, at most 4 local ticks a pump, the 2-tick tolerance) are starting values; do not propose retuning them, only flag one that contradicts another rule.

## Output format (strict)
<!-- reuse -->

Your final message is validated against a JSON Schema; it must be a single JSON object and nothing else:

```
{ "verdict":      "changes requested" | "ready with P2s" | "ready",
  "findings":     [ { "severity": "P0"|"P1"|"P2"|"P3", "title": "<one line>",
                      "claim": "<what is wrong>", "evidence": "<subject L<n>, file:L<n>>",
                      "why": "<why it matters>", "fix": "<concrete fix>" } ],
  "prior":        [ { "id": "R<N>-F<k>", "result": "resolved" | "withdrawn" | "still open",
                      "note": "<for still open: what is still wrong, with new evidence>" } ],
  "verified":     [ "<what you checked and found correct, with citations>" ],
  "not_verified": [ "<what you could not verify and why>" ] }
```

Findings ordered by severity then importance. Do not invent IDs; new findings have no ID (the responder assigns `R<N>-F<k>` in array order). `prior` lists exactly the awaited IDs given to you, once each, and nothing else. In round 1 `prior` is empty.

## Severities
<!-- reuse -->

- **P0**: the design cannot work as specified as a whole (the prediction cannot be made to match the authority, or it would let a client show or cause something the authority never did in a way that does not correct), or it would change a sim rule, a hash or the authority's behaviour.
- **P1**: a rule is ambiguous in a way two implementers would build differently, a claim about the authority, the stream client, the session or the snapshot is false of the source, an interface the spec relies on does not exist in the shape assumed, a gate cannot be observed or cannot pass as written, or a case hit in ordinary online play (a pause, a rematch, a reconnect, a lost update, the host's own window) is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
