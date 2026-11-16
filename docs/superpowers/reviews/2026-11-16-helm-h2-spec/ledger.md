# Ledger: helm-h2-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | Rematch as an in-place createDuel reset breaks the tick, checkpoint and init invariants it relies on | fixed:R1 | 0 | hashed round module (round, helmPlayer, baseTick); tick monotone; validateDuelCheckpoint redefined (round seed, ended-only outcome, round-seed grace); schemaVersion 2 list; MIGRATIONS[38]; capture/restore tests |
| R1-F2 | P1 | A decided round leaves commands without results and freezes the tick and the admission budget | fixed:R1 | 0 | end-card ticks advance; non-rematch commands rejected duel-decided, second rematch noop; capture keyed duel:<round>:<decided>; 20-command test |
| R1-F3 | P1 | The design assumes 60 Hz publications, but Net-3 streams ordinary state at 20 Hz to both renderers | fixed:R1 | 0 | kept 20 Hz; alpha over the actual tick gap; budgets restated, thresholds p95 150 ms LAN / 250 ms internet; relaunch-within-gap handled; cadence 1 is H-2c's first remedy with size/bandwidth checks |
| R1-F4 | P1 | The router's online() factory cannot choose duel or sector from the port descriptor | fixed:R1 | 0 | online session wrapper builds duel or sector on first attach by modeId and swaps on mode change; citation onlineSession.ts:85 |
| R1-F5 | P1 | The sector Net-3 Electron smoke drives the menu's sector Host and capacity, which H-2 removes | fixed:R1 | 0 | sector smokes use a test-only driver entry accepted only unpackaged with FTLITE_SECTOR_ONLINE_TEST=1 (same pattern as FTLITE_MODE) |
| R1-F6 | P2 | `round` and `duel-running` widen schemas the sector codec shares | fixed:R1 | 0 | round via ModeWire.events hook; duel-running/duel-decided widen the closed reason enum; sector codec test rejects round |
| R1-F7 | P2 | Nothing is assigned to trigger the peer-lost pause or to detect the loss | fixed:R1 | 0 | producers get pause(reason); attachments carry origin local¦remote; only a remote detach attaches the steward then pauses peer-lost, pinned by a test |
| R1-F8 | P2 | A reconnecting or late client misses round context, and the playtest records depend on it | fixed:R1 | 0 | round context from hashed state; host records authoritative; transport from guest records; reconnect tests |
| R1-F9 | P2 | The SIM 39 bless procedure and the new rematch golden are not specified against the guard | fixed:R1 | 0 | four-step bless sequence written; three duel fields added with aliases; sector unchanged |
| R1-F10 | P2 | Acceptance and fallback criteria do not fully map to Helm §16 or are not measurable as scheduled | fixed:R1 | 0 | report prints the §16 rule verbatim; guest-Helm rounds in both checklists; delay measured to result or fireHeld |
| R1-F11 | P3 | Minor citation and UI-definition gaps | fixed:R1 | 0 | citations fixed; seed and paused() added; Escape defined; LAN step 3 reworded |
