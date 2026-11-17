# Round 1 response (plan revised)

Reviewed `round-1.json` against `f81d9b1`. 7 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: A LAN peer seen as peer-reflexive is likely labelled 'internet'

Confirmed (no WebRTC IP policy is set, so mDNS applies and a remote prflx has no address in getStats). A prflx candidate on either side is judged by its address; a remote prflx with no readable address is `lan` only when the local candidate is host at a private address, otherwise null (unknown; the schema admits it and the report shows unknown). Decision 1, the gates text and the route tests are updated.

## R1-F2 [P2]: The live targets count every online round in the files

Confirmed. With a checklist, the live targets and the planet extra cover only the rooms its sessions list, the report line says so, and unclaimed and listed-but-missing rooms are reported; without a checklist every room counts and a warning is printed. Decision 8 and two report tests are updated.

## R1-F3 [P2]: The RTT test cannot tell the median from the latest sample

Confirmed. `await flush()` after attach, samples [90, 60, 40, 50, 70], expected 60. Also: two `pump(1000)` steps can land 999.9999999999998 ms apart, under the poll interval, which skipped a sample; the loop steps 1001 ms, with a comment.

## R1-F4 [P3]: groupRooms orders rounds by wall-clock times from two machines

Confirmed. Rounds sort by round index first, then `startedAtIso`; Decision 7 notes it.

## R1-F5 [P3]: The smoke's record copy runs unguarded in finally

Confirmed. Wrapped in try/catch with `failure ??= 'record copy failed'`, before the workerd and temp-root cleanup.

## R1-F6 [P3]: Fallback check 3 only covers LAN rooms

Confirmed. It now covers any session whose rooms share one known network (lan or internet); Decision 9 and its test are updated.

## R1-F7 [P3]: A missing currentRoundTripTime is reported as a real 0 ms RTT

Confirmed against `src/network/rtc/peer.ts`. `linkFigures()` returns `{ route, rttMs: number | null }`; stats are sent only with a route and a real RTT; `diagnostics()` keeps its 0 for existing callers. Interfaces, Decision 2 and the controller test are updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md

<!-- end -->
