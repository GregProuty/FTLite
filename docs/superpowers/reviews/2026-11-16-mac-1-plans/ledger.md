# Ledger: mac-1-plans

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | CandidateV2 has nowhere to record native signing, architecture and extracted-archive audit results, and gates A-C are never derived | resolved | 0 | Added strict NativeAudit and explicit A-C evidence schemas and derivation.; confirmed R2 |
| R1-F2 | P1 | The Windows half of a paired v2 report has no defined independent cleanup proof | resolved | 0 | Defined Windows CreationDate inventory adapter and discriminated cleanup proof.; confirmed R2 |
| R1-F3 | P1 | Failing on input overflow with a 512 cap will fail ordinary captures, because every outgoing held frame is recorded | resolved | 0 | Defined retained command/first-held inputs, held totals and overflow tests.; confirmed R2 |
| R1-F4 | P2 | No source is defined for the modeId in logical identity | resolved | 0 | Explicit sector mode audit option and validation against existing mode.; confirmed R2 |
| R1-F5 | P2 | The new formatVersions.ts is not added to the explicit content-digest file list | resolved | 0 | Added formatVersions to digest list and mutation/EOL tests.; confirmed R2 |
| R1-F6 | P2 | The rejected-prepareExit test contradicts current onlineExit, and onlineExit.ts is not in Task 3's file list | resolved | 0 | Included exit/session files and specified failure-safe retirement with real-owner tests.; confirmed R2 |
| R1-F7 | P2 | Detached POSIX groups no longer receive the terminal's Ctrl+C or SIGHUP; the controller has no signal-cleanup contract | resolved | 0 | Specified controller interrupt cleanup handlers, deadline and native probes.; confirmed R2 |
| R1-F8 | P2 | Committed evidence references unsanitized candidate manifests by hash | resolved | 0 | Required sanitized portable manifests before hashing and private root sidecars.; confirmed R2 |
| R1-F9 | P2 | Several recovery scenarios have no driver mechanism | resolved | 0 | Defined disconnect/reconnect/quit/close controls and credential-free RTC binding probes with honest limits.; confirmed R2 |
| R1-F10 | P3 | The Mac-1a candidate handoff conflicts with Mac-1b's rebuild and exact-source verification | resolved | 0 | Classified Mac-1a candidate as stage evidence only; Mac-1b must rebuild.; confirmed R2 |
| R2-F1 | P2 | Stale-probe can only hold a guest input envelope, so it cannot probe stale old-host traffic in the Mac-sleep-as-host scenario | fixed:R2 | 0 | Added role-specific guest input and old-host state/publication stale probes with receiver observations and tests for both directions. |
