## Role
<!-- reuse -->

The subject is a design spec for running FTLite in desktop browsers hosted on Vercel. FTLite is a networked co-op game built on Electron, TypeScript, Pixi and React. In the browser version, the host's deterministic authority runs in a Web Worker, WebRTC runs in the page, and the existing Cloudflare signalling Worker and TURN stay in use. Electron is to switch onto the same page-side path.

An implementation plan will be written from this spec and executed by fresh subagents. Every requirement must therefore be buildable as stated, consistent with the actual code, and testable. A design that silently breaks determinism, the existing online recovery (seat reconnect, mirror rehost, leases) or desktop play is a serious defect.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-18-web-build-design.md` at commit `0ac43a37`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The current Electron networking code that the spec claims to describe and replace (manifest below).
- The Cloudflare signalling service in `services/signalling`.
- The run dir `docs/superpowers/reviews/2026-11-18-web-build-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **§2, where things stand.** Check each factual claim (files, APIs used, sizes, channels) against the source. A wrong fact will mislead the plan.
8. **§3.1 and §3.3, the session move.** `onlineSession.ts` is 595 lines and runs in the main process today, with sender-frame checks, IPC validation, powerMonitor suspend and the exit save. Is moving it into the page complete as described? Which main-process responsibilities are lost or changed without being addressed? Examples: the exit save on window close, suspend and resume semantics, sender validation, and lease renewal timing while the page is hidden.
9. **§3.5, the background-tab test.** Is the pass threshold measurable and sufficient? The page main thread now runs the session, the RTC relay and lease renewal. Does it get throttled in hidden tabs even if the Worker does not, and does the spec handle that?
10. **§5.3, the passcode middleware.** It uses `vercel deploy --prebuilt` and the Build Output API on Hobby. Does the spec state Vercel claims as facts when they need a check? Examples: Routing Middleware on Hobby, Build Output `functions/` plus `config.json`, and password protection being paid. Do the Worker script, dynamic imports and `version.json` behave under cookie gating, for example do Worker fetches carry cookies?
11. **§6, the origin checks.** Does `services/signalling/src/room/sockets.ts` check Origin on WebSocket upgrade? Does the browser path send anything the service rejects? Examples: `Origin` on a fetch to a different origin, and preflight requests for JSON POSTs and custom headers.
12. **§3.3, deleting the Electron utility process and hidden window.** Do the existing Electron runtime gates (`scripts/network/*-smoke.ts`) and the "Electron" determinism runtime depend on them in ways that the §8 rewrite understates?
13. **§7.2, fullscreen.** Are the Firefox fullscreenchange-as-Esc rule and the Chrome keyboard.lock rule plausible and correctly specified?

## Reading manifest

**The subject**
- `docs/superpowers/specs/2026-11-18-web-build-design.md:L1-L330`

**Electron main process and session**
- `src/main/index.ts:L1-L99`: the Electron main entry (window, online session construction, IPC, fetch/WebSocket injection).
- `src/main/network/onlineSession.ts:L1-L595`: the session state machine. Its node:crypto uses are at L1, L261 and L497.
- `src/main/network/onlineDuel.ts`, `src/main/network/onlineSector.ts` and `src/main/network/onlineMirrors.ts`: grep for `createHash`.
- `src/main/network/hostProcess.ts:L1-L251`: the utility host owner and the lease.
- `src/main/network/transportWindow.ts:L1-L103`: the utility fork, the hidden window, MessageChannelMain and powerMonitor.
- `src/main/network/seatStore.ts:L1-L118` and `src/main/network/mirrorStore.ts:L1-L94`: persistence and the fs seams.
- `src/main/network/onlineConfig.ts:L1-L16`, `src/main/network/onlineIce.ts:L1-L65` and `src/main/network/onlineExit.ts:L1-L21`.

**Preload and authority host**
- `src/preload/index.ts:L1-L65` and `src/preload/networkTransport.ts`: the preload API.
- `src/utility/authorityHost.ts:L1-L19`, `src/network/utilityHost.ts:L1-L191` and `src/network/platformPort.ts:L1-L19`: the authority host and the port adapter.

**Signalling client and RTC**
- `src/network/session/serviceClient.ts:L1-L532`: the signalling client (fetch and WebSocket injection, headers).
- `src/network/rtc/peer.ts:L1-L220`, `src/network/transport/bridge.ts` and `src/network/transport/controller.ts`: RTC.

**Renderer and shared types**
- `src/renderer/src/app/onlineBridge.ts:L1-L46` and `src/renderer/src/main.ts:L1-L243`: the renderer's use of window.ftlite.
- `src/shared/onlineSession.ts:L1-L184`: the channels and the preload API type.

**Cloudflare service**
- `services/signalling/src/index.ts:L1-L72`, `services/signalling/src/room/sockets.ts:L1-L174` and `services/signalling/wrangler.jsonc:L1-L13`: the origin checks and CORS.

**Build, scripts and gates**
- `electron.vite.config.ts:L1-L28` and `src/renderer/src/render/assets.ts:L1-L119`: the build defines and asset loading.
- `scripts/network/`: list and skim the smoke scripts the spec says to rewrite. `scripts/determinism/run.ts`: the Electron runtime.
- `docs/gates.md`: the tail, for the gate format.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep` and `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions, and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- D1: the browser and Electron both stay, sharing one networking path (the page-side path). Electron becomes a thin window.
- D2: a private site for the owner and invited friends, behind a passcode. It is built locally with the gitignored paid art and uploaded with the Vercel CLI. Vercel never builds from git.
- D3: one project. Nothing goes live until browser multiplayer works. Internally it splits into Web-i, Web-ii and Web-iii.
- D4: Chrome, Edge and Firefox on desktop are supported and tested. Safari is untested. There is no mobile support.
- D5: the Vercel Hobby plan, at a `*.vercel.app` address.
- D6: a peer host. The host's authority runs in a Web Worker in the host's browser, with WebRTC between players and the existing Cloudflare signalling and TURN. The authority reaches the network only through Link/Session/PortFrame ports, so a Durable Object host can be added later.
- No gameplay change. SIM_VERSION is unchanged.

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

- **P0**: the design cannot work as a whole. For example, a required browser or vendor capability does not exist, or the design breaks determinism or the online recovery model with no path to fix it.
- **P1**: one of the following:
  - a requirement is wrong about the code or the vendor;
  - two implementers would build it differently;
  - a plan task would fail as specified;
  - a case hit in ordinary play is unhandled (the host tab hidden, a reload, a second tab, an Electron guest).
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
