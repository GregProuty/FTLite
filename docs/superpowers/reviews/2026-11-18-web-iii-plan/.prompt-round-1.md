## Role
<!-- reuse -->

The subject is a short implementation plan for the code part of Web-iii of the FTLite web build. Its centrepiece is `scripts/web/live-smoke.ts` (`npm run test:web-live`). The owner runs it after their first Vercel deploy, against the live `*.vercel.app` site, in two stages:
1. **Passcode and cache headers:** it checks the passcode protection and the cache headers, both without and with the cookie.
2. **Live duel:** it then runs a two-browser duel through the real UI, forced through TURN relay, and proves the relay was used through `getStats`.

The plan also writes the Web-iii owner steps into `docs/gates.md`.

Fresh subagents will execute the plan verbatim in `.worktrees/web-iii`. It must compile and run as written against the merged master (Web-i and Web-ii). It must never print the passcode or cookie. It must not change product code without a stated reason.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md` at commit `b42c7d7f`, in worktree `C:/Users/djuar/FTLite`, branch `master`.
- **Conformance:** the plan must follow `docs/superpowers/specs/2026-11-18-web-build-design.md` §5.2, §5.3, §6, §8 ("The live check") and §9 item 3, plus the Web-ii section of `docs/gates.md` (around L923-L950).
- **Code it builds on:**
  - the browser gates in `scripts/web/net/*` (`players.ts`, `scenario.ts`, `web-net-smoke.ts`);
  - `scripts/web/web-output.ts`;
  - `src/web/passcode.ts`;
  - `src/shared/onlineConfig.ts`;
  - `src/network/online/onlinePeers.ts`;
  - `src/renderer/src/ui/menuState.ts`, where the status line comes from.
- **Run dir:** `docs/superpowers/reviews/2026-11-18-web-iii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Secret handling.** Do the passcode and cookie never reach stdout, the JSON report, Playwright traces or error messages, including on failure paths? Are `--passcode` and `DEBUG=pw:` really refused?
6. **Header checks.** Do they match the Web-ii gate list exactly (401 plus the form without the cookie; 200 with `private, no-cache` with it; `version.json` `no-store`; the 503 hint)? Does the fake site use the real `handlePasscode`? Is "the prebuilt deploy wasn't broken by vercel.json's failing `buildCommand`" actually checked?
7. **The relay hook (L-relay).** It wraps `RTCPeerConnection` in an init script to force `iceTransportPolicy: 'relay'`:
   - Does it apply to every connection the page makes?
   - Does it run in the page's world before the game code?
   - Is the `getStats` proof sound in both Chromium and Firefox: selected pair, local candidate type `relay`, ≥1 KiB? Firefox may lack `bytesReceived` on candidate pairs (L522).
8. **Driving the real UI.** Reading the phase from the menu status line is assumed (L30) — check it against `menuMessage`. Accepting `ended` before 60 s (L32) is also assumed. Could a run pass without the duel ever really running?
9. **The `docs/gates.md` Web-iii steps.** Are they complete and correct?
   - the PowerShell forms;
   - `wrangler secret put ALLOWED_ORIGINS` run from `services/signalling`;
   - the order (secret, then deploy, then live smoke);
   - the rollback rule;
   - the playtest acceptance wording from spec §9.

## Reading manifest

**Plan and spec**
- `docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md:L1-L988`: the subject.
- `docs/superpowers/specs/2026-11-18-web-build-design.md`: §5, §6, §8 and §9.
- `docs/gates.md`: grep `Web-ii` and read that section.

**Code it builds on**
- `scripts/web/net/players.ts`, `scripts/web/net/scenario.ts`, `scripts/web/net/web-net-smoke.ts` and `scripts/web/web-output.ts`
- `src/web/passcode.ts`, `src/shared/onlineConfig.ts` and `src/network/online/onlinePeers.ts` (around L110)
- `src/renderer/src/ui/menuState.ts`: grep `menuMessage`.
- `package.json`: the scripts section.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p <config>` are fine. Never run the test suite or any vercel/wrangler command.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

The owner made these decisions, and they are not up for reversal. Flag a violation of one; do not propose replacing it.

- D2: a private site behind a passcode, deployed with `vercel deploy --prebuilt`.
- D4: Chrome, Edge and Firefox are tested on desktop.
- D5: the Vercel Hobby plan, `*.vercel.app`.
- D6: peer host over WebRTC, with Cloudflare signalling and TURN.
- No gameplay change. Product code changes only with a stated reason.
- The live smoke is run by the owner, not by CI. Its non-live core must be unit-testable.

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

- **P0:** the plan is unexecutable as a whole, or following it leaks the passcode or cookie.
- **P1:** any of these:
  - a task fails at execution (tsc, a missing interface, a wrong signature);
  - a step is a placeholder;
  - a spec check is missing;
  - the relay proof or the duel check can pass without the thing it claims;
  - a test does not cover the risky path.
- **P2:** should fix, not blocking.
- **P3:** nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
