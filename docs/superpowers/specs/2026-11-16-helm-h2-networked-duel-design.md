# H-2: the networked duel (design)

Status: spec written 2026-11-16 on master `6ecc361` (SIM_VERSION 38, `src/renderer/src/sim/tuning.ts:7`); revised after review round 1 (`docs/superpowers/reviews/2026-11-16-helm-h2-spec/round-1.json`, R1-F1 to R1-F11, all accepted). No code or plan. Parent: the Helm demo spec, `2026-11-14-helm-demo-design.md` (§2, §6 to §11, §15 row H-2, §16). Templates: Net-3d (`2026-11-15-net-3d-online-sector-design.md`, how the sector went online) and Net-3e (`2026-11-15-net-3e-recovery-internet-design.md`, fencing, mirrors, re-host, HTTPS and TURN). The engine refactor (`2026-11-15-engine-refactor-design.md`) made the authority generic and registered the duel as a Net-3 mode. Defaults marked **(rec.)** are Claude's, taken under the standing order; the owner can overturn any of them. Numbers marked *(start)* are starting values for tuning.

## 0. Sources and decisions in force

| Source | Decision |
|---|---|
| Helm Q15, Q15b | Exactly two players, Helm and Weapons, no bots in seats; two computers over the network |
| Owner, H-2 brief | PvP out of scope; one player per machine; LAN first, then internet; the two-human playtest is the gameplay gate and is the owner's |
| Owner, 2026-11-16 | **Couch co-op is removed for now; gamepads are no longer supported; FTLite is a keyboard-and-mouse game.** The main menu is exactly **Single player**, **Multiplayer**, **Settings**. Single player is the owner's test bed for every demo mechanic (today the H-1 solo duel with Tab). Multiplayer has **Host** and **Join**, and they start the networked duel. The menu itself is built separately, before H-2; this spec assumes it exists |
| Engine refactor R-0 to R-2 | Generic authority (`authority/{rules,core,authority}.ts`); the duel is a registered mode (`src/network/modes/duel.ts:17-33`, `src/utility/authorityModes.ts:7`) with its own codec, snapshot, checkpoint and end record |
| Net-3 parent §5 | The authority ticks at 60 Hz; ordinary remote state is sent at **20 Hz**, every third completed tick (`2026-11-14-net-3-internet-sessions-design.md:77`; `src/network/state/sender.ts:46`) |

**Superseded in the Helm spec by the 2026-11-16 decision:** every gamepad line: §6 keys (line 127, left stick, d-pad, triggers), §10a pan by right stick (220) and zoom by shoulders (223), §11a Tab's gamepad Select/View (252) and §18 item 13 (347). The duel is keyboard and mouse only. The renderer still merges gamepads into its device sample (`src/renderer/src/main.ts:45`); the menu work removes that, and H-2's online duel never reads a gamepad.

## 1. Goals and non-goals

**Goal.** Two machines, one player each, fly the Helm duel against the hunter over Net-3. Multiplayer → Host gives a join code; the other machine enters it under Multiplayer → Join; the host starts. Each player sees exactly the H-1 screens for their own character (console map view when seated, the Cutter interior when standing), drawn from the authority's published state. The owner can run the §16 checklist across LAN and internet sessions, with live telemetry and input-to-screen delay recorded on both machines.

**Goals in detail.**
1. A duel session is created, joined, started, played round after round (rematch) and left from the menu, with no dev flags.
2. The authority runs in the host's utility process, as in Net-3d; both renderers, host included, are stream clients of it.
3. The client stack becomes mode-generic (gap a) without changing the sector client's behaviour, wire or schemas.
4. Duel publication validation becomes cheap (gap b).
5. Disconnects, guest reconnect, host loss and re-host reuse Net-3d/3e unchanged at the generic layer.
6. Per-round telemetry for §16 is recorded on both machines, with a report script that computes the §16 rule.
7. Input-to-screen delay is measured per seat; a faster update rate, then prediction, are pulled forward only on stated criteria.

**Non-goals.** PvP. Bots in seats. Prediction or rollback (Net-4) unless §9's criteria trip. Couch co-op, gamepads, more than two players, spectators. Net-2's click-to-move. Online sector play from the menu: the sector mode stays registered and its app smokes keep running through a test-only entry (§10), but Multiplayer starts only the duel **(rec.)**. Signalling-service changes: the service is mode-agnostic (`validateCompatibility` checks only shape, `src/shared/roomSession.ts:96-99`; capacity 1 to 4, `services/signalling/src/directory.ts:47`). New art or sound.

## 2. Creating and joining a duel session

**Menu.** Multiplayer → **Host** creates a duel room; Multiplayer → **Join** takes the eight-character code (Net-3d's trimming and uppercasing). Reconnect appears only when a stored seat exists (Net-3d). There is no capacity choice: a duel room is always capacity 2.

**Main-process mode adapter.** Main's online session is sector-coupled today. It builds compatibilities, inits and mirror checks from `onlineSector.ts` (`sectorCompatibility` 27-31, `sectorJoinCompatibilities` 32, `sectorInit` 33-40, `validateCommittedSectorStart` 41-52, `validateSectorMirror` 16-26), which `onlineSession.ts` calls at 147, 212, 285, 309, 341, 406-410, 419 and 472. H-2 introduces an `OnlineModeAdapter` in main with exactly those five operations: `compatibility()`, `joinCompatibilities()`, `init(snapshot, choice)`, `validateCommittedStart(snapshot, committed)` and `validateMirror(mirror)`. It has two implementations: the existing sector functions, moved behind the interface unchanged, and a new `src/main/network/onlineDuel.ts`. The context records its adapter when it is created: the host's from the action, the joiner's from the compatibility that succeeded, a reconnect's from the stored seat's `compatibility.modeId`. `identityOf` already takes `modeId` from the room (`onlineSession.ts:393-394`), so the utility selects the duel host from the registry with no utility change.

**Duel compatibility.** `{ protocolVersion: 2, modeId: 'duel', schemaVersion: 2, simVersion: SIM_VERSION, contentDigest, layoutHash: deriveLayout(cutter).layoutHash }`. The duel mode's `schemaVersion` goes from 1 (`duel.ts:18`) to 2. The changes it covers are listed in §7.

**Actions.** `OnlineAction`'s host entry is `{ type: 'host', capacity }` (`src/shared/onlineSession.ts:17`, validated at 64). It becomes `{ type: 'host', mode: 'duel' } | { type: 'host', mode: 'sector', capacity }`, and join gains an optional `mode` (default `'duel'`). The menu sends only the duel forms. The sector forms are accepted only from the test-only entry (§10). Join tries the duel compatibility only: one request, and `incompatible` means a different build **(rec.)**. The error text for `incompatible` names the build mismatch ("the other computer runs a different FTLite build").

**Seats.** The room's host seat is seat 0 and the joiner's seat 1; Net-3d never renumbers seats. Logical player = seat. `createDuel` seats player 0 at Navigation and player 1 at Weapons (`src/renderer/src/sim/duel/state.ts:51-52`), so by default **the host flies the Helm**, which is exactly §11b's latency advice.

**Swapping before the start.** Nothing in the code can do this today:
- `createDuel(layout, seed)` hard-wires the seats;
- `DuelInit` has no seat field (`src/renderer/src/authority/duelCheckpoint.ts:19`, strict schema 34-37);
- the room service has no lobby field for it.

H-2 makes these changes **(rec.)**:
- `DuelInit` gains `helmPlayer: 0 | 1`.
- `createDuel` gains an optional third parameter, `createDuel(layout, seed, helmPlayer = 0)`.
- The value is held in hashed duel state (§7), so the step and restore read it there.

The host's lobby shows **Swap seats**. It is a local toggle, and the start action carries it as `{ type: 'start', helmPlayer }`. The guest's lobby reads "Host picks seats". The guest learns its console from the published state at start, and the start screen says "YOU: HELM" or "YOU: WEAPONS" for 3 s *(start)*. The guest cannot know the host's choice in advance, so `validateCommittedDuelStart` accepts either `helmPlayer` and requires every other field to equal the guest's own expected init. (The sector version requires full equality, `onlineSector.ts:49`.) Mid-duel swaps stay what Helm §8 says: stand up and walk.

**Seed.** Sector online uses the fixed seed 2026 (`onlineSector.ts:38`). The duel's first seed is the room `runId`'s first eight hex digits as a u32 (runIds are 32 lowercase hex characters, `roomSession.ts:89`). `nextValidSeed(s)` advances by one until `validateMap` passes; it takes at most 16 steps, else `invalid-request` **(rec.)**. This is deterministic for a room, so both sides compute the same expected init, and each session gets a different map. Round *n*'s seed is `roundSeed(init.seed, n)`: `nextValidSeed` applied to `seed + 1`, *n* times. Every telemetry record carries it.

**Start.** Unchanged Net-3d/3e path:
1. Ready.
2. Start-propose and start-commit with the init's bytes and hash.
3. The initial checkpoint is accepted before the bootstrap pause releases (`core.ts:74-75` starts paused under a session gate).

## 3. Host and client architecture

**Processes (Net-3d, unchanged).**
- Main owns credentials, the room and lifetimes.
- The host's utility owns the authority (`src/utility/authorityHost.ts`, registry `authorityModes.ts:7`).
- A hidden Chromium window owns RTC.
- Each visible renderer owns input, the view and its replica.

The host's renderer attaches to the utility through its own MessagePort as a streamed peer labelled `online-local` (main `onlineSession.ts:274`). Each guest attaches through streamed RTC under its attempt ID (main `onlineSession.ts:200`). Guest bytes never pass through the host's renderer.

**Update rate: keep Net-3's 20 Hz (rec.).** The sender transmits an ordinary publication only on every third completed tick (`sender.ts:46`). Full, pause, end and control boundaries are sent at once. Both renderers therefore see the duel at 20 Hz. H-2 leaves the sender unchanged, so the sector is unchanged. A per-mode cadence option is H-2c's first remedy (§9).

**Admission.** Online duel attachments are `receive-time`. This matters: the duel step rejects any `presence` or weapons command whose `requestedTick` is not the current tick (`src/renderer/src/sim/duel/step.ts:95`, `108`). Only receive-time admission restamps the envelope to the current tick (`src/renderer/src/authority/core.ts:438`). A test pins that a remote duel command is never rejected `stale-tick`.

**Renderer session routing (rec.).** The router's `online()` factory takes no argument and runs when the menu selects online, before any port exists (`sessionRouter.ts:5`, `11`; `main.ts:63-69`). The descriptor arrives later, through `bridge.onPort` → `session.selectOnline().attach(descriptor, port)` (`main.ts:72-75`). The online session it builds is sector-only: it builds `createSectorRemoteClient` with the 100 ms timeline at `src/renderer/src/app/onlineSession.ts:85`, and the file ends at 109. H-2 makes the factory return an **online session wrapper**, `app/onlineModeSession.ts`, with the same surface (`attach`, `setStatus`, `setFocused`, `setInputBlocked`, `pause`, `frame`, `dispose`):
- It holds no inner session until the first `attach`.
- On `attach`, it reads `descriptor.compatibility.modeId` (main `onlineSession.ts:189` puts the compatibility in the descriptor). It builds `createOnlineDuelSession` (new, `app/duel/onlineDuel.ts`) for `duel` or today's `createOnlineRendererSession` for `sector`, and forwards the attach.
- If a later descriptor's mode differs, it disposes the inner session (and its frozen view) and builds the other one.
- It replays the latest `setStatus`, `setFocused` and `setInputBlocked` values into each new inner session.

**The view, from published state.** `startDuelMode` builds the scene and the local runtime together (`src/renderer/src/app/duel/duelMode.ts:31-56`) and draws from the runtime (`68-94`). H-2 splits it. `createDuelScene(renderer)` owns the tactical layer, interior view, readout panel, pause banner, end card, effects and shake. It draws from a **`DuelViewSource`**: the read surface that `DuelRuntime` exposes to the frame function (`runtime.ts:149-184`), namely `duel`, `seed`, `prev`, `missilePrev`, `crewPrev`, `cameras`, `epoch()`, `active()`, `view()`, `otherStatus()`, `axes()`, `steer()`, `alpha()`, `paused()`, `reasons()` and `drainEvents()`. The scene reads `seed` to reseed the star field and for the end card (`duelMode.ts:73`, `93`). The local runtime implements the source as today (Single player). `createOnlineDuelSource` implements it from the stream client:

- **`duel`:** the client's replica (§4), a `DuelState` restored from each accepted publication.
- **`seed` and `epoch()`:** the replica's round seed, and its `round` value from the hashed round module (§7). A new round rebuilds the view caches, as a local restart does (`duelMode.ts:71-75`).
- **`prev`, `missilePrev`, `crewPrev`:** captured from the previous accepted publication before restoring the new one, as `capture()` does before a local tick (`runtime.ts:202-206`).
- **`alpha()`:** `elapsed / (Δtick · 16.7 ms)`, clamped to 0..1. `elapsed` is the time since the latest publication was received, and `Δtick` is the tick gap between the previous and latest accepted publications (normally 3).
  - H-1's `alphaAt` (`runtime.ts:99`) assumes a one-tick gap; it would saturate 16.7 ms into a 50 ms interval and freeze the ships for two frames in three.
  - Interpolation keeps the view one gap behind the newest state. No further presentation delay is added: the sector's 100 ms timeline is not used for the duel **(rec.)**.
- **`paused()` and `reasons()`:** from the publication's `phase` (`paused` with its `pauseReason`). Online, the banner shows for any pause and names the reason ("PAUSED BY PLAYER 2", "PARTNER LOST").
- **`active()`:** the descriptor's seat. Tab is ignored online (one character per machine).
- **`cameras`:** owned by the online source per console, with the same follow, pan, snap and zoom code (`runtime.ts:342-354`). Camera input never becomes a command.
- **`drainEvents()`:** per-tick tactical events are not in the snapshot ("Not stored: the per-tick events", `snapshot.ts:4-5`; `sim/tactical/state.ts:74`), so a remote view would lose beam flashes and impact bursts. The online source derives them, per ship, from the cumulative counters that *are* in the snapshot: `shots`, `laserHits`, `layersStripped`, `missilesLaunched`, `missileHits` and `missilesLost` (`sim/tactical/state.ts:51`), plus the contact counters. This is how H-1 already derives contact sparks (`runtime.ts:247-250`). Over one gap of up to 3 ticks **(rec.; no wire change)**:
  - **Beams.** Each `shots` increment is one beam, from the firing ship to the target (a hit, when `laserHits` rose) or to arc range along the firing ship's heading (a miss).
  - **Missile endings.** Each increment of `missileHits + missilesLost` is one `missileEnd`, a hit if `missileHits` rose, drawn at the missile's position in the previous publication.
  - **End and relaunch in one gap.** If a missile ends and the same ship relaunches within one gap, the slot is active before and after. The source tells this case apart because `missilesLaunched` and `missileHits + missilesLost` both rose: it draws the ending at the old missile's last position and starts a fresh trail for the new one.
  - **What the counters cannot express.** The exact end point inside the gap (at most 3 ticks of flight off) and the terminal cause of a lost missile (planet, asteroid, edge or expiry), so a loss always draws the neutral burst.
  - **Dropped publications** are absorbed, because the counters are cumulative.

  Sounds keep coming from the authority's `cue` events (`duelRules.ts:49-56`).
- **`otherStatus()`:** H-1 reads the other player's sent `interactHeld` (`runtime.ts:329-333`), which a remote client does not have. Online, it reports REPAIRING when the other character is standing within reach of a repair point whose `repair` progress rose since the previous publication, and WALKING otherwise.
- **`axes()` and `steer()`:** the local seat's own last-sent values when it is at that console. For the other player's console they are zero, so the predicted path draws a coast **(rec.)**.

**Input over the link.** Keyboard and mouse only (`app/duel/input.ts`). Each 60 Hz input pump runs independently of Pixi, as in Net-3d. It samples the keys and, while the session is synced, focused, not blocked and running, sends the following.

- **Held input.** One held frame per pump for the own seat on `unreliable-latest`, using the existing held sequence and channel rules (`streamBinding.ts:28-36`). The axes are quantised to −1, 0 and 1 before sending, in Single player too, so both modes feel the same **(rec.)**. This fixes a mismatch: the keyboard sample normalises diagonals to length 1 (±0.707, `input.ts:17`) and the duel step uses the raw value (`step.ts:116`), which contradicts the Helm spec's "each axis is −1, 0 or 1" (§6).
- **Commands.**
  - The H-1 press table (`runtime.ts:275-306`) builds the envelopes:
    - Interact at a console in reach sits; X stands;
    - Q and E lock; Space charges and releases; F launches; C moves the camera;
    - Enter on the end card sends `rematch`;
    - Escape sends `setPaused` while a round runs (on the end card see §7).
  - Envelopes go through the receive-time outbox (`commandOutbox.ts`), with IDs from the confirmed `commandHighWater`.
  - H-1's local gating (`runtime.ts:219-236`: `canCharge`, `canLaunch` and the `chargeSent` flag) runs against the confirmed replica instead. The truth about a held charge is the replica's `systems[0].fireHeld` plus what is in the outbox, so a lost release is re-sent rather than assumed.
  - The authority remains the judge. Rejections are dropped silently, as in H-1.
- **Focus loss.** Net-3d semantics: neutralise held input on `reliable-ordered`, stop producing, and send `laserCharge {held: false}` if the replica shows Fire held. Focus loss does not pause the duel, because one player alt-tabbing must not freeze the other **(rec.)**.

## 4. The client codec and validation change (gap a)

**What is sector-bound today.**
- `createClientRun` imports the module-level sector `encodeMessage`/`decodeMessage` and `validatePublication` (`src/renderer/src/clientControl/clientRun.ts:2`, used at 35, 80, 117, 175, 185, 190 and 194). It also checks the sector `SNAPSHOT_FORMAT` (50), builds and restores a sector `SimState` replica (55-60) and reconciles the card UI (61, 89).
- `createSectorRemoteClient` uses the sector codec for input identity (`sectorStream.ts:18`, `62-64`), and its `decodeNotification` uses the module-level `decodeMessage` and the sector notification stream (55-61).
- `codec.ts` exports these as the sector codec (`src/renderer/src/net/codec.ts:208-219`).

**Change.** Split `clientRun.ts` into a generic stream client and the sector wrapper.
- **The generic core.** `clientControl/streamClient.ts`, `createStreamClient<S, R>(link, owned, options)`, owns everything that is not cards:
  - publication acceptance and ordering, run and watermark checks;
  - outboxes, notification queues and byte budgets;
  - ACK gating (`acknowledgePublication`) and `neutralize`;
  - held and command sending, `takeEvents` and `takeResults`.

  Its options add:
  - `codec: MessageCodec<S>`;
  - `validatePublication(value): PublishedState<S>`;
  - `replica: ReplicaAdapter<S, R>`, with `matches(replica, header)`, `load(layout, snapshot, digest)`, `restore(replica, snapshot, digest)`, `dispose(replica)` and `playerCount(replica)`.

  The held sequence moves from `ui.players[p].heldSequence` (`clientRun.ts:66`, `182-184`) into the core.
- **The sector wrapper.** `createClientRun` keeps its exact signature and behaviour. It calls the core with the sector codec, `validatePublication`, the `loadSnapshot`/`restoreSnapshot` adapter and its card hooks (`reconcileUi`, `reconcileCommandResult`, vote executions). Every call site (`localRuntime.ts:25`, `sectorProducers.ts:36`, `headless/runner.ts:26`, `sectorStream.ts:88`) compiles unchanged.
- **The duel adapter.** The codec is `duelCodec(2)` (`codec.ts:212`), validation is `duelPublicationSchema` (214) plus `validateDuelSnapshot`, and the replica is a `DuelState`. Restoring in place needs a new `restoreDuelSnapshot(d, snapshot, digest)`: validate, `unflattenDuelModules` into the existing duel, then check `hashDuel`. `loadDuelSnapshot` allocates a fresh interior on every call (`snapshot.ts:102-111`), and the client applies 20 publications a second. A seed change (a new round, §7) is a replacement, as a layout change is for the sector (`clientRun.ts:55`).
- **The remote client.** `src/network/modes/remoteClient.ts`, `createModeRemoteClient`, is `createSectorRemoteClient` (`sectorStream.ts:75-141`) with these as parameters: the codec, the notification stream name, the label, `imageToPublication` and an optional presentation hook. `decodeNotification` and `inputIdentity` take the codec.
  - `createSectorRemoteClient` becomes a call to it with today's values: sector presentation points and the 100 ms timeline.
  - `createDuelRemoteClient` passes `duelCodec(2)`, `'duel-notification'` (`duelStream.ts:14`), `imageToDuelPublication` and no timeline.

**Shared schema pieces (rec.).** `messageSchemaFor` builds the event payload union and the result reason enum once for every mode (`codec.ts:133`, `157-162`).
- **The `round` event.** It joins through a new `ModeWire` hook, `events(prims, shared): z.ZodTypeAny[]`, appended to the payload union. `sectorWire.events` returns `[]`, so the sector's schema stays identical. `duelWire.events` returns `{ kind: 'round', record: <duel end record> }`.
- **Two reasons join the closed `COMMAND_REASONS` enum:** `duel-running` and `duel-decided`. This is the established pattern: "the enum is closed, so every module's reasons join it" (`contracts.ts:81-86`). The sector never produces either. This widening is accepted.

**Compatibility with the sector client.** No sector wire byte, schema (except the reason enum above), close reason or timing changes. The sector proof is the existing suite unchanged (`tests/onlineNeutralization.test.ts`, `onlineCoordinator`, `onlineIpc`, `netCodec`, `netParity`, `networkBoundary` and the rest), plus three new tests:
- the sector codec rejects a `round` event;
- a duel client and a sector client run in one process, showing that neither reads the other's module state;
- a type test shows a duel client cannot be built with the sector codec.

## 5. The publication validation cache (gap b)

**Cost today.** `validateDuelSnapshot` (`snapshot.ts:47-98`) does the following on every call:
- `deriveLayout(layout)` (56);
- `createTacticalState(seed)` (62), which generates the map and the broad-phase grid;
- `validateMap` (63) and `mapHash` (64);
- `canonicalFields(layout, 2)` (69) and `tacticalLength` (70);
- the module field-offset map (76-78).

It runs on the **host** for every publication handed to each streamed attachment (`duelPublicationToImage` → `checkedPublication`, `duelStream.ts:23-30`, before the sender's cadence filter), so twice per tick with two players. It runs again on each **client** for each received image (`imageToDuelPublication`, 37-45), and a third time inside `loadDuelSnapshot` (103). The checkpoint path regenerates the map too: `validateDuelInit` at `duelCheckpoint.ts:80`, and the grace check at 98.

**Cache.** `sim/duel/snapshot.ts` gets two module-level bounded caches.
- **Per seed** (max 8 entries, least recently used): `{ valid, mapHash, spaceLength, fieldOffsets, graceLength, shape }`.
  - `shape` is the `TacticalState` from `createTacticalState(seed)`, used read-only by `validateTacticalValues`. It never leaves the module.
  - A test asserts that its `hashTactical` is unchanged after 10,000 validations and that no caller can obtain it.
  - `duelCheckpoint.ts:80` and `98` read `valid` and `graceLength` from this cache.
- **Per layout** (keyed by `layout.id` and `layoutHash`, max 4): `{ derived, fields, interiorCount, tickOffset }`.

`validateDuelSnapshot` keeps every check and its order; only the regeneration is memoised. `restoreDuelSnapshot` (§4) skips the second validation by taking the already-validated value from the publication path.

**Budget gate.** A new `scripts/profile-duel-publication.ts`, in the style of `scripts/profile-publication.ts`, measures on seed 2026 mid-duel *(start)*:
- the host's median cost per tick for the snapshot, two validations and two image encodes: under 1.5 ms;
- the client's cost per received publication (decode, validate, restore): under 1.0 ms.

The plan's evidence records both figures before and after the cache.

## 6. Presence, disconnect and recovery

**What exists.**
- The duel mode's producers are humans only: "a vacant player simply sends nothing" (`duel.ts:2-3`, `20-30`).
- A detach neutralises held input (Net-3d).
- `present` stays `true` (`createDuel`, `state.ts:58`), so a disconnected seated gunner still counts as attending Weapons. A character becomes away only through a `presence` command (`step.ts:94-98`).
- Main ignores the loss of the host's own seat (`onLost`, main `onlineSession.ts:183`).
- The mode host's lifecycle pause (`encounterMode.ts:127`) is reached today only by hostRuntime's `pause` command and the session fence (`hostRuntime.ts:26`, `67`).
- Producers receive only the authority (`ProducerOptions`, `encounterMode.ts:21-25`).

**Duel producer manager.** A new `src/network/modes/duelProducers.ts` is the duel's equivalent of `sectorProducers.ts`.
- **Pause hook.** `ProducerOptions` gains `pause(reason: string): void`, bound by `createHost` to the same lifecycle pause `ModeHost.pause` uses. The sector ignores it.
- **Attachment origin.** `StreamAttachmentOptions` gains `origin: 'local' | 'remote'`, checked by `validStreamAttachmentOptions`. Main sets `'local'` for the host's renderer port (main `onlineSession.ts:274`) and `'remote'` for every guest RTC attachment (200). The utility passes it through to `attachHuman`.
- **The away steward.** A seat with no attachment, or whose attachment has detached, gets one steward on a loopback client.
  - At the next completed boundary, it sends `presence {present: false}` once through the normal ledger, and otherwise nothing.
  - It holds no memory, so `DuelControllers` stays empty (`duelCheckpoint.ts:20-21`).
- **Peer loss.** When a `'remote'` attachment detaches, the manager attaches the steward, which submits `presence {present: false}` for the lost seat. The manager calls `pause('peer-lost')` only once that presence command has an applied result, at least one tick later (rec.). A lifecycle pause applied before the command executes would leave it pending for the whole outage, and capture refuses while anything is pending (`core.ts:127`), so there would be no pause checkpoint or Net-3e mirror.
  - **Already paused** (a player pressed Escape): nothing steps, so the presence command would never apply. The steward then defers its presence command until the next resume, and the manager requests no `peer-lost` pause, because the run is already paused (rec.).
  - **Presence rejected** (for example `stale-tick`, `step.ts:95`): the steward retries once at the next boundary; if that is rejected too, the manager requests the pause anyway, so a lost peer always ends in a pause.
  - The host's own renderer port closing (`'local'`, for example a reload) gets a steward but **no** pause: the host's machine is still there.
  - A test pins the order and the local-port exception. It asserts that the presence command's applied tick comes before the pause boundary, and that a pause capture is delivered during the outage. It also covers the already-paused case (no pending command, captures continue, no `peer-lost` pause) and the rejected-presence case.
- **Rejoin.** It retires the steward and waits for the existing full-state ACK gate (`streamBinding.ts:48-53`, `66`). The returning client then sends `presence {present: true}` as its first command.

**Guest loss.** The host pauses, as above **(rec.)**: in a two-person duel, a lost partner is no moment to keep fighting the hunter alone. The host can still press Escape and fly on alone. The guest's renderer freezes its last view under "CONNECTION LOST — RECONNECTING" and enters Net-3d's bounded retry (1, 2, 4, 8 s, within a 30 s window). Rejoining never unpauses; either player presses Escape to resume (Net-3d rule).

**Host loss.** Net-3e, unchanged:
1. The utility fences itself on lease loss (12 s).
2. The guest keeps the frozen view, the saved seat and the last committed mirror.
3. Re-host is offered to the reserved guest seat.

The duel's mirror goes through the duel adapter's `validateMirror` (`duelRules.validateCheckpoint`, as revised in §7). A re-hosted duel restores paused, and the old host can reconnect as a guest. The 300-tick capture cadence means at most about 5 s of duel is lost. A test asserts that a mid-duel checkpoint is far under the 256 KiB cap.

**Suspend, quit, Leave.** Net-3d/3e, unchanged.

## 7. Rounds: the end of a duel and the rematch

**Today.**
- The authority treats `ended` as final: it disposes the tick driver and emits `ended` with the end record (`core.ts:449-453`). It then rejects every new command `unavailable` (`core.ts:366-368`).
- The duel step returns nothing once the outcome is decided, and skips the tick advance (`step.ts:73`, `126`).
- A mode host refuses to replace its authority while anything is attached (`encounterMode.ts:85`).
- Net-3d says game end shows the result and Return to menu.
- Locally, H-1 restarts by disposing the duel and creating the next seed (`runtime.ts:262-272`).
- The service room stays `active` after a game ends: it fences `ended` only for a failed start (`services/signalling/src/room/store.ts:149`).

**Decision: rounds inside one duel run (rec.).** The duel encounter becomes a series of rounds in one authority run, with one run ID, monotone ticks and publication sequences, and the same ports, mirrors and recovery. The pieces below are what make that true.

**Hashed round state.** A new duel module `round`, flattened after `repair` and before `interior`, holds three values:
- `round`: 0 for the first round;
- `helmPlayer`: from the init;
- `baseTick`: the encounter tick on which this round began.
- `decidedTick`: the encounter tick right after the deciding step, or −1 while the round runs. It equals the snapshot tick of the first decided publication and of the `duel:<round>:true` safe point; the deciding step itself ran on `decidedTick − 1` and its results carry that tick (`step.ts:74,126`). The frozen accumulator's `ticks` is `tac.tick` after that step (`telemetry.ts:90-92`), so the rule below holds exactly. A validator test pins it on the decision-tick safe point.

The round seed is the tactical state's own `seed`, already hashed in the space module (`snapshot.ts:73` checks `values[2]`). With this module, the step, the snapshot and `rules.restore` read the round, its seed and `helmPlayer` from state. That matters because `rules.step` and `rules.restore` receive no init (`rules.ts:39`, `52`), and replays cover the round state automatically. Publications carry the round state, so a client that joins or reconnects late knows the round and the seating without seeing any `round` event. `validateDuelSnapshot` checks the module: `round` is a non-negative safe integer, `helmPlayer` is 0 or 1, `baseTick` is at most the tick, and `decidedTick` is −1 while the outcome is Running, otherwise between `baseTick` and the tick.

**Monotone tick.** The encounter tick is the interior tick (`duelRules.ts:31`) and never goes backwards. The sender drops any ordinary publication whose tick is not above the last one sent (`sender.ts:46`). Clients release events only once `publication.tick` reaches them (`clientRun.ts:155`). Checkpoints bound ledger and result ticks by the snapshot tick (`duelCheckpoint.ts:94-97`). So:
- A new round is built as `createDuel(layout, roundSeed(init.seed, round + 1), helmPlayer)`.
- Its interior and tactical ticks are then set to the current encounter tick, and its `baseTick` records that tick.
- `present` carries over from the decided round.
- Per-round figures, such as telemetry `ticks` and the round's duration, count from `baseTick`.

The plan audits every tick-stamped tactical field (for example `graceUntil`) so that a round started at tick T behaves as one started at tick 0. Two tests check this:
- a round started at T and a fresh duel with the same seed agree in every canonical field for 600 ticks, apart from the tick-stamp offset;
- `hashDuel` of a duel stepped through a rematch equals `hashDuel(loadDuelSnapshot(saveDuelSnapshot(it)))` at every tick for 600 ticks after the rematch. This guards ECS entity reuse between the stepped and the restored duel. If entity recycling makes them differ, the reset builds the new interior in a fresh world.

**A decided round (the end card).**
- `duelRules.terminal` reports `ended: false` while a round is decided; the run ends only when the players leave. The phase stays `running` unless someone pauses.
- **Ticks keep advancing.** The decided step still increments the interior and tactical ticks and runs no physics, so the scene stays frozen. Admission budgets reset each tick (`ledger.ts:66-70`), publications keep flowing, and checkpoints keep working.
- **Every command gets a result:**
  - the first `rematch` from a present player is `applied`;
  - a second `rematch` on the same tick is `noop`;
  - `presence` is applied, so the away steward still works on the end card;
  - every other duel command (`sit`, `stand`, `laserLock`, `laserCharge`, `missileLaunch`) is rejected `duel-decided`;
  - `setPaused` stays the core's.

  No ledger entry is ever left pending (`ledger.ts:98`).
- **`rematch` while a round runs** is rejected `duel-running`.
- **The rematch applies in the step**, before any other phase. The new round starts on the next tick.

**Records and capture.** A new optional rules hook, `records(baseline, s)`, emits one `{ kind: 'round', record }` authority event on the tick a round is decided. The record is the widened end summary (§8) plus `round`, `seed` and `baseTick`. The telemetry accumulator restarts with each round, and **freezes once a round is decided** (rec.). `recordTick` ignores every decided tick after the deciding one, so end-card ticks add nothing to `ticks` or the per-tick counters, and the terminal causes are not recomputed (`telemetry.ts:87-92,145-161`). A restore from an end-card capture therefore rebuilds, through `session()` (`duelRules.ts:21`), exactly the summary emitted at the decision. A test captures on the end card at least 60 ticks after the decision, restores, and checks that the restored summary (ticks, terminal causes and counters) equals the round record.

The safe-point rule is restated: `duelRules.safePointKey` becomes `` `duel:${round}:${decided}` ``. The core then captures a safe-point checkpoint when a round is decided and when a rematch starts the next round (`core.ts:136-139` captures on a key change). The old `phase === 'ended'` edge never fires for the duel.

**`validateDuelCheckpoint`, redefined.**
- The snapshot seed must equal `roundSeed(init.seed, round)`, read from the round module. Today it must equal `init.seed` (`duelCheckpoint.ts:91`).
- `phase === 'ended'` implies a decided outcome, but not the reverse: a decided round may be `running` or `paused`. Today the validator requires both directions (`duelCheckpoint.ts:92-93`).
- `helmPlayer` in state must equal `init.helmPlayer`.
- Grace lengths come from the round seed's map, through the cache. Today they come from `init.seed` (`duelCheckpoint.ts:98`).
- Telemetry `ticks` must equal the tick minus `baseTick` while the round is running, and `decidedTick − baseTick` once it is decided (`duelCheckpoint.ts:99`). The round module holds `decidedTick`.
- The outcome agreement between memory and snapshot stays (100-101).

**Duel mode `schemaVersion` 2 covers:**
- the init (`helmPlayer`);
- the snapshot (the round module) and the checkpoint rules above;
- the event union (`round`) and the two reasons;
- the widened end record (§8).

The memory schema (`duelMemorySchema`) is unchanged: the accumulator's fields are the same, it restarts per round, and its `ticks` counts from `baseTick` and stops at `decidedTick`.

**End card and keys.**
- The end card (`render/duel/endScreen.ts`, `endModel(outcome, tick, seed)`) reads "ENTER: REMATCH   ESC: LEAVE" on both machines.
- On the end card, with the round decided, Escape opens the Leave confirmation (Net-3d Leave).
- While a round runs, Escape pauses and resumes. It never leaves.
- Single player uses the same `rematch` command, so H-1's private restart goes away.

**Rejected alternatives.**
- A new room per rematch costs a new code and a re-join every round.
- Re-initialising inside the room (restarting the authority under a new run ID and re-issuing every port) fights the replace refusal (`encounterMode.ts:85`), the client's run and sequence filters (`clientRun.ts:49`) and Net-3e's mirror ranking.

**Versioning and bless sequence (SIM_VERSION 38 → 39).** The duel step gains a command, and the duel canonical array gains `round.round`, `round.helmPlayer`, `round.baseTick` and `round.decidedTick`. The sector's canonical fields are unchanged: its goldens change by the version number only, proved by the per-tick canonical comparison. The duel golden's hashes change because of the four added fields. The duel migration oracle proves that change per tick through a new `MIGRATIONS[38]` entry in `scripts/golden/duelOracle.ts`: `{ change: 'H-2: duel rounds', rename: () => undefined, derived: [], added: [/^round\.(round|helmPlayer|baseTick|decidedTick)$/] }`. No golden or oracle run sends `rematch` or a non-default `helmPlayer`, so every old value matches at every tick. The steps are:
1. On the commit before any H-2 sim change (SIM 38): run `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline`. The oracle baseline is tied to `tests/golden/duel-1.json` (`duelOracle.ts:15-18`).
2. Make the sim change, bump `SIM_VERSION` to 39, and add `MIGRATIONS[38]`.
3. Run `npx tsx scripts/golden/canonical-trace.ts check` and `npx tsx scripts/golden/duel-oracle.ts check`, then `npm run bless`. Bless re-runs both proofs and refuses on any failure (`scripts/golden/blessGuard.ts:22-35`). Then run `canonical-trace.ts golden`.
4. In a separate commit at the same version, add a rematch golden (`tests/golden/duel-rematch.json`: seed 1, the scripted pair, one rematch, round 2 to its outcome) to bless-golden's pinned set (`scripts/bless-golden.ts:1-11`, 27). Bless with `npm run bless -- --fresh`, because the guard refuses a missing pinned artifact without it. The commit message states that `--fresh` created only that artifact, and the diff shows the other three unchanged.

## 8. Live telemetry for §16

**What exists.** The full per-duel `DuelTelemetry` lives only in the host's authority, as mode memory (`duelRules.ts:67`). It holds laser releases, hits and misses, layers stripped, missiles and their losses, contacts, baits, console swaps, empty and idle ticks, and walking and repairing ticks (`src/renderer/src/sim/duel/telemetry.ts:36-56`). What reaches clients is the end summary (`summary.ts:22-27`): outcome, ticks, terminal causes, laser releases and hits, missiles launched and hits, and repairs finished. There is no `solo` flag anywhere, though Helm §11a asks for one.

**Change.** Widen `DuelEndSummary` and the duel end record to the Helm §13 list **(rec.)**:
- `laserMisses`, `layersStripped`, `missileLosses`;
- planet and asteroid contacts per ship;
- `baits`, `consoleSwaps`;
- `helmEmptyTicks`, `weaponsEmptyTicks`, `enemyInArcTicks`, `weaponsIdleTicks`;
- per player: `repairsStarted`, `walkingTicks`, `repairingTicks`.

The summary is not hashed and no golden references it, so no golden moves. It rides duel `schemaVersion` 2 (§7).

**Where it is recorded.**
- **The record.** On every `round` event, each renderer builds a **duel playtest record** with these fields:
  - `version: 1`, `session: 'solo' | 'online'` and `role: 'host' | 'guest'`;
  - `transport: 'loopback' | 'lan' | 'internet' | null`;
  - `seat`, `helmPlayer`, `seed`, `round` and `startedAtIso`;
  - `summary`, `latency`, `jitter`, `disconnects` and `pauses`.

  `round`, `seed` and `helmPlayer` come from the replica's hashed round state (§7), so a client that reconnected mid-round still labels the round correctly.
- **Transport.** The guest takes `transport` from the selected ICE candidate pair type in the hidden RTC window's stats: a host candidate is `lan`; srflx or relay is `internet`. The host's own port is always `loopback`.
- **A round decided while a renderer was away.** That renderer gets no `round` event for it, because events before its startup sequence are dropped (`clientRun.ts:74`, `157`). The host's record is therefore **authoritative for summaries**. The host renderer re-attaches to the local utility within seconds (§6), and if it still misses an event, the host utility's checkpoint memory holds the round. The report takes the session's transport from the guest's records.
- **Writing it.** The renderer passes the record to main through one new named preload method, `recordDuel(record)`, validated against a strict, size-capped schema (8 KiB). Main appends one line to `userData/playtest/duel-YYYY-MM-DD.jsonl`. Records never contain tokens, codes, addresses or candidates. Single player writes the same record with `session: 'solo'`.

**Report hook.** `scripts/duel-playtest-report.ts <files…>` merges host and guest files into sessions, keyed by room seed, with rounds keyed by round. It takes summaries from host records and transport from guest records. It prints:
- **The §16 rule, verbatim** (Helm spec line 320): "The demo is done when 4 of 5 are yes across 3 sessions, at least one with a pair other than the owner, and the live telemetry targets hold (3 to 5 minutes; wins and losses both happen across sessions; both weapons used in every duel)."
- **Its evaluation.** It reads it as: each of three sessions has at least 4 of 5 yes, and at least one session's pair is marked non-owner **(rec.)**. The owner records the answers in a small checklist JSON beside the records; the script prints a blank one. The live targets are:
  - the median round length is within 3 to 5 minutes;
  - both outcomes occur across the sessions;
  - laser releases and missiles launched are both above zero in every round.

  It also reports the H-0 extra, that no round is lost to the planet in under 30 s.
- **The latency table** of §9 and the fallback checks.

Its output pastes into a new "Helm demo" section of `docs/gates.md` and a playtest report under `reports/`. Solo records are reported separately, as Helm §11a asks.

## 9. Latency: measuring input to screen, and the fallbacks

**Held delay.** Every publication carries `heldHighWater` and `commandHighWater` per player (`codec.ts:164-167`).
- The client stamps each held frame whose quantised axes differ from the previous one with `(sequence, sentAtMs)` from `performance.now()`.
- The **held input-to-screen delay** runs from that stamp to the first rendered frame after a publication with `heldHighWater[seat] ≥ sequence` is applied.

**Command delay.** For a command, the delay runs from the key press to the receipt of its `applied` result. For a laser charge it runs from Space down to the first applied publication whose replica shows `systems[0].fireHeld` set. Charge time is game time, not delay, so it is excluded.

**Recorded figures.** For each kind, a round's record keeps the count, median, 95th percentile and maximum, plus the link's RTT from `link.stats()` and the arrival jitter: the standard deviation of publication inter-arrival time, against the expected 50 ms. A debug overlay (F3) shows the live median and p95 on either machine.

**Expected at 20 Hz.** A Helm input passes through these stages:
- up to one input pump (≤16.7 ms);
- the next tick (≤16.7 ms);
- the next sent tick (0 to 33 ms of cadence wait);
- one render frame (≤16.7 ms).

The interpolation then spreads the visible change over one gap (50 ms). Estimates (estimates only):
- host Helm: about 30 to 85 ms to the first visible change;
- guest Helm on a LAN: about the same, plus 1 to 5 ms of round trip;
- guest Helm on the internet: plus 20 to 150 ms.

The Helm spec puts the latency at "one round trip plus interpolation" (§11b). In the code, the host's own renderer is also a streamed client of the utility (main `onlineSession.ts:274`). So "seat the Helm on the host" removes the network round trip, but neither the 20 Hz cadence nor the interpolation gap.

**Fallback criteria (rec.).** H-2c starts if any of these holds:
1. The Helm held delay p95 is over 150 ms across a whole round in a LAN session, or over 250 ms in an internet session.
2. The owner or the second player answers "the Helm felt laggy" in the post-session note (the report prompts for it) in two sessions.
3. In sessions on the same network, checklist question 1 (the planet used on purpose) is "no" with the guest at the Helm but "yes" with the host at the Helm. The LAN and internet checklists (§10) each schedule one guest-Helm round, so this can be evaluated.

Weapons and walking do not trigger it: the laser charge and the walk tolerate 250 ms.

**H-2c remedies, in order.**
1. **A per-mode cadence option.** `createModeStreamBinding` and `createStateSender` gain a `cadence` option: the default 3 keeps the sector unchanged, and the duel takes 1, which is 60 Hz. This removes up to 33 ms of cadence wait and shrinks the interpolation gap to 16.7 ms.
   - Before it ships, a check measures the duel's delta and full image sizes on the gate seeds against `latestPayloadLimit` (`RTC_MAX_PACKET_BYTES − RTC_MAX_HEADER_BYTES`, main `onlineSession.ts:274`) and `MAX_IMAGE_BYTES` (`src/network/state/imageCodec.ts:8`).
   - It also measures the upstream bandwidth for two attachments at 60 Hz on the owner's link.
   - A test pins the sector cadence at 3.
2. **Own-ship prediction** from Net-4, only if the criteria still hold at 60 Hz. The client predicts the crew ship from the confirmed state plus unconfirmed held frames, using `stepDuel`'s flight path, and reconciles to each publication.

## 10. Tests and gates

**Headless tests (vitest, every commit).**
- **Two-client loopback duel.** It starts from `tests/duelMode.test.ts:45-140`: a duel mode host from `authorityModes`, and two `createDuelRemoteClient`s on streamed, receive-time loopback links, one per seat. The scripted pair (`sim/duel/scripted.ts`) drives each seat **through its client only**: held frames and outbox commands from the confirmed replica, at Net-3's 20 Hz. Over 10 seeds:
  - each round reaches an outcome;
  - both clients' final replicas hash equal to the authority's;
  - the authority's journal replays offline to the same hash;
  - no command is rejected `stale-tick`;
  - every `round` record matches the authority's summary.
- **Seats.** `helmPlayer` 0 and 1 seat correctly and survive a restore. The guest accepts either value in a committed init and rejects any other field change.
- **Presence and pause.**
  - Detaching a `'remote'` Weapons seat mid-charge: the steward's presence false comes first, then the `peer-lost` pause. The console counts empty and the charge freezes.
  - Reattaching: the ACK comes before any input, then `presence true`, and the duel stays paused until a `setPaused false`.
  - A `'local'` detach gets a steward and no pause.
- **The end card.** On a decided round, 20 or more mixed commands from both players (Space, F, X, E, Q, sit, presence, a second rematch in one tick, setPaused):
  - every command gets a result with the reasons of §7, and none stays pending;
  - ticks advance and publications continue;
  - then a `rematch` starts round 1, and a checkpoint captured right after validates and restores to the same hash.
- **Rematch.**
  - `rematch` while running is rejected `duel-running`.
  - After a rematch: a new round seed, `baseTick` = the rematch tick, a monotone tick and publication sequence, and the client replica replaced.
  - The round-start equivalence and the restore-equality tests of §7.
- **Recovery.**
  - Capture and restore on the end card (decided, `running` phase), mid-round, and right after a rematch, each to the same hash.
  - Telemetry continues across the restore, and the checkpoint stays under the cap.
  - A re-host restore in round 2 validates.
- **Reconnect and round context.** A guest client reconnects mid-round, and another reconnects across a round end. The first labels its next record with the right round, seed and `helmPlayer`, read from state. For the second, the report still lists the missed round from the host's record.
- **Gap a.** The sector suites run unchanged, plus the codec, isolation and type tests (§4).
- **Gap b.**
  - Cache bounds, eviction and the unexposed shape.
  - Identical accept and reject results with and without the cache, over the existing snapshot and checkpoint tests.
- **View source.**
  - The 20 Hz interpolation reaches alpha 1 only at the next expected publication.
  - The counter-derived events match the local runtime's events for the same ticks: every beam and missile ending appears exactly once, with every third tick published and one publication in five dropped, including an end and relaunch within one gap.
  - The online `otherStatus` matches the local one over a scripted repair.
- **Telemetry.** The record schema and redaction; the report's §16 arithmetic and verbatim rule text on fixtures; the host-authoritative merge.
- **Bless.** The §7 sequence: oracle `check` passes through `MIGRATIONS[38]`, and the sector proof passes as version-only.

**Electron smoke: `npm run test:duel-app-runtime`.** It follows `test:online-app-runtime` (`package.json:17`): two Electron processes with separate temporary userData, run against local workerd through Net-3d's harness and driver entry (`scripts/network/online-app-smoke.ts:39`, `online-app-smoke.cjs`). It checks this sequence:
1. Through the real menu, Multiplayer → Host; Join by the displayed code; ready; Swap seats once; start.
2. The Helm machine holds W for 2 s, and the ship's speed rises on both screens.
3. The Weapons machine presses Space and releases it, and a beam appears on both.
4. Both renderers agree on the hash at a common tick.
5. The guest is killed and restarted. The test sees presence false and the host paused, then the rejoin and the ACK, then an Escape unpause.
6. A round end is forced through a test-only seed and init. Enter starts round 2.
7. A `duel-*.jsonl` with latency samples is written on both machines.

The smoke cleans exact temporary roots and never global-kills Electron or workerd. The host-runtime and lease gates (`scripts/network/host-smoke.ts`, `lease-smoke.ts`) rerun unchanged with the duel mode registered.

**The sector app and internet smokes survive (rec.).** `online-app-smoke.ts` clicks the menu's Host, sets the capacity for 2- and 4-seat sector rooms and plays a sector run (`online-app-smoke.ts:65`). The internet smoke launches the same driver entry (`scripts/network/internet-app-smoke.ts:54`) and clicks the same Host and create-room controls (102). Once the menu offers only the duel, both smokes switch to a **test-only, non-menu entry**, gated like the existing dev hooks.
- **The gate.** Main honours the sector forms of `host` and `join` (§2) only when the app is unpackaged (`packaged`, `src/main/index.ts:35`) and the environment carries `FTLITE_SECTOR_ONLINE_TEST=1`. This is the same environment-variable pattern as `FTLITE_LOCAL_SERVICE_URL` and `FTLITE_MODE` (`src/main/index.ts:35`, `63`).
- **The driver.** It sets the variable and gains `host-sector {capacity}` and `join-sector {code}` requests, which call the preload's `online.host` and `online.join` with `mode: 'sector'`. The menu never shows a sector entry.
- **What changes in the smokes.** Their sector steps call these requests instead of clicking Host and the capacity control, and the rest of each sector run is unchanged. The internet manifest (`scripts/network/internet-app-manifest.ts`) keeps its sector run through the same entry and adds a duel run through the real menu.

**LAN manual checklist (the owner's: two Windows PCs on one home network, and the deployed service, see H-2b).**
1. Both PCs run the same freshly built candidate (the same build stamp on the menu).
2. PC A: Multiplayer → Host, and the code shows. PC B: Multiplayer → Join, enter the code. Both lobbies show two seats.
3. On A, press Swap seats once and check that the lobby reads "Guest flies Helm"; press it again and check that it reads "Host flies Helm". Start. A shows the Helm and B shows Weapons.
4. Fly a slingshot past the planet on A; B sees it move smoothly. Charge and fire on B; A sees the beam.
5. Stand up on B, walk to a damaged room, repair it, and sit back down at Weapons.
6. Unplug B's network cable for 10 s. A pauses with "PARTNER LOST". Plug it back in; B resyncs; Escape resumes.
7. Finish the round; Enter starts round 2 on both machines.
8. Alt-tab on A mid-thrust. The ship stops thrusting and coasts on both screens.
9. **Guest at the Helm:** Leave, host again with Swap seats set so that B flies the Helm, and play one full round. Answer checklist question 1 for this round separately.
10. Leave on both. The F3 overlay's figures and a `duel-*.jsonl` exist on both PCs. Run the report script; B's records read `transport: lan`.

The **internet checklist** repeats steps 1 to 10 with the PCs on different networks (B's records read `internet`).

## 11. Milestones

| # | Part | Contents | Acceptance |
|---|---|---|---|
| H-2a | **Online duel over loopback and LAN** | §2 mode adapter, compatibility, seats and swap, seed; §3 the online session wrapper, the online duel session and view source at 20 Hz, input over the link; §4 the generic stream client, the remote client and the shared schema hooks; §5 the cache and its budget; §6 the producer manager, steward and peer-lost pause; §7 rounds, the redefined checkpoint validator and the SIM 39 bless sequence; §8 the widened summary, the record and `recordDuel` (latency fields filled in, not yet reported); §10 the sector test-only entry | All §10 headless tests and `test:duel-app-runtime` pass. The sector app smoke passes through the test-only entry. The full suite, typecheck and build pass. The bless follows §7's sequence, with both proofs. The publication budget is met. The Codex implementation review is applied. **LAN manual checklist:** owner-run. LAN needs the deployed HTTPS service, because the loopback configuration accepts only `localhost` (`src/main/network/onlineConfig.ts:12`), so the checklist waits on step (d) |
| H-2b | **Internet, telemetry and latency** | §8 report script and `docs/gates.md` section; §9 F3 overlay, percentiles, jitter, the report's latency table and fallback checks; the Net-3e internet candidate for SIM 39 (`scripts/network/internet-app-manifest.ts`, `internet-app-smoke.ts`), with its sector run on the test-only entry and its new duel run | The internet smoke runs against the deployed service, and against forced relay where the harness supports it. The report script runs on the smoke's records. **Owner-only:** (d) redeploy and install the candidate on both PCs (the deployed package is SIM 35; master is 38, and H-2a makes it 39); then the LAN and internet checklists and the §16 sessions (three sessions, at least one pair other than the owner, each with a guest-Helm round) |
| H-2c | **Cadence, then prediction** (conditional) | Only if §9's criteria trip: first the duel cadence of 1 with its size and bandwidth checks; then, if still needed, Net-4's crew-ship prediction pulled forward | The criteria are re-measured below the thresholds on the same network |

H-2a is the bulk. If it is too big for one plan, its builder splits it at the seam between the client stack and view (§3 to §5) and the session, seats, producers, rounds and records (§2, §6 to §8). The first part is proven over the headless loopback before the second starts. The §7 baselines must be taken before any sim change lands.

## 12. Risks and open questions (defaults taken)

1. **Latency on the direct stick** (Helm §17.1). The host flies by default, there is no presentation delay beyond one gap, and delay is measured per round. If the criteria trip: the 60 Hz cadence, then prediction. **(rec.)**
2. **20 Hz looks rough at speed.** Interpolating over the actual gap is the answer, and §8's jitter figure watches for uneven arrival. H-2c's cadence is the remedy, not a deeper buffer. **(rec.)**
3. **Counter-derived effects lose detail.** The exact end point inside a 3-tick gap and the cause of a lost missile are approximated (§3). If playtests show a wrong effect, H-2b adds a bounded `recentEvents` field to the duel publication metadata. **(rec.)**
4. **Rounds change `terminal`'s meaning for the duel.** The §10 end-card, rematch and recovery tests must pass. If the generic core assumes a non-ended run always ends, the plan fixes the core rather than falling back to new rooms. **(rec.)**
5. **Tick-stamped fields assume a round starts at tick 0.** The §7 audit and the equivalence test catch this. The fallback is to stamp those fields relative to `baseTick`. **(rec.)**
6. **The guest cannot see the host's seat choice before Start.** Default: a host-only toggle, with the guest told at start. A shared lobby field would need a service change. **(rec.)**
7. **Pausing on guest loss frustrates a host who wants to keep flying.** Default: pause; the host can press Escape to resume alone. The steward keeps the gunner's console empty. **(rec.)**
8. **Focus loss does not pause.** Default per Net-3d: the alt-tabbed player's ship coasts with stabilise on. **(rec.)**
9. **Quantising diagonals changes H-1's feel.** Default: quantise in both modes. Held input is not part of the golden. **(rec.)**
10. **LAN needs the deployed service.** The owner's redeploy (d) gates even LAN play; H-2a's automated proof is two processes on one PC. **(rec.)**
11. **The sector online path loses its menu entry.** It stays registered, and its smokes run through the gated test-only entry (§10). **(rec.)**
12. **A derived seed lands on a dull map, and rematch seeds repeat within a room.** Accepted: every round's seed is recorded, and spawns are tuned (Helm §17.3) from the report, not by curating seeds. **(rec.)**

## Change log

- 2026-11-16: written from the Helm spec, Net-3d/3e, the engine refactor and the code at `6ecc361`; folds in the owner's 2026-11-16 decision (no couch, no gamepads; Single player, Multiplayer, Settings).
- 2026-11-16: review round 1 (R1-F1 to F11, all accepted).
  - F1: hashed round module (`round`, `helmPlayer`, `baseTick`), monotone tick, a redefined `validateDuelCheckpoint`, the schemaVersion 2 list, `MIGRATIONS[38]`.
  - F2: decided-round semantics (ticks advance, every command gets a result, the safe-point key).
  - F3: keep 20 Hz, gap interpolation, the latency budgets restated, cadence 1 as H-2c's first remedy.
  - F4: the online session wrapper, and corrected `onlineSession.ts:85`.
  - F5: the gated test-only sector entry for both smokes.
  - F6: the `ModeWire.events` hook and the accepted reason widening.
  - F7: the producer `pause` hook, the attachment `origin`, and the presence-then-pause order.
  - F8: round context in state, host-authoritative summaries, the guest's transport.
  - F9: the bless sequence.
  - F10: the §16 rule printed verbatim, a guest-Helm round in each checklist, command delay to the result.
  - F11: citations, `seed` and `paused()`, Escape on the end card, LAN step 3.
- 2026-11-16: refine round 2: the peer-lost pause waits for the steward's presence result; the telemetry accumulator freezes on a decided round, the round module keeps `decidedTick`, and the checkpoint rule changes to match.
- 2026-11-16: refine round 3: `decidedTick` is the tick after the deciding step; peer loss while already paused defers presence and requests no pause; a rejected presence retries once, then pauses anyway.
