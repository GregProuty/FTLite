# Net-3e two-machine playtest

Status: **NOT RUN**. Perform external steps only after the concrete Task 9 action is authorized. The release record is [release candidate](../reviews/2026-11-15-net-3e-release-candidate.md). A local pair, TURN HTTP 201, or open data channel does not prove this gate.

## Prepare the two devices

Use two physical Windows x64 computers on different networks (for example, one home broadband connection and one mobile hotspot). Supply distinct nonsecret machine/network labels and operator labels. Do not record IP addresses, SSIDs, addresses, tokens, credentials, SDP or ICE candidate strings. Labels and signed-off operator statements are human attestation; the software cannot cryptographically prove physical separation.

Copy the same candidate ZIP and committed manifest to both machines. Verify the archive SHA-256, executable and app.asar hashes against the manifest. Unzip to an isolated folder and launch FTLite.exe normally for the first ordinary Host/Join/Ready/Start check. The candidate is unsigned. Use the recorded source revision and pinned dependencies for the instrumented run; copy the identical packaged `out` files from app.asar into that source checkout's `out` directory. The launcher compares all those bytes and the ZIP against the manifest before starting the actual compiled application. It also verifies the recorded source files and source ancestry. It adds test-only native observation/relay selection; neither switch exists in the player UI or renderer IPC.

The manifest's `packagePath` is a local path to the unchanged ZIP. Adjust only that path if needed; preserve identity, artifact hashes and source hashes. Install pinned dependencies using the two existing lockfiles. Do not install newer Electron/Wrangler versions.

## Capture each independent result

After deployment authorization and the ordinary packaged check, run one command on each machine, changing role and labels. No credentials are accepted on the CLI:

```powershell
npm run test:internet-app-runtime -- --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --force-relay --role=host --machine-label=device-a --network-label=network-a --capture-after-ms=180000 --candidate-manifest=PATH/manifest.json --report-path=PATH/device-a.json
npm run test:internet-app-runtime -- --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --force-relay --role=guest --machine-label=device-b --network-label=network-b --capture-after-ms=180000 --candidate-manifest=PATH/manifest.json --report-path=PATH/device-b.json
```

Coordinate starts. Use ordinary Host/Create, Join/code, Ready and Start. Both humans move and issue a gameplay command; both pause and explicitly resume at least once. End paused before the three-minute capture. Do not Leave until capture: the harness obtains screenshots, the latest committed receipt, bounded actual publication/input/result observations, selected native route types, and then requests graceful shutdown. Each host/guest result must independently exit 0, contain no failure, and show exact process/window/port/listener/utility/native-peer cleanup. Different source/package/runtime identities reject the combined bundle. The common publication must match runId, sequence, tick, canonical hash and both command/held watermark arrays; generations and committed checkpoint sequence/hash must also agree. Each accepted command must match an observed owned-seat input and appear in the common publication's command watermark. Both selected candidate types must be `relay` with native policy `relay` and observed data in both directions.

If capture fails, retain the failed report and its fixed diagnostic. Do not edit PASS into the file. Rerun only after resolving the failure; preserve earlier evidence. Long gameplay can rotate bounded observer history; issue fresh commands on both devices shortly before the final pause so their results and common publications are retained.

## Scenario matrix

Retain a separate run/report pair and screenshots for each condition, labelled with the exact method and settings. Reuse the same candidate bytes. A failure remains a failure even when the other cases pass.

| Case | Concrete action and required observation |
| --- | --- |
| Ordinary internet | Host/Join/Ready/Start without force-relay; both humans play, pause/resume, and agree on state/commands. Record the selected route types. |
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

Keep separate `localRecovery`, `deployedService`, `forcedRelayGameplay`, `twoMachineGameplay`, and `actualOsSuspend` fields. A final internet-ready result requires the first four PASS. Scenario coverage gaps remain prominently listed even when that basic admission succeeds. SHA-256 references detect changed files, not false human statements. Retain exact exit/cleanup evidence and hash each final report after writing; failure evidence must not be hidden by a successful later summary.
