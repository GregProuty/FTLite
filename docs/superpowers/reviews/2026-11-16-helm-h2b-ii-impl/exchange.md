# Codex review exchange: helm-h2b-ii-impl

Subject: `docs/gates.md docs/superpowers/plans/2026-11-16-helm-h2b-ii-internet-candidate.md docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md electron-builder.yml scripts/network/candidate-manifest.ts scripts/network/internet-app-report.ts scripts/network/internet-app-smoke.ts scripts/network/internet-observer-worker.ts scripts/network/online-observer-build.ts tests/internetAppReport.test.ts tests/internetAppSmoke.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing e9877b4, effort high, 371 s, 1811366 in / 1709048 cached / 30426 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The two-machine procedure still pins the Net-3e SIM 35 candidate and revision, so its new guest command cannot run as written
The diff updates only the guest command (L21) and the coordination paragraph (L24). The preparation section still says to use the Net-3e candidate, check out its revision and overlay its driver-source archive. At that revision the smoke has no `--join-code-file` argument. Its manifest reads `sim: 35`. So an owner who follows the document gets `arguments-invalid` on the guest, and any report fails the SIM 39 identity schema. · docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md:L13 ("Use `final-fix-evidence/candidate.json` and a checkout of its revision `65b92a3d…`", overlay `dist/net-3e-final-driver-source.zip`, "all265 entries"), L3 (status links to the Net-3e release candidate), L34 (the 'Ordinary internet' row still says Host/Join/Ready/Start and pause/resume, but the menu's Host now makes only a duel room). New flag: scripts/network/internet-app-smoke.ts:L329 and L338 (the `allowed` list gains `--join-code-file`). Identity: scripts/network/internet-app-report.ts:L189 (`sim:z.literal(SIM_VERSION)`). Plan L889 sends the owner to this prompt 'as Task 3 Step 1 updates it'. · The two-machine runs are owner-only. Run as written, the steps fail, or they test the wrong bytes. Severity rule: 'an owner-only step that cannot be run as written'. · Replace L13 with the H-2b candidate: `dist/h2b-candidate/candidate.json`, its `identity.revision`, and `dist/h2b-candidate.zip`. Either drop the overlay archive or say how to make an H-2b one. Point L3 at the H-2b-ii gates subsection. Rewrite the 'Ordinary internet' row as the two-part duel-then-sector run, matching L24.

### [P2] R1-F2 The owner-only steps in gates.md refer to 'the same command' but never give one
The H-2b-ii subsection lists the owner's deployed and forced-relay runs as 'the same command without `--local-verification`' and 'again with `--force-relay`'. Neither gates.md nor the subsection gives that command, the playtest-report command for the duel records, or the build and package commands. It also does not say to use a new `--report-path` for each run. Rerunning with the same path deletes the earlier run's copied duel records. · docs/gates.md:L791-L795 ("the same command without `--local-verification`"), L780 (the candidate's build, package and manifest are described in prose only). The exact commands exist only in plan L848, L854 and L888, which also says 'Use new `--report-path` values'. The smoke deletes the copies folder: scripts/network/internet-app-smoke.ts:L436 and L472 (`rmSync(copies,{recursive:true,force:true})`). · The gates file is the owner's runbook. Owner-only steps should be exact and runnable in PowerShell 5.1 without opening the plan. · In the subsection, paste the plan's PowerShell block (L824-L834), the manifest command (L843), the local-verification command (L848) and its playtest-report command (L854). Then paste the two deployed commands in full, each with its own `--report-path` (for example `out/h2b-internet/deployed.json` and `out/h2b-internet/relay.json`).

### [P2] R1-F3 A join-code file saved with PowerShell 5.1's `>` or Out-File is UTF-16 and is never accepted
`readCode` decodes the file as UTF-8 and accepts only `/^[0-9A-Z]{8}$/`. In Windows PowerShell 5.1, `'CODE' > file` and `Out-File` write UTF-16LE with a BOM. That decodes to replacement characters and NULs, so the guest polls for 90 s and fails with `driver-timeout`. The procedure gives no way to save the file. The code is also not normalised for the Crockford look-alikes the alphabet leaves out (O, I, L), which an operator can misread off the screen. · scripts/network/internet-app-smoke.ts:L446 (`readFileSync(codeFile,'utf8').trim().toUpperCase().replace(/^ROOM\s+/,'')`, regex `^[0-9A-Z]{8}$`, `CODE_WAIT_MS` 90000 at L321). docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md:L24 ('saves it in `PATH/join-code.txt`', no command given). The alphabet is at src/shared/roomSession.ts:L93 (`[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}`). · The most natural PowerShell 5.1 way to write the file makes the guest's run fail spuriously after a 90 s wait. · Document the exact command: `Set-Content -Path PATH\join-code.txt -Value ABCD1234 -Encoding ASCII`. Also, or instead, make `readCode` decode a UTF-16LE BOM (check for `FF FE` and use `'utf16le'`), and map O→0 and I/L→1 before the regex.

### [P2] R1-F4 The documented steps never produce the SIM 39 localRecovery evidence that internetReady needs
`internetReady` needs the first four gates to PASS, `localRecovery` included. That gate needs a recovery report whose `source.digest` and executable artifacts equal the new candidate's. The only recovery evidence in the repo is Net-3e's, built from the SIM 35 bytes. Neither the gates subsection nor the plan's owner list says to rerun the local recovery smoke on the H-2b candidate. · scripts/network/internet-app-report.ts:L121-L128 (`source.digest!==base.identity.digest||!same(expected,observed)`) and L133 (`internetReady` needs `statuses.slice(0,4)` all PASS). docs/gates.md:L791-L795 and plan L60-L62 and L885-L891 list no recovery run. The only fixture is the Net-3e `recovery-skiff.json` (tests/internetAppReport.test.ts:L3). · Once the owner has done every listed step, the combined readiness report still cannot validate with internetReady true. · Add the recovery smoke on the candidate build to 'Proven before the redeploy' in gates.md, with its command and output path. Also say how its report goes into `localRecovery` (with `runtimeProvenance` if the revisions differ).

### [P2] R1-F5 Several new reject cases do not reach the check they are named for, and the rise checks are untested
'no beam in the duel' sets `beam.guest=0`. The zod `pos` rule rejects that before `checkDuel`'s `beam.guest<=beam.before` comparison runs, so the comparison is never exercised. No case covers the thrust rise (`thrust.host/guest<=before+1`), the device thrust peak, or the device beam. 'a duel candidate field' is rejected by the key scan (`candidates?`) before the strict schema sees the extra key. · tests/internetAppReport.test.ts, diff L631 (`beam.guest=0`) and L635 (`candidate='host'`). scripts/network/internet-app-report.ts:L203 (`beam:…host:pos,guest:pos`), L234 (the semantic rise checks), L241 (device `thrust.peak`, `beam.after`) and L91 (the key scan regex includes `candidates?`). · Brief item 5 asks for each reject case to hit a distinct check. As written, deleting the semantic rise checks in checkDuel and checkDeviceDuel would leave every test green. · Use `beam.before=1` with `beam.guest=1` for the beam case. Add `thrust.guest=thrust.before+1` (local pair), `deviceDuel.thrust.peak=0.5` and `deviceDuel.beam.after=deviceDuel.beam.before` (with before ≥ 1) cases. Name the extra-field case with a key the scan does not catch, for example `extra`.

### [P3] R1-F6 Triage (a) and (b): the seed comparison relies on parseRun; the manifest message and the plan's artifact count are out of date
(a) `a.deviceDuel?.seed!==b.deviceDuel?.seed` would pass if both were undefined. It is safe today only because `checkDeviceDuel` (called from parseRun) rejects a single-device run without `deviceDuel`. (b) The manifest still prints 'exact out bytes', although it now hashes only three folders. The plan still expects 47 artifacts; the brief reports 50. · scripts/network/internet-app-report.ts:L109 and L240 (`if(!d||r.duel)fail()`). scripts/network/candidate-manifest.ts:L170 and L160. Plan L844 ('47 artifacts'). · A later refactor of parseRun could silently let a two-machine bundle with no duel evidence through, and the stale message and count mislead the owner. · Write `!a.deviceDuel||!b.deviceDuel||a.deviceDuel.seed!==b.deviceDuel.seed`. Print 'exact out/main, out/preload and out/renderer bytes' and update plan L844 to match. Drop the fixed artifact count or correct it.

### [P3] R1-F7 Triage (c): a join-code file left behind by a failed run blocks the next run with only a generic message
If the guest fails after its operator saved a code but before `readCode` ran, the file stays on disk. The next guest run then refuses at argument parsing because the file exists, and prints only `internet-driver-arguments-or-report-failed`, with no report. · scripts/network/internet-app-smoke.ts:L338 (`codeFile&&existsSync(codeFile)` throws `arguments-invalid`), L447 (deletes the file only after a successful read), L545 (the generic catch message). The finally block (L209-L221) never touches `codeFile`. · No secret leaks: the operator wrote the file, and room codes are short-lived. But a rerun is confusing, and a stale code stays on disk. · In the finally block, call `if(codeFile)rmSync(codeFile,{force:true})`. Or state in the prompt (L24) that the file must be deleted before a rerun.

### [P3] R1-F8 Triage (e): the `until` predicates dereference the latest publication without null guards
`both()` returns `latest()`, which can be undefined. The `fast`, `fired` and `agreement` predicates read `a.speed`, `a.shots` and `observations.at(-1).publications` directly. A TypeError thrown inside `accept` escapes `until` at once instead of being retried. · scripts/network/internet-app-smoke.ts:L405, L429, L432, L433-L434 and L469. · This fails closed (native-gameplay-failed), so no gate passes wrongly. A transiently empty observation would still fail the run instead of retrying. · Use optional chaining in the predicates (`a?.speed>before+1&&b?.speed>before+1`, `v.observations.at(-1)?.publications??[]`).

## Verified
- Decision 1: both the manifest (candidate-manifest.ts:L144, L166) and the report identity schema (internet-app-report.ts:L180, L189) use `SIM_VERSION`; the test fixture follows it (tests/internetAppReport.test.ts:L4).
- Decision 2: electron-builder.yml:L7-L9 packs out/main, out/preload and out/renderer, and the manifest hashes the same three folders (candidate-manifest.ts:L160). electron.vite.config.ts:L13, L16 and L25 put every main, utility, preload and renderer entry into those default folders, so nothing the app loads at runtime is dropped. extraResources is unchanged.
- Decision 3, the duel pair: it gets its own `directory/duel` and its own duel observer (smoke L415-L416, observer worker L555-L558, online-observer-build.ts:L575-L579); kinds are duel-host/duel-guest (L324), and the sector cleanup lookup by `kind===peer.role` is unchanged (L534). FTLITE_DUEL_TEST_SEED=2277 is set for duel apps and FTLITE_SECTOR_ONLINE_TEST=1 for sector apps, each removing the other (L374-L375). X then E after an applied result (L407-L408), Return (L425), W for 2 s and Space for 4.5 s (L428, L431), rise on both screens and a common publication hash (L429-L434), sampled round-0 records copied to `<report>-duel-records/{host,guest}` (L435-L437), then shutdown with cleanup recorded (L438-L441).
- Decision 3, the sector pair and two machines: the sector pair uses host-sector/join-sector (L514-L515). In the manual path `--join-code-file` is required for the guest, refused for the host and must not exist at start (L338). The capture is 30-180 s from the sector run's start (L342, L508). The budget is 600 s manual and 180 s local (L346).
- Decision 4: checkDuel and checkDeviceDuel (internet-app-report.ts:L230-L243) require `duel` xor `deviceDuel` by mode, the own-seat record, held+command>0, host loopback, a guest RTT reading lan/internet (internet under forceRelay), rise checks and balanced cleanup. Duel pids join the uniqueness set (L248-L249). Two-machine seeds must match (L109).
- No secrets reach stdout, logs or reports. The room code stays in memory and is passed to the driver over IPC (L420, L459, L503). The driver logs only command names (online-app-smoke.cjs:L251-L255), and child stdout and stderr are discarded (smoke L352, L377). The copied playtest records hold no code, address or candidate (src/renderer/src/net/duelRecord.ts:L13-L17, L35-L39). A grep of out/h2b-internet/ for joinCode, code, address, candidate and token found nothing.
- Forced relay reaches the duel apps as well: launch passes `--internet-force-relay` for every kind (smoke L378), and the driver applies it to the hidden transport window (online-app-smoke.cjs:L135). Any relay pair is labelled 'internet' (src/network/rtc/route.ts:L27), so the guest-internet-under-relay rule is reachable.
- Triage (d) resolved: the local verification run took elapsedMs 53971 of a 180000 budget, duel half included (out/h2b-internet/local.json:L85-L86). Its duel records read host loopback and guest lan (L4618 and L4626).
- Triage (f): the 20 s wait (smoke L469) covers the other machine's action. The host thrusts 1.5-3.5 s into round 2 (L468); the guest's beam comes about 4.5 s into round 2. Both are well inside 20 s of each machine's own action.
- The join-code regex matches the app's 8-character room code alphabet (src/shared/roomSession.ts:L93; it is a subset of `[0-9A-Z]{8}`).
- The plan's packaging block quotes both `-c.` arguments for PowerShell 5.1 (plan diff L63-L64).

## Not verified
- Whether `npm run <script> -- --flag=…` keeps the `--` under Windows PowerShell 5.1 when npm resolves to npm.ps1: this depends on the installed npm version, and I could not run it.
- Whether a deployed, non-relay local pair can pick a remote prflx pair whose hidden address makes route.ts return null (src/network/rtc/route.ts:L29-L32, `direct` false with STUN/TURN configured). The guest record would then read `transport: null` and fail checkRecord spuriously. The local verification ran with no ICE servers, so it did not exercise this.
- Whether Windows foreground-lock rules stop the guest harness's `visible.focus()` (online-app-smoke.cjs:L202) after the operator has used Notepad, and whether an unfocused duel window still accepts the synthetic held keys for the full hold.
- That electron-builder still adds package.json and the production node_modules under the narrowed `files` list. I relied on the brief's audit (50 artifacts, package built) rather than inspecting app.asar.
- Whether computeContentDigest really differs between the Net-3e and SIM 39 builds (the localRecovery finding assumes it does; the executable-artifact equality alone already requires a new recovery report). I read electron.vite.config.ts, route.ts, duelRecord.ts, roomSession.ts, online-app-smoke.cjs and out/h2b-internet/local.json beyond the reading manifest, to check runtime loading, relay labelling, record contents and the code format.
- None of the tests, the typecheck or the native smokes were run (read-only review).

---

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

---

# Round 2 (delta, reviewing b396948, effort medium, 54 s, 176227 in / 134139 cached / 4438 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — The procedure now uses dist/h2b-candidate.zip, dist/h2b-candidate/candidate.json, its identity.revision (git checkout $m.identity.revision) and a new dist/h2b-source.zip made by gates step 4 (prompt L13-L24, gates L784-L807). The status line points at the H-2b-ii gates subsection (prompt L3). The 'Ordinary internet' row is now the duel-then-sector run with its own report paths (prompt L74). The `npx asar extract` in step 3 resolves to the locked devDependency @electron/asar, whose bin is `asar` (package-lock.json:L346-L358).
- R1-F2: resolved — gates L784-L841 now give the exact build/package block, the manifest, the source archive, the local verification and its playtest-report command, the recovery smoke, and both deployed commands. Each deployed command has its own --report-path (deployed.json, relay.json). L810 says to use a new report path for every run.
- R1-F3: resolved — join-code-file.ts:L6-L11 reads UTF-16LE with a BOM and UTF-8 with or without a BOM. It strips a leading ROOM before mapping O to 0 and I/L to 1, then checks the exact roomSession alphabet. The smoke uses it (internet-app-smoke.ts:L136). Set-Content -Encoding ASCII is documented (prompt L62, gates L811). Tests cover each encoding, the look-alikes and the reject cases (tests/internetAppSmoke.test.ts:L43-L54). The parent folder out/h2b-two-machine exists before the operator saves the file, because the smoke creates the report's folder at L40.
- R1-F4: resolved — gates L822-L829 document the recovery smoke on the candidate build via npx tsx, so out/ is not rebuilt (package.json:L18 shows that the npm script would rebuild it). The script accepts --scenario and --report-path (online-recovery-smoke.ts:L18, L26). The described localRecovery shape matches the validator: {status, evidence, report, optional runtimeProvenance{reportRevision, candidateRevision, executableArtifacts}} (internet-app-report.ts:L117-L128). Plan Decision 5 records it (plan L61).
- R1-F5: resolved — The beam case now uses before=1, host=2, guest=1, which passes the pos schema and reaches the semantic comparison. New cases cover the guest thrust rise (thrust.guest=before+1), the device thrust peak (0.5) and the device beam (before=after=1). The extra-field case uses the key `extra`, which the key scan regex does not catch (internet-app-report.ts:L91), so the strict schema rejects it (tests/internetAppReport.test.ts:L53-L64).
- R1-F6: resolved — The seed guard now requires both deviceDuels (internet-app-report.ts:L109). The manifest message names the three folders (candidate-manifest.ts:L33). Plan L844 drops the fixed count of 47 and notes 50 at H-2b-ii.
- R1-F7: resolved — The finally block removes codeFile (internet-app-smoke.ts:L213). The existing-file refusal (L33) runs before the guarded run, so an operator's pre-existing file is not silently deleted by an argument failure. The procedure states the cleanup (prompt L64).
- R1-F8: resolved — The until predicates use a?.speed, a?.shots and observations.at(-1)?.publications??[] (internet-app-smoke.ts:L119, L122-L124, L159). The post-wait read at L160 reads from the already-accepted `seen`, so it is non-null.

## Verified
- The report's folder is created before the duel starts (internet-app-smoke.ts:L40), so the documented Set-Content into out/h2b-two-machine/ has an existing parent.
- test:internet-app-runtime does not rebuild out/ (package.json:L20), which matches the gates note that only the other runtime scripts rebuild it.
- localRecovery's runtimeProvenance requirement and the digest/executable-artifact equality match the gates text (internet-app-report.ts:L121-L128 vs gates L829).
- join-code-file.ts strips ROOM before replacing O, so 'ROOM' is not corrupted to 'R00M' before the prefix strip.
- No room code is printed: the console lines at internet-app-smoke.ts:L149 and L191 print only the file path.

## Not verified
- That repeating the origin build (gates L807) reproduces byte-identical out/ files matching the manifest. This depends on electron-vite build reproducibility; I did not run it.
- That the documented playtest-report output line '| seed-2277 | lan | 0 | 1 | 1 |' matches actual output. I did not run the scripts.
- That the source-ancestry check in the launcher tolerates the working-tree changes the tar overlay introduces on a fresh checkout. This is unchanged from the Net-3e procedure and outside this delta.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. Verdict ready, no new findings; R1-F1 to R1-F8 confirmed resolved.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

