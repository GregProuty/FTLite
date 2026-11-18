## Role
<!-- reuse -->

The subject is an implementation plan for part Web-i of the FTLite web build. Web-i moves the Electron online stack into the page and the host's authority into a Web Worker, so Electron becomes a thin window. It also rewrites the Electron network gates. Fresh subagents will execute the plan task by task, verbatim, in the worktree `.worktrees/web-i`. Anything left for "check at execution", any interface that does not exist with the assumed shape, or any step that would fail to compile or run as written is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md` at commit `47cfa22d`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- It must conform to the converged spec `docs/superpowers/specs/2026-11-18-web-build-design.md`, sections §3, §4, §6, §8 and §9 item 1.
- The codebase it changes: `src/main/**`, `src/preload/**`, `src/utility/**`, `src/network/**`, `src/shared/onlineSession.ts`, `src/shared/hostProcessProtocol.ts`, `src/renderer/src/main.ts`, `src/renderer/src/app/onlineBridge.ts`, `electron.vite.config.ts`, `package.json`, `services/signalling/src/**` and its tests, `scripts/network/**`, and the `tests/` files for these modules.
- The run dir `docs/superpowers/reviews/2026-11-18-web-i-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Spec deviations D-1 to D-5 (plan L33-L39).** Is each justified, and safe? In particular: is D-1 `testProbe` kept off every production and packaged path, and is D-2 (`Origin: file://` allowed like `null`) true for Chromium WebSocket upgrades from `file://`?
6. **Task 1 (plan L78-L624), the background-tab test.**
   - Are Playwright's default throttling-off flags overridden (around L542: Chromium `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and `--disable-backgrounding-occluded-windows`, and the equivalent Firefox prefs)? If they are not, every run is invalid or false-passes.
   - Is the validity rule exactly the spec's §3.5 rule?
7. **Task 3: "copied into src/network/online".** Are the originals removed in a later task, so that no two copies of the session logic survive? Is every Node dependency replaced?
8. **Task 5/7 around L3576: the module Worker from Electron's `file://` page.**
   - Does `new Worker(new URL(..., import.meta.url), {type:'module'})` work under `file://` in Electron 37 with sandbox and contextIsolation?
   - Is the classic-Worker fallback specified concretely?
   - Is the chunk name `assets/authorityWorker.js` (L2191) actually guaranteed by the Vite config the plan writes?
9. **L3321: the preload.** Does `sendSync` work in a sandboxed preload, and is the config exposed through contextBridge frozen as the spec says?
10. **L1516: `releaseForUnload`.** Does it send `host-release` over the socket before the close, using a real serviceClient request type?
11. **Gates, Tasks 9-11 (L3725-L4690).**
    - The host-smoke, rtc-smoke and room-service rewrites are given as old-to-new mapping tables rather than full code. Is that enough for a fresh implementer, or is it a placeholder by the writing-plans rules?
    - Are the CDP-injected probe, the `protocol.handle('file')` Worker instrumentation and the instrument needles on the ES Worker chunk (L4499-L4616) concrete and workable?
12. **Determinism and the content digest (plan L16).** Is the claim true that editing `src/shared/onlineSession.ts` changes the gameplay content digest without needing a golden re-bless (`build/contentDigest.ts`, `scripts/determinism/fixture.ts:49`)? Do any golden tests or fixtures hash the digest?

## Reading manifest

**The plan and spec**
- `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md:L1-L4894`: the subject. Read it fully, in ranges.
- `docs/superpowers/specs/2026-11-18-web-build-design.md`: the spec. Read §3, §4, §6, §8 and §9.

**Electron main process and session**
- `src/main/index.ts`
- `src/main/network/onlineSession.ts`, `hostProcess.ts`, `transportWindow.ts`, `rtcTransport.ts`, `onlineIpc.ts`, `onlineExit.ts`, `onlinePlatform.ts`, `seatStore.ts`, `mirrorStore.ts`, `onlineConfig.ts`, `onlineIce.ts`, `onlineDuel.ts`, `onlineSector.ts`, `onlineMirrors.ts`, `onlinePeers.ts` and `duelRecords.ts`: read the ranges each task cites.

**Preload and authority host**
- `src/preload/index.ts` and `src/preload/networkTransport.ts`
- `src/utility/authorityHost.ts`, `src/utility/authorityModes.ts`, `src/network/utilityHost.ts`, `src/network/platformPort.ts` and `src/network/portLink.ts`

**Transport, session and shared types**
- `src/network/transport/bridge.ts`, `src/network/transport/controller.ts` and `src/network/session/serviceClient.ts`
- `src/shared/onlineSession.ts`, `src/shared/hostProcessProtocol.ts` and `src/shared/rtcSession.ts`

**Renderer, build and digest**
- `src/renderer/src/main.ts`, `src/renderer/src/app/onlineBridge.ts` and `src/renderer/networkTransport.ts`
- `electron.vite.config.ts`, `package.json` and `build/contentDigest.ts`

**Signalling service**
- `services/signalling/src/index.ts` and `services/signalling/tests/`: grep for origin and CORS.

**Scripts and tests**
- `scripts/network/`: the files named in Tasks 9-11.
- `scripts/determinism/fixture.ts` and `scripts/determinism/run.ts`
- `tests/`: grep for the module names the plan changes, and confirm that the test files it names exist.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p <config>` are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions (see spec §1), and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- D1: the browser and Electron both stay, sharing one networking path (the page-side path). Electron becomes a thin window.
- D3: one project. Nothing goes live until browser multiplayer works. Web-i is the first internal part.
- D4: Chrome, Edge and Firefox on desktop are supported and tested.
- D6: a peer host. The authority runs in a Web Worker and reaches the network only through Link/Session/PortFrame ports.
- No gameplay change. SIM_VERSION is unchanged.
- The spec as converged at `7995867e` is the requirement. Plan deviations must be stated and justified.

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

- **P0**: the plan is unexecutable as a whole, or following it breaks determinism, online recovery or desktop play with no path to fix it.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a wrong path), a step is a placeholder a fresh implementer cannot follow, a spec requirement is missing or silently changed, or a test cannot pass or does not test the risky path.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
