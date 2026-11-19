# Round 2 response (plan revised to 158dd07a)

I checked `round-2.json` against the plan at its round 1 head. The verdict was "ready with P2s", with no new findings. R1-F4 reopened, and it is fixed again in `158dd07a`.

## R1-F4 [P2]: The rehost step does not show that the mirror was written to, or read from, IndexedDB (reopened)

Confirmed against the new evidence. On Reconnect, `onlineSession.ts:457-458` calls `refresh()`, and `onlineMirrors.ts:93,99` always calls `fetchLatest()` from the service. The tick comparison therefore passed even with IndexedDB empty. The prose fallback was not implemented, and `restoredFromIndexedDb` was a literal `true`.

The fix: after the browser guest reopens, and before it clicks Reconnect, the test reads `records`/`mirror-v1` directly from IndexedDB. It opens the database without a version and decodes the record using the layout in `mirrorStore.ts`:
- the magic bytes are at offsets 0-7;
- the header length is a uint32, little-endian, at offset 8;
- the header JSON starts at offset 12.

It then asserts that the stored committed `checkpointSequence` and `capturedTick` equal the last committed checkpoint. The proof records what was actually read, and the prose is updated with the fallback wording removed.

The Chromium-host / Electron-guest pairing records "not read", because the Electron driver has no page evaluate. The two browser-guest pairings carry the IndexedDB proof, and the Electron guest still passes the status-based rehost check. I accept that as sufficient coverage.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-web-ii-web-build.md

<!-- end -->
