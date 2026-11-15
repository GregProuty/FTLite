# Net-3e Task 1 implementation report

Status: implementation, focused verification, typecheck and final full-suite verification complete. Base: `5249b507087ac66695011aa0c8d3b600291d7cba`, branch `codex/net-3`, worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`.

Commit: `d81f2f91dafe7c6a626da297fb0b941f5372c8f0` (`feat(network): add utility-local session lease gate`). Exactly the five requested source/test files were staged and committed. Post-commit status contains only the controller's plan/spec edits; this local report remains outside the commit as requested.

## Scope and files

- Created `src/shared/sessionLease.ts`: data-only clock, identity, renewal request, fence reason, gate state and work gate contracts, with strict validators.
- Created `src/network/session/leaseGate.ts`: utility-owned bounded lease state machine using the existing `LeaseGrant` and a type-only `Scheduler` import.
- Created `tests/sessionLease.test.ts`: 39 fake-clock/scheduler cases, including the synchronous disposal regression found during self-review.
- Extended `build/contentDigest.ts` and `tests/contentDigest.test.ts`: shared lease contract participates in compatibility hashing. The existing session directory traversal already includes the new gate implementation.

No utility/runtime/main integration, deployment, dependency changes, external accounts, credentials, owner checkout changes, merges or pushes. Protocol, simulation, checkpoint and replay versions remain unchanged. Controller-owned plan/spec approval edits are left unstaged.

## RED/GREEN evidence

1. Before production changes, `npx vitest run tests/sessionLease.test.ts` exited 1 at 14:32:07 on 2026-11-15: `Cannot find module '../src/shared/sessionLease'`. This is the required observed absent-module RED.
2. Before digest implementation, `npx vitest run tests/contentDigest.test.ts` exited 1 at 14:32:10: the new `src/shared/sessionLease.ts` mutation did not change the digest; 1 failed, 32 passed.
3. Implemented the contracts, gate and digest input. `npx vitest run tests/sessionLease.test.ts tests/contentDigest.test.ts` exited 0 at 14:33:20: 38 lease plus 33 digest tests, 71 total. `npm run typecheck` exited 0.
4. Self-review identified that a consumer disposing inside `onRenew` and then throwing could overwrite terminal `disposed` with `service-fenced`. Added a regression first. `npx vitest run tests/sessionLease.test.ts` exited 1 at 14:34:21: that exact test failed, 38 passed, with expected `disposed` / received `service-fenced`. Root cause was the internal close path lacking the disposed guard present on public entry points.
5. Added the disposed guard to the internal close transition. Focused run at 14:34:42 exited 0: 39 lease plus 33 digest tests, 72 total. `npm run typecheck` exited 0 again.
6. The first concurrent full `npm test` run included the newly added disposal regression while production was still RED. It exited 1: 180 files passed, 1 failed; 2520 tests passed, 1 failed. The sole failure was `tests/sessionLease.test.ts > utility-local session lease > keeps disposal terminal when the renewal consumer disposes and throws synchronously`, fixed by step 5. No unrelated failures were observed. Full-suite verification was restarted after the fix with `npm test -- --reporter=dot`; result recorded below when available.
7. Final `npm test -- --reporter=dot` started at 14:35:02 and exited 0 in 57.47s: 181 files passed, 2521 tests passed, zero failures. The existing optional-art placeholder warning is unchanged.
8. Final exact requested command `npx vitest run tests/sessionLease.test.ts` also exited 0: 39 tests passed. Focused final verification, full-suite verification and the final typecheck all use the final source implementation. Source/test whitespace check passed; Git emits its existing LF-to-CRLF normalization advisory.

## Interface and integration notes

`SessionClock` supplies `nowMs(): number` and `epochMs(): number`. `SessionLeaseIdentity` contains exactly roomId, runId, hostGeneration, hostSeatId and utilityEpoch. `LeaseRenewalRequest` adds exactly nonce. Room/run/utility epoch/nonce strings are 32 lowercase hex digits, using the existing room ID predicate; host generation is a positive safe integer and host seat is a safe integer in 0..3. `validateSessionLeaseIdentity`, `validateLeaseRenewalRequest` and `validateSessionGateState` reject missing/extra own enumerable keys and invalid field values. An allowed state must have null reason. No request-start/deadline is accepted in IPC data.

`createLeaseGate({ identity, clock, scheduler, nonce, onRenew }): LeaseGate` begins closed with `{ allowed: false, revision: 0, reason: null }`. It copies the identity and retains private request state separately from the emitted request. Construction samples the clocks and schedules one renewal for 5,000ms later, but does not invoke `onRenew` immediately. Consumers must install private IPC/subscriptions and then explicitly call `renewNow()` for bootstrap. This avoids invoking a callback before the caller has its gate reference; the controller confirmed this is compatible with Task 2.

`nonce(): string` is a trusted utility-side dependency and must provide a fresh cryptographic nonce for each request. Its malformed output or a thrown nonce/renewal callback fails closed with `service-fenced`. The gate retains only one current pending request, one optional permission, one prior clock sample and one cancellation handle. Main/IPC integration remains responsible for bounding its own in-flight work when newer requests retire replies.

The request-start sample is stored before `onRenew`, supporting synchronous `accept()`. `accept(request, grant)` validates both records and matches every identity/nonce field available in them. The existing `LeaseGrant` has no runId/utilityEpoch, so those are verified through the exact echoed current utility request. A successful reply is consumed once. Superseding a request retires its reply while preserving the earlier permission. A useful newer pending reply can grant after the earlier permission expires; explicit invalidation or a clock discontinuity retires pending requests as well as permission.

Permission ends at the earlier of local request-start + 12,000ms and the server grant expiry; receipt never adds twelve seconds. Grants at/after either deadline are rejected, including an exact 13,000ms receipt for a request begun at 1,000ms. The server expiry is checked against epoch time both when receiving and when checking permission. Rejected or duplicate replies cannot extend permission.

Automatic renewal uses a single recursively scheduled 5,000ms timer anchored to construction/the prior callback. Explicit renewNow does not stack or reset that cadence. `check()`, `renewNow()` and `accept()` sample clocks directly. Nonfinite readings, backwards monotonic/epoch readings, exceptions while reading clocks, or epoch/monotonic delta disagreement above 2,000ms fence the gate. Exactly 2,000ms disagreement remains allowed. A fresh valid sample establishes the next clock baseline; permission stays closed until a newly stamped request is granted.

`invalidate(reason)` clears permission and pending capability. `dispose()` permanently closes, clears capability and cancels renewal; queued callbacks and later replies cannot revive it, including synchronous callback disposal followed by throw. `invalidate('disposed')` also disposes. State snapshots are copied and revisions increase on permission updates or changed fence state; repeated checks of an unchanged state do not advance revision. Consumers must check immediately before every protected operation and enforce producer/authority effects in later tasks. This prerequisite has no player action or automatic resume path.

## Self-review and concerns

Reviewed timing arithmetic, expiry equality, all request/grant identity fields, malformed data, delayed/reordered/duplicate responses, useful prior permission during renewal, synchronous acceptance/disposal, revision snapshots, recovery after clock changes and timer cancellation. Mentally mutating nonce checks, request-start deadline, clock threshold, permission clearing, callback ordering and terminal disposal is covered by the corresponding tests. The discovered disposal regression was fixed through an additional observed RED/GREEN cycle.

No known blocking concerns. Task 1 deliberately provides a pure gate; independent utility enforcement, producer cleanup, caught-up tick behavior and end-to-end recovery evidence belong to later tasks. Cryptographic nonce/utility epoch generation is an integration responsibility, and gate construction requires explicit bootstrap renewal as described above. The full suite reports its existing optional-art placeholder warning; no assets were changed.
