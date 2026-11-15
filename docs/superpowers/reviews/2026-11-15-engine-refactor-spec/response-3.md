# Round 3 response (spec revised)

Reviewed `round-3.json`. 1 accepted, 0 rejected, 0 deferred. Codex confirmed R2-F1 to R2-F3 resolved.

## R3-F1 [P1]: The full Space projection conflicts with the exterior allowlist

Confirmed: the tactical flatten includes the hunter state (`tactical/hash.ts:L25-L27`). §10 now publishes a **projected space partition**: the map, every ship's kinematics, and the missile pool (position, velocity, heading, owner, age). The AI controller rows (mode, target, timers, random state) of ships the recipient does not control are redacted to 0; only the host sees them. The allowlist now covers the space partition, and the privacy test decodes every partition, space included. It asserts that no AI controller row or random-number state of a ship the recipient does not control appears anywhere.

## Also changed

- Change log entry for round 3.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
