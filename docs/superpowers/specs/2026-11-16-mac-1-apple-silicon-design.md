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

The first deliverable is a locally built .app, not a promise that an ad-hoc signed archive opens on every other Mac. Build on each test Mac initially. A mandatory symlink-preserving audit archive is for storage and evidence, not public distribution.

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

Introduce a platform-aware manifest revision, retaining historical manifests as historical records. Include platform, architecture, actual OS/build-tool versions, source revision, canonical lockfile blob identities, content digest, runtime protocol/sim/checkpoint/replay values from shared constants (including constants to be introduced below), service origin, artifact hashes and signing state. Fail on missing/unsupported required identity fields; never silently relabel old evidence with current versions.

Resolve platform-specific bundle paths in one audited helper. Windows uses resources/app.asar and FTLite.exe; Mac uses FTLite.app/Contents/Resources/app.asar and Contents/MacOS/FTLite. Hash the final packaged executable and mandatory whole-bundle archive after signing. Verify packaged game bytes against that platform's build output and preserve the existing exclusions for secrets, tests, profiles and evidence. Do not require Windows and Mac binary hashes or archive hashes to equal.

A cross-platform pair has one logical compatibility identity (revision, lockfile/content identity, mode and protocol versions, service), plus two independently audited artifact identities. Report validation must join the two sides by actual run ID, host generation, authoritative publication/checkpoint and applied command evidence, not just matching user-entered labels. Each side retains its own package hash and provenance. Historical single-platform proof must remain valid under its original schema; new proof uses explicit versioned validation.

Keep observation tooling outside the distributed game package. The native harness must retain exact ownership and hashes for instrumented executable artifacts. An instrumented run is labelled as such and cannot substitute for the separate ordinary packaged-app manual launch/play check. Force-relay mode must be observable in harness configuration and selected ICE candidate pairs; it must not be inferred from successful connectivity.

## Validation and acceptance gates

| Gate | Required evidence |
| --- | --- |
| A: Build portability | Root tests, typecheck and build on Windows and native Mac ARM64; relevant manifest/lifecycle tests; same logical content digest from the selected revision. Service tests run for the candidate; no need to run a local Worker to play a packaged client. |
| B: Native Mac runtime | Existing authority, RTC, online-app and recovery smoke coverage adapted to Mac; two local instances prove native utility and transport behavior; owned helper/process cleanup passes on success, failure and timeout. |
| C: Packaged usability | Finder launch, online menu, room-code paste, fullscreen, keyboard play, persistent storage, close and Cmd+Q. No Node install needed to run the built app. Record actual chip, OS, architecture and signatures. |
| D: Physical cross-platform LAN | Windows host/Mac guest, then Mac host/Windows guest. Both send gameplay commands; record acknowledgement, matching publication/checkpoint and no stuck input. The separate packaged-app manual session runs for at least ten minutes per direction; the bounded instrumented evidence run is shorter, as specified below. |
| E: Separate-network internet | One device on home internet and the other on a genuinely independent connection such as cellular hotspot. Both host directions, normal ICE and forced relay. Correlate two machine reports; forced relay requires selected relay candidate evidence and traffic on both sides. Labels alone do not prove topology; record how networks were separated. |
| F: Recovery | Guest disconnect/rejoin, guest restart, host loss followed by explicit rehost from committed state, actual Mac sleep/wake as guest and host, idle/after-Leave sleep, and graceful quit. Validate generation fencing, recovery rollback boundary, and no duplicate authority. |

Skiff with two physical devices is the mandatory baseline. Cutter four-seat local automation remains required regression coverage; four physical devices are optional. Mac-to-Mac play is a useful additional check when a second MacBook is available, not a blocker for Windows-Mac support.

Each gate reports PASS, FAIL or NOT_RUN with paths to evidence. Build-complete, Mac-runtime-verified, cross-platform-LAN-verified and cross-platform-internet-verified are separate outcomes. No physical access means D-F remain NOT_RUN. Any reused existing readiness aggregate must preserve its stricter requirements rather than setting internetReady from LAN or one-machine tests.

## Work boundaries and deliverables

Mac-1a: native packaging, Mac controls/lifecycle, platform-aware package audit, reproducible local-build quickstart. Completion requires native Mac execution, not merely producing an artifact on Windows.

Mac-1b: cross-platform evidence schema/harness, matching Windows/Mac candidates, paired test checklist and physical results. Tooling can be implementation-complete while physical verification remains pending.

Deliver the spec-following implementation, focused tests for changed behavior, audited per-platform candidates, and a test package containing instructions, checksums, expected results and evidence collection steps. Do not embed credentials or private user data in the package.

The builder chooses helper names, file organization, exact compatible Node patch, archive filename and whether to add macOS CI. CI is not required to enable the owner's local build; no paid runner/account is assumed. Select the actual candidate revision at implementation freeze to avoid racing concurrent engine work.

## Known limits and deferred work

The prior netcode review left checkpoint delivery after failed adoption, cross-machine clock skew and best-effort suspend-save freshness deferred. They remain documented risks, not fixes included by implication. If any prevents a required Mac-1 gate, record the failure and fix or explicitly revise scope before claiming that gate passed. Keep test clocks synchronized for baseline tests and record observed skew; do not relax lease fencing to mask it.

Signing/notarization for external distribution, Electron upgrades, universal/Intel builds and automatic updates are later milestones. Private test build support is not a public-release security or support claim.

## Research references

- [Electron 37.10.3 platform support](https://raw.githubusercontent.com/electron/electron/v37.10.3/README.md): ARM64 Mac binaries and Big Sur platform floor for the pinned release.
- [electron-builder v26 macOS configuration](https://www.electron.build/v26/docs/mac/): ARM64 targeting, bundle layout configuration and signing/entitlement options. Implementation must check installed v26 types and behavior; latest v27 configuration differs.
- [Apple: safely open apps on your Mac](https://support.apple.com/en-us/102445): Gatekeeper and per-app approval for locally trusted software.

These sources establish packaging constraints, not proof that FTLite already works on macOS. Native and paired execution supply that proof.

## Design review

A fresh builder-readiness review on 2026-11-16 found no consequential unanswered planning questions. The private-build approach is confirmed; this document remains a draft awaiting design approval. No product code or packaging configuration was changed while writing it. The subsequent Claude Code review amendments below supersede less-specific descriptions above.


## Review amendments: executable evidence contracts

### Canonical identity and deployed service provenance (R1-F1)

Define logical build identity as: full Git source commit, Git blob IDs at that commit for root and signalling package-lock.json, existing LF-normalized gameplay contentDigest, mode ID, session protocol version, sim version, checkpoint format and supported replay versions, and canonical HTTPS service origin. The two platforms must match all these fields. Blob IDs come from the committed tree, not raw checkout bytes. These are evidence-level comparisons, not new wire admission fields. Uncommitted candidate source changes are forbidden; later documentation commits are allowed only with the existing ancestor and per-side exact-source verification.

Each platform separately records exact raw sourceFiles, executable output, packaged binaries, archive bytes and tool versions. Those hashes are checked against that same machine's candidate; no cross-platform equality is required. This accommodates CRLF/LF checkouts and platform-specific bundling without weakening either artifact audit. Add fixtures for equivalent CRLF/LF checkouts that pair successfully, and different canonical source/content that must fail.

The deployed Worker is a third artifact with its own deployment revision, service source tree identity, configuration blob ID, exact deployed bundle/config hashes and deployment/version identifier. Both clients reference the same verified deployment record. Do not compare a locally rebuilt Mac Worker bundle or raw config bytes against Windows deployment bytes. Verify the deployment record against its retained uploaded-artifact evidence, and verify client/service protocol compatibility. Where current tooling requires local Worker build hashes, keep them as local-harness provenance, not proof of deployed bytes. No new deployment is implied by building a client; missing or incompatible deployment evidence blocks the deployed-service gate.

### Packaged play and bounded instrumented runs (R1-F2, R1-F3)

Gates D and E each require two independent parts for each host direction:

1. **Actual packaged-app session:** Finder-launched FTLite.app against the packaged Windows candidate. Record both audited archive/package hashes, machine/OS labels, topology, UTC start/end times and elapsed duration, host direction, room/run correlation where available, screenshots of both seats, and operator attestations for joining by room code, both players issuing visible gameplay actions, pause/resume agreement, and graceful exit. Gate D requires at least ten minutes of play after both seats enter gameplay. Gate E requires at least one complete host/join/play/pause/exit session on separate networks in each host direction. These are explicitly manual usability observations, not cryptographic state or relay proof.
2. **Instrumented evidence session:** Run the development-Electron harness separately against the same per-side audited game output and logical build identity. It supplies applied command IDs, shared authoritative publications/checkpoints and selected ICE route evidence. For Gate E run both normal ICE and forced relay, in each host direction. Do not claim the ordinary packaged session used relay solely from the separate harness result.

Keep existing bounded one-shot instrumented captures: capture deadline at most 540 seconds, total at most 600 seconds, existing input/publication array caps. The ten-minute soak belongs only to the manual packaged session, not this schema. A harness may stop earlier when sufficient evidence exists; counts must fit the schema without silently truncating evidence needed to join commands and publications. Overflow is a failed capture, not a reason to loosen validation. Both parts must pass; instrumentation alone never proves packaged networking, and screenshots never substitute for wire evidence.

### Physical recovery observations (R1-F4)

Add a versioned, externally instrumented two-machine recovery recorder; the current single paused snapshot and localRecovery schema do not implement this contract. It records bounded events at scenario boundaries from main-process lifecycle/lease ownership, service snapshots, checkpoint receipts and authority publications. Instrumentation stays outside distributed packages and retains hashes of every instrumented module. Each scenario is a separate run, capped at ten minutes, 2 MiB per machine and 1,024 events. Exceeding a bound fails that scenario. Use monotonic ordering per machine; cross-machine UTC times are annotations, not causal proof.

Every scenario begins with a shared run ID and both candidate identities, seat IDs and service-issued seat/connection generations, host ID/generation, a common committed checkpoint tuple (sequence, capturedTick, payload SHA-256), and a common authoritative publication. Join reports through those actual identities, not human labels. Record all lifecycle/generation transitions; checkpoints and publications are captured at the designated boundaries, not every simulation tick. A complete observer-coverage record spans the fencing and attempted-resume interval; gaps make the fencing claim NOT_RUN or FAIL, not PASS.

| Scenario | Required post-event observations |
| --- | --- |
| Guest disconnect/rejoin or app restart | Same run and seat identity; service-issued connection/seat generation advanced according to the existing protocol; stale connection rejected; fresh full-state/ACK completes before new commands; commands applied under the current host generation. Capture observer logs across both guest processes for restart. |
| Host loss and explicit rehost | Retained committed checkpoint tuple before disruption; service confirms a strictly newer host generation and selected host; new authority initialization records that exact restore tuple/tick; first post-restore publication has tick at least capturedTick and belongs to the new generation; both peers agree on subsequent state and a command. Never claim that all actions after capturedTick survived. |
| Mac sleep as guest | Operator attests real sleep and wake; host continues or follows its documented room policy; returning guest follows fresh admission/ACK before commands. Record old/new connection identity and any host-generation transition. |
| Mac sleep as host | Operator attests real sleep; record lease loss or service generation change while asleep, and old authority fencing on wake before it can publish or accept commands. Record explicit recovery/rehost outcome and checkpoint provenance if recovery occurs. A new generation must reject traffic from the old one. |
| Idle or after-Leave Mac sleep | Before/after phase is idle, with a persisted seat allowed; no join request, transport or authority is created on wake. |
| Graceful quit/close | Final save outcome (committed, timed out, failed or no active session), authority retirement and peer cleanup, exit completion and independently observed helper-process disappearance. |

For fencing claims, record old authority gate state and publication count at fence and after a controlled stale-resume/input attempt, plus service/current-host rejection of old-generation traffic. No publication or application after the fence may originate from the old authority. Publications generated before the fence but delivered late are classified by generation/order and must be rejected where stale; mere delayed arrival is not evidence of a second active authority. A killed host is proven stopped by OS process evidence; do not fabricate a post-kill gate event. These checks establish the observed test interval, not an unbounded absence claim.

A separate actual packaged recovery checklist covers guest restart, host loss/rehost, Mac sleep/wake and graceful quit with visible recovery outcomes. Screenshots and human attestation establish the real user action and packaged behavior only. Instrumented paired reports establish internal fencing and rollback properties. Gate F requires both; the existing one-snapshot actualOsSuspend attestation is insufficient for the expanded claim.

### Archive and signing profile (R1-F5, R1-F6)

For each Mac candidate, create a mandatory ZIP of the final signed .app with macOS ditto in archive mode, keeping the parent bundle and resource metadata. The archive must preserve framework symlinks. SHA-256 of the entire archive is the package identity, covering helpers/frameworks as well as app.asar; retain separately the main executable and app.asar hashes. Extract to a fresh temporary location, compare the recursive bundle inventory (relative paths, file content hashes, executable modes and symlink targets), validate signatures, and launch the extracted copy. Fail on missing files, dereferenced/broken symlinks or an altered signature. Archives need not be byte-reproducible across repeated packaging; each is independently identified.

Use explicit electron-builder 26 mac.identity '-' with identity auto-discovery disabled, notarize false and hardenedRuntime true. Provide app and inherited helper entitlements with allow-jit, allow-unsigned-executable-memory and disable-library-validation true, using the com.apple.security.cs.* keys from the installed builder's Electron entitlement template. Do not add App Sandbox, camera or microphone permissions. This is an explicit private-test signing profile, not a notarizable release claim.

Required observations: codesign --verify --deep --strict --verbose=2 succeeds on original and extracted bundle; codesign display identifies ad-hoc signatures on the app and executable helper bundles; lipo/file inventory shows ARM64 on all packaged Mach-O code. Record failures rather than switching signing profiles silently. Gatekeeper/spctl may reject this non-notarized private app: that assessment is recorded separately and does not replace signature integrity checks. Local Finder launch must still succeed. No global security-policy change is an acceptable workaround.

### Version sources and local test prerequisites (R1-F7, R1-F8)

SESSION_PROTOCOL_VERSION already lives in src/shared/netSession.ts and SIM_VERSION in src/renderer/src/sim/tuning.ts. Add canonical exported CHECKPOINT_VERSION and SUPPORTED_REPLAY_VERSIONS at a shared, dependency-safe format-version module; they do not exist today. Tie checkpoint validation/type literals and supported replay parsing/types to those definitions, preserving existing formats and replay-specific behavior. Manifest generation consumes them. Test manifest equality against canonical constants and retain rejection tests for unsupported formats. Versioned historical evidence validators retain their historical values and cannot be upgraded by relabelling.

The Mac build/test quickstart includes root npm ci, npm --prefix services/signalling ci, and the signalling build step where required by local audit/smokes. Verify the lockfile-resolved workerd has a native darwin-arm64 executable before running Gate B. Record local Worker hashes separately from the deployed artifact record above. Local workerd and the signalling workspace are build/test prerequisites, not dependencies of playing the packaged application. Offline installation/download failures must produce an explicit prerequisite failure, not a false Mac-runtime result.

### Independently observed POSIX cleanup (R1-F9)

Spawn each harness-owned Electron process in its own POSIX process group. Record the group ID, root PID and process start identity, and track descendants with PID/PPID/PGID and start identity before shutdown; continue sampling while it runs so that reparented helpers remain attributable. Request graceful shutdown, then bound escalation to TERM/KILL of that owned group. Verify that group and every tracked process are absent by the existing absolute cleanup deadline, including when the root already exited. Do not return success merely because the root exited. If a descendant leaves the group, track and terminate only the individually owned process after validating its start identity; never kill a reused PID or a global process name. Uncertain ownership or a surviving helper fails cleanup.

Retain the before/after process inventory and shutdown outcome in the local evidence report; redact command-line arguments and user paths. Run success, injected failure and timeout cases, including a parent that exits before its helper. App-reported counters remain useful but cannot substitute for independent OS evidence after a forced kill.
