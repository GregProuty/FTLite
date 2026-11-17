# Round 1 response (implementation revised, d26606b)

Reviewed `round-1.json`. 8 accepted, 0 rejected, 0 deferred. The prepared diff is regenerated for 69c2e06..HEAD. Verified after the fixes: typecheck; the three internet test files (111 tests); the candidate rebuilt (worker dry run, origin build, package with quoted `-c.` arguments, manifest audit PASS: sim 39, 50 artifacts); a new operator source archive `dist/h2b-source.zip` whose hashes match the manifest; the local recovery smoke on the candidate PASS (digest equal to the manifest's); the local verification PASS (52.4 s) and its playtest report; no codes, tokens, candidates or addresses in the new reports. Full suite: 280 files; the load-flaky sim files (run, snapshot, director) failed with 20 other node/electron processes running and pass alone (52, 49, 35).

## R1-F1 [P1]: The two-machine procedure still pins the Net-3e SIM 35 candidate

Confirmed. The procedure now uses `dist/h2b-candidate/candidate.json`, its `identity.revision`, `dist/h2b-candidate.zip`, and a new `dist/h2b-source.zip` (made with Windows `tar.exe` in the gates build commands) so the source checks pass whatever each PC's line-ending setting; its status line points at the H-2b-ii gates subsection; the 'Ordinary internet' row is the duel-then-sector run; concrete paths (`out/h2b-two-machine/device-a.json`, `device-b.json`, `join-code.txt`).

## R1-F2 [P2]: The owner-only steps in gates.md refer to 'the same command' but never give one

Confirmed. The subsection lists the exact PowerShell commands (build and package, manifest, source archive, local verification and its report, recovery, and both deployed runs with distinct `--report-path` values), says to use a new report path per run, and says smoke duel records are not playtest input.

## R1-F3 [P2]: A join-code file saved with PowerShell 5.1's > is UTF-16

Confirmed. `scripts/network/join-code-file.ts` reads a UTF-16LE BOM file and maps O→0 and I/L→1 against the app's exact alphabet (U is still refused); `Set-Content -Encoding ASCII` is documented. Tests added.

## R1-F4 [P2]: The documented steps never produce the SIM 39 localRecovery evidence

Confirmed. The recovery smoke on the candidate is documented (run with `npx tsx` so the origin build is kept) and was run: `ACTUAL APPLICATION RECOVERY PASS skiff`, revision and digest equal to the manifest's, admitted as `localRecovery` in a scratch validation.

## R1-F5 [P2]: Several new reject cases do not reach the check they are named for

Confirmed. Beam (before 1, host 2, guest 1), the local thrust rise, the device thrust peak, the device beam and an `extra` key each reach their check; each fails when its check is removed.

## R1-F6 [P3]: Seed guard, manifest message and artifact count

Confirmed. Both `deviceDuel`s are required for the seed comparison; the manifest prints the three folders; the plan's count reads 50.

## R1-F7 [P3]: A join-code file left behind blocks the next run

Confirmed. The smoke's `finally` removes the code file; the procedure says so.

## R1-F8 [P3]: The until predicates dereference without null guards

Confirmed. Optional chaining in the predicates.

## Also changed

- (nothing)

## Files changed

- docs/gates.md
- docs/superpowers/plans/2026-11-16-helm-h2b-ii-internet-candidate.md
- docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md
- scripts/network/candidate-manifest.ts
- scripts/network/internet-app-report.ts
- scripts/network/internet-app-smoke.ts
- scripts/network/join-code-file.ts
- tests/internetAppReport.test.ts
- tests/internetAppSmoke.test.ts

<!-- end -->
