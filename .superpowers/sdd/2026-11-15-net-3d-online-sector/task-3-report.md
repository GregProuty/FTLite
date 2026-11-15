# Task 3 implementation report

Status: DONE. Worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, task base `9013b44`.

Commit: `36526be fix(net): gate streamed input on sync and neutralize reliably`.

## Implemented interfaces and decisions

`createStateSender(...)` now returns `acknowledgedSequence(): number`. This exposes the existing validated ACK base: zero initially and after disposal, advancing only for an actually transmitted, still-retained image. Unknown, unsent, evicted, stale and receipt-only controls cannot advance it.

`createClientRun(...)` / exported `ClientRun` now expose `neutralize(player: PlayerId): void`. `createSectorRemoteClient(...)` exposes the same method through its existing returned client spread; its arguments remain unchanged. The method requires a validated publication, an owned existing player and a live client. It increments that player's existing `ui.players[player].heldSequence`, sends a neutral held frame over `reliable-ordered`, uses the latest confirmed publication tick/current run ID, and never allocates a gameplay command ID. Exhausted held sequence closes as `held-sequence-exhausted`. It works independently of the ordinary translate/send loop and does not alter pause state. A valid publication is the neutralization prerequisite; the host independently enforces ACK readiness. Existing `ClientActions`, `send`, callout and ordinary held production remain compatible.

The sector input identity validator now permits reliable held frames only when `moveX === 0`, `moveY === 0` and `interactHeld === false`. Ordinary held output from `send(actions)` remains on `unreliable-latest`. Both host and remote adapter use the same channel validation. Reliable neutral frames reach the existing authority ingress unchanged, retaining run, ownership, tick/age, sequence and pause behavior.

Every host sector binding starts unready. A bounded set (at most `MAX_RETAINED_IMAGES`, currently 64) records the image sequence of each reliable full emitted by its StateSender. Sender reliable state output is always a full image. A binding unlocks only when the sender's validated ACK sequence is also one of those actual full sends. `full-received`, unknown/unsent ACKs and an earlier binding's readiness do not unlock it. Input envelopes are still decoded/channel-validated, then discarded while unready; they are neither queued nor forwarded to authority, so receive ordinals and command/held/auxiliary IDs are untouched.

Full identity is recorded immediately before `link.send`: StateSender has already retained and marked the image sent, and a synchronous transport can call back with ACK and later reliable input before `send` returns. The binding processes the control synchronously and updates readiness before forwarding that later input. Disposal clears readiness/full identities; sender/receiver existing close-during-send behavior remains covered.

No producer-manager changes, generic mode changes, dependencies, cloud/deployment work, secrets, protocol/checkpoint/replay version changes or gameplay re-blessing.

## Files changed

- `src/network/state/sender.ts`: validated acknowledged-sequence accessor.
- `src/network/modes/sectorStream.ts`: host sync gate, bounded sent-full identity tracking, reliable neutral-only channel allowance.
- `src/renderer/src/clientControl/clientRun.ts`: owned-player neutralization API.
- `tests/stateStream.test.ts`: actual sent/retained ACK accessor and disposal coverage.
- `tests/sectorStream.test.ts`: real authority pre-ACK discard/ID coverage, receipt/unsent/unknown ACK denial, replacement reset, synchronous send-time ACK plus input.
- `tests/onlineNeutralization.test.ts` (new, 12 tests): actual stream/client/authority flow for neutralization, stale delayed held, resumed focused held, ownership/state/disposal/sequence exhaustion, normal authority validation, paused neutralization, and exact 120/121-tick age boundary.

## TDD evidence

RED command before production edits:

```text
npx vitest run tests/stateStream.test.ts tests/sectorStream.test.ts tests/onlineNeutralization.test.ts
```

The first run had a new fixture setup error: spreading client options into strict RunInit introduced `resolveLayout`. Removed that extra fixture property, then reran the same command before implementation for behavioral RED: **10 failed, 58 passed, exit 1**.

Relevant failures:

- `h.sender.acknowledgedSequence is not a function`.
- `h.client.neutralize is not a function` / `client.neutralize is not a function`.
- Pre-ACK command/held/callout ingress produced command high-water `[1]`, held high-water `[10]`, paused phase and receiveOrder 3 instead of `[0]`, `[0]`, running and receiveOrder 0.
- Replacement binding forwarded a callout before a full ACK.
- Reliable neutral frames closed as `sector-stream-invalid` instead of reaching the authority's ordinary run/ownership/tick checks.

After implementation, same command GREEN: **68 passed, 3 files passed, exit 0**. Added explicit reliable-held age boundary coverage during self-review (accept age 120, reject age 121).

## Final verification

```text
npx vitest run tests/stateStream.test.ts tests/sectorStream.test.ts tests/onlineNeutralization.test.ts tests/commandOutbox.test.ts tests/remoteAdmission.test.ts tests/loopback.test.ts

Test Files  6 passed (6)
Tests       120 passed (120)
Exit code   0
```

This includes unchanged existing bounded-capacity/invalid-image stream tests, all outbox/receive-time tests, and strict local loopback tests. Test output has no warnings/errors.

```text
npm run typecheck
> tsc -b
Exit code 0
```

The first typecheck found two readonly-array assignments in the new watermark fixture. Replaced those with fresh literal arrays; the final test/typecheck run above is after that correction.

`git diff --check` exited 0; Git emits existing LF-to-CRLF worktree notices for touched files. Whole-root/native/application acceptance validation remains with the controller per task scope; no repeated whole-root run here.

## Self-review and concerns

Reviewed all six source/test files and the task brief against the final diff. Confirmed the ACK gate cannot consume IDs or retain pre-ACK input, sent identities are bounded and disposable, reentrant ACK delivery observes the correct ordering, neutralization advances held sequence without touching command IDs, ordinary nonneutral movement remains latest, and existing authority admission enforces the same timing/ownership rules. Existing clientRun/sectorStream organization was preserved without unrelated restructuring. No remaining concerns.
