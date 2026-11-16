# Net-3 builder preflight

Read the Net-3 design, approved Net-0 decision, Helm design sections 11b/13, and the current contracts, ledger, authority/core, client controller/runtime, main and preload boundaries. No source changes or tests run. Ranked questions below are the implementation-significant gaps; omitted routine codec/memory-budget choices and deliberately deferred features.

## 1. High: immutable ordered retry can strand the resume command

**Question:** What is the permitted progress mechanism when the next expected command is an over-capacity ordinary command while the run is paused, and a later ID requests resume?

Section 6 requires retaining/retrying the identical envelope and stopping higher IDs. The existing ledger checks contiguous sequence before its special over-budget resume allowance (`src/renderer/src/authority/ledger.ts`). Its 16-command budget resets only when the simulation tick changes. Thus, after the budget is exhausted at a paused tick, ordinary command N repeatedly receives over-capacity, and resume N+1 cannot pass either the sender rule or the ledger's expected-sequence check. There is no missing retained command, so the specified reconnect escape does not apply. Capture/sealing does not reset this per-tick allowance either.

This needs a chosen policy, not merely an exhausted-cap-resume test in section 13: for example, an explicit terminal disposition that consumes rejected ordinary IDs while paused, a separately bounded control path, or a defined producer-replacement escape. Each changes admission/journaling and exactly-once semantics. The proof must include a retained ordinary command ahead of resume, not only a resume that already has the expected ID.

## 2. High: the lease safety deadline is not defined safely under delayed acknowledgements

**Question:** Which monotonic interval establishes the host's lease deadline, how are stale renewal replies rejected, and what prevents player resume/tick catch-up while the host lacks a current valid lease?

Section 12 says a server lease lasts 15 seconds and the host stops by 12 seconds without a successful renewal, using a conservative receipt-time deadline. Receipt time alone is insufficient: if a renewal accepted by the DO at time 0 arrives at the host at time 10, receipt + 12 permits work through time 22 although a replacement host can be granted at time 15. A request-start-based conservative deadline or equivalent explicit bounded-age protocol is needed; response correlation/generation alone does not bound age.

Also specify that lease validity is an authority-level gate checked before admission/tick execution and remains closed until valid renewal/reclaim, rather than relying only on an ordinary lifecycle pause. Current `authority/core.ts` lifecycle pauses can subsequently be cleared by `setPaused(false)`. A delayed reply, a suspended utility process resuming, and a user pressing Resume during service interruption must not restart an expired authority. This directly affects fencing and the safety of committed checkpoints after rehost.

Required proof should delay a successful renewal beyond its useful lifetime, grant another host, then deliver the old reply; also resume an old suspended authority after lease expiry and try player resume before a fresh grant.

## 3. Medium: classify the host's asynchronous human-input binding explicitly

**Question:** Does the host's visible renderer-to-utility MessagePort use the remote receive-time admission/watchdog policy, and does the existing strict couch loopback remain in its current synchronous runtime or move to a different producer arrangement?

Sections 3/6 require an independent utility authority while preserving strict local loopback. Today `app/localRuntime.ts` invokes `translateTick` inside the authority's synchronous `beforeTick` hook and drains loopback before execution; `core.ts` and `ledger.ts` require held/command ticks to equal the next unexecuted authority tick. A visible renderer separated by asynchronous ports cannot keep that contract while the authority continues through renderer stalls. Classifying the host seat as strict simply because its transport is local will reject normal held/command input. Waiting for renderer production would violate the independent-clock requirement.

Explicitly choosing the admission policy for all asynchronous human producers, and the scope of the couch migration, removes a substantial implementation fork in Net-3a/3d. Prove a host-seat command/held frame arriving after its observed tick is admitted correctly while the existing synchronous loopback strictness tests remain valid.

No additional important unanswered question found in checkpoint commit/rehost authority, compatibility, the mode adapter seam, or delta bounds. The DO-authoritative committed save, generation/sequence ordering, validated mode images, bounded wire sizes, and minimal second-mode test give sufficient direction for slice planning.


# Builder response

1. Receive-time over-capacity gets a terminal cached rejection consuming the correct expected ID, without gameplay allowance. Strict local remains unchanged. Thus ordinary N does not strand resume N+1. Sender retains immutable envelopes only for unresolved or out-of-order retry. New test required.
2. Lease local validity uses monotonic request-start+12s, nonce/generation correlated; late replies cannot extend it. Independent gate before each admission/control/tick cannot be cleared by a player Resume. Resume/suspend invalidates it; regrant starts a fresh paused clock epoch, no expired-lease debt. DO refuses expired-generation renewal, requiring explicit rehost claim. Adversarial delayed-ACK/old-suspended-host tests required.
3. Host human MessagePort is asynchronous and uses receive-time admission/watchdog; existing couch localRuntime and in-process bots stay strict. No new blocking producer handshake.

These resolve implementation choices within approved architecture; no owner product decision is reopened. Check revised sections6/12 only for closure/new contradiction.


# Net-3 builder confirmation

Scoped review of the revised design sections 6/12 and `net3-builder-response.md` against the three original findings only.

**Ready for planning.** All three implementation-significant questions are resolved:

1. Receive-time capacity rejection terminally consumes and caches the expected ordinary command ID, allowing the subsequent resume ID to progress. Strict local behavior stays unchanged. The specified regression covers the previously blocked ordering and retained-command retries.
2. Local lease validity uses correlated request-start + 12 seconds, rejects obsolete/late replies, and independently gates authority work. Suspend/expiry cannot be overridden by player resume, expired generations require explicit rehost, and regrant discards expired clock debt. The adversarial test requirements cover the original fencing failures.
3. Host human MessagePort input explicitly uses asynchronous receive-time admission; existing couch and in-process bot bindings remain strict. This removes the producer/clock ambiguity without introducing a renderer handshake.

No remaining contradiction found within these resolutions. No broad re-review, source/design edits, or tests performed.
