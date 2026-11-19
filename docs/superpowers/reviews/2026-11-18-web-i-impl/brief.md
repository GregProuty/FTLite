## Role
<!-- reuse -->

The subject is the implementation of part Web-i of the FTLite web build, on branch `web-i`. Web-i moves Electron's online stack (session state machine, lobby client, WebRTC peers) out of the main process and the hidden transport window into the game page. It moves the host's deterministic authority out of the Electron utility process into a dedicated Web Worker. It shrinks Electron's main process to seven jobs and rewrites the Electron network gates.

The branch is about to merge to master. It must be correct against its plan and spec, keep determinism and the online recovery model (seat reconnect, mirror rehost, leases) intact, and leave desktop play working. A bug that breaks hosting, joining, rehost, reconnect or window close in ordinary use is a release blocker.

## What to review

- THE SUBJECT (impl): `master...HEAD` at commit `100e8548`, in worktree `C:/Users/djuar/FTLite/.worktrees/web-i`, branch `web-i`. HEAD already includes a merge of current master.
- **The plan it implements:** `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md`. Read its Global Constraints, its spec deviations D-1 to D-9, and the Task 1 ledger at L1-L70 first.
- **The spec:** `docs/superpowers/specs/2026-11-18-web-build-design.md`, sections §3, §4, §6, §8 and §9 item 1.
- **The code:** see the reading manifest.
- **The run dir:** `docs/superpowers/reviews/2026-11-18-web-i-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec and plan.** Every behaviour the plan promised must be present and right.
2. **The invariants named in the focus notes below.** Trace each one through the diff.
3. **`tsc --noEmit` is clean.** Run `npx tsc -b` or `npx tsc --noEmit -p tsconfig.web.json`, and run lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **The session move preserves behaviour.** Each file in `src/network/online/` should match its deleted `src/main/network/` original, apart from the stated Node replacements: sync SHA-256, the bytes helpers, `randomHex` and the `OnlineRecordStore`. Use `git show master:src/main/network/<f>.ts` to compare.
7. **Suspend and resume fire only on OS sleep, never on `visibilitychange`.**
   - The clock-jump detector compares wall time with monotonic time, using the 15 s rule.
   - A `pagehide`/`pageshow` with `persisted:true` suspends and resumes.
   - A `pagehide` with `persisted:false` calls `releaseForUnload`: the host release goes over the socket, with no capture.
   - Electron uses its `app:suspend`/`app:resume` push instead.
   - The clock-jump path fires `suspend()` then `resume()` back to back without awaiting. Confirm the session owner serializes them safely.
8. **The Electron close handshake (`src/main/appExit.ts`).** `app:prepare-exit` must have a 3 s cap, `will-prevent-unload` must be allowed, and the handshake must have no hang or double close.
9. **The Worker host owner (`src/network/host/workerHost.ts`).**
   - It implements the `HostProcessHandle` contract unchanged.
   - Readiness is the Worker being ready plus `transport-ready`.
   - The lease is invalidated on suspend and resume (D-4).
   - `kill` is idempotent.
10. **The trust boundary.**
    - The session is never on `window`, except the D-1 `testProbe` frozen facade, which only an unpackaged build with `FTLITE_ONLINE_TEST_PROBE=1` can enable.
    - `window.ftlite.onlineConfig` is frozen and validated.
    - Packaged builds refuse the test-only fields.
11. **Signalling (`services/signalling/src/index.ts`).**
    - `Access-Control-Expose-Headers: X-FTL-Checkpoint` goes on every allowed cross-origin response, including `Origin: null`.
    - `file://` is allowed like `null` (D-2).
    - Responses are copied before their headers are set, with the 101/webSocket case handled.
12. **The rollout order.** Electron hosting against the currently deployed service fails until the Task 8 service change is deployed in Web-iii, because the deployed service rejects `Origin: file://` and sets headers on an immutable 101. Is this documented where a person building an Electron candidate from master would see it, such as `docs/gates.md` or the plan? Is there any way to keep master's Electron build working against the deployed service?
13. **Hidden-tab warning and lease relay (path B, Task 12).** The warning shows only for a hosting browser tab while it is hidden. It is off in Electron and in Single player. The lease relay uses no timers on the renew path.
14. **Gate coverage.** D-9 defers the `stale` recovery scenario. Duel-mode leave→idle is covered only for the guest. Are other old gate assertions silently lost? Compare against `git show master:scripts/network/<script>`.
15. **The merge of master (`100e8548`).** Master's ship picker and CRT menu must wire through `createPageOnline`. No master code may import a deleted module.

## Reading manifest

**The diff**
- `.superpowers/sdd/web-i-impl.diff`: the prepared diff `master...HEAD`, about 840 KB. It contains the commit list, the stat, and the full diff with 8 lines of context, excluding `docs/`, `tests/fixtures/` and `package-lock.json`. Read it in ranges with `sed -n`.

**Plan and spec**
- `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md:L1-L70`: Global Constraints, deviations and the ledger. Read the task sections as needed.
- `docs/superpowers/specs/2026-11-18-web-build-design.md`: §3, §4, §6, §8 and §9.

**Key new or changed source**
- `src/main/index.ts`, `src/main/appExit.ts` and `src/preload/index.ts`
- `src/renderer/src/main.ts`, `src/renderer/src/app/online/pageSession.ts`, `src/renderer/src/app/online/hostVisibility.ts` and `src/renderer/src/app/onlineBridge.ts`
- `src/network/online/*.ts`, `src/network/host/workerHost.ts`, `src/network/transport/{owner,pageTransport,bridge,contracts}.ts`, `src/network/platformPort.ts` and `src/network/random.ts`
- `src/worker/*.ts`
- `src/shared/{sha256,bytes,onlineConfig,onlineSession,hostProcessProtocol,rtcSession}.ts`
- `services/signalling/src/index.ts` and `services/signalling/tests/origins.test.ts`
- `electron.vite.config.ts`, `tsconfig.web.json` and `package.json`

**Originals, for comparison**
- `git show master:src/main/network/onlineSession.ts`, along with `hostProcess.ts`, `rtcTransport.ts`, `onlineExit.ts`, `onlineIpc.ts` and `transportWindow.ts`.

**Gates**
- `scripts/network/*`, compared with the `git show master:` versions.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p <config>` are fine. Never run the test suite or the Electron gates (they can hang or take many minutes).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions, and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- **D1:** the browser and Electron both stay, sharing one networking path, the page-side path. Electron becomes a thin window.
- **D6:** a peer host. The authority runs in a Web Worker and reaches the network only through Link/Session/PortFrame ports.
- **No gameplay change.** SIM_VERSION is unchanged by this branch (master is at 53 after the merge).
- **The spec and plan as converged are the requirement.** The plan's stated deviations D-1 to D-9 were accepted at review.
- **Path B was chosen for Task 1.** Firefox has no valid run, so the warning and the event-driven lease are in.

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

- **P0:** merging breaks determinism, online recovery, or desktop Single player or multiplayer with no workaround, or leaks the seat token or session beyond the page.
- **P1:**
  - a behaviour the spec or plan promised is missing or wrong;
  - a case hit in ordinary play is mishandled (host, join, reconnect, rehost, window close, OS sleep, a hidden host tab);
  - tsc fails;
  - a test does not exercise the risk it claims to cover;
  - a gate assertion was silently dropped.
- **P2:** should fix, not blocking.
- **P3:** nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
