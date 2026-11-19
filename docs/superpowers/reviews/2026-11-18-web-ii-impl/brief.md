## Role
<!-- reuse -->

The subject is the implementation of part Web-ii of the FTLite web build, on branch `web-ii`. Web-ii adds:
- `npm run build:web`, which writes a Vercel Build Output with a passcode Routing Middleware in front of every file;
- `deploy:web` and the owner's deploy steps;
- the `version.json` update banner;
- all browser behaviour from spec §7: keys and mouse, fullscreen, audio unlock, the support check and the Safari note, the one-online-tab Web Lock, storage persistence, IndexedDB duel records and the playtest-log download, the leave prompt and `pagehide` teardown;
- Playwright browser network gates.

It also contains a product fix to Web-i's transport (`b532961f`): `retire()` used to drop the close frame, so browser hosts never saw a guest leave.

The branch is about to merge to master and then be deployed by the owner as a private, passcode-protected site. It must be correct against its plan and spec, and it must keep the paid art and the game unreachable without the passcode. It must not break Electron play, determinism, or Web-i's online recovery. A passcode bypass or an upgrade that loses the saved seat or mirror is a release blocker.

## What to review

- THE SUBJECT (impl): `master...HEAD` at commit `67d6534d`, in worktree `C:/Users/djuar/FTLite/.worktrees/web-ii`, branch `web-ii`. HEAD already includes a merge of current master (SIM 54).
- **Plan:** `docs/superpowers/plans/2026-11-18-web-ii-web-build.md`. Read its Global Constraints, Vercel facts and decisions W-1 to W-10 at L1-L70. Its gate results are near the end.
- **Spec:** `docs/superpowers/specs/2026-11-18-web-build-design.md`, sections §5, §7, §8 and §9 item 2.
- **Web-i context:** `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md:L1-L80` and the Web-i and Web-ii sections of `docs/gates.md`.
- **Run dir:** `docs/superpowers/reviews/2026-11-18-web-ii-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec and plan.** Every behaviour the plan promised should be present and right.
2. **The invariants named in the focus notes below.** Trace each one through the diff.
3. **`tsc --noEmit` is clean.** Run it, and run lint if the project has it.
4. **Test adequacy for the risky paths.** Check that the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Passcode, end to end.** Cover `src/web/passcode.ts`, `src/web/middleware.ts`, `scripts/web/web-output.ts` and `check-output.ts`:
   - the passcode compare and the HMAC compare run in constant time;
   - the expiry window is enforced;
   - the middleware runs first for every path, including `/`, unknown paths and paths with query strings;
   - `.vc-config.json` has `envVarsInUse`;
   - Cache-Control is `private, no-cache` on game files and `no-store` on `version.json`;
   - the output check runs the bundled file.
7. **`--test` and `--allow-missing-paid` can never reach `.vercel/output` or `deploy:web`** (`build/webBuild.ts`).
8. **The IndexedDB upgrade from v1 to v2** (`src/network/online/recordStore.ts`, the duel record store). `records` must survive, every opener must use one version, and `onblocked`/`onversionchange` must be handled, both in the browser and in Electron's page.
9. **Start-up.** Neither the Web Lock nor the support check can hang the menu or throw out of `startApp`. Single player must always be available. A busy lock is retried, and the lock is released on a non-persisted `pagehide`.
10. **Teardown.**
    - It runs once, on a non-persisted `pagehide`, and never on a bfcache `pagehide`.
    - Web-i's `pageSession` handles its own `pagehide`.
    - The leave prompt never appears in Electron.
    - Electron's close handshake (`src/main/appExit.ts`) still works.
    - Does Electron lose any teardown that `beforeunload` used to run?
11. **Fullscreen** (`browserFullscreen.ts`). The keyboard-lock path, or the fallback Escape rule with its page-initiated flag and 100 ms dedupe. Is the lock released if fullscreen exits while `lock()` is still pending?
12. **The transport fix (`b532961f`, `src/network/transport/owner.ts`).** Check that it is correct, that it causes no duplicate close on any path, and that the regression test asserts the frame itself.
13. **The browser gates** (`scripts/web/net/*`, `test:web-net`).
    - The duel-agreement check compares runId, sequence, tick and hash.
    - The IndexedDB mirror is read before Reconnect.
    - The origin-refused injection fails for its named reason.
    - The console-error detection must not silently undercount. It depends on the `FTL_DEBUG` "DBG" line format, and the comment in `online-app-smoke.cjs` is stale.
14. **The merge of master (`67d6534d`).** Check that the own-ship-window and asteroids-ii changes still pass through the web paths, and that no new master code bypasses `createPageOnline` or the page guards.

## Reading manifest

**The diff**
- `.superpowers/sdd/web-ii-impl.diff`: the prepared diff `master...HEAD`, about 228 KB. It holds the commit list, the stat and the full diff with 8 lines of context, excluding `docs/superpowers/reviews` and `package-lock.json`. Read it in ranges with `sed -n`. The lock file adds the Vercel CLI tree (495 packages added, none removed or changed).

**Plan and spec**
- `docs/superpowers/plans/2026-11-18-web-ii-web-build.md:L1-L70`, plus the task sections as needed.
- `docs/superpowers/specs/2026-11-18-web-build-design.md`: §5, §7, §8 and §9.

**Key source**
- `src/web/*`, `build/webBuild.ts`, `build/rendererConfig.ts`, `vite.web.config.ts`, `electron.vite.config.ts`, `scripts/web/*.ts` and `package.json`
- `src/renderer/src/main.ts` and `src/renderer/src/app/web/*`
- `src/renderer/src/app/online/pageSession.ts`
- `src/network/online/recordStore.ts`, the duel record store, `src/renderer/src/net/duelRecord.ts` and `src/main/network/duelRecords.ts`
- `src/network/transport/owner.ts`
- `src/renderer/src/ui/**`: the store, menu, Settings and banner files the diff touches.
- `scripts/web/net/*` and `scripts/network/online-app-smoke.cjs`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p <config>` are fine. Never run the test suite, the Electron or browser gates, or any vercel or wrangler command.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions, and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- **D1:** one networking path for the browser and Electron.
- **D2:** a private site behind a passcode. It is built locally with the gitignored paid art and uploaded with `vercel deploy --prebuilt`. Vercel never builds from git.
- **D4:** Chrome, Edge and Firefox on desktop are tested. Safari is untested, and there is no mobile support.
- **D5:** the Vercel Hobby plan, at a `*.vercel.app` address.
- **No gameplay change.** SIM_VERSION is unchanged by this branch (master is at 54).
- **The spec and plan as converged are the requirement.** Decisions W-1 to W-10 were accepted at plan review.
- **No deploys in Web-ii.** The signalling service is already redeployed by the owner.

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

- **P0:** any of these:
  - a passcode bypass, or paid art or game files served without the cookie;
  - a test or missing-art build that can be deployed;
  - loss of the saved seat or mirror on upgrade;
  - merging breaks Electron play, determinism or online recovery with no workaround.
- **P1:** any of these:
  - a behaviour the spec or plan promised is missing or wrong;
  - a case hit in ordinary play is mishandled (reload, a second tab, fullscreen exit, closing the tab, a hidden host, an Electron close);
  - tsc fails;
  - a test does not exercise the risk it claims to cover.
- **P2:** should fix, not blocking.
- **P3:** nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
