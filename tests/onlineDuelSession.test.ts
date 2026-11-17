// The online duel session (H-2 spec §3, §6, §7, §8): createOnlineDuelSession driven with a fake scheduler, fake window
// keyboard events, a fake port link and a stub duel stream client, so its own decisions are tested without Pixi or a
// network: presence first after ready on each attach, held frames every pump quantised by Math.sign, focus loss
// neutralising without a pause, Enter's rematch on a decided round and the leave prompt, a release swallowed by a pause
// re-sent after resume, CONNECTION LOST right after a link close, and each record's own disconnects, pauses and jitter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import type { OnlinePortDescriptor, OnlineStatus } from '../src/shared/onlineSession';
import { duelCompatibility } from '../src/main/network/onlineDuel';
import { CUTTER } from './helpers/scriptedDuel';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import type { ConsoleInput } from '../src/renderer/src/app/duel/input';
import type { ContactController, ContactSync } from '../src/renderer/src/app/duel/contactController';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
type Sent = { kind: 'held'; held: HeldInput } | { kind: 'command'; command: DuelCommand };
interface Pub { publicationSequence: number; tick: number; phase: string; pauseReason: string | null; pauseOwner: number | null; heldHighWater: number[] }
/** A stub of the duel stream client: the test publishes replicas and reads what the session sent. */
function stubClient() {
  let replica: DuelState | null = null, pub: Pub | null = null, sequence = 0, heldSequence = 0, commandSequence = 0, status = 'pending';
  const sent: Sent[] = [], events: unknown[] = [], neutralized: number[] = [], results: CommandResult[] = [], ids: { player: number; sequence: number }[] = [];
  return {
    sent, events, neutralized, results, ids,
    ready() { status = 'ready'; },
    commands: () => sent.flatMap((s) => (s.kind === 'command' ? [s.command] : [])),
    helds: () => sent.flatMap((s) => (s.kind === 'held' ? [s.held] : [])),
    publish(d: DuelState, phase = 'running', pause: { reason: string | null; owner: number | null } = { reason: null, owner: null }) {
      const next = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      if (replica) disposeDuel(replica);
      replica = next; sequence++;
      pub = { publicationSequence: sequence, tick: sequence * 3, phase, pauseReason: pause.reason, pauseOwner: pause.owner, heldHighWater: [0, 0] };
    },
    state: () => replica, publication: () => pub,
    command(player: number, command: DuelCommand) { sent.push({ kind: 'command', command }); const id = { player, sequence: ++commandSequence }; ids.push(id); return id; },
    held(_player: number, held: HeldInput) { sent.push({ kind: 'held', held: { ...held } }); return ++heldSequence; },
    neutralize(player: number) { neutralized.push(player); },
    commandStatus: () => ({ state: status }),
    takeResults: () => results.splice(0), takeEvents: () => events.splice(0),
    dispose() { if (replica) disposeDuel(replica); replica = null; pub = null; }
  };
}
type Stub = ReturnType<typeof stubClient>;
const h = vi.hoisted(() => ({
  clients: [] as unknown[], closers: [] as (() => void)[], draws: [] as { banner: string | null }[], overlay: [] as (readonly string[] | null)[],
  sceneOpts: [] as { ui: { frame(v: unknown): void; clear(): void } }[], disposes: { n: 0 }
}));
vi.mock('../src/network/modes/duelStream', () => ({ createDuelRemoteClient: () => { const c = stubClient(); h.clients.push(c); return c; } }));
vi.mock('../src/network/portLink', () => ({
  createPortLink: () => {
    const listeners: (() => void)[] = [];
    h.closers.push(() => { for (const cb of listeners.splice(0)) cb(); });
    return { onClose(cb: () => void) { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; }, close() {}, send() {}, onMessage: () => () => {} };
  }
}));
vi.mock('../src/network/transport/bridge', () => ({ browserPortEndpoint: () => ({}) }));
vi.mock('../src/renderer/src/app/duel/scene', () => ({
  // Mirrors the real scene: draw hands the UI a frame, dispose clears the sink (scene.ts dispose: options.ui.clear()).
  createDuelScene: (_renderer: unknown, opts: { ui: { frame(v: unknown): void; clear(): void } }) => {
    h.sceneOpts.push(opts);
    return {
      draw: (_source: unknown, _dt: number, o: { banner: string | null }) => {
        h.draws.push({ banner: o.banner });
        opts.ui.frame({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null });
      },
      dispose() { h.disposes.n++; opts.ui.clear(); }
    };
  }
}));
// Imported after the mocks are registered (vi.mock is hoisted above every import).
import { createOnlineDuelSession } from '../src/renderer/src/app/duel/onlineDuel';

/** A DOM-ish event target for the window and the canvas. */
function target() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener(type: string, fn: (e: unknown) => void) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener(type: string, fn: (e: unknown) => void) { listeners.get(type)?.delete(fn); },
    dispatch(type: string, e: unknown) { for (const fn of [...(listeners.get(type) ?? [])]) fn(e); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };
}
const descriptor = (epoch: number, seatId: number): OnlinePortDescriptor => ({ epoch, runId: 'c'.repeat(32), hostGeneration: 1, seatId, compatibility: duelCompatibility() });
const roundEvent = (round: number) => ({ payload: { kind: 'round', record: { round, seed: 7 } } });
/** Decide the round as the sim would leave it (a decided tick within the round). */
const decide = (d: DuelState): void => { d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick; };
/** The next round in place: ticks on, a new base tick, running again. */
const nextRound = (d: DuelState): void => {
  for (let k = 0; k < 4; k++) stepDuelTick(d, { held: [], commands: [] });
  d.round++; d.baseTick = d.interior.tick; d.decidedTick = -1; d.tactical.outcome = Outcome.Running;
};

let win: ReturnType<typeof target>;
beforeEach(() => { win = target(); (globalThis as { window?: unknown }).window = win; h.clients.length = 0; h.closers.length = 0; h.draws.length = 0; h.overlay.length = 0; h.sceneOpts.length = 0; h.disposes.n = 0; });
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

function rig(seat: 0 | 1, ui: { frame(v: never): void; clear(): void } = { frame() {}, clear() {} }, api: object = {}, extra: object = {}) {
  let now = 1000, pending: (() => void) | null = null;
  const records: DuelPlaytestRecord[] = [], leave = vi.fn(), d = createSeatedDuel(CUTTER, 7);
  // The F3 overlay's sink: the lines it was last given, or null once hidden.
  const latency = { frame: (lines: readonly string[]) => { h.overlay.push(lines); }, clear: () => { h.overlay.push(null); } };
  const session = createOnlineDuelSession({
    renderer: { app: { canvas: target() } } as never, ui: ui as never, latency, now: () => now, contentDigest: DIGEST, resolveLayout: () => CUTTER,
    scheduler: { schedule: (_ms, cb) => { pending = cb; return () => { if (pending === cb) pending = null; }; } },
    api: { viewState: async () => ({ ok: true }), ...api } as never, leave, recordDuel: (r) => { records.push(r); }, ...extra
  });
  let epoch = 0;
  const port = () => ({ close() {} }) as unknown as MessagePort;
  const r = {
    d, session, records, leave,
    /** The current attach's stub client. */
    client: () => h.clients.at(-1) as Stub,
    /** Attach on a new epoch. One pump runs before the new client's first publication (the source then sees the frozen
     *  copy, as after a real re-attach); the stub then publishes the duel and turns ready, and one pump syncs it. */
    attach(ready = true) {
      session.attach(descriptor(++epoch, seat), port());
      r.pump();
      const c = r.client(); c.publish(d);
      if (ready) { c.ready(); r.pump(); }
      return c;
    },
    pump(ms = 1000 / 60) { now += ms; const cb = pending; pending = null; cb?.(); },
    advance(ms: number) { now += ms; },
    key(type: 'keydown' | 'keyup', code: string) { win.dispatch(type, { code, repeat: false, preventDefault() {} }); },
    closeLink() { h.closers.at(-1)!(); },
    status(phase: OnlineStatus['phase']) { session.setStatus({ phase, role: 'guest' } as OnlineStatus); },
    dispose() { session.dispose(); disposeDuel(d); }
  };
  return r;
}

describe('the online duel session clears its UI on leave (React UI spec §2)', () => {
  it('passes deps.ui to the scene; dispose disposes it once and the duel slice goes null', () => {
    const store = createUiStore({ onlineAvailable: true }), sink = createDuelSink(store);
    const r = rig(0, sink);
    r.attach(); r.session.frame();
    expect(h.sceneOpts).toHaveLength(1);
    expect(h.sceneOpts[0]!.ui).toBe(sink);
    expect(h.draws.length).toBeGreaterThan(0);
    expect(store.getState().duel).not.toBeNull();
    r.dispose();
    expect(h.disposes.n).toBe(1);
    expect(store.getState().duel).toBeNull();
  });
});

describe('the online duel session (H-2 spec §3, §6, §7)', () => {
  it('presence is the first command once the client is ready, on every attach', () => {
    const r = rig(0);
    const first = r.attach(false);
    r.pump(); r.pump();
    expect(first.sent).toEqual([]);   // nothing before ready: no held frame, no command
    first.ready(); r.pump();
    expect(first.sent[0]).toEqual({ kind: 'command', command: { kind: 'presence', present: true } });
    expect(first.commands().filter((c) => c.kind === 'presence')).toHaveLength(1);
    r.pump();
    expect(first.commands().filter((c) => c.kind === 'presence')).toHaveLength(1);   // once per attach
    r.closeLink();
    const second = r.attach();
    expect(second.sent[0]).toEqual({ kind: 'command', command: { kind: 'presence', present: true } });
    r.dispose();
  });
  it('sends a held frame every pump, quantised to −1, 0 and 1 by Math.sign', () => {
    const r = rig(0), c = r.attach();
    r.key('keydown', 'KeyD'); r.key('keydown', 'KeyW');   // the diagonal: the keyboard gives ±1/√2
    const before = c.helds().length;
    r.pump(); r.pump(); r.pump();
    expect(c.helds().slice(before)).toEqual(Array(3).fill({ moveX: 1, moveY: -1, interactHeld: false }));
    r.key('keyup', 'KeyD'); r.key('keyup', 'KeyW'); r.pump();
    expect(c.helds().at(-1)).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
    r.dispose();
  });
  it('focus loss neutralises and lets go of a held charge without pausing; nothing is sent until focus returns', () => {
    const r = rig(1), c = r.attach();   // seat 1 sits at Weapons
    r.key('keydown', 'Space'); r.pump();
    expect(c.commands().at(-1)).toEqual({ kind: 'laserCharge', held: true });
    r.d.tactical.systems[0].fireHeld = true; c.publish(r.d); r.pump();
    r.session.setFocused(false);
    expect(c.neutralized).toEqual([1]);
    expect(c.commands().at(-1)).toEqual({ kind: 'laserCharge', held: false });
    expect(c.commands().some((x) => x.kind === 'setPaused')).toBe(false);
    const count = c.sent.length;
    r.pump(); r.pump();
    expect(c.sent.length).toBe(count);
    r.session.setFocused(true); r.pump();
    expect(c.sent.length).toBeGreaterThan(count);
    r.dispose();
  });
  it('Enter on a decided round sends one rematch per press; none while the leave prompt is open, where Enter leaves', () => {
    const r = rig(0), c = r.attach();
    decide(r.d); c.publish(r.d); r.pump();
    r.key('keydown', 'Enter'); r.key('keyup', 'Enter'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'rematch')).toHaveLength(1);
    expect(c.helds().at(-1)).toEqual({ moveX: 0, moveY: 0, interactHeld: false });   // neutral on the end card
    r.key('keydown', 'Escape'); r.pump();   // the end card's Escape opens the prompt, it does not pause
    expect(c.commands().some((x) => x.kind === 'setPaused')).toBe(false);
    r.key('keydown', 'Enter'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'rematch')).toHaveLength(1);
    expect(r.leave).toHaveBeenCalledTimes(1);
    r.dispose();
  });
  it('a Space release swallowed by a pause is re-sent after resume (plan Decision 7)', () => {
    const r = rig(1), c = r.attach();
    r.key('keydown', 'Space'); r.pump();
    expect(c.commands().at(-1)).toEqual({ kind: 'laserCharge', held: true });
    r.d.tactical.systems[0].fireHeld = true; c.publish(r.d); r.pump();
    c.publish(r.d, 'paused', { reason: 'player', owner: 0 }); r.pump();
    r.key('keyup', 'Space'); r.pump(); r.pump();   // drained while paused: no release goes out
    expect(c.commands().filter((x) => x.kind === 'laserCharge' && !x.held)).toHaveLength(0);
    c.publish(r.d, 'running'); r.advance(300); r.pump();   // still held in the replica after resume
    expect(c.commands().at(-1)).toEqual({ kind: 'laserCharge', held: false });
    r.dispose();
  });
  it('a link close shows CONNECTION LOST — RECONNECTING over the frozen view at once, and stops input', () => {
    const r = rig(0), c = r.attach();
    r.session.frame();
    expect(h.draws.at(-1)!.banner).toBeNull();
    r.closeLink();   // no status push from main yet: the closed client still holds its replica
    r.session.frame();
    expect(h.draws.at(-1)!.banner).toBe('CONNECTION LOST — RECONNECTING');
    const count = c.sent.length;
    r.key('keydown', 'KeyW'); r.pump(); r.pump();
    expect(c.sent.length).toBe(count);
    r.status('idle'); r.session.frame();
    expect(h.draws.at(-1)!.banner).toBe('LEAVING…');   // a Leave's phases keep LEAVING…
    r.attach(); r.session.frame();
    expect(h.draws.at(-1)!.banner).toBeNull();
    r.dispose();
  });
  it('each record has its own round\'s disconnects, pauses and arrival jitter, without the reconnect gap', () => {
    const r = rig(0);
    let c = r.attach();
    for (let k = 0; k < 4; k++) { r.advance(50); c.publish(r.d); r.pump(0); }
    c.publish(r.d, 'paused', { reason: 'player', owner: 0 }); r.pump(50);
    c.publish(r.d); r.pump(50);
    c.events.push(roundEvent(0)); decide(r.d); c.publish(r.d); r.pump(50);
    expect(r.records).toHaveLength(1);
    const first = r.records[0]!;
    expect([first.round, first.disconnects, first.pauses]).toEqual([0, 0, 1]);
    expect(first.jitter.count).toBe(7);   // the four, the pause, the resume and the decided round's publication
    // Round 1: one publication, a reconnect of ten seconds, two publications 50 ms apart on the new client.
    nextRound(r.d); c.publish(r.d); r.pump(50);
    c.publish(r.d); r.pump(50);
    r.closeLink(); r.advance(10_000);
    c = r.attach();
    c.publish(r.d); r.pump(50);
    c.events.push(roundEvent(1)); c.publish(r.d); r.pump(50);
    expect(r.records).toHaveLength(2);
    const second = r.records[1]!;
    expect([second.round, second.disconnects, second.pauses]).toEqual([1, 1, 0]);
    expect(second.jitter.count).toBe(3);   // the old client's gap and the new client's two: not the 10 s gap, nothing from round 0
    expect(second.jitter.stdMs).toBe(0);
    r.dispose();
  });
  it("labels each record with the link main reports: the guest's route and the round's median RTT; the host reads loopback (H-2b)", async () => {
    const flush = () => new Promise((done) => setTimeout(done, 0));
    for (const [seat, role] of [[1, 'guest'], [0, 'host']] as const) {
      let stats: { route: 'lan' | 'internet'; rttMs: number } | null = null;
      const r = rig(seat, undefined, { linkStats: async () => stats }), c = r.attach();
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
  it('the F3 overlay drops the live RTT when main has no figure (the label stays) and hides when there is nothing to draw', async () => {
    const flush = () => new Promise((done) => setTimeout(done, 0));
    let stats: { route: 'lan' | 'internet'; rttMs: number } | null = null;
    const r = rig(1, undefined, { linkStats: async () => stats }); r.attach(); await flush();
    stats = { route: 'internet', rttMs: 40 }; r.pump(1001); await flush();
    r.key('keydown', 'F3'); r.session.frame();
    expect(h.overlay.at(-1)).toContain('RTT 40 MS');
    stats = null; r.pump(1001); await flush(); r.session.frame();
    expect(h.overlay.at(-1)?.[0]).toContain('INTERNET');
    expect(h.overlay.at(-1)).toContain('RTT - MS');
    // A new attach whose client has published nothing yet, with no frozen copy: no state to draw.
    r.session.attach(descriptor(99, 1), { close() {} } as unknown as MessagePort); r.session.frame();
    expect(h.overlay.at(-1)).toBeNull();
    r.dispose();
  });
  it("without a link figure the guest's transport stays null, as in H-2a", () => {
    const r = rig(1), c = r.attach();
    c.events.push(roundEvent(0)); r.pump();
    expect([r.records[0]!.transport, r.records[0]!.latency.rttMs]).toEqual([null, null]);
    r.dispose();
  });
});

describe('the Artemis console clicks online (Artemis spec §4.1, §6.2)', () => {
  it('a lock click at Weapons sends laserLock to that room', () => {
    let input: ConsoleInput | null = null;
    const r = rig(1, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }), c = r.attach();   // seat 1 sits at Weapons
    const locks = () => c.commands().filter((x) => x.kind === 'laserLock');
    input!.lock(2); r.pump();
    expect(locks()).toEqual([{ kind: 'laserLock', room: 2 }]);
    input!.lock(7); r.pump();   // out of range: nothing
    expect(locks()).toHaveLength(1);
    r.dispose();
  });
  it('two lock clicks in successive pumps before any new publication both send, in order (no comparison with the confirmed lock)', () => {
    let input: ConsoleInput | null = null;
    const r = rig(1, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }), c = r.attach();
    const confirmed = r.d.tactical.systems[0].lock, other = confirmed === 2 ? 1 : 2;
    input!.lock(other); r.pump();
    input!.lock(confirmed); r.pump();
    expect(c.commands().filter((x) => x.kind === 'laserLock')).toEqual([{ kind: 'laserLock', room: other }, { kind: 'laserLock', room: confirmed }]);
    r.dispose();
  });
  it("calls setConsole with its keyboard's ui on creation and with null on dispose", () => {
    const setConsole = vi.fn();
    const r = rig(0, undefined, undefined, { setConsole });
    expect(setConsole).toHaveBeenCalledTimes(1);
    const ui = setConsole.mock.calls[0]![0] as ConsoleInput;
    expect(typeof ui.press).toBe('function'); expect(typeof ui.hold).toBe('function'); expect(typeof ui.lock).toBe('function');
    r.dispose();
    expect(setConsole).toHaveBeenCalledTimes(2);
    expect(setConsole.mock.calls[1]![0]).toBeNull();
  });
});

describe('the online Helm throttle (Artemis spec §5.4)', () => {
  const tap = (r: ReturnType<typeof rig>, code: string): void => { r.key('keydown', code); r.key('keyup', code); r.pump(); };
  const throttles = (c: Stub) => c.commands().filter((x) => x.kind === 'throttle');
  const lastThrottleId = (c: Stub) => c.ids[c.commands().map((x) => x.kind).lastIndexOf('throttle')]!;
  it('two W presses inside one round trip move two notches; S steps down from the level in flight', () => {
    const r = rig(0), c = r.attach();   // seat 0 flies the Helm
    tap(r, 'KeyW'); tap(r, 'KeyW');
    expect(throttles(c)).toEqual([{ kind: 'throttle', level: 1 }, { kind: 'throttle', level: 2 }]);
    tap(r, 'KeyS');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    r.dispose();
  });
  it('a rejected throttle drops back to the replica level', () => {
    const r = rig(0), c = r.attach();
    tap(r, 'KeyW'); tap(r, 'KeyW');   // 1, then 2 on top of it
    c.results.push({ id: lastThrottleId(c), tick: 3, status: 'rejected', reason: 'invalid-seat' }); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // from the replica's 0, not from 2
    r.dispose();
  });
  it('only the result for the level in flight hands the base back to the replica; a notch click asks for its level', () => {
    let input: ConsoleInput | null = null;
    const r = rig(0, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }), c = r.attach();
    tap(r, 'KeyW');
    const first = lastThrottleId(c);
    tap(r, 'KeyW');                                                       // 2 in flight
    c.results.push({ id: first, tick: 3, status: 'applied' }); r.d.throttle = 1; c.publish(r.d); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 3 });   // still built on the 2 in flight
    c.results.push({ id: lastThrottleId(c), tick: 4, status: 'applied' }); r.d.throttle = 4; c.publish(r.d); r.pump();
    tap(r, 'KeyS');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 3 });   // from the replica's 4
    input!.throttle(-1); r.pump();
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: -1 });
    r.dispose();
  });
  it('a stand and a new round clear the level in flight', () => {
    const r = rig(0), c = r.attach();
    tap(r, 'KeyW');                                                       // 1 in flight
    tap(r, 'KeyX');                                                       // the stand clears it (the replica still shows the seat)
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    tap(r, 'KeyW');                                                       // 2 in flight
    nextRound(r.d); c.publish(r.d); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // the new round starts from the replica's 0
    r.dispose();
  });
  it('a sit, a re-attach and a noop result each clear the level in flight (the base falls back to the replica)', () => {
    const r = rig(0), c = r.attach();
    tap(r, 'KeyW');                                                       // 1 in flight
    stepDuelTick(r.d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: r.d.interior.tick, command: { kind: 'stand' } }] });
    c.publish(r.d); r.pump();
    tap(r, 'KeyE');                                                       // the sit clears it
    stepDuelTick(r.d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence: 2 }, requestedTick: r.d.interior.tick, command: { kind: 'sit', station: r.d.nav } }] });
    c.publish(r.d); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // from the replica's 0, not from 2
    tap(r, 'KeyW');                                                       // 2 in flight
    const c2 = r.attach();                                                // a re-attach clears it
    tap(r, 'KeyW');
    expect(throttles(c2).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    tap(r, 'KeyW');                                                       // 2 in flight on c2
    c2.results.push({ id: lastThrottleId(c2), tick: 3, status: 'noop' } as never); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c2).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // a noop hands the base back too
    r.dispose();
  });
});

describe('the contact window online (enemy ship window spec §3, §6.2)', () => {
  const contactOf = (): ContactController => (h.sceneOpts.at(-1) as unknown as { contact: ContactController }).contact;
  const frame: ContactSync = { shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0 };
  /** What the scene does on a frame with a map click on the enemy at Weapons (the scene is stubbed here). */
  const show = (c: ContactController): void => { c.sync(frame); c.click(1); c.sync(frame); };
  it('with the window shown, Escape only closes it and sends no setPaused; with it closed, Escape pauses as before', () => {
    const r = rig(1), c = r.attach(), contact = contactOf();
    show(contact);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.pump();
    expect(c.commands().some((x) => x.kind === 'setPaused')).toBe(false);
    expect(contact.state()).toBeNull();
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'setPaused')).toEqual([{ kind: 'setPaused', paused: true }]);
    r.dispose();
  });
  it('with input blocked or the window unfocused, Escape and T are not taken by the window', () => {
    const r = rig(1); r.attach(); const contact = contactOf();
    show(contact);
    r.session.setInputBlocked(true);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.key('keydown', 'KeyT'); r.key('keyup', 'KeyT');
    expect(contact.state()).toEqual({ ship: 1, aim: false });
    r.session.setInputBlocked(false); r.session.setFocused(false);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape');
    expect(contact.state()).toEqual({ ship: 1, aim: false });
    r.session.setFocused(true);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape');
    expect(contact.state()).toBeNull();
    r.dispose();
  });
  it('on a decided round with the window shown, Escape opens no leave prompt: Enter then sends a rematch and does not leave', () => {
    const r = rig(1), c = r.attach(), contact = contactOf();
    decide(r.d); c.publish(r.d); r.pump();
    show(contact);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.pump();
    r.key('keydown', 'Enter'); r.key('keyup', 'Enter'); r.pump();
    expect(r.leave).not.toHaveBeenCalled();
    expect(c.commands().filter((x) => x.kind === 'rematch')).toHaveLength(1);
    r.dispose();
  });
  it('hands the scene its controller and a click source, and calls setContact with it on creation and null on dispose', () => {
    const setContact = vi.fn();
    const r = rig(0, undefined, undefined, { setContact }); r.attach();
    expect(setContact).toHaveBeenCalledTimes(1);
    const opts = h.sceneOpts.at(-1) as unknown as { contact: unknown; takeClick: unknown };
    expect(opts.contact).toBe(setContact.mock.calls[0]![0]);
    expect(typeof opts.takeClick).toBe('function');
    r.dispose();
    expect(setContact).toHaveBeenCalledTimes(2); expect(setContact.mock.calls[1]![0]).toBeNull();
  });
});
