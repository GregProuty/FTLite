# Helm H-2b-i: Telemetry, Latency and the Playtest Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ] `) syntax for tracking.

**Goal:** Every decided duel round leaves a complete playtest record on each machine, and one script turns the owner's record files into the Helm §16 verdict. The guest's records now say whether its link was `lan` or `internet` and carry the link's RTT. Single player writes `session: 'solo'` records. F3 shows the live input-to-screen delay on either machine of an online duel. `scripts/duel-playtest-report.ts` merges host and guest files into rooms and prints:
- the §16 rule verbatim and its evaluation;
- the live targets and the planet extra;
- the §9 latency table and the H-2c fallback checks;
- the solo rounds apart, and a blank checklist.

`docs/gates.md` gains its "Helm demo" section. The duel smoke proves the labels end to end and hands its records to the report.

**Architecture:**
- **The link figures** (spec §8 transport). The hidden RTC window labels its selected candidate pair `lan` or `internet` (`src/network/rtc/route.ts`, new; `peer.ts`). The controller reports the label and the RTT once a second as a new `stats` response (`src/network/transport/controller.ts`, `src/shared/rtcSession.ts`). Main keeps the newest figures of a ready attempt: `rtcTransport.ts` `onStats`, and `onlineSession.ts` `linkStats()`. The renderer reads them through one named channel: `online:link-stats` in `onlineIpc.ts` and `src/shared/onlineSession.ts`, and `online.linkStats()` in `src/preload/index.ts`.
- **The renderer.**
  - `app/duel/onlineDuel.ts` polls the figures at most once a second. It labels each record (`transport` and `latency.rttMs`) and owns the F3 overlay.
  - `render/duel/latencyOverlay.ts` (new) holds the overlay's pure lines, its F3 switch and a thin Pixi draw over the scene. `scene.ts` does not change.
  - `app/duel/runtime.ts` keeps the round's telemetry accumulator, as the authority does. `app/duel/duelMode.ts` writes solo records with `net/duelRecord.ts` `soloDuelRecord`, through the preload (`main.ts`).
- **The report.** `scripts/duel-playtest-model.ts` (new, pure) and `scripts/duel-playtest-report.ts` (new, the command). `docs/gates.md` gains the "Helm demo" section.
- **The duel smoke.** `scripts/network/duel-app-smoke.ts` asserts the labels, saves F3 screenshots and copies both machines' records beside its report.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37, Pixi 8. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §8 (the record, the transport, the report hook), §9 (the recorded figures, F3, the fallback criteria), §10 ("Telemetry" tests, the duel smoke's records) and the H-2b row of §11. Follows `2026-11-16-helm-h2a-iii-online-app.md` (its Decisions 5, 6 and 14 and "After H-2a-iii"). Helm spec `2026-11-14-helm-demo-design.md` §11a and §16.

## Scope

- **Prerequisite: H-2a-iii merged** (master `ca06a62` or later). Task 1 Step 0 checks it.
- **Task 1:** the link figures, from the hidden RTC window to the renderer.
- **Task 2:** the renderer: the record's transport and RTT, the F3 overlay, Single player's solo records.
- **Task 3:** the report script and the `docs/gates.md` "Helm demo" section.
- **Task 4:** the duel smoke's labels, F3 screenshots and record copies.
- **Task 5:** the gates.
- **Not in H-2b-i:** the internet candidate for SIM 39 and the internet smoke's switch to the test-only entry with its new duel run (`2026-11-16-helm-h2b-ii-internet-candidate.md`). H-2c (cadence, prediction) is out of scope. The LAN and internet checklists, the redeploy and the §16 sessions are the owner's.

## Global Constraints

- **Prerequisite: H-2a-iii is merged.** Do not start this plan on a checkout without it.
- **Keyboard and mouse only.** F3 is a key; nothing reads a gamepad.
- **Nothing private leaves main or the hidden window.** Records, the stats response, the IPC answer and the report carry only the route label (`lan` or `internet`) and numbers. A record, the `stats` response or the `online:link-stats` answer never holds a token, code, address, candidate or SDP. The route is computed inside the hidden transport window.
- The network boundary (`tests/networkBoundary.test.ts`): the new `src/network/rtc/route.ts` imports only `src/shared/rtcSession.ts`. No `SIM_VERSION` change: nothing hashed, no golden and no canonical field changes.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean` in the main checkout. Evidence goes under the git-ignored `out/`; the smokes clean only their own exact temporary roots and never kill Electron or workerd globally.
- **A git worktree needs both junctions** (`node_modules` and `services\signalling\node_modules`). Without the second, `tests/onlineAppRuntime.test.ts` and every online smoke fail, which is not a flake.
- **Commands need no shell features.** Commit with explicit paths only, and end every commit message with your session's Co-Authored-By trailer.
  - Single files: `npx vitest run <file>`.
  - The full suite: `npm test` after `npm run build`.
  - Typecheck: `npm run typecheck`.

  Use LF line endings.
- **The code is exact.** A file shown in full is written as shown. Each `replace:` block occurs exactly once in its file at that point of the plan: replace it with the `with:` block, in the order given. The plan was re-extracted step by step into a fresh worktree from master `ca06a62` and reproduces the prototype byte for byte.
- **UI-ii (session ftlite-78) moves the duel's Pixi panels to React** and quotes `createDuelScene`'s signature, `SceneOverlay` and the `scene.draw(...)` calls in `duelMode.ts` and `onlineDuel.ts`. This plan changes none of them. It does edit other lines of `duelMode.ts`, `onlineDuel.ts` and `main.ts`. Whichever lands second merges those few lines by hand (Decision 5).
- Known flakes under full-suite load (each passes alone; rerun the file alone): `tests/authorityBoundary.test.ts`, `tests/authorityIngress.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` ("a run saved mid Build Up") and `tests/director.test.ts` (the 20-minute soak). The sector online-app smoke is flaky only under machine load (it passes when the machine is idle).

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order. The owner can overturn any of them.

1. **The route label** (spec §8: "a host candidate is `lan`; srflx or relay is `internet`") **(rec.; one addition)**. The hidden window labels the selected pair from its local and remote candidate stats:
   - any relay, or a server-reflexive candidate on either side, is `internet`;
   - two host candidates are `lan`;
   - **addition:** a peer-reflexive candidate on either side, which the spec does not mention, is judged by its address: `lan` when it is private, link-local, loopback or mDNS (`.local`), `internet` when it is any other readable address. Chromium reports a LAN peer as peer-reflexive when its connectivity check beats the candidate signal, and it leaves a remote peer-reflexive candidate's address out of its stats. A remote one with no readable address is decided from the local side only on a direct attempt (no STUN or TURN servers configured, so no server-reflexive or relay path exists): a local host candidate at a private address then means `lan`. With ICE servers configured, a NATed internet peer looks identical, so the route is unknown (null), never a guessed label.
   - An unknown route sends no figures, so the record's `transport` stays null (the schema admits it) and the report reads the room's network as unknown (the LAN limit in fallback check 1).

   The address is read inside the hidden window only; just the label leaves it.
2. **The figures' path** **(rec.)**. The controller sends a `stats` response (`rttMs`, `route`) once a second for a ready attempt whose peer has sampled a route and a real RTT. `rtcTransport.onStats` forwards it for ready attempts only. The session keeps the newest per ready peer link and drops figures older than 5 s (`LINK_STATS_MAX_AGE_MS`). The renderer asks through `online:link-stats`: no argument, the trusted visible window only, and a validated `{ route, rttMs }` or null.
   - A pull channel rather than a field in `OnlineStatus`: the status is strict, validated everywhere and pushed on change, and a once-a-second push would re-render the menu.
   - The peer keeps the RTT as `number | null` beside the route: a missing or invalid `currentRoundTripTime` is null, not 0, and no `stats` response is sent without a real RTT. `diagnostics()` keeps its 0 for its existing callers.
   - `RtcPeer.linkFigures?`, `TransportController.onStats?`, `OnlineSessionOwner.linkStats?` and `OnlinePreloadApi.linkStats?` are optional, so the existing fakes and tests compile unchanged.
3. **`rttMs` is the median of the round's once-a-second samples** (spec §9: "the link's RTT from `link.stats()`"). The renderer's link is the local MessagePort, whose `stats()` has no network RTT (H-2a Decision 5), so the figure is the hidden window's selected pair's `currentRoundTripTime`. **The host's records carry the RTT too**: that of its own RTC link to the guest, measured from the host side. Its `transport` stays `loopback` as the spec says.
4. **The guest's label persists** **(rec.)**. Once main has reported a route, later records keep it even when a poll returns null (a link being replaced). A guest record before any figure reads `transport: null` and `rttMs: null`, as in H-2a.
5. **F3 lives in one module beside the scene, not in it** (spec §9: "A debug overlay (F3) shows the live median and p95 on either machine"):
   - `render/duel/latencyOverlay.ts` holds the pure `latencyOverlayLines`, the `createKeyToggle` F3 switch and `createLatencyOverlay`, one `BitmapText` added to the stage after the scene so that it draws over it.
   - `onlineDuel.ts` owns it: it creates the overlay on the first F3, draws after `scene.draw`, and disposes it.
   - The live figures cover the last 300 samples (`LIVE_SAMPLES`), not the round, so a new round does not blank the overlay.

   **Online only:** Single player has no link, so F3 does nothing there. **Moving it to React (UI-ii):** the duel sink gains `debug: string[] | null`, filled from `latencyOverlayLines(...)` while the switch is on. A React `<LatencyOverlay>` renders those lines. Then delete `createLatencyOverlay` and its two call sites in `onlineDuel.ts`; the model and the switch stay.
6. **Single player's solo records** (H-2a Decision 14; spec §8 "Single player writes the same record with `session: 'solo'`"). The duel runtime keeps the round's accumulator exactly as `duelRules` does: a fresh one after a rematch, and `recordTick` after every step. On the deciding tick it hands `duelRoundRecord(duelEndSummary(...))` to `onRound`. `duelMode.ts` writes `soloDuelRecord(...)` through the preload's `recordDuel`:
   - **(rec.)** `role: 'host'`, `transport: null`, empty latency figures, no jitter and no disconnects;
   - `seat` is the character the keyboard drives when the round is decided;
   - `pauses` counts the round's Escape pauses.
7. **Rooms, not "keyed by room seed"** (spec §8) **(deviation)**. A record does not carry its room's runId or first seed, and a round's seed cannot be walked back to round 0's.
   - The report chains rounds instead: a round follows another when its index is one more, its seed is `followingSeed` of the previous one and its base tick is not before the previous round's end. Rounds are chained in round-index order (then by time), so a skew between the two PCs' clocks cannot split a room.
   - A room is keyed by its first round's seed: `seed-<n>`, or `seed-<n>-r<k>` when round 0's record is missing.
   - Each round takes its summary from the host's record (the guest's when the host's is missing). Each room takes its transport from its guest records (the most common non-null label).
   - The owner's **sessions** are sittings and live in the checklist: each lists its rooms, so the LAN checklist's step 9 re-host belongs to the same sitting.
8. **The §16 arithmetic** (spec §8) **(rec.)**:
   - "Both weapons used in every duel" is the crew ship's `laserReleases[0] > 0` and `missilesLaunched[0] > 0` in every round; the hunter's weapons do not count.
   - The round length is `summary.ticks / 60`.
   - "Both outcomes" is at least one `CrewWins` and one `EnemyWins`; a draw counts for neither.
   - With a checklist, the live targets and the planet extra cover only the rounds of the rooms its sessions list, and the report says so. The checklist runs share the day's files with the §16 sessions and cannot be split from them by file. The report lists the rooms no session claims (left out) and any room a session lists that no record has. Without a checklist, the targets cover every online round in the files and the report prints a warning.
   - The planet extra: no round with `EnemyWins`, `planet` among the crew ship's terminal causes, and under 1,800 ticks.
   - The demo is done when the checklist rule and the three live targets all hold.
9. **The fallback checks** (spec §9) **(rec.)**:
   - (1) A record of the Helm's own machine (`seat === helmPlayer`) whose held p95 is over its room's limit: 150 ms for `lan`, 250 ms for `internet`, and the LAN limit when the network is unknown.
   - (2) `helmLaggy` is true in two or more sessions.
   - (3) A session whose rooms all share one known network (`lan` or `internet`) whose question 1 is yes while its `guestHelmQ1` is no. Both checklists schedule a guest-Helm round so this can be evaluated (spec §9), and the guest-Helm penalty is largest on the internet. A session mixing networks, or with an unknown one, is not judged.
10. **The checklist JSON:** `{ version: 1, sessions: [{ id, rooms, pair: 'owner' | 'non-owner' | null, answers: [5 × boolean | null], guestHelmQ1, helmLaggy, note }] }`. It is passed with `--checklist=<file>`, or found as `checklist.json` in a directory given. The report always ends with a blank one, one session per room. Its output is Markdown on stdout, ready to paste into `docs/gates.md` and a report under `reports/`. It exits 1 on bad arguments or when no valid record was read. Invalid lines are counted and skipped.
11. **The duel smoke** (spec §10 step 7) asserts what the records now carry: every host record reads `loopback`, and every guest record reads `lan` with an RTT. The smoke runs on one PC with no ICE servers, so the pair is direct. It also copies both machines' logs to `<report dir>/records/{host,guest}/` and saves `f3-host.png` and `f3-guest.png`. **Its latency figures are not a measurement:** under automation the unfocused window's timers are throttled, which inflates the guest's held delay. Its single 25 s test-seed round fails the live targets by design.
12. **The "Helm demo" section** is written now, with the rule, the commands and the owner's empty session table. Its status reads "not done" until the owner's sessions.

## File structure

| File | Responsibility |
|---|---|
| `src/network/rtc/route.ts` | **Create:** the route label of a selected candidate pair |
| `src/network/rtc/peer.ts`, `src/network/transport/controller.ts`, `src/shared/rtcSession.ts` | **Modify:** the sampled route; the once-a-second `stats` response |
| `src/main/network/rtcTransport.ts`, `src/main/network/onlineSession.ts`, `src/main/network/onlineIpc.ts` | **Modify:** `onStats`; the newest figures of a ready link; `online:link-stats` |
| `src/shared/onlineSession.ts`, `src/preload/index.ts` | **Modify:** `OnlineLinkStats`, the channel, `online.linkStats()` |
| `src/renderer/src/render/duel/latencyOverlay.ts` | **Create:** the F3 overlay's lines, switch and draw |
| `src/renderer/src/app/duel/onlineDuel.ts`, `runtime.ts`, `duelMode.ts`, `src/renderer/src/net/duelRecord.ts`, `src/renderer/src/main.ts` | **Modify:** the record's link figures and F3; the solo accumulator and records |
| `scripts/duel-playtest-model.ts`, `scripts/duel-playtest-report.ts`, `docs/gates.md` | **Create / modify:** the report and the "Helm demo" section |
| `scripts/network/duel-app-smoke.ts` | **Modify:** the labels, F3 screenshots, record copies |
| `tests/linkStats.test.ts`, `tests/latencyOverlay.test.ts`, `tests/duelPlaytestReport.test.ts` | **Create** |
| `tests/onlineDuelSession.test.ts`, `tests/duelRuntime.test.ts` | **Modify:** the record's link figures; the solo rounds |

---

### Task 1: The link figures, from the hidden RTC window to the renderer

**Files:**
- Create: `src/network/rtc/route.ts`, `tests/linkStats.test.ts`
- Modify: `src/network/rtc/peer.ts`, `src/shared/rtcSession.ts`, `src/network/transport/controller.ts`, `src/main/network/rtcTransport.ts`, `src/main/network/onlineSession.ts`, `src/shared/onlineSession.ts`, `src/main/network/onlineIpc.ts`, `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `route.ts`: `RtcRoute`, `localAddress(value)`, `rtcRoute(local, remote, direct = false)` (direct: no ICE servers configured).
  - `peer.ts`: `RtcPeer.linkFigures?()` (`{ route, rttMs }`, each null until sampled).
  - `controller.ts`: `STATS_MS`.
  - `rtcSession.ts`: the `{ kind: 'stats'; rttMs; route }` response.
  - `rtcTransport.ts`: `RtcLinkStats`, `TransportController.onStats?(cb)`.
  - `onlineSession.ts`: `OnlineSessionOwner.linkStats?()`, `LINK_STATS_MAX_AGE_MS`.
  - `shared/onlineSession.ts`: `OnlineLinkStats`, `validateOnlineLinkStats`, `ONLINE_LINK_STATS_CHANNEL`, `OnlinePreloadApi.linkStats?()`.

- [ ] **Step 0: Check the prerequisite (H-2a-iii merged)**

Run: `npx vitest run tests/onlineDuelSession.test.ts`
Expected: PASS, 7 tests. **If the file is missing, stop: H-2a-iii is not merged.**

- [ ] **Step 1: Write the failing test**

Create `tests/linkStats.test.ts`:

````ts
// The link figures (H-2 spec §8, §9): the hidden window labels the selected candidate pair's route and reports it with
// the RTT once a second; main keeps the newest for a ready attempt and answers the renderer's one named channel. Only
// the label and the RTT cross any boundary, never a candidate or address.
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localAddress, rtcRoute } from '../src/network/rtc/route';
import { createTransportController, STATS_MS } from '../src/network/transport/controller';
import { createRtcTransport } from '../src/main/network/rtcTransport';
import { isRtcResponse, type RtcAttemptOptions, type RtcRequest, type RtcResponse } from '../src/shared/rtcSession';
import { validateOnlineLinkStats } from '../src/shared/onlineSession';
import type { PortEndpoint } from '../src/shared/netSession';
import type { Link } from '../src/renderer/src/net/contracts';
import type { OnlineSessionOwner } from '../src/main/network/onlineSession';

const native = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { ipcMain: { handle: (name: string, cb: (...args: any[]) => any) => native.handlers.set(name, cb), removeHandler: (name: string) => native.handlers.delete(name) }, powerMonitor: new EventEmitter() };
});
import { registerOnlineIpc } from '../src/main/network/onlineIpc';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
function config(attemptId: string): RtcAttemptOptions {
  return { attemptId, role: 'offerer', identity: { ...identity, protocolVersion: 2, layoutHash: '1234abcd', runId: 'run', roomId: 'room', seatGeneration: 1,
    localConnectionId: 'host', remoteConnectionId: attemptId }, localTicket: 'local', expectedRemoteTicket: 'remote', ticketExpiresAtEpochMs: Date.now() + 20000, iceServers: [] };
}

describe('the route label (spec §8)', () => {
  const c = (candidateType: string, address?: string) => ({ candidateType, ...(address ? { address } : {}) });
  it('two host candidates are lan; any relay or server-reflexive candidate is internet', () => {
    expect(rtcRoute(c('host'), c('host'))).toBe('lan');
    for (const [l, r] of [['relay', 'host'], ['host', 'relay'], ['host', 'srflx'], ['srflx', 'host'], ['relay', 'srflx']]) expect(rtcRoute(c(l!), c(r!))).toBe('internet');
  });
  it('a peer-reflexive candidate is judged by its address, a hidden remote one by the local host candidate; unknown gives no label', () => {
    expect(rtcRoute(c('host'), c('prflx', '192.168.1.20'))).toBe('lan');
    expect(rtcRoute(c('host'), c('prflx', '203.0.113.9'))).toBe('internet');
    // Chromium hides a remote prflx address: only on a direct attempt (no STUN/TURN) does a private local host decide;
    // with ICE servers configured a NATed internet peer looks the same, so the route is unknown.
    expect(rtcRoute(c('host', '192.168.1.5'), c('prflx'), true)).toBe('lan');
    expect(rtcRoute(c('host', '192.168.1.5'), c('prflx'))).toBeNull();
    expect(rtcRoute(c('host', '203.0.113.4'), c('prflx'), true)).toBeNull();
    expect(rtcRoute(c('host'), c('prflx'))).toBeNull();
    expect(rtcRoute(c('prflx'), c('prflx'))).toBeNull();
    // A local prflx candidate is checked by its own address too.
    expect(rtcRoute(c('prflx', '10.0.0.3'), c('host'))).toBe('lan');
    expect(rtcRoute(c('prflx', '198.51.100.2'), c('host'))).toBe('internet');
    expect(rtcRoute(c('prflx'), c('host'))).toBeNull();
    expect(rtcRoute(undefined, c('host'))).toBeNull();
    expect(rtcRoute(c('host'), c('mystery'))).toBeNull();
    for (const a of ['10.0.0.2', '172.16.4.4', '172.31.0.1', '192.168.0.9', '169.254.1.1', '127.0.0.1', 'abcd-1234.local', 'fd12::1', 'fe80::1', '::1']) expect(localAddress(a)).toBe(true);
    for (const a of ['172.32.0.1', '8.8.8.8', '2001:db8::1', 7]) expect(localAddress(a)).toBe(false);
  });
});

describe('the hidden window reports a ready attempt once a second (spec §8)', () => {
  class Port implements PortEndpoint {
    messages = new Set<(data: unknown) => void>(); closes = new Set<() => void>(); closed = false;
    postMessage() {} onMessage(cb: (data: unknown) => void) { this.messages.add(cb); return () => { this.messages.delete(cb); }; }
    onClose(cb: () => void) { this.closes.add(cb); return () => { this.closes.delete(cb); }; }
    start() {} close() { this.closed = true; }
  }
  function rig() {
    const responses: RtcResponse[] = [], timers: { at: number; cb: () => void }[] = [];
    let now = 0, route: 'lan' | 'internet' | null = null, rttMs: number | null = 3.04, resolve!: (link: Link) => void, closeLink = () => {};
    const scheduler = { schedule(ms: number, cb: () => void) { const t = { at: now + ms, cb }; timers.push(t); return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }; } };
    const controller = createTransportController({ identity, respond: (r) => responses.push(r), wallNow: () => Date.now(), clock: { nowMs: () => 0 }, scheduler,
      createPeer() { const ready = new Promise<Link>((done) => { resolve = done; });
        return { ready, close() {}, receiveSignal: async () => {}, linkFigures: () => ({ route, rttMs }), diagnostics: () => ({ rttMs: rttMs ?? 0, lossPct: 0, bufferedBytes: 0, relayed: false }) }; } });
    const link: Link = { peer: 'p', caps: { unreliable: true, maxDatagram: 16088, p2p: true, hidesPeerIp: false }, send() {}, stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }),
      onMessage: () => () => {}, onClose(cb) { closeLink = () => cb('closed'); return () => {}; }, close() { closeLink(); } };
    return { controller, responses, timers, link, resolve: () => resolve(link), closeLink: () => closeLink(),
      advance(ms: number) { now += ms; for (const t of timers.filter((x) => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.cb(); } },
      set(r: typeof route, ms = rttMs) { route = r; rttMs = ms; } };
  }
  it('sends nothing until the peer has a route and a real RTT, then its RTT and label only, every STATS_MS; it stops on close', async () => {
    const h = rig();
    h.controller.receive({ version: 1, kind: 'start', hostGeneration: 7, requestId: 1, options: config('a') }, [new Port()]);
    h.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.responses.map((r) => r.kind)).toEqual(['port-ready', 'ready']);
    h.advance(STATS_MS); expect(h.responses.filter((r) => r.kind === 'stats')).toEqual([]);   // no sample yet
    h.set('lan', null); h.advance(STATS_MS); expect(h.responses.filter((r) => r.kind === 'stats')).toEqual([]);   // no RTT in the sample: not a 0 ms figure
    h.set('lan', 3.04); h.advance(STATS_MS); h.set('internet', 41.27); h.advance(STATS_MS);
    const stats = h.responses.filter((r) => r.kind === 'stats');
    expect(stats).toEqual([{ version: 1, hostGeneration: 7, requestId: 1, attemptId: 'a', kind: 'stats', rttMs: 3, route: 'lan' }, { version: 1, hostGeneration: 7, requestId: 1, attemptId: 'a', kind: 'stats', rttMs: 41.3, route: 'internet' }]);
    expect(stats.every(isRtcResponse)).toBe(true);
    h.closeLink(); h.advance(STATS_MS * 3);
    expect(h.responses.filter((r) => r.kind === 'stats')).toHaveLength(2); expect(h.timers).toHaveLength(0);
    h.controller.dispose();
  });
  it('the response schema admits only a bounded RTT and the two labels', () => {
    const base = { version: 1, hostGeneration: 7, requestId: 1, attemptId: 'a', kind: 'stats' };
    expect(isRtcResponse({ ...base, rttMs: 0, route: 'internet' })).toBe(true);
    for (const bad of [{ ...base, rttMs: -1, route: 'lan' }, { ...base, rttMs: 60001, route: 'lan' }, { ...base, rttMs: 4, route: 'relay' }, { ...base, rttMs: 4, route: 'lan', address: '10.0.0.1' }, { ...base, route: 'lan' }])
      expect(isRtcResponse(bad)).toBe(false);
  });
});

describe('main keeps the figures of a ready attempt and answers one named channel (spec §8)', () => {
  it('the transport owner forwards stats for a ready attempt only', async () => {
    let receive = (_: unknown) => {};
    const requests: RtcRequest[] = [], seen = vi.fn();
    const owner = createRtcTransport(identity, { send(message) { requests.push(message); }, onResponse(cb) { receive = cb; return () => {}; }, dispose() {} });
    owner.onStats!(seen);
    const started = owner.startAttempt(config('a'), { close() {} } as never), request = requests[0]!;
    const reply = (kind: string, extra = {}) => receive({ version: 1, hostGeneration: 7, requestId: request.requestId, attemptId: 'a', kind, ...extra });
    reply('stats', { rttMs: 5, route: 'lan' }); expect(seen).not.toHaveBeenCalled();   // not ready yet
    reply('port-ready'); reply('ready', { latestPayloadLimit: 16088 }); await started;
    reply('stats', { rttMs: 5, route: 'lan' });
    receive({ version: 1, hostGeneration: 7, requestId: request.requestId + 1, attemptId: 'a', kind: 'stats', rttMs: 9, route: 'lan' });   // another generation
    expect(seen.mock.calls).toEqual([['a', { rttMs: 5, route: 'lan' }]]);
    await owner.dispose();
  });
  it('the renderer channel answers validated figures to the trusted window only, and is removed with the rest', () => {
    const webContents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, send: vi.fn() });
    const win = Object.assign(new EventEmitter(), { webContents, isDestroyed: () => false, isVisible: () => true });
    let stats: unknown = { route: 'internet', rttMs: 48.5 };
    const owner: OnlineSessionOwner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
      mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: [] }),
      subscribe: () => () => {}, suspend: async () => {}, resume: async () => {}, prepareExit: async () => {}, dispose: async () => {}, linkStats: () => stats as never };
    const off = registerOnlineIpc(win as never, owner), event = { sender: webContents, senderFrame: webContents.mainFrame, ports: [] };
    const ask = (e: object = event, ...args: unknown[]) => native.handlers.get('online:link-stats')!(e, ...args);
    expect(ask()).toEqual({ route: 'internet', rttMs: 48.5 });
    expect(ask({ ...event, sender: {} })).toBeNull();
    expect(ask(event, 'extra')).toBeNull();
    stats = { route: 'internet', rttMs: 48.5, address: '203.0.113.9' }; expect(ask()).toBeNull();
    stats = null; expect(ask()).toBeNull();
    off(); expect(native.handlers.size).toBe(0);
  });
  it('the shared figures are exactly a route label and a bounded RTT', () => {
    expect(validateOnlineLinkStats({ route: 'lan', rttMs: 0 })).toBe(true);
    for (const bad of [null, { route: 'lan' }, { route: 'wan', rttMs: 1 }, { route: 'lan', rttMs: Number.NaN }, { route: 'lan', rttMs: 1, candidate: 'x' }]) expect(validateOnlineLinkStats(bad)).toBe(false);
  });
});
afterEach(() => native.handlers.clear());
````

Run: `npx vitest run tests/linkStats.test.ts`
Expected: FAIL (`src/network/rtc/route` does not exist).

- [ ] **Step 2: The route label and the hidden window's report**

Create `src/network/rtc/route.ts`:

````ts
// The route a connected RTC link takes (H-2 spec §8): 'lan' when the selected candidate pair is direct on the local
// network, 'internet' when it crosses a NAT or a relay. Only this label leaves the hidden transport window; candidate
// types and addresses never do.
import { rtcRecord } from '../../shared/rtcSession';

export type RtcRoute = 'lan' | 'internet';

/** A private, link-local, loopback or mDNS address: the far side is on this network. */
export function localAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const a = value.toLowerCase();
  if (a.endsWith('.local')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a);
  if (v4) { const [x, y] = [Number(v4[1]), Number(v4[2])]; return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254); }
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}
/** The route of a selected pair from its local and remote candidate stats records; null when it is unknown.
 *  Any relay, or a server-reflexive candidate on either side, is 'internet'; two host candidates are 'lan'. A
 *  peer-reflexive candidate (a LAN check that arrived before the candidate signal) is judged by its address. Chromium
 *  hides a remote one's address. Only on a direct attempt (no STUN or TURN servers configured, so neither side can have
 *  a server-reflexive or relay path) does a local host candidate at a private address decide 'lan'; otherwise the
 *  route is unknown rather than a guessed label. A private local address alone proves nothing behind a NAT. */
export function rtcRoute(local: unknown, remote: unknown, direct = false): RtcRoute | null {
  if (!rtcRecord(local) || !rtcRecord(remote)) return null;
  const types = [local.candidateType, remote.candidateType];
  if (!types.every(t => t === 'host' || t === 'srflx' || t === 'prflx' || t === 'relay')) return null;
  if (types.includes('relay') || types.includes('srflx')) return 'internet';
  const at = (c: Record<string, unknown>): unknown => c.address ?? c.ip;
  const judged = (c: Record<string, unknown>): RtcRoute | null => { const a = at(c); return typeof a === 'string' && a !== '' ? (localAddress(a) ? 'lan' : 'internet') : null; };
  const near = local.candidateType === 'prflx' ? judged(local) : 'lan';
  const far = remote.candidateType === 'prflx' ? judged(remote) ?? (direct && local.candidateType === 'host' && localAddress(at(local)) ? 'lan' : null) : 'lan';
  return near === 'internet' || far === 'internet' ? 'internet' : near === 'lan' && far === 'lan' ? 'lan' : null;
}
````

In `src/network/rtc/peer.ts`, replace:

````ts
import { createRtcDataLink } from './dataLink';
import type { MonotonicClock, PayloadClassifier, RtcDataChannel, Scheduler } from './contracts';
````

with:

````ts
import { createRtcDataLink } from './dataLink';
import { rtcRoute, type RtcRoute } from './route';
import type { MonotonicClock, PayloadClassifier, RtcDataChannel, Scheduler } from './contracts';
````

In `src/network/rtc/peer.ts`, replace:

````ts
  readonly ready: Promise<Link>; receiveSignal(signal: unknown): Promise<void>; close(reason: string): void; diagnostics(): LinkStats;
}
````

with:

````ts
  readonly ready: Promise<Link>; receiveSignal(signal: unknown): Promise<void>; close(reason: string): void; diagnostics(): LinkStats;
  /** The selected pair's route and RTT from the last stats sample (H-2 spec §8), each null before one or when unknown
   *  (a missing currentRoundTripTime is null, not 0); never a candidate or address. */
  linkFigures?(): { route: RtcRoute | null; rttMs: number | null };
}
````

In `src/network/rtc/peer.ts`, replace:

````ts
  let cancelSetup: (() => void) | undefined, cancelStats: (() => void) | undefined;
  let chain = Promise.resolve(), sampled = { rttMs: 0, lossPct: 0, relayed: false };
  let resolveReady!: (link: Link) => void, rejectReady!: (reason: Error) => void;
````

with:

````ts
  let cancelSetup: (() => void) | undefined, cancelStats: (() => void) | undefined;
  let chain = Promise.resolve(), sampled = { rttMs: 0, lossPct: 0, relayed: false }, route: RtcRoute | null = null, rtt: number | null = null;
  let resolveReady!: (link: Link) => void, rejectReady!: (reason: Error) => void;
````

In `src/network/rtc/peer.ts`, replace:

````ts
        sampled={rttMs:finite(pair.currentRoundTripTime,60)*1000,lossPct:received+lost>0?100*lost/(received+lost):0,relayed:(rtcRecord(local)&&local.candidateType==='relay') || (rtcRecord(remote)&&remote.candidateType==='relay')};
      }
    }catch{} finally{if(alive())scheduleStats();}
  }
  const api: RtcPeer={ready,receiveSignal,close:()=>fail('rtc-closed'),diagnostics};
  try {
````

with:

````ts
        sampled={rttMs:finite(pair.currentRoundTripTime,60)*1000,lossPct:received+lost>0?100*lost/(received+lost):0,relayed:(rtcRecord(local)&&local.candidateType==='relay') || (rtcRecord(remote)&&remote.candidateType==='relay')};
        const seconds=pair.currentRoundTripTime;
        route=rtcRoute(local,remote,iceServers.length===0); rtt=typeof seconds==='number' && Number.isFinite(seconds) && seconds>=0 && seconds<=60?seconds*1000:null;
      }
    }catch{} finally{if(alive())scheduleStats();}
  }
  const api: RtcPeer={ready,receiveSignal,close:()=>fail('rtc-closed'),diagnostics,linkFigures:()=>({route,rttMs:rtt})};
  try {
````

In `src/shared/rtcSession.ts`, replace:

````ts
  | { kind: 'ready'; latestPayloadLimit: number }
  | { kind: 'signal'; signal: RtcSignal });
export function validRtcCap(value: unknown): value is number {
````

with:

````ts
  | { kind: 'ready'; latestPayloadLimit: number }
  | { kind: 'signal'; signal: RtcSignal }
  /** A ready attempt's link figures (H-2 spec §8): the selected pair's RTT and its route label, never a candidate. */
  | { kind: 'stats'; rttMs: number; route: 'lan' | 'internet' });
export function validRtcCap(value: unknown): value is number {
````

In `src/shared/rtcSession.ts`, replace:

````ts
  if (value.kind === 'ready') return rtcKeys(value, [...stamp,'latestPayloadLimit']) && validRtcCap(value.latestPayloadLimit);
  return value.kind === 'signal' && rtcKeys(value, [...stamp,'signal']) && isRtcSignal(value.signal) && value.signal.attemptId === value.attemptId;
````

with:

````ts
  if (value.kind === 'ready') return rtcKeys(value, [...stamp,'latestPayloadLimit']) && validRtcCap(value.latestPayloadLimit);
  if (value.kind === 'stats') return rtcKeys(value, [...stamp,'rttMs','route']) && typeof value.rttMs === 'number' && Number.isFinite(value.rttMs)
    && value.rttMs >= 0 && value.rttMs <= 60000 && (value.route === 'lan' || value.route === 'internet');
  return value.kind === 'signal' && rtcKeys(value, [...stamp,'signal']) && isRtcSignal(value.signal) && value.signal.attemptId === value.attemptId;
````

In `src/network/transport/controller.ts`, replace:

````ts
}
/** Generic bridge: receipts, validated ACKs and opaque mode payloads pass unchanged. */
````

with:

````ts
}
/** How often a ready attempt reports its link figures to main. */
export const STATS_MS = 1000;
/** Generic bridge: receipts, validated ACKs and opaque mode payloads pass unchanged. */
````

In `src/network/transport/controller.ts`, replace:

````ts
        respond({ ...stamp, kind: 'ready', latestPayloadLimit: link.caps.maxDatagram });
      }, close);
````

with:

````ts
        respond({ ...stamp, kind: 'ready', latestPayloadLimit: link.caps.maxDatagram });
        // The link figures (H-2 spec §8) once a second: the RTT and the route label only, once the peer has sampled both.
        let cancelStats = () => {};
        const report = () => {
          if (closed) return;
          const { route, rttMs } = peer!.linkFigures?.() ?? { route: null, rttMs: null };
          if (route && rttMs !== null && Number.isFinite(rttMs) && rttMs >= 0 && rttMs <= 60000) respond({ ...stamp, kind: 'stats', rttMs: Math.round(rttMs * 10) / 10, route });
          cancelStats = scheduler.schedule(STATS_MS, report);
        };
        cancelStats = scheduler.schedule(STATS_MS, report);
        subscribe(() => () => cancelStats());
      }, close);
````

- [ ] **Step 3: Main keeps the figures and answers the renderer's channel**

In `src/main/network/rtcTransport.ts`, replace:

````ts
type Unsubscribe = () => void;
export type { RtcAttemptOptions } from '../../shared/rtcSession';
````

with:

````ts
type Unsubscribe = () => void;
export interface RtcLinkStats { rttMs: number; route: 'lan' | 'internet' }
export type { RtcAttemptOptions } from '../../shared/rtcSession';
````

In `src/main/network/rtcTransport.ts`, replace:

````ts
  onAttemptClosed(callback: (attemptId: string) => void): Unsubscribe;
  closeAttempt(attemptId: string): Promise<void>;
````

with:

````ts
  onAttemptClosed(callback: (attemptId: string) => void): Unsubscribe;
  /** A ready attempt's link figures (H-2 spec §8), about once a second: its RTT and route label. */
  onStats?(callback: (attemptId: string, stats: RtcLinkStats) => void): Unsubscribe;
  closeAttempt(attemptId: string): Promise<void>;
````

In `src/main/network/rtcTransport.ts`, replace:

````ts
  const closedObservers = new Set<(attemptId: string) => void>();
  type Attempt = { id: string; generation: number; remote: string; port: MessagePortMain; portReady: boolean; ready: boolean;
````

with:

````ts
  const closedObservers = new Set<(attemptId: string) => void>();
  const statsObservers = new Set<(attemptId: string, stats: RtcLinkStats) => void>();
  type Attempt = { id: string; generation: number; remote: string; port: MessagePortMain; portReady: boolean; ready: boolean;
````

In `src/main/network/rtcTransport.ts`, replace:

````ts
      entry.ready = true; clearTimeout(entry.timer); entry.resolve({ latestPayloadLimit: value.latestPayloadLimit }); return;
    }
````

with:

````ts
      entry.ready = true; clearTimeout(entry.timer); entry.resolve({ latestPayloadLimit: value.latestPayloadLimit }); return;
    }
    if (value.kind === 'stats') {
      if (!entry.ready) return;
      for (const callback of [...statsObservers]) { try { callback(entry.id, { rttMs: value.rttMs, route: value.route }); } catch {} }
      return;
    }
````

In `src/main/network/rtcTransport.ts`, replace:

````ts
    },
    closeAttempt(attemptId) {
````

with:

````ts
    },
    onStats(callback) {
      if (!disposed) { if (statsObservers.size >= 64) throw Error('rtc-observer-capacity'); statsObservers.add(callback); }
      return () => { statsObservers.delete(callback); };
    },
    closeAttempt(attemptId) {
````

In `src/main/network/rtcTransport.ts`, replace:

````ts
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('rtc-disposed')); } pending.clear();
      observers.clear(); closedObservers.clear(); usedIds.clear(); wire.dispose();
    }
````

with:

````ts
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('rtc-disposed')); } pending.clear();
      observers.clear(); closedObservers.clear(); statsObservers.clear(); usedIds.clear(); wire.dispose();
    }
````

In `src/shared/onlineSession.ts`, replace:

````ts
export type OnlineResult = { ok: true } | { ok: false; code: OnlineErrorCode };

````

with:

````ts
export type OnlineResult = { ok: true } | { ok: false; code: OnlineErrorCode };
/** A peer link's figures for the playtest record and the F3 overlay (H-2 spec §8, §9): the route label of its selected
 *  candidate pair ('lan' for a direct local pair, 'internet' through a NAT or relay) and its RTT. Never a candidate,
 *  address or credential. */
export interface OnlineLinkStats { route: 'lan' | 'internet'; rttMs: number }
export function validateOnlineLinkStats(value: unknown): value is OnlineLinkStats {
  return rtcRecord(value) && rtcKeys(value, ['route', 'rttMs']) && (value.route === 'lan' || value.route === 'internet')
    && typeof value.rttMs === 'number' && Number.isFinite(value.rttMs) && value.rttMs >= 0 && value.rttMs <= 60000;
}

````

In `src/shared/onlineSession.ts`, replace:

````ts
export const ONLINE_PORT_SOURCE = 'ftlite:online:main';
export interface OnlineStatusEnvelope { version: 1; revision: number; status: OnlineStatus }
````

with:

````ts
export const ONLINE_PORT_SOURCE = 'ftlite:online:main';
/** The link figures channel (H-2 spec §8): no argument; answers OnlineLinkStats or null. */
export const ONLINE_LINK_STATS_CHANNEL = 'online:link-stats';
export interface OnlineStatusEnvelope { version: 1; revision: number; status: OnlineStatus }
````

In `src/shared/onlineSession.ts`, replace:

````ts
  onStatus(callback: (value: OnlineStatusEnvelope) => void): Unsubscribe;
}
````

with:

````ts
  onStatus(callback: (value: OnlineStatusEnvelope) => void): Unsubscribe;
  /** This machine's newest peer link figures, or null with no ready link (H-2 spec §8). */
  linkStats?(): Promise<OnlineLinkStats | null>;
}
````

In `src/main/network/onlineSession.ts`, replace:

````ts
import { RTC_MAX_HEADER_BYTES, RTC_MAX_PACKET_BYTES } from '../../network/rtc/contracts';
import { copyOnlineStatus, isOnlineErrorCode, validateOnlineAction, type OnlineAction, type OnlineErrorCode, type OnlinePortDescriptor, type OnlineResult, type OnlineStatus } from '../../shared/onlineSession';
import { SERVICE_ERROR_RETRYABLE, type CommittedStart, type LeaseGrant, type RoomSnapshot, type SeatSession } from '../../shared/roomSession';
````

with:

````ts
import { RTC_MAX_HEADER_BYTES, RTC_MAX_PACKET_BYTES } from '../../network/rtc/contracts';
import { copyOnlineStatus, isOnlineErrorCode, validateOnlineAction, type OnlineAction, type OnlineErrorCode, type OnlineLinkStats, type OnlinePortDescriptor, type OnlineResult, type OnlineStatus } from '../../shared/onlineSession';
import { SERVICE_ERROR_RETRYABLE, type CommittedStart, type LeaseGrant, type RoomSnapshot, type SeatSession } from '../../shared/roomSession';
````

In `src/main/network/onlineSession.ts`, replace:

````ts
  subscribe(callback: (status: OnlineStatus) => void): Unsubscribe; suspend(): Promise<void>; resume(): Promise<void>; prepareExit(): Promise<void>; dispose(): Promise<void>;
}
const codeOf = (error: unknown): OnlineErrorCode => {
````

with:

````ts
  subscribe(callback: (status: OnlineStatus) => void): Unsubscribe; suspend(): Promise<void>; resume(): Promise<void>; prepareExit(): Promise<void>; dispose(): Promise<void>;
  /** The newest link figures of a ready peer link (H-2 spec §8): its route and RTT; null with none, or older than 5 s. */
  linkStats?(): OnlineLinkStats | null;
}
/** Link figures older than this are not reported (the link has gone quiet or been replaced). */
export const LINK_STATS_MAX_AGE_MS = 5000;
const codeOf = (error: unknown): OnlineErrorCode => {
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    starting?: Promise<void>; committedHash?: string; active: boolean; authorityReady?: boolean; recovering: boolean; attached: Set<string>;
    synced?: () => void; syncedPromise?: Promise<void>; lease?: LeaseGrant; cleanup?: Promise<void>; mirrors?: OnlineMirrors; renewal?: AbortController; explicitStart?: boolean; captureWork?: Promise<void>; graceful?: Promise<void> };
  let context: Context | undefined;
````

with:

````ts
    starting?: Promise<void>; committedHash?: string; active: boolean; authorityReady?: boolean; recovering: boolean; attached: Set<string>;
    synced?: () => void; syncedPromise?: Promise<void>; link?: { attemptId: string; stats: OnlineLinkStats; atMs: number }; lease?: LeaseGrant; cleanup?: Promise<void>; mirrors?: OnlineMirrors; renewal?: AbortController; explicitStart?: boolean; captureWork?: Promise<void>; graceful?: Promise<void> };
  let context: Context | undefined;
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    c.gameRemovers.push(transport.onExit(() => { if (c.transport === transport) fail(c, 'transport-lost'); }));
    if (!config.enabled) throw onlineFault('online-disabled');
````

with:

````ts
    c.gameRemovers.push(transport.onExit(() => { if (c.transport === transport) fail(c, 'transport-lost'); }));
    c.gameRemovers.push(transport.controller.onStats?.((attemptId, stats) => { if (c.transport === transport) c.link = { attemptId, stats: { route: stats.route, rttMs: stats.rttMs }, atMs: clock.nowMs() }; }) ?? (() => {}));
    if (!config.enabled) throw onlineFault('online-disabled');
````

In `src/main/network/onlineSession.ts`, replace:

````ts
    prepareExit,
    dispose() { if (disposal) return disposal; offVisible(); disposal = prepareExit().then(() => { disposed = true; listeners.clear(); }); return disposal; }
````

with:

````ts
    prepareExit,
    linkStats() {
      const c = context, link = c?.link;
      if (!c || !link || !current(c) || clock.nowMs() - link.atMs > LINK_STATS_MAX_AGE_MS || !c.peers?.ready().some(p => p.attemptId === link.attemptId)) return null;
      return { ...link.stats };
    },
    dispose() { if (disposal) return disposal; offVisible(); disposal = prepareExit().then(() => { disposed = true; listeners.clear(); }); return disposal; }
````

In `src/main/network/onlineIpc.ts`, replace:

````ts
import { ipcMain, powerMonitor, type BrowserWindow, type IpcMainInvokeEvent, type MessagePortMain } from 'electron';
import { copyOnlineStatus, ONLINE_CHANNELS, ONLINE_STATUS_CHANNEL, validateOnlineAction, validateOnlineResult,
  type OnlineStatus, type OnlineStatusEnvelope, type Unsubscribe } from '../../shared/onlineSession';
````

with:

````ts
import { ipcMain, powerMonitor, type BrowserWindow, type IpcMainInvokeEvent, type MessagePortMain } from 'electron';
import { copyOnlineStatus, ONLINE_CHANNELS, ONLINE_LINK_STATS_CHANNEL, ONLINE_STATUS_CHANNEL, validateOnlineAction, validateOnlineLinkStats, validateOnlineResult,
  type OnlineStatus, type OnlineStatusEnvelope, type Unsubscribe } from '../../shared/onlineSession';
````

In `src/main/network/onlineIpc.ts`, replace:

````ts
  });
  const unsubscribe = owner.subscribe(status => {
````

with:

````ts
  });
  ipcMain.handle(ONLINE_LINK_STATS_CHANNEL, (event, ...args: unknown[]) => {
    if (!trusted(event) || args.length) return null;
    try { const stats = owner.linkStats?.() ?? null; return validateOnlineLinkStats(stats) ? { route: stats.route, rttMs: stats.rttMs } : null; } catch { return null; }
  });
  const unsubscribe = owner.subscribe(status => {
````

In `src/main/network/onlineIpc.ts`, replace:

````ts
    if (removed) return; removed = true; registered = undefined;
    for (const channel of [...Object.values(ONLINE_CHANNELS), ONLINE_STATUS_CHANNEL]) ipcMain.removeHandler(channel);
    unsubscribe(); powerMonitor.off('suspend', suspend); powerMonitor.off('resume', resume);
````

with:

````ts
    if (removed) return; removed = true; registered = undefined;
    for (const channel of [...Object.values(ONLINE_CHANNELS), ONLINE_STATUS_CHANNEL, ONLINE_LINK_STATS_CHANNEL]) ipcMain.removeHandler(channel);
    unsubscribe(); powerMonitor.off('suspend', suspend); powerMonitor.off('resume', resume);
````

In `src/preload/index.ts`, replace:

````ts
import { contextBridge, ipcRenderer } from 'electron';
import { copyOnlinePortDescriptor, DUEL_RECORD_CHANNEL, ONLINE_CHANNELS, ONLINE_PORT_CHANNEL, ONLINE_PORT_SOURCE, ONLINE_STATUS_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  validateOnlineAction, validateOnlinePortEnvelope, validateOnlineResult, validateOnlineStatusEnvelope,
  type FtlitePreloadApi, type OnlineAction, type OnlineResult, type Unsubscribe } from '../shared/onlineSession';
````

with:

````ts
import { contextBridge, ipcRenderer } from 'electron';
import { copyOnlinePortDescriptor, DUEL_RECORD_CHANNEL, ONLINE_CHANNELS, ONLINE_LINK_STATS_CHANNEL, ONLINE_PORT_CHANNEL, ONLINE_PORT_SOURCE, ONLINE_STATUS_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  validateOnlineAction, validateOnlineLinkStats, validateOnlinePortEnvelope, validateOnlineResult, validateOnlineStatusEnvelope,
  type FtlitePreloadApi, type OnlineAction, type OnlineResult, type Unsubscribe } from '../shared/onlineSession';
````

In `src/preload/index.ts`, replace:

````ts
    },
    onStatus(callback) {
````

with:

````ts
    },
    async linkStats() {
      try { const value: unknown = await ipcRenderer.invoke(ONLINE_LINK_STATS_CHANNEL); return validateOnlineLinkStats(value) ? { route: value.route, rttMs: value.rttMs } : null; }
      catch { return null; }
    },
    onStatus(callback) {
````

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run tests/linkStats.test.ts tests/rtcBridge.test.ts tests/rtcTransportOwner.test.ts tests/rtcPeer.test.ts tests/onlineIpc.test.ts tests/onlineSessionContract.test.ts tests/networkBoundary.test.ts tests/onlineCoordinator.test.ts`
Expected: PASS, 229 tests in 8 files (`linkStats` 7, `rtcBridge` 9, `rtcTransportOwner` 9, `rtcPeer` 58, `onlineIpc` 15, `onlineSessionContract` 58, `networkBoundary` 39, `onlineCoordinator` 34).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```
git add src/network/rtc/route.ts src/network/rtc/peer.ts src/shared/rtcSession.ts src/network/transport/controller.ts src/main/network/rtcTransport.ts src/shared/onlineSession.ts src/main/network/onlineSession.ts src/main/network/onlineIpc.ts src/preload/index.ts tests/linkStats.test.ts
git commit -m "H-2b-i task 1: the link figures (route label and RTT) from the hidden RTC window to the renderer"
```

---

### Task 2: The renderer: the record's link figures, F3 and Single player's solo records

**Files:**
- Create: `src/renderer/src/render/duel/latencyOverlay.ts`, `tests/latencyOverlay.test.ts`
- Modify: `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/net/duelRecord.ts`, `src/renderer/src/app/duel/duelMode.ts`, `src/renderer/src/main.ts`, `tests/onlineDuelSession.test.ts`, `tests/duelRuntime.test.ts`

**Interfaces:**
- Consumes: Task 1's `OnlinePreloadApi.linkStats?()`; the authority's `createTelemetry`, `recordTick`, `duelEndSummary` and `duelRoundRecord`.
- Produces:
  - `latencyOverlay.ts`: `OVERLAY_CODE`, `LatencyOverlayModel`, `latencyOverlayLines`, `KeyTarget`, `createKeyToggle`, `createLatencyOverlay`, `LatencyOverlay`.
  - `onlineDuel.ts`: `LINK_POLL_MS`, `LIVE_SAMPLES`, and `OnlineDuelDeps.api` now `Pick<OnlinePreloadApi, 'viewState' | 'linkStats'>`.
  - `runtime.ts`: `DuelRuntimeDeps.onRound?`.
  - `duelRecord.ts`: `soloDuelRecord`.
  - `duelMode.ts`: `DuelModeDeps.recordDuel?`.

- [ ] **Step 1: Write the failing tests**

Create `tests/latencyOverlay.test.ts`:

````ts
// The F3 latency overlay (H-2 spec §9): its pure lines and its key switch. The Pixi draw is one text block and is
// seen in the duel smoke's screenshots.
import { describe, expect, it } from 'vitest';
import { createKeyToggle, latencyOverlayLines, OVERLAY_CODE } from '../src/renderer/src/render/duel/latencyOverlay';
import { latencyFigure } from '../src/renderer/src/net/duelRecord';

function target() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener(type: string, fn: (e: unknown) => void) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener(type: string, fn: (e: unknown) => void) { listeners.get(type)?.delete(fn); },
    key(code: string, repeat = false) { let prevented = false; for (const fn of [...(listeners.get('keydown') ?? [])]) fn({ code, repeat, preventDefault() { prevented = true; } }); return prevented; },
    count: () => listeners.get('keydown')?.size ?? 0
  };
}
describe('the F3 latency overlay (spec §9)', () => {
  it('reads the live median and p95 of both delays, the route and the RTT', () => {
    expect(latencyOverlayLines({ transport: 'lan', held: latencyFigure([40, 50, 60, 70, 200]), command: latencyFigure([]), rttMs: 3.4 })).toEqual([
      'LATENCY  LAN   F3: HIDE', 'HELD n 5  MED 60  P95 200  MAX 200 MS', 'CMD  n 0  MED -  P95 -  MAX - MS', 'RTT 3 MS']);
    expect(latencyOverlayLines({ transport: null, held: latencyFigure([]), command: latencyFigure([12.6]), rttMs: null })[0]).toBe('LATENCY  LINK ?   F3: HIDE');
  });
  it('F3 flips the switch once per press, ignores auto-repeat and other keys, and lets go on destroy', () => {
    const t = target(), toggle = createKeyToggle(t as never);
    expect(OVERLAY_CODE).toBe('F3');
    expect(toggle.on()).toBe(false);
    expect(t.key('F3')).toBe(true); expect(toggle.on()).toBe(true);
    t.key('F3', true); expect(toggle.on()).toBe(true);
    expect(t.key('KeyF')).toBe(false); expect(toggle.on()).toBe(true);
    t.key('F3'); expect(toggle.on()).toBe(false);
    toggle.destroy(); expect(t.count()).toBe(0);
  });
});
````

In `tests/onlineDuelSession.test.ts`, replace:

````ts

function rig(seat: 0 | 1) {
  let now = 1000, pending: (() => void) | null = null;
````

with:

````ts

function rig(seat: 0 | 1, api: object = {}) {
  let now = 1000, pending: (() => void) | null = null;
````

In `tests/onlineDuelSession.test.ts`, replace:

````ts
    scheduler: { schedule: (_ms, cb) => { pending = cb; return () => { if (pending === cb) pending = null; }; } },
    api: { viewState: async () => ({ ok: true }) } as never, leave, recordDuel: (r) => { records.push(r); }
  });
````

with:

````ts
    scheduler: { schedule: (_ms, cb) => { pending = cb; return () => { if (pending === cb) pending = null; }; } },
    api: { viewState: async () => ({ ok: true }), ...api } as never, leave, recordDuel: (r) => { records.push(r); }
  });
````

In `tests/onlineDuelSession.test.ts`, replace:

````ts
  });
});
````

with:

````ts
  });
  it("labels each record with the link main reports: the guest's route and the round's median RTT; the host reads loopback (H-2b)", async () => {
    const flush = () => new Promise((done) => setTimeout(done, 0));
    for (const [seat, role] of [[1, 'guest'], [0, 'host']] as const) {
      let stats: { route: 'lan' | 'internet'; rttMs: number } | null = null;
      const r = rig(seat, { linkStats: async () => stats }), c = r.attach();
      await flush();   // the attach-time poll (no figures yet) settles, so every sample below is taken
      r.session.setStatus({ phase: 'running', role } as OnlineStatus);
      // 1001 ms per step: a 1000 ms step can land a float hair under LINK_POLL_MS and skip a poll. The median (60)
      // differs from the first (90) and last (70) samples.
      for (const ms of [90, 60, 40, 50, 70]) { stats = { route: 'internet', rttMs: ms }; r.pump(1001); await flush(); }
      c.events.push(roundEvent(0)); r.pump(); await flush();
      stats = null; r.pump(1000); await flush();   // main has no figures now: the label stays, the next round has no RTT
      c.events.push(roundEvent(1)); r.pump();
      expect(r.records.map((x) => [x.role, x.transport, x.latency.rttMs])).toEqual(role === 'guest'
        ? [['guest', 'internet', 60], ['guest', 'internet', null]] : [['host', 'loopback', 60], ['host', 'loopback', null]]);
      r.dispose();
    }
  });
  it("without a link figure the guest's transport stays null, as in H-2a", () => {
    const r = rig(1), c = r.attach();
    c.events.push(roundEvent(0)); r.pump();
    expect([r.records[0]!.transport, r.records[0]!.latency.rttMs]).toEqual([null, null]);
    r.dispose();
  });
});
````

In `tests/duelRuntime.test.ts`, replace:

````ts
import { interpolatedMissile } from '../src/renderer/src/render/tactical/fxModel';

````

with:

````ts
import { interpolatedMissile } from '../src/renderer/src/render/tactical/fxModel';
import type { DuelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { soloDuelRecord, validateDuelRecord } from '../src/renderer/src/net/duelRecord';

````

In `tests/duelRuntime.test.ts`, replace:

````ts
/** Scripted keys: the test sets held keys and presses, `frame()` samples them once and runs due ticks. */
function rig(seed = 5) {
  const time = fakeTime();
````

with:

````ts
/** Scripted keys: the test sets held keys and presses, `frame()` samples them once and runs due ticks. */
function rig(seed = 5, onRound?: (record: DuelRoundRecord) => void) {
  const time = fakeTime();
````

In `tests/duelRuntime.test.ts`, replace:

````ts
    samplePointer: () => ({ ...pointer }),
    clearKeys: () => { keys = idle(); cleared++; }
  });
````

with:

````ts
    samplePointer: () => ({ ...pointer }),
    clearKeys: () => { keys = idle(); cleared++; }, onRound
  });
````

In `tests/duelRuntime.test.ts`, replace:

````ts
  });
  it('the end card sends neutral held input, as online does (H-2 spec §3, §7)', () => {
````

with:

````ts
  });
  it('hands each decided round to onRound once, from a fresh accumulator per round, as a valid solo record (H-2b)', () => {
    const rounds: DuelRoundRecord[] = [], { time, rt, press, tick, ticks } = rig(7, (r) => rounds.push(r));
    ticks(330);   // player 1 is away from Weapons all round (the solo start)
    rt.duel.tactical.systems[1].hull = 0; tick();
    const decided = rt.duel.decidedTick;
    time.advance(1000); rt.frame(1 / 60);   // the end card's ticks add nothing
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ round: 0, seed: 7, baseTick: 0, outcome: Outcome.CrewWins, ticks: decided });
    press('confirm'); tick(); tick();
    ticks(120); rt.duel.tactical.systems[1].hull = 0; tick();
    expect(rounds).toHaveLength(2);
    expect(rounds[1]).toMatchObject({ round: 1, seed: followingSeed(7), baseTick: rt.duel.baseTick, ticks: rt.duel.decidedTick - rt.duel.baseTick });
    expect([rounds[0]!.weaponsEmptyTicks, rounds[1]!.weaponsEmptyTicks]).toEqual([rounds[0]!.ticks, rounds[1]!.ticks]);   // counted per round, not carried over
    const record = soloDuelRecord(rounds[1]!, { seat: 0, helmPlayer: 0, startedAtIso: '2026-11-16T12:00:00.000Z', pauses: 2 });
    expect(validateDuelRecord(record)).toMatchObject({ session: 'solo', role: 'host', transport: null, round: 1, latency: { held: { count: 0 }, rttMs: null }, disconnects: 0, pauses: 2 });
    rt.dispose();
  });
  it('the end card sends neutral held input, as online does (H-2 spec §3, §7)', () => {
````

Run: `npx vitest run tests/latencyOverlay.test.ts tests/onlineDuelSession.test.ts tests/duelRuntime.test.ts`
Expected: FAIL (`render/duel/latencyOverlay` and `soloDuelRecord` do not exist).

- [ ] **Step 2: The F3 overlay**

Create `src/renderer/src/render/duel/latencyOverlay.ts`:

````ts
// The F3 latency overlay (H-2 spec §9): the live median and 95th percentile of the held and command delays on either
// machine of an online duel, with the link's route and RTT. One self-contained module: `latencyOverlayLines` is the pure
// model (plain strings, so a React view can render the same lines), `createLatencyOverlay` is the thin Pixi draw on
// the stage above the duel scene, and `createKeyToggle` is the F3 switch. The duel scene itself is not touched.
import { BitmapText, type Container } from 'pixi.js';
import type { LatencyFigure } from '../../net/duelRecord';
import { FONT_NATIVE, TEXT } from '../theme';

/** The key that shows and hides the overlay. */
export const OVERLAY_CODE = 'F3';
export interface LatencyOverlayModel {
  transport: 'loopback' | 'lan' | 'internet' | null;
  held: LatencyFigure; command: LatencyFigure;
  rttMs: number | null;
}
const ms = (v: number | null): string => (v === null ? '-' : `${Math.round(v)}`);
const row = (label: string, f: LatencyFigure): string => `${label} n ${f.count}  MED ${ms(f.median)}  P95 ${ms(f.p95)}  MAX ${ms(f.max)} MS`;
/** The overlay's lines: the route, the held delay, the command delay and the RTT. */
export function latencyOverlayLines(m: LatencyOverlayModel): string[] {
  return [`LATENCY  ${m.transport === null ? 'LINK ?' : m.transport.toUpperCase()}   F3: HIDE`, row('HELD', m.held), row('CMD ', m.command), `RTT ${ms(m.rttMs)} MS`];
}

/** The structural subset of a DOM event target the toggle needs. */
export interface KeyTarget {
  addEventListener(type: string, fn: (e: never) => void): void;
  removeEventListener(type: string, fn: (e: never) => void): void;
}
/** A key that flips a switch on each press (auto-repeat ignored); starts off. */
export function createKeyToggle(target: KeyTarget, code = OVERLAY_CODE) {
  let on = false;
  const down = (e: { code: string; repeat: boolean; preventDefault(): void }): void => {
    if (e.code !== code) return;
    e.preventDefault();
    if (!e.repeat) on = !on;
  };
  target.addEventListener('keydown', down as (e: never) => void);
  return { on: () => on, destroy(): void { target.removeEventListener('keydown', down as (e: never) => void); } };
}

/** The Pixi draw: one text block in the top-left corner, added to `stage` last so it sits over the duel scene. */
export function createLatencyOverlay(stage: Container, fontFamily: string) {
  const text = new BitmapText({ text: '', style: { fontFamily, fontSize: FONT_NATIVE } });
  text.tint = TEXT; text.position.set(12, 12); text.visible = false;
  stage.addChild(text);
  return {
    /** Show `lines`, or hide the overlay with null. */
    draw(lines: readonly string[] | null): void {
      text.visible = lines !== null;
      if (lines) { const next = lines.join('\n'); if (text.text !== next) text.text = next; }
    },
    destroy(): void { stage.removeChild(text); text.destroy(); }
  };
}
export type LatencyOverlay = ReturnType<typeof createLatencyOverlay>;
````

- [ ] **Step 3: The online duel's link figures and F3**

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
// at 60 Hz, independently of Pixi. Keyboard and mouse only; Tab does nothing online (one character per machine). Each
// decided round is written as a playtest record through the preload.
import type { OnlinePortDescriptor, OnlinePreloadApi, OnlineStatus } from '../../../../shared/onlineSession';
````

with:

````ts
// at 60 Hz, independently of Pixi. Keyboard and mouse only; Tab does nothing online (one character per machine). Each
// decided round is written as a playtest record through the preload, with the link's route and RTT read from main
// about once a second (H-2b); F3 shows the live latency overlay over the scene.
import type { OnlinePortDescriptor, OnlinePreloadApi, OnlineStatus } from '../../../../shared/onlineSession';
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
import { endModel } from '../../render/duel/endScreen';
import { snapBack } from '../../render/tactical/camera';
````

with:

````ts
import { endModel } from '../../render/duel/endScreen';
import { createKeyToggle, createLatencyOverlay, latencyOverlayLines, type KeyTarget, type LatencyOverlay } from '../../render/duel/latencyOverlay';
import { snapBack } from '../../render/tactical/camera';
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
  renderer: Renderer; now(): number; scheduler: Scheduler; contentDigest: string; resolveLayout(id: string): ShipLayout;
  api: Pick<OnlinePreloadApi, 'viewState'>;
  /** Leave the online session as the menu's Leave does (Escape on the end card, then Enter). */
````

with:

````ts
  renderer: Renderer; now(): number; scheduler: Scheduler; contentDigest: string; resolveLayout(id: string): ShipLayout;
  api: Pick<OnlinePreloadApi, 'viewState' | 'linkStats'>;
  /** Leave the online session as the menu's Leave does (Escape on the end card, then Enter). */
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
const NOTICE_MS = 3000;
const keysOnly = (k: KeySample): KeySample => ({ ...k, presses: { ...emptyPresses(), zoomIn: k.presses.zoomIn, zoomOut: k.presses.zoomOut } });
````

with:

````ts
const NOTICE_MS = 3000;
/** How often the session asks main for the link's figures, and how many recent samples the F3 overlay reads. */
export const LINK_POLL_MS = 1000, LIVE_SAMPLES = 300;
const keysOnly = (k: KeySample): KeySample => ({ ...k, presses: { ...emptyPresses(), zoomIn: k.presses.zoomIn, zoomOut: k.presses.zoomOut } });
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
  const heldStamps: { sequence: number; at: number }[] = [], commandStamps = new Map<number, number>(), heldSamples: number[] = [], commandSamples: number[] = [], roundGaps: number[] = [];
  function sampleIdle(): KeySample { return { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }; }
````

with:

````ts
  const heldStamps: { sequence: number; at: number }[] = [], commandStamps = new Map<number, number>(), heldSamples: number[] = [], commandSamples: number[] = [], roundGaps: number[] = [];
  // The link (H-2b): the route label and RTT from main, the round's RTT samples; the overlay's recent delays.
  const liveHeld: number[] = [], liveCommand: number[] = [], roundRtt: number[] = [], debug = createKeyToggle(window as unknown as KeyTarget);
  let route: 'lan' | 'internet' | null = null, rttMs: number | null = null, lastPoll = -Infinity, polling = false, overlay: LatencyOverlay | null = null;
  const sample = (round: number[], recent: number[], ms: number): void => { round.push(ms); recent.push(ms); if (recent.length > LIVE_SAMPLES) recent.shift(); };
  const transport = (): DuelPlaytestRecord['transport'] => (status?.role === 'host' ? 'loopback' : route);
  function pollLink(): void {
    const now = deps.now();
    if (!deps.api.linkStats || polling || now - lastPoll < LINK_POLL_MS) return;
    polling = true; lastPoll = now;
    void deps.api.linkStats().then((s) => {
      if (disposed || !s) return;
      route = s.route; rttMs = s.rttMs; roundRtt.push(s.rttMs); if (roundRtt.length > 4096) roundRtt.shift();
    }, () => {}).finally(() => { polling = false; });
  }
  function sampleIdle(): KeySample { return { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }; }
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
    const d = state(); if (!d || !descriptor) return;
    const r: DuelPlaytestRecord = { version: 1, session: 'online', role: status?.role === 'host' ? 'host' : 'guest', transport: status?.role === 'host' ? 'loopback' : null,
      seat: descriptor.seatId as 0 | 1, helmPlayer: d.helmPlayer, seed: summary.seed, round: summary.round, startedAtIso,
      // rttMs is null in H-2a: the renderer's port link has no network RTT (H-2b reads the RTC window's stats).
      summary, latency: { held: latencyFigure(heldSamples), command: latencyFigure(commandSamples), rttMs: null },
      // Per round: the disconnects and pauses since the last record (the first attach is not a disconnect).
````

with:

````ts
    const d = state(); if (!d || !descriptor) return;
    const r: DuelPlaytestRecord = { version: 1, session: 'online', role: status?.role === 'host' ? 'host' : 'guest', transport: transport(),
      seat: descriptor.seatId as 0 | 1, helmPlayer: d.helmPlayer, seed: summary.seed, round: summary.round, startedAtIso,
      // The RTT is the median of the round's samples from the RTC window's stats (null when main reported none).
      summary, latency: { held: latencyFigure(heldSamples), command: latencyFigure(commandSamples), rttMs: latencyFigure(roundRtt.splice(0)).median },
      // Per round: the disconnects and pauses since the last record (the first attach is not a disconnect).
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
    const now = deps.now();
    if (fresh) while (heldStamps.length && heldStamps[0]!.sequence <= p.heldHighWater[descriptor.seatId]!) heldSamples.push(now - heldStamps.shift()!.at);
    for (const result of client.takeResults()) {
      const at = result.id.player === descriptor.seatId ? commandStamps.get(result.id.sequence) : undefined;
      if (at !== undefined) { commandStamps.delete(result.id.sequence); if (result.status === 'applied') commandSamples.push(now - at); }
    }
````

with:

````ts
    const now = deps.now();
    if (fresh) while (heldStamps.length && heldStamps[0]!.sequence <= p.heldHighWater[descriptor.seatId]!) sample(heldSamples, liveHeld, now - heldStamps.shift()!.at);
    for (const result of client.takeResults()) {
      const at = result.id.player === descriptor.seatId ? commandStamps.get(result.id.sequence) : undefined;
      if (at !== undefined) { commandStamps.delete(result.id.sequence); if (result.status === 'applied') sample(commandSamples, liveCommand, now - at); }
    }
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
    if (disposed) return;
    observe();
    const k = keyboard.sample();
````

with:

````ts
    if (disposed) return;
    observe(); pollLink();
    const k = keyboard.sample();
````

In `src/renderer/src/app/duel/onlineDuel.ts`, replace:

````ts
      scene.draw(source, dt, { banner: bannerText(), layerPaused: false, end: endModel(d.tactical.outcome, ticks, 'ENTER: REMATCH   ESC: LEAVE'), notice: now < noticeUntil ? notice : null });
    },
    dispose(): void {
      if (disposed) return; disposed = true; cancel(); release();
      keyboard.destroy(); pointer.destroy(); scene?.dispose(); scene = null;
      if (frozen) disposeDuel(frozen); frozen = null;
````

with:

````ts
      scene.draw(source, dt, { banner: bannerText(), layerPaused: false, end: endModel(d.tactical.outcome, ticks, 'ENTER: REMATCH   ESC: LEAVE'), notice: now < noticeUntil ? notice : null });
      if (debug.on()) {
        overlay ??= createLatencyOverlay(deps.renderer.app.stage, deps.renderer.assets.fontFamily);
        overlay.draw(latencyOverlayLines({ transport: transport(), held: latencyFigure(liveHeld), command: latencyFigure(liveCommand), rttMs }));
      } else overlay?.draw(null);
    },
    dispose(): void {
      if (disposed) return; disposed = true; cancel(); release();
      keyboard.destroy(); pointer.destroy(); debug.destroy(); overlay?.destroy(); overlay = null; scene?.dispose(); scene = null;
      if (frozen) disposeDuel(frozen); frozen = null;
````

- [ ] **Step 4: Single player's accumulator and solo records**

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
// held axes are quantised to −1, 0 or 1 as online, and a decided round's end card keeps ticking until Enter sends the
// same `rematch` command the online duel sends.
import { createTickDriver } from '../../authority/tickDriver';
````

with:

````ts
// held axes are quantised to −1, 0 or 1 as online, and a decided round's end card keeps ticking until Enter sends the
// same `rematch` command the online duel sends. H-2b: the duel runtime keeps the round's telemetry accumulator, as the
// authority does, and hands each decided round's record to `onRound` (Single player's solo playtest records).
import { createTickDriver } from '../../authority/tickDriver';
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
import { stepDuelTick } from '../../sim/duel/step';
import type { ShipLayout } from '../../sim/ship/schema';
````

with:

````ts
import { stepDuelTick } from '../../sim/duel/step';
import { duelEndSummary, duelRoundRecord, type DuelRoundRecord } from '../../sim/duel/summary';
import { createTelemetry, recordTick } from '../../sim/duel/telemetry';
import type { ShipLayout } from '../../sim/ship/schema';
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
  clearKeys?(): void;
}
````

with:

````ts
  clearKeys?(): void;
  /** Each decided round's record, once, on the tick it is decided (H-2 spec §8: Single player's solo records). */
  onRound?(record: DuelRoundRecord): void;
}
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
  const d = createDuel(deps.layout, deps.seed);
  let round = 0, active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
````

with:

````ts
  const d = createDuel(deps.layout, deps.seed);
  let telemetry = createTelemetry(d);   // the round's accumulator, as the authority's duel rules keep it
  let round = 0, active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
````

In `src/renderer/src/app/duel/runtime.ts`, replace:

````ts
    held[active] = activeHeld;
    results = stepDuelTick(d, { held, commands });
    sentHeld = held;
````

with:

````ts
    held[active] = activeHeld;
    const roundBefore = d.round, running = d.tactical.outcome === Outcome.Running;
    results = stepDuelTick(d, { held, commands });
    if (d.round !== roundBefore) telemetry = createTelemetry(d);   // a rematch: a fresh accumulator
    else {
      recordTick(telemetry, d, { held, commands });
      if (running && d.tactical.outcome !== Outcome.Running) deps.onRound?.(duelRoundRecord(duelEndSummary(telemetry), d.round, d.tactical.seed, d.baseTick));
    }
    sentHeld = held;
````

In `src/renderer/src/net/duelRecord.ts`, replace:

````ts
}
/** The standard deviation of publication inter-arrival gaps against the expected 50 ms; gaps outside 0 to the cap are dropped. */
````

with:

````ts
}
/** Single player's record of a decided round (H-2 spec §8, Helm §11a): the same record with session 'solo'. One machine
 *  and no link: role 'host', no transport, no latency samples, no jitter and no disconnects. */
export function soloDuelRecord(summary: DuelRoundRecord, at: { seat: 0 | 1; helmPlayer: 0 | 1; startedAtIso: string; pauses: number }): DuelPlaytestRecord {
  return { version: 1, session: 'solo', role: 'host', transport: null, seat: at.seat, helmPlayer: at.helmPlayer, seed: summary.seed, round: summary.round,
    startedAtIso: at.startedAtIso, summary, latency: { held: latencyFigure([]), command: latencyFigure([]), rttMs: null }, jitter: arrivalJitter([]), disconnects: 0, pauses: at.pauses };
}
/** The standard deviation of publication inter-arrival gaps against the expected 50 ms; gaps outside 0 to the cap are dropped. */
````

In `src/renderer/src/app/duel/duelMode.ts`, replace:

````ts
// duel scene (scene.ts, H-2 spec §3), and steps the duel locally with the duel runtime. The sector session is never
// created.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
````

with:

````ts
// duel scene (scene.ts, H-2 spec §3), and steps the duel locally with the duel runtime. The sector session is never
// created. Each decided round is written as a solo playtest record (H-2 spec §8) through `recordDuel`.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
````

In `src/renderer/src/app/duel/duelMode.ts`, replace:

````ts
import { endModel } from '../../render/duel/endScreen';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
````

with:

````ts
import { endModel } from '../../render/duel/endScreen';
import { soloDuelRecord, type DuelPlaytestRecord } from '../../net/duelRecord';
import type { DuelRoundRecord } from '../../sim/duel/summary';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
````

In `src/renderer/src/app/duel/duelMode.ts`, replace:

````ts
  onExit?: () => void;
}
````

with:

````ts
  onExit?: () => void;
  /** Append a solo playtest record (the preload's recordDuel); absent outside the app. */
  recordDuel?(record: DuelPlaytestRecord): Promise<boolean> | void;
}
````

In `src/renderer/src/app/duel/duelMode.ts`, replace:

````ts
    clearKeys: () => { keyboard.clear(); pointer.clear(); },
    seed: deps.seed, viewport, layout: deps.layout
  });

````

with:

````ts
    clearKeys: () => { keyboard.clear(); pointer.clear(); },
    seed: deps.seed, viewport, layout: deps.layout, onRound: (summary) => record(summary)
  });
  // The solo record (H-2 spec §8, Helm §11a); `seat` is the character the keyboard drives when the round is decided.
  let startedAtIso = new Date().toISOString(), pauses = 0, wasPaused = false;
  function record(summary: DuelRoundRecord): void {
    const r = soloDuelRecord(summary, { seat: runtime.active(), helmPlayer: runtime.duel.helmPlayer, startedAtIso, pauses });
    pauses = 0; startedAtIso = new Date().toISOString();
    void Promise.resolve(deps.recordDuel?.(r)).catch(() => {});
  }

````

In `src/renderer/src/app/duel/duelMode.ts`, replace:

````ts
    const d = runtime.duel, userPaused = runtime.reasons().has('user');
    const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
````

with:

````ts
    const d = runtime.duel, userPaused = runtime.reasons().has('user');
    if (userPaused && !wasPaused) pauses++;
    wasPaused = userPaused;
    const ticks = (d.decidedTick >= 0 ? d.decidedTick : d.tactical.tick) - d.baseTick;
````

In `src/renderer/src/main.ts`, replace:

````ts
      const dispose = startDuelMode({ renderer, seed: DEFAULT_SEED, layout: ships.cutter, lifecycle: window.ftlite,
        onExit: () => { session.home(); actions.leaveSingle(); } });
      return { frame() { /* the duel runs on its own ticker callback */ }, dispose };
````

with:

````ts
      const dispose = startDuelMode({ renderer, seed: DEFAULT_SEED, layout: ships.cutter, lifecycle: window.ftlite,
        onExit: () => { session.home(); actions.leaveSingle(); }, recordDuel: record => window.ftlite?.recordDuel?.(record) });
      return { frame() { /* the duel runs on its own ticker callback */ }, dispose };
````

- [ ] **Step 5: Run the tests, the typecheck and the build**

Run: `npx vitest run tests/latencyOverlay.test.ts tests/onlineDuelSession.test.ts tests/duelRuntime.test.ts tests/duelOnlineView.test.ts tests/onlineDuel.test.ts`
Expected: PASS, 55 tests in 5 files (`latencyOverlay` 2, `onlineDuelSession` 9, `duelRuntime` 28, `duelOnlineView` 6, `onlineDuel` 10).

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```
git add src/renderer/src/render/duel/latencyOverlay.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/net/duelRecord.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/main.ts tests/latencyOverlay.test.ts tests/onlineDuelSession.test.ts tests/duelRuntime.test.ts
git commit -m "H-2b-i task 2: the record's route and RTT, the F3 latency overlay, Single player's solo records"
```

---

### Task 3: The playtest report and the "Helm demo" section

**Files:**
- Create: `scripts/duel-playtest-model.ts`, `scripts/duel-playtest-report.ts`, `tests/duelPlaytestReport.test.ts`
- Modify: `docs/gates.md`

**Interfaces:**
- Consumes: `validateDuelRecord`, `latencyFigure` (`net/duelRecord.ts`); `followingSeed` (`sim/duel/seeds.ts`).
- Produces (`duel-playtest-model.ts`):
  - constants: `DEMO_RULE`, `CHECKLIST_QUESTIONS`, `ROUND_SECONDS`, `PLANET_LOSS_SECONDS`, `HELM_P95_LIMIT_MS`;
  - types: `Room`, `RoomRound`, `Checklist`, `ChecklistSession`;
  - functions: `parseRecords`, `groupRooms`, `validateChecklist`, `blankChecklist`, `median`, `evaluateRule`, `evaluateTargets`, `roomRounds`, `latencyRows`, `evaluateFallbacks`, `formatReport`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelPlaytestReport.test.ts`:

````ts
// The duel playtest report (H-2 spec §8, §9, §10 "Telemetry"): the §16 rule printed verbatim, its arithmetic on a
// checklist fixture, the host-authoritative merge of host and guest records into rooms (a round the guest missed still
// listed from the host's record), the live targets and the planet extra, the latency rows and the H-2c fallback checks,
// solo rounds apart, the blank checklist, and the script itself on a directory of record files.
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blankChecklist, DEMO_RULE, evaluateFallbacks, evaluateRule, evaluateTargets, formatReport, groupRooms, latencyRows, parseRecords, roomRounds, validateChecklist,
  type Checklist, type ChecklistSession } from '../scripts/duel-playtest-model';
import { latencyFigure, validateDuelRecord, type DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import { nextValidSeed, roundSeed } from '../src/renderer/src/sim/duel/seeds';

const losses = { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 };
function summary(round: number, seed: number, baseTick: number, over: object = {}) {
  return { outcome: 1, ticks: 14400, terminal: [[], ['laser']], laserReleases: [3, 4], laserHits: [2, 1], missilesLaunched: [1, 1], missileHits: [1, 0], repairsFinished: [0, 1],
    laserMisses: [1, 3], layersStripped: [1, 0], missileLosses: [losses, losses], planetContacts: [0, 1], asteroidContacts: [2, 0], baits: 1, consoleSwaps: 0,
    helmEmptyTicks: 0, weaponsEmptyTicks: 10, enemyInArcTicks: 900, weaponsIdleTicks: 30, repairsStarted: [0, 1], walkingTicks: [0, 200], repairingTicks: [0, 96], round, seed, baseTick, ...over };
}
function record(role: 'host' | 'guest', round: number, seed: number, baseTick: number, o: { helm?: 0 | 1; transport?: DuelPlaytestRecord['transport']; held?: number[]; summary?: object; at?: string; session?: 'solo' } = {}): DuelPlaytestRecord {
  return validateDuelRecord({ version: 1, session: o.session ?? 'online', role, transport: o.transport ?? (role === 'host' ? 'loopback' : null), seat: role === 'host' ? 0 : 1, helmPlayer: o.helm ?? 0,
    seed, round, startedAtIso: o.at ?? `2026-11-16T12:0${round}:00.000Z`, summary: summary(round, seed, baseTick, o.summary), latency: { held: latencyFigure(o.held ?? [40, 50, 60]), command: latencyFigure([70]), rttMs: 4 },
    jitter: { count: 100, stdMs: 3.2 }, disconnects: 0, pauses: 0 });
}
// Room A on a LAN: rounds 0 to 2, the host at the Helm; the guest missed round 2. Room B over the internet: one round
// with the guest at the Helm and a slow held delay, which the crew lost. One solo round.
const a = nextValidSeed(100), b = nextValidSeed(5000);
const A = [0, 1, 2].map((r) => ({ round: r, seed: roundSeed(a, r), base: r * 15000 }));
const records = [
  ...A.map((e) => record('host', e.round, e.seed, e.base)),
  ...A.slice(0, 2).map((e) => record('guest', e.round, e.seed, e.base, { transport: 'lan', summary: { ticks: 14000 } })),   // the guest's summaries differ: the host's win
  record('host', 0, b, 0, { helm: 1, at: '2026-11-16T13:00:00.000Z', summary: { outcome: 2, ticks: 9000, terminal: [['missile'], []] } }),
  record('guest', 0, b, 0, { helm: 1, transport: 'internet', held: [100, 200, 300], at: '2026-11-16T13:00:00.000Z', summary: { outcome: 2, ticks: 9000, terminal: [['missile'], []] } }),
  record('host', 0, 77, 0, { session: 'solo', summary: { ticks: 30000 } })
];
const session = (id: string, rooms: string[], pair: ChecklistSession['pair'], answers: boolean[], over: Partial<ChecklistSession> = {}): ChecklistSession =>
  ({ id, rooms, pair, answers, guestHelmQ1: null, helmLaggy: false, note: '', ...over });

describe('the duel playtest report (spec §8, §9)', () => {
  it('prints the Helm §16 rule verbatim', () => {
    const line = readFileSync('docs/superpowers/specs/2026-11-14-helm-demo-design.md', 'utf8').split('\n').find((l) => l.startsWith('**The demo is done**'))!;
    expect(line.replaceAll('**', '').startsWith(DEMO_RULE)).toBe(true);
    const report = formatReport({ records, invalid: 0, checklist: null, files: 2 });
    expect(report).toContain(`> ${DEMO_RULE}\n`);
    expect(report).toContain('Live targets (4 online round(s)): ');   // no checklist: every online round, with a warning
    expect(report).toContain('**Warning: no checklist given, so the live targets cover every online round in the files');
  });
  it('merges host and guest files into rooms: summaries from the host, transport from the guest, a missed round kept', () => {
    const { rooms, solo } = groupRooms([...records].reverse());
    expect(rooms.map((r) => [r.key, r.transport, r.rounds.map((e) => e.round)])).toEqual([[`seed-${a}`, 'lan', [0, 1, 2]], [`seed-${b}`, 'internet', [0]]]);
    expect(rooms[0]!.rounds.map((e) => [e.summary.ticks, !!e.host, !!e.guest])).toEqual([[14400, true, true], [14400, true, true], [14400, true, false]]);
    expect(solo.map((r) => r.seed)).toEqual([77]);
    // A room whose round 0 record is missing starts at the first round seen.
    expect(groupRooms(records.filter((r) => r.round !== 0)).rooms.map((r) => r.key)).toEqual([`seed-${A[1]!.seed}-r1`]);
    // Invalid lines are counted, not fatal.
    expect(parseRecords(`${JSON.stringify(records[0])}\nnot json\n{"version":1}\n\n`)).toMatchObject({ invalid: 2, records: [records[0]] });
  });
  it('reads §16 as three sessions with at least 4 of 5 yes, one with a non-owner pair', () => {
    const owner4 = session('s1', [], 'owner', [true, true, true, true, false]), other5 = session('s2', [], 'non-owner', [true, true, true, true, true]);
    const owner3 = session('s3', [], 'owner', [true, true, true, false, false]), owner5 = session('s4', [], 'owner', [true, true, true, true, true]);
    expect(evaluateRule({ version: 1, sessions: [owner4, other5, owner3] })).toEqual({ passing: ['s1', 's2'], nonOwnerPassing: true, holds: false });
    expect(evaluateRule({ version: 1, sessions: [owner4, other5, owner3, owner5] }).holds).toBe(true);
    expect(evaluateRule({ version: 1, sessions: [owner4, owner5, { ...owner4, id: 's5' }] })).toEqual({ passing: ['s1', 's4', 's5'], nonOwnerPassing: false, holds: false });
    expect(evaluateRule(null).holds).toBe(false);
  });
  it('checks the live targets and the planet extra', () => {
    const t = evaluateTargets(roomRounds(groupRooms(records).rooms));
    expect(t).toMatchObject({ rounds: 4, medianSeconds: 240, lengthHolds: true, crewWins: 3, enemyWins: 1, bothOutcomes: true, weaponsHold: true, planetHolds: true });
    const quick = { label: 'q', summary: { ...records[0]!.summary, outcome: 2, ticks: 1500, terminal: [['planet'], []] as [('planet')[], never[]], missilesLaunched: [0, 1] as [number, number] } };
    expect(evaluateTargets([quick])).toMatchObject({ medianSeconds: 25, lengthHolds: false, bothOutcomes: false, weaponsMissing: ['q'], weaponsHold: false, planetLosses: ['q'], planetHolds: false });
    expect(evaluateTargets([])).toMatchObject({ medianSeconds: null, lengthHolds: false, weaponsHold: false });
  });
  it('lists one latency row per record and runs the H-2c fallback checks', () => {
    const { rooms } = groupRooms(records);
    expect(latencyRows(rooms).map((r) => [r.room, r.round, r.role, r.console, r.held.p95])).toEqual([
      [`seed-${a}`, 0, 'host', 'Helm', 60], [`seed-${a}`, 0, 'guest', 'Weapons', 60], [`seed-${a}`, 1, 'host', 'Helm', 60], [`seed-${a}`, 1, 'guest', 'Weapons', 60],
      [`seed-${a}`, 2, 'host', 'Helm', 60], [`seed-${b}`, 0, 'host', 'Weapons', 60], [`seed-${b}`, 0, 'guest', 'Helm', 300]]);
    // Check 3 judges a session on one known network, LAN (s1) or internet (s2); mixed (s3) or unknown (s4) rooms are not judged.
    const checklist: Checklist = { version: 1, sessions: [session('s1', [`seed-${a}`], 'owner', [true, true, true, true, true], { guestHelmQ1: false, helmLaggy: true }),
      session('s2', [`seed-${b}`], 'non-owner', [true, true, true, true, true], { guestHelmQ1: false, helmLaggy: true }),
      session('s3', [`seed-${a}`, `seed-${b}`], 'owner', [true, true, true, true, true], { guestHelmQ1: false }), session('s4', ['seed-1'], 'owner', [true, true, true, true, true], { guestHelmQ1: false })] };
    expect(evaluateFallbacks(rooms, checklist)).toEqual({ helmDelay: [`seed-${b} round 0 (guest Helm p95 300 ms)`], laggy: ['s1', 's2'], guestHelm: ['s1', 's2'], trips: true });
    const calm = groupRooms(records.filter((r) => r.seed !== b)).rooms;
    expect(evaluateFallbacks(calm, { version: 1, sessions: [session('s1', [`seed-${a}`], 'owner', [true, true, true, true, true], { guestHelmQ1: true })] }).trips).toBe(false);
  });
  it('prints a blank checklist, one session per room, that its own schema accepts', () => {
    const blank = blankChecklist(groupRooms(records).rooms);
    expect(validateChecklist(blank)).toEqual(blank);
    expect(blank.sessions.map((s) => [s.rooms, s.answers])).toEqual([[[`seed-${a}`], [null, null, null, null, null]], [[`seed-${b}`], [null, null, null, null, null]]]);
    expect(() => validateChecklist({ ...blank, sessions: [{ ...blank.sessions[0], answers: [true] }] })).toThrow();
  });
  it('the script reads a directory of host and guest files and its checklist, and prints the report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-duel-report-'));
    try {
      writeFileSync(join(dir, 'duel-2026-11-16.jsonl'), records.filter((r) => r.role === 'host').map((r) => JSON.stringify(r)).join('\n') + '\n');
      writeFileSync(join(dir, 'guest.jsonl'), records.filter((r) => r.role === 'guest').map((r) => JSON.stringify(r)).join('\n') + '\nbroken\n');
      writeFileSync(join(dir, 'checklist.json'), JSON.stringify({ version: 1, sessions: [session('s1', [`seed-${a}`, 'seed-1'], 'owner', [true, true, true, true, true])] }));
      const run = (args: string[]) => new Promise<{ code: number | null; out: string }>((done) => {
        const child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/duel-playtest-report.ts', ...args], { windowsHide: true });
        let out = ''; child.stdout.on('data', (c: Buffer) => { out += c.toString(); }); child.stderr.resume(); child.once('exit', (code) => done({ code, out }));
      });
      const report = await run([dir, join(dir, 'guest.jsonl')]);
      expect(report.code).toBe(0);
      expect(report.out).toContain(`> ${DEMO_RULE}`);
      expect(report.out).toContain('2 file(s), 8 valid record(s), 1 invalid line(s) skipped.');
      expect(report.out).toContain('Checklist: 1 session(s)');
      // The live targets cover the checklist's rooms only; room B is reported unclaimed, seed-1 as listed but missing.
      expect(report.out).toContain('Live targets (3 online round(s) in the rooms the checklist lists): ');
      expect(report.out).toContain(`Rooms no checklist session lists (left out of the live targets): seed-${b}. Rooms a session lists that no record has: seed-1.`);
      expect(report.out).toContain('**H-2c starts: yes.**');
      expect(report.out).toContain('## Solo rounds');
      expect(report.out).toContain('"session-2"');
      expect((await run([join(dir, 'checklist.json')])).code).toBe(1);   // not a record file
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
});
````

Run: `npx vitest run tests/duelPlaytestReport.test.ts`
Expected: FAIL (`scripts/duel-playtest-model` does not exist).

- [ ] **Step 2: The model and the command**

Create `scripts/duel-playtest-model.ts`:

````ts
// The duel playtest report's model (H-2 spec §8, §9): pure functions over playtest records and the owner's checklist.
// Records from the host and guest files are merged into rooms (a room's rounds chain by round index, the following
// seed and a later base tick); each round takes its summary from the host's record and the room's transport from
// the guest's. The §16 rule is evaluated from the checklist; the live targets, the planet extra, the latency table and
// the H-2c fallback checks from the records. Solo records are reported apart (Helm §11a).
import { z } from 'zod';
import { validateDuelRecord, type DuelPlaytestRecord, type LatencyFigure } from '../src/renderer/src/net/duelRecord';
import { followingSeed } from '../src/renderer/src/sim/duel/seeds';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';

/** Helm spec §16, verbatim (its line 320, without the markdown emphasis). */
export const DEMO_RULE = 'The demo is done when 4 of 5 are yes across 3 sessions, at least one with a pair other than the owner, and the live telemetry targets hold (3 to 5 minutes; wins and losses both happen across sessions; both weapons used in every duel).';
/** Helm spec §16's playtest checklist, asked after each session. */
export const CHECKLIST_QUESTIONS = [
  "Did the Helm use the planet's gravity on purpose at least once (a slingshot or a bait)?",
  'Did the two players talk to coordinate ("bring the nose round", "missile away")?',
  'Did either player run from their console to repair at a moment that mattered?',
  'Can each player retell one fight moment?',
  'Did they want to play again straight away?'
] as const;
/** The live targets: the median round length in seconds, and the H-0 planet extra's limit. */
export const ROUND_SECONDS = { min: 180, max: 300 } as const, PLANET_LOSS_SECONDS = 30;
/** Fallback criterion 1 (spec §9): the Helm's held-delay p95 limit over a whole round, by the session's network. */
export const HELM_P95_LIMIT_MS = { lan: 150, internet: 250 } as const;

export type Transport = DuelPlaytestRecord['transport'];
export interface RoomRound { round: number; seed: number; baseTick: number; summary: DuelPlaytestRecord['summary']; host: DuelPlaytestRecord | null; guest: DuelPlaytestRecord | null }
/** One room: its rounds in order; `key` names it by its first round's seed (and that round when it is not round 0). */
export interface Room { key: string; rounds: RoomRound[]; transport: Transport }

/** The valid records in a JSONL text; `invalid` counts the lines that failed the record schema. */
export function parseRecords(text: string): { records: DuelPlaytestRecord[]; invalid: number } {
  const records: DuelPlaytestRecord[] = []; let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { records.push(validateDuelRecord(JSON.parse(line))); } catch { invalid++; }
  }
  return { records, invalid };
}

const roundKey = (r: DuelPlaytestRecord): string => `${r.round}:${r.seed}:${r.summary.baseTick}`;
const follows = (a: RoomRound, b: RoomRound): boolean => b.round === a.round + 1 && b.seed === followingSeed(a.seed) && b.baseTick >= a.baseTick + a.summary.ticks;
/** The most common non-null value, or null. */
function mode<T>(values: readonly (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null, n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}
/** Merge online records into rooms; solo records are returned apart. Duplicate records of one round and role keep the first. */
export function groupRooms(records: readonly DuelPlaytestRecord[]): { rooms: Room[]; solo: DuelPlaytestRecord[] } {
  const solo = records.filter((r) => r.session === 'solo'), rounds = new Map<string, RoomRound>();
  for (const r of records) {
    if (r.session !== 'online') continue;
    const key = roundKey(r), entry = rounds.get(key) ?? { round: r.round, seed: r.seed, baseTick: r.summary.baseTick, summary: r.summary, host: null, guest: null };
    if (r.role === 'host' && !entry.host) { entry.host = r; entry.summary = r.summary; }   // the host's record is authoritative for summaries
    if (r.role === 'guest' && !entry.guest) entry.guest = r;
    rounds.set(key, entry);
  }
  // Round index first, so every round k - 1 is placed before round k whichever machine's clock wrote it; then by time.
  const started = (e: RoomRound): string => (e.host ?? e.guest)!.startedAtIso;
  const ordered = [...rounds.values()].sort((a, b) => a.round - b.round || started(a).localeCompare(started(b)));
  const rooms: Room[] = [];
  for (const e of ordered) {
    const open = e.round === 0 ? undefined : rooms.find((room) => follows(room.rounds.at(-1)!, e));
    if (open) open.rounds.push(e);
    else rooms.push({ key: e.round === 0 ? `seed-${e.seed}` : `seed-${e.seed}-r${e.round}`, rounds: [e], transport: null });
  }
  for (const room of rooms) room.transport = mode(room.rounds.map((e) => e.guest?.transport ?? null));
  return { rooms, solo };
}

export interface ChecklistSession {
  id: string; rooms: string[]; pair: 'owner' | 'non-owner' | null;
  answers: (boolean | null)[]; guestHelmQ1: boolean | null; helmLaggy: boolean | null; note: string;
}
export interface Checklist { version: 1; sessions: ChecklistSession[] }
const answer = z.boolean().nullable();
const checklistSchema = z.object({ version: z.literal(1), sessions: z.array(z.object({
  id: z.string().max(64), rooms: z.array(z.string().max(64)).max(32), pair: z.enum(['owner', 'non-owner']).nullable(),
  answers: z.array(answer).length(5), guestHelmQ1: answer, helmLaggy: answer, note: z.string().max(2000)
}).strict()).max(64) }).strict();
export function validateChecklist(value: unknown): Checklist { return checklistSchema.parse(value) as Checklist; }
/** The blank checklist: one session per room found, every answer null, for the owner to fill in and merge. */
export function blankChecklist(rooms: readonly Room[]): Checklist {
  return { version: 1, sessions: rooms.map((room, i) => ({ id: `session-${i + 1}`, rooms: [room.key], pair: null, answers: [null, null, null, null, null], guestHelmQ1: null, helmLaggy: null, note: '' })) };
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export interface RuleEvaluation { passing: string[]; nonOwnerPassing: boolean; holds: boolean }
/** §16's checklist half as the spec reads it (§8): three sessions each with at least 4 of 5 yes, one of them a non-owner pair. */
export function evaluateRule(checklist: Checklist | null): RuleEvaluation {
  const passing = (checklist?.sessions ?? []).filter((s) => s.answers.filter((a) => a === true).length >= 4);
  const nonOwnerPassing = passing.some((s) => s.pair === 'non-owner');
  return { passing: passing.map((s) => s.id), nonOwnerPassing, holds: passing.length >= 3 && nonOwnerPassing };
}
export interface TargetEvaluation {
  rounds: number; medianSeconds: number | null; lengthHolds: boolean;
  crewWins: number; enemyWins: number; draws: number; bothOutcomes: boolean;
  weaponsMissing: string[]; weaponsHold: boolean;
  planetLosses: string[]; planetHolds: boolean;
}
const label = (room: string, e: { round: number }): string => `${room} round ${e.round}`;
/** The live targets over rounds (summary plus a label): the median length, both outcomes, both crew weapons in every
 *  round (the crew ship's laser releases and missiles launched above zero), and no round lost to the planet in 30 s. */
export function evaluateTargets(rounds: readonly { label: string; summary: DuelPlaytestRecord['summary'] }[]): TargetEvaluation {
  const seconds = rounds.map((r) => r.summary.ticks / TICK_HZ), med = median(seconds);
  const count = (o: number) => rounds.filter((r) => r.summary.outcome === o).length;
  const weaponsMissing = rounds.filter((r) => !(r.summary.laserReleases[0] > 0 && r.summary.missilesLaunched[0] > 0)).map((r) => r.label);
  const planetLosses = rounds.filter((r) => r.summary.outcome === Outcome.EnemyWins && r.summary.terminal[0].includes('planet') && r.summary.ticks < PLANET_LOSS_SECONDS * TICK_HZ).map((r) => r.label);
  const crewWins = count(Outcome.CrewWins), enemyWins = count(Outcome.EnemyWins);
  return { rounds: rounds.length, medianSeconds: med, lengthHolds: med !== null && med >= ROUND_SECONDS.min && med <= ROUND_SECONDS.max,
    crewWins, enemyWins, draws: count(Outcome.Draw), bothOutcomes: crewWins > 0 && enemyWins > 0,
    weaponsMissing, weaponsHold: rounds.length > 0 && weaponsMissing.length === 0, planetLosses, planetHolds: planetLosses.length === 0 };
}
export const roomRounds = (rooms: readonly Room[]) => rooms.flatMap((room) => room.rounds.map((e) => ({ label: label(room.key, e), summary: e.summary })));

export interface LatencyRow { room: string; round: number; role: 'host' | 'guest'; console: 'Helm' | 'Weapons'; transport: Transport; held: LatencyFigure; command: LatencyFigure; rttMs: number | null; jitterMs: number | null }
/** One row per online record, in room and round order: the §9 figures as the record keeps them. */
export function latencyRows(rooms: readonly Room[]): LatencyRow[] {
  return rooms.flatMap((room) => room.rounds.flatMap((e) => [e.host, e.guest].flatMap((r) => r ? [{ room: room.key, round: e.round, role: r.role, console: r.seat === r.helmPlayer ? 'Helm' as const : 'Weapons' as const,
    transport: r.transport, held: r.latency.held, command: r.latency.command, rttMs: r.latency.rttMs, jitterMs: r.jitter.stdMs }] : [])));
}
export interface FallbackEvaluation { helmDelay: string[]; laggy: string[]; guestHelm: string[]; trips: boolean }
/** Spec §9's H-2c criteria: (1) the Helm machine's held p95 over the session network's limit in a round (an unknown
 *  network uses the LAN limit); (2) "the Helm felt laggy" in two sessions; (3) a session on one known network (lan or
 *  internet) whose question 1 is yes with the host at the Helm but no with the guest at the Helm. */
export function evaluateFallbacks(rooms: readonly Room[], checklist: Checklist | null): FallbackEvaluation {
  const helmDelay = latencyRows(rooms).filter((row) => {
    const room = rooms.find((r) => r.key === row.room)!, limit = room.transport === 'internet' ? HELM_P95_LIMIT_MS.internet : HELM_P95_LIMIT_MS.lan;
    return row.console === 'Helm' && row.held.p95 !== null && row.held.p95 > limit;
  }).map((row) => `${row.room} round ${row.round} (${row.role} Helm p95 ${row.held.p95} ms)`);
  const sessions = checklist?.sessions ?? [];
  const laggy = sessions.filter((s) => s.helmLaggy === true).map((s) => s.id);
  const oneNetwork = (s: ChecklistSession): boolean => {
    const nets = new Set(s.rooms.map((key) => rooms.find((r) => r.key === key)?.transport ?? null)), [only] = [...nets];
    return nets.size === 1 && (only === 'lan' || only === 'internet');
  };
  const guestHelm = sessions.filter((s) => oneNetwork(s) && s.answers[0] === true && s.guestHelmQ1 === false).map((s) => s.id);
  return { helmDelay, laggy, guestHelm, trips: helmDelay.length > 0 || laggy.length >= 2 || guestHelm.length > 0 };
}

const fig = (f: LatencyFigure): string => (f.count ? `${f.count} / ${f.median} / ${f.p95} / ${f.max}` : '0 / - / - / -');
const yes = (b: boolean): string => (b ? 'yes' : 'NO');
/** The whole report as text: the rule verbatim and its evaluation, the live targets and the planet extra, the rooms,
 *  the latency table, the fallback checks, the solo rounds apart, then the blank checklist JSON. */
export function formatReport(input: { records: readonly DuelPlaytestRecord[]; invalid: number; checklist: Checklist | null; files: number }): string {
  const { rooms, solo } = groupRooms(input.records), out: string[] = [];
  // With a checklist, the live targets and the planet extra cover only the rooms its sessions list: the LAN and internet
  // checklist runs share the day's files with the §16 sessions.
  const claimed = new Set(input.checklist?.sessions.flatMap((s) => s.rooms) ?? []);
  const judged = input.checklist ? rooms.filter((room) => claimed.has(room.key)) : rooms;
  const unclaimed = rooms.filter((room) => !claimed.has(room.key)).map((room) => room.key), missing = [...claimed].filter((key) => !rooms.some((room) => room.key === key));
  const rule = evaluateRule(input.checklist), online = evaluateTargets(roomRounds(judged)), fallback = evaluateFallbacks(rooms, input.checklist);
  out.push('# Helm demo playtest report', '', `${input.files} file(s), ${input.records.length} valid record(s), ${input.invalid} invalid line(s) skipped.`, '');
  out.push('## The §16 rule', '', `> ${DEMO_RULE}`, '');
  out.push(`Checklist: ${input.checklist ? `${input.checklist.sessions.length} session(s)` : 'none given (the blank one is printed below)'}; sessions with at least 4 of 5 yes: ${rule.passing.join(', ') || 'none'}; a non-owner pair among them: ${yes(rule.nonOwnerPassing)}; three such sessions with one non-owner pair: ${yes(rule.holds)}.`);
  out.push(`Live targets (${online.rounds} online round(s)${input.checklist ? ' in the rooms the checklist lists' : ''}): median length ${online.medianSeconds === null ? '-' : online.medianSeconds.toFixed(1)} s within 3 to 5 minutes: ${yes(online.lengthHolds)}; both outcomes (crew wins ${online.crewWins}, enemy wins ${online.enemyWins}, draws ${online.draws}): ${yes(online.bothOutcomes)}; both weapons used in every round: ${yes(online.weaponsHold)}${online.weaponsMissing.length ? ` (not in ${online.weaponsMissing.join(', ')})` : ''}.`);
  out.push(`H-0 extra, no round lost to the planet in under 30 s: ${yes(online.planetHolds)}${online.planetLosses.length ? ` (${online.planetLosses.join(', ')})` : ''}.`);
  out.push(input.checklist ? `Rooms no checklist session lists (left out of the live targets): ${unclaimed.join(', ') || 'none'}. Rooms a session lists that no record has: ${missing.join(', ') || 'none'}.`
    : '**Warning: no checklist given, so the live targets cover every online round in the files, including any LAN or internet checklist runs.**');
  out.push(`**The demo is done: ${yes(rule.holds && online.lengthHolds && online.bothOutcomes && online.weaponsHold)}.**`, '');
  out.push('## Rooms', '', '| Room | Transport | Rounds | Host records | Guest records |', '|---|---|---|---|---|');
  for (const room of rooms) out.push(`| ${room.key} | ${room.transport ?? 'unknown'} | ${room.rounds.map((e) => e.round).join(', ')} | ${room.rounds.filter((e) => e.host).length} | ${room.rounds.filter((e) => e.guest).length} |`);
  out.push('', '## Latency (spec §9)', '', 'Held and command delay: count / median / p95 / max in ms; RTT is the round median; jitter is the publication inter-arrival standard deviation against 50 ms.', '');
  out.push('| Room | Round | Machine | Console | Transport | Held | Command | RTT ms | Jitter ms |', '|---|---|---|---|---|---|---|---|---|');
  for (const row of latencyRows(rooms)) out.push(`| ${row.room} | ${row.round} | ${row.role} | ${row.console} | ${row.transport ?? 'unknown'} | ${fig(row.held)} | ${fig(row.command)} | ${row.rttMs ?? '-'} | ${row.jitterMs ?? '-'} |`);
  out.push('', '## Fallback checks (spec §9; any one starts H-2c)', '');
  out.push(`1. Helm held p95 over ${HELM_P95_LIMIT_MS.lan} ms (LAN) or ${HELM_P95_LIMIT_MS.internet} ms (internet) in a round: ${fallback.helmDelay.length ? fallback.helmDelay.join('; ') : 'none'}.`);
  out.push(`2. "The Helm felt laggy" in two sessions: ${fallback.laggy.length >= 2 ? 'yes' : 'no'} (${fallback.laggy.join(', ') || 'none'}).`);
  out.push(`3. Question 1 yes with the host at the Helm, no with the guest at the Helm (a session on one known network): ${fallback.guestHelm.join(', ') || 'none'}.`);
  out.push(`**H-2c starts: ${fallback.trips ? 'yes' : 'no'}.**`, '');
  const soloTargets = evaluateTargets(solo.map((r) => ({ label: `solo seed ${r.seed} round ${r.round}`, summary: r.summary })));
  out.push('## Solo rounds (Helm §11a, judged separately)', '');
  out.push(`${soloTargets.rounds} round(s); median length ${soloTargets.medianSeconds === null ? '-' : soloTargets.medianSeconds.toFixed(1)} s; crew wins ${soloTargets.crewWins}, enemy wins ${soloTargets.enemyWins}, draws ${soloTargets.draws}; both weapons in every round: ${yes(soloTargets.weaponsHold)}; no planet loss under 30 s: ${yes(soloTargets.planetHolds)}.`, '');
  out.push('## Checklist', '', 'Questions (answer true or false per session; `guestHelmQ1` is question 1 for the guest-Helm round; `helmLaggy` is the post-session note "the Helm felt laggy"; `pair` is owner or non-owner; merge rooms of one sitting into one session):', '');
  CHECKLIST_QUESTIONS.forEach((q, i) => out.push(`${i + 1}. ${q}`));
  out.push('', 'Blank checklist:', '', '```json', JSON.stringify(blankChecklist(rooms), null, 2), '```');
  return out.join('\n') + '\n';
}
````

Create `scripts/duel-playtest-report.ts`:

````ts
// The duel playtest report (H-2 spec §8): `npx tsx scripts/duel-playtest-report.ts <file or directory ...> [--checklist=<file>]`.
// Reads every duel-*.jsonl given (a directory contributes its duel-*.jsonl files and, when present, its checklist.json),
// merges the host and guest records into rooms and prints the report (scripts/duel-playtest-model.ts) for
// docs/gates.md's "Helm demo" section and a playtest report under reports/. Reads only the files named; writes nothing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { formatReport, parseRecords, validateChecklist, type Checklist } from './duel-playtest-model';
import type { DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';

const RECORD_FILE = /^duel-\d{4}-\d{2}-\d{2}\.jsonl$/;
function main(): void {
  const args = process.argv.slice(2), paths = args.filter((a) => !a.startsWith('--')), flags = args.filter((a) => a.startsWith('--'));
  if (!paths.length || flags.some((f) => !f.startsWith('--checklist='))) throw Error('usage: npx tsx scripts/duel-playtest-report.ts <file or directory ...> [--checklist=<file>]');
  const files: string[] = [];
  let checklistPath = flags.find((f) => f.startsWith('--checklist='))?.slice('--checklist='.length);
  for (const path of paths) {
    if (!existsSync(path)) throw Error(`no such file or directory: ${path}`);
    if (statSync(path).isDirectory()) {
      files.push(...readdirSync(path).filter((f) => RECORD_FILE.test(f)).sort().map((f) => join(path, f)));
      if (!checklistPath && existsSync(join(path, 'checklist.json'))) checklistPath = join(path, 'checklist.json');
    } else if (RECORD_FILE.test(basename(path)) || path.endsWith('.jsonl')) files.push(path);
    else throw Error(`not a duel-*.jsonl record file: ${path}`);
  }
  const records: DuelPlaytestRecord[] = []; let invalid = 0;
  for (const file of files) { const parsed = parseRecords(readFileSync(file, 'utf8')); records.push(...parsed.records); invalid += parsed.invalid; }
  const checklist: Checklist | null = checklistPath ? validateChecklist(JSON.parse(readFileSync(checklistPath, 'utf8'))) : null;
  process.stdout.write(formatReport({ records, invalid, checklist, files: files.length }));
  if (!records.length) { console.error('no valid duel playtest records'); process.exitCode = 1; }
}
try { main(); } catch (error) { console.error(String((error as Error)?.message ?? error).slice(0, 300)); process.exitCode = 1; }
````

- [ ] **Step 3: The "Helm demo" section**

Append the section at the end of `docs/gates.md` (the replaced block is the file's last line):

In `docs/gates.md`, replace:

````md
- [ ] Owner look gate (`npm run dev`, and the screenshots in `C:\Users\djuar\FTLite-shots\art-ii\`): the crew, the consoles and the hits; does the interior now look like a game? Date and notes: pending.
````

with:

````md
- [ ] Owner look gate (`npm run dev`, and the screenshots in `C:\Users\djuar\FTLite-shots\art-ii\`): the crew, the consoles and the hits; does the interior now look like a game? Date and notes: pending.

## Helm demo (Helm spec §16; H-2 spec §8 to §11)

**The rule (Helm spec §16, verbatim):** "The demo is done when 4 of 5 are yes across 3 sessions, at least one with a pair other than the owner, and the live telemetry targets hold (3 to 5 minutes; wins and losses both happen across sessions; both weapons used in every duel)."

**Status: not done.** The automated gates below prove the pipeline. The sessions are the owner's; no session has been recorded yet.

- **Records.** Every decided round writes one playtest record on each machine to `userData/playtest/duel-YYYY-MM-DD.jsonl`. An online round writes `session: 'online'`; Single player writes `session: 'solo'`. The host's own records read `transport: loopback`. The guest's records read `lan` (a direct local candidate pair) or `internet` (through a NAT or TURN), from the hidden RTC window's selected pair, and null when the route cannot be told (the report reads it as unknown). `latency.rttMs` is the round's median RTT from the same stats. Records never carry a token, code, address or candidate.
- **F3** shows the live latency overlay on either machine of an online duel: the route, the held and command delay (count, median, p95, max over the last 300 samples) and the RTT.
- **The report.** `npx tsx scripts/duel-playtest-report.ts <files or directories ...> [--checklist=<file>]` merges both machines' files into rooms and prints the following:
  - the rule above, with its evaluation from the owner's checklist JSON (three sessions with at least 4 of 5 yes, one of them a non-owner pair);
  - the live targets (median round length 3 to 5 minutes, both outcomes, the crew's laser and missile used in every round) and the H-0 extra (no round lost to the planet in under 30 s), over the rooms the checklist's sessions list, with the rooms no session claims and any listed room the records lack (without a checklist, over every online round, with a warning);
  - the rooms, the §9 latency table (one row per record), and the three H-2c fallback checks;
  - the solo rounds, reported apart;
  - a blank checklist with one session per room.

  Answer each session's five questions as `true` or `false`, set `pair`, `guestHelmQ1` (question 1 for the guest-Helm round) and `helmLaggy`, merge the rooms of one sitting into one session, and save it as `checklist.json` beside the records.
- **Automated evidence (H-2b).** Run `npm run test:duel-app-runtime -- --report-path=out/h2b-duel-app/duel-app.json`. It also asserts the host's records read loopback and the guest's read lan with an RTT. It saves F3 screenshots and copies both machines' records to `out/h2b-duel-app/records/`. Then run `npx tsx scripts/duel-playtest-report.ts out/h2b-duel-app/records/host out/h2b-duel-app/records/guest`. The smoke's single round is the 25 s test-seed round, so its report fails the live targets by design. It proves the merge, the labels and the table, not the demo. Under automation the unfocused window's timers are throttled, so the smoke's held-delay figures are not a latency measurement.
- **Owner-only.** First redeploy the signalling service (the deployed one is SIM 35) and install the same candidate on both PCs. Then run the LAN and internet checklists (H-2 spec §10), each with a guest-Helm round, and then the §16 sessions: three sessions, at least one pair other than the owner. Paste the report here and into a playtest report under `reports/`.

| Session | Date | Network | Pair | Q1-Q5 | Guest-Helm Q1 | Helm laggy | Rooms |
|---|---|---|---|---|---|---|---|
| none yet | | | | | | | |
````

- [ ] **Step 4: Run the test and the typecheck**

Run: `npx vitest run tests/duelPlaytestReport.test.ts`
Expected: PASS, 7 tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```
git add scripts/duel-playtest-model.ts scripts/duel-playtest-report.ts tests/duelPlaytestReport.test.ts docs/gates.md
git commit -m "H-2b-i task 3: the duel playtest report and the Helm demo gates section"
```

---

### Task 4: The duel smoke's labels, F3 screenshots and record copies

**Files:**
- Modify: `scripts/network/duel-app-smoke.ts`

- [ ] **Step 1: The smoke**

In `scripts/network/duel-app-smoke.ts`, replace:

````ts
// paused for the lost partner, then the rejoin, its ACK before any input and its presence true, then an Escape
// unpause). Exact temporary roots are cleaned; Electron and workerd are never killed globally.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
````

with:

````ts
// paused for the lost partner, then the rejoin, its ACK before any input and its presence true, then an Escape
// unpause). H-2b: the host's records read loopback and the guest's lan with an RTT; F3 shows the latency overlay on
// both (screenshots beside the report); both machines' records are copied beside the report for the playtest report
// script. Exact temporary roots are cleaned; Electron and workerd are never killed globally.
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
````

In `scripts/network/duel-app-smoke.ts`, replace:

````ts
    }), (both) => both.every((list) => list.some((r: any) => r.round === 0 && r.summary.round === 0 && r.latency.held.count + r.latency.command.count > 0)), 'playtest records with latency samples on both', 15000);
    proof.records = records.map((list) => ({ count: list.length, role: list[0].role, latency: list[0].latency, jitter: list[0].jitter }));
    step = 'step 4';
````

with:

````ts
    }), (both) => both.every((list) => list.some((r: any) => r.round === 0 && r.summary.round === 0 && r.latency.held.count + r.latency.command.count > 0)), 'playtest records with latency samples on both', 15000);
    proof.records = records.map((list) => ({ count: list.length, role: list[0].role, transport: list[0].transport, latency: list[0].latency, jitter: list[0].jitter }));
    // H-2b: the host's own port is loopback; the guest labels its link from the RTC window's selected pair, with an RTT.
    assert(records[0]!.every((r: any) => r.transport === 'loopback') && records[1]!.every((r: any) => r.transport === 'lan' && r.latency.rttMs !== null), 'host records read loopback, guest records lan with an RTT');
    step = 'step 4';
````

In `scripts/network/duel-app-smoke.ts`, replace:

````ts
    proof.agreement = { tick: agreement.tick, sequence: agreement.sequence, hash: agreement.hash };
    step = 'step 7';
````

with:

````ts
    proof.agreement = { tick: agreement.tick, sequence: agreement.sequence, hash: agreement.hash };
    // F3 shows the latency overlay on either machine (spec §9): a screenshot of each beside the report, then F3 hides it.
    for (const app of [h, g]) await press(app, 'F3');
    await delay(500);
    for (const app of [h, g]) await app.request('screenshot', { path: join(resolve(reportPath, '..'), `f3-${app.profile}.png`) });
    for (const app of [h, g]) await press(app, 'F3');
    proof.overlay = { screenshots: ['f3-host.png', 'f3-guest.png'] };
    step = 'step 7';
````

In `scripts/network/duel-app-smoke.ts`, replace:

````ts
    for (const app of processes) if (!app.exited) { try { const done = app.request('shutdown'); await Promise.race([done, delay(6000)]); } catch { /* forced below */ } await kill(app); }
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
````

with:

````ts
    for (const app of processes) if (!app.exited) { try { const done = app.request('shutdown'); await Promise.race([done, delay(6000)]); } catch { /* forced below */ } await kill(app); }
    // Both machines' playtest logs, beside the report, for scripts/duel-playtest-report.ts (exact paths only).
    try {
      const copies = join(resolve(reportPath, '..'), 'records');
      rmSync(copies, { recursive: true, force: true });
      for (const profile of ['host', 'guest']) {
        const from = join(directory, profile, 'playtest');
        if (!existsSync(from)) continue;
        mkdirSync(join(copies, profile), { recursive: true });
        for (const f of readdirSync(from).filter((f) => /^duel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))) copyFileSync(join(from, f), join(copies, profile, f));
      }
    } catch { failure ??= 'record copy failed'; }
    try { await runtime?.dispose(); } catch { failure ??= 'workerd cleanup failed'; }
````

- [ ] **Step 2: Run the smoke and the report on its records**

Run: `npm run test:duel-app-runtime -- --report-path=out/h2b-duel-app/duel-app.json`
Expected: `ACTUAL DUEL APP: menu host/join/swap/start, the forced round end and round 2, records on both, Helm thrust and a beam on both, hash agreement, peer-lost pause and rejoin`, then `ACTUAL TWO-PROCESS DUEL APPLICATION PASS (<ms> ms)` (about 50 s), exit 0.
- `out/h2b-duel-app/duel-app.json` `proof.records` reads `transport: "loopback"` for the host and `"lan"` for the guest, each with a numeric `latency.rttMs` (about 1 ms on one PC).
- `out/h2b-duel-app/f3-host.png` and `f3-guest.png` show the overlay's four lines in the top-left corner (`LATENCY  LOOPBACK   F3: HIDE` and `LATENCY  LAN   F3: HIDE` first).
- `out/h2b-duel-app/records/host/` and `records/guest/` each hold one `duel-YYYY-MM-DD.jsonl`.

Run: `npx tsx scripts/duel-playtest-report.ts out/h2b-duel-app/records/host out/h2b-duel-app/records/guest`
Expected: exit 0, and the output shows the following:
- it starts `# Helm demo playtest report` and reads `2 file(s), 2 valid record(s), 0 invalid line(s) skipped.`;
- it quotes `> The demo is done when 4 of 5 are yes across 3 sessions`;
- one room, `| seed-2277 | lan | 0 | 1 | 1 |`, and two latency rows (`host | Weapons | loopback` and `guest | Helm | lan`);
- the no-checklist warning, and `**The demo is done: NO.**`, which is expected: one 25 s round;
- a blank checklist with `"session-1"`.

- [ ] **Step 3: Commit**

```
git add scripts/network/duel-app-smoke.ts
git commit -m "H-2b-i task 4: the duel smoke checks the record labels, saves F3 screenshots and keeps both machines' records"
```

---

### Task 5: The gates

**Files:** none (evidence under `out/`).

- [ ] **Step 1: The full suite**

Run: `npm run build`
Expected: exit 0.

Run: `npm test`
Expected: PASS, 265 test files, 3,861 tests (known load flakes: rerun alone).

- [ ] **Step 2: Determinism, the host runtime, the online application and the duel application**

Run: `npm run test:determinism -- --output-dir=out/h2b-determinism`
Expected: three PASS lines (Node, Electron, Firefox), exit 0.

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits; ...`, exit 0.

Run: `npm run test:online-app-runtime -- --report-path=out/h2b-online-app/online-app.json`
Expected: `ACTUAL TWO-PROCESS ONLINE APPLICATION PASS`, exit 0 (flaky only under machine load: rerun when idle).

Run: `npm run test:duel-app-runtime -- --report-path=out/h2b-duel-app/duel-app.json`
Expected: `ACTUAL TWO-PROCESS DUEL APPLICATION PASS (<ms> ms)`, exit 0.

Run: `npx tsx scripts/duel-playtest-report.ts out/h2b-duel-app/records/host out/h2b-duel-app/records/guest`
Expected: exit 0, as in Task 4 Step 2.

## After H-2b-i

- `2026-11-16-helm-h2b-ii-internet-candidate.md`: the internet candidate for SIM 39, the internet smoke's sector run on the test-only entry and its duel run, and what is proven before the owner's redeploy.
- The Codex implementation review, applied.
- Owner-only: the redeploy, both checklists (spec §10) and the §16 sessions. Afterwards, run the report on both PCs' `userData/playtest/` folders plus a filled `checklist.json`, and paste it into `docs/gates.md` and `reports/`.
