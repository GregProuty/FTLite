# Round 1 response (spec revised)

Reviewed round-1.json against 031b2fa. All nine findings independently checked and accepted; no rejections or deferrals.

## R1-F1

Confirmed. Defined committed blob logical identities, per-side byte hashes and separate deployed Worker provenance.

## R1-F2

Confirmed. Required packaged-versus-packaged sessions alongside instrumented capture in both host directions.

## R1-F3

Confirmed. Separated ten-minute manual soak from bounded 540-second instrumented capture.

## R1-F4

Confirmed. Defined paired recovery recorder, scenario boundaries, generation/checkpoint/lease observations and manual versus instrumented proof.

## R1-F5

Confirmed. Made symlink-preserving whole-app archive mandatory with extracted inventory/signature verification.

## R1-F6

Confirmed. Pinned private ad-hoc identity, hardened runtime and explicit Electron entitlements and checks.

## R1-F7

Confirmed. Named existing constants and required new shared checkpoint/replay format constants.

## R1-F8

Confirmed. Required signalling workspace install/build and native workerd preflight for local tests.

## R1-F9

Confirmed. Required owned process-group cleanup, tracked descendant identities and independent OS evidence.

## Verification

Re-read the amended identity, packaging, lifecycle, gate and deliverable requirements together. The original optional-archive wording and canonical-export claim were corrected in place; detailed amendments now supply the contracts. No product implementation or runtime test is claimed.

Evidence checked: candidate-manifest raw source/package hashes; internet-app-report same-identity checks and array/budget limits; internet-app-smoke dev Electron launch and capture deadline; lease-smoke-lifecycle direct-child POSIX kill; checkpoint literal(2), replay union and existing SIM_VERSION/SESSION_PROTOCOL_VERSION. The installed electron-builder entitlement template contains the three selected entitlement keys. Native signing and actual Mac behavior remain acceptance tests, not assumptions that have passed here. Historical report validation remains explicitly versioned.

## Also changed

No product code changes. The detailed contracts preserve the user's private-MacBook approach. All physical gates remain pending until real device execution; the spec remains a design draft awaiting approval.

## Files changed

- docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md

<!-- end -->
