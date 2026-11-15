# SDD ledger — plan: docs/superpowers/plans/2026-11-15-net-3e-recovery-internet.md

Execution approved by user: continue until done. Worktree C:/Users/djuar/.codex/worktrees/56fc/FTLite, branch codex/net-3, base 5249b50. Preserve existing reviewed Net-3d work. Tasks 1–8 authorized; Task 9 requires concrete external-action approval per approved spec. No merge/push.

Ruling: reuse existing isolated worktree and installed dependencies — verified clean branch and worktree list — owner checkout remains untouched.
Ruling: retain reports and evidence — plan explicitly requires source-pinned evidence — overrides generic scratch cleanup.
Ruling: use prior completed source baseline tests, then focused tests and final full regression — commits since final Net-3d validation are docs only — avoids redundant unchanged baseline run.

## Preflight
| Task | Internal consistency |
|---|---|
| 1 | Gate contracts, fake clocks, digest coverage agree. |
| 2 | Optional generic gate and separate required leased online entry preserve intermediate app. |
| 3 | Nondisruptive baseline and explicit paused settlement distinguish captures from public seal. |
| 4 | Atomic switch removes old online entry; bounded adoption differs from commit. |
| 5 | OS resume distinct from gameplay Resume; recovery always paused. |
| 6 | Controlled grant proof supplemented by real-service proof; local gate precedes HTTPS. |
| 7 | Async credential acquisition fits original setup deadline and bounded signals. |
| 8 | Candidate only, live fields NOT_RUN; final review before offering deployment. |
| 9 | Separate authorized external work; unavailable hardware remains NOT_RUN. |

| Shared tasks | Producer/consumer and finding |
|---|---|
| 1/2, 1/4, 1/5, 1/7 | SessionClock/identity/gate consumed by authority, orchestration, lifecycle, ICE; consistent. |
| 1/3 | Both add shared digest entries; sequential mutation tests preserve both. |
| 2/3 | Utility/host bridge and authority APIs extended sequentially; capture allowed closed. |
| 2/4 | startLeasedHost introduced then old startHost removed atomically. |
| 2/5 | completeBootstrap initial-only; restore cannot release pause. |
| 2/6 | Native controlled-grant fence proof is not real-service claim proof. |
| 2/7 | Abortable service request precedes authenticated connection accessor. |
| 3/4 | Capture IDs per utility epoch, adoption ack distinct from server commit. |
| 3/5 | Bounded exit capture feeds total 3s save deadline. |
| 3/6 | Replay/periodic invariance consumed by real recovery assertions. |
| 4/5 | Mirror store/status feeds saved/rehost lifecycle; service remains authority. |
| 4/6 | Initial commit and periodic candidate proofs feed real-service driver. |
| 4/7 | Coordinator config switch retains lease/mirror invariants. |
| 5/6 | Actual UI/manual claim recovery validated by native driver. |
| 5/7 | Peer replacement/connection identity ordering preserved on rehost. |
| 5/8 | Runbook consumes named rehost and bounded exit lifecycle. |
| 6/7 | Local recovery PASS required before HTTPS wiring. |
| 6/8 | Shared runtime observer/helper and evidence validators reused without alternate coordinator. |
| 6/9 | Local proof cannot promote external statuses. |
| 7/8 | Config/ICE provider consumed by candidate and relay-only driver. |
| 7/9 | Authenticated owner-bound credentials tested live only after approval. |
| 8/9 | Exact artifacts/runbook consumed after concrete authorization. |

No blocking conflicts found. No rubric conflict: required tests assert behavior and report failures; no mandated empty tests or copied logic.

## Tasks
Task 1: dispatch pending; BASE 5249b50.
Tasks 2–8: pending.
Task 9: external authorization boundary, pending concrete candidate.
Task 1: implementing via /root/net3e_task1 (sol high), BASE 5249b50.
Task 1: implementation d81f2f9; focused72/root2521/typecheck PASS. Independent review /root/net3e_review1 active. Bootstrap explicit renewNow after subscription; documented nonce/epoch strict hex.
Task 1: complete (commits 5249b50..d81f2f9, review clean).
Cannot-verify resolved by scope: utility clock/nonce/main isolation and enforcement are explicit Task2 requirements; actual service fence proof is Task6. No missing Task1 behavior. Existing optional-art warning retained as minor baseline observation, no asset changes authorized here.
Task 2: BASE d81f2f9; dispatch next.
Task 2: implementing via /root/net3e_task2 (astra high), BASE d81f2f9.
Task2 interim: authority/clock24, authority/mode22, private bridge29, service/platform64 focused checks passed; root typecheck passed. Reentrant rejected ingress replay pollution found/fixed with dedicated test (8 authority lease tests pass). Native controlled-grant harness in progress; no completion claim yet.
Ruling: beforeTick may receive nextTick/deadline arguments — compatible extension needed to preserve producer opportunity before advancement — existing zero-argument callback remains valid.
Task2 implementation 740fc31: 376 affected tests/typecheck/build PASS. Native controlled-grant normal PASS; fault/timeout expected exit1 with cleanup true. Review pending; missed-expiry grant replacement and replay settlement receive particular attention.
Task2 independent review active: /root/net3e_review2 (astra high). Task3 brief generated, not dispatched until review resolution.
Task2 review needs fixes: R1 per-control gate recheck/reentrant settlement; R2 absolute launcher+cleanup deadline. Fix round1 BASE740fc31.
Task2 minor R3: planned authorityClock/networkBoundary file edits absent; equivalent driver tests reside authorityLease and unchanged suites pass. Ruling: preserve focused test organization; explicit bot expiry case is a real requested-coverage gap and joins fix round1, not merely file-name compliance.
Task2 minor deferred R4: existing Git CRLF advisories retained as verification noise, not code failure.
Task2 evidence limitation: content digest excludes generic utility/main/harness. Existing build/report commit association resolves current provenance statement; retain artifact hashes in later Task6/8 source-pinned reports. No claim JSON alone proves binary provenance.
Ruling: R1 demonstrates replay serialization incompatibility — controls action currently means drain all queued controls, so an externally fenced partial batch cannot reproduce. Use explicit validated action cutoff/count in smallest new replay revision while preserving v2/v3 playback, rather than feeding expected results back into replay execution. Approved spec permits demonstrated format revision with migration tests. Cost: new replay schema coverage and downstream fixture compatibility; no SIM/checkpoint change warranted. Worker directed to document exact contract and backward tests.
Task2 fix round1 implementation f86ab6b: per-control guard + explicit replay4 interrupted-drain metadata (v2/v3 preserved), direct real bot expiry, shared absolute cleanup deadline. Focused92/typecheck/build PASS. Native normal/fault/timeout/slow-killer cleanup-timeout refreshed; exact source and built artifact hashes recorded. Scoped review /root/net3e_rereview2_1 active; not yet complete.
Task 2: fix round 1/5 (3 addressed, 1 open — R5 queued trusted Resume obstructs fence pause and replay; commits 740fc31..f86ab6b). Round2 BASE f86ab6b.
Task2 round2 c157a30: explicit v4 fence seal discardLifecycleResumes:true, legacy semantics retained; focused72/typecheck/build/native normal PASS. Scoped re-review /root/net3e_rereview2_2 (sol high) active. Negative cleanup evidence remains at prior unchanged harness/source snapshot as documented.
Task 2: fix round 2/5 (1 addressed, 0 open — R5 trusted Resume cleanup; commits f86ab6b..c157a30).
Task 2: complete (commits d81f2f9..c157a30, review clean after 2 rounds).
Task3: BASE c157a30; begin completed-boundary capture. Replay4 details in task2 report and docs/superpowers/reviews/2026-11-15-net-3e-rulings.md.
