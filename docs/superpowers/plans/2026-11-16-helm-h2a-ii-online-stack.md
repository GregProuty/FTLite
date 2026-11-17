# Helm H-2a-ii: The Headless Online Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The duel goes online headlessly, proved over the loopback before any application work. The client stack becomes mode-generic (spec §4, gap a): a generic stream client owns everything that is not cards, the sector's `createClientRun` keeps its signature and behaviour on it, and a duel stream client keeps a `DuelState` replica restored in place. The streamed remote client becomes a mode remote client, with the sector's and the duel's as two calls. The duel's producers gain a manager (spec §6): a seat with no human gets an away steward that sends `presence {present: false}` once, and a lost remote peer pauses the run with `peer-lost` only after that presence is applied. Two remote duel clients, one per seat, then fly the scripted pair through their clients only, at the sender's 20 Hz, over ten seeds.

**Architecture:**
- `clientControl/streamClient.ts` (new): `createStreamClient<S, R>(link, owned, options)`, with the mode's codec, publication validator, `supported` check, replica adapter and held-sequence store, and the sector's card hooks (`onAccepted`, `onResult`) as options.
- `clientControl/clientRun.ts`: the sector wrapper (whole file). `clientControl/duelClient.ts` (new): `createDuelStreamClient`, `validateDuelPublication`, with `command(player, command)` and `held(player, input)` that allocate their own sequences.
- `network/modes/remoteClient.ts` (new): `createModeRemoteClient`, `decodeModeNotification`. `network/modes/sectorStream.ts`: its remote client on it (whole file). `network/modes/duelStream.ts`: `createDuelRemoteClient`; `imageToDuelPublication` can skip its validation for a caller that validates.
- `network/modes/duelProducers.ts` (new): `createDuelProducers`, the steward and the peer-lost pause. `network/modes/encounterMode.ts`: `ProducerOptions.pause`, the attachment origin passed to `attachHuman`. `shared/hostProcessProtocol.ts`: `StreamAttachmentOptions.origin`. `network/modes/duel.ts`: its producers are the manager.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §3 (admission), §4 (the generic stream client, the duel adapter, the remote client), §6 (the producer manager, the steward and the peer-lost pause, rejoin) and the headless tests of §10. Follows `2026-11-16-helm-h2a-i-rounds-and-contracts.md`; H-2a-iii (`2026-11-16-helm-h2a-iii-online-app.md`) builds the application on it.

## Scope

- **Prerequisite: H-2a-i merged** (SIM_VERSION 39, the round module, `rematch`, `restoreDuelSnapshot`). Task 1 Step 0 checks it.
- **Task 1:** the generic stream client, the sector client run on it and the duel stream client.
- **Task 2:** the mode remote client; the sector's and the duel's remote clients on it.
- **Task 3:** the duel producer manager, the steward, the peer-lost pause, the attachment origin.
- **Task 4:** two clients over the loopback: ten seeds, the rematch, reconnects and round context.
- **Task 5:** the gates.
- **Not in H-2a-ii:** the main process, the renderer's online session and view, the menu and the smokes (H-2a-iii).

## Global Constraints

- **Prerequisite: H-2a-i is merged.** Do not start this plan on a checkout without it.
- **The sector client's behaviour, wire and schemas do not change.** Its suites (`tests/onlineNeutralization.test.ts`, `tests/sectorStream.test.ts`, `tests/onlineRenderer.test.ts`, `tests/botClient.test.ts`, the headless and bot tests) run unedited.
- Determinism guard (`tests/boundary.test.ts`): `clientControl/streamClient.ts` and `duelClient.ts` fall under it (no platform globals besides the `TextEncoder` the client already used). The network boundary (`tests/networkBoundary.test.ts`): `modes/remoteClient.ts` and `modes/duelProducers.ts` join the mode files that may import renderer code.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean` in the main checkout. Evidence goes under the git-ignored `out/`.
- **A git worktree needs both junctions** (`node_modules` and `services\signalling\node_modules`, as in H-2a-i); without the second, `tests/onlineAppRuntime.test.ts` and the online smokes fail.
- **Commands need no shell features.** Commit with explicit paths only; end every commit message with your session's Co-Authored-By trailer. Run single files with `npx vitest run <file>`; the full suite is `npm test` after `npm run build`; typecheck is `npm run typecheck`. Line endings LF.
- **The code is exact.** A file shown in full is written as shown. Each `replace:` block occurs exactly once in its file at that point of the plan: replace it with the `with:` block, in the order given. The plans were re-extracted step by step into a fresh worktree and reproduce the prototype byte for byte.
- Known flakes under full-suite load (each passes alone; rerun the file alone): `tests/authorityBoundary.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` ("a run saved mid Build Up") and `tests/director.test.ts` (the 20-minute soak). Task 4's ten-seed test is itself about a minute of CPU.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **The held sequence's rule moves into the core, its storage stays where the sector advances it** **(rec.; the spec says the sequence moves from `ui.players[p].heldSequence` into the core)**: the sector's `translateTick` and the bots advance `ui.players[p].heldSequence` themselves, so the core takes a `heldSequences` store (`has`, `get`, `set`). The sector passes one backed by the card UI, so its behaviour is byte-identical; the duel's is two counters. The rules (the high-water raise on every publication, neutralize's next sequence, the exhausted close) are the core's.
2. **The card hooks are two options** **(rec.)**: `onAccepted(replica, publication)` runs where the sector reconciled its card UI and vote executions (after the replica, before the watermarks), and `onResult(result)` where it reconciled a result (after the outbox, before queuing). Every other line is the old client's, in its order.
3. **One validation per received duel publication** **(rec.)**: the duel stream client's `validatePublication` is the full check (the schema and `validateDuelSnapshot`), and the remote duel client converts its images with `imageToDuelPublication(image, options, false)`, which rebuilds the publication and checks the image's identity only. A snapshot the client validated is restored in place with `restoreDuelSnapshot`; one that did not come through its validator (a strict byte link) is validated first. The host side still validates each publication on its way to each attachment (spec §5).
4. **The duel client allocates its own ids** **(rec.)**: `command(player, command)` stamps the confirmed tick and the next sequence (the confirmed `commandHighWater` + 1, never rewound) when the outbox can take it, else returns null; `held(player, input)` takes the next held sequence. The online session and the steward say only what to send.
5. **The steward is a minimal loopback producer** **(rec.)**: it reads only its seat's publications and results from the duel codec, never a replica, and sends `presence {present: false}` with `commandHighWater + 1` at the first completed boundary while the run is running; receive-time admission restamps it. It holds no memory, so the duel's controller memory stays empty.
6. **A seat with no attachment gets a steward, from the start** (spec §6): the seats are vacant until the renderers attach (the host's own port after the bootstrap, the guest when its link is ready), so their characters go away until each client's first command, `presence {present: true}`, brings them back (H-2a-iii sends it on every attach).
7. **A lost peer** is a bound attachment with origin `'remote'` that goes; its seat's steward owes the `peer-lost` pause, requested through `ProducerOptions.pause` (the same lifecycle pause `ModeHost.pause` uses) once the presence result is applied. A later human for the seat clears the debt; a `'local'` attachment, or one with no origin, never pauses.
8. **The ten-seed test drives at the publication rate** **(rec.)**: each seat's scripted pair reads its own client's replica on each new publication and sends its own player's held input on every one (every 50 ms, inside the 250 ms receive-time watchdog, so a held thrust, turn or repair is never neutralised) and its commands, through that client, at 20 Hz as the sender publishes. Every seed reaches an outcome within the gate cap; both replicas then hash as the authority's state, the journal since the last baseline replays to its final hash and holds no watchdog frame, no result is `stale-tick`, and both clients' round records equal the authority's (`duelRoundRecord` over the session's summary); across the ten seeds the crew ship releases its laser at least once, which a passive crew cannot.
9. **The replica adapter closes over the mode's layout and digest** **(rec.; spec §4 gives `load(layout, snapshot, digest)` and `restore(replica, snapshot, digest)`)**: `ReplicaAdapter` is `load(snapshot)` and `restore(replica, snapshot)`, each mode closing over its own layout resolver and content digest; the `supported(publication)` option carries the snapshot format and version check that `clientRun.ts` had inline.
10. **The ten-seed rig composes the authority and the producers by hand** **(rec.; spec §10 says a duel mode host from `authorityModes`)**: `tests/helpers/onlineDuel.ts` builds `createEncounterAuthority` and `createDuelProducers` itself, because the tests need `authority.replay()` and the duel session (`forceHunterDown`), which `ModeHost` does not expose. The `ModeHost` path (`duelMode.createHost`: the pause closure, the origin pass-through, the stream attachment options) is covered by the wiring test in `tests/duelProducers.test.ts`.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/clientControl/streamClient.ts` | **Create:** the generic stream client |
| `src/renderer/src/clientControl/clientRun.ts` | **Replace:** the sector client run on the generic core |
| `src/renderer/src/clientControl/duelClient.ts` | **Create:** the duel stream client |
| `src/network/modes/remoteClient.ts` | **Create:** the mode remote client |
| `src/network/modes/sectorStream.ts` | **Replace:** the sector remote client on it |
| `src/network/modes/duelStream.ts` | **Modify:** `createDuelRemoteClient`; the optional image validation |
| `src/network/modes/duelProducers.ts` | **Create:** the producer manager and steward |
| `src/network/modes/encounterMode.ts`, `duel.ts`, `src/shared/hostProcessProtocol.ts` | **Modify:** the pause hook and origin; the duel's producers |
| `tests/streamClient.test.ts`, `tests/duelRemoteClient.test.ts`, `tests/duelProducers.test.ts`, `tests/duelOnline.test.ts` | **Create:** the tests |
| `tests/helpers/linkPair.ts`, `tests/helpers/onlineDuel.ts` | **Create:** queued link pairs and the headless online duel rig |
| `tests/networkBoundary.test.ts` | **Modify:** two mode files join the allowed list |
| `build/contentDigest.ts`, `tests/contentDigest.test.ts` | **Modify:** `streamClient.ts` and `duelClient.ts` join the content digest and its fixture |

---

### Task 1: The generic stream client

**Files:**
- Create: `src/renderer/src/clientControl/streamClient.ts`, `src/renderer/src/clientControl/duelClient.ts`, `tests/streamClient.test.ts`
- Replace: `src/renderer/src/clientControl/clientRun.ts`
- Modify: `build/contentDigest.ts`, `tests/contentDigest.test.ts`

**Interfaces:**
- Produces:
  - `streamClient.ts`: `CommandProducerStatus`, `ReplicaAdapter<S, R>`, `HeldSequences`, `StreamClientOptions<S, R>`, `ClientActions`, `StreamCommandBudget`; `createStreamClient<S, R>(link, owned, options)` returning `acceptPublication`, `acceptNotification`, `acknowledgePublication`, `state`, `publication`, `commandBudget`, `commandStatus`, `takeEvents`, `takeResults`, `callout`, `neutralize`, `send`, `dispose`; `StreamClient<S, R>`.
  - `clientRun.ts`: `createClientRun` (unchanged signature and result, now with the core's members plus `ui`), `ClientRun`, `CommandProducerStatus` (re-exported).
  - `duelClient.ts`: `DuelPublication`, `DuelClientOptions`, `validateDuelPublication(value, options)`, `createDuelStreamClient(link, owned, options)` (the core plus `command` and `held`), `DuelStreamClient`.

- [ ] **Step 0: Check the prerequisite (H-2a-i merged)**

Run: `npx vitest run tests/duelRounds.test.ts tests/duelRematchGolden.test.ts`
Expected: PASS, 11 tests in 2 files. **If either file is missing, stop: H-2a-i is not merged.**

- [ ] **Step 1: Write the failing test**

Create `tests/streamClient.test.ts`:

````ts
// The generic stream client and its two modes (H-2 spec §4, gap a): the duel's stream client keeps a DuelState replica
// restored in place and replaced on a new round, allocates its own command and held sequences, and cannot be built
// with the sector's codec; a duel client and a sector client in one process never read each other's state.
import { describe, expect, it } from 'vitest';
import { createEncounterCore } from '../src/renderer/src/authority/core';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { createDuelStreamClient } from '../src/renderer/src/clientControl/duelClient';
import { createStreamClient } from '../src/renderer/src/clientControl/streamClient';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { duelCodec, sectorCodec, validatePublication } from '../src/renderer/src/net/codec';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import type { DuelState } from '../src/renderer/src/sim/duel/state';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { hashState } from '../src/renderer/src/sim/hash';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { LAYOUT, makeState, quiet } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function duelRig(seed: number) {
  let now = 0, ordinal = 0, session: ReturnType<typeof duelRules.create> | null = null;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: DIGEST }), pair = transport.connectLocal();
  const init = duelInit(seed, 'stream-duel');
  session = duelRules.create(init, resolveCutter);
  const core = createEncounterCore(duelRules, { init, contentDigest: DIGEST, resolveLayout: resolveCutter, clock: { nowMs: () => now },
    scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } }, session);
  const client = createDuelStreamClient(pair.clientLink, [0, 1], { runId: init.runId, contentDigest: DIGEST, resolveLayout: resolveCutter, admissionPolicy: 'receive-time' });
  ownTestCleanup(() => { client.dispose(); core.dispose(); });
  core.attach(pair.authorityLink, [0, 1], { admissionPolicy: 'receive-time' }); transport.drain();
  return { core, client, session, transport, tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; core.pump(); transport.drain(); } } };
}

describe('the duel stream client (spec §4)', () => {
  it('restores its DuelState replica in place each publication, to the authority\'s hash', () => {
    const r = duelRig(5);
    const first = r.client.state()!;
    expect(first).not.toBeNull();
    for (let k = 0; k < 30; k++) { r.tick(); expect(r.client.state()).toBe(first); expect(hashDuel(first)).toBe(r.client.publication()!.hash); }
    expect(hashDuel(first)).toBe(duelRules.hash(r.session));
  });
  it('allocates command and held sequences from the confirmed watermarks; a rematch replaces the replica', () => {
    const r = duelRig(5);
    expect(r.client.command(1, { kind: 'presence', present: false })).toEqual({ player: 1, sequence: 1 });
    expect(r.client.held(0, { moveX: 1, moveY: 0, interactHeld: false })).toBe(1);
    r.tick(2);
    expect(r.client.takeResults()).toEqual([expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' })]);
    expect(r.client.state()!.present).toEqual([true, false]);
    expect(r.client.publication()!.heldHighWater).toEqual([1, 0]);
    expect(r.client.command(0, { kind: 'setPaused', paused: true })).toEqual({ player: 0, sequence: 1 });
    r.tick(2); expect(r.client.publication()!.phase).toBe('paused');
    r.client.command(0, { kind: 'setPaused', paused: false }); r.tick(2);
    r.session.duel.tactical.systems[1].hull = 0; r.tick(3);
    const decided = r.client.state()!;
    expect(decided.tactical.outcome).toBe(Outcome.CrewWins);
    r.client.command(0, { kind: 'rematch' }); r.tick(3);
    expect(r.client.state()).not.toBe(decided);
    expect(r.client.state()!.round).toBe(1);
    expect(hashDuel(r.client.state()!)).toBe(duelRules.hash(r.session));
    r.client.neutralize(0);
    expect(r.client.command(7 as 0, { kind: 'stand' })).toBeNull();   // not owned
  });
  it('a duel stream client cannot be built with the sector codec (compile time)', () => {
    const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: DIGEST }), pair = transport.connectLocal();
    const build = () => createStreamClient<DuelSnapshot, DuelState>(pair.clientLink, [0], {
      runId: 'r',
      // @ts-expect-error the sector codec's messages carry sector snapshots, not duel snapshots
      codec: sectorCodec(),
      validatePublication: (v) => validatePublication(v) as never, supported: () => true,
      replica: { matches: () => true, load: () => { throw Error(); }, restore() {}, dispose() {}, playerCount: () => 2 },
      heldSequences: { has: () => true, get: () => 0, set() {} } });
    expect(typeof build).toBe('function');
    expect(typeof createStreamClient<DuelSnapshot, DuelState>).toBe('function');
    expect(duelCodec(2)).toBeDefined();
  });
  it('a duel client and a sector client in one process each keep exactly their own authority\'s state', () => {
    const duel = duelRig(7);
    const state = makeState(2); quiet(state);
    const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: DIGEST }), pair = transport.connectLocal();
    let now = 0;
    const authority = createFixtureAuthority({ contentDigest: DIGEST, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, resolveLayout: () => LAYOUT,
      onCrash(r) { throw Error(r.error); }, init: { runId: 'stream-sector', layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION,
        contentDigest: DIGEST, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, state);
    const sector = createClientRun(pair.clientLink, [0, 1], { runId: 'stream-sector', contentDigest: DIGEST, resolveLayout: () => LAYOUT });
    ownTestCleanup(() => sector.dispose());
    authority.attach(pair.authorityLink, [0, 1]); transport.drain();
    for (let k = 1; k <= 60; k++) {
      now = k * 1000 / 60 + 0.01; authority.pump(); transport.drain(); duel.tick();
      expect(hashState(sector.state()!)).toBe(hashState(state));
      expect(hashDuel(duel.client.state()!)).toBe(duelRules.hash(duel.session));
    }
    expect(sector.publication()!.snapshot.header).toHaveProperty('formatVersion');
    expect(duel.client.publication()!.snapshot.header).toHaveProperty('snapshotFormat');
  });
});
````

Run: `npx vitest run tests/streamClient.test.ts`
Expected: FAIL: `src/renderer/src/clientControl/duelClient.ts` does not exist.

- [ ] **Step 2: The generic stream client**

Create `src/renderer/src/clientControl/streamClient.ts`:

````ts
// The generic stream client (H-2 spec §4, gap a): everything a client of the authority does that is not cards. It
// accepts and orders publications (run, sequence and watermark checks), keeps a replica through the mode's adapter,
// owns the receive-time outboxes, the notification queues and their byte budget, the ACK gate and neutralize, and
// sends held frames and commands. The sector's createClientRun (clientRun.ts) is this core plus its card hooks; the
// duel's createDuelStreamClient (duelClient.ts) is this core over a DuelState replica. Each mode passes its own codec,
// publication validator and replica adapter, so neither ever reads the other's module state.
import type { AuthorityEvent, AuthorityMessage, CommandEnvelope, CommandResult, HeldFrame, Link, PlayerId, PublishedState } from '../net/contracts';
import type { MessageCodec } from '../net/codec';
import { hashF64 } from '../../../shared/hash';
import { createCommandOutbox, type CommandOutbox, type OutboxState } from './commandOutbox';
import type { AdmissionPolicy } from '../net/receivePolicy';

export interface CommandProducerStatus {
  state: 'waiting-state' | OutboxState;
  pending: number;
  canAllocate: boolean;
  canControl: boolean;
}
/** How a mode keeps its replica: restore in place when `matches`, else load a replacement. */
export interface ReplicaAdapter<S extends { header: { tick: number } }, R> {
  matches(replica: R, header: S['header']): boolean;
  load(snapshot: S): R;
  restore(replica: R, snapshot: S): void;
  dispose(replica: R): void;
  playerCount(replica: R): number;
}
/** Where a player's held sequence lives (the sector keeps it on its card UI, which translateTick advances). */
export interface HeldSequences { has(player: PlayerId): boolean; get(player: PlayerId): number; set(player: PlayerId, value: number): void }
export interface StreamClientOptions<S extends { header: { tick: number } }, R> {
  runId: string; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean;
  codec: MessageCodec<S>;
  /** Object validation of a publication (throws when invalid). */
  validatePublication(value: unknown): PublishedState<S>;
  /** The snapshot's format and version are this build's; otherwise the publication is rejected ('state-version'). */
  supported(publication: PublishedState<S>): boolean;
  replica: ReplicaAdapter<S, R>;
  heldSequences: HeldSequences;
  /** After a publication is applied to the replica, before the per-player watermarks (the sector's card reconcile). */
  onAccepted?(replica: R, publication: PublishedState<S>): void;
  /** For each result of this run, after its outbox saw it and before it is queued (the sector's card result hooks). */
  onResult?(result: CommandResult): void;
}
export interface ClientActions { held: readonly HeldFrame[]; commands: readonly CommandEnvelope[] }
/** A receive-time command budget: whether `player` may allocate another command now. */
export type StreamCommandBudget = (player: PlayerId, control: boolean, staged?: number) => boolean;

export function createStreamClient<S extends { header: { tick: number } }, R>(link: Link, owned: readonly PlayerId[], options: StreamClientOptions<S, R>) {
  const { codec, replica: adapter, heldSequences } = options;
  let replica: R | null = null, publication: PublishedState<S> | null = null, lastEvent = 0, disposed = false;
  const results: { value: CommandResult; floor: number; bytes: number }[] = [], events: { value: AuthorityEvent; floor: number; bytes: number }[] = [];
  let notificationBytes = 0;
  let productionEnabled = !options.remoteStreaming;
  const canProduce = () => !disposed && productionEnabled;
  const auxiliarySequences: number[] = [];
  const receiveTime = options.admissionPolicy === 'receive-time';
  const outboxes = new Map<PlayerId, CommandOutbox>(), outboxStates = new Map<PlayerId, OutboxState>();
  const commandBudget: StreamCommandBudget | undefined = receiveTime ? (player, control, staged = 0) =>
    canProduce() && (outboxes.get(player)?.canAllocate(control, staged) ?? false) : undefined;
  function flushCommands(): void {
    if (!canProduce()) return;
    for (const box of outboxes.values()) for (const envelope of box.takeSendable())
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'command', envelope }));
  }
  let startupSequence: number | null = null;
  function applyPublication(next: PublishedState<S>, strictBytes = false): 'accepted' | 'ignored' | 'rejected' {
      if (disposed || next.runId !== options.runId || next.publicationSequence <= (publication?.publicationSequence ?? 0)) return 'ignored';
      if (!options.supported(next)) { if (strictBytes) link.close('state-version'); return 'rejected'; }
      if (next.tick !== next.snapshot.header.tick) { if (strictBytes) throw Error('publication tick does not match snapshot'); return 'rejected'; }
      if (receiveTime && next.commandHighWater.some((high, player) => owned.includes(player) && !Number.isSafeInteger(high + 1))) return 'rejected';
      const values = Float64Array.from((next.snapshot as unknown as { values: number[] }).values);
      if (hashF64(values) !== next.hash) { if (strictBytes) link.close('state-checksum'); return 'rejected'; }
      if (!replica || !adapter.matches(replica, next.snapshot.header)) {
        const replacement = adapter.load(next.snapshot);
        if (disposed) { adapter.dispose(replacement); return 'ignored'; }
        if (replica) adapter.dispose(replica);
        replica = replacement;
      } else adapter.restore(replica, next.snapshot);
      publication = next; options.onAccepted?.(replica, next);
      // A replacement starts after the authority's admitted IDs; an existing
      // producer may already have newer input in flight and must never rewind.
      for (let player = 0; player < adapter.playerCount(replica); player++) {
        heldSequences.set(player, Math.max(heldSequences.get(player), next.heldHighWater[player]!));
        auxiliarySequences[player] = Math.max(auxiliarySequences[player] ?? 0, next.auxiliaryHighWater[player]!);
        if (receiveTime && owned.includes(player)) {
          const expected = next.commandHighWater[player]! + 1, box = outboxes.get(player);
          if (box) outboxStates.set(player, box.reconcile(expected));
          else { outboxes.set(player, createCommandOutbox(player, expected)); outboxStates.set(player, 'ready'); }
        }
      }
      if (startupSequence === null) startupSequence = next.eventSequence;
      if (receiveTime) flushCommands();
      return 'accepted';
  }
  function acceptPublication(value: unknown): 'accepted' | 'ignored' | 'rejected' {
    if (disposed) return 'ignored';
    try { return applyPublication(options.validatePublication(value)); } catch { return 'rejected'; }
  }
  /** Trusted mode demultiplexer passes an already codec-validated notification. */
  function acceptNotification(message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>, requiredPublicationSequence = 0): void {
    if (disposed) return;
    if (!Number.isSafeInteger(requiredPublicationSequence) || requiredPublicationSequence < 0) throw Error('invalid notification floor');
    if (message.kind === 'result' && message.runId === options.runId) {
      const box = outboxes.get(message.result.id.player);
      if (box) outboxStates.set(message.result.id.player, box.ack(message.result));
      options.onResult?.(message.result);
      const bytes = reserveNotification(message); if (bytes === null) return;
      results.push({ value: message.result, floor: requiredPublicationSequence, bytes }); if (results.length > 1024) notificationBytes -= results.shift()!.bytes;
      if (receiveTime) flushCommands();
    } else if (message.kind === 'event' && message.event.runId === options.runId && message.event.eventSequence > lastEvent) {
      lastEvent = message.event.eventSequence;
      if (events.length >= 1024) { events.length = 0; link.close('event-history-unavailable'); return; }
      const bytes = reserveNotification(message); if (bytes === null) return;
      events.push({ value: message.event, floor: requiredPublicationSequence, bytes });
    }
  }
  function reserveNotification(message: AuthorityMessage<S>): number | null {
    if (!options.remoteStreaming) return 0;
    // Charge serialized bytes plus a conservative envelope reserve, independently
    // of the count bound. Strict clients retain their existing queue policy.
    const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength + 128;
    if (events.length + results.length >= 1024 || notificationBytes + bytes > 1_048_576) {
      link.close('notification-history-unavailable'); return null;
    }
    notificationBytes += bytes; return bytes;
  }
  const unsubscribe = link.onMessage((_kind, bytes) => {
    const message = codec.decodeMessage(bytes);
    if (disposed) return;
    // decodeMessage already validated the whole publication shape. Preserve the
    // strict path's single snapshot validation inside the replica's load/restore.
    if (message.kind === 'state') {
      applyPublication(message.state, true);
    } else if (message.kind === 'result' || message.kind === 'event') acceptNotification(message);
  });
  let offClose = () => {};
  function dispose(): void {
    if (disposed) return;
    disposed = true; productionEnabled = false;
    try { unsubscribe(); offClose(); }
    finally {
      if (replica) adapter.dispose(replica);
      replica = null; publication = null; events.length = 0; results.length = 0;
      notificationBytes = 0;
      outboxes.clear(); outboxStates.clear();
    }
  }
  if (options.remoteStreaming) { offClose = link.onClose(dispose); if (disposed) offClose(); }
  return {
    acceptPublication, acceptNotification,
    /** Trusted remote adapter calls this only after synchronous validated-state ACK success. */
    acknowledgePublication(sequence: number): boolean {
      if (disposed || !options.remoteStreaming || publication?.publicationSequence !== sequence) return false;
      productionEnabled = true; flushCommands(); return !disposed;
    },
    state: () => replica, publication: () => publication, commandBudget,
    commandStatus(player: PlayerId): CommandProducerStatus {
      const box = outboxes.get(player), allowed = canProduce() && owned.includes(player);
      return { state: !productionEnabled ? 'waiting-state' : receiveTime ? outboxStates.get(player) ?? 'waiting-state' : 'ready', pending: box?.size() ?? 0,
        canAllocate: allowed && (!receiveTime || (box?.canAllocate(false) ?? false)),
        canControl: allowed && (!receiveTime || (box?.canAllocate(true) ?? false)) };
    },
    takeEvents(): AuthorityEvent[] {
      if (!publication) return [];
      const ready: AuthorityEvent[] = [];
      while (events.length && events[0]!.value.tick <= publication.tick && events[0]!.floor <= publication.publicationSequence) {
        const item = events.shift()!; notificationBytes -= item.bytes; const event = item.value;
        if (event.payload.kind === 'ended' || event.eventSequence > startupSequence!) ready.push(event);
      }
      return ready;
    }, takeResults(): CommandResult[] {
      const ready: CommandResult[] = [];
      let retained = 0;
      for (const item of results) {
        if (item.floor <= (publication?.publicationSequence ?? 0)) { notificationBytes -= item.bytes; ready.push(item.value); }
        else results[retained++] = item;
      }
      results.length = retained;
      return ready;
    },
    callout(player: PlayerId): void {
      if (!canProduce() || !owned.includes(player) || (receiveTime && !publication)) return;
      const sequence = (auxiliarySequences[player] ?? 0) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('auxiliary-sequence-exhausted'); return; }
      auxiliarySequences[player] = sequence;
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'callout', runId: options.runId, player, sequence, calloutKind: 'contextual' }));
    },
    neutralize(player: PlayerId): void {
      // Focus loss stops the ordinary producer. Neutralization only needs a
      // confirmed publication and shares its held sequence with the producer.
      if (disposed || !publication || !owned.includes(player) || !heldSequences.has(player)) return;
      const sequence = heldSequences.get(player) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('held-sequence-exhausted'); return; }
      heldSequences.set(player, sequence);
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'held', frame: { runId: options.runId, player, tick: publication.tick, sequence,
        held: { moveX: 0, moveY: 0, interactHeld: false } } }));
    },
    send(actions: ClientActions): void {
      if (!canProduce() || (receiveTime && !publication)) return;
      for (const frame of actions.held) if (owned.includes(frame.player)) link.send('unreliable-latest', codec.encodeMessage({ kind: 'held', frame }));
      for (const envelope of [...actions.commands].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence)) if (owned.includes(envelope.id.player)) {
        if (receiveTime) {
          if (outboxStates.get(envelope.id.player) === 'ready') outboxes.get(envelope.id.player)!.enqueue(envelope);
        } else link.send('reliable-ordered', codec.encodeMessage({ kind: 'command', envelope }));
      }
      if (receiveTime) flushCommands();
    },
    dispose
  };
}
export type StreamClient<S extends { header: { tick: number } }, R> = ReturnType<typeof createStreamClient<S, R>>;
````

- [ ] **Step 3: The sector client run on it**

Replace the whole of `src/renderer/src/clientControl/clientRun.ts` with:

````ts
// The sector client (H-2 spec §4): the generic stream client (streamClient.ts) over a sector SimState replica, with the
// sector codec and publication validation, plus the card hooks: the card UI reconciled on every publication and result,
// the vote executions, and the held sequence kept on the card UI where translateTick advances it. Its signature and
// behaviour are unchanged; every caller compiles as before.
import type { CommandResult, Link, PlayerId, PublishedState } from '../net/contracts';
import { decodeMessage, encodeMessage, validatePublication } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';
import { disposeSimState, type SimState } from '../sim/state';
import { loadSnapshot, restoreSnapshot, SNAPSHOT_FORMAT, type Snapshot } from '../sim/snapshot';
import { SIM_VERSION } from '../sim/tuning';
import { createCardUi, reconcileUi, reconcileCommandResult, type CommandBudget } from './cardController';
import { createStreamClient } from './streamClient';
import type { AdmissionPolicy } from '../net/receivePolicy';
export type { CommandProducerStatus } from './streamClient';

export type ClientRun = ReturnType<typeof createClientRun>;
const sectorCodec = { encodeMessage, decodeMessage };

export function createClientRun(link: Link, owned: readonly PlayerId[], options: { runId: string; contentDigest?: string; resolveLayout(id: string): ShipLayout; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean }) {
  const ui = createCardUi(options.runId), receiveTime = options.admissionPolicy === 'receive-time';
  const voteExecutions = new Map<PlayerId, { sequence: number; tick: number }>();
  let publication: PublishedState | null = null;
  function reconcileVoteExecutions(): void {
    if (!publication) return;
    for (const [player, executed] of voteExecutions) {
      const producer = ui.players[player];
      if (!producer?.pendingVote || producer.pendingVoteSequence !== executed.sequence) voteExecutions.delete(player);
      else if (publication.tick > executed.tick && publication.commandHighWater[player]! >= executed.sequence) {
        producer.pendingVote = null; voteExecutions.delete(player);
      }
    }
  }
  const core = createStreamClient<Snapshot, SimState>(link, owned, {
    runId: options.runId, admissionPolicy: options.admissionPolicy, remoteStreaming: options.remoteStreaming,
    codec: sectorCodec, validatePublication,
    supported: (next) => next.snapshot.header.formatVersion === SNAPSHOT_FORMAT && next.snapshot.header.simVersion === SIM_VERSION,
    replica: {
      matches: (replica, header) => header.layoutId === replica.layout.id && header.layoutHash === replica.derived.layoutHash && header.playerCount === replica.playerCount,
      load: (snapshot) => loadSnapshot(JSON.parse(JSON.stringify(options.resolveLayout(snapshot.header.layoutId))) as ShipLayout, snapshot, options.contentDigest),
      restore: (replica, snapshot) => restoreSnapshot(replica, snapshot, options.contentDigest),
      dispose: disposeSimState,
      playerCount: (replica) => replica.playerCount
    },
    heldSequences: { has: (player) => !!ui.players[player], get: (player) => ui.players[player]!.heldSequence, set: (player, value) => { ui.players[player]!.heldSequence = value; } },
    onAccepted(replica, next) {
      publication = next; reconcileUi(replica, ui, next.runId, next.commandHighWater, options.admissionPolicy);
      if (receiveTime) reconcileVoteExecutions();
    },
    onResult(result: CommandResult) {
      reconcileCommandResult(ui, result);
      if (receiveTime) {
        const producer = ui.players[result.id.player];
        if ((result.status === 'applied' || result.status === 'noop') && producer?.pendingVote && producer.pendingVoteSequence === result.id.sequence)
          voteExecutions.set(result.id.player, { sequence: result.id.sequence, tick: result.tick });
        reconcileVoteExecutions();
      }
    }
  });
  const commandBudget: CommandBudget | undefined = core.commandBudget;
  return { ...core, ui, commandBudget,
    dispose(): void { core.dispose(); publication = null; voteExecutions.clear(); } };
}
````

- [ ] **Step 4: The duel stream client**

Create `src/renderer/src/clientControl/duelClient.ts`:

````ts
// The duel's stream client (H-2 spec §4): the generic stream client (streamClient.ts) over a DuelState replica, with
// the duel codec and publication validation. A publication is validated once, on its way in; the replica is restored
// in place from it (restoreDuelSnapshot) and replaced only for a new round's seed or a new layout. The client allocates
// command and held sequences from the confirmed watermarks, so a producer only says what to send.
import type { CommandId, DuelCommand, HeldInput, Link, PlayerId, PublishedState } from '../net/contracts';
import { duelCodec, duelPublicationSchema } from '../net/codec';
import type { ResolveLayout } from '../authority/rules';
import { DUEL_PLAYERS, DUEL_SNAPSHOT_FORMAT, loadDuelSnapshot, restoreDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../sim/duel/state';
import { SIM_VERSION } from '../sim/tuning';
import { createStreamClient } from './streamClient';
import type { AdmissionPolicy } from '../net/receivePolicy';

export type DuelPublication = PublishedState<DuelSnapshot>;
export interface DuelClientOptions { runId: string; contentDigest: string; resolveLayout: ResolveLayout; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean }
const codec = duelCodec(DUEL_PLAYERS);

/** Object validation of a duel publication: the shared schema, the tick and the duel snapshot validator. */
export function validateDuelPublication(value: unknown, options: Pick<DuelClientOptions, 'resolveLayout' | 'contentDigest'>): DuelPublication {
  const publication = duelPublicationSchema.parse(value) as DuelPublication;
  publication.snapshot = validateDuelSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}

export function createDuelStreamClient(link: Link, owned: readonly PlayerId[], options: DuelClientOptions) {
  const held = [0, 0], next = [1, 1];
  // Snapshots this client validated itself; any other (the strict byte path) is validated before an in-place restore.
  const validated = new WeakSet<DuelSnapshot>();
  const core = createStreamClient<DuelSnapshot, DuelState>(link, owned, {
    runId: options.runId, admissionPolicy: options.admissionPolicy, remoteStreaming: options.remoteStreaming, codec,
    validatePublication(value) { const p = validateDuelPublication(value, options); validated.add(p.snapshot); return p; },
    supported: (p) => p.snapshot.header.snapshotFormat === DUEL_SNAPSHOT_FORMAT && p.snapshot.header.simVersion === SIM_VERSION,
    replica: {
      matches: (d, h) => h.layoutId === d.interior.layout.id && h.layoutHash === d.interior.derived.layoutHash && h.seed === d.tactical.seed,
      load: (snapshot) => loadDuelSnapshot(options.resolveLayout(snapshot.header.layoutId), snapshot, options.contentDigest),
      restore(d, snapshot) {
        const checked = validated.has(snapshot) ? snapshot : validateDuelSnapshot(options.resolveLayout(snapshot.header.layoutId), snapshot, options.contentDigest);
        restoreDuelSnapshot(d, checked, options.contentDigest);
      },
      dispose: disposeDuel,
      playerCount: () => DUEL_PLAYERS
    },
    heldSequences: { has: (p) => p === 0 || p === 1, get: (p) => held[p]!, set: (p, v) => { held[p] = v; } },
    onAccepted(_replica, publication) { for (const p of [0, 1]) next[p] = Math.max(next[p]!, publication.commandHighWater[p]! + 1); }
  });
  return {
    ...core,
    /** Send `command` for an owned player, stamped with the confirmed tick, when its outbox can take it; its id, or null. */
    command(player: PlayerId, command: DuelCommand): CommandId | null {
      const publication = core.publication(), status = core.commandStatus(player);
      if (!publication || !owned.includes(player) || !(command.kind === 'setPaused' ? status.canControl : status.canAllocate)) return null;
      const id = { player, sequence: next[player]! };
      if (!Number.isSafeInteger(id.sequence)) { link.close('command-sequence-exhausted'); return null; }
      next[player] = id.sequence + 1;
      core.send({ held: [], commands: [{ runId: options.runId, id, requestedTick: publication.tick, command }] });
      return id;
    },
    /** Send an owned player's held input with the next held sequence; the sequence, or null while it cannot produce. */
    held(player: PlayerId, input: HeldInput): number | null {
      const publication = core.publication();
      if (!publication || !owned.includes(player) || core.commandStatus(player).state === 'waiting-state') return null;
      const sequence = held[player]! + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('held-sequence-exhausted'); return null; }
      held[player] = sequence;
      core.send({ held: [{ runId: options.runId, player, tick: publication.tick, sequence, held: { ...input } }], commands: [] });
      return sequence;
    }
  };
}
export type DuelStreamClient = ReturnType<typeof createDuelStreamClient>;
````

- [ ] **Step 4b: The two client files join the content digest**

The client's protocol logic moves out of `clientRun.ts`, which the digest names, so the two new files are named beside it.

In `build/contentDigest.ts`, replace:

````ts
    'src/renderer/src/net/codec.ts', 'src/renderer/src/net/receivePolicy.ts', 'src/renderer/src/clientControl/clientRun.ts', 'src/shared/hostProcessProtocol.ts'
````

with:

````ts
    'src/renderer/src/net/codec.ts', 'src/renderer/src/net/receivePolicy.ts', 'src/renderer/src/clientControl/clientRun.ts', 'src/renderer/src/clientControl/streamClient.ts',
    'src/renderer/src/clientControl/duelClient.ts', 'src/shared/hostProcessProtocol.ts'
````

In `tests/contentDigest.test.ts` (each listed path must exist in the fixture root, since the digest reads every one), replace:

````ts
  'src/renderer/src/clientControl/clientRun.ts': 'export const activation = 1;\n'
};
````

with:

````ts
  'src/renderer/src/clientControl/clientRun.ts': 'export const activation = 1;\n',
  'src/renderer/src/clientControl/streamClient.ts': 'export const streamClient = 1;\n',
  'src/renderer/src/clientControl/duelClient.ts': 'export const duelClient = 1;\n'
};
````

- [ ] **Step 5: Run the new test, the sector's client suites unedited, the digest test, and the typecheck**

Run: `npx vitest run tests/streamClient.test.ts`
Expected: PASS, 4 tests in 1 file. The compile-time test is the `@ts-expect-error` line: `npm run typecheck` fails if a duel stream client builds with the sector codec.

Run: `npx vitest run tests/contentDigest.test.ts`
Expected: PASS, 36 tests in 1 file (two more `invalidates when … changes` cases, one per new path).

Run: `npx vitest run tests/onlineNeutralization.test.ts tests/sectorStream.test.ts tests/onlineRenderer.test.ts tests/botClient.test.ts tests/bot.test.ts tests/netParity.test.ts tests/boundary.test.ts`
Expected: PASS, 201 tests in 7 files, none of them edited.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```
git add src/renderer/src/clientControl/streamClient.ts src/renderer/src/clientControl/clientRun.ts src/renderer/src/clientControl/duelClient.ts tests/streamClient.test.ts build/contentDigest.ts tests/contentDigest.test.ts
git commit -m "H-2a-ii task 1: the generic stream client; the sector client run and the duel stream client on it"
```

---

### Task 2: The mode remote client

**Files:**
- Create: `src/network/modes/remoteClient.ts`, `tests/duelRemoteClient.test.ts`, `tests/helpers/linkPair.ts`
- Replace: `src/network/modes/sectorStream.ts`
- Modify: `src/network/modes/duelStream.ts`, `tests/networkBoundary.test.ts`

**Interfaces:**
- Produces:
  - `remoteClient.ts`: `RemoteStreamClient<S>`, `ModeRemoteClientOptions<S, C>`, `decodeModeNotification(codec, stream, label, packet)`, `createModeRemoteClient(link, options)` returning `{ client, streamStats, disconnect, closed }`.
  - `duelStream.ts`: `imageToDuelPublication(image, options, validate = true)`; `DuelRemoteClientOptions`; `createDuelRemoteClient(link, owned, options)` (the duel stream client plus `streamStats`, `connected`, `dispose`).
  - `tests/helpers/linkPair.ts`: `linkPair(peer, drop?)` returning `{ host, guest, flush, close }`.

- [ ] **Step 1: Write the failing test and the link pair**

Create `tests/helpers/linkPair.ts`:

````ts
// Two queued Link ends for headless stream tests: what one end sends waits until the test delivers it to the other, so
// nothing reenters a sender. `close` on either end closes both. Optionally drops ordinary (unreliable) packets.
import type { ChannelKind, Link } from '../../src/renderer/src/net/contracts';

interface End { link: Link; outbox: { kind: ChannelKind; bytes: Uint8Array }[]; receive(kind: ChannelKind, bytes: Uint8Array): void; closed(): boolean; reasons: string[] }
function end(peer: string, closeBoth: (reason: string) => void): End & { fireClose(reason: string): void } {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const outbox: End['outbox'] = [], reasons: string[] = [];
  let closed = false;
  const link: Link = { peer, caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) { if (!closed) outbox.push({ kind, bytes: bytes.slice() }); },
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    close(reason) { closeBoth(reason); },
    stats: () => ({ rttMs: 1, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, outbox, reasons, closed: () => closed,
    receive(kind, bytes) { if (!closed) for (const cb of [...messages]) cb(kind, bytes); },
    fireClose(reason) { if (closed) return; closed = true; reasons.push(reason); outbox.length = 0; for (const cb of [...closes]) cb(reason); } };
}

export interface LinkPair { host: End; guest: End; flush(): number; close(reason: string): void }
/** `drop(k)` is asked for the k-th unreliable packet in each direction; true drops it. */
export function linkPair(peer: string, drop: (k: number) => boolean = () => false): LinkPair {
  let k = 0;
  const closeBoth = (reason: string) => { host.fireClose(reason); guest.fireClose(reason); };
  const host = end(`${peer}:host`, closeBoth), guest = end(`${peer}:guest`, closeBoth);
  return { host, guest,
    /** Deliver everything queued in both directions until both queues are empty; returns the packets delivered. */
    flush() {
      let n = 0;
      while (host.outbox.length || guest.outbox.length) {
        for (const [from, to] of [[host, guest], [guest, host]] as const) for (const p of from.outbox.splice(0)) {
          if (p.kind === 'unreliable-latest' && drop(++k)) continue;
          to.receive(p.kind, p.bytes); n++;
        }
      }
      return n;
    },
    close: closeBoth };
}
````

Create `tests/duelRemoteClient.test.ts`:

````ts
// The duel's remote client (H-2 spec §4): a streamed duel attachment on a queued link pair, the host binding on one end
// and createDuelRemoteClient on the other. The client produces nothing before its full state is acknowledged, then
// tracks the authority at the sender's 20 Hz, and its commands come back on duel-notification.
import { describe, expect, it } from 'vitest';
import { createEncounterCore } from '../src/renderer/src/authority/core';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { createDuelRemoteClient, createDuelStreamBinding } from '../src/network/modes/duelStream';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { classifyStreamPacket } from '../src/network/state/imageCodec';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { linkPair } from './helpers/linkPair';
import { ownTestCleanup } from './helpers/simLifetime';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function rig(seed: number, drop?: (k: number) => boolean) {
  let now = 0, ordinal = 0;
  const clock = { nowMs: () => now }, init = duelInit(seed, 'remote-duel'), session = duelRules.create(init, resolveCutter);
  const core = createEncounterCore(duelRules, { init, contentDigest: DIGEST, resolveLayout: resolveCutter, clock, scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } }, session);
  const pair = linkPair('remote', drop), binding = createDuelStreamBinding(pair.host.link, { resolveLayout: resolveCutter, contentDigest: DIGEST, clock, latestPayloadLimit: 16088 });
  const client = createDuelRemoteClient(pair.guest.link, [1], { runId: init.runId, contentDigest: DIGEST, resolveLayout: resolveCutter, clock });
  ownTestCleanup(() => { client.dispose(); binding.dispose(); core.dispose(); });
  return { core, session, pair, binding, client,
    attach() { core.attach(binding.link, [1], { ...binding.attachOptions, admissionPolicy: 'receive-time' }); },
    tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; core.pump(); pair.flush(); } } };
}

describe('the duel remote client (spec §4)', () => {
  it('produces nothing until its full state is acknowledged, then follows the authority', () => {
    const r = rig(4);
    expect(r.client.command(1, { kind: 'stand' })).toBeNull();
    r.attach();
    expect(r.client.publication()).toBeNull();
    r.pair.flush();
    expect(r.client.publication()).not.toBeNull();
    expect(r.client.commandStatus(1).state).toBe('ready');
    r.tick(30);
    expect(hashDuel(r.client.state()!)).toBe(r.client.publication()!.hash);
    expect(r.session.duel.interior.tick - r.client.publication()!.tick).toBeLessThan(3);
  });
  it('sends ordinary state every third tick, and its commands are answered on duel-notification', () => {
    const r = rig(4);
    r.attach(); r.pair.flush();
    const states: number[] = [];
    const seen = () => { const p = r.client.publication()!; if (states.at(-1) !== p.tick) states.push(p.tick); };
    for (let k = 0; k < 30; k++) { r.tick(); seen(); }
    expect(states.slice(1).every((t, k) => t - states[k]! === 3)).toBe(true);
    const notifications: string[] = [];
    r.pair.host.link.onMessage(() => {});
    const send = r.pair.host.link.send.bind(r.pair.host.link);
    r.pair.host.link.send = (kind, bytes) => { notifications.push(classifyStreamPacket(bytes).stream); send(kind, bytes); };
    expect(r.client.command(1, { kind: 'laserCharge', held: true })).toEqual({ player: 1, sequence: 1 });
    r.tick(6);
    expect(notifications).toContain('duel-notification');
    expect(r.client.takeResults()).toEqual([expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' })]);
    expect(r.client.state()!.tactical.systems[0].fireHeld).toBe(true);
  });
  it('absorbs dropped ordinary publications and still converges', () => {
    const r = rig(6, (k) => k % 5 === 0);
    r.attach(); r.pair.flush();
    r.tick(90);
    expect(hashDuel(r.client.state()!)).toBe(r.client.publication()!.hash);
    expect(r.session.duel.interior.tick - r.client.publication()!.tick).toBeLessThanOrEqual(6);
  });
});
````

Run: `npx vitest run tests/duelRemoteClient.test.ts`
Expected: FAIL, 3 tests: `createDuelRemoteClient` is not a function.

- [ ] **Step 2: The mode remote client**

Create `src/network/modes/remoteClient.ts`:

````ts
// The client side of a streamed attachment for any mode (H-2 spec §4): createSectorRemoteClient with the mode's parts as
// parameters. It receives Net-3 state images and the mode's notification stream, hands each validated publication and
// notification to the mode's stream client, acknowledges full images, and frames every outgoing held frame, command and
// callout as an input packet on its own stream and channel. The mode supplies its codec, notification stream name and
// error label, how a state image becomes a publication, its client, and an optional presentation hook.
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { MAX_MESSAGE_BYTES, type MessageCodec } from '../../renderer/src/net/codec';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, type StateImage } from '../state/imageCodec';
import { createStateReceiver } from '../state/receiver';
import { modeInputIdentity } from './streamBinding';

/** What the remote client needs from a mode's stream client. */
export interface RemoteStreamClient<S> {
  acceptPublication(value: unknown): 'accepted' | 'ignored' | 'rejected';
  acceptNotification(message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>, requiredPublicationSequence?: number): void;
  acknowledgePublication(sequence: number): boolean;
  dispose(): void;
}
export interface ModeRemoteClientOptions<S, C extends RemoteStreamClient<S>> {
  clock: MonotonicClock;
  codec: MessageCodec<S>;
  notificationStream: string;
  /** Prefix of every close reason and error, e.g. 'sector'. */
  label: string;
  /** Turn a received state image into a publication (throws when invalid). */
  imageToPublication(image: StateImage): PublishedState<S>;
  /** Build the mode's stream client on the framing link (receive-time, remote streaming). */
  createClient(link: Link): C;
  /** After each accepted publication, while connected (the sector's presentation points). */
  onAccepted?(publication: PublishedState<S>): void;
  /** Once, when the link closes or the client is disposed, after the stream client is released. */
  onDisconnect?(): void;
}

export function decodeModeNotification<S>(codec: MessageCodec<S>, stream: string, label: string, packet: Uint8Array): { message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>; floor: number } {
  const { bytes, class: payloadClass, stream: actual } = decodeOpaquePacket(packet);
  if (payloadClass !== 'state' || actual !== stream || bytes.length <= 9 || bytes.length > 9 + MAX_MESSAGE_BYTES || bytes[0] !== 1) throw Error(`${label}-notification`);
  const floor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1, true), message = codec.decodeMessage(bytes.subarray(9));
  if (!Number.isSafeInteger(floor) || floor < 0 || message.kind !== 'result' && message.kind !== 'event') throw Error(`${label}-notification`);
  return { message, floor };
}

export function createModeRemoteClient<S, C extends RemoteStreamClient<S>>(link: Link, options: ModeRemoteClientOptions<S, C>) {
  const { codec, label } = options;
  const nextTransportSequence = createTransportSequence();
  let closed = false;
  const removers: (() => void)[] = [];
  const clientLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage: () => () => {},
    send(kind, bytes) {
      if (closed) return;
      try { const expected = modeInputIdentity(codec, label, bytes, kind); if (kind !== expected.channel) throw Error(`${label}-input-channel`);
        link.send(kind, encodeOpaquePacket('input', expected.stream, nextTransportSequence(), bytes));
      } catch { link.close(`${label}-stream-invalid`); }
    }
  };
  const client = options.createClient(clientLink);
  const receiver = createStateReceiver({ clock: options.clock, nextTransportSequence,
    accept(image) {
      if (closed) return 'ignored';
      let publication: PublishedState<S>;
      try { publication = options.imageToPublication(image); } catch { return 'rejected'; }
      const result = client.acceptPublication(publication);
      if (result === 'accepted' && !closed) options.onAccepted?.(publication);
      return result;
    },
    sendControl(bytes) {
      if (closed) return false;
      try { link.send('reliable-ordered', bytes); return !closed; } catch { link.close(`${label}-stream-invalid`); return false; }
    },
    onAcknowledged(image) { if (!closed) client.acknowledgePublication(image.sequence); },
    close: reason => link.close(reason)
  });
  function disconnect(): void {
    if (closed) return; closed = true; receiver.dispose(); client.dispose(); options.onDisconnect?.();
    for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } }
  }
  const offClose = link.onClose(disconnect);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind: ChannelKind, bytes: Uint8Array) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'state' && metadata.stream === 'state') {
        const header = inspectState(decodeStatePacket(bytes));
        if (kind !== (header.kind === 'full' ? 'reliable-ordered' : 'unreliable-latest')) throw Error(`${label}-state-channel`);
        receiver.receive(bytes); return;
      }
      if (kind !== 'reliable-ordered') throw Error(`${label}-notification-channel`);
      const { message, floor } = decodeModeNotification(codec, options.notificationStream, label, bytes); client.acceptNotification(message, floor);
    } catch { link.close(`${label}-stream-invalid`); }
  }));
  return { client, streamStats: receiver.stats, disconnect, closed: () => closed };
}
````

- [ ] **Step 3: The sector's remote client on it**

The publication adapter, the stream binding and the notification encoder are unchanged; the remote client is the mode remote client with the sector's codec, stream, label, client run and presentation hook.

Replace the whole of `src/network/modes/sectorStream.ts` with:

````ts
import { createClientRun } from '../../renderer/src/clientControl/clientRun';
import type { AuthorityMessage, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { validatePublication, createMessageCodec } from '../../renderer/src/net/codec';
import { validateSnapshot } from '../../renderer/src/sim/snapshot';
import type { ShipLayout } from '../../renderer/src/sim/ship/schema';
import { Life, Position, Seated, Stable } from '../../renderer/src/sim/components';
import { CREW_SPEED, TICK_HZ } from '../../renderer/src/sim/tuning';
import { speedMult } from '../../renderer/src/sim/characters';
import { hashF64 } from '../../shared/hash';
import { imageBytes, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, type StateImage } from '../state/imageCodec';
import { createModeStreamBinding, encodeModeNotification } from './streamBinding';
import { createModeRemoteClient } from './remoteClient';
import { createPresentationTimeline, type PresentationPoint, type PresentationTimelineOptions } from '../state/timeline';

export interface SectorValidationOptions { resolveLayout(id: string): ShipLayout; contentDigest?: string }
type Notification = Extract<AuthorityMessage, { kind: 'result' | 'event' }>;
const NOTIFICATION_STREAM = 'sector-notification';
const codec = createMessageCodec();
function identity(value: unknown): string {
  const text = JSON.stringify(value);
  return hashF64(Float64Array.from(text, c => c.charCodeAt(0)));
}
function epoch(publication: PublishedState): string {
  return identity([publication.runId, publication.snapshot.header.layoutId, publication.snapshot.header.layoutHash, publication.controlRevision, publication.phase]);
}
function checkedPublication(value: unknown, options: SectorValidationOptions): PublishedState {
  const publication: PublishedState = validatePublication(value);
  if (publication.tick !== publication.snapshot.header.tick || publication.hash !== hashF64(Float64Array.from(publication.snapshot.values))) throw Error('sector-state-identity');
  publication.snapshot = validateSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}
/** No local byte-codec roundtrip: numeric canonical values go directly into the image. */
export function publicationToImage(value: PublishedState, options: SectorValidationOptions): StateImage {
  const publication = checkedPublication(value, options);
  const image: StateImage = { sequence: publication.publicationSequence, tick: publication.tick, epoch: epoch(publication),
    metadata: new TextEncoder().encode(JSON.stringify({ ...publication, snapshot: { header: publication.snapshot.header } })),
    values: Float64Array.from(publication.snapshot.values) };
  if (image.metadata.length > MAX_METADATA_BYTES || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('sector-image-capacity');
  return image;
}
export function imageToPublication(image: StateImage, options: SectorValidationOptions): PublishedState {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
    || typeof image.epoch !== 'string' || image.epoch.length > 128 || imageBytes(image) > MAX_IMAGE_BYTES) throw Error('sector-image-capacity');
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(image.metadata));
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('sector-image-metadata');
  const publication = checkedPublication({ ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } }, options);
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('sector-image-identity');
  return publication;
}

/** Mode-owned envelope preserves the original reliable codec bytes verbatim. */
export function encodeSectorNotification(message: Notification, requiredPublicationSequence: number, transportSequence: number): Uint8Array {
  return encodeModeNotification(codec, NOTIFICATION_STREAM, 'sector', message, requiredPublicationSequence, transportSequence);
}

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createSectorStreamBinding(link: Link, options: SectorValidationOptions & { clock: MonotonicClock; latestPayloadLimit: number }) {
  return createModeStreamBinding(link, { clock: options.clock, latestPayloadLimit: options.latestPayloadLimit,
    toImage: publication => publicationToImage(publication, options), codec, notificationStream: NOTIFICATION_STREAM, label: 'sector' });
}

export interface SectorRemoteClientOptions extends SectorValidationOptions {
  runId: string; clock: MonotonicClock; presentation?: PresentationTimelineOptions;
}
/** The sector's remote client (H-2 spec §4): the mode remote client with the sector codec, its notification stream, the
 *  sector client run and its presentation points on the 100 ms timeline. Unchanged in behaviour, bytes and timing. */
export function createSectorRemoteClient(link: Link, owned: readonly number[], options: SectorRemoteClientOptions) {
  const presentation = createPresentationTimeline(options.presentation);
  let disposed = false, connected = true;
  let previous: { tick: number; points: PresentationPoint[] } | undefined;
  const generations = new Map<string, number>();
  let client!: ReturnType<typeof createClientRun>;
  function present(publication: PublishedState): void {
    const state = client.state(); if (!state || !connected) return;
    const targets = identity([state.weapons.target, state.science.target]);
    const points = state.crew.map((eid, player): PresentationPoint => {
      const id = `crew:${player}`, x = Position.x[eid]!, y = Position.y[eid]!, prior = previous?.points.find(point => point.id === id);
      const maxDistance = previous ? CREW_SPEED * speedMult(state, player) * Math.max(0, state.tick - previous.tick) / TICK_HZ + 1e-6 : Infinity;
      if (prior && Math.hypot(x - prior.x, y - prior.y) > maxDistance) generations.set(id, (generations.get(id) ?? 0) + 1);
      return { id, x, y, generation: `${Stable.id[eid]}:${Seated.station[eid]}:${Life.state[eid]}:${targets}:${generations.get(id) ?? 0}` };
    });
    presentation.push({ tick: state.tick, epoch: identity([epoch(publication), state.run.sector, state.run.node, state.run.arrivalTick]), paused: publication.phase !== 'running', points }, options.clock.nowMs());
    previous = { tick: state.tick, points };
  }
  const remote = createModeRemoteClient<import('../../renderer/src/sim/snapshot').Snapshot, ReturnType<typeof createClientRun>>(link, {
    clock: options.clock, codec, notificationStream: NOTIFICATION_STREAM, label: 'sector',
    imageToPublication: image => imageToPublication(image, options),
    createClient: clientLink => (client = createClientRun(clientLink, owned, { ...options, admissionPolicy: 'receive-time', remoteStreaming: true })),
    onAccepted: present,
    onDisconnect() { connected = false; presentation.disconnect(); previous = undefined; generations.clear(); }
  });
  return { ...remote.client, presentation, streamStats: remote.streamStats,
    dispose() { if (disposed) return; disposed = true; remote.disconnect(); presentation.dispose(); }
  };
}
````

- [ ] **Step 4: The duel's remote client**

In `src/network/modes/duelStream.ts`, replace:

````ts
// The duel's stream publication adapter (engine refactor spec §6), the equivalent of sectorStream: a duel publication
// becomes a Net-3 StateImage (its canonical values, with the rest of the publication as metadata) and back. The
// remote duel client and the online duel UI are H-2; R-1 owns the host side and the image round trip.
import type { Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { duelCodec, duelPublicationSchema } from '../../renderer/src/net/codec';
````

with:

````ts
// The duel's stream publication adapter (engine refactor spec §6), the equivalent of sectorStream: a duel publication
// becomes a Net-3 StateImage (its canonical values, with the rest of the publication as metadata) and back. H-2 adds the
// remote duel client: the mode remote client with the duel codec, 'duel-notification' and the duel stream client, no
// presentation timeline, and one validation per received publication (the stream client's).
import type { Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { createDuelStreamClient, type DuelStreamClient } from '../../renderer/src/clientControl/duelClient';
import { duelCodec, duelPublicationSchema } from '../../renderer/src/net/codec';
````

In `src/network/modes/duelStream.ts`, replace:

````ts
import { createModeStreamBinding } from './streamBinding';

````

with:

````ts
import { createModeStreamBinding } from './streamBinding';
import { createModeRemoteClient } from './remoteClient';

````

In `src/network/modes/duelStream.ts`, replace:

````ts
}
export function imageToDuelPublication(image: StateImage, options: DuelValidationOptions): DuelPublication {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
````

with:

````ts
}
/** `validate` false only rebuilds the publication and checks the image's identity: the caller validates it once
 *  (the remote client hands it to the stream client, whose validatePublication is the full check). */
export function imageToDuelPublication(image: StateImage, options: DuelValidationOptions, validate = true): DuelPublication {
  if (!(image.metadata instanceof Uint8Array) || image.metadata.length > MAX_METADATA_BYTES || !(image.values instanceof Float64Array)
````

In `src/network/modes/duelStream.ts`, replace:

````ts
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('duel-image-metadata');
  const publication = checkedPublication({ ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } }, options);
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('duel-image-identity');
````

with:

````ts
  if (!metadata?.snapshot || Object.keys(metadata.snapshot).length !== 1 || !Object.hasOwn(metadata.snapshot, 'header')) throw Error('duel-image-metadata');
  const value = { ...metadata, snapshot: { header: metadata.snapshot.header, values: Array.from(image.values) } };
  const publication = validate ? checkedPublication(value, options) : value as DuelPublication;
  if (image.sequence !== publication.publicationSequence || image.tick !== publication.tick || image.epoch !== epoch(publication)) throw Error('duel-image-identity');
````

In `src/network/modes/duelStream.ts`, replace:

````ts
    toImage: publication => duelPublicationToImage(publication, options), codec: duelCodec(2), notificationStream: NOTIFICATION_STREAM, label: 'duel' });
}
````

with:

````ts
    toImage: publication => duelPublicationToImage(publication, options), codec: duelCodec(2), notificationStream: NOTIFICATION_STREAM, label: 'duel' });
}

export interface DuelRemoteClientOptions extends DuelValidationOptions { runId: string; clock: MonotonicClock }
/** The client side of a streamed duel attachment (H-2 spec §4): receive-time, remote streaming, no presentation delay. */
export function createDuelRemoteClient(link: Link, owned: readonly number[], options: DuelRemoteClientOptions) {
  let disposed = false;
  const remote = createModeRemoteClient<DuelSnapshot, DuelStreamClient>(link, { clock: options.clock, codec: duelCodec(2), notificationStream: NOTIFICATION_STREAM, label: 'duel',
    imageToPublication: image => imageToDuelPublication(image, options, false),
    createClient: clientLink => createDuelStreamClient(clientLink, owned, { runId: options.runId, contentDigest: options.contentDigest, resolveLayout: options.resolveLayout,
      admissionPolicy: 'receive-time', remoteStreaming: true }) });
  return { ...remote.client, streamStats: remote.streamStats, connected: () => !remote.closed(),
    dispose() { if (disposed) return; disposed = true; remote.disconnect(); } };
}
````

- [ ] **Step 5: The mode remote client may import renderer code**

In `tests/networkBoundary.test.ts`, replace:

````ts
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
````

with:

````ts
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts', 'modes/remoteClient.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
````

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/duelRemoteClient.test.ts tests/sectorStream.test.ts tests/onlineNeutralization.test.ts tests/onlineRenderer.test.ts tests/duelMode.test.ts tests/encounterMode.test.ts tests/networkBoundary.test.ts`
Expected: PASS, 108 tests in 7 files (`tests/duelRemoteClient.test.ts` 3; the sector files unedited).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```
git add src/network/modes/remoteClient.ts src/network/modes/sectorStream.ts src/network/modes/duelStream.ts tests/networkBoundary.test.ts tests/helpers/linkPair.ts tests/duelRemoteClient.test.ts
git commit -m "H-2a-ii task 2: the mode remote client; the sector remote client and the duel remote client on it"
```

---

### Task 3: The duel producer manager

**Files:**
- Create: `src/network/modes/duelProducers.ts`, `tests/duelProducers.test.ts`, `tests/helpers/onlineDuel.ts`
- Modify: `src/shared/hostProcessProtocol.ts`, `src/network/modes/encounterMode.ts`, `src/network/modes/duel.ts`, `tests/networkBoundary.test.ts`

**Interfaces:**
- Consumes: Task 2's `createDuelRemoteClient`, `createDuelStreamBinding`; `createLoopbackHarness`.
- Produces:
  - `hostProcessProtocol.ts`: `StreamAttachmentOptions.origin?: 'local' | 'remote'`, validated.
  - `encounterMode.ts`: `ProducerOptions.pause(reason)`; `EncounterProducers.attachHuman(link, players, options, origin?)`.
  - `duelProducers.ts`: `AttachmentOrigin`; `createDuelProducers({ authority, runId, contentDigest, pause })` returning `attachHuman`, `beforeControls`, `beforeTick`, `controllers`, `stewards` (a test probe), `dispose`.
  - `tests/helpers/onlineDuel.ts`: `onlineDuel(seed, { helmPlayer?, runId?, drop?, restore? })` returning the authority, producers, captures, seats, `connect(seat, origin?)`, `tick(n)`, `session()`, `forceHunterDown()`.

- [ ] **Step 1: Write the failing tests and the online duel rig**

Create `tests/helpers/onlineDuel.ts`:

````ts
// A headless online duel (H-2 spec §10): the duel authority with the duel producer manager and one streamed,
// receive-time attachment per seat, each with a createDuelRemoteClient on a queued link pair, all on a clock the test
// advances one tick at a time. The authority and the producers are composed by hand, not through duelMode.createHost
// (Decision 10), so the authority stays in reach for its replay and the duel session for a forced round end (tests
// only); the ModeHost wiring is the wiring test's in duelProducers.test.ts.
import { createEncounterAuthority } from '../../src/renderer/src/authority/authority';
import { duelRules, type DuelSession, type DuelTypes } from '../../src/renderer/src/authority/duelRules';
import type { EncounterRules } from '../../src/renderer/src/authority/rules';
import type { DuelCheckpoint } from '../../src/renderer/src/authority/duelCheckpoint';
import type { CaptureCause } from '../../src/shared/sessionCheckpoint';
import type { LifecyclePause } from '../../src/renderer/src/net/contracts';
import { createDuelProducers, type AttachmentOrigin } from '../../src/network/modes/duelProducers';
import { createDuelRemoteClient, createDuelStreamBinding } from '../../src/network/modes/duelStream';
import { duelInit, resolveCutter } from './duelAuthority';
import { linkPair, type LinkPair } from './linkPair';
import { ownTestCleanup } from './simLifetime';

export interface Seat { seat: 0 | 1; pair: LinkPair; client: ReturnType<typeof createDuelRemoteClient>; detach(): void; origin: AttachmentOrigin }
export function onlineDuel(seed: number, options: { helmPlayer?: 0 | 1; runId?: string; drop?: (k: number) => boolean; restore?: DuelCheckpoint } = {}) {
  const runId = options.runId ?? `online-${seed}`, contentDigest = __GAMEPLAY_CONTENT_DIGEST__;
  let now = 0, ordinal = 0, request: ((control: LifecyclePause) => void) | undefined;
  const clock = { nowMs: () => now }, captures: { checkpoint: DuelCheckpoint; cause: CaptureCause }[] = [];
  let producers!: ReturnType<typeof createDuelProducers>, session: DuelSession | null = null;
  const rules: EncounterRules<DuelTypes> = { ...duelRules,
    create: (init, resolve) => (session = duelRules.create(init, resolve)), restore: (snap, resolve, memory) => (session = duelRules.restore(snap, resolve, memory)) };
  const authority = createEncounterAuthority(rules, { clock, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: resolveCutter,
    onCrash(record) { throw Error(record.error); }, onCheckpoint: (checkpoint, cause) => { captures.push({ checkpoint: checkpoint as DuelCheckpoint, cause }); },
    beforeControls: () => producers.beforeControls(), beforeTick: () => producers.beforeTick(),
    bindLifecyclePause(next) { request = next; return () => { if (request === next) request = undefined; }; } });
  producers = createDuelProducers({ authority, runId, contentDigest, pause: (reason) => request?.({ paused: true, reason }) });
  if (options.restore) authority.restore(options.restore); else authority.start(duelInit(seed, runId, options.helmPlayer ?? 0));
  ownTestCleanup(() => { producers.dispose(); authority.dispose(); });
  const seats: (Seat | undefined)[] = [undefined, undefined];
  function connect(seat: 0 | 1, origin: AttachmentOrigin = 'remote'): Seat {
    const pair = linkPair(`seat-${seat}`, options.drop);
    const binding = createDuelStreamBinding(pair.host.link, { resolveLayout: resolveCutter, contentDigest, clock, latestPayloadLimit: 16088 });
    const off = producers.attachHuman(binding.link, [seat], { ...binding.attachOptions, admissionPolicy: 'receive-time' }, origin);
    const client = createDuelRemoteClient(pair.guest.link, [seat], { runId, contentDigest, resolveLayout: resolveCutter, clock });
    const s: Seat = { seat, pair, client, origin, detach() { off(); binding.dispose(); pair.close('detached'); client.dispose(); } };
    ownTestCleanup(() => { client.dispose(); binding.dispose(); });
    seats[seat] = s;
    return s;
  }
  const flush = () => { let moved = 1; while (moved) { moved = 0; for (const s of seats) if (s && !s.pair.host.closed()) moved += s.pair.flush(); } };
  return {
    authority, producers, captures, seats, connect, flush, runId,
    /** The authority's duel session (tests only). */
    session: () => session!,
    /** A forced round end (tests only): the hunter's hull at 0, so the next tick decides the round for the crew. */
    forceHunterDown() { session!.duel.tactical.systems[1].hull = 0; },
    tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; authority.pump(); flush(); } },
    nowMs: () => now,
    advanceClock(ms: number) { now += ms; }
  };
}
````

Create `tests/duelProducers.test.ts`:

````ts
// The duel's producer manager (H-2 spec §6, §10): the away steward, the peer-lost pause after the steward's presence
// is applied, rejoin, the local-port exception, a loss while already paused, and a rejected presence.
import { describe, expect, it } from 'vitest';
import type { Authority } from '../src/renderer/src/authority/authority';
import { duelRules, type DuelTypes } from '../src/renderer/src/authority/duelRules';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, Link } from '../src/renderer/src/net/contracts';
import { saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { hashF64 } from '../src/shared/hash';
import { createDuelProducers } from '../src/network/modes/duelProducers';
import { duelMode } from '../src/network/modes/duel';
import { createDuelRemoteClient } from '../src/network/modes/duelStream';
import { validStreamAttachmentOptions } from '../src/shared/hostProcessProtocol';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { linkPair } from './helpers/linkPair';
import { onlineDuel } from './helpers/onlineDuel';
import { ownTestCleanup } from './helpers/simLifetime';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const peerLost = (rig: ReturnType<typeof onlineDuel>) => rig.captures.filter((c) => c.cause === 'pause' && c.checkpoint.pauseReason === 'peer-lost');

describe('the away steward and the peer-lost pause (spec §6)', () => {
  it('a remote Weapons seat lost mid-charge: the presence false is applied first, then the peer-lost pause, and its capture is delivered', () => {
    const rig = onlineDuel(2), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3);
    expect(b.client.command(1, { kind: 'laserCharge', held: true })).not.toBeNull();
    rig.tick(6);
    expect(rig.session().duel.tactical.systems[0].fireHeld).toBe(true);
    b.detach();
    rig.tick(6);
    const lost = peerLost(rig);
    expect(lost).toHaveLength(1);
    const cp = lost[0]!.checkpoint, presence = cp.recentResults.find((r) => r.envelope.id.player === 1 && r.envelope.command.kind === 'presence');
    expect(presence?.envelope.command).toEqual({ kind: 'presence', present: false });
    expect(presence?.result.status).toBe('applied');
    expect(presence!.result.tick).toBeLessThan(cp.snapshot.header.tick);   // applied on an earlier tick than the pause boundary
    expect(cp.phase).toBe('paused');
    const d = rig.session().duel, charge = d.tactical.systems[0].laserCharge, tick = d.interior.tick, empty = rig.session().telemetry.weaponsEmptyTicks;
    expect(d.present).toEqual([true, false]);
    expect(empty).toBeGreaterThan(0);   // the Weapons console counts empty
    rig.tick(30);
    expect([d.interior.tick, d.tactical.systems[0].laserCharge, rig.session().telemetry.weaponsEmptyTicks]).toEqual([tick, charge, empty]);   // frozen while paused
    expect(a.client.publication()!.pauseReason).toBe('peer-lost');
  });
  it('rejoin: no input before the full-state ACK, then presence true, and the duel stays paused until a resume', () => {
    const rig = onlineDuel(2), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3); b.detach(); rig.tick(6);
    expect(peerLost(rig)).toHaveLength(1);
    const again = rig.connect(1);
    expect(again.client.command(1, { kind: 'presence', present: true })).toBeNull();   // before its state is acknowledged
    rig.tick(2);
    expect(again.client.commandStatus(1).state).toBe('ready');
    expect(rig.producers.stewards().map((s) => s.player)).toEqual([]);   // the steward retired
    expect(again.client.command(1, { kind: 'presence', present: true })).not.toBeNull();
    rig.tick(10);
    expect(again.client.publication()!.phase).toBe('paused');
    expect(rig.session().duel.present[1]).toBe(false);   // nothing steps while paused
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(4);
    expect(again.client.publication()!.phase).toBe('running');
    expect(rig.session().duel.present).toEqual([true, true]);
    expect(peerLost(rig)).toHaveLength(1);   // rejoining never paused or resumed anything by itself
  });
  it('the host\'s own local port going gets a steward but no pause', () => {
    const rig = onlineDuel(2), a = rig.connect(0, 'local'), b = rig.connect(1);
    rig.tick(3); a.detach(); rig.tick(10);
    expect(peerLost(rig)).toEqual([]);
    expect(b.client.publication()!.phase).toBe('running');
    expect(rig.session().duel.present).toEqual([false, true]);
    expect(rig.producers.stewards()).toEqual([{ player: 0, done: true, lost: false, pending: false }]);
  });
  it('a loss while already paused: the presence waits for the resume, no peer-lost pause, captures continue', async () => {
    const rig = onlineDuel(2), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3);
    a.client.command(0, { kind: 'setPaused', paused: true }); rig.tick(3);
    expect(a.client.publication()!.phase).toBe('paused');
    b.detach(); rig.tick(10);
    expect(rig.producers.stewards()).toEqual([{ player: 1, done: false, lost: false, pending: false }]);
    const captured = rig.authority.requestCheckpoint('paused-control'); rig.tick();
    expect((await captured).checkpoint.phase).toBe('paused');
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(6);
    expect(rig.session().duel.present).toEqual([true, false]);
    expect(peerLost(rig)).toEqual([]);
    expect(a.client.publication()!.phase).toBe('running');
  });
  it('a rejected presence is retried once; a second rejection pauses anyway', () => {
    const attached: Link[] = [], pauses: string[] = [], codec = duelCodec(2);
    const authority = { attach(link: Link) { attached.push(link); return () => {}; } } as unknown as Authority<DuelTypes>;
    const producers = createDuelProducers({ authority, runId: 'r', contentDigest: DIGEST, pause: (reason) => pauses.push(reason) });
    ownTestCleanup(() => producers.dispose());
    const human = linkPair('human');
    const off = producers.attachHuman(human.host.link, [1], { admissionPolicy: 'receive-time' }, 'remote');
    producers.beforeControls();   // binds the human, and a steward for the vacant seat 0
    off();                       // the remote human goes
    producers.beforeControls();   // a steward for seat 1, owing the peer-lost pause
    const steward = attached.at(-1)!, commands: CommandEnvelope[] = [];
    steward.onMessage((_k, bytes) => { const m = codec.decodeMessage(bytes); if (m.kind === 'command') commands.push(m.envelope); });
    const s = duelRules.create(duelInit(4, 'r'), resolveCutter), snapshot = saveDuelSnapshot(s.duel, DIGEST); duelRules.dispose(s);
    steward.send('reliable-ordered', codec.encodeMessage({ kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1, snapshot, hash: hashF64(Float64Array.from(snapshot.values)),
      phase: 'running', pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 3], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 } }));
    const reject = () => steward.send('reliable-ordered', codec.encodeMessage({ kind: 'result', runId: 'r', result: { id: commands.at(-1)!.id, tick: 1, status: 'rejected', reason: 'stale-tick' } }));
    producers.beforeControls();
    expect(commands.map((c) => [c.id, c.command])).toEqual([[{ player: 1, sequence: 4 }, { kind: 'presence', present: false }]]);
    reject(); producers.beforeControls();
    expect(commands).toHaveLength(2);   // the one retry
    expect(pauses).toEqual([]);
    reject(); producers.beforeControls();
    expect(pauses).toEqual(['peer-lost']);
    expect(commands).toHaveLength(2);
  });
});

describe('the duel mode host wiring (spec §6)', () => {
  it('a stream attachment carries its origin, and the duel mode host pauses for a lost remote peer', () => {
    expect(validStreamAttachmentOptions({ streamed: true, latestPayloadLimit: 16088, origin: 'remote' })).toBe(true);
    expect(validStreamAttachmentOptions({ streamed: true, latestPayloadLimit: 16088, origin: 'elsewhere' })).toBe(false);
    let now = 0;
    const callbacks = new Set<() => void>();
    const host = duelMode.createHost({ contentDigest: DIGEST, clock: { nowMs: () => now }, onCrash(r) { throw Error(JSON.stringify(r.diagnostic)); },
      scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } } });
    ownTestCleanup(() => host.dispose());
    host.start(new TextEncoder().encode(JSON.stringify(duelInit(2, 'wired'))));
    const pairs = [linkPair('p0'), linkPair('p1')];
    const detach = pairs.map((p, seat) => host.attach(p.host.link, [seat], 'receive-time', { streamed: true, latestPayloadLimit: 16088, origin: 'remote' }));
    const clients = pairs.map((p, seat) => createDuelRemoteClient(p.guest.link, [seat], { runId: 'wired', contentDigest: DIGEST, resolveLayout: resolveCutter, clock: { nowMs: () => now } }));
    ownTestCleanup(() => { for (const c of clients) c.dispose(); });
    const advance = (n: number) => { for (let k = 0; k < n; k++) { now += 1000 / 60; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } for (const p of pairs) p.flush(); } };
    advance(10);
    expect(clients[0]!.publication()!.phase).toBe('running');
    detach[1]!(); pairs[1]!.close('gone');
    advance(10);
    const cp = JSON.parse(new TextDecoder().decode(host.checkpoint()));
    expect([cp.phase, cp.pauseReason]).toEqual(['paused', 'peer-lost']);
    expect(clients[0]!.publication()!.pauseReason).toBe('peer-lost');
  });
});
````

Run: `npx vitest run tests/duelProducers.test.ts`
Expected: FAIL: `src/network/modes/duelProducers.ts` does not exist.

- [ ] **Step 2: The attachment origin**

In `src/shared/hostProcessProtocol.ts`, replace:

````ts

/** Trusted host attachment only; never part of gameplay or renderer IPC payloads. */
export interface StreamAttachmentOptions { streamed?: boolean; latestPayloadLimit?: number }
export function validStreamAttachmentOptions(value: unknown): value is StreamAttachmentOptions | undefined {
````

with:

````ts

/** Trusted host attachment only; never part of gameplay or renderer IPC payloads. `origin` (H-2 spec §6): main marks
 *  the host's own renderer port 'local' and every guest attachment 'remote', so a mode can tell a lost peer. */
export interface StreamAttachmentOptions { streamed?: boolean; latestPayloadLimit?: number; origin?: 'local' | 'remote' }
export function validStreamAttachmentOptions(value: unknown): value is StreamAttachmentOptions | undefined {
````

In `src/shared/hostProcessProtocol.ts`, replace:

````ts
  const options = value as StreamAttachmentOptions;
  return Object.keys(options).every(key => key === 'streamed' || key === 'latestPayloadLimit')
    && (options.streamed === undefined || typeof options.streamed === 'boolean')
    && (options.latestPayloadLimit === undefined ? options.streamed !== true : Number.isSafeInteger(options.latestPayloadLimit)
````

with:

````ts
  const options = value as StreamAttachmentOptions;
  return Object.keys(options).every(key => key === 'streamed' || key === 'latestPayloadLimit' || key === 'origin')
    && (options.streamed === undefined || typeof options.streamed === 'boolean')
    && (options.origin === undefined || options.origin === 'local' || options.origin === 'remote')
    && (options.latestPayloadLimit === undefined ? options.streamed !== true : Number.isSafeInteger(options.latestPayloadLimit)
````

- [ ] **Step 3: The producers' pause hook and the origin in the mode factory**

In `src/network/modes/encounterMode.ts`, replace:

````ts
  beforeTick(tick: number): void;
  attachHuman(link: Link, players: readonly number[], options: AttachOptions<T['snapshot']>): Unsubscribe;
  dispose(): void;
````

with:

````ts
  beforeTick(tick: number): void;
  /** `origin` is the stream attachment's (H-2 spec §6): 'local' for the host's own renderer, 'remote' for a guest. */
  attachHuman(link: Link, players: readonly number[], options: AttachOptions<T['snapshot']>, origin?: 'local' | 'remote'): Unsubscribe;
  dispose(): void;
````

In `src/network/modes/encounterMode.ts`, replace:

````ts
  restoredControllers?: T['controllers'];
}
````

with:

````ts
  restoredControllers?: T['controllers'];
  /** The host's lifecycle pause, the one ModeHost.pause uses (H-2 spec §6: the duel's peer-lost pause). */
  pause(reason: string): void;
}
````

In `src/network/modes/encounterMode.ts`, replace:

````ts
      nextProducers = options.producers({ authority: next, init, contentDigest: deps.contentDigest, resolveLayout,
        restoredControllers: restore ? (value as CheckpointOf<T>).botControllers : undefined });
      try { if (restore) next.restore(value as CheckpointOf<T>); else next.start(init); }
````

with:

````ts
      nextProducers = options.producers({ authority: next, init, contentDigest: deps.contentDigest, resolveLayout,
        restoredControllers: restore ? (value as CheckpointOf<T>).botControllers : undefined,
        pause: (reason) => { if (!reason.length || reason.length > 128) throw Error(`${label} pause reason`); nextPause?.({ paused: true, reason }); } });
      try { if (restore) next.restore(value as CheckpointOf<T>); else next.start(init); }
````

In `src/network/modes/encounterMode.ts`, replace:

````ts
        let off: Unsubscribe;
        try { off = producers!.attachHuman(stream?.link ?? link, players, { admissionPolicy: policy, ...stream?.attachOptions }); }
        catch (error) { stream?.dispose(); throw error; }
````

with:

````ts
        let off: Unsubscribe;
        try { off = producers!.attachHuman(stream?.link ?? link, players, { admissionPolicy: policy, ...stream?.attachOptions }, attachOptions?.origin); }
        catch (error) { stream?.dispose(); throw error; }
````

- [ ] **Step 4: The producer manager and the steward**

Create `src/network/modes/duelProducers.ts`:

````ts
// The duel's producer manager (H-2 spec §6), the duel's equivalent of sectorProducers.ts. The duel's producers are its
// two humans; a seat with no human attachment, or whose attachment has gone, gets one away steward instead. The steward
// is a loopback producer: at a completed boundary while the run is running it sends `presence {present: false}` once
// through the normal ledger, and otherwise nothing; it keeps no memory. When a remote human's attachment goes (a lost
// peer), the manager pauses the run with 'peer-lost' once the steward's presence has an applied result, so the pause
// checkpoint and its mirror can be captured with nothing pending. Already paused: the presence waits for the resume
// and no peer-lost pause is asked. A rejected presence is retried once; if the retry is rejected too, the manager
// pauses anyway. A local attachment (the host's own renderer port) that goes gets a steward but no pause. Ownership
// changes bind only at the authority's completed-boundary hooks, as in the sector.
import type { Authority, AttachOptions } from '../../renderer/src/authority/authority';
import type { DuelTypes } from '../../renderer/src/authority/duelRules';
import { duelCodec } from '../../renderer/src/net/codec';
import { createLoopbackHarness } from '../../renderer/src/net/loopback';
import type { AuthorityMessage, CommandId, Link, PublishedState, Unsubscribe } from '../../renderer/src/net/contracts';
import type { DuelSnapshot } from '../../renderer/src/sim/duel/snapshot';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';

export type AttachmentOrigin = 'local' | 'remote';
interface DuelProducerOptions { authority: Authority<DuelTypes>; runId: string; contentDigest: string; pause(reason: string): void }
interface Human { link: Link; players: readonly number[]; options: AttachOptions<DuelSnapshot>; origin?: AttachmentOrigin; detach?: Unsubscribe; offClose?: Unsubscribe }
/** One away steward: its loopback link, what it last saw, its presence command, and whether a lost peer awaits its pause. */
interface Steward {
  player: number; link: Link; detach: Unsubscribe; close(): void;
  publication: PublishedState<DuelSnapshot> | null; results: AuthorityMessage<DuelSnapshot>[];
  pending: CommandId | null; done: boolean; rejected: number; lost: boolean;
}
const PLAYERS = 2;
const codec = duelCodec(PLAYERS);

export function createDuelProducers(options: DuelProducerOptions) {
  const { authority, runId, contentDigest } = options;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  const desired: (Human | undefined)[] = [undefined, undefined];
  const humans = new Set<Human>(), stewards = new Map<number, Steward>(), lost = new Set<number>();
  let disposed = false;
  function bindSteward(player: number): Steward {
    const pair = transport.connectLocal();
    const steward: Steward = { player, link: pair.clientLink, detach: () => {}, close: () => { pair.host.close('steward-retired'); pair.client.close('steward-retired'); },
      publication: null, results: [], pending: null, done: false, rejected: 0, lost: lost.delete(player) };
    pair.clientLink.onMessage((_kind, bytes) => {
      const message = codec.decodeMessage(bytes) as AuthorityMessage<DuelSnapshot>;
      if (message.kind === 'state') steward.publication = message.state;
      else if (message.kind === 'result') steward.results.push(message);
    });
    try { steward.detach = authority.attach(pair.authorityLink, [player], { admissionPolicy: 'receive-time' }); }
    catch (error) { steward.close(); throw error; }
    return steward;
  }
  function retireSteward(steward: Steward): void {
    stewards.delete(steward.player);
    try { steward.detach(); } finally { steward.close(); }
  }
  /** The steward's one job: presence false while running, retried once, then the peer-lost pause if it owes one. */
  function steward(s: Steward): void {
    for (const message of s.results.splice(0)) {
      if (message.kind !== 'result' || !s.pending || message.result.id.player !== s.pending.player || message.result.id.sequence !== s.pending.sequence) continue;
      s.pending = null;
      if (message.result.status === 'applied') s.done = true;
      else if (++s.rejected >= 2) s.done = true;   // the retry was rejected too: give up, and pause anyway
      if (s.done && s.lost) { s.lost = false; options.pause('peer-lost'); }
    }
    const p = s.publication;
    if (s.done || s.pending || !p) return;
    if (p.phase === 'paused') { s.lost = false; return; }   // already paused: presence waits for the resume, no peer-lost pause
    if (p.phase !== 'running') return;
    s.pending = { player: s.player, sequence: p.commandHighWater[s.player]! + 1 };
    const envelope = { runId, id: s.pending, requestedTick: p.tick, command: { kind: 'presence' as const, present: false } };
    s.link.send('reliable-ordered', codec.encodeMessage({ kind: 'command', envelope }));
  }
  function cancel(human: Human): void {
    for (const player of human.players) if (desired[player] === human) {
      desired[player] = undefined;
      if (human.detach && human.origin === 'remote') lost.add(player);   // a bound remote seat went: a lost peer
    }
  }
  function wanted(human: Human): boolean { return human.players.every(player => desired[player] === human); }
  function retire(human: Human): void {
    if (!humans.delete(human)) return;
    cancel(human);
    human.offClose?.();
    try { human.detach?.(); } finally { human.link.close('duel-producer-retired'); }
  }
  function boundary(): void {
    if (disposed) return;
    transport.drain();
    // Detach all old owners before any replacement can publish or send input.
    for (const human of humans) if (!wanted(human)) retire(human);
    for (const [player, s] of stewards) if (desired[player]) retireSteward(s);
    for (const human of [...humans]) {
      if (disposed) return;
      if (!wanted(human) || human.detach) continue;
      try { human.detach = authority.attach(human.link, human.players, human.options); }
      catch { retire(human); continue; }
      // The initial publication can synchronously close, replace, or dispose this owner.
      if (disposed || !wanted(human)) { human.detach(); retire(human); }
    }
    if (disposed) return;
    for (let player = 0; player < PLAYERS; player++) if (!desired[player] && !stewards.has(player)) {
      const s = bindSteward(player);
      if (disposed || desired[player]) { s.detach(); s.close(); } else stewards.set(player, s);
      if (disposed) return;
    }
    transport.drain();
    for (const s of [...stewards.values()]) steward(s);
    transport.drain();
  }
  return {
    attachHuman(link: Link, players: readonly number[], attachOptions: AttachOptions<DuelSnapshot>, origin?: AttachmentOrigin): Unsubscribe {
      if (disposed || !players.length || players.some(p => !Number.isInteger(p) || p < 0 || p >= PLAYERS)
        || new Set(players).size !== players.length || [...humans].some(h => h.link === link)
        || (attachOptions.admissionPolicy !== undefined && attachOptions.admissionPolicy !== 'strict' && attachOptions.admissionPolicy !== 'receive-time'))
        throw Error('invalid duel producer');
      const human: Human = { link, players: [...players], options: { ...attachOptions }, origin };
      for (const player of players) if (desired[player]) cancel(desired[player]!);
      for (const player of players) desired[player] = human;
      humans.add(human);
      human.offClose = link.onClose(() => cancel(human));
      for (const candidate of humans) if (!wanted(candidate) && !candidate.detach) retire(candidate);
      return () => cancel(human);
    },
    beforeControls: boundary,
    beforeTick(): void { boundary(); },
    controllers: (): readonly never[] => [],
    /** Test probe: which seats have a steward, and whether each still owes its presence or a pause. */
    stewards: () => [...stewards.values()].map(s => ({ player: s.player, done: s.done, lost: s.lost, pending: s.pending !== null })),
    dispose(): void {
      if (disposed) return; disposed = true;
      for (const human of humans) retire(human);
      for (const s of [...stewards.values()]) retireSteward(s);
      desired.fill(undefined);
    }
  };
}
````

- [ ] **Step 5: The duel mode's producers are the manager**

Replace the whole of `src/network/modes/duel.ts` with:

````ts
// The duel mode (engine refactor spec §6): the second registered mode, one defineEncounterMode call over the duel
// rules. Its producers are the humans and, for a seat with nobody attached, the away steward (duelProducers.ts, H-2
// spec §6), and its stream adapter is duelStream. Schema version 2 (H-2 spec §7): the init's helmPlayer, the round module and its checkpoint
// rules, the round event and its two reasons, and the widened end record.
import { duelRules, type DuelTypes } from '../../renderer/src/authority/duelRules';
import { duelCodec } from '../../renderer/src/net/codec';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import { createDuelStreamBinding } from './duelStream';
import { createDuelProducers } from './duelProducers';
import { defineEncounterMode, jsonModeCodecs } from './encounterMode';
import type { ModeDefinition } from './contracts';

const CUTTER = parseShip(cutter);
function resolveLayout(id: string) { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; }
const decode = duelCodec(2);

export const duelMode: ModeDefinition = defineEncounterMode<DuelTypes>({
  modeId: 'duel', schemaVersion: 2, simVersion: SIM_VERSION, rules: duelRules, resolveLayout,
  codecs: jsonModeCodecs(duelRules, resolveLayout, 'duel'),
  producers: ({ authority, init, contentDigest, pause }) => createDuelProducers({ authority, runId: init.runId, contentDigest, pause }),
  publication: (link, options) => createDuelStreamBinding(link, options),
  latestStreamKey(bytes) { const message = decode.decodeMessage(bytes); return message.kind === 'held' ? `held:${message.frame.player}` : 'state'; }
});
````

In `tests/networkBoundary.test.ts`, replace:

````ts
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts', 'modes/remoteClient.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
````

with:

````ts
  });
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts', 'modes/remoteClient.ts', 'modes/duelProducers.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
````

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/duelProducers.test.ts tests/duelMode.test.ts tests/encounterMode.test.ts tests/modeHost.test.ts tests/networkBoundary.test.ts tests/hostProcess.test.ts`
Expected: PASS, 94 tests in 6 files (`tests/duelProducers.test.ts` 6, `tests/duelMode.test.ts` 7, `tests/encounterMode.test.ts` 5, `tests/modeHost.test.ts` 15).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```
git add src/shared/hostProcessProtocol.ts src/network/modes/encounterMode.ts src/network/modes/duel.ts src/network/modes/duelProducers.ts tests/networkBoundary.test.ts tests/helpers/onlineDuel.ts tests/duelProducers.test.ts
git commit -m "H-2a-ii task 3: the duel producer manager: the away steward, the peer-lost pause, the attachment origin and the producers' pause hook"
```

---

### Task 4: Two clients over the loopback

**Files:**
- Create: `tests/duelOnline.test.ts`

**Interfaces:**
- Consumes: Task 3's `onlineDuel` rig; `createScriptedPair`, `scriptedInput`; `runModeReplay`.

- [ ] **Step 1: Write the tests**

Create `tests/duelOnline.test.ts`:

````ts
// The duel online, headless (H-2 spec §6, §7, §10): two createDuelRemoteClients on streamed receive-time loopback
// links, one per seat, the scripted pair driving each seat through its own client only, at the 20 Hz the sender
// publishes; the away steward, the peer-lost pause and its order; rejoin; rematch through the clients.
import { describe, expect, it } from 'vitest';
import { runModeReplay } from '../src/renderer/src/authority/replay';
import type { DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import type { AuthorityEvent, CommandResult, HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput, type ScriptedPair } from '../src/renderer/src/sim/duel/scripted';
import { duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { Seated } from '../src/renderer/src/sim/components';
import { hashF64 } from '../src/shared/hash';
import { onlineDuel, type Seat } from './helpers/onlineDuel';
import { resolveCutter } from './helpers/duelAuthority';
import { GATE_SEEDS, CAP_TICKS } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** One seat's producer: on each new confirmed publication, the scripted pair reads that seat's replica and the seat
 *  sends its own player's held input (on every publication, so the 250 ms receive-time watchdog never neutralises a
 *  held thrust or repair) and commands, through its client only. */
function producer(seat: Seat, seed: number) {
  let pair: ScriptedPair = createScriptedPair(seed), seen = 0, round = 0;
  const results: CommandResult[] = [], events: AuthorityEvent[] = [];
  return {
    results, events,
    step() {
      results.push(...seat.client.takeResults()); events.push(...seat.client.takeEvents());
      const d = seat.client.state(), p = seat.client.publication();
      if (!d || !p || p.publicationSequence === seen || seat.client.commandStatus(seat.seat).state !== 'ready') return;
      seen = p.publicationSequence;
      if (d.round !== round) { round = d.round; pair = createScriptedPair(d.tactical.seed); }
      if (p.phase !== 'running' || d.tactical.outcome !== Outcome.Running) return;
      const input = scriptedInput(pair, d), held: HeldInput = input.held[seat.seat] ?? { moveX: 0, moveY: 0, interactHeld: false };
      seat.client.held(seat.seat, held);
      for (const e of input.commands) if (e.id.player === seat.seat) seat.client.command(seat.seat, e.command);
    }
  };
}

describe('two clients over the loopback, one per seat (spec §10)', () => {
  let seedsFlown = 0, crewLaserReleases = 0;   // summed over the seeds, checked after them
  it.each(GATE_SEEDS.map((seed) => [seed]))('seed %i: the scripted pair through the clients reaches an outcome; replicas, journal and round record agree; nothing is stale-tick', (seed) => {
    const rig = onlineDuel(seed), a = rig.connect(0), b = rig.connect(1), pa = producer(a, seed), pb = producer(b, seed);
    rig.tick(2);
    expect(a.client.commandStatus(0).state).toBe('ready');
    for (let k = 0; k < CAP_TICKS && a.client.state()?.tactical.outcome === Outcome.Running; k++) { pa.step(); pb.step(); rig.tick(); }
    rig.tick(6); pa.step(); pb.step();
    const d = a.client.state()!;
    expect(d.tactical.outcome, 'the round reached an outcome').not.toBe(Outcome.Running);
    // Both replicas are the authority's state at the same publication.
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint, hash = hashF64(Float64Array.from(cp.snapshot.values));
    for (const s of [a, b]) { expect(s.client.publication()!.hash).toBe(hash); expect(hashDuel(s.client.state()!)).toBe(hash); }
    // The journal since the last baseline replays offline to the same hash.
    const replay = rig.authority.replay(), rerun = runModeReplay(JSON.parse(JSON.stringify(replay)), DIGEST, resolveCutter);
    const ticks = replay.frames.filter((f) => f.action.kind === 'tick');
    expect(ticks.length).toBeGreaterThan(0);
    expect(rerun.hashes.at(-1)).toBe(ticks.at(-1)!.after!.hash);
    // Held input refreshed every publication: the receive-time watchdog never neutralised a seat.
    expect(replay.frames.filter((f) => f.action.kind === 'watchdog')).toEqual([]);
    const results = [...pa.results, ...pb.results];
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.reason === 'stale-tick')).toEqual([]);
    // Each client's round record is the authority's: the round record builder over the session's summary.
    const authorityRecord = duelRoundRecord(rig.session().summary!, 0, seed, 0);
    expect(authorityRecord).toMatchObject({ outcome: d.tactical.outcome, ticks: d.decidedTick });
    for (const p of [pa, pb]) {
      const rounds = p.events.filter((e) => e.payload.kind === 'round');
      expect(rounds).toHaveLength(1);
      const record = (rounds[0]!.payload as Extract<AuthorityEvent['payload'], { kind: 'round' }>).record;
      expect(record).toEqual(authorityRecord);
      expect(cp.modeMemory.telemetry.ticks).toBe(record.ticks);
    }
    seedsFlown++; crewLaserReleases += authorityRecord.laserReleases[0];
  }, 300_000);
  it('across the ten seeds the crew ship released its laser: a passive crew cannot pass the seeds', () => {
    expect(seedsFlown).toBe(GATE_SEEDS.length);
    expect(crewLaserReleases).toBeGreaterThan(0);
  });
  it('a rematch through a client replaces the replica: a new round seed, baseTick the tick after the rematch, monotone ticks and sequences', () => {
    const rig = onlineDuel(3), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3);
    a.client.command(0, { kind: 'rematch' }); rig.tick(4);
    expect(a.client.takeResults().filter((r) => r.id.player === 0).map((r) => r.reason)).toEqual(['duel-running']);
    rig.forceHunterDown(); rig.tick(6);
    const before = { tick: a.client.publication()!.tick, sequence: a.client.publication()!.publicationSequence, replica: a.client.state()! };
    expect([before.replica.round, before.replica.tactical.outcome]).toEqual([0, Outcome.CrewWins]);
    b.client.command(1, { kind: 'rematch' }); rig.tick(6);
    const after = a.client.state()!, p = a.client.publication()!;
    expect(after).not.toBe(before.replica);   // a new round's seed replaces the replica
    expect([after.round, after.tactical.outcome, after.tactical.seed]).toEqual([1, Outcome.Running, rig.session().duel.tactical.seed]);
    expect(after.tactical.seed).not.toBe(3);
    expect(after.baseTick).toBe(rig.session().duel.baseTick);
    expect(after.baseTick).toBeGreaterThan(before.tick);
    expect(p.tick).toBeGreaterThan(before.tick); expect(p.publicationSequence).toBeGreaterThan(before.sequence);
    expect(hashDuel(b.client.state()!)).toBe(b.client.publication()!.hash);
    expect(b.client.takeResults().filter((r) => r.id.player === 1).map((r) => r.status)).toEqual(['applied']);
  });
});

describe('reconnects and round context (spec §8, §10)', () => {
  it('a guest reconnecting mid-round reads the round, its seed and the Helm player from state; one reconnecting across a round end misses only that round event', () => {
    const rig = onlineDuel(5, { helmPlayer: 1 }), a = rig.connect(0);
    let b = rig.connect(1);
    rig.tick(3);
    rig.forceHunterDown(); rig.tick(6);
    a.client.command(0, { kind: 'rematch' }); rig.tick(6);
    // Mid-round 1: the guest drops and comes back.
    b.detach(); rig.tick(6);
    b = rig.connect(1); rig.tick(3);
    const d = b.client.state()!;
    expect([d.round, d.tactical.seed, d.helmPlayer]).toEqual([1, rig.session().duel.tactical.seed, 1]);
    // Across a round end: the guest is away when round 1 is decided.
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(3);
    b.detach(); rig.tick(6);
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(3);
    rig.forceHunterDown(); rig.tick(6);
    b = rig.connect(1); rig.tick(3);
    const hostRounds = a.client.takeEvents().filter((e) => e.payload.kind === 'round').map((e) => (e.payload as { record: { round: number } }).record.round);
    expect(hostRounds).toEqual([0, 1]);   // the host's renderer holds every round's record
    expect(b.client.takeEvents().filter((e) => e.payload.kind === 'round')).toEqual([]);   // events before its startup are not replayed
    expect([b.client.state()!.round, b.client.state()!.decidedTick]).toEqual([1, rig.session().duel.decidedTick]);   // but its state says the round is decided
  });
  it('helmPlayer 1 seats the guest at the Helm, and a restore keeps the seating', () => {
    const rig = onlineDuel(6, { helmPlayer: 1 }), a = rig.connect(0), b = rig.connect(1);
    rig.tick(6);
    const d = b.client.state()!;
    expect(Seated.station[d.interior.crew[1]!]).toBe(d.nav);
    expect(Seated.station[d.interior.crew[0]!]).toBe(d.weapons);
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint;
    const again = onlineDuel(6, { restore: cp }), c = again.connect(1);
    again.tick(3);
    expect(Seated.station[c.client.state()!.interior.crew[1]!]).toBe(c.client.state()!.nav);
    expect(c.client.state()!.helmPlayer).toBe(1);
    expect(c.client.publication()!.phase).toBe('paused');   // a restore always starts paused
    void a;
  });
});
````

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/duelOnline.test.ts`
Expected: PASS, 14 tests in 1 file (ten seeds, about six seconds each, then the crew-laser sum over them, the rematch, the reconnects and the Helm player). Run the file whole: the sum test reads the seeds' totals.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```
git add tests/duelOnline.test.ts
git commit -m "H-2a-ii task 4: two clients over the loopback: the scripted pair through the clients on ten seeds, rematch, reconnects and round context"
```

---

### Task 5: The gates

**Files:** none (evidence under `out/`).

- [ ] **Step 1: The full suite**

Run: `npm run build`
Expected: exit 0.

Run: `npm test`
Expected: PASS, 244 test files, 3434 tests (known load flakes: rerun alone).

- [ ] **Step 2: The host runtime and the online application (the sector, unchanged)**

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits; ...`, exit 0.

Run: `npm run test:online-app-runtime -- --report-path=out/h2a-online-app/online-app.json`
Expected: `ACTUAL TWO-PROCESS ONLINE APPLICATION PASS`, exit 0.

## After H-2a-ii

- H-2a-iii (`2026-11-16-helm-h2a-iii-online-app.md`) puts this stack in the application: the main process's mode adapter, the duel's online mode and the seats, the renderer's online session wrapper, the online duel session and view source, the menu's Host, Join and Swap seats, the playtest records, the sector's test-only entry and the duel application smoke.
