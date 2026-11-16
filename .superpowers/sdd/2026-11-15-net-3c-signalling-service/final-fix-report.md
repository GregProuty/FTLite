# Net-3c combined final fix report

Worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, base `795ce73`. One implementer, no subagents/helpers/reviewers. The controller owns the final-validation/rulings documents, full root/build/native verification, and one scoped re-review. Its concurrent rulings-document edit was left unstaged.

## Result and interface contract

1. **Provisional publication and recovery:** `SocketDelivery.roster` withholds snapshots while activation is committed/unacknowledged. Join and socket-ticket operations return fixed retryable `unavailable` before seat/ticket consumption; socket authentication checks the same state before consuming its ticket and again after the domain await before publishing authentication. A denied raw authentication closes that new socket through the existing auth failure path; the ordinary client sees the earlier socket-ticket `unavailable`. Link issuance checks before work and after its awaits, preventing provisional identities from escaping. No wire or storage schema changed.
2. **Complete fence before departure:** Room fencing now sends the full lost roster before `host-departed`. The existing production client's non-authoritative lost-roster path adopts generation and host seat together, invalidates obsolete work, and retains checkpoint access. A later departure refers to that already-known generation. No client active-generation validation was relaxed, and no lease is created by roster/departure. Prepared-operation terminal accounting/generation burning is untouched and its integration remains green.
3. **Retired issuance correlation:** the client stores validated offerer issuance IDs separately from live routing, eligible only for link requests already pending at issuance with current host/own connection identity and matching guest generation. At most64 IDs each reference at most64 pending records (references, not copied payloads); the existing5-second request lifetime bounds retention. Settlement removes the request's references; successful attempt replies consume that ID globally once. Authority cancellation, timeout/detach/supersede and disposal clear evidence. Closed routes stay deleted. Late success returns its original attempt result but neither sends `link-ready` nor revives routing; attempting readiness on the retired ID rejects `stale-generation` locally. Never-issued, pre-request and already-consumed reply IDs are rejected.
4. **Service tooling:** exact service Vitest4.1.12 plus its seven exact Vitest companion packages; root Vitest3.2.7/root manifest/root lock unchanged. Runtime pins remain Wrangler4.156.0, plugin1.4.11, workerd1.20261023.1, Miniflare5.20261023.3-beta, Workers types5.20261029.1, TypeScript5.8.3, MSW2.14.7. README/spec record the current pin and publication/correlation contract; historical validation remains historical.

Controller decisions were requested for the concrete publication and existing-wire ambiguities, and approved before completion. New join/auth attempts may be transiently refused during the committed interval; already-connected survivors keep their recovery path. Correlation stays within the existing wire, which has no requestId or guestSeatId in `link-issued`.

## RED / GREEN evidence

Commands used the root cwd above unless marked **service**, meaning its `services/signalling` child. Exact relevant output is recorded below; no fixtures, timings or floors were relaxed.

- **service** `npm test -- tests/clientIntegration.test.ts -t 'provisional rehost'`: RED on unmodified publication code, `2 failed | 4 skipped`; both held/lost post-commit acknowledgements produced `expected ... 'forbidden' but got 'invalid-state'` after unrelated guest retirement. The invalid-state came from the production client detaching on the provisional active roster. After roster/join/auth/fence gates: `2 passed | 4 skipped`.
- **service** `npm test -- tests/clientIntegration.test.ts -t 'provisional rehost|asynchronously retired'`: added a claimant link request while committed; RED `2 failed | 1 passed | 4 skipped`, `expected ... 'unavailable' but got 'invalid-frame'`. This demonstrated a second provisional publication boundary through real link issuance. Added pre/post-await issuance checks; `npm test -- tests/clientIntegration.test.ts`: GREEN `7 passed` on4.1.0, later expanded to `8 passed` on4.1.12.
- `npm test -- tests/roomServiceClient.test.ts -t 'issuance replies|attempt evidence'`: RED against the original client, `3 failed | 1 passed | 49 skipped`. Retired issued/closed/reply rejected `invalid-frame`; pre-request and reused IDs incorrectly resolved. After separate bounded evidence: GREEN `4 passed | 49 skipped`.
- The unit regression overlaps two issuance requests, closes A, keeps B live, replies B then A, rejects readiness for A without sending it, and successfully readies B. Additional cases reject unknown/pre-request/reused evidence. Real service regression wraps only the request boundary, awaits the real issuance, retires it through the real `SignalCoordinator.invalidate`, then lets the real correlated reply arrive. Both production clients stay connected and complete unrelated ready requests.
- `npm test -- tests/roomServiceClient.test.ts -t 'retired issuance evidence'`: final `3 passed | 53 skipped`, proving64 admitted retired IDs,65th rejection, and freeing the full evidence capacity on settlement/authority cancellation. Initial supplementary test run had two test-fixture errors (`conflict` incorrectly marked retryable); corrected to the established nonretryable contract, with no production change for those failures.
- **service** initial full patched-tooling `npm test`: `1 failed | 221 passed`, plus one unhandled assertion from the failing test's early exit. The older test `fences an unacknowledged start when a required ready route is replaced during Directory acknowledgement` still expected provisional issuance to succeed. Updated it to assert the new `unavailable` contract and retire the real existing required route via the coordinator. It continues to verify unchanged roster revision, lost readiness, fencing/no started event and released charge. **service** `npm test -- tests/activationRaces.test.ts`: `18 passed`; final full suite below is green with no unhandled assertion.

Actual client/runtime rehost coverage now includes real Directory commit before acknowledgement is held/lost; local committed generation2 and changed host seat; unrelated guest socket close plus explicit roster publication; rejected provisional join/ticket/link operations; timely acknowledgement yielding the sole host-changed/grant; forced original lease expiry before a held acknowledgement returns; lost checkpoint access preserved for both survivors; no host-changed for failed generation2; and a fresh explicit claim for generation3 by the original host. The pre-existing prepared-operation fencing integration remains unchanged and passes. Tests force durable deadline expiration rather than increasing timing budgets.

## Final verification

- **service** `npm test` on Vitest4.1.12: exit0, **14 files /222 tests passed**,20.02s. All original lifecycle/SQLite/hibernation/protocol/TURN suites included. The two intentional missing-table diagnostics remain visible, plus the attributed upstream warning below. No failed tests or unhandled rejections in this final run.
- `npm test -- tests/roomServiceClient.test.ts tests/contentDigest.test.ts` on root Vitest3.2.7: exit0, **2 files /87 tests passed** (client56, digest31),3.31s after the final test edits.
- **service** `npm run typecheck`: exit0, `tsc --noEmit`, no diagnostics.
- Root `npm run typecheck`: exit0, `tsc -b`, no diagnostics. Subsequent changes were the activation-race expectation and comments/documentation only; production source was already final at this check.
- **service** `npm run build`: exit0, `wrangler deploy --dry-run --outdir dist`, Wrangler4.156.0, **110.09KiB /22.80KiB gzip**, `--dry-run: exiting now.` Only ROOM/DIRECTORY bindings printed. No deploy or account action.
- **service** `npm audit --json`: exit0, `vulnerabilities: {}`, metadata info0/low0/moderate0/high0/critical0/**total0**. The two previously recorded Vitest/mocker advisories are absent.
- **service** `npm ls vitest @cloudflare/vitest-plugin wrangler @cloudflare/workers-types --depth=0`: exact installed versions4.1.12/1.4.11/4.156.0/5.20261029.1, exit0.
- `git diff --check`: exit0. Only repository LF-to-CRLF notices. Root manifest/lock diff is empty. No temporary warning instrumentation remains.

The install command was **service** `npm install --save-dev --save-exact vitest@4.1.12`: changed8 packages, audit0. npm printed existing allow-scripts notices for esbuild/MSW/workerd; no approval command or allowlist was changed. Subsequent real runtime tests/dry-run succeeded with installed tooling.

## Exact warning attribution and residual

The pending-header TURN abort warning persists on4.1.12:

`An event handler returned a promise that will be ignored. Event handlers should not have a return value and should not be async functions.`

Diagnostic command: **service** `npm test -- tests/turn.test.ts -t 'aborts a stalled provider'`. The uninstrumented run passed1 test (50 skipped), with the warning. A temporary wrapper on `AbortSignal.prototype.addEventListener` in that single test captured listener registration stacks and whether the actual invoked callback returned a thenable, without exposing event values. (An initial EventTarget-prototype wrapper observed no callbacks, so instrumentation was moved to the actual AbortSignal prototype.) The deliberate diagnostic assertion printed:

- `@mswjs/interceptors/src/utils/handleRequest.ts:106`: abort listener returned **false** for thenable.
- `msw/src/core/handlers/RequestHandler.ts:358`: abort listener returned **true** for thenable.
- Owned test abort callback: returned **false** for thenable.

Installed **MSW2.14.7** source `services/signalling/node_modules/msw/src/core/handlers/RequestHandler.ts:358-360` registers `() => this.runScheduledCleanups(args.requestId)`. At line535, `runScheduledCleanups` is `private async ...: Promise<void>`. The arrow implicitly returns that promise, exactly matching the workerd warning. This is distinct from the owned abort callback and interceptor's void callback. The diagnostic wrapper and failing diagnostic assertion were removed completely; only a source comment recording attribution remains.

Impact: synthetic provider abort/deadline/redaction/quota assertions pass; production TURN behavior was not downgraded. The warning is an upstream test-interception listener compatibility issue. It is left visible rather than patching an additional pinned framework or suppressing diagnostics. The deliberate `room_meta`/`directory_rooms` missing-table errors also remain visible.

## Self-review and remaining boundaries

- Publication checks cover roster, HTTP join/ticket, authentication both before SQL consumption and after await, and issuance before and after await. Lost fence precedes departure with both generation and host seat; no standalone departure advances client generation.
- No new SQL schema/tables/transactions or network awaits inside transactions. Directory terminal barrier and retry outcomes are unchanged. Existing original15s lease/original24h deadline, five-second bodies, current-authority checks, bounded queues, and guest seat generation on both RTC endpoints remain intact.
- Correlation evidence holds IDs/references only, no credentials/routing. The current wire cannot prove exact guest/request pairing among simultaneous equal-generation link requests. The controller explicitly accepted this pre-existing authenticated-service limitation for the no-wire fix; consumed/never-issued/pre-request IDs still fail. No protocol expansion is claimed.
- No gameplay/SIM35/snapshot2/replay2/3/goldenb87a0284 changes, fixture blessing, acceptance/engines rerun, cloud configuration, live TURN, secret, deployment or global process action. No simulation imports added.
- UI/token persistence, automatic reconnect/rehost/mirrors, utility lease gate and safe online authority remain deferred3d/3e; no online/demo readiness claim. WAN/forced relay/two-machine proof remains unclaimed.
- Parent still owns fresh full root suite/build/native gate and the one scoped re-review. Implementation task is ready for those gates.

Implementation commit: **7598a47cf05b449316430fa5bda0a3125427db9c**, `fix(net): fence provisional publication and retain issuance correlation` (13files). Only the controller-owned rulings edit remains unstaged. This ignored `.superpowers` report stays available at the requested path.
