# Net-3c scoped final re-review

Reviewer: `/root/net3c_final_rereview` (Astra, high reasoning). Range: `795ce73..7598a47`. Scope: the final review findings and new breakage introduced by their combined fix; read-only, no additional broad review.

**Verdict: all findings addressed; no new Critical or Important breakage identified.**

- **Provisional rehost publication: addressed.** Socket delivery suppresses provisional rosters; join, tickets, authentication and issuance guard unresolved activation. Fencing publishes the complete lost roster before departure, preserving generation and host-seat consistency without granting authority. Actual service/client integration tests cover held, lost and timely acknowledgements, guest retirement, provisional-operation denial, expiry, checkpoint access and a fresh claim.
- **Retired issuance correlation: addressed.** Bounded issuance evidence is retained separately from routes. Successful IDs require eligible evidence and are consumed once; settlement, authority cancellation and detach clear references. Closed routes stay deleted and cannot become ready. Overlap, invalid evidence, capacity/cleanup and actual asynchronous service retirement are covered.
- **Vulnerable service tooling: addressed.** Service Vitest and companion lock entries are patched to4.1.12; root dependencies and unrelated runtime pins are unchanged. The inspected final service audit reports zero vulnerabilities.
- **Ignored-promise warning attribution: addressed.** Installed MSW2.14.7 `RequestHandler.ts:360` returns async `runScheduledCleanups`, declared at line535. The test comment identifies the source. The upstream warning remains visible; no suppression or production behavior change was introduced.

The reviewer inspected the diff, relevant execution paths, regression assertions, installed MSW source and final audit artifact. Covering worker checks were service222 tests, client/digest87 tests, both typechecks and Worker dry-run. The reviewer did not rerun suites; the parent separately completed full root/service/build/native verification recorded in [validation](2026-11-15-net-3c-validation.md).

The existing wire lacks guest-seat/request identity in issuance events, so exact pairing of overlapping equal-generation requests still trusts the authenticated service. This is explicitly documented and accepted, rather than claimed solved. Deployment, live TURN/WAN/two-machine proof, UI persistence/reconnect, utility lease enforcement and inherited acceptance timing remain outside this slice.
