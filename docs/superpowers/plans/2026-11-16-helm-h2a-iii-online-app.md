# Helm H-2a-iii: The Online Duel Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two machines, one player each, fly the Helm duel from the menu over loopback and LAN. Multiplayer → Host creates a two-seat duel room and shows its code; Multiplayer → Join enters it; the host can Swap seats before Start, and the guest learns its console at start. Each renderer, the host's included, is a stream client of the host's utility and draws exactly the Single player screens from the published state at 20 Hz, its keyboard sent as held frames and commands. Rounds rematch with Enter, Escape pauses (and on the end card asks to leave), a lost partner pauses the duel and a rejoin resumes it on Escape. Each decided online round writes a playtest record on each machine (Single player's solo records are H-2b's, Decision 14). The sector's online path stays registered behind a test-only entry, and its smokes keep running through it; a new two-process smoke proves the duel through the real menu.

**Architecture:**
- `src/main/network/onlineModes.ts` (new): `OnlineModeAdapter`, the sector's and the duel's adapters, `validateModeMirror`. `src/main/network/onlineDuel.ts` (new): the duel's compatibility, room init and seed, the guest's committed-start check, the mirror check. `src/main/network/onlineSession.ts`: every mode call through the context's adapter; the attachment origin; the sector test-only gate.
- `src/shared/onlineSession.ts`, `src/preload/index.ts`: the duel and sector forms of host and join, `start(helmPlayer)`, `recordDuel`. `src/renderer/src/net/duelRecord.ts` (new) and `src/main/network/duelRecords.ts` (new): the playtest record and its log. `src/main/index.ts`: the test-only entries and the record channel.
- `src/renderer/src/app/duel/scene.ts` (new): the duel scene from a `DuelViewSource`. `app/duel/duelMode.ts`: Single player on it. `app/duel/runtime.ts`: Single player's rematch and quantised axes. `app/duel/onlineSource.ts` (new): the online view source. `app/duel/onlineDuel.ts` (new): the online duel session. `app/onlineModeSession.ts` (new): the router's online session wrapper. `render/sessionMenu.ts`: Host, Join, Swap seats, `leave()`. `render/duel/endScreen.ts`: the end card's prompt.
- `scripts/network/online-app-smoke.cjs`: the driver's `host-sector` and `join-sector`. `scripts/network/duel-app-observer.ts`, `scripts/network/duel-app-smoke.ts` (new) and `npm run test:duel-app-runtime`.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37, Pixi 8. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §2 (the menu, the main-process mode adapter, the duel compatibility, actions, seats and swap, seed), §3 (the renderer session routing, the view from published state, input over the link), §7 (the end card and keys), §8 (the record and `recordDuel`), §10 (the duel Electron smoke and the sector's test-only entry) and the H-2a row of §11. Follows `2026-11-16-helm-h2a-ii-online-stack.md`.

## Scope

- **Prerequisite: H-2a-ii merged** (the duel stream and remote clients, the producer manager). Task 1 Step 0 checks it.
- **Task 1:** the main process: the mode adapter, the duel's online mode, the actions and seats, the test-only gate and seed, the playtest record log; the menu's Host, Join and Swap seats; the preload.
- **Task 2:** the renderer: the duel scene, Single player's rematch, the online view source and session, the session wrapper.
- **Task 3:** the smokes: the sector's on the test-only entry, and the duel application smoke.
- **Task 4:** the gates.
- **Not in H-2a:** the report script, Single player's `session: 'solo'` records (Decision 14), the latency overlay and table, the internet candidate and its smoke's switch to the test-only entry, and the guest's transport label from ICE stats (H-2b); the duel cadence and prediction (H-2c). The LAN manual checklist is the owner's and waits on the deployed service (spec §11).

## Global Constraints

- **Prerequisite: H-2a-ii is merged.** Do not start this plan on a checkout without it.
- **Keyboard and mouse only; no couch play.** The menu stays Single player / Multiplayer (Host, Join) / Settings; Multiplayer starts only the duel; the sector online forms are honoured only by an unpackaged build started with `FTLITE_SECTOR_ONLINE_TEST=1`.
- The network boundary (`tests/networkBoundary.test.ts`): `src/main/network/onlineDuel.ts` and `duelRecords.ts` join `onlineSector.ts` as main files that may import renderer contracts.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean` in the main checkout. Evidence goes under the git-ignored `out/`; the smokes clean only their own exact temporary roots and never kill Electron or workerd globally.
- **A git worktree needs both junctions** (`node_modules` and `services\signalling\node_modules`); without the second, `tests/onlineAppRuntime.test.ts` and every online smoke fail, which is not a flake.
- **Commands need no shell features.** Commit with explicit paths only; end every commit message with your session's Co-Authored-By trailer. Single files: `npx vitest run <file>`; the full suite: `npm test` after `npm run build`; typecheck: `npm run typecheck`. LF line endings.
- **The code is exact.** A file shown in full is written as shown. Each `replace:` block occurs exactly once in its file at that point of the plan: replace it with the `with:` block, in the order given. The plans were re-extracted step by step into a fresh worktree and reproduce the prototype byte for byte.
- Known flakes under full-suite load (each passes alone; rerun the file alone): `tests/authorityBoundary.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` ("a run saved mid Build Up") and `tests/director.test.ts` (the 20-minute soak).

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **The actions** (spec §2): host is `{ type: 'host', mode: 'duel' }` or `{ type: 'host', mode: 'sector', capacity }`; join is `{ type: 'join', code, mode? }` (the duel by default); start is `{ type: 'start', helmPlayer? }` (0 when absent). The preload's `host(sector?)`, `join(code, mode?)` and `start(helmPlayer?)` build them; the menu calls `host()`, `join(code)` and `start(helmPlayer)`.
2. **The sector gate lives in the session's deps** **(rec.)**: `createOnlineSession({ ..., sectorTestEntry })` refuses the sector forms with `invalid-action` unless it is true, and `src/main/index.ts` sets it only for `!app.isPackaged && FTLITE_SECTOR_ONLINE_TEST === '1'`, the `FTLITE_MODE` pattern. **Deviation from "the sector suites run unchanged":** the action shapes are the spec's own change, so the sector session suites (`onlineCoordinator`, `onlineRecovery`) now send the explicit sector forms and set the flag in their harness, and the contract, IPC, bridge and menu tests follow the new shapes; nothing else in them changes.
3. **The duel adapter** (spec §2): its compatibility is the Cutter at duel schema version 2; a room is capacity 2; Join tries the duel compatibility only, so `incompatible` means a different build; round 0's seed is `seedFromRunId(runId)`. The guest's committed-start check accepts either `helmPlayer` and every other field equal to its own expected init. Mirrors are checked by their own mode (`validateModeMirror`) in the mirror store.
4. **The forced round end is a test-only seed** **(rec.; the spec's "a test-only seed and init")**: an unpackaged build given `FTLITE_DUEL_TEST_SEED` uses it (its next valid seed) as every duel room's first seed, on both machines alike, so both compute the same init; the init is otherwise the ordinary one. The smoke uses seed 2277: with no flight or weapon input its first round is decided on tick 1471 (about 25 s of play) whoever is seated, standing or away, and it is the only seed from 1 to 3,000 decided within 40 s. Flight or a shot in that round moves the end (a W press near the start kept one prototype run alive past 90 s), so the smoke does nothing but stand and sit in round 1.
5. **The guest's transport is `null` in H-2a** **(deviation from §8)**: the renderer cannot read the hidden RTC window's selected candidate pair yet; wiring that and labelling `lan` or `internet` is H-2b's, with the report that reads it. The host's records read `loopback`. The record schema already admits all four. **Likewise `latency.rttMs` is `null` in H-2a** (the schema admits it): the renderer's link is the local MessagePort, whose `stats()` has no network RTT; H-2b fills it from the RTC window's stats with the transport.
6. **The record and its log** (spec §8): `net/duelRecord.ts` is the strict, 8 KiB-capped schema with the latency helpers; main appends each valid record to `userData/playtest/duel-YYYY-MM-DD.jsonl` (the local date) through `duel:record`, trusted as the fullscreen channel is. Latency: a held frame whose quantised input changed is stamped and sampled at the first observation of a publication whose `heldHighWater` covers it; a command from a key press is sampled at its applied result; RTT is `null` (Decision 5); jitter is the inter-arrival standard deviation against 50 ms. Each attach clears the pending stamps, a sample above the schema's one-hour cap is dropped rather than losing the record, and `disconnects` and `pauses` count the round's own (the deltas since the last record).
7. **The online duel session** (spec §3): it attaches like the sector's (the port link, then the remote client), keeps the scene across re-attaches, and freezes a saved-and-loaded copy of the last replica under "CONNECTION LOST — RECONNECTING" when its link closes (or under "LEAVING…" while a Leave saves and ends: the `saving`, `idle` and `ended` phases). Its 60 Hz pump sends `presence {present: true}` as the first command after every full-state ACK, then this seat's held input every pump (quantised to −1, 0 and 1, so the authority's held watchdog never lapses) and the H-1 press table's commands, gated by the confirmed replica (`canCharge`, `canLaunch`; a lost release is re-sent). Tab does nothing online. Focus loss neutralises held input and lets go of a held charge, and never pauses.
8. **Escape and Leave** (spec §7): while a round runs, Escape pauses and resumes (`setPaused`); on the end card it opens an in-scene "LEAVE THE DUEL?   ENTER: LEAVE   ESC: STAY" (closed as soon as the round is no longer decided and running, so a partner's rematch or a pause leaves Escape pausing as in play), and Enter there runs the menu's own Leave (the new `menu.leave()`, Net-3d's Leave). Enter on the end card otherwise sends `rematch`. The end card reads "ENTER: REMATCH   ESC: LEAVE" and the round's length (`decidedTick − baseTick`).
9. **The banners** (spec §3): "PAUSED BY PLAYER n   ESC: RESUME" for a player's pause, "PARTNER LOST   ESC: RESUME" for `peer-lost`, "PAUSED   ESC: RESUME" otherwise; "YOU: HELM" or "YOU: WEAPONS" for 3 s after each sync, on both machines.
10. **Single player uses `rematch`** (spec §7): its end card keeps ticking, Enter sends `rematch` (the next round in place, presence carried, so the character at the keyboard stays the same), and it reads "ENTER: REMATCH   M: MAIN MENU". Its held axes are quantised as online's.
11. **The menu** (spec §2): Host has no capacity control; the host's lobby shows Swap seats and "Host flies Helm" or "Guest flies Helm"; the guest's shows "Host picks seats".
12. **The sector smokes** (spec §10): the shared driver gains `host-sector` and `join-sector`, which call the preload's sector forms; the online-app and online-recovery smokes use them with `FTLITE_SECTOR_ONLINE_TEST=1`. The internet smoke's switch rides H-2b with its manifest.
13. **The duel smoke** reuses the shared driver with its own passive observer and a no-op `observer/utility.cjs` (the driver proves each utility checkpoint with the sector's card memory, which a duel checkpoint does not have). It runs the spec's seven checks in a robust order **(rec.)**: the menu (1); then round 1, the forced end, in which both players only stand up and sit down (their records' command samples) until it is decided, and Enter starts round 2 (6) with a record on both machines (7); then, in round 2, the Helm's thrust (2), the beam (3), the hash agreement (4) and the guest's kill, rejoin and Escape unpause (5).
14. **Single player's `session: 'solo'` records move to H-2b** **(deviation from §8 and the H-2a row of §11)**: only the online duel session writes records in H-2a. The local runtime steps `stepDuelTick` directly and has no telemetry accumulator, so a solo record needs one (and the round summary it produces) added to the runtime; that lands in H-2b beside the report script that reads the records and reports solo rounds separately. The record schema already admits `'solo'`, so H-2b adds the writer only.

## File structure

| File | Responsibility |
|---|---|
| `src/main/network/onlineModes.ts`, `onlineDuel.ts`, `duelRecords.ts` | **Create:** the mode adapter; the duel's online mode; the record log |
| `src/main/network/onlineSession.ts`, `src/main/index.ts` | **Modify:** the adapter, origin and gate; the test-only entries and the record channel |
| `src/shared/onlineSession.ts`, `src/preload/index.ts`, `tsconfig.node.json` | **Modify:** the actions, the preload API, the record channel; main's compiled renderer files |
| `src/renderer/src/net/duelRecord.ts` | **Create:** the playtest record |
| `src/renderer/src/render/sessionMenu.ts`, `render/duel/endScreen.ts` | **Modify:** Host, Join, Swap seats, `leave()`; the end card's prompt |
| `src/renderer/src/app/duel/scene.ts`, `onlineSource.ts`, `onlineDuel.ts`, `app/onlineModeSession.ts` | **Create:** the scene, the online source, the online session, the wrapper |
| `src/renderer/src/app/duel/duelMode.ts`, `runtime.ts`, `src/renderer/src/main.ts` | **Modify:** Single player on the scene and the rematch; the router's online factory |
| `scripts/network/online-app-smoke.cjs`, `online-app-smoke.ts`, `online-recovery-smoke.ts` | **Modify:** the sector's test-only entry |
| `scripts/network/duel-app-observer.ts`, `duel-app-smoke.ts`, `package.json` | **Create / modify:** the duel application smoke |
| `tests/onlineDuel.test.ts`, `tests/duelOnlineView.test.ts` | **Create:** the main-side and view tests |
| `tests/onlineCoordinator.test.ts`, `onlineRecovery.test.ts`, `onlineIpc.test.ts`, `onlineSessionContract.test.ts`, `onlineBridge.test.ts`, `mainMenu.test.ts`, `sessionMenu.test.ts`, `duelReadout.test.ts`, `duelRuntime.test.ts`, `networkBoundary.test.ts` | **Modify:** the new action shapes, the gate, the end card and the rematch |

---

### Task 1: The main process, the actions, the seats and the records

**Files:**
- Create: `src/main/network/onlineModes.ts`, `src/main/network/onlineDuel.ts`, `src/main/network/duelRecords.ts`, `src/renderer/src/net/duelRecord.ts`, `tests/onlineDuel.test.ts`
- Modify: `src/shared/onlineSession.ts`, `src/main/network/onlineSession.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/render/sessionMenu.ts`, `tsconfig.node.json`
- Modify (tests): `tests/onlineCoordinator.test.ts`, `tests/onlineRecovery.test.ts`, `tests/onlineIpc.test.ts`, `tests/onlineSessionContract.test.ts`, `tests/onlineBridge.test.ts`, `tests/mainMenu.test.ts`, `tests/sessionMenu.test.ts`

**Interfaces:**
- Consumes: H-2a-i's `seedFromRunId`, `nextValidSeed`, `validateDuelInit`, `validateDuelCheckpoint`, `MISSILE_LOSSES`; H-2a-ii's attachment origin.
- Produces:
  - `shared/onlineSession.ts`: `OnlineMode`; the new `OnlineAction` host, join and start forms; `DUEL_RECORD_CHANNEL`; `OnlinePreloadApi.host(sector?)`, `join(code, mode?)`, `start(helmPlayer?)`; `FtlitePreloadApi.recordDuel?(record)`.
  - `onlineDuel.ts`: `DUEL_SCHEMA_VERSION`, `DuelChoice`, `duelCompatibility()`, `duelJoinCompatibilities()`, `duelRoomSeed(runId, testSeed?)`, `duelInit(snapshot, choice?, testSeed?)`, `validateCommittedDuelStart(snapshot, committed, testSeed?)`, `validateDuelMirror(mirror)`.
  - `onlineModes.ts`: `OnlineModeAdapter`, `sectorOnlineMode`, `duelOnlineMode(testSeed?)`, `onlineModeFor(modeId, testSeed?)`, `validateModeMirror(mirror, capacity?)`.
  - `onlineSession.ts`: `OnlineSessionDeps.sectorTestEntry?`, `duelTestSeed?`.
  - `net/duelRecord.ts`: `DUEL_RECORD_MAX_BYTES`, `DUEL_RECORD_MAX_MS`, `LatencyFigure`, `DuelPlaytestRecord`, `duelRecordSchema`, `validateDuelRecord`, `latencyFigure`, `arrivalJitter`. `duelRecords.ts`: `duelRecordPath(userData, now)`, `appendDuelRecord(userData, value, now?)`.
  - `sessionMenu.ts`: `leave()` on the menu.

- [ ] **Step 0: Check the prerequisite (H-2a-ii merged)**

Run: `npx vitest run tests/duelOnline.test.ts -t "rematch through a client"`
Expected: PASS, 1 test (12 skipped). **If the file is missing, stop: H-2a-ii is not merged.**

- [ ] **Step 1: Write the failing tests**

Create `tests/onlineDuel.test.ts`:

````ts
// The duel's main-process online mode (H-2 spec §2, §8, §10): compatibility, the room's init and seed, the guest's check
// of a committed start, the mirror check, the mode adapter and the sector test-only gate, and the playtest record log.
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { duelCompatibility, duelInit, duelJoinCompatibilities, validateCommittedDuelStart, validateDuelMirror } from '../src/main/network/onlineDuel';
import { onlineModeFor, validateModeMirror } from '../src/main/network/onlineModes';
import { sectorCompatibility } from '../src/main/network/onlineSector';
import { appendDuelRecord, duelRecordPath } from '../src/main/network/duelRecords';
import { createOnlineSession } from '../src/main/network/onlineSession';
import { nextValidSeed, seedFromRunId } from '../src/renderer/src/sim/duel/seeds';
import { DUEL_RECORD_MAX_BYTES, DUEL_RECORD_MAX_MS, latencyFigure, arrivalJitter, validateDuelRecord, type DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import type { RoomSnapshot } from '../src/shared/roomSession';
import { hunterDown, liveDuel } from './helpers/liveDuel';

function room(runId = '0000beef' + 'b'.repeat(24)): RoomSnapshot { return { roomId: 'a'.repeat(32), runId, joinCode: 'ABCDEFGH', capacity: 2, hostSeatId: 0,
  hostGeneration: 1, rosterRevision: 1, phase: 'lobby', compatibility: duelCompatibility(), seats: [0, 1].map((seatId) => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) }; }
const commit = (snapshot: RoomSnapshot, value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)); return { initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex'),
  lease: { roomId: snapshot.roomId, hostGeneration: 1, hostSeatId: 0, nonce: 'c'.repeat(32), expiresAtEpochMs: Date.now() + 12000 } }; };

describe('the duel online mode in main (spec §2)', () => {
  it('a duel room is the Cutter at duel schema version 2, capacity 2, round 0 seeded from its runId', () => {
    expect(duelCompatibility()).toMatchObject({ protocolVersion: 2, modeId: 'duel', schemaVersion: 2 });
    expect(duelJoinCompatibilities()).toEqual([duelCompatibility()]);
    const snapshot = room();
    expect(duelInit(snapshot)).toMatchObject({ runId: snapshot.runId, layoutId: 'cutter', playerCount: 2, helmPlayer: 0, seed: seedFromRunId(snapshot.runId) });
    expect(seedFromRunId(snapshot.runId)).toBe(nextValidSeed(0xbeef));
    expect(duelInit(snapshot, { helmPlayer: 1 }).helmPlayer).toBe(1);
    expect(duelInit(snapshot, undefined, 2277).seed).toBe(2277);   // the test-only seed
    expect(() => duelInit({ ...snapshot, capacity: 3 })).toThrow();
    expect(() => duelInit({ ...snapshot, compatibility: sectorCompatibility(2) })).toThrow();
  });
  it('the guest accepts either Helm player in a committed init and rejects any other field change', async () => {
    const snapshot = room();
    for (const helm of [0, 1] as const) await expect(validateCommittedDuelStart(snapshot, commit(snapshot, duelInit(snapshot, { helmPlayer: helm })))).resolves.toMatchObject({ helmPlayer: helm });
    const init = duelInit(snapshot);
    for (const bad of [{ ...init, seed: init.seed + 1 }, { ...init, runId: 'c'.repeat(32) }, { ...init, helmPlayer: 2 }, { ...init, extra: 1 }])
      await expect(validateCommittedDuelStart(snapshot, commit(snapshot, bad))).rejects.toThrow();
    await expect(validateCommittedDuelStart(snapshot, { ...commit(snapshot, init), initHash: '0'.repeat(64) })).rejects.toThrow();
  });
  it('validates a duel mirror by its checkpoint and metadata, through the adapter by mode', () => {
    const snapshot = room(), init = duelInit(snapshot), live = liveDuel(init, hunterDown);
    live.tick(40);
    const bytes = new TextEncoder().encode(JSON.stringify(live.core.captureCheckpoint()));
    const mirror = { bytes, metadata: { version: 1 as const, protocolVersion: 2 as const, roomId: snapshot.roomId, runId: snapshot.runId, compatibility: snapshot.compatibility,
      hostGeneration: 1, checkpointSequence: 1, capturedTick: live.tickNow(), payloadSha256: createHash('sha256').update(bytes).digest('hex') } };
    expect(() => validateDuelMirror(mirror)).not.toThrow();
    expect(() => validateModeMirror(mirror)).not.toThrow();
    for (const metadata of [{ ...mirror.metadata, capturedTick: 1 }, { ...mirror.metadata, runId: 'c'.repeat(32) }, { ...mirror.metadata, compatibility: sectorCompatibility(2) }])
      expect(() => validateDuelMirror({ ...mirror, metadata })).toThrow();
    expect(onlineModeFor('duel')!.modeId).toBe('duel');
    expect(onlineModeFor('sector')!.modeId).toBe('sector');
    expect(onlineModeFor('elsewhere')).toBeUndefined();
  });
});

describe('the session modes and the sector test-only entry (spec §2, §10)', () => {
  function owner(sectorTestEntry?: boolean) {
    const create = vi.fn(async () => { throw { code: 'unavailable' }; }), join = vi.fn(async () => { throw { code: 'not-found' }; });
    const store = { load: async () => null, save: async () => {}, clear: async () => {} };
    const session = createOnlineSession({ config: { enabled: true, baseUrl: 'http://127.0.0.1:8787', allowInsecureLocalhost: true, iceMode: 'loopback' }, seatStore: store as never, mirrorStore: store as never,
      service: () => ({ create, join, close() {}, onEvent: () => () => {} }) as never, platform: { onVisibleGone: () => () => {} } as never,
      clock: { nowMs: () => 0, epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: (id) => clearTimeout(id as never) }, nonce: () => 'f'.repeat(32), sectorTestEntry });
    return { session, create, join };
  }
  it('Host creates a two-seat duel room; Join tries the duel compatibility only', async () => {
    const o = owner();
    expect(await o.session.dispatch({ type: 'host', mode: 'duel' })).toEqual({ ok: false, code: 'unavailable' });
    expect(o.create.mock.calls).toEqual([[duelCompatibility(), 2]]);
    expect(await o.session.dispatch({ type: 'join', code: 'ABCDEFGH' })).toEqual({ ok: false, code: 'not-found' });
    expect(o.join.mock.calls).toEqual([['ABCDEFGH', duelCompatibility()]]);
  });
  it('refuses the sector forms unless the main process was started for them', async () => {
    const off = owner();
    expect(await off.session.dispatch({ type: 'host', mode: 'sector', capacity: 2 })).toEqual({ ok: false, code: 'invalid-action' });
    expect(await off.session.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' })).toEqual({ ok: false, code: 'invalid-action' });
    expect(off.create).not.toHaveBeenCalled(); expect(off.join).not.toHaveBeenCalled();
    const on = owner(true);
    await on.session.dispatch({ type: 'host', mode: 'sector', capacity: 2 });
    expect(on.create.mock.calls).toEqual([[sectorCompatibility(2), 2]]);
  });
});

describe('the duel playtest record (spec §8)', () => {
  const summary = { outcome: 1, ticks: 9000, terminal: [[], ['laser']], laserReleases: [3, 4], laserHits: [2, 1], missilesLaunched: [1, 1], missileHits: [1, 0], repairsFinished: [0, 1],
    laserMisses: [1, 3], layersStripped: [1, 0], missileLosses: [{ planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 }, { planet: 0, asteroid: 1, edge: 0, expired: 0, own: 0, missile: 0 }],
    planetContacts: [0, 1], asteroidContacts: [2, 0], baits: 1, consoleSwaps: 0, helmEmptyTicks: 0, weaponsEmptyTicks: 10, enemyInArcTicks: 900, weaponsIdleTicks: 30,
    repairsStarted: [0, 1], walkingTicks: [0, 200], repairingTicks: [0, 96], round: 2, seed: 77, baseTick: 30000 };
  const record = { version: 1, session: 'online', role: 'guest', transport: null, seat: 1, helmPlayer: 0, seed: 77, round: 2, startedAtIso: '2026-11-16T12:00:00.000Z',
    summary, latency: { held: latencyFigure([40, 50, 60]), command: latencyFigure([]), rttMs: null }, jitter: arrivalJitter([48, 52, 50]), disconnects: 1, pauses: 2 } as unknown as DuelPlaytestRecord;
  it('is strict and size-capped, and carries no credential fields', () => {
    expect(validateDuelRecord(record)).toEqual(record);
    expect(() => validateDuelRecord({ ...record, joinCode: 'ABCDEFGH' })).toThrow();
    expect(() => validateDuelRecord({ ...record, seatToken: 'x' })).toThrow();
    expect(() => validateDuelRecord({ ...record, round: 3 })).toThrow(/round/);
    expect(new TextEncoder().encode(JSON.stringify(record)).byteLength).toBeLessThan(DUEL_RECORD_MAX_BYTES);
    expect(latencyFigure([10, 20, 30, 40, 1000])).toEqual({ count: 5, median: 30, p95: 1000, max: 1000 });
    expect(arrivalJitter([])).toEqual({ count: 0, stdMs: null });
    // A sample above the schema's hour cap is dropped, never the record (a stale stamp across a reconnect).
    expect(latencyFigure([10, DUEL_RECORD_MAX_MS + 1])).toEqual({ count: 1, median: 10, p95: 10, max: 10 });
    expect(arrivalJitter([50, DUEL_RECORD_MAX_MS + 1])).toEqual({ count: 1, stdMs: 0 });
    expect(validateDuelRecord({ ...record, latency: { ...record.latency, rttMs: 12.5 } }).latency.rttMs).toBe(12.5);   // H-2b's RTC figure fits
  });
  it('main appends each valid record as one line of userData/playtest/duel-YYYY-MM-DD.jsonl, and refuses an invalid one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-duel-record-'));
    try {
      const now = new Date(2026, 10, 16, 9, 30);
      expect(await appendDuelRecord(dir, record, now)).toBe(true);
      expect(await appendDuelRecord(dir, { ...record, round: 2, summary: { ...summary } }, now)).toBe(true);
      expect(await appendDuelRecord(dir, { ...record, extra: true }, now)).toBe(false);
      const path = duelRecordPath(dir, now);
      expect(path.endsWith(join('playtest', 'duel-2026-11-16.jsonl'))).toBe(true);
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      expect(lines.map((l) => JSON.parse(l).round)).toEqual([2, 2]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
````

The session and contract suites move to the new action shapes; the sector session harnesses opt in to the test-only entry:

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  const owner = createOnlineSession({ config: { enabled: true, baseUrl: serviceOrigin, allowInsecureLocalhost: serviceOrigin.startsWith('http:'), iceMode: serviceOrigin.startsWith('http:') ? 'loopback' : 'turn' }, seatStore: store, mirrorStore,
    service: () => service, platform, clock: { nowMs: () => Date.now() - monotonicOrigin, epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }, nonce: () => 'f'.repeat(32) });
  const savedSeat = () => ({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: snapshot.roomId, joinCode: snapshot.joinCode, compatibility: snapshot.compatibility, seatId: ownSeat, seatGeneration: 1, seatToken: 't'.repeat(43) });
````

with:

````ts
  const owner = createOnlineSession({ config: { enabled: true, baseUrl: serviceOrigin, allowInsecureLocalhost: serviceOrigin.startsWith('http:'), iceMode: serviceOrigin.startsWith('http:') ? 'loopback' : 'turn' }, seatStore: store, mirrorStore,
    service: () => service, platform, clock: { nowMs: () => Date.now() - monotonicOrigin, epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }, nonce: () => 'f'.repeat(32), sectorTestEntry: true });
  const savedSeat = () => ({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: snapshot.roomId, joinCode: snapshot.joinCode, compatibility: snapshot.compatibility, seatId: ownSeat, seatGeneration: 1, seatToken: 't'.repeat(43) });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  it('reports live receipt age through status reads and preserves it after leaving', async () => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    await vi.advanceTimersByTimeAsync(200); expect(h.owner.status().mirror.receivedAgeMs).toBe(200);
````

with:

````ts
  it('reports live receipt age through status reads and preserves it after leaving', async () => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    await vi.advanceTimersByTimeAsync(200); expect(h.owner.status().mirror.receivedAgeMs).toBe(200);
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(), put = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(put.promise);
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.host.ackCheckpoint).toHaveBeenCalledWith(1)); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); expect(h.platform.publishPort).not.toHaveBeenCalled();
````

with:

````ts
    const h = harness(), put = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(put.promise);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.host.ackCheckpoint).toHaveBeenCalledWith(1)); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); expect(h.platform.publishPort).not.toHaveBeenCalled();
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    vi.useFakeTimers(); const h = harness(); h.service.putCheckpoint.mockRejectedValue({ code: 'unavailable' });
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.advanceTimersByTimeAsync(6000); expect(await start).toMatchObject({ ok: false, code: 'save-unavailable' }); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); expect((await h.mirrorStore.load())?.pending).not.toBeNull(); await h.owner.dispose();
  });
  it('supersedes renewal requests using the utility nonce and aborts old service correlation', async () => {
    const h = harness(); await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    const old = deferred<any>(), original = h.service.request.getMockImplementation(); h.service.request.mockImplementation((op: any, options: any) => op.type === 'lease-renew' && op.nonce === '6'.repeat(32) ? old.promise : original(op, options));
````

with:

````ts
    vi.useFakeTimers(); const h = harness(); h.service.putCheckpoint.mockRejectedValue({ code: 'unavailable' });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.advanceTimersByTimeAsync(6000); expect(await start).toMatchObject({ ok: false, code: 'save-unavailable' }); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); expect((await h.mirrorStore.load())?.pending).not.toBeNull(); await h.owner.dispose();
  });
  it('supersedes renewal requests using the utility nonce and aborts old service correlation', async () => {
    const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    const old = deferred<any>(), original = h.service.request.getMockImplementation(); h.service.request.mockImplementation((op: any, options: any) => op.type === 'lease-renew' && op.nonce === '6'.repeat(32) ? old.promise : original(op, options));
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(), put = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(put.promise);
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.service.putCheckpoint).toHaveBeenCalledOnce()); expect(await h.owner.dispatch({ type: 'forget-seat' })).toEqual({ ok: true }); put.resolve(); await start;
````

with:

````ts
    const h = harness(), put = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(put.promise);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.service.putCheckpoint).toHaveBeenCalledOnce()); expect(await h.owner.dispatch({ type: 'forget-seat' })).toEqual({ ok: true }); put.resolve(); await start;
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  it('retains the graceful exit pending mirror when the final server upload fails within the three-second budget', async () => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    h.service.putCheckpoint.mockRejectedValue({ code: 'unavailable' }); const leave = h.owner.dispatch({ type: 'leave' }); await vi.advanceTimersByTimeAsync(3000); expect(await leave).toEqual({ ok: true });
````

with:

````ts
  it('retains the graceful exit pending mirror when the final server upload fails within the three-second budget', async () => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    h.service.putCheckpoint.mockRejectedValue({ code: 'unavailable' }); const leave = h.owner.dispatch({ type: 'leave' }); await vi.advanceTimersByTimeAsync(3000); expect(await leave).toEqual({ ok: true });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    h.service.request.mockImplementation(async (op: any) => { if (op.type === 'link-request') { h.issue(attempt); return { kind: 'attempt', attemptId: attempt }; } return original(op); });
    await h.owner.dispatch({ type: 'host', capacity: 2 }); expect(h.owner.status().actions).not.toContain('start');
    h.snapshot.seats.forEach((seat: any) => { seat.ready = true; }); h.emit({ type: 'roster', snapshot: h.snapshot });
````

with:

````ts
    h.service.request.mockImplementation(async (op: any) => { if (op.type === 'link-request') { h.issue(attempt); return { kind: 'attempt', attemptId: attempt }; } return original(op); });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 2 }); expect(h.owner.status().actions).not.toContain('start');
    h.snapshot.seats.forEach((seat: any) => { seat.ready = true; }); h.emit({ type: 'roster', snapshot: h.snapshot });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(); await Promise.resolve(); expect(h.owner.status().actions).not.toContain('reconnect');
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().actions).toContain('reconnect');
    await h.owner.dispatch({ type: 'forget-seat' }); expect(h.owner.status().actions).not.toContain('reconnect'); await h.owner.dispose();
  });
  it('persists before connect/lobby; creates exactly one utility after duplicate commitment and keeps display hints powerless', async () => {
    const h = harness(); expect(await h.owner.dispatch({ type: 'host', capacity: 1 })).toEqual({ ok: true });
    expect(h.order.slice(0, 3)).toEqual(['create', 'save', 'connect']); expect(h.owner.status().phase).toBe('lobby'); expect(h.platform.startLeasedHost).not.toHaveBeenCalled();
````

with:

````ts
    const h = harness(); await Promise.resolve(); expect(h.owner.status().actions).not.toContain('reconnect');
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().actions).toContain('reconnect');
    await h.owner.dispatch({ type: 'forget-seat' }); expect(h.owner.status().actions).not.toContain('reconnect'); await h.owner.dispose();
  });
  it('persists before connect/lobby; creates exactly one utility after duplicate commitment and keeps display hints powerless', async () => {
    const h = harness(); expect(await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 })).toEqual({ ok: true });
    expect(h.order.slice(0, 3)).toEqual(['create', 'save', 'connect']); expect(h.owner.status().phase).toBe('lobby'); expect(h.platform.startLeasedHost).not.toHaveBeenCalled();
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(); h.store.save.mockRejectedValue({ code: 'storage-write-failed' });
    await h.owner.dispatch({ type: 'host', capacity: 1 }); expect(h.owner.status()).toMatchObject({ phase: 'lobby', persistent: false, error: 'storage-write-failed' }); await h.owner.dispose();
  });
  it('probes second layout only for incompatible', async () => {
    const h = harness(4, 3); h.service.join.mockRejectedValueOnce({ code: 'incompatible' });
    await h.owner.dispatch({ type: 'join', code: ' abcdefgh ' }); expect(h.service.join.mock.calls.map((call: any) => call[1].layoutHash)).toEqual([sectorCompatibility(2).layoutHash, sectorCompatibility(4).layoutHash]);
    expect(h.owner.status().ownSeat).toBe(3); await h.owner.dispose();
    const denied = harness(); denied.service.join.mockRejectedValue({ code: 'unauthorized' }); await denied.owner.dispatch({ type: 'join', code: 'ABCDEFGH' }); expect(denied.service.join).toHaveBeenCalledOnce(); await denied.owner.dispose();
  });
  it('Leave preempts an unresolved transport factory and closes its late return', async () => {
    const h = harness(), factory = deferred<any>(); h.platform.createTransport.mockReturnValue(factory.promise);
    const joining = h.owner.dispatch({ type: 'host', capacity: 1 }); await vi.waitFor(() => expect(h.platform.createTransport).toHaveBeenCalledOnce());
    await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().phase).toBe('idle'); factory.resolve(h.transport);
````

with:

````ts
    const h = harness(); h.store.save.mockRejectedValue({ code: 'storage-write-failed' });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); expect(h.owner.status()).toMatchObject({ phase: 'lobby', persistent: false, error: 'storage-write-failed' }); await h.owner.dispose();
  });
  it('probes second layout only for incompatible', async () => {
    const h = harness(4, 3); h.service.join.mockRejectedValueOnce({ code: 'incompatible' });
    await h.owner.dispatch({ type: 'join', code: ' abcdefgh ', mode: 'sector' }); expect(h.service.join.mock.calls.map((call: any) => call[1].layoutHash)).toEqual([sectorCompatibility(2).layoutHash, sectorCompatibility(4).layoutHash]);
    expect(h.owner.status().ownSeat).toBe(3); await h.owner.dispose();
    const denied = harness(); denied.service.join.mockRejectedValue({ code: 'unauthorized' }); await denied.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' }); expect(denied.service.join).toHaveBeenCalledOnce(); await denied.owner.dispose();
  });
  it('Leave preempts an unresolved transport factory and closes its late return', async () => {
    const h = harness(), factory = deferred<any>(); h.platform.createTransport.mockReturnValue(factory.promise);
    const joining = h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await vi.waitFor(() => expect(h.platform.createTransport).toHaveBeenCalledOnce());
    await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().phase).toBe('idle'); factory.resolve(h.transport);
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(), factory = deferred<any>(); h.platform.startLeasedHost.mockReturnValue(factory.promise);
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const starting = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.platform.startLeasedHost).toHaveBeenCalledOnce()); await h.owner.dispatch({ type: 'leave' }); factory.resolve(h.host); await starting;
````

with:

````ts
    const h = harness(), factory = deferred<any>(); h.platform.startLeasedHost.mockReturnValue(factory.promise);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const starting = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.platform.startLeasedHost).toHaveBeenCalledOnce()); await h.owner.dispatch({ type: 'leave' }); factory.resolve(h.host); await starting;
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(); const removers = Array.from({ length: 64 }, () => h.owner.subscribe(() => {})); expect(() => h.owner.subscribe(() => {})).toThrow('capacity'); removers.forEach(off => off());
    await h.owner.dispatch({ type: 'host', capacity: 1 }); const reply = deferred<any>(), original = h.service.request.getMockImplementation();
    h.service.request.mockImplementationOnce(() => reply.promise);
````

with:

````ts
    const h = harness(); const removers = Array.from({ length: 64 }, () => h.owner.subscribe(() => {})); expect(() => h.owner.subscribe(() => {})).toThrow('capacity'); removers.forEach(off => off());
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); const reply = deferred<any>(), original = h.service.request.getMockImplementation();
    h.service.request.mockImplementationOnce(() => reply.promise);
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    });
    await h.owner.dispatch({ type: 'host', capacity: 4 }); await vi.waitFor(() => expect(h.service.request.mock.calls.some((call: any) => call[0].type === 'link-ready')).toBe(true));
    h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
````

with:

````ts
    });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 4 }); await vi.waitFor(() => expect(h.service.request.mock.calls.some((call: any) => call[0].type === 'link-ready')).toBe(true));
    h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  it.each(['service', 'transport', 'utility', 'renewal'] as const)('stops host authority on its own %s loss', async loss => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    if (loss === 'service') h.emit({ type: 'error', error: { code: 'unavailable', retryable: true } });
````

with:

````ts
  it.each(['service', 'transport', 'utility', 'renewal'] as const)('stops host authority on its own %s loss', async loss => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    if (loss === 'service') h.emit({ type: 'error', error: { code: 'unavailable', retryable: true } });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    const h = harness(), disposed = deferred<void>(), cleared = deferred<void>();
    await h.owner.dispatch({ type: 'host', capacity: 1 }); h.transport.dispose.mockReturnValue(disposed.promise); h.store.clear.mockReturnValue(cleared.promise);
    const forget = h.owner.dispatch({ type: 'forget-seat' });
    expect(h.store.clear).toHaveBeenCalledOnce(); expect(await h.owner.dispatch({ type: 'host', capacity: 1 })).toMatchObject({ ok: false, code: 'busy' });
    disposed.resolve(); await Promise.resolve(); expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' })).toMatchObject({ ok: false, code: 'busy' });
    cleared.resolve(); await forget; expect(h.owner.status().persistent).toBe(false); await h.owner.dispose();
````

with:

````ts
    const h = harness(), disposed = deferred<void>(), cleared = deferred<void>();
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); h.transport.dispose.mockReturnValue(disposed.promise); h.store.clear.mockReturnValue(cleared.promise);
    const forget = h.owner.dispatch({ type: 'forget-seat' });
    expect(h.store.clear).toHaveBeenCalledOnce(); expect(await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 })).toMatchObject({ ok: false, code: 'busy' });
    disposed.resolve(); await Promise.resolve(); expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' })).toMatchObject({ ok: false, code: 'busy' });
    cleared.resolve(); await forget; expect(h.owner.status().persistent).toBe(false); await h.owner.dispose();
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    for (let i = 0; i < 4; i++) {
      const attempt = h.owner.dispatch({ type: 'host', capacity: 1 }); await vi.waitFor(() => expect(pending).toHaveLength(i + 1)); await h.owner.dispatch({ type: 'leave' }); await attempt;
    }
    const result = h.owner.dispatch({ type: 'host', capacity: 1 }); await expect(result).resolves.toMatchObject({ ok: false, code: 'capacity' }); expect(pending).toHaveLength(4);
    for (const factory of pending) factory.resolve(h.transport); await vi.waitFor(() => expect(h.transport.dispose).toHaveBeenCalledTimes(4)); await h.owner.dispose();
````

with:

````ts
    for (let i = 0; i < 4; i++) {
      const attempt = h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await vi.waitFor(() => expect(pending).toHaveLength(i + 1)); await h.owner.dispatch({ type: 'leave' }); await attempt;
    }
    const result = h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await expect(result).resolves.toMatchObject({ ok: false, code: 'capacity' }); expect(pending).toHaveLength(4);
    for (const factory of pending) factory.resolve(h.transport); await vi.waitFor(() => expect(h.transport.dispose).toHaveBeenCalledTimes(4)); await h.owner.dispose();
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    });
    await h.owner.dispatch({ type: 'host', capacity: 2 }); expect(await h.owner.dispatch({ type: 'remove-seat', seatId: 0 })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'remove-seat', seatId: 1 }); expect(h.controller.closeAttempt).toHaveBeenCalledWith('1'.repeat(32));
````

with:

````ts
    });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 2 }); expect(await h.owner.dispatch({ type: 'remove-seat', seatId: 0 })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'remove-seat', seatId: 1 }); expect(h.controller.closeAttempt).toHaveBeenCalledWith('1'.repeat(32));
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
    });
    await h.owner.dispatch({ type: 'host', capacity: 2 }); h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
    h.snapshot.seats[1].ready = true; h.emit({ type: 'roster', snapshot: h.snapshot }); await h.owner.dispatch({ type: 'ready', ready: true });
````

with:

````ts
    });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 2 }); h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
    h.snapshot.seats[1].ready = true; h.emit({ type: 'roster', snapshot: h.snapshot }); await h.owner.dispatch({ type: 'ready', ready: true });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  it('all dispose callers await the same outstanding resource shutdown', async () => {
    const h = harness(), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'host', capacity: 1 }); h.transport.dispose.mockReturnValue(shutdown.promise);
    const first = h.owner.dispose(), second = h.owner.dispose(); let finished = false; void second.then(() => { finished = true; });
````

with:

````ts
  it('all dispose callers await the same outstanding resource shutdown', async () => {
    const h = harness(), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); h.transport.dispose.mockReturnValue(shutdown.promise);
    const first = h.owner.dispose(), second = h.owner.dispose(); let finished = false; void second.then(() => { finished = true; });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  it('explicit Leave invalidates an automatic retry queued behind transport cleanup', async () => {
    const h = harness(2, 1), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' }); h.transport.dispose.mockReturnValue(shutdown.promise);
    h.transportExit(); const leaving = h.owner.dispatch({ type: 'leave' }); shutdown.resolve(); await leaving;
````

with:

````ts
  it('explicit Leave invalidates an automatic retry queued behind transport cleanup', async () => {
    const h = harness(2, 1), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' }); h.transport.dispose.mockReturnValue(shutdown.promise);
    h.transportExit(); const leaving = h.owner.dispatch({ type: 'leave' }); shutdown.resolve(); await leaving;
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  it('a Leave from a status observer cannot be undone by the old automatic retry continuation', async () => {
    const h = harness(2, 1); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' }); let left = false;
    h.owner.subscribe(status => { if (!left && status.phase === 'idle') { left = true; void h.owner.dispatch({ type: 'leave' }); } });
````

with:

````ts
  it('a Leave from a status observer cannot be undone by the old automatic retry continuation', async () => {
    const h = harness(2, 1); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' }); let left = false;
    h.owner.subscribe(status => { if (!left && status.phase === 'idle') { left = true; void h.owner.dispatch({ type: 'leave' }); } });
````

In `tests/onlineCoordinator.test.ts`, replace:

````ts
  const h = harness(2, 1, 0, 'https://service.example');
  expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' })).toEqual({ ok: true });
  h.issue(); await vi.waitFor(() => expect(h.controller.startAttempt).toHaveBeenCalledOnce());
````

with:

````ts
  const h = harness(2, 1, 0, 'https://service.example');
  expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' })).toEqual({ ok: true });
  h.issue(); await vi.waitFor(() => expect(h.controller.startAttempt).toHaveBeenCalledOnce());
````

In `tests/onlineRecovery.test.ts`, replace:

````ts
    const owner = createOnlineSession({ config: { enabled: true, baseUrl: credential.serviceOrigin, allowInsecureLocalhost: true, iceMode: 'loopback' }, service: () => service, platform, seatStore, mirrorStore,
      clock: { nowMs: () => Date.now(), epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }, nonce: () => 'f'.repeat(32) });
    cleanups.push(async () => { await owner.dispatch({ type: 'forget-seat' }); await owner.dispose(); subscribers.delete(broadcast); });
````

with:

````ts
    const owner = createOnlineSession({ config: { enabled: true, baseUrl: credential.serviceOrigin, allowInsecureLocalhost: true, iceMode: 'loopback' }, service: () => service, platform, seatStore, mirrorStore,
      clock: { nowMs: () => Date.now(), epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }, nonce: () => 'f'.repeat(32), sectorTestEntry: true });
    cleanups.push(async () => { await owner.dispatch({ type: 'forget-seat' }); await owner.dispose(); subscribers.delete(broadcast); });
````

In `tests/onlineIpc.test.ts`, replace:

````ts
    const h = harness(false);
    expect(await h.invoke('host', { type: 'host', capacity: 2 })).toEqual({ ok: false, code: 'unauthorized' });
    h.win.isVisible = () => true;
    expect(await h.invoke('host', { type: 'host', capacity: 2 })).toEqual({ ok: true });
    expect(await h.invoke('host', { type: 'host', capacity: 2 }, { ...h.event, sender: {} } as any)).toEqual({ ok: false, code: 'unauthorized' });
  });
  const actions = [{ type: 'host', capacity: 2 }, { type: 'join', code: 'ABCD1234' }, { type: 'ready', ready: false }, { type: 'remove-seat', seatId: 1 }, { type: 'view-state', epoch: 1, phase: 'synced' }, ...['reconnect', 'start', 'retry', 'leave', 'forget-seat'].map(type => ({ type }))];
  it.each(actions)('denies unknown windows, hidden transports, subframes and port injection for $type', async action => {
````

with:

````ts
    const h = harness(false);
    expect(await h.invoke('host', { type: 'host', mode: 'sector', capacity: 2 })).toEqual({ ok: false, code: 'unauthorized' });
    h.win.isVisible = () => true;
    expect(await h.invoke('host', { type: 'host', mode: 'sector', capacity: 2 })).toEqual({ ok: true });
    expect(await h.invoke('host', { type: 'host', mode: 'sector', capacity: 2 }, { ...h.event, sender: {} } as any)).toEqual({ ok: false, code: 'unauthorized' });
  });
  const actions = [{ type: 'host', mode: 'sector', capacity: 2 }, { type: 'join', code: 'ABCD1234' }, { type: 'ready', ready: false }, { type: 'remove-seat', seatId: 1 }, { type: 'view-state', epoch: 1, phase: 'synced' }, ...['reconnect', 'start', 'retry', 'leave', 'forget-seat'].map(type => ({ type }))];
  it.each(actions)('denies unknown windows, hidden transports, subframes and port injection for $type', async action => {
````

In `tests/onlineSessionContract.test.ts`, replace:

````ts
    }
    expect(validateOnlineAction({ type: 'host', capacity: 2, [field]: 'private' })).toBe(false);
    expect(() => copyOnlineStatus({ ...status(), [field]: 'private' })).toThrow('invalid-status');
````

with:

````ts
    }
    expect(validateOnlineAction({ type: 'host', mode: 'sector', capacity: 2, [field]: 'private' })).toBe(false);
    expect(() => copyOnlineStatus({ ...status(), [field]: 'private' })).toThrow('invalid-status');
````

In `tests/onlineSessionContract.test.ts`, replace:

````ts
  });
  it.each([{type:'host',capacity:1}, {type:'host',capacity:4}, {type:'join',code:'  abcd1234  '}, {type:'ready',ready:false}, {type:'remove-seat',seatId:3}, {type:'view-state',epoch:1,phase:'synced'}, ...['reconnect','start','retry','leave','forget-seat'].map(type=>({type}))])('accepts allowed action %j', action => {
    expect(validateOnlineAction(action)).toBe(true);
  });
  it.each([null, {}, {type:'host',capacity:0}, {type:'host',capacity:5}, {type:'host',capacity:1.5}, {type:'join',code:'ABCD123I'}, {type:'join',code:'ABCD1234',seatToken:'secret'}, {type:'join',code:' '.repeat(25)+'ABCD1234'}, {type:'reconnect',roomId:'a'.repeat(32)}, {type:'remove-seat',seatId:4}, {type:'ready',ready:1}, {type:'view-state',epoch:0,phase:'synced'}, {type:'view-state',epoch:Number.MAX_SAFE_INTEGER+1,phase:'running'}, {type:'view-state',epoch:1,phase:'lobby'}, {type:'toString'}])('rejects malformed/privileged action %j', action => {
    expect(validateOnlineAction(action)).toBe(false);
````

with:

````ts
  });
  it.each([{type:'host',mode:'duel'}, {type:'host',mode:'sector',capacity:1}, {type:'host',mode:'sector',capacity:4}, {type:'join',code:'  abcd1234  '}, {type:'join',code:'ABCD1234',mode:'duel'}, {type:'join',code:'ABCD1234',mode:'sector'}, {type:'start',helmPlayer:0}, {type:'start',helmPlayer:1}, {type:'ready',ready:false}, {type:'remove-seat',seatId:3}, {type:'view-state',epoch:1,phase:'synced'}, ...['reconnect','start','retry','leave','forget-seat'].map(type=>({type}))])('accepts allowed action %j', action => {
    expect(validateOnlineAction(action)).toBe(true);
  });
  it.each([null, {}, {type:'host',capacity:2}, {type:'host',mode:'duel',capacity:2}, {type:'host',mode:'sector',capacity:0}, {type:'host',mode:'sector',capacity:5}, {type:'host',mode:'sector',capacity:1.5}, {type:'host',mode:'other'}, {type:'join',code:'ABCD1234',mode:'other'}, {type:'start',helmPlayer:2}, {type:'join',code:'ABCD123I'}, {type:'join',code:'ABCD1234',seatToken:'secret'}, {type:'join',code:' '.repeat(25)+'ABCD1234'}, {type:'reconnect',roomId:'a'.repeat(32)}, {type:'remove-seat',seatId:4}, {type:'ready',ready:1}, {type:'view-state',epoch:0,phase:'synced'}, {type:'view-state',epoch:Number.MAX_SAFE_INTEGER+1,phase:'running'}, {type:'view-state',epoch:1,phase:'lobby'}, {type:'toString'}])('rejects malformed/privileged action %j', action => {
    expect(validateOnlineAction(action)).toBe(false);
````

In `tests/onlineBridge.test.ts`, replace:

````ts
    h.message({ source: 'ftlite:online:main', type: 'host', capacity: 4 }, [p]);
    h.message({ channel: 'online:host', message: { type: 'host', capacity: 4 } });
    expect(h.api.host).not.toHaveBeenCalled(); expect(p.close).toHaveBeenCalledOnce(); h.bridge.dispose();
````

with:

````ts
    h.message({ source: 'ftlite:online:main', type: 'host', capacity: 4 }, [p]);
    h.message({ channel: 'online:host', message: { type: 'host', mode: 'sector', capacity: 4 } });
    expect(h.api.host).not.toHaveBeenCalled(); expect(p.close).toHaveBeenCalledOnce(); h.bridge.dispose();
````

In `tests/onlineBridge.test.ts`, replace:

````ts
      native.invoke.mockResolvedValueOnce({ ok: true, token: 'private' }).mockRejectedValueOnce(Error('private'));
      expect(await native.exposed.online.host(2)).toEqual({ ok: false, code: 'invalid-status' });
      expect(await native.exposed.online.host(2)).toEqual({ ok: false, code: 'unavailable' });
      const calls = native.invoke.mock.calls.length;
      expect(await native.exposed.online.host(9)).toEqual({ ok: false, code: 'invalid-action' }); expect(native.invoke.mock.calls.length).toBe(calls);
      const statusCb = vi.fn(), offStatus = native.exposed.online.onStatus(statusCb);
````

with:

````ts
      native.invoke.mockResolvedValueOnce({ ok: true, token: 'private' }).mockRejectedValueOnce(Error('private'));
      expect(await native.exposed.online.host({ mode: 'sector', capacity: 2 })).toEqual({ ok: false, code: 'invalid-status' });
      expect(await native.exposed.online.host()).toEqual({ ok: false, code: 'unavailable' });
      const calls = native.invoke.mock.calls.length;
      expect(await native.exposed.online.host({ mode: 'sector', capacity: 9 })).toEqual({ ok: false, code: 'invalid-action' }); expect(native.invoke.mock.calls.length).toBe(calls);
      const statusCb = vi.fn(), offStatus = native.exposed.online.onStatus(statusCb);
````

In `tests/mainMenu.test.ts`, replace:

````ts
    expect(root.find('host')!.disabled).toBe(false); expect(root.find('join')!.disabled).toBe(false);
    root.find('host')!.fire(); expect(root.find('capacity')).toBeDefined();
    root.find('back')!.fire(); expect(root.find('page-title')!.textContent).toBe('Multiplayer');
````

with:

````ts
    expect(root.find('host')!.disabled).toBe(false); expect(root.find('join')!.disabled).toBe(false);
    root.find('host')!.fire(); expect(root.find('create-room')).toBeDefined(); expect(root.find('capacity')).toBeUndefined();   // a duel room has no capacity (H-2)
    root.find('back')!.fire(); expect(root.find('page-title')!.textContent).toBe('Multiplayer');
````

In `tests/sessionMenu.test.ts`, replace:

````ts
});
it('offers accessible capacity/code forms and deduplicates Join until settlement', async () => {
  const root = new Element(), join = vi.fn(() => new Promise<any>(() => {})), host = vi.fn(async () => ({ ok: true }));
  const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: { host, join } as any, single: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  menu.setStatus({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect'] });
  root.find('multiplayer')!.fire(); root.find('host')!.fire(); expect(root.find('capacity')!.value).toBe('2'); root.find('capacity')!.value = '4'; root.find('host-form')!.fire('submit'); expect(host).toHaveBeenCalledWith(4);
  await Promise.resolve(); await Promise.resolve(); menu.home(); root.find('multiplayer')!.fire(); root.find('join')!.fire(); root.find('join-code')!.value = ' abcdef12 '; const form = root.find('join-form')!; form.fire('submit'); form.fire('submit'); expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
````

with:

````ts
});
it('offers the duel Host form and an accessible code form, and deduplicates Join until settlement', async () => {
  const root = new Element(), join = vi.fn(() => new Promise<any>(() => {})), host = vi.fn(async () => ({ ok: true }));
  const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: { host, join } as any, single: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  menu.setStatus({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect'] });
  root.find('multiplayer')!.fire(); root.find('host')!.fire(); expect(root.find('capacity')).toBeUndefined(); root.find('host-form')!.fire('submit'); expect(host).toHaveBeenCalledWith();
  await Promise.resolve(); await Promise.resolve(); menu.home(); root.find('multiplayer')!.fire(); root.find('join')!.fire(); root.find('join-code')!.value = ' abcdef12 '; const form = root.find('join-form')!; form.fire('submit'); form.fire('submit'); expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
````

In `tests/sessionMenu.test.ts`, replace:

````ts
  menu.setStatus({ ...status, phase: 'error', error: 'incompatible', actions: ['join', 'retry'] }); expect(root.find('status')!.textContent).toContain('compatible'); expect(root.find('retry')).toBeDefined();
````

with:

````ts
  menu.setStatus({ ...status, phase: 'error', error: 'incompatible', actions: ['join', 'retry'] }); expect(root.find('status')!.textContent).toContain('The other computer runs a different FTLite build. Install the same build on both, then try again.'); expect(root.find('retry')).toBeDefined();   // a duel Join tries one compatibility: incompatible means a different build (H-2 spec §2)
````

Run: `npx vitest run tests/onlineDuel.test.ts`
Expected: FAIL: `src/main/network/onlineDuel.ts` does not exist.

- [ ] **Step 2: The actions, the preload API and the record channel**

In `src/shared/onlineSession.ts`, replace:

````ts
}
export type OnlineAction =
  | { type: 'host'; capacity: number }
  | { type: 'join'; code: string }
  | { type: 'ready'; ready: boolean }
````

with:

````ts
}
/** The online modes a room can run (H-2 spec §2). The menu offers only the duel; the sector forms are a test-only entry
 *  the main process honours only when it was started for it (unpackaged and FTLITE_SECTOR_ONLINE_TEST=1). */
export type OnlineMode = 'duel' | 'sector';
export type OnlineAction =
  | { type: 'host'; mode: 'duel' }
  | { type: 'host'; mode: 'sector'; capacity: number }
  | { type: 'join'; code: string; mode?: OnlineMode }
  | { type: 'ready'; ready: boolean }
````

In `src/shared/onlineSession.ts`, replace:

````ts
  | { type: 'rehost' }
  | { type: 'start' }
  | { type: 'retry' }
````

with:

````ts
  | { type: 'rehost' }
  /** `helmPlayer`: the duel host's seat choice (spec §2), 0 when absent; the sector ignores it. */
  | { type: 'start'; helmPlayer?: 0 | 1 }
  | { type: 'retry' }
````

In `src/shared/onlineSession.ts`, replace:

````ts
  switch (value.type) {
    case 'host': return rtcKeys(value, ['type', 'capacity']) && positive(value.capacity) && value.capacity <= 4;
    case 'join': return rtcKeys(value, ['type', 'code']) && typeof value.code === 'string' && value.code.length <= 32
      && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value.code.trim().toUpperCase());
    case 'ready': return rtcKeys(value, ['type', 'ready']) && typeof value.ready === 'boolean';
````

with:

````ts
  switch (value.type) {
    case 'host': return value.mode === 'duel' ? rtcKeys(value, ['type', 'mode'])
      : value.mode === 'sector' && rtcKeys(value, ['type', 'mode', 'capacity']) && positive(value.capacity) && value.capacity <= 4;
    case 'join': return (rtcKeys(value, ['type', 'code']) || rtcKeys(value, ['type', 'code', 'mode']) && (value.mode === 'duel' || value.mode === 'sector'))
      && typeof value.code === 'string' && value.code.length <= 32
      && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value.code.trim().toUpperCase());
    case 'start': return rtcKeys(value, ['type']) || rtcKeys(value, ['type', 'helmPlayer']) && (value.helmPlayer === 0 || value.helmPlayer === 1);
    case 'ready': return rtcKeys(value, ['type', 'ready']) && typeof value.ready === 'boolean';
````

In `src/shared/onlineSession.ts`, replace:

````ts
      && ['synced', 'running', 'paused', 'ended'].includes(value.phase as string);
    case 'rehost': case 'reconnect': case 'start': case 'retry': case 'leave': case 'forget-seat': return rtcKeys(value, ['type']);
    default: return false;
````

with:

````ts
      && ['synced', 'running', 'paused', 'ended'].includes(value.phase as string);
    case 'rehost': case 'reconnect': case 'retry': case 'leave': case 'forget-seat': return rtcKeys(value, ['type']);
    default: return false;
````

In `src/shared/onlineSession.ts`, replace:

````ts
export interface OnlinePreloadApi {
  host(capacity: number): Promise<OnlineResult>;
  join(code: string): Promise<OnlineResult>;
  ready(ready: boolean): Promise<OnlineResult>;
````

with:

````ts
export interface OnlinePreloadApi {
  /** Host a duel room; `{ mode: 'sector', capacity }` is the test-only sector entry (spec §10). */
  host(sector?: { mode: 'sector'; capacity: number }): Promise<OnlineResult>;
  join(code: string, mode?: OnlineMode): Promise<OnlineResult>;
  ready(ready: boolean): Promise<OnlineResult>;
````

In `src/shared/onlineSession.ts`, replace:

````ts
  rehost(): Promise<OnlineResult>;
  start(): Promise<OnlineResult>;
  retry(): Promise<OnlineResult>;
````

with:

````ts
  rehost(): Promise<OnlineResult>;
  start(helmPlayer?: 0 | 1): Promise<OnlineResult>;
  retry(): Promise<OnlineResult>;
````

In `src/shared/onlineSession.ts`, replace:

````ts
}
/** The window's fullscreen state (Settings, main menu spec): the same native toggle as F11. */
````

with:

````ts
}
/** The duel playtest record channel (H-2 spec §8): one record per call, validated in main. */
export const DUEL_RECORD_CHANNEL = 'duel:record';
/** The window's fullscreen state (Settings, main menu spec): the same native toggle as F11. */
````

In `src/shared/onlineSession.ts`, replace:

````ts
  online: OnlinePreloadApi;
  onSuspend(callback: () => void): Unsubscribe;
````

with:

````ts
  online: OnlinePreloadApi;
  /** Append one duel playtest record (shared/duelRecord.ts) to this machine's playtest log (H-2 spec §8). */
  recordDuel?(record: unknown): Promise<boolean>;
  onSuspend(callback: () => void): Unsubscribe;
````

In `src/preload/index.ts`, replace:

````ts
import { contextBridge, ipcRenderer } from 'electron';
import { copyOnlinePortDescriptor, ONLINE_CHANNELS, ONLINE_PORT_CHANNEL, ONLINE_PORT_SOURCE, ONLINE_STATUS_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  validateOnlineAction, validateOnlinePortEnvelope, validateOnlineResult, validateOnlineStatusEnvelope,
````

with:

````ts
import { contextBridge, ipcRenderer } from 'electron';
import { copyOnlinePortDescriptor, DUEL_RECORD_CHANNEL, ONLINE_CHANNELS, ONLINE_PORT_CHANNEL, ONLINE_PORT_SOURCE, ONLINE_STATUS_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  validateOnlineAction, validateOnlinePortEnvelope, validateOnlineResult, validateOnlineStatusEnvelope,
````

In `src/preload/index.ts`, replace:

````ts
  onResume: callback => lifecycle('app:resume', callback),
  window: {
````

with:

````ts
  onResume: callback => lifecycle('app:resume', callback),
  async recordDuel(record) { try { return (await ipcRenderer.invoke(DUEL_RECORD_CHANNEL, structuredClone(record))) === true; } catch { return false; } },
  window: {
````

In `src/preload/index.ts`, replace:

````ts
  online: {
    host: capacity => action({ type: 'host', capacity }),
    join: code => action({ type: 'join', code }),
    ready: ready => action({ type: 'ready', ready }),
````

with:

````ts
  online: {
    host: sector => action(sector ? { type: 'host', mode: 'sector', capacity: sector.capacity } : { type: 'host', mode: 'duel' }),
    join: (code, mode) => action(mode ? { type: 'join', code, mode } : { type: 'join', code }),
    ready: ready => action({ type: 'ready', ready }),
````

In `src/preload/index.ts`, replace:

````ts
    rehost: () => action({ type: 'rehost' }),
    start: () => action({ type: 'start' }),
    retry: () => action({ type: 'retry' }),
````

with:

````ts
    rehost: () => action({ type: 'rehost' }),
    start: helmPlayer => action(helmPlayer === undefined ? { type: 'start' } : { type: 'start', helmPlayer }),
    retry: () => action({ type: 'retry' }),
````

- [ ] **Step 3: The playtest record**

Create `src/renderer/src/net/duelRecord.ts`:

````ts
// The duel playtest record (H-2 spec §8): one line per decided round, written by each renderer through the preload's
// recordDuel and appended by main to userData/playtest/duel-YYYY-MM-DD.jsonl. Strict and size-capped: it never carries a
// token, code, address or candidate. `round`, `seed` and `helmPlayer` come from the replica's hashed round state, so a
// client that reconnected mid-round still labels its round. The latency figures are filled in here; H-2b reports them.
import { z } from 'zod';
import { MISSILE_LOSSES, TERMINAL_CAUSES, type DuelRoundRecord } from '../sim/duel/summary';

export const DUEL_RECORD_MAX_BYTES = 8192;
/** The largest millisecond figure a record holds; the helpers drop larger samples so the record is never lost. */
export const DUEL_RECORD_MAX_MS = 3_600_000;
/** count, median, 95th percentile and maximum, in milliseconds (null with no samples). */
export interface LatencyFigure { count: number; median: number | null; p95: number | null; max: number | null }
export interface DuelPlaytestRecord {
  version: 1; session: 'solo' | 'online'; role: 'host' | 'guest'; transport: 'loopback' | 'lan' | 'internet' | null;
  seat: 0 | 1; helmPlayer: 0 | 1; seed: number; round: number; startedAtIso: string;
  summary: DuelRoundRecord;
  latency: { held: LatencyFigure; command: LatencyFigure; rttMs: number | null };
  /** Publication inter-arrival: the standard deviation against the expected 50 ms, over `count` gaps. */
  jitter: { count: number; stdMs: number | null };
  disconnects: number; pauses: number;
}

const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), ms = z.number().finite().min(0).max(DUEL_RECORD_MAX_MS);
const pair = z.tuple([uint, uint]);
const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length);
const losses = z.object(Object.fromEntries(MISSILE_LOSSES.map((k) => [k, uint])) as Record<(typeof MISSILE_LOSSES)[number], typeof uint>).strict();
const figure = z.object({ count: uint, median: ms.nullable(), p95: ms.nullable(), max: ms.nullable() }).strict();
const summary = z.object({
  outcome: z.number().int().min(1).max(3), ticks: uint, terminal: z.tuple([causes, causes]),
  laserReleases: pair, laserHits: pair, missilesLaunched: pair, missileHits: pair, repairsFinished: pair, laserMisses: pair, layersStripped: pair,
  missileLosses: z.tuple([losses, losses]), planetContacts: pair, asteroidContacts: pair, baits: uint, consoleSwaps: uint,
  helmEmptyTicks: uint, weaponsEmptyTicks: uint, enemyInArcTicks: uint, weaponsIdleTicks: uint, repairsStarted: pair, walkingTicks: pair, repairingTicks: pair,
  round: uint, seed: z.number().int().min(0).max(0xffffffff), baseTick: uint
}).strict();
export const duelRecordSchema = z.object({
  version: z.literal(1), session: z.enum(['solo', 'online']), role: z.enum(['host', 'guest']), transport: z.enum(['loopback', 'lan', 'internet']).nullable(),
  seat: z.union([z.literal(0), z.literal(1)]), helmPlayer: z.union([z.literal(0), z.literal(1)]), seed: z.number().int().min(0).max(0xffffffff), round: uint,
  startedAtIso: z.string().max(32).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/),
  summary, latency: z.object({ held: figure, command: figure, rttMs: ms.nullable() }).strict(),
  jitter: z.object({ count: uint, stdMs: ms.nullable() }).strict(), disconnects: uint, pauses: uint
}).strict();

/** The record, validated and within its byte cap; throws otherwise. */
export function validateDuelRecord(value: unknown): DuelPlaytestRecord {
  const record = duelRecordSchema.parse(value) as DuelPlaytestRecord;
  if (record.round !== record.summary.round || record.seed !== record.summary.seed) throw new Error('duel record round does not match its summary');
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > DUEL_RECORD_MAX_BYTES) throw new Error('duel record exceeds its size cap');
  return record;
}

/** count, median, p95 and max of a list of milliseconds (nearest-rank percentiles); samples outside 0 to the cap are dropped. */
export function latencyFigure(samples: readonly number[]): LatencyFigure {
  const s = samples.filter((v) => v >= 0 && v <= DUEL_RECORD_MAX_MS).sort((a, b) => a - b);
  if (!s.length) return { count: 0, median: null, p95: null, max: null };
  const rank = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
  const round = (v: number) => Math.round(v * 10) / 10;
  return { count: s.length, median: round(rank(0.5)), p95: round(rank(0.95)), max: round(s[s.length - 1]!) };
}
/** The standard deviation of publication inter-arrival gaps against the expected 50 ms; gaps outside 0 to the cap are dropped. */
export function arrivalJitter(samples: readonly number[]): { count: number; stdMs: number | null } {
  const gaps = samples.filter((g) => g >= 0 && g <= DUEL_RECORD_MAX_MS);
  if (!gaps.length) return { count: 0, stdMs: null };
  let sum = 0; for (const g of gaps) sum += (g - 50) * (g - 50);
  return { count: gaps.length, stdMs: Math.round(Math.sqrt(sum / gaps.length) * 10) / 10 };
}
````

Create `src/main/network/duelRecords.ts`:

````ts
// The duel playtest log (H-2 spec §8): main appends each validated record as one line to
// userData/playtest/duel-YYYY-MM-DD.jsonl (the local date). Records are strict and size-capped (net/duelRecord.ts), so
// nothing but the record's own fields ever reaches the file.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateDuelRecord } from '../../renderer/src/net/duelRecord';

export function duelRecordPath(userData: string, now: Date): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return join(userData, 'playtest', `duel-${day}.jsonl`);
}
/** Validate and append one record; false (and nothing written) when it is invalid or the write fails. */
export async function appendDuelRecord(userData: string, value: unknown, now = new Date()): Promise<boolean> {
  let line: string;
  try { line = JSON.stringify(validateDuelRecord(value)) + '\n'; } catch { return false; }
  try { await mkdir(join(userData, 'playtest'), { recursive: true }); await appendFile(duelRecordPath(userData, now), line, 'utf8'); return true; }
  catch { return false; }
}
````

- [ ] **Step 4: The duel's online mode and the mode adapter**

Create `src/main/network/onlineDuel.ts`:

````ts
// The duel's main-process online mode (H-2 spec §2): its compatibility (duel schema version 2, the Cutter's layout), the
// init a room implies (round 0's seed from the room's runId, the host's Helm choice), the guest's check of a committed
// start (any helmPlayer, every other field its own expected init's), and the mirror check. A test-only seed replaces the
// runId's when the main process was given one (unpackaged builds only, H-2 spec §10's forced round end).
import { createHash } from 'node:crypto';
import { validateDuelCheckpoint, validateDuelInit, type DuelInit } from '../../renderer/src/authority/duelCheckpoint';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { deriveLayout } from '../../renderer/src/sim/ship/derived';
import { parseShip } from '../../renderer/src/sim/ship/schema';
import { nextValidSeed, seedFromRunId } from '../../renderer/src/sim/duel/seeds';
import cutter from '../../renderer/src/sim/ship/cutter.json';
import { validateInitBase64, validateLeaseGrant, validateRoomSnapshot, type CommittedStart, type RoomCompatibility, type RoomSnapshot } from '../../shared/roomSession';
import type { SessionMirror } from './mirrorStore';
import { onlineFault } from './onlineRetry';

const CUTTER = parseShip(cutter);
const resolveLayout = (id: string) => { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; };
/** The duel mode's schema version (src/network/modes/duel.ts). */
export const DUEL_SCHEMA_VERSION = 2;
export interface DuelChoice { helmPlayer: 0 | 1 }

export function duelCompatibility(): RoomCompatibility {
  return { protocolVersion: 2, modeId: 'duel', schemaVersion: DUEL_SCHEMA_VERSION, simVersion: SIM_VERSION,
    contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutHash: deriveLayout(CUTTER).layoutHash };
}
export function duelJoinCompatibilities(): readonly RoomCompatibility[] { return [duelCompatibility()]; }
/** Round 0's seed for a room: the test seed when one was given, else the runId's (spec §2). */
export function duelRoomSeed(runId: string, testSeed?: number): number {
  try { return testSeed === undefined ? seedFromRunId(runId) : nextValidSeed(testSeed); } catch { throw onlineFault('invalid-request'); }
}
export function duelInit(snapshot: RoomSnapshot, choice: DuelChoice = { helmPlayer: 0 }, testSeed?: number): DuelInit {
  if (!validateRoomSnapshot(snapshot)) throw onlineFault('invalid-frame');
  const expected = duelCompatibility();
  if (snapshot.capacity !== 2 || Object.entries(expected).some(([key, value]) => snapshot.compatibility[key as keyof RoomCompatibility] !== value)) throw onlineFault('incompatible');
  if (choice.helmPlayer !== 0 && choice.helmPlayer !== 1) throw onlineFault('invalid-request');
  return validateDuelInit(CUTTER, { runId: snapshot.runId, layoutId: CUTTER.id, layoutHash: expected.layoutHash, simVersion: SIM_VERSION,
    contentDigest: expected.contentDigest, seed: duelRoomSeed(snapshot.runId, testSeed), playerCount: 2, helmPlayer: choice.helmPlayer }, expected.contentDigest);
}
/** The guest cannot know the host's seat choice: either helmPlayer, and every other field equal to its own expected init. */
export async function validateCommittedDuelStart(snapshot: RoomSnapshot, committed: CommittedStart, testSeed?: number): Promise<DuelInit> {
  const expected = duelInit(snapshot, { helmPlayer: 0 }, testSeed), lease = committed.lease;
  if (!validateInitBase64(committed.initBase64) || !validateLeaseGrant(lease) || lease.roomId !== snapshot.roomId
    || lease.hostGeneration !== snapshot.hostGeneration || lease.hostSeatId !== snapshot.hostSeatId) throw onlineFault('invalid-frame');
  const bytes = Buffer.from(committed.initBase64, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== committed.initHash) throw onlineFault('hash-mismatch');
  try {
    const value = validateDuelInit(CUTTER, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), expected.contentDigest);
    const wanted = { ...expected, helmPlayer: value.helmPlayer };
    if (Object.keys(value).length !== Object.keys(wanted).length || Object.entries(wanted).some(([key, v]) => JSON.stringify(value[key as keyof DuelInit]) !== JSON.stringify(v))) throw Error();
    return value;
  } catch { throw onlineFault('incompatible'); }
}
export function validateDuelMirror(mirror: SessionMirror): void {
  try {
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mirror.bytes));
    const checkpoint = validateDuelCheckpoint(raw, __GAMEPLAY_CONTENT_DIGEST__, resolveLayout), m = mirror.metadata;
    if (checkpoint.init.runId !== m.runId || checkpoint.snapshot.header.tick !== m.capturedTick
      || Object.entries(duelCompatibility()).some(([k, v]) => m.compatibility[k as keyof RoomCompatibility] !== v)) throw Error();
  } catch { throw onlineFault('save-invalid'); }
}
````

Create `src/main/network/onlineModes.ts`:

````ts
// The main process's online mode adapter (H-2 spec §2): the five operations the online session needs from a mode, so the
// session itself is mode-generic. The sector's are today's onlineSector.ts functions, unchanged; the duel's are
// onlineDuel.ts. A context records its adapter when it is created: the host's from the action, the joiner's from the
// requested mode, a reconnect's from the saved seat's compatibility.
import type { CommittedStart, RoomCompatibility, RoomSnapshot } from '../../shared/roomSession';
import type { OnlineMode } from '../../shared/onlineSession';
import type { SessionMirror } from './mirrorStore';
import { sectorCompatibility, sectorInit, sectorJoinCompatibilities, validateCommittedSectorStart, validateSectorMirror } from './onlineSector';
import { duelCompatibility, duelInit, duelJoinCompatibilities, validateCommittedDuelStart, validateDuelMirror } from './onlineDuel';

export interface OnlineModeAdapter {
  readonly modeId: OnlineMode;
  /** The host's room compatibility (the sector's depends on its capacity). */
  compatibility(capacity: number): RoomCompatibility;
  /** The compatibilities a joiner tries, in order. */
  joinCompatibilities(): readonly RoomCompatibility[];
  /** The init a room implies; throws for a room this mode cannot run. `helmPlayer` is the duel host's seat choice. */
  init(snapshot: RoomSnapshot, choice?: { helmPlayer: 0 | 1 }): unknown;
  validateCommittedStart(snapshot: RoomSnapshot, committed: CommittedStart): Promise<unknown>;
  validateMirror(mirror: SessionMirror, capacity?: number): void;
}

export const sectorOnlineMode: OnlineModeAdapter = {
  modeId: 'sector', compatibility: sectorCompatibility, joinCompatibilities: sectorJoinCompatibilities,
  init: (snapshot) => sectorInit(snapshot), validateCommittedStart: validateCommittedSectorStart, validateMirror: validateSectorMirror
};
/** The duel adapter; `testSeed` (unpackaged test builds only) replaces every room's runId seed. */
export function duelOnlineMode(testSeed?: number): OnlineModeAdapter {
  return {
    modeId: 'duel', compatibility: () => duelCompatibility(), joinCompatibilities: duelJoinCompatibilities,
    init: (snapshot, choice) => duelInit(snapshot, choice, testSeed),
    validateCommittedStart: (snapshot, committed) => validateCommittedDuelStart(snapshot, committed, testSeed),
    validateMirror: (mirror) => validateDuelMirror(mirror)
  };
}
/** The adapter for a room's mode id, or undefined for a mode this build does not run online. */
export function onlineModeFor(modeId: string, testSeed?: number): OnlineModeAdapter | undefined {
  return modeId === 'duel' ? duelOnlineMode(testSeed) : modeId === 'sector' ? sectorOnlineMode : undefined;
}
/** The mirror store's validator: each mirror by its own mode. */
export function validateModeMirror(mirror: SessionMirror, capacity?: number): void {
  const mode = onlineModeFor(mirror.metadata.compatibility.modeId);
  if (!mode) throw Error('unknown mirror mode');
  mode.validateMirror(mirror, capacity);
}
````

In `tsconfig.node.json`, replace:

````json
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "src/network/session/serviceClient.ts", "src/network/rtc/contracts.ts", "src/renderer/src/net/env.d.ts", "src/renderer/src/sim/**/*", "src/renderer/src/sim/**/*.json", "src/renderer/src/net/contracts.ts", "src/renderer/src/net/codec.ts", "src/renderer/src/net/receivePolicy.ts", "src/renderer/src/authority/checkpoint.ts", "src/renderer/src/authority/ledger.ts", "src/renderer/src/clientControl/cardController.ts", "src/renderer/src/clientControl/inputFrame.ts", "build/contentDigest.ts", "build/isolatedBuildReporter.ts", "electron.vite.config.ts"]
}
````

with:

````json
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "src/network/session/serviceClient.ts", "src/network/rtc/contracts.ts", "src/renderer/src/net/env.d.ts", "src/renderer/src/sim/**/*", "src/renderer/src/sim/**/*.json", "src/renderer/src/net/contracts.ts", "src/renderer/src/net/codec.ts", "src/renderer/src/net/receivePolicy.ts", "src/renderer/src/net/duelRecord.ts", "src/renderer/src/authority/checkpoint.ts", "src/renderer/src/authority/duelCheckpoint.ts", "src/renderer/src/authority/rules.ts", "src/renderer/src/authority/ledger.ts", "src/renderer/src/clientControl/cardController.ts", "src/renderer/src/clientControl/inputFrame.ts", "build/contentDigest.ts", "build/isolatedBuildReporter.ts", "electron.vite.config.ts"]
}
````

- [ ] **Step 5: The session through the adapter: the mode, the origin and the gate**

In `src/main/network/onlineSession.ts`, replace:

````ts
import { createOnlineRetry, onlineFault, type OnlineClock, type OnlineScheduler } from './onlineRetry';
import { sectorCompatibility, sectorInit, sectorJoinCompatibilities, validateCommittedSectorStart, validateSectorMirror } from './onlineSector';
import { createOnlineMirrors, type OnlineMirrors } from './onlineMirrors';
````

with:

````ts
import { createOnlineRetry, onlineFault, type OnlineClock, type OnlineScheduler } from './onlineRetry';
import { duelOnlineMode, onlineModeFor, sectorOnlineMode, type OnlineModeAdapter } from './onlineModes';
import { createOnlineMirrors, type OnlineMirrors } from './onlineMirrors';
````

In `src/main/network/onlineSession.ts`, replace:

````ts
  clock: OnlineClock; scheduler: OnlineScheduler; nonce(): string;
}
````

with:

````ts
  clock: OnlineClock; scheduler: OnlineScheduler; nonce(): string;
  /** The test-only sector entry (H-2 spec §10): the sector forms of host and join are honoured only when true. */
  sectorTestEntry?: boolean;
  /** A test-only duel seed (unpackaged builds only) that replaces every duel room's runId seed. */
  duelTestSeed?: number;
}
````

In `src/main/network/onlineSession.ts`, replace:

````ts
  const listeners = new Set<(status: OnlineStatus) => void>(), retry = createOnlineRetry(clock, scheduler);
  type Context = { epoch: number; abort: AbortController; service: RoomServiceClient; seat?: SeatSession; transport?: OwnedOnlineTransport; host?: HostProcessHandle;
    peers?: ReturnType<typeof createOnlinePeers>; ice?: OnlineIce; removers: Unsubscribe[]; gameRemovers: Unsubscribe[]; ports: Set<MessagePortMain>; timers: Set<unknown>;
````

with:

````ts
  const listeners = new Set<(status: OnlineStatus) => void>(), retry = createOnlineRetry(clock, scheduler);
  type Context = { epoch: number; abort: AbortController; service: RoomServiceClient; mode: OnlineModeAdapter; seat?: SeatSession; transport?: OwnedOnlineTransport; host?: HostProcessHandle;
    peers?: ReturnType<typeof createOnlinePeers>; ice?: OnlineIce; removers: Unsubscribe[]; gameRemovers: Unsubscribe[]; ports: Set<MessagePortMain>; timers: Set<unknown>;
````

In `src/main/network/onlineSession.ts`, replace:

````ts
  function updateSnapshot(c: Context, snapshot: RoomSnapshot) {
    check(c); sectorInit(snapshot);
    if (snapshot.hostGeneration < c.seat!.snapshot.hostGeneration) return;
````

with:

````ts
  function updateSnapshot(c: Context, snapshot: RoomSnapshot) {
    check(c); c.mode.init(snapshot);
    if (snapshot.hostGeneration < c.seat!.snapshot.hostGeneration) return;
````

In `src/main/network/onlineSession.ts`, replace:

````ts
      if (c.host) {
        await wait(c, c.host.attachPeer(peer.attemptId, [peer.seatId], peer.port, { streamed: true, latestPayloadLimit: peer.latestPayloadLimit }));
        checkGame(c, gameEpoch); c.ports.delete(peer.port);
````

with:

````ts
      if (c.host) {
        await wait(c, c.host.attachPeer(peer.attemptId, [peer.seatId], peer.port, { streamed: true, latestPayloadLimit: peer.latestPayloadLimit, origin: 'remote' }));
        checkGame(c, gameEpoch); c.ports.delete(peer.port);
````

In `src/main/network/onlineSession.ts`, replace:

````ts
      roomId: s.roomId, runId: s.runId, hostGeneration: s.hostGeneration, compatibility: s.compatibility, clock, signal: c.abort.signal,
      validatePayload: validateSectorMirror, onChange: mirror => { if (current(c)) emit({ mirror }); } });
  }
````

with:

````ts
      roomId: s.roomId, runId: s.runId, hostGeneration: s.hostGeneration, compatibility: s.compatibility, clock, signal: c.abort.signal,
      validatePayload: mirror => c.mode.validateMirror(mirror), onChange: mirror => { if (current(c)) emit({ mirror }); } });
  }
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    const { port1, port2 } = platform.channel(); c.ports.add(port1); c.ports.add(port2);
    await wait(c, host.attachPeer('online-local', [c.seat!.seatId], port1, { streamed: true, latestPayloadLimit: RTC_MAX_PACKET_BYTES - RTC_MAX_HEADER_BYTES })); c.ports.delete(port1);
    if (c.host !== host || !c.active) throw onlineFault('host-lost');
````

with:

````ts
    const { port1, port2 } = platform.channel(); c.ports.add(port1); c.ports.add(port2);
    await wait(c, host.attachPeer('online-local', [c.seat!.seatId], port1, { streamed: true, latestPayloadLimit: RTC_MAX_PACKET_BYTES - RTC_MAX_HEADER_BYTES, origin: 'local' })); c.ports.delete(port1);
    if (c.host !== host || !c.active) throw onlineFault('host-lost');
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    c.starting = (async () => {
      const init = await validateCommittedSectorStart(c.seat!.snapshot, committed); check(c);
      c.active = true; c.seat!.snapshot = { ...c.seat!.snapshot, phase: 'active' }; emit({ snapshot: c.seat!.snapshot, phase: 'connecting' });
````

with:

````ts
    c.starting = (async () => {
      const init = await c.mode.validateCommittedStart(c.seat!.snapshot, committed); check(c);
      c.active = true; c.seat!.snapshot = { ...c.seat!.snapshot, phase: 'active' }; emit({ snapshot: c.seat!.snapshot, phase: 'connecting' });
````

In `src/main/network/onlineSession.ts`, replace:

````ts
          if (e.snapshot.hostGeneration <= c.seat!.snapshot.hostGeneration) break;
          sectorInit(e.snapshot);
          if (e.snapshot.roomId !== c.seat!.snapshot.roomId || e.snapshot.runId !== c.seat!.snapshot.runId) throw onlineFault('invalid-frame');
````

with:

````ts
          if (e.snapshot.hostGeneration <= c.seat!.snapshot.hostGeneration) break;
          c.mode.init(e.snapshot);
          if (e.snapshot.roomId !== c.seat!.snapshot.roomId || e.snapshot.runId !== c.seat!.snapshot.runId) throw onlineFault('invalid-frame');
````

In `src/main/network/onlineSession.ts`, replace:

````ts
  function validateRecovery(c: Context, mirror: SessionMirror): Uint8Array {
    validateMirror(mirror, value => validateSectorMirror(value, c.seat!.snapshot.capacity));
    const s = c.seat!.snapshot, m = mirror.metadata;
````

with:

````ts
  function validateRecovery(c: Context, mirror: SessionMirror): Uint8Array {
    validateMirror(mirror, value => c.mode.validateMirror(value, c.seat!.snapshot.capacity));
    const s = c.seat!.snapshot, m = mirror.metadata;
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    if (!config.enabled) throw onlineFault('online-disabled');
    const c: Context = { epoch: ++epoch, abort: new AbortController(), service: deps.service(), removers: [], gameRemovers: [], gameEpoch: 0, ports: new Set(), timers: new Set(), active: false, recovering, attached: new Set() };
    context = c;
````

with:

````ts
    if (!config.enabled) throw onlineFault('online-disabled');
    // The context's mode (H-2 spec §2): the host's from its action, a joiner's from its requested mode (the duel by
    // default), a reconnect's from the saved seat's compatibility (checked again once the credential is loaded).
    const requested = action.type === 'host' || action.type === 'join' ? onlineModeFor(action.mode ?? 'duel', deps.duelTestSeed) : onlineModeFor(saved?.compatibility.modeId ?? 'duel', deps.duelTestSeed);
    const c: Context = { epoch: ++epoch, abort: new AbortController(), service: deps.service(), mode: requested ?? duelOnlineMode(deps.duelTestSeed), removers: [], gameRemovers: [], gameEpoch: 0, ports: new Set(), timers: new Set(), active: false, recovering, attached: new Set() };
    context = c;
````

In `src/main/network/onlineSession.ts`, replace:

````ts
      let seat: SeatSession;
      if (action.type === 'host') seat = await wait(c, c.service.create(sectorCompatibility(action.capacity), action.capacity));
      else if (action.type === 'join') {
        const layouts = sectorJoinCompatibilities();
        try { seat = await wait(c, c.service.join(action.code.trim().toUpperCase(), layouts[0]!)); }
        catch (error) { if (codeOf(error) !== 'incompatible') throw error; seat = await wait(c, c.service.join(action.code.trim().toUpperCase(), layouts[1]!)); }
      } else {
````

with:

````ts
      let seat: SeatSession;
      if (action.type === 'host') {
        const capacity = action.mode === 'sector' ? action.capacity : 2;   // a duel room is always capacity 2
        seat = await wait(c, c.service.create(c.mode.compatibility(capacity), capacity));
      } else if (action.type === 'join') {
        // The duel tries its one compatibility: `incompatible` means a different build. The sector tries each layout.
        const candidates = c.mode.joinCompatibilities();
        let joined: SeatSession | undefined, last: unknown;
        for (const candidate of candidates) {
          try { joined = await wait(c, c.service.join(action.code.trim().toUpperCase(), candidate)); break; }
          catch (error) { if (codeOf(error) !== 'incompatible' || candidate === candidates.at(-1)) throw error; last = error; }
        }
        if (!joined) throw last ?? onlineFault('incompatible');
        seat = joined;
      } else {
````

In `src/main/network/onlineSession.ts`, replace:

````ts
        if (!credential || !validateSavedSeat(credential) || credential.serviceOrigin !== config.baseUrl) throw onlineFault('storage-invalid');
        saved = credential;
        seat = await wait(c, c.service.join(credential.joinCode, credential.compatibility, credential.seatToken));
        if (seat.snapshot.roomId !== credential.roomId || seat.seatId !== credential.seatId || seat.seatToken !== credential.seatToken) throw onlineFault('unauthorized');
      }
      check(c); sectorInit(seat.snapshot); c.seat = seat;
      saved = { version: 1, serviceOrigin: config.baseUrl, roomId: seat.snapshot.roomId, joinCode: seat.snapshot.joinCode, compatibility: seat.snapshot.compatibility,
````

with:

````ts
        if (!credential || !validateSavedSeat(credential) || credential.serviceOrigin !== config.baseUrl) throw onlineFault('storage-invalid');
        const mode = onlineModeFor(credential.compatibility.modeId, deps.duelTestSeed);
        if (!mode) throw onlineFault('storage-invalid');
        saved = credential; c.mode = mode;
        seat = await wait(c, c.service.join(credential.joinCode, credential.compatibility, credential.seatToken));
        if (seat.snapshot.roomId !== credential.roomId || seat.seatId !== credential.seatId || seat.seatToken !== credential.seatToken) throw onlineFault('unauthorized');
      }
      check(c); c.mode.init(seat.snapshot); c.seat = seat;
      saved = { version: 1, serviceOrigin: config.baseUrl, roomId: seat.snapshot.roomId, joinCode: seat.snapshot.joinCode, compatibility: seat.snapshot.compatibility,
````

In `src/main/network/onlineSession.ts`, replace:

````ts
      if (!host || snapshot.phase !== 'lobby' || !snapshot.seats.every(s => !s.occupied || s.ready && s.connected) || !c.peers?.allReady()) throw onlineFault('invalid-state');
      const bytes = Buffer.from(JSON.stringify(sectorInit(snapshot))), expectedRosterRevision = snapshot.rosterRevision;
      const proposal = await wait(c, c.service.request({ type: 'start-propose', expectedRosterRevision, initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex') }));
````

with:

````ts
      if (!host || snapshot.phase !== 'lobby' || !snapshot.seats.every(s => !s.occupied || s.ready && s.connected) || !c.peers?.allReady()) throw onlineFault('invalid-state');
      const bytes = Buffer.from(JSON.stringify(c.mode.init(snapshot, { helmPlayer: action.helmPlayer ?? 0 }))), expectedRosterRevision = snapshot.rosterRevision;
      const proposal = await wait(c, c.service.request({ type: 'start-propose', expectedRosterRevision, initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex') }));
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    if (!validateOnlineAction(action)) return { ok: false, code: 'invalid-action' };
    if (action.type === 'leave' || action.type === 'forget-seat') {
````

with:

````ts
    if (!validateOnlineAction(action)) return { ok: false, code: 'invalid-action' };
    // The sector forms are the test-only entry (H-2 spec §10): refused unless this main process was started for them.
    if ((action.type === 'host' || action.type === 'join') && action.mode === 'sector' && !deps.sectorTestEntry) return { ok: false, code: 'invalid-action' };
    if (action.type === 'leave' || action.type === 'forget-seat') {
````

- [ ] **Step 6: Main's test-only entries, the mode mirrors and the record channel**

In `src/main/index.ts`, replace:

````ts
import { createMirrorStore } from './network/mirrorStore';
import { validateSectorMirror } from './network/onlineSector';
import { createRoomServiceClient } from '../network/session/serviceClient';
import { FULLSCREEN_KEY, WINDOW_FULLSCREEN_CHANNEL } from '../shared/onlineSession';
declare const __FTLITE_PACKAGED_SERVICE_ORIGIN__: string;
````

with:

````ts
import { createMirrorStore } from './network/mirrorStore';
import { validateModeMirror } from './network/onlineModes';
import { appendDuelRecord } from './network/duelRecords';
import { createRoomServiceClient } from '../network/session/serviceClient';
import { DUEL_RECORD_CHANNEL, FULLSCREEN_KEY, WINDOW_FULLSCREEN_CHANNEL } from '../shared/onlineSession';
declare const __FTLITE_PACKAGED_SERVICE_ORIGIN__: string;
````

In `src/main/index.ts`, replace:

````ts
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const owner = createOnlineSession({
    config, seatStore: createSeatStore(app.getPath('userData')), mirrorStore: createMirrorStore(app.getPath('userData'), validateSectorMirror), platform: createOnlinePlatform(win),
    clock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, scheduler,
````

with:

````ts
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  // Test-only entries (H-2 spec §10), honoured only by an unpackaged build, as FTLITE_MODE is: the sector's online forms
  // (FTLITE_SECTOR_ONLINE_TEST=1) and a fixed first duel seed for the forced round end (FTLITE_DUEL_TEST_SEED).
  const sectorTestEntry = !packaged && process.env['FTLITE_SECTOR_ONLINE_TEST'] === '1';
  const testSeed = packaged ? undefined : process.env['FTLITE_DUEL_TEST_SEED'];
  const duelTestSeed = testSeed !== undefined && /^\d{1,10}$/.test(testSeed) && Number(testSeed) <= 0xffffffff ? Number(testSeed) : undefined;
  const owner = createOnlineSession({
    config, seatStore: createSeatStore(app.getPath('userData')), mirrorStore: createMirrorStore(app.getPath('userData'), validateModeMirror), platform: createOnlinePlatform(win),
    sectorTestEntry, duelTestSeed,
    clock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, scheduler,
````

In `src/main/index.ts`, replace:

````ts
  });
  win.on('closed', () => { ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL); });
  // FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view and `duel` the solo duel; the renderer reads it as `?mode=`.
````

with:

````ts
  });
  // The duel playtest record (H-2 spec §8), trusted as the fullscreen channel is: only this window's main frame.
  ipcMain.removeHandler(DUEL_RECORD_CHANNEL);
  ipcMain.handle(DUEL_RECORD_CHANNEL, (event, ...args: unknown[]) => {
    if (win.isDestroyed() || win.webContents.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || args.length !== 1) return false;
    return appendDuelRecord(app.getPath('userData'), args[0]);
  });
  win.on('closed', () => { ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL); ipcMain.removeHandler(DUEL_RECORD_CHANNEL); });
  // FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view and `duel` the solo duel; the renderer reads it as `?mode=`.
````

- [ ] **Step 7: The menu: Host, Join and Swap seats**

In `src/renderer/src/render/sessionMenu.ts`, replace:

````ts
  'incompatible': 'This room needs compatible game content and ship data. Check both versions, then try again.',
````

with:

````ts
  'incompatible': 'The other computer runs a different FTLite build. Install the same build on both, then try again.',
````

In `src/renderer/src/render/sessionMenu.ts`, replace:

````ts
  let recovering = false, leaving = false;   // leaving: Leave was pressed; the idle status that follows returns home
  const { root, document: doc } = deps;
````

with:

````ts
  let recovering = false, leaving = false;   // leaving: Leave was pressed; the idle status that follows returns home
  let swapped = false;   // the duel host's Swap seats toggle (H-2 spec §2): local until Start carries it
  const { root, document: doc } = deps;
````

In `src/renderer/src/render/sessionMenu.ts`, replace:

````ts
    } else if (page === 'host' || page === 'join') {
      const host = page === 'host', form = node('form', '', host ? 'host-form' : 'join-form');
      const label = node('label', host ? 'Crew capacity' : 'Room code');
      const control = doc.createElement(host ? 'select' : 'input') as HTMLInputElement | HTMLSelectElement;
      control.setAttribute('data-testid', host ? 'capacity' : 'join-code'); control.setAttribute('aria-label', host ? 'Crew capacity' : 'Room code');
      control.style.cssText = 'display:block;margin:10px 0;padding:10px;background:#172333;color:#d7e4f0;border:1px solid #52718d;font:inherit';
      if (host) { for (let n = 1; n <= 4; n++) { const option = node('option', `${n} crew — ${n <= 2 ? 'Skiff' : 'Cutter'}`) as HTMLOptionElement; option.value = String(n); control.append(option); } control.value = '2'; }
      else { (control as HTMLInputElement).maxLength = 32; control.setAttribute('autocomplete', 'off'); control.setAttribute('spellcheck', 'false'); }
      label.append(control); form.append(label);
      const submit = button(form, host ? 'create-room' : 'join-room', host ? 'Create room' : 'Join room', () => {}, can(host ? 'host' : 'join')); submit.type = 'submit';
      form.addEventListener('submit', event => { event.preventDefault(); if (pending) return;
        if (host) void invoke(() => deps.api!.host(Number(control.value)));
        else { const code = control.value.trim().toUpperCase(); if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code)) { localError = 'Enter an eight-character room code.'; render(); return; } void invoke(() => deps.api!.join(code)); }
      }); panel.append(form); button(panel, 'back', 'Back', () => { page = 'multiplayer'; localError = ''; render(); }, !pending); control.focus();
    } else {
````

with:

````ts
    } else if (page === 'host' || page === 'join') {
      // Multiplayer is the two-player duel (H-2 spec §2): Host creates a two-seat duel room; Join takes its code.
      const host = page === 'host', form = node('form', '', host ? 'host-form' : 'join-form');
      let control: HTMLInputElement | null = null;
      if (host) form.append(node('p', 'A duel for two: one of you flies the Helm, the other mans Weapons.', 'host-note'));
      else {
        const label = node('label', 'Room code');
        control = doc.createElement('input') as HTMLInputElement;
        control.setAttribute('data-testid', 'join-code'); control.setAttribute('aria-label', 'Room code');
        control.style.cssText = 'display:block;margin:10px 0;padding:10px;background:#172333;color:#d7e4f0;border:1px solid #52718d;font:inherit';
        control.maxLength = 32; control.setAttribute('autocomplete', 'off'); control.setAttribute('spellcheck', 'false');
        label.append(control); form.append(label);
      }
      const submit = button(form, host ? 'create-room' : 'join-room', host ? 'Create room' : 'Join room', () => {}, can(host ? 'host' : 'join')); submit.type = 'submit';
      form.addEventListener('submit', event => { event.preventDefault(); if (pending) return;
        if (host) { swapped = false; void invoke(() => deps.api!.host()); }
        else { const code = control!.value.trim().toUpperCase(); if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code)) { localError = 'Enter an eight-character room code.'; render(); return; } void invoke(() => deps.api!.join(code)); }
      }); panel.append(form); button(panel, 'back', 'Back', () => { page = 'multiplayer'; localError = ''; render(); }, !pending); (control ?? submit).focus();
    } else {
````

In `src/renderer/src/render/sessionMenu.ts`, replace:

````ts
        button(panel, 'ready', ready ? 'Not ready' : 'Ready', () => { void invoke(() => deps.api!.ready(!ready)); }, can('ready'));
        if (status.role === 'host') button(panel, 'start', 'Start', () => { void invoke(() => deps.api!.start()); }, can('start') && !!room?.seats.every(s => !s.occupied || s.ready && s.connected));
      }
````

with:

````ts
        button(panel, 'ready', ready ? 'Not ready' : 'Ready', () => { void invoke(() => deps.api!.ready(!ready)); }, can('ready'));
        // Seats (H-2 spec §2): the host's local Swap seats toggle, carried by Start; the guest learns its console at start.
        const duel = room?.compatibility?.modeId === 'duel', own = status.ownSeat ?? 0;
        if (duel && status.role === 'host') {
          panel.append(node('span', swapped ? 'Guest flies Helm' : 'Host flies Helm', 'seat-plan'));
          button(panel, 'swap-seats', 'Swap seats', () => { swapped = !swapped; render(); }, !pending);
        } else if (duel) panel.append(node('span', 'Host picks seats', 'seat-plan'));
        const helmPlayer = (swapped ? 1 - own : own) as 0 | 1;
        if (status.role === 'host') button(panel, 'start', 'Start', () => { void invoke(() => duel ? deps.api!.start(helmPlayer) : deps.api!.start()); }, can('start') && !!room?.seats.every(s => !s.occupied || s.ready && s.connected));
      }
````

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run tests/onlineDuel.test.ts tests/onlineCoordinator.test.ts tests/onlineRecovery.test.ts tests/onlineIpc.test.ts tests/onlineSessionContract.test.ts tests/onlineBridge.test.ts tests/mainMenu.test.ts tests/sessionMenu.test.ts tests/onlineSector.test.ts tests/onlineMirrors.test.ts`
Expected: PASS, 187 tests in 10 files (`tests/onlineDuel.test.ts` 7, `onlineCoordinator` 34, `onlineRecovery` 32, `onlineIpc` 15, `onlineSessionContract` 58, `onlineBridge` 7, `mainMenu` 10, `sessionMenu` 8).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```
git add src/shared/onlineSession.ts src/main/network/onlineDuel.ts src/main/network/onlineModes.ts src/main/network/onlineSession.ts src/main/network/duelRecords.ts src/main/index.ts src/preload/index.ts src/renderer/src/net/duelRecord.ts src/renderer/src/render/sessionMenu.ts tsconfig.node.json tests/onlineDuel.test.ts tests/onlineCoordinator.test.ts tests/onlineRecovery.test.ts tests/onlineIpc.test.ts tests/onlineSessionContract.test.ts tests/onlineBridge.test.ts tests/mainMenu.test.ts tests/sessionMenu.test.ts
git commit -m "H-2a-iii task 1: the main online mode adapter and the duel's online mode, the actions and seats, the sector test-only gate, the playtest record log"
```

---

### Task 2: The renderer: the scene, the online duel and Single player's rematch

**Files:**
- Create: `src/renderer/src/app/duel/scene.ts`, `src/renderer/src/app/duel/onlineSource.ts`, `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/app/onlineModeSession.ts`, `tests/duelOnlineView.test.ts`
- Replace: `src/renderer/src/app/duel/duelMode.ts`
- Modify: `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/render/duel/endScreen.ts`, `src/renderer/src/render/sessionMenu.ts`, `src/renderer/src/main.ts`
- Modify (tests): `tests/duelReadout.test.ts`, `tests/duelRuntime.test.ts`

**Interfaces:**
- Consumes: H-2a-ii's `createDuelRemoteClient`; Task 1's `DuelPlaytestRecord`, `latencyFigure`, `arrivalJitter`, `menu.leave()`.
- Produces:
  - `scene.ts`: `DuelViewSource`, `SceneOverlay { banner, layerPaused, end, notice? }`, `createDuelScene(renderer, { seed, pauseText })` returning `draw(source, dt, overlay)` and `dispose()`; `DuelScene`.
  - `runtime.ts`: `createCameraInput` exported; `DuelRuntime.seed` is the round's seed and `epoch()` the round.
  - `endScreen.ts`: `endModel(outcome, ticks, prompt)`.
  - `onlineSource.ts`: `ConfirmedDuel`, `duelCounters(t, i)`, `gapEvents(counters, missiles, t)`, `createOnlineDuelSource({ client, seat, now, viewport })` (a `DuelViewSource` plus `observe`, `frame`, `sent`, `arrivals`, `ready`).
  - `onlineDuel.ts`: `OnlineDuelDeps`, `LeavePrompt`, `CLOSED_PROMPT`, `leavePromptKeys(prompt, d, phase, presses)`, `createOnlineDuelSession(deps)` with `attach`, `setStatus`, `setFocused`, `setInputBlocked`, `pause`, `frame`, `dispose`.
  - `onlineModeSession.ts`: `InnerOnlineSession`, `createOnlineModeSession({ duel, sector })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/duelOnlineView.test.ts`:

````ts
// The online duel's view source and the renderer's online session wrapper (H-2 spec §3, §10): interpolation over the
// actual 20 Hz gap, the counter-derived beams, missile endings and sparks against the local runtime's events, the
// online REPAIRING status, the end card's leave prompt across a partner's rematch, and the wrapper choosing the duel or
// sector session by the port descriptor's mode.
import { describe, expect, it, vi } from 'vitest';
import { CLOSED_PROMPT, leavePromptKeys } from '../src/renderer/src/app/duel/onlineDuel';
import { createOnlineDuelSource, gapEvents, duelCounters } from '../src/renderer/src/app/duel/onlineSource';
import { createOnlineModeSession, type InnerOnlineSession } from '../src/renderer/src/app/onlineModeSession';
import { Position } from '../src/renderer/src/sim/components';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { CUTTER_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';
import { createTacticalState, missileOf, Outcome, placeMissile } from '../src/renderer/src/sim/tactical/state';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import type { OnlinePortDescriptor } from '../src/shared/onlineSession';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** A fake confirmed client: `publish` restores a fresh replica from the live duel, as a received publication would. */
function confirmed() {
  let replica: DuelState | null = null, publication: { publicationSequence: number; tick: number; phase: string } | null = null, sequence = 0;
  return {
    client: { state: () => replica, publication: () => publication },
    publish(d: DuelState) {
      const next = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      if (replica) disposeDuel(replica);
      replica = next; publication = { publicationSequence: ++sequence, tick: d.interior.tick, phase: 'running' };
    },
    dispose() { if (replica) disposeDuel(replica); }
  };
}

describe('the online duel view source (spec §3)', () => {
  it('interpolates over the actual tick gap: alpha reaches 1 only when the next publication is due', () => {
    const d = createDuel(CUTTER, 3), c = confirmed();
    let now = 0;
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => now, viewport: { w: 1280, h: 720 } });
    try {
      c.publish(d); source.frame(1 / 60, null, null);
      for (let k = 0; k < 3; k++) stepDuelTick(d, { held: [], commands: [] });
      c.publish(d); source.frame(1 / 60, null, null);
      expect(source.alpha()).toBe(0);
      now += 1000 / 60; source.frame(1 / 60, null, null); expect(source.alpha()).toBeCloseTo(1 / 3, 6);
      now += 1000 / 60; source.frame(1 / 60, null, null); expect(source.alpha()).toBeCloseTo(2 / 3, 6);
      now += 1000 / 60 - 1; source.frame(1 / 60, null, null); expect(source.alpha()).toBeLessThan(1);
      now += 1; source.frame(1 / 60, null, null); expect(source.alpha()).toBe(1);
      now += 30; source.frame(1 / 60, null, null); expect(source.alpha()).toBe(1);   // clamped: a late publication freezes, never extrapolates
    } finally { disposeDuel(d); c.dispose(); }
  });
  it('derives every beam and missile ending exactly once from the counters, with every third tick published and one in five dropped', () => {
    const d = createDuel(CUTTER, 7), pair = createScriptedPair(7), c = confirmed(), local: ViewEvent[] = [], online: ViewEvent[] = [];
    let now = 0, published = 0;
    const source = createOnlineDuelSource({ client: c.client, seat: 1, now: () => now, viewport: { w: 1280, h: 720 } });
    try {
      c.publish(d); source.frame(1 / 60, null, null);
      while (d.tactical.outcome === Outcome.Running && d.interior.tick < 12000) {
        stepDuelTick(d, scriptedInput(pair, d)); local.push(...d.tactical.events); now += 1000 / 60;
        if (d.interior.tick % 3 === 0 && ++published % 5 !== 0) { c.publish(d); source.frame(1 / 60, null, null); online.push(...source.drainEvents()); }
      }
      c.publish(d); source.frame(1 / 60, null, null); online.push(...source.drainEvents());
      const count = (events: ViewEvent[], kind: string, ship: number, hit?: boolean) =>
        events.filter((e) => e.kind === kind && e.ship === ship && (hit === undefined || (e as { hit?: boolean; cause?: string }).hit === hit || (kind === 'missileEnd' && ((e as { cause: string }).cause === 'ship') === hit))).length;
      for (const ship of [0, 1]) {
        expect(count(online, 'laser', ship), `ship ${ship} beams`).toBe(count(local, 'laser', ship));
        expect(count(online, 'laser', ship, true), `ship ${ship} beam hits`).toBe(count(local, 'laser', ship, true));
        expect(count(online, 'missileEnd', ship), `ship ${ship} missile endings`).toBe(count(local, 'missileEnd', ship));
      }
      expect(count(local, 'laser', 0) + count(local, 'laser', 1)).toBeGreaterThan(10);
      expect(count(local, 'missileEnd', 0) + count(local, 'missileEnd', 1)).toBeGreaterThan(0);
    } finally { disposeDuel(d); c.dispose(); }
  }, 60_000);
  it('an ending and a relaunch in one gap: the ending at the old missile, the new one counted launched', () => {
    const before = createTacticalState(4), after = createTacticalState(4);
    placeMissile(before, 0, { x: 100, y: 200, vx: 1, vy: 0, heading: 0, headingAcc: 0, age: 50 });
    placeMissile(after, 0, { x: -300, y: 50, vx: 0, vy: 1, heading: 64, headingAcc: 0, age: 2 });
    after.systems[0].missilesLaunched = before.systems[0].missilesLaunched + 1; after.systems[0].missilesLost = before.systems[0].missilesLost + 1;
    const events = gapEvents([duelCounters(before, 0), duelCounters(before, 1)], [{ x: 100, y: 200, h: 0 }, null], after);
    expect(events).toEqual([{ kind: 'missileEnd', ship: 0, cause: 'expired', target: -1, room: -1, x: 100, y: 200 }]);
    expect(missileOf(after, 0)).not.toBeNull();
  });
  it('shows the other character REPAIRING only while a repair it stands at has progressed since the last publication', () => {
    const d = createDuel(CUTTER, 5), c = confirmed();
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    try {
      // Player 1 stands at the Weapons room's repair point with the room damaged.
      stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } }] });
      const p = CUTTER_REPAIR_POINTS[0]!, eid = d.interior.crew[1]!;
      Position.x[eid] = p.tile[0] + 0.5; Position.y[eid] = p.tile[1] + 0.5; d.tactical.systems[0].rooms[0] = 1;
      c.publish(d); source.frame(1 / 60, null, null);
      expect(source.otherStatus()).toBe('WALKING');
      for (let k = 0; k < 3; k++) stepDuelTick(d, { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: true }], commands: [] });
      c.publish(d); source.frame(1 / 60, null, null);
      expect(d.repair[0]).toBeGreaterThan(0);
      expect(source.otherStatus()).toBe('REPAIRING');
      for (let k = 0; k < 3; k++) stepDuelTick(d, { held: [], commands: [] });
      c.publish(d); source.frame(1 / 60, null, null);
      expect(source.otherStatus()).toBe('WALKING');   // no progress since the last publication
    } finally { disposeDuel(d); c.dispose(); }
  });
});

describe('the online end card leave prompt (spec §7)', () => {
  it('a partner rematch closes an open prompt: Escape in the next round sends setPaused, and no prompt shows', () => {
    const d = createDuel(CUTTER, 3), c = confirmed(), esc = { pause: 1, confirm: 0 }, enter = { pause: 0, confirm: 1 };
    try {
      d.tactical.systems[1].hull = 0; stepDuelTick(d, { held: [], commands: [] });
      c.publish(d);
      const decided = c.client.state()!;
      expect([decided.round, decided.tactical.outcome === Outcome.Running]).toEqual([0, false]);
      // This player presses Escape on the end card: the prompt opens and nothing is sent.
      const opened = leavePromptKeys(CLOSED_PROMPT, decided, 'running', esc);
      expect(opened).toEqual({ prompt: { open: true, round: 0 }, send: null, leave: false });
      expect(leavePromptKeys(opened.prompt, decided, 'running', enter)).toEqual({ prompt: CLOSED_PROMPT, send: null, leave: true });   // Enter there leaves
      // The partner presses Enter: the rematch applies and the next round is published.
      d.present[0] = true;
      const rematch = stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(rematch.map((r) => r.status)).toEqual(['applied']);
      c.publish(d);
      const next = c.client.state()!;
      expect([next.round, next.tactical.outcome]).toEqual([1, Outcome.Running]);
      // Escape now pauses as in play, and the stale prompt is gone (the banner reads prompt.open).
      expect(leavePromptKeys(opened.prompt, next, 'running', esc)).toEqual({ prompt: CLOSED_PROMPT, send: { kind: 'setPaused', paused: true }, leave: false });
      // Without Escape the stale prompt closes too, and Enter does not Leave mid-round.
      expect(leavePromptKeys(opened.prompt, next, 'running', enter)).toEqual({ prompt: CLOSED_PROMPT, send: null, leave: false });
    } finally { disposeDuel(d); c.dispose(); }
  });
});

describe('the online session wrapper (spec §3)', () => {
  const descriptor = (epoch: number, modeId: string): OnlinePortDescriptor => ({ epoch, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1,
    compatibility: { protocolVersion: 2, modeId, schemaVersion: 2, simVersion: 39, contentDigest: 'b'.repeat(64), layoutHash: '00000000' } });
  const inner = (): InnerOnlineSession & { calls: string[] } => {
    const calls: string[] = [];
    return { calls, attach: () => { calls.push('attach'); }, setStatus: () => { calls.push('status'); }, setFocused: (v) => { calls.push(`focused:${v}`); },
      setInputBlocked: (v) => { calls.push(`blocked:${v}`); }, pause: () => { calls.push('pause'); }, frame: () => { calls.push('frame'); }, dispose: () => { calls.push('dispose'); } };
  };
  it('holds no inner session until the first port, builds the mode the descriptor names, replays status, focus and block, and swaps on a mode change', () => {
    const made: ReturnType<typeof inner>[] = [], factories = { duel: vi.fn(() => { const s = inner(); made.push(s); return s; }), sector: vi.fn(() => { const s = inner(); made.push(s); return s; }) };
    const w = createOnlineModeSession(factories), port = { close: vi.fn() } as unknown as MessagePort;
    w.frame(); w.setFocused(false); w.setInputBlocked(true); w.setStatus({ phase: 'syncing' } as never);
    expect(made).toHaveLength(0);
    w.attach(descriptor(1, 'duel'), port);
    expect(factories.duel).toHaveBeenCalledOnce(); expect(w.mode).toBe('duel');
    expect(made[0]!.calls).toEqual(['status', 'focused:false', 'blocked:true', 'attach']);
    w.attach(descriptor(2, 'duel'), port); expect(factories.duel).toHaveBeenCalledOnce();
    w.attach(descriptor(3, 'sector'), port);
    expect(made[0]!.calls.at(-1)).toBe('dispose'); expect(factories.sector).toHaveBeenCalledOnce(); expect(w.mode).toBe('sector');
    w.attach(descriptor(4, 'elsewhere'), port); expect(port.close).toHaveBeenCalled(); expect(w.mode).toBeNull();
    w.dispose();
  });
});
````

The end card's prompt and Single player's rematch:

In `tests/duelReadout.test.ts`, replace:

````ts
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 5)).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 2026)).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: NEW DUEL (SEED 2027)' });
    expect(endModel(Outcome.EnemyWins, 60, 7)!.title).toBe('DEFEAT');
    expect(endModel(Outcome.CrewWins, 60, 2026, true)!.prompt).toBe('ENTER: NEW DUEL (SEED 2027)   M: MAIN MENU');   // inside the app (main menu spec)
    expect(endModel(Outcome.Draw, 60, 7)!.title).toBe('BOTH SHIPS LOST');
  });
````

with:

````ts
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 'ENTER: REMATCH')).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 'ENTER: REMATCH')).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH' });
    expect(endModel(Outcome.EnemyWins, 60, 'ENTER: REMATCH')!.title).toBe('DEFEAT');
    expect(endModel(Outcome.CrewWins, 60, 'ENTER: REMATCH   ESC: LEAVE')!.prompt).toBe('ENTER: REMATCH   ESC: LEAVE');   // online (H-2 spec §7)
    expect(endModel(Outcome.Draw, 60, 'ENTER: REMATCH')!.title).toBe('BOTH SHIPS LOST');
  });
````

In `tests/duelReadout.test.ts`, replace:

````ts
    end.draw(null); expect(end.container.visible).toBe(false);
    end.draw(endModel(Outcome.CrewWins, 600, 5)); expect(end.container.visible).toBe(true);
    end.draw(endModel(Outcome.EnemyWins, 1200, 6));
    expect(count(end.container)).toBe(n0);
````

with:

````ts
    end.draw(null); expect(end.container.visible).toBe(false);
    end.draw(endModel(Outcome.CrewWins, 600, 'ENTER: REMATCH')); expect(end.container.visible).toBe(true);
    end.draw(endModel(Outcome.EnemyWins, 1200, 'ENTER: REMATCH'));
    expect(count(end.container)).toBe(n0);
````

In `tests/duelRuntime.test.ts`, replace:

````ts
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';
````

with:

````ts
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { followingSeed } from '../src/renderer/src/sim/duel/seeds';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';
````

In `tests/duelRuntime.test.ts`, replace:

````ts
  });
  it('the duel ends, stepping stops, and Enter restarts with seed + 1, a fresh tick epoch and the solo start again', () => {
    const { time, rt, press, tick, cleared } = rig(7);
````

with:

````ts
  });
  it('the round ends, the end card keeps ticking, and Enter sends a rematch: the next round in place with the following seed (H-2 spec §7)', () => {
    const { time, rt, press, tick, cleared } = rig(7);
````

In `tests/duelRuntime.test.ts`, replace:

````ts
    expect(rt.ended()).toBe(true);
    const stopped = rt.duel.interior.tick;
    time.advance(1000); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(stopped);
    const old = rt.duel, before = cleared();
    press('confirm'); rt.frame(1 / 60);
    expect(rt.duel).not.toBe(old);
    expect([rt.seed, rt.epoch(), rt.active(), rt.view(), rt.ended()]).toEqual([8, 1, 0, 'helm', false]);
    expect(rt.duel.interior.tick).toBe(0);
    expect(cleared()).toBe(before + 1);
    expect([rt.cameras.helm.targetZoom, rt.cameras.weapons.targetZoom]).toEqual([ZOOM_DEFAULT, ZOOM_DEFAULT]);
    expect(rt.drainEvents()).toEqual([]);
    time.advance(TICK_MS + 0.01); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(1);   // a fresh epoch: no burst for the time spent on the end screen
    expect(rt.lastResults().map((r) => [r.id.player, r.id.sequence, r.tick])).toEqual([[1, 0, 0]]);
    expect(rt.duel.present).toEqual([true, false]);
    rt.dispose();
````

with:

````ts
    expect(rt.ended()).toBe(true);
    const decided = rt.duel.interior.tick;
    time.advance(1000); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(decided + 60);   // the end card's ticks advance; nothing moves
    const duel = rt.duel, before = cleared();
    press('confirm'); tick(); tick();
    expect(rt.duel).toBe(duel);   // the same duel: the next round began in place
    expect([rt.seed, rt.epoch(), rt.active(), rt.view(), rt.ended()]).toEqual([followingSeed(7), 1, 1, 'weapons', false]);   // presence carried: player 1 is still the one at the keyboard
    expect(rt.duel.baseTick).toBeGreaterThan(decided + 60);
    expect(cleared()).toBe(before + 1);
    expect([rt.cameras.helm.targetZoom, rt.cameras.weapons.targetZoom]).toEqual([ZOOM_DEFAULT, ZOOM_DEFAULT]);
    expect(rt.drainEvents()).toEqual([]);
    expect(rt.duel.present).toEqual([false, true]);
    rt.dispose();
````

In `tests/duelRuntime.test.ts`, replace:

````ts

describe('pointer input never survives a Tab or a restart (H-1b impl review)', () => {
  it('Tab: the drag and wheel sampled that frame do not touch the camera now active', () => {
````

with:

````ts

describe('pointer input never survives a Tab or a rematch (H-1b impl review)', () => {
  it('Tab: the drag and wheel sampled that frame do not touch the camera now active', () => {
````

In `tests/duelRuntime.test.ts`, replace:

````ts
  });
  it('restart: the drag and wheel sampled with Enter do not touch the reset camera', () => {
    const { rt, press, pointer, ticks } = rig();
    rt.duel.tactical.outcome = Outcome.CrewWins; ticks(1);
    expect(rt.ended()).toBe(true);
    Object.assign(pointer, { x: 300, y: 200, wheel: 3, dragX: 80, dragY: 40 });
    press('confirm'); rt.frame(1 / 60);
    expect(rt.epoch()).toBe(1);
````

with:

````ts
  });
  it('rematch: the drag and wheel sampled with Enter do not touch the new round camera', () => {
    const { rt, press, pointer, ticks } = rig();
    rt.duel.tactical.systems[1].hull = 0; ticks(3);   // decided, then two end-card ticks: nothing moves, the follow has settled
    expect([rt.ended(), rt.view()]).toEqual([true, 'helm']);
    const active = rt.cameras.helm, before = { cx: active.centreX, cy: active.centreY, tz: active.targetZoom, follow: active.follow };
    Object.assign(pointer, { x: 300, y: 200, wheel: 3, dragX: 80, dragY: 40 });
    press('confirm'); rt.frame(1 / 60);
    // The press frame, before any tick: the sampled drag and wheel are dropped, so the active camera is untouched
    // (freshCameras on the next round would hide a regression here).
    expect({ cx: active.centreX, cy: active.centreY, tz: active.targetZoom, follow: active.follow }).toEqual(before);
    Object.assign(pointer, { wheel: 0, dragX: 0, dragY: 0 }); ticks(2);
    expect(rt.epoch()).toBe(1);
````

Run: `npx vitest run tests/duelOnlineView.test.ts tests/duelReadout.test.ts tests/duelRuntime.test.ts`
Expected: FAIL, 3 files: `src/renderer/src/app/duel/onlineSource.ts` does not exist, the end card still takes a seed, and Enter still restarts.

- [ ] **Step 2: The end card's prompt**

In `src/renderer/src/render/duel/endScreen.ts`, replace:

````ts
 *  the main-menu key when the duel runs inside the app (main menu spec). */
export function endModel(outcome: number, ticks: number, seed: number, menu = false): EndView | null {
  if (outcome === Outcome.Running) return null;
````

with:

````ts
 *  the main-menu key when the duel runs inside the app (main menu spec). */
/** The end card for a decided round: `ticks` is the round's length, `prompt` the keys line (H-2 spec §7: ENTER: REMATCH). */
export function endModel(outcome: number, ticks: number, prompt: string): EndView | null {
  if (outcome === Outcome.Running) return null;
````

In `src/renderer/src/render/duel/endScreen.ts`, replace:

````ts
  const s = Math.floor(ticks / TICK_HZ);
  return { title, tint, length: `DUEL LENGTH ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, prompt: `ENTER: NEW DUEL (SEED ${seed + 1})${menu ? '   M: MAIN MENU' : ''}` };
}
````

with:

````ts
  const s = Math.floor(ticks / TICK_HZ);
  return { title, tint, length: `DUEL LENGTH ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, prompt };
}
````

- [ ] **Step 3: Single player's rematch and quantised axes; the shared camera input**

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras.
import { createTickDriver } from '../../authority/tickDriver';
````

with:

````ts
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras. H-2 spec §3, §7:
// held axes are quantised to −1, 0 or 1 as online, and a decided round's end card keeps ticking until Enter sends the
// same `rematch` command the online duel sends.
import { createTickDriver } from '../../authority/tickDriver';
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts

/** The per-frame camera input shared by both runtimes: zoom keys, drag before wheel (a pan clears the zoom anchor, so a
 *  drag and a wheel in one frame still zoom about the cursor), and the wheel's notch accumulator with its idle reset. */
function createCameraInput(now: () => number, vp: Viewport) {
  let wheelAcc = 0, lastWheelAt = -Infinity;
````

with:

````ts

/** The per-frame camera input shared by the runtimes and the online duel: zoom keys, drag before wheel (a pan clears the
 *  zoom anchor, so a drag and a wheel in one frame still zoom about the cursor), and the wheel's notch accumulator with
 *  its idle reset. */
export function createCameraInput(now: () => number, vp: Viewport) {
  let wheelAcc = 0, lastWheelAt = -Infinity;
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
export interface DuelRuntime {
  /** The duel now running; a restart replaces it. */
  readonly duel: DuelState;
  readonly seed: number;
  /** How many restarts so far: a view that sees it change rebuilds its caches (spec §4 restart). */
  epoch(): number;
````

with:

````ts
export interface DuelRuntime {
  /** The duel now running; a rematch starts its next round in place. */
  readonly duel: DuelState;
  /** The current round's seed. */
  readonly seed: number;
  /** The round (H-2 spec §7): a view that sees it change rebuilds its caches. */
  epoch(): number;
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
  lastResults(): readonly DuelResult[];
  /** True once the duel's outcome is decided: stepping has stopped and Enter restarts (spec §4). */
  ended(): boolean;
````

with:

````ts
  lastResults(): readonly DuelResult[];
  /** True once the round is decided: the end card, where Enter sends a rematch (H-2 spec §7). */
  ended(): boolean;
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  let seed = deps.seed, d = createDuel(deps.layout, seed), epoch = 0;
  let active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
````

with:

````ts
export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  const d = createDuel(deps.layout, deps.seed);
  let round = 0, active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
  const onTick = (_tick: number, tickTimeMs: number): void => {
    if (ended()) return;
    capture();
````

with:

````ts
  const onTick = (_tick: number, tickTimeMs: number): void => {
    capture();
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
    lastTickTime = tickTimeMs;
    if (ended()) pacer.sync();   // the duel is decided: stop stepping (spec §4 End)
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick, ended), cameraInput = createCameraInput(deps.now, deps.viewport);
  const queue = (command: DuelCommand): void => {
````

with:

````ts
    lastTickTime = tickTimeMs;
    if (d.round !== round) newRound();   // the rematch applied: the next round began in place
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick), cameraInput = createCameraInput(deps.now, deps.viewport);
  const queue = (command: DuelCommand): void => {
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts

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
````

with:

````ts

  /** A new round (H-2 spec §7): its seed and presence came with the rematch; the view's state starts again. */
  function newRound(): void {
    round = d.round; pending = []; switching = false; deferred = [];
    activeHeld = NEUTRAL; sentHeld = [NEUTRAL, NEUTRAL]; sentAxes = NO_AXES; sentSteer = 0;
    chargeSent = false; events = []; counts = hitCounts(d);
    capture(); freshCameras(); cameraInput.reset();
    deps.clearKeys?.();
  }
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
    get duel() { return d; },
    get seed() { return seed; },
    get prev() { return prev; },
````

with:

````ts
    get duel() { return d; },
    get seed() { return d.tactical.seed; },
    get prev() { return prev; },
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
    get cameras() { return cameras; },
    epoch: () => epoch,
    active: () => active,
````

with:

````ts
    get cameras() { return cameras; },
    epoch: () => d.round,
    active: () => active,
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
      if (k.presses.menu > 0 && (ended() || pacer.reasons.has('user'))) menuAsked = true;
      // A Tab or a restart changes which camera the pointer would move: this frame's sampled drag and wheel belong to the old one.
      const moved = (): void => { pointer = { ...sampled, wheel: 0, dragX: 0, dragY: 0 }; };
      if (ended()) { if (k.presses.confirm > 0) { restart(); k = IDLE_KEYS(); moved(); } }
      else if (pacer.reasons.size === 0) { if (k.presses.switch > 0) moved(); k = play(k); }   // while paused, gameplay presses are dropped; the camera still moves
      activeHeld = { moveX: k.moveX, moveY: k.moveY, interactHeld: k.interactHeld };
      pacer.sync();   // an Escape this frame pauses before any due tick runs
````

with:

````ts
      if (k.presses.menu > 0 && (ended() || pacer.reasons.has('user'))) menuAsked = true;
      // A Tab or a rematch changes which camera the pointer would move: this frame's sampled drag and wheel belong to the old one.
      const moved = (): void => { pointer = { ...sampled, wheel: 0, dragX: 0, dragY: 0 }; };
      if (ended()) { if (k.presses.confirm > 0 && !pending.some((c) => c.command.kind === 'rematch')) { pending.push({ player: active, command: { kind: 'rematch' } }); k = IDLE_KEYS(); moved(); } }
      else if (pacer.reasons.size === 0) { if (k.presses.switch > 0) moved(); k = play(k); }   // while paused, gameplay presses are dropped; the camera still moves
      activeHeld = { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld };   // quantised as online (H-2 spec §3)
      pacer.sync();   // an Escape this frame pauses before any due tick runs
````

- [ ] **Step 4: The duel scene, and Single player on it**

Create `src/renderer/src/app/duel/scene.ts`:

````ts
// The duel's scene (H-1 spec §3, §4; H-2 spec §3): the console map view (Helm or Weapons) or the interior for the active
// character, the readout column, the effects and shake, the pause banner and the end card, on the renderer's Pixi
// stage with its sector children hidden. It draws from a DuelViewSource: the local runtime (Single player) or the online
// duel source (Multiplayer), so both modes show exactly the same screens.
import { BitmapText, Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { createEndScreen, type EndView } from '../../render/duel/endScreen';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { createReadoutPanel } from '../../render/duel/readoutPanel';
import { readoutHelp, readoutRows, type OtherStatus } from '../../render/duel/readoutModel';
import { createFx, pushEvents, recordTrails, resetFx, shakeOffset, stepFx, type ViewEvent } from '../../render/tactical/fxModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import type { Camera } from '../../render/tactical/camera';
import { FONT_SIZE, TEXT } from '../../render/theme';
import type { DuelState } from '../../sim/duel/state';
import type { Axes } from '../../sim/tactical/state';
import type { DuelView } from './runtime';

/** What the scene reads each frame (H-2 spec §3): the duel, its interpolation inputs, the cameras, the view and the readouts. */
export interface DuelViewSource {
  readonly duel: DuelState;
  readonly seed: number;
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera };
  /** Changes when the view's caches must start again (a new round). */
  epoch(): number;
  active(): 0 | 1;
  view(): DuelView;
  otherStatus(): OtherStatus;
  axes(): Axes;
  steer(): number;
  alpha(): number;
  paused(): boolean;
  drainEvents(): ViewEvent[];
}
/** The frame's overlays: the pause banner (null: none), whether the tactical layer dims for it, the end card, and a
 *  one-line notice (the online start's YOU: HELM). */
export interface SceneOverlay { banner: string | null; layerPaused: boolean; end: EndView | null; notice?: string | null }

export function createDuelScene(renderer: Renderer, options: { seed: number; pauseText: string }) {
  const viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  const hidden = renderer.app.stage.children.filter((child) => child.visible);
  for (const child of hidden) child.visible = false;   // world, enemy window, projectiles, callouts, HUD; shown again on dispose
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: options.seed, pauseText: options.pauseText });
  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale);
  const panel = createReadoutPanel({ fontFamily: font }), end = createEndScreen({ fontFamily: font });
  const banner = new BitmapText({ text: options.pauseText, style: { fontFamily: font, fontSize: FONT_SIZE * 1.5 } });
  banner.tint = TEXT; banner.anchor.set(0.5, 0.5); banner.position.set((INTERNAL_W - READOUT_COLUMN) / 2, 80); banner.visible = false;
  const notice = new BitmapText({ text: '', style: { fontFamily: font, fontSize: FONT_SIZE * 1.5 } });
  notice.tint = TEXT; notice.anchor.set(0.5, 0.5); notice.position.set((INTERNAL_W - READOUT_COLUMN) / 2, 130); notice.visible = false;
  scene.addChild(layer.container, interior.container, panel.container);
  root.addChild(scene, banner, notice, end.container);   // the shake moves the scene; the banners and the end card stay still
  renderer.app.stage.addChild(root);
  const fx = createFx();
  let epoch: number | null = null;
  return {
    /** One frame from `source`; `dt` in seconds. */
    draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): void {
      if (epoch === null) { epoch = source.epoch(); if (source.seed !== options.seed) layer.reseed(source.seed); }   // the online duel learns its seed from the first publication
      if (source.epoch() !== epoch) {   // a new round (a restart before H-2): every view-owned cache starts again
        epoch = source.epoch();
        resetFx(fx); layer.reset(); layer.reseed(source.seed);   // the next round's star field
        interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale); scene.addChildAt(interior.container, 1);
      }
      const d = source.duel, view = source.view(), alpha = source.alpha();
      pushEvents(fx, source.drainEvents());
      stepFx(fx, source.paused() ? 0 : dt);
      recordTrails(fx, d.tactical, source.missilePrev, alpha);
      layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt);
      else {
        const input = {
          state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport, console: view, axes: source.axes(),
          ships: [0, 1], paused: overlay.layerPaused, reserveRight: READOUT_COLUMN, spreadArrows: true, missilePrev: source.missilePrev, steer: source.steer(), fx
        } as const;
        layer.draw(tacticalModel(input), combatModel(input));
      }
      banner.visible = overlay.banner !== null && (view === 'interior' || !overlay.layerPaused);
      if (overlay.banner !== null) banner.text = overlay.banner;
      notice.visible = !!overlay.notice; notice.text = overlay.notice ?? '';
      panel.draw(readoutRows({ duel: d, mode: view, active: source.active(), other: source.otherStatus() }), readoutHelp(view));
      const shake = shakeOffset(fx);
      scene.position.set(shake.x, shake.y);
      end.draw(overlay.end);
    },
    dispose(): void {
      interior.destroy();
      renderer.app.stage.removeChild(root); root.destroy({ children: true });
      for (const child of hidden) child.visible = true;
    }
  };
}
export type DuelScene = ReturnType<typeof createDuelScene>;
````

Replace the whole of `src/renderer/src/app/duel/duelMode.ts` with:

````ts
// The solo duel's boot (H-1 spec §3, §4, §11a): reuses the renderer's Pixi application, stage and letterbox through the
// duel scene (scene.ts, H-2 spec §3), and steps the duel locally with the duel runtime. The sector session is never
// created.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { ShipLayout } from '../../sim/ship/schema';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { endModel } from '../../render/duel/endScreen';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createDuelRuntime } from './runtime';
import { createDuelScene } from './scene';

export interface DuelModeDeps {
  renderer: Renderer;
  seed: number;
  /** The Cutter. */
  layout: ShipLayout;
  /** The preload bridge's suspend and resume hooks, when present; their unsubscribes run on dispose. */
  lifecycle?: { onSuspend(cb: () => void): (() => void) | void; onResume(cb: () => void): (() => void) | void };
  /** Inside the app (main menu spec): M while paused or on the end screen calls this, and the banners show the key. The
   *  caller disposes the duel. Absent for `?mode=duel`, which has no menu to return to. */
  onExit?: () => void;
}

export function startDuelMode(deps: DuelModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H };
  const exitHint = deps.onExit ? '   M: MAIN MENU' : '', pauseText = `PAUSED   ESC: RESUME${exitHint}`;
  const scene = createDuelScene(renderer, { seed: deps.seed, pauseText });
  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  const runtime = createDuelRuntime({
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    sampleKeys: () => keyboard.sample(), samplePointer: () => pointer.sample(),
    clearKeys: () => { keyboard.clear(); pointer.clear(); },
    seed: deps.seed, viewport, layout: deps.layout
  });

  const onBlur = (): void => runtime.pause('blur');
  const onFocus = (): void => runtime.resume('blur');
  const onVisibility = (): void => { if (document.hidden) runtime.pause('hidden'); else runtime.resume('hidden'); };
  window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  const offSuspend = deps.lifecycle?.onSuspend(() => runtime.pause('suspend'));
  const offResume = deps.lifecycle?.onResume(() => runtime.resume('suspend'));

  const frame = (ticker: { deltaMS: number }): void => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    runtime.frame(dt);
    if (deps.onExit && runtime.menuRequested()) { deps.onExit(); return; }   // the caller disposes this duel
    const d = runtime.duel, userPaused = runtime.reasons().has('user');
    const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
    scene.draw(runtime, dt, { banner: userPaused ? pauseText : null, layerPaused: userPaused, end: endModel(d.tactical.outcome, ticks, `ENTER: REMATCH${exitHint}`) });
  };
  renderer.app.ticker.add(frame);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return; disposed = true;
    renderer.app.ticker.remove(frame);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', dispose);
    offSuspend?.(); offResume?.();
    keyboard.destroy(); pointer.destroy(); runtime.dispose(); scene.dispose();
  };
  window.addEventListener('beforeunload', dispose, { once: true });
  return dispose;
}
````

- [ ] **Step 5: The online view source**

Create `src/renderer/src/app/duel/onlineSource.ts`:

````ts
// The online duel's view source (H-2 spec §3): the DuelViewSource the scene draws, built from the stream client's
// confirmed replica at the sender's 20 Hz. Each newly observed publication moves the previous bodies into `prev` and
// starts a new interpolation over the actual tick gap. The per-tick tactical events are not in the snapshot, so beams,
// missile endings and contact sparks are derived from the cumulative counters the snapshot does carry; the sim's own
// `cue` events still bring the sounds. Cameras belong to this machine and never become commands.
import { Position } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import { hx, hy } from '../../sim/tactical/direction';
import { missileOf, NO_AXES, type Axes, type DuelEvent, type Missile, type TacticalState } from '../../sim/tactical/state';
import { LASER_RANGE } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import type { OtherStatus } from '../../render/duel/readoutModel';
import { createCamera, followBody, updateCamera, type Camera, type Viewport } from '../../render/tactical/camera';
import { interpolatedMissile, type ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { repairInReach, seatOf } from './controls';
import { helmAxes, type KeySample, type PointerSample } from './input';
import { createCameraInput, type DuelView } from './runtime';
import type { DuelViewSource } from './scene';

/** What the source reads from its client. */
export interface ConfirmedDuel { state(): DuelState | null; publication(): { publicationSequence: number; tick: number; phase: string } | null }
interface Counters { shots: number; laserHits: number; launched: number; ended: number; missileHits: number; contacts: [number, number, number] }
/** Ship i's cumulative counters, which the snapshot carries. */
export const duelCounters = (t: TacticalState, i: number): Counters => {
  const s = t.systems[i]!, b = t.ships[i]!;
  return { shots: s.shots, laserHits: s.laserHits, launched: s.missilesLaunched, ended: s.missileHits + s.missilesLost, missileHits: s.missileHits, contacts: [b.planetHits, b.asteroidHits, b.shipHits] };
};
const body = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: Missile | null): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);

/**
 * The events of one publication gap (spec §3): each `shots` increment is a beam to the target (a hit when `laserHits`
 * rose) or to arc range along the firing ship's heading; each increment of `missileHits + missilesLost` is a missile
 * ending at the missile's previous position (a hit when `missileHits` rose; a loss draws the neutral burst); each
 * contact counter increment is a spark at the ship. An ending and a relaunch in one gap are told apart because both
 * counters rose: the ending is drawn at the old missile's last position.
 */
export function gapEvents(beforeCounters: readonly Counters[], beforeMissiles: readonly (PrevBody | null)[], t: TacticalState): ViewEvent[] {
  const out: ViewEvent[] = [];
  t.ships.forEach((ship, i) => {
    if (!ship.active) return;
    const was = beforeCounters[i], now = duelCounters(t, i);
    if (!was) return;
    const target = t.systems[i]!.target, tgt = t.ships[target];
    for (let k = 0; k < now.shots - was.shots; k++) {
      const hit = k < now.laserHits - was.laserHits && !!tgt;
      const x2 = hit ? tgt!.x : ship.x + hx(ship.heading) * LASER_RANGE, y2 = hit ? tgt!.y : ship.y + hy(ship.heading) * LASER_RANGE;
      out.push({ kind: 'laser', ship: i, hit, stripped: false, room: -1, x1: ship.x, y1: ship.y, x2, y2 } satisfies DuelEvent);
    }
    const old = beforeMissiles[i];
    for (let k = 0; k < now.ended - was.ended; k++) {
      const hit = k < now.missileHits - was.missileHits, at = old ?? body(ship);
      out.push({ kind: 'missileEnd', ship: i, cause: hit ? 'ship' : 'expired', target: hit ? target : -1, room: -1, x: at.x, y: at.y } satisfies DuelEvent);
    }
    (['planet', 'asteroid', 'ship'] as const).forEach((kind, k) => {
      for (let n = 0; n < now.contacts[k]! - was.contacts[k]!; n++) out.push({ kind: 'contact', ship: i, body: kind, x: ship.x, y: ship.y });
    });
  });
  return out;
}

export interface OnlineDuelSourceDeps { client: ConfirmedDuel; seat: 0 | 1; now(): number; viewport: Viewport }
export function createOnlineDuelSource(deps: OnlineDuelSourceDeps) {
  const { client, seat } = deps;
  let seen = 0, lastTick = -1, gap = 3, receivedAt = 0, round = -1, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [];
  let latest: { bodies: PrevBody[]; missiles: (PrevBody | null)[]; crew: { x: number; y: number }[]; counters: Counters[]; repair: number[] } | null = null;
  let prevRepair: number[] = [0, 0, 0], events: ViewEvent[] = [], sentHeld = { moveX: 0, moveY: 0 };
  let cameras = { helm: createCamera(), weapons: createCamera() };
  const cameraInput = createCameraInput(deps.now, deps.viewport);
  const gaps: number[] = [];
  /** Observe the client: on a new publication, roll the interpolation and derive the gap's events. True when one was new. */
  function observe(): boolean {
    const p = client.publication(), d = client.state();
    if (!p || !d || p.publicationSequence === seen) return false;
    seen = p.publicationSequence;
    const t = d.tactical, now = deps.now();
    if (d.round !== round) {   // the first publication or a new round: no interpolation across it, fresh cameras
      round = d.round; latest = null; lastTick = -1;
      const s = t.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y) }; cameraInput.reset();
    }
    if (latest) events.push(...gapEvents(latest.counters, latest.missiles, t));
    prev = latest ? latest.bodies : t.ships.map(body);
    missilePrev = latest ? latest.missiles : t.ships.map((_, i) => missileBody(missileOf(t, i)));
    // An ending and a relaunch in one gap: the new missile's trail starts where it is now, not at the old one.
    if (latest) t.ships.forEach((_, i) => { const was = latest!.counters[i]; if (was && duelCounters(t, i).ended > was.ended && missileOf(t, i)) missilePrev[i] = missileBody(missileOf(t, i)); });
    crewPrev = latest ? latest.crew : d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
    prevRepair = latest ? latest.repair : [...d.repair];
    gap = lastTick >= 0 ? Math.max(1, p.tick - lastTick) : 3;
    if (lastTick >= 0) { gaps.push(now - receivedAt); if (gaps.length > 4096) gaps.shift(); }
    lastTick = p.tick; receivedAt = now;
    latest = { bodies: t.ships.map(body), missiles: t.ships.map((_, i) => missileBody(missileOf(t, i))), crew: d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })),
      counters: t.ships.map((_, i) => duelCounters(t, i)), repair: [...d.repair] };
    return true;
  }
  const duel = (): DuelState => client.state()!;
  const source: DuelViewSource & {
    observe(): boolean; frame(dt: number, keys: KeySample | null, pointer: PointerSample | null): void; sent(held: { moveX: number; moveY: number }): void;
    arrivals(): readonly number[]; ready(): boolean;
  } = {
    get duel() { return duel(); },
    get seed() { return duel().tactical.seed; },
    get prev() { return prev; },
    get missilePrev() { return missilePrev; },
    get crewPrev() { return crewPrev; },
    get cameras() { return cameras; },
    epoch: () => duel().round,
    active: () => seat,
    view: (): DuelView => { const s = seatOf(duel(), seat); return s === 'standing' ? 'interior' : s; },
    otherStatus(): OtherStatus {
      const d = duel(), other = seat === 0 ? 1 : 0, s = seatOf(d, other);
      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : 'AT WEAPONS';
      const room = repairInReach(d, other);
      return d.present[other] && room >= 0 && d.repair[room]! > prevRepair[room]! ? 'REPAIRING' : 'WALKING';
    },
    axes: (): Axes => (seatOf(duel(), seat) === 'helm' ? helmAxes(sentHeld) : NO_AXES),
    steer: () => (seatOf(duel(), seat) === 'weapons' ? Math.sign(sentHeld.moveX) || 0 : 0),
    alpha: () => frameAlpha,
    paused: () => client.publication()?.phase === 'paused',
    drainEvents() { const out = events; events = []; return out; },
    observe,
    ready: () => !!client.state() && !!client.publication(),
    /** The time since the latest publication over its tick gap, clamped to 0..1 (spec §3: one gap behind, no more). */
    frame(dt, keys, pointer) {
      observe();
      const d = client.state(); if (!d) return;
      frameAlpha = Math.max(0, Math.min(1, (deps.now() - receivedAt) * TICK_HZ / (1000 * gap)));
      const view = seatOf(d, seat), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : null;
      if (cam && keys && pointer) cameraInput.apply(cam, keys, pointer);
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !missileOf(d.tactical, 0)) followBody(c, 'ship');
        const target = c.follow === 'missile' ? interpolatedMissile(d.tactical, missilePrev, frameAlpha, 0) : followTarget(d.tactical, prev, frameAlpha, c.follow);
        updateCamera(c, deps.viewport, dt, target);
      }
    },
    /** The held axes this seat last sent (its own console's predicted path). */
    sent(held) { sentHeld = { moveX: held.moveX, moveY: held.moveY }; },
    /** Publication inter-arrival gaps in milliseconds, for the record's jitter. */
    arrivals: () => gaps
  };
  return source;
}
export type OnlineDuelSource = ReturnType<typeof createOnlineDuelSource>;
````

- [ ] **Step 6: The online duel session**

Create `src/renderer/src/app/duel/onlineDuel.ts`:

````ts
// The online duel session (H-2 spec §3, §7, §8): one machine's renderer in a networked duel. It attaches to the
// authority through the port main hands it (the host's renderer and each guest alike), keeps the duel stream client and
// its view source, draws the same scene as Single player, and turns this seat's keyboard into held frames and commands
// at 60 Hz, independently of Pixi. Keyboard and mouse only; Tab does nothing online (one character per machine). Each
// decided round is written as a playtest record through the preload.
import type { OnlinePortDescriptor, OnlinePreloadApi, OnlineStatus } from '../../../../shared/onlineSession';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { createPortLink } from '../../../../network/portLink';
import { browserPortEndpoint } from '../../../../network/transport/bridge';
import { classifyStreamPacket } from '../../../../network/state/imageCodec';
import { createDuelRemoteClient } from '../../../../network/modes/duelStream';
import type { DuelCommand, Link, Scheduler, Cue } from '../../net/contracts';
import { arrivalJitter, latencyFigure, type DuelPlaytestRecord } from '../../net/duelRecord';
import type { ShipLayout } from '../../sim/ship/schema';
import { loadDuelSnapshot, saveDuelSnapshot } from '../../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../../sim/duel/state';
import type { DuelRoundRecord } from '../../sim/duel/summary';
import { Outcome } from '../../sim/tactical/state';
import { canCharge, canLaunch } from '../../sim/tactical/weapons';
import { computeLetterbox } from '../../render/letterbox';
import { endModel } from '../../render/duel/endScreen';
import { snapBack } from '../../render/tactical/camera';
import type { Renderer } from '../../render/renderer';
import { missileOf } from '../../sim/tactical/state';
import { consoleInReach, cycleLock, repairInReach, seatOf } from './controls';
import { createDuelKeyboard, createPointerSource, emptyPresses, type EventSource, type KeySample } from './input';
import { createOnlineDuelSource, type OnlineDuelSource } from './onlineSource';
import { createDuelScene, type DuelScene } from './scene';

export interface OnlineDuelDeps {
  renderer: Renderer; now(): number; scheduler: Scheduler; contentDigest: string; resolveLayout(id: string): ShipLayout;
  api: Pick<OnlinePreloadApi, 'viewState'>;
  /** Leave the online session as the menu's Leave does (Escape on the end card, then Enter). */
  leave(): void;
  playCue?(cue: Cue): void;
  recordDuel?(record: DuelPlaytestRecord): Promise<boolean> | void;
}
const NOTICE_MS = 3000;
const keysOnly = (k: KeySample): KeySample => ({ ...k, presses: { ...emptyPresses(), zoomIn: k.presses.zoomIn, zoomOut: k.presses.zoomOut } });
/** The session phases a Leave passes through, which show "LEAVING…" over the frozen view rather than CONNECTION LOST. */
const LEAVING_PHASES: readonly string[] = ['saving', 'idle', 'ended'];
/** The end card's leave prompt: open, and the round it was opened on. */
export interface LeavePrompt { open: boolean; round: number }
export const CLOSED_PROMPT: LeavePrompt = { open: false, round: -1 };
/** One pump's Escape and Enter against the leave prompt (spec §7). The prompt lives only on a decided, running round:
 *  a rematch from the partner (a new round), a pause or an undecided replica closes it before Escape is read, so that
 *  Escape then pauses as in play. Returns the next prompt, the command to send (setPaused) and whether to Leave. */
export function leavePromptKeys(prompt: LeavePrompt, d: DuelState, phase: string, presses: { pause: number; confirm: number }): { prompt: LeavePrompt; send: DuelCommand | null; leave: boolean } {
  const decided = d.tactical.outcome !== Outcome.Running;
  let open = prompt.open && decided && phase === 'running' && d.round === prompt.round, round = open ? prompt.round : -1, send: DuelCommand | null = null, leave = false;
  if (presses.pause > 0) {
    if (decided && phase === 'running') { open = !open; round = open ? d.round : -1; }   // on the end card Escape asks to leave
    else if (phase === 'running' || phase === 'paused') { open = false; round = -1; send = { kind: 'setPaused', paused: phase === 'running' }; }
  }
  if (open && presses.confirm > 0) { open = false; round = -1; leave = true; }
  return { prompt: { open, round }, send, leave };
}

export function createOnlineDuelSession(deps: OnlineDuelDeps) {
  const canvas = deps.renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  let client: ReturnType<typeof createDuelRemoteClient> | null = null, link: Link | null = null, source: OnlineDuelSource | null = null, scene: DuelScene | null = null;
  let descriptor: OnlinePortDescriptor | null = null, status: OnlineStatus | null = null;
  let frozen: DuelState | null = null, frozenPublication: { publicationSequence: number; tick: number; phase: string; pauseReason: string | null; pauseOwner: number | null } | null = null;
  let focused = true, blocked = false, synced = false, presenceSent = false, producing = false, disposed = false, leaveConfirm = CLOSED_PROMPT;
  let lastPhase = '', noticeUntil = 0, notice: string | null = null, lastFrame = 0, cameraKeys = keysOnly(sampleIdle());
  let attaches = 0, pauses = 0, roundAttaches = 1, roundPauses = 0, startedAtIso = new Date().toISOString(), chargePressed = false, releaseSentAt = -1, cancel = () => {}, offClose = () => {};
  let lastHeld = { moveX: 0, moveY: 0, interactHeld: false };
  const heldStamps: { sequence: number; at: number }[] = [], commandStamps = new Map<number, number>(), heldSamples: number[] = [], commandSamples: number[] = [];
  function sampleIdle(): KeySample { return { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }; }
  const state = (): DuelState | null => client?.state() ?? frozen;
  const publication = () => client?.publication() ?? frozenPublication;
  function hint(phase: 'synced' | 'running' | 'paused' | 'ended') { if (descriptor) void deps.api.viewState(descriptor.epoch, phase).catch(() => {}); }
  function send(command: DuelCommand): void {
    if (!client || !descriptor) return;
    const id = client.command(descriptor.seatId, command);
    if (id && command.kind !== 'presence') commandStamps.set(id.sequence, deps.now());
  }
  function stopInput(): void {
    if (client && descriptor && producing) {
      client.neutralize(descriptor.seatId);
      const d = client.state();
      if (d && seatOf(d, descriptor.seatId) === 'weapons' && d.tactical.systems[0].fireHeld) send({ kind: 'laserCharge', held: false });   // let go of a held charge
    }
    producing = false; chargePressed = false; keyboard.clear(); pointer.clear();
  }
  function release(): void {
    stopInput(); offClose(); offClose = () => {};
    client?.dispose(); client = null; link?.close('renderer-detached'); link = null;
  }
  function freeze(): void {
    const d = client?.state(), p = client?.publication();
    if (!d || !p || !descriptor) return;
    if (frozen) disposeDuel(frozen);
    frozen = loadDuelSnapshot(deps.resolveLayout(d.interior.layout.id), saveDuelSnapshot(d, deps.contentDigest), deps.contentDigest);
    frozenPublication = { publicationSequence: p.publicationSequence, tick: p.tick, phase: p.phase, pauseReason: p.pauseReason, pauseOwner: p.pauseOwner };
  }
  function record(summary: DuelRoundRecord): void {
    const d = state(); if (!d || !descriptor) return;
    const r: DuelPlaytestRecord = { version: 1, session: 'online', role: status?.role === 'host' ? 'host' : 'guest', transport: status?.role === 'host' ? 'loopback' : null,
      seat: descriptor.seatId as 0 | 1, helmPlayer: d.helmPlayer, seed: summary.seed, round: summary.round, startedAtIso,
      // rttMs is null in H-2a: the renderer's port link has no network RTT (H-2b reads the RTC window's stats).
      summary, latency: { held: latencyFigure(heldSamples), command: latencyFigure(commandSamples), rttMs: null },
      // Per round: the disconnects and pauses since the last record (the first attach is not a disconnect).
      jitter: arrivalJitter(source?.arrivals() ?? []), disconnects: Math.max(0, attaches - roundAttaches), pauses: pauses - roundPauses };
    heldSamples.length = 0; commandSamples.length = 0; roundAttaches = Math.max(1, attaches); roundPauses = pauses; startedAtIso = new Date().toISOString();
    void Promise.resolve(deps.recordDuel?.(r)).catch(() => {});
  }
  function observe(): void {
    if (!client || !descriptor || !source) return;
    const fresh = source.observe(), p = client.publication(), d = client.state();
    if (!p || !d) return;
    if (!synced && client.commandStatus(descriptor.seatId).state === 'ready') {
      synced = true; hint('synced');
      if (!presenceSent) { presenceSent = true; send({ kind: 'presence', present: true }); }   // the first command after every attach (spec §6)
      notice = seatOf(d, descriptor.seatId) === 'helm' ? 'YOU: HELM' : seatOf(d, descriptor.seatId) === 'weapons' ? 'YOU: WEAPONS' : null; noticeUntil = deps.now() + NOTICE_MS;
    }
    if (synced && p.phase !== lastPhase) { if (p.phase === 'paused' && lastPhase === 'running') pauses++; lastPhase = p.phase; if (p.phase !== 'error') hint(p.phase); }
    const now = deps.now();
    if (fresh) while (heldStamps.length && heldStamps[0]!.sequence <= p.heldHighWater[descriptor.seatId]!) heldSamples.push(now - heldStamps.shift()!.at);
    for (const result of client.takeResults()) {
      const at = result.id.player === descriptor.seatId ? commandStamps.get(result.id.sequence) : undefined;
      if (at !== undefined) { commandStamps.delete(result.id.sequence); if (result.status === 'applied') commandSamples.push(now - at); }
    }
    for (const event of client.takeEvents()) {
      if (event.payload.kind === 'cue') deps.playCue?.(event.payload.cue);
      if (event.payload.kind === 'round') record(event.payload.record);
    }
  }
  /** One frame's press edges for this seat, by where its character is (H-1 spec §5 table, without Tab). */
  function play(k: KeySample, d: DuelState, me: number): void {
    const seat = seatOf(d, me), p = k.presses;
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) send({ kind: 'sit', station: c }); }
      return;
    }
    if (p.stand > 0) { if (chargePressed || d.tactical.systems[0].fireHeld) send({ kind: 'laserCharge', held: false }); chargePressed = false; send({ kind: 'stand' }); return; }
    if (seat === 'helm') { if (p.camera > 0 && source) snapBack(source.cameras.helm); return; }
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0 && steps !== 0) {
      let room = d.tactical.systems[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      send({ kind: 'laserLock', room });
    }
    // The truth about a held charge is the confirmed replica plus what this seat sent (spec §3): a lost release is re-sent.
    const held = d.tactical.systems[0].fireHeld, now = deps.now();
    if (p.fireDown > 0 && canCharge(d.tactical, 0)) { send({ kind: 'laserCharge', held: true }); chargePressed = true; }
    if ((p.fireUp > 0 && (chargePressed || held)) || (!k.fireHeld && held && !chargePressed && now - releaseSentAt > 250)) {
      send({ kind: 'laserCharge', held: false }); chargePressed = false; releaseSentAt = now;
    }
    if (p.launch > 0 && canLaunch(d.tactical, 0)) send({ kind: 'missileLaunch' });
    if (p.camera > 0 && source) { const cam = source.cameras.weapons; snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship'); }
  }
  function pump(): void {
    if (disposed) return;
    observe();
    const k = keyboard.sample();
    cameraKeys = { ...cameraKeys, presses: { ...cameraKeys.presses, zoomIn: cameraKeys.presses.zoomIn + k.presses.zoomIn, zoomOut: cameraKeys.presses.zoomOut + k.presses.zoomOut } };
    const d = client?.state(), p = client?.publication();
    if (!client || !d || !p || !descriptor || !synced || !focused || blocked) { if (producing) stopInput(); return; }
    const me = descriptor.seatId, decided = d.tactical.outcome !== Outcome.Running;
    // Escape and the leave prompt (spec §7): a prompt from a round that is no longer decided and running closes first.
    const keys = leavePromptKeys(leaveConfirm, d, p.phase, k.presses);
    leaveConfirm = keys.prompt;
    if (keys.send) send(keys.send);
    if (keys.leave) deps.leave();
    if (leaveConfirm.open || keys.leave) { producing = true; client.held(me, { moveX: 0, moveY: 0, interactHeld: false }); return; }
    if (p.phase !== 'running') return;
    if (decided) { if (k.presses.confirm > 0) send({ kind: 'rematch' }); }
    else play(k, d, me);
    // Held input every pump, quantised to −1, 0 and 1 (spec §3); a change is stamped for the held delay.
    const held = { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld };
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null && !decided && (held.moveX !== lastHeld.moveX || held.moveY !== lastHeld.moveY || held.interactHeld !== lastHeld.interactHeld)) {
      heldStamps.push({ sequence, at: deps.now() }); if (heldStamps.length > 64) heldStamps.shift();
    }
    if (!decided) { lastHeld = held; source?.sent(held); }
    producing = true;
  }
  function schedule(): void { cancel = deps.scheduler.schedule(1000 / 60, () => { pump(); if (!disposed) schedule(); }); }
  schedule();
  function bannerText(): string | null {
    const p = publication();
    // A deliberate Leave (the end card's or the menu's button) saves, then goes idle or ended: no reconnect is coming.
    if (!client && frozen) return status && LEAVING_PHASES.includes(status.phase) ? 'LEAVING…' : 'CONNECTION LOST — RECONNECTING';
    if (leaveConfirm.open) return 'LEAVE THE DUEL?   ENTER: LEAVE   ESC: STAY';
    if (p?.phase !== 'paused') return null;
    const reason = (p as { pauseReason?: string | null }).pauseReason, owner = (p as { pauseOwner?: number | null }).pauseOwner;
    const why = reason === 'player' && owner !== null && owner !== undefined ? `PAUSED BY PLAYER ${owner + 1}` : reason === 'peer-lost' ? 'PARTNER LOST' : 'PAUSED';
    return `${why}   ESC: RESUME`;
  }
  return {
    attach(next: OnlinePortDescriptor, port: MessagePort): void {
      if (disposed || next.epoch <= (descriptor?.epoch ?? 0)) { port.close(); return; }
      observe(); release();
      descriptor = next; synced = false; presenceSent = false; lastPhase = ''; leaveConfirm = CLOSED_PROMPT; attaches++;
      heldStamps.length = 0; commandStamps.clear();   // the new client restarts its sequences: an old stamp would match a new frame
      scene ??= createDuelScene(deps.renderer, { seed: 0, pauseText: 'PAUSED' });
      link = createPortLink(browserPortEndpoint(port), `online:${next.seatId}`, { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
      // Subscribe before the client, which releases its replica on close: keep the last view frozen.
      offClose = link.onClose(() => { freeze(); stopInput(); });
      client = createDuelRemoteClient(link, [next.seatId], { runId: next.runId, contentDigest: deps.contentDigest, resolveLayout: deps.resolveLayout, clock: { nowMs: deps.now } });
      source = createOnlineDuelSource({ client: { state, publication }, seat: next.seatId as 0 | 1, now: deps.now, viewport: { w: INTERNAL_W, h: INTERNAL_H } });
    },
    setStatus(next: OnlineStatus): void {
      status = next;
      if (['error', 'reconnecting', 'saved', 'saving', 'rehosting', 'idle', 'ended'].includes(next.phase) && client) { observe(); freeze(); release(); }
    },
    setFocused(value: boolean): void { if (focused === value) return; focused = value; if (!value) stopInput(); },
    setInputBlocked(value: boolean): void { if (blocked === value) return; blocked = value; if (value) stopInput(); },
    pause(): void { const p = client?.publication(); if (focused && synced && client && p && (p.phase === 'running' || p.phase === 'paused')) send({ kind: 'setPaused', paused: p.phase === 'running' }); },
    frame(): void {
      if (disposed || !scene || !source) return;
      const now = deps.now(), dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60; lastFrame = now;
      const d = state(); if (!d) return;
      source.frame(dt, focused && !blocked ? cameraKeys : null, focused && !blocked ? pointer.sample() : null);
      cameraKeys = keysOnly(sampleIdle());
      const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
      scene.draw(source, dt, { banner: bannerText(), layerPaused: false, end: endModel(d.tactical.outcome, ticks, 'ENTER: REMATCH   ESC: LEAVE'), notice: now < noticeUntil ? notice : null });
    },
    dispose(): void {
      if (disposed) return; disposed = true; cancel(); release();
      keyboard.destroy(); pointer.destroy(); scene?.dispose(); scene = null;
      if (frozen) disposeDuel(frozen); frozen = null;
    }
  };
}
export type OnlineDuelSession = ReturnType<typeof createOnlineDuelSession>;
````

- [ ] **Step 7: The online session wrapper, the router's factory and the menu's Leave**

Create `src/renderer/src/app/onlineModeSession.ts`:

````ts
// The renderer's online session wrapper (H-2 spec §3): the router builds it before any port exists, and it builds the
// mode's own session on the first attach, from the descriptor's compatibility: the online duel or today's sector
// session. A later descriptor of another mode replaces the inner session (and its frozen view). The latest status,
// focus and input-block values are replayed into each new inner session.
import type { OnlinePortDescriptor, OnlineStatus } from '../../../shared/onlineSession';

export interface InnerOnlineSession {
  attach(descriptor: OnlinePortDescriptor, port: MessagePort): void;
  setStatus(status: OnlineStatus): void; setFocused(value: boolean): void; setInputBlocked(value: boolean): void;
  pause(): void; frame(): void; dispose(): void;
}
export function createOnlineModeSession(factories: { duel(): InnerOnlineSession; sector(): InnerOnlineSession }) {
  let inner: InnerOnlineSession | null = null, mode: string | null = null, status: OnlineStatus | null = null;
  let focused = true, blocked = false, disposed = false;
  return {
    get mode() { return mode; },
    attach(descriptor: OnlinePortDescriptor, port: MessagePort): void {
      if (disposed) { port.close(); return; }
      const next = descriptor.compatibility.modeId;
      if (next !== mode || !inner) {
        inner?.dispose(); inner = null; mode = null;
        if (next !== 'duel' && next !== 'sector') { port.close(); return; }
        inner = next === 'duel' ? factories.duel() : factories.sector(); mode = next;
        if (status) inner.setStatus(status);
        inner.setFocused(focused); inner.setInputBlocked(blocked);
      }
      inner.attach(descriptor, port);
    },
    setStatus(next: OnlineStatus): void { status = next; inner?.setStatus(next); },
    setFocused(value: boolean): void { focused = value; inner?.setFocused(value); },
    setInputBlocked(value: boolean): void { blocked = value; inner?.setInputBlocked(value); },
    pause(): void { inner?.pause(); },
    frame(): void { inner?.frame(); },
    dispose(): void { if (disposed) return; disposed = true; inner?.dispose(); inner = null; mode = null; }
  };
}
````

In `src/renderer/src/main.ts`, replace:

````ts
import { createOnlineRendererSession } from './app/onlineSession';
import { createSessionRouter } from './app/sessionRouter';
````

with:

````ts
import { createOnlineRendererSession } from './app/onlineSession';
import { createOnlineModeSession } from './app/onlineModeSession';
import { createOnlineDuelSession } from './app/duel/onlineDuel';
import { createSessionRouter } from './app/sessionRouter';
````

In `src/renderer/src/main.ts`, replace:

````ts
  const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;
  let online: ReturnType<typeof createOnlineRendererSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
````

with:

````ts
  const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;
  let online: ReturnType<typeof createOnlineModeSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
````

In `src/renderer/src/main.ts`, replace:

````ts
    },
    online: () => {
      online = createOnlineRendererSession({ sampleDevices: keyboard.sample, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
        resolveLayout: id => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; },
        api: bridge!, playCue: audio.play });
      if (status) online.setStatus(status); online.setInputBlocked(blocked); return online;
````

with:

````ts
    },
    // Multiplayer (H-2 spec §3): the wrapper builds the duel's or the sector's session when the first port arrives.
    online: () => {
      const resolveLayout = (id: string) => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; };
      online = createOnlineModeSession({
        duel: () => createOnlineDuelSession({ renderer, now: () => performance.now(), scheduler, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout, api: bridge!,
          leave: () => menu?.leave(), playCue: audio.play, recordDuel: record => window.ftlite?.recordDuel?.(record) }),
        sector: () => createOnlineRendererSession({ sampleDevices: keyboard.sample, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
          resolveLayout, api: bridge!, playCue: audio.play })
      });
      if (status) online.setStatus(status); online.setInputBlocked(blocked); return online;
````

In `src/renderer/src/render/sessionMenu.ts`, replace:

````ts
      if (status?.actions.includes('forget-seat')) button(panel, 'forget-seat', 'Forget saved seat', () => { void invoke(() => deps.api!.forgetSeat(), false, true); }, !!deps.api);
      if (status?.actions.includes('leave')) button(panel, 'leave', status.phase === 'ended' ? 'Return to menu' : 'Leave', () => { leaving = true; void invoke(() => deps.api!.leave(), false, true).then(() => { if (status?.phase === 'idle' && page === 'session') { leaving = false; deps.home?.(); hadView = false; page = 'home'; render(); } }); }, !!deps.api);
      if (!pending && status?.actions.includes('join')) button(panel, 'try-code', 'Try another code', () => { hadView = false; page = 'join'; render(); });
      if (!pending && (!status || status.phase === 'idle' || status.phase === 'error')) button(panel, 'home', 'Return to menu', () => { deps.home?.(); hadView = false; page = 'home'; render(); });
    }
  }
````

with:

````ts
      if (status?.actions.includes('forget-seat')) button(panel, 'forget-seat', 'Forget saved seat', () => { void invoke(() => deps.api!.forgetSeat(), false, true); }, !!deps.api);
      if (status?.actions.includes('leave')) button(panel, 'leave', status.phase === 'ended' ? 'Return to menu' : 'Leave', leave, !!deps.api);
      if (!pending && status?.actions.includes('join')) button(panel, 'try-code', 'Try another code', () => { hadView = false; page = 'join'; render(); });
      if (!pending && (!status || status.phase === 'idle' || status.phase === 'error')) button(panel, 'home', 'Return to menu', () => { deps.home?.(); hadView = false; page = 'home'; render(); });
    }
  }
  /** Leave (the Leave button, and the online duel's confirmed Escape on its end card, H-2 spec §7). */
  function leave() {
    if (!deps.api || !status?.actions.includes('leave')) return;
    leaving = true; void invoke(() => deps.api!.leave(), false, true).then(() => { if (status?.phase === 'idle' && page === 'session') { leaving = false; deps.home?.(); hadView = false; page = 'home'; render(); } });
  }
````

In `src/renderer/src/render/sessionMenu.ts`, replace:

````ts
    windowResized() { if (page === 'settings') readFullscreen(); },
    /** Single player has ended (M in the duel): show the main menu again. */
````

with:

````ts
    windowResized() { if (page === 'settings') readFullscreen(); },
    leave,
    /** Single player has ended (M in the duel): show the main menu again. */
````

- [ ] **Step 8: Run the tests, the typecheck and the build**

Run: `npx vitest run tests/duelOnlineView.test.ts tests/duelReadout.test.ts tests/duelRuntime.test.ts tests/duelInput.test.ts tests/duelControls.test.ts tests/mainMenu.test.ts tests/sessionMenu.test.ts tests/onlineRenderer.test.ts`
Expected: PASS, 82 tests in 8 files (`tests/duelOnlineView.test.ts` 6, `duelReadout` 8, `duelRuntime` 26).

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 9: Commit**

```
git add src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/onlineModeSession.ts src/renderer/src/main.ts src/renderer/src/render/sessionMenu.ts src/renderer/src/render/duel/endScreen.ts tests/duelReadout.test.ts tests/duelRuntime.test.ts tests/duelOnlineView.test.ts
git commit -m "H-2a-iii task 2: the duel scene from a view source; the online duel session and source; the online session wrapper; Single player's rematch and quantised axes"
```

---

### Task 3: The smokes

**Files:**
- Create: `scripts/network/duel-app-observer.ts`, `scripts/network/duel-app-smoke.ts`
- Modify: `scripts/network/online-app-smoke.cjs`, `scripts/network/online-app-smoke.ts`, `scripts/network/online-recovery-smoke.ts`, `package.json`, `tests/networkBoundary.test.ts`

**Interfaces:**
- Produces: the driver requests `host-sector { capacity }` and `join-sector { code }`; `npm run test:duel-app-runtime` (`electron-vite build && tsx scripts/network/duel-app-smoke.ts`, report at `out/h2a-duel-app/duel-app.json` unless `--report-path=` is given); `DUEL_TEST_SEED` (2277).

- [ ] **Step 1: The sector's test-only entry in the driver and the sector smokes**

In `scripts/network/online-app-smoke.cjs`, replace:

````js
    case 'open-multiplayer': await click('multiplayer'); return true;
    case 'type': await click(message.id); visible.webContents.insertText(message.text); return true;
````

with:

````js
    case 'open-multiplayer': await click('multiplayer'); return true;
    // The sector's test-only entry (H-2 spec §10): the menu offers only the duel, so the sector runs host and join through
    // the preload's sector forms, which main honours only with FTLITE_SECTOR_ONLINE_TEST=1 in an unpackaged build.
    case 'host-sector': if (!Number.isSafeInteger(message.capacity)) throw Error('invalid test capacity');
      await js(`void window.ftlite.online.host({mode:'sector',capacity:${message.capacity}}); true`); return true;
    case 'join-sector': if (!/^[0-9A-Z]{8}$/.test(String(message.code))) throw Error('invalid test code');
      await js(`void window.ftlite.online.join(${JSON.stringify(message.code)},'sector'); true`); return true;
    case 'type': await click(message.id); visible.webContents.insertText(message.text); return true;
````

In `scripts/network/online-app-smoke.cjs`, replace:

````js
app.on('before-quit', event => { if(stopping) event.preventDefault(); });
const diagnosticCommands=new Set(['status','click','open-multiplayer','type','capacity','key','focus','blur','resize','layout','screenshot','resources','resource-counts','transport-death','delay-next-transport','shutdown','delay-exit-commit','hold-upload','hold-restore','release-restore','block-next-grant','suspend-hook']);
let ignoreDriver=false;
````

with:

````js
app.on('before-quit', event => { if(stopping) event.preventDefault(); });
const diagnosticCommands=new Set(['status','click','open-multiplayer','host-sector','join-sector','type','capacity','key','focus','blur','resize','layout','screenshot','resources','resource-counts','transport-death','delay-next-transport','shutdown','delay-exit-commit','hold-upload','hold-restore','release-restore','block-next-grant','suspend-hook']);
let ignoreDriver=false;
````

In `scripts/network/online-app-smoke.ts`, replace:

````ts
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
````

with:

````ts
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    // The sector runs through the test-only entry (H-2 spec §10): the menu's Multiplayer is the duel.
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_SECTOR_ONLINE_TEST: '1', NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
````

In `scripts/network/online-app-smoke.ts`, replace:

````ts
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  async function host(app: Application, capacity: number) { await app.request('open-multiplayer'); await app.request('click', { id: 'host' }); if (capacity !== 2) await app.request('capacity', { value: capacity }); await app.request('click', { id: 'create-room' }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('open-multiplayer'); await app.request('click', { id: 'join' }); await app.request('type', { id: 'join-code', text: code }); await app.request('click', { id: 'join-room' }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
````

with:

````ts
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  async function host(app: Application, capacity: number) { await app.request('host-sector', { capacity }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('join-sector', { code }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
````

In `scripts/network/online-app-smoke.ts`, replace:

````ts
    assert(changed>=3,'incompatible compiled variant missing');
    const incompatible=await launch('incompatible'); await incompatible.request('open-multiplayer'); await incompatible.request('click',{id:'join'});
    await incompatible.request('type',{id:'join-code',text:lobby.status.snapshot.joinCode}); await incompatible.request('click',{id:'join-room'});
    const mismatch=await phase(incompatible,'error'), mismatchResources=await incompatible.request('resources');
````

with:

````ts
    assert(changed>=3,'incompatible compiled variant missing');
    const incompatible=await launch('incompatible'); await incompatible.request('join-sector',{code:lobby.status.snapshot.joinCode});
    const mismatch=await phase(incompatible,'error'), mismatchResources=await incompatible.request('resources');
````

In `scripts/network/online-app-smoke.ts`, replace:

````ts
    checks.push('incompatible'); await shutdown(incompatible);
    await g.request('delay-next-transport'); await g.request('open-multiplayer'); await g.request('click',{id:'join'}); await g.request('type',{id:'join-code',text:lobby.status.snapshot.joinCode});
    await g.request('click',{id:'join-room'}); await phase(g,'joining'); await g.request('click',{id:'leave'}); await phase(g,'idle');
    await g.request('click',{id:'single-player'}); await delay(1300);
````

with:

````ts
    checks.push('incompatible'); await shutdown(incompatible);
    await g.request('delay-next-transport'); await g.request('join-sector',{code:lobby.status.snapshot.joinCode});
    await phase(g,'joining'); await g.request('click',{id:'leave'}); await phase(g,'idle');
    await g.request('click',{id:'single-player'}); await delay(1300);
````

In `scripts/network/online-recovery-smoke.ts`, replace:

````ts
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
````

with:

````ts
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_SECTOR_ONLINE_TEST: '1', NODE_PATH:resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL;
````

In `scripts/network/online-recovery-smoke.ts`, replace:

````ts
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  async function host(app: Application, capacity: number) { await app.request('open-multiplayer'); await app.request('click', { id: 'host' }); if (capacity !== 2) await app.request('capacity', { value: capacity }); await app.request('click', { id: 'create-room' }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('open-multiplayer'); await app.request('click', { id: 'join' }); await app.request('type', { id: 'join-code', text: code }); await app.request('click', { id: 'join-room' }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
````

with:

````ts
  const phase = (app: Application, value: string) => until(() => status(app), r => r.status.phase === value, `${app.profile} ${value}`);
  // The sector's test-only entry (H-2 spec §10).
  async function host(app: Application, capacity: number) { await app.request('host-sector', { capacity }); return phase(app, 'lobby'); }
  async function joinRoom(app: Application, code: string) { await app.request('join-sector', { code }); return phase(app, 'lobby'); }
  async function kill(app: Application) {
````

- [ ] **Step 2: The main modes' adapters may read renderer contracts**

In `tests/networkBoundary.test.ts`, replace:

````ts
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts', 'modes/remoteClient.ts', 'modes/duelProducers.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => relative('src/main/network', file).replaceAll('\\', '/') !== 'onlineSector.ts')]) {
    it(`${relative(resolve('.'), resolve(file))} imports only generic runtime contracts`, () => {
````

with:

````ts
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts', 'modes/remoteClient.ts', 'modes/duelProducers.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
    ...walk('src/main/network').filter(file => !['onlineSector.ts', 'onlineDuel.ts', 'duelRecords.ts'].includes(relative('src/main/network', file).replaceAll('\\', '/')))]) {   // the main modes' adapters may read renderer contracts (H-2)
    it(`${relative(resolve('.'), resolve(file))} imports only generic runtime contracts`, () => {
````

Run: `npx vitest run tests/networkBoundary.test.ts tests/onlineAppDiagnostics.test.ts tests/onlineAppClick.test.ts tests/onlineAppReport.test.ts tests/onlineAppRuntime.test.ts`
Expected: PASS, 87 tests in 5 files.

- [ ] **Step 3: The duel's passive observer and the duel application smoke**

Create `scripts/network/duel-app-observer.ts`:

````ts
// TEST ONLY: injected by the duel application gate (H-2 spec §10), never imported by product. Passive copies of the
// renderer's port traffic: every received duel state image is decoded to the values the gate reads (the round, its
// outcome, the crew ship's speed, the laser shots, presence, the phase and the hash), every sent input is listed, and
// results are kept. No client, ACK, command or producer of its own.
import { classifyStreamPacket, decodeControl, decodeOpaquePacket, decodeState, decodeStatePacket, ImageStore, inspectState } from '../../src/network/state/imageCodec';
import { imageToDuelPublication } from '../../src/network/modes/duelStream';
import { duelCodec } from '../../src/renderer/src/net/codec';
import { duelRoundOf } from '../../src/renderer/src/sim/duel/snapshot';
import { TACTICAL_MODULES, tacticalLength } from '../../src/renderer/src/sim/tactical/hash';
import { createTacticalState } from '../../src/renderer/src/sim/tactical/state';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';

const layout = parseShip(cutter), codec = duelCodec(2);
const offsets = new Map<number, { at: Map<string, number>; presence: number }>();
function named(seed: number) {
  let o = offsets.get(seed);
  if (!o) {
    const shape = createTacticalState(seed), at = new Map<string, number>(); let k = 1;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) { at.set(f.name, k); k += f.count; }
    o = { at, presence: 1 + tacticalLength(shape) }; offsets.set(seed, o);
  }
  return o;
}
const sessions: any[] = [];
const target = window as any;
target.onlineAppKeys = [];
for (const type of ['keydown', 'keyup', 'focus', 'blur']) window.addEventListener(type, (event: any) => {
  target.onlineAppKeys.push({ type, code: event.code, key: event.key, target: event.target?.tagName, hidden: document.hidden, focused: document.hasFocus() });
  if (target.onlineAppKeys.length > 32) target.onlineAppKeys.shift();
});
window.addEventListener('message', event => {
  if (event.source !== window || event.data?.source !== 'ftlite:online:main' || event.ports.length !== 1) return;
  const port = event.ports[0]!, images = new ImageStore();
  const record: any = { descriptor: event.data.descriptor, publications: [], inputs: [], results: [], acks: 0, fullReceipts: 0,
    firstAckOrder: 0, firstInputOrder: 0, closed: false, errors: 0, order: 0 };
  sessions.push(record);
  function observe(data: any, incoming: boolean) {
    try {
      if (data?.type === 'close') { record.closed = true; return; }
      if (data?.type !== 'data') return;
      const bytes = new Uint8Array(data.bytes), metadata = classifyStreamPacket(bytes); record.order++;
      if (metadata.stream === 'state-control') {
        const control = decodeControl(bytes);
        if (control.kind === 'ack') { record.acks++; record.firstAckOrder ||= record.order; }
        if (control.kind === 'full-received') record.fullReceipts++;
      } else if (incoming && metadata.stream === 'state') {
        const payload = decodeStatePacket(bytes), header = inspectState(payload), image = decodeState(payload, images.get(header.baseSequence));
        images.put(image, header.baseSequence ? [header.baseSequence] : []);
        const p = imageToDuelPublication(image, { resolveLayout: () => layout, contentDigest: '' }, false), v = p.snapshot.values, n = named(p.snapshot.header.seed);
        const round = duelRoundOf(p.snapshot), vx = v[n.at.get('ships.0.vx')!]!, vy = v[n.at.get('ships.0.vy')!]!;
        record.publications.push({ runId: p.runId, tick: p.tick, sequence: p.publicationSequence, hash: p.hash, phase: p.phase, pauseReason: p.pauseReason,
          round: round.round, outcome: round.outcome, helmPlayer: round.helmPlayer, seed: p.snapshot.header.seed, speed: Math.sqrt(vx * vx + vy * vy),
          shots: v[n.at.get('systems.0.shots')!]!, present: [v[n.presence]!, v[n.presence + 1]!], heldHighWater: p.heldHighWater, commandHighWater: p.commandHighWater });
        if (record.publications.length > 256) record.publications.shift();
      } else if (!incoming && metadata.class === 'input') {
        const message: any = codec.decodeMessage(decodeOpaquePacket(bytes).bytes);
        record.firstInputOrder ||= record.order;
        record.inputs.push({ kind: message.kind, player: message.frame?.player ?? message.envelope?.id.player ?? message.player,
          sequence: message.frame?.sequence ?? message.envelope?.id.sequence ?? message.sequence,
          held: message.frame?.held, command: message.envelope?.command.kind, present: message.envelope?.command.present, reliable: data.kind === 'reliable-ordered', order: record.order });
        if (record.inputs.length > 512) record.inputs.shift();
      } else if (incoming && metadata.stream === 'duel-notification') {
        const message: any = codec.decodeMessage(decodeOpaquePacket(bytes).bytes.subarray(9));
        if (message.kind === 'result') { record.results.push(message.result); if (record.results.length > 128) record.results.shift(); }
      }
    } catch { record.errors++; }
  }
  const post = port.postMessage.bind(port), close = port.close.bind(port);
  port.postMessage = ((data: unknown, ...args: any[]) => { observe(data, false); return (post as any)(data, ...args); }) as any;
  port.close = () => { record.closed = true; port.removeEventListener('message', receive); images.clear(); close(); };
  const receive = (message: MessageEvent) => observe(message.data, true);
  port.addEventListener('message', receive);
});
target.onlineAppObservation = () => structuredClone(sessions);
````

Create `scripts/network/duel-app-smoke.ts`:

````ts
// `npm run test:duel-app-runtime` (H-2 spec §10): the online duel through the real application. Two Electron processes
// with separate temporary userData, against local workerd through Net-3d's harness and driver entry. Through the menu,
// Multiplayer → Host, Join by the displayed code, ready, Swap seats once, start. Round 1 is the forced round end: a
// test-only first seed (FTLITE_DUEL_TEST_SEED) whose round is decided on tick 1471 when nobody flies or fires, so in it
// both players only stand up and sit down again (their records' command samples); then Enter starts round 2 on both,
// and a duel-*.jsonl with latency figures is on both machines. In round 2 the Helm (the guest) holds W for 2 s and the
// ship's speed rises on both screens; Weapons (the host) presses and releases Space and a beam is fired on both; both
// renderers agree on a hash at a common publication; the guest is killed and restarted (presence false and the host
// paused for the lost partner, then the rejoin, its ACK before any input and its presence true, then an Escape
// unpause). Exact temporary roots are cleaned; Electron and workerd are never killed globally.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import electron from 'electron';
import { build } from 'vite';
import { computeContentDigest } from '../../build/contentDigest';
import { startOnlineAppRuntime } from './online-app-runtime';

/** The test-only first seed: with no flight or weapon input its first round is decided on tick 1471, about 25 s of play,
 *  whoever is seated or away (found by search, H-2a plan). */
export const DUEL_TEST_SEED = 2277;
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
type Application = { child: ChildProcess; pid: number; profile: string; exited: boolean; exit: Promise<void>; request(command: string, data?: object): Promise<any> };

async function main() {
  const began = performance.now(), directory = mkdtempSync(join(tmpdir(), 'ftlite-duel-app-'));
  const reportPath = resolve(process.argv.find(a => a.startsWith('--report-path='))?.slice(14) ?? 'out/h2a-duel-app/duel-app.json');
  mkdirSync(resolve(reportPath, '..'), { recursive: true });
  const digest = computeContentDigest(process.cwd()), processes: Application[] = [], proof: Record<string, unknown> = {};
  const deadline = new AbortController(), watchdog = setTimeout(() => deadline.abort(), 180000);
  let runtime: ReturnType<typeof startOnlineAppRuntime> | undefined, failure: string | undefined, step = 'startup';
  async function until<T>(read: () => Promise<T>, predicate: (value: T) => boolean, label: string, ms = 15000): Promise<T> {
    const end = performance.now() + ms; let last: T | undefined;
    while (performance.now() < end) { if (deadline.signal.aborted) throw Error('launcher timeout'); last = await read(); if (predicate(last)) return last; await delay(50); }
    throw Error(`${label} timeout`);
  }
  async function launch(profile: 'host' | 'guest'): Promise<Application> {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTLITE_LOCAL_SERVICE_URL: runtime!.baseUrl, FTLITE_DUEL_TEST_SEED: String(DUEL_TEST_SEED), NODE_PATH: resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL; delete env.FTLITE_SECTOR_ONLINE_TEST;
    const child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), `--online-app-dir=${directory}`, `--online-app-role=${profile}`, `--user-data-dir=${join(directory, profile)}`],
      { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
    const app: Application = { child, pid: child.pid!, profile, exited: false, exit: Promise.resolve(), request(command, data = {}) {
      if (app.exited || !child.connected) return Promise.reject(Error('application IPC disconnected'));
      return new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(command + ' driver timeout')); }, 8000);
        pending.set(key, { resolve, reject, timer }); try { child.send({ ...data, requestId: key, command }); } catch { pending.delete(key); clearTimeout(timer); reject(Error('application IPC disconnected')); } });
    } };
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(`app-driver-command-failed (${message.command}: ${message.reason})`)) : item.resolve(message.result); });
    child.stdout!.resume(); child.stderr!.resume();
    app.exit = new Promise(done => child.once('exit', () => { app.exited = true; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('application exited')); } pending.clear(); done(); }));
    processes.push(app);
    await until(async () => { try { return await app.request('status'); } catch (error) { if (app.exited) throw error; return null; } }, (v: any) => !!v?.status && v.text.includes('Single player'), `${profile} app ready`, 30000);
    return app;
  }
  async function kill(app: Application) {
    if (!app.exited) {
      if (process.platform === 'win32') await new Promise<void>(done => { const c = spawn('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); c.once('error', () => done()); c.once('exit', () => done()); });
      else app.child.kill('SIGKILL');
    }
    await Promise.race([app.exit, delay(5000)]);
  }
  const status = (app: Application) => app.request('status');
  const phase = (app: Application, value: string, ms?: number) => until(() => status(app), (r: any) => r.status.phase === value, `${app.profile} ${value}`, ms);
  const latest = (r: any) => r.observations.at(-1)?.publications.at(-1);
  const press = async (app: Application, key: string, hold = 120) => { await app.request('key', { key, down: true }); await delay(hold); await app.request('key', { key, down: false }); };
  try {
    runtime = startOnlineAppRuntime(directory, digest, deadline.signal);
    await runtime.ready;
    // The duel's own passive observer replaces the sector's, before any application window loads it.
    await build({ configFile: false, envDir: false, logLevel: 'warn', define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(directory, 'observer'), emptyOutDir: false, lib: { entry: resolve('scripts/network/duel-app-observer.ts'), name: 'DuelObserver', formats: ['iife'], fileName: () => 'observer.js' } } });
    // The shared driver proves each utility checkpoint with the sector's card memory; a duel checkpoint has none.
    writeFileSync(join(directory, 'observer', 'utility.cjs'), 'module.exports = { reconciledMemory: () => null };\n');
    const h = await launch('host'); let g = await launch('guest');
    step = 'step 1';
    // 1. Through the real menu: Multiplayer → Host; Join by the displayed code; ready; Swap seats once; start.
    await h.request('open-multiplayer'); await h.request('click', { id: 'host' }); await h.request('click', { id: 'create-room' });
    const lobby = await phase(h, 'lobby');
    assert(lobby.status.snapshot.compatibility.modeId === 'duel' && lobby.status.snapshot.capacity === 2, 'Host made a two-seat duel room');
    await g.request('open-multiplayer'); await g.request('click', { id: 'join' }); await g.request('type', { id: 'join-code', text: lobby.status.snapshot.joinCode }); await g.request('click', { id: 'join-room' });
    await phase(g, 'lobby');
    await h.request('click', { id: 'ready' }); await g.request('click', { id: 'ready' });
    await until(() => status(h), (r: any) => r.status.actions.includes('start'), 'both ready');
    await h.request('click', { id: 'swap-seats' });
    assert((await status(h)).text.includes('Guest flies Helm'), 'Swap seats shows the guest at the Helm');
    assert((await status(g)).text.includes('Host picks seats'), 'the guest lobby says the host picks seats');
    await h.request('click', { id: 'start' });
    await phase(h, 'running', 20000); await phase(g, 'running', 20000);
    const started = await until(() => status(g), (r: any) => latest(r)?.helmPlayer === 1 && latest(r)?.seed === DUEL_TEST_SEED, 'guest sees itself at the Helm');
    proof.swap = { helmPlayer: latest(started).helmPlayer, seed: latest(started).seed };
    step = 'step 2';
    // 2. Round 1, the forced end: each player stands up and sits down again (X, then E). Nobody flies or fires, so the
    //    test seed's round is decided on tick 1471 whatever the timing, and both records get command samples.
    for (const [app, seat] of [[g, 1], [h, 0]] as const) {
      await press(app, 'X');
      await until(() => status(app), (r: any) => r.observations.at(-1)?.results.some((x: any) => x.status === 'applied' && x.id.player === seat && x.id.sequence > 1), `${app.profile} stood up`);
      await press(app, 'E');
    }
    step = 'step 3';
    // 3. The round ends; Enter starts round 2 on both; a record with latency samples on both machines.
    const decided = await until(() => status(h), (r: any) => latest(r)?.outcome !== 0, 'the forced round end', 60000);
    await until(() => status(g), (r: any) => latest(r)?.outcome !== 0, 'the guest sees the decision');
    await press(h, 'Return');
    await until(async () => [latest(await status(h)), latest(await status(g))], ([a, b]: any) => a.round === 1 && b.round === 1 && a.outcome === 0, 'Enter starts round 2 on both');
    proof.rounds = { decidedTick: latest(decided).tick, outcome: latest(decided).outcome };
    const records = await until(async () => (['host', 'guest'] as const).map((profile) => {
      const dir = join(directory, profile, 'playtest');
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^duel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) : [];
      return files.flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    }), (both) => both.every((list) => list.some((r: any) => r.round === 0 && r.summary.round === 0 && r.latency.held.count + r.latency.command.count > 0)), 'playtest records with latency samples on both', 15000);
    proof.records = records.map((list) => ({ count: list.length, role: list[0].role, latency: list[0].latency, jitter: list[0].jitter }));
    step = 'step 4';
    // 4. The Helm machine (the guest) holds W for 2 s: the crew ship's speed rises on both screens.
    const speedBefore = latest(await status(h)).speed;
    await g.request('key', { key: 'W', down: true }); await delay(2000); await g.request('key', { key: 'W', down: false });
    const fast = await until(async () => [latest(await status(h)), latest(await status(g))], ([a, b]: any) => a.speed > speedBefore + 1 && b.speed > speedBefore + 1, 'speed rises on both');
    proof.thrust = { before: speedBefore, host: fast[0].speed, guest: fast[1].speed };
    step = 'step 5';
    // 5. The Weapons machine (the host) presses Space and releases it: a beam (a laser shot) on both.
    const shotsBefore = latest(await status(h)).shots;
    await h.request('key', { key: 'Space', down: true }); await delay(4500); await h.request('key', { key: 'Space', down: false });   // a full charge takes 4 s
    const fired = await until(async () => [latest(await status(h)), latest(await status(g))], ([a, b]: any) => a.shots > shotsBefore && b.shots > shotsBefore, 'beam on both', 10000);
    proof.beam = { before: shotsBefore, host: fired[0].shots, guest: fired[1].shots };
    step = 'step 6';
    // 6. Both renderers agree on the hash at a common publication.
    const agreement = await until(async () => { const [a, b] = [await status(h), await status(g)]; const hp = a.observations.at(-1).publications, gp = b.observations.at(-1).publications;
      return gp.findLast((p: any) => hp.some((q: any) => q.sequence === p.sequence && q.hash === p.hash && q.tick === p.tick)); }, (same: any) => !!same, 'hash agreement');
    proof.agreement = { tick: agreement.tick, sequence: agreement.sequence, hash: agreement.hash };
    step = 'step 7';
    // 7. The guest is killed and restarted: presence false and the host paused for the lost partner; the rejoin and
    //    its ACK before any input, then presence true; then an Escape unpause.
    await kill(g);
    const lost = await until(() => status(h), (r: any) => latest(r)?.present[1] === 0 && latest(r)?.phase === 'paused' && latest(r)?.pauseReason === 'peer-lost', 'presence false, then the peer-lost pause', 30000);
    proof.peerLost = { tick: latest(lost).tick };
    g = await launch('guest'); await g.request('open-multiplayer'); await g.request('click', { id: 'reconnect' });
    await phase(g, 'paused', 30000);
    const rejoined = await until(() => status(g), (r: any) => r.observations.at(-1)?.inputs.some((i: any) => i.command === 'presence' && i.present === true), 'rejoin presence true');
    const session = rejoined.observations.at(-1);
    assert(session.firstAckOrder > 0 && session.firstInputOrder > session.firstAckOrder, 'the rejoined guest sent input before its full-state ACK');
    assert(latest(await status(h)).phase === 'paused', 'rejoining unpaused the duel');
    await press(h, 'Escape');
    await phase(h, 'running'); await phase(g, 'running');
    await until(() => status(h), (r: any) => latest(r)?.present[1] === 1, 'the guest is present again');
    proof.rejoin = { ackBeforeInput: true, resumedByEscape: true };
    for (const app of [g, h]) { await app.request('click', { id: 'leave' }); }
    await phase(h, 'idle'); await phase(g, 'idle');
    console.log('ACTUAL DUEL APP: menu host/join/swap/start, the forced round end and round 2, records on both, Helm thrust and a beam on both, hash agreement, peer-lost pause and rejoin');
  } catch (error) { failure = `${step}: ${String((error as Error)?.message ?? error).slice(0, 160)}`; }
  finally {
    clearTimeout(watchdog);
    for (const app of processes) if (!app.exited) { try { const done = app.request('shutdown'); await Promise.race([done, delay(6000)]); } catch { /* forced below */ } await kill(app); }
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
    const target = resolve(directory), prefix = resolve(tmpdir()) + sep;
    if (!target.startsWith(prefix) || !target.slice(prefix.length).startsWith('ftlite-duel-app-')) throw Error('invalid exact cleanup target');
    try { rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { failure ??= 'exact temporary cleanup failed'; }
  }
  const report = { version: 1, digest, elapsedMs: Math.ceil(performance.now() - began), processes: processes.map(({ pid, profile, exited }) => ({ pid, profile, exited })), proof, failure, temporaryRemoved: !existsSync(directory) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (failure) throw Error(failure);
  console.log(`ACTUAL TWO-PROCESS DUEL APPLICATION PASS (${report.elapsedMs} ms)`);
}
main().catch(error => { console.error(`DUEL APP FAIL: ${String((error as Error)?.message ?? error).slice(0, 200)}`); process.exitCode = 1; });
````

In `package.json`, replace:

````json
    "test:online-recovery-runtime": "electron-vite build && tsx scripts/network/online-recovery-smoke.ts",
    "test:internet-app-runtime": "tsx scripts/network/internet-app-smoke.ts",
````

with:

````json
    "test:online-recovery-runtime": "electron-vite build && tsx scripts/network/online-recovery-smoke.ts",
    "test:duel-app-runtime": "electron-vite build && tsx scripts/network/duel-app-smoke.ts",
    "test:internet-app-runtime": "tsx scripts/network/internet-app-smoke.ts",
````

- [ ] **Step 4: Run the sector smoke through the test-only entry, and the duel smoke**

Run: `npm run test:online-app-runtime -- --report-path=out/h2a-online-app/online-app.json`
Expected: `ACTUAL APP 2-seat skiff: ...` and `ACTUAL APP 4-seat cutter: input, ACK, bot, restart and paused rejoin proved`, then `ACTUAL TWO-PROCESS ONLINE APPLICATION PASS`, exit 0.

Run: `npm run test:duel-app-runtime`
Expected: `ACTUAL DUEL APP: menu host/join/swap/start, the forced round end and round 2, records on both, Helm thrust and a beam on both, hash agreement, peer-lost pause and rejoin`, then `ACTUAL TWO-PROCESS DUEL APPLICATION PASS (<ms> ms)` (about 45 s), exit 0; `out/h2a-duel-app/duel-app.json` holds the proof (the swap, the decided tick, about 1,475, both machines' records with their latency figures, the speeds, the shots, the agreed hash and the peer-lost tick).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```
git add package.json scripts/network/online-app-smoke.cjs scripts/network/online-app-smoke.ts scripts/network/online-recovery-smoke.ts scripts/network/duel-app-observer.ts scripts/network/duel-app-smoke.ts tests/networkBoundary.test.ts
git commit -m "H-2a-iii task 3: the sector smokes on the test-only entry; the duel application smoke"
```

---

### Task 4: The gates

**Files:** none (evidence under `out/`).

- [ ] **Step 1: The full suite**

Run: `npm run build`
Expected: exit 0.

Run: `npm test`
Expected: PASS, 246 test files, 3463 tests (known load flakes: rerun alone).

- [ ] **Step 2: Determinism, the host runtime, the online application and the duel application**

Run: `npm run test:determinism -- --output-dir=out/h2a-determinism`
Expected: three PASS lines (Node, Electron, Firefox), exit 0.

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits; ...`, exit 0. The host-runtime and lease gates run unchanged with the duel registered.

Run: `npm run test:online-app-runtime -- --report-path=out/h2a-online-app/online-app.json`
Expected: `ACTUAL TWO-PROCESS ONLINE APPLICATION PASS`, exit 0.

Run: `npm run test:duel-app-runtime`
Expected: `ACTUAL TWO-PROCESS DUEL APPLICATION PASS (<ms> ms)`, exit 0.

## After H-2a-iii

- The H-2a acceptance (spec §11) still asks for the Codex implementation review, applied, and the owner's LAN manual checklist (spec §10), which waits on the deployed HTTPS service (H-2b step (d)).
- H-2b: the report script and the `docs/gates.md` section, Single player's `session: 'solo'` records (the local runtime's telemetry accumulator and a `recordDuel` dep; Decision 14), the F3 overlay and the latency table, the guest's transport label from the RTC window's selected candidate pair, and the internet candidate with its sector run on the test-only entry and its new duel run.
- The playtest records land in each machine's `userData/playtest/duel-YYYY-MM-DD.jsonl`.
