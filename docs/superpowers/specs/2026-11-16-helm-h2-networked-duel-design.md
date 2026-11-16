# H-2: the networked duel (design)

Status: spec written 2026-11-16 on master `6ecc361` (SIM_VERSION 38, `src/renderer/src/sim/tuning.ts:7`). Not yet reviewed. No code or plan. Parent: the Helm demo spec, `2026-11-14-helm-demo-design.md` (§2, §6 to §11, §15 row H-2, §16). Templates: Net-3d (`2026-11-15-net-3d-online-sector-design.md`, how the sector went online) and Net-3e (`2026-11-15-net-3e-recovery-internet-design.md`, fencing, mirrors, re-host, HTTPS and TURN). The engine refactor (`2026-11-15-engine-refactor-design.md`) made the authority generic and registered the duel as a Net-3 mode. Defaults marked **(rec.)** are Claude's, taken under the standing order; the owner can overturn any of them. Numbers marked *(start)* are starting values for tuning.

## 0. Sources and decisions in force

| Source | Decision |
|---|---|
| Helm Q15, Q15b | Exactly two players, Helm and Weapons, no bots in seats; two computers over the network |
| Owner, H-2 brief | PvP out of scope; one player per machine; LAN first, then internet; the two-human playtest is the gameplay gate and is the owner's |
| Owner, 2026-11-16 | **Couch co-op is removed for now; gamepads are no longer supported; FTLite is a keyboard-and-mouse game.** The main menu is exactly **Single player**, **Multiplayer**, **Settings**. Single player is the owner's test bed for every demo mechanic (today the H-1 solo duel with Tab). Multiplayer has **Host** and **Join**, and they start the networked duel. The menu itself is built separately, before H-2; this spec assumes it exists |
| Engine refactor R-0 to R-2 | Generic authority (`authority/{rules,core,authority}.ts`); the duel is a registered mode (`src/network/modes/duel.ts:17-33`, `src/utility/authorityModes.ts:7`) with its own codec, snapshot, checkpoint and end record |

**Superseded in the Helm spec by the 2026-11-16 decision:** every gamepad line: §6 keys (line 127, left stick, d-pad, triggers), §10a pan by right stick (220) and zoom by shoulders (223), §11a Tab's gamepad Select/View (252) and §18 item 13 (347). The duel is keyboard and mouse only. The current renderer still merges gamepads into its device sample (`src/renderer/src/main.ts:46`); the menu work removes that, and H-2's online duel never reads a gamepad.

## 1. Goals and non-goals

**Goal.** Two machines, one player each, fly the Helm duel against the hunter over Net-3: Multiplayer → Host gives a join code, the other machine enters it under Multiplayer → Join, the host starts, and each player sees exactly the H-1 screens for their own character (console map view when seated, the Cutter interior when standing), drawn from the authority's published state. The owner can run the §16 checklist across LAN and internet sessions, with live telemetry and input-to-screen delay recorded on both machines.

**Goals in detail.**
1. A duel session is created, joined, started, played to an outcome, re-played (rematch) and left from the menu, with no dev flags.
2. The authority runs in the host's utility process, as in Net-3d; both renderers, host included, are stream clients of it.
3. The client stack becomes mode-generic (gap a) without changing the sector client's behaviour or wire.
4. Duel publication validation becomes cheap enough for 60 Hz on two attachments (gap b).
5. Disconnects, guest reconnect, host loss and re-host reuse Net-3d/3e unchanged at the generic layer.
6. Per-duel telemetry for §16 is recorded on both machines, with a report script.
7. Input-to-screen delay is measured per seat; prediction is pulled forward only on stated criteria.

**Non-goals.** PvP. Bots in seats. Prediction or rollback (Net-4) unless §9's criteria trip. Couch co-op, gamepads, more than two players, spectators. Net-2's click-to-move. Online sector play from the menu (the sector mode stays registered and tested, but Multiplayer starts only the duel, **(rec.)**). Signalling-service changes: the service is mode-agnostic (`validateCompatibility` checks only shape, `src/shared/roomSession.ts:96-99`; capacity 1 to 4, `services/signalling/src/directory.ts:47`). New art or sound.

## 2. Creating and joining a duel session

**Menu.** Multiplayer → **Host** creates a duel room; Multiplayer → **Join** takes the eight-character code (Net-3d's trimming and uppercasing). Reconnect appears only when a stored seat exists (Net-3d). There is no capacity choice: a duel room is always capacity 2.

**Main-process mode adapter.** Main's online session is sector-coupled today: it builds compatibilities, inits and mirror checks from `onlineSector.ts` (`sectorCompatibility` 27-31, `sectorJoinCompatibilities` 32, `sectorInit` 33-40, `validateCommittedSectorStart` 41-52, `validateSectorMirror` 16-26), called from `onlineSession.ts` at 147, 212, 285, 309, 341, 406-410, 419 and 472. H-2 introduces an `OnlineModeAdapter` in main with exactly those five operations (`compatibility()`, `joinCompatibilities()`, `init(snapshot, choice)`, `validateCommittedStart(snapshot, committed)`, `validateMirror(mirror)`) and two implementations: the existing sector functions, moved behind the interface unchanged, and a new `src/main/network/onlineDuel.ts`. The context records its adapter when it is created (host: from the action; join: from the compatibility that succeeded; reconnect: from the stored seat's `compatibility.modeId`). `identityOf` already takes `modeId` from the room (`onlineSession.ts:393-394`), so the utility selects the duel host from the registry with no utility change.

**Duel compatibility.** `{ protocolVersion: 2, modeId: 'duel', schemaVersion: 2, simVersion: SIM_VERSION, contentDigest, layoutHash: deriveLayout(cutter).layoutHash }`. The duel mode's `schemaVersion` goes from 1 (`duel.ts:18`) to 2 because the init and the event union change (below, §7, §8) **(rec.)**.

**Actions.** `OnlineAction`'s host entry is `{ type: 'host', capacity }` (`src/shared/onlineSession.ts:17`, validated at 64). It becomes `{ type: 'host', mode: 'duel' }` plus the sector form kept for tests; the menu sends only the duel form. Join tries the duel compatibility only: one request, `incompatible` means a different build **(rec.)**. Error text for `incompatible` names the build mismatch ("the other computer runs a different FTLite build").

**Seats.** The room's host seat is seat 0 and the joiner seat 1; Net-3d never renumbers seats. Logical player = seat. `createDuel` seats player 0 at Navigation and player 1 at Weapons (`src/renderer/src/sim/duel/state.ts:51-52`), so by default **the host flies the Helm**, which is exactly §11b's latency advice.

**Swapping before the start.** Nothing in the code can do this today: `createDuel(layout, seed)` hard-wires the seats, `DuelInit` has no seat field (`src/renderer/src/authority/duelCheckpoint.ts:19`, strict schema 34-37) and the room service has no lobby field for it. H-2 adds `helmPlayer: 0 | 1` to `DuelInit` and an optional third parameter to `createDuel(layout, seed, helmPlayer = 0)` **(rec.)**. The default path builds the identical state, so the duel golden does not change. The host's lobby shows **Swap seats** (a local toggle; the start action carries it as `{ type: 'start', helmPlayer }`). The guest's lobby reads "Host picks seats"; the guest learns its console from the committed init at start, and the start screen says "YOU: HELM" or "YOU: WEAPONS" for 3 s *(start)*. Because the guest cannot know the host's choice, `validateCommittedDuelStart` accepts either `helmPlayer` and requires every other field to equal the guest's own expected init (the sector version requires full equality, `onlineSector.ts:49`). Mid-duel swaps stay what §8 says: stand up and walk.

**Seed.** Sector online uses the fixed 2026 (`onlineSector.ts:38`). The duel's first seed is the room `runId`'s first eight hex digits as a u32, advanced by one until `validateMap` passes (at most 16 steps, else `invalid-request`) **(rec.)**: deterministic for a room, so both sides compute the same expected init, and a different map each session. The seed is in every telemetry record.

**Start.** Unchanged Net-3d/3e path: ready, start-propose/commit with the init's bytes and hash, initial checkpoint accepted before the bootstrap pause releases (`core.ts:74-75` starts paused under a session gate).

## 3. Host and client architecture

**Processes (Net-3d, unchanged).** Main owns credentials, the room and lifetimes; the host's utility owns the authority (`src/utility/authorityHost.ts`, registry `authorityModes.ts:7`); a hidden Chromium window owns RTC; each visible renderer owns input, the view and its replica. The host's renderer attaches to the utility through its own receive-time MessagePort, the guest's through streamed RTC; both use the streamed client path (`src/renderer/src/app/onlineSession.ts:146-149`). Guest bytes never pass through the host's renderer.

**Admission.** Online duel attachments are `receive-time`. This matters: the duel step rejects any `presence` or weapons command whose `requestedTick` is not the current tick (`src/renderer/src/sim/duel/step.ts:95`, `108`), and only receive-time admission restamps the envelope to the current tick (`src/renderer/src/authority/core.ts:438`). A test pins that a remote duel command is never rejected `stale-tick`.

**Renderer session routing.** The router holds one online session factory and the online session is sector-only (`sessionRouter.ts:5-17`; `onlineSession.ts:69`, `109`, `133-135`, `149`; `main.ts:62-69`). H-2 adds `src/renderer/src/app/duel/onlineDuel.ts`, `createOnlineDuelSession`, with the same outward surface (`attach(descriptor, port)`, `setStatus`, `setFocused`, `setInputBlocked`, `pause`, `frame`, `dispose`). The router's `online()` factory picks the duel or sector session from `descriptor.compatibility.modeId`, which the port descriptor already carries (main `onlineSession.ts:189`).

**The view, from published state.** `startDuelMode` builds the scene and the local runtime together (`src/renderer/src/app/duel/duelMode.ts:31-56`) and draws from the runtime (`68-94`). H-2 splits it: `createDuelScene(renderer)` owns the tactical layer, interior view, readout panel, pause banner, end card, fx and shake and draws from a **`DuelViewSource`**, the read surface `DuelRuntime` already exposes to the frame function (`duel`, `prev`, `missilePrev`, `crewPrev`, `cameras`, `epoch()`, `active()`, `view()`, `otherStatus()`, `axes()`, `steer()`, `alpha()`, `reasons()`, `drainEvents()`; `runtime.ts:149-184`). The local runtime implements it as today (Single player). `createOnlineDuelSource` implements it from the stream client:
- `duel`: the client's replica (§4), a `DuelState` restored from each accepted publication.
- `prev`, `missilePrev`, `crewPrev`: captured from the previous accepted publication before restoring the new one, exactly as `capture()` does before a local tick (`runtime.ts:202-206`). `alpha()`: `(now − receive time of the latest publication) · 60 / 1000`, clamped (H-1's `alphaAt`, `runtime.ts:99`). No extra presentation delay: the sector's 100 ms timeline (`onlineSession.ts:149`, default `src/network/state/timeline.ts:9`) is not used for the duel, because every millisecond shows on a direct stick **(rec.)**. If arrival jitter makes ships stutter, a 1-tick (16.7 ms) buffer is the first remedy, measured by §8's jitter figure.
- `active()`: the descriptor's seat; Tab is ignored online (one character per machine).
- `cameras`: owned by the online source per console, with the same follow, pan, snap and zoom code (`runtime.ts:342-354`); camera input never becomes a command.
- `drainEvents()`: per-tick tactical events are not in the snapshot ("Not stored: the per-tick events", `src/renderer/src/sim/duel/snapshot.ts:4-5`; `src/renderer/src/sim/tactical/state.ts:74`), so a remote view would lose beam flashes and impact bursts. The online source derives them from the cumulative counters that are in the snapshot (`shots`, `laserHits`, `layersStripped`, `missileHits`, `missilesLost` per ship, `state.ts:51`; the contact counters), the same technique H-1 already uses for contact sparks (`runtime.ts:247-250`): a `shots` increase is one beam from the firing ship to the target (hit) or to arc range along its heading (miss); a missile slot that empties is one `missileEnd` at its last position, a hit if `missileHits` rose. A dropped publication is absorbed because the counters are cumulative **(rec.; no wire change)**. Sounds keep coming from the authority's `cue` events (`duelRules.ts:49-56`).
- `otherStatus()`: H-1 reads the other player's sent `interactHeld` (`runtime.ts:312-316`), which a remote client does not have. Online: REPAIRING when the other character is standing within reach of a repair point whose `repair` progress rose since the previous publication, else WALKING.
- `axes()`/`steer()`: the local seat's own last-sent values when it is at that console; for the other player's console, zero (the predicted path draws a coast) **(rec.)**.

**Input over the link.** Keyboard and mouse only (`app/duel/input.ts`). Each 60 Hz input pump (independent of Pixi, as Net-3d) samples the keys and, while synced, focused, not blocked and running:
- **Held.** One held frame per pump for the own seat on `unreliable-latest`, using the existing held sequence and channel rules (`streamBinding.ts:28-36`). The axes are quantised to −1, 0, 1 before sending. Note: today the keyboard sample normalises diagonals to length 1 (`input.ts:17`, so ±0.707) and the duel step uses the raw value (`step.ts:116`), which contradicts the Helm spec's "each axis is −1, 0 or 1" (§6). H-2 quantises in the client (no sim change); Single player quantises too, so both modes feel the same **(rec.)**.
- **Commands.** The H-1 press table (`runtime.ts:275-306`: sit by Interact at a console in reach, stand by X, lock Q/E, Space charge and release, F launch, C camera) builds `sit`, `stand`, `laserLock`, `laserCharge`, `missileLaunch` and `setPaused` (Escape) envelopes through the receive-time outbox (`commandOutbox.ts`), with IDs from the confirmed `commandHighWater`. H-1's local gating (`runtime.ts:219-236`, `canCharge`/`canLaunch` and the `chargeSent` flag) runs against the confirmed replica instead; the truth about a held charge is the replica's `systems[0].fireHeld` plus what is in the outbox, so a lost release is re-sent rather than assumed. The authority remains the judge; rejections are dropped silently, as in H-1.
- **Focus loss.** Net-3d semantics: neutralise held input on `reliable-ordered`, stop producing, and send `laserCharge {held: false}` if the replica shows Fire held. Focus loss does not pause the duel (one player alt-tabbing must not freeze the other) **(rec.)**. Escape pauses for both, through `setPaused`.

## 4. The client codec and validation change (gap a)

**What is sector-bound today.** `createClientRun` imports the module-level sector `encodeMessage`/`decodeMessage` and `validatePublication` (`src/renderer/src/clientControl/clientRun.ts:2`; used at 35, 80, 117, 175, 185, 190, 194), checks the sector `SNAPSHOT_FORMAT` (50), builds and restores a sector `SimState` replica (55-60) and reconciles the card UI (61, 89). `createSectorRemoteClient` uses the sector codec for input identity (`sectorStream.ts:18`, `62-64`) and `decodeNotification` uses the module-level `decodeMessage` and the sector notification stream (55-61). `codec.ts` exports these as the sector codec (`src/renderer/src/net/codec.ts:208-219`).

**Change.** Split `clientRun.ts` into a generic stream client and the sector wrapper:
- `clientControl/streamClient.ts`, `createStreamClient<S, R>(link, owned, options)`, owns everything that is not cards: publication acceptance and ordering, run and watermark checks, outboxes, notification queues and byte budgets, ACK gating (`acknowledgePublication`), `neutralize`, held and command sending, `takeEvents`/`takeResults`. Its options add `codec: MessageCodec<S>`, `validatePublication(value): PublishedState<S>` and a `replica: ReplicaAdapter<S, R>` with `matches(replica, header)`, `load(layout, snapshot, digest)`, `restore(replica, snapshot, digest)`, `dispose(replica)` and `playerCount(replica)`. The held sequence moves from `ui.players[p].heldSequence` (`clientRun.ts:66`, `182-184`) into the core.
- `createClientRun` keeps its exact signature and behaviour: it calls the core with the sector codec, `validatePublication`, the `loadSnapshot`/`restoreSnapshot` adapter and its card hooks (`reconcileUi`, `reconcileCommandResult`, vote executions). Every existing call site compiles unchanged.
- The duel adapter: codec `duelCodec(2)` (`codec.ts:212`), validation `duelPublicationSchema` (214) plus `validateDuelSnapshot`, replica `DuelState`. Restoring in place needs a new `restoreDuelSnapshot(d, snapshot, digest)` (validate, then `unflattenDuelModules` into the existing duel and check `hashDuel`), because `loadDuelSnapshot` allocates a fresh interior every call (`snapshot.ts:102-111`) and the client receives 60 publications a second. A seed change (a rematch, §7) is a replacement, as a layout change is for the sector (`clientRun.ts:55`).
- `src/network/modes/remoteClient.ts`, `createModeRemoteClient`, is `createSectorRemoteClient` (`sectorStream.ts:75-141`) with the codec, notification stream name, label, `imageToPublication` and an optional presentation hook as parameters; `decodeNotification` and `inputIdentity` take the codec. `createSectorRemoteClient` becomes a call to it with today's values (sector presentation points, 100 ms timeline); `createDuelRemoteClient` passes `duelCodec(2)`, `'duel-notification'` (`duelStream.ts:14`), `imageToDuelPublication` and no timeline.

**Compatibility with the sector client.** No sector wire byte, schema, close reason or timing changes. The sector proof is the existing suite unchanged (`tests/onlineNeutralization.test.ts`, `onlineCoordinator`, `onlineIpc`, `netCodec`, `netParity`, `networkBoundary` and the rest), plus one new test that drives a duel client and a sector client in one process to show neither reads the other's module state, and a type test that a duel client cannot be built with the sector codec.

## 5. The publication validation cache (gap b)

**Cost today.** `validateDuelSnapshot` (`snapshot.ts:47-98`) does, on every call: `deriveLayout(layout)` (56), `createTacticalState(seed)` (62, map generation and broad-phase grid), `validateMap` (63), `mapHash` (64), `canonicalFields(layout, 2)` (69), `tacticalLength` (70) and the module field-offset map (76-78). It runs on the **host** for every publication on every streamed attachment (`duelPublicationToImage` → `checkedPublication`, `duelStream.ts:23-30`), so twice per tick with two players, and again on each **client** (`imageToDuelPublication`, 37-45), then a third time inside `loadDuelSnapshot` (103). The checkpoint validator regenerates the map too (`duelCheckpoint.ts:13-14`).

**Cache.** In `sim/duel/snapshot.ts`, two module-level bounded caches:
- **per seed** (max 8 entries, least recently used): `{ valid, mapHash, spaceLength, fieldOffsets, shape }`, where `shape` is the `TacticalState` from `createTacticalState(seed)` used read-only by `validateTacticalValues`. It never leaves the module; a test asserts its `hashTactical` is unchanged after 10,000 validations and that no caller can obtain it.
- **per layout** (keyed by `layout.id` and `layoutHash`, max 4): `{ derived, fields, interiorCount, tickOffset }`.

`validateDuelSnapshot` keeps every check and its order; only the regeneration is memoised. `restoreDuelSnapshot` (§4) skips the second validation by taking the already-validated value from the publication path.

**Budget gate.** A `scripts/profile-duel-publication.ts`, in the style of `scripts/profile-publication.ts`: on seed 2026 mid-duel, median host cost per tick for snapshot, two validations and two image encodes under 1.5 ms, and client cost per publication (decode, validate, restore) under 1.0 ms *(start)*. Recorded before and after the cache in the plan's evidence.

## 6. Presence, disconnect and recovery

**What exists.** The duel mode's producers are humans only; "a vacant player simply sends nothing" (`duel.ts:2-3`, `20-30`). A detach neutralises held input (Net-3d). But `present` stays `true` (`createDuel`, `state.ts:58`), so a disconnected seated gunner still counts as attending Weapons, and an `away` character is only ever made by a `presence` command (`step.ts:94-98`).

**Away steward.** H-2 adds a duel producer manager beside the humans, the duel's equivalent of `sectorProducers.ts`: a vacant or disconnected seat gets one **steward** on a loopback client that sends `presence {present: false}` once, at a completed boundary, through the normal ledger, and otherwise nothing. Reattaching retires the steward, waits for the existing full-state ACK gate (`streamBinding.ts:48-53`, `66`), and the returning client sends `presence {present: true}` as its first command. The steward holds no memory, so `DuelControllers` stays empty (`duelCheckpoint.ts:20-21`) and the checkpoint format does not change.

**Guest loss.** The host pauses the duel through the mode host's lifecycle pause (`encounterMode.ts:127`, reason `peer-lost`) **(rec.)**: in a two-person duel a lost partner is not a moment to keep fighting the hunter alone. The guest's renderer freezes its last view with "CONNECTION LOST — RECONNECTING" and enters Net-3d's bounded retry (1, 2, 4, 8 s, 30 s window). Rejoin never unpauses; either player presses Escape to resume (Net-3d rule).

**Host loss.** Net-3e unchanged: the utility fences itself on lease loss (12 s), the guest keeps the frozen view, the saved seat and the last committed mirror, and Re-host is offered to the reserved guest seat. The duel's mirror goes through the duel adapter's `validateMirror` (`duelRules.validateCheckpoint`; the checkpoint holds the init, snapshot and telemetry memory, `duelCheckpoint.ts:24`). A re-hosted duel restores paused, the old host can reconnect as a guest, and the 300-tick capture cadence means at most about 5 s of duel is lost. A test asserts a mid-duel duel checkpoint is far under the 256 KiB cap.

**Suspend, quit, Leave.** Net-3d/3e unchanged.

## 7. End of a duel and the rematch

**Today.** The authority treats `ended` as final: it disposes the tick driver and emits `ended` with the end record (`core.ts:449-453`); the duel step returns nothing once the outcome is decided (`step.ts:73`); a mode host refuses to replace its authority while anything is attached (`encounterMode.ts:85`); and Net-3d says game end shows the result and Return to menu. Locally, H-1 restarts by disposing the duel and creating the next seed (`runtime.ts:262-272`). The service room stays `active` after a game ends: it only fences `ended` for a failed start (`services/signalling/src/room/store.ts:149`).

**Decision: rounds inside one duel run (rec.).** The duel encounter becomes a series of rounds in one authority run. The networking stays untouched: one run ID, monotone publication sequences, the same ports, mirrors and recovery.
- New duel command `rematch`, accepted only while the round's outcome is decided (else rejected `duel-running`, a new member of `COMMAND_REASONS`, `contracts.ts:82-86`), from either present player. The first one wins; a second on the same tick is `noop`. The step handles it before the early return at `step.ts:73`: it resets the duel in place to `createDuel(layout, nextSeed(seed), init.helmPlayer)`, with seed + 1 advanced past invalid maps as in §2. Seats start from the init again.
- `duelRules.terminal` reports `ended: false` for a decided round; the run ends only when the players leave. A new optional rules hook `records(baseline, s)` emits one `{ kind: 'round', record }` authority event when a round's outcome is decided, carrying the end summary. The event union gains `round` with `wire.endRecord`'s schema (`codec.ts:157-162`, `115-121`); sector never emits it. The telemetry accumulator restarts with the round.
- The end card (`render/duel/endScreen.ts`, `endModel(outcome, tick, seed)`): "ENTER: REMATCH   ESC: LEAVE" on both machines; Leave is the Net-3d Leave.
- Single player uses the same `rematch` path, so H-1's private restart goes away.
- Versioning: `SIM_VERSION` 38 → 39 (the duel step gains a command). Sector goldens are re-blessed for the version number only, as §13 of the Helm spec requires; the duel golden must also change only by the version, since no golden script sends `rematch` or a non-default `helmPlayer`. A new duel golden covers one rematch.

The alternative, a new room per rematch, costs a new code and a re-join every round; the in-room re-init alternative (restart the authority under a new run ID and re-issue every port) fights `encounterMode.ts:85`, `clientRun.ts:49`'s run and sequence filters and Net-3e's mirror ranking. Both are rejected.

## 8. Live telemetry for §16

**What exists.** The full per-duel `DuelTelemetry` (`src/renderer/src/sim/duel/telemetry.ts:36-56`: laser releases, hits and misses, layers stripped, missiles and losses, contacts, baits, console swaps, empty and idle ticks, walking and repairing ticks) lives only in the host's authority as mode memory (`duelRules.ts:67`). What reaches clients is the end summary (`summary.ts:22-27`: outcome, ticks, terminal causes, laser releases and hits, missiles launched and hits, repairs finished). There is no `solo` flag anywhere (Helm §11a asks for one).

**Change.** Widen `DuelEndSummary` and the duel end record to the §13 list: add `laserMisses`, `layersStripped`, `missileLosses`, planet and asteroid contacts per ship, `baits`, `consoleSwaps`, `helmEmptyTicks`, `weaponsEmptyTicks`, `enemyInArcTicks`, `weaponsIdleTicks`, and per player `repairsStarted`, `walkingTicks`, `repairingTicks` **(rec.)**. It is not hashed, so no golden moves; it rides the same schema version bump as §2 and §7.

**Where it is recorded.** On every `round` event, each renderer builds a **duel playtest record**: `{ version: 1, session: 'solo' | 'online', transport: 'loopback' | 'lan' | 'internet' | null, role: 'host' | 'guest', seat, helmPlayer, seed, round, startedAtIso, summary, latency, jitter, disconnects, pauses }`. `transport` is taken from the selected ICE candidate pair type in the hidden RTC window's stats (host → `lan`, srflx or relay → `internet`; the host's own port is `loopback`). The renderer passes it to main through one new named preload method `recordDuel(record)`, validated against a strict, size-capped schema (8 KiB), and main appends a line to `userData/playtest/duel-YYYY-MM-DD.jsonl`. Records never contain tokens, codes, addresses or candidates. Single player writes the same record with `session: 'solo'`.

**Report hook.** `scripts/duel-playtest-report.ts <files…>` merges the host and guest files by seed and round, computes the §16 live targets (median round length within 3 to 5 minutes; both outcomes across the session; both weapons used in every round; no round lost to the planet in under 30 s), lists the latency figures of §9, and prints the five-question checklist with blanks for the owner. Its output pastes into a new "Helm demo" section of `docs/gates.md` and a playtest report under `reports/`. Solo records are reported separately, as §11a asks.

## 9. Latency: measuring input to screen, and the prediction fallback

**Measure.** Every publication carries `heldHighWater` and `commandHighWater` per player (`codec.ts:164-167`). The client stamps a held frame whose quantised axes differ from the previous one with `(sequence, sentAtMs)` from `performance.now()`. The **input-to-screen delay** is the time from that stamp to the first rendered frame after a publication with `heldHighWater[seat] ≥ sequence` is applied. The same is done for commands through `commandHighWater` (for example Space to the beam). Each round's record keeps the count, median, 95th percentile and maximum per kind, plus the link's RTT from `link.stats()` and the arrival jitter (the standard deviation of publication inter-arrival time). A debug overlay (F3) shows the live median and p95 on either machine.

**Expected.** Host Helm: up to one input pump plus one tick plus one frame, about 35 to 60 ms. Guest Helm: that plus the round trip, about 40 to 70 ms on a LAN and 80 to 200 ms on the internet. The Helm spec says latency is "one round trip plus interpolation" (§11b). In the code the host's own renderer is also a stream client of the utility (`onlineSession.ts:146-149`), so §11b's "seat the Helm on the host" removes the network round trip but not the client pipeline. H-2 drops the sector's 100 ms presentation delay for the duel (§3) so the host Helm is not 100 ms behind.

**Fallback criteria (rec.).** Pull Net-4's **own-ship prediction** forward as H-2c (predict the crew ship locally from the confirmed state plus the unconfirmed held frames, using `stepDuel`'s flight path, and reconcile to each publication) if any of these holds:
1. Helm input-to-screen p95 over 120 ms on a LAN session, or over 200 ms on an internet session, across a whole round;
2. the owner or the second player answers "the Helm felt laggy" in the post-session note (the report prompts for it) in two sessions;
3. the guest Helm's checklist question 1 (planet used on purpose) is "no" in sessions where the host-Helm answer was "yes".

Weapons and walking do not trigger it: the laser charge and the walk tolerate 200 ms.

## 10. Tests and gates

**Headless (vitest, every commit).**
- *Two-client loopback duel.* A duel mode host from `authorityModes` (`tests/duelMode.test.ts:45-140` is the start), two `createDuelRemoteClient`s on streamed loopback links, receive-time, one per seat. The scripted pair (`sim/duel/scripted.ts`) drives each seat **through its client only** (held frames and outbox commands from the confirmed replica). Over 10 seeds: each round reaches an outcome, both clients' final replicas hash equal to the authority's, the authority's journal replays offline to the same hash, no command is rejected `stale-tick`, and every `round` record matches the authority's summary.
- *Seats.* `helmPlayer` 0 and 1 seat correctly; the guest accepts either in a committed init and rejects any other field change.
- *Presence.* Detach Weapons mid-charge: the steward makes it away, the console counts empty, the charge freezes, the host pauses; reattach: ACK before input, `presence true`, still paused until a `setPaused false`.
- *Rematch.* Decided round → `rematch` → new seed, fresh duel state, client replica replaced, publication sequence still increasing; `rematch` while running → `duel-running`.
- *Recovery.* Capture mid-round and mid-rematch, re-host restore, same hash, telemetry continues, checkpoint under cap.
- *Gap a.* The sector suites unchanged; the cross-mode isolation test; the type test (§4).
- *Gap b.* Cache bounds, eviction, unexposed shape, identical accept/reject results with and without the cache over the existing snapshot tests.
- *View source.* Counter-derived events match the local runtime's events for the same ticks (with one publication in five dropped, every beam still appears once); `otherStatus` online matches local over a scripted repair.
- *Telemetry.* Record schema, redaction, the report's §16 arithmetic on fixtures.

**Electron smoke (`npm run test:duel-app-runtime`, like `test:online-app-runtime`, `package.json:17`).** Two Electron processes with separate temporary userData against local workerd (Net-3d's harness, `scripts/network/online-app-smoke.ts`): real menu Multiplayer → Host, Join by the displayed code, ready, Swap seats once, start; the Helm machine holds W for 2 s and the ship's speed rises on both screens; the Weapons machine presses Space and releases and a beam appears on both; both renderers agree on hash at a common tick; kill and restart the guest and see presence false, the host paused, rejoin, ACK, unpause by Escape; force a round end through a test-only seed and init, press Enter, see round 2; `duel-*.jsonl` written on both with latency samples. It cleans exact temporary roots and never global-kills Electron or workerd. The host-runtime and lease gates (`scripts/network/host-smoke.ts`, `lease-smoke.ts`) rerun unchanged with the duel mode registered.

**LAN manual checklist (the owner's, two Windows PCs on one home network).**
1. Both PCs run the same freshly built candidate (same build stamp on the menu).
2. PC A: Multiplayer → Host; the code shows. PC B: Multiplayer → Join, enter the code; both lobbies show two seats.
3. Swap seats twice and back; Start. PC A shows the Helm, PC B Weapons.
4. Fly a slingshot past the planet on A; B sees it smoothly. Charge and fire on B; A sees the beam.
5. Stand up on B, walk to a damaged room, repair, sit back down at Weapons.
6. Pull B's network cable for 10 s: A pauses with "PARTNER LOST"; plug in; B resyncs; Escape resumes.
7. Finish the round; Enter starts round 2 on both.
8. Alt-tab on A mid-thrust: the ship stops thrusting and coasts on both screens.
9. Leave on both; the F3 overlay's figures and `duel-*.jsonl` exist on both PCs; run the report script.
10. The record's `transport` reads `lan`.

## 11. Milestones

| # | Part | Contents | Acceptance |
|---|---|---|---|
| H-2a | **Online duel over loopback and LAN** | §2 mode adapter, compatibility, seats and swap, seed; §3 the online duel session and view source, input over the link; §4 the generic stream client and remote client; §5 the cache and its budget; §6 steward, pause on loss, reuse of Net-3e recovery; §7 rounds and rematch (SIM 39); §8 the widened summary, the record and `recordDuel` (transport and latency fields filled in but not yet reported) | All §10 headless tests and `test:duel-app-runtime` pass; the full suite, typecheck and build pass; sector goldens re-blessed for the version only; the publication budget met; Codex implementation review applied. **LAN manual checklist:** owner-run. LAN needs the deployed HTTPS service (the loopback configuration accepts only `localhost`, `src/main/network/onlineConfig.ts:12`), so it waits on step (d) below |
| H-2b | **Internet, telemetry and latency** | §8 report script and `docs/gates.md` section; §9 F3 overlay, percentiles, jitter, the report's latency table and fallback check; the Net-3e internet candidate for SIM 39 (`scripts/network/internet-app-manifest.ts`, `internet-app-smoke.ts`) | Internet smoke run against the deployed service and forced relay where the harness supports it; the report script on the smoke's records; **owner-only:** (d) redeploy and install the candidate on both PCs (the deployed package is SIM 35; master is 38 and H-2a makes it 39), then the LAN and internet sessions and the §16 checklist (three sessions, at least one pair other than the owner) |
| H-2c | **Own-ship prediction** (conditional) | Only if §9's criteria trip: Net-4's crew-ship prediction pulled forward | Criteria re-measured below the thresholds on the same network |

H-2a is the bulk. If it is too big for one plan, its builder splits it at the seam between "client stack and view" (§3 to §5) and "session, seats, steward, rounds and records" (§2, §6 to §8), with the first proven over the headless loopback before the second starts.

## 12. Risks and open questions (defaults taken)

1. **Latency on the direct stick** (Helm §17.1). The host flies by default; no presentation delay; measured per round; H-2c on criteria. **(rec.)**
2. **Arrival jitter without a timeline makes ships stutter.** Default: none; first remedy a 1-tick buffer, chosen by §8's jitter figure. **(rec.)**
3. **Counter-derived fx miss or double an event.** Default: derive from cumulative counters (§3) rather than add events to the wire; if a review finds a case the counters cannot express, add a bounded `recentEvents` field to the duel publication metadata in H-2b. **(rec.)**
4. **Rounds change `terminal`'s meaning for the duel.** The replay and checkpoint tests must show a multi-round run replays and restores; if the generic core assumes a non-ended run always ends, that is a defect for the plan to fix in the core, not a reason to fall back to new rooms. **(rec.)**
5. **The guest cannot see the host's seat choice before Start.** Default: host-only toggle, the guest told at start. A shared lobby field would need a service change. **(rec.)**
6. **Pause on guest loss frustrates a host who wants to keep flying.** Default: pause; the host can Escape to resume alone. The steward keeps the gunner's console empty. **(rec.)**
7. **Focus loss does not pause.** Default per Net-3d; the alt-tabbed player's ship coasts with stabilise on. **(rec.)**
8. **Quantising diagonals changes H-1's feel.** Default: quantise in both modes; held input is not part of the golden. **(rec.)**
9. **LAN needs the deployed service.** The owner's redeploy (d) gates even LAN play; H-2a's automated proof is two processes on one PC. **(rec.)**
10. **The sector online path loses its menu entry.** Default: it stays registered and its tests and Net-3 smokes keep running; Multiplayer offers only the duel (owner decision, 2026-11-16). **(rec.)**
11. **A derived seed lands on a dull map.** Default: accept, record the seed; tune spawns (Helm §17.3) from the report, not by curating seeds. **(rec.)**
12. **Seed + 1 for rematches repeats maps across sessions in one room.** Accepted; each round's seed is recorded. **(rec.)**

## Change log

- 2026-11-16: written from the Helm spec, Net-3d/3e, the engine refactor and the code at `6ecc361`; folds in the owner's 2026-11-16 decision (no couch, no gamepads; Single player, Multiplayer, Settings).
