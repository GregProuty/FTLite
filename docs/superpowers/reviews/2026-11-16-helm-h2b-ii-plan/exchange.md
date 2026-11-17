# Codex review exchange: helm-h2b-ii-plan

Subject: `docs/superpowers/plans/2026-11-16-helm-h2b-ii-internet-candidate.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 9c6d1e1, effort high, 433 s, 3403021 in / 3273394 cached / 37152 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Single-device (two-machine) mode still runs a sector capture from the ordinary menu, which now hosts only a duel
Task 2 moves only the local pair's sector run onto `host-sector`/`join-sector`. The manual `--role=host|guest` path is unchanged. It still tells the humans to 'Use ordinary Host/Join/Ready/Start' and then captures sector evidence with the sector observer and the utility proofs. But Host in the menu now creates a two-seat duel room, and the menu has no sector entry, so the owner-only two-machine runs the plan lists cannot produce valid evidence. The duel observer is never built for this path, and the report forbids `duel` on a single-device run. So `twoMachineGameplay` cannot pass and `internetReady` can never be true for this candidate. · plan L98 (Task 2 leaves `scripts/network/internet-app-smoke.ts:97-100` unchanged: `launch(role)` then `console.log('Use ordinary Host/Join/Ready/Start...')`, `capture(app)`); plan L95/L511 (the manual path gets only the sector observer from `internet-observer-worker.ts` with no `duel` argument); `src/renderer/src/ui/menu/HostForm.tsx:6,13` ('Host creates a two-seat duel room', `actions.host()`); `scripts/network/duel-app-smoke.ts:82` (menu host gives `modeId === 'duel'`); plan L267 (`else if(r.duel)fail()` for single-device); plan L631 and L707 (the owner's two-machine single-device runs per `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md:34`, 'Host/Join/Ready/Start'); `internet-app-report.ts:100` (internetReady needs twoMachineGameplay PASS); spec L420 (the manifest 'keeps its sector run through the same entry'). · The release path (Net-3e release doc L49: after deployment, run the two-machine procedure) is broken for the owner, and they would find out only after the redeploy. Spec §10 requires the sector run to survive through the test-only entry, and the manual sector run does not. · Make the manual path use the test-only entry. With `--role=host`, the driver sends `host-sector {capacity:2}`, and the code is shown only in the app's lobby, never logged. With `--role=guest`, add an argument that is not a credential (for example, read the code from a file the operator creates, or prompt on stdin with no echo to the log), then send `join-sector`. Update the console text and the two-machine prompt to match. Or state the deviation explicitly: either replace the two-machine sector gate with a single-device duel run (and admit `duel` in single-device reports), or mark twoMachineGameplay as deferred, and say what that does to `internetReady`.

### [P2] R1-F2 The duel records handed to the report come from a round with no input, so they may carry no latency samples
Round 1 of the internet duel run is the forced end, with no keys pressed, and only round 1's record is copied and checked. Round 2, which has the thrust and the shot, is never decided, so it writes no record. The duel smoke deliberately stands up and sits down (X, E) in round 1 so that both records get command samples, and plan i asserts `held.count + command.count > 0`. Plan ii's `checkDuel` accepts `held: 0, command: 0`. The internet path is H-2b's latency measurement, but its records can legitimately show empty figures and still pass. · plan L53 ('Round 1 is the forced end, with nobody flying or firing'); plan L205 (`held:nat,command:nat`); plan L233-L239 (no count check); `scripts/network/duel-app-smoke.ts:95-101,113` (X/E 'so ... both records get command samples', `latency.held.count + latency.command.count > 0`); plan i L1905; spec L441 (H-2b: 'latency', 'The report script runs on the smoke's records'). · The report then runs on records that may have no held or command samples over the deployed and relay links, so the latency table for the internet path proves nothing about latency. · In `duelRun`, before waiting for the decision, press X then E on each machine (after waiting for the applied stand-up result), as the duel smoke does. Then require `h.command+h.held>0 && g.command+g.held>0` in `checkDuel`, and add a 'no latency samples' rejection test.

### [P3] R1-F3 The `online-observer-build.ts` replace anchor is a lone `}`
The replace block is the single line `}`. It is unique only as a whole line at the end of the file (L9). As a substring, `}` occurs many times in L5-L8. An executor using string-match edits will hit an ambiguous match or need to improvise context. · plan L379-L381; `scripts/network/online-observer-build.ts:5-9`. · The plan promises verbatim execution with each `replace:` occurring exactly once; this anchor relies on line semantics. · Anchor on the last two lines (`    build:{outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',...}});` plus `}`), or say 'append at the end of the file'.

### [P3] R1-F4 The gates subsection states the smoke's pair order backwards
The `docs/gates.md` text says the smoke 'runs its sector pair ... It then runs a duel pair'. The code and Decision 3 run the duel pair first. · plan L622 vs plan L50, L559 (`duel=await duelRun();` before the sector `launch`). · The owner reads gates.md to interpret failures and timings. · Reword it: 'It first runs a duel pair through the real menu ..., then its sector pair through the test-only sector entry.'

## Verified
- Every `replace:` block in `internet-app-report.ts` (plan L163, L178, L194, L216, L251) matches `scripts/network/internet-app-report.ts` L4-5, L11-13, L20-22, L34-39 and L45-51 exactly once.
- Every `replace:` block in `internet-app-smoke.ts` (plan L409, L425, L445, L461, L549, L568) matches `scripts/network/internet-app-smoke.ts` L2-4, L13-16, L29-31, L44-55, L101-104 and L127-129 exactly once.
- The `candidate-manifest.ts` blocks (plan L274, L289, L306) match L8-9, L21-23 and L26-28; the `electron-builder.yml` block (plan L322) matches L5-7; the test blocks (plan L90, L111, L130) match `tests/internetAppReport.test.ts` L3-7, L12-14 and L42-45.
- `SIM_VERSION = 39` is exported from `src/renderer/src/sim/tuning.ts:7`, which has no imports; `z.literal(SIM_VERSION)` gets the literal type 39. scripts/ and tests/ are in `tsconfig.web.json:10`, so typecheck covers them.
- `checkDuel` uses `d!` because `const fail=():never` has no explicit type annotation and so does not narrow; the plan handles this correctly.
- Test count: the existing file has 63 tests (2 + 25 rejects + 10 + 3 + 2 + 2 + 1 + 4 + 1 + 3 + 1 + 1 + 3 + 1 + 4); the plan adds 9 rejects and 1 `it`, giving 73 as stated.
- Each new rejection test fails for the intended reason against the new validator: delete duel, lan under forceRelay, rttMs null, host off loopback, `beam.guest=0` (pos), utilityExits, pid 100 colliding with `peer(0)`, duel on single-device, and the `candidate` key (strict schema and scan). The LAN-admit test passes once forceRelay is false and the routes are host/host/all.
- `validateOnlineRecoveryReport` has no sim check (`online-recovery-report.ts` has no match for sim/35), so the localRecovery fixture is unaffected by sim 39.
- Driver requests used by `duelRun` exist in `scripts/network/online-app-smoke.cjs`: open-multiplayer (L191), click, type, key (L202), host-sector/join-sector (L194-197) and shutdown (L219-243). The shutdown result fields match the report's `cleanup` schema (`internet-app-report.ts:16`).
- `duel-app-observer.ts:52-54` publishes round, outcome, seed, tick, speed, shots, hash and sequence, as `duelRun` reads them; `buildDuelObservers` reproduces `duel-app-smoke.ts:73-76` exactly.
- The driver profile check (`online-app-smoke.cjs:13-14`) accepts `--online-app-dir=<dir>/duel` with `--user-data-dir=<dir>/duel/<role>`. The duel kinds keep the sector `owned.find(p=>p.kind===peer.role)` lookup (smoke L125-126) unchanged.
- `FTLITE_DUEL_TEST_SEED` and `FTLITE_SECTOR_ONLINE_TEST` are honoured only unpackaged (`src/main/index.ts:44-45`); the driver always runs the unpackaged `out/main/index.js` (`online-app-smoke.cjs:256`).
- Plan i interfaces: records at `userData/playtest/duel-YYYY-MM-DD.jsonl` (plan i L1838); `latency.rttMs`, `latency.held.count` and `latency.command.count` (plan i L986, L1168); host `loopback` with RTT (Decision 3); relay gives `internet` and two host candidates give `lan` (Decision 1). The `| none yet | | | | | | | |` anchor occurs once (plan i L1853) and is inserted after `docs/gates.md:747`, the current last line.
- Packaging: electron-vite outputs only out/main, out/preload and out/renderer (`electron.vite.config.ts:10-26`), with public/ assets copied into out/renderer; package.json `main` is `./out/main/index.js`; THIRD_PARTY_NOTICES goes through extraResources. Every `INTERNET_ARTIFACTS` path is in those three folders, so nothing the app needs at runtime is dropped.
- No deploy: `build:signalling` is `wrangler deploy --dry-run --outdir dist` (`services/signalling/package.json:9`); electron-builder runs with `--dir --publish never`; `test:internet-app-runtime` does not rebuild (`package.json:20`); no step reads .env or passes credentials; the embedded origin is the public workers.dev URL already in `candidate-manifest.ts:15`.
- The duel records copied beside the report keep only role, round, transport, rttMs and counts; the join code is used in memory and never written to the report.

## Not verified
- Whether `nativePeersObserved` (schema `pos`) is reliably non-zero for the duel apps: unlike the sector `capture()`, `duelRun` never sends `resources` before shutdown, so it depends on the 250 ms shutdown snapshot (`online-app-smoke.cjs:225-226`) while both apps shut down concurrently. I could not test this without running the smoke.
- Whether held-input frames are sent with no keys pressed, which decides whether round-1 records have `held.count > 0` (this bears on the P2 finding).
- The expected counts and outputs I could not run: 90 tests in 3 files, 265 files and 3,871 tests, 47 artifacts, the ~55 s timing, and the playtest report line `| seed-2277 | lan | 0 | 1 | 1 |` (the test suite was not run, per the constraints).
- Whether the owner path needs a fresh SIM 39 local recovery report (`localRecovery` binds `source.digest` to the candidate digest, `internet-app-report.ts:88-91`) and an assembled internet-app report. The plan's 'After H-2b-ii' does not mention either; I did not read the Net-3e release document's deployment section in full.
- Windows PID reuse between the sequential duel and sector pairs, which the new distinct-pid check (plan L243-L244) would turn into an intermittent invalid report; this was not assessed beyond the existing preparation-pid precedent.
- I read beyond the manifest only to confirm findings: `HostForm.tsx`, `duel-app-smoke.ts`, `duel-app-observer.ts`, `online-app-smoke.cjs`, `online-app-runtime.ts`, `electron.vite.config.ts`, `src/main/index.ts` (grep only) and the Net-3e two-machine prompt (grep only).

---

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

---

# Round 2 (delta, reviewing cfeaf8c, effort medium, 150 s, 376709 in / 309523 cached / 11651 out)

Verdict: ready

## Findings

### [P3] R2-F1 The 'device duel record from the other seat' rejection passes even without the role check
The mutation sets `role='guest'` on device-0's host record. That record keeps `transport:'loopback'`. Under `forceRelay:true`, `checkRecord` already rejects a guest record that is not `internet`. So the case still throws if `checkDeviceDuel`'s `d.record.role!==r.peers[0].role` comparison is deleted, and the seat-matching check has no test of its own. · plan L154 (mutation on `twoMachineGameplay.reports[0].deviceDuel.record.role='guest'`); plan L124 (the seat-0 record is `transport:'loopback'`); plan L244-L245 (`checkRecord`: a guest needs `transport==='internet'` under forced relay); plan L258-L262 (`checkDeviceDuel` role check); fixture `forceRelay:true` plan L125. · This test is meant to prove that a single-device report carries its own seat's record. As written, it would still pass if that check regressed. · Give the mutation a fully valid guest record, so only the seat mismatch can fail: `r.twoMachineGameplay.reports[0].deviceDuel.record={role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}`.

## Prior findings
- R1-F1: resolved — `--role` now runs `deviceDuelRun` through the real menu. The duel uses the duel observer and `FTLITE_DUEL_TEST_SEED`. The sector half follows via `host-sector`/`join-sector`, with `FTLITE_SECTOR_ONLINE_TEST=1` from `launch` (plan L629-L652, L668-L681, L558). The guest reads the code from `--join-code-file`, which is required for the guest, refused for the host, refused if it already exists, and deleted after reading (plan L506-L507, L621-L624). The code is never logged; only the file path is printed. The report admits `deviceDuel` only on single-device runs (plan L258-L262, L289), and the pair's seeds must match. That anchor occurs once at `internet-app-report.ts:L76` (plan L293-L304). The prompt anchors occur once each in `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md` (L21 'device-b' line; L24 sentence) (plan L791-L815). The 600 s manual budget equals the schema max `pos.max(600000)`. `twoMachineGameplay` is now achievable.
- R1-F2: resolved — `standUp` presses X, waits for the applied result `x.id.player===seat&&x.id.sequence>1`, then presses E. This is the same condition as `duel-app-smoke.ts:L97-L101` (plan L583-L584, L599, L639). The record wait and selection use `sampled` (`held.count+command.count>0`) (plan L587, L611, L616, L647, L651). `checkRecord` rejects `held+command<=0` (plan L244). A 'no latency samples' rejection test was added (plan L153).
- R1-F3: resolved — The replace anchor is now the file's last two lines, starting with the unique `build:{outDir:join(directory,'observer'),...utility.cjs...}` line (plan L412-L416). The `with:` block repeats it before appending.
- R1-F4: resolved — The gates text now says the smoke 'first runs a duel pair through the real menu' and 'then runs its sector pair through the test-only sector entry' (plan L777-L782). This matches `duel=await duelRun();` before the sector launch (plan L696-L697) and Decision 3.

## Verified
- Each new `internet-app-smoke.ts` anchor occurs exactly once in the current file: the `allowed` list at L19, the role/captureAfter lines at L25-L27, the budget lines at L29-L31, and the manual block at L97-L100.
- The `tests/internetAppSmoke.test.ts` anchor `},12000);` occurs once (L35). The new tests' imports (`spawn`, `mkdtempSync`, `existsSync`, `rmSync`, `tmpdir`, `join`, `resolve`, `sep`, `createLauncherDeadline`, `stopOwnedProcess`) already exist at L1-L9.
- The argument refusals throw before `mkdirSync(dirname(reportPath))` and before any report write. `main().catch` sets exit code 1 (internet-app-smoke.ts L25-L31, L135), so both new tests expect exit 1 and no report, which is correct.
- The room code shown is `ROOM ${joinCode}` (`SessionPage.tsx:L30`), and joinCode is 8 Crockford characters (`roomSession.ts:L93`). `readCode` strips the `ROOM ` prefix, upper-cases the code and accepts 8 alphanumerics (plan L622).
- The single-device report's peer role comes from `capture` (`role:p.kind`, internet-app-smoke.ts L73), which is 'host' or 'guest'. That matches the role the `checkDeviceDuel` comparison expects. The peer cleanup lookup (L125) is unaffected because the duel kinds are distinct.
- The test counts add up. Report tests: 73+5=78. Smoke tests: 5+2=7. Full suite: 3,871+7=3,878 (plan L376, L739, L869).
- The fixture's `run(1)` now carries a guest `deviceDuel` with `transport:'internet'` under forced relay. 'admits a single device...' (plan L159) therefore still holds. The existing 'a duel run on a single device' case is still rejected via `checkDeviceDuel`'s `r.duel` check.

## Not verified
- Cross-machine timing in `deviceDuelRun`. Nothing makes the host wait until the guest has seen the beam before the host shuts down (plan L645-L649). Publications already sent should still arrive, but a late guest observation under shaped high RTT was not proven either way. This was not run because it needs two machines.
- The driver commands `host-sector`/`join-sector {code}` were taken from round 1's accepted local-pair change. I did not re-read `online-app-smoke.cjs`.
- The plan says the review-round-1 code was written but not re-run in the prototype (plan L42). I ran neither the tests nor the typecheck, per the constraints.
- Whether the 90 s `CODE_WAIT_MS` windows leave enough time for operators to pass codes between machines in practice.

---

# Round 2 response (plan revised)

Reviewed `round-2.json`. Verdict ready; R1-F1 to R1-F4 confirmed resolved; 1 accepted.

## R2-F1 [P3]: The device duel record from the other seat rejection passes even without the role check

Confirmed (under `forceRelay` a loopback guest record is already rejected). The mutation now installs a fully valid guest record (`transport: internet`, RTT and samples), so only the seat check can reject it.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2b-ii-internet-candidate.md

<!-- end -->

---

