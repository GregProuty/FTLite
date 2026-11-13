# Net-1: Foundations, offline

Status: 2026-11-13, amended following the accepted [Net-1 review](2026-11-13-net-1-review.md). Net-0 is approved. Spec only; no implementation or gate completion claimed.

## 1. Goal, evidence and scope

Keep couch play working through a headless authority and a loopback Session/Link boundary. Prepare the same simulation for later internet transport and prediction without changing combat, controls, RNG consumption, balance, or bot strategy.

Binding decision: [Net-0](2026-11-13-networking-decision.md), especially §§3–4. Evidence, read in order: [measurements](../../../research/networking-2/measurements.md), [prior art](../../../research/networking-2/prior-art.md), [transport and operations](../../../research/networking-2/transport-and-ops.md). House rules: [two seats](2026-11-13-two-seats-design.md), [combat tempo](2026-11-13-combat-tempo-design.md), [Skiff](2026-11-12-duo-ship-design.md), and `docs/gates.md`.

Code checked at HEAD `35e2a90`; measurement references describe their earlier HEAD and are evidence, not fresh measurements. Current landmarks checked: `shared/intent.ts:4`, `sim/console.ts:23`, `sim/interact.ts:99`, `sim/stations.ts:25`, `sim/science.ts:96`, `sim/productive.ts:26`, `sim/run.ts:191`, `app/loop.ts:6`, `app/session.ts:98`, `sim/state.ts:72`, `sim/snapshot.ts:28`, `render/hudModel.ts:498`. Paths beginning `sim/`, `app/`, `input/` or `render/` mean `src/renderer/src/`; `shared/` means `src/shared/`.

Net-1 excludes sockets, Cloudflare, WebRTC, prediction, mouse controls, pathfinding, public servers, host migration, remote authentication, browser packaging and a new visual layout. It defines checkpoint and command contracts needed by those milestones. Foundation §12 still holds: original art only; this milestone adds no art.

Net-1a delivers the live offline boundary: commands, loopback, independent clock, client card state, host-side bots and couch play. Net-1b delivers entity recycling, per-viewer HUD, replay/checkpoint v2 and cross-engine tests. The AST Math guard lands early in Net-1a. Unless marked otherwise, command/clock/publication rules apply in Net-1a; §§8 and 10 and the browser harness in §9 are Net-1b deliverables. Both submilestones must pass before internet hosting.

### Approach

Use an in-process authority in the renderer, behind a byte-message loopback. A utility process now would introduce packaging/IPC work before the offline boundary is proven; retaining the old render-driven session would not establish the boundary at all. Net-3 moves authority hosting to an Electron utility process; Net-5 adds a browser Worker. Neither hosting adapter changes gameplay imports or the protocol. Net-4, not Net-2, implements prediction: the milestone table in Net-0 governs its ambiguous “second milestone” wording.

## 2. Architecture and ownership

```text
Keyboard/gamepads -> device mapping -> tick-based client card controller
                                         | held input + semantic commands
                                  client Session / Link
                                         | copied bytes, loopback
                                  authority command ingress
                                         | validate, order, deduplicate
Injected monotonic scheduler ------> fixed-step authority -> sim
                                         | state / results / events / checkpoints
                                  client Session / Link
                                         |
                              decoded client-owned replica
                                  /                  \
                       viewer HUD model       interpolated world -> Pixi
```

Authority owns one live SimState, tick scheduling, admitted commands, held-input history, session pause, command results, event sequence, crash history and end-of-run records. It imports only pure sim/shared modules, bitecs/zod and injected interfaces. No DOM, Pixi, navigator, Electron, storage, timers or wall clock inside simulation code. Put authority/contracts in a pure module subtree; enforce a transitive import test. A platform adapter supplies clock/timer functions and storage callbacks. Headless tests instantiate the same authority with fake time.

Client owns devices, presentation replica, card navigation, callout presentation, audio playback, rendering and profile persistence. It cannot mutate authority state, access live component arrays belonging to authority, call gameplay helpers to bypass commands, or publish rewards. Existing pure HUD helpers may read the client replica. `loadSnapshot` allocates that replica once; subsequent compatible updates restore into it with `unflatten`, rather than allocate a world per update. Dispose it when the run changes.

Full lossless simulation state is published, including RNG, following the friends-only Net-0 decision. Net-1 does not substitute the earlier research brief's visible-only projection. Local profiles remain outside SimState; authority emits one completion record and the client applies existing progress rules once per run ID.

## 3. Session, Link and authority contracts

Signatures below define required behavior, not mandatory filenames. All message types are closed tagged unions with runtime validation; no arbitrary object reaches sim. Identifier aliases are opaque validated strings or safe integers, never raw ECS entity IDs.

```ts
type PeerId = string;
type RunId = string;
type PlayerId = number; // existing 0..3 cap
type ChannelKind = 'reliable-ordered' | 'unreliable-latest';
type Unsubscribe = () => void;
interface TransportCaps {
  unreliable: boolean; maxDatagram: number; hidesPeerIp: boolean; p2p: boolean;
}
interface LinkStats {
  rttMs: number; lossPct: number; relayed: boolean; bufferedBytes: number;
}
interface Link {
  readonly peer: PeerId;
  readonly caps: TransportCaps;
  send(kind: ChannelKind, bytes: Uint8Array): void;
  onMessage(cb: (kind: ChannelKind, bytes: Uint8Array) => void): Unsubscribe;
  onClose(cb: (reason: string) => void): Unsubscribe;
  stats(): LinkStats;
  close(reason: string): void;
}
interface HostOpts { protocolVersion: number; contentDigest: string }
interface Session {
  readonly links: readonly Link[];
  host(opts: HostOpts): Promise<{ joinCode: string }>;
  join(code: string, seatToken?: string): Promise<void>;
  onLink(cb: (link: Link) => void): Unsubscribe;
  onLinkLost(cb: (peer: PeerId) => void): Unsubscribe;
  close(reason: string): void;
}
interface HeldInput { moveX: number; moveY: number; interactHeld: boolean }
interface HeldFrame {
  runId: RunId; player: PlayerId; tick: number; sequence: number; held: HeldInput;
}
interface CommandId { player: PlayerId; sequence: number }
interface CommandEnvelope {
  runId: RunId; id: CommandId; requestedTick: number;
  command: Command;
}
interface RunInit {
  runId: RunId; layoutId: string; layoutHash: string; simVersion: number;
  contentDigest: string; seed: number; playerCount: number;
  characters: readonly number[]; unlocked: readonly string[]; quirk?: number;
}
interface MonotonicClock { nowMs(): number }
interface Scheduler { schedule(delayMs: number, cb: () => void): Unsubscribe }
interface Authority {
  attach(link: Link, players: readonly PlayerId[]): Unsubscribe;
  start(init: RunInit): void;
  pump(): void; // invoked by injected scheduler, never by rendering
  checkpoint(): Checkpoint;
  restore(checkpoint: Checkpoint): void; // paused, before reattaching producers
  dispose(): void;
}
declare function createAuthority(deps: {
  clock: MonotonicClock; scheduler: Scheduler;
  resolveLayout(id: string): ShipLayout;
  onCrash(record: CrashRecord): void;
}): Authority;
```

`ShipLayout`, `Snapshot`, `TelemetryRecord` and `Cue` reuse existing pure types. `CrashRecord` is defined in §10. The local bootstrap registers one loopback link with all joined couch player IDs. One-player-per-machine remains the future online policy; transport itself does not confuse a connection with a player. Session handles connections; authority owns seats. Loopback join codes are local registry handles, not network invites or credentials. An unknown code or compatibility mismatch rejects the Promise. `seatToken` is reserved, not implemented authentication in Net-1.

Loopback copies bytes at send and delivery; callers cannot retain shared mutable payloads. Reliable messages arrive FIFO within a direction. Delivery is through an explicit queued drain, never reentrant in `send`. Latest messages carry protocol sequence numbers and replace obsolete pending updates only within the same stream key (player held state or state stream), never across players. State and control are separate streams; no assumed ordering between channels. Default loopback has zero simulated latency/loss. Tests can inject delay/drop/reorder for latest messages and delayed reliable delivery; full chaos tooling is Net-4/6.

Loopback capabilities: `unreliable: true` (it implements the delivery semantics), `maxDatagram: 65536`, `hidesPeerIp: true`, `p2p: false`; zero RTT/loss unless injected, `relayed: false`. `send` does not throw. Oversize or reliable-queue overflow closes with a reason instead of silently losing a command; latest overload drops old updates. Cap each direction at 1 MiB queued bytes. Unsupported channels close explicitly. Wire framing, acknowledgments, ownership and clocks remain above Link. Large future checkpoints require protocol chunking or a reliable payload policy; `maxDatagram` is a provider capability, not a universal 1,100-byte requirement for this offline implementation.

## 4. Clock, ticks, input sampling and pause

Keep `TICK_HZ=60`, hazard cadence, `DT`, and gameplay operation order. Replace `app/loop.ts:6–11`'s discarded backlog with an absolute monotonic deadline: active elapsed time determines the number of due ticks. Pump at roughly 120 Hz using the injected scheduler, independent of Pixi's ticker. Execute at most 120 ticks per pump, then yield and schedule an immediate continuation while overdue. Never clamp elapsed active time, discard debt, change DT, or stretch cooldowns to hide backlog. After a recoverable 500 ms stall exactly 30 ticks execute, including correct hazard ticks.

“Never slow down” means never intentionally drop simulation time; an in-process JavaScript event-loop stall cannot execute ticks during that stall. Retain debt and catch up after it. Publish lag statistics and a catching-up state if debt remains after a pump. There is no claim that Net-1 can outpace indefinite CPU starvation or host sleep. On scheduled pause, freeze active elapsed time; on resume start a new monotonic epoch with no debt for the paused interval. Negative clock samples are rejected/diagnosed and do not run negative ticks.

A five-second active-time stall owes 300 ticks: execute 120, yield, execute 120, yield, execute 60 (plus any newly due ticks). Keep the catching-up indication while debt remains. The cap is per pump, never a cap on total debt. Tests must assert all 300 tick transitions and hazard ticks occur across multiple passes; no paused-time subtraction may erase debt that accrued before pause.

Client input sampling is also independent of rendering. Keyboard listeners queue edges; the local input pump polls gamepads and maintains a timestamped held-input history. For each due simulation tick consume at most one edge of each physical action, as `app/intents.ts` does today, then translate it to explicit commands. Do not apply newly sampled input retroactively to all catch-up ticks. Use the last sampled held state for ticks before the next sample; an edge belongs to the first eligible tick at or after its recorded sample. Preserve neutralization on blur and controller disconnect.

Card navigation repeats by simulation tick index, not timer callback count or render frames: threshold 0.5, horizontal ties, repeat every eight ticks, and reset on sit/stand as today (`console.ts:23–33`, `stations.ts:34–43`). During catch-up the offline client consumes the ordered tick views and advances its controller once for each tick. This is client code, not raw cursor input in the authority.

Pause/resume is `setPaused` control through the authority, processed at the next pump boundary even when no sim ticks run. Publish pause owner and reason. Anyone controlling a crew seat can pause/resume. Preserve the current couch behavior exactly: `session.ts:106–115` uses a focused paused-state Confirm to resume and forwards that same input frame into running gameplay; do not silently consume the Confirm as a new rule. The client emits resume first, then translates the retained press at the first eligible gameplay tick. `main.ts` automatically resumes on focus, becoming visible, and OS resume; retain these adapter signals. Tests pin those paths separately. Multiple explicit pause requests use receive order, with pause winning if pause and resume occur in the same control drain. Increment a control revision and record accepted control ordering. A focus/suspend pause is issued by the trusted local adapter on behalf of the couch session; it can pause even if no crew is conscious. User Confirm resume requires the existing focused/visible predicate.

Future online mode: blur neutralizes that client's input and does not pause authority. Explicit player pause is shared; host process suspension is a lifecycle event handled in Net-3. Net-1 implements couch policy and the policy discriminator, not network reconnection/bot takeover.

Render from the last two completed tick snapshots at one-tick interpolation delay. Compute alpha from the clock epoch and completed tick time, clamp to [0,1], and draw latest if catching up without a valid bracket. Interpolate positions only as the existing renderer does; discrete state/HUD uses latest completed state. On pause, reset, restore, seat teleport or jump, collapse invalid interpolation history. Render frames neither advance simulation nor generate repeated effects.

## 5. Semantic commands: complete contract

There are **26 command kinds**: 24 gameplay/control kinds implemented now, `setPaused` also implemented now, and `moveTo` reserved and explicitly unsupported until Net-2. Targeting selections are semantic configuration, not row indices.

Net-0's “about 22” was an estimate, not a cap. The finalized inventory makes `selectWeapon` and `selectTarget` explicit configuration, distinguishes `swapCargo` from firing, and separates `airlockToggle` and `toggleDoorLocal` from seated door control. It also counts pause and reserved movement. Several of those names already appeared in the research's longer estimated list; this is a complete enumeration, not a claim that exactly four entirely new mechanics were added.

```ts
type StationId = number; // immutable layout station index
type TargetRef =
  | { kind: 'object'; stableId: number }
  | { kind: 'enemy'; stableId: number; room: number };
type VisitRef = { sector: number; beacon: number; arrivalTick: number };
type EventRef = { visit: VisitRef; eventId: number };
type JumpRef = { visit: VisitRef; requestedAtTick: number; destination: number };
type WeaponRef = { selector: number; expectedWeaponId: number };
type Command =
  | { kind: 'moveTo'; tile: number }
  | { kind: 'sit'; station: StationId }
  | { kind: 'stand' }
  | { kind: 'toggleDoorLocal'; edge: number }
  | { kind: 'doorCycle'; station: StationId; edge: number; mode: 'cycle' | 'seal' }
  | { kind: 'airlockToggle'; station: StationId; airlock: number }
  | { kind: 'power'; station: StationId; target: StationId; delta: -1 | 1 }
  | { kind: 'coolant'; station: StationId; target: StationId }
  | { kind: 'buyUpgrade'; station: StationId; system: number; expectedLevel: number }
  | { kind: 'buyReactor'; station: StationId; expectedBonus: number }
  | { kind: 'selectWeapon'; station: StationId; weapon: WeaponRef }
  | { kind: 'selectTarget'; station: StationId; target: TargetRef | null }
  | { kind: 'fire'; station: StationId; weapon: WeaponRef; target: TargetRef }
  | { kind: 'swapCargo'; station: StationId; slot: number; expectedCargo: number; expectedEquipped: number }
  | { kind: 'scan'; station: StationId; target: TargetRef }
  | { kind: 'systemScan'; station: StationId; visit: VisitRef }
  | { kind: 'lockFrequency'; station: StationId; enemyId: number }
  | { kind: 'vote'; event: EventRef; choice: number }
  | { kind: 'jumpAgree'; pending: JumpRef }
  | { kind: 'buy'; station: StationId; visit: VisitRef; item: number; expectedOffer: number }
  | { kind: 'jump'; station: StationId; visit: VisitRef; destination: number }
  | { kind: 'sectorJump'; station: StationId; visit: VisitRef }
  | { kind: 'wait'; station: StationId; visit: VisitRef }
  | { kind: 'evade'; station: StationId }
  | { kind: 'tab'; group: number; station: StationId }
  | { kind: 'setPaused'; paused: boolean };
```

All indexes and IDs are bounded integers; axes finite Float64 values normalized exactly as current `clampIntent`, with no new quantization. A target resolves by StableId before a pool slot is accessed; an enemy room is validated separately. A reused debris slot never aliases the old target. Fixed Pulse/torpedo identities and loot IDs define `expectedWeaponId`; `expectedOffer` is the fixed consumable identity or current shop weapon ID. No row ordinal is accepted as a changing offer identity. Visit identity distinguishes repeated visits and repeated events.

Global validation: matching run, owned player, well-formed ID, admitted tick, legal phase, conscious crew for gameplay, and current conditions at execution. Except stand and paused controls, a console action requires `stations.occupant[station] === player` **and** `Seated.station[crew] === station`; occupying all members of a group is not permission to operate an inactive tab. Special exceptions are vote/jump agreement and tab switch as below. Never reinterpret a rejected command as a different action.

Timing codes: **I** = interaction phase before movement; **C** = that player's console slot, after charging/loading and scan progression; **D** = existing decisionSystem after console slots; **P** = control drain outside simulation. Every gameplay command uses an explicitly admitted tick T; this table specifies where inside T it applies.

| Kind | Sender and execution validation | Phase |
|---|---|---|
| moveTo | Net-1 returns `unsupported`; validates envelope, never moves. Net-2 requires conscious standing crew, reachable floor tile and deterministic path rules. | I reserved |
| sit | Standing, same-room/reach checks from `confirmTarget`; requested console/group free and at least one member online. Group seats on first tab as today. Lowest player ID wins simultaneous claims. | I |
| stand | Currently seated; voluntary stand permitted even on an offline tab. Clears group occupancy and pauses Science, then calls shedPower and sets stoodThisTick, preserving console.ts:118's whole action rather than standUp alone. | C |
| toggleDoorLocal | Standing, requested edge is a door in reach; preserve current local seal toggle, not airlock operation. | I collect, C flush |
| doorCycle | Active Doors seat. `cycle` requires online; `seal` requires offline and existing offline-console eligibility. A changed mode rejects rather than switches meaning. | C collect/flush |
| airlockToggle | Active online Doors seat, valid airlock. | C collect/flush |
| power | Active Engineering seat, valid target and ±1; existing shiftBar capacity/floor/shedding predicates, including their existing offline behavior. | C |
| coolant | Active Engineering seat; current cycleCoolant availability and pool predicates. Update XP stamp only on success. | C |
| buyUpgrade | Active online Engineering; matching current level, valid system, affordable and below cap. No price supplied by client. | C |
| buyReactor | Active online Engineering; matching bonus, affordable and below cap. | C |
| selectWeapon | Active Weapons seat; selector is in current selectorList and equipment identity matches. Preserve existing allowed selection while offline outside grouped-tab suppression. | C |
| selectTarget | Active Weapons/Science seat; target currently warned/present and permitted for that station; null means no target/system/SWAP highlight, not a new gameplay object. | C |
| fire | Active online Weapons; matching equipment, live legal warned target, current charge/ammunition/output rules. Explicit parameters, never read another player's cursor. Preserve RNG draws and XP. | C |
| swapCargo | Active Weapons; no enemy, cargo and destination equipment match, valid extra slot. Preserve canSwap's existing online/offline rule. | C |
| scan | Active online Science; live unscanned warned object or enemy ship (canonical hull scan ref), choose explicit target and set scanning. | C |
| systemScan | Active online Science; same visit and SystemScan.Ready. | C |
| lockFrequency | Active online Science; same present/scanned enemy, no active lock. Explicit ship identity replaces cursor check. | C |
| vote | Conscious standing or seated player; same unresolved event and explicit choice exists. Navigation occupant's card requires choiceEnabled; other players may submit an unavailable choice, as today, but tally/settle never treats it as enabled. The client alone translates each press to the next choice; authority assigns that supplied choice and never increments/modulos a vote. Preserve voteTick updates for each new non-Nav vote command; same explicit Navigation choice is a no-op. | I collect for standing/non-Nav, apply D after waitStep; C for Nav, resolve D |
| jumpAgree | Conscious player other than Navigation occupant (on any tab); same live pending request and confirmation window; no unresolved event taking precedence. | I collect, D resolve |
| buy | Active Navigation; same shop visit/offer, item enabled, stock/capacity/scrap checked by current buy rules. Preserve current Navigation online gating rather than add a new one. | C |
| jump | Active Navigation; same visit, destination reachable, drive/fuel/current request rules; create pending request or execute solo as current requestJump. | C |
| sectorJump | Active Navigation; same visit, at exit, drive/fuel/sector or final-beacon rules through existing requestJump path. | C |
| wait | Active Navigation; same visit, existing wait row enabled (fuel exhausted, no wait already running, etc.). | C |
| evade | Active Navigation; existing startEvade online/cooldown predicates, no extra RNG draw. | C |
| tab | Seated in requested group, target station is a group member; switching to offline member allowed while group remains occupied. Preserve Seated.station and groups.tab effects. | C |
| setPaused | Owned seat, independent of consciousness; or trusted couch lifecycle adapter. Explicit target state, no toggle; rules in §4. | P |

Where the old grouped tab controller suppressed all card actions on an offline tab (`console.ts:104`), keep that suppression at authority validation. Do not apply it to lone consoles where existing helpers intentionally differ. Characterize these cases before extracting helpers. Preserve the authority's online rules, not a new blanket restriction guessed from button appearance.

### IDs, admission and same-tick order

ID is `(runId, player, sequence)`; sequence starts at 1 and increases monotonically for that run/player across reconnect or restore. Commands use reliable-ordered delivery. Maintain per-player admitted high-water marks and a bounded result cache of the latest 256 IDs. The same ID/payload returns its result without applying again; conflicting duplicate payload rejects. Older IDs below the retained cache return `already-processed` without re-execution. A sequence gap rejects with `expected-sequence`; the producer must resend the missing command. Pending IDs are tracked too. New client state starts at authoritative next sequence, never resets it under the same runId.

A structurally valid, owned envelope with the expected next sequence consumes that sequence even if its tick is stale or gameplay validation rejects its action. Cache the terminal rejection just like success and persist it in the checkpoint. Malformed/unowned envelopes and sequence gaps do not advance the watermark. Unsupported moveTo is a terminal rejection that consumes an otherwise valid next sequence. A stale command followed by the next valid command must work before and after restore.

Net-1 admits gameplay only for the next unexecuted tick; future ticks beyond it and past ticks reject with an explicit reason. A normal client queues that tick's input before authority steps, without an acknowledgment barrier. Late raw presses may be translated into a *new* command for a later tick against the current view; an already-addressed semantic command is never silently retimed. Later internet scheduling is Net-3's contract extension. Cap 16 commands/player/tick and 256 pending/control commands/link; excess gets an explicit rejected result and cannot spin the loop.

Accepted gameplay order follows existing step order, not network arrival order: jumpStep; I actions/held interactions and seating arbitration; C housekeeping (charge, load, scan); players ascending ID, their commands ascending sequence; sorted door/airlock flush; decisionSystem/XP in their existing relative position; movement/doors; hazards/director/enemy/crew/telemetry. Pin the actual `step.ts` order at implementation baseline. A player who sits this tick does no console action this tick; stand consumes that tick's card input. Multiple same-edge door requests coalesce as today's scratch sets do, even when command IDs differ. One-shot ID deduplication does not remove that gameplay coalescing.

For tick T, clients translate input from the latest completed publication, normally end of T−1, plus their local UI state. The initial publication supplies tick zero's view. This is one tick of decision latency, not an extra tick added to the command's execution time. The authority freezes T's admitted queue at tick entry, executes every phase without client callbacks or waits, and publishes only after completion. Missing commands mean no one-shot action, not a stalled tick. Held movement/Interact use the latest admitted held frame (neutral initially and after explicit input suspension); edges are never held/repeated. Stale later arrivals reject under the admission rules above. Slower/delayed clients use their last received publication and get normal stale-reference results.

In zero-delay loopback, the independent outer scheduler drains completed publications, lets client/bot controllers produce the next tick's input, drains command ingress, and then invokes the authority tick. That scheduling opportunity is outside the tick, requires no acknowledgment and is not a barrier: an absent controller never prevents authority progress. During multi-pass catch-up repeat this outer sequence between ticks using timestamped input, never between simulation phases. Render frames remain uninvolved. Test an absent/delayed controller with the same path, not a separate compatibility mode.

Emit `fire` on Confirm even if the published charge is just below ready: execution checks it after charging. Move-plus-Confirm emits ordered selection then explicit action. Authority still suppresses console action on a seating tick. Do not promise all row changes happen after consoles: `weapons.ts:134` can call `removeDebris`, and `debris.ts:59` retargets Science during the console loop. A subsequent command referencing that removed target rejects instead of silently operating on the replacement. Differential traces must record any resulting timing/gate change; no floor is lowered. The boundary takes precedence over preserving those rare implicit retarget semantics.

## 6. UI state extraction and gameplay selections

Remove from canonical sim/flatten: general `stations.cursor`, `stations.page`, `groups.bar`, `stick.heldDir/repeat`, and `run.navSig/navSelect/navIndex`. Replace them with per-client CardUiState keyed by station and viewer/controller: highlighted semantic row key, page, tab-bar focus and repeat state. The couch controller shares a station card's remembered row exactly as today; entering resets all group cards, standing resets Engineering page and tab-bar focus. Keep Navigation's row-key-following and first-selectable fallback semantics from two-seats amendment 8, including the accepted jump-row fallback after an event.

Retain authoritative `groups.tab`, `Seated.station`, group occupants, all charge/scan/heat/coolant/power state, vote values/timers, pending jump and agreement state. Tab selection changes which commands are legal and which station is active; it is not merely decoration (`stations.ts:45`).

Replace target-bearing cursors with explicit `weapons.target` and `science.target` references, and keep the weapon selector as authoritative configuration. `selectTarget` changes these; `selectWeapon` changes the selector. Science target is required because `science.ts:96` and `productive.ts:26` use it to advance scans and award XP. Preserve target auto-selection on warning/enemy arrival and stable-order retargeting on removal (`debris.ts:59,125`, `enemy.ts:84,101`), as well as scan stop behavior on stand/departure. A null Science target pauses target progress without canceling the existing scanning flag, exactly like the system row did. Starting a system scan does not silently cancel a target scan. Weapons targeting is kept as shared aim configuration for reticle parity, but `fire` always names its target and weapon explicitly. Successful firing records current shot fields as today.

Cursor movement at Science/Weapons therefore emits `selectTarget`; system/SWAP rows emit null when needed. Up/Down on other cards is purely local. Changing weapon emits `selectWeapon`; firing in the same tick follows it. Coolant and door actions remain one explicit cycle per command, guarded by IDs. Opening upgrades, BACK and tab-bar focus emit no gameplay command. A tab switch does.

No semantic action called `confirm(row)` exists. The client resolves Confirm once with today's precedence: unresolved-event voting for standing/non-Navigation occupants; pending jump agreement; standing nearest door/seat; otherwise the active card action. This preserves the two-seats fixes while preventing a late press from changing meaning inside authority. Held Interact remains positional repair/fight/revive/pickup/delivery and retains its current priority; its edge when seated translates to stand. Cancel when seated also translates to stand. Lobby/credits/restart remain client/session controls, not in-run gameplay commands.

Bots run beside the authority as host-side client agents, reading the same completed publication as human clients. They retain strategy and action cadence and use the same semantic translator, loopback ownership and validation. Today acceptance.ts:16 calls botIntent before step, so this preserves their decision-time basis. Do not replace cursor traversal with instant perfect targeting or bypass tab navigation: that would accelerate firing and change gates. Bot controller memory stays outside SimState and is captured in the Net-1b checkpoint envelope; bots never read live authority component arrays.

For repeated vote presses the client maintains its last submitted choice keyed by EventRef, advances that choice locally through all options, and emits `vote(event, choice)`. Reconcile it with acknowledged results/published votes and reset on event change. Two presses before a new state arrives produce successive choices, not two identical choices based on a stale vote. The authority only validates and assigns choices at the existing phase; remove the old scratch.votePress cycling arithmetic.

`moveTo(tile)` is a reserved command with a deterministic `unsupported` result in Net-1. Pathfinding, cancellation by manual axes, movement orders in snapshots and the mouse UI are all Net-2; do not add unreachable partial pathfinding state now.

## 7. Published state, events and per-viewer HUD

```ts
interface CommandResult {
  id: CommandId; tick: number; status: 'applied' | 'noop' | 'rejected' | 'already-processed';
  reason?: string; // closed reason-code enum in implementation
}
type ClientAuxMessage = {
  kind: 'callout'; runId: RunId; player: PlayerId;
  sequence: number; calloutKind: 'contextual';
};
interface AuthorityEvent {
  runId: RunId; eventSequence: number; tick: number;
  payload:
    | { kind: 'cue'; cue: Cue }
    | { kind: 'callout'; player: PlayerId; text: string; station: number | null }
    | { kind: 'pause'; paused: boolean; owner: PlayerId | null; reason: string }
    | { kind: 'ended'; record: TelemetryRecord };
}
interface PublishedState {
  runId: RunId; tick: number; publicationSequence: number;
  snapshot: Snapshot; hash: string;
  phase: 'running' | 'paused' | 'ended' | 'error';
  pauseOwner: PlayerId | null; controlRevision: number;
  commandHighWater: readonly number[]; eventSequence: number;
}
type Viewer =
  | { mode: 'couch'; ui: ClientUiState }
  | { mode: 'player'; player: PlayerId; ui: ClientUiState };
declare function buildHudModel(state: SimState | null, viewer: Viewer,
  context: HudContext): HudModel;
```

`ClientUiState` is §6's card/repeat state plus local device labels; `HudContext` packages today's slots, phase, message, credits, progress and callout flashes rather than removing them. `HudModel` adds optional `primaryConsole` and `otherCrewStatus` fields. Player mode shows that viewer's active card as primary and others' role, health, seat, offline/downed state and callouts as pills; it never chooses another player's card as primary. A standing viewer has no primary console. Invalid player rejects model construction in development and yields a safe empty viewer model in production. Couch mode preserves today's model content, arrangement and device prompts. Net-1b implements/tests the model; Net-1a adapts only the existing couch HUD to client-owned card state; Net-2 implements player-layout appearance and mouse interaction.

Publish a full state after each tick in loopback and initial/paused/ended states over reliable control as appropriate. Net-3 replaces regular state delivery with 20–30 Hz deltas, not Net-1. State updates use latest semantics; results and events reliable ordered. Client verifies run/version/sequence and full-state hash at the snapshot tick; it does not compare an interpolated view with that hash. An event referencing a newer tick is buffered until that state is available; state may arrive before its events. Bound event buffering and request a full reset if history is unavailable.

Derive current audio cues from authoritative tick transitions, assign event IDs there, and deduplicate playback by `(runId,eventSequence)`. Preserve existing cue priority/order; coalesce catch-up playback with the current frame-level cue policy so a slow frame does not create a new audio barrage. Prediction later emits no authoritative events. Callouts remain outside sim and replay; send a bounded reliable auxiliary request `{player, sequence, calloutKind}` on the same owned link, resolve current context at authority, and emit an ephemeral event. No free-text chat is added. They do not consume gameplay command IDs or alter RNG. Pauses and end records are delivered even if latest state packets are coalesced.

ClientAuxMessage is the formal callout union. Validate matching run, link ownership, bounded integer player/sequence, the single allowed contextual kind, and crew not Dead (Downed may call for help). Drop duplicate/older auxiliary sequences; keep a separate per-run/player high-water mark. Coalesce multiple requests from one player in one tick into the newest, bounded by the link queue cap; resolve only at a completed-tick boundary with the existing callout priority/text and three-second lifetime. No client-supplied text, icon or station is trusted. This preserves contextual callouts without adding chat or changing gameplay command count. Test spoofed players, duplicate sequences, dead/downed crew, contextual power/fire/repair selection and no RNG/state mutation. Auxiliary history is ephemeral and resets on restore; do not replay old callouts from a checkpoint.

## 8. Entity-ID recycling and disposal (Net-1b)

Keep the existing shared non-versioned bitecs entity index: it prevents two live worlds aliasing module-global component arrays (`state.ts:72–76`). Add idempotent `disposeSimState(state)`, removing each owned crew entity through bitecs `removeEntity`, clearing its component cells, marking state unusable, and releasing world-local references. Do not reset the global index, truncate arrays beneath another live world, recycle StableIds within a run, or introduce the versioned-index behavior rejected in `docs/spikes.md`.

Raw ECS IDs are never serialized or used for command ordering. Logical crew IDs and StableIds determine order, so free-list reuse cannot change hashes. Every initialization overwrites all owned component cells. Snapshot restore uses the existing live state when shape/layout match; creating a new state disposes the replaced state only after successful validation. On failed snapshot construction, dispose the partially allocated state in a finally path. Authority, client replica, tests and temporary worlds all need explicit teardown.

Test 2,000 sequential four-crew create/dispose cycles with a live sentinel world: component-array high-water must plateau after warm-up, sentinel hashes unchanged, no disposed entity exists in its old world, and recycled IDs have no stale health/seat values. Interleave two live runs and checkpoint restores; hashes equal isolated references. `tests/spike-bitecs.test.ts:11` currently observes recycling but does not require it—add a real bounded-lifetime gate. This is logical allocation bounding, not a promise that JavaScript immediately releases array backing memory to the OS.

## 9. Determinism guard

Add a checked-in browser-compatible scripted semantic-command/held-input fixture, identical in every engine. Cover both ships, seeds, analog normalization, target removal/reuse, station groups, purchases, event voting, pause boundaries and restore. Use a recorded command script, not only state-responsive bots, so input itself is independently reproducible. Include a 15-minute simulated-time sequence per ship with hashes every 60 completed ticks (900 samples); chain explicitly identified runs if a fixture run ends. Include checkpoint restore and interleaved-state variants. Hash authoritative canonical sim; separately assert command results/event order to detect boundary bugs outside that hash.

Node generates the same checked-in expected hash vector as the real Electron Chromium renderer. Run a hidden BrowserWindow loading a trusted local test harness, with Node integration off and a narrow result-reporting preload or equivalent controlled runner. `ELECTRON_RUN_AS_NODE` is **not** a browser-engine test. The harness requires no Pixi/WebGL and exits nonzero on mismatch, page error or timeout. Report engine versions, seed, ship, first differing tick and field diff. No dependency install belongs in this spec-writing task; implementation may use the existing bundler/Electron to build the harness.

Firefox: run the same bundle in real headless Firefox when a supported local/CI executable is available, with a small localhost result endpoint. Missing Firefox reports explicit NOT RUN, not pass; Node plus real Electron Chromium is mandatory Net-1b acceptance. Add Firefox as a required gate once its CI runner is provisioned. Safari/JSC and ARM remain documented platform gaps, not proof of failure or universal determinism.

Use a TypeScript AST test rather than a text grep: allow only `Math.abs, ceil, floor, round, min, max, sign, imul, sqrt` in `sim/**` and `shared/**`; reject other Math calls, exponentiation, aliases/destructuring/computed Math access, Date/performance/crypto/random sources and forbidden runtime imports. Explicitly guard globalThis access and new helper imports so aliases cannot trivially bypass it. Pure injected authority clock code is outside the deterministic sim subtree. Fixtures prove the guard catches sin/cos/tan/exp/log/pow/atan2/hypot and alias forms without matching comments/strings. Exact rational constants/basic arithmetic remain allowed.

Additional research: the current [ECMAScript Math.sqrt specification](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sqrt) specifies a Number-rounded square root, while transcendental functions such as atan2 use implementation-approximated values. This supports the existing sqrt allowance; it does not certify every older engine/platform. Keep cross-engine tests and transmit analog values losslessly. No new math approximation or quantization is authorized by Net-1.

## 10. Replay, snapshots, checkpoints and crash records (Net-1b final format)

Replay format becomes **2**, replacing version-1 raw CompactIntent presses. Use a complete initial Snapshot plus RunInit, then tick frames of canonical held inputs and admitted semantic envelopes; include execution tick/phase, result status, and control-boundary order for pause/resume. Replay bypasses wall time but uses the same authority validator/deduplicator and phase executor. Rejected valid-envelope commands are recorded when needed to preserve sequence/result behavior. Malformed pre-admission payloads belong in diagnostics, not the deterministic replay. Include gameplay initialization options; seed alone is insufficient (`replay.ts:10`, measurements §4).

Version-1 replay files are rejected with a clear unsupported-format message by production code. During migration only, a test/reference converter executes them through the pinned old controller and records semantic actions at the same ticks/phases. It is not a runtime fallback that keeps raw-press interpretation inside the new authority. Convert golden input once; compare gameplay traces before blessing the new format.

```ts
interface Checkpoint {
  checkpointVersion: 2;
  init: RunInit; snapshot: Snapshot;
  commandHighWater: number[];
  recentResults: { envelope: CommandEnvelope; result: CommandResult }[];
  eventSequence: number; controlRevision: number;
  botControllers: ClientUiState[];
  paused: boolean;
}
```

Checkpoint at a completed-tick barrier: drain/adjudicate admitted actions through that tick; future pending gameplay is not included and must be explicitly rejected/acknowledged before sealing. Preserve deduplication watermarks/result cache and event sequence. Clear held controls on external re-host restore, restore paused, and require fresh held input before resuming. For exact replay continuation, the replay supplies the next recorded held frame; clearing stale device state is not a replay divergence. Same-run command sequences continue; a genuinely new run gets a new RunId.

Keep bot controller memory in the authority checkpoint envelope (outside gameplay Snapshot), because its old cursor/repeat state influenced future bot actions. Optional human UI preferences may be saved separately for couch continuity but are not required for canonical gameplay restore. CrashRecord contains RunInit, last checkpoint, admitted tick frames since it, last published sequence and error. Maintain the current 300-tick crash baseline interval and bound history as before. Completion and callout presentation are not re-fired simply by loading a checkpoint.

Bump `SIM_VERSION` exactly once from the implementation baseline for removed UI fields/new target fields; do not pin a stale number here. Change Snapshot format to 2 and validate version, manifest, layout/content digest, exact length, finite fields and enum/range constraints before mutating a live state. Old snapshots reject explicitly; no unrequested cross-version save migration. `flatten` remains canonical and complete for gameplay. Protocol version starts at 1; replay, checkpoint, snapshot and sim versions are distinct fields. Run metadata/control ledgers remain outside the canonical sim hash but have their own checkpoint integrity comparison.

Checkpoint emission hooks land here; cloud mirroring, distribution to reserved seats, re-host UI and remote token binding land in Net-3. Net-1 does not claim to implement recovery from a departed remote host.

## 11. Migration and unchanged-gameplay contract

Before changes, record baseline HEAD, SIM_VERSION, golden, all gate figures, RNG/state traces for representative fixtures and existing input/pause behavior. Do not use older comments as the final baseline. Preserve all tests' gameplay assertions even where their API changes from setting cursors to setting client UI or sending semantic commands.

Use differential traces during extraction: same legacy controller script, same held inputs and same semantic decisions compare hull, health, positions, RNG streams, shots, damage, charge, scans, votes, purchases, XP and end ticks. Compare a gameplay projection rather than the old full hash after removing UI fields. Differences solely in removed cursor fields/hash/version are expected and documented; differences in actual actions require diagnosis. Keep original bot direction/press cadence, calm-beacon wait convention, and helper scenario setup. Existing tests which directly mutate cursors become controller tests or explicit target setup tests, not deleted coverage.

Every gate keeps its figures or changes only for a stated tick-level traced reason, recorded in `docs/gates.md` during implementation. **No gate floor is ever lowered.** Current examples include Skiff's raised health floor 25 (`tests/gate-skiff.test.ts`), duo floor 25 and Warden's pinned shot/time figures. Enumerate every `tests/gate-*.test.ts`, not just these examples. Do not improve bots, retune combat, add artificial healing or modify gate setup to mask a migration error.

Once all parity checks pass, bump SIM_VERSION once and run `npm run bless` once for the final new shape/format. Cross-engine vectors must derive from that same canonical version; subsequent tests verify them without rewriting files. If an implementation error needs another correction before finalizing, document why a regenerated candidate was necessary; never bless unexplained divergence. This spec-writing task does not run bless or modify any gate document.

## 12. Risks and specific tests

| Risk | Required test |
|---|---|
| Semantic translation changes action tick | Legacy-vs-new threshold charge/fire, simultaneous seat/repair, direction+Confirm, and player-order fixtures. |
| Science cursor removal changes scan/XP | Switch target midscan, system row, tab away, stand, target destruction and next-object selection; compare progress and XP each tick. |
| Reused target or old shop row acts on new content | Despawn/respawn in same pool slot, revisit shop/event, buy last stock, duplicate upgrade command. Stale refs reject. |
| Duplicate commands after restore | Checkpoint, resend accepted purchase/vote/door ID, reuse same ID with different payload; no second action/RNG draw. |
| Rejection blocks the input stream | Stale valid next-ID action consumes its sequence; the following valid action succeeds, including after checkpoint restore. Malformed and gap packets do not advance the stream. |
| Disabled votes change event timing | Standing/non-Nav cycle includes disabled choices, starts the timer and applies after waitStep; Navigation disabled row cannot vote; tally and settlement match current behavior. |
| Catch-up changes input or cooldown timing | Fake-clock regular vs irregular pumping with identical timestamped inputs; equal hashes and command ticks. |
| UI/render mutation leaks across boundary | Mutate received bytes/replica/CardUiState; authority hash unchanged; render-free authority import smoke test. |
| World lifecycle leaks or corrupts another world | Disposal plateau and sentinel tests in §8, including failed restore. |
| Side effects repeat | Coalesced snapshots, duplicate events, restore, multiple catch-up ticks and end publication yield existing cue policy and one completion. |
| Couch regression | Two keyboards and gamepads, grouped tabs, reconnect slot, events/jump agreement, pause/focus and full-run manual checklist. |
| Client navigation diverges with frame rate | Same device stream at 30/60/144 Hz rendering and bursty frames produces identical commands/figures. |

## 13. Ordered implementation tasks

These are test-first acceptance slices, not the later detailed implementation plan. The Net-1a plan must connect a playable boundary early, then migrate controls incrementally. No runtime mid-tick client handshake is permitted.

### Net-1a: the boundary

1. **Baseline and AST guard.** Record current figures/input traces; add the small Math guard. Acceptance: unchanged baseline and negative guard fixtures pass.
2. **Contracts and loopback.** Envelopes, semantic union, auxiliary messages, copying/FIFO/latest semantics and limits. Acceptance: validators, ownership and mutation isolation pass.
3. **Authority skeleton and ledger.** Headless owner, sequence/results and full end-of-tick publication. Acceptance: a held-input-only client drives a visible crew through loopback; missing/delayed clients never stall authority. Test-only legacy reference stays separate.
4. **Independent clock and pause.** Retained debt, timestamped inputs, interpolation and couch lifecycle. Acceptance: visible movement remains correct without rendering ticks; five-second stall catches up in multiple passes; pause tests pass.
5. **Interaction controls.** Sit/stand/local door/vote/agreement through semantic commands and local translation. Acceptance: playable seating/repair flow, explicit vote choices and deterministic arbitration.
6. **Engineering and Doors.** Extract their client rows/pages and route actions through commands. Acceptance: those couch cards run through authority with capacity/offline/coalescing/purchase-once parity.
7. **Weapons.** Client selectors/rows, explicit aim/fire/swap. Acceptance: playable guns, charge-edge fire and stale-target rejection with traced RNG/XP parity.
8. **Science.** Client card and authoritative scan target. Acceptance: scan, system scan and lock work through loopback with exact progress/XP or traced view-timing differences.
9. **Navigation and groups.** Stable row keys, jump/sector/wait/evade/tab and remaining repeats. Acceptance: playable route/event/shop/tab flows and no authoritative UI cursors.
10. **Bots beside authority.** Same completed-state view and translator, original strategy/cadence. Acceptance: every bot gate unchanged or traced; no floor lowered.
11. **Events and couch cutover gate.** Reliable results/callouts/cues, completion idempotency, remove all legacy runtime paths and finish bootstrap. Acceptance: complete couch run through authority, original couch HUD, all existing regression checks and manual checklist. Tick T decisions use only end-of-T−1 state and local UI; no in-tick callbacks.

Each migrated control family is wired into the playable client as its slice lands; do not defer the actual loopback/authority connection to the last task. The detailed plan may split a slice into smaller commits, but must keep those playable checkpoints.

### Net-1b: durability

12. **Disposal and recycling.** Acceptance: 2,000-cycle plateau, live-world sentinel and failed-load cleanup.
13. **Per-viewer HUD model.** Acceptance: couch parity, own-card/other-pills assertions; new visual layout remains Net-2.
14. **Replay/checkpoint v2.** Complete initialization, semantic journal, ledgers, bot controller memory and version rejection. Acceptance: uninterrupted vs restore/retry equality and no duplicate rewards/actions.
15. **Cross-engine harness and durability gate.** Node and real Chromium hash vectors, Firefox when available. Acceptance: all vectors match, platform gaps explicit and complete regression gates pass.

Versioning across the split: change canonical gameplay shape in Net-1a and bump SIM_VERSION once there. Update flatten/restore for that shape immediately; do not defer correct publication until Net-1b. Preserve the existing golden regression through a test-only legacy fixture translator and a labeled in-memory semantic trace, with no production raw-press fallback. Bless the canonical gameplay golden once after traced Net-1a parity. Net-1b moves that same semantic fixture into replay v2 and verifies its hashes without re-blessing gameplay; snapshot/checkpoint format versions can change independently. Its fixture conversion changes representation, not expected gameplay hashes. An unexpected second gameplay-shape change must be reported and explicitly justified, not hidden in the durability work.

Net-1a retains a bounded in-memory semantic crash trace and existing snapshot mechanics adapted to the new shape; portable save/replay v2 and restoring command ledgers are Net-1b acceptance. Do not advertise durable re-hosting in Net-1a. Entity recycling is deferred, but no state may be allocated per snapshot: use a fixed authority/replica pair per run, release references on restart, and document the pre-existing cross-run entity-index growth until Net-1b fixes it. Timer/link/listener teardown is required immediately in Net-1a.

## 14. Tests and gate

Net-1a requires all boundary/command/clock/couch checks below, including the AST guard. Per-viewer model, recycling, durable replay/checkpoint v2 and real-browser cross-engine checks are Net-1b gates and remain unchecked at the Net-1a cutover. Run the ordinary regression suite at both gates.

- [ ] Pure authority import check: no DOM, Electron, Pixi, storage or platform clock dependency.
- [ ] Every command has success, illegal-seat/ownership, invalid/stale target and duplicate-ID coverage where applicable; reserved moveTo rejects explicitly.
- [ ] Stage/order differential fixtures pass, including same-tick target/row/charge changes and grouped offline-console rules.
- [ ] Independent-clock tests retain every due tick, including 300 ticks after a five-second stall across multiple bounded passes; preserve input timestamps and exclude paused time without erasing prior debt.
- [ ] A missing client never blocks a tick; all human/bot commands derive from completed state, with no mid-tick snapshots/callbacks. Stale targets reject and traced differences are recorded.
- [ ] Loopback owns/copies payloads; latest streams do not overwrite another player's input; close/dispose unsubscribes timers/listeners.
- [ ] Per-viewer HUD model implemented; couch layout/content unchanged; new networked visual layout deferred to Net-2.
- [ ] Entity allocation plateaus while independent live-world hashes remain unchanged.
- [ ] Replay/checkpoint v2 validates fully and resumes deterministically, including bot UI memory, dedup ledger and event cursor.
- [ ] AST Math/nondeterminism guard passes with negative fixtures.
- [ ] Node and **real Electron Chromium** match every one-second hash for both ships; Firefox result recorded as pass/fail/not-run with reason. Engine versions and platform gaps recorded.
- [ ] `npm test`, typecheck and build pass at final implementation HEAD; browser harness exit status checked separately.
- [ ] SIM_VERSION bumped once; final golden re-blessed once after traced parity; no unexplained mismatches blessed.
- [ ] **Couch play unchanged, every gate figure unchanged or traced; no gate floor lowered.** Record baseline/final figures, seed, build, changed field/tick and cause in `docs/gates.md` during implementation.
- [ ] Manual keyboard/gamepad couch flow: join, sit, tabs, fire/scan, power/upgrades, doors, repair/revive, event vote, jump agreement, win/loss/restart, focus/minimize and disconnect/reclaim.

## 15. Open questions for the owner

None blocks Net-1. The supplied prompt authorizes the offline architecture decisions above. Net-0's Cloudflare credentials/domain and browser product scope remain for later milestones. Firefox runner availability is an implementation-environment check, not a product question; absence must be reported rather than silently waived.

## 16. Amendments

1. **Accepted review, 2026-11-13.** Removed ActionWindow/ActionWindowReply and windowId. Clients and host-side bots decide from completed state; authority never waits mid-tick. Charge checks remain execution-time checks. Same-tick target removal is possible and gets explicit stale-target rejection and differential coverage.
2. **Milestone split.** Net-1a connects the playable boundary early and ends with full couch cutover; Net-1b supplies durability. The AST guard lands early. Section 13 defines staging and a single canonical gameplay version/bless across the split.
3. **Status/count.** Net-0 is approved; section 5 explains the finalized 26-kind command inventory.
4. **Votes and callouts.** Vote cycling is exclusively client-side; auxiliary callout messages are formally typed and validated.
5. **Clock debt.** The 120-tick budget limits one pump, never total catch-up. A five-second stall is a required multi-pass test.
6. **Temporary raw-press adapter during Net-1a migration (Claude, second review).** Tasks 5–9 migrate card families one at a time while the game stays playable, so families not yet migrated still need their old input path. Allow exactly one clearly named temporary adapter inside the authority (`legacyCardInput`) that applies the old raw-intent card logic for unmigrated families only, behind the same ledger and tick admission. Each family task deletes its branch of the adapter. Task 11 deletes the adapter, and a test asserts the authority's ingress accepts no raw presses. This is the only runtime raw-press path; the test-only legacy fixture translator for the golden stays separate.
7. **The golden during Net-1a (Claude, second review).** The canonical shape changes family by family, so the golden hash test may fail on intermediate Net-1a commits. Following the project rule, it is the only test allowed to fail before the single bless. Every intermediate commit must instead pass the gameplay-projection differential traces (section 11) and all other tests. The single SIM_VERSION bump and bless happen once, at the end of Net-1a, after traced parity.

