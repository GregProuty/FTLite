# Round 1 response (implementation revised)

Reviewed `round-1.json` against `6aacee8`. Two accepted and fixed; three nonblocking findings deferred. Claude Code Opus performed the review; the controller independently reproduced the blocking paths before changing code. No prior IDs in round 1.

## R1-F1 [P1]: OS wake can rejoin an unrelated saved seat

Confirmed. `onlineSession.ts` resumed from the mere presence of a disk credential. Tests for initial idle state and explicit Leave reproduced an unexpected join (and idle suspend's error status). Resume now requires an existing seated online context, refuses exit/disposal/idle/error, and rechecks context ownership after retirement. Idle suspend is a no-op. Existing trusted-suspend recovery tests continue to pass. The renderer closes a delivered port unless the session router is already online, preventing an unsolicited switch from couch/home. Helm has no online bridge and no live online context to resume.

## R1-F2 [P1]: One host-side TURN failure retires the whole authority

Confirmed the host-wide failure and cooldown mismatch. A regression uses the real `createOnlineIce` in TURN mode: obtain a credential batch, invalidate ownership, establish a new host owner inside the 60s quota window, then reconcile a guest. Before the fix it invoked session-level `onFailure`. The host now retires only that unstarted link and schedules one owned timer per seat for the provider's retry deadline. On expiry it verifies owner identity and obtains a fresh service ticket before starting another bounded 30s attempt. The authority and healthy peers remain owned by the same session; quotas and credential ownership rules are unchanged. Disposal cancels timers and is covered by a second test.

This implements peer-scoped host retry, not a relaxation of the 30s setup deadline or the 60s issuance quota. Guests retain their explicit bounded connection-failure/retry path; a guest can need to retry after the provider cooldown. No server-side credential rebinding, secret caching across owners, quota change or deployment was introduced. This distinction is intentional: temporary inability to reconnect during an enforced provider cooldown is not permission to destroy the authority for every other player.

## R1-F3 [P2]: Failed mirror adoption can block later delivery

Deferred. Verified `onlineSession.ts` acknowledges only successful adoption, while `src/network/utilityHost.ts` keeps one unacknowledged candidate plus one replacement. A rejected candidate can stop future automatic deliveries. This requires a deliberate reject/advance or retry contract and a regression for an invalid candidate followed by valid data. Existing committed bytes remain intact, but rollback freshness can degrade; this is not claimed fixed.

## R1-F4 [P2]: Cross-machine wall-clock offset

Deferred. Server wall-clock expiry is compared against client wall-clock time in the cited grant/ticket paths. The monotonic local grant cap protects authority fencing, but a fast client clock can reject otherwise valid permission. A server-relative expiry/offset contract affects service and client compatibility; no protocol adjustment was folded into this review's lifecycle fixes.

## R1-F5 [P3]: Best-effort suspend save and idle error

Deferred in part. The idle error is removed with R1-F1. Suspend still fences/retire immediately and can fall back to the last committed checkpoint rather than requesting an extra best-effort capture. A bounded suspend-capture design remains follow-up work; the existing local suspend proof must not be presented as actual OS-sleep coverage.

## Also changed

- The installed local refine skill now uses Claude Code Opus with read-only Read/Grep/Glob tools, hooks/MCP disabled and strict successful structured output. Its command/result tests pass. These are local skill files outside this repository, not game changes.
- Full verification command: `npm test && npm run typecheck && npm --prefix services/signalling test`: 3,086 root tests / 218 files, typecheck, and 222 signalling tests / 14 files PASS. Final focused rerun after adding exit-in-progress guards: 92 tests / 4 files PASS. Build and native results are retained under this run directory.
- Earlier deployment/package remains the reviewed historical candidate. These new source fixes are not claimed to have been packaged or deployed. Two-device and extended external scenarios remain unverified. Existing intentional service fault diagnostics remain in output.

## Files changed

- src/main/network/onlinePeers.ts
- src/main/network/onlineSession.ts
- src/renderer/src/main.ts
- tests/onlinePeers.test.ts
- tests/onlineRecovery.test.ts

<!-- end -->
