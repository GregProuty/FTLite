# Ledger: netcode-claude

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Waking from sleep auto-rejoins a saved seat with no live session, which can discard a couch run or put an idle connection into another player's seat | fixed:R1 | 0 | Reproduced persisted-seat/Leave wake joins; resume now requires current online context and no exit, renderer refuses ports outside online mode; regressions pass. |
| R1-F2 | P1 | A TURN credential failure on one peer link tears down the host's whole authority; reconnect/re-host within 60 s of the last issuance cannot recover | fixed:R1 | 0 | Real TURN owner cooldown reproduced host onFailure; host now retires only failed link and schedules owned cancellable fresh-ticket retry after cooldown without retiring authority; retry/dispose regressions. |
| R1-F3 | P2 | One failed mirror adopt stops all later automatic checkpoint deliveries for the session | deferred | 0 | Confirmed nonblocking risk; requires separate capture-delivery or server-clock contract work, retained with concrete citations in response. |
| R1-F4 | P2 | Lease, ticket and link expiries depend on the local wall clock; a host whose clock runs fast gets fenced periodically or cannot start | deferred | 0 | Confirmed nonblocking risk; requires separate capture-delivery or server-clock contract work, retained with concrete citations in response. |
| R1-F5 | P3 | Suspend retires the host without the trusted pause and best-effort save; suspending while idle shows status error 'suspended' | deferred | 0 | Idle suspend no longer emits error as part of R1-F1; best-effort suspend capture remains deferred. |
