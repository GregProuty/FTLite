# Net-3c controller rulings

Chronological decisions recorded in the execution ledger. Superseded proposals are identified explicitly. These supplement the implementation spec and make reversible controller choices reviewable.

| # | Decision and reason | Cost if wrong |
|---|---|---|
|1|Continue approved architecture/subagent execution without another approval checkpoint; user explicitly continued.|Rework local branch choices; no deployment performed.|
|2|Backend leases/checkpoints belong in3c for race proof; utility lease enforcement remains3e.|Later integration work remains necessary; backend grants alone are not demo readiness.|
|3|Task2 defines activation interfaces but rejects them until Task4 implements the complete protocol.|Intermediate commits cannot start sessions.|
|4|Task2 create/join/ticket routes are implemented; its ambiguous placeholder wording applies only to later endpoints.|Reorder reversible tasks if intended otherwise.|
|5|Both native endpoints use guest seat generation; Room separately fences both own generations. Directory uses epoch admission.|Protocol/integration rework if identity model changes.|
|6|Use dedicated file editing after automatic review rejected a large terminal document write as blocked by policy.|Different editing mechanism; no permission or action beyond local docs inferred.|
|7|Use a singleton SQL schema-version row because pinned workerd rejects PRAGMA user_version.|Migration helper maintenance.|
|8|Confirm creation in Room before publishing Directory mapping, retaining charge on lost acknowledgement.|Abandoned confirmed/private rooms may hold capacity until lobby expiry.|
|9|Expected internal RPC errors use DomainResult; unexpected exceptions remain visible.|All internal callers must unwrap typed outcomes consistently.|
|10|The128-candidate service limit is aggregate across both directions, with native per-receiver limits unchanged.|Conservative ceiling could reject unusually large pair candidate sets.|
|11|Request IDs increase and replies correlate, but asynchronous completion may be out of order; unrelated requests do not cancel work.|Client must handle correlation correctly; no serial retry queue.|
|12|Persisted random activation operationId also serves as chargeEpoch.|Epoch identity and tuple checks must stay coupled.|
|13|Activation admission makes no Room callback; independent reconciliation reclaims stale charges.|Temporary retryable false-full responses until sweep/recovery.|
|14|Initially considered read-only activationStatus for lost-reservation recovery; superseded by15 before final implementation.|Read-only status alone would race delayed reserve arrival.|
|15|Use exact-tuple terminal fence acknowledgement before forgetting cancelled activation; burn reserved generation and retry accounting durably.|More recovery metadata and skipped generations, preserving safety.|
|16|Use officially supported service-only outbound interception because pinned plugin lacks fetchMock; deny all unhandled requests.|Additional development dependencies.|
|17|Refine16 to exact MSW2.14.7/@msw-cloudflare0.1.0 because current MSW3 requires newer TypeScript; verify installed API denies egress.|Pinned experimental adapter needs future maintenance.|
|18|TURN works in ordinary lobby, rejects unfinished activation, and permits active guests only with current own connection and host lease.|Brief refusal during transitions; no stale issuance.|
|19|Workerd uses manual redirect mode and rejects all redirects because error mode is unsupported; main client keeps error mode.|Tests must continue proving no second-origin request.|
|20|Client clock uses epoch time; socket factory may be async, with late sockets closed and already-open/closed states handled.|Caller must provide correct clock/factory contract.|
|21|Preserve matching host-release reply across preceding same-generation host-departed, analogous to rehost reply ordering.|Correlation exceptions must remain narrowly scoped.|
|22|Bound unsettled factories across cancellation; accept fenced lost/ended generation rosters without granting authority.|Admission can remain full until broken factories settle; explicit recovery remains required.|
|23|Final review covers this slice from39b5dc1, with targeted unchanged integration checks and full regression gates; earlier milestones were already reviewed.|Earlier latent defects are not exhaustively re-reviewed.|
|24|Retain tracked reports/ledger as durable evidence instead of deleting the entire plan workspace.|Additional repository evidence files.|
|25|Authorize a service-only Vitest4.1.12 security patch in the final fix if needed; it is compatible and older than two weeks, root unchanged.|Revalidate service tooling after patch; no product dependency change.|

No ruling authorizes deployment, account/billing/DNS changes, reading/copying owner credentials, live TURN issuance, or merging the branch.
