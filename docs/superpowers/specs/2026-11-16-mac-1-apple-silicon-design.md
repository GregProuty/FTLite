# Mac-1: Apple Silicon private multiplayer test build

Date: 2026-11-16
Status: Draft for design approval. Private MacBook build approach selected by the user; detailed design not yet approved.
Baseline inspected: master at 1a0df0a. Engine work is advancing concurrently; implementation must record its actual source revision.

## Intent and success

Enable the owner to test FTLite networking with one Windows PC and their Apple Silicon MacBooks. Deliver a native macOS application, a matching fresh Windows candidate, and a reproducible test procedure. Either platform must host or join the existing room service. Success includes playing together, observing applied commands and matching authoritative state, and exercising reconnect and host recovery on physical machines.

A Mac launch is not proof of cross-platform networking; a same-Wi-Fi session is not proof of connectivity across separate networks. Report these separately. User hardware access is required for the physical tests; code and Windows automation alone cannot close those gates.

## Approaches and decision

1. **Private native build on a MacBook (selected).** Install build prerequisites once, check out the chosen revision, build an ARM64 .app, and launch it locally. No Apple Developer account required for this milestone. This is the shortest route to the user's own hardware tests.
2. **Developer ID signed and notarized distribution.** Better installation experience for external testers, but requires Apple credentials and release handling. Deferred.
3. **Browser client or replacement networking stack.** Would replace existing Electron utility-process, preload and transport boundaries. Rejected for this milestone: it adds a separate architecture project without helping validate the existing shipped runtime.

The first deliverable is a locally built .app, not a promise that an ad-hoc signed archive opens on every other Mac. Build on each test Mac initially. An optional archive is for storage and evidence, not public distribution.

## Scope and constraints

- Native darwin/arm64 only; no Rosetta requirement. Intel Mac, universal binaries, App Store submission, auto-update and public distribution are out of scope.
- Retain Electron 37.10.3 and the lockfile-resolved electron-builder 26.x for this milestone unless a reproduced ARM64 blocker requires an explicitly documented dependency change. Do not mix v27 signing configuration into this repo.
- Electron 37's published platform floor is macOS Big Sur 11. Set packaging metadata no lower than the pinned runtime's floor; actual support claims name only macOS versions tested on the owner's machines. This milestone does not qualify every release since 11.
- Use one chosen source revision and lockfile for the Windows and Mac candidates. Rebuild Windows; the historical Windows package is not a matching candidate by assumption.
- Preserve host authority, command ordering, admission checks, lease fencing, checkpoint and replay contracts. OS and CPU architecture must not become wire compatibility fields.
- Use the deployed HTTPS signalling service and its existing TURN issuance. No service deployment or protocol change is required solely for Mac support. Confirm service compatibility with the selected candidate rather than assuming an old deployment matches a later revision.
- Do not transfer root .env, Cloudflare API credentials, TURN provider tokens, seat tokens or private profiles to another computer. Client builds need only the existing nonsecret service-origin setting.

## Current implementation and changes required

`package.json` currently packages only Windows; `electron-builder.yml` defines NSIS and no Mac target. `src/main/index.ts` creates a sandboxed Electron window, launches the existing online owner, stores data through app.getPath('userData'), removes the application menu, and only binds F11 for fullscreen. `onlineExit.ts` already funnels close and quit through a bounded save and resource disposal.

The renderer, hidden WebRTC transport window and utility authority are shared code. Keep them shared. Native Electron ARM64 must run all three successfully. No Node WebRTC dependency is needed.

`candidate-manifest.ts` assumes resources/app.asar and FTLite.exe, and embeds historical version values. `internet-app-report.ts` also constrains historical runtime versions and compares package identity. These are real portability and provenance changes, not just a new package command. `build/contentDigest.ts` normalizes line endings; retain its platform-neutral semantics and prove digest agreement across the paired builds.

Several smoke runners already have Windows and POSIX branches, but POSIX process-tree retirement needs native verification. Do not infer that killing a parent kills Electron helpers.

## Build and installation contract

Provide explicit scripts for Mac development, private ARM64 candidate packaging and candidate audit without changing the existing Windows commands' meaning. The Mac candidate command must build and package the selected checkout with publication disabled and explicit ARM64 selection. Use the existing build-time FTLITE_PACKAGED_SERVICE_ORIGIN; runtime environment overrides remain prohibited in packaged mode.

The quickstart must give executable zsh commands for prerequisites, checkout, npm ci, build, package, audit and launch. Record the exact supported Node/npm versions chosen from the pinned tools' requirements. Never reuse Windows node_modules or compiled output on Mac. Xcode command-line tools may be a prerequisite; a full paid Apple account is not.

Package as FTLite.app with stable appId com.ftlite.foundation and include third-party notices. Verify Contents/MacOS/FTLite and nested Electron helpers are ARM64. Use electron-builder 26's private/ad-hoc signing behavior deliberately, with valid helper signatures and the entitlements needed by the pinned Electron runtime. Validate signatures locally; no Developer ID or notarization claim. Do not default to identity:null and assume ARM64 executable validity.

Launching from Finder must work without a shell environment or development server. Storage must work outside the bundle under Electron userData. If copying an app triggers Gatekeeper, use Apple's documented per-app approval when available, or build locally on that Mac. Never instruct disabling Gatekeeper system-wide or routinely stripping quarantine recursively.

## macOS lifecycle and controls

Use a small Mac application menu with Quit (Cmd+Q), standard editing shortcuts for room-code input, and fullscreen (Ctrl+Cmd+F). Preserve Windows F11 behavior. Both close and Quit must use the existing bounded save/dispose path. For this milestone, closing the sole game window quits the application on Mac as it does on Windows; there is no hidden background room owner or empty Dock-only session. Reopening the app starts the existing explicit saved-seat flow.

Test Retina rendering, fullscreen transitions, keyboard focus and input neutralization after focus loss. Built-in keyboards must support joining and controlling one online seat without function-key gymnastics. Controller support remains the existing feature set; new device mappings are outside scope.

Use existing suspend/resume fencing. Actual Mac lid-close or sleep must not allow the old authority to continue after lease loss. Waking while idle or after Leave must not autojoin a saved room. Cmd+Q, window close and failed save must all terminate owned helpers within the existing bounds. Test app restart with persistent seat/checkpoint data. Do not expand this milestone into guaranteeing a new checkpoint during suspend.

## Candidate identity and evidence

Introduce a platform-aware manifest revision, retaining historical manifests as historical records. Include platform, architecture, actual OS/build-tool versions, source revision, lockfile hash, content digest, runtime protocol/sim/checkpoint/replay values from their canonical exports, service origin, artifact hashes and signing state. Fail on missing/unsupported required identity fields; never silently relabel old evidence with current versions.

Resolve platform-specific bundle paths in one audited helper. Windows uses resources/app.asar and FTLite.exe; Mac uses FTLite.app/Contents/Resources/app.asar and Contents/MacOS/FTLite. Hash the final packaged executable and archive after signing. Verify packaged game bytes against that platform's build output and preserve the existing exclusions for secrets, tests, profiles and evidence. Do not require Windows and Mac binary hashes or archive hashes to equal.

A cross-platform pair has one logical compatibility identity (revision, lockfile/content identity, mode and protocol versions, service), plus two independently audited artifact identities. Report validation must join the two sides by actual run ID, host generation, authoritative publication/checkpoint and applied command evidence, not just matching user-entered labels. Each side retains its own package hash and provenance. Historical single-platform proof must remain valid under its original schema; new proof uses explicit versioned validation.

Keep observation tooling outside the distributed game package. The native harness must retain exact ownership and hashes for instrumented executable artifacts. An instrumented run is labelled as such and cannot substitute for the separate ordinary packaged-app manual launch/play check. Force-relay mode must be observable in harness configuration and selected ICE candidate pairs; it must not be inferred from successful connectivity.

## Validation and acceptance gates

| Gate | Required evidence |
| --- | --- |
| A: Build portability | Root tests, typecheck and build on Windows and native Mac ARM64; relevant manifest/lifecycle tests; same logical content digest from the selected revision. Service tests run for the candidate; no need to run a local Worker to play a packaged client. |
| B: Native Mac runtime | Existing authority, RTC, online-app and recovery smoke coverage adapted to Mac; two local instances prove native utility and transport behavior; owned helper/process cleanup passes on success, failure and timeout. |
| C: Packaged usability | Finder launch, online menu, room-code paste, fullscreen, keyboard play, persistent storage, close and Cmd+Q. No Node install needed to run the built app. Record actual chip, OS, architecture and signatures. |
| D: Physical cross-platform LAN | Windows host/Mac guest, then Mac host/Windows guest. Both send gameplay commands; record acknowledgement, matching publication/checkpoint and no stuck input. Play each direction for at least ten minutes. |
| E: Separate-network internet | One device on home internet and the other on a genuinely independent connection such as cellular hotspot. Both host directions, normal ICE and forced relay. Correlate two machine reports; forced relay requires selected relay candidate evidence and traffic on both sides. Labels alone do not prove topology; record how networks were separated. |
| F: Recovery | Guest disconnect/rejoin, guest restart, host loss followed by explicit rehost from committed state, actual Mac sleep/wake as guest and host, idle/after-Leave sleep, and graceful quit. Validate generation fencing, recovery rollback boundary, and no duplicate authority. |

Skiff with two physical devices is the mandatory baseline. Cutter four-seat local automation remains required regression coverage; four physical devices are optional. Mac-to-Mac play is a useful additional check when a second MacBook is available, not a blocker for Windows-Mac support.

Each gate reports PASS, FAIL or NOT_RUN with paths to evidence. Build-complete, Mac-runtime-verified, cross-platform-LAN-verified and cross-platform-internet-verified are separate outcomes. No physical access means D-F remain NOT_RUN. Any reused existing readiness aggregate must preserve its stricter requirements rather than setting internetReady from LAN or one-machine tests.

## Work boundaries and deliverables

Mac-1a: native packaging, Mac controls/lifecycle, platform-aware package audit, reproducible local-build quickstart. Completion requires native Mac execution, not merely producing an artifact on Windows.

Mac-1b: cross-platform evidence schema/harness, matching Windows/Mac candidates, paired test checklist and physical results. Tooling can be implementation-complete while physical verification remains pending.

Deliver the spec-following implementation, focused tests for changed behavior, audited per-platform candidates, and a test package containing instructions, checksums, expected results and evidence collection steps. Do not embed credentials or private user data in the package.

The builder chooses helper names, file organization, exact compatible Node patch, optional archive format and whether to add macOS CI. CI is not required to enable the owner's local build; no paid runner/account is assumed. Select the actual candidate revision at implementation freeze to avoid racing concurrent engine work.

## Known limits and deferred work

The prior netcode review left checkpoint delivery after failed adoption, cross-machine clock skew and best-effort suspend-save freshness deferred. They remain documented risks, not fixes included by implication. If any prevents a required Mac-1 gate, record the failure and fix or explicitly revise scope before claiming that gate passed. Keep test clocks synchronized for baseline tests and record observed skew; do not relax lease fencing to mask it.

Signing/notarization for external distribution, Electron upgrades, universal/Intel builds and automatic updates are later milestones. Private test build support is not a public-release security or support claim.

## Research references

- [Electron 37.10.3 platform support](https://raw.githubusercontent.com/electron/electron/v37.10.3/README.md): ARM64 Mac binaries and Big Sur platform floor for the pinned release.
- [electron-builder v26 macOS configuration](https://www.electron.build/v26/docs/mac/): ARM64 targeting, bundle layout configuration and signing/entitlement options. Implementation must check installed v26 types and behavior; latest v27 configuration differs.
- [Apple: safely open apps on your Mac](https://support.apple.com/en-us/102445): Gatekeeper and per-app approval for locally trusted software.

These sources establish packaging constraints, not proof that FTLite already works on macOS. Native and paired execution supply that proof.

## Design review

A fresh builder-readiness review on 2026-11-16 found no consequential unanswered planning questions. The private-build approach is confirmed; this document remains a draft awaiting design approval. No product code or packaging configuration was changed while writing it.
