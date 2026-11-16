# Round 1 response (spec revised, 66664e8)

Reviewed `round-1.json` against the spec and the code. 11 accepted (1 P0, 4 P1, 5 P2, 1 P3), 0 rejected, 0 deferred.

Each fix is recorded in the ledger note for its finding. In summary:
- **Rematch:** a hashed `round` module (`round`, `helmPlayer`, `baseTick`) keeps the tick monotone. `validateDuelCheckpoint` is redefined for rounds. The changes are listed under duel `schemaVersion` 2, with `MIGRATIONS[38]`.
- **End card:** ticks advance and every command gets a result (`duel-decided` or `noop`).
- **Update rate:** kept at 20 Hz, with interpolation over the actual tick gap. The budgets and thresholds are restated, and cadence 1 becomes H-2c's first remedy.
- **Online router:** an online session wrapper builds the duel or sector session by `modeId`.
- **Sector smokes:** they use a gated, test-only driver entry.
- **Schemas:** `round` joins through a `ModeWire.events` hook, the closed reason enum is widened, and a sector codec test rejects `round`.
- **Peer loss:** producers get a `pause` hook. Attachments carry an `origin`, and only a remote detach triggers the steward and then `peer-lost`.
- **Round context:** it comes from hashed state. Host records are authoritative.
- **Bless:** the four-step sequence is written out.
- **Acceptance:** the report prints the §16 rule verbatim, both checklists have guest-Helm rounds, and delay is measured to the result or `fireHeld`.
- **Minor:** citations, `DuelViewSource`, Escape on the end card, and the wording of LAN step 3.

Beyond the choices offered, the spec adds the reason `duel-decided`, and an `origin` flag on attachments, because nothing in the code distinguishes the host's own port from a guest's.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md

<!-- end -->
