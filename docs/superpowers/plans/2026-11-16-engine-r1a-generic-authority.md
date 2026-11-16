# Engine Refactor R-1a: The Generic Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The authority stops importing the sector sim. `createEncounterAuthority(rules, deps)` runs any encounter through an `EncounterRules` object with the merged `Authority` surface and deps; the sector rules wrap today's step, snapshot, hash, cues, callouts, safe points and end record; `defineEncounterMode` builds a Net-3 `ModeDefinition` from rules, codecs, producers and a stream adapter, and `modes/sector.ts` becomes one call to it. The ledger validates with the mode's command codec; there is one command union, one `CommandResult` type and one closed reason enum (the duel's reasons join it, its envelope gains `runId`); the `ended` event carries a mode-tagged `EndRecord`; replays record their mode, absent meaning sector. **The sector is unchanged at every tick:** the goldens and the determinism fixture are not re-blessed, the existing sector replay tests pass unedited, the per-tick canonical trace is identical, and Net-3's host gate passes.

**Architecture:**
- `authority/rules.ts` (new): `EncounterTypes`, `EncounterRules<T>`, `ResolveLayout`, `FrozenTickInput`, `CheckpointOf<T>`.
- `authority/sectorRules.ts` (new): `sectorRules` and `SectorTypes`, each hook exactly the call `core.ts` made before.
- `authority/core.ts`: `createEncounterCore(rules, deps, state, restored?, external?)`; `createAuthorityCore` is its sector instance. `authority/authority.ts`: `createEncounterAuthority`; `createAuthority` is its sector instance.
- `authority/replay.ts`: `parseEncounterReplay`, `runEncounterReplay`, `replayMode`; `parseReplay` and `runReplay` are the sector instances. `sim/replay.ts`: replays are generic and carry an optional `mode`.
- `net/codec.ts`: a per-mode message codec (`CommandCodec`, `MessageCodec`, `sectorCodec`); `createMessageCodec`, `encodeMessage` and `decodeMessage` are the sector codec, byte for byte. `authority/ledger.ts` takes the codec.
- `net/contracts.ts`: `Command = SectorCommand | DuelCommand`, `CommandEnvelope<C>`, the duel reasons in `COMMAND_REASONS`, `EndRecord`, and `Checkpoint`, `PublishedState` and `AuthorityMessage` generic with sector defaults.
- `sim/duel/commands.ts`: the duel's types become aliases of the shared ones; `LOCAL_DUEL_RUN`.
- `network/modes/encounterMode.ts` (new): `defineEncounterMode`, `jsonModeCodecs`; `network/modes/sector.ts` is one call to it.

**No online duel and no duel mode here** (that is R-1b); nothing in `main/` or the renderer's online code changes apart from `app/session.ts` reading the tagged end record.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37 (the host-runtime gate and the cross-engine determinism check). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6 (modules and the generic authority: `EncounterRules`, lifecycle and the adapter to Net-3's modes, commands) and the R-1 row of §12. Follows `2026-11-16-engine-r0-guards.md`.

## Scope

- **Task 1:** the generic authority: rules, sector rules, the generic core and authority, the mode codec in the ledger, mode-aware replays, the tagged end record.
- **Task 2:** one command union and result type: the duel's commands, envelope `runId`, results and reasons join the shared ones.
- **Task 3:** `defineEncounterMode`; the sector mode as one call; the refactor's gates (canonical trace, host runtime, cross-engine determinism, full suite).
- **Not here (R-1b):** the duel's rules, snapshot codec, checkpoint, end summary, stream adapter and registration in `authorityHost.ts`. **Not in R-1 at all:** the history ring (R-8) and the online duel UI (H-2).

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`) scans `sim/`, `authority/`, `net/`, `clientControl/`, `headless/`, `events/` and `src/shared/`: only `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul` and `sqrt`; no platform globals; randomness only through `src/shared/rng.ts`. Files under `sim/` import nothing from `authority/`, `clientControl/`, `app/` or `render/`.
- The network boundary (`tests/networkBoundary.test.ts`): a file under `src/network/` may import renderer code only if it is a mode file; `modes/encounterMode.ts` joins the sector files on that list.
- **The sector must not change.** No step of this plan writes `tests/golden/*` or `tests/fixtures/*`, and the existing replay, golden, determinism, ledger, authority and Net-3 tests run unedited, except `tests/netCodec.test.ts` and `tests/sectorStream.test.ts`, whose `ended` events gain the end record's mode tag (spec §6).
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean`: the owner and other sessions keep uncommitted work in this checkout (today, netcode files under `src/main/network/`, `src/renderer/src/main.ts` and `tests/online*.test.ts`), and this plan touches none of those files. Every check that writes evidence writes it under the git-ignored `out/`.
- **Commands need no shell features.** Every `Run:` line works as written in Windows PowerShell 5.1 and in Git Bash.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (it reads the built `out/`; build first). Typecheck is `npm run typecheck`.
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load; rerun one alone. `tests/onlineAppRuntime.test.ts` ("bounds an unresolved actual observer-build") fails in a git worktree outside the main checkout, on pristine master too; it passes in the main checkout.
- Every R-1 edit changes the content digest (it covers `authority/`, `network/modes/`, `net/contracts.ts`, `net/codec.ts`), so rooms made by earlier builds do not admit this one (spec risk 0). The goldens re-stamp the digest and are unaffected.
- Line endings: write files with LF.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **The split** **(rec.)**: R-1 is two plans, each independently mergeable with the full suite green: R-1a (this plan: the generic layer, the sector on it, no new behaviour) and R-1b (the duel as a second registered mode). R-1a proves the sector unchanged before any duel code depends on the generic core.
2. **Hooks the spec's list needed** (found by the prototype): `EncounterRules` also has `modeId` (replays of a non-sector mode record it), `validateInit(value, contentDigest, resolveLayout)` (`start` validated the sector init and its version, digest and layout itself), `initialControllers()` (the producer memory before any producer runs; the sector's `[]`), `cueBaseline(state)` (what `cues(prev, state)` compares against after each tick) and an optional `memory(state)` (mode memory saved in the checkpoint as `modeMemory`, outside the hash; the duel's telemetry in R-1b, absent for the sector, so sector checkpoints are unchanged). `restore` takes that memory as a third argument.
3. **`terminal(state, init)`** (a spec correction): the sector's end record is `telemetryRecord(state, seed)`, and the sector state does not hold its seed, so `terminal` receives the init as well. It returns `{ ended, endRecord }` and builds the record only when ended.
4. **The type family** **(rec.)**: one parameter, `EncounterTypes { state, init, controllers, snapshot, cueBaseline }`, carries a mode's types through the core, the authority and replays. `Checkpoint`, `PublishedState`, `AuthorityMessage`, `Replay`, `AttachOptions`, `CrashRecord` and `Authority` are generic with the sector's types as defaults, so every existing caller compiles unchanged.
5. **The command codec is the mode's whole message codec** (a spec refinement): the ledger validates envelopes and cached results with it, and the core also decodes ingress and encodes publications with it, whose snapshot header is mode-specific. `CommandCodec` is `(playerLimit?) => MessageCodec`; a mode contributes its command kinds and its snapshot header (`ModeWire`). The sector's codec builds exactly today's schemas, so its bytes are unchanged; an envelope the mode's codec rejects is `malformed`, as today.
6. **One command union** **(rec.)**: kinds stay as they are on the wire (no prefixes); "namespaced" means owned, and each mode's codec admits only its own kinds. `DuelCommand` includes `setPaused`, the core's control, which the duel codec admits in R-1b. `COMMAND_REASONS` gains `not-in-duel`, `not-at-weapons` and `missile-in-flight` at the end, so the sector's accepted reasons are a subset as before. `DuelResult`, `DuelReason` and `DuelEnvelope` become aliases of `CommandResult`, `CommandReason` and `CommandEnvelope<DuelCommand>`; the duel step's `already-processed` filter is gone (the step never produced one). An offline duel stamps `LOCAL_DUEL_RUN` (`'duel'`), the value the step's sector shim used before.
7. **The tagged end record lands here** **(rec.)**: the generic core emits whatever `terminal` returns, so `EndRecord` is introduced with the sector variant only (`{ mode: 'sector', record }`); R-1b adds the duel variant. `app/session.ts` reads `record.record`.
8. **The sector core keeps its layout** (found by the prototype): `createAuthorityCore` validated checkpoints against the live state's layout, whatever `resolveLayout` its callers passed (some pass one fixed layout), so its wrapper passes `() => state.layout` to the generic core.
9. **Replays** (spec §6): `replayMode(value)` is the `mode` field, or `'sector'` when absent; `parseEncounterReplay` refuses a replay whose mode is not the rules' (`replay mode does not match`). The core records `mode` only for a non-sector mode, so sector replays are byte-identical to before. R-1b adds the lookup that picks the rules by mode.
10. **Where the mode factory lives** **(rec.)**: `src/network/modes/encounterMode.ts`, on the network boundary's list of mode files (it composes the renderer-side authority). Its errors carry the mode id (`sector unavailable`, `invalid sector ownership`, `detach producers before replacing sector`, `sector payload exceeds limit`), so the sector's messages are unchanged. `jsonModeCodecs` is today's sector byte codec over any rules.
11. **The proof that the sector did not change** **(rec.)**: `canonical-trace.ts baseline` before Task 1 and `same` after Task 3 compare the canonical hash of every tick of the bless replay and all 19 determinism-v2 schedules (115,200 ticks); the goldens and the fixture are compared by the unedited tests and by `git status`; Net-3's `test:host-runtime` and the cross-engine `test:determinism` run at the end.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/authority/rules.ts` | **Create:** the `EncounterRules` contract and its types |
| `src/renderer/src/authority/sectorRules.ts` | **Create:** `sectorRules`, `SectorTypes` |
| `src/renderer/src/authority/core.ts` | **Replace:** `createEncounterCore`; `createAuthorityCore` its sector instance |
| `src/renderer/src/authority/authority.ts` | **Replace:** `createEncounterAuthority`, `EncounterAuthorityDeps`; `createAuthority` its sector instance |
| `src/renderer/src/authority/replay.ts` | **Replace:** `parseEncounterReplay`, `runEncounterReplay`, `replayMode` |
| `src/renderer/src/authority/ledger.ts` | **Replace:** `createLedger(owned, playerLimit, codec)` |
| `src/renderer/src/net/codec.ts` | **Replace:** `ModeWire`, `MessageCodec`, `CommandCodec`, `sectorCodec` |
| `src/renderer/src/net/contracts.ts` | **Replace:** the command union, reasons, `EndRecord`, generic envelopes |
| `src/renderer/src/sim/replay.ts` | **Replace:** generic replay types with an optional `mode` |
| `src/renderer/src/app/session.ts` | **Replace:** reads the tagged end record (one line) |
| `src/renderer/src/sim/duel/commands.ts`, `sim/duel/step.ts`, `sim/duel/scripted.ts`, `app/duel/runtime.ts` | **Replace:** the duel on the shared command, envelope and result types |
| `src/network/modes/encounterMode.ts` | **Create:** `defineEncounterMode`, `jsonModeCodecs`, `EncounterProducers`, `StreamBinding` |
| `src/network/modes/sector.ts` | **Replace:** one `defineEncounterMode` call |
| `tests/encounterAuthority.test.ts`, `tests/commandUnion.test.ts`, `tests/encounterMode.test.ts` | **Create:** the tests |
| `tests/netCodec.test.ts`, `tests/sectorStream.test.ts` | **Replace:** the `ended` events carry the mode tag (only change) |
| `tests/duel.test.ts`, `tests/duelControls.test.ts`, `tests/duelInterior.test.ts`, `tests/duelReadout.test.ts`, `tests/duelTelemetry.test.ts`, `tests/helpers/scriptedDuel.ts` | **Replace:** duel envelopes carry `runId` (only change) |
| `tests/networkBoundary.test.ts` | **Replace:** `modes/encounterMode.ts` is a mode file (only change) |

---

### Task 1: The generic authority

**Files:**
- Create: `src/renderer/src/authority/rules.ts`, `src/renderer/src/authority/sectorRules.ts`, `tests/encounterAuthority.test.ts`
- Modify (whole file): `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts`, `src/renderer/src/authority/ledger.ts`, `src/renderer/src/authority/core.ts`, `src/renderer/src/authority/authority.ts`, `src/renderer/src/authority/replay.ts`, `src/renderer/src/sim/replay.ts`, `src/renderer/src/app/session.ts`, `tests/netCodec.test.ts`, `tests/sectorStream.test.ts`

**Interfaces:**
- Consumes: `stepCommands`, `saveSnapshot`, `loadSnapshot`, `hashState`, `visitRef`, `calloutFor`, `audioCues`, `cueCounters`, `telemetryRecord`, `createSimState`, `assertSimStateLive`, `disposeSimState`, `validateRunInit`, `validateCheckpoint`.
- Produces:
  - `rules.ts`: `type ResolveLayout = (id: string) => ShipLayout`; `interface EncounterInit { runId; seed; playerCount; layoutId }`; `interface EncounterSnapshot { header: { tick; playerCount; simVersion; contentDigest }; values: number[] }`; `interface FrozenTickInput { held; commands }`; `interface Callout { text; station }`; `interface Terminal { ended; endRecord: EndRecord | null }`; `interface EncounterTypes { state; init; controllers; snapshot; cueBaseline }`; `type CheckpointOf<T>`; `interface EncounterRules<T>` with `modeId`, `validateInit`, `create`, `dispose`, `assertLive`, `playerCount`, `tick`, `step`, `terminal(state, init)`, `safePointKey`, `callouts`, `cueBaseline`, `cues`, `snapshot`, `restore(snapshot, resolveLayout, memory?)`, `hash`, `validateCheckpoint(value, contentDigest, resolveLayout)`, `commandCodec`, `initialControllers`, `memory?`.
  - `sectorRules.ts`: `interface SectorTypes`; `sectorRules: EncounterRules<SectorTypes>`.
  - `core.ts`: `createEncounterCore<T>(rules, deps, state, restored?, external?)`; `createAuthorityCore(deps, state, restored?, external?)` (unchanged signature); `CrashRecord<T = SectorTypes>`.
  - `authority.ts`: `interface EncounterAuthorityDeps<T>`; `type AuthorityDeps = EncounterAuthorityDeps<SectorTypes>`; `Authority<T = SectorTypes>`; `AttachOptions<S = Snapshot>`; `createEncounterAuthority<T>(rules, deps): Authority<T>`; `createAuthority(deps): Authority`.
  - `replay.ts`: `replayMode(value): string`; `parseEncounterReplay<T>(rules, value, contentDigest, resolveLayout)`; `runEncounterReplay<T>(rules, value, contentDigest, resolveLayout, observe?, options?)`.
  - `codec.ts`: `interface MessageCodec<S>`; `type CommandCodec<S> = (playerLimit?: number) => MessageCodec<S>`; `sectorCodec`.
  - `contracts.ts`: `SectorCommand`, `DuelCommand`, `Command`, `CommandEnvelope<C>`, `COMMAND_REASONS` (plus the three duel reasons), `EndRecord`, `Checkpoint<Init, CM, S>` (with optional `modeMemory`), `PublishedState<S>`, `AuthorityMessage<S>`.
  - `ledger.ts`: `createLedger(owned, playerLimit = MAX_PLAYERS, codec: CommandCodec<unknown> = sectorCodec)`.

- [ ] **Step 1: Record the per-tick canonical trace before anything changes**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs` and the trace file's path, exit 0.

- [ ] **Step 2: Write the failing test**

Create `tests/encounterAuthority.test.ts`:

```ts
// The generic authority (engine refactor spec §6, R-1a): createAuthority is createEncounterAuthority over the sector
// rules, the sector rules wrap today's hooks, and replays name their mode, absent meaning sector.
import { describe, expect, it } from 'vitest';
import { createAuthority, createEncounterAuthority } from '../src/renderer/src/authority/authority';
import { parseEncounterReplay, parseReplay, replayMode, runEncounterReplay } from '../src/renderer/src/authority/replay';
import { sectorRules } from '../src/renderer/src/authority/sectorRules';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { hashState } from '../src/renderer/src/sim/hash';
import { visitRef } from '../src/renderer/src/sim/commands';
import { LAYOUT, makeState } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { scriptedSemanticReplay } from './helpers/script';

const init = () => ({ runId: 'generic', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 11, playerCount: 2, characters: [0, 0], unlocked: [] });
function deps() {
  let now = 0; const callbacks = new Set<() => void>();
  return { now: (t: number) => { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    value: { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, onCrash(r: { error: string }) { throw Error(r.error); },
      scheduler: { schedule: (_: number, cb: () => void) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } } } };
}

describe('the generic authority', () => {
  it('createAuthority is createEncounterAuthority over the sector rules: identical checkpoints after 300 ticks', () => {
    const a = deps(), b = deps();
    const sector = createAuthority(a.value), generic = createEncounterAuthority(sectorRules, b.value);
    ownTestCleanup(() => { sector.dispose(); generic.dispose(); });
    sector.start(init()); generic.start(init());
    for (let k = 1; k <= 300; k++) { a.now(k * 1000 / 60 + 0.01); b.now(k * 1000 / 60 + 0.01); }
    expect(generic.checkpoint([])).toEqual(sector.checkpoint([]));
    expect(sector.checkpoint([]).snapshot.header.tick).toBe(300);
    expect(sector.checkpoint([])).not.toHaveProperty('modeMemory');
  });
  it('the sector rules are today\'s hooks: tick, players, hash, safe point, callouts, end record', () => {
    const s = makeState(2);
    expect(sectorRules.tick(s)).toBe(s.tick);
    expect(sectorRules.playerCount(s)).toBe(2);
    expect(sectorRules.hash(s)).toBe(hashState(s));
    expect(sectorRules.safePointKey(s)).toBe(JSON.stringify(visitRef(s)));
    expect(sectorRules.callouts(s, 0)).toEqual({ text: expect.any(String), station: null });
    expect(sectorRules.terminal(s, init())).toEqual({ ended: false, endRecord: null });
    s.ended = 1;
    expect(sectorRules.terminal(s, { ...init(), seed: 5 })).toEqual({ ended: true, endRecord: { mode: 'sector', record: telemetryRecord(s, 5) } });
    expect(sectorRules.initialControllers()).toEqual([]);
  });
  it('replays name their mode: absent is sector, so recorded V2 files parse unchanged; another mode is refused', () => {
    const replay = scriptedSemanticReplay(1, 1, 5);
    expect(replay).not.toHaveProperty('mode');
    expect(replayMode(replay)).toBe('sector');
    expect(parseReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__)).not.toHaveProperty('mode');
    expect(parseEncounterReplay(sectorRules, { ...replay, mode: 'sector' }, __GAMEPLAY_CONTENT_DIGEST__, () => LAYOUT).mode).toBe('sector');
    expect(() => parseReplay(LAYOUT, { ...replay, mode: 'duel' }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow(/replay mode does not match/);
    expect(() => parseReplay(LAYOUT, { ...replay, mode: 7 }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow(/replay mode does not match/);
    expect(runEncounterReplay(sectorRules, replay, __GAMEPLAY_CONTENT_DIGEST__, () => LAYOUT).hashes).toHaveLength(5);
  });
});
```

Run: `npx vitest run tests/encounterAuthority.test.ts`
Expected: FAIL: the file does not load (`createEncounterAuthority` and `../src/renderer/src/authority/sectorRules` do not exist yet).

- [ ] **Step 3: The contracts, the mode codec and the ledger**

Replace the whole of `src/renderer/src/net/contracts.ts` with:

```ts
import type { Snapshot } from '../sim/snapshot';
import type { TelemetryRecord } from '../sim/telemetry';

export type PeerId = string;
export type RunId = string;
export type PlayerId = number; // bounded by the configured player limit, never an ECS entity ID
export type StationId = number;
export type ChannelKind = 'reliable-ordered' | 'unreliable-latest';
export type Unsubscribe = () => void;
export interface TransportCaps { unreliable: boolean; maxDatagram: number; hidesPeerIp: boolean; p2p: boolean }
export interface LinkStats { rttMs: number; lossPct: number; relayed: boolean; bufferedBytes: number }
export interface Link {
  readonly peer: PeerId;
  readonly caps: TransportCaps;
  send(kind: ChannelKind, bytes: Uint8Array): void;
  onMessage(cb: (kind: ChannelKind, bytes: Uint8Array) => void): Unsubscribe;
  onClose(cb: (reason: string) => void): Unsubscribe;
  stats(): LinkStats;
  close(reason: string): void;
}
export interface HostOpts { protocolVersion: number; contentDigest: string }
export interface Compatibility extends HostOpts { simVersion: number }
export interface Session {
  readonly links: readonly Link[];
  host(opts: HostOpts): Promise<{ joinCode: string }>;
  join(code: string, seatToken?: string): Promise<void>;
  onLink(cb: (link: Link) => void): Unsubscribe;
  onLinkLost(cb: (peer: PeerId) => void): Unsubscribe;
  close(reason: string): void;
}
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean }
export interface HeldFrame { runId: RunId; player: PlayerId; tick: number; sequence: number; held: HeldInput }
export interface LifecyclePause { paused: boolean; reason: string }
export interface CommandId { player: PlayerId; sequence: number }
export type TargetRef = { kind: 'object'; stableId: number } | { kind: 'enemy'; stableId: number; room: number };
export interface VisitRef { sector: number; beacon: number; arrivalTick: number }
export interface EventRef { visit: VisitRef; eventId: number }
export interface JumpRef { visit: VisitRef; requestedAtTick: number; destination: number }
export interface WeaponRef { selector: number; expectedWeaponId: number }
/** The sector's commands. `sit` and `stand` are shared with the duel. */
export type SectorCommand =
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
/** The duel's commands (Helm demo spec §13). Each mode's codec admits only its own kinds (net/codec.ts). */
export type DuelCommand =
  | { kind: 'sit'; station: StationId }
  | { kind: 'stand' }
  | { kind: 'presence'; present: boolean }
  | { kind: 'laserLock'; room: number }
  | { kind: 'laserCharge'; held: boolean }
  | { kind: 'missileLaunch' }
  | { kind: 'setPaused'; paused: boolean };
/** The one command union (engine refactor spec §6): every mode's kinds; `setPaused` is the core's control. */
export type Command = SectorCommand | DuelCommand;
export interface CommandEnvelope<C extends Command = Command> { runId: RunId; id: CommandId; requestedTick: number; command: C }
/** The shared base reasons, then the duel's (spec §6: the enum is closed, so every module's reasons join it). */
export const COMMAND_REASONS = [
  'wrong-run', 'unowned', 'malformed', 'expected-sequence', 'stale-tick', 'over-capacity',
  'invalid-seat', 'stale-target', 'unavailable', 'unsupported', 'conflicting-duplicate',
  'not-in-duel', 'not-at-weapons', 'missile-in-flight'
] as const;
export type CommandReason = typeof COMMAND_REASONS[number];
/** The one result type for every mode. `already-processed` comes only from the ledger; `admission` is wire-only
 *  receive-time metadata (commandOutbox.ts) and never enters the ledger's result cache. */
export interface CommandResult {
  id: CommandId; tick: number; status: 'applied' | 'noop' | 'rejected' | 'already-processed'; reason?: CommandReason;
  admission?: { expectedSequence: number; disposition: 'terminal' | 'retryable' };
}
export type Admission = { status: 'queued' } | { status: 'duplicate' | 'rejected'; result: CommandResult };
export type ClientAuxMessage = { kind: 'callout'; runId: RunId; player: PlayerId; sequence: number; calloutKind: 'contextual' };
// Data-only event cue names shared with pure derivation.
export type Cue = 'alarm' | 'impact' | 'shot' | 'hit' | 'ready' | 'jump' | 'upgrade' | 'victory' | 'defeat' | 'callout';
/** The authority's end record, tagged on the wrapper by mode (spec §6). The sector record is unchanged. */
export type EndRecord = { mode: 'sector'; record: TelemetryRecord };
export interface AuthorityEvent {
  runId: RunId; eventSequence: number; tick: number;
  payload:
    | { kind: 'cue'; cue: Cue }
    | { kind: 'callout'; player: PlayerId; text: string; station: number | null }
    | { kind: 'pause'; paused: boolean; owner: PlayerId | null; reason: string }
    | { kind: 'ended'; record: EndRecord };
}
export interface PublishedState<S = Snapshot> {
  runId: RunId; tick: number; publicationSequence: number; snapshot: S; hash: string;
  phase: 'running' | 'paused' | 'ended' | 'error'; pauseOwner: PlayerId | null; controlRevision: number;
  pauseReason: string | null; lagTicks: number; tickTimeMs: number | null;
  // Highest admitted per-player IDs; zero means no input in that stream yet.
  commandHighWater: readonly number[]; heldHighWater: readonly number[]; auxiliaryHighWater: readonly number[]; eventSequence: number;
}
export type ClientMessage = { kind: 'held'; frame: HeldFrame } | { kind: 'command'; envelope: CommandEnvelope } | ClientAuxMessage;
export type AuthorityMessage<S = Snapshot> =
  | { kind: 'state'; state: PublishedState<S> }
  | { kind: 'result'; runId: RunId; result: CommandResult }
  | { kind: 'event'; event: AuthorityEvent };
export interface RunInit {
  runId: RunId; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number;
  playerCount: number; characters: readonly number[]; unlocked: readonly string[]; quirk?: number;
}
export interface MonotonicClock { nowMs(): number }
export interface Scheduler { schedule(delayMs: number, cb: () => void): Unsubscribe }

/** Durable authority envelope; no auxiliary request or presentation history. Generic over the mode's init, producer
 *  memory and snapshot; the defaults are the sector's. `modeMemory` is present only for a mode that keeps memory
 *  outside the hash (the duel's telemetry), so a sector checkpoint is unchanged. */
export interface Checkpoint<Init = RunInit, CM = import('../clientControl/cardController').CardUiState[], S = Snapshot> {
  checkpointVersion: 2; init: Init; snapshot: S;
  commandHighWater: number[];
  recentResults: { envelope: CommandEnvelope; result: CommandResult }[];
  admissionTick: number; admissionCounts: number[];
  eventSequence: number; publicationSequence: number; controlRevision: number;
  receiveOrder: number; lifecycleOrdinal: number;
  botControllers: CM; paused: boolean;
  phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null;
  heldHighWater: number[]; held: HeldInput[];
  modeMemory?: unknown;
}
```

Replace the whole of `src/renderer/src/net/codec.ts` with:

```ts
import { MAX_PLAYERS } from '../../../shared/intent';
import { z } from 'zod';
import { COMMAND_REASONS } from './contracts';
import type { AuthorityMessage, ClientMessage, PublishedState } from './contracts';
import type { Snapshot } from '../sim/snapshot';

// Bounds are wire resource limits. Layout/catalog membership remains execution validation.
export const MAX_MESSAGE_BYTES = 65_536;
export const MAX_INDEX = 65_535;
// Validate homogeneous numeric storage in one bounded pass instead of allocating a
// Zod effects context for every scalar. Both endpoints still validate every value.
const finiteValues = z.custom<number[]>((value) => {
  if (!Array.isArray(value) || value.length > MAX_MESSAGE_BYTES) return false;
  for (const n of value) if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  return true;
}, 'invalid snapshot values')
  .transform((values) => values.map((n) => n === 0 ? 0 : n));
/** The wire primitives every mode's command and snapshot-header schemas are built from. */
function primitives(playerLimit: number) {
  return {
    uint: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    positive: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    index: z.number().int().min(0).max(MAX_INDEX),
    player: z.number().int().min(0).max(playerLimit - 1),
    text: z.string().min(1).max(128),
    u32: z.number().int().min(0).max(4_294_967_295),
    playerCount: z.number().int().min(1).max(playerLimit)
  };
}
type Primitives = ReturnType<typeof primitives>;
type CommandOption = z.ZodDiscriminatedUnionOption<'kind'>;
/** What one mode adds to the shared message schema: its command kinds and its snapshot header. */
interface ModeWire { commands(p: Primitives): [CommandOption, ...CommandOption[]]; snapshotHeader(p: Primitives): z.ZodTypeAny }
const sectorWire: ModeWire = {
  commands({ uint, positive, index }) {
    const visit = z.object({ sector: index, beacon: index, arrivalTick: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER) }).strict();
    const target = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('object'), stableId: positive }).strict(),
      z.object({ kind: z.literal('enemy'), stableId: positive, room: index }).strict()
    ]);
    const weapon = z.object({ selector: index, expectedWeaponId: index }).strict();
    const eventRef = z.object({ visit, eventId: index }).strict();
    const jump = z.object({ visit, requestedAtTick: uint, destination: index }).strict();
    return [
      z.object({ kind: z.literal('moveTo'), tile: index }).strict(),
      z.object({ kind: z.literal('sit'), station: index }).strict(),
      z.object({ kind: z.literal('stand') }).strict(),
      z.object({ kind: z.literal('toggleDoorLocal'), edge: index }).strict(),
      z.object({ kind: z.literal('doorCycle'), station: index, edge: index, mode: z.enum(['cycle', 'seal']) }).strict(),
      z.object({ kind: z.literal('airlockToggle'), station: index, airlock: index }).strict(),
      z.object({ kind: z.literal('power'), station: index, target: index, delta: z.union([z.literal(-1), z.literal(1)]) }).strict(),
      z.object({ kind: z.literal('coolant'), station: index, target: index }).strict(),
      z.object({ kind: z.literal('buyUpgrade'), station: index, system: index, expectedLevel: index }).strict(),
      z.object({ kind: z.literal('buyReactor'), station: index, expectedBonus: index }).strict(),
      z.object({ kind: z.literal('selectWeapon'), station: index, weapon }).strict(),
      z.object({ kind: z.literal('selectTarget'), station: index, target: target.nullable() }).strict(),
      z.object({ kind: z.literal('fire'), station: index, weapon, target }).strict(),
      z.object({ kind: z.literal('swapCargo'), station: index, slot: index, expectedCargo: index, expectedEquipped: index }).strict(),
      z.object({ kind: z.literal('scan'), station: index, target }).strict(),
      z.object({ kind: z.literal('systemScan'), station: index, visit }).strict(),
      z.object({ kind: z.literal('lockFrequency'), station: index, enemyId: positive }).strict(),
      z.object({ kind: z.literal('vote'), event: eventRef, choice: index }).strict(),
      z.object({ kind: z.literal('jumpAgree'), pending: jump }).strict(),
      z.object({ kind: z.literal('buy'), station: index, visit, item: index, expectedOffer: index }).strict(),
      z.object({ kind: z.literal('jump'), station: index, visit, destination: index }).strict(),
      z.object({ kind: z.literal('sectorJump'), station: index, visit }).strict(),
      z.object({ kind: z.literal('wait'), station: index, visit }).strict(),
      z.object({ kind: z.literal('evade'), station: index }).strict(),
      z.object({ kind: z.literal('tab'), group: index, station: index }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
    ];
  },
  snapshotHeader({ uint, positive, text, u32, playerCount }) {
    return z.object({
      formatVersion: positive, simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint,
      rngStates: z.object({ hazards: u32, director: u32, combat: u32, loot: u32, cosmetic: u32, map: u32, quirk: u32 }).strict(),
      layoutId: text, layoutHash: text, playerCount, manifest: z.array(text).min(1).max(128)
    }).strict();
  }
};
function messageSchemaFor(playerLimit: number, wire: ModeWire = sectorWire) {
const prims = primitives(playerLimit);
const { uint, positive, index, player, text, u32 } = prims;
const axis = z.number().finite().min(-1).max(1).transform((n) => n === 0 ? 0 : n);
const id = z.object({ player, sequence: positive }).strict();
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean() }).strict();
const frame = z.object({ runId: text, player, tick: uint, sequence: positive, held }).strict();
const commandSchema = z.discriminatedUnion('kind', wire.commands(prims));
const envelope = z.object({ runId: text, id, requestedTick: uint, command: commandSchema }).strict();
const result = z.object({ id, tick: uint, status: z.enum(['applied', 'noop', 'rejected', 'already-processed']), reason: z.enum(COMMAND_REASONS).optional(),
  admission: z.object({ expectedSequence: positive, disposition: z.enum(['terminal', 'retryable']) }).strict().optional()
}).strict();
const snapshot = z.object({ header: wire.snapshotHeader(prims), values: finiteValues }).strict();
const stringList = z.array(text).max(128);
const seconds = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const recordMap = z.record(text, seconds).refine((r) => Object.keys(r).length <= 128, 'too many entries');
const lifeEvent = z.object({ who: text, seconds }).strict().nullable();
const telemetry = z.object({
  version: z.literal(1), simVersion: positive, seed: u32, playerCount: z.number().int().min(1).max(playerLimit), characters: z.array(text).min(1).max(playerLimit),
  endReason: z.enum(['hull', 'crew', 'victory', 'running']), durationSeconds: seconds, firstDown: lifeEvent, firstDeath: lifeEvent,
  stationsNeverManned: stringList, mannedSeconds: recordMap, longestIdleSeconds: z.array(seconds).max(playerLimit),
  spawns: z.object({ fire: uint, breach: uint, power: uint, debris: uint }).strict(),
  impacts: uint, evadeRolls: uint, evasions: uint, shots: uint, hits: uint,
  repairs: z.object({ fire: uint, breach: uint, power: uint }).strict(), maxStress: seconds,
  phaseEntries: z.object({ buildUp: uint, sustainPeak: uint, peakFade: uint, relax: uint }).strict(),
  enemy: z.object({ met: uint, destroyed: uint, disables: uint, fled: uint, surrenders: uint, shieldHits: uint }).strict(),
  boarders: z.object({ parties: uint, killed: uint, vented: uint }).strict(),
  run: z.object({ nodesReached: uint, jumps: uint, columns: uint, scrap: z.object({ earned: uint, spent: uint }).strict(),
    events: uint, purchases: uint, upgrades: z.record(text, index).refine((r) => Object.keys(r).length <= 128, 'too many upgrades'),
    reactorBonus: index, quirk: text, unlocks: stringList }).strict(),
  teamwork: z.object({ lockedShots: uint, teamSeconds: seconds, revives: uint, timedEvades: uint, votesUnanimous: uint, votesSplit: uint }).strict(),
  score: seconds, skills: z.array(z.array(index).max(128)).max(playerLimit)
}).strict();
const payload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cue'), cue: z.enum(['alarm', 'impact', 'shot', 'hit', 'ready', 'jump', 'upgrade', 'victory', 'defeat', 'callout']) }).strict(),
  z.object({ kind: z.literal('callout'), player, text: z.string().min(1).max(256), station: index.nullable() }).strict(),
  z.object({ kind: z.literal('pause'), paused: z.boolean(), owner: player.nullable(), reason: text }).strict(),
  z.object({ kind: z.literal('ended'), record: z.discriminatedUnion('mode', [z.object({ mode: z.literal('sector'), record: telemetry }).strict()]) }).strict()
]);
const state = z.object({
  runId: text, tick: uint, publicationSequence: positive, snapshot, hash: text, phase: z.enum(['running', 'paused', 'ended', 'error']),
  pauseOwner: player.nullable(), controlRevision: uint, pauseReason: text.nullable(), lagTicks: uint, tickTimeMs: seconds.nullable(),
  commandHighWater: z.array(uint).min(1).max(playerLimit), heldHighWater: z.array(uint).min(1).max(playerLimit), auxiliaryHighWater: z.array(uint).min(1).max(playerLimit), eventSequence: uint
}).strict().refine((value) => [value.commandHighWater, value.heldHighWater, value.auxiliaryHighWater]
  .every((water) => water.length === (value.snapshot.header as { playerCount: number }).playerCount), 'publication watermarks must cover every player');
const authorityEvent = z.object({ runId: text, eventSequence: positive, tick: uint, payload }).strict();
const messageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('held'), frame }).strict(),
  z.object({ kind: z.literal('command'), envelope }).strict(),
  z.object({ kind: z.literal('callout'), runId: text, player, sequence: positive, calloutKind: z.literal('contextual') }).strict(),
  z.object({ kind: z.literal('state'), state }).strict(),
  z.object({ kind: z.literal('result'), runId: text, result }).strict(),
  z.object({ kind: z.literal('event'), event: authorityEvent }).strict()
]);
return { messageSchema, commandSchema, publicationSchema: state };
}
/** One mode's byte codec for every message on a link: held frames, command envelopes, results, events and states. */
export interface MessageCodec<S = Snapshot> {
  encodeMessage(message: ClientMessage | AuthorityMessage<S>): Uint8Array;
  decodeMessage(bytes: Uint8Array): ClientMessage | AuthorityMessage<S>;
}
/** A mode's codec factory, by player limit (engine refactor spec §6: the ledger takes the mode's command codec). */
export type CommandCodec<S = Snapshot> = (playerLimit?: number) => MessageCodec<S>;
function codecFor<S>(wire: ModeWire): CommandCodec<S> {
  return (playerLimit = MAX_PLAYERS) => {
    if (!Number.isInteger(playerLimit) || playerLimit < 1 || playerLimit > 256) throw new Error('invalid player limit');
    const { messageSchema } = messageSchemaFor(playerLimit, wire);
    return {
      encodeMessage(message) {
        const bytes = new TextEncoder().encode(JSON.stringify(messageSchema.parse(message)));
        if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
        return bytes;
      },
      decodeMessage(bytes) {
        if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
        return messageSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) as ClientMessage | AuthorityMessage<S>;
      }
    };
  };
}
/** The sector's codec; createMessageCodec and the module-level encodeMessage/decodeMessage are this codec. */
export const sectorCodec: CommandCodec<Snapshot> = codecFor<Snapshot>(sectorWire);
export function createMessageCodec(playerLimit = MAX_PLAYERS): MessageCodec<Snapshot> { return sectorCodec(playerLimit); }
export const commandSchema = messageSchemaFor(MAX_PLAYERS).commandSchema;
/** Object transport validation, independent of the unchanged local byte ceiling. */
export const publicationSchema = messageSchemaFor(MAX_PLAYERS).publicationSchema;
export function validatePublication(value: unknown): PublishedState { return publicationSchema.parse(value) as PublishedState; }
export const { encodeMessage, decodeMessage } = createMessageCodec();
export interface LatestMessageMetadata { key: string; sequence: number }
/** Framing policy lives above transport; sequences were stamped by the producer. */
export function latestMessageMetadata(bytes: Uint8Array): LatestMessageMetadata | null {
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('message exceeds byte limit');
  // Transport only needs stream identity; the receiving codec validates the payload.
  const message: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!message || typeof message !== 'object') return null;
  const tagged = message as { kind?: unknown; frame?: unknown; state?: unknown };
  const value = tagged.kind === 'held' ? tagged.frame : tagged.kind === 'state' ? tagged.state : null;
  if (!value || typeof value !== 'object') return null;
  const data = value as { runId?: unknown; player?: unknown; sequence?: unknown; publicationSequence?: unknown };
  if (typeof data.runId !== 'string' || data.runId.length < 1 || data.runId.length > 128) return null;
  const sequence = tagged.kind === 'held' ? data.sequence : data.publicationSequence;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) return null;
  if (tagged.kind === 'held') {
    if (typeof data.player !== 'number' || !Number.isInteger(data.player) || data.player < 0 || data.player >= MAX_PLAYERS) return null;
    return { key: `held:${data.runId}:${data.player}`, sequence };
  }
  if (tagged.kind === 'state') return { key: `state:${data.runId}`, sequence };
  return null;
}
```

Replace the whole of `src/renderer/src/authority/ledger.ts` with:

```ts
import { sectorCodec, type CommandCodec } from '../net/codec';
import { MAX_PLAYERS } from '../../../shared/intent';
import type { Admission, CommandEnvelope, CommandReason, CommandResult, PlayerId } from '../net/contracts';
import { inputTickAllowed, type AdmissionPolicy } from '../net/receivePolicy';

export type AdmittedEnvelope = CommandEnvelope;
export interface LedgerState {
  commandHighWater: number[];
  recentResults: { envelope: CommandEnvelope; result: CommandResult }[];
  admissionTick: number;
  admissionCounts: number[];
}
export interface Ledger {
  /** The paused authority supplies the players already recovered since its last
   * control drain. Only a queued over-budget resume consumes this allowance. */
  admit(envelope: AdmittedEnvelope, tick: number, recoveredPlayers?: Set<PlayerId>, policy?: AdmissionPolicy): Admission;
  finish(result: CommandResult): void;
  highWater(): readonly number[];
  export(): LedgerState;
  restore(value: LedgerState): void;
}
/** One link's owned players, with one shared command stream per player. Every envelope and cached result is validated
 *  by the mode's codec (engine refactor spec §6); an envelope it rejects is `malformed`. */
export function createLedger(owned: readonly PlayerId[], playerLimit = MAX_PLAYERS, codec: CommandCodec<unknown> = sectorCodec): Ledger {
  const { decodeMessage, encodeMessage } = codec(playerLimit);
  if (new Set(owned).size !== owned.length || owned.some(p => !Number.isInteger(p) || p < 0 || p >= playerLimit)) throw new Error('invalid ledger ownership');
  const water = Array<number>(playerLimit).fill(0);
  const pending = new Map<string, { payload: string; tick: number }>();
  const completed = Array.from({ length: playerLimit }, () => new Map<number, { payload: string; result: CommandResult }>());
  let countTick = -1; const counts = Array<number>(playerLimit).fill(0);
  function store(player: number, sequence: number, payload: string, result: CommandResult): void {
    const { admission: _admission, ...semantic } = result;
    const cache = completed[player]!; cache.set(sequence, { payload, result: { ...semantic, id: { ...result.id } } });
    // New terminal capacity rejections can finish before older pending work.
    // The checkpoint invariant requires retaining the high-water result.
    while (cache.size > 256) cache.delete([...cache.keys()].find(id => id !== water[player])!);
  }
  return {
    admit(envelope, tick, recoveredPlayers, policy = 'strict') {
      const respond = (admission: Admission): Admission => {
        if (policy === 'strict' || admission.status === 'queued') return admission;
        const validOwner = owned.includes(envelope.id.player) && admission.result.reason !== 'malformed';
        const high = validOwner ? water[envelope.id.player]! : 0;
        return { ...admission, result: { ...admission.result, admission: {
          expectedSequence: high + 1, disposition: validOwner && envelope.id.sequence <= high ? 'terminal' : 'retryable'
        } } };
      };
      return respond(admit());
      function admit(): Admission {
        const reject = (reason: CommandReason): Admission => ({ status: 'rejected', result: { id: { ...envelope.id }, tick, status: 'rejected', reason } });
        // Canonical codec validation also excludes unknown properties and non-finite payloads.
        let payload: string;
        try {
          const message = { kind: 'command' as const, envelope };
          payload = JSON.stringify(decodeMessage(encodeMessage(message)));
        } catch { return reject('malformed'); }
        const { player, sequence } = envelope.id;
        if (!owned.includes(player)) return reject('unowned');
        const key = `${player}:${sequence}`, waiting = pending.get(key), cached = completed[player]!.get(sequence);
        if (waiting || cached) {
          if ((waiting ?? cached)!.payload !== payload) return reject('conflicting-duplicate');
          return { status: 'duplicate', result: cached ? { ...cached.result, id: { ...cached.result.id } } : { id: { ...envelope.id }, tick: waiting!.tick, status: 'already-processed' } };
        }
        if (sequence <= water[player]!) return { status: 'duplicate', result: { id: { ...envelope.id }, tick, status: 'already-processed' } };
        if (sequence !== water[player]! + 1) return reject('expected-sequence');
        if (countTick !== tick) { countTick = tick; counts.fill(0); }
        const overBudget = counts[player]! >= 16;
        const recovery = overBudget && recoveredPlayers !== undefined && !recoveredPlayers.has(player)
          && envelope.command.kind === 'setPaused' && envelope.command.paused === false;
        if (pending.size >= 256 || (overBudget && !recovery)) {
          const admission = reject('over-capacity');
          if (policy === 'receive-time') {
            water[player] = sequence;
            if (admission.status === 'rejected') store(player, sequence, payload, admission.result);
          }
          return admission;
        }
        water[player] = sequence;
        // Control admission uses the next unexecuted tick too, including while paused.
        if (!inputTickAllowed(envelope.requestedTick, tick, policy)) {
          const admission = reject('stale-tick');
          if (admission.status === 'rejected') store(player, sequence, payload, admission.result);
          return admission;
        }
        if (recovery) recoveredPlayers!.add(player);
        else counts[player] = counts[player]! + 1;
        pending.set(key, { payload, tick });
        return { status: 'queued' };
      }
    },
    finish(result) {
      const { player, sequence } = result.id, key = `${player}:${sequence}`, entry = pending.get(key);
      if (!entry) return;
      pending.delete(key); store(player, sequence, entry.payload, result);
    },
    highWater: () => [...water],
    export() {
      if (pending.size) throw new Error('cannot checkpoint pending ledger');
      return { commandHighWater: [...water], admissionTick: countTick, admissionCounts: [...counts],
        recentResults: completed.flatMap(cache => [...cache.values()].map(entry => {
          const message = JSON.parse(entry.payload) as { envelope: CommandEnvelope };
          return { envelope: message.envelope, result: structuredClone(entry.result) };
        })) };
    },
    restore(value) {
      const validUInt = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
      if (!value || Object.keys(value).sort().join(',') !== 'admissionCounts,admissionTick,commandHighWater,recentResults' ||
        !Array.isArray(value.commandHighWater) || value.commandHighWater.length !== playerLimit ||
        !Array.isArray(value.admissionCounts) || value.admissionCounts.length !== playerLimit ||
        !Array.isArray(value.recentResults) || value.recentResults.length > 256 * playerLimit ||
        !Number.isSafeInteger(value.admissionTick) || value.admissionTick < -1 ||
        (value.admissionTick === -1 && (value.admissionCounts.some(n => n !== 0) || value.commandHighWater.some(n => n !== 0))) ||
        !Array.from(value.commandHighWater).every(validUInt) || !Array.from(value.admissionCounts).every(n => validUInt(n) && n <= 16)) throw new Error('invalid ledger checkpoint');
      const staged = completed.map(() => new Map<number, { payload: string; result: CommandResult }>());
      for (const entry of value.recentResults) {
        if (!entry || Object.keys(entry).sort().join(',') !== 'envelope,result') throw new Error('invalid ledger result');
        const e = entry.envelope, r = entry.result;
        const payload = JSON.stringify(decodeMessage(encodeMessage({ kind: 'command', envelope: e })));
        decodeMessage(encodeMessage({ kind: 'result', runId: e.runId, result: r }));
        // Wire admission metadata describes a response-time stream, never a persisted semantic outcome.
        if (Object.prototype.hasOwnProperty.call(r, 'admission')) throw new Error('admission metadata in ledger cache');
        if ((r.status === 'rejected') !== (r.reason !== undefined) || !owned.includes(e.id.player) || e.id.player !== r.id.player || e.id.sequence !== r.id.sequence || e.id.sequence > value.commandHighWater[e.id.player]! || r.status === 'already-processed' || staged[e.id.player]!.has(e.id.sequence)) throw new Error('invalid ledger cache');
        staged[e.id.player]!.set(e.id.sequence, { payload, result: structuredClone(r) });
        if (staged[e.id.player]!.size > 256) throw new Error('ledger cache capacity');
      }
      for (let p = 0; p < playerLimit; p++) {
        if (value.admissionCounts[p]! > value.commandHighWater[p]! || (value.commandHighWater[p]! > 0 && !staged[p]!.has(value.commandHighWater[p]!))) throw new Error('missing ledger high-water result');
      }
      for (let p = 0; p < playerLimit; p++) { water[p] = value.commandHighWater[p]!; counts[p] = value.admissionCounts[p]!; completed[p] = staged[p]!; }
      countTick = value.admissionTick; pending.clear();
    }
  };
}
```

- [ ] **Step 4: The rules, the sector rules, the generic core and authority, and mode-aware replays**

Create `src/renderer/src/authority/rules.ts`:

```ts
// The generic authority's rules contract (engine refactor spec §6). The authority core runs any encounter through one
// of these: it never imports a sim. Every call the core used to make into sector code goes through a hook here.
import type { Checkpoint, CommandResult, Cue, EndRecord, HeldInput, CommandEnvelope } from '../net/contracts';
import type { CommandCodec } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';

export type ResolveLayout = (id: string) => ShipLayout;
/** What the core reads from any init: the run id that every envelope, event and result carries. */
export interface EncounterInit { runId: string; seed: number; playerCount: number; layoutId: string }
/** What the core reads from any snapshot: the tick and player count in its header, and the canonical values it hashes. */
export interface EncounterSnapshot { header: { tick: number; playerCount: number; simVersion: number; contentDigest: string }; values: number[] }
/** One tick's frozen input: every player's held axes and the admitted commands, in admission order. */
export interface FrozenTickInput { held: readonly HeldInput[]; commands: readonly CommandEnvelope[] }
export interface Callout { text: string; station: number | null }
export interface Terminal { ended: boolean; endRecord: EndRecord | null }

/** The type family of one encounter kind. */
export interface EncounterTypes {
  state: unknown;
  init: EncounterInit;
  /** Opaque per-mode producer memory saved in the checkpoint's botControllers field (sector: CardUiState[]). */
  controllers: unknown;
  snapshot: EncounterSnapshot;
  /** What the cue detector compares across a tick. */
  cueBaseline: unknown;
}
export type CheckpointOf<T extends EncounterTypes> = Checkpoint<T['init'], T['controllers'], T['snapshot']>;

export interface EncounterRules<T extends EncounterTypes> {
  /** The mode this rule set belongs to; replays of any mode but 'sector' record it. */
  readonly modeId: string;
  /** Validate an init for this content digest before anything is allocated (decision 2: the spec's list had no init validator). */
  validateInit(value: unknown, contentDigest: string, resolveLayout: ResolveLayout): T['init'];
  create(init: T['init'], resolveLayout: ResolveLayout): T['state'];
  dispose(state: T['state']): void;
  assertLive(state: T['state']): void;
  playerCount(state: T['state']): number;
  tick(state: T['state']): number;
  step(state: T['state'], input: FrozenTickInput): readonly CommandResult[];
  /** Whether the encounter has ended, and its end record when it has. The init is passed because the sector record
   *  needs the run seed, which the sector state does not hold (decision 3). */
  terminal(state: T['state'], init: T['init']): Terminal;
  /** Changes whenever a safe-point checkpoint should be captured (sector: the visit). */
  safePointKey(state: T['state']): string;
  /** The contextual callout for a player, or null when none may be shown (sector: a dead crew member). */
  callouts(state: T['state'], player: number): Callout | null;
  /** The cue baseline after a tick (decision 4: the spec's cues(prev, state) needs a baseline to start from). */
  cueBaseline(state: T['state']): T['cueBaseline'];
  cues(prev: T['cueBaseline'], state: T['state']): Cue[];
  snapshot(state: T['state'], contentDigest: string): T['snapshot'];
  /** Construct a live state from a validated snapshot. `memory` is the checkpoint's modeMemory blob, when the mode has one. */
  restore(snapshot: T['snapshot'], resolveLayout: ResolveLayout, memory?: unknown): T['state'];
  hash(state: T['state']): string;
  validateCheckpoint(value: unknown, contentDigest: string, resolveLayout: ResolveLayout): CheckpointOf<T>;
  /** The mode's message codec: the ledger and the core validate every envelope, result and publication with it. */
  commandCodec: CommandCodec<T['snapshot']>;
  /** Producer memory before any producer has run (sector: no bot controllers). */
  initialControllers(): T['controllers'];
  /** Mode memory saved in the checkpoint next to botControllers, outside the hash (the duel's telemetry). */
  memory?(state: T['state']): unknown;
}
```

Create `src/renderer/src/authority/sectorRules.ts`:

```ts
// The sector's EncounterRules (engine refactor spec §6): today's step, snapshot, hash, cues, callouts, safe points and
// end record, behind the generic authority's hooks. Every hook calls exactly what core.ts called before R-1, so the
// sector goldens, replays and determinism fixture stay byte-identical.
import type { RunInit } from '../net/contracts';
import { sectorCodec } from '../net/codec';
import type { CardUiState } from '../clientControl/cardController';
import { audioCues, cueCounters, type CueCounters } from '../events/audioCues';
import { calloutFor } from '../events/callout';
import { visitRef } from '../sim/commands';
import { Life, LifeState } from '../sim/components';
import { hashState } from '../sim/hash';
import { deriveLayout } from '../sim/ship/derived';
import { loadSnapshot, saveSnapshot, type Snapshot } from '../sim/snapshot';
import { assertSimStateLive, createSimState, disposeSimState, type SimState } from '../sim/state';
import { stepCommands } from '../sim/step';
import { telemetryRecord } from '../sim/telemetry';
import { SIM_VERSION } from '../sim/tuning';
import { validateCheckpoint, validateRunInit } from './checkpoint';
import type { EncounterRules } from './rules';

export interface SectorTypes { state: SimState; init: RunInit; controllers: CardUiState[]; snapshot: Snapshot; cueBaseline: CueCounters }

export const sectorRules: EncounterRules<SectorTypes> = {
  modeId: 'sector',
  validateInit(value, contentDigest, resolveLayout) {
    const layout = resolveLayout((value as RunInit).layoutId);
    const init = validateRunInit(layout, value, contentDigest);
    if (init.simVersion !== SIM_VERSION || init.contentDigest !== contentDigest || init.layoutHash !== deriveLayout(layout).layoutHash || layout.id !== init.layoutId) throw new Error('incompatible run');
    return init;
  },
  create(init, resolveLayout) {
    return createSimState(resolveLayout(init.layoutId), init.playerCount, init.seed, init.characters, { unlocked: init.unlocked, quirk: init.quirk });
  },
  dispose: disposeSimState,
  assertLive: assertSimStateLive,
  playerCount: (state) => state.playerCount,
  tick: (state) => state.tick,
  step: stepCommands,
  terminal: (state, init) => state.ended ? { ended: true, endRecord: { mode: 'sector', record: telemetryRecord(state, init.seed) } } : { ended: false, endRecord: null },
  safePointKey: (state) => JSON.stringify(visitRef(state)),
  callouts(state, player) {
    if (Life.state[state.crew[player]!] === LifeState.Dead) return null;
    const context = calloutFor(state, player);
    return { text: context.text, station: context.flash };
  },
  cueBaseline: cueCounters,
  cues: (prev, state) => audioCues(prev, cueCounters(state)),
  snapshot: saveSnapshot,
  // The snapshot has already been validated against the authority's digest, so its own header digest is that digest.
  restore: (snapshot, resolveLayout) => loadSnapshot(resolveLayout(snapshot.header.layoutId), snapshot, snapshot.header.contentDigest),
  hash: hashState,
  validateCheckpoint: (value, contentDigest, resolveLayout) => validateCheckpoint(resolveLayout((value as { init?: { layoutId?: string } } | null)?.init?.layoutId as string), value, contentDigest),
  commandCodec: sectorCodec,
  initialControllers: () => []
};
```

Replace the whole of `src/renderer/src/authority/core.ts` with:

```ts
// The generic authority core (engine refactor spec §6): admission, the tick driver, the journal, checkpoint cadence
// and publication for any encounter. Every gameplay call goes through the EncounterRules hooks; nothing here imports
// a sim. createAuthorityCore is the sector instance, kept for its many callers.
import type { AuthorityMessage, ClientMessage, CommandEnvelope, CommandResult, HeldFrame, HeldInput, LifecyclePause, Link, PublishedState, Unsubscribe } from '../net/contracts';
import { hashF64 } from '../../../shared/hash';
import { isCaptureCause, urgentCapture, type CaptureCause } from '../../../shared/sessionCheckpoint';
import { createTickDriver } from './tickDriver';
import { createLedger, type AdmittedEnvelope, type Ledger } from './ledger';
import type { AttachOptions, AuthorityDeps, EncounterAuthorityDeps } from './authority';
import { inputTickAllowed, REMOTE_HELD_TIMEOUT_MS, type AdmissionPolicy } from '../net/receivePolicy';
import type { AuthorityEvent, ClientAuxMessage } from '../net/contracts';
import { replayDataEqual, type ReplayAction, type ReplayFrame, type Replay } from '../sim/replay';
import type { CheckpointOf, EncounterRules, EncounterTypes, FrozenTickInput } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
import type { SimState } from '../sim/state';
import type { Checkpoint } from './checkpoint';

/** The core-level pause control, the one command every mode shares (net/contracts.ts). */
function isPauseControl(envelope: CommandEnvelope): envelope is CommandEnvelope & { command: { kind: 'setPaused'; paused: boolean } } {
  return envelope.command.kind === 'setPaused';
}

type Binding<S> = Pick<AttachOptions<S>, 'publicationSink' | 'notificationSink'> & { id: number; link: Link; players: readonly number[]; admissionPolicy: AdmissionPolicy; ledger: Ledger; ingress: { message: ClientMessage; order: number; receivedAt?: number }[]; unsubscribe: Unsubscribe[] };
export type JournalControl = { source: 'player'; order: number; envelope: CommandEnvelope } | { source: 'lifecycle'; order: number; ordinal: number; control: LifecyclePause };
export interface JournalTick { tick: number; input: FrozenTickInput; heldSequences: readonly number[]; results: readonly CommandResult[]; controls: readonly JournalControl[] }
export interface CrashRecord<T extends EncounterTypes = SectorTypes> {
  replayVersion: 2 | 3 | 4;
  init: T['init']; checkpoint: CheckpointOf<T>; frames: ReplayFrame[]; lastPublishedSequence: number;
  tick: number; seed: number; error: string; baseline: T['snapshot'];
  baselineHighWater: readonly number[]; baselineHeldSequences: readonly number[];
  baselineControlRevision: number; baselineLifecycleOrdinal: number; ticks: readonly JournalTick[]; snapshotAfterFault: T['snapshot'] | null;
  baselineControlState: { phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null; revision: number };
  baselineHeld: readonly HeldInput[];
}
/** Internal sector owner. Only the public wrapper constructs it in shipping code. */
export function createAuthorityCore(deps: AuthorityDeps & { init: SectorTypes['init'] }, state: SimState, restored?: Checkpoint, external = false) {
  // The sector core always validated its checkpoints against the live state's own layout.
  return createEncounterCore(sectorRules, { ...deps, resolveLayout: () => state.layout }, state, restored, external);
}
/** Internal owner for any encounter. Only createEncounterAuthority and the replay runner construct it. */
export function createEncounterCore<T extends EncounterTypes>(rules: EncounterRules<T>, deps: EncounterAuthorityDeps<T> & { init: T['init'] }, state: T['state'], restored?: CheckpointOf<T>, external = false) {
  rules.assertLive(state);
  try { return createLiveCore(rules, deps, state, restored, external); }
  catch (error) { rules.dispose(state); throw error; }
}

function createLiveCore<T extends EncounterTypes>(rules: EncounterRules<T>, deps: EncounterAuthorityDeps<T> & { init: T['init'] }, state: T['state'], restored?: CheckpointOf<T>, external = false) {
  type Snap = T['snapshot'];
  type Bind = Binding<Snap>;
  const players = rules.playerCount(state);
  const { decodeMessage, encodeMessage } = rules.commandCodec();
  const tickOf = (): number => rules.tick(state);
  const ended = (): boolean => rules.terminal(state, deps.init).ended;
  const snapshotOf = (): Snap => rules.snapshot(state, deps.contentDigest);
  const validate = (value: unknown): CheckpointOf<T> => rules.validateCheckpoint(value, deps.contentDigest, deps.resolveLayout);
  const memory = (): { modeMemory?: unknown } => rules.memory ? { modeMemory: rules.memory(state) } : {};
  const bindings = new Set<Bind>();
  const held: HeldInput[] = Array.from({ length: players }, () => ({ moveX: 0, moveY: 0, interactHeld: false }));
  const heldSequences = Array.from({ length: players }, () => 0);
  const heldReceipts: (number | null)[] = heldSequences.map(() => null);
  const ledger = createLedger(Array.from({ length: players }, (_, p) => p), players, rules.commandCodec);
  let pending: { binding: Bind; envelope: AdmittedEnvelope }[] = [];
  // Captured batches are no longer in pending/controlQueue. Retain their ledger
  // ownership until completion so a fault followed by detach can finish them.
  let inFlight: typeof pending = [];
  let controls: JournalControl[] = [], publicationSequence = 0, eventSequence = 0, controlRevision = 0;
  let receiveOrder = 0, lifecycleOrdinal = 0, appliedLifecycleOrdinal = 0, baselineLifecycleOrdinal = 0;
  let controlQueue: { record: JournalControl; binding?: Bind }[] = [];
  // Recovery never replenishes the persisted gameplay allowance. Its lifetime is
  // one control drain, shared by live ingress and recorded replay admissions.
  const recoveredPlayers = new Set<number>();
  let pauseReason: string | null = null, tickTimeMs: number | null = null;
  let controlResults: CommandResult[] = [];
  let phase: PublishedState['phase'] = ended() ? 'ended' : deps.sessionGate ? 'paused' : 'running', pauseOwner: number | null = null;
  if (deps.sessionGate && !ended()) pauseReason = 'session-bootstrap';
  let bootstrap = !!deps.sessionGate && !restored, fenced = false, fencePending = false, settlingFence = false;
  let disposed = false, pumping = false;
  let previousCues = rules.cueBaseline(state), completedHash = rules.hash(state);
  const auxiliarySequences = heldSequences.map(() => 0);
  const pendingCallouts = new Map<number, ClientAuxMessage>();
  let baseline = snapshotOf(), baselineHighWater: readonly number[] = heldSequences.slice(), baselineHeldSequences: readonly number[] = heldSequences.slice(), baselineControlRevision = 0;
  let baselineHeld = held.map((h) => ({ ...h }));
  let baselineControlState: CrashRecord['baselineControlState'] = { phase, pauseOwner, pauseReason, revision: controlRevision };
  let ticks: JournalTick[] = [];
  let botMemory: T['controllers'] = rules.initialControllers();
  let bindingOrdinal = 0, replaying = false;
  let replayVersion: 2 | 3 | 4 = 2;
  let frames: ReplayFrame[] = [], activeFrame: ReplayFrame | null = null;
  const deferredDetaches = new Set<Unsubscribe>();
  let flushingDetaches = false;
  let durableBaseline!: CheckpointOf<T>;
  let captureCause: CaptureCause | undefined, capturing = false;
  const captureWaiters: { resolve(value: { checkpoint: CheckpointOf<T>; cause: CaptureCause }): void; reject(error: Error): void }[] = [];
  let observedVisit = rules.safePointKey(state), observedRevision = controlRevision;
  let observedPhase: PublishedState['phase'] = phase;
  function queueCapture(cause: CaptureCause): void { captureCause = urgentCapture(captureCause, cause); }
  function rejectCaptures(): void {
    captureCause = undefined;
    for (const waiter of captureWaiters.splice(0)) waiter.reject(Error('capture unavailable'));
  }
  function deliverCapture(checkpoint: CheckpointOf<T>, cause: CaptureCause): boolean {
    // Own the bytes/state before any reentrant observer can mutate or admit input.
    const captured = structuredClone(checkpoint), waiters = captureWaiters.slice();
    captureCause = undefined;
    try { deps.onCheckpoint?.(captured, cause); } catch {
      // Encoding/delivery can fail independently of a valid live simulation.
      // Retain the request, not another byte snapshot, for the next boundary.
      captureCause = urgentCapture(captureCause, cause); return false;
    }
    captureWaiters.splice(0, waiters.length);
    for (const waiter of waiters) waiter.resolve({ checkpoint: captured, cause });
    return true;
  }
  function flushCapture(completedBaseline?: CheckpointOf<T>): void {
    if (replaying || activeFrame || capturing || !captureCause) return;
    if (disposed || phase === 'error') { rejectCaptures(); return; }
    capturing = true;
    try {
      if (captureCause === 'exit') {
        drainIngress(); lifecycle({ paused: true, reason: 'session-exit' }); applyControls(); rejectPending();
      } else if (phase === 'paused' || phase === 'ended') {
        // Stopped clocks cannot wait for another tick to finish admitted work.
        drainIngress(); applyControls(); rejectPending();
      }
      if ((phase as PublishedState['phase']) === 'error' || disposed) { rejectCaptures(); return; }
      // Never project pending ledger entries away to manufacture a valid save.
      if (pending.length || inFlight.length || controlQueue.some(c => c.record.source === 'player')) return;
      const cause = captureCause!;
      const checkpoint = completedBaseline && cause === 'periodic' ? completedBaseline
        : captureCheckpoint(deps.botControllers ? deps.botControllers() : botMemory);
      if (!deliverCapture(checkpoint, cause)) { if (phase !== 'running') rejectCaptures(); return; }
      observedPhase = phase; observedRevision = controlRevision; observedVisit = rules.safePointKey(state);
    } catch { if (phase !== 'running' || disposed) rejectCaptures(); }
    finally { capturing = false; }
  }
  function observeCaptureBoundary(): void {
    if (!deps.onCheckpoint || replaying || phase === 'error') return;
    const visit = rules.safePointKey(state);
    if (visit !== observedVisit || phase === 'ended' && observedPhase !== 'ended') queueCapture('safe-point');
    if (phase === 'paused' && observedPhase !== 'paused') queueCapture('pause');
    else if (phase === 'paused' && controlRevision !== observedRevision) queueCapture('paused-control');
    observedVisit = visit; observedPhase = phase; observedRevision = controlRevision;
  }
  const replayBindings = new Map<number, Bind>();
  function begin(action: ReplayAction): void {
    if (activeFrame) throw new Error('nested replay boundary');
    activeFrame = { tick: tickOf(), eventSequenceBefore: eventSequence, action: structuredClone(action), results: [], events: [] };
    frames.push(activeFrame);
  }
  function complete(): ReplayFrame {
    const frame = activeFrame!;
    if (phase !== 'error') frame.after = { tick: tickOf(), hash: completedHash, phase, eventSequence, publicationSequence, controlRevision };
    if (phase !== 'error') inFlight = [];
    activeFrame = null;
    settleFence();
    flushDetaches();
    return frame;
  }
  function flushDetaches(): void {
    if (activeFrame || flushingDetaches) return;
    flushingDetaches = true;
    try {
      for (const detach of deferredDetaches) { deferredDetaches.delete(detach); detach(); }
    } finally { flushingDetaches = false; }
  }

  if (restored) {
    ledger.restore({ commandHighWater: restored.commandHighWater, recentResults: restored.recentResults, admissionTick: restored.admissionTick, admissionCounts: restored.admissionCounts });
    heldSequences.splice(0, heldSequences.length, ...restored.heldHighWater);
    if (!external) held.splice(0, held.length, ...structuredClone(restored.held));
    publicationSequence = restored.publicationSequence; eventSequence = restored.eventSequence; controlRevision = restored.controlRevision;
    receiveOrder = restored.receiveOrder; lifecycleOrdinal = appliedLifecycleOrdinal = restored.lifecycleOrdinal;
    botMemory = structuredClone(restored.botControllers) as T['controllers'];
    phase = ended() ? 'ended' : external ? 'paused' : restored.phase;
    pauseOwner = external ? null : restored.pauseOwner; pauseReason = external && !ended() ? 'restore' : restored.pauseReason;
  }
  function captureCheckpoint(botControllers: Readonly<T['controllers']> = botMemory): CheckpointOf<T> {
    return validate({ checkpointVersion: 2, init: deps.init, snapshot: snapshotOf(),
      ...ledger.export(), eventSequence, publicationSequence, controlRevision, receiveOrder, lifecycleOrdinal,
      botControllers: structuredClone(botControllers), paused: phase === 'paused', phase, pauseOwner, pauseReason,
      heldHighWater: [...heldSequences], held: held.map(h => ({ ...h })), ...memory() });
  }
  function sealCheckpoint(botControllers: Readonly<T['controllers']>): CheckpointOf<T> {
    if (disposed || pumping) throw new Error('checkpoint requires completed boundary');
    if (phase === 'error') throw new Error('cannot checkpoint faulted authority');
    // Check controller memory before any admission or acknowledgment side effect.
    captureCheckpointWithBots(botControllers);
    try {
      drainIngress(); applyControls();
      rejectPending();
      botMemory = structuredClone(botControllers) as T['controllers'];
      return captureCheckpoint();
    } catch (error) { recordFault(error); throw error; }
  }
  function rejectPending(discardLifecycleResumes = false): void {
    const discardResumes = discardLifecycleResumes && controlQueue.some(entry => entry.record.source === 'lifecycle' && !entry.record.control.paused);
    if (discardResumes) replayVersion = 4;
    begin({ kind: 'seal', ...(discardResumes ? { discardLifecycleResumes: true as const } : {}) });
    for (const entry of pending) result(entry.binding, { id: entry.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
    pending = [];
    for (const entry of controlQueue) if (entry.record.source === 'player') result(entry.binding!, {
      id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
    // A seal settles deferred player controls as well as simulation commands.
    // A fenced seal rejects earlier trusted Resume intents as well. Record that
    // external lifecycle effect explicitly, preserving ordinary/legacy seals.
    controlQueue = controlQueue.filter(entry => entry.record.source === 'lifecycle' && (!discardResumes || entry.record.control.paused));
    complete();
  }
  function lifecycle(control: LifecyclePause): void {
    begin({ kind: 'lifecycle', order: ++receiveOrder, ordinal: ++lifecycleOrdinal, control: { ...control } });
    controlQueue.push({ record: { source: 'lifecycle', order: receiveOrder, ordinal: lifecycleOrdinal, control: { ...control } } });
    complete();
  }
  function settleFence(): void {
    if (!fencePending || activeFrame || settlingFence || disposed) return;
    settlingFence = true; fencePending = false;
    try {
      rejectPending(true);
      pendingCallouts.clear();
      // Existing watchdog/lifecycle records make offline replay independent of a live lease.
      if (replayVersion === 2) replayVersion = 3;
      neutralizeExpired(held.map((_, player) => player));
      lifecycle({ paused: true, reason: 'session-fenced' });
      applyControls();
    } finally { settlingFence = false; }
  }
  function permitted(allowBootstrap = false): boolean {
    if (replaying || !deps.sessionGate) return true;
    let allowed = false;
    try { allowed = deps.sessionGate.check().allowed === true; } catch { /* permission failures always close */ }
    if (!allowed) {
      if (!fenced) { fenced = true; fencePending = true; }
      settleFence(); return false;
    }
    if (fencePending || settlingFence) return false;
    if (fenced) { driver.resetPausedEpoch(); fenced = false; }
    return allowBootstrap || !bootstrap;
  }
  function rejectIngress(binding: Bind, message: ClientMessage): void {
    if (message.kind === 'command') send(binding, { kind: 'result', runId: deps.init.runId,
      result: { id: message.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' } }, true, false);
  }
  function captureCheckpointWithBots(botControllers: Readonly<T['controllers']>): void {
    // Pending ledger entries are sealed below; validate UI against a detached empty ledger first.
    const empty = createLedger(Array.from({ length: players }, (_, p) => p), players, rules.commandCodec).export();
    validate({ checkpointVersion: 2, init: deps.init, snapshot: snapshotOf(), ...empty,
      eventSequence, publicationSequence, controlRevision, receiveOrder, lifecycleOrdinal, botControllers: structuredClone(botControllers),
      paused: phase === 'paused', phase, pauseOwner, pauseReason, heldHighWater: [...heldSequences], held, ...memory() });
  }

  const highWater = (): number[] => ledger.highWater().slice(0, players);
  function resetBaseline(refreshBots = true): void {
    if (refreshBots && deps.botControllers) botMemory = structuredClone(deps.botControllers()) as T['controllers'];
    baseline = snapshotOf(); baselineHighWater = highWater(); baselineHeldSequences = [...heldSequences];
    baselineControlRevision = controlRevision; baselineLifecycleOrdinal = appliedLifecycleOrdinal;
    baselineHeld = held.map((h) => ({ ...h })); baselineControlState = { phase, pauseOwner, pauseReason, revision: controlRevision };
    ticks = []; controls = []; controlResults = [];
    durableBaseline = captureCheckpoint(); frames = [];
  }
  function send(binding: Bind, message: AuthorityMessage<Snap>, reliable = false, journal = true): void {
    if (message.kind === 'result') {
      if (binding.admissionPolicy === 'receive-time') {
        const invalid = message.result.reason === 'unowned' || message.result.reason === 'wrong-run' || message.result.reason === 'malformed';
        const high = invalid ? 0 : ledger.highWater()[message.result.id.player]!;
        message = { ...message, result: { ...message.result, admission: { expectedSequence: high + 1,
          disposition: !invalid && message.result.id.sequence <= high ? 'terminal' : 'retryable' } } };
      }
      if (journal) activeFrame?.results.push(structuredClone(message.result));
    }
    if (binding.notificationSink && (message.kind === 'result' || message.kind === 'event')) {
      const covering = activeFrame?.action.kind === 'tick' || activeFrame?.action.kind === 'controls';
      binding.notificationSink(structuredClone(message), publicationSequence + (covering ? 1 : 0));
    } else binding.link.send(reliable ? 'reliable-ordered' : 'unreliable-latest', encodeMessage(message));
  }
  function publishCompletedState(reliable = false): void {
    if (disposed || phase === 'error') return;
    // Hash the exact freshly captured canonical values, avoiding a second field
    // traversal. No state/hash cache: direct fixture mutations remain observable.
    const sequence = ++publicationSequence, snapshot = snapshotOf();
    const publication: PublishedState<Snap> = { runId: deps.init.runId, tick: tickOf(), publicationSequence: sequence,
      snapshot, hash: (completedHash = hashF64(Float64Array.from(snapshot.values))), phase, pauseOwner, pauseReason, controlRevision, lagTicks: driver.lagTicks(), tickTimeMs,
      commandHighWater: highWater(), heldHighWater: [...heldSequences], auxiliaryHighWater: [...auxiliarySequences], eventSequence };
    // A stopped clock cannot replace a lost latest packet. Control boundaries
    // share reliable delivery with the events that depend on their state.
    const channel = reliable || phase === 'paused' || phase === 'ended' ? 'reliable-ordered' : 'unreliable-latest';
    // Detach each streamed publication before any local byte encoding. A stream-only
    // authority is not constrained by the local JSON byte ceiling.
    for (const binding of bindings) if (binding.publicationSink) binding.publicationSink(structuredClone(publication), channel === 'reliable-ordered');
    let bytes: Uint8Array | undefined;
    for (const binding of bindings) if (!binding.publicationSink) {
      bytes ??= encodeMessage({ kind: 'state', state: publication });
      binding.link.send(channel, bytes);
    }
  }
  function result(binding: Bind, value: CommandResult): void {
    binding.ledger.finish(value); send(binding, { kind: 'result', runId: deps.init.runId, result: value }, true);
  }
  function emit(payload: AuthorityEvent['payload']): void {
    const event: AuthorityEvent = { runId: deps.init.runId, eventSequence: ++eventSequence, tick: tickOf(), payload };
    if (payload.kind !== 'callout') activeFrame?.events.push({ eventSequence, tick: tickOf(), kind: payload.kind });
    for (const binding of bindings) send(binding, { kind: 'event', event }, true);
  }
  function flushCallouts(): void {
    const hadCallouts = pendingCallouts.size > 0;
    for (const player of [...pendingCallouts.keys()].sort((a, b) => a - b)) {
      const context = phase === 'running' ? rules.callouts(state, player) : null;
      if (!context) continue;
      emit({ kind: 'callout', player, text: context.text, station: context.station });
    }
    pendingCallouts.clear();
    if (hadCallouts) { begin({ kind: 'cursor', receiveOrder }); complete(); }
  }
  function acceptHeld(binding: Bind, frame: HeldFrame, receivedAt?: number): void {
    if (frame.runId !== deps.init.runId || !binding.players.includes(frame.player) || !inputTickAllowed(frame.tick, tickOf(), binding.admissionPolicy) || frame.sequence <= heldSequences[frame.player]!) return;
    heldSequences[frame.player] = frame.sequence; held[frame.player] = { ...frame.held };
    if (binding.admissionPolicy === 'receive-time' && !replaying) heldReceipts[frame.player] = receivedAt!;
  }
  function neutralizeExpired(players: number[]): void {
    begin({ kind: 'watchdog', players });
    for (const p of players) { held[p] = { moveX: 0, moveY: 0, interactHeld: false }; heldReceipts[p] = null; }
    complete();
  }
  function expireHeld(): void {
    if (replaying) return;
    const now = deps.clock.nowMs(), expired: number[] = [];
    for (let p = 0; p < held.length; p++) if (heldReceipts[p] !== null && now - heldReceipts[p]! >= REMOTE_HELD_TIMEOUT_MS) {
      heldReceipts[p] = null;
      if (held[p]!.moveX !== 0 || held[p]!.moveY !== 0 || held[p]!.interactHeld) expired.push(p);
    }
    if (expired.length) neutralizeExpired(expired);
  }
  function drainIngress(batch?: (Bind['ingress'][number] & { binding: Bind })[]): void {
    const incoming = batch ?? [...bindings].flatMap((binding) => binding.ingress.splice(0).map((entry) => ({ ...entry, binding }))).sort((a, b) => a.order - b.order);
    // Each leased admission is its own completed journal boundary. A synchronous
    // result observer may fence the session before the next queued envelope.
    if (!batch && deps.sessionGate && !replaying && incoming.length) {
      for (const entry of incoming) drainIngress([entry]);
      return;
    }
    if (!permitted()) {
      for (const { binding, message } of incoming) rejectIngress(binding, message);
      if (incoming.length) { begin({ kind: 'cursor', receiveOrder }); complete(); }
      return;
    }
    const recorded = incoming.filter(entry => entry.message.kind !== 'callout');
    if (recorded.length) begin({ kind: 'admission', entries: recorded.map(({ binding, message, order }) => ({ binding: binding.id, players: [...binding.players], message: message as Exclude<ClientMessage, { kind: 'callout' }>, order,
      ...(binding.admissionPolicy === 'receive-time' ? { admissionPolicy: binding.admissionPolicy, effectiveTick: tickOf() } : {}) })) });
    for (const { binding, message, order, receivedAt } of incoming) {
      if (message.kind === 'held') { acceptHeld(binding, message.frame, receivedAt); continue; }
      if (message.kind === 'callout') {
        if (message.runId === deps.init.runId && binding.players.includes(message.player) && message.sequence > auxiliarySequences[message.player]!) {
          auxiliarySequences[message.player] = message.sequence;
          pendingCallouts.set(message.player, message);
        }
        continue;
      }
      const envelope = message.envelope;
      if (!binding.players.includes(envelope.id.player)) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: tickOf(), status: 'rejected', reason: 'unowned' } }, true); continue; }
      if (envelope.runId !== deps.init.runId) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: tickOf(), status: 'rejected', reason: 'wrong-run' } }, true); continue; }
      const admission = binding.ledger.admit(envelope, tickOf(), phase === 'paused' ? recoveredPlayers : undefined, binding.admissionPolicy);
      if (admission.status !== 'queued') {
        send(binding, { kind: 'result', runId: deps.init.runId, result: admission.result }, true);
        if (binding.admissionPolicy === 'receive-time' && admission.result.reason === 'conflicting-duplicate' && !replaying) binding.link.close('conflicting-duplicate');
        continue;
      }
      if (phase === 'ended' || phase === 'error') {
        result(binding, { id: envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        continue;
      }
      if (isPauseControl(envelope)) controlQueue.push({ binding, record: { source: 'player', order, envelope } });
      else pending.push({ binding, envelope });
    }
    if (recorded.length) complete();
    if (incoming.some(entry => entry.message.kind === 'callout')) { begin({ kind: 'cursor', receiveOrder }); complete(); }
  }
  function applyControls(replayCutoff?: number): void {
    if (!settlingFence && !permitted() && !controlQueue.every(entry => entry.record.source === 'lifecycle' && entry.record.control.paused)) return;
    const queue = controlQueue.sort((a, b) => a.record.order - b.record.order); controlQueue = [];
    if (replayCutoff !== undefined && (!Number.isSafeInteger(replayCutoff) || replayCutoff < 0 || replayCutoff > queue.length)) throw Error('invalid replay control cutoff');
    recoveredPlayers.clear();
    if (!queue.length) return;
    const nested = activeFrame !== null;
    if (!nested) begin({ kind: 'controls' });
    for (const entry of queue) if (entry.record.source === 'player') inFlight.push({ binding: entry.binding!, envelope: entry.record.envelope });
    if (phase === 'ended' || phase === 'error') {
      for (const entry of queue) if (entry.record.source === 'player') result(entry.binding!, { id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
      if (!nested) complete(); return;
    }
    // A long pause can have arbitrarily many trusted focus signals but no sim tick.
    // Checkpoint the completed boundary instead of growing that journal forever.
    // Portable history is rotated only after a complete boundary, below.
    let paused = false, owner: number | null = null, reason: string | null = null;
    let processedCount = 0;
    for (const entry of queue) {
      const record = entry.record;
      if (replayCutoff !== undefined ? processedCount === replayCutoff
        : (record.source === 'player' || !record.control.paused) && !permitted()) break;
      const value = record.source === 'lifecycle' ? record.control.paused : isPauseControl(record.envelope) && record.envelope.command.paused;
      if (value) {
        paused = true; owner = record.source === 'player' ? record.envelope.id.player : null;
        reason = record.source === 'lifecycle' ? record.control.reason : 'player';
      }
      controls.push(record); controlRevision++;
      if (record.source === 'lifecycle') appliedLifecycleOrdinal = record.ordinal;
      if (record.source === 'player') {
        const outcome: CommandResult = { id: record.envelope.id, tick: tickOf(), status: 'applied' };
        controlResults.push(outcome); result(entry.binding!, outcome);
      }
      processedCount++;
    }
    // Permission may close from the final result callback too. Complete the
    // accepted prefix without publishing Resume; the following existing seal
    // and trusted lifecycle records settle the suffix and publish the pause.
    if (replayCutoff !== undefined || !settlingFence && queue.some(entry => entry.record.source === 'player' || !entry.record.control.paused) && !permitted()) {
      activeFrame!.action = { kind: 'controls', processedCount, fenced: true };
      replayVersion = 4;
      controlQueue.unshift(...queue.slice(processedCount));
      complete();
      return;
    }
    phase = paused ? 'paused' : 'running'; pauseOwner = owner; pauseReason = reason;
    emit({ kind: 'pause', paused, owner, reason: reason ?? 'resume' });
    driver.setPaused(paused);
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; });
    publishCompletedState(true);
    complete();
    if (!replaying && controls.length >= 256) { rejectPending(); resetBaseline(); }
    observeCaptureBoundary();
  }
  function executeTick(_nextTick: number, deadline: number): void {
    if (replaying) { drainIngress(); expireHeld(); flushCallouts(); }
    // Controls received here wait for the next pump; they cannot leak into the sim phase.
    const frozen = pending; pending = [];
    const input: FrozenTickInput = { held: held.map((h) => ({ ...h })), commands: [] };
    for (const entry of frozen) {
      // Admission/dedup always retain the original bytes. The simulator still
      // enforces exact ticks on a separate execution envelope.
      (input.commands as CommandEnvelope[]).push(entry.binding.admissionPolicy === 'receive-time' ? { ...entry.envelope, requestedTick: tickOf() } : entry.envelope);
    }
    begin({ kind: 'tick', input, heldSequences: [...heldSequences] });
    inFlight = frozen;
    const record: JournalTick = { tick: tickOf(), input, heldSequences: [...heldSequences], results: controlResults, controls }; controls = []; controlResults = []; if (!replaying) ticks.push(record);
    const executed = rules.step(state, input); record.results = [...record.results, ...executed];
    const nextCues = rules.cueBaseline(state);
    for (const cue of rules.cues(previousCues, state)) emit({ kind: 'cue', cue });
    previousCues = nextCues;
    for (const value of executed) { const entry = frozen.find((p) => p.envelope.id.player === value.id.player && p.envelope.id.sequence === value.id.sequence); if (entry) result(entry.binding, value); }
    tickTimeMs = deadline;
    const end = rules.terminal(state, deps.init);
    if (end.ended) {
      phase = 'ended'; driver.dispose(); applyControls();
      if (end.endRecord) emit({ kind: 'ended', record: end.endRecord });
    }
    publishCompletedState();
    complete();
    const boundary = tickOf() % 300 === 0;
    if (!replaying && boundary) { applyControls(); rejectPending(); resetBaseline(); }
    observeCaptureBoundary();
    if (!replaying && deps.onCheckpoint && boundary) queueCapture('periodic');
    flushCapture(boundary ? durableBaseline : undefined);
  }
  function pump(): void {
    if (disposed || pumping) return;
    pumping = true;
    try {
      if (!permitted()) { drainIngress(); applyControls(); return; }
      try { deps.beforeControls?.(); } catch { /* absent producer never prevents authority progress */ }
      if (!permitted()) { drainIngress(); applyControls(); return; }
      drainIngress();
      expireHeld();
      // Accrue through this boundary before any pause control changes the active epoch.
      driver.setPaused(phase !== 'running');
      applyControls();
      flushCallouts();
      driver.pump();
      if (!replaying && frames.length > 4096) { applyControls(); rejectPending(); resetBaseline(); }
    } catch (error) { recordFault(error); }
    finally { pumping = false; observeCaptureBoundary(); flushCapture(); }
  }
  function recordFault(error: unknown): void {
    // Public checkpoint and attach frames can fail outside pump. Abandon their
    // incomplete frame before flushing cleanup, and preserve the durable baseline.
    activeFrame = null; phase = 'error'; driver.dispose(); flushDetaches(); applyControls(); let snapshotAfterFault: Snap | null = null;
    rejectCaptures();
    try { snapshotAfterFault = snapshotOf(); } catch { /* corrupted state */ }
    deps.onCrash({ replayVersion, init: structuredClone(deps.init), checkpoint: structuredClone(durableBaseline), frames: structuredClone(frames), lastPublishedSequence: publicationSequence, tick: tickOf(), seed: deps.init.seed, error: String(error), baseline, baselineHighWater, baselineHeldSequences, baselineControlRevision, baselineLifecycleOrdinal, baselineHeld, baselineControlState, ticks, snapshotAfterFault });
  }
  const driver = createTickDriver(deps.clock, { schedule: (delay) => deps.scheduler.schedule(delay, pump) }, executeTick, (_tick, deadline) => {
    if (!permitted()) return false;
    try { deps.beforeTick?.(tickOf(), deadline); } catch { /* producer failure cannot bypass permission */ }
    drainIngress(); expireHeld(); flushCallouts();
    return permitted();
  });
  let unbindLifecycle: void | Unsubscribe = undefined;
  try {
    if (phase === 'ended') driver.dispose();
    else if (phase !== 'running') driver.setPaused(true);
    // Validate the baseline before replacing a live owner's lifecycle callback.
    resetBaseline(!restored);
    unbindLifecycle = deps.bindLifecyclePause?.((control) => {
    if (disposed || phase === 'ended' || phase === 'error') return;
    if (typeof control.paused !== 'boolean' || !control.reason || control.reason.length > 128) throw new Error('invalid lifecycle control');
    if (controlQueue.length >= 256 || !Number.isSafeInteger(lifecycleOrdinal + 1)) throw new Error('lifecycle control capacity');
    if (!control.paused && !permitted()) return;
    lifecycle(control);
    });
    observedPhase = phase; observedRevision = controlRevision; observedVisit = rules.safePointKey(state);
    if (deps.onCheckpoint) deliverCapture(durableBaseline, 'initial');
  } catch (error) {
    disposed = true;
    // Attempt every release without hiding the construction error.
    try { driver.dispose(); } catch { /* cleanup failure */ }
    try { unbindLifecycle?.(); } catch { /* cleanup failure */ }
    throw error;
  }
  return {
    attach(link: Link, owned: readonly number[], options: AttachOptions<Snap> = {}): Unsubscribe {
      const admissionPolicy = options.admissionPolicy ?? 'strict';
      if (admissionPolicy !== 'strict' && admissionPolicy !== 'receive-time') throw new Error('invalid admission policy');
      if (disposed || owned.some((p) => !Number.isInteger(p) || p < 0 || p >= players || [...bindings].some((b) => b.players.includes(p))) || new Set(owned).size !== owned.length) throw new Error('invalid player ownership');
      const binding: Bind = { id: ++bindingOrdinal, link, players: [...owned], admissionPolicy, publicationSink: options.publicationSink, notificationSink: options.notificationSink, ledger, ingress: [], unsubscribe: [] }; bindings.add(binding);
      if (admissionPolicy === 'receive-time' && replayVersion === 2) replayVersion = 3;
      const detach = (): void => {
        // Finish the entire captured admission/control/tick batch before changing
        // ownership. Replay sees the outer outcome first, then this detach.
        if (activeFrame) { if (bindings.has(binding)) deferredDetaches.add(detach); return; }
        if (!bindings.delete(binding)) return;
        for (const off of binding.unsubscribe) off();
        begin({ kind: 'detach', binding: binding.id, players: [...binding.players] });
        for (const entry of [...pending, ...inFlight]) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        pending = pending.filter((p) => p.binding !== binding);
        inFlight = inFlight.filter((p) => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        controlQueue = controlQueue.filter((entry) => entry.binding !== binding);
        for (const p of owned) { held[p] = { moveX: 0, moveY: 0, interactHeld: false }; heldReceipts[p] = null; }
        complete();
        // Discarded ingress already consumed receive ordinals, including auxiliary bytes.
        binding.ingress.length = 0;
        begin({ kind: 'cursor', receiveOrder }); complete();
      };
      try {
      binding.unsubscribe.push(link.onMessage((_kind, bytes) => {
        try { const message = decodeMessage(bytes); if (message.kind === 'state' || message.kind === 'result' || message.kind === 'event') { link.close('invalid-client-message'); return; }
          if (!permitted()) { rejectIngress(binding, message); return; }
          if (binding.ingress.length >= 256) { link.close('ingress-overflow'); return; } binding.ingress.push({ message, order: ++receiveOrder,
            ...(admissionPolicy === 'receive-time' && message.kind === 'held' ? { receivedAt: deps.clock.nowMs() } : {}) });
        } catch { link.close('malformed'); }
      }));
      binding.unsubscribe.push(link.onClose(detach));
      begin({ kind: 'publish' }); publishCompletedState(true); complete(); return detach;
      } catch (error) {
        detach();
        if (activeFrame) recordFault(error);
        throw error;
      }
    },
    pump, publishCompletedState, checkpoint: sealCheckpoint,
    requestCheckpoint(cause: CaptureCause): Promise<{ checkpoint: CheckpointOf<T>; cause: CaptureCause }> {
      if (!isCaptureCause(cause) || disposed || phase === 'error' || captureWaiters.length >= 64) return Promise.reject(Error('capture unavailable'));
      queueCapture(cause);
      const result = new Promise<{ checkpoint: CheckpointOf<T>; cause: CaptureCause }>((resolve, reject) => captureWaiters.push({ resolve, reject }));
      // Calls from publication/result observers must leave the open journal frame.
      queueMicrotask(() => { if (!pumping) flushCapture(); });
      return result;
    },
    completeBootstrap(): void {
      if (!bootstrap || disposed || pumping || activeFrame || !permitted(true)) throw Error('bootstrap unavailable');
      bootstrap = false;
      lifecycle({ paused: false, reason: 'session-bootstrap' }); applyControls();
    },
    replay(): Replay<T> { return structuredClone({ version: replayVersion, ...(rules.modeId !== 'sector' ? { mode: rules.modeId } : {}), init: deps.init, initial: durableBaseline.snapshot, checkpoint: durableBaseline, frames }); },
    replayFrame(frame: ReplayFrame): ReplayFrame {
      if (disposed || activeFrame || frame.tick !== tickOf() || frame.eventSequenceBefore < eventSequence) throw new Error('invalid replay boundary');
      replaying = true; eventSequence = frame.eventSequenceBefore;
      const action = frame.action;
      const before = frames.length;
      if (action.kind === 'admission') {
        for (const entry of action.entries) {
          let binding = replayBindings.get(entry.binding);
          if (!binding) {
            binding = { id: entry.binding, players: entry.players, admissionPolicy: entry.admissionPolicy ?? 'strict', ledger, ingress: [], unsubscribe: [], link: { send() {} } as unknown as Link } as Bind;
            replayBindings.set(entry.binding, binding); bindings.add(binding);
          }
          if (JSON.stringify(binding.players) !== JSON.stringify(entry.players)) throw new Error('replay ownership changed');
          if (binding.admissionPolicy !== (entry.admissionPolicy ?? 'strict') || (entry.effectiveTick !== undefined && entry.effectiveTick !== tickOf())) throw new Error('replay admission mapping changed');
          receiveOrder = Math.max(receiveOrder, entry.order);
          binding.ingress.push({ message: entry.message, order: entry.order });
        }
        drainIngress();
      } else if (action.kind === 'lifecycle') {
        begin(action); receiveOrder = Math.max(receiveOrder, action.order); lifecycleOrdinal = action.ordinal;
        controlQueue.push({ record: { source: 'lifecycle', order: action.order, ordinal: action.ordinal, control: action.control } }); complete();
      } else if (action.kind === 'controls') applyControls(action.fenced ? action.processedCount : undefined);
      else if (action.kind === 'tick') {
        if (phase !== 'running' || !replayDataEqual(action.input.held, held) || JSON.stringify(action.heldSequences) !== JSON.stringify(heldSequences)) throw new Error('replay held divergence');
        executeTick(tickOf(), 0);
      } else if (action.kind === 'publish') { begin(action); publishCompletedState(true); complete(); }
      else if (action.kind === 'seal') rejectPending(action.discardLifecycleResumes);
      else if (action.kind === 'cursor') { begin(action); receiveOrder = action.receiveOrder; complete(); }
      else if (action.kind === 'watchdog') neutralizeExpired(action.players);
      else {
        begin(action);
        const binding = replayBindings.get(action.binding);
        for (const entry of pending) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        pending = pending.filter(p => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        controlQueue = controlQueue.filter(e => e.binding !== binding);
        if (binding) bindings.delete(binding); replayBindings.delete(action.binding);
        for (const p of action.players) held[p] = { moveX: 0, moveY: 0, interactHeld: false };
        complete();
      }
      const actual = frames[before];
      if (!actual || !replayDataEqual(actual.action, action)) throw new Error('replay action divergence');
      frames.splice(before);
      return actual;
    },
    captureCheckpoint,
    cursors: () => ({ runId: deps.init.runId, publicationSequence, eventSequence, controlRevision }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rejectCaptures();
      const errors: unknown[] = [];
      const cleanup = (action: () => void): void => { try { action(); } catch (error) { errors.push(error); } };
      cleanup(() => driver.dispose()); cleanup(() => unbindLifecycle?.());
      for (const binding of bindings) for (const off of binding.unsubscribe) cleanup(off);
      bindings.clear(); deferredDetaches.clear(); pending = []; inFlight = []; controls = []; controlQueue = []; pendingCallouts.clear();
      rules.dispose(state);
      if (errors.length) throw errors[0];
    }
  };
}
```

Replace the whole of `src/renderer/src/authority/authority.ts` with:

```ts
// The public authority (engine refactor spec §6): createEncounterAuthority runs any encounter through its rules;
// createAuthority is the sector instance. The merged Authority surface and deps are unchanged.
import type { AuthorityMessage, PublishedState, LifecyclePause, Link, MonotonicClock, Scheduler, Unsubscribe } from '../net/contracts';
import type { Replay } from '../sim/replay';
import type { SessionWorkGate } from '../../../shared/sessionLease';
import type { CaptureCause } from '../../../shared/sessionCheckpoint';
import type { AdmissionPolicy } from '../net/receivePolicy';
export type { AdmissionPolicy } from '../net/receivePolicy';
import type { Snapshot } from '../sim/snapshot';
export interface AttachOptions<S = Snapshot> {
  admissionPolicy?: AdmissionPolicy;
  /** Trusted mode adapter, before the ordinary local byte codec. Receives owned data. */
  publicationSink?(state: PublishedState<S>, reliable: boolean): void;
  notificationSink?(message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>, requiredPublicationSequence: number): void;
}
export type { Checkpoint } from './checkpoint';
import type { ShipLayout } from '../sim/ship/schema';
import { createEncounterCore, type CrashRecord } from './core';
import type { CheckpointOf, EncounterRules, EncounterTypes } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
export type { CrashRecord, JournalTick } from './core';

export interface EncounterAuthorityDeps<T extends EncounterTypes> {
  onCheckpoint?(checkpoint: CheckpointOf<T>, cause: CaptureCause): void;
  sessionGate?: SessionWorkGate;
  clock: MonotonicClock; scheduler: Scheduler; contentDigest: string;
  resolveLayout(id: string): ShipLayout; onCrash(record: CrashRecord<T>): void;
  botControllers?(): Readonly<T['controllers']>;
  beforeControls?(): void; beforeTick?(nextTick: number, tickTimeMs: number): void;
  /** Trusted couch adapter only; never exposed on Link or assigned a player command ID.
   * The unsubscriber releases only its registration, preserving a newer replacement callback. */
  bindLifecyclePause?(request: (control: LifecyclePause) => void): void | Unsubscribe;
}
export type AuthorityDeps = EncounterAuthorityDeps<SectorTypes>;
/** Live Net-1a owner: closed held/command/contextual-callout ingress; durable restore belongs to Net-1b. */
export interface Authority1a<T extends EncounterTypes = SectorTypes> { attach(link: Link, players: readonly number[], options?: AttachOptions<T['snapshot']>): Unsubscribe; start(init: T['init']): void; pump(): void; dispose(): void }
export interface Authority<T extends EncounterTypes = SectorTypes> extends Authority1a<T> {
  requestCheckpoint(cause: CaptureCause): Promise<{ checkpoint: CheckpointOf<T>; cause: CaptureCause }>;
  completeBootstrap(): void;
  checkpoint(botControllers: Readonly<T['controllers']>): CheckpointOf<T>;
  /** Restore paused with no attached producers. Retire old client/transport queues,
   * then attach fresh producers synchronized from the restored publication. */
  restore(checkpoint: CheckpointOf<T>): void;
  replay(): Replay<T>;
}
export function createAuthority(deps: AuthorityDeps): Authority { return createEncounterAuthority(sectorRules, deps); }
export function createEncounterAuthority<T extends EncounterTypes>(rules: EncounterRules<T>, deps: EncounterAuthorityDeps<T>): Authority<T> {
  let core: ReturnType<typeof createEncounterCore<T>> | null = null, disposed = false;
  const attached = new Map<Link, { players: readonly number[]; options: AttachOptions<T['snapshot']>; off?: Unsubscribe }>();
  return {
    attach(link, players, options = {}) {
      if (disposed || attached.has(link)) throw new Error('authority unavailable');
      if (options.admissionPolicy !== undefined && options.admissionPolicy !== 'strict' && options.admissionPolicy !== 'receive-time') throw new Error('invalid admission policy');
      const entry = { players: [...players], options: { ...options }, off: core?.attach(link, players, options) }; attached.set(link, entry);
      return () => { entry.off?.(); attached.delete(link); };
    },
    start(value) {
      if (disposed) throw new Error('authority disposed');
      const init = rules.validateInit(value, deps.contentDigest, deps.resolveLayout);
      const next = createEncounterCore(rules, { ...deps, init }, rules.create(init, deps.resolveLayout));
      try {
        core?.dispose(); core = next;
        for (const [link, entry] of attached) entry.off = next.attach(link, entry.players, entry.options);
      } catch (error) {
        try { next.dispose(); } finally { core = null; }
        throw error;
      }
    },
    replay() { if (!core || disposed) throw new Error('authority unavailable'); return core.replay(); },
    requestCheckpoint(cause) { if (!core || disposed) return Promise.reject(Error('authority unavailable')); return core.requestCheckpoint(cause); },
    completeBootstrap() { if (!core || disposed) throw Error('authority unavailable'); core.completeBootstrap(); },
    checkpoint(botControllers) { if (!core || disposed) throw new Error('authority unavailable'); return core.checkpoint(botControllers); },
    restore(checkpoint) {
      if (disposed) throw new Error('authority disposed');
      if (attached.size) throw new Error('detach all producers before restore');
      const cp = rules.validateCheckpoint(checkpoint, deps.contentDigest, deps.resolveLayout);
      const next = createEncounterCore(rules, { ...deps, init: cp.init }, rules.restore(cp.snapshot, deps.resolveLayout, cp.modeMemory), cp, true);
      try {
        core?.dispose(); core = next;
      } catch (error) { try { next.dispose(); } finally { core = null; } throw error; }
    },
    pump() { core?.pump(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { core?.dispose(); } finally { core = null; attached.clear(); }
    }
  };
}
```

Replace the whole of `src/renderer/src/authority/replay.ts` with:

```ts
// Portable replays for any mode (engine refactor spec §6). A replay records its `mode`; absent means 'sector', so
// every V2/V3/V4 file recorded before R-1 parses unchanged. The mode's rules supply the checkpoint, snapshot and
// command validators. parseReplay and runReplay are the sector instances, kept for their callers.
import { z } from 'zod';
import { MAX_PLAYERS } from '../../../shared/intent';
import type { ShipLayout } from '../sim/ship/schema';
import type { CommandEnvelope, CommandResult } from '../net/contracts';
import type { SimState } from '../sim/state';
import { replayDataEqual, type Replay, type ReplayFrame } from '../sim/replay';
import { createEncounterCore } from './core';
import type { EncounterRules, EncounterTypes, ResolveLayout } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
export type { Replay, ReplayV2, ReplayV3, ReplayV4, ReplayFrame } from '../sim/replay';
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const players = z.array(uint.max(MAX_PLAYERS - 1)).max(MAX_PLAYERS).refine(a => new Set(a).size === a.length);
const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean() }).strict();
const action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admission'), entries: z.array(z.object({ binding: uint.min(1), players, order: uint.min(1), message: z.unknown(), admissionPolicy: z.literal('receive-time').optional(), effectiveTick: uint.optional() }).strict()).min(1).max(1024) }).strict(),
  z.object({ kind: z.literal('lifecycle'), order: uint.min(1), ordinal: uint.min(1), control: z.object({ paused: z.boolean(), reason: z.string().min(1).max(128) }).strict() }).strict(),
  z.object({ kind: z.literal('controls'), processedCount: uint.optional(), fenced: z.literal(true).optional() }).strict(),
  z.object({ kind: z.literal('tick'), input: z.object({ held: z.array(held).min(1).max(MAX_PLAYERS), commands: z.array(z.unknown()).max(256) }).strict(), heldSequences: z.array(uint).min(1).max(MAX_PLAYERS) }).strict(),
  z.object({ kind: z.literal('detach'), binding: uint.min(1), players }).strict(),
  z.object({ kind: z.literal('watchdog'), players: players.refine(p => p.length > 0) }).strict(),
  z.object({ kind: z.literal('cursor'), receiveOrder: uint }).strict(),
  z.object({ kind: z.literal('publish') }).strict(), z.object({ kind: z.literal('seal'), discardLifecycleResumes: z.literal(true).optional() }).strict()
]);
const frameSchema = z.object({ tick: uint, eventSequenceBefore: uint, action, results: z.array(z.unknown()).max(1024), events: z.array(z.object({ eventSequence: uint.min(1), tick: uint, kind: z.enum(['cue', 'pause', 'ended']) }).strict()).max(256),
  after: z.object({ tick: uint, hash: z.string().regex(/^[0-9a-f]{8}$/), phase: z.enum(['running', 'paused', 'ended', 'error']), eventSequence: uint, publicationSequence: uint, controlRevision: uint }).strict().optional()
}).strict();
/** Full validation occurs before constructing a simulation. No numeric-button fallback. */
export function parseReplay(layout: ShipLayout, value: unknown, contentDigest: string): Replay {
  return parseEncounterReplay(sectorRules, value, contentDigest, () => layout);
}
/** The mode a replay names: its `mode` field, or 'sector' when the field is absent. */
export function replayMode(value: unknown): string {
  const mode = (value as { mode?: unknown } | null)?.mode;
  return mode === undefined ? 'sector' : typeof mode === 'string' ? mode : '';
}
export function parseEncounterReplay<T extends EncounterTypes>(rules: EncounterRules<T>, value: unknown, contentDigest: string, resolveLayout: ResolveLayout): Replay<T> {
  const version = (value as { version?: unknown } | null)?.version;
  if (version !== 2 && version !== 3 && version !== 4) throw new Error('unsupported replay format (expected 2, 3 or 4)');
  if (replayMode(value) !== rules.modeId) throw new Error('replay mode does not match');
  const parsed = z.object({ version: z.union([z.literal(2), z.literal(3), z.literal(4)]), mode: z.string().min(1).max(64).optional(), init: z.unknown(), initial: z.unknown(), checkpoint: z.unknown(), frames: z.array(frameSchema).max(1_000_000) }).strict().parse(value);
  const { decodeMessage, encodeMessage } = rules.commandCodec();
  const checkpoint = rules.validateCheckpoint(parsed.checkpoint, contentDigest, resolveLayout);
  if (!replayDataEqual(parsed.init, checkpoint.init) || !replayDataEqual(parsed.initial, checkpoint.snapshot)) throw new Error('inconsistent replay baseline');
  let expectedTick = checkpoint.snapshot.header.tick;
  for (const frame of parsed.frames) {
    if (frame.tick !== expectedTick) throw new Error('invalid replay tick');
    frame.results = frame.results.map(result => {
      const decoded = decodeMessage(encodeMessage({ kind: 'result', runId: checkpoint.init.runId, result: result as CommandResult }));
      if (decoded.kind !== 'result') throw new Error('invalid replay result');
      if (version === 2 && decoded.result.admission !== undefined) throw new Error('v3 result in v2 replay');
      return decoded.result;
    });
    if (frame.action.kind === 'admission') for (const entry of frame.action.entries) {
      if (version === 2 && (entry.admissionPolicy !== undefined || entry.effectiveTick !== undefined)) throw new Error('v3 admission in v2 replay');
      if ((entry.admissionPolicy !== undefined) !== (entry.effectiveTick !== undefined) || (entry.effectiveTick !== undefined && entry.effectiveTick !== frame.tick)) throw new Error('invalid replay effective tick');
      const message = decodeMessage(encodeMessage(entry.message as Parameters<typeof encodeMessage>[0]));
      if (message.kind !== 'held' && message.kind !== 'command') throw new Error('replay contains nonsemantic message');
      entry.message = message;
      if (entry.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay player');
    }
    if (frame.action.kind === 'detach' && frame.action.players.some(p => p >= checkpoint.init.playerCount)) throw new Error('invalid replay detach');
    if (frame.action.kind === 'controls' && ((frame.action.processedCount !== undefined) !== (frame.action.fenced === true)
      || version !== 4 && frame.action.fenced)) throw Error('invalid replay control fence');
    if (frame.action.kind === 'seal' && frame.action.discardLifecycleResumes && version !== 4) throw Error('invalid replay fence seal');
    if (frame.action.kind === 'watchdog' && (version === 2 || frame.action.players.some(p => p >= checkpoint.init.playerCount))) throw new Error('invalid replay watchdog');
    if (frame.action.kind === 'tick') {
      expectedTick++;
      if (frame.action.input.held.length !== checkpoint.init.playerCount || frame.action.heldSequences.length !== checkpoint.init.playerCount) throw new Error('invalid replay held shape');
      frame.action.input.commands = frame.action.input.commands.map(envelope => {
        const message = decodeMessage(encodeMessage({ kind: 'command', envelope: envelope as CommandEnvelope }));
        if (message.kind !== 'command') throw new Error('invalid replay command');
        return message.envelope;
      });
    }
    if (frame.after && frame.after.tick !== expectedTick) throw new Error('invalid replay completion tick');
  }
  return { version: parsed.version, ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}), init: checkpoint.init, initial: checkpoint.snapshot, checkpoint, frames: parsed.frames as ReplayFrame[] };
}
export interface ReplayOptions {
  /** Default false: avoid retaining a second journal for long replay runs. */
  retainFrames?: boolean;
  /** Default true; false lets onFrame/observe sample without accumulating traces. */
  retainTrace?: boolean;
  onFrame?(frame: Readonly<ReplayFrame>): void;
}
/** Runs the live admission/phase executor directly; no wall-clock debt or producer callbacks. */
export function runReplay(layout: ShipLayout, value: unknown, contentDigest: string, observe?: (state: SimState, frame: Readonly<ReplayFrame>) => void, options: ReplayOptions = {}) {
  return runEncounterReplay<SectorTypes>(sectorRules, value, contentDigest, () => layout, observe, options);
}
export function runEncounterReplay<T extends EncounterTypes>(rules: EncounterRules<T>, value: unknown, contentDigest: string, resolveLayout: ResolveLayout, observe?: (state: T['state'], frame: Readonly<ReplayFrame>) => void, options: ReplayOptions = {}) {
  const replay = parseEncounterReplay(rules, value, contentDigest, resolveLayout);
  const state = rules.restore(replay.initial, resolveLayout, replay.checkpoint.modeMemory);
  const core = createEncounterCore(rules, { init: replay.init, contentDigest, resolveLayout, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(record) { throw new Error(record.error); } }, state, replay.checkpoint);
  const results: CommandResult[] = [], frames = [], hashes: string[] = [], events = [];
  try {
    for (const frame of replay.frames) {
      const actual = core.replayFrame(frame);
      if (frame.after && !replayDataEqual(actual.after, frame.after)) throw new Error(`replay outcome divergence at tick ${frame.tick}`);
      if (frame.after && !replayDataEqual(actual.results, frame.results)) throw new Error(`replay result divergence at tick ${frame.tick}`);
      if (frame.after && !replayDataEqual(actual.events, frame.events)) throw new Error(`replay event divergence at tick ${frame.tick}`);
      if (options.retainFrames) frames.push(actual);
      if (options.retainTrace !== false) {
        results.push(...actual.results); events.push(...actual.events);
        if (frame.action.kind === 'tick' && actual.after) hashes.push(actual.after.hash);
      }
      options.onFrame?.(actual);
      if (frame.action.kind === 'tick') observe?.(state, actual);
    }
    return { checkpoint: core.captureCheckpoint(), results, events, hashes, frames };
  } finally { core.dispose(); }
}
```

Replace the whole of `src/renderer/src/sim/replay.ts` with:

```ts
import type { ClientMessage, CommandResult, HeldInput, LifecyclePause, PublishedState, RunInit } from '../net/contracts';
import type { Snapshot } from './snapshot';
import type { Checkpoint } from '../net/contracts';
import type { TickInput } from './commands';
/** The type family a replay is generic over (authority/rules.ts EncounterTypes); the default is the sector's. */
export interface ReplayTypes { init: unknown; controllers: unknown; snapshot: unknown }
export interface SectorReplayTypes { init: RunInit; controllers: Checkpoint['botControllers']; snapshot: Snapshot }
import type { AdmissionPolicy } from '../net/receivePolicy';
export type ReplayAdmission = { binding: number; players: number[]; order: number; message: Exclude<ClientMessage, { kind: 'callout' }>; admissionPolicy?: AdmissionPolicy; effectiveTick?: number };
export type ReplayAction =
  | { kind: 'admission'; entries: ReplayAdmission[] }
  | { kind: 'lifecycle'; order: number; ordinal: number; control: LifecyclePause }
  | { kind: 'controls'; processedCount?: number; fenced?: true }
  | { kind: 'tick'; input: TickInput; heldSequences: number[] }
  | { kind: 'detach'; binding: number; players: number[] }
  | { kind: 'watchdog'; players: number[] }
  | { kind: 'publish' }
  | { kind: 'seal'; discardLifecycleResumes?: true }
  | { kind: 'cursor'; receiveOrder: number };
export interface ReplayOutcome {
  tick: number; hash: string; phase: PublishedState['phase']; eventSequence: number;
  publicationSequence: number; controlRevision: number;
}
export interface ReplayFrame {
  tick: number; eventSequenceBefore: number; action: ReplayAction;
  results: CommandResult[]; events: { eventSequence: number; tick: number; kind: 'cue' | 'pause' | 'ended' }[]; after?: ReplayOutcome;
}
/** Portable semantic replay. Auxiliary requests/presentation payloads are deliberately absent. `mode` names the
 *  encounter's mode; it is absent for the sector, so every V2/V3/V4 file recorded before R-1 parses unchanged. */
export interface ReplayV2<T extends ReplayTypes = SectorReplayTypes> { version: 2; mode?: string; init: T['init']; initial: T['snapshot']; checkpoint: Checkpoint<T['init'], T['controllers'], T['snapshot']>; frames: ReplayFrame[] }
export interface ReplayV3<T extends ReplayTypes = SectorReplayTypes> extends Omit<ReplayV2<T>, 'version'> { version: 3 }
/** V4 can record a permission fence inside a partially processed control drain. */
export interface ReplayV4<T extends ReplayTypes = SectorReplayTypes> extends Omit<ReplayV2<T>, 'version'> { version: 4 }
export type Replay<T extends ReplayTypes = SectorReplayTypes> = ReplayV2<T> | ReplayV3<T> | ReplayV4<T>;
export type { HeldInput };

/** Property insertion order is not part of portable JSON semantics. */
export function replayDataEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).sort(), right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, i) => key === right[i] && replayDataEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
```

Replace the whole of `src/renderer/src/app/session.ts` with:

```ts
import type { ShipLayout } from '../sim/ship/schema';
import type { SimState } from '../sim/state';
import { TICK_HZ } from '../sim/tuning';
import { createLocalRuntime } from './localRuntime';
import type { Scheduler, Unsubscribe } from '../net/contracts';
import { createDeviceManager, type SourceSample, type SlotInfo } from '../input/deviceManager';
import { NEUTRAL_FRAME, type InputFrame } from './intents';
import { createInputTimeline } from './inputTimeline';
import { buildHudModel, type HudModel } from '../render/hudModel';
import { EndReason } from '../sim/crew';
import { type TelemetryRecord } from '../sim/telemetry';
import { EMPTY_PROGRESS, applyRun, unlockNames, type Progress } from '../sim/progress';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { CUE_ORDER, type Cue } from '../events/audioCues';
import { calloutIcon } from '../events/callout';
import { bubbles, flashingKinds, type Callout, type Bubble } from '../render/calloutModel';
import { createCardUiState } from '../clientControl/cardController';

export const DEFAULT_SEED = 2026;
export const CREDITS_SCROLL_MS = 150;

export interface SessionDeps {
  /** The ship, or the ship for the run's player count (spec Demo-x-a section 3). */
  layout: ShipLayout | ((playerCount: number) => ShipLayout);
  sampleDevices(): SourceSample[];
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number, bubbles?: readonly Bubble[], ui?: import('../clientControl/cardController').CardUiState, presentation?: readonly import('../../../network/state/timeline').PresentationPoint[]): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  scheduler?: Scheduler;
  contentDigest?: string;
  authorityFactory?: (deps: import('../authority/authority').AuthorityDeps) => import('../authority/authority').Authority1a;
  saveCrash(payload: unknown): void;
  /** Called once with the run's record on the tick it ends (spec 4-ii section 7). */
  saveTelemetry?: (record: TelemetryRecord) => void;
  /** Whether a Confirm press may resume a paused session (false while the window is hidden or unfocused). */
  canResume?: () => boolean;
  credits?: readonly string[];
  /** Progress across runs (spec Run-iii section 6): read once at creation, written when a run ends. */
  loadProgress?: () => Progress;
  saveProgress?: (p: Progress) => void;
  /** Plays one audio cue (spec Demo-ii section 5); optional so tests and headless runs need no audio. */
  playCue?: (cue: Cue) => void;
}

export function createSession(deps: SessionDeps) {
  const dm = createDeviceManager();
  const lobbyUi = createCardUiState('lobby', 0);
  const credits = deps.credits ?? [];
  const LOBBY_MSG = 'Press Interact to join. Confirm: start. Cancel: credits';
  let progress: Progress = EMPTY_PROGRESS; try { progress = deps.loadProgress?.() ?? EMPTY_PROGRESS; } catch { progress = EMPTY_PROGRESS; }   // a throwing loader must not stop the session
  let newUnlocks: string[] = [];
  let phase: HudModel['phase'] = 'lobby';
  let message = LOBBY_MSG;
  let seed = DEFAULT_SEED;
  let state: SimState | null = null;
  let timeline: ReturnType<typeof createInputTimeline> | null = null;
  let slots: SlotInfo[] = [];
  let lastNow: number | null = null, runCounter = 0;
  let runtime: ReturnType<typeof createLocalRuntime> | null = null, cancelLobby: Unsubscribe | null = null;
  let disposed = false;
  const scheduler = deps.scheduler ?? { schedule: () => () => {} };
  const completedRuns = new Set<string>();
  const pendingCues = new Set<Cue>();
  let creditsOpen = false, creditsScroll = 0, scrollHold = 0, scrollDir = 0;
  let callouts: Callout[] = [];   // spec Coop-i section 3: app state only, never in Intent, replays or snapshots

  function scheduleLobby(): void {
    cancelLobby?.();
    if (!disposed && phase !== 'running' && phase !== 'paused') cancelLobby = scheduler.schedule(1000 / 120, () => { pump(); scheduleLobby(); });
  }
  function start(): void {
    cancelLobby?.(); runtime?.dispose(); deps.renderer?.reset();
    const playerCount = slots.filter((s) => s.status !== 'empty').length;
    const layout = typeof deps.layout === 'function' ? deps.layout(playerCount) : deps.layout;
    timeline = createInputTimeline(playerCount); newUnlocks = []; callouts = []; pendingCues.clear();
    phase = 'running'; message = '';
    runtime = createLocalRuntime({
      layout, playerCount, seed, characters: DEFAULT_CHARACTERS, unlocked: progress.unlocked,
      runId: `couch-${++runCounter}`, contentDigest: deps.contentDigest ?? __GAMEPLAY_CONTENT_DIGEST__,
      clock: { nowMs: deps.now }, scheduler, authorityFactory: deps.authorityFactory,
      beforeControls: sampleControls,
      frames: (_tick, deadline) => timeline!.consume(deadline),
      recordPrev: (view) => deps.renderer?.recordPrev(view),
      onPublication(view, publication) {
        state = view;
        if (phase === 'running' || phase === 'paused') {
          if (publication.phase === 'paused') { phase = 'paused'; message = 'PAUSED'; }
          else if (publication.phase === 'running') { phase = 'running'; message = publication.lagTicks > 0 ? `CATCHING UP (${publication.lagTicks} ticks)` : ''; }
        }
      },
      onEvent(event) {
        if (event.payload.kind === 'cue') { pendingCues.add(event.payload.cue); return; }
        if (event.payload.kind === 'callout') {
          const payload = event.payload;
          callouts = [...callouts.filter(c => c.pid !== payload.player && event.tick - c.tick < 3 * TICK_HZ), { pid: payload.player, tick: event.tick, text: payload.text, icon: calloutIcon(payload.text), flash: payload.station }].sort((a, b) => a.pid - b.pid);
          pendingCues.add('callout'); return;
        }
        if (event.payload.kind !== 'ended' || completedRuns.has(event.runId)) return;
        completedRuns.add(event.runId);
        const record = event.payload.record.record;   // the sector's TelemetryRecord, tagged on the wrapper (engine refactor spec §6)
        const next = applyRun(progress, record); newUnlocks = next.unlocked.filter((id) => !progress.unlocked.includes(id)); progress = next;
        phase = 'gameover';
        message = `${state!.endReason === EndReason.Hull ? 'HULL LOST' : state!.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'} after ${Math.floor(state!.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
        scheduleLobby();
        try { deps.saveTelemetry?.(record); } catch { /* Persistence cannot interrupt completion or cause a duplicate application. */ }
        try { deps.saveProgress?.(progress); } catch { /* Keep the once-applied in-memory profile when storage is unavailable. */ }
      },
      onCrash(record) { phase = 'error'; message = `Sim fault: ${record.error}. Crash data saved.`; deps.saveCrash(record); },
      draw(view, alpha) { deps.renderer?.draw(view, alpha, phase === 'running' || phase === 'paused' ? bubbles(view, callouts, view.tick) : [], runtime?.ui); }
    });
    state = runtime.state();
  }

  function anyPress(frames: { confirmPresses: number; cancelPresses: number }[], key: 'confirmPresses' | 'cancelPresses'): boolean {
    return frames.some((f) => f[key] > 0);
  }

  function doResume(reason?: string, player = 0): void {
    if (phase === 'paused') {
      if (reason) runtime?.requestLifecyclePause({ paused: false, reason });
      else runtime?.requestPause(false, player);
      phase = 'running'; message = ''; lastNow = null;
    }
  }

  function openCredits(): void { creditsOpen = true; creditsScroll = 0; scrollHold = 0; scrollDir = 0; }
  function closeCredits(): void { creditsOpen = false; }
  /** One line per CREDITS_SCROLL_MS while any active stick is held up or down; the first step in a new direction is immediate. */
  function scrollCredits(frames: readonly InputFrame[], deltaMs: number): void {
    let dir = 0;
    for (const f of frames) if (f.moveY > 0.5) { dir = 1; break; } else if (f.moveY < -0.5) { dir = -1; break; }
    const max = Math.max(0, credits.length - 1);
    const stepOnce = (): void => { creditsScroll = Math.max(0, Math.min(max, creditsScroll + dir)); };
    if (dir !== scrollDir) { scrollDir = dir; scrollHold = 0; if (dir !== 0) stepOnce(); return; }   // new direction: step now, hold from zero
    if (dir === 0) return;
    scrollHold += deltaMs;
    while (scrollHold >= CREDITS_SCROLL_MS) { scrollHold -= CREDITS_SCROLL_MS; stepOnce(); }
  }

  function sampleControls(): void {
      const now = deps.now();
      const deltaMs = lastNow === null ? 0 : Math.min(250, now - lastNow);
      lastNow = now;
      const wasActive = slots.map((s) => s.status === 'active');
      const { frames: raw, slots: s, joinedCount, callouts: calloutPresses } = dm.update(deps.sampleDevices(), phase === 'lobby' && !creditsOpen);
      // While the credits are open, a slot that became active this frame (a reclaim) gets no say this frame.
      const frames = creditsOpen ? raw.map((f, i) => (wasActive[i] && s[i]!.status === 'active') ? f : { ...NEUTRAL_FRAME }) : raw;
      slots = s;
      if (phase === 'paused' && anyPress(frames, 'confirmPresses') && (deps.canResume ?? (() => true))()) doResume(undefined, frames.findIndex((f) => f.confirmPresses > 0));
      if (phase === 'lobby') {
        if (creditsOpen) {
          if (anyPress(frames, 'cancelPresses') || anyPress(frames, 'confirmPresses')) closeCredits();   // Cancel wins; Confirm closes without starting
          else scrollCredits(frames, deltaMs);
        } else if (anyPress(frames, 'cancelPresses')) openCredits();
        else if (joinedCount > 0 && anyPress(frames, 'confirmPresses')) start();
      } else if (phase === 'running' && state && timeline) {
        timeline.sample(now, frames);
        const pressed = calloutPresses.flatMap((n, pid) => n > 0 ? [pid] : []);
        for (const pid of pressed) runtime?.callout(pid);
      } else if (phase === 'gameover') {
        if (anyPress(frames, 'cancelPresses')) { seed += 1; phase = 'lobby'; message = `New seed. ${LOBBY_MSG}`; }
        else if (anyPress(frames, 'confirmPresses')) { phase = 'lobby'; message = `Same seed. ${LOBBY_MSG}`; }
      }
  }
  function pump(): void {
    if (disposed) return;
    if (runtime && (phase === 'running' || phase === 'paused')) runtime.pump(); else sampleControls();
  }
  scheduleLobby();
  return {
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; }, get creditsOpen() { return creditsOpen; }, get callouts(): readonly Callout[] { return callouts; },
    pause(reason = 'suspend') { if (phase === 'running') { timeline?.neutralize(deps.now()); runtime?.requestLifecyclePause({ paused: true, reason }); phase = 'paused'; message = 'PAUSED'; } },
    resume(reason = 'resume') { doResume(reason); }, pump,
    dispose() { disposed = true; cancelLobby?.(); runtime?.dispose(); },
    frame() {
      for (const cue of CUE_ORDER) if (pendingCues.has(cue)) deps.playCue?.(cue); pendingCues.clear();
      if (phase !== 'error') runtime?.frame();
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, { mode: 'couch', ui: runtime?.ui ?? lobbyUi }, {
        slots, phase, message,
        credits: creditsOpen ? { lines: credits, scroll: creditsScroll } : null,
        progress: phase === 'gameover' || phase === 'lobby' ? { bestScore: progress.bestScore, runs: progress.runs, victories: progress.victories, newUnlocks: unlockNames(newUnlocks), unlocked: unlockNames(progress.unlocked) } : null,
        calloutFlash: state && phase === 'running' ? flashingKinds(callouts, state.tick) : [],
        callouts
      }));
    }
  };
}
```

- [ ] **Step 5: The two tests that build an `ended` event tag its record**

Replace the whole of `tests/netCodec.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { decodeMessage, encodeMessage, latestMessageMetadata, MAX_MESSAGE_BYTES } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, ClientMessage } from '../src/renderer/src/net/contracts';
import { commands, commandMessage, heldMessage } from './helpers/net';
import { createSimState } from './helpers/simLifetime';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { LAYOUT } from './helpers/sim';

const raw = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const roundTrip = (value: ClientMessage | AuthorityMessage) => decodeMessage(encodeMessage(value));
describe('closed wire codec', () => {
  it.each(commands)('round trips command $kind without adding fields', (command) => {
    expect(roundTrip(commandMessage(command))).toEqual(commandMessage(command));
  });
  it.each(commands)('rejects unknown fields on command $kind', (command) => {
    const message = commandMessage(command);
    if (message.kind !== 'command') throw new Error('fixture');
    expect(() => decodeMessage(raw({ ...message, envelope: { ...message.envelope, command: { ...command, bogus: true } } }))).toThrow();
  });
  it('round trips callout and rejects the removed bridge', () => {
    const callout: ClientMessage = { kind: 'callout', runId: 'run-1', player: 3, sequence: 1, calloutKind: 'contextual' };
    const legacy = { kind: 'legacyCardInput', runId: 'run-1', id: { player: 0, sequence: 1 }, requestedTick: 0,
      input: { station: 0, direction: 2, confirm: true } };
    expect(roundTrip(callout)).toEqual(callout);
    expect(() => decodeMessage(raw(legacy))).toThrow();
    expect(() => decodeMessage(raw({ ...callout, text: 'forged' }))).toThrow();
    expect(() => decodeMessage(raw({ ...callout, calloutKind: 'chat' }))).toThrow();
  });
  it('preserves raw diagonal, subnormal and one-ulp Float64 axes; normalizes negative zero', () => {
    for (const value of [0.8, Number.MIN_VALUE, 1 - Number.EPSILON / 2, -1, -0]) {
      const message = heldMessage(); message.frame.held.moveX = value;
      const decoded = roundTrip(message);
      expect(decoded).toEqual({ ...message, frame: { ...message.frame, held: { ...message.frame.held, moveX: value === 0 ? 0 : value } } });
    }
  });
  it.each([NaN, Infinity, -Infinity, 1.0000000000000002, -1.0000000000000002])('rejects invalid axis %s at encoding', (value) => {
    const message = heldMessage(); message.frame.held.moveX = value;
    expect(() => encodeMessage(message)).toThrow();
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe command sequences %s', (sequence) => {
    expect(() => decodeMessage(raw(commandMessage({ kind: 'stand' }, sequence)))).toThrow();
  });
  it('rejects zero sequence, unowned-range players, unsafe ticks/indexes and malformed nested refs', () => {
    expect(() => decodeMessage(raw(commandMessage({ kind: 'stand' }, 0)))).toThrow();
    const held = heldMessage(); held.frame.player = 4; expect(() => decodeMessage(raw(held))).toThrow();
    held.frame.player = 0; held.frame.tick = Number.MAX_SAFE_INTEGER + 1; expect(() => decodeMessage(raw(held))).toThrow();
    expect(() => decodeMessage(raw(commandMessage({ kind: 'sit', station: 65536 })))).toThrow();
    expect(() => decodeMessage(raw(commandMessage({ kind: 'scan', station: 0, target: { kind: 'object', stableId: 0 } })))).toThrow();
    expect(() => decodeMessage(raw({ kind: 'held', frame: { ...held.frame, tick: 0, held: { moveX: '0', moveY: 0, interactHeld: false } } }))).toThrow();
  });
  it('accepts old-run and unowned-but-in-range data structurally for authority admission', () => {
    expect(roundTrip(heldMessage(3, 1, 'previous-run'))).toEqual(heldMessage(3, 1, 'previous-run'));
  });
  it('rejects excess bytes, invalid UTF-8, malformed JSON and unknown tags', () => {
    expect(() => decodeMessage(new Uint8Array(MAX_MESSAGE_BYTES + 1))).toThrow();
    for (const data of [new Uint8Array([0xff]), raw({ kind: 'unknown' }), raw({ ...commandMessage(), extra: 1 }), raw({ kind: 'command', envelope: { command: { kind: 'unknown' } } }), new TextEncoder().encode('{')]) {
      expect(() => decodeMessage(data)).toThrow();
    }
  });
  it('round trips real state, results and every reliable event payload losslessly', () => {
    const sim = createSimState(LAYOUT, 2, 17);
    const state: AuthorityMessage = { kind: 'state', state: { runId: 'run-1', tick: 0, publicationSequence: 1,
      snapshot: saveSnapshot(sim), hash: '0123456789abcdef', phase: 'running', pauseReason: null, lagTicks: 0, tickTimeMs: null, pauseOwner: null, controlRevision: 0,
      commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 } };
    expect(roundTrip(state)).toEqual(state);
    const result: AuthorityMessage = { kind: 'result', runId: 'run-1', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'unsupported' } };
    expect(roundTrip(result)).toEqual(result);
    const payloads = [{ kind: 'cue' as const, cue: 'shot' as const }, { kind: 'callout' as const, player: 0, text: 'Need help!', station: null },
      { kind: 'pause' as const, paused: true, owner: 0, reason: 'focus' }, { kind: 'ended' as const, record: { mode: 'sector' as const, record: telemetryRecord(sim, 17) } }];
    for (const payload of payloads) {
      const message: AuthorityMessage = { kind: 'event', event: { runId: 'run-1', eventSequence: 1, tick: 0, payload } };
      expect(roundTrip(message)).toEqual(message);
      expect(() => decodeMessage(raw({ ...message, event: { ...message.event, payload: { ...payload, extra: true } } }))).toThrow();
    }
    expect(() => decodeMessage(raw({ ...result, result: { ...result.result, reason: 'anything' } }))).toThrow();
    expect(() => decodeMessage(raw({ ...state, state: { ...state.state, snapshot: { ...state.state.snapshot, values: [null] } } }))).toThrow();
  });
  it('extracts per-run/player latest metadata and leaves reliable messages outside latest streams', () => {
    expect(latestMessageMetadata(encodeMessage(heldMessage(0, 7)))).toEqual({ key: 'held:run-1:0', sequence: 7 });
    expect(latestMessageMetadata(encodeMessage(heldMessage(1, 3)))).toEqual({ key: 'held:run-1:1', sequence: 3 });
    expect(latestMessageMetadata(encodeMessage(commandMessage()))).toBeNull();
  });
});



describe('wire limit edges', () => {
  it('requires a bounded safe watermark for every player in all producer streams', () => {
    const snapshot = saveSnapshot(createSimState(LAYOUT, 2, 17));
    const message: AuthorityMessage & { kind: 'state' } = { kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1,
      snapshot, hash: 'h', phase: 'running', pauseReason: null, lagTicks: 0, tickTimeMs: null, pauseOwner: null, controlRevision: 0,
      commandHighWater: [0, Number.MAX_SAFE_INTEGER], heldHighWater: [0, Number.MAX_SAFE_INTEGER], auxiliaryHighWater: [0, Number.MAX_SAFE_INTEGER], eventSequence: 0 } };
    expect(roundTrip(message)).toEqual(message);
    for (const field of ['commandHighWater', 'heldHighWater', 'auxiliaryHighWater']) {
      for (const invalid of [undefined, [], [0], [0, 0, 0, 0, 0], [-1, 0], [0.5, 0], [Number.MAX_SAFE_INTEGER + 1, 0]]) {
        expect(() => decodeMessage(raw({ ...message, state: { ...message.state, [field]: invalid } }))).toThrow();
      }
    }
  });
  it('rejects raw JSON overflow/nonfinite axes and unknown nested input fields', () => {
    for (const number of ['1e309', '-1e309', 'null', '"0"']) {
      const data = new TextEncoder().encode('{"kind":"held","frame":{"runId":"r","player":0,"tick":0,"sequence":1,"held":{"moveX":' + number + ',"moveY":0,"interactHeld":false}}}');
      expect(() => decodeMessage(data)).toThrow();
    }
    const message = heldMessage();
    expect(() => decodeMessage(raw({ ...message, frame: { ...message.frame, held: { ...message.frame.held, pressed: true } } }))).toThrow();
  });
  it('accepts safe sequence/tick maximums without truncation and rejects zero auxiliary sequences', () => {
    const message = heldMessage(3, Number.MAX_SAFE_INTEGER); message.frame.tick = Number.MAX_SAFE_INTEGER;
    expect(roundTrip(message)).toEqual(message);
    expect(() => decodeMessage(raw({ kind: 'callout', runId: 'r', player: 0, sequence: 0, calloutKind: 'contextual' }))).toThrow();
  });
  it('rejects oversized encoding, excessive publication vectors and unknown RNG keys', () => {
    const sim = createSimState(LAYOUT, 2, 17), snapshot = saveSnapshot(sim);
    const message: AuthorityMessage & { kind: 'state' } = { kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1,
      snapshot, hash: 'h', phase: 'paused', pauseReason: 'player', lagTicks: 0, tickTimeMs: null, pauseOwner: 0, controlRevision: 1, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 } };
    expect(latestMessageMetadata(encodeMessage(message))).toEqual({ key: 'state:r', sequence: 1 });
    expect(() => decodeMessage(raw({ ...message, state: { ...message.state, commandHighWater: [0, 0, 0, 0, 0] } }))).toThrow();
    expect(() => decodeMessage(raw({ ...message, state: { ...message.state, snapshot: { ...snapshot, header: { ...snapshot.header, rngStates: { ...snapshot.header.rngStates, extra: 1 } } } } }))).toThrow();
    snapshot.values = Array(40_000).fill(1);
    expect(() => encodeMessage(message)).toThrow(/byte limit/);
    snapshot.values = Array(65_537).fill(0);
    expect(() => encodeMessage(message)).toThrow();
  });
  it('round trips full-range finite Float64 state values and normalizes negative zero', () => {
    const snapshot = saveSnapshot(createSimState(LAYOUT, 2, 17)); snapshot.values = [Number.MAX_VALUE, Number.MIN_VALUE, -0, 0.3333333333333333];
    const message: AuthorityMessage = { kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1, snapshot, hash: 'h', phase: 'running', pauseReason: null, lagTicks: 0, tickTimeMs: null,
      pauseOwner: null, controlRevision: 0, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 } };
    const decoded = roundTrip(message); if (decoded.kind !== 'state') throw new Error('fixture');
    expect(decoded.state.snapshot.values).toEqual([1.7976931348623157e308, 5e-324, 0, 0.3333333333333333]);
  });
});
```

Replace the whole of `tests/sectorStream.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { makeState, LAYOUT, teleport } from './helpers/sim';
import { ownTestCleanup, createSimState } from './helpers/simLifetime';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import type { Link, ChannelKind, PublishedState, AuthorityMessage } from '../src/renderer/src/net/contracts';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashF64 } from '../src/shared/hash';
import { createSectorRemoteClient, createSectorStreamBinding, publicationToImage, imageToPublication, encodeSectorNotification } from '../src/network/modes/sectorStream';
import { encodeFull, encodeStatePacket, decodeControl, encodeControl, classifyStreamPacket, decodeOpaquePacket, encodeOpaquePacket, decodeStatePacket, inspectState } from '../src/network/state/imageCodec';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { sectorMode } from '../src/network/modes/sector';
import { Health, Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { portEndpoint } from './helpers/portEndpoint';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';

function endpoint() {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const sent: { kind: ChannelKind; bytes: Uint8Array }[] = [], reasons: string[] = [];
  let closed = false;
  const link: Link = { peer: 'test', caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) { if (!closed) sent.push({ kind, bytes: bytes.slice() }); },
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    close(reason) { if (closed) return; closed = true; reasons.push(reason); for (const cb of [...closes]) cb(reason); },
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, sent, reasons, listeners: () => messages.size + closes.size, receive(bytes: Uint8Array, kind: ChannelKind = 'reliable-ordered') { for (const cb of [...messages]) cb(kind, bytes); } };
}
function fixture(players = 1) {
  const state = makeState(players), clock = { now: 0, nowMs() { return this.now; } };
  const init = { runId: 'stream', seed: 1, playerCount: players, characters: [], unlocked: [], contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION };
  const crashes: unknown[] = [];
  const authority = createFixtureAuthority({ init, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, clock,
    scheduler: { schedule: () => () => {} }, onCrash: e => crashes.push(e) }, state);
  return { state, clock, init, authority, crashes };
}
const options = { runId: 'stream', contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT };
function publication(state = makeState(1), sequence = 1): PublishedState {
  const snapshot = saveSnapshot(state);
  return { runId: 'stream', tick: state.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)),
    phase: 'running', pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null,
    commandHighWater: Array(state.playerCount).fill(0), heldHighWater: Array(state.playerCount).fill(0), auxiliaryHighWater: Array(state.playerCount).fill(0), eventSequence: 0 };
}

describe('sector publication and acceptance boundary', () => {
  it('discards all pre-ACK input without consuming IDs or replaying it after a valid full ACK', () => {
    const f = fixture(), wire = endpoint(), stream = createSectorStreamBinding(wire.link, { ...options, clock: f.clock, latestPayloadLimit: 4096 });
    ownTestCleanup(() => stream.dispose());
    f.authority.attach(stream.link, [0], { ...stream.attachOptions, admissionPolicy: 'receive-time' });
    const initial = inspectState(decodeStatePacket(wire.sent[0]!.bytes)).sequence;
    let ordinal = 0;
    const command = (sequence: number) => wire.receive(encodeOpaquePacket('input', 'command', ++ordinal, encodeMessage({ kind: 'command', envelope: {
      runId: 'stream', id: { player: 0, sequence }, requestedTick: 0, command: { kind: 'setPaused', paused: true }
    } })));
    command(1);
    wire.receive(encodeOpaquePacket('input', 'held:0', ++ordinal, encodeMessage({ kind: 'held', frame: {
      runId: 'stream', player: 0, tick: 0, sequence: 10, held: { moveX: 1, moveY: 0, interactHeld: true }
    } })), 'unreliable-latest');
    wire.receive(encodeOpaquePacket('input', 'callout', ++ordinal, encodeMessage({ kind: 'callout', runId: 'stream', player: 0, sequence: 10, calloutKind: 'contextual' })));
    f.authority.pump();
    expect(f.authority.checkpoint([])).toMatchObject({ commandHighWater: [0], heldHighWater: [0], receiveOrder: 0, phase: 'running' });
    // Retain a newer image without sending it (tick 1 is outside the cadence).
    const retainedState = makeState(1); retainedState.tick = 1;
    const retained = publication(retainedState, initial + 1);
    stream.attachOptions.publicationSink!(retained, false);
    wire.receive(encodeControl({ kind: 'full-received', sequence: initial }, ++ordinal)); command(1);
    wire.receive(encodeControl({ kind: 'ack', sequence: initial + 1 }, ++ordinal)); command(1);
    wire.receive(encodeControl({ kind: 'ack', sequence: 999 }, ++ordinal)); command(1); f.authority.pump();
    expect(f.authority.checkpoint([]).commandHighWater).toEqual([0]);
    wire.receive(encodeControl({ kind: 'ack', sequence: initial }, ++ordinal)); f.authority.pump();
    expect(f.authority.checkpoint([]).commandHighWater).toEqual([0]);
    command(1); f.authority.pump();
    expect(f.authority.checkpoint([])).toMatchObject({ commandHighWater: [1], phase: 'paused', heldHighWater: [0], receiveOrder: 1 });
    expect(wire.reasons).toEqual([]); expect(f.crashes).toEqual([]);
  });
  it('resets readiness for a replacement binding and accepts synchronous send-time ACK then input', () => {
    const wire = endpoint();
    const first = createSectorStreamBinding(wire.link, { ...options, clock: { nowMs: () => 0 }, latestPayloadLimit: 4096 });
    first.attachOptions.publicationSink!(publication(), true);
    wire.receive(encodeControl({ kind: 'ack', sequence: 1 }, 1)); first.dispose();
    const replacement = createSectorStreamBinding(wire.link, { ...options, clock: { nowMs: () => 0 }, latestPayloadLimit: 4096 });
    ownTestCleanup(() => replacement.dispose());
    const received: Uint8Array[] = []; replacement.link.onMessage((_, bytes) => received.push(bytes));
    const input = encodeOpaquePacket('input', 'callout', 2, encodeMessage({ kind: 'callout', runId: 'stream', player: 0, sequence: 1, calloutKind: 'contextual' }));
    wire.receive(encodeControl({ kind: 'ack', sequence: 1 }, 1)); wire.receive(input); expect(received).toEqual([]);
    const send = wire.link.send;
    wire.link.send = (kind, bytes) => {
      send(kind, bytes);
      const sequence = inspectState(decodeStatePacket(bytes)).sequence;
      wire.receive(encodeControl({ kind: 'ack', sequence }, 3)); wire.receive(input);
    };
    replacement.attachOptions.publicationSink!(publication(undefined, 2), true);
    expect(received).toHaveLength(1); expect(wire.reasons).toEqual([]);
  });
  it('streams a fully valid snapshot above the unchanged 65536 local JSON limit', () => {
    const width = 3202, layout = parseShip({ ...LAYOUT, id: 'long-hull', width, height: 5,
      rows: ['#'.repeat(width), ...Array(3).fill('#' + 'a'.repeat(width - 2) + '#'), '#'.repeat(width)],
      rooms: [{ id: 'a', name: 'Hull', system: null }], edges: [], airlocks: [], consoleGroups: [], magazine: undefined,
      stations: LAYOUT.stations.map((st, i) => ({ ...st, room: 'a', tile: [i + 2, 2] })), spawns: [[1, 1], [2, 1], [3, 1], [4, 1]],
      breachSites: Array.from({ length: 3200 }, (_, i) => ({ room: 'a', tile: [i + 1, 0], width: 1 })) });
    const state = createSimState(layout, 1, 1); state.breaches.repair.fill(0.12345678901234567);
    const value = publication(state), validation = { ...options, resolveLayout: () => layout };
    expect(new TextEncoder().encode(JSON.stringify({ kind: 'state', state: value })).length).toBeGreaterThan(65536);
    expect(() => encodeMessage({ kind: 'state', state: value })).toThrow('byte limit');
    const packet = encodeStatePacket(encodeFull(publicationToImage(value, validation)), 1); expect(packet.length).toBeLessThanOrEqual(131072);
    const wire = endpoint(), remote = createSectorRemoteClient(wire.link, [0], { ...validation, clock: { nowMs: () => 0 } }); ownTestCleanup(() => remote.dispose());
    wire.receive(packet); expect(remote.publication()).toEqual(value); expect(remote.commandStatus(0).canAllocate).toBe(true);
    const owner = createFixtureAuthority({ init: { runId: 'stream', seed: 1, playerCount: 1, characters: [], unlocked: [], contentDigest: options.contentDigest,
      layoutId: layout.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION }, ...validation, contentDigest: options.contentDigest,
      clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() { throw Error('unexpected crash'); } }, state);
    const captured: PublishedState[] = []; owner.attach(endpoint().link, [0], { publicationSink: p => captured.push(p) });
    expect(captured).toHaveLength(1); expect(captured[0]!.hash).toBe(value.hash);
  });
  it('delivers detached objects before encoding and keeps mixed local state and replay identical', () => {
    const f = fixture(2), local = endpoint(), remote = endpoint(), seen: PublishedState[] = [];
    f.authority.attach(local.link, [0]);
    f.authority.attach(remote.link, [1], { publicationSink(value) { seen.push(structuredClone(value)); value.hash = 'changed'; } });
    expect(remote.sent).toEqual([]);
    const last = decodeMessage(local.sent.at(-1)!.bytes);
    expect(last.kind).toBe('state');
    if (last.kind === 'state') expect(last.state).toEqual(seen.at(-1));
    expect(f.authority.replay().frames.at(-1)!.after!.hash).toBe(seen.at(-1)!.hash);
  });
  it('rejects malformed object metadata or snapshot before mutating a confirmed replica', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], options); ownTestCleanup(() => client.dispose());
    const first = publication(); expect(client.acceptPublication(first)).toBe('accepted');
    const replica = client.state(), prior = saveSnapshot(replica!);
    expect(client.acceptPublication(first)).toBe('ignored');
    expect(client.acceptPublication({ ...first, runId: 'other', publicationSequence: 2 })).toBe('ignored');
    expect(client.acceptPublication({ ...first, publicationSequence: 2, heldHighWater: [] })).toBe('rejected');
    const bad = structuredClone(first); bad.publicationSequence = 2; bad.snapshot.header.rngStates.hazards! ^= 1;
    expect(client.acceptPublication(bad)).toBe('rejected');
    const badValues = structuredClone(first); badValues.publicationSequence = 2; badValues.snapshot.values[6] = -1; badValues.hash = hashF64(Float64Array.from(badValues.snapshot.values));
    expect(client.acceptPublication(badValues)).toBe('rejected');
    expect(client.state()).toBe(replica); expect(saveSnapshot(replica!)).toEqual(prior);
  });
  it('rejects an exhausted producer watermark before changing the remote replica', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], { ...options, remoteStreaming: true, admissionPolicy: 'receive-time' }); ownTestCleanup(() => client.dispose());
    const state = makeState(1); client.acceptPublication(publication(state)); const before = saveSnapshot(client.state()!);
    state.tick = 3; const next = publication(state, 2); next.commandHighWater = [Number.MAX_SAFE_INTEGER];
    expect(client.acceptPublication(next)).toBe('rejected'); expect(saveSnapshot(client.state()!)).toEqual(before);
  });
  it('keeps remote production disabled until an explicit successful validated ACK', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], { ...options, admissionPolicy: 'receive-time', remoteStreaming: true });
    ownTestCleanup(() => client.dispose()); client.acceptPublication(publication());
    expect(client.commandStatus(0).canAllocate).toBe(false); client.callout(0); expect(wire.sent).toEqual([]);
    expect(client.acknowledgePublication(2)).toBe(false);
    expect(client.acknowledgePublication(1)).toBe(true); expect(client.commandStatus(0).canAllocate).toBe(true);
    wire.link.close('gone'); expect(client.acknowledgePublication(1)).toBe(false); expect(client.state()).toBeNull();
  });
  it('binds image identity to publication metadata and validates the whole snapshot', () => {
    const original = publication(), image = publicationToImage(original, options);
    expect(imageToPublication(image, options)).toEqual(original);
    expect(() => imageToPublication({ ...image, tick: 9 }, options)).toThrow();
    expect(() => imageToPublication({ ...image, epoch: 'wrong' }, options)).toThrow();
    const altered = JSON.parse(new TextDecoder().decode(image.metadata)); altered.snapshot.header.rngStates.hazards ^= 1;
    expect(() => imageToPublication({ ...image, metadata: new TextEncoder().encode(JSON.stringify(altered)) }, options)).toThrow();
  });
  it('enables the actual remote client after ACK and releases its world on close', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } });
    ownTestCleanup(() => client.dispose());
    wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1));
    expect(wire.sent.map(p => decodeControl(p.bytes).kind)).toEqual(['full-received', 'ack']);
    expect(client.commandStatus(0).canAllocate).toBe(true);
    const world = client.state()!; wire.link.close('gone'); expect(client.state()).toBeNull(); expect(world.crew).toEqual([]);
  });
  it('releases a replacement world when close occurs inside layout resolution', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], { ...options, remoteStreaming: true,
      resolveLayout() { wire.link.close('during-accept'); return LAYOUT; } }); ownTestCleanup(() => client.dispose());
    expect(client.acceptPublication(publication())).toBe('ignored'); expect(client.state()).toBeNull();
  });
  it.each(['throw', 'close'] as const)('never enables production when the initial ACK send will %s', behavior => {
    const wire = endpoint(), send = wire.link.send;
    wire.link.send = (kind, bytes) => { if (decodeControl(bytes).kind === 'ack') { if (behavior === 'throw') throw Error('failed'); wire.link.close('during-ack'); } else send(kind, bytes); };
    const client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1));
    expect(client.commandStatus(0).canAllocate).toBe(false); expect(client.state()).toBeNull();
  });
  it('does not retain stream listeners when an already closed link notifies during construction', () => {
    for (const remote of [true, false]) {
      const wire = endpoint(); wire.link.onClose = cb => { cb('already-closed'); return () => {}; };
      const owner = remote ? createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } })
        : createSectorStreamBinding(wire.link, { ...options, clock: { nowMs: () => 0 }, latestPayloadLimit: 4096 });
      expect(wire.listeners()).toBe(0); owner.dispose();
    }
  });
  it('reconciles results immediately but presents same-tick controls only after their covering publication', () => {
    const f = fixture(), host = endpoint(), guest = endpoint();
    const stream = createSectorStreamBinding(host.link, { ...options, clock: f.clock, latestPayloadLimit: 4096 }); ownTestCleanup(() => stream.dispose());
    const client = createSectorRemoteClient(guest.link, [0], { ...options, clock: f.clock }); ownTestCleanup(() => client.dispose());
    f.authority.attach(stream.link, [0], { ...stream.attachOptions, admissionPolicy: 'receive-time' });
    const deliverHost = () => { for (const p of host.sent.splice(0)) guest.receive(p.bytes, p.kind); };
    const deliverGuest = () => { for (const p of guest.sent.splice(0)) host.receive(p.bytes, p.kind); };
    deliverHost(); deliverGuest(); const initial = client.publication()!;
    const command = { runId: 'stream', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused' as const, paused: true } };
    client.send({ held: [], commands: [command] }); expect(client.commandStatus(0).pending).toBe(1); deliverGuest(); f.authority.pump();
    const packets = host.sent.splice(0), notifications = packets.filter(p => classifyStreamPacket(p.bytes).stream === 'sector-notification');
    expect(notifications).toHaveLength(2);
    for (const p of notifications) guest.receive(p.bytes, p.kind);
    expect(client.commandStatus(0).pending).toBe(0); expect(client.takeResults()).toEqual([]); expect(client.takeEvents()).toEqual([]);
    for (const p of packets.filter(p => classifyStreamPacket(p.bytes).stream === 'state')) { expect(p.kind).toBe('reliable-ordered'); guest.receive(p.bytes, p.kind); }
    expect(client.publication()!.tick).toBe(initial.tick); expect(client.publication()!.publicationSequence).toBe(initial.publicationSequence + 1);
    expect(client.takeResults()).toMatchObject([{ status: 'applied' }]); expect(client.takeEvents()).toMatchObject([{ payload: { kind: 'pause', paused: true } }]);
    host.receive(encodeOpaquePacket('input', 'command', 100, encodeMessage({ kind: 'command', envelope: command }))); f.authority.pump();
    expect(host.sent).toHaveLength(1); deliverHost(); expect(client.takeResults()).toMatchObject([{ status: 'applied' }]); expect(f.crashes).toEqual([]);
  });
  it('preserves a codec-valid ended notification over 4 KiB with a bounded reliable envelope', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    const state = makeState(1), record = telemetryRecord(state, 1); record.run.unlocks = Array.from({ length: 100 }, (_, i) => `${i}:${'x'.repeat(100)}`);
    const message: AuthorityMessage = { kind: 'event', event: { runId: 'stream', eventSequence: 1, tick: 0, payload: { kind: 'ended', record: { mode: 'sector', record } } } };
    const bytes = encodeMessage(message); expect(bytes.length).toBeGreaterThan(4096);
    const packet = encodeSectorNotification(message, 1, 1); expect(decodeOpaquePacket(packet).bytes.subarray(9)).toEqual(bytes);
    wire.receive(packet); wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(state), options)), 2));
    expect(client.takeEvents()).toEqual([message.event]); expect(wire.reasons).toEqual([]);
  });
  it('requires trusted streaming selection and negotiated payload cap on mode attachment', () => {
    let pump = () => {};
    const f = fixture(), mode = sectorMode.createHost({ contentDigest: options.contentDigest, clock: f.clock,
      scheduler: { schedule: (_, callback) => { pump = callback; return () => {}; } }, onCrash() {} }); ownTestCleanup(() => mode.dispose());
    mode.start(new TextEncoder().encode(JSON.stringify(f.init)));
    expect(() => mode.attach(endpoint().link, [0], 'receive-time', { streamed: true })).toThrow();
    const wire = endpoint(); mode.attach(wire.link, [0], 'receive-time', { streamed: true, latestPayloadLimit: 4096 });
    pump(); // Queued ownership is installed at a completed authority boundary.
    expect(classifyStreamPacket(wire.sent[0]!.bytes).stream).toBe('state');
    mode.dispose(); expect(wire.listeners()).toBe(0);
  });
  it('bounds queued remote notifications by count below the byte budget', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    for (let i = 1; i <= 1024; i++) wire.receive(encodeSectorNotification({ kind: 'result', runId: 'stream', result: { id: { player: 0, sequence: i }, tick: 0, status: 'noop' } }, 1000, i));
    expect(wire.reasons).toEqual([]);
    wire.receive(encodeSectorNotification({ kind: 'result', runId: 'stream', result: { id: { player: 0, sequence: 1025 }, tick: 0, status: 'noop' } }, 1000, 1025));
    expect(wire.reasons).toEqual(['notification-history-unavailable']); expect(client.takeResults()).toEqual([]);
  });
  it('rejects an unreliable full before replica mutation', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1), 'unreliable-latest');
    expect(wire.reasons).toHaveLength(1); expect(client.state()).toBeNull();
  });
  it.each(['direction', 'unreliable', 'malformed', 'oversized'] as const)('rejects %s notifications before accepting gameplay', failure => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    const notification = encodeSectorNotification({ kind: 'result', runId: 'stream', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'applied' } }, 1, 1);
    const payload = decodeOpaquePacket(notification).bytes;
    if (failure === 'malformed') payload[0] = 2;
    const packet = failure === 'direction' ? encodeOpaquePacket('input', 'command', 1, encodeMessage({ kind: 'callout', runId: 'stream', player: 0, sequence: 1, calloutKind: 'contextual' }))
      : failure === 'oversized' ? encodeOpaquePacket('state', 'sector-notification', 1, new Uint8Array(65546))
      : encodeOpaquePacket('state', 'sector-notification', 1, payload);
    wire.receive(packet, failure === 'unreliable' ? 'unreliable-latest' : 'reliable-ordered');
    expect(wire.reasons).toHaveLength(1); expect(client.state()).toBeNull(); expect(client.takeResults()).toEqual([]);
  });
  it('rejects guest state writes and wrongly channeled input before authority ingress', () => {
    for (const statePacket of [true, false]) {
      const f = fixture(), wire = endpoint(), stream = createSectorStreamBinding(wire.link, { ...options, clock: f.clock, latestPayloadLimit: 4096 }); ownTestCleanup(() => stream.dispose());
      f.authority.attach(stream.link, [0], stream.attachOptions); const before = f.authority.cursors();
      const packet = statePacket ? encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1)
        : encodeOpaquePacket('input', 'command', 1, encodeMessage({ kind: 'command', envelope: { runId: 'stream', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } }));
      wire.receive(packet, 'unreliable-latest'); f.authority.pump();
      expect(wire.reasons).toHaveLength(1); expect(f.authority.cursors()).toEqual(before); expect(f.crashes).toEqual([]);
    }
  });
  it('bounds queued remote notifications by bytes as well as count', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    const record = telemetryRecord(makeState(1), 1); record.run.unlocks = Array.from({ length: 100 }, (_, i) => `${i}:${'x'.repeat(100)}`);
    for (let i = 1; i <= 100; i++) wire.receive(encodeSectorNotification({ kind: 'event', event: { runId: 'stream', eventSequence: i, tick: 0, payload: { kind: 'ended', record: { mode: 'sector', record } } } }, 1000, i));
    expect(wire.reasons).toEqual(['notification-history-unavailable']); expect(client.takeEvents()).toEqual([]);
  });
  it('keeps presentation separate with stable player IDs and snaps same-tick teleport, seat and target changes', () => {
    const wire = endpoint(), clock = { now: 0, nowMs() { return this.now; } }, state = makeState(1);
    const client = createSectorRemoteClient(wire.link, [0], { ...options, clock }); ownTestCleanup(() => client.dispose()); let seq = 0;
    const publish = (overrides: Partial<PublishedState> = {}) => { const p = { ...publication(state, ++seq), ...overrides }; wire.receive(encodeStatePacket(encodeFull(publicationToImage(p, options)), seq)); return p; };
    publish(); const first = client.presentation.sample(0)[0]!; expect(first.id).toBe('crew:0'); expect(Object.keys(first).sort()).toEqual(['generation', 'id', 'x', 'y']);
    const eid = state.crew[0]!; teleport(state, 0, Position.x[eid]! + 0.1, Position.y[eid]!); publish();
    const teleported = client.presentation.sample(0)[0]!; expect(teleported.x).toBeCloseTo(first.x + 0.1); expect(teleported.generation).not.toBe(first.generation);
    sitDown(state, 0, 0); publish(); const seated = client.presentation.sample(0)[0]!; expect(seated.generation).not.toBe(teleported.generation);
    state.weapons.target = { kind: 'object', stableId: 99 }; publish(); expect(client.presentation.sample(0)[0]!.generation).not.toBe(seated.generation);
    const confirmed = saveSnapshot(client.state()!); client.presentation.sample(10000); expect(saveSnapshot(client.state()!)).toEqual(confirmed);
    wire.link.close('end'); expect(client.presentation.sample(10000)).toHaveLength(1); client.dispose(); expect(client.presentation.sample(10000)).toEqual([]);
  });
  it.each(['teleport', 'seat', 'weapons-target', 'science-target', 'life', 'sector', 'ended'] as const)('snaps %s from populated advancing-tick interpolation history', transition => {
    const wire = endpoint(), clock = { now: 0, nowMs() { return this.now; } }, state = makeState(1);
    const client = createSectorRemoteClient(wire.link, [0], { ...options, clock }); ownTestCleanup(() => client.dispose());
    const eid = state.crew[0]!; let sequence = 0;
    // End the history within legal movement distance of the seat, so seating
    // must be detected by its own generation field rather than teleport inference.
    sitDown(state, 0, 0); const seatX = Position.x[eid]!, y = Position.y[eid]!; standUp(state, 0);
    const startX = seatX - 0.12;
    const publish = (phase: PublishedState['phase'] = 'running') => {
      const value = { ...publication(state, ++sequence), phase };
      wire.receive(encodeStatePacket(encodeFull(publicationToImage(value, options)), sequence));
    };
    for (const tick of [0, 3, 6, 9]) {
      state.tick = tick; clock.now = tick * 1000 / 60; teleport(state, 0, startX + tick * 0.01, y); publish();
    }
    const before = client.presentation.sample(150)[0]!;
    expect(before.x).toBeCloseTo(startX + 0.03); expect(before.id).toBe('crew:0');
    state.tick = 12; clock.now = 200; teleport(state, 0, startX + 0.12, y);
    if (transition === 'teleport') teleport(state, 0, seatX + 1, y);
    if (transition === 'seat') sitDown(state, 0, 0);
    if (transition === 'weapons-target') state.weapons.target = { kind: 'object', stableId: 99 };
    if (transition === 'science-target') state.science.target = { kind: 'object', stableId: 99 };
    if (transition === 'life') { Life.state[eid] = LifeState.Downed; Health.cur[eid] = 0; Life.bleed[eid] = 15; }
    if (transition === 'sector') state.run.sector = 1;
    if (transition === 'ended') { state.ended = 1; state.endReason = 1; }
    publish(transition === 'ended' ? 'ended' : 'running');
    expect(wire.reasons).toEqual([]); expect(client.publication()!.tick).toBe(12);
    const confirmed = saveSnapshot(client.state()!), expectedX = transition === 'teleport' ? seatX + 1 : seatX;
    for (const now of [200, 225, 250, 251, 10000]) {
      const point = client.presentation.sample(now)[0]!;
      expect(point.x).toBeCloseTo(expectedX); expect(point.y).toBe(y);
      if (transition === 'sector' || transition === 'ended') expect(point.generation).toBe(before.generation);
      else expect(point.generation).not.toBe(before.generation);
    }
    expect(saveSnapshot(client.state()!)).toEqual(confirmed);
  });
  it('forwards trusted stream options and uses generic latest keys for a second mode', () => {
    let selected: unknown; const port = portEndpoint();
    const runtime = createHostRuntime(createModeRegistry([{ modeId: 'counter', schemaVersion: 1, simVersion: 9,
      latestStreamKey() { throw Error('legacy classifier must not see stream framing'); },
      createHost: () => ({ completeBootstrap() {}, start() {}, restore() {}, pause() {}, checkpoint: () => new Uint8Array([1]), dispose() {},
        async captureCheckpoint(cause) { return { cause, capturedTick: 0, controlRevision: 0, bytes: new Uint8Array([1]) }; },
        attach(link, _players, _policy, chosen) { selected = chosen; link.send('unreliable-latest', encodeOpaquePacket('input', 'held:0', 1, new Uint8Array([1]))); return () => {}; } }) }]),
      { contentDigest: options.contentDigest, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() {} }, { modeId: 'counter', schemaVersion: 1, simVersion: 9, hostGeneration: 1 });
    ownTestCleanup(() => runtime.dispose()); runtime.handle({ kind: 'start', requestId: 1, hostGeneration: 1, initBytes: new Uint8Array([1]) });
    runtime.attachPeer('p', [0], port.port, { streamed: true, latestPayloadLimit: 4096 });
    expect(selected).toEqual({ streamed: true, latestPayloadLimit: 4096 }); expect(port.closed).toBe(false); expect(port.sent).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run the new test, the sector's replay, golden and determinism tests, and the authority tests**

Run: `npx vitest run tests/encounterAuthority.test.ts tests/netCodec.test.ts tests/sectorStream.test.ts tests/replayV2.test.ts tests/replayV3.test.ts tests/golden.test.ts tests/determinismHarness.test.ts tests/netLedger.test.ts tests/checkpointV2.test.ts tests/crashRecordV2.test.ts tests/restoreRecovery.test.ts tests/authority.test.ts tests/authorityLease.test.ts tests/authorityDisconnect.test.ts tests/modeHost.test.ts tests/boundary.test.ts`
Expected: PASS, 363 tests in 16 files. Apart from the new file and the two `ended` tag edits, every one of these runs unedited.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/authority/rules.ts src/renderer/src/authority/sectorRules.ts src/renderer/src/authority/core.ts src/renderer/src/authority/authority.ts src/renderer/src/authority/replay.ts src/renderer/src/authority/ledger.ts src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/replay.ts src/renderer/src/app/session.ts tests/encounterAuthority.test.ts tests/netCodec.test.ts tests/sectorStream.test.ts
git commit -q -m "feat(authority): the generic authority over EncounterRules, the sector rules, the mode codec and mode-aware replays (engine refactor R-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: One command union and result type

**Files:**
- Create: `tests/commandUnion.test.ts`
- Modify (whole file): `src/renderer/src/sim/duel/commands.ts`, `src/renderer/src/sim/duel/step.ts`, `src/renderer/src/sim/duel/scripted.ts`, `src/renderer/src/app/duel/runtime.ts`, `tests/duel.test.ts`, `tests/duelControls.test.ts`, `tests/duelInterior.test.ts`, `tests/duelReadout.test.ts`, `tests/duelTelemetry.test.ts`, `tests/helpers/scriptedDuel.ts`

**Interfaces:**
- Consumes: Task 1's `DuelCommand`, `CommandEnvelope<C>`, `CommandReason`, `CommandResult`, `COMMAND_REASONS`, `createLedger(…, codec)`, `sectorCodec`.
- Produces: `sim/duel/commands.ts`: `LOCAL_DUEL_RUN = 'duel'`; `type DuelEnvelope = CommandEnvelope<DuelCommand>`; `type DuelReason = CommandReason`; `type DuelResult = CommandResult`; re-exports `DuelCommand`.

- [ ] **Step 1: Write the failing test**

Create `tests/commandUnion.test.ts`:

```ts
// One command union, result type and reason enum (engine refactor spec §6, R-1a): the duel's commands are members of
// Command, its envelopes carry a runId, its reasons join the closed COMMAND_REASONS enum the codec validates, and the
// result keeps `already-processed` and the wire-only `admission`. The ledger validates with the mode's codec and tags
// the sector end record on its wrapper.
import { describe, expect, it } from 'vitest';
import { createLedger } from '../src/renderer/src/authority/ledger';
import { COMMAND_REASONS, type CommandEnvelope, type CommandResult } from '../src/renderer/src/net/contracts';
import { createMessageCodec, decodeMessage, encodeMessage, sectorCodec } from '../src/renderer/src/net/codec';
import { LOCAL_DUEL_RUN, type DuelEnvelope, type DuelResult } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { makeState } from './helpers/sim';
import { CUTTER } from './helpers/scriptedDuel';

describe('one command union and result type', () => {
  it('the duel reasons are members of the closed reason enum the result codec validates', () => {
    expect(COMMAND_REASONS.slice(-3)).toEqual(['not-in-duel', 'not-at-weapons', 'missile-in-flight']);
    for (const reason of ['not-in-duel', 'not-at-weapons', 'missile-in-flight'] as const) {
      const message = { kind: 'result' as const, runId: 'r', result: { id: { player: 0, sequence: 1 }, tick: 3, status: 'rejected' as const, reason } };
      expect(decodeMessage(encodeMessage(message))).toEqual(message);
    }
    expect(() => encodeMessage({ kind: 'result', runId: 'r', result: { id: { player: 0, sequence: 1 }, tick: 3, status: 'rejected', reason: 'made-up' } } as never)).toThrow();
  });
  it('keeps already-processed and the wire-only admission metadata', () => {
    const processed = { kind: 'result' as const, runId: 'r', result: { id: { player: 0, sequence: 1 }, tick: 3, status: 'already-processed' as const, admission: { expectedSequence: 2, disposition: 'terminal' as const } } };
    expect(decodeMessage(encodeMessage(processed))).toEqual(processed);
  });
  it('a duel envelope is a CommandEnvelope with a runId, and a duel result is a CommandResult', () => {
    const d = createDuel(CUTTER, 1);
    try {
      const other = [0, 1, 2, 3].find((k) => k !== d.nav && k !== d.weapons)!;   // a console the duel does not use
      const sit: DuelEnvelope = { runId: LOCAL_DUEL_RUN, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'sit', station: other } };
      const shared: CommandEnvelope = sit;
      expect(shared.runId).toBe('duel');   // an offline duel stamps LOCAL_DUEL_RUN
      const results: DuelResult[] = stepDuelTick(d, { held: [], commands: [shared as DuelEnvelope] });
      const typed: CommandResult[] = results;
      expect(typed).toEqual([{ id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'not-in-duel' }]);
    } finally { disposeDuel(d); }
  });
  it('the ledger validates envelopes with the mode codec: a kind the mode does not own is malformed', () => {
    const ledger = createLedger([0], 1, sectorCodec);
    const presence: CommandEnvelope = { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'presence', present: false } };
    expect(ledger.admit(presence, 0)).toEqual({ status: 'rejected', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'malformed' } });
    const pause: CommandEnvelope = { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } };
    expect(ledger.admit(pause, 0)).toEqual({ status: 'queued' });
    expect(() => createMessageCodec(2).encodeMessage({ kind: 'command', envelope: { ...pause, id: { player: 2, sequence: 1 } } })).toThrow();
    expect(sectorCodec(2).encodeMessage({ kind: 'command', envelope: pause })).toEqual(createMessageCodec(2).encodeMessage({ kind: 'command', envelope: pause }));
  });
  it('the sector end record is tagged on the wrapper; the record itself is unchanged', () => {
    const record = telemetryRecord(makeState(), 5);
    const event = { kind: 'event' as const, event: { runId: 'r', eventSequence: 1, tick: 0, payload: { kind: 'ended' as const, record: { mode: 'sector' as const, record } } } };
    expect(decodeMessage(encodeMessage(event))).toEqual(event);
    expect(() => encodeMessage({ ...event, event: { ...event.event, payload: { kind: 'ended', record } } } as never)).toThrow();
  });
});
```

Run: `npx vitest run tests/commandUnion.test.ts`
Expected: FAIL: the file does not load (`LOCAL_DUEL_RUN` is not exported yet).

- [ ] **Step 2: The duel on the shared types**

Replace the whole of `src/renderer/src/sim/duel/commands.ts` with:

```ts
// The duel's commands (Helm demo spec §13), now members of the one command union and result type in net/contracts.ts
// (engine refactor spec §6): DuelCommand is the duel's slice of Command, a duel envelope is a CommandEnvelope that
// carries a runId like every other, and the duel's reasons are members of COMMAND_REASONS.
import type { CommandEnvelope, CommandReason, CommandResult, DuelCommand } from '../../net/contracts';
export type { DuelCommand } from '../../net/contracts';

/** The run id a local (offline) duel stamps on its envelopes; an authority duel uses its init's runId. */
export const LOCAL_DUEL_RUN = 'duel';

export type DuelEnvelope = CommandEnvelope<DuelCommand>;
export type DuelReason = CommandReason;
export type DuelResult = CommandResult;
```

Replace the whole of `src/renderer/src/sim/duel/step.ts` with:

```ts
// One duel tick (spec §13 phase list). The sector step (sim/step.ts) is never called on the duel's interior; this runs
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
import type { CommandEnvelope, HeldInput } from '../../net/contracts';
import { applyConsoleCommand, applyInteractionCommands } from '../commands';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { inReachOfTile } from '../interact';
import { movementSystem } from '../movement';
import { stepDuel } from '../tactical/duel';
import { Outcome } from '../tactical/state';
import { canCharge, canLaunch, validLock, type ShipInput } from '../tactical/weapons';
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import type { DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';

export interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }

const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick. */
const WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch'] as const;

function resetScratch(d: DuelState): void {
  const sc = d.interior.scratch;
  sc.commandResults.length = 0;
  sc.doorToggles.clear(); sc.doorCycles.clear(); sc.airlockToggles.clear();
  sc.satThisTick.fill(0); sc.stoodThisTick.fill(0); sc.activeThisTick.fill(0);
  sc.voteChoices.fill(-1); sc.jumpConfirm.fill(0); sc.confirmUsed.fill(0);
}

/** A duel sit or stand as today's envelope, so today's validation and handlers apply unchanged. */
function sector(env: DuelEnvelope): CommandEnvelope {
  const c = env.command;
  return { runId: env.runId, id: env.id, requestedTick: env.requestedTick, command: c.kind === 'sit' ? { kind: 'sit', station: c.station } : { kind: 'stand' } };
}

/** The player seated at station i who is present, or −1. */
function attendant(d: DuelState, station: number): number {
  const pid = d.interior.stations.occupant[station]!;
  return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1;
}

function conscious(d: DuelState, pid: number): boolean { return Life.state[d.interior.crew[pid]!] === LifeState.Conscious; }
function seated(d: DuelState, pid: number): boolean { return Seated.station[d.interior.crew[pid]!]! >= 0; }

/** Each standing, present, conscious player holding Interact inside a damaged room's repair room and in reach of its
 *  point. Pushes a repairWork event per worker and a repairDone event per room whose level drops (H-0c-ii-a spec §4). */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.ships[0], workers: number[][] = [[], [], []];
  for (let pid = 0; pid < 2; pid++) {
    if (!d.present[pid as 0 | 1] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!);
    const point = d.points.find((p) => crewShip.rooms[p.tacticalRoom]! > 0 && p.room === here && inReachOfTile(d.interior, eid, p.tile));
    if (point) { workers[point.tacticalRoom]!.push(pid); d.events.push({ kind: 'repairWork', player: pid, room: point.tacticalRoom }); }
  }
  for (const p of d.points) {
    const r = p.tacticalRoom as 0 | 1 | 2, n = workers[r]!.length;
    if (crewShip.rooms[r] === 0) { d.repair[r] = 0; continue; }
    if (n === 0) continue;
    d.repair[r] += n === 1 ? REPAIR_RATE_SOLO : n * REPAIR_RATE_TEAM;
    if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; d.repair[r] = 0; d.events.push({ kind: 'repairDone', room: r, players: workers[r]! }); }
  }
}

/**
 * Spec §13, in order: scratch reset (and d.events cleared); seat phase (sit through today's interaction validation,
 * only at the two role consoles; stand through today's handler; then presence); tactical commands validated against the
 * seats after the seat phase and folded into the crew's ShipInput; repair, with its events; movement for standing
 * present players; the tactical stepDuel; the interior tick. Commands apply in the order given (the authority's
 * envelope order). Returns one result per command, sorted by player then sequence. Does nothing once the duel has ended.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return [];
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const result = (env: DuelEnvelope, reason?: DuelReason): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status: 'applied' });
  };
  resetScratch(d);
  d.events = [];

  // Seat phase: sits (today's validation), then stands (today's handler), then presence.
  const away = (e: DuelEnvelope): boolean => !d.present[e.id.player as 0 | 1];   // an away character stays exactly where it is (spec §8)
  const sits = input.commands.filter((e) => e.command.kind === 'sit');
  const allowedSits = sits.filter((e) => e.command.kind === 'sit' && (e.command.station === d.nav || e.command.station === d.weapons));
  for (const e of sits) if (!allowedSits.includes(e)) result(e, 'not-in-duel');
  const liveSits = allowedSits.filter((e) => { if (!away(e)) return true; result(e, 'unavailable'); return false; });
  applyInteractionCommands(st, liveSits.map(sector));
  for (const r of st.scratch.commandResults) results.push({ id: r.id, tick, status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  for (const e of input.commands) if (e.command.kind === 'stand') {
    if (away(e)) { result(e, 'unavailable'); continue; }
    const r = applyConsoleCommand(st, sector(e));
    results.push({ id: r.id, tick, status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  }
  for (const e of input.commands) if (e.command.kind === 'presence') {
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if ((e.id.player !== 0 && e.id.player !== 1) || typeof e.command.present !== 'boolean') { result(e, 'malformed'); continue; }
    d.present[e.id.player] = e.command.present; result(e);
  }

  // Tactical commands, against the seats as they now stand. Within a tick they take effect in a fixed order, lock, then
  // charge, then launch (the order applyWeaponsInput applies them), whatever their envelope order; admission is checked
  // in that same order so every result matches what happens. Within one kind, envelope order holds and the last wins.
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command;
    if (c.kind !== 'laserLock' && c.kind !== 'laserCharge' && c.kind !== 'missileLaunch') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    if (c.kind === 'laserLock') { if (!validLock(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
    else { if (!canLaunch(d.tactical, 0)) { result(e, 'unavailable'); continue; } crew.missileLaunch = true; }
    result(e);
  }
  for (const e of input.commands) if (!['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch'].includes(e.command.kind)) result(e, 'not-in-duel');
  if (helm >= 0) { const h = input.held[helm] ?? NO_HELD; crew.axes = { turn: h.moveX, thrust: -h.moveY }; }   // W (moveY −1, up) is thrust forward
  if (gunner >= 0) crew.steer = (input.held[gunner] ?? NO_HELD).moveX;

  repairPhase(d, input.held);
  const intents: Intent[] = [0, 1].map((pid) => {
    const h = input.held[pid] ?? NO_HELD;
    return d.present[pid as 0 | 1] ? { ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY } : { ...NEUTRAL_INTENT };
  });
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  stepDuel(d.tactical, crew);
  st.tick++;
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}
```

Replace the whole of `src/renderer/src/sim/duel/scripted.ts` with:

```ts
// The scripted pair (H-0c-ii-a spec §3): a deterministic headless crew for tests and telemetry only, never offered as a
// seat (Q15). Each tick it reads the duel and returns that tick's held input and commands. Player 0 flies (avoid, line
// up, orbit), player 1 fights (charge, release, lock, missile), and either walks to a repair by the nearest-free rule.
// It lives under sim/ so the determinism guard covers it; its only randomness is its own seeded stream.
import { createRng, nextFloat, type RngState } from '../../../../shared/rng';
import type { HeldInput } from '../../net/contracts';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt, solidAt } from '../grid';
import { inReachOfTile } from '../interact';
import { stationOnline } from '../stations';
import { hx, hy } from '../tactical/direction';
import { inArc, sideOf } from '../tactical/geometry';
import { queryGrid } from '../tactical/grid';
import { pursuitTurn } from '../tactical/hunter';
import { circularSpeed } from '../tactical/map';
import { predictPath } from '../tactical/predict';
import { Room, type Axes } from '../tactical/state';
import { BELT_OUTER, LASER_ARC_COS, LASER_HOLD_TICKS, LASER_RANGE, R_MAP, SHIP_RADIUS } from '../tactical/tuning';
import { canCharge, canLaunch, laserEligible, laserFull } from '../tactical/weapons';
import { CREW_SPEED, DT, REACH } from '../tuning';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope } from './commands';
import type { DuelState } from './state';
import type { DuelInput } from './step';

// The pair's own numbers (spec §3 "Tunable"), separate from the game tuning.
/** Ticks of predicted path the Helm checks for hazards, and the clearance it keeps from them (u). */
export const AVOID_TICKS = 90;
export const AVOID_MARGIN = 40;
/** Orbit radius correction: tan of the desired direction's tilt toward the planet per unit of radius error (1/u). */
export const ORBIT_GAIN = 0.004;
/** The orbit radius is drawn once per duel in [ORBIT_MIN, ORBIT_MAX] (spec: ≥ BELT_OUTER + 200, ≤ R_MAP − 600). */
export const ORBIT_MIN = 1500;
export const ORBIT_MAX = 2200;
/** Speed band around the circular speed inside which the Helm neither thrusts nor brakes (u/s). */
export const SPEED_SLACK = 8;
/** Ticks between two crew missile launches. */
export const MISSILE_GAP = 900;
/** Salt for the pair's own stream, so it never shares a sequence with rng.tactical. */
export const PAIR_SALT = 0x48454c4d;

/** tan 30°: the tilt clamp (the desired direction is t + tilt · inward, normalised). */
const TAN_30 = 0.5773502691896257;
const COS_45 = 0.7071067811865476;
const COS_10 = 0.984807753012208;
/** cos of one heading step (360° / 256): under it the nose counts as on the desired direction. */
const COS_STEP = 0.9996988186962042;
const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };

export interface ScriptedPair {
  rng: RngState;
  orbitR: number;
  /** Next command sequence per player. */
  seq: [number, number];
  /** The Helm's axes on the tick before (the avoidance prediction holds them). */
  axes: Axes;
  /** Tick of the last crew missile launch the pair sent. */
  lastLaunch: number;
  /** The tactical Room each character is assigned to repair, or −1. */
  task: [number, number];
}

export function createScriptedPair(seed: number): ScriptedPair {
  const rng = createRng((seed ^ PAIR_SALT) >>> 0);
  const orbitR = ORBIT_MIN + nextFloat(rng) * (ORBIT_MAX - ORBIT_MIN);
  return { rng, orbitR, seq: [0, 0], axes: { turn: 0, thrust: 0 }, lastLaunch: -MISSILE_GAP, task: [-1, -1] };
}

/** Turn toward (dx, dy): the sign of the heading error, ties clockwise. */
function turnToward(heading: number, dx: number, dy: number): number { return sideOf(heading, dx, dy) || 1; }

function len(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

/** Rule 1 (spec §3): the heading away from the first hazard on the predicted path, as a direction, or null. */
function hazardAway(d: DuelState, axes: Axes): { x: number; y: number } | null {
  const t = d.tactical, s = t.ships[0], p = t.map.planet, keep = SHIP_RADIUS + AVOID_MARGIN;
  for (const q of predictPath(t, 0, axes, AVOID_TICKS, 4)) {
    if (len(q.x - p.x, q.y - p.y) < p.r + keep) return { x: s.x - p.x, y: s.y - p.y };
    if (len(q.x, q.y) > t.map.rMap - AVOID_MARGIN) return { x: -s.x, y: -s.y };
    let best = -1, bestClear = 0;
    for (const k of queryGrid(t.grid, q.x, q.y, keep)) {
      const a = t.map.asteroids[k]!, dist = len(q.x - a.x, q.y - a.y);
      if (dist < a.r + keep && (best < 0 || dist - a.r < bestClear)) { best = k; bestClear = dist - a.r; }   // ascending k: ties keep the lower index
    }
    if (best >= 0) { const a = t.map.asteroids[best]!; return { x: s.x - a.x, y: s.y - a.y }; }
  }
  return null;
}

/** The Helm's axes (spec §3): avoid, then line up, then orbit. */
function helmAxes(pair: ScriptedPair, d: DuelState): Axes {
  const t = d.tactical, s = t.ships[0], e = t.ships[1];
  const away = hazardAway(d, pair.axes);
  if (away) return { turn: turnToward(s.heading, away.x, away.y), thrust: 1 };
  const ex = e.x - s.x, ey = e.y - s.y;
  if (laserFull(t, 0) && s.fireHeld && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
    return { turn: turnToward(s.heading, ex, ey), thrust: 0 };
  // Orbit: t is the prograde tangent (the way the ship already circles, clockwise at rest); tilt it toward the planet
  // when outside the radius and away when inside, by at most 30°.
  const r = len(s.x, s.y), ux = r > 0 ? s.x / r : 0, uy = r > 0 ? s.y / r : -1;
  const cw = s.x * s.vy - s.y * s.vx >= 0, tx = cw ? -uy : uy, ty = cw ? ux : -ux;
  const tilt = Math.max(-TAN_30, Math.min(TAN_30, ORBIT_GAIN * (r - pair.orbitR)));
  let dx = tx - ux * tilt, dy = ty - uy * tilt;
  const dl = len(dx, dy); dx /= dl; dy /= dl;
  const nose = hx(s.heading) * dx + hy(s.heading) * dy;
  const turn = nose >= COS_STEP ? 0 : turnToward(s.heading, dx, dy);
  const speed = len(s.vx, s.vy), vc = circularSpeed(r);
  let thrust = 0;
  if (nose < COS_45) thrust = 0;
  else if (speed > vc + SPEED_SLACK) thrust = -1;
  else if (speed < vc - SPEED_SLACK || s.vx * dx + s.vy * dy < COS_10 * speed) thrust = 1;
  return { turn, thrust };
}

// --- Walking (spec §3): a BFS over the Cutter's walkable tiles, doors held open, four-way only. ---

/** Tiles inside `room` whose centre is within REACH of tile `target`'s square: where a character can act on it. */
export function goalTiles(d: DuelState, room: number, target: number): Set<number> {
  const st = d.interior, w = st.derived.width, tx = target % w, ty = (target - tx) / w, out = new Set<number>();
  for (let i = 0; i < st.derived.roomOfTile.length; i++) {
    if (st.derived.roomOfTile[i] !== room) continue;
    const x = (i % w) + 0.5, y = Math.floor(i / w) + 0.5;
    const ddx = Math.max(tx - x, 0, x - (tx + 1)), ddy = Math.max(ty - y, 0, y - (ty + 1));
    if (Math.sqrt(ddx * ddx + ddy * ddy) <= REACH && !solidAt(st, i % w, Math.floor(i / w))) out.add(i);
  }
  return out;
}

/** Shortest four-way path from tile `from` to the nearest goal tile: the tiles to step through, without `from` itself
 *  ([] when `from` is a goal), or null when none is reachable. Neighbours in a fixed order (up, left, right, down), so
 *  the path is deterministic. Walkable means not solid (doors are held open in the duel). */
export function bfsPath(d: DuelState, from: number, goals: ReadonlySet<number>): number[] | null {
  const st = d.interior, w = st.derived.width, h = st.derived.height, prev = new Int32Array(w * h).fill(-2);
  if (goals.has(from)) return [];
  prev[from] = -1;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!, cx = c % w, cy = (c - cx) / w;
    for (const [nx, ny] of [[cx, cy - 1], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1]] as const) {
      if (solidAt(st, nx, ny)) continue;
      const n = ny * w + nx;
      if (prev[n] !== -2) continue;
      prev[n] = c;
      if (goals.has(n)) {
        const path: number[] = [];
        for (let k = n; k !== from; k = prev[k]!) path.push(k);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Held stick that moves pid toward the centre of the next path tile: first onto the current tile's centre line
 *  across the step, then along it, scaled so no tick overshoots a centre (a Recruit walks CREW_SPEED · DT a tick). */
function walkToward(d: DuelState, pid: number, next: number): HeldInput {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width, x = Position.x[eid]!, y = Position.y[eid]!;
  const nx = (next % w) + 0.5, ny = Math.floor(next / w) + 0.5, cx = Math.floor(x) + 0.5, cy = Math.floor(y) + 0.5;
  const step = CREW_SPEED * DT, clamp = (v: number): number => Math.max(-1, Math.min(1, v / step));
  if (Math.floor(nx) !== Math.floor(x)) {   // a step along x: line up on the row's centre first
    if (Math.abs(cy - y) > 1e-9) return { moveX: 0, moveY: clamp(cy - y), interactHeld: false };
    return { moveX: clamp(nx - x), moveY: 0, interactHeld: false };
  }
  if (Math.abs(cx - x) > 1e-9) return { moveX: clamp(cx - x), moveY: 0, interactHeld: false };
  return { moveX: 0, moveY: clamp(ny - y), interactHeld: false };
}
/** Held stick that walks pid toward the nearest goal tile, settling on its centre; neutral when none is reachable. */
function walkTo(d: DuelState, pid: number, goals: ReadonlySet<number>): HeldInput {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width;
  const from = Math.floor(Position.y[eid]!) * w + Math.floor(Position.x[eid]!);
  const path = bfsPath(d, from, goals);
  if (!path) return NO_HELD;
  return walkToward(d, pid, path.length > 0 ? path[0]! : from);
}

/** BFS tile distance from pid's tile to the room's goal tiles (0 in reach already), or Infinity. */
function walkDistance(d: DuelState, pid: number, goals: ReadonlySet<number>): number {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width;
  const path = bfsPath(d, Math.floor(Position.y[eid]!) * w + Math.floor(Position.x[eid]!), goals);
  return path ? path.length : Infinity;
}

/** As the sim's sit check (and app/duel/controls consoleInReach): pid standing in the console's room, in reach of its
 *  tile, with no member of its group occupied and one online. */
function canSit(d: DuelState, pid: number, i: number): boolean {
  const st = d.interior, eid = st.crew[pid]!;
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return false;
  const g = st.derived.stationGroup[i], members = g !== undefined && g >= 0 ? st.derived.groupStations[g]! : [i];
  if (members.some((j) => st.stations.occupant[j]! >= 0) || !members.some((j) => stationOnline(st, j))) return false;
  return st.derived.stationRoom[i] === roomAt(st, Position.x[eid]!, Position.y[eid]!) && inReachOfTile(st, eid, st.derived.stationTile[i]!);
}

/** As the sim's repair rule: pid standing in the room's repair room and in reach of its point. */
function inRepairReach(d: DuelState, pid: number, room: number): boolean {
  const st = d.interior, eid = st.crew[pid]!, p = d.points.find((q) => q.tacticalRoom === room)!;
  return Seated.station[eid]! < 0 && roomAt(st, Position.x[eid]!, Position.y[eid]!) === p.room && inReachOfTile(st, eid, p.tile);
}

/** Repair assignment (spec §3 nearest free character): damaged rooms without a repairer, higher level first, then Room
 *  order, each to the free character with the shortest walk, ties to player 1. A finished room frees its repairer. */
function assignRepairs(pair: ScriptedPair, d: DuelState): void {
  const rooms = d.tactical.ships[0].rooms;
  for (let pid = 0; pid < 2; pid++) if (pair.task[pid]! >= 0 && rooms[pair.task[pid]!] === 0) pair.task[pid as 0 | 1] = -1;
  const open = [Room.Weapons, Room.Shields, Room.Engines].filter((r) => rooms[r] >= 1 && !pair.task.includes(r)).sort((a, b) => rooms[b] - rooms[a]);
  for (const r of open) {
    const p = d.points.find((q) => q.tacticalRoom === r)!, goals = goalTiles(d, p.room, p.tile);
    let best = -1, bestDist = Infinity;
    for (const pid of [1, 0]) {
      if (pair.task[pid]! >= 0) continue;
      const dist = walkDistance(d, pid, goals);
      if (dist < bestDist) { best = pid; bestDist = dist; }
    }
    if (best >= 0) pair.task[best as 0 | 1] = r;
  }
}

/** The gunner's commands while seated at Weapons (spec §3), and the missile's steer. */
function gunner(pair: ScriptedPair, d: DuelState, out: DuelCommand[]): number {
  const t = d.tactical, s = t.ships[0], e = t.ships[1], ex = e.x - s.x, ey = e.y - s.y;
  const want = e.shields > 0 ? Room.Shields : Room.Weapons;
  if (s.lock !== want) out.push({ kind: 'laserLock', room: want });
  const m = t.missiles[0];
  if (m) return pursuitTurn(m.heading, e.x - m.x, e.y - m.y);
  if (canLaunch(t, 0) && ex * ex + ey * ey > LASER_RANGE * LASER_RANGE && t.tick - pair.lastLaunch >= MISSILE_GAP) {
    out.push({ kind: 'missileLaunch' }); pair.lastLaunch = t.tick;
    return 0;
  }
  if (!canCharge(t, 0)) return 0;
  if (!s.fireHeld) out.push({ kind: 'laserCharge', held: true });
  else if (laserFull(t, 0) && (laserEligible(t, 0, 1) || s.laserHold >= LASER_HOLD_TICKS - 1)) out.push({ kind: 'laserCharge', held: false });   // release on a shot, or before the vent
  return 0;
}

/** This tick's input for the duel: both players' held input and commands, stamped with the duel's tick. */
export function scriptedInput(pair: ScriptedPair, d: DuelState): DuelInput {
  const st = d.interior, held: HeldInput[] = [NO_HELD, NO_HELD], cmds: DuelCommand[][] = [[], []];
  assignRepairs(pair, d);
  for (let pid = 0; pid < 2; pid++) {
    const eid = st.crew[pid]!, seat = Seated.station[eid]!, own = pid === 0 ? d.nav : d.weapons, task = pair.task[pid]!;
    if (task >= 0) {
      if (seat >= 0) { cmds[pid]!.push({ kind: 'stand' }); continue; }
      if (inRepairReach(d, pid, task)) { held[pid] = { moveX: 0, moveY: 0, interactHeld: true }; continue; }
      const p = d.points.find((q) => q.tacticalRoom === task)!;
      held[pid] = walkTo(d, pid, goalTiles(d, p.room, p.tile));
      continue;
    }
    if (seat < 0) {   // walk back to its own console and sit
      if (canSit(d, pid, own)) { cmds[pid]!.push({ kind: 'sit', station: own }); continue; }
      held[pid] = walkTo(d, pid, goalTiles(d, st.derived.stationRoom[own]!, st.derived.stationTile[own]!));
      continue;
    }
    if (seat === d.nav) {
      const axes = helmAxes(pair, d);
      pair.axes = axes;
      held[pid] = { moveX: axes.turn, moveY: -axes.thrust, interactHeld: false };
    } else if (seat === d.weapons) {
      held[pid] = { moveX: gunner(pair, d, cmds[pid]!), moveY: 0, interactHeld: false };
    }
  }
  if (Seated.station[st.crew[0]!]! !== d.nav) pair.axes = { turn: 0, thrust: 0 };
  const commands: DuelEnvelope[] = [];
  for (let pid = 0; pid < 2; pid++) for (const command of cmds[pid]!) commands.push({ runId: LOCAL_DUEL_RUN, id: { player: pid, sequence: pair.seq[pid as 0 | 1]++ }, requestedTick: st.tick, command });
  return { held, commands };
}
```

Replace the whole of `src/renderer/src/app/duel/runtime.ts` with:

```ts
// The local runtimes for the Helm demo views (H-1 spec §4, §9): the renderer steps the sim itself on a 60 Hz wall-clock
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras.
import { createTickDriver } from '../../authority/tickDriver';
import type { HeldInput, Scheduler } from '../../net/contracts';
import { Position } from '../../sim/components';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope, type DuelResult } from '../../sim/duel/commands';
import { canCharge, canLaunch } from '../../sim/tactical/weapons';
import { createDuel, disposeDuel, type DuelState } from '../../sim/duel/state';
import { stepDuelTick } from '../../sim/duel/step';
import type { ShipLayout } from '../../sim/ship/schema';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, NO_AXES, Outcome, type Axes, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, followBody, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import type { OtherStatus } from '../../render/duel/readoutModel';
import { interpolatedMissile, type ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { consoleInReach, cycleLock, repairInReach, seatOf } from './controls';
import { accumulateWheel, emptyPresses, helmAxes, WHEEL_IDLE_MS, type KeySample, type PointerSample } from './input';

export type PauseReason = 'user' | 'blur' | 'hidden' | 'suspend';

export interface FlightRuntimeDeps {
  now(): number;
  scheduler: Scheduler;
  /** Called once per frame: held keys and the press edges since the last call. */
  sampleKeys(): KeySample;
  /** Called once per frame: the pointer position, wheel and drag since the last call. */
  samplePointer(): PointerSample;
  seed: number;
  viewport: Viewport;
}

export interface FlightRuntime {
  readonly state: TacticalState;
  /** Each ship's position and continuous heading before the last tick (for interpolation). */
  readonly prev: readonly PrevBody[];
  /** The Helm axes the last tick sent to the sim (zero before the first tick). */
  axes(): Axes;
  readonly camera: Camera;
  readonly feel: FeelTracker;
  /** Render interpolation, fixed once per frame(): (now − last tick time) · 60 / 1000, clamped to 0..1; 1 before the first tick. */
  alpha(): number;
  /** One render frame: input, pause toggles and the camera. `dt` in seconds. */
  frame(dt: number): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  paused(): boolean;
  /** The pause reasons now set; the user banner shows while 'user' is among them. */
  reasons(): ReadonlySet<PauseReason>;
  dispose(): void;
}

/**
 * The pause-reason set and the tick driver it gates. A pause discards the driver, and with it any ticks already due:
 * resuming (or `restart`) starts a fresh driver at the current wall time, so a delayed frame that pauses (or a long blur)
 * never catches up in a burst afterwards. `halted` stops the driver for good until the next restart (a duel's end).
 */
function createPacer(now: () => number, scheduler: Scheduler, onTick: (tick: number, tickTimeMs: number) => void, halted: () => boolean = () => false) {
  const reasons = new Set<PauseReason>();
  let driver: ReturnType<typeof createTickDriver> | null = null, disposed = false;
  const sync = (): void => {
    if (disposed) return;
    const run = reasons.size === 0 && !halted();
    if (!run && driver) { driver.dispose(); driver = null; }
    else if (run && !driver) driver = createTickDriver({ nowMs: now }, scheduler, onTick);
  };
  sync();
  return {
    reasons, sync,
    pump(): void { driver?.pump(); },
    toggleUser(n: number): void { for (let k = 0; k < n; k++) { if (reasons.has('user')) reasons.delete('user'); else reasons.add('user'); } },
    /** Drop the driver now and start a fresh one (if running is allowed) at the current wall time. */
    restart(): void { driver?.dispose(); driver = null; sync(); },
    dispose(): void { disposed = true; driver?.dispose(); driver = null; }
  };
}

/** The per-frame camera input shared by both runtimes: zoom keys, drag before wheel (a pan clears the zoom anchor, so a
 *  drag and a wheel in one frame still zoom about the cursor), and the wheel's notch accumulator with its idle reset. */
function createCameraInput(now: () => number, vp: Viewport) {
  let wheelAcc = 0, lastWheelAt = -Infinity;
  return {
    apply(camera: Camera, k: KeySample, p: PointerSample): void {
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX, p.dragY);
      const t = now();
      if (t - lastWheelAt > WHEEL_IDLE_MS) wheelAcc = 0;   // check the idle gap before recording this frame's wheel
      if (p.wheel !== 0) lastWheelAt = t;
      const w = accumulateWheel(wheelAcc, p.wheel); wheelAcc = w.acc;
      zoomBy(camera, vp, w.notches, p.x !== null && p.y !== null ? { x: p.x, y: p.y } : null);
    },
    reset(): void { wheelAcc = 0; lastWheelAt = -Infinity; }
  };
}

const alphaAt = (now: number, lastTickTime: number | null): number => lastTickTime === null ? 1 : Math.max(0, Math.min(1, (now - lastTickTime) * TICK_HZ / 1000));

export function createFlightRuntime(deps: FlightRuntimeDeps): FlightRuntime {
  const state = createTacticalState(deps.seed);
  const prev: PrevBody[] = state.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
  const camera = createCamera(state.ships[0].x, state.ships[0].y);
  const feel = createFeelTracker();
  let held: Axes = NO_AXES, sent: Axes = NO_AXES, lastTickTime: number | null = null;
  const onTick = (_tick: number, tickTimeMs: number): void => {
    state.ships.forEach((s, i) => { const p = prev[i]!; p.x = s.x; p.y = s.y; p.h = s.heading + s.headingAcc; });
    sent = held;
    stepSoloFlight(state, sent);
    recordFeel(feel, state.ships[0], state.map.planet);
    lastTickTime = tickTimeMs;
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick), cameraInput = createCameraInput(deps.now, deps.viewport);
  let frameAlpha = 1;
  const alpha = (): number => frameAlpha;
  return {
    state, prev, camera, feel, alpha,
    axes: () => sent,
    frame(dt) {
      const k = deps.sampleKeys(), p = deps.samplePointer();
      held = helmAxes(k);
      pacer.toggleUser(k.presses.pause);
      pacer.sync();     // an Escape this frame pauses before any due tick runs
      pacer.pump();     // run any due ticks with this frame's held axes before drawing (no driver while paused)
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      if (k.presses.camera > 0) snapBack(camera);
      cameraInput.apply(camera, k, p);
      updateCamera(camera, deps.viewport, dt, followTarget(state, prev, frameAlpha, camera.follow));
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    dispose() { pacer.dispose(); }
  };
}

/** What the active character's screen is (spec §1): its console's map view when seated, the interior when standing. */
export type DuelView = 'helm' | 'weapons' | 'interior';

export interface DuelRuntimeDeps extends FlightRuntimeDeps {
  /** The Cutter (spec parent §8). */
  layout: ShipLayout;
  /** Drop the keyboard's held keys and press edges (Tab and restart, spec §4, §5). */
  clearKeys?(): void;
}

export interface DuelRuntime {
  /** The duel now running; a restart replaces it. */
  readonly duel: DuelState;
  readonly seed: number;
  /** How many restarts so far: a view that sees it change rebuilds its caches (spec §4 restart). */
  epoch(): number;
  /** The player the keyboard drives (spec §5): 0 at the start of every duel. */
  active(): 0 | 1;
  view(): DuelView;
  /** The other character's status for the readouts (spec §7 item 9). */
  otherStatus(): OtherStatus;
  /** Before the last tick: each ship's position and heading, each ship's missile (or null), each character's position. */
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  /** Each console's own camera, kept for whoever sits there next (spec §6). */
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera };
  /** The Helm's axes and the gunner's steering the last tick sent (zero while that console is empty, spec §7). */
  axes(): Axes;
  steer(): number;
  /** The held input the last tick sent, per player. */
  held(): readonly HeldInput[];
  alpha(): number;
  frame(dt: number): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  paused(): boolean;
  reasons(): ReadonlySet<PauseReason>;
  /** The view events queued since the last call: the sim's events and the detected contacts (spec §7 item 8). */
  drainEvents(): ViewEvent[];
  /** The results of the last tick's commands (for tests and the console log). */
  lastResults(): readonly DuelResult[];
  /** True once the duel's outcome is decided: stepping has stopped and Enter restarts (spec §4). */
  ended(): boolean;
  dispose(): void;
}

const isWeaponsCommand = (c: DuelCommand): boolean => c.kind === 'laserLock' || c.kind === 'laserCharge' || c.kind === 'missileLaunch';
const NEUTRAL: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const IDLE_KEYS = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: TacticalState['missiles'][number]): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);

export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  let seed = deps.seed, d = createDuel(deps.layout, seed), epoch = 0;
  let active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
  // queued after a Tab waits here until the Tab's presence tick has run, then goes out on the following tick.
  let switching = false, deferred: { player: number; command: DuelCommand }[] = [];
  let activeHeld: HeldInput = NEUTRAL, sentHeld: readonly HeldInput[] = [NEUTRAL, NEUTRAL], sentAxes: Axes = NO_AXES, sentSteer = 0;
  let chargeSent = false, events: ViewEvent[] = [], results: DuelResult[] = [], counts = hitCounts(d), lastTickTime: number | null = null, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera() };
  const capture = (): void => {
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.missiles.map(missileBody);
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
  };
  const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y) }; };
  capture(); freshCameras();
  const ended = (): boolean => d.tactical.outcome !== Outcome.Running;
  /** The player seated at station i who is present, or −1 (the sim's attendant rule). */
  const attendant = (station: number): number => { const pid = d.interior.stations.occupant[station]!; return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1; };

  const onTick = (_tick: number, tickTimeMs: number): void => {
    if (ended()) return;
    capture();
    const commands: DuelEnvelope[] = [];
    const envelope = (player: number, command: DuelCommand): DuelEnvelope => ({ runId: LOCAL_DUEL_RUN, id: { player, sequence: seq[player]!++ }, requestedTick: d.interior.tick, command });
    if (firstTick) { commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4)
    // Weapons commands go out only when the sim would accept them (spec §7 table; canCharge / canLaunch), judged against the
    // state this tick will see. `chargeSent` is the truth about what the sim holds: a release goes out only after a press did.
    let launched = false;
    for (const c of pending) {
      const k = c.command;
      if (k.kind === 'laserCharge') {
        // The sim applies charge before launch within a tick (lock, charge, launch), so a launch in this tick never voids a
        // charge command; only a missile already flying does.
        if (!canCharge(d.tactical, 0)) { chargeSent = false; continue; }
        if (!k.held && !chargeSent) continue;   // a release for a press that was never sent
        chargeSent = k.held;
      } else if (k.kind === 'missileLaunch') {
        if (launched || !canLaunch(d.tactical, 0)) continue;
        launched = true;
      }
      commands.push(envelope(c.player, k));
    }
    if (launched) chargeSent = false;   // the launch lets go of Fire, after any charge command this tick
    const sentSwitch = switching;
    pending = [];
    const held: HeldInput[] = [NEUTRAL, NEUTRAL];
    held[active] = activeHeld;
    results = stepDuelTick(d, { held, commands });
    sentHeld = held;
    const helm = attendant(d.nav), gunner = attendant(d.weapons);
    sentAxes = helm >= 0 ? helmAxes(held[helm]!) : NO_AXES;
    sentSteer = gunner >= 0 ? Math.sign(held[gunner]!.moveX) || 0 : 0;
    for (const e of d.tactical.events) events.push(e);
    // Contact sparks (spec §7 item 8): the sim emits no contact events, so an increase in a hit counter is one.
    const now = hitCounts(d);
    d.tactical.ships.forEach((s, i) => (['planet', 'asteroid', 'ship'] as const).forEach((body, k) => {
      if (now[i]![k]! > counts[i]![k]!) events.push({ kind: 'contact', ship: i, body, x: s.x, y: s.y });
    }));
    counts = now;
    if (sentSwitch) { switching = false; pending = deferred; deferred = []; }   // presence applied: the held seat changes go next tick
    lastTickTime = tickTimeMs;
    if (ended()) pacer.sync();   // the duel is decided: stop stepping (spec §4 End)
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick, ended), cameraInput = createCameraInput(deps.now, deps.viewport);
  const queue = (command: DuelCommand): void => {
    const seat = command.kind === 'sit' || command.kind === 'stand';
    (seat && switching ? deferred : pending).push({ player: active, command });
  };

  function restart(): void {
    disposeDuel(d);
    seed += 1; d = createDuel(deps.layout, seed); epoch++;
    active = 0; firstTick = true; seq = [0, 0]; pending = []; switching = false; deferred = [];
    activeHeld = NEUTRAL; sentHeld = [NEUTRAL, NEUTRAL]; sentAxes = NO_AXES; sentSteer = 0;
    chargeSent = false; events = []; results = []; counts = hitCounts(d); lastTickTime = null; frameAlpha = 1;
    capture(); freshCameras(); cameraInput.reset();
    deps.clearKeys?.();
    pacer.restart();   // a fresh driver: the new duel's ticks start from now
  }

  /** One frame's press edges for the active character, by where it is (spec §5 table). */
  function play(k: KeySample): KeySample {
    if (k.presses.switch > 0) {   // Tab: presence false for the character left, true for the one taken, same tick; nothing carries over
      // The left character's queued weapons commands would reach the sim after it has gone (not-at-weapons): drop them. A
      // charge already sent needs no release: the sim lets go of Fire when the seat empties, so chargeSent just resets.
      pending = pending.filter((c) => !isWeaponsCommand(c.command));
      cameraInput.reset();
      for (let n = 0; n < k.presses.switch; n++) {
        queue({ kind: 'presence', present: false });
        active = active === 0 ? 1 : 0;
        queue({ kind: 'presence', present: true });
      }
      switching = true;
      chargeSent = false;   // the console left is empty from this tick: the sim lets go of Fire without firing
      deps.clearKeys?.();
      return IDLE_KEYS();
    }
    const seat = seatOf(d, active), p = k.presses;
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, active) < 0) { const c = consoleInReach(d, active); if (c >= 0) queue({ kind: 'sit', station: c }); }
      return k;
    }
    if (p.stand > 0) { pending = pending.filter((c) => !isWeaponsCommand(c.command)); queue({ kind: 'stand' }); chargeSent = false; return k; }   // the stand empties the seat first, as a Tab does
    if (seat === 'helm') { if (p.camera > 0) snapBack(cameras.helm); return k; }
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0) {
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' ? last.room : d.tactical.ships[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      queue({ kind: 'laserLock', room });
    }
    const down = (): void => queue({ kind: 'laserCharge', held: true });
    const up = (): void => queue({ kind: 'laserCharge', held: false });   // onTick drops it when no press was sent
    if (p.fireDown > 0 && p.fireUp > 0) { if (k.fireHeld) { up(); down(); } else { down(); up(); } }
    else if (p.fireDown > 0) down();
    else if (p.fireUp > 0) up();
    else if (chargeSent && !k.fireHeld) up();   // a release the keyboard never saw (a blur cleared it): let go now
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    if (p.camera > 0) {
      const cam = cameras.weapons;
      snapBack(cam, d.tactical.missiles[0] && cam.follow !== 'missile' ? 'missile' : 'ship');
    }
    return k;
  }

  return {
    get duel() { return d; },
    get seed() { return seed; },
    get prev() { return prev; },
    get missilePrev() { return missilePrev; },
    get crewPrev() { return crewPrev; },
    get cameras() { return cameras; },
    epoch: () => epoch,
    active: () => active,
    view: () => { const s = seatOf(d, active); return s === 'standing' ? 'interior' : s; },
    otherStatus() {
      const other = active === 0 ? 1 : 0, s = seatOf(d, other);
      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : 'AT WEAPONS';
      return d.present[other] && sentHeld[other]!.interactHeld && repairInReach(d, other) >= 0 ? 'REPAIRING' : 'WALKING';
    },
    axes: () => sentAxes,
    steer: () => sentSteer,
    held: () => sentHeld,
    alpha: () => frameAlpha,
    frame(dt) {
      let k = deps.sampleKeys();
      const sampled = deps.samplePointer();
      let pointer = sampled;
      pacer.toggleUser(k.presses.pause);
      // A Tab or a restart changes which camera the pointer would move: this frame's sampled drag and wheel belong to the old one.
      const moved = (): void => { pointer = { ...sampled, wheel: 0, dragX: 0, dragY: 0 }; };
      if (ended()) { if (k.presses.confirm > 0) { restart(); k = IDLE_KEYS(); moved(); } }
      else if (pacer.reasons.size === 0) { if (k.presses.switch > 0) moved(); k = play(k); }   // while paused, gameplay presses are dropped; the camera still moves
      activeHeld = { moveX: k.moveX, moveY: k.moveY, interactHeld: k.interactHeld };
      pacer.sync();   // an Escape this frame pauses before any due tick runs
      pacer.pump();
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      const view = seatOf(d, active), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : null;
      if (cam) cameraInput.apply(cam, k, pointer);
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !d.tactical.missiles[0]) followBody(c, 'ship');   // the followed missile ended
        // A followed missile is tracked at its interpolated (drawn) position, as the ship is (H-1 spec §6).
        const target = c.follow === 'missile' ? interpolatedMissile(d.tactical, missilePrev, frameAlpha, 0) : followTarget(d.tactical, prev, frameAlpha, c.follow);
        updateCamera(c, deps.viewport, dt, target);
      }
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    drainEvents() { const out = events; events = []; return out; },
    lastResults: () => results,
    ended,
    dispose() { pacer.dispose(); disposeDuel(d); }
  };
}
```

- [ ] **Step 3: Duel envelopes in the tests carry `runId`**

Replace the whole of `tests/duel.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { inReachOfTile } from '../src/renderer/src/sim/interact';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { DoorState, roomAt } from '../src/renderer/src/sim/grid';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
function step(d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) { return stepDuelTick(d, { held, commands }); }
/** Stand player pid up and put them at tile (tx, ty) of the interior, as if they had walked there. */
function standAt(d: DuelState, pid: number, tx: number, ty: number): void {
  step(d, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('createDuel (spec §8)', () => {
  it('seats player 0 at Navigation and player 1 at Weapons, holds every door open, and resolves the repair points', () => {
    const d = createDuel(layout, 5), st = d.interior;
    expect([st.stations.occupant[d.nav], st.stations.occupant[d.weapons]]).toEqual([0, 1]);
    expect([Seated.station[st.crew[0]!], Seated.station[st.crew[1]!]]).toEqual([d.nav, d.weapons]);
    expect([...st.doors.state].every((s) => s === DoorState.HeldOpen)).toBe(true);
    expect(d.points.map((p) => [p.tacticalRoom, p.room])).toEqual([[Room.Weapons, st.derived.roomIndex.get('W')], [Room.Shields, st.derived.roomIndex.get('R')], [Room.Engines, st.derived.roomIndex.get('E')]]);
    expect(d.present).toEqual([true, true]);
  });
});

describe('DuelState shape', () => {
  it('has exactly these fields; a new field must also go into flattenDuel in duel/hash.ts', () => {
    expect(Object.keys(createDuel(layout, 5)).sort()).toEqual(['events', 'interior', 'nav', 'points', 'present', 'repair', 'tactical', 'weapons']);
  });
  it('disposeDuel is idempotent', () => {
    const d = createDuel(layout, 5);
    disposeDuel(d);
    expect(() => disposeDuel(d)).not.toThrow();
  });
});

describe('seat phase guards', () => {
  it('rejects presence from player 2 or with a non-boolean value as malformed', () => {
    const d = createDuel(layout, 5);
    const bad = cmd(d, 2, { kind: 'presence', present: false }), odd = cmd(d, 0, { kind: 'presence', present: 'no' } as unknown as DuelCommand);
    const r = step(d, [bad, odd]);
    expect(r.map((x) => [x.status, x.reason])).toEqual([['rejected', 'malformed'], ['rejected', 'malformed']]);
    expect(d.present).toEqual([true, true]);
    expect(d.present).toHaveLength(2);
  });
  it('an away player cannot stand or sit: the character stays exactly where it is', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const r = step(d, [cmd(d, 0, { kind: 'stand' })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(Seated.station[eid]).toBe(d.nav);
    const e2 = d.interior.crew[1]!;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    const [x, y] = [Position.x[e2]!, Position.y[e2]!];
    const r2 = step(d, [cmd(d, 1, { kind: 'sit', station: d.weapons })], [NONE, { moveX: 1, moveY: 0, interactHeld: false }]);
    expect(r2[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(Seated.station[e2]).toBe(-1);
    expect([Position.x[e2], Position.y[e2]]).toEqual([x, y]);
  });
});

describe('consoles are roles (spec §8, §13)', () => {
  it('the Helm player’s held axes fly the ship: moveX +1 turns clockwise, W (moveY −1) thrusts along the nose', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0], h0 = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe((h0 + 1) % 256);                              // 1.78 steps per tick: one whole step on the first tick
    const coast = createDuel(layout, 5), thrust = createDuel(layout, 5);
    step(coast); step(thrust, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]);
    const [a, b] = [coast.tactical.ships[0], thrust.tactical.ships[0]];
    const dx = b.vx - a.vx, dy = b.vy - a.vy;                           // the velocity thrust added this tick
    expect(dx * hx(b.heading) + dy * hy(b.heading)).toBeGreaterThan(0.99 * Math.hypot(dx, dy));
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1.9);                     // about THRUST · dt = 2 u/s
  });
  it('accepts weapon commands only from the present player seated at Weapons', () => {
    const d = createDuel(layout, 5);
    const helmPress = cmd(d, 0, { kind: 'laserCharge', held: true }), gunPress = cmd(d, 1, { kind: 'laserCharge', held: true });
    const results = step(d, [helmPress, gunPress]);
    expect(results.find((r) => r.id === helmPress.id)).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
    expect(results.find((r) => r.id === gunPress.id)).toMatchObject({ status: 'applied' });
    expect(d.tactical.ships[0].fireHeld).toBe(true);
    for (let t = 0; t < 239; t++) step(d);
    expect(d.tactical.ships[0].laserCharge).toBe(LASER_CHARGE_UNITS);
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: false })]);
    expect(d.tactical.ships[0].shots).toBe(1);
  });
  it('weapon commands take effect lock, then charge, then launch, whatever their envelope order', () => {
    for (const launchFirst of [true, false]) {
      const d = createDuel(layout, 5), s = d.tactical.ships[0];
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;            // a full charge, held
      const launch = cmd(d, 1, { kind: 'missileLaunch' }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      const results = step(d, launchFirst ? [launch, release] : [release, launch]);
      expect(results.map((r) => r.status), String(launchFirst)).toEqual(['applied', 'applied']);
      expect([s.shots, s.missilesLaunched], String(launchFirst)).toEqual([1, 1]);   // the release fired, then the missile launched
    }
    for (const lockFirst of [true, false]) {
      const d = createDuel(layout, 5), [s, e] = d.tactical.ships;
      Object.assign(e, { x: s.x + hx(s.heading) * 300, y: s.y + hy(s.heading) * 300, shields: 0 });   // dead ahead, shields down
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;
      const lock = cmd(d, 1, { kind: 'laserLock', room: Room.Engines }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      step(d, lockFirst ? [lock, release] : [release, lock]);
      expect(e.rooms, String(lockFirst)).toEqual([0, 0, 1]);           // the new lock applied before the shot
    }
  });
  it('rejects a bad lock, a charge while a missile flies, and a launch it cannot make', () => {
    const d = createDuel(layout, 5);
    const lock = cmd(d, 1, { kind: 'laserLock', room: 1.5 }), launch = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [lock, launch]).map((r) => r.reason)).toEqual(['malformed', undefined]);
    const charge = cmd(d, 1, { kind: 'laserCharge', held: true }), again = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [charge, again]).map((r) => r.reason)).toEqual(['missile-in-flight', 'unavailable']);
  });
  it('standing up empties the console: the ship coasts and weapon commands are refused', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    const stand = cmd(d, 0, { kind: 'stand' });
    expect(step(d, [stand])[0]).toMatchObject({ status: 'applied' });
    const h = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe(h);                                           // nobody at the Helm: axes ignored
    expect(Seated.station[d.interior.crew[0]!]).toBe(-1);
  });
  it('a standing player walks with the held stick and can sit back down at the console', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const x0 = Position.x[eid]!;
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
    expect(Position.x[eid]!).toBeLessThan(x0 - 0.5);                   // 4 tiles/s for 0.25 s
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.stations.occupant[d.nav]).toBe(0);
  });
  it('rejects sitting at a scenery console, unknown kinds, and stale ticks', () => {
    const d = createDuel(layout, 5);
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const science = 3, sit = cmd(d, 0, { kind: 'sit', station: science });
    const stale: DuelEnvelope = { ...cmd(d, 1, { kind: 'laserCharge', held: true }), requestedTick: d.interior.tick - 1 };
    expect(step(d, [sit, stale]).map((r) => r.reason)).toEqual(['not-in-duel', 'stale-tick']);
  });
});

describe('weapon commands need a present gunner (spec §13)', () => {
  it('a command claiming player −1 is refused when Weapons is empty or its occupant is away', () => {
    for (const vacate of ['stand', 'away'] as const) {
      const d = createDuel(layout, 5), s = d.tactical.ships[0];
      step(d, [vacate === 'stand' ? cmd(d, 1, { kind: 'stand' }) : cmd(d, 1, { kind: 'presence', present: false })]);
      const ghost = [cmd(d, -1, { kind: 'laserLock', room: Room.Engines }), cmd(d, -1, { kind: 'laserCharge', held: true }), cmd(d, -1, { kind: 'missileLaunch' })];
      expect(step(d, ghost).map((r) => r.reason), vacate).toEqual(['not-at-weapons', 'not-at-weapons', 'not-at-weapons']);
      expect([s.lock, s.fireHeld, d.tactical.missiles[0]], vacate).toEqual([Room.Shields, false, null]);
    }
  });
});

describe('present or away (spec §8, §11a)', () => {
  it('an away player\’s console is empty: Fire lets go without firing and their commands are refused', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })]);
    expect(s.fireHeld).toBe(true);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    expect(d.present).toEqual([true, false]);
    expect(s.fireHeld).toBe(false);
    expect(s.shots).toBe(0);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ reason: 'not-at-weapons' });
    step(d, [cmd(d, 1, { kind: 'presence', present: true })]);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ status: 'applied' });
  });
  it('an away player does not walk or repair', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6);                                                 // Engines room, next to its repair point (2, 6)
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const eid = d.interior.crew[0]!, x = Position.x[eid];
    for (let t = 0; t < 30; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: true }, NONE]);
    expect(Position.x[eid]).toBe(x);
    expect(d.repair[Room.Engines]).toBe(0);
  });
});

describe('repair in the room (spec §8)', () => {
  it('one repairer lowers a room one level in exactly 240 ticks; progress waits when released', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 2;
    standAt(d, 0, 1, 6);
    const hold: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, NONE];
    for (let t = 0; t < 100; t++) step(d, [], hold);
    for (let t = 0; t < 50; t++) step(d);                                // let go: progress kept
    expect(d.repair[Room.Engines]).toBe(100 * 4);
    for (let t = 0; t < 139; t++) step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(2);
    step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(1);
    expect(d.repair[Room.Engines]).toBe(0);
  });
  it('two repairers on one point finish in 96 ticks', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
    const both: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, { moveX: 0, moveY: 0, interactHeld: true }];
    for (let t = 0; t < 95; t++) step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(1);
    step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(0);
  });
  it('needs the repairer inside the repair room: in reach through a wall does not count', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 2, 4);                                                 // (2, 4) is the door tile north of Engines, outside the room
    expect(roomAt(d.interior, 2.5, 4.5)).not.toBe(d.points[2]!.room);
    expect(inReachOfTile(d.interior, d.interior.crew[0]!, d.points[2]!.tile)).toBe(true);   // in reach, so only the same-room rule keeps it from repairing
    for (let t = 0; t < 300; t++) step(d, [], [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(ship.rooms[Room.Engines]).toBe(1);
  });
  it('the gunner can fix the Weapons room from the console spot, with the console empty meanwhile', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Weapons] = 1;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    for (let t = 0; t < 240; t++) step(d, [], [NONE, { moveX: 0, moveY: 0, interactHeld: true }]);
    expect(ship.rooms[Room.Weapons]).toBe(0);
  });
});

describe('the duel tick', () => {
  it('is deterministic: the same seed and inputs give the same duel hash', () => {
    const run = (): string => {
      const d = createDuel(layout, 9);
      for (let t = 0; t < 900; t++) step(d, t === 10 ? [cmd(d, 0, { kind: 'stand' })] : [], [{ moveX: t % 50 < 25 ? 1 : -1, moveY: 0, interactHeld: false }, NONE]);
      return hashDuel(d);
    };
    expect(run()).toBe(run());
  });
  it('keeps the interior and tactical ticks together, and stops when the duel ends', () => {
    const d = createDuel(layout, 5);
    for (let t = 0; t < 10; t++) step(d);
    expect([d.interior.tick, d.tactical.tick]).toEqual([10, 10]);
    d.tactical.ships[0].hull = 0;
    step(d);
    expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    expect(step(d)).toEqual([]);
    expect([d.interior.tick, d.tactical.tick]).toEqual([11, 11]);
  });
});

describe('the interior stays quiet (spec §17 risk 7)', () => {
  it('starts no fire, breach, boarder or event in 3,600 busy ticks', () => {
    const d = createDuel(layout, 5), st = d.interior, event0 = st.run.event;
    for (let t = 0; t < 3600; t++) {
      const cmds = t === 10 ? [cmd(d, 0, { kind: 'stand' })] : t % 120 === 0 ? [cmd(d, 1, { kind: 'laserCharge', held: true })] : t % 120 === 60 ? [cmd(d, 1, { kind: 'laserCharge', held: false })] : [];
      step(d, cmds, [{ moveX: t % 40 < 20 ? 1 : -1, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]);
      if (d.tactical.outcome !== Outcome.Running) break;
    }
    expect(d.tactical.tick).toBeGreaterThan(100);
    expect([...st.rooms.fire].every((f) => f === 0)).toBe(true);
    expect([...st.breaches.active].every((b) => b === 0)).toBe(true);
    expect([...st.boarders.active].every((b) => b === 0)).toBe(true);
    expect(st.run.event).toBe(event0);
  });
});
```

Replace the whole of `tests/duelControls.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_RATE_SOLO } from '../src/renderer/src/sim/duel/tuning';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { consoleInReach, cycleLock, repairInReach, seatOf } from '../src/renderer/src/app/duel/controls';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const step = (d: DuelState, player: number, command: DuelCommand | null, held: HeldInput[] = [NONE, NONE]) =>
  stepDuelTick(d, { held, commands: command ? [{ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }] : [] });
const put = (d: DuelState, pid: number, tx: number, ty: number): void => { const eid = d.interior.crew[pid]!; Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5; };

describe('duel controls (H-1 spec §5)', () => {
  it('a downed character can neither repair nor sit, and an offline console cannot be sat at (as the sim)', () => {
    const d = createDuel(layout, 5);
    step(d, 0, { kind: 'stand' }); put(d, 0, 1, 6);
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    expect(repairInReach(d, 0)).toBe(Room.Engines);
    const eid = d.interior.crew[0]!, was = Life.state[eid]!;
    Life.state[eid] = LifeState.Downed;
    expect(repairInReach(d, 0)).toBe(-1);
    Life.state[eid] = was;
    step(d, 1, { kind: 'stand' });                             // free the Weapons console
    const w = d.interior.derived.stationTile[d.weapons]!, W = d.interior.derived.width;
    put(d, 1, w % W, Math.floor(w / W));
    expect(consoleInReach(d, 1)).toBe(d.weapons);
    d.interior.stations.failed[d.weapons] = 1;
    expect(consoleInReach(d, 1)).toBe(-1);
    const results = step(d, 1, { kind: 'sit', station: d.weapons });
    expect(results.map((r) => r.status)).not.toContain('applied');   // the sim agrees
    disposeDuel(d);
  });
  it('seatOf: player 0 at the Helm, player 1 at Weapons, standing after a stand', () => {
    const d = createDuel(layout, 5);
    expect([seatOf(d, 0), seatOf(d, 1)]).toEqual(['helm', 'weapons']);
    step(d, 1, { kind: 'stand' });
    expect(seatOf(d, 1)).toBe('standing');
    disposeDuel(d);
  });
  it('repairInReach mirrors the sim: a damaged room, from inside its repair room, in reach of its tile', () => {
    const d = createDuel(layout, 5);
    step(d, 0, { kind: 'stand' }); put(d, 0, 1, 6);            // Engines room, next to its repair point (2, 6)
    expect(repairInReach(d, 0)).toBe(-1);                         // nothing damaged
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    expect(repairInReach(d, 0)).toBe(Room.Engines);
    step(d, 0, null, [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(d.repair[Room.Engines]).toBe(REPAIR_RATE_SOLO);        // the sim agrees: holding E there repairs
    put(d, 0, 5, 6);                                              // the Aft Passage: outside the repair room
    expect(repairInReach(d, 0)).toBe(-1);
    expect(repairInReach(d, 1)).toBe(-1);                         // seated characters repair nothing
    disposeDuel(d);
  });
  it('consoleInReach: a free role console from inside its room and in reach; never a scenery console', () => {
    const d = createDuel(layout, 5);
    expect(consoleInReach(d, 0)).toBe(-1);                        // seated
    step(d, 0, { kind: 'stand' });
    expect(consoleInReach(d, 0)).toBe(d.nav);                     // standing at the Navigation console
    put(d, 0, 22, 6);                                             // the next room forward
    expect(consoleInReach(d, 0)).toBe(-1);
    step(d, 1, { kind: 'stand' });
    put(d, 0, 9, 6);                                              // beside the Weapons console, now free
    expect(consoleInReach(d, 0)).toBe(d.weapons);
    step(d, 0, { kind: 'sit', station: d.weapons });
    expect(seatOf(d, 0)).toBe('weapons');
    put(d, 1, 9, 5);
    expect(consoleInReach(d, 1)).toBe(-1);                        // occupied
    disposeDuel(d);
  });
  it('the lock cycles Weapons, Shields, Engines and back, both ways', () => {
    expect([cycleLock(0, 1), cycleLock(1, 1), cycleLock(2, 1)]).toEqual([1, 2, 0]);
    expect([cycleLock(0, -1), cycleLock(1, -1), cycleLock(2, -1)]).toEqual([2, 0, 1]);
  });
});
```

Replace the whole of `tests/duelInterior.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position, Stable } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { duelFit, interiorOverlay, INTERIOR_BAND, READOUT_COLUMN } from '../src/renderer/src/render/duel/interiorModel';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { TILE_PX } from '../src/shared/resolution';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
/** Assets with every optional feature missing, so each layer draws its Graphics fallback (no textures in node). */
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
let seq = 0;
const step = (d: DuelState, commands: { player: number; command: Parameters<typeof stepDuelTick>[1]['commands'][number]['command'] }[] = [], held: HeldInput[] = [NONE, NONE]) =>
  stepDuelTick(d, { held, commands: commands.map((c) => ({ runId: 'duel', id: { player: c.player, sequence: ++seq }, requestedTick: d.interior.tick, command: c.command })) });
const crewAt = (d: DuelState) => d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));

describe('the duel interior through the reused interior layers (H-1 spec §8, §13 risk 1)', () => {
  it('draws a duel interior: tiles, desks, both crew and the damage overlay, fitted left of the readout column', () => {
    const d = createDuel(layout, 5), view = createInteriorView(assets);
    d.tactical.ships[0].rooms[Room.Shields] = 2;
    view.draw(d, crewAt(d), 1, 1 / 60);
    const fit = duelFit(d.interior.derived.width, d.interior.derived.height);
    expect(fit).toEqual({ scale: 1, x: 66, y: 152 });   // the 29 × 13 Cutter is 928 × 416 px: centred in 1060 × 720, never upscaled
    expect([view.world.x, view.world.y, view.world.scale.x]).toEqual([66, 152, 1]);
    expect(fit.x + 29 * TILE_PX).toBeLessThanOrEqual(INTERIOR_BAND.w);
    expect(INTERIOR_BAND.w).toBe(1280 - READOUT_COLUMN);
    expect(count(view.container)).toBeGreaterThan(10);
    for (const eid of d.interior.crew) expect(view.memory.lastDrawn.get(Stable.id[eid]!)).toEqual({ x: Position.x[eid]!, y: Position.y[eid]! });
    view.destroy(); disposeDuel(d);
  });
  it('a warm-up of 2 frames, then 60 frames of walking, damage, repair and reseating add no display objects', () => {
    const d = createDuel(layout, 5), view = createInteriorView(assets);
    let prev = crewAt(d);
    const frame = (k: number): void => {
      prev = crewAt(d);
      if (k === 1) step(d, [{ player: 0, command: { kind: 'stand' } }]);
      else if (k === 20) { d.tactical.ships[0].rooms[Room.Engines] = 1; d.tactical.ships[0].rooms[Room.Weapons] = 2; step(d); }
      else if (k === 40) { d.repair[Room.Engines] = REPAIR_UNITS / 2; step(d, [{ player: 1, command: { kind: 'stand' } }]); }
      else if (k === 55) { d.tactical.ships[0].rooms[Room.Engines] = 0; d.tactical.ships[0].rooms[Room.Weapons] = 0; step(d); }
      else step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
      view.draw(d, prev, 0.5, 1 / 60);
    };
    frame(0); frame(1);
    const n0 = count(view.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(view.container)).toBe(n0);
    view.destroy(); disposeDuel(d);
  });
  it('the overlay: damaged rooms tinted by level with a marker and progress; role consoles free or occupied', () => {
    const d = createDuel(layout, 5);
    expect(interiorOverlay(d).tints).toEqual([]);
    expect(interiorOverlay(d).consoles.map((c) => c.free)).toEqual([false, false]);   // player 0 at Navigation, player 1 at Weapons
    d.tactical.ships[0].rooms[Room.Shields] = 1; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    step(d, [{ player: 1, command: { kind: 'stand' } }]);
    const o = interiorOverlay(d);
    expect(o.tints.map((t) => [t.tacticalRoom, t.level])).toEqual([[Room.Shields, 1]]);
    expect(o.tints[0]!.tiles.length).toBe(d.interior.derived.roomTiles[d.interior.derived.roomIndex.get('R')!]!.length);
    expect(o.markers).toEqual([{ tacticalRoom: Room.Shields, level: 1, x: 16.5 * TILE_PX, y: 8.5 * TILE_PX, progress: 0.25, label: 'SHIELDS 1' }]);
    expect(o.consoles.map((c) => [c.station, c.free])).toEqual([[d.nav, false], [d.weapons, true]]);
    disposeDuel(d);
  });
});
```

Replace the whole of `tests/duelReadout.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { createEndScreen, endModel } from '../src/renderer/src/render/duel/endScreen';
import { createReadoutPanel } from '../src/renderer/src/render/duel/readoutPanel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutInput, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';

const layout = parseShip(cutter);
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const pairs = (input: ReadoutInput) => readoutRows(input).map((r) => [r.label, r.value]);

describe('the duel readout (H-1 spec §7 item 9, §8)', () => {
  it('both hulls, both shields, the crew rooms and the enemy rooms; the other character status', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[1].hull = 21; d.tactical.ships[1].rooms = [0, 2, 1]; d.tactical.ships[0].rooms[Room.Engines] = 1; d.tactical.ships[0].shields = 1;
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['HELM', ''], ['CUTTER', ''], ['HULL', '40/40'], ['SHIELD', ''], ['WEAPONS', 'OK'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1'],
      ['HUNTER', ''], ['HULL', '21/40'], ['SHIELD', ''], ['ROOMS', 'W0 S2 E1'], ['OTHER', 'PRESENT'], ['', 'AT WEAPONS']
    ]);
    expect(rows[3]!.pips).toMatchObject({ n: 1, max: 2 }); expect(rows[9]!.pips).toMatchObject({ n: 2, max: 2 });
    disposeDuel(d);
  });
  it('repair progress is a bar on the damaged room row', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Shields] = 2; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    const row = readoutRows({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' }).find((r) => r.label === 'SHIELDS')!;
    expect([row.value, row.bar?.fill]).toEqual(['DMG 2', 0.25]);
    disposeDuel(d);
  });
  it('Weapons adds the lock, the charge bar and hold timer, and the magazine', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    s.laserCharge = LASER_CHARGE_UNITS / 2;
    let w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w.slice(11, 15)).toEqual([['LASER', ''], ['LOCK', 'SHIELDS'], ['CHARGE', '50%'], ['MAG', '4/4']]);
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 60;
    w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w[13]).toEqual(['CHARGE', 'HOLD 2.0']);
    disposeDuel(d);
  });
  it('standing, the strip tells about the ship outside: empty consoles, the enemy, an inbound missile', () => {
    const d = createDuel(layout, 5);
    stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }, { runId: 'duel', id: { player: 0, sequence: 0 }, requestedTick: 0, command: { kind: 'stand' } }] });
    const [crew, enemy] = d.tactical.ships;
    let out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.slice(11)).toEqual([
      ['OTHER', 'AWAY'], ['', 'AT WEAPONS'], ['OUTSIDE', ''], ['HELM', 'EMPTY'], ['', 'COASTING'], ['WEAPONS', 'EMPTY'],
      ['ENEMY', String(Math.round(Math.hypot(enemy.x - crew.x, enemy.y - crew.y)))], ['BEARING', expect.stringMatching(/^\d{3}$/)]
    ]);
    d.tactical.missiles[1] = { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.at(-1)).toEqual(['MISSILE INBOUND', '']);
    disposeDuel(d);
  });
  it('every row and help line fits the 220-px column', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms = [2, 2, 2]; d.tactical.ships[0].laserCharge = LASER_CHARGE_UNITS; d.tactical.missiles[0] = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    d.tactical.missiles[1] = { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 };
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) for (const other of ['AT HELM', 'AT WEAPONS', 'WALKING', 'REPAIRING'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other });
      expect(rows.length).toBeLessThanOrEqual(READOUT_ROWS);
      for (const r of rows) expect(textPx(r.label) + 6 + (r.pips ? 32 : textPx(r.value)), `${mode} ${r.label} ${r.value}`).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
      for (const line of readoutHelp(mode)) expect(textPx(line, 1), line).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
    }
    disposeDuel(d);
  });
  it('the panel: a warm-up of 2 frames, then 60 frames across all three screens add no display objects', () => {
    const d = createDuel(layout, 5), panel = createReadoutPanel({ fontFamily: 'm5x7' });
    const modes: ReadoutMode[] = ['helm', 'weapons', 'interior'];
    const frame = (k: number): void => {
      const mode = modes[Math.floor(k / 7) % 3]!;
      d.tactical.ships[0].rooms[Room.Engines] = k % 3; d.repair[Room.Engines] = (k * 40) % REPAIR_UNITS;
      panel.draw(readoutRows({ duel: d, mode, active: 0, other: 'WALKING' }), readoutHelp(mode));
    };
    frame(0); frame(1);
    const n0 = count(panel.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(panel.container)).toBe(n0);
    disposeDuel(d);
  });
});

describe('the end screen (H-1 spec §4 End)', () => {
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 5)).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 2026)).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: NEW DUEL (SEED 2027)' });
    expect(endModel(Outcome.EnemyWins, 60, 7)!.title).toBe('DEFEAT');
    expect(endModel(Outcome.Draw, 60, 7)!.title).toBe('BOTH SHIPS LOST');
  });
  it('shows only while the duel is decided, and allocates nothing after creation', () => {
    const end = createEndScreen({ fontFamily: 'm5x7' }), n0 = count(end.container);
    end.draw(null); expect(end.container.visible).toBe(false);
    end.draw(endModel(Outcome.CrewWins, 600, 5)); expect(end.container.visible).toBe(true);
    end.draw(endModel(Outcome.EnemyWins, 1200, 6));
    expect(count(end.container)).toBe(n0);
  });
});
```

Replace the whole of `tests/duelTelemetry.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../src/renderer/src/sim/duel/step';
import { BAIT_WINDOW_TICKS, createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
/** One tick, folded into the telemetry when one is given. */
function step(d: DuelState, t: DuelTelemetry | null, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]): void {
  const input: DuelInput = { held, commands };
  stepDuelTick(d, input);
  if (t) recordTick(t, d, input);
}
/** Stand player pid up and put them at tile (tx, ty), as if they had walked there. */
function standAt(d: DuelState, t: DuelTelemetry | null, pid: number, tx: number, ty: number): void {
  step(d, t, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('repair events (H-0c-ii-a spec §4)', () => {
  it('a repairWork per worker every tick of work, a repairDone when the level drops, cleared every tick', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, null, 0, 1, 6);
    expect(d.events).toEqual([]);
    for (let k = 0; k < 239; k++) {
      step(d, null, [], [HOLD, NONE]);
      expect(d.events).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }]);
    }
    step(d, null, [], [HOLD, NONE]);
    expect(d.events).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }, { kind: 'repairDone', room: Room.Engines, players: [0] }]);
    step(d, null, [], [HOLD, NONE]);   // the room is at 0: nothing to work on
    expect(d.events).toEqual([]);
  });
  it('a joint finish names both workers; the events are not hashed', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, null, 0, 1, 6); standAt(d, null, 1, 1, 7);
    for (let k = 0; k < 95; k++) step(d, null, [], [HOLD, HOLD]);
    const h = hashDuel(d);
    d.events = [{ kind: 'repairDone', room: 0, players: [1] }];
    expect(hashDuel(d)).toBe(h);
    step(d, null, [], [HOLD, HOLD]);
    expect(d.events.at(-1)).toEqual({ kind: 'repairDone', room: Room.Engines, players: [0, 1] });
  });
});

describe('telemetry (H-0c-ii-a spec §4)', () => {
  it('counts a repair start on the first tick of work and again on resumed work; a finish per level dropped', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), ship = d.tactical.ships[0];
    ship.rooms[Room.Weapons] = 2;
    step(d, t, [cmd(d, 1, { kind: 'stand' })]);                            // the gunner stands in reach of the Weapons point
    for (let k = 0; k < 480; k++) step(d, t, [], [NONE, HOLD]);              // both levels, held throughout
    expect(ship.rooms[Room.Weapons]).toBe(0);
    expect(t.players[1]).toMatchObject({ repairsStarted: 1, repairsFinished: 2, repairingTicks: 480, walkingTicks: 1 });
    ship.rooms[Room.Weapons] = 1;                                           // a new hit while still holding: the same work goes on
    for (let k = 0; k < 10; k++) step(d, t, [], [NONE, HOLD]);
    expect(t.players[1].repairsStarted).toBe(1);
    step(d, t);                                                             // let go for one tick, then resume: a new start
    for (let k = 0; k < 230; k++) step(d, t, [], [NONE, HOLD]);
    expect(t.players[1]).toMatchObject({ repairsStarted: 2, repairsFinished: 3 });
    expect(t.players[0]).toMatchObject({ repairsStarted: 0, repairsFinished: 0, walkingTicks: 0, repairingTicks: 0 });
    expect(t.weaponsEmptyTicks).toBe(t.ticks);
    expect(t.helmEmptyTicks).toBe(0);
  });
  it('credits a joint finish to both players', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, t, 0, 1, 6); standAt(d, t, 1, 1, 7);
    for (let k = 0; k < 96; k++) step(d, t, [], [HOLD, HOLD]);
    expect(t.players.map((p) => [p.repairsStarted, p.repairsFinished])).toEqual([[1, 1], [1, 1]]);
  });
  it('a crew ship that dies on the planet ends the duel from planet contact', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), s = d.tactical.ships[0], p = d.tactical.map.planet;
    s.x = p.x + p.r + SHIP_RADIUS - 5; s.y = p.y; s.vx = -10; s.vy = 0; s.hull = 1;
    step(d, t);
    expect(t.outcome).toBe(Outcome.EnemyWins);
    expect(t.terminal).toEqual([['planet'], []]);
    expect(t.ships[0].planetContacts).toBe(1);
    expect(endedFromPlanet(t)).toBe(true);
  });
  it('a laser kill is attributed to the laser, not the planet', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships;
    e.x = s.x + hx(s.heading) * 200; e.y = s.y + hy(s.heading) * 200; e.vx = s.vx; e.vy = s.vy; e.shields = 0; e.hull = 1;
    s.laserCharge = LASER_CHARGE_UNITS; s.fireHeld = true;
    step(d, t, [cmd(d, 1, { kind: 'laserCharge', held: false })]);
    expect(t.outcome).toBe(Outcome.CrewWins);
    expect(t.terminal).toEqual([[], ['laser']]);
    expect(t.ships[0]).toMatchObject({ laserReleases: 1, laserHits: 1, laserMisses: 0, layersStripped: 0 });
    expect(endedFromPlanet(t)).toBe(false);
  });
  it('an enemy planet contact after a crew manoeuvre with the enemy near is a bait; without one, or too late, it is not', () => {
    const bait = (manoeuvre: boolean, wait: number): number => {
      const d = createDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships, p = d.tactical.map.planet;
      e.x = s.x + 500; e.y = s.y; e.vx = s.vx; e.vy = s.vy;                  // within 900 of the crew, far from the planet
      step(d, t, [], [manoeuvre ? { moveX: 1, moveY: 0, interactHeld: false } : NONE, NONE]);
      for (let k = 0; k < wait; k++) step(d, t);
      e.x = p.x - p.r - SHIP_RADIUS + 5; e.y = p.y; e.vx = 10; e.vy = 0;     // into the planet's far side
      step(d, t);
      expect(t.ships[1].planetContacts).toBe(1);
      return t.baits;
    };
    expect(bait(true, 0)).toBe(1);
    expect(bait(false, 0)).toBe(0);
    expect(bait(true, BAIT_WINDOW_TICKS)).toBe(0);
  });
  it('counts Weapons as idle only with nothing to do: full, no launch possible, enemy out of the arc', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), s = d.tactical.ships[0];
    s.laserCharge = LASER_CHARGE_UNITS;
    step(d, t);                                                             // a launch is possible (enemy far, magazine full)
    expect(t.weaponsIdleTicks).toBe(0);
    s.magazine = 0;
    step(d, t);
    expect(t.weaponsIdleTicks).toBe(1);
    step(d, t, [cmd(d, 1, { kind: 'stand' })]);                             // nobody at Weapons: not idle, empty
    expect([t.weaponsIdleTicks, t.weaponsEmptyTicks]).toEqual([1, 1]);
  });
  it('counts missile launches and their losses by cause', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d);
    step(d, t, [cmd(d, 1, { kind: 'missileLaunch' })]);
    while (d.tactical.missiles[0] && d.tactical.outcome === Outcome.Running) step(d, t);
    const c = t.ships[0], lost = Object.values(c.missileLosses).reduce((a, b) => a + b, 0) + c.missileHitsByRoom.reduce((a, b) => a + b, 0);
    expect(c.missilesLaunched).toBe(1);
    expect(lost).toBe(1);
  });
});
```

Replace the whole of `tests/helpers/scriptedDuel.ts` with:

```ts
// Headless duels for the H-0c-ii-a gates (spec §5) and the duel golden (§6): the scripted pair, or a passive crew with
// nobody at either console, against the hunter, with telemetry, up to a tick cap. Shared by tests/duelGates.test.ts,
// tests/duelGolden.test.ts, scripts/duel-telemetry.ts and scripts/bless-golden.ts.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';

export const CUTTER = parseShip(cutter);
/** The gate's seeds and cap (parent §16, spec §5): 1 to 10, 15 minutes of ticks. */
export const GATE_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const CAP_TICKS = 15 * 60 * TICK_HZ;
/** No duel may end from a planet contact in under 30 s (parent §16). */
export const PLANET_END_MIN_TICKS = 30 * TICK_HZ;
/** The duel golden (spec §6): the scripted pair at seed 1, a hash every 600 ticks. */
export const DUEL_GOLDEN = 'tests/golden/duel-1.json';
export const DUEL_GOLDEN_SEED = 1;
export const DUEL_GOLDEN_EVERY = 600;

export interface DuelRun { seed: number; telemetry: DuelTelemetry; finalHash: string; hashes: string[] }

/** Both players go away on tick 0, so neither console is attended for the whole duel. */
function passiveInput(d: DuelState): DuelInput {
  if (d.interior.tick !== 0) return { held: [], commands: [] };
  return { held: [], commands: [0, 1].map((player) => ({ runId: 'duel', id: { player, sequence: 0 }, requestedTick: 0, command: { kind: 'presence' as const, present: false } })) };
}

/** Run one duel to its end or the cap. `hashEvery` > 0 records hashDuel after every that many ticks. */
export function runDuel(seed: number, crew: 'scripted' | 'passive', cap = CAP_TICKS, hashEvery = 0): DuelRun {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed), t = createTelemetry(d), hashes: string[] = [];
  try {
    while (d.tactical.outcome === Outcome.Running && d.interior.tick < cap) {
      const input = crew === 'scripted' ? scriptedInput(pair, d) : passiveInput(d);
      const results = stepDuelTick(d, input);
      if (crew === 'scripted') for (const r of results) {
        if (r.status !== 'applied') {
          const env = input.commands.find((e) => e.id.player === r.id.player && e.id.sequence === r.id.sequence);
          throw Error(`seed ${seed} tick ${d.interior.tick}: scripted command ${JSON.stringify(env?.command)} (player ${r.id.player} #${r.id.sequence}) was ${r.status}${r.reason ? `: ${r.reason}` : ''}`);
        }
      }
      recordTick(t, d, input);
      if (hashEvery > 0 && d.interior.tick % hashEvery === 0) hashes.push(hashDuel(d));
    }
    return { seed, telemetry: t, finalHash: hashDuel(d), hashes };
  } finally { disposeDuel(d); }
}

export const OUTCOME_NAMES = ['running', 'crew win', 'crew loss', 'draw'] as const;

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** One line per duel: the gate's columns first, then the rest of the telemetry. */
export function telemetryLine(r: DuelRun): string {
  const t = r.telemetry, [c, e] = t.ships, f = (n: number): string => (n / TICK_HZ).toFixed(1);
  const losses = (s: typeof c): string => Object.entries(s.missileLosses).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  return [
    `seed ${r.seed}: ${f(t.ticks)} s, ${OUTCOME_NAMES[t.outcome]}, terminal crew [${t.terminal[0].join(' ')}] enemy [${t.terminal[1].join(' ')}]${endedFromPlanet(t) ? ', PLANET END' : ''}`,
    `  crew  laser ${c.laserReleases} released, ${c.laserHits} hit (${c.layersStripped} stripped), ${c.laserMisses} missed; missiles ${c.missilesLaunched} launched, hits W/S/E ${c.missileHitsByRoom.join('/')}, lost ${losses(c)}; contacts planet ${c.planetContacts}, asteroid ${c.asteroidContacts}`,
    `  enemy laser ${e.laserReleases} released, ${e.laserHits} hit (${e.layersStripped} stripped), ${e.laserMisses} missed; missiles ${e.missilesLaunched} launched, hits W/S/E ${e.missileHitsByRoom.join('/')}, lost ${losses(e)}; contacts planet ${e.planetContacts}, asteroid ${e.asteroidContacts}; baits ${t.baits}`,
    `  repairs started/finished P0 ${t.players[0].repairsStarted}/${t.players[0].repairsFinished}, P1 ${t.players[1].repairsStarted}/${t.players[1].repairsFinished}; away walking/repairing P0 ${f(t.players[0].walkingTicks)}/${f(t.players[0].repairingTicks)} s, P1 ${f(t.players[1].walkingTicks)}/${f(t.players[1].repairingTicks)} s`,
    `  helm empty ${f(t.helmEmptyTicks)} s, weapons empty ${f(t.weaponsEmptyTicks)} s, enemy in arc ${f(t.enemyInArcTicks)} s, weapons idle ${f(t.weaponsIdleTicks)} s, console swaps ${t.consoleSwaps}`
  ].join('\n');
}

/** The gate summary over a set of scripted duels (spec §5). */
export function gateSummary(runs: readonly DuelRun[]): string {
  const ts = runs.map((r) => r.telemetry), wins = ts.filter((t) => t.outcome === Outcome.CrewWins).length, losses = ts.filter((t) => t.outcome === Outcome.EnemyWins).length;
  return [
    `median length ${(median(ts.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s (gate 180 to 300)`,
    `crew wins ${wins}, crew losses ${losses}, draws ${ts.filter((t) => t.outcome === Outcome.Draw).length}, at the cap ${ts.filter((t) => t.outcome === Outcome.Running).length} (gate: a win and a loss, none at the cap)`,
    `every duel with a crew laser release and missile launch: ${ts.every((t) => t.ships[0].laserReleases > 0 && t.ships[0].missilesLaunched > 0)}`,
    `planet-contact ends under 30 s: ${ts.filter((t) => endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS).length} (gate 0)`
  ].join('\n');
}
```

- [ ] **Step 4: Run the duel's tests, its golden and its gates**

Run: `npx vitest run tests/commandUnion.test.ts tests/duel.test.ts tests/duelControls.test.ts tests/duelInterior.test.ts tests/duelReadout.test.ts tests/duelTelemetry.test.ts tests/duelScripted.test.ts tests/duelGolden.test.ts tests/duelGates.test.ts tests/duelRuntime.test.ts tests/boundary.test.ts`
Expected: PASS, 209 tests in 11 files. The duel golden passes unchanged: commands are not hashed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/duel/commands.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/app/duel/runtime.ts tests/commandUnion.test.ts tests/duel.test.ts tests/duelControls.test.ts tests/duelInterior.test.ts tests/duelReadout.test.ts tests/duelTelemetry.test.ts tests/helpers/scriptedDuel.ts
git commit -q -m "feat(duel): the duel's commands, envelope runId, results and reasons join the one command union and result type (engine refactor R-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: The mode factory and the sector mode on it

**Files:**
- Create: `src/network/modes/encounterMode.ts`, `tests/encounterMode.test.ts`
- Modify (whole file): `src/network/modes/sector.ts`, `tests/networkBoundary.test.ts`

**Interfaces:**
- Consumes: Task 1's `createEncounterAuthority`, `EncounterRules`, `CheckpointOf`, `ResolveLayout`, `sectorRules`; `createSectorProducers`, `createSectorStreamBinding`; Net-3's `ModeDefinition`, `ModeHost`, `ModeHostDeps`, `boundedHostBytes`, `validStreamAttachmentOptions`.
- Produces: `interface EncounterProducers<T> { controllers(); beforeControls(); beforeTick(tick); attachHuman(link, players, options); dispose() }`; `interface ProducerOptions<T> { authority; init; contentDigest; resolveLayout; restoredControllers? }`; `interface StreamBinding<T> { link; attachOptions; dispose() }`; `interface EncounterModeOptions<T> { modeId; schemaVersion; simVersion; rules; resolveLayout; codecs; validPlayers?; producers; publication; latestStreamKey? }`; `jsonModeCodecs(rules, resolveLayout, label)`; `defineEncounterMode<T>(options): ModeDefinition`; `sectorMode` (unchanged export).

- [ ] **Step 1: Write the failing test**

Create `tests/encounterMode.test.ts`:

```ts
// The mode factory (engine refactor spec §6, R-1a): defineEncounterMode builds a Net-3 ModeDefinition whose host keeps
// the merged lifecycle. The sector mode is one call to it; the same call under another mode id runs identically.
import { describe, expect, it } from 'vitest';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { sectorMode } from '../src/network/modes/sector';
import { defineEncounterMode, jsonModeCodecs } from '../src/network/modes/encounterMode';
import { createSectorProducers } from '../src/network/modes/sectorProducers';
import { createSectorStreamBinding } from '../src/network/modes/sectorStream';
import type { ModeDefinition, ModeHostDeps } from '../src/network/modes/contracts';
import { sectorRules } from '../src/renderer/src/authority/sectorRules';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import type { HostCommandInput } from '../src/shared/netSession';
import type { Link } from '../src/renderer/src/net/contracts';

const encode = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
const decode = (x: Uint8Array) => JSON.parse(new TextDecoder().decode(x));
const resolveLayout = (id: string) => { if (id !== LAYOUT.id) throw Error('unknown layout'); return LAYOUT; };
const copy = defineEncounterMode({ modeId: 'sector-copy', schemaVersion: 1, simVersion: SIM_VERSION, rules: sectorRules, resolveLayout,
  codecs: jsonModeCodecs(sectorRules, resolveLayout, 'sector-copy'),
  producers: ({ authority, init, contentDigest, restoredControllers }) => createSectorProducers({ authority, runId: init.runId, playerCount: init.playerCount, contentDigest, resolveLayout, restoredControllers }),
  publication: (link, options) => createSectorStreamBinding(link, options) });
const init = () => ({ runId: 'factory', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 9, playerCount: 2, characters: [0, 0], unlocked: [] });
function harness(mode: ModeDefinition) {
  let now = 0; const callbacks = new Set<() => void>();
  const deps: ModeHostDeps = { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => now },
    scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } }, onCrash() {} };
  const runtime = createHostRuntime(createModeRegistry([sectorMode, copy]), deps, { modeId: mode.modeId, schemaVersion: 1, simVersion: SIM_VERSION, hostGeneration: 1 });
  ownTestCleanup(() => runtime.dispose());
  let id = 0;
  return { runtime, deps, advance(t: number) { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    command(input: HostCommandInput) { return runtime.handle({ ...input, requestId: ++id, hostGeneration: 1 }); } };
}

describe('defineEncounterMode', () => {
  it('the same rules under another mode id run identically to the sector mode, start to captured checkpoint', async () => {
    const a = harness(sectorMode), b = harness(copy);
    for (const h of [a, b]) {
      expect(h.command({ kind: 'start', initBytes: encode(init()) }).ok).toBe(true);
      for (let k = 1; k <= 200; k++) h.advance(k * 1000 / 60 + 0.01);
    }
    const [x, y] = await Promise.all([a.runtime.captureCheckpoint('periodic'), b.runtime.captureCheckpoint('periodic')]);
    expect(decode(y.bytes)).toEqual(decode(x.bytes));
    expect(y.capturedTick).toBe(x.capturedTick);
  });
  it('keeps the merged host lifecycle: no replacement while attached, bounded payloads, validated ownership', () => {
    const h = harness(copy), deps = h.deps, host = copy.createHost(deps);
    ownTestCleanup(() => host.dispose());
    expect(() => host.checkpoint()).toThrow(/sector-copy unavailable/);
    host.start(encode(init()));
    expect(() => host.attach(link(), [2], 'receive-time')).toThrow(/invalid sector-copy ownership/);
    const off = host.attach(link(), [0], 'receive-time');
    expect(() => host.start(encode(init()))).toThrow(/detach producers before replacing sector-copy/);
    off(); host.start(encode(init()));
    expect(() => host.start(new Uint8Array(262145))).toThrow(/sector-copy payload exceeds limit/);
    expect(decode(host.checkpoint()).init.runId).toBe('factory');
    expect(() => host.pause('')).toThrow();
  });
});

function link(): Link {
  return { peer: 'test', caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false }, send() {}, onMessage: () => () => {}, onClose: () => () => {},
    close() {}, stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
}
```

Run: `npx vitest run tests/encounterMode.test.ts`
Expected: FAIL: the file does not load (`../src/network/modes/encounterMode` does not exist yet).

- [ ] **Step 2: The factory and the sector mode as one call**

Create `src/network/modes/encounterMode.ts`:

```ts
// The mode factory (engine refactor spec §6): defineEncounterMode turns one EncounterRules plus the mode's byte codecs,
// producers and stream publication adapter into a Net-3 ModeDefinition. Its ModeHost keeps the sector host's merged
// lifecycle: it refuses to replace itself while anything is attached, caches checkpoint candidates, encodes crash
// checkpoints, and exposes the synchronous checkpoint() hostRuntime calls and the async safe-point captureCheckpoint.
import { createEncounterAuthority, type Authority, type AttachOptions } from '../../renderer/src/authority/authority';
import type { CheckpointOf, EncounterRules, EncounterTypes, ResolveLayout } from '../../renderer/src/authority/rules';
import type { LifecyclePause } from '../../renderer/src/net/contracts';
import { boundedHostBytes } from '../../shared/netSession';
import type { CaptureCause, ModeCheckpoint } from '../../shared/sessionCheckpoint';
import { validStreamAttachmentOptions, type StreamAttachmentOptions } from '../../shared/hostProcessProtocol';
import type { AdmissionPolicy, Link, ModeDefinition, ModeHost, ModeHostDeps, Unsubscribe } from './contracts';

/** A mode's producers: bots and local hooks, bound at the authority's completed-boundary hooks. */
export interface EncounterProducers<T extends EncounterTypes> {
  controllers(): Readonly<T['controllers']>;
  beforeControls(): void;
  beforeTick(tick: number): void;
  attachHuman(link: Link, players: readonly number[], options: AttachOptions<T['snapshot']>): Unsubscribe;
  dispose(): void;
}
export interface ProducerOptions<T extends EncounterTypes> {
  authority: Authority<T>; init: T['init']; contentDigest: string; resolveLayout: ResolveLayout;
  /** Present on restore: the checkpoint's producer memory. */
  restoredControllers?: T['controllers'];
}
/** The mode's stream adapter for one streamed attachment: a link for the authority and its publication sinks. */
export interface StreamBinding<T extends EncounterTypes> { link: Link; attachOptions: AttachOptions<T['snapshot']>; dispose(): void }
export interface EncounterModeOptions<T extends EncounterTypes> {
  modeId: string; schemaVersion: number; simVersion: number;
  rules: EncounterRules<T>;
  resolveLayout: ResolveLayout;
  /** Byte codecs for the init and the checkpoint: decode validates, within Net-3's payload bounds. */
  codecs: {
    decodeInit(bytes: Uint8Array, contentDigest: string): T['init'];
    decodeCheckpoint(bytes: Uint8Array, contentDigest: string): CheckpointOf<T>;
    encodeCheckpoint(checkpoint: CheckpointOf<T>): Uint8Array;
  };
  /** Which player ids an attachment may own (default: distinct integers below the player count, at least one). */
  validPlayers?(players: readonly number[], playerCount: number): boolean;
  producers(options: ProducerOptions<T>): EncounterProducers<T>;
  publication(link: Link, options: ModeHostDeps & { resolveLayout: ResolveLayout; latestPayloadLimit: number }): StreamBinding<T>;
  latestStreamKey?(bytes: Uint8Array): string;
}

/** JSON byte codecs over the rules' validators, bounded by Net-3's host payload limit. */
export function jsonModeCodecs<T extends EncounterTypes>(rules: EncounterRules<T>, resolveLayout: ResolveLayout, label: string): EncounterModeOptions<T>['codecs'] {
  const decode = (bytes: Uint8Array): unknown => {
    if (!boundedHostBytes(bytes)) throw Error(`${label} payload exceeds limit`);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  };
  return {
    decodeInit: (bytes, contentDigest) => rules.validateInit(decode(bytes), contentDigest, resolveLayout),
    decodeCheckpoint: (bytes, contentDigest) => rules.validateCheckpoint(decode(bytes), contentDigest, resolveLayout),
    encodeCheckpoint(checkpoint) {
      const bytes = new TextEncoder().encode(JSON.stringify(checkpoint));
      if (!boundedHostBytes(bytes)) throw Error(`${label} payload exceeds limit`);
      return bytes;
    }
  };
}

const distinctPlayers = (players: readonly number[], count: number): boolean =>
  players.length > 0 && !players.some(p => !Number.isInteger(p) || p < 0 || p >= count) && new Set(players).size === players.length;

export function defineEncounterMode<T extends EncounterTypes>(options: EncounterModeOptions<T>): ModeDefinition {
  const { modeId: label, rules, resolveLayout, codecs } = options, validPlayers = options.validPlayers ?? distinctPlayers;
  function createHost(deps: ModeHostDeps): ModeHost {
    let authority: Authority<T> | null = null, disposed = false, count = 0;
    let pause: ((control: LifecyclePause) => void) | undefined;
    let producers: EncounterProducers<T> | undefined;
    const attached = new Set<Unsubscribe>();
    const streamDisposals = new Set<Unsubscribe>();
    const captures = new WeakMap<CheckpointOf<T>, ModeCheckpoint>();
    function candidate(checkpoint: CheckpointOf<T>, cause: CaptureCause): ModeCheckpoint {
      let value = captures.get(checkpoint);
      if (!value) {
        value = { capturedTick: checkpoint.snapshot.header.tick, controlRevision: checkpoint.controlRevision, cause, bytes: codecs.encodeCheckpoint(checkpoint) };
        captures.set(checkpoint, value);
      }
      return value;
    }
    function replace(value: T['init'] | CheckpointOf<T>, restore: boolean): void {
      if (disposed || attached.size) throw Error(`detach producers before replacing ${label}`);
      let nextPause: typeof pause;
      let nextProducers: EncounterProducers<T>;
      const next = createEncounterAuthority(rules, { ...deps, resolveLayout,
        onCheckpoint: deps.onCheckpoint ? (checkpoint, cause) => { deps.onCheckpoint!(candidate(checkpoint, cause)); } : undefined,
        botControllers: () => nextProducers.controllers(),
        beforeControls: () => nextProducers.beforeControls(), beforeTick: tick => nextProducers.beforeTick(tick),
        onCrash(record) { let checkpoint: Uint8Array | null = null; try { checkpoint = codecs.encodeCheckpoint(record.checkpoint); } catch { /* retain diagnostics */ }
          try { nextProducers?.dispose(); } finally { deps.onCrash({ checkpoint, diagnostic: { ...record } }); } },
        bindLifecyclePause(request) { nextPause = request; return () => { if (nextPause === request) nextPause = undefined; }; }
      });
      const init: T['init'] = restore ? (value as CheckpointOf<T>).init : value as T['init'];
      nextProducers = options.producers({ authority: next, init, contentDigest: deps.contentDigest, resolveLayout,
        restoredControllers: restore ? (value as CheckpointOf<T>).botControllers : undefined });
      try { if (restore) next.restore(value as CheckpointOf<T>); else next.start(init); }
      catch (error) { nextProducers.dispose(); next.dispose(); throw error; }
      const old = authority; authority = next; pause = nextPause;
      count = init.playerCount;
      producers?.dispose(); producers = nextProducers;
      old?.dispose();
    }
    return {
      completeBootstrap() { if (!authority || disposed) throw Error(`${label} unavailable`); authority.completeBootstrap(); },
      start(bytes) { replace(codecs.decodeInit(bytes, deps.contentDigest), false); },
      restore(bytes) { replace(codecs.decodeCheckpoint(bytes, deps.contentDigest), true); },
      attach(link, players, policy: AdmissionPolicy, attachOptions?: StreamAttachmentOptions) {
        if (disposed || !authority || !validPlayers(players, count)) throw Error(`invalid ${label} ownership`);
        if (!validStreamAttachmentOptions(attachOptions)) throw Error('invalid stream attachment');
        const stream = attachOptions?.streamed ? options.publication(link, { ...deps, resolveLayout, latestPayloadLimit: attachOptions.latestPayloadLimit! }) : undefined;
        let off: Unsubscribe;
        try { off = producers!.attachHuman(stream?.link ?? link, players, { admissionPolicy: policy, ...stream?.attachOptions }); }
        catch (error) { stream?.dispose(); throw error; }
        if (stream) streamDisposals.add(stream.dispose);
        const detach = () => { if (!attached.delete(detach)) return; try { off(); } finally { if (stream) { streamDisposals.delete(stream.dispose); stream.dispose(); } } };
        attached.add(detach); return detach;
      },
      checkpoint() { if (!authority || disposed) throw Error(`${label} unavailable`); return codecs.encodeCheckpoint(authority.checkpoint(producers!.controllers())); },
      async captureCheckpoint(cause) {
        if (!authority || disposed) throw Error(`${label} unavailable`);
        const captured = await authority.requestCheckpoint(cause);
        return candidate(captured.checkpoint, captured.cause);
      },
      pause(reason) { if (!authority || disposed || !reason.length || reason.length > 128) throw Error(`${label} unavailable`); pause?.({ paused: true, reason }); authority.pump(); },
      dispose() { if (disposed) return; disposed = true; try { producers?.dispose(); } finally { try { authority?.dispose(); } finally {
        authority = null; pause = undefined; attached.clear(); for (const release of streamDisposals) release(); streamDisposals.clear();
      } } }
    };
  }
  return { modeId: options.modeId, schemaVersion: options.schemaVersion, simVersion: options.simVersion, createHost,
    ...(options.latestStreamKey ? { latestStreamKey: options.latestStreamKey } : {}) };
}
```

Replace the whole of `src/network/modes/sector.ts` with:

```ts
// The sector mode (engine refactor spec §6): one defineEncounterMode call over the sector rules, with today's JSON
// byte codecs, card-bot producers and sector stream adapter.
import { sectorRules } from '../../renderer/src/authority/sectorRules';
import { decodeMessage } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import starter from '../../renderer/src/sim/ship/starter.json';
import skiff from '../../renderer/src/sim/ship/skiff.json';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import { createSectorStreamBinding } from './sectorStream';
import { createSectorProducers } from './sectorProducers';
import { defineEncounterMode, jsonModeCodecs } from './encounterMode';
import type { ModeDefinition } from './contracts';

const layouts = new Map([starter, skiff, cutter].map(json => { const layout = parseShip(json); return [layout.id, layout]; }));
function resolveLayout(id: string) { const layout = layouts.get(id); if (!layout) throw Error('unknown sector layout'); return layout; }

export const sectorMode: ModeDefinition = defineEncounterMode({
  modeId: 'sector', schemaVersion: 1, simVersion: SIM_VERSION, rules: sectorRules, resolveLayout,
  codecs: jsonModeCodecs(sectorRules, resolveLayout, 'sector'),
  producers: ({ authority, init, contentDigest, restoredControllers }) => createSectorProducers({ authority, runId: init.runId, playerCount: init.playerCount,
    contentDigest, resolveLayout, restoredControllers }),
  publication: (link, options) => createSectorStreamBinding(link, options),
  latestStreamKey(bytes) { const message = decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
});
```

Replace the whole of `tests/networkBoundary.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { moduleSpecifiers } from './helpers/determinismGuard';

function walk(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(root, entry.name)) : entry.name.endsWith('.ts') ? [join(root, entry.name)] : []);
}
function forbiddenDependencies(source: string): string[] {
  const tree = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true);
  const allowed = new Set<string>();
  for (const statement of tree.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly
    && ts.isStringLiteral(statement.moduleSpecifier) && /renderer\/src\/net\/(contracts|receivePolicy)$/.test(statement.moduleSpecifier.text)) allowed.add(statement.moduleSpecifier.text);
  return moduleSpecifiers(source).filter(specifier => !allowed.has(specifier)
    && (/renderer\//.test(specifier) || /(?:sector|tactical|bitecs|components|schema|snapshot)(?:[/.]|$)/.test(specifier)));
}
describe('generic host import boundary', () => {
  it.each([
    "import { createSimState } from '../renderer/src/sim/state';",
    "import type { Snapshot } from '../renderer/src/sim/snapshot';",
    "import { sectorMode } from './modes/sector';",
    "export { schema } from './tactical/schema';",
    "const ecs = require('bitecs');"
  ])('rejects a mode dependency even through a type/export/require: %s', source => {
    expect(forbiddenDependencies(source)).toHaveLength(1);
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
    it(`${relative(resolve('.'), resolve(file))} imports only generic runtime contracts`, () => {
      expect(forbiddenDependencies(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: Run the factory test and Net-3's mode, producer, stream, capture and utility tests**

Run: `npx vitest run tests/encounterMode.test.ts tests/modeHost.test.ts tests/sectorProducers.test.ts tests/sectorStream.test.ts tests/sessionCapture.test.ts tests/utilityHost.test.ts tests/hostProcess.test.ts tests/networkBoundary.test.ts`
Expected: PASS, 151 tests in 8 files.

- [ ] **Step 4: Prove the sector unchanged at every tick**

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs`, exit 0.

- [ ] **Step 5: Typecheck, the host-runtime gate, the full suite and the cross-engine check**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits` (it builds first; about 30 s), exit 0.

Run: `npm test`
Expected: every file passes, 3,093 tests in 222 files at master cabc521 (12 more than after R-0: the three new test files) (see the known flakes in Global Constraints). No file under `tests/golden/` or `tests/fixtures/` has changed.

Run: `npm run test:determinism -- --output-dir=out/r1a-determinism`
Expected: exit 0, with `1800 canonical samples, 404 result/event boundaries PASS` for Node and `1800 samples PASS` for Electron (and Firefox where it is installed). The output-dir flag (read by scripts/determinism/run.ts) sends its evidence logs to the git-ignored out/ folder instead of the tracked default under .superpowers/sdd/, so this step leaves git status unchanged apart from the files the commits name.

- [ ] **Step 6: Commit**

```bash
git add src/network/modes/encounterMode.ts src/network/modes/sector.ts tests/encounterMode.test.ts tests/networkBoundary.test.ts
git commit -q -m "feat(network): defineEncounterMode builds a Net-3 mode from rules; the sector mode is one call (engine refactor R-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After R-1a

- **R-1b** (`2026-11-16-engine-r1b-duel-mode.md`) registers the duel as the second mode on this layer.
- **The sector did not change:** the per-tick canonical trace, the unedited golden, replay and determinism tests, and Net-3's host gate prove it. Nothing was re-blessed.
- **Room compatibility:** the content digest changed (spec risk 0).
