# Codex review exchange: helm-h2a-iii-plan

Subject: `docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing efdc24a, effort high, 737 s, 10330472 in / 10079497 cached / 54923 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Single player writes no 'solo' playtest record, and the plan does not say it is deferring this
Spec §8 requires that 'Single player writes the same record with session: 'solo''. H-2a's §11 row includes 'the record and recordDuel'. The plan builds a schema that accepts 'solo', but nothing ever writes one. Only the online duel session calls recordDuel. The rebuilt duelMode.ts never builds or sends a record. Decision 5 states the transport deviation, but no decision or Scope line mentions solo records. · spec L317 ('Single player writes the same record with session: 'solo''), spec L440 (H-2a includes §8's record and recordDuel); plan L992/L1014 (schema admits 'solo'); plan L2632-2640 (record() exists only in onlineDuel.ts); plan L2342-2390 (startDuelMode has no recordDuel or summary); plan L24 (the 'Not in H-2a' list omits it); plan L45-46 (Decisions 5-6 cover transport and the log only). The local runtime steps stepDuelTick directly with no telemetry accumulator (src/renderer/src/app/duel/runtime.ts:L244); the summary exists only as authority mode memory (spec L296). · Helm §11a and spec §8 want solo rounds recorded and reported separately. The H-2b report script expects solo records, but no machine will have any. A spec requirement is missing without a stated deviation. · Either (a) give the local runtime the telemetry accumulator (sim/duel/telemetry recordTick from baseTick). On the decided tick, call duelRoundRecord(duelEndSummary(t), d.round, d.tactical.seed, d.baseTick) and send window.ftlite.recordDuel({version:1, session:'solo', role:'host', transport:null, seat:active, helmPlayer:d.helmPlayer, ...empty latency}) through a new DuelModeDeps.recordDuel, with a duelRuntime test. Or (b) add a stated deviation in Decisions and Scope moving solo records to H-2b, and tell the owner.

### [P2] R1-F2 The online end-card leave prompt survives a rematch from the partner: input is frozen in the new round, and Escape then pauses both machines
leaveConfirm is opened on a decided, running round, but nothing clears it when the round stops being decided. If one player presses Escape on the end card and the other presses Enter, round 2 starts and the first player is still in the leave branch. That branch sends neutral held input every pump, drops all commands, and keeps showing 'LEAVE THE DUEL?'. Pressing Escape ('STAY') now takes the not-decided branch and sends setPaused(true), pausing the duel for both players. Pressing Enter leaves the session mid-round. · plan L2695 (leaveConfirm toggles only when decided && running); plan L2696 (the else branch sends setPaused when not decided); plan L2698 (while leaveConfirm, held is neutral and the pump returns before play()); plan L2716 (the banner prefers the leave prompt over everything except CONNECTION LOST); spec L280-281 (Escape opens Leave only 'with the round decided'; while a round runs, Escape pauses and resumes). · This happens in ordinary two-player play: one player thinks about leaving while the other wants a rematch. The result is a player who cannot fly, an unwanted pause, or an accidental Leave. · In pump(), before handling Escape, set leaveConfirm = false when !decided or p.phase !== 'running' (or when d.round changes). Add a duelOnlineView or onlineDuel unit test: open the prompt on a decided replica, publish the next round, and check that Escape sends setPaused and no prompt is shown.

### [P2] R1-F3 The record's latency figures are wrong or skewed: rttMs is always 0, held stamps survive re-attach, and pause/disconnect counts are cumulative
(1) rttMs comes from link.stats() on the renderer's MessagePort link, and portLink always returns rttMs: 0. Every record, the guest's included, says 0 ms RTT instead of null or a real network figure. (2) heldStamps and commandStamps are never cleared on attach. Held frames sent just before a link drop are never confirmed. The new client allocates held sequences from the confirmed high water again, so those old stamps match the first frames confirmed after the reconnect and add samples of several seconds to median, p95 and max. A sample over 3,600,000 ms fails the ms schema, and main then silently drops the whole record. (3) pauses and disconnects are never reset per round, while the latency samples are. Round n's record therefore counts the pauses and disconnects of rounds 0 to n. · plan L2636 (rttMs: link.stats().rttMs); src/network/portLink.ts:L92-93 (stats() returns rttMs: 0); spec L339 (RTT should be 'the link's RTT'); plan L2603, L2726 (attach resets synced, presence and leaveConfirm but not heldStamps or commandStamps); plan L2652 (stamps are matched by sequence <= heldHighWater); plan L1001, L1005 (ms max 3_600_000 on every figure); plan L1062 (an invalid record returns false, with nothing logged); plan L2637-2638 (pauses and attaches are cumulative; only the samples reset). · These records are the H-2c fallback evidence (spec §9 criterion 1: held p95 over 150 ms on a LAN). Outliers from reconnects or a constant 0 RTT can trigger or hide the fallback by mistake. · Record rttMs: null in H-2a and state it next to Decision 5 (H-2b reads RTC stats). In attach(), clear heldStamps and commandStamps. Snapshot pauses and attaches at each record and report per-round deltas, or rename the fields as session totals. Clamp or drop samples above the schema maximum rather than losing the record.

### [P2] R1-F4 The build-mismatch error text the spec asks for is not written
Spec §2 says a duel Join makes one request, so 'incompatible' now means a different build, and its error text should say so: 'the other computer runs a different FTLite build'. The plan changes the join logic but not ERRORS['incompatible']. The user still sees the sector-era message about content and ship data. · spec L40 ('The error text for incompatible names the build mismatch ("the other computer runs a different FTLite build")'); src/renderer/src/render/sessionMenu.ts:L17 (the current text); plan L1559-1624 and L2862-2902 (the only sessionMenu edits; ERRORS is untouched). · A spec requirement is missing, in the error players are most likely to hit when two PCs run different candidates. · In Task 1 Step 7, replace ERRORS['incompatible'] with the spec's wording (for example 'The other computer runs a different FTLite build. Install the same build on both, then try again.'). Assert it in sessionMenu.test.ts.

### [P3] R1-F5 A deliberate Leave shows 'CONNECTION LOST — RECONNECTING' until the menu returns home
setStatus freezes and releases the client on the 'saving', 'idle' and 'ended' phases. Once client is null and frozen is set, bannerText() always returns 'CONNECTION LOST — RECONNECTING'. A player who confirms Leave on the end card (or presses the Leave button) therefore sees a reconnecting banner during the final save, which can take up to 3 s. · plan L2736 (the phase list includes 'saving', 'idle' and 'ended'); plan L2715 (!client && frozen gives CONNECTION LOST); plan L2883-2886 (menu.leave() returns home only after the leave resolves to idle). · It is misleading feedback on a normal action. · Set a local leaving flag when deps.leave() runs, or check status.phase. Show 'LEAVING…' (or no banner) for saving, idle and ended, and keep CONNECTION LOST for reconnecting, saved, rehosting and error.

### [P3] R1-F6 The rewritten rematch pointer test passes whether or not the Enter frame's drag and wheel are dropped
The new test presses confirm, runs one frame, zeroes the pointer, then ticks twice so the rematch applies. newRound() then calls freshCameras(), which replaces both cameras. The final assertion (follow 'ship', zoom ZOOM_DEFAULT) holds even if moved() were removed, so the test no longer checks what its name claims. · plan L1941-1949 (the new test); plan L2143-2148 (newRound runs freshCameras and cameraInput.reset); plan L2202 (moved() on the Enter frame). · The test passes for the wrong reason. The behaviour is harmless now, but the test would not catch a regression in the Enter-frame pointer handling. · Assert the active camera right after the press frame, before any tick: centre and zoom unchanged by the sampled drag and wheel. Or delete the test and say why the property is now trivial.

## Verified
- The main mode adapter matches master's onlineSector.ts: sectorCompatibility/sectorJoinCompatibilities/sectorInit/validateCommittedSectorStart/validateSectorMirror signatures (src/main/network/onlineSector.ts:L16-52) fit OnlineModeAdapter (plan L1147-1162); the duel's validateCommittedDuelStart copies the sector's lease, hash and strictness checks and relaxes only helmPlayer (plan L1111-1123), as spec L54 asks.
- Every onlineSession.ts replace block occurs once on master at the lines the spec cites: L15 import, L147 updateSnapshot, L200 and L274 attachPeer, L212 validatePayload, L285 activate, L309 sectorInit, L341 validateRecovery, L397 Context creation, L406-410 host/join, L412-419 credential, L472 start, L480 dispatch. The `origin` option is H-2a-ii's StreamAttachmentOptions.origin (plan ii L1058, L1284).
- The sector join loop keeps the old semantics: it tries layouts[0], then layouts[1] only on 'incompatible', and rethrows otherwise (plan L1404-1410 against onlineSession.ts:L407-410). The sector mirror store still validates sector mirrors with no capacity through validateModeMirror (plan L1177-1181).
- The sector gate is enforced in dispatch before any work (plan L1469), and main sets sectorTestEntry only for !packaged && FTLITE_SECTOR_ONLINE_TEST === '1' (plan L1511). FTLITE_DUEL_TEST_SEED is read only when unpackaged and is range-checked (plan L1512-1513; packaged = app.isPackaged at src/main/index.ts:L18).
- The duel:record handler checks sender === win.webContents, senderFrame === mainFrame and exactly one argument (plan L1534-1537), the same as the fullscreen channel (src/main/index.ts:L66-67). The record is parsed by a strict zod schema, capped at 8 KiB and cross-checked against summary.round and seed (plan L1013-1027). The path is built only from userData and the local date (plan L1054-1057). The preload adds one method that structuredClones a single argument (plan L938). The main/index.ts replace blocks match L11-15, L40-43 and L72-74.
- The preload and shared contract replace blocks match master (src/preload/index.ts:L1-2, L28-29, L34-35, L40-42). The new validator rejects host without a mode, a duel host with a capacity, unknown modes and helmPlayer 2 (plan L819-824, test L677).
- The record schema matches H-2a-i's DuelRoundRecord field for field: the widened summary plus round, seed and baseTick (plan i L914-923; MISSILE_LOSSES at plan i L895).
- Online session per spec §3: presence is sent once per attach as the first command, after commandStatus is ready (plan L2645-2647). Held input is quantised with Math.sign and sent every running pump (plan L2703-2704). Charge and launch are gated by canCharge and canLaunch on the confirmed replica, with a lost release re-sent after 250 ms (plan L2678-2683). Tab is ignored. Focus loss calls neutralize and releases a held charge without sending setPaused (plan L2613-2619, L2738). The remote client's command() and held() exist with these shapes (plan ii L533-551), and setPaused is a DuelCommand (src/renderer/src/net/contracts.ts:L77).
- Link close freezes a saved-and-loaded copy before the client releases its replica, because the onClose subscription is made before the client is created (plan L2730-2731). portLink.send after close is a no-op (src/network/portLink.ts:L73), so stopInput in the close callback is safe.
- Single player on the shared scene keeps H-1's behaviour: the blur, hidden and suspend pauses, M while user-paused or on the end card (runtime.ts:L346 unchanged), the pause banner only on the interior view (old duelMode.ts:L95 matches the new scene L2297 with layerPaused = userPaused), and the epoch-driven rebuild of the fx and interior (old duelMode.ts:L77-81, now scene L2279-2283). The rematch goes through stepDecided's present-player rule (plan i L2066-2070) with requestedTick = the current interior tick (runtime.ts:L220).
- The duelRuntime and duelReadout edits replace the restart expectations with the rematch's (same duel object, followingSeed, presence carried, end-card ticks advance) and do not weaken the other assertions. The other tests that end a round already use hull = 0 (tests/duelRuntime.test.ts:L288, L295).
- The sector suite edits (onlineCoordinator, onlineRecovery, onlineIpc, onlineSessionContract, onlineBridge) change only action shapes and add sectorTestEntry: true, as Decision 2 states (plan L219-715, spot-checked).
- The sector smokes' host-sector and join-sector bypass the menu's invoke, but every run clicks Ready (an invoke with enter=true, which calls deps.online()) before Start, so the router is online before any port arrives (scripts/network/online-app-smoke.ts:L100; src/renderer/src/main.ts:L62-64).
- The duel smoke cleans only its own mkdtemp root, after a prefix check (plan L3337-3339), kills processes by its own PIDs (taskkill /PID /T, plan L3241), disposes its own workerd runtime, and removes FTLITE_SECTOR_ONLINE_TEST from its environment (plan L3223).
- Task ordering: Task 1 changes the shared API and the menu together. Task 2 changes endModel's signature, its two callers and its tests in one task. menu.leave() and main.ts's leave wiring land in the same step (plan L2855, L2883-2901).

## Not verified
- That the forced-end seed 2277 still decides round 1 at tick 1471 when the host stands up at Weapons and the Weapons room happens to be damaged before E is pressed. repairInReach would then turn E into a repair instead of a sit (src/renderer/src/app/duel/controls.ts:L19-24). The search behind Decision 4 is not in the reviewed files.
- That round 2 (seed followingSeed(2277)) is not decided naturally, for example by a planet or asteroid contact after the guest's 2 s of thrust, before the smoke's beam and kill steps finish. The plan only says that no other seed from 1 to 3,000 decides within 40 s without input.
- That step 4's 'speed > speedBefore + 1' cannot be met by gravity alone in a 2 s window. The observer's units, from field offsets by name, were not traced through TACTICAL_MODULES.
- That a full 4 s charge releases a shot (shots increments) with no target in arc, which step 5 relies on.
- That commandStatus 'ready' always implies canAllocate, so the one-shot presence send can never return null and leave a rejoined player absent (plan ii L354-358 suggests yes).
- That receive-time admission restamps the online rematch's requestedTick (the remote client stamps publication.tick, plan ii L539, and stepDecided rejects a stale tick, plan i L2067). This rests on spec L75 and H-2a-ii's 'rematch through a client' test, not read here.
- The stated test counts (187, 81, 87 and 3459) and the typecheck: I did not run the suite, per the constraints.
- Whether a host can Start a duel room with the guest seat unoccupied (the start check accepts empty seats, src/main/network/onlineSession.ts:L471). I did not check how the duel's steward and producers treat a seat that never attached.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `22dfe97`. 6 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Single player writes no 'solo' playtest record, and the plan does not say it is deferring this

Confirmed: nothing in the plan writes a `session: 'solo'` record, and the local runtime has no telemetry accumulator. Taken as a stated deviation: Decision 14 and a Scope "Not in H-2a" line move Single player's records to H-2b, beside the report script that reads them; the Goal and the "After H-2a-iii" note say so. The owner is told.

## R1-F2 [P2]: The online end-card leave prompt survives a rematch from the partner

Confirmed. The Escape/Enter handling is an exported pure `leavePromptKeys` in `onlineDuel.ts` that closes the prompt unless the round is decided, the phase is running and the round is the one the prompt opened on, before it reads Escape. A `tests/duelOnlineView.test.ts` case opens the prompt on a decided replica, publishes the next round, and checks Escape sends `setPaused(true)` with no prompt.

## R1-F3 [P2]: The record's latency figures are wrong or skewed

Confirmed (`src/network/portLink.ts` returns `rttMs: 0`). Records carry `rttMs: null` (the schema admits it), stated beside Decision 5; `attach()` clears `heldStamps` and `commandStamps`; pauses and disconnects are per-round deltas; samples above `DUEL_RECORD_MAX_MS` are dropped rather than invalidating the record.

## R1-F4 [P2]: The build-mismatch error text the spec asks for is not written

Confirmed against `sessionMenu.ts`. Task 1 Step 7 replaces `ERRORS['incompatible']` with the spec's wording, and the sessionMenu test asserts the full text (its old `toContain('compatible')` would have failed).

## R1-F5 [P3]: A deliberate Leave shows 'CONNECTION LOST — RECONNECTING'

Confirmed. The banner reads `LEAVING…` for the saving, idle and ended phases, keyed on the phase so the menu's Leave button is covered too.

## R1-F6 [P3]: The rewritten rematch pointer test passes whether or not the Enter frame's drag and wheel are dropped

Confirmed. The test asserts the active Helm camera's centre, zoom and follow right after the press frame, before any tick.

## Also changed

- The full-suite count in Task 4 is 3463 (plan ii's three new tests plus this round's one).

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-iii-online-app.md

<!-- end -->

---

# Round 2 (delta, reviewing 6c6c726, effort medium, 95 s, 373979 in / 323272 cached / 6192 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — Stated as a deviation in Decision 14 (plan L54), the Scope 'Not in H-2a' line (plan L24), the Goal (plan L5) and After H-2a-iii (plan L3502), which names the telemetry accumulator and a recordDuel dep for H-2b. This is the option (b) the finding offered. The schema still admits 'solo'.
- R1-F2: resolved — leavePromptKeys (plan L2662-2671) keeps the prompt open only when the round is decided, the phase is running and d.round equals prompt.round, and it checks this before reading Escape. A stale prompt in round 1 therefore closes, and Escape sends setPaused(true) (L2667). pump uses it (L2781-2785), and keys.leave returns before a rematch could be sent on the same Enter. bannerText reads leaveConfirm.open (L2804), and attach resets it to CLOSED_PROMPT (L2814). The new test (plan L1802-1827) covers opening the prompt, Enter to leave, a partner's rematch, then Escape (pauses) and Enter (does not leave).
- R1-F3: resolved — rttMs is null (L2721) and the deviation is stated in Decision 5 (L45). attach clears heldStamps and commandStamps (L2815). Disconnects and pauses are per-round deltas through roundAttaches and roundPauses (L2723-2724): the first round gives 0 disconnects, and a re-attach gives 1. latencyFigure and arrivalJitter drop samples above DUEL_RECORD_MAX_MS (L1048-1061). The schema uses the same constant (L1020). The tests assert the dropped samples and that a non-null rttMs is accepted (L201-204).
- R1-F4: resolved — The replace block at plan L1567-1575 matches src/renderer/src/render/sessionMenu.ts:L17 exactly once. The test replace at plan L764-774 matches tests/sessionMenu.test.ts:L69 exactly once. No script or test asserts the old text. The ERRORS map is shared, so the sector's test-only Join shows the new text too. That is acceptable: a sector mismatch after both layouts are tried also means a different build.
- R1-F5: resolved — bannerText (L2803) shows 'LEAVING…' when status.phase is saving, idle or ended (LEAVING_PHASES, L2655), and CONNECTION LOST otherwise. setStatus records the status before it freezes and releases the client (L2824-2825), so the banner sees the phase that caused the freeze. Decision 7 (L46) states this.
- R1-F6: resolved — The test (plan L2003-2014) now snapshots the active Helm camera's centre, targetZoom and follow after the round is decided. It asserts them right after the press frame, before any tick. This mirrors the existing Tab test at tests/duelRuntime.test.ts:L369-377. A surviving drag would change the centre and follow, and a surviving wheel would change targetZoom, so the test now detects a regression.

## Verified
- The leavePromptKeys signature takes {pause, confirm}, and pump passes k.presses, which has more fields: this is structurally compatible (plan L2662, L2781).
- tests/duelOnlineView.test.ts imports CLOSED_PROMPT and leavePromptKeys from onlineDuel (plan L1704). Every other helper the new case uses (createDuel, disposeDuel, stepDuelTick, Outcome, confirmed, CUTTER) is already imported or defined in the file (plan L1703-1731).
- Other tests already import pixi.js values (tests/hudSlots.test.ts:L2), and onlineDuel only touches `window` inside createOnlineDuelSession (plan L2675), so importing its pure export should be safe.
- The duelRuntime rig's tick() runs rt.frame, so ticks(3) settles the end card before the snapshot (tests/duelRuntime.test.ts:L50-51).
- The test-count updates are consistent: duelOnlineView goes from 5 to 6, so Step 8 expects 82 tests in 8 files (plan L2996), and the full-suite count in Task 4 is 3463 (plan L3483).
- The Interfaces lists name DUEL_RECORD_MAX_MS (L88) and LeavePrompt, CLOSED_PROMPT and leavePromptKeys (L1691), and these match the code blocks.

## Not verified
- I did not run the new duelOnlineView case. Its rematch step assumes that plan i's stepDuelTick applies `rematch` from player 0 on a decided duel once present[0] is set; I did not trace this through plan i's step code.
- I did not trace the camera follow code to confirm that ship 0's interpolated position stays fixed across end-card frames, which the R1-F6 test's before/after equality relies on. It is very likely fixed, because no input was given, and it is the same assumption the existing Tab test makes.
- I did not run vitest to confirm that importing src/renderer/src/app/duel/onlineDuel.ts (which pulls in scene, input and network bridge modules) succeeds in the node test environment.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. Verdict ready, no new findings; R1-F1 to R1-F6 confirmed resolved.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

