# Net-3e two-machine playtest

Status: **NOT RUN**. Since H-2b-ii this procedure runs the SIM 39 H-2b candidate; the build, the gates proven before the redeploy and the owner's deployed runs are in [the H-2b-ii gates subsection](../../gates.md#the-internet-candidate-for-sim-39-h-2b-ii). Perform external steps only after the signalling redeploy is authorized and done (the deployed service was SIM 35 and refuses a SIM 39 room). A local pair, TURN HTTP 201, or open data channel does not prove this gate. Every command below is for Windows PowerShell 5.1, run in the source checkout's root folder unless it says otherwise.

## Prepare the two devices

Use two physical Windows x64 computers on different networks (for example, one home broadband connection and one mobile hotspot). Supply distinct nonsecret machine/network labels and operator labels. Do not record IP addresses, SSIDs, addresses, tokens, credentials, SDP or ICE candidate strings. Labels and signed-off operator statements are human attestation; the software cannot cryptographically prove physical separation.

From the build machine copy the same three files to both machines: the candidate ZIP `dist/h2b-candidate.zip`, its manifest `dist/h2b-candidate/candidate.json`, and the operator source archive `dist/h2b-source.zip` (made by the gates subsection's build steps). None of them is committed (`dist/` is ignored). The candidate is unsigned. The source archive holds exactly the files the manifest's `sourceFiles` lists (src, scripts, build, the package and lock files and the build configs) with the build machine's bytes, so the launcher's source checks pass whatever each machine's Git line-ending setting. It holds no profiles, secrets, evidence or installed dependencies and is not part of the player package.

On each machine:

1. Clone the repository. Put the three copied files at the same paths inside the checkout (`dist\h2b-candidate.zip`, `dist\h2b-candidate\candidate.json`, `dist\h2b-source.zip`), so the manifest's `packagePath` (`dist/h2b-candidate.zip`) resolves unchanged. Then check out the manifest's revision, overlay the source archive and install the pinned dependencies with the two existing lockfiles (do not install newer Electron or Wrangler versions):

   ```powershell
   $m = Get-Content dist\h2b-candidate\candidate.json -Raw | ConvertFrom-Json
   git checkout $m.identity.revision
   & "$env:SystemRoot\System32\tar.exe" -x -f dist\h2b-source.zip
   npm ci
   npm ci --prefix services/signalling
   ```

2. Verify the ZIP, unpack it to a folder outside the checkout, and verify the executable and app.asar. Each comparison must print `True`:

   ```powershell
   (Get-FileHash dist\h2b-candidate.zip -Algorithm SHA256).Hash.ToLower() -eq $m.identity.packageSha256
   Expand-Archive -Path dist\h2b-candidate.zip -DestinationPath C:\FTLite-h2b -Force
   (Get-FileHash C:\FTLite-h2b\FTLite.exe -Algorithm SHA256).Hash.ToLower() -eq $m.package.executableSha256
   (Get-FileHash C:\FTLite-h2b\resources\app.asar -Algorithm SHA256).Hash.ToLower() -eq $m.package.asarSha256
   ```

3. Copy the identical packaged `out` files from app.asar into the checkout's `out` folder:

   ```powershell
   npx asar extract C:\FTLite-h2b\resources\app.asar C:\FTLite-h2b-app
   New-Item -ItemType Directory -Force out | Out-Null
   Copy-Item -Recurse -Force C:\FTLite-h2b-app\out\* out\
   ```

Launch `C:\FTLite-h2b\FTLite.exe` normally once for the ordinary packaged check (Multiplayer, Host on one machine and Join on the other). The launcher compares every `out/main`, `out/preload` and `out/renderer` byte and the ZIP against the manifest before starting the actual compiled application. It also verifies the recorded source files and source ancestry, so a checkout without the overlay fails with `preparation-failed`. It adds test-only native observation/relay selection; neither switch exists in the player UI or renderer IPC. The launcher verifies canonical identity/manifest/requested origin equality against compiled main before starting native work; do not edit either origin field. Do not run `npm run build` or any `test:*-runtime` script other than `test:internet-app-runtime` in this checkout afterwards: they rebuild `out/` without the origin (repeat step 3 if one did).

## Capture each independent result

After the redeploy and the ordinary packaged check, run one command on each machine. No credentials are accepted on the CLI. Use a new `--report-path` for every run: a rerun with the same path replaces the earlier run's copied duel records.

Device A (host):

```powershell
npm run test:internet-app-runtime -- --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --force-relay --role=host --machine-label=device-a --network-label=network-a --capture-after-ms=180000 --candidate-manifest=dist/h2b-candidate/candidate.json --report-path=out/h2b-two-machine/device-a.json
```

Device B (guest):

```powershell
npm run test:internet-app-runtime -- --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --force-relay --role=guest --machine-label=device-b --network-label=network-b --capture-after-ms=180000 --join-code-file=out/h2b-two-machine/join-code.txt --candidate-manifest=dist/h2b-candidate/candidate.json --report-path=out/h2b-two-machine/device-b.json
```

Coordinate starts. Since H-2b-ii each machine runs two parts, and `out/h2b-two-machine/join-code.txt` must not exist when the guest starts. First the duel, through the ordinary menu, driven by the harness: keep off the keyboard. The host's lobby shows `ROOM` and a code; its operator passes the code to the guest's operator, who saves it from a second PowerShell window in the checkout folder (`ABCD1234` stands for the code on the host's screen):

```powershell
Set-Content -Path out\h2b-two-machine\join-code.txt -Value ABCD1234 -Encoding ASCII
```

The guest reads the file and deletes it; no code is printed, logged or reported. It also accepts a file saved with `>` or `Out-File` (UTF-16), lower case, a leading `ROOM `, and O for 0 and I or L for 1 (the code alphabet has no O, I, L or U). The harness readies both, starts, plays the test seed's forced first round and a second round (the host thrusts, the guest fires), and closes the app. Then the sector, through the test-only sector entry: the host's new lobby shows a new code, saved with the same command. Once the sector run starts, both humans move and issue a gameplay command; both pause and explicitly resume at least once. End paused before the three-minute capture (`--capture-after-ms` counts from the start of the sector run). Do not Leave until capture: the harness obtains screenshots, the latest committed receipt, bounded actual publication/input/result observations, selected native route types, and then requests graceful shutdown. When the guest run ends, pass or fail, it removes the code file again, so a rerun starts without it. Each host/guest result must independently exit 0, contain no failure, and show exact process/window/port/listener/utility/native-peer cleanup. Different source/package/runtime identities reject the combined bundle. The common publication must match runId, sequence, tick, canonical hash and both command/held watermark arrays; generations and committed checkpoint sequence/hash must also agree. Each accepted command must match an observed owned-seat input and appear in the common publication's command watermark. Both selected candidate types must be `relay` with native policy `relay` and observed data in both directions. Each machine's duel record is copied to `out/h2b-two-machine/device-a-duel-records/host/` or `out/h2b-two-machine/device-b-duel-records/guest/`. These are test-seed records: never feed them to the real playtest report or count them in the §16 sessions.

If capture fails, retain the failed report and its fixed diagnostic. Do not edit PASS into the file. Rerun only after resolving the failure; preserve earlier evidence. Long gameplay can rotate bounded observer history; issue fresh commands on both devices shortly before the final pause so their results and common publications are retained.

## Scenario matrix

Retain a separate run/report pair and screenshots for each condition, labelled with the exact method and settings. Reuse the same candidate bytes. A failure remains a failure even when the other cases pass.

| Case | Concrete action and required observation |
| --- | --- |
| Ordinary internet | The same two commands without `--force-relay`, each with a new `--report-path` (for example `out/h2b-two-machine/device-a-ordinary.json` and `out/h2b-two-machine/device-b-ordinary.json`): first the duel through the ordinary menu (Host/Create, Join with the saved code, Ready, Start; the forced first round, then the host thrusts and the guest fires), then the sector through the test-only entry, where both humans play, pause/resume, and agree on state/commands. Record the selected route types and the guest duel record's route (`lan` or `internet`). |
| Forced relay | Use both commands above; selected native pairs, full/ACK before input, actual commands, matching publication and cleanup are required. |
| 50/150/300 ms injected RTT | On a dedicated test router or approved OS network-shaping facility, add 25/75/150 ms one-way delay in each direction. Record the shaper configuration and unshaped baseline; do not alter production account settings. Run each delay separately. |
| Labelled jitter/loss | On that same test path, add a specified bounded jitter (for example ±10 ms) and a specified packet-loss setting (for example 1%). Record configured values and shaper counters separately from measured WebRTC RTT/loss. Never label injected loss as measured network loss. If no shaper is available mark these cases NOT_RUN; do not improvise a player/IPC override. |
| Five-second stall | Suspend network forwarding on the dedicated test path for exactly five seconds, then restore it. Keep this distinct from real OS sleep. Observe frozen input/queue bounds, recovery or explicit error, paused-state policy and cleanup. |
| Credential refresh/expiry | In an ordinary packaged session, keep the same authenticated seat for the 3,600-second credential lifetime. Record start/end monotonic times and redacted service issuance counters. Close/recreate the peer route after entering the five-minute refresh window; verify fresh authorized issuance and a newly selected relay gameplay route. Repeat after expiration. Respect one issuance/minute/seat; no credential or TTL override. The three-minute driver alone does not prove this case. Collect operator screenshots/counters and a subsequent instrumented gameplay run, with that limitation explicit. |
| Service interruption | Interrupt only the test path to signalling, then restore it. Observe independent utility fencing, no player Resume under a closed gate, and bounded retry. No cloud resource change or relaxed sender checks. |
| Running host death | Kill only the test host app after a committed receipt. On the survivor use manual Re-host. Confirm the same run/seat roster, newer generation, exact committed checkpoint restore paused, ACK before input, and explicit Resume. Rejoin the old host with its saved seat. |
| Paused host death | Repeat with paused control changes committed first; confirm no automatic resume and exact paused restored hash/watermarks. |
| Compatibility rejection | Use a clearly labelled incompatible test build, attempt Join, and require rejection before gameplay allocation. Restore the approved candidate for subsequent cases. Do not overwrite or relabel candidate hashes. |
| Actual OS suspend | If hardware access permits, sleep the host OS, wake it, and record observed fencing/recovery separately with an operator attestation that OS sleep actually occurred. Otherwise keep actualOsSuspend NOT_RUN. Synthetic powerMonitor events do not count. |

For counters, retain only bounded route types, publication sequence/tick/hash, queue high-water marks, RTT summaries, measured loss availability, injected shaper counters and fixed failure codes. The current launcher does not inject network impairment or attest the hour-long expiry test; attach those operator measurements as distinct evidence. Raw browser/network dumps may expose addresses or credentials and must not be attached.

## Combine and admit evidence

Build the release report using `validateInternetAppReport` from `scripts/network/internet-app-report.ts`. Attach each reference as `{path, sha256}` plus the exact unedited report payload. `twoMachineGameplay` has status PASS only with two `single-device` reports (host then guest), both forceRelay true, distinct labels, and `attestation: {physicallySeparate:true, differentNetworks:true, operatorLabels:["operator-a","operator-b"]}`. Each operator explicitly confirms the physical devices and networks; do not infer that statement from labels alone.

`localRecovery` takes the H-2b candidate's local recovery report, as the [H-2b-ii gates subsection](../../gates.md#the-internet-candidate-for-sim-39-h-2b-ii) describes. Keep separate `localRecovery`, `deployedService`, `forcedRelayGameplay`, `twoMachineGameplay`, and `actualOsSuspend` fields. A final internet-ready result requires the first four PASS. Scenario coverage gaps remain prominently listed even when that basic admission succeeds. SHA-256 references detect changed files, not false human statements. Retain exact exit/cleanup evidence and hash each final report after writing; failure evidence must not be hidden by a successful later summary.
