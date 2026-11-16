# Engine Refactor: Layers for Outlaw Crew (design)

Status: written 2026-11-15 at the owner's request ("lets wait until the netcode is finished then we can start on the engine refactor, write a spec"). Net-3 merged to master at `a5b772f` (2026-11-15); this spec was then checked against the merged code and corrected (change log). Choices marked **(rec.)** are Claude's, taken under the standing order; the owner can overturn any of them.

Sources:
- the architecture panel review (six reviewers, 2026-11-15: https://claude.ai/artifact/FWghLqRGR1X16ud5cHJWM6);
- the owner's answers to the grill, Q28 to Q31, in `docs/vision/thesis-grill.md`;
- the Outlaw Crew direction, `docs/superpowers/specs/2026-11-13-outlaw-crew-direction.md`;
- Net-3 as merged on master `a5b772f`:
  - `src/network/modes/` (`ModeDefinition`, `ModeHost`, registry, the sector mode, `sectorStream`);
  - `src/network/state/` (`StateImage`, image codec, per-connection sender and receiver);
  - `src/network/hostRuntime.ts`, `src/utility/authorityHost.ts`, `src/main/network/*`;
  - `authority/{core,ledger,checkpoint}.ts`.
- **Content digest.** It now covers `authority/`, `network/{modes,state,rtc,session}`, `clientRun.ts`, the codec, `receivePolicy` and the shared session files (`build/contentDigest.ts:12-16`). Every R-1 edit therefore changes room compatibility and invalidates saved online mirrors. Goldens are unaffected because `golden.test.ts` re-stamps the digest.

## 1. Why

FTLite's foundation is right: a deterministic fixed-tick sim, owned random streams, an authority that admits commands, a transport boundary, ships as validated data, and render views that only read. The panel agreed on that. What is too narrow is the structure above it.

**One struct holds everything.** `SimState` (`sim/state.ts:19-63`) contains:
- one ship;
- its encounter (director, debris, a scalar enemy);
- the whole campaign (a fixed 24-node sector map, fuel, shop);
- the session (votes, about 40 telemetry counters, render notices).

**Crew are player seats.** Every per-crew array is indexed by player id and sized by the player count.

**The authority is typed to that one struct** (`authority/core.ts:1-19`).

**The duel works around all of this by hand.** It hand-picks interior fields to hash (`sim/duel/hash.ts`), duplicates the scratch reset, fakes a sector envelope (`runId: 'duel'`), and keeps its own result types.

The owner's answers make the wider structure necessary:
- **Q28:** 16 players means one capital ship *or* several ships, *including PvP* (PvP amended to out of scope for now, 2026-11-15).
- **Q29:** the gravity-well fight is *the* combat, and locking on to a target opens an FTL-style view of that ship.
- **Q30:** players can move between ships.

None of these fit one ship per run with crew indexed by seat.

## 2. Goals and non-goals

**Goals**
1. An encounter holds **N ships** (capital ship, convoy; PvP later), each a full ship state with an interior, flown by a human crew, the hunter AI or a bot.
2. **People are separate from ships:** a crew table per ship with a controller (player, bot or NPC), so crew can board and transfer.
3. **One combat model** (Q29): space and the ships' systems are shared by the tactical layer and the interiors, and the FTL lock-on view shows a target's real state.
4. The authority runs any encounter through **one generic core**, inside Net-3's mode layer. There is no mode switch inside the authority.
5. **Hashes cover all gameplay state and nothing else:** completeness is enforced by a test, and telemetry and render notices leave the hash.
6. A **campaign save** that survives code changes, separate from strict tick snapshots.
7. **Cheaper features:** content identified by string ids, console kinds from a registry, and dev scenarios and tuning overrides.

**Non-goals** (the panel's combined list):
- a general ECS, plugin loader or scripting language;
- a continuously simulated galaxy (off-screen ships are campaign records that change at jumps);
- lockstep or host migration (re-host from checkpoint, as Net-3 does);
- variable-length lists in hashed state;
- migrating tick snapshots across versions;
- 16-seat arrays;
- porting the legacy sector run onto the new layers (§9).

## 3. Target structure

```
Campaign    graph, factions, roster, careers, ship loadouts    own versioned save, changes at beats
Session     player ↔ crew bindings, votes, presence, telemetry  checkpointed, NOT hashed
Encounter   the live 60 Hz scene                                hashed, snapshotted, published
  ├─ ShipState[k]   rooms, doors, airlocks, breaches, stations, power, systems, crew table
  └─ Space          tactical bodies, missiles, map, AI controller rows
```

- **ShipState** is today's interior part of `SimState`: rooms, doors, airlocks, breaches, stations, power, heat, hull, weapons and loadout, the crew table, and its own random stream. One layout per ship; `Derived` is still rebuilt from the layout.
- **Space** is today's `TacticalState`, generalised from two ships to N (§5). The hunter becomes a per-ship AI controller row instead of a single `hunter` field.
- **Encounter** = `{ tick, ships: ShipState[], space: Space, director, debris, events }`. Its capacity (ships per encounter) is a constant per encounter kind, at most 4 **(rec.)**.
- **Canonical order is fixed by slots, never by occupancy:**
  - **Ship slots:** an encounter has `capacity` ship slots, numbered 0 to capacity−1. Each slot is serialised in slot order whether it is in use or not.
  - **Empty slots:** an inactive slot is written as `active = 0` with every field 0, so nothing in it depends on history.
  - **Inside a slot:** the ship module's declared field order, then the crew table in crew-slot order.
  - **Missile pool:** missiles live in a fixed pool, written in pool-slot order. Each slot has an `active` flag and an `owner` ship slot, and an empty slot is `active = 0` with every field 0. A new missile takes the lowest free pool slot.
  - **Stable ids:** one encounter-level monotonic counter allocates them, whichever ship a crew row is on. A transfer keeps the id.
  - **Random streams:** at creation, the encounter's master stream draws one seed per ship slot, in slot order, and per ship one seed per named stream, in a fixed name order. Systems draw in phase-list order, ships in ascending slot order.
  - **Versioning:** the manifest that lists all of this is part of `SIM_VERSION`. Changing it is a version bump, proved by §9's migration proof.
- **Session** and **Campaign** sit outside the hashed encounter (§7, §8).
- **Level of detail** **(rec.)**: every ship in the current encounter runs fully at 60 Hz. One tick of the Cutter costs about 4 to 7 µs idle (measured), so 4 ships are affordable. Everything else is a campaign record advanced per jump.

## 4. People and crew

- Each ShipState has a **crew table** of fixed capacity `CREW_SLOTS` per ship class. Its columns are:
  - `active`, `stableId`, `characterId`;
  - `controller` (a player id, a bot or an NPC);
  - position and life state, seat, carrying;
  - per-crew XP.
- **Who controls which body is gameplay state, so it is hashed.** The authoritative binding is the crew rows' `controller` column inside the hashed Encounter: player *p* controls the single active crew row, across all ship slots, whose controller is *p*. An invariant check in the encounter step enforces at most one such row per player. The Session keeps a mirror (`player → { ship, crewSlot }`) for the lobby, UI and seat tokens. The mirror is rebuilt from the hashed rows after every restore and validated against them; it is never authoritative.
- A player owns a *body*, not an array index. Boarding or a transfer moves a crew row from one ship's table to another's, as one deterministic operation inside the encounter step. Its stable id is kept, so render memory and replays follow the character.
- `MAX_PLAYERS` stops being an array size inside ship state. Sixteen players is four ships of four, or one capital ship whose `CREW_SLOTS` is 16. The cap moves to the Session and the lobby.
- **bitECS is retired here** **(rec.)**. The sim has zero queries; bitECS is only used to allocate ids, which forces a shared global entity index and manual cell deletion. Crew become a typed-array table like debris and boarders already are. This change is not observable, and it is proved by the equivalence check (§9).

## 5. One combat model (Q29)

- **Space owns position and flight:** bodies, headings, gravity, contacts, missiles, arcs and line of sight.
- **Each ShipState owns its systems:** one systems record per ship holding room damage levels, power allocation, shield layers, weapon charge and hold, magazine and hull. The interior and the tactical layer both read and write that one record.
  - Today's `Ship.rooms`, `shields`, `laserCharge`, `magazine` and `hull` in `TacticalState` move into it. The tactical layer keeps only kinematics plus a ship index.
  - **R-2 changes storage, not rules** **(rec.)**. The duel keeps today's rules: three repair points acting on room damage, interior power not coupled to the fight. But slots, the missile pool's `owner` field and `active` flags change the canonical array, so R-2 is a **schema migration**, proved like R-4 (§9):
    - Record a pre-R-2 oracle over the duel golden and the ten gate seeds: named tactical and duel fields, command results, events and telemetry, per tick.
    - Check the post-R-2 run through an alias table, with the new fields (`active`, `owner`) declared added.
    - Then re-bless the duel golden as a `SIM_VERSION` bump. The gate outcomes must stay identical.
  - **The full interior link is a separate gameplay milestone, R-2b.** Interior power allocation drives shields and engines, and repair acts on the same numbers the fight uses (Q11, Q27). It changes gameplay, so it has new expected outcomes: re-run gates, a re-blessed duel golden, and the owner's playtest.
- **Arrays, not pairs.** About 31 two-ship assumptions in 16 files become arrays plus an explicit target index:
  - `ships: [Ship, Ship]`, `missiles: [m, m]`, `present: [b, b]`;
  - `j = 1 − i` in `weapons.ts`;
  - two-ship render models.

  Weapons fire at the ship's **locked target**, not at "the other ship". A missile pool replaces one missile per ship, with at most one in flight per ship **(rec.)**, as today.
- **Definitions, not constants.** `ShipClassDef` (hull, thrust, turn, radius, shields, power, slots, AI profile) and `WeaponDef` (laser, missile) replace the one-off constants in `sim/tactical/tuning.ts`. Today's numbers become the `cutter` and `hunter` entries, so the change is golden-neutral.
- **FTL lock-on view.** A seat that locks a target opens an FTL-style side view of the target's ShipState interior (rooms, damage, fires and crew). It is the old enemy window drawn from real state.
- **PvP visibility** **(rec.; deferred with PvP)**: a rival crew's interior is only visible through a lock-on, drawn from that crew's projection (§10). It shows room damage and systems, not the rival's random-number state.
- **The sector game's scalar enemy** (`sim/enemy.ts`, `state.enemy`) is not used by the new encounters. It stays only in the frozen legacy sector run (§9).

## 6. Modules and the generic authority

**Sim modules.** Each part of the encounter is a module exporting a small contract **(rec.)**:

```ts
interface SimModule<S, C> {
  readonly id: string;                         // 'ship', 'space', 'director', …
  create(init: unknown, rng: RngState): S;
  fields(s: S): CanonicalField[];              // canonical order: drives flatten, hash, snapshot, clone, completeness
  commands: readonly C['kind'][];              // the command kinds this module owns
  reasons: readonly string[];                  // the rejection reasons it may return
}
```

- The **encounter step** is a static, ordered phase list written in code, listing which module function runs in which order. Today's 20 sector systems and the duel's 11 steps become phases. There is no dynamic scheduler.
- **flatten, hash, clone, snapshot and the completeness test** are all derived from the modules' `fields`. That ends hand-picked hashes and the manual `cloneTactical`.
- **Migration is staged:**
  - R-1 introduces the contract and moves the duel onto it: space, the duel interior wrapper, presence and repair.
  - R-2 adds the per-ship systems record as part of the ship module.
  - R-4 moves the sector interior systems into the ship module.
  - R-5 adds the encounter-level director and debris.

  Each milestone's acceptance includes a test that adding a field to one of its modules either changes that module's snapshot and hash or must be declared excluded.

**Generic authority.** `createAuthority` takes a rules object instead of importing the sector sim:

```ts
interface EncounterRules<State, Init, ControllerMemory> {
  create(init: Init, resolveLayout: ResolveLayout): State;
  dispose(state: State): void;                            // today: disposeSimState
  assertLive(state: State): void;                         // today: assertSimStateLive
  playerCount(state: State): number;
  tick(state: State): number;                             // today: state.tick, read by core.ts:133-138, 261-268, 426-429
  step(state: State, input: FrozenTickInput): CommandResult[];
  terminal(state: State, init: Init): { ended: boolean; endRecord: EndRecord | null };  // today: state.ended + telemetryRecord on end (needs the init's seed)
  validateInit(bytes: unknown, contentDigest: string, resolveLayout: ResolveLayout): Init;
  initialControllers(init: Init): ControllerMemory;
  cueBaseline(state: State): CueBaseline;
  safePointKey(state: State): string;                      // today: visitRef, for safe-point checkpoint captures
  callouts(state: State, player: number): Callout | null;  // today: calloutFor + the crew-dead check
  cues(prev: CueBaseline, state: State): Cue[];
  snapshot(state: State, contentDigest: string): Snapshot;  restore(snapshot: Snapshot, resolveLayout: ResolveLayout): State;
  hash(state: State): string;
  validateCheckpoint(bytes: unknown, contentDigest: string, resolveLayout: ResolveLayout): Checkpoint<Init, ControllerMemory>;
  commandCodec: MessageCodec;                               // the mode's whole message codec: envelopes for the ledger and published states (the snapshot header differs per mode)
}
```

Rules for three of these hooks:
- **`tick`.** For the duel, `tick` returns `interior.tick`. `stepDuelTick` advances the interior tick and the tactical tick together, once per call, so they are always equal. The duel restore validates that equality and rejects a snapshot where they differ.
- **`EndRecord`.** The authority's `ended` event carries a tagged wrapper, and the tag lives on the wrapper, not inside the record. The codec validates it as a discriminated union on `mode`:

  ```ts
  type EndRecord =
    | { mode: 'sector'; record: TelemetryRecord }   // today's strict record, unchanged (net/contracts.ts:81-87, codec.ts:80-100)
    | { mode: 'duel'; record: DuelEndSummary | null };
  ```

  - **The duel summary** is a plain, frozen value computed once when the duel ends: `{ outcome, ticks, terminal: [TerminalCause[], TerminalCause[]], laserReleases: [n, n], laserHits: [n, n], missilesLaunched: [n, n], missileHits: [n, n], repairsFinished: [n, n] }, where the pairs are per ship except `repairsFinished`, which is per player`, all integers, with causes from a fixed enum. `terminal` keeps the accumulator's arrays as they are, because one tick can kill a ship several ways (`duel/telemetry.ts:50-55, 152-161`). Each array lists the causes in the accumulator's order, with no duplicates, and is empty for a ship that survived; the codec validates that. It is not the live accumulator.
  - **The duel telemetry accumulator** (`sim/duel/telemetry.ts`, with its previous-tick and manoeuvre state) is mode memory. It is not hashed. It is saved in the duel checkpoint as its own versioned, codec-validated blob next to `ControllerMemory`, and restored with it, so a restored duel's end summary equals an uninterrupted run's. The continuation proof below compares the end summaries too.
- **Layout resolution.** The generic authority keeps the merged `resolveLayout` dependency (`authority/authority.ts:24-33,56-61,74-79`) and passes it as the explicit argument of the rules' `create`, `restore` and `validateCheckpoint` (see their signatures). The sector rules use it as today. The duel rules resolve the Cutter through the same resolver.

Every call `authority/core.ts` makes into sector code today goes through one of these hooks: `visitRef` (`core.ts:118,124`), `calloutFor` (`:292-294`), `telemetryRecord` (`:437`), `state.ended`, `playerCount` and `layout` (`:44,164`), `assertSimStateLive` and `disposeSimState` (`:37,612`), and `saveSnapshot`. Bot controller memory (today the sector `CardUiState[]` in the checkpoint) becomes an opaque per-mode `ControllerMemory` blob that the mode's checkpoint validator checks.

The ledger, tick driver, journal, checkpoint cadence and publication stay as they are, with Net-3's input-tick window and delta sender.

**Lifecycle and the adapter to Net-3's modes** (delivered in R-1):
- **The generic authority.** `createEncounterAuthority(rules, deps)` exposes exactly the merged `Authority` surface (`authority/authority.ts:47-55`), generic over the rules: `start`, `restore`, `attach`, `checkpoint`, `requestCheckpoint`, `completeBootstrap`, `replay`, `pump`, `dispose`.
  - Its deps are the merged ones, unchanged: `resolveLayout`, `contentDigest`, clock, scheduler, `onCrash`, `onCheckpoint`, the **session lease gate** (bootstrap pause, fence, `resetPausedEpoch`; `core.ts:60-62,213-224`), the producer hooks (`beforeControls`, `beforeTick`, `botControllers`) and `bindLifecyclePause`. Pause stays injected (`sector.ts:53,86`), not a method.
  - The replay V2/V3/V4 frame semantics (fence, watchdog, seal) are preserved exactly. R-1 runs the cross-engine determinism check and the native host gates on every change.
  - **Replays become mode-aware.** A replay records its `mode`; when the field is absent, the mode is `sector`, so existing V2/V3/V4 files parse unchanged. `parseReplay` and `runReplay` (`authority/replay.ts:29-33,44-64,77-81`; `sim/replay.ts:25-30`) look up the mode's rules and use its init, checkpoint, snapshot and command validators instead of the sector ones.
  - **Observable check:** the existing sector replay tests pass unchanged, and a recorded duel replay re-runs to the same final hash.
- **What each mode owns:**
  - the byte codecs for its init and checkpoint (validate, decode, encode, within Net-3's payload bounds);
  - attachment validation (which player ids are legal);
  - its producers (bots, and the local input hooks);
  - its stream publication adapter (the equivalent of `sectorStream`), which turns a published state into Net-3 `StateImage`s.
- **The mode factory.** A small `defineEncounterMode({ modeId, schemaVersion, rules, codecs, producers, publication })` builds a Net-3 `ModeDefinition` whose `ModeHost` has the merged lifecycle (`src/network/modes/contracts.ts:8-17`):
  - `start(bytes)`, `restore(bytes)`, `completeBootstrap()`, `attach`;
  - synchronous `checkpoint(): Uint8Array`, which encodes the current checkpoint now and throws if it would exceed `MAX_HOST_BYTES`. `hostRuntime` calls it directly (`hostRuntime.ts:65-71`);
  - async `captureCheckpoint(cause): Promise<ModeCheckpoint>`, the safe-point capture used for uploads;
  - `pause(reason: string)`, `dispose`.

  It also keeps the sector host's behaviour: it refuses to replace itself while anything is attached, and it caches checkpoint candidates and crash checkpoints (`sector.ts:35-52`). `modes/sector.ts` is rewritten as one call to it.
- **The duel needs a snapshot format (an R-1 deliverable).** Today the duel has `cloneTactical` but no serialisation: nothing restores tactical or duel state. R-1 adds a duel snapshot codec and checkpoint schema **(rec.)**:
  - **Header:** `{ snapshotFormat: 1, simVersion, contentDigest, layoutId, layoutHash, seed, mapHash, tick, playerCount, hash }`. `mapHash` is `hashF64` over the map's canonical values, computed when the duel is created: planet, then each asteroid's x, y and r in index order, then the belt count, the cluster sizes, the gaps and both spawns.
  - **Stored values:**
    - the interior, through today's sector snapshot path (`flatten`/`unflatten` of the interior `SimState`);
    - the tactical state in `flattenTactical`'s order: ships, missiles, hunter, tick, outcome and the tactical random-number state;
    - `present` and `repair`.
  - **Regenerated, not stored:**
    - the map, rebuilt from `seed` with `generateMap`; it must pass `validateMap`, and its recomputed `mapHash` must equal the header's;
    - the broad-phase grid;
    - the repair points, from the Cutter layout;
    - `Derived`, from the layout.
  - **Not stored:** per-tick `events` and `d.events`, which are cleared every tick.
  - **Validation on restore:** header versions, digest and layout; the value count; the interior and tactical ticks being equal; and the restored duel's `hashDuel` equalling the hash recorded in the checkpoint.
  - **Continuation proof:** run a duel N ticks, checkpoint it, restore, run M more ticks, and compare with an uninterrupted run of N + M ticks. The per-tick hashes must be identical, and so must the `DuelEndSummary` when the duel ends within the run (choose M so it does).
  - **Size:** a test encodes a checkpoint at the duel's largest state (both missiles in flight, all rooms damaged, mid-repair) and asserts it is under `MAX_HOST_BYTES` (256 KiB, `shared/netSession.ts:3`). The duel's canonical state is a few thousand values, so it is expected to be well under.
- **R-1 acceptance:**
  - For both sector and duel, start → captureCheckpoint → restore round trips reproduce identical hashes, at the utility and `hostRuntime` level. This is the same level as Net-3's `host-smoke` gate: registering the duel mode in `authorityHost.ts` and driving it through `hostRuntime` over loopback.
  - Attach and detach work over loopback.
  - The online duel UI and session are **not** part of R-1. Only the sector mode is wired through main and the renderer today (`authorityHost.ts:11`; `main/network/onlineSector.ts`; renderer `app/onlineSession.ts:5,85`; `RoomCompatibility` needs a sector `layoutHash`). That wiring belongs to H-2.
  - A utility's mode identity is fixed at `initialize`, and a room's mode at creation (`utilityHost.ts:77-81`). Switching encounter kinds therefore means a new host generation and a new room.

**This plugs into Net-3, it doesn't replace it:**
- Each `ModeDefinition` (`src/network/modes/contracts.ts`) wraps one `EncounterRules`, the way `modes/sector.ts` wraps the sector authority today.
- The duel becomes a second registered mode (`duel`). Later encounter kinds (port, boarding, a convoy) are further rule sets on the same core.

**Commands.**
- One namespaced command union: each module owns its kinds.
- **The ledger takes the mode's command codec** **(rec.)** instead of importing the sector message codec (`ledger.ts:1`). An envelope that fails the mode's codec is rejected `malformed`, as today.
- **One `CommandResult` type for everything.**
  - The duel's `DuelResult` and `DuelReason` merge into it.
  - It keeps today's statuses, including `already-processed`.
  - It keeps the wire-only `admission { expectedSequence, disposition }` that `commandOutbox.ts:47-51` depends on, which must never enter the ledger's result cache (`ledger.ts`).
  - The duel envelope gains the `runId` the shared envelope has (`sim/duel/commands.ts:13`).
- **Reasons** are the shared base list plus the reasons each module declares. `COMMAND_REASONS` is a closed `z.enum` inside the result schema (`net/codec.ts:61-63`), so the duel's `not-in-duel`, `not-at-weapons` and `missile-in-flight` join that enum in R-1.
- **There is no pre-step command validator today.** Validation happens inside the step, so `EncounterRules` adds none. Admission checks stay in the ledger, and rule checks stay in `step`.
- Every command carries the target `ship` where it applies. Direction amendment 8 already allows this addition.

## 7. Hashing and the goldens

- **Completeness is enforced.** A test requires every field of every module's state to be either canonical or on that module's declared not-snapshotted list. A first version of this test for today's `SimState` is on branch `hash-completeness`, unmerged and waiting for Net-3. It merges as the first step of R-0.
- **Telemetry and render notices leave the hash.** Today, about 40 telemetry counters and several renderer notices (`weapons.lastShot*`, `loot*`, `run.boughtTick/Kind`) are hashed state, so every new metric or UI cue is a sim-version event. They move to per-tick events, which the duel already uses, plus a Session-side telemetry record that is checkpointed but not hashed. Late joiners get a short ring buffer of recent events.
- **Proving R-3.** R-3 removes fields from the canonical array, so the version-only re-bless cannot prove it. Its proof is a **migration proof**:
  1. Before the change, record per tick the named canonical values of every retained field, every command result, and every telemetry counter.
  2. After the change, check two things at every tick: the retained named values are equal, and the new event-derived telemetry record equals the old counters.
  3. Only then bless the new schema, as a `SIM_VERSION` bump.

  Every migration comparison (here and in §9) **excludes the version field** (`$simVersion`, and `SIM_VERSION` at the head of the duel hash). It then checks separately that the new version is exactly the old one plus 1.
- **The version stays in the hash** **(rec.; the skeptic dissented)**, together with the existing guarded version-only re-bless. That guard is reserved for changes that leave the canonical array identical apart from the version.
- **One command blesses every pinned artifact** **(rec.)**. Today `npm run bless` regenerates only `basic.json` and `duel-1.json`; `determinism-v2.json` and `net1a-baseline.json` each have their own procedure.
  - `net1a-baseline.json` is labelled "immutable gameplay scenarios" from SIM 34. It is retired to an opt-in historical check (`--baseline`). Its role as an independent gameplay oracle passes to the equivalence check of §9 and to the per-tick canonical trace.

## 8. Campaign and saves

- **Campaign** holds:
  - the galaxy graph, with per-system content generated from `hash(campaignSeed, systemId)` rather than stored;
  - factions and reputation;
  - the roster (characters, XP, debt);
  - ships owned and their loadouts and damage;
  - an append-only **deed log**, which doubles as the ship's log and the shareable tale (panel wild card).
- **Time:** the campaign advances at **beats** (dock, jump, contract) and on a coarse travel clock, never per 60 Hz tick. Campaign time is in world units, not ticks.
- **Campaign save:** a zod-validated JSON file with a `saveVersion` and forward migration functions, written only at beats, never mid-encounter **(rec.)**.
- **Tick snapshots stay strict:** they are tied to `SIM_VERSION` and the content digest, and are used for checkpoints, re-host, replays and crash records. They are never migrated.
- **Player-kept media** (kill-cam clips, shared tales) store published snapshots or keyframes, not inputs, because input replays die on every version bump.

## 9. The legacy sector run

The three-sector FTL run, the Pursuit and the Warden are frozen as a **legacy mode** **(rec.)**. They keep their current code path, their goldens and the eight gate families, and get no new features.

They still share the systems code. Today's systems (oxygen, fire, doors, power, movement and the others) are rewritten to take a ShipState instead of a SimState. The legacy `SimState` becomes `{ ship: ShipState, legacy: { run, enemy, director, … }, session }`, so the sector run and the new encounters run the same interior code.

**Proving the sector run is unchanged.** Field moves change the sector hash, so the version-only re-bless cannot prove equivalence. Instead, a frozen **pre-refactor oracle** is recorded once, before R-4. It runs over the golden replay and every determinism-v2 schedule, and stores per tick:
- every old canonical field, by name;
- every command result (player, sequence, status, reason);
- every authority event and cue;
- the player → stable-id binding of each controlled body.

After the refactor, the same scenarios run through an **alias table** from old field names to new paths. The alias table is generated from the module field declarations plus an explicit list of renames. The check fails on:
- any old field that is unmapped and not on the declared-dropped list (with a reason);
- any new field mapped from two old fields;
- any value, result, event or binding that differs at any tick.

Only then is the new schema blessed, as a `SIM_VERSION` bump.

## 10. Networking integration (after Net-3)

- **Partitions in the state image.** An encounter's `StateImage` (`src/network/state/imageCodec.ts`) carries the encounter as ordered partitions: `space`, then `ship:<k>` for each ship, then `director`. Each partition has its own offset, which the image metadata records. Deltas keep working because the image length is fixed by capacities, not occupancy.
- **PvP is out of scope for now** (owner, 2026-11-15: "lets keep pvp out of scope for now"). Everything from here to the end of the visibility policy below is kept as design notes for when PvP returns; it is not built. Co-op crews, on one capital ship or several ships, all see the full state as they do today.
- **Per-crew projections for PvP (Q28)** **(rec.; deferred with PvP)**:
  - **Layout.** Every projection image has the same fixed layout:
    - a projection header;
    - the **projected `space` partition**: the map, every ship's kinematics, and the missile pool (per slot: an `active` flag, then position, velocity, heading, owner and age; every field 0 when the slot is empty). Per-ship AI controller rows (the hunter's mode, target, timers and random state) are redacted to 0 for every ship the recipient does not control. Only the host sees them;
    - then, for each ship slot in order, an exterior-summary block (hull, shield layers, room damage levels, kinematics) and an interior block.

    The interior block holds that ship's interior without its random-number state. It is filled for the recipient's own ship and for a locked target, and otherwise holds the redaction value 0 with a per-slot `visible = 0` flag.
  - **Length never changes.** Because the length is fixed by capacity, acquiring or losing a lock-on, or transferring between ships, changes values only. Deltas against the last acknowledged baseline keep working.
  - **Header.** The projection header carries only the projection id, encounter tick, slot visibility flags and the **projection hash**: a hash the host computes over the projected values. It carries no random-number state, full-state fields or full-state hash.
  - **What changes in Net-3's stream.** Today each image's metadata is the whole `PublishedState` minus its values (`sectorStream.ts:36`): the full-state `hash`, every player's command and held high-water marks, and `pauseOwner`. Clients reject an image unless its `hash` equals `hashF64(values)` and it passes `validateSnapshot` against the layout (`sectorStream.ts:28-29`). R-6 therefore needs:
    - new projected-image metadata: the projection header, plus only the recipient's own high-water marks;
    - a new client acceptance path that checks the projection hash and the projection manifest.

    The stream epoch (from runId, layout, `controlRevision` and phase, `sectorStream.ts:23-25`) must not include projection fields, so a lock-on never forces a full image.
  - **Desync checks.** Clients check the projection hash, and each Net-3 image carries its own projection manifest version. Full-state hashes and desync diagnostics stay on the host.
  - **Sharing and cost.** Today each streamed connection already has its own `createStateSender` and runs `publicationToImage` itself (`sectorStream.ts:76-125`); the core hands each binding its own cloned publication (`core.ts:274`). Projections fit that model: each connection's encoder takes its crew's projection. Encoding once per projection is an optimisation, a projection-keyed image cache shared by connections. Delta baselines stay per connection, by design (`sender.ts:21-27`).
  - **Visibility changes are tested:** acquire lock-on, lose lock-on, transfer between ships, and a rival ship destroyed.
- **One per-recipient visibility policy** **(rec.)** governs every path information can take to a connection:
  - state images and their metadata;
  - authority events and cues. Today `emit` broadcasts every event to every binding (`core.ts:287`), so the policy filters at `emit`, not only at the stream. An event naming a private interior goes only to recipients who can see that interior;
  - command results (to their owner only, as today);
  - notifications;
  - checkpoints (see below);
  - flight-recorder and history exports (host-side; an export for a player applies that player's projection).
- **Checkpoints and re-host in PvP are an open design problem for R-6.** Net-3 lets any seat re-host: guests pull and keep the full checkpoint (`main/network/onlineSession.ts:433`, `onlineMirrors.ts`, served by `services/signalling/src/room/checkpoints.ts:43-44`). A full checkpoint holds every rival interior and random stream. R-6 must choose one of:
  - host-only re-host in PvP rooms;
  - checkpoints encrypted to the host role;
  - partitioned per-crew saves that a re-host reassembles.

  Co-op rooms keep today's behaviour.
- **Public fields are an explicit allowlist, covering the space partition too** **(rec.)**. Space: the map, kinematics and the missile pool, as listed above. A ship: `active`, ship class id, hull, shield layers, room damage levels (one per tactical room), and the kinematics (position, velocity, heading). Nothing else about a ship is public.
- **The R-6 privacy test inspects every channel.** It records everything a rival connection receives over a scripted PvP fight, including values, metadata, events and notifications. It decodes every partition, the space partition included, and asserts that for any ship whose interior is not visible to that recipient, only allowlisted fields appear. It also asserts that no AI controller row or random-number state of a ship the recipient does not control appears anywhere.
- **Seats belong to players, not crew slots.** The seat token and "rejoin your own seat" should map to a player id, and the Session maps the player to a crew row. **Today this needs protocol, service and schema work, not just a Session mirror** (R-6 or later):
  - A seat is `seatId` + `seatGeneration` + token (`seatStore.ts:8-11`), and today seat = player id = crew index (`onlineSession.ts:200,274`).
  - The player count is fixed at room capacity (`roomSession.ts:109`).
  - The cap of 4 is hard-coded in `ROOM_MAX_PLAYERS` (`roomSession.ts:4`), `seatId < 4` (`seatStore.ts:42`), the deployed signalling Worker (`services/signalling/src/index.ts:32`, `directory.ts:47`) and `MAX_PLAYERS = 4` (`shared/intent.ts:2`, checkpoint and replay schemas). Raising it means a service redeploy.
- **Connections with no crew body** (spectators, passengers) are a later protocol change. Today `validPeer` (`hostProcessProtocol.ts:68`), `attachPeer` (`hostRuntime.ts:79`) and the sector attach (`sector.ts:70`) reject zero-player bindings; only `core.attach` accepts one (`core.ts:504`). The service has no spectator identity.
- **Bots** already attach as their own loopback binding, standing in for a vacant player id (`sectorProducers.ts:34-49,82-85`). Independent bot bindings that don't occupy a player seat come with the seat work above.
- **A bounded history ring** (milestone R-8, not R-1): the authority keeps its rotated segments (checkpoint plus frames) in a ring instead of dropping them. That gives a flight recorder, kill-cams and bug reports (panel wild card). R-1 must only keep segment rotation intact. Bounds **(rec.)**:
  - the newest 6 segments (about 30 s), at most 4 MiB encoded in total, with the oldest evicted first;
  - a single segment over 1 MiB is not kept, and a counter records it;
  - export is host-side only, written to a file by a dev command, never over the IPC crash channel;
  - a test exceeds each bound (segment count, total bytes, one oversized segment) and checks eviction.
  - Segments are about 5 seconds: they rotate at `tick % 300`, and earlier when controls reach 256 or frames exceed 4,096 (`core.ts:413,441,460`). Today `resetBaseline` drops `frames` and `ticks` (`core.ts:243-244`).
  - Crash diagnostics crossing IPC are capped at 64 KiB / 4,096 nodes, and anything over becomes `null` (`utilityHost.ts:45-66`), so a ring export needs its own bounded channel.

## 11. Content and tools

- **String ids** for content (events, weapons, stations, ship classes), mapped to indices at load. One `contentRefs` test checks every cross-reference. TypeScript tables stay the format; JSON with zod is used only where tools generate the data (ships, and later star maps).
- **A station registry** replaces the rule "exactly seven stations, one per kind" (`ship/schema.ts:35`). Each entry gives power, commands, mini-game id, bot hook and director weight. The schema then checks stations ⊆ registry. The `StationKind` switches in 28 files become registry lookups.
- **The mini-game primitive (MG-X)** is the next unit of game design, but its engine side is planned here:
  - An authority-owned attempt table per ship: id, player, station, target, start tick, minimum duration, pinned difficulty.
  - One `attemptResult(id, quality 0..100)` command.
  - A per-console outcome formula.
  - The mini game itself runs on the client; the sim never simulates its frames.
- **Dev tools:**
  - a `?scenario=<name>` launcher sharing scenario builders with the tests;
  - a dev-only `window.__ftlite` hook (load scenario, snapshot, load snapshot, step, pause);
  - run-start tuning overrides from a gitignored JSON, carried in the run init and the content digest;
  - a "restart same seed" key;
  - a mini-game sandbox mode;
  - no live mutation of sim constants mid-run.

## 12. Milestones

Every milestone is a contract change (Q31), so it runs the full spec, review, plan, review, build and review loop, except where marked "light". All of them wait for Net-3 to merge.

| # | Milestone | Delivers | Proof |
|---|---|---|---|
| R-0 | **Guards** | Merge `hash-completeness` (it merges cleanly onto `a5b772f`). Its fuller duel hash changes the duel golden, so R-0 bumps `SIM_VERSION` to 37, with the guarded version-only re-bless for the sector goldens and determinism fixture. One bless command for every pinned artifact; retire `net1a-baseline` to `--baseline` | the completeness test fails on an added field; bless regenerates everything |
| R-1 | **Generic authority** (was H-0c-ii-b) | `EncounterRules`, `createEncounterAuthority` and `defineEncounterMode` (§6 lifecycle); sector rules wrap today's step; the duel snapshot codec and checkpoint; the duel as a registered mode in `authorityHost.ts` on the module contract; mode-tagged end records; mode-aware replays; one command union and result type | sector goldens byte-identical; existing sector replay tests unchanged; start → captureCheckpoint → restore round trips for sector and duel at the `hostRuntime` level; the duel continuation proof and size test; a duel replay re-runs to the same hash; the module completeness test for the duel |
| R-2 | **N-ship space + systems record (storage only, rules unchanged)** | ship slots, a missile pool and a target index; one systems record per ship, holding today's duel rules unchanged; `ShipClassDef`/`WeaponDef` | the duel migration oracle (§5): fields, results, events and telemetry per tick, with the version excluded; identical gate outcomes; then a re-blessed duel golden and a version bump |
| R-2b | **Full interior link** (gameplay) | interior power drives shields and engines; repair acts on the shared systems record | new expected outcomes: gates re-run, duel golden re-blessed, owner playtest |
| R-3 | **Telemetry and notices out of the hash** | per-tick events; Session telemetry record | the migration proof of §7 (retained fields, results and telemetry equal per tick), then a version bump |
| R-4 | **ShipState extraction + crew table** | systems take ShipState; legacy SimState wraps one ship; crew table with controllers and the hashed binding (§4); bitECS retired | the pre-refactor oracle of §9: fields, command results, events and bindings per tick |
| R-5 | **Encounter with ships[]** | an encounter holding 2 to 4 ShipStates; the hunter's ship becomes a real ShipState; boarding moves crew rows; FTL lock-on view | a duel against a full enemy interior; a scripted boarding test |
| R-6 | **Projections** (deferred: PvP is out of scope) | fixed-layout per-crew images over Net-3 with the projection header and hash; the per-recipient visibility policy for every channel | the all-channel privacy test of §10; lock-on acquire and loss, and transfer, keep deltas working |
| R-7 | **Campaign + save** | Campaign layer, deed log, save format with `saveVersion` and migrations | a save written before a code change loads after it |
| R-8 | **Content seams and the flight recorder** (light) | string ids, `contentRefs` test, station registry, scenario launcher, tuning overrides; the bounded history ring (§10) | adding a console kind touches the registry plus its own files |

R-1 and R-2 come first, because the networked duel (H-2) and the owner's playtest wait on them. R-2b follows H-2, gated by the owner's playtest. R-3 to R-8 follow in order of the game milestones that need them:
- R-3 before MG-1a;
- R-4 and R-5 before CB-1;
- R-6 deferred until PvP returns;
- R-7 before OW-0;
- R-8 alongside MG-1b and EV-0.

## 13. Risks

0. **Version skew with the deployed package.** The deployed Net-3 candidate is SIM 35, master is SIM 36, and R-0 makes it 37. Master builds can't join rooms made by the deployed package, so the owner redeploys a build before the H-2 playtest. Every R-1 edit also changes the content digest (sources, above), which breaks room compatibility with earlier builds.

1. **The refactor eats the time meant for "is it fun?"** Mitigation: R-1 and R-2 are the only steps before H-2, and the owner's playtest gates everything after them. The other steps land just in time for the milestones that need them.
2. **Equivalence is proved by a mapping that can itself be wrong.** Mitigation: the alias table is generated from the module field declarations plus an explicit rename list, and the check fails on unmapped or duplicate fields. The oracle also compares command results, events and bindings, not only state values, so a wrong mapping that leaves behaviour intact is the only kind that can pass, and that kind is harmless.
3. **Net-3's projections (R-6, deferred with PvP) are more than an image choice.** They need new image metadata, a new client acceptance path, filtering at `emit`, and a re-host checkpoint policy (§10). The delta sender, payload limits and full fallback are reused. None of it is built while PvP is out of scope.
4. **N ships multiply the step cost.** Mitigation: at about 4 to 7 µs per ship per tick at idle, 4 ships stay under 0.1 ms. Step cost under combat load is measured before R-5 merges.

## 14. Open questions (defaults taken meanwhile)

1. Encounter capacity: at most 4 ships **(rec.)**. A capital ship is one ship with up to 16 crew slots.
2. Can rival crews see each other's interiors without a lock-on? Default: no **(rec.)**.
3. Concurrent encounters (crews in different systems at the same time) are out of scope. One encounter at a time per session **(rec.)**; separate sessions per crew wait for the "merging sims" moonshot.
4. Saves only at beats **(rec.)**.

## Change log

- 2026-11-15: written from the architecture panel and grill Q28 to Q31; waits for Net-3.
- 2026-11-15: refine round 1: R-3 migration proof; pre-refactor oracle with results, events and bindings plus an alias table; R-2 storage-only, with the full interior link split out as R-2b; the hashed player binding; projection format, fixed layout, header and hash; one visibility policy for every channel; canonical slot order, stable ids and random streams for N ships; the module-contract migration staged by milestone; the R-1 lifecycle and Net-3 mode adapter.
- 2026-11-15: refine round 2: R-2 is a proved schema migration, not byte-identical; migration comparisons exclude the version field and check old + 1; public exterior fields are an explicit allowlist for the privacy test.
- 2026-11-15: refine round 3: the projected space partition redacts AI controller rows of ships the recipient does not control; the allowlist and privacy test cover the space partition.
- 2026-11-15: refine round 4: missile pool slots carry an active flag, with all fields 0 when empty, in both the canonical and the projected layout.
- 2026-11-15: checked against Net-3 as merged (`a5b772f`):
  - §6: the merged `Authority` and `ModeHost` lifecycle and deps (checkpoint capture, bootstrap, session lease gate, injected pause); `EncounterRules` gains the hooks the core uses today; the mode command codec feeds the ledger; reason enum, `admission` and `runId` notes; a duel snapshot codec as an R-1 deliverable; R-1 is "over Net-3" at the `hostRuntime` level only.
  - §10: corrected the sender model (already one encoder per connection), image metadata and acceptance, `emit` filtering, checkpoints and re-host in PvP as an open R-6 problem, the seat, zero-body and bot facts, and history segments.
  - R-0 bumps SIM to 37; risk 0 covers version skew.
- 2026-11-15: PvP is out of scope for now (owner). R-6 and the projection and visibility design are deferred and kept as notes; co-op multi-ship stays in scope.
- 2026-11-15: refine (Net-3 corrections) round 1:
  - the synchronous `checkpoint()` in the mode lifecycle;
  - a `tick` hook, with the duel's interior and tactical ticks kept equal;
  - mode-tagged `EndRecord`;
  - `resolveLayout` kept as a dependency;
  - the duel snapshot header, field manifest, regeneration, validation, continuation proof and size test;
  - mode-aware replays;
  - the history ring moved to R-8 with bounds and a test;
  - risk 3 revised.
- 2026-11-15: refine (Net-3 corrections) round 2: `EndRecord` tagged on the wrapper, with a frozen `DuelEndSummary`; the duel telemetry accumulator saved as a checkpoint blob; `mapHash` in the header with its calculation and check; `resolveLayout` added to the rules signatures.
- 2026-11-15: refine (Net-3 corrections) round 3: `DuelEndSummary.terminal` keeps per-ship cause arrays; the continuation proof also compares end summaries.
- 2026-11-16: from the R-0/R-1 prototype: `terminal` takes the init; the rules gain `validateInit`, `initialControllers` and `cueBaseline`; `commandCodec` is the mode's whole message codec; the duel snapshot header adds `tick`, `playerCount` and `hash`; `repairsFinished` is per player.
