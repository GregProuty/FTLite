## Role
<!-- reuse -->

The subject is the implementation of the code part of Web-iii of the FTLite web build, on branch `web-iii`. It adds:
- `npm run test:web-live`, which the owner runs against the live passcode-protected Vercel site after the first deploy. It checks the passcode and cache headers without and with the cookie, compares `version.json` against the local build, runs an optional service preflight, and then plays a two-browser duel through the real menu, forced through TURN relay and proven from `getStats`.
- `npm run test:web-live-local`, a local pre-flight of the same duel driver.
- A shared `scripts/web/net/stack.ts`.
- The Web-iii owner steps in `docs/gates.md`.

The branch is about to merge to master, and the owner will then run it live. It must never print or write the passcode or cookie. It must not pass without a real relayed duel, and it must not change product code. A secret leak is a blocker. So is a check that can pass without testing what it claims.

## What to review

- THE SUBJECT (impl): `master...HEAD` at commit `14cd1b03`, in worktree `C:/Users/djuar/FTLite/.worktrees/web-iii`, branch `web-iii`.
- **The plan:** `docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md`, including its Global Constraints.
- **The spec:** `docs/superpowers/specs/2026-11-18-web-build-design.md`, §5.3, §8 ("The live check") and §9 item 3.
- **The run dir:** `docs/superpowers/reviews/2026-11-18-web-iii-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec and plan.** Check every behaviour the plan promised is present and right.
2. **The invariants named in the focus notes below.** Trace each one through the diff.
3. **A clean `tsc --noEmit`.** Run it, and run lint if the project has it.
4. **Test adequacy for the risky paths.** Check that the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Secret handling, end to end.**
   - Check the passcode comes only from `FTLITE_LIVE_PASSCODE`, and that the `DEBUG`, `DEBUG_FILE` and `PWDEBUG` refusals hold.
   - Check every output path is redacted, before any clipping, with the passcode and cookie variants: stdout, the JSON report, thrown errors, page errors, request failures and the top-level catch.
   - Check the report validator rejects leaks.
   - Check the docs read the passcode with `Read-Host -AsSecureString`.
7. **The relay proof and the duel.**
   - The relay hook must wrap every `RTCPeerConnection`.
   - The `getStats` proof must read the selected pair on each side, check that its local candidate type is `relay`, and see at least 1 KiB of traffic.
   - `playStep` must accept an early end only when both sides have ended within 5 s and at least 20 s have been played.
   - Check the run cannot pass without a real relayed duel.
   - Check the leave and "Connecting" fixes.
8. **The `stack.ts` refactor.** It moved the web-net startup out of `web-net-smoke.ts`. Check that `test:web-net` behaviour is unchanged: the same servers, origins, cleanup and injection.
9. **The `docs/gates.md` Web-iii steps.**
   - Check the order: local pre-flight, then login and link, then env vars, then the wrangler secret, then deploy, then the live smoke, then take-down, then playtest.
   - Check the PowerShell is correct.
   - Check the take-down rule is right: delete the first deploy, roll back later ones.
   - Check the first-deploy check of `vercel.json`'s failing `buildCommand` is there.
   - Check no older line contradicts these steps.

## Reading manifest

- `.superpowers/sdd/web-iii-impl.diff`: the prepared `master...HEAD` diff (about 94 KB), excluding `docs/superpowers/reviews`. Read it in ranges with `sed -n`.
- `docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md`
- `scripts/web/live/*.ts`, `scripts/web/live-smoke.ts`, `scripts/web/net/stack.ts`, `scripts/web/net/web-net-smoke.ts` and `scripts/web/web-output.ts`
- `src/web/passcode.ts`, plus `src/renderer/src/ui/menu/SessionPage.tsx` and `menuState.ts` for the test ids and status text
- `docs/gates.md`: the Web-ii and Web-iii sections

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p <config>` are fine. Never run the test suite, the gates, or any vercel or wrangler command, and never contact a real site.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions, and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- **D2:** a private passcode site, deployed with `vercel deploy --prebuilt`.
- **D4:** tested on Chrome, Edge and Firefox desktop.
- **D6:** a peer host over WebRTC, with Cloudflare signalling and TURN.
- **No product code change.**
- **The live smoke is run by the owner, not by CI.**

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

- **P0:** a passcode or cookie leak, or the live check passing without a real relayed duel or without the header checks.
- **P1:**
  - a promised behaviour is missing or wrong;
  - `test:web-net` regressed through the refactor;
  - tsc fails;
  - an owner step is wrong in a way that breaks the deploy or exposes the site;
  - a test does not cover its risk.
- **P2:** should fix, not blocking.
- **P3:** nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
