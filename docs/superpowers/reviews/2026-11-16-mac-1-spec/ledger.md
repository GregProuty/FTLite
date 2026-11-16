# Ledger: mac-1-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The shared logical identity is undefined, and raw-byte hashes cannot match between a CRLF Windows checkout and an LF Mac checkout | resolved | 0 | Defined committed blob logical identities, per-side byte hashes and separate deployed Worker provenance.; confirmed R2 |
| R1-F2 | P1 | No gate proves that the packaged FTLite.app networks with Windows; cross-platform wire evidence comes only from dev Electron | resolved | 0 | Required packaged-versus-packaged sessions alongside instrumented capture in both host directions.; confirmed R2 |
| R1-F3 | P1 | The ten-minute play requirement conflicts with the existing harness bounds and report schema | resolved | 0 | Separated ten-minute manual soak from bounded 540-second instrumented capture.; confirmed R2 |
| R1-F4 | P1 | Physical recovery gate F has no evidence contract | resolved | 0 | Defined paired recovery recorder, scenario boundaries, generation/checkpoint/lease observations and manual versus instrumented proof.; confirmed R2 |
| R1-F5 | P2 | Archive is optional, yet identity and existing tools require an archive hash; Mac bundle identity and symlinks are unspecified | resolved | 0 | Made symlink-preserving whole-app archive mandatory with extracted inventory/signature verification.; confirmed R2 |
| R1-F6 | P2 | Ad-hoc signing configuration and its observable checks are left to interpretation | resolved | 0 | Pinned private ad-hoc identity, hardened runtime and explicit Electron entitlements and checks.; confirmed R2 |
| R1-F7 | P2 | The spec cites 'canonical exports' for checkpoint and replay versions that the codebase does not have | resolved | 0 | Named existing constants and required new shared checkpoint/replay format constants.; confirmed R2 |
| R1-F8 | P2 | Mac prerequisites omit the signalling workspace, which the audit and Gate B smokes need | resolved | 0 | Required signalling workspace install/build and native workerd preflight for local tests.; confirmed R2 |
| R1-F9 | P2 | The POSIX helper-cleanup check has no observable definition | resolved | 0 | Required owned process-group cleanup, tracked descendant identities and independent OS evidence.; confirmed R2 |
| R2-F1 | P2 | Mac-sleep-as-host recorder coverage rule makes the scenario unpassable if read literally | fixed:R2 | 0 | Defined sleeping-recorder exception, awake peer/service evidence and ordered Mac wake observation before authority work. |
