**Verdict: ready to merge for the Net-1b scope, with two low-severity (P3) follow-ups.** No P0, P1 or P2 issues remain. I couldn't run any tests or probes myself, so every finding below comes from reading the source.

Scope: `0390bda..907b632`. Executable source is `9b8fddd`; `907b632` only adds docs and evidence. I did not review the Helm work on master.

## Findings

### F-1 — P3: a link that closes during an open replay frame is only partly detached
**Where:** `src/renderer/src/authority/core.ts:299-312` (detach) and `core.ts:67-68` (`begin` throws `nested replay boundary`). The trigger is in `src/renderer/src/net/loopback.ts:125-126`: a send that overflows the reliable buffer closes the link synchronously. The error is then swallowed by `notify` at `loopback.ts:22-23`.

**Scenario:** the authority sends reliable messages while a replay frame is open:
- results inside admission, tick or controls frames (`core.ts:143`);
- events (`core.ts:148`);
- the reliable paused-state publication inside `applyControls` (`core.ts:224`, `:139-140`).

If one of those sends overflows the 1 MiB reliable queue, `detach` runs synchronously. It removes the binding (`:300`) and unsubscribes it (`:301`), then `begin` throws at `:302`.

**Impact:** everything after that point is skipped:
- the binding's pending entries and queued controls are never finished or removed (`:303-306`);
- that player's held input is never cleared (`:307`), so the crew keeps moving or holding Interact on its last input until another binding sends a held frame;
- the ingress clear and the detach/cursor frames are never recorded (`:310-311`).

The owner's later unsubscribe does nothing, because `bindings.delete` returns false at `:300`. The shipping couch and headless flows drain every pump, so they don't hit this. It does happen with loopback `impairment.delayDrains` or a client that never drains. It will also happen with any future transport that closes synchronously from `send`.

**Smallest fix:** while `activeFrame !== null`, queue the binding instead of detaching. Run the full cleanup and record the detach and cursor frames right after the outer `complete()`. Replay then applies them at the same position.

**Test:** use a reliable delay impairment and toggle pause until `reliable-overflow`. Then assert:
- held input is cleared;
- pending entries are finished as `unavailable`;
- a detach frame was recorded;
- the `runReplay` checkpoint equals the live checkpoint.

### F-2 — P3: a faulted run can be sealed and then restored as a normal paused run
**Where:**
- `core.ts:95-103`: `sealCheckpoint` only guards `disposed || pumping`, not `phase === 'error'`.
- `authority/checkpoint.ts:38` and `:55`: `phase: 'error'` is accepted.
- `core.ts:86-87`: external restore turns any run that hasn't ended into `paused` with reason `restore`.

**Scenario:** `stepCommands` throws partway through a tick, and the pump catch sets `phase = 'error'` (`core.ts:267-270`). Calling `authority.checkpoint()` afterwards seals the half-stepped state. Its values can still be in range, so it passes validation. `restore` then revives it as a resumable run. That skips the crash record's last-good checkpoint, and the resumed history can't be reproduced from an uninterrupted run.

**Reachability:** the public `Authority` API, or the headless runner when `onCrash` is supplied. The couch app doesn't expose checkpoint or restore.

**Smallest fix:** make `sealCheckpoint` throw when `phase === 'error'`, and make `validateCheckpoint` reject `'error'`. No legitimate checkpoint has that phase: durable baselines are only captured before a fault, and replay's `onCrash` throws.

## The two earlier findings, checked independently

**C-001 (attached producers): fixed.**
- `authority.ts:59` rejects restore while anything is attached, before validation or allocation.
- The exact checkpoint cursors are used; there is no live maximum.
- `headless/runner.ts:90-107` validates the whole checkpoint, plus run ID and player count, before tearing anything down.
- Old pairs are closed without draining; `Pair.close` clears their queues at `loopback.ts:99-101`.
- A fresh client and fresh bots are created, sequences are reset to the sealed ledger, repeat timing is kept, and cached vote rejections are reconciled.
- Tests: `tests/restoreRecovery.test.ts:19-51`, `:110-135` and `:178-209`.
- Residual: if `owner.restore` threw after teardown (`runner.ts:94-95`), the runner would be left unusable. The same validation has just passed, so in practice this can't happen.

**C-002 (paused at the 16-command cap): fixed.**
- `ledger.ts:52-64` admits only `setPaused(false)`, at most once per player per control drain.
- The 256 pending limit and the identity, sequence, duplicate and stale-tick checks are all kept.
- `admissionCounts` is never changed by a recovery, and a stale recovery doesn't use up the slot.
- Live play and replay both go through `core.ts:180`, and the recovery set is cleared at `:194`.
- That set is always empty at checkpoint and baseline boundaries, which keeps replay in agreement. The only way a recovery could vanish without a recorded controls frame is F-1's synchronous-close path.
- Side benefit: a live run that hit 16 commands and then paused in the same tick used to be impossible to resume. That is fixed too.
- Tests: `restoreRecovery.test.ts:53-108` and `:137-176`.

## Other areas checked, no defect found
- **Disposal:** `releaseWorld` uses the per-world `entityComponents` (bitecs `dist/core/index.mjs:131`). Disposal is idempotent via a WeakSet, failed construction is released, and stepping or serializing a disposed world throws.
- **Snapshot v2:** everything is validated before any live write (`snapshot.ts:72-84`). The only throws in `unflatten` come before its writes (`flatten.ts:71-74`). Sparse inputs are rejected.
- **Signed zero and access plans:** signed-zero normalization is kept (`flatten.ts:19`, `:53-61`). Access plans re-resolve the current records and crew IDs on every call (`flatten.ts:49`, `:75`).
- **Ledger restore:** staged, then committed. The high-water entry can't be evicted from the result cache, because each player has at most 17 commands pending.
- **HUD viewers:** couch content is unchanged. Player mode uses only that viewer's own console as primary, a standing viewer has none, and an invalid viewer throws in development and returns a safe empty model in production.
- **Bot scenarios:** exactly nine fire-1e6 tests moved with their text unchanged.
- **Vitest:** the config only adds the setup file and the 8-worker cap.
- **Versions:** `SIM_VERSION` is 35, `MAX_PLAYERS` is 4, and the golden final hash is `b87a0284`.
- **Browser harness:**
  - both the browser and the Node runner compare against the pinned expected vector;
  - errors, timeouts and nonzero child exits all fail the run;
  - `ELECTRON_RUN_AS_NODE` is removed;
  - the Electron window is sandboxed with a narrow preload and checks the sending frame;
  - Firefox uses its own fresh profile.

## Low-priority notes (not defects)
- If a transport closes a link by itself, the wrapper's `attached` map keeps it until the owner calls the unsubscriber. Restore keeps refusing until then, which is the safe direction.
- `restore` has no "completed boundary" guard like `checkpoint`'s `pumping` check. It only matters if a producer callback detached everything and then restored mid-pump. Untested hypothesis.
- Replay doesn't require bindings to own disjoint players (`core.ts:331-339`). A hand-crafted replay would only be consistent with itself.
- Already present in Net-1a: an `over-capacity` rejection doesn't consume its sequence, and clients never rewind `nextSequence`. A producer that goes over 16 commands per tick falls out of sync. This is outside the Net-1b scope, and the recovery path isn't affected.

## What was and wasn't verified
- **Ran:** a few read-only shell commands at the start: `git log`, `git diff --stat 0390bda..9b8fddd`, a directory listing, and reading the earlier review files. After that the Bash tool was denied for this session, so I ran no tests, no probes and no `git diff --check`.
- **Read only:**
  - the implementation diff and source;
  - `restoreRecovery.test.ts` and `simDisposal.test.ts`;
  - the bot fixture move;
  - `final-validation/validation.json`, `determinism.log` and `injected-page-failure.log`.

  They show, for source `9b8fddd`:
  - 1680 tests across 130 files passed;
  - typecheck and build exited 0;
  - acceptance matched all nine original rows;
  - Node 24.18, Electron 37.10.3 (Chromium 138) and Firefox 160 agree on 1800 samples;
  - the injected page failure exits 1.
- **Not run on any platform:** physical controllers, real OS minimize and suspend, Safari/JavaScriptCore, and ARM.

Net-1b provides local loopback durability and determinism only. Internet play (Net-3) doesn't exist yet. F-1 should be fixed before any Net-3 transport work, and F-2 before any user-facing save or restore.
