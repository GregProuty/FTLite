# Mac-1a: Private Apple Silicon Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, launch and audit a private native ARM64 FTLite.app on the owner's MacBook without an Apple Developer account.

**Architecture:** Keep the current Electron main/renderer/utility/WebRTC architecture. Add Mac packaging and menu behavior, canonical evidence identity, per-platform package audit and independently observed process cleanup. Preserve historical evidence; paired physical network validation follows in Mac-1b.

**Tech Stack:** Electron 37.10.3; lockfile-resolved electron-builder 26.x; TypeScript; Vitest; macOS codesign/ditto/ps; Node 24.18.0 and npm 11.16.0 (the inspected working toolchain; validate native Mac installation in Task 6).

**Spec:** [Approved Mac-1 design](../specs/2026-11-16-mac-1-apple-silicon-design.md), including all review amendments and the sleep-boundary exception.

## Global Constraints

- Native darwin/arm64 only; no Rosetta requirement. Preserve Windows packaging command semantics and F11.
- Retain Electron 37.10.3 and electron-builder 26.x. No protocol, sim, checkpoint or replay format bump solely for portability; canonical constants extract existing values.
- mac.identity '-', identity discovery disabled, notarize false, hardenedRuntime true; explicit app/helper entitlements for allow-jit, allow-unsigned-executable-memory and disable-library-validation only.
- Stable appId com.ftlite.foundation; minimumSystemVersion 11.0.0 is a runtime metadata floor, not a claim all macOS versions were tested. Record actual toolchain/OS availability; unsupported Node on an old Mac is an explicit build-prerequisite failure.
- No root .env access, provider secrets, global Gatekeeper changes, automatic publishing or service deployment.
- Production renderer isolation and existing lease/save/exit bounds remain intact. The only game UX additions are Mac menu/shortcuts.
- Create an isolated worktree at execution; preserve existing dirty files. Read actual HEAD before starting because engine work may advance. This plan was grounded at 11d9d10.
- Tasks 1-5 can be implemented/tested partly on Windows. Task 6 requires a real Mac. Do not mark Mac-1a complete without it; Mac-1b software work may proceed while hardware testing is pending.

## Review Focus

1. Paths containing spaces or shell metacharacters: pass spawn argument arrays, never shell-assemble artifact commands (Tasks 2, 4).
2. Equivalent CRLF/LF source checkouts: canonical identity pairs; exact per-side byte verification still detects mutation (Tasks 1, 4).
3. Window close and Cmd+Q racing a failed final save: one bounded retirement, no second owner (Task 3).
4. Root Electron exits before a helper or PID gets reused: independently observed ownership must prevent leaks and unrelated kills (Task 5).
5. ZIP extracts with altered symlinks/modes or a missing helper: audit fails before claiming a runnable candidate (Task 4).

## File structure and dependency map

New shared constants: `src/shared/formatVersions.ts`. New build identity/contracts: `scripts/network/candidate-identity.ts`. Mac packaging entry: `scripts/package/mac-candidate.ts`; profile in `electron-builder.yml` and `build/entitlements.mac{,.inherit}.plist`. Pure Mac menu construction: `src/main/appMenu.ts`. Bundle inventory/audit: `scripts/network/package-audit.ts`; add opt-in candidate-manifest CLI version 2. Owned native processes: `scripts/network/owned-process.ts`, consumed by existing runners. Runbook: `docs/testing/mac-private-build.md`.

Dependencies: 1 -> 4; 2 -> 4; 3 independent; 5 independent; all -> 6. Do not parallel-edit shared runner files. Each task ends with focused tests, typecheck when TypeScript changes, and a path-limited commit naming that task. No whole-suite rerun for documentation-only edits.

## Shared evidence types (introduced by Task 1)

Export these from candidate-identity.ts; strings below are validated SHA-256, full Git object IDs, or canonical origin as appropriate, not arbitrary unvalidated input:

```ts
interface LogicalIdentity {
  revision: string;
  rootLockBlob: string;
  serviceLockBlob: string;
  contentDigest: string;
  modeId: string;
  protocol: number;
  sim: number;
  checkpoint: number;
  replay: readonly number[];
  serviceOrigin: string;
}
interface DeploymentRef {
  revision: string; serviceTree: string; configBlob: string;
  bundleSha256: string; configSha256: string;
  workerName: string; deploymentId: string; versionId: string;
  serviceOrigin: string; protocol: number;
  evidence: { path: string; sha256: string }[];
}
interface CandidateV2 {
  version: 2; logical: LogicalIdentity;
  platform: 'win32' | 'darwin'; arch: 'x64' | 'arm64';
  os: string; tools: Record<string, string>;
  packagePath: string; packageSha256: string;
  executableSha256: string; asarSha256: string;
  sourceFiles: Record<string, string>; artifacts: Record<string, string>;
  signing: 'windows-private' | 'adhoc';
  deployment: DeploymentRef | null;
  localWorker: { bundleSha256: string; configSha256: string } | null;
}
```

Mac requires arm64; Windows x64 is this milestone's paired target. An absent deployment does not block a local build, but does block deployed-service verification. Deployment evidence paths are resolved inside the evidence root, never fetched from arbitrary URLs. Local paths are allowed in private candidate files; shared reports refer to hashes and sanitized labels, not absolute user paths.

### Task 1: Canonical versions and build identity

**Files:** Create `src/shared/formatVersions.ts`, `scripts/network/candidate-identity.ts`, `tests/candidateIdentity.test.ts`; modify `src/renderer/src/authority/{checkpoint,core,replay}.ts`, `src/renderer/src/sim/replay.ts` and `src/renderer/src/net/contracts.ts` for the Checkpoint type literal; inspect other checkpoint literal consumers with `rg checkpointVersion src`; extend `tests/checkpointV2.test.ts` and `tests/replayV3.test.ts`.

**Interfaces:** Export `CHECKPOINT_VERSION = 2`, `SUPPORTED_REPLAY_VERSIONS = [2,3,4] as const`, `SupportedReplayVersion`; reuse existing SESSION_PROTOCOL_VERSION and SIM_VERSION. Export `readLogicalIdentity(root: string, revision: string, modeId: string, serviceOrigin: string): LogicalIdentity`, `parseCandidateV2(value: unknown): CandidateV2`, and `sameLogicalIdentity(a: LogicalIdentity, b: LogicalIdentity): boolean`.

- [ ] Write failing tests: committed blob identity is unchanged by checkout EOL conversion; differing digest, mode, lock blob, source revision, protocol or origin is rejected; Mac/x64 and unknown schema version rejected. Preserve replay-specific 2/3/4 behavior and reject format 99. Example assertions: `expect(sameLogicalIdentity(crlf.logical, lf.logical)).toBe(true)` and `expect(() => parseCandidateV2({...mac, arch:'x64'})).toThrow()`; fixtures generate real temporary Git repos and mutate only working-tree EOL.
- [ ] Run `npx vitest run tests/candidateIdentity.test.ts tests/checkpointV2.test.ts tests/replayV3.test.ts`; observe new behavior missing before implementation.
- [ ] Implement strict schemas and Git blob reads via execFile argument arrays. Resolve both lockfiles from the specified commit; compute current gameplay digest and verify candidate source is clean. Allow only later docs/evidence commits with candidate ancestor plus exact per-side source verification. Do not globally require a pristine unrelated documentation tree. Tie checkpoint schema/type literals and replay union support to constants without replacing semantically meaningful version-specific branches. Exclude no game source from digest to hide changes.
- [ ] Run focused tests and `npm run typecheck`; existing replay/checkpoint fixtures still pass with unchanged formats. The newly imported source may legitimately change contentDigest: both candidates are rebuilt, no golden gameplay re-bless by assumption.
- [ ] Commit only task files: `refactor: centralize runtime format and candidate identity`.

### Task 2: Deterministic private Mac packaging entry

**Files:** Create `scripts/package/mac-candidate.ts`, `build/entitlements.mac.plist`, `build/entitlements.mac.inherit.plist`, `tests/macCandidate.test.ts`; modify `package.json`, `electron-builder.yml`.

**Interfaces:** Export `macCandidateCommands(options: {root: string; serviceOrigin: string; output: string}): {command: string; args: string[]; env: Record<string,string>}[]` from the script behind an import-safe main guard. CLI: `--service-origin=<https-origin> --output=<directory>`. Add `dev:mac` (native architecture preflight then existing dev flow) and `package:candidate:mac` (this CLI).

- [ ] Test rejection on non-darwin/non-arm64 execution, unsafe/non-HTTPS origin, and output overlapping source directories. Verify command args explicitly include `--mac --arm64 --dir --publish never`, build happens before package, `CSC_IDENTITY_AUTO_DISCOVERY=false`, and no shell interpolation occurs for a root containing spaces/`$`. Test packaging failures stop subsequent archive/audit steps.
- [ ] Run `npx vitest run tests/macCandidate.test.ts` and observe failures.
- [ ] Add Mac profile with both entitlement paths and exact signing values from Global Constraints; keep existing win/nsis settings. Build with FTLITE_PACKAGED_SERVICE_ORIGIN scoped to the child environment, removing conflicting client origin variables. Spawn installed Node CLI entrypoints instead of relying on Windows `.cmd` execution semantics. Package private app into a dedicated output directory. Archive it with `ditto -c -k --sequesterRsrc --keepParent <app> <zip>`; output filename `ftlite-<version>-mac-arm64-private.zip`. No signing identity auto-discovery or fallback profile. Fail if required native tools missing.
- [ ] Run focused tests, typecheck and Windows `npm run build`; Mac command tests here validate orchestration only. Task 6 supplies native signing proof.
- [ ] Commit task files: `feat: add private Apple Silicon packaging`.

### Task 3: Mac menu and lifecycle parity

**Files:** Create `src/main/appMenu.ts`, `tests/appMenu.test.ts`; modify `src/main/index.ts`; extend `tests/onlineExit.test.ts`, `tests/onlineInput.test.ts` as needed for tested behavior.

**Interfaces:** `createApplicationMenu(platform: NodeJS.Platform): Electron.MenuItemConstructorOptions[] | null`; Mac roles are app Quit, edit undo/redo/cut/copy/paste/selectAll and view togglefullscreen with Ctrl+Command+F. Existing `registerOnlineExit(app, win, owner)` remains the only exit owner.

- [ ] Test Mac menu roles/accelerators and Windows null menu. Race window close, menu quit and a rejected prepareExit; assert one prepareExit/dispose chain, final quit, and removal of listeners. Confirm blur neutralizes held movement through existing input owner. Add tests before altering behavior; run `npx vitest run tests/appMenu.test.ts tests/onlineExit.test.ts tests/onlineInput.test.ts`.
- [ ] Wire Menu.buildFromTemplate only when non-null; retain F11 and window-all-closed quit. Do not add a Mac activate handler that creates a second room owner. Keep shortcuts routed to existing native roles and quit events.
- [ ] Run focused tests and typecheck. Task 6 manually verifies actual Cmd+Q, room-code paste, Retina and fullscreen because mocks do not prove native menu integration.
- [ ] Commit: `feat: add Mac menu and quit controls`.

### Task 4: Whole-package audit and manifest v2

**Files:** Create `scripts/network/package-audit.ts`, `tests/packageAudit.test.ts`; modify `scripts/network/candidate-manifest.ts`; extend `tests/internetAppManifest.test.ts`. Keep v1 fixtures untouched.

**Interfaces:** `packageLayout(root: string, platform: 'win32'|'darwin'): {executable: string; asar: string}`; `inventoryBundle(root: string): Promise<BundleEntry[]>`; `BundleEntry = {path:string;kind:'file';sha256:string;mode:number} | {path:string;kind:'link';target:string} | {path:string;kind:'directory';mode:number}`. `auditCandidate(options: {root:string; appDirectory:string; packagePath:string; platform:'win32'|'darwin'; revision:string; serviceOrigin:string; deploymentPath?:string}): Promise<CandidateV2>`. CLI retains required app-directory/package-path/output flags, adds `--manifest-version=2` and explicit platform/revision/service-origin/deployment flags. This opt-in writes v2; existing default v1 generation/reading stays unchanged until Mac-1b callers opt in. Task 6 uses the explicit v2 flag.

- [ ] Fixtures test Mac Contents paths versus Windows paths, escaped paths, broken/escaping symlinks, changed helper/mode, archive mutation, secret/test/profile exclusions, missing executable output, and mismatched compiled origin. Compare inventory after extraction; assert altered symlink cannot pass even with unchanged app.asar. New tests fail first: `npx vitest run tests/packageAudit.test.ts tests/internetAppManifest.test.ts`.
- [ ] Implement sorted lstat-based inventory without following symlinks outside the owned bundle. Preserve executable mode and link target. Verify archive extraction occurs in a fresh owned temporary directory, relative archive paths cannot escape, and all files/frameworks are included. Verify original and extracted Mac signatures with codesign; enumerate all Mach-O files for lipo/file ARM64 checks and every executable helper bundle for ad-hoc display checks. Record spctl assessment separately; no expected spctl rejection becomes a signature PASS. Manual extracted-copy Finder launch remains Task 6.
- [ ] Use Task 1 identity, read actual tool versions, retain each side's exact output/source hashes. Package entry exclusions and origin check remain fail-closed. Bind optional DeploymentRef to retained hashed evidence and canonical service identity; local dry-run Worker bytes remain separate. Never invent missing historical source-tree/deployment fields: missing proof blocks deployed validation, not local packaging.
- [ ] Run focused tests and typecheck. Audit a fresh Windows candidate to verify existing packaging remains usable. Native original/extracted Mac audit runs in Task 6.
- [ ] Commit: `feat: audit platform-specific candidates with canonical identity`.

### Task 5: Owned POSIX process trees in native harnesses

**Files:** Create `scripts/network/owned-process.ts`, `tests/ownedProcess.test.ts`, `scripts/network/process-tree-probe.ts`; modify `scripts/network/lease-smoke-lifecycle.ts`, `host-smoke.ts`, `rtc-smoke.ts`, `room-service-smoke.ts`, `online-app-smoke.ts`, `online-recovery-smoke.ts`, `internet-app-smoke.ts`, `online-app-runtime.ts` where Electron/helper ownership is currently launched/stopped; extend `tests/leaseSmokeCleanup.test.ts`.

**Interfaces:** Export `ProcessIdentity {pid:number; ppid:number; pgid:number; start:string}`, `OwnedProcessTree {root:ProcessIdentity; sample():Promise<void>; stop(deadline:LauncherDeadline):Promise<CleanupProof>}`, `CleanupProof {platform:string; before:ProcessIdentity[]; after:ProcessIdentity[]; outcome:'clean'|'failed'; forced:boolean}`. `ownProcessTree(child: ChildProcess, platform: NodeJS.Platform): Promise<OwnedProcessTree>` registers ownership immediately. POSIX children must be spawned detached before registration; Windows retains taskkill /PID /T behavior.

- [ ] Fake process-table tests: root exits before helper; helper reparents/leaves group; PID reused; ps fails; TERM ignored then KILL; deadline expires; repeated cleanup. Assert no unrelated process/group signalled, surviving or uncertain tree returns failed. Run `npx vitest run tests/ownedProcess.test.ts tests/leaseSmokeCleanup.test.ts` and observe failures.
- [ ] Implement bounded `ps` sampling with PID/PPID/PGID/start identity, stored descendants and group membership, including post-root-exit sampling. No command lines/user paths in persisted evidence. Graceful shutdown precedes escalation; do not reset absolute deadlines. Platform adapter errors fail cleanup. Update every relevant native runner to register/spawn consistently and preserve cleanup ownership through parent exit; no unconditional early return just because child.exitCode is non-null. Do not group-kill the controller's own process group.
- [ ] Add a standalone native probe that spawns a harmless child/grandchild, covers parent-exits-first and stuck descendants, and writes CleanupProof. Run fake tests on Windows; native probe on Mac in Task 6. Existing Windows native smoke still terminates exactly its owned processes.
- [ ] Run focused tests/typecheck and the affected native Windows runner once. Commit: `fix: retire owned native harness process trees`.

### Task 6: Private build runbook and Mac-1a verification

**Files:** Create `docs/testing/mac-private-build.md`; record generated evidence under `docs/superpowers/reviews/<execution-date>-mac-1a-evidence/` with a README identifying commit and hardware. Never commit app binaries or profiles.

**Interfaces:** Runbook consumes Tasks 1-5 CLIs; no new product API. Artifact handoff to Mac-1b is CandidateV2 plus final archive and signed app, with required native checks attached.

- [ ] Write exact zsh setup: verify `uname -m` is arm64, Node 24.18.0/npm 11.16.0, Git and `xcode-select -p`; clone/check out the chosen frozen commit; `npm ci`; `npm --prefix services/signalling ci`; `npm run build:signalling`. Verify lockfile workerd executable on Mac; no API token needed for dry-run build or local smoke. If selected Node cannot install on the owner's OS, record failure and decide an explicit supported build-host floor rather than silently using another toolchain.
- [ ] Document `npm run package:candidate:mac -- --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --output=dist/mac-private`, audit invocation and `open` of both original/extracted app. Check codesign results, ARM64 inventory, notices, source/output hashes, and absence of env/test assets. Document independent Windows build/audit at the same commit.
- [ ] On Windows and Mac run `npm test`, `npm run typecheck`, `npm run build`; run service tests for the candidate. On native Mac run host, RTC, online-app Skiff/Cutter and recovery smokes plus process-tree probe. Enumerate recovery scenario flags from the runner: skiff, cutter, paused, upload, race, stale. Record PASS/FAIL/NOT_RUN individually; synthetic suspend is not actual OS sleep.
- [ ] Manually verify Finder launch without dev server/environment, room-code paste, Retina, fullscreen, focus neutralization, storage outside bundle, app restart, window close and Cmd+Q (including bounded failed-save case). Record actual OS/chip and screenshots. No Mac access means this step remains unchecked.
- [ ] Validate all generated manifests/reports, run `git diff --check`, commit runbook and sanitized evidence only. Mac-1a complete means native gates A-C passed; then follow [Mac-1b](2026-11-16-mac-1b-cross-platform-validation.md).

## Self-review and handoff

Coverage: packaging/signing/archive (2,4,6); canonical formats and per-side identity (1,4); native UX/exit (3,6); native helper ownership (5,6); secret exclusion and no distribution account (2,4,6). Cross-platform pair/deployment/recovery validation is owned by Mac-1b, not implicitly completed here. No product code was changed while writing this plan.
