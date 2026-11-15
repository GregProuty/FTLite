# Engine Refactor: Layers for Outlaw Crew (design)

Status: written 2026-11-15 at the owner's request ("lets wait until the netcode is finished then we can start on the engine refactor, write a spec"). **Nothing in this spec is built until Codex's Net-3 is merged to master.** Choices marked **(rec.)** are Claude's, taken under the standing order; the owner can overturn any of them.

Sources:
- the architecture panel review (six reviewers, 2026-11-15: https://claude.ai/artifact/FWghLqRGR1X16ud5cHJWM6);
- the owner's answers to the grill, Q28 to Q31, in `docs/vision/thesis-grill.md`;
- the Outlaw Crew direction, `docs/superpowers/specs/2026-11-13-outlaw-crew-direction.md`;
- Net-3 as built on branch `codex/net-3`: `src/network/modes/` (`ModeDefinition`, `ModeHost`, registry) and `src/network/state/` (`StateImage`, delta sender).

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
- **Q28:** 16 players means one capital ship *or* several ships, *including PvP*.
- **Q29:** the gravity-well fight is *the* combat, and locking on to a target opens an FTL-style view of that ship.
- **Q30:** players can move between ships.

None of these fit one ship per run with crew indexed by seat.

## 2. Goals and non-goals

**Goals**
1. An encounter holds **N ships** (capital ship, convoy, PvP), each a full ship state with an interior, flown by a human crew, the hunter AI or a bot.
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
- **Session** and **Campaign** sit outside the hashed encounter (§7, §8).
- **Level of detail** **(rec.)**: every ship in the current encounter runs fully at 60 Hz. One tick of the Cutter costs about 4 to 7 µs idle (measured), so 4 ships are affordable. Everything else is a campaign record advanced per jump.

## 4. People and crew

- Each ShipState has a **crew table** of fixed capacity `CREW_SLOTS` per ship class. Its columns are:
  - `active`, `stableId`, `characterId`;
  - `controller` (a player id, a bot or an NPC);
  - position and life state, seat, carrying;
  - per-crew XP.
- The Session maps each player to `{ ship, crewSlot }`.
- A player owns a *body*, not an array index. Boarding or a transfer moves a crew row from one ship's table to another's, as one deterministic operation inside the encounter step. Its stable id is kept, so render memory and replays follow the character.
- `MAX_PLAYERS` stops being an array size inside ship state. Sixteen players is four ships of four, or one capital ship whose `CREW_SLOTS` is 16. The cap moves to the Session and the lobby.
- **bitECS is retired here** **(rec.)**. The sim has zero queries; bitECS is only used to allocate ids, which forces a shared global entity index and manual cell deletion. Crew become a typed-array table like debris and boarders already are. This change is not observable, and it is proved by the equivalence check (§9).

## 5. One combat model (Q29)

- **Space owns position and flight:** bodies, headings, gravity, contacts, missiles, arcs and line of sight.
- **Each ShipState owns its systems:** one systems record per ship holding room damage levels, power allocation, shield layers, weapon charge and hold, magazine and hull. The interior and the tactical layer both read and write that one record.
  - Today's `Ship.rooms`, `shields`, `laserCharge`, `magazine` and `hull` in `TacticalState` move into it. The tactical layer keeps only kinematics plus a ship index.
  - Interior repair and power then act on the same numbers the fight uses. That is the full interior link (Q11, Q27).
- **Arrays, not pairs.** About 31 two-ship assumptions in 16 files become arrays plus an explicit target index:
  - `ships: [Ship, Ship]`, `missiles: [m, m]`, `present: [b, b]`;
  - `j = 1 − i` in `weapons.ts`;
  - two-ship render models.

  Weapons fire at the ship's **locked target**, not at "the other ship". A missile pool replaces one missile per ship, with at most one in flight per ship **(rec.)**, as today.
- **Definitions, not constants.** `ShipClassDef` (hull, thrust, turn, radius, shields, power, slots, AI profile) and `WeaponDef` (laser, missile) replace the one-off constants in `sim/tactical/tuning.ts`. Today's numbers become the `cutter` and `hunter` entries, so the change is golden-neutral.
- **FTL lock-on view.** A seat that locks a target opens an FTL-style side view of the target's ShipState interior (rooms, damage, fires and crew). It is the old enemy window drawn from real state.
- **PvP visibility** **(rec.)**: a rival crew's interior is only visible through a lock-on, drawn from that crew's projection (§10). It shows room damage and systems, not the rival's random-number state.
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

**Generic authority.** `createAuthority` takes a rules object instead of importing the sector sim:

```ts
interface EncounterRules<State, Init> {
  create(init: Init): State;
  step(state: State, input: FrozenTickInput): CommandResult[];
  snapshot(state: State): Snapshot;  restore(snapshot: Snapshot): State;
  hash(state: State): string;
  validateCommand(state: State, envelope: CommandEnvelope): CommandReason | null;
  cues(prev: CueBaseline, state: State): Cue[];
}
```

The ledger, tick driver, journal, checkpoint cadence and publication stay as they are, with Net-3's input-tick window and delta sender. **This plugs into Net-3, it doesn't replace it:**
- Each `ModeDefinition` (`src/network/modes/contracts.ts`) wraps one `EncounterRules`, the way `modes/sector.ts` wraps the sector authority today.
- The duel becomes a second registered mode (`duel`). Later encounter kinds (port, boarding, a convoy) are further rule sets on the same core.

**Commands.**
- One namespaced command union: each module owns its kinds.
- One `CommandResult` type for everything. The duel's `DuelResult` and `DuelReason` merge into it.
- Reasons are the shared base list plus the reasons each module declares.
- Every command carries the target `ship` where it applies. Direction amendment 8 already allows this addition.

## 7. Hashing and the goldens

- **Completeness is enforced.** A test requires every field of every module's state to be either canonical or on that module's declared not-snapshotted list. A first version of this test for today's `SimState` is on branch `hash-completeness`, unmerged and waiting for Net-3. It merges as the first step of R-0.
- **Telemetry and render notices leave the hash.** Today, about 40 telemetry counters and several renderer notices (`weapons.lastShot*`, `loot*`, `run.boughtTick/Kind`) are hashed state, so every new metric or UI cue is a sim-version event. They move to per-tick events, which the duel already uses, plus a Session-side telemetry record that is checkpointed but not hashed. Late joiners get a short ring buffer of recent events.
- **The version stays in the hash** **(rec.; the skeptic dissented)**, together with the existing guarded version-only re-bless.
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

**Proving the sector run is unchanged.** Field moves change the sector hash, so the version-only re-bless cannot prove equivalence. Instead:
1. Before the move, record a per-tick trace of named canonical values (field name → value) over the golden replay and every determinism-v2 schedule.
2. After the move, record the same trace through a field-name map from old names to new ones.
3. The refactor merges only if every mapped value is equal at every tick.

## 10. Networking integration (after Net-3)

- **Partitions in the state image.** An encounter's `StateImage` (`src/network/state/imageCodec.ts`) carries the encounter as ordered partitions: `space`, then `ship:<k>` for each ship, then `director`. Each partition has its own offset, which the image metadata records. Deltas keep working because the image length is fixed by capacities, not occupancy.
- **Per-crew projections for PvP (Q28)** **(rec.)**:
  - A connection receives the full partitions of its own crew's ship, the full `space`, and for every other ship an **exterior summary**: hull, shield layers, room damage levels, kinematics.
  - A lock-on adds that target's interior partition, without its random-number state.
  - Co-op crews on one capital ship share one projection. The sender already encodes once per distinct image, so a projection costs one encode per crew, not per player.
  - This changes Net-3's sender from "one image to all connections" to "one image per projection".
- **Seats belong to players, not crew slots.** The seat token and "rejoin your own seat" map to a player id. The Session maps the player to a crew row.
- **Connections with no crew body stay legal:** spectators, passengers (panel wild card). **Bots** may attach as their own connection.
- **A bounded history ring:** the authority keeps its rotated 5-second segments (checkpoint plus frames) in a small ring instead of dropping them. That gives a flight recorder, kill-cams and bug reports (panel wild card).

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
| R-0 | **Guards** | Merge `hash-completeness`. One bless command for every pinned artifact; retire `net1a-baseline` to `--baseline` | the completeness test fails on an added field; bless regenerates everything |
| R-1 | **Generic authority** (was H-0c-ii-b) | `EncounterRules` + `createAuthority` over it; sector rules wrap today's step; the duel as a registered Net-3 mode; one command union and result type; the bounded history ring | sector goldens unchanged; the duel runs behind the authority over loopback and Net-3 |
| R-2 | **N-ship space + systems record** | arrays and target index; one systems record per ship shared with the interior; `ShipClassDef`/`WeaponDef` | the duel's gates and golden are unchanged by the refactor (same numbers, same outcomes) |
| R-3 | **Telemetry and notices out of the hash** | per-tick events; Session telemetry record | gates read the same numbers; the version-only re-bless passes |
| R-4 | **ShipState extraction + crew table** | systems take ShipState; legacy SimState wraps one ship; crew table with controllers; bitECS retired | the named-field equivalence check of §9 over all goldens and schedules |
| R-5 | **Encounter with ships[]** | an encounter holding 2 to 4 ShipStates; the hunter's ship becomes a real ShipState; boarding moves crew rows; FTL lock-on view | a duel against a full enemy interior; a scripted boarding test |
| R-6 | **Projections** | per-crew state images over Net-3; exterior summaries; lock-on adds a target's interior | a rival crew's client never receives the other crew's interior or random-number state (test) |
| R-7 | **Campaign + save** | Campaign layer, deed log, save format with `saveVersion` and migrations | a save written before a code change loads after it |
| R-8 | **Content seams** (light) | string ids, `contentRefs` test, station registry, scenario launcher, tuning overrides | adding a console kind touches the registry plus its own files |

R-1 and R-2 come first, because the networked duel (H-2) and the owner's playtest wait on them. R-3 to R-8 follow in order of the game milestones that need them:
- R-3 before MG-1a;
- R-4 and R-5 before CB-1;
- R-6 before PvP;
- R-7 before OW-0;
- R-8 alongside MG-1b and EV-0.

## 13. Risks

1. **The refactor eats the time meant for "is it fun?"** Mitigation: R-1 and R-2 are the only steps before H-2, and the owner's playtest gates everything after them. The other steps land just in time for the milestones that need them.
2. **Equivalence is proved by a mapping that can itself be wrong.** Mitigation: the map is generated from the module field declarations, not written by hand. Every old canonical field must map to exactly one new field, or be named as dropped (telemetry), with a reason.
3. **Net-3's projections (R-6) grow the sender.** Mitigation: projections are images like any other; the delta sender, the payload limits and the full fallback are reused. Only "which image goes to which connection" is new.
4. **N ships multiply the step cost.** Mitigation: at about 4 to 7 µs per ship per tick at idle, 4 ships stay under 0.1 ms. Step cost under combat load is measured before R-5 merges.

## 14. Open questions (defaults taken meanwhile)

1. Encounter capacity: at most 4 ships **(rec.)**. A capital ship is one ship with up to 16 crew slots.
2. Can rival crews see each other's interiors without a lock-on? Default: no **(rec.)**.
3. Concurrent encounters (crews in different systems at the same time) are out of scope. One encounter at a time per session **(rec.)**; separate sessions per crew wait for the "merging sims" moonshot.
4. Saves only at beats **(rec.)**.

## Change log

- 2026-11-15: written from the architecture panel and grill Q28 to Q31; waits for Net-3.
