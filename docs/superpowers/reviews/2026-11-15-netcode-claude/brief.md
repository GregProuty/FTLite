## Role
<!-- reuse -->

You are an independent Claude Code Opus reviewer of the merged FTLite internet multiplayer implementation. Identify concrete defects affecting ordinary play, recovery, authority isolation, credentials, persistence, resource cleanup or correctness. Review the implementation, not a new architecture proposal.

## What to review

- THE SUBJECT (impl): `737026b...HEAD` at commit `e5c00e9`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- The Net-3 and Net-3e designs and recorded rulings listed below.
- Focus on src/main/network, src/network/session, src/utility, renderer authority/client integration, and services/signalling.
- The run dir `docs/superpowers/reviews/2026-11-15-netcode-claude/` holds `ledger.md` and every round's output.

## What to check, in priority order


1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **Type safety and verification coverage.** Inspect retained tests/results; reviewer has read-only file tools, so do not run commands.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**

6. Trace stale callbacks, host-generation changes, lease expiry and paused recovery end-to-end.
7. Check real-world signalling/TURN ownership, authentication, persistence and bounded cleanup.
8. Examine merged Helm/duel startup interaction with online sector mode.
9. Treat the earlier unresolved native Leave failures as uncertainty, not proof of a fix or a speculative defect.
10. External two-machine, OS sleep and prolonged refresh remain explicitly unverified; do not report their acknowledged absence as a code defect.

## Reading manifest

- `docs/superpowers/specs/2026-11-14-net-3-internet-sessions-design.md:L1-L149`
- `docs/superpowers/specs/2026-11-15-net-3e-recovery-internet-design.md:L1-L122`
- `docs/superpowers/reviews/2026-11-15-net-3e-rulings.md:L1-L52`
- `docs/superpowers/reviews/2026-11-15-net-3e-evidence/README.md:L1-L41`
- `src/main/network/onlineSession.ts:L1-L557`
- `src/main/network/onlinePeers.ts:L1-L173`
- `src/main/network/onlineIce.ts:L1-L65`
- `src/main/network/onlineMirrors.ts:L1-L155`
- `src/main/network/mirrorStore.ts:L1-L94`
- `src/network/session/serviceClient.ts:L1-L532`
- `src/network/session/leaseGate.ts:L1-L110`
- `src/utility/authorityHost.ts:L1-L20`
- `src/renderer/src/authority/core.ts:L1-L616`
- `src/renderer/src/authority/replay.ts:L1-L99`
- `services/signalling/src/room.ts:L1-L116`
- `services/signalling/src/directory.ts:L1-L244`
- `src/renderer/src/main.ts:L1-L124`
- `src/main/index.ts:L1-L74`
- `docs/superpowers/reviews/2026-11-15-netcode-claude/.netcode.diff:L1-L27036`: complete code/test/config diff; read bounded ranges as needed.
Changed implementation files (source paths, not evidence):
- `build/contentDigest.ts`
- `build/isolatedBuildReporter.ts`
- `electron-builder.yml`
- `electron.vite.config.ts`
- `package.json`
- `scripts/determinism/run.ts`
- `scripts/network/candidate-manifest.ts`
- `scripts/network/host-smoke-page.ts`
- `scripts/network/host-smoke-preload.cjs`
- `scripts/network/host-smoke.cjs`
- `scripts/network/host-smoke.ts`
- `scripts/network/index.html`
- `scripts/network/internet-app-manifest.ts`
- `scripts/network/internet-app-report.ts`
- `scripts/network/internet-app-smoke.ts`
- `scripts/network/internet-observer-worker.ts`
- `scripts/network/lease-smoke-lifecycle.ts`
- `scripts/network/lease-smoke.cjs`
- `scripts/network/lease-smoke.ts`
- `scripts/network/online-app-click.cjs`
- `scripts/network/online-app-diagnostics.ts`
- `scripts/network/online-app-observer.ts`
- `scripts/network/online-app-report.ts`
- `scripts/network/online-app-runtime-worker.ts`
- `scripts/network/online-app-runtime.ts`
- `scripts/network/online-app-smoke.cjs`
- `scripts/network/online-app-smoke.ts`
- `scripts/network/online-observer-build.ts`
- `scripts/network/online-recovery-instrument.cjs`
- `scripts/network/online-recovery-report.ts`
- `scripts/network/online-recovery-smoke.ts`
- `scripts/network/online-recovery-utility.cjs`
- `scripts/network/online-recovery-utility.ts`
- `scripts/network/room-service-report.ts`
- `scripts/network/room-service-smoke.cjs`
- `scripts/network/room-service-smoke.ts`
- `scripts/network/rtc-config-smoke.cjs`
- `scripts/network/rtc-config-smoke.ts`
- `scripts/network/rtc-smoke-client.ts`
- `scripts/network/rtc-smoke-native.cjs`
- `scripts/network/rtc-smoke-preload.cjs`
- `scripts/network/rtc-smoke-report.ts`
- `scripts/network/rtc-smoke.cjs`
- `scripts/network/rtc-smoke.ts`
- `services/signalling/.gitignore`
- `services/signalling/README.md`
- `services/signalling/package-lock.json`
- `services/signalling/package.json`
- `services/signalling/scripts/local-runtime.ts`
- `services/signalling/src/crypto.ts`
- `services/signalling/src/directory.ts`
- `services/signalling/src/errors.ts`
- `services/signalling/src/http.ts`
- `services/signalling/src/index.ts`
- `services/signalling/src/room.ts`
- `services/signalling/src/room/auth.ts`
- `services/signalling/src/room/checkpoints.ts`
- `services/signalling/src/room/lifecycle.ts`
- `services/signalling/src/room/signals.ts`
- `services/signalling/src/room/sockets.ts`
- `services/signalling/src/room/store.ts`
- `services/signalling/src/storage.ts`
- `services/signalling/src/turn.ts`
- `services/signalling/tests/activationRaces.test.ts`
- `services/signalling/tests/auth.test.ts`
- `services/signalling/tests/checkpoint-helpers.ts`
- `services/signalling/tests/checkpoints.test.ts`
- `services/signalling/tests/clientIntegration.test.ts`
- `services/signalling/tests/directory.test.ts`
- `services/signalling/tests/helpers.ts`
- `services/signalling/tests/hibernation.test.ts`
- `services/signalling/tests/http.test.ts`
- `services/signalling/tests/lifecycle-helpers.ts`
- `services/signalling/tests/lifecycle.test.ts`
- `services/signalling/tests/protocol.test.ts`
- `services/signalling/tests/redaction.test.ts`
- `services/signalling/tests/runtime-probe.ts`
- `services/signalling/tests/runtime.test.ts`
- `services/signalling/tests/signal-helpers.ts`
- `services/signalling/tests/signals.test.ts`
- `services/signalling/tests/socket-helpers.ts`
- `services/signalling/tests/sockets.test.ts`
- `services/signalling/tests/turn-helpers.ts`
- `services/signalling/tests/turn.test.ts`
- `services/signalling/tsconfig.json`
- `services/signalling/vitest.config.ts`
- `services/signalling/wrangler.jsonc`
- `src/main/index.ts`
- `src/main/network/hostProcess.ts`
- `src/main/network/mirrorStore.ts`
- `src/main/network/onlineConfig.ts`
- `src/main/network/onlineExit.ts`
- `src/main/network/onlineIce.ts`
- `src/main/network/onlineIpc.ts`
- `src/main/network/onlineMirrors.ts`
- `src/main/network/onlinePeers.ts`
- `src/main/network/onlinePlatform.ts`
- `src/main/network/onlineRetry.ts`
- `src/main/network/onlineSector.ts`
- `src/main/network/onlineSession.ts`
- `src/main/network/rtcTransport.ts`
- `src/main/network/seatStore.ts`
- `src/main/network/transportWindow.ts`
- `src/network/hostRuntime.ts`
- `src/network/modes/contracts.ts`
- `src/network/modes/registry.ts`
- `src/network/modes/sector.ts`
- `src/network/modes/sectorProducers.ts`
- `src/network/modes/sectorStream.ts`
- `src/network/platformPort.ts`
- `src/network/portLink.ts`
- `src/network/rtc/contracts.ts`
- `src/network/rtc/dataLink.ts`
- `src/network/rtc/frames.ts`
- `src/network/rtc/peer.ts`
- `src/network/session/leaseGate.ts`
- `src/network/session/serviceClient.ts`
- `src/network/state/imageCodec.ts`
- `src/network/state/receiver.ts`
- `src/network/state/sender.ts`
- `src/network/state/timeline.ts`
- `src/network/transport/bridge.ts`
- `src/network/transport/controller.ts`
- `src/network/utilityHost.ts`
- `src/preload/index.ts`
- `src/preload/networkTransport.ts`
- `src/renderer/networkTransport.html`
- `src/renderer/networkTransport.ts`
- `src/renderer/src/app/onlineBridge.ts`
- `src/renderer/src/app/onlineSession.ts`
- `src/renderer/src/app/session.ts`
- `src/renderer/src/app/sessionRouter.ts`
- `src/renderer/src/authority/authority.ts`
- `src/renderer/src/authority/checkpoint.ts`
- `src/renderer/src/authority/core.ts`
- `src/renderer/src/authority/ledger.ts`
- `src/renderer/src/authority/replay.ts`
- `src/renderer/src/authority/tickDriver.ts`
- `src/renderer/src/clientControl/cardController.ts`
- `src/renderer/src/clientControl/clientRun.ts`
- `src/renderer/src/clientControl/commandOutbox.ts`
- `src/renderer/src/input/onlineInput.ts`
- `src/renderer/src/input/sources.ts`
- `src/renderer/src/main.ts`
- `src/renderer/src/net/codec.ts`
- `src/renderer/src/net/contracts.ts`
- `src/renderer/src/net/receivePolicy.ts`
- `src/renderer/src/render/crewSprites.ts`
- `src/renderer/src/render/hud.ts`
- `src/renderer/src/render/hudModel.ts`
- `src/renderer/src/render/letterbox.ts`
- `src/renderer/src/render/renderer.ts`
- `src/renderer/src/render/sessionMenu.ts`
- `src/renderer/src/sim/replay.ts`
- `src/shared/hostProcessProtocol.ts`
- `src/shared/netSession.ts`
- `src/shared/onlineSession.ts`
- `src/shared/roomSession.ts`
- `src/shared/rtcSession.ts`
- `src/shared/sessionCheckpoint.ts`
- `src/shared/sessionLease.ts`
- `src/utility/authorityHost.ts`
- `tests/authorityDisconnect.test.ts`
- `tests/authorityLease.test.ts`
- `tests/checkpointV2.test.ts`
- `tests/commandOutbox.test.ts`
- `tests/contentDigest.test.ts`
- `tests/helpers/onlineCheckpoint.ts`
- `tests/helpers/portEndpoint.ts`
- `tests/hostProcess.test.ts`
- `tests/hudSlots.test.ts`
- `tests/internetAppManifest.test.ts`
- `tests/internetAppReport.test.ts`
- `tests/internetAppSmoke.test.ts`
- `tests/isolatedBuildReporter.test.ts`
- `tests/leaseSmokeCleanup.test.ts`
- `tests/letterbox.test.ts`
- `tests/mirrorStore.test.ts`
- `tests/modeHost.test.ts`
- `tests/networkBoundary.test.ts`
- `tests/onlineAppClick.test.ts`
- `tests/onlineAppDiagnostics.test.ts`
- `tests/onlineAppReport.test.ts`
- `tests/onlineAppRuntime.test.ts`
- `tests/onlineBridge.test.ts`
- `tests/onlineConfig.test.ts`
- `tests/onlineCoordinator.test.ts`
- `tests/onlineExit.test.ts`
- `tests/onlineIce.test.ts`
- `tests/onlineInput.test.ts`
- `tests/onlineIpc.test.ts`
- `tests/onlineMirrors.test.ts`
- `tests/onlineNeutralization.test.ts`
- `tests/onlinePeers.test.ts`
- `tests/onlinePlatform.test.ts`
- `tests/onlineRecovery.test.ts`
- `tests/onlineRecoveryInstrumentation.test.ts`
- `tests/onlineRecoveryPreparation.test.ts`
- `tests/onlineRecoveryReport.test.ts`
- `tests/onlineRenderer.test.ts`
- `tests/onlineRetry.test.ts`
- `tests/onlineSector.test.ts`
- `tests/onlineSessionContract.test.ts`
- `tests/platformPort.test.ts`
- `tests/portLink.test.ts`
- `tests/presentationTimeline.test.ts`
- `tests/remoteAdmission.test.ts`
- `tests/replayV3.test.ts`
- `tests/roomServiceClient.test.ts`
- `tests/roomServiceRuntimeGate.test.ts`
- `tests/rtcBridge.test.ts`
- `tests/rtcConfigSmoke.test.ts`
- `tests/rtcDataLink.test.ts`
- `tests/rtcFrames.test.ts`
- `tests/rtcPeer.test.ts`
- `tests/rtcRuntimeGate.test.ts`
- `tests/rtcTransportOwner.test.ts`
- `tests/seatStore.test.ts`
- `tests/sectorProducers.test.ts`
- `tests/sectorStream.test.ts`
- `tests/sessionCapture.test.ts`
- `tests/sessionLease.test.ts`
- `tests/sessionMenu.test.ts`
- `tests/sessionRouter.test.ts`
- `tests/stateImage.test.ts`
- `tests/stateStream.test.ts`
- `tests/transportWindow.test.ts`
- `tests/utilityHost.test.ts`
- `tsconfig.node.json`
- `tsconfig.web.json`

Read by line range using Read, not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not launch Codex, Claude, agents or tools beyond Read/Grep/Glob. Read/Grep/Glob tools are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the user and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Keep authoritative fixed-tick simulation and manual re-host; no automatic election or prediction.
- Keep Worker-only long-lived TURN secrets, named validated IPC, utility-local lease permission and ACK-before-input.
- Preserve recorded replay-v4 and dormant-empty bot UI rulings; flag actual violations.
- No secret files, deployments, provider calls or product edits by the reviewer.
- Controller must not edit any dirty-baseline path.

## Output format (strict)
<!-- reuse -->

Your final message is validated against a JSON Schema; it must be a single JSON object and nothing else:

```
{ "verdict":      "changes requested" | "ready with P2s" | "ready",
  "findings":     [ { "severity": "P0"|"P1"|"P2"|"P3", "title": "<one line>",
                      "claim": "<what is wrong>", "evidence": "<subject L<n>, file:L<n>>",
                      "why": "<why it matters>", "fix": "<concrete fix>" } ],
  "prior":        [ { "id": "R<N>-F<k>", "result": "resolved" | "withdrawn" | "still open",
                      "note": "<for still open: what is still wrong, with new evidence>" } ],
  "verified":     [ "<what you checked and found correct, with citations>" ],
  "not_verified": [ "<what you could not verify and why>" ] }
```

Findings ordered by severity then importance. Do not invent IDs; new findings have no ID (the responder assigns `R<N>-F<k>` in array order). `prior` lists exactly the awaited IDs given to you, once each, and nothing else. In round 1 `prior` is empty.

## Severities
<!-- reuse -->

- **P0**: Cross-player authorization breach, secret exposure, durable unrecoverable state corruption, or authority split-brain that invalidates the model.
- **P1**: Concrete ordinary-use correctness, recovery, availability or bounded-lifecycle defect requiring a fix before reliable multiplayer; cite a reproducible path.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
