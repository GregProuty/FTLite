# Round 2 response (spec revised)

Reviewed `round-2.json`. 3 accepted (2 P0, 1 P1), 0 rejected, 0 deferred. Codex confirmed the round-1 fixes.

## R2-F1 [P0]: R-2 cannot keep the duel canonical array byte-identical

Confirmed. Slots, the missile pool's `owner` and the `active` flags add canonical values (`tactical/hash.ts:L15-L24`), so my round-1 "byte-identical" claim was wrong. R-2 is now a **schema migration** with the rules unchanged, proved like R-4:
1. Record a pre-R-2 oracle over the duel golden and the ten gate seeds: named fields, command results, events and telemetry, per tick.
2. Check the post-R-2 run through an alias table, with `active` and `owner` declared added.
3. Re-bless the duel golden as a version bump.

Gate outcomes must stay identical. §5 and the R-2 row are updated.

## R2-F2 [P0]: The R-3 and R-4 migration comparisons include a field that must change

Confirmed (`canonicalFields.ts:L29`, `duel/hash.ts:L11-L12`). Every migration comparison now excludes the version field (`$simVersion`, and `SIM_VERSION` at the head of the duel hash), then checks separately that the new version is exactly the old one plus 1. This is stated once in §7 and applies to R-2, R-3 and R-4.

## R2-F3 [P1]: The R-6 privacy assertion rejects its own exterior summary

Confirmed. §10 now defines the public exterior fields as an explicit allowlist: `active`, ship class id, hull, shield layers, room damage levels and kinematics. For a ship whose interior a recipient cannot see, the privacy test asserts that only allowlisted fields reach any channel, and that the ship's random-number state never does.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
