# Net-3c final review

Reviewed39b5dc1..56c268c; sourcebafc5be. Independent reviewer used the full diff, relevant unchanged integration code and fresh validation evidence. No checkout mutations or repeated suites. Verdict: **With fixes**.

Strengths: durable SQL authority and terminal fencing; bounded/redacted protocol/provider handling; actual SQLite/hibernation/client/native gameplay proof; correct native registration ordering and unequal endpoint generation coverage.

## Important findings

1. **Unacknowledged rehost generations escape into events the client rejects.** `services/signalling/src/room/lifecycle.ts:158`, `services/signalling/src/room.ts:35`, `:61`, `src/network/session/serviceClient.ts:213`. Local commit advances generation before Directory acknowledgement. Expiry may emit host-departed(new generation) before clients know it; an intervening close/join can also expose a provisional active-generation roster. Clients reject both and detach, breaking otherwise recoverable checkpoint/rehost access. Align provisional publication and fencing semantics without treating unacknowledged active state as authority. Test held/lost post-commit acknowledgement, intervening roster changes and lease expiry with the production client/runtime. Existing prepared-operation recovery coverage does not cover this stage.
2. **Retired attempts cannot complete outstanding link-request correlation.** `src/network/session/serviceClient.ts:188`, `:234`, `services/signalling/src/room/sockets.ts:162`. Closed events delete live routing before a successful issuance reply may arrive. The client then rejects the valid correlated reply and disconnects unrelated work. Retain bounded correlation evidence separately from routing until settlement; accept or specifically reject the obsolete operation without reviving it or disconnecting. Test issued/closed/reply ordering. Reviewer reproduced both1 and2 in an in-memory execution of the production client without changing files.
3. **New service pins vulnerable development tooling.** `services/signalling/package.json:17`. Audit identifies the two documented moderate Vitest/mocker advisories, not a production Worker exploit. Apply authorized service-only4.1.12 patch, update lock and verify service tests/typecheck/build/audit.

## Minor

`services/signalling/tests/turn.test.ts:227`: ignored-promise warning in pending-header abort test remains unattributed. Deadline/abort/quota/redaction assertions pass. Identify the responsible listener before changing the helper; do not suppress diagnostics. Intentional SQL-corruption diagnostics are justified.

## Declined to judge and controller disposition

- Deployment/account/production hostname: outside local slice; remain deferred.
- Live TURN/forced relay/WAN/NAT/two physical computers: local/synthetic proof cannot establish them; remain unclaimed.
- UI/token persistence/automatic reconnect/rehost/live mirrors: assigned3d/3e; remain deferred.
- Utility lease gate/safe online authority: backend grants do not implement it; remain deferred and not demo-ready.
- Exhaustive prior3a/3b review: already reviewed; current integration and regressions checked.
- Inherited acceptance timing excess: unchanged gameplay code; still open, no new regression established.

Controller accepts the three findings for one combined fix. All exclusions agree with the approved slice boundary; none is silently discarded or represented as completed.
