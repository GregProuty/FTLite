# Round 2 response (plan revised)

Reviewed `round-2.json`. 1 new accepted (R2-F1), R1-F1 re-opened and fixed with it; R1-F2 to R1-F7 confirmed resolved.

## R1-F1 [P2] / R2-F1 [P2]: The hidden-remote-prflx fallback labels internet sessions 'lan'

Confirmed: a private local host address says nothing about the far side behind a NAT, and with STUN/TURN configured a NATed internet peer can appear as a hidden-address prflx. `rtcRoute(local, remote, direct = false)` applies the local-side inference only when `direct`, which `src/network/rtc/peer.ts` passes as `iceServers.length === 0` (`iceServers` is in scope in `createRtcPeer`): with no servers neither side can have a server-reflexive or relay path, so a hidden prflx is a direct LAN check. Otherwise the route is null (unknown). Decision 1, the Interfaces line and the route tests are updated (private host + hidden prflx: `lan` when direct, null with servers).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2b-i-telemetry-report.md

<!-- end -->
