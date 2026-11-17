# Codex review exchange: helm-h2a-iii-impl

Subject: `package.json scripts/network/duel-app-observer.ts scripts/network/duel-app-smoke.ts scripts/network/online-app-smoke.cjs scripts/network/online-app-smoke.ts scripts/network/online-recovery-smoke.ts src/main/index.ts src/main/network/duelRecords.ts src/main/network/onlineDuel.ts src/main/network/onlineModes.ts src/main/network/onlineSession.ts src/preload/index.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/onlineModeSession.ts src/renderer/src/main.ts src/renderer/src/net/duelRecord.ts src/renderer/src/render/duel/endScreen.ts src/renderer/src/render/sessionMenu.ts src/shared/onlineSession.ts tests/duelOnlineView.test.ts tests/duelReadout.test.ts tests/duelRuntime.test.ts tests/mainMenu.test.ts tests/networkBoundary.test.ts tests/onlineBridge.test.ts tests/onlineCoordinator.test.ts tests/onlineDuel.test.ts tests/onlineIpc.test.ts tests/onlineRecovery.test.ts tests/onlineSessionContract.test.ts tests/sessionMenu.test.ts tsconfig.node.json` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing d591e08, effort high, 509 s, 4918726 in / 4713257 cached / 42729 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 Reconnect and retry from a saved sector seat skip the sector test-only gate (minor a)
The gate checks only the host and join forms. Reconnect and retry take the adapter from the saved credential's modeId, so a saved sector seat reconnects into a sector room even when `sectorTestEntry` is false. The renderer wrapper then routes the sector descriptor to the sector session without any check of its own. · src/main/network/onlineSession.ts:L499 gates only `action.type === 'host' || 'join'` with `mode === 'sector'`; L403 and L430-432 call `onlineModeFor(credential.compatibility.modeId, …)` and set `c.mode = mode` with no `sectorTestEntry` check; the auto-retry paths at L141 and L147 and `resume()` at L569 also reach this. The menu offers 'Reconnect saved seat' on the Multiplayer page whenever the action is listed (src/renderer/src/render/sessionMenu.ts:L80). src/renderer/src/app/onlineModeSession.ts:L22-23 accepts 'sector'. Plan Global Constraints L29: the sector online forms are honoured only by an unpackaged build started with FTLITE_SECTOR_ONLINE_TEST=1. · A developer who once ran with the flag on the default userData, then runs without it, gets a working sector Reconnect from the duel-only Multiplayer menu. A packaged build is very unlikely to be exposed, because sectorInit rejects any credential whose SIM_VERSION or digest differs (onlineSector.ts:L36). Still, the gate is not closed on every entry path. · In `establish`'s reconnect/retry branch, after `onlineModeFor(...)`, add `if (mode.modeId === 'sector' && !deps.sectorTestEntry) throw onlineFault('storage-invalid')`. Apply the same check to `requested` at L403. Optionally skip listing 'reconnect'/'retry' at L76 when `saved?.compatibility.modeId === 'sector' && !deps.sectorTestEntry`. Add a case to the gate test in tests/onlineDuel.test.ts that stores a sector seat and dispatches reconnect.

### [P2] R1-F2 A Space release during a pause is lost and is never re-sent, so the charge stays held after resume
While the publication is paused, the pump drains the key presses and returns before `play()`, so a fireUp edge during the pause is dropped. After resume, the re-send rule needs `!chargePressed`. `chargePressed` is still true because no release was sent, so the release is never sent and the laser stays held until the player presses and releases Space again. · src/renderer/src/app/duel/onlineDuel.ts:L161 `keyboard.sample()` drains presses every pump; L172 `if (p.phase !== 'running') return;` comes before `play()`; L152 re-sends only when `(p.fireUp > 0 && …) || (!k.fireHeld && held && !chargePressed && …)`. `chargePressed` is reset only at L89 (stopInput), L141 and L153. The sim keeps `fireHeld` across a pause: it is cleared only at sim/tactical/weapons.ts:L76, L81 and L88, which a paused authority does not run. Plan Decision 7 (L47): 'a lost release is re-sent'. · The partner's pause is a normal event (Escape, or peer-lost). A Weapons player who lets go of Space during it finds the beam still charging after resume, and their release did nothing. This is a bug in the changed pause path. · Drop `!chargePressed` from the re-send clause (`!k.fireHeld && held && now - releaseSentAt > 250`), or set `chargePressed = false` when the key is not held and no release is pending. Cover it in a session-level test (see the test-gap finding).

### [P2] R1-F3 A link close with no matching status push freezes the view without 'CONNECTION LOST — RECONNECTING' (minor c)
The close handler freezes the view and stops input but leaves `client` set. The banner shows CONNECTION LOST only when `!client && frozen`, so the frozen view has no banner until main pushes a phase from the release list. Until then the publication phase is read from the closed client or the frozen copy, which is 'running'. · src/renderer/src/app/duel/onlineDuel.ts:L205 `offClose = link.onClose(() => { freeze(); stopInput(); })` (client not cleared); L189 `if (!client && frozen) return … 'CONNECTION LOST — RECONNECTING'`; L211 calls release() only for the error/reconnecting/saved/saving/rehosting/idle/ended phases. Plan Decision 7 (L47): freeze '… under "CONNECTION LOST — RECONNECTING" when its link closes'. · In most failures main emits 'saved' or 'reconnecting' soon after (onlineSession.ts:L139, L173), so this is usually a short gap. Any close that main does not mirror leaves a frozen screen with no explanation, while the pump silently stops sending (L164). · Track a `linkClosed` flag set in the onClose handler, or call `release()` from it after `freeze()`. Have `bannerText()` test `(!client || linkClosed) && frozen`, and make `state()`/`publication()` prefer the frozen copy once the link has closed. Clear the flag in `attach`.

### [P2] R1-F4 The record's jitter is not per round, and it includes the reconnect gap
`arrivals()` returns every inter-arrival gap since the source was created and is never drained per record. Held and command samples, disconnects and pauses are reset per round, but jitter is not. After a re-attach, the new source first observes the frozen copy and then the new client's first publication in the same round, so the whole reconnection time is pushed as one 'inter-arrival' gap. · src/renderer/src/app/duel/onlineSource.ts:L91 `if (lastTick >= 0) { gaps.push(now - receivedAt); … }` with no reset except a new source; L140 `arrivals: () => gaps`. src/renderer/src/app/duel/onlineDuel.ts:L109 `jitter: arrivalJitter(source?.arrivals() ?? [])`, and L110 resets only heldSamples, commandSamples, roundAttaches, roundPauses and startedAtIso. L75-76 and L207: the new source reads `client?.state() ?? frozen`, so its first observation is the frozen replica. Spec L339: 'a round's record keeps … the arrival jitter'. Plan Decision 6 (L46). · H-2b's report reads these records. Round 2's jitter mixes in round 1's gaps, and one 5–20 s reconnect gap makes `stdMs` meaningless for the round with the disconnect. That is exactly the figure spec L449 relies on to watch for uneven arrival. · Give the source a `takeArrivals()` that returns the gaps and clears them, and call it in `record()`. In `observe()`, do not record a gap when the previous observation was the frozen publication: for example, set `lastTick = -1` when the observed publication comes from a different client or attach, or pass an `attach` hook that resets `lastTick`. Add a unit test.

### [P2] R1-F5 The online duel session (Decisions 7–9) has no unit tests; only the pure leave-prompt function is tested
`createOnlineDuelSession` is untested at unit level: presence as the first command after the ACK on each attach, held input quantised and sent every pump, focus loss neutralising and releasing a held charge without pausing, Enter sending rematch only when the prompt is closed, the per-round record deltas, the frozen view and its banners. The duel smoke covers presence after the ACK, the existence of a record, thrust and a beam, but none of the focus, banner or record-delta behaviour. The new `duel:record` IPC handler's sender, frame and arity checks are untested too. · tests/duelOnlineView.test.ts imports only `CLOSED_PROMPT, leavePromptKeys` from app/duel/onlineDuel (diff L2484). tests/onlineDuel.test.ts tests `appendDuelRecord` but not the handler at src/main/index.ts:L82-85. scripts/network/duel-app-smoke.ts step 7 (diff L293-295) checks `firstInputOrder > firstAckOrder` and that a presence-true input exists. · These are the changed paths where the two P2 bugs above live: the lost release on pause and the jitter. A small session test with a fake link and a fake remote client would have caught both. · Add tests/onlineDuelSession.test.ts. Drive `createOnlineDuelSession` with a fake scheduler, a fake keyboard (window events) and a stub `createDuelRemoteClient` (vi.mock). Assert that presence is the first command after ready; that held frames are sent every pump with `Math.sign` values; that `setFocused(false)` calls neutralize and sends `laserCharge {held:false}` but no `setPaused`; that Enter on a decided round sends one rematch per press and none while the prompt is open; that a release lost in a pause is re-sent after resume; and that the second record's `disconnects`, `pauses` and jitter are that round's own. Add a handler test that a foreign sender or frame, or two arguments, returns false.

### [P3] R1-F6 `duel:record` appends without a rate or file-size bound (minor b)
Each valid call appends up to 8 KiB to today's file with no count or size ceiling. The channel's trust model is the same as fullscreen's, but fullscreen has no disk effect. · src/main/index.ts:L82-85 calls `appendDuelRecord` on every valid call; src/main/network/duelRecords.ts:L16 `appendFile` with no size check. Plan Decision 6 (L46): 'trusted as the fullscreen channel is'. · Only a compromised or buggy renderer could abuse it, since the sender and main-frame checks hold. A renderer bug that loops on round events would fill the disk at 8 KiB per call. · Cap the daily file in `appendDuelRecord` (for example, `stat` it and refuse past 16 MiB), or keep a per-window counter in the handler (for example, at most 4 appends per second). Return false when over the cap.

### [P3] R1-F7 Single player sends live held axes on the end card, while online sends neutral (minor e)
On a decided round, Single player builds `activeHeld` from the live keys unless Enter was pressed that frame. The online session sends neutral held input on the end card. · src/renderer/src/app/duel/runtime.ts:L350 swaps in `IDLE_KEYS()` only on the Enter frame; L352 sets `activeHeld` from `k`. src/renderer/src/app/duel/onlineDuel.ts:L177 sends `decided ? {0,0,false} : held`. Plan Decision 10 (L50): 'Its held axes are quantised as online's'. · The sim ignores held input on a decided round, so nothing visible changes. The two modes differ only in what they send, and the readout's `sentAxes`/`sentSteer` can show stray input on the end card. · In `frame()`, use `NEUTRAL` for `activeHeld` when `ended()`, matching online.

## Verified
- Decision 1 (plan L41): the action shapes `{host,mode:'duel'}`, `{host,mode:'sector',capacity}`, `{join,code,mode?}` and `{start,helmPlayer?}` are validated strictly (src/shared/onlineSession.ts:L69-74); the preload builds them (src/preload/index.ts:L35-42); the menu calls `host()`, `join(code)` and `start(helmPlayer)` (sessionMenu.ts:L102-103, L128).
- Decision 2 (L42): the session refuses the sector host/join forms with invalid-action unless `deps.sectorTestEntry` (onlineSession.ts:L499); main sets it only for `!packaged && FTLITE_SECTOR_ONLINE_TEST === '1'` (src/main/index.ts:L44); the sector suites set the flag and send `mode: 'sector'` (tests/onlineCoordinator.test.ts L125-280, onlineRecovery harness). The coordinator edits are mechanical: the diff shows 159 lines in and 159 out.
- Decision 3 (L43): the duel is capacity 2 with the Cutter at schema 2 (onlineDuel.ts:L22-26, L34). Join tries one compatibility (onlineModes.ts:L30; onlineSession.ts:L418-424). Round 0's seed is `seedFromRunId` (onlineDuel.ts:L28-29). The guest's committed-start check validates the lease identity and sha256, then requires equal key counts and every field equal to its own init except `helmPlayer` (L40-51). Mirrors are checked by their own mode through `validateModeMirror` in the mirror store (src/main/index.ts:L48; onlineModes.ts:L41-45).
- Decision 4 (L44): the test seed is honoured only unpackaged (`packaged ? undefined`, index.ts:L45), parsed as 1-10 digits and at most 0xffffffff, and applied as `nextValidSeed(testSeed)` in both init and the committed-start check, so both machines compute the same init.
- Decisions 5–6 (L45-46): the record schema is strict zod with string and array bounds, checks round and seed against the summary, and is capped at 8 KiB after parse (net/duelRecord.ts:L35-48). Main writes to `userData/playtest/duel-YYYY-MM-DD.jsonl` from the local date only (duelRecords.ts:L8-11). The handler checks `event.sender`, `senderFrame === mainFrame` and `args.length === 1` (index.ts:L82-85). The host's records use transport 'loopback' with RTT null; the guest's transport is null (onlineDuel.ts:L104-107).
- Decision 7 (L47): presence is the first command once `commandStatus` is ready on each attach (onlineDuel.ts:L117-119; reset at L200). Held input is quantised with `Math.sign` and sent every running pump (L176-177). Commands are gated by `canCharge`/`canLaunch` on the confirmed replica (L151, L155). Tab is not handled (play() has no switch). Focus loss calls `stopInput` (neutralize plus charge release) with no pause (L83-90, L213; sessionRouter.ts:L13). The view freezes as a saved-and-loaded copy (L95-101). The scene is kept across re-attaches (L202).
- Decision 8 (L48): `leavePromptKeys` opens and closes the prompt only on a decided, running round of the same round number; Escape otherwise sends setPaused; Enter in the prompt calls `deps.leave()` → `menu.leave()` (onlineDuel.ts:L48-57, L167-171; main.ts L68). The end card reads 'ENTER: REMATCH   ESC: LEAVE' with `decidedTick − baseTick` (L222-223). The test covers a partner's rematch closing a stale prompt (duelOnlineView.test.ts diff L2583-2606).
- Decision 9 (L49): the banner text covers player, peer-lost and generic pauses (onlineDuel.ts:L192-194); 'YOU: HELM'/'YOU: WEAPONS' shows for 3 s after each sync (L120, L223).
- Decisions 10 and 15, Single player (L50, L55): Enter queues one `rematch`, deduplicated (runtime.ts:L350); the round changes in place with presence carried (L261, L270-276); axes are quantised (L352); M still works when paused or on the end card (diff L1844); Tab is unchanged. The scene keeps `createInteriorView(…, renderer.feel)`, `interior.draw(…, events, paused ? 0 : dt)` and no fx shake on the interior (scene.ts diff L1920, L1946, L1958). The banner's visibility reproduces the old `userPaused && view === 'interior'` (L1954 with layerPaused = userPaused).
- Decision 11 (L51): the host form has no capacity control; the host lobby shows Swap seats and 'Host flies Helm'/'Guest flies Helm'; the guest sees 'Host picks seats'; `helmPlayer = swapped ? 1 - own : own` (sessionMenu.ts:L91, L122-128).
- Decisions 12–13 (L52-53): the driver's `host-sector`/`join-sector` validate their arguments before evaluating JS (online-app-smoke.cjs diff L336-339). The sector smokes set FTLITE_SECTOR_ONLINE_TEST=1; the duel smoke deletes it and sets FTLITE_DUEL_TEST_SEED=2277. The duel smoke follows the plan's order and asserts the swap via the guest's helmPlayer, the forced end, round 2 on both, round-0 records with latency samples on both, thrust and a beam on both, hash agreement at a common publication, the peer-lost pause, ACK before input on the rejoin, staying paused until Escape, then presence true.
- Smoke cleanup: the duel smoke removes only `mkdtemp(tmpdir()/ftlite-duel-app-)` after checking the prefix (duel-app-smoke.ts diff L309-311); it kills only its own PIDs with `taskkill /PID <pid> /T`; workerd goes through `runtime.dispose()`; the observer bundle and utility stub are written inside the temporary root.
- Sector behaviour: every former `sectorInit`, `validateCommittedSectorStart` and `validateSectorMirror` call now goes through `c.mode`, which is `sectorOnlineMode` for sector contexts and wraps the same functions unchanged (onlineModes.ts:L23-26). The sector's start ignores `helmPlayer`. The only other sector-visible change is the H-2a-ii `origin` attachment field (onlineSession.ts:L204, L278).
- Minor (d) triaged as acceptable: online Enter on the end card sends one `rematch` per non-repeat key press (input.ts:L52 ignores auto-repeat; onlineDuel.ts:L173); duplicates are answered noop and cost one reliable command each. No fix needed.
- Edited tests keep their intent: the restart assertions in duelRuntime.test.ts that were dropped (pacer restart burst, solo-start presence) no longer apply under Decision 10 and were replaced by rematch-in-place assertions. The duelReadout, mainMenu, sessionMenu, IPC, contract and bridge edits follow the new shapes and add rejection cases (onlineSessionContract diff L3398-3402).

## Not verified
- Minor (f), why the sector online-app smoke failed at the cancel step: no deterministic cause found by reading. `join-sector` runs the same main-process join; it differs from the old menu path only in that the menu's `invoke` is not used, so `pending` stays false and `deps.online()`/`session.selectOnline()` is not called until Ready (sessionMenu.ts:L46-48; main.ts:L77-79 closes any port that arrives while the router is not online). Both the old and new flows re-render the Leave button when the joining snapshot arrives, which can race the native click. Needs the failing run's report, which I did not read.
- Whether the duel stream client releases its replica on link close (`client.state()` returning null) or keeps the stale one; the banner finding holds either way. Also whether the authority re-sends a decided round's `round` event after a re-attach, which would produce a duplicate record. Both are in H-2a-ii code (network/modes/duelStream.ts), outside the manifest.
- That `stepDuelTick` ignores held input and keeps the interior still on a decided round (bears on minor e); the sim step was not read.
- Whether the authority publishes at 20 Hz while paused (which affects how pauses show up in jitter); not read.
- Runtime behaviour: no tests or smokes were run (read-only review); I relied on the brief's reported results (3549 tests, duel smoke 3/3, recovery PASS, sector online-app smoke 1 of 3).

---

# Round 1 response (implementation revised, 07d7fa4)

Reviewed `round-1.json`. 7 accepted, 0 rejected, 0 deferred. The prepared diff is regenerated for 6aa656f..HEAD. Full suite 254 files, 3560 tests pass; the duel smoke passes (43951 ms).

## R1-F1 [P2]: Reconnect and retry from a saved sector seat skip the sector test-only gate

Confirmed in `onlineSession.ts` (the gate covered host and join only). Reconnect, retry and resume now refuse a sector mode unless `sectorTestEntry`, and the action list does not offer reconnect/retry for a saved sector seat when the gate is off (the 'saved' phase can only hold a sector context entered with the gate on). A gate test stores a sector seat and dispatches reconnect.

## R1-F2 [P2]: A Space release during a pause is lost and is never re-sent

Confirmed. A release is re-sent whenever Space is up and the confirmed replica has shown the charge held for over 250 ms (only the Weapons seat can hold it), as Decision 7 says. Session test.

## R1-F3 [P2]: A link close with no matching status push freezes the view without CONNECTION LOST

Confirmed. A `linkClosed` flag set on close shows the banner at once and prefers the frozen copy; it clears on attach. LEAVING… still shows for saving, idle and ended. Session test.

## R1-F4 [P2]: The record's jitter is not per round, and it includes the reconnect gap

Confirmed. The source's `takeArrivals()` is drained per record and no gap is recorded across an attach; a round with a disconnect keeps its earlier gaps but not the reconnect time. Session test.

## R1-F5 [P2]: The online duel session has no unit tests

Confirmed. `tests/onlineDuelSession.test.ts` (7 tests) drives the session with fakes: presence first after ready on each attach, quantised held every pump, focus loss without a pause, Enter and the leave prompt, the re-sent release, the banner on close, per-round record figures. The `duel:record` sender/frame/arity check is a pure `duelRecordCallAllowed()` in `duelRecords.ts`, called by `index.ts` and tested. Each of the F1-F4 and F7 tests was checked to fail with its fix reverted.

## R1-F6 [P3]: duel:record appends without a rate or file-size bound

Confirmed. `appendDuelRecord` refuses past 16 MiB per day and returns false. Test.

## R1-F7 [P3]: Single player sends live held axes on the end card

Confirmed. `frame()` sends neutral held input while the round is decided, matching online. duelRuntime test.

## Also changed

- (nothing)

## Files changed

- src/main/network/onlineSession.ts
- src/main/network/duelRecords.ts
- src/main/index.ts
- src/renderer/src/app/duel/onlineDuel.ts
- src/renderer/src/app/duel/onlineSource.ts
- src/renderer/src/app/duel/runtime.ts
- tests/onlineDuelSession.test.ts
- tests/onlineDuel.test.ts
- tests/duelRuntime.test.ts

<!-- end -->

---

