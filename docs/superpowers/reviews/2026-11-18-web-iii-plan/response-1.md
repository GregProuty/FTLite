# Round 1 response (plan revised to a0905786)

I checked `round-1.json` against the plan at `b42c7d7f`. All 8 findings are accepted and fixed in plan commit `a0905786`. None were rejected or deferred.

## R1-F1 [P1]: The DEBUG refusal misses DEBUG=* and DEBUG=pw*, which turn on Playwright's protocol logs

Confirmed: a literal `pw:` check misses wildcard patterns. `debugCouldLogPasscode` now refuses:
- any non-negated `DEBUG` pattern containing `*` or starting with `pw`;
- a non-empty `DEBUG_FILE` or `PWDEBUG`.

Tests cover `*`, `pw*`, `foo,*` and `vite:*`.

## R1-F2 [P2]: Error text is cut short before redaction, and JSON-escaped forms of a secret are never redacted

Confirmed. A new `clip()` redacts before it cuts. It is used in the entry, in request failures and in page errors. `secretVariants` now includes the JSON-escaped form. Tests cover a passcode containing a quote, and one placed across the 700-character boundary.

## R1-F3 [P2]: A round that ends on one side only is accepted as a finished duel

Confirmed. A pure `playStep` now lives in `relay.ts`, with unit tests. An early end passes only when:
- both sides read `ended` within 5 s of each other;
- at least 20 s were played.

The report re-checks this.

## R1-F4 [P2]: The live version.json is never compared with the build that was just deployed

Confirmed. `compareDeployedVersion` compares the live file with `.vercel/output/static/version.json` and fails on a mismatch. When the local file is absent, the report records `versionCompared: false`. Tested.

## R1-F5 [P2]: Step 7's dry run hits a real *.vercel.app host, against the plan's own rule

Confirmed. The dry run now uses `https://ftlite-dry-run.invalid`, which can never resolve (RFC 6761).

## R1-F6 [P2]: The rollback advice leads with `vercel rollback`, which has nothing to roll back to on the first deploy

Confirmed. `TAKE_DOWN` and gates step 6 now say:
- for the first deploy, delete it (`npx vercel rm <url> --yes`, or Dashboard → Deployments → Delete);
- for later deploys, use `npx vercel rollback`.

## R1-F7 [P3]: The Firefox fallback catches every launch error and reports it as 'not installed'

Confirmed. The run falls back to Chromium only on Playwright's missing-executable error. Any other launch error fails the run.

## R1-F8 [P3]: Error screens with a known message read as 'other', so a failed wait runs to its full timeout

Confirmed. `sessionHome` is added to the UI read, and `uiPhase` now returns `error` for these screens. Tested.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md

<!-- end -->
