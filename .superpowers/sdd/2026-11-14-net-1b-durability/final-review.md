# Net-1b whole-branch review — Round 1

Scope: `0390bda..1a755f8`, binding foundations specification and approved durability plan, with the final review brief and ledger rulings. Reviewed the production/scripts/docs diff, relevant final implementation and meaningful tests from the complete U3 change set. Earlier task approvals were treated as context, not substituted for cross-task inspection. Mechanical HUD/import migrations were not repeated; neither large fixture was loaded wholesale. No production, test, index or branch changes were made.

**Readiness verdict: changes required. Two P2 durability findings remain.** They occur at the public external-restore boundary and are not exercised by the deterministic replay continuation or headless bot-reset coverage. The implementation is otherwise consistent with the reviewed Net-1b scope. Final all-gate validation remains pending after fixes; the historical green gate does not certify the final commit.

## C-001 — P2: restore silently accepts attached producers that it cannot resynchronize

Primary location: `src/renderer/src/authority/authority.ts:60-69`. Related paths: `authority/core.ts:77`, `clientControl/clientRun.ts:32`, `clientControl/cardController.ts:99` and `:130`, `headless/runner.ts:85-89`.

The binding specification's section 3 declares restore as `// paused, before reattaching producers`. That lifecycle precondition takes precedence over the integration note's assumption that arbitrary attached producers can continue. The public implementation nevertheless silently keeps and automatically reattaches existing links, raises publication/event/control counters so persistent clients accept the restored state, and restores the command ledger to the checkpoint's earlier high-water. The existing client's `nextSequence` only increases during reconciliation. If any commands were accepted after the checkpoint, the producer and restored ledger now disagree permanently. Result reconciliation does not repair that disagreement. Because external restore forces pause, even resuming becomes impossible through that client. This is an unenforced restore lifecycle boundary, not a requirement to implement general live rollback or an epoch protocol in Net-1b.

Executed a narrow public-API probe using `createAuthority`, `createClientRun`, the real loopback, and `pauseActions`, with one player and a fixed clock. Save checkpoint at tick 0/watermark 0; accept pause ID 1 and resume ID 2; restore the saved checkpoint without replacing the client; attempt resume twice. Actual output:

```json
{"restored":{"nextSequence":3,"water":[0],"phase":"paused"}}
{"id":3,"status":"rejected","reason":"expected-sequence","nextSequence":4,"water":[0]}
{"id":4,"status":"rejected","reason":"expected-sequence","nextSequence":5,"water":[0]}
```

The headless wrapper explicitly overwrites `client.ui` from checkpoint bot memory, so its continuation test does not cover the plain public authority/client composition. Human UI memory is not part of the required checkpoint. The same transition also needs to account for producer repeat timestamps: `stickEdge` suppresses input while a restored tick is at or below the retained `lastTick`.

Resolution: enforce and document the supported detach/reset/reattach lifecycle, failing transactionally before live replacement if producers remain attached. Update owned wrappers and tests to obey that lifecycle; verify the supported fresh/reset producer composition can resume from the checkpoint. Preserve the spec's run/command-ID and deduplication guarantees, restore producer sequence/repeat memory coherently, and retire old pending results and reliable ingress before producer reuse. A blind counter rewind on ordinary publications is insufficient because old traffic may still be in flight. Regression coverage should prove that the unsupported attached-producer case fails without changing the old run, and that supported reattachment resumes gameplay while preserving cached retry/purchase deduplication. Supporting seamless arbitrary live rollback is an optional broader design, not demanded by this finding.

## C-002 — P2: restoring an exhausted admission budget creates a permanent pause

Primary location: `src/renderer/src/authority/core.ts:77-84`. Admission path: `authority/ledger.ts:49-50`; sealing: `authority/core.ts:92-100`; existing partial coverage: `tests/checkpointV2.test.ts:32`.

The checkpoint preserves the current tick's admission count, while external restore unconditionally pauses a nonterminal run. If that tick's 16-command allowance is exhausted, the correctly sequenced resume command is rejected as `over-capacity`. The count resets only when the simulation tick changes, which cannot happen while paused. This is independent of C-001: the probe restores the latest checkpoint, retries the exact expected ID, and has no stale client producer.

Executed a second narrow public-authority/real-loopback probe: admit and apply 16 `setPaused(false)` commands at tick 0, then checkpoint. The checkpoint is valid and running. Restore it, then retry ID 17 / `setPaused(false)` at wall times 0, 1000 and 10000 ms. Actual output:

```json
{"checkpoint":{"tick":0,"phase":"running","water":[16],"counts":[16],"admissionTick":0}}
{"now":0,"result":"over-capacity","tick":0,"phase":"paused","counts":[16]}
{"now":1000,"result":"over-capacity","tick":0,"phase":"paused","counts":[16]}
{"now":10000,"result":"over-capacity","tick":0,"phase":"paused","counts":[16]}
```

Repeated the cap probe under the exact supported producer lifecycle: detach the old binding, close both old sessions, restore with no attached producer, create a fresh loopback pair and attach it, then send ID 17. The same `over-capacity` results, paused tick 0 and count 16 were observed at all three wall times. The existing cap test verifies that a rejection survives restoration, but never verifies that the restored run can resume. A fresh client/transport or correct sequence synchronization does not solve this case; only a separately injected trusted lifecycle resume currently escapes it.

Resolution: supply a bounded recovery/control policy that permits the restore pause to be released while preserving gameplay admission accounting and deduplication. Specification section 5 caps commands at 16/player/tick, so exempting a player resume command from that limit requires an explicit controller ruling; a supported trusted lifecycle recovery path is another possible policy. Do not simply clear admission counts on every checkpoint/restore, which would reopen the expressly forbidden cap-reset loophole. Add exhausted-budget restore/resume coverage through the supported producer lifecycle, including a sealed pending-gameplay checkpoint, and verify repeated restores cannot admit additional gameplay beyond the original bound.

## Cross-task checks and evidence

- Disposal and transactional validation: inspected world removal/cell clearing, failed construction/startup cleanup, old/new lifecycle callback ownership, client replacement validation before disposal, and disposed stepping/serialization guards. The tests directly cover the 2,000-cycle live sentinel, failed allocation, borrowed-view invalidation and callback identity. No additional material lifetime finding was established.
- Canonical serialization: metadata/routing plans resolve current records, typed arrays and crew IDs each call; range plans retain bounded scalar validation; replacement arrays and recycled worlds have targeted tests. The final target signed-zero fix restores the original normalization. Snapshot headers bind format/version/layout/content/manifest and canonical identities before live writes. No gameplay hash or cap change was found.
- Checkpoint/replay: the portable parser validates snapshots, checkpoint ledger and message shapes before replay allocation; replay calls the shared ledger/control/tick executor. Checked detach cursor accounting, auxiliary cursor-only gaps, cached retries, terminal ordering, crash baselines and the documented rolling history bounds. Full checkpoint comparison supplements canonical hashes. The fixes above concern external paused restore, which exact recorded replay intentionally does not emulate.
- Browser gate: inspected fixed schedule construction, pinned expected-vector comparison, shared browser bundle, actual isolated Electron `BrowserWindow`, Firefox executable/profile path, tokenized localhost reporting, nonzero failure paths and cleanup targeting only owned processes/profiles. Replay suffix continuation and interleaved worlds run in every engine. The recorded fixture tests check actual production Cutter/Skiff allocation and meaningful purchases/votes/scans/tabs/stale targets/analog normalization. No responsive-bot substitution or gate-time blessing was found.
- Couch/performance: the model change preserves couch context and selects player cards explicitly. Authorized synthetic fire-only unit exceptions remain separate from ordinary byte-path gates; no tuning, floor or timeout relaxation was found. Inspected `validation.json`, `engines.json`, task review/correction evidence and relevant documentation. Historical source `7567633` records 1664 tests, 54.7166s wall, exact nine acceptance rows in 29.1555s, and Node/Chromium/Firefox agreement on 1800 samples / 404 boundaries. Latest `1a755f8` has the documented 120 focused tests and typecheck after the signed-zero correction. These are inspected records, not fresh reviewer suite runs.

Reviewer-executed verification: three inline `node node_modules/tsx/dist/cli.mjs -e` probes (attached-producer sequence failure, latest-checkpoint cap failure, and the cap failure repeated after complete detach/transport recreation), source/branch/status checks, and `git diff --check 0390bda 1a755f8` (exit 0). No broad suite or browser rerun was performed. Fixes need focused regressions and scoped re-review, followed by the controller's fresh all-gate run.

Remaining platform limits: physical controllers/handhelds, actual OS minimize/restore and suspend/resume, Safari/JavaScriptCore, ARM and other OS versions remain NOT RUN. Keyboard plus virtual-pad/offscreen UI evidence does not establish those hardware/platform behaviors. Internet transport, remote authentication and departed-host recovery orchestration remain Net-3 or later scope.
