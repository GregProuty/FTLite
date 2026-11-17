# Round 1 response (plan revised)

Reviewed `round-1.json` against `f81d9b1`. 4 accepted, 0 rejected, 0 deferred. Every `replace:` block was applied in order to copies of the sources (the `docs/gates.md` anchor exists only after plan i); typecheck clean; `internetAppReport` 78/78 and `internetAppSmoke` 7/7 in a scratch copy. The native two-machine path and the changed `duelRun` are written against the source but not re-run in the prototype; the plan says so.

## R1-F1 [P1]: Single-device (two-machine) mode still runs a sector capture from the ordinary menu

Confirmed (`HostForm.tsx` hosts only a duel). With `--role=host|guest`, each machine first plays its half of a duel through the real menu, then its half of the sector through `host-sector`/`join-sector` with `FTLITE_SECTOR_ONLINE_TEST=1`. The host's lobby shows the code on screen; the guest reads it from a new `--join-code-file` (required for the guest, refused for the host, must not exist at start, deleted after reading); the code is never printed, logged or reported. `--capture-after-ms` counts from the sector start (30-180 s); the manual budget is 600 s. The report gains a `deviceDuel` shape (single-device runs carry it, local pairs carry `duel`), its process id joins the uniqueness check, and the two machines' duel seeds must match. No two-machine duel hash check (independent 256-publication windows may not overlap); the local pair proves the duel's agreement. The Net-3e two-machine prompt, console text and Decisions 3-4 are updated; 4 report rejections and 2 argument tests added.

## R1-F2 [P2]: The duel records handed to the report come from a round with no input

Confirmed. Both players press X, wait for the applied result, then E in round 1; the record wait and `checkDuel` require `held + command > 0`; a 'no latency samples' rejection test is added.

## R1-F3 [P3]: The online-observer-build.ts replace anchor is a lone }

Confirmed. Anchored on the file's last two lines.

## R1-F4 [P3]: The gates subsection states the smoke's pair order backwards

Confirmed. Duel pair first, then the sector pair; a two-machine bullet is added.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2b-ii-internet-candidate.md

<!-- end -->
