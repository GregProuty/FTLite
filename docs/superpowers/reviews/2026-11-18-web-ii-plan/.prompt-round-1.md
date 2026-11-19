## Role
<!-- reuse -->

The subject is an implementation plan for part Web-ii of the FTLite web build. Web-ii covers four things:
- `npm run build:web`, which writes Vercel Build Output API files with a passcode Routing Middleware;
- `deploy:web`;
- the `version.json` update banner;
- the browser behaviour in spec §7 and the new Playwright browser network gates.

It builds on Web-i (merged at master `121700ed`), which moved the online stack into the page and the host's authority into a Web Worker.

Fresh subagents will execute the plan task by task, verbatim, in the worktree `.worktrees/web-ii`. Each of these is a defect:
- anything left to "check at execution";
- any interface that does not exist with the assumed shape;
- any step that would fail to compile or run as written;
- any vendor (Vercel) claim that is wrong.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-web-ii-web-build.md` at commit `149da7b5`, in worktree `C:/Users/djuar/FTLite`, branch `master`.
- **Conformance:** the plan must follow the converged spec `docs/superpowers/specs/2026-11-18-web-build-design.md`, §5, §7, §8 (browser and passcode gates) and §9 item 2.
- **Web-i, which it builds on:** `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md` (Global Constraints, deviations D-1 to D-10) and the `docs/gates.md` Web-i section.
- **The codebase it changes:**
  - `src/renderer/src/main.ts`, `src/renderer/src/app/online/*` and `src/renderer/src/ui/**` (store, menu, Settings, banners);
  - `src/shared/onlineConfig.ts` and `src/network/online/recordStore.ts`;
  - `src/main/network/duelRecords.ts`;
  - `electron.vite.config.ts`, `package.json` and `tsconfig*.json`;
  - `scripts/network/*` (the Web-i gates and `page-port-tracker.ts`);
  - `services/signalling/scripts/local-runtime.ts`.
- **The run dir:** `docs/superpowers/reviews/2026-11-18-web-ii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified? Pay particular attention to decisions W-1 to W-10 at plan L47-L59.
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **The Vercel facts (plan L38-L46 and Task 3).** Check each one against what you know:
   - the Build Output API v3 layout;
   - the Edge middleware as `functions/*.func` with `.vc-config.json`;
   - the `x-middleware-next` pass-through;
   - `config.json` routes with `continue`;
   - Routing Middleware on Hobby;
   - whether `process.env` reaches Edge middleware in a prebuilt deploy (L45).

   Does each check that Web-ii cannot run have an explicit Web-iii check, or a fallback?
6. **Cache-Control (L658).** Can a `config.json` route `headers` entry with `continue` really override Vercel's default static Cache-Control? Is `private, no-cache` (W-2) consistent with spec §5.3's `Cache-Control: private`?
7. **Passcode security (Task 1).**
   - Is the HMAC cookie constant-time compared?
   - Is the expiry checked?
   - Do the passcode page and `/__pass` really exclude every other path, including the Worker script, `version.json` and `/assets/paid/*`?
   - Is the 1 s failure delay real?
   - Is the secret decoded correctly from base64?
8. **Task 8 at L1656: the Web Lock.** `startApp` awaiting the Web Lock can hang the menu if `locks.request` never settles. Is there a timeout or fallback? Does Single player stay available, as spec §7.5 requires?
9. **Task 9: the IndexedDB upgrade.** Bumping the database from v1 to v2 to add `duelRecords` must not lose `records` (seat and mirror). Check:
   - `onupgradeneeded` handles both 0→2 and 1→2;
   - an old tab with v1 open gets `onversionchange`, and it is handled;
   - Electron also uses this database.
10. **Task 10: teardown moved from `beforeunload` to a non-persisted `pagehide`.** Does that break Web-i's `releaseForUnload`, the `hostVisibility` stopper, or the Electron close handshake (`src/main/appExit.ts`)?
11. **Task 11: the browser gates.**
    - Is the loopback ICE workaround for Chromium↔Firefox (mDNS / host-candidate obfuscation, L2479) workable, or a guess with no fallback?
    - Does the `beforeunload` dialog behave as assumed (L2255)?
    - Does `mirror.persistent` mean what the rehost step assumes (L2408)? Check it in `src/network/online/onlineMirrors.ts` and `onlineSession.ts`.
    - Is the `origin-refused` injection evidence too weak (L2510)?
    - Are the Web-i gate lessons applied:
      - port closure is asserted through `page-port-tracker`;
      - Worker exits are counted from `terminate()` only;
      - page calls have explicit limits;
      - each injection fails for its named reason?
12. **Task 7 at L1286: fullscreen.** Is the 1000 ms page-initiated window sound, and is the 100 ms Escape dedupe from spec §7.2 implemented?
13. **W-4 (Single player counts as a match).** Does this conflict with §5.4 (the banner never interrupts a match) or §7.6 (the leave prompt) in a way the owner would not expect?
14. **Dependencies.** Is `vercel@65.10.0` a real, pinned version? Are new dev dependencies to be added from the main checkout, not via `npm install` in the worktree?

## Reading manifest

**The plan, spec and Web-i context**
- `docs/superpowers/plans/2026-11-18-web-ii-web-build.md:L1-L2619`: the subject. Read it fully, in ranges.
- `docs/superpowers/specs/2026-11-18-web-build-design.md`: §5, §7, §8 and §9.
- `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md:L1-L80`: Web-i's constraints and deviations.
- `docs/gates.md`: the Web-i section (grep `Web-i`).

**Renderer and online**
- `src/renderer/src/main.ts`
- `src/renderer/src/app/online/pageSession.ts`, `hostVisibility.ts` and `lifecycle.ts`
- `src/renderer/src/ui/`: grep for the store, `settings`, menu, banner and fullscreen code the plan edits.
- `src/shared/onlineConfig.ts`, `src/network/online/recordStore.ts`, `onlineMirrors.ts` and `onlineSession.ts`

**Main process and build**
- `src/main/network/duelRecords.ts` and `src/main/appExit.ts`
- `electron.vite.config.ts`, `package.json`, `tsconfig.json`, `tsconfig.web.json` and `tsconfig.node.json`

**Scripts**
- `scripts/network/page-port-tracker.ts`, `scripts/network/duel-app-smoke.ts` and `scripts/network/online-app-smoke.ts`: the patterns the browser gates reuse.
- `services/signalling/scripts/local-runtime.ts`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p <config>` are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions (spec §1), and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- **D1:** the browser and Electron share one networking path.
- **D2:** a private site behind a passcode. It is built locally with the gitignored paid art and uploaded with `vercel deploy --prebuilt`. Vercel never builds from git.
- **D4:** Chrome, Edge and Firefox on desktop are supported and tested. Safari is untested. There is no mobile support.
- **D5:** the Vercel Hobby plan, at a `*.vercel.app` address.
- **No gameplay change.** SIM_VERSION is unchanged.
- **The spec as converged is the requirement.** Plan deviations must be stated and justified.
- **No deploys or secret changes in Web-ii.** Those are Web-iii, done with the owner's login.

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

- **P0:** one of these:
  - the plan is unexecutable as a whole;
  - following it exposes the paid art or the game without the passcode;
  - following it breaks determinism, online recovery, or Electron play.
- **P1:** one of these:
  - a task will fail at execution: tsc, a missing interface, a wrong signature, a wrong path, or a wrong Vercel layout;
  - a step is a placeholder a fresh implementer cannot follow;
  - a spec requirement is missing or silently changed;
  - a test cannot pass, or does not test the risky path;
  - a case hit in ordinary play is unhandled: a reload, a second tab, an upgrade from v1 IndexedDB, or a Firefox fullscreen exit.
- **P2:** should fix, not blocking.
- **P3:** nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
