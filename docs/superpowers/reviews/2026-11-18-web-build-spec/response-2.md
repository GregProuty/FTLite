# Round 2 response (spec revised)

I checked `round-2.json` against the subject at `5f2664f3`. All four new findings are accepted, and none was rejected or deferred. The reviewer confirmed 11 of the 12 round 1 fixes. The twelfth, R1-F3, reopened because of the "not null" wording, and the R2-F1 fix closes it.

## R1-F3 [P1]: Cross-origin checkpoint GET cannot read X-FTL-Checkpoint (reopened)

Confirmed that the wording "not null" excluded Electron's `Origin: null`. Fixed under R2-F1.

## R2-F1 [P1]: §6 limits Expose-Headers to non-null origins, which can be read as excluding Electron's Origin: null page

Confirmed. `index.ts:60` allows the string `null`, and `index.ts:69` sets `Access-Control-Allow-Origin` whenever an `Origin` header is present and allowed.

§6 now sets Expose-Headers wherever `index.ts:69` sets `Access-Control-Allow-Origin`, including the string `null`. The test asserts the header for both an https origin and `null`.

## R2-F2 [P2]: The §3.5 validity rule could discard runs in which the browser simply did not throttle the page

Confirmed. The original validity condition, the clamped control interval, was measured on the same page that holds the RTC and WebSocket connections.

In §3.5, a run is now valid when the page stays hidden throughout and a sibling control tab with no connections shows its interval clamped. The test page's own control period is recorded as data only.

## R2-F3 [P2]: A bfcache pagehide is given both the best-effort release and suspend, with no stated order

Confirmed. §3.1 and §7.6 now give one rule:
- `persisted: false` does the release.
- `persisted: true` only suspends.
- Its `pageshow` resumes.

## R2-F4 [P3]: §6's reason for keeping 'null' in ALLOWED_ORIGINS is wrong about the code

Confirmed. `index.ts:60` allows a missing or `null` origin without consulting the secret. §6 now says that, and keeps the secret's `null` entry only to match the existing provisioning.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-web-build-design.md

<!-- end -->
