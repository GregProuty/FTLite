# Net-3 recovery preflight review and validation

Net-1b merged as 3047027; combined master passed 1732 tests/typecheck/build. Preflight fixes on codex/net-3 are 5885496 and 03e7954. Final executable source: 03e7954f84d00bb5876f025dd35c7b4c68a9d503.

## Initial review

# Task 1 independent spec and quality review

## Round 1 — 2026-11-14

Reviewed commit range `f72c546..5885496` on `codex/net-3`, against the preflight plan and original Opus F-1/F-2. Changed-file scope: `src/renderer/src/authority/core.ts`, `src/renderer/src/authority/checkpoint.ts`, and `tests/authorityDisconnect.test.ts`. Read surrounding ledger, replay, wrapper, and boundary/checkpoint tests to assess integration. Did not review or edit the unrelated untracked internet-session design. No production/test edits or commits.

### C-001 — P2: Faulted checkpoint sealing strands the deferred detach

**Evidence:** `src/renderer/src/authority/core.ts:109-117`, `:119-123`, `:318-319`; fault unwind currently exists only at `:285-286` inside `pump()`.

`checkpoint()` runs admission, controls, and seal journal frames directly outside the pump's try/catch. When a result send closes its Link synchronously and then throws during the seal frame, the new detach callback queues itself because `activeFrame` is set. The throw bypasses `complete()`, and no public-boundary catch clears that frame or flushes the detach. Calling the owner's unsubscribe afterwards still sees the same active frame and only requeues the closure.

Independent executable probe: queue two `stand` commands after applying nonneutral held input, arm a Link wrapper to invoke its close callback and throw on the next result send, call `checkpoint([])`, then call the returned unsubscribe. Observed:

```text
checkpoint error transport failed after close
after checkpoint and owner unsubscribe {"releases":0,"frames":[{"kind":"publish","completed":true},{"kind":"admission","completed":true},{"kind":"admission","completed":true},{"kind":"seal","completed":false}]}
capture error cannot checkpoint pending ledger
```

This leaves both listeners subscribed, ownership and held input retained, no detach frame, and the second command pending. It violates the plan's explicit requirement that cleanup remain safe when a frame faults before completion. The added close-then-throw tests exercise this case through `pump()` only, so they do not detect the public checkpoint path. This finding does not question normal reliable-overflow recovery, where send returns normally.

**Suggested resolution:** Give journal frames entered by public sealing an exception unwind consistent with pump fault handling: abandon the incomplete frame, ensure deferred detaches run fully, retain the last-good checkpoint and fault diagnostics, and prevent sealing/reviving partial fault state. Audit initial attach publication for the same outside-pump failure pattern. Add a regression using the existing real overflow rig with close-then-throw during `checkpoint()`, asserting cleanup completes even before a later pump and repeated unsubscribe is idempotent.

### Other reviewed behavior

- Normal admission/control/tick completion records the outer frame before flushing detach frames. Deferring ownership changes until the captured batch ends matches production replay; the result/event/publication regressions cover that ordering.
- `inFlight` preserves ledger ownership of captured controls and frozen tick commands across a pump fault. Successful frames clear it; error-phase detach removes only the affected binding, and dispose clears retained closures and batch references. Ledger `finish()` does not overwrite already completed outcomes.
- Nested terminal controls remain in the containing tick frame, and deferred detach flushing is guarded against recursive flushes.
- Error-phase sealing now rejects before admission, acknowledgment, bot-memory replacement, or journal mutation. Portable validation rejects error phase before allocation or live restore mutation. Last-good crash checkpoints and completed-prefix replay remain supported by the targeted tests.
- Changes stay within the three-file scope; no fixture, wire epoch, command ID, sim version, admission budget, or gameplay change is present in the diff.

### Independent verification

- `npm test -- tests/authorityDisconnect.test.ts tests/authorityBoundary.test.ts tests/checkpointV2.test.ts tests/replayV2.test.ts` — exit 0; **40 tests / 4 files passed**, Vitest 1.65s.
- `git diff --check f72c546..5885496` — exit 0.
- `npx tsx .superpowers/sdd/2026-11-14-net-3-preflight/review-seal-fault-probe.ts` — exit 0; reproduced C-001 with the output above. The probe is an ignored review artifact, not a production/test change. Initial probe setup used an invalid digest and was corrected before this definitive result.
- Full suite, typecheck, and build were not rerun by this reviewer; parent owns final broad validation.

**Spec verdict: changes required.** F-2 and ordinary F-1 overflow are addressed; the required fault-before-completion cleanup is incomplete for public checkpoint frames.

**Quality verdict: changes required.** The implementation is narrow and its normal-path regression coverage is meaningful, but C-001 leaves a public API failure path retaining ownership, listeners, held input, and an unfinished ledger entry. Resolve and independently re-review before final scope approval.


## Scoped re-review

# Task 1 scoped re-review

## Round 2 — 2026-11-14

Scope: C-001 and material breakage introduced by `5885496..03e7954` only. Inspected the review diff, actual `core.ts`, added regressions, and the implementation report. No broad repeat review, production/test edits, subagents, or commits. Unrelated spec/plan work was not reviewed or changed.

### C-001 — addressed

`core.ts:114-119` now catches execution failures after checkpoint prevalidation and invokes the same fault unwind as pump. `core.ts:289-294` clears the incomplete active frame, marks the authority error, flushes queued detaches, and records diagnostics using the unchanged durable checkpoint. `core.ts:348-351` queues cleanup for a failed attach and unwinds its incomplete publication frame. Normal argument/controller rejection remains outside the execution catch.

The original independent probe now reports both listener releases immediately, an incomplete seal followed by detach/cursor diagnostic frames, a CrashRecord, and error-phase checkpoint rejection. It no longer reports an orphan pending ledger entry. Repeated owner unsubscribe does not add another detach.

The four new regressions cover public checkpoint admission, controls, seal, and initial attach publication with real reliable overflow followed by a throw. They check cleanup before another pump, cached command outcomes, idempotence, last-good restoration, completed-prefix replay, subsequent checkpoint refusal, and released ownership.

No new important defect found in this fix. Shared extraction preserves the prior pump behavior; cleanup runs before the crash callback, and error frames remain diagnostic rather than resumable completed frames.

### Independent verification

- `npm test -- tests/authorityDisconnect.test.ts` — exit 0; **14 tests / 1 file passed**, Vitest 1.09s.
- `npx tsx .superpowers/sdd/2026-11-14-net-3-preflight/review-seal-fault-probe.ts` — exit 0. Observed `releases:2`, one detach frame and one cursor frame after the incomplete seal, plus explicit rejection of phase `error`.
- `git diff --check 5885496..03e7954` — exit 0.
- Parent owns final full-suite/typecheck/build gates; they were not repeated here.

**Spec verdict: approved for the reviewed preflight scope.** C-001 is resolved; no outstanding finding remains from this review chain.

**Quality verdict: approved, subject to the parent's final broad validation.** No material new breakage found in the fix.


## Controller final validation

1746/1746 tests, 136 files, 54.47s Vitest; typecheck/build pass. Default acceptance passes with all nine original baseline rows exactly equal.

```json
{
  "source": "03e7954f84d00bb5876f025dd35c7b4c68a9d503",
  "gates": [
    {
      "name": "test",
      "exit": 0,
      "seconds": 55.33680029999232
    },
    {
      "name": "typecheck",
      "exit": 0,
      "seconds": 0.4521186000201851
    },
    {
      "name": "build",
      "exit": 0,
      "seconds": 3.618442500010133
    },
    {
      "name": "acceptance",
      "exit": 0,
      "seconds": 29.258440500008874
    }
  ]
}
```

Cross-engine/browser/UI checks were not repeated for these authority lifecycle guards; earlier Net-1b evidence remains source-scoped. Golden/parity/replay tests pass; no fixture or gameplay version change. Internet transport is not implemented. Logs remain in .superpowers/sdd/2026-11-14-net-3-preflight/final-validation/.
