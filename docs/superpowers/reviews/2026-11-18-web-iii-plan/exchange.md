# Codex review exchange: web-iii-plan

Subject: `docs/superpowers/plans/2026-11-18-web-iii-live-smoke.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 608d2b12, effort high, 447 s, 2557872 in / 2422632 cached / 42189 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The DEBUG refusal misses DEBUG=* and DEBUG=pw*, which turn on Playwright's protocol logs
parseLiveArgs only refuses a DEBUG value that contains the literal `pw:`. `DEBUG=*`, `DEBUG=pw*` and `DEBUG=-x,*` all enable Playwright's `pw:api`, `pw:channel` and `pw:protocol` namespaces through the `debug` module's wildcard matching, and the run would go ahead. The test only covers `pw:api`. · plan L236 `if (/pw:/.test(env.DEBUG ?? '')) throw …`; plan L124 tests only `DEBUG: 'pw:api'`; Global Constraints plan L22 promise that a pw: DEBUG run is refused. duel.ts types the passcode through `page.fill('#code', passcode)` (plan L620). The channel and protocol logs print fill's value or the matching `Input.insertText` text to stderr. · The plan's own secret rule (L22) depends on this refusal. A stray `DEBUG=*` in the owner's shell would print the passcode to the console, unredacted, because these logs bypass `redact`. · Refuse any DEBUG value that could enable a pw namespace. For example, throw when `(env.DEBUG ?? '').split(/[\s,]+/).some(p => p && !p.startsWith('-') && (p.includes('*') || p.startsWith('pw')))`. Also refuse a non-empty `DEBUG_FILE` or `PWDEBUG`. Add test cases for `DEBUG: '*'`, `DEBUG: 'pw*'` and `DEBUG: 'foo,*'`, and confirm `DEBUG: 'vite:*'`-style values still behave as decided.

### [P2] R1-F2 Error text is cut short before redaction, and JSON-escaped forms of a secret are never redacted
Several messages are truncated first and redacted later: the entry's `message()` cuts to 700 characters (L846, then L875 and L879), `request failed` cuts to 200 (L287) and page errors cut to 200 (L616). A secret that straddles the cut point survives only as a fragment, and no variant matches a fragment. Also, `secretVariants` (L257-L259) holds the raw, URL-encoded and form-encoded forms, but the report is redacted as JSON text (L884), and validateLiveReport also checks the JSON text (L824-L825). A passcode that contains `"` or `\\` appears escaped in the JSON, so both the redaction and the leak check miss it. · plan L846 `.slice(0, 700)`; plan L875 `report.failure = `${step}: ${message(error)}``; plan L879 redacts afterwards; plan L287, L616; plan L258 variants; plan L884 `redact(JSON.stringify(report, null, 2), secrets)`. · These are failure paths the review must clear (priority 5). Today the passcode only leaks if an error message contains it, but the code promises that *every* outgoing string passes through `redact` (L22), and these paths break that promise. · Redact before truncating everywhere: `message = (e, secrets) => redact(String(e?.message ?? e), secrets).slice(0, 700)`. Pass the secrets into duel.ts so the page-error capture can redact too, or redact the page errors in the entry before any slice. Add `JSON.stringify(s).slice(1, -1)` to `secretVariants`, and add a test for a passcode with a quote, plus one where a long error puts the passcode across the 700-character boundary.

### [P2] R1-F3 A round that ends on one side only is accepted as a finished duel
The play loop stops with `endedEarly = true` as soon as either side reads `ended` (`||`). It never checks that the other side is also `ended` or still `running`, and validateLiveReport accepts `endedEarly` with any `playedMs`. This decision logic lives in the untested duel.ts, not the pure module. · plan L669 `if (phases.host === 'ended' || phases.guest === 'ended') { endedEarly = true; break; }`; plan L821 skips the 60 s rule whenever endedEarly is true; plan L32 (L-3) states the early-ended deviation but not the one-sided case; spec L388 says 'play 60 s'. · Check 8 asks whether a run can pass without the duel really running. One host `ended` while the guest is in a non-running, non-error state, such as `reconnecting`, `saved` or an error text that reads as `other`, still passes if the leave clicks succeed. That is not a finished round. · Move the per-tick decision into relay.ts as a pure `playStep(phases, elapsedMs): 'continue' | 'ended' | string` and unit-test it. Accept `ended` only when both sides read `ended` within a few seconds of each other, and fail otherwise. Optionally require a floor such as `playedMs >= 2 * RELAY_SAMPLE_MS` for an early end, and record both phases at the end.

### [P2] R1-F4 The live version.json is never compared with the build that was just deployed
L-5 says the smoke 'proves that the prebuilt output is what is served'. In fact it only checks that `/` holds `<script` and that `version.json` is well-formed, and it records `build` and `sim`. A run against an older production deployment passes the same way, for example after a failed or skipped `deploy:web`, or after a `vercel rollback`. · plan L34 (L-5); plan L320 and L327-L328 check only shape; plan L864 copies the version into the report; gates step 4, plan L950, leans on this check to confirm the prebuilt output is live. · Check 6 asks whether 'the prebuilt deploy wasn't broken' is actually checked. As written, the check cannot tell this deploy from a previous one, and the gates text says it can. On every later deploy (gates step 4 says 'Each deploy'), this is the only automatic proof. · In the entry, if `.vercel/output/static/version.json` exists in the working directory (deploy:web writes it), read it and require `isDeepStrictEqual` with the live `version.json`, failing with 'the live site is not the build in .vercel/output'. If the file is absent, record `versionCompared: false` in the report. Add a unit test with a fake whose version differs.

### [P2] R1-F5 Step 7's dry run hits a real *.vercel.app host, against the plan's own rule
The executor is told to run the smoke against `https://ftlite-nonexistent-0.vercel.app`. That sends GET requests and a form POST to Vercel's edge. Anyone can claim that project name, in which case the subagent would be talking to a third party's site. It also contradicts the Global Constraint that no task runs the live smoke against a real site. · plan L916 `FTLITE_LIVE_URL=https://ftlite-nonexistent-0.vercel.app …`; plan L15 '**No task runs** … the live smoke against a real site.' · This is outward-facing network traffic from an autonomous executor, and its result depends on the state of an external domain, so it is not a reliable gate. · Use a reserved name that can never resolve, for example `https://ftlite-dry-run.invalid` (RFC 6761). HTTPS_ORIGIN at L226 accepts it. Every fetch then fails fast with a DNS error, which gives the same 'every check has a problem' path. Keep the `grep -c dry-run-code` check.

### [P2] R1-F6 The rollback advice leads with `vercel rollback`, which has nothing to roll back to on the first deploy
Web-iii is the first production deployment (gates L925, 'the first deploy is Web-iii'). The failure message and gates step 6 both say to run `npx vercel rollback` first. With no earlier production deployment, rollback has no target, so the owner's first action fails while the paid art may be exposed. · plan L865 'Roll the deploy back now (npx vercel rollback)'; plan L960 step 6 'run `npx vercel rollback` at once, or delete the deployment'; docs/gates.md:L925 and L938. · The rollback rule exists for the case where paid art is reachable without the cookie. In that case the first instruction must work. · For the first deploy, lead with deleting the deployment: `npx vercel rm <deployment URL printed by deploy:web> --yes`, or Dashboard → Deployments → Delete. Keep `npx vercel rollback` for later deploys. Put both in the message at L865 and in step 6, and mark which applies when.

### [P3] R1-F7 The Firefox fallback catches every launch error and reports it as 'not installed'
`catch { fox = null; }` swallows any `firefox.launch` failure, including a broken install, a version mismatch or a timeout. The report then says `chromium (Firefox not installed)` and the run can pass with Chromium only. · plan L642; plan L685; L-7 at plan L36; D4 names Firefox. · A Firefox regression would be hidden behind a PASS line with a misleading reason. · Fall back only when the error matches Playwright's missing-executable message (`/Executable doesn't exist|npx playwright install/`). Record any other error in the report, or fail on it.

### [P3] R1-F8 Error screens with a known message read as 'other', so a failed wait runs to its full timeout
When `status.error` maps to an ERRORS string, menuMessage prints that string (for example 'Room not found…'), and Retry is only shown when it is offered. uiPhase then returns 'other' rather than 'error', so `until` waits the whole 20-30 s instead of failing at once. The failure is still caught, just slowly. · src/renderer/src/ui/menuState.ts:L90; src/renderer/src/ui/menu/SessionPage.tsx:L98 and L103 (`home` is shown for phase idle or error); plan L540. · The error is caught later than it could be, and the reason it reports is a timeout rather than the real cause. · Add a `sessionHome` flag to UI_READ_SOURCE (`[data-testid="home"]` present while the title is not Home). Make uiPhase return 'error' when that flag is set and the status is not a phase word, and add a test case.

## Verified
- src/web/passcode.ts:L4-L5 exports PASS_COOKIE, PASS_PATH, PASS_MAX_AGE_S and WRONG_PASSCODE_TEXT; L8 PasscodeEnv, L13 isNext and L73 handlePasscode have the shapes the plan imports at L88 and L210. The 503 page has no form (L63, L75), which the test's 4-check stop at plan L144 relies on.
- Traced each runHeaderChecks test against handlePasscode. The passing site gives 401×4, POST 401 then 303, then 200×4 with the cookie, and 2 secrets. The 503 case stops after 4 checks. The wrong-passcode case gives 6 checks and the 'right passcode:' problem prefix. The leak and cache-header regexes match the problem strings at plan L298, L319 and L326.
- The header checks match the Web-ii gate list (docs/gates.md:L936-L939): 401 with the form for `/`, the Worker and the paid file (plus version.json, per spec §5.3 L239); 200 with `private, no-cache` with the cookie; version.json 200 with `no-store`; the 503 hint naming Production and redeploy. The fake site uses the real handlePasscode (plan L100).
- scripts/web/web-output.ts:L34 has `function validVersion(value: any): boolean {`, exactly as Task 1 Step 3 quotes it. Its key/sim/digest rules accept the test VERSION (plan L92).
- scripts/web/net/players.ts:L10 exports GateKey and L43 exports `bounded(work, ms, label)`, matching plan L377 and L579.
- The menu phase read: Menu.tsx:L40 always renders `data-testid="status"` from menuMessage, including on the strip. menuMessage (menuState.ts:L92) prints `${phase}${pending?'…':''}` on the session page. Lobby shows LOBBY_MESSAGE (L91) and the title 'Lobby' (Menu.tsx:L39). The PHASES list at plan L534 equals OnlinePhase (src/shared/onlineSession.ts:L36).
- Room code: SessionPage.tsx:L31 shows the bare code in the lobby and L27 shows `ROOM <code>` on the strip, and roomCodeOf handles both. The test ids multiplayer, host, join, crew-2, create-room, join-room, ready, start and leave exist (Multiplayer.tsx:L11-L12, HostForm.tsx:L21/L23, JoinForm.tsx:L16/L19, SessionPage.tsx:L82-L83/L101, Home.tsx:L12). They are the same sequence scenario.ts:L65-L72 uses.
- Relay hook: onlinePeers.ts:L110 hard-codes 'all', and peer.ts:L57/L203 builds the connection with `new RTCPeerConnection(config)` at call time, so a global subclass installed by addInitScript is picked up. No webkitRTCPeerConnection or worker-side RTC was found under src. The relay-hook, stats-read, uiPhase, roomCodeOf and relayVerdict unit tests trace correctly against the code given.
- relayVerdict fails safe. A missing hook gives null stats and then [] samples, which fails. An ended run with fewer than 2 connected samples (an end before about 10 s) fails. A non-relay local candidate fails.
- Task ordering: Task 3 consumes only what Tasks 1 and 2 produce. report.ts imports secretVariants (Task 1) and LIVE_PLAY_MS/LiveDuelReport (Task 2).
- package.json:L26 has the exact `test:web-net` line Task 3 anchors on, and there is no existing `test:web-live`. tests/webDeployScripts.test.ts:L6 defines `pkg`, L7 has `describe('deploy:web'` and L15 has the 'never commits .vercel/' case.
- docs/gates.md:L944 matches the line Task 3 Step 8 replaces word for word, and the Web-ii section (L923-L946) ends the file, so 'append at the end' is correct.
- tsconfig.web.json includes `scripts/**/*` and `tests/**/*` with lib DOM, so the new files are typechecked by `tsc -b`. The vitest config (vitest.config.ts:L11) uses the node environment and `tests/**/*.test.ts`. Request with a cookie header and `headers.get('set-cookie')` are already used this way in scripts/web/web-output.ts:L61/L71.
- Gates steps: the order is secret, then wrangler deploy (step 3), then deploy:web (step 4), then the live smoke (step 5). `wrangler secret put ALLOWED_ORIGINS` runs from services/signalling with `null,https://<project>.vercel.app` (spec L263, L405). The PowerShell SecureString→BSTR form is valid. Step 7 reproduces spec §9 'Done means' (spec L411). The deviation from the spec's listed order (Vercel link before the Cloudflare secret) is harmless, since the origin needs the project name.
- No `src/` change and no SIM change. The only non-new edit is the validVersion export (plan L16, L57).

## Not verified
- Whether Playwright 1.48's `page.evaluate<R>(string)` overload type-checks as written (L585-L586). I did not read node_modules. The plan gives a cast fallback at L696.
- Whether Firefox's candidate-pair stats carry `bytesReceived` and `selected` (plan L517, L522). If they don't, relayVerdict fails with 'only 0 bytes'. That is a false FAIL, not a false pass, but it would block a Firefox PASS. A fallback to transport or data-channel byte counts would be safer. This is unverified because I cannot check browser behaviour without running it.
- Whether Playwright Firefox's addInitScript runs in the page's main world before page scripts, and whether subclassing Firefox's RTCPeerConnection keeps working. The `__ftliteLive` check at plan L631 would catch a missing hook, but not a subclass that misbehaves.
- Whether Vercel passes the middleware's `Location: /` and a single Set-Cookie through unchanged (plan L311). A rewritten absolute Location, or an extra platform cookie merged into `headers.get('set-cookie')`, would make the right-passcode check fail falsely. `getSetCookie()` would be more robust.
- Whether a production duel can reach `ended` within 60 s with an idle crew (the case L-3 exists for). This affects how often the early-end path runs, not whether it is correct.
- I did not run typecheck or any tests (read-only review). The executability conclusions come from reading the source.

---

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

---

