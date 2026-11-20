// The online duel session (H-2 spec §3, §6, §7, §8): createOnlineDuelSession driven with a fake scheduler, fake window
// keyboard events, a fake port link and a stub duel stream client, so its own decisions are tested without Pixi or a
// network: presence first after ready on each attach, held frames every pump quantised by Math.sign, focus loss
// neutralising without a pause, Enter's rematch on a decided round and the leave prompt, a release swallowed by a pause
// re-sent after resume, CONNECTION LOST right after a link close, and each record's own disconnects, pauses and jitter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import type { CommandResult, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelPlaytestRecord } from '../src/renderer/src/net/duelRecord';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import type { OnlinePortDescriptor, OnlineStatus } from '../src/shared/onlineSession';
import { duelCompatibility } from '../src/network/online/onlineDuel';
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
  clients: [] as unknown[], closers: [] as (() => void)[], draws: [] as { banner: string | null; notice?: string | null }[], overlay: [] as (readonly string[] | null)[],
  sceneOpts: [] as { ui: { frame(v: unknown): void; clear(): void }; requests?: { pew(aim: number): void; reticle(aim: number): void; torpHeading(h: number): void; trigger(held: boolean): void } }[], sources: [] as { takeRefusals(): { control: string; reason: string }[] }[], disposes: { n: 0 },
  source: null as null | { helmVent(): { x: number; y: number }; thrMille(): number }
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
  createDuelScene: (_renderer: unknown, opts: { ui: { frame(v: unknown): void; clear(): void }; requests?: { pew(aim: number): void; reticle(aim: number): void; torpHeading(h: number): void; trigger(held: boolean): void } }) => {
    h.sceneOpts.push(opts);
    return {
      draw: (source: unknown, _dt: number, o: { banner: string | null; notice?: string | null }) => {
        h.source = source as typeof h.source;
        h.sources.push(source as never);
        h.draws.push({ banner: o.banner, notice: o.notice });
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
beforeEach(() => { win = target(); (globalThis as { window?: unknown }).window = win; h.clients.length = 0; h.closers.length = 0; h.draws.length = 0; h.overlay.length = 0; h.sceneOpts.length = 0; h.sources.length = 0; h.disposes.n = 0; });
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

function rig(seat: 0 | 1, ui: { frame(v: never): void; clear(): void } = { frame() {}, clear() {} }, api: object = {}, extra: object = {}, cls?: number) {   // playtest2feedback Decision 17: cls picks the Valkyrn for the client's throttle prediction tests
  let now = 1000, pending: (() => void) | null = null;
  const records: DuelPlaytestRecord[] = [], leave = vi.fn(), d = createSeatedDuel(CUTTER, 7, 0, 2, cls);
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
    key(type: 'keydown' | 'keyup', code: string, mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) { win.dispatch(type, { code, repeat: false, preventDefault() {}, ...mods }); },
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

describe('the online pew (W-1 review F2)', () => {
  const pewCommands = (c: Stub) => c.commands().filter((x) => x.kind === 'pewFire');
  const refusals = () => h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'pew');
  it('sends the click even when the replica shows no charge; an unavailable answer from the authority shows NO CHARGE', () => {
    const r = rig(1);
    r.d.tactical.systems[0]!.pewCharge = 0;   // the lagging replica: empty
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyR'); r.key('keyup', 'KeyR'); r.pump();   // W-4b: pew pew, the selected weapon, to MAN, where the click fires (W-4 spec §4.3: kind (a))
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(pewCommands(c)).toHaveLength(1);
    r.session.frame(); expect(refusals()).toEqual([]);   // nothing is shown before the authority answers
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('pewFire')]!;
    c.results.push({ id, tick: 3, status: 'rejected', reason: 'unavailable' }); r.pump();
    r.session.frame();
    expect(refusals()).toEqual([{ control: 'pew', reason: 'NO CHARGE' }]);
    c.results.push({ id: { ...id, sequence: id.sequence + 99 }, tick: 4, status: 'rejected', reason: 'unavailable' }); r.pump(); r.session.frame();
    expect(refusals()).toEqual([]);   // only a pewFire this seat sent
    r.dispose();
  });
  it('an applied pew shows nothing; a seat that is not the gunner refuses locally and sends nothing', () => {
    const r = rig(1), c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyR'); r.key('keyup', 'KeyR'); r.pump();   // W-4b: pew pew, the selected weapon, to MAN, where the click fires (W-4 spec §4.3: kind (a))
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    c.results.push({ id: c.ids[c.commands().map((x) => x.kind).lastIndexOf('pewFire')]!, tick: 3, status: 'applied' }); r.pump(); r.session.frame();
    expect(refusals()).toEqual([]);
    r.dispose();
    const h0 = rig(0), c0 = h0.attach();   // seat 0 flies: not the Weapons seat
    h0.session.frame(); h.sceneOpts.at(-1)!.requests!.pew(1234); h0.pump();
    expect(pewCommands(c0)).toHaveLength(0);
    h0.dispose();
  });
});

describe('the online Hound Weapons seat (W-4 spec §11)', () => {
  const tapKey = (r: ReturnType<typeof rig>, code: string): void => { r.key('keydown', code); r.key('keyup', code); };
  it('2 selects the autocannon: the held trigger rides the frame as gunHeld; 1 selects pew pew and drops it', () => {
    const r = rig(1), c = r.attach();
    r.session.frame();
    tapKey(r, 'Digit2'); tapKey(r, 'KeyR'); h.sceneOpts[0]!.requests!.trigger(true); r.pump(); r.session.frame();   // the autocannon selected and on MAN in the same pump (W-4 spec §4.3: kind (a))
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 1, gunHeld: true });
    h.sceneOpts[0]!.requests!.trigger(false); tapKey(r, 'Digit1'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 0 });
    expect(c.helds().at(-1)).not.toHaveProperty('gunHeld');
    r.dispose();
  });
  it('with pew pew selected (the default) the map click sends pewFire {}; the authority\'s unavailable shows NO CHARGE', () => {
    const r = rig(1);
    r.d.tactical.systems[0]!.pewCharge = 0;   // the lagging replica: empty
    const c = r.attach();
    r.session.frame();
    tapKey(r, 'KeyR'); r.pump();   // W-4b: pew pew to MAN (W-4 spec §4.3: kind (a))
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([{ kind: 'pewFire' }]);
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('pewFire')]!;
    c.results.push({ id, tick: 3, status: 'rejected', reason: 'unavailable' }); r.pump();
    r.session.frame();
    expect(h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'pew')).toEqual([{ control: 'pew', reason: 'NO CHARGE' }]);
    r.dispose();
  });
  it('a new round starts on pew pew, still seated (the selection\'s round reset)', () => {
    const r = rig(1), c = r.attach();
    tapKey(r, 'Digit2'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 1 });
    nextRound(r.d); c.publish(r.d); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 0 });
    r.dispose();
  });
  it('off the seat the selection resets: a stand and a sit back start on pew pew', () => {
    const r = rig(1), c = r.attach();
    const stepOne = (command: DuelCommand, sequence: number): void => {
      stepDuelTick(r.d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence }, requestedTick: r.d.interior.tick, command }] });
      c.publish(r.d); r.pump();
    };
    tapKey(r, 'Digit3'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 2 });
    stepOne({ kind: 'stand' }, 1);   // the replica shows the stand (the authority's, not this seat's X)
    expect(c.helds().at(-1)).not.toHaveProperty('weaponSel');
    stepOne({ kind: 'sit', station: r.d.weapons }, 2);
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 0 });
    r.dispose();
  });
  it('4 tunes the guns to frequency 0; 3 selects the torpedo and sends no frequency', () => {
    const r = rig(1), c = r.attach();
    r.session.frame();
    tapKey(r, 'Digit4'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'laserFrequency')).toEqual([{ kind: 'laserFrequency', freq: 0 }]);
    tapKey(r, 'Digit3'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'laserFrequency')).toHaveLength(1);
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 2 });
    r.dispose();
  });
  it('R sends gunMode for the selected gun; a second R before the result flips back (from gunModeSent for that slot)', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const modes = () => c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode');
    tapKey(r, 'KeyR'); r.pump(); tapKey(r, 'KeyR'); r.pump();
    expect(modes()).toEqual([{ kind: 'gunMode', slot: 0, manual: true }, { kind: 'gunMode', slot: 0, manual: false }]);
    tapKey(r, 'Digit2'); tapKey(r, 'KeyR'); r.pump();
    expect(modes().at(-1)).toEqual({ kind: 'gunMode', slot: 1, manual: true });   // the autocannon's own switch; pew pew's in-flight mode is untouched
    tapKey(r, 'Digit3'); tapKey(r, 'KeyR'); r.pump();
    expect(modes().at(-1)).toEqual({ kind: 'torpMode', manual: true });   // the torpedo selected: R is its torpMode
    r.dispose();
  });
  it('Shift+R sends both guns to AUTO when either is on MAN (only the one that changes), else both to MAN, and never torpMode; Ctrl+R sends nothing', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const modes = () => c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode');
    const shiftR = (): void => { r.key('keydown', 'KeyR', { shiftKey: true }); r.key('keyup', 'KeyR', { shiftKey: true }); r.pump(); };
    shiftR();
    expect(modes()).toEqual([{ kind: 'gunMode', slot: 0, manual: true }, { kind: 'gunMode', slot: 1, manual: true }]);
    tapKey(r, 'KeyR'); r.pump();   // pew pew back to AUTO: the autocannon is still on MAN in flight
    shiftR();
    expect(modes().slice(3)).toEqual([{ kind: 'gunMode', slot: 1, manual: false }]);
    r.key('keydown', 'KeyR', { ctrlKey: true }); r.key('keyup', 'KeyR', { ctrlKey: true }); r.pump();
    expect(modes()).toHaveLength(4);
    r.dispose();
  });
  it('Z and V send nothing from the Hound\'s Weapons seat', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    tapKey(r, 'KeyZ'); tapKey(r, 'KeyV'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode' || x.kind === 'laserMode')).toEqual([]);
    r.dispose();
  });
  it('on AUTO a left click with pew pew selected sends nothing; after R it sends pewFire {}', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([]);
    tapKey(r, 'KeyR'); r.pump();
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([{ kind: 'pewFire' }]);
    r.dispose();
  });
  it('the held frame follows the reticle, pump by pump (the latest kept, not drained)', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    h.sceneOpts[0]!.requests!.reticle(4000); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ turretAim: 4000 });
    r.pump();
    expect(c.helds().at(-1)).toMatchObject({ turretAim: 4000 });   // no new pointer sample: the last reticle stands
    h.sceneOpts[0]!.requests!.reticle(5000); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ turretAim: 5000 });
    r.dispose();
  });
  it("the source's turret(0) follows the reticle at MAN traverse while gunMode is in flight, then the replica's again", () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
    // turretAim is a world fine aim and the spawn heading depends on the seed (map.ts spawnAt): aim 2000 steps right of the
    // replica's nose, inside the pew's ±10922 arc.
    const h0 = c.state()!.tactical.ships[0].heading, want = (h0 * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // AUTO: the replica's
    r.key('keydown', 'KeyR'); r.key('keyup', 'KeyR'); r.pump(); r.pump(); r.session.frame();   // R with pew pew selected: its gunMode {slot: 0} is in flight
    const p = src().turret(0);
    expect(p > 0 && p <= 2000 && (p % 455 === 0 || p === 2000)).toBe(true);   // k unacknowledged frames of MAN's 455 a frame toward +2000
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('gunMode')]!;
    c.results.push({ id, tick: 3, status: 'applied' }); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // gunModeSent[0] cleared: the replica's mode (AUTO) is the base again
    r.dispose();
  });
  it("the prediction reads the selected gun's own mode: pew pew's MAN in flight does not move the autocannon's turret (amendment §2.6)", () => {
    const r = rig(1), sys = r.d.tactical.systems[0]!;
    sys.bars[1] = 3; sys.weaponPower = [1, 1, 1];   // the autocannon powered on the replica (an unpowered gun is never predicted)
    const c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
    const h0 = c.state()!.tactical.ships[0].heading, want = (h0 * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want);
    tapKey(r, 'KeyR'); r.pump();   // pew pew, the selected weapon, to MAN (in flight)
    tapKey(r, 'Digit2'); r.pump(); r.pump(); r.session.frame();
    expect(src().turret(1)).toBe(0);   // the autocannon is selected and its own switch is AUTO: the replica's turret
    tapKey(r, 'KeyR'); r.pump(); r.pump(); r.session.frame();
    const p = src().turret(1);
    expect(p > 0 && p <= 2000 && (p % 341 === 0 || p === 2000)).toBe(true);   // its own gunMode in flight: MAN's 341 a frame
    r.dispose();
  });
  it('two E presses before a replica arrives step the target room twice (lockSent); it clears on the result, a new round and a stand', () => {
    const r = rig(1), c = r.attach(); r.session.frame();
    const locks = () => c.commands().filter((x) => x.kind === 'laserLock' || x.kind === 'torpLock');
    const e = (): void => { tapKey(r, 'KeyE'); r.pump(); };
    e(); e();
    expect(locks()).toEqual([{ kind: 'laserLock', room: 2 }, { kind: 'laserLock', room: 0 }]);   // from the replica's Shields, then from the room in flight
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('laserLock')]!;
    c.results.push({ id, tick: 3, status: 'applied' }); r.pump();
    e();
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });   // the result cleared it: the replica's lock (still Shields) is the base again
    nextRound(r.d); c.publish(r.d); r.pump();
    e();
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });   // a new round: from its Shields, not from the room in flight
    tapKey(r, 'KeyX'); r.pump();   // this seat's stand clears it (the replica still shows the seat)
    e();
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });
    expect(locks().some((x) => x.kind === 'torpLock')).toBe(false);
    r.dispose();
  });
  it('Q steps back, and a plain room click (the console lock request) sends laserLock; neither sends torpLock, and a clear is never sent', () => {
    const consoles: { lock(room: number): void }[] = [];
    const r = rig(1, undefined, {}, { setConsole: (i: { lock(room: number): void } | null) => { if (i) consoles.push(i); } }), c = r.attach(); r.session.frame();
    const locks = () => c.commands().filter((x) => x.kind === 'laserLock' || x.kind === 'torpLock');
    tapKey(r, 'KeyQ'); r.pump();
    expect(locks()).toEqual([{ kind: 'laserLock', room: 0 }]);   // Q: Shields → Weapons
    consoles[0]!.lock(2); r.pump();   // the enemy window's plain room click reaches the session through the console's lock
    expect(locks().at(-1)).toEqual({ kind: 'laserLock', room: 2 });
    consoles[0]!.lock(-1); r.pump();
    expect(locks()).toHaveLength(2);   // the target room has no "none"
    r.dispose();
  });
  it("a gun tag's click (the console's mode(slot)) sends that gun's gunMode, whatever is selected (Task 11 review: the tags reach the wire)", () => {
    const consoles: ConsoleInput[] = [];
    const r = rig(1, undefined, {}, { setConsole: (i: ConsoleInput | null) => { if (i) consoles.push(i); } }), c = r.attach(); r.session.frame();
    const modes = () => c.commands().filter((x) => x.kind === 'gunMode' || x.kind === 'torpMode');
    consoles[0]!.mode?.(1); r.pump();   // pew pew selected; the autocannon's tag is its own switch
    expect(modes()).toEqual([{ kind: 'gunMode', slot: 1, manual: true }]);
    consoles[0]!.mode?.(0); consoles[0]!.mode?.(2); r.pump();
    expect(modes().slice(1)).toEqual([{ kind: 'gunMode', slot: 0, manual: true }, { kind: 'torpMode', manual: true }]);
    r.dispose();
  });
  it('a MANUAL flight: no gunHeld, no pewFire, then the selection returns; the turret is not predicted while it flies (W-4 spec §7, §11)', () => {
    const r = rig(1);
    placeMissile(r.d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
    const c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
    const key = (code: string): void => { r.key('keydown', code); r.key('keyup', code); r.pump(); };
    r.key('keydown', 'KeyR', { shiftKey: true }); r.key('keyup', 'KeyR', { shiftKey: true }); r.pump();   // Shift+R: both guns to MAN (the rig's key takes the modifiers since W-4b)
    const want = (c.state()!.tactical.ships[0].heading * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want); r.pump(); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // k = 0 while it flies
    key('Digit2'); h.sceneOpts[0]!.requests!.trigger(true); r.pump();
    expect(c.helds().at(-1)).not.toHaveProperty('gunHeld');
    h.sceneOpts[0]!.requests!.trigger(false); key('Digit1');
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([]);
    key('Digit3');
    removeMissile(r.d.tactical, 0); r.client().publish(r.d); r.pump(); r.session.frame();
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 0 });   // back to the last gun
    expect(src().turret(0)).toBeGreaterThan(0);   // predicted again
    r.dispose();
  });
});

describe('the online manual laser (W-2)', () => {
  const sent = (c: Stub, kind: string) => c.commands().filter((x) => x.kind === kind);
  const fireRefusals = () => h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'fire');
  it('Z sends laserMode from the mode in flight, else the replica\'s', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit
    r.session.frame();
    r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump();
    r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump();
    expect(sent(c, 'laserMode')).toEqual([{ kind: 'laserMode', manual: true }, { kind: 'laserMode', manual: false }]);
    r.dispose();
  });
  it('in MANUAL Space sends laserFire along the map aim even on an uncharged replica; an unavailable answer shows NO CHARGE', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    todaysCrewWeapons(r.d.tactical);   // merge with the Engineering spike (kind a): the beam needs a bar (spec §10.3)
    r.d.tactical.systems[0]!.laserManual = true;
    r.d.tactical.systems[0]!.laserCharge = 0;   // the lagging replica: empty
    const c = r.attach();
    r.session.frame();
    h.sceneOpts[0]!.requests!.reticle(1234);   // W-4 spec §9: the reticle (was aimLaser; kind (a) rename)
    r.key('keydown', 'Space'); r.key('keyup', 'Space'); r.pump();
    expect(sent(c, 'laserFire')).toEqual([{ kind: 'laserFire', aim: 4, aimAcc: 210 }]);
    expect(sent(c, 'laserCharge')).toEqual([]);
    r.session.frame(); expect(fireRefusals()).toEqual([]);   // nothing is shown before the authority answers
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('laserFire')]!;
    c.results.push({ id, tick: 3, status: 'rejected', reason: 'unavailable' }); r.pump();
    r.session.frame();
    expect(fireRefusals()).toEqual([{ control: 'fire', reason: 'NO CHARGE' }]);
    r.dispose();
  });
});

describe('the online manual torpedo (W-3)', () => {
  const sent = (c: Stub, kind: string) => c.commands().filter((x) => x.kind === kind);
  const launchRefusals = () => h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'launch');
  /** The crew far from the enemy (out of torpedo range). */
  const apart = (d: DuelState): void => { Object.assign(d.tactical.ships[0], { x: 0, y: 1500, vx: 0, vy: 0 }); Object.assign(d.tactical.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 }); };
  it('V sends torpMode from the mode in flight, else the replica\'s', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 amendment §2.4 (kind (a)): V is not read at the Hound's Weapons seat; it stays the laser fit's
    r.session.frame();
    r.key('keydown', 'KeyV'); r.key('keyup', 'KeyV'); r.pump();
    r.key('keydown', 'KeyV'); r.key('keyup', 'KeyV'); r.pump();
    expect(sent(c, 'torpMode')).toEqual([{ kind: 'torpMode', manual: true }, { kind: 'torpMode', manual: false }]);
    r.dispose();
  });
  it('in MANUAL F is sent out of range and on an empty replica magazine; an unavailable answer names NO TORPEDOES', () => {
    const r = rig(1);
    apart(r.d);
    r.d.tactical.systems[0]!.torpManual = true;
    r.d.tactical.systems[0]!.magazine = 0;   // the lagging replica: empty
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyF'); r.key('keyup', 'KeyF'); r.pump();
    expect(sent(c, 'missileLaunch')).toEqual([{ kind: 'missileLaunch' }]);
    r.session.frame(); expect(launchRefusals()).toEqual([]);   // nothing is shown before the authority answers
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('missileLaunch')]!;
    c.results.push({ id, tick: 3, status: 'rejected', reason: 'unavailable' }); r.pump();
    r.session.frame();
    expect(launchRefusals()).toEqual([{ control: 'launch', reason: 'NO TORPEDOES' }]);
    r.dispose();
  });
  it('in AUTO F out of range is not sent and says OUT OF RANGE', () => {
    const r = rig(1);
    apart(r.d);
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyF'); r.key('keyup', 'KeyF'); r.pump();
    expect(sent(c, 'missileLaunch')).toEqual([]);
    r.session.frame();
    expect(launchRefusals()).toEqual([{ control: 'launch', reason: 'OUT OF RANGE' }]);
    r.dispose();
  });
  it('while the replica shows the MANUAL torpedo flying, the map\'s steer is torpHeading and A/D send nothing for it (W-4 spec §7)', () => {
    const r = rig(1);
    apart(r.d);
    r.d.tactical.systems[0]!.torpManual = true;
    placeMissile(r.d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyD'); r.pump();
    expect('torpTurn' in c.helds().at(-1)!).toBe(false);   // W-4 spec §7: A/D no longer steer
    r.key('keyup', 'KeyD');
    h.sceneOpts[0]!.requests!.torpHeading(40); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });
    r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });   // re-sent while it holds
    r.key('keydown', 'KeyA'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });   // A no longer clears it
    r.dispose();
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
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
    r.key('keydown', 'KeyD'); r.key('keydown', 'KeyW');   // the diagonal: the keyboard gives ±1/√2
    const before = c.helds().length;
    r.pump(); r.pump(); r.pump();
    expect(c.helds().slice(before)).toEqual(Array(3).fill({ moveX: 1, moveY: -1, interactHeld: false }));
    r.key('keyup', 'KeyD'); r.key('keyup', 'KeyW'); r.pump();
    expect(c.helds().at(-1)).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
    r.dispose();
  });
  it('Feel-i: Space held at the Helm rides the held frame as face; seat 1 at Weapons never sends it', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();   // seat 0 at the Valkyrn class's Helm (helm round 2 §4: the crew Helm sends no face)
    r.key('keydown', 'Space'); r.pump();
    expect(c.helds().at(-1)).toEqual({ moveX: 0, moveY: 0, interactHeld: false, face: true });
    expect(c.commands().some((x) => x.kind === 'laserCharge')).toBe(false);
    r.key('keyup', 'Space'); r.pump();
    expect(c.helds().at(-1)).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
    r.dispose();
    const w = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), cw = w.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit
    w.key('keydown', 'Space'); w.pump();
    expect(cw.helds().at(-1)).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
    w.dispose();
  });
  it('focus loss neutralises without pausing and sends no release (Space is a single press, FTL targeting spec §2); nothing is sent until focus returns', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit. seat 1 sits at Weapons
    r.key('keydown', 'Space'); r.pump();
    expect(c.commands().at(-1)).toEqual({ kind: 'laserCharge', held: true });
    const commands = c.commands().length;
    r.session.setFocused(false);
    expect(c.neutralized).toEqual([1]);
    expect(c.commands().length).toBe(commands);
    expect(c.commands().some((x) => x.kind === 'laserCharge' && !x.held)).toBe(false);
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
  it('Space is a single press: one laserCharge press and never a release, paused or not (FTL targeting spec §2)', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit
    r.key('keydown', 'Space'); r.pump();
    expect(c.commands().at(-1)).toEqual({ kind: 'laserCharge', held: true });
    c.publish(r.d, 'paused', { reason: 'player', owner: 0 }); r.pump();
    r.key('keyup', 'Space'); r.pump(); r.pump();
    c.publish(r.d, 'running'); r.advance(300); r.pump();
    expect(c.commands().filter((x) => x.kind === 'laserCharge')).toEqual([{ kind: 'laserCharge', held: true }]);
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
    const r = rig(1, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit. seat 1 sits at Weapons
    const locks = () => c.commands().filter((x) => x.kind === 'laserLock');
    input!.lock(2); r.pump();
    expect(locks()).toEqual([{ kind: 'laserLock', room: 2 }]);
    input!.lock(7); r.pump();   // out of range: nothing
    expect(locks()).toHaveLength(1);
    r.dispose();
  });
  it('FTL targeting spec §1: a torpedo target click sends torpLock, a card clear sends −1 for either weapon, and E / Q with the torpedo picked up step its own target, keeping it picked up', () => {
    let input: ConsoleInput | null = null;
    const r = rig(1, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit
    const targets = () => c.commands().filter((x) => x.kind === 'laserLock' || x.kind === 'torpLock');
    input!.torpLock(0); r.pump();
    input!.torpLock(-1); input!.lock(-1); r.pump();
    expect(targets()).toEqual([{ kind: 'torpLock', room: 0 }, { kind: 'laserLock', room: -1 }, { kind: 'torpLock', room: -1 }]);
    const contact = (h.sceneOpts.at(-1) as unknown as { contact: ContactController }).contact;
    contact.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0 });
    expect(r.d.tactical.systems[0].torpLock).toBe(-1);
    r.key('keydown', 'Digit2'); r.key('keyup', 'Digit2'); r.key('keydown', 'KeyE'); r.key('keyup', 'KeyE'); r.pump();
    expect(targets().at(-1)).toEqual({ kind: 'torpLock', room: 0 });   // from no torpedo target: E starts at Room 0 (never the laser's lock)
    expect(contact.aimWeapon()).toBe('torpedo');                         // still picked up
    r.key('keydown', 'KeyQ'); r.key('keyup', 'KeyQ'); r.pump();
    expect(targets().at(-1)).toEqual({ kind: 'torpLock', room: 2 });   // the replica still has none: Q starts at Room 2
    r.d.tactical.systems[0].torpLock = 1; c.publish(r.d);
    r.key('keydown', 'KeyE'); r.key('keyup', 'KeyE'); r.pump();
    expect(targets().at(-1)).toEqual({ kind: 'torpLock', room: 2 });   // from its own target (1)
    expect(c.commands().filter((x) => x.kind === 'laserLock')).toHaveLength(1);    // E and Q were taken: no laser lock step
    r.dispose();
  });
  it('two lock clicks in successive pumps before any new publication both send, in order (no comparison with the confirmed lock)', () => {
    let input: ConsoleInput | null = null;
    const r = rig(1, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }, ShipClass.ValkyrnLaser), c = r.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit
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
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();   // seat 0 flies the Helm
    tap(r, 'KeyW'); tap(r, 'KeyW');
    expect(throttles(c)).toEqual([{ kind: 'throttle', level: 1 }, { kind: 'throttle', level: 2 }]);
    tap(r, 'KeyS');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });
    r.dispose();
  });
  it('a rejected throttle drops back to the replica level', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
    tap(r, 'KeyW'); tap(r, 'KeyW');   // 1, then 2 on top of it
    c.results.push({ id: lastThrottleId(c), tick: 3, status: 'rejected', reason: 'invalid-seat' }); r.pump();
    tap(r, 'KeyW');
    expect(throttles(c).at(-1)).toEqual({ kind: 'throttle', level: 1 });   // from the replica's 0, not from 2
    r.dispose();
  });
  it('only the result for the level in flight hands the base back to the replica; a notch click asks for its level', () => {
    let input: ConsoleInput | null = null;
    const r = rig(0, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }, ShipClass.Valkyrn), c = r.attach();
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
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
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
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
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

describe('the online crew Helm on the Cutter (playtest2feedback Task 10)', () => {
  const headings = (c: Stub) => c.commands().filter((x) => x.kind === 'heading');
  const ask = (r: ReturnType<typeof rig>, heading: number): void => { (h.sceneOpts.at(-1) as unknown as { requests: { heading(n: number): void } }).requests.heading(heading); r.pump(); };
  it('held W rides the frame as throttleHeld and a Digit1 press sends no helmPower (owner 2026-11-19)', () => {
    const r = rig(0), c = r.attach();
    r.key('keydown', 'KeyW'); r.key('keydown', 'Digit1'); r.pump(); r.pump(); r.pump();
    r.key('keyup', 'Digit1'); r.pump();
    expect(c.helds().at(-1)!.throttleHeld).toBe(1);
    expect(c.helds().slice(-3).every((x) => x.throttleHeld === 1)).toBe(true);
    expect(c.commands().filter((x) => (x.kind as string) === 'helmPower')).toEqual([]);
    r.dispose();
  });
  it('helm round 2 §4: the map\'s heading request sends nothing at the crew Helm, whatever the replica holds', () => {
    const r = rig(0), c = r.attach();
    ask(r, 77); ask(r, -1);
    r.d.holdHeading = 77; c.publish(r.d); r.pump(); ask(r, 12);
    expect(headings(c)).toEqual([]);
    r.dispose();
  });
  it('helm round 2 §4: Space rides no face at the crew Helm and raises no auto-face refusal', () => {
    const r = rig(0), c = r.attach();
    r.d.tactical.systems[0].rooms[Room.Engines] = 2; c.publish(r.d); r.pump();   // Engines failed: the old refusal's condition
    r.key('keydown', 'Space'); r.pump(); r.session.frame();
    expect(c.helds().at(-1)).not.toHaveProperty('face');
    expect(h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'auto-face')).toEqual([]);
    r.dispose();
  });
  it('helm round 2 §2.3, §7: a tap of S with the predicted throttle above 0 sends one throttleCut, and the source shows 0 until its result', () => {
    const r = rig(0), c = r.attach(), cuts = () => c.commands().filter((x) => x.kind === 'throttleCut');
    r.d.thrMille = 400; c.publish(r.d); r.pump();
    r.key('keydown', 'KeyS'); r.pump(); r.advance(80); r.key('keyup', 'KeyS'); r.pump();
    expect(cuts()).toEqual([{ kind: 'throttleCut' }]);
    r.session.frame();
    expect(h.source!.thrMille()).toBe(0);   // the cut in flight
    c.results.push({ id: c.ids[c.commands().map((x) => x.kind).lastIndexOf('throttleCut')]!, tick: 3, status: 'applied' }); r.pump(); r.session.frame();
    expect(h.source!.thrMille()).toBe(c.state()!.thrMille);   // the result: the replica is the base again
    r.dispose();
  });
  it('helm round 2 §2.3: a tap of S at 0 and a 250 ms press of S send no cut', () => {
    const a = rig(0), ca = a.attach();
    a.key('keydown', 'KeyS'); a.pump(); a.advance(80); a.key('keyup', 'KeyS'); a.pump();
    expect(ca.commands().filter((x) => x.kind === 'throttleCut')).toEqual([]);
    a.dispose();
    const b = rig(0), cb = b.attach();
    b.d.thrMille = 400; cb.publish(b.d); b.pump();
    b.key('keydown', 'KeyS'); b.pump(); b.advance(250); b.key('keyup', 'KeyS'); b.pump();
    expect(cb.commands().filter((x) => x.kind === 'throttleCut')).toEqual([]);
    b.dispose();
  });
  it('helm round 2 §2.3, §7: a tap of W with the predicted throttle below 0 sends one throttleCut', () => {
    const r = rig(0), c = r.attach();
    r.d.thrMille = -300; c.publish(r.d); r.pump();
    r.key('keydown', 'KeyW'); r.pump(); r.advance(80); r.key('keyup', 'KeyW'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'throttleCut')).toEqual([{ kind: 'throttleCut' }]);
    r.session.frame();
    expect(h.source!.thrMille()).toBe(0);   // the cut in flight
    r.dispose();
  });
  it('helm round 2 §3.3: a PORT / STBD button press on the replica\'s empty charge says NO GAS once a press', () => {
    let input: ConsoleInput | null = null;
    const r = rig(0, undefined, undefined, { setConsole: (i: ConsoleInput | null) => { input = i; } }), c = r.attach();
    const gas = () => h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'gas');
    r.d.gas = 0; c.publish(r.d); r.pump(); r.session.frame(); gas();
    input!.hold('ArrowLeft', true); r.pump(); r.pump(); r.pump(); r.session.frame();
    expect(gas()).toEqual([{ control: 'gas', reason: 'NO GAS' }]);   // once, for the held press
    input!.hold('ArrowLeft', false); r.pump(); input!.hold('ArrowRight', true); r.pump(); r.session.frame();
    expect(gas()).toEqual([{ control: 'gas', reason: 'NO GAS' }]);   // a new press
    r.dispose();
  });
  it('helm round 2 §7: a new round, a stand, a sit and a re-attach each clear the cut in flight (the prediction no longer reads 0 from it)', () => {
    const r = rig(0);
    let c = r.attach();
    const stepOne = (command: DuelCommand, sequence: number): void => {
      stepDuelTick(r.d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence }, requestedTick: r.d.interior.tick, command }] });
    };
    /** A tap of S at 400 with no result: the cut is in flight and the prediction reads 0. */
    const cutInFlight = (why: string): void => {
      r.d.thrMille = 400; c.publish(r.d); r.pump();
      const before = c.commands().filter((x) => x.kind === 'throttleCut').length;
      r.key('keydown', 'KeyS'); r.pump(); r.advance(80); r.key('keyup', 'KeyS'); r.pump();
      expect(c.commands().filter((x) => x.kind === 'throttleCut').length, why).toBe(before + 1);
      r.session.frame(); expect(h.source!.thrMille(), `${why}: in flight`).toBe(0);
    };
    const replica = (why: string): void => { r.session.frame(); expect(h.source!.thrMille(), `${why}: cleared`).toBe(400); };
    cutInFlight('new round');
    nextRound(r.d); r.d.thrMille = 400; c.publish(r.d); r.pump();
    replica('new round');
    cutInFlight('stand');
    r.key('keydown', 'KeyX'); r.key('keyup', 'KeyX'); r.pump();   // this seat's stand (the replica still shows the seat)
    replica('stand');
    cutInFlight('sit');
    stepOne({ kind: 'stand' }, 1); c.publish(r.d); r.pump();
    r.key('keydown', 'KeyE'); r.key('keyup', 'KeyE'); r.pump();   // this seat's sit
    expect(c.commands().at(-1)).toEqual({ kind: 'sit', station: r.d.nav });
    stepOne({ kind: 'sit', station: r.d.nav }, 2); c.publish(r.d); r.pump();
    replica('sit');
    cutInFlight('re-attach');
    c = r.attach();
    replica('re-attach');
    r.dispose();
  });
  it('helm round 2 §3.3: a thruster press on the replica\'s empty charge says NO GAS once a press', () => {
    const r = rig(0), c = r.attach();
    r.d.gas = 0; c.publish(r.d); r.pump();
    r.key('keydown', 'KeyQ'); r.pump(); r.pump(); r.session.frame();
    expect(h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'gas')).toEqual([{ control: 'gas', reason: 'NO GAS' }]);
    r.dispose();
  });
  it('keys held while sitting (E) or walking up (W) do not carry onto the crew Helm until pressed again (final review I1)', () => {
    const r = rig(0), c = r.attach();
    const stepOne = (command: DuelCommand, sequence: number): void => {
      stepDuelTick(r.d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence }, requestedTick: r.d.interior.tick, command }] });
      c.publish(r.d); r.pump();
    };
    stepOne({ kind: 'stand' }, 1);
    r.key('keydown', 'KeyW'); r.key('keydown', 'KeyE'); r.pump();   // E sits (the session sends it); W is held from the walk
    expect(c.commands().filter((x) => x.kind === 'sit')).toHaveLength(1);
    stepOne({ kind: 'sit', station: r.d.nav }, 2);                 // the sit's publication arrives with both still held
    r.pump(); r.pump();
    for (const held of c.helds().slice(-3)) expect([held.rcsX, held.throttleHeld]).toEqual([undefined, undefined]);
    r.key('keyup', 'KeyE'); r.key('keydown', 'KeyE'); r.pump();   // pressed again: starboard
    expect([c.helds().at(-1)!.rcsX, c.helds().at(-1)!.throttleHeld]).toEqual([1, undefined]);
    r.key('keyup', 'KeyW'); r.key('keydown', 'KeyW'); r.pump();
    expect([c.helds().at(-1)!.rcsX, c.helds().at(-1)!.throttleHeld]).toEqual([1, 1]);
    r.dispose();
  });
  it('blur drops the local prediction: the vent and thrMille fall back to the replica state', () => {
    const r = rig(0), c = r.attach();
    c.publish(r.d); r.pump(); r.session.frame();
    r.key('keydown', 'ArrowUp'); r.pump(); r.pump();
    expect(h.source!.helmVent()).not.toEqual({ x: 0, y: 0 });
    r.session.setFocused(false); r.pump();
    expect(h.source!.helmVent()).toEqual({ x: 0, y: 0 });
    expect(h.source!.thrMille()).toBe(c.state()!.thrMille);
    r.dispose();
  });
});

describe('the online Helm heading (Feel-ii §1.1)', () => {
  const headings = (c: Stub) => c.commands().filter((x) => x.kind === 'heading');
  const ask = (r: ReturnType<typeof rig>, heading: number): void => { (h.sceneOpts.at(-1) as unknown as { requests: { heading(n: number): void } }).requests.heading(heading); r.pump(); };
  it('a clear asked for while a heading is in flight is sent, not deduped against the lagging replica', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();   // the Valkyrn class's Helm: helm round 2 §4 takes the heading off the crew Helm
    ask(r, 77); ask(r, -1);
    expect(headings(c)).toEqual([{ kind: 'heading', heading: 77 }, { kind: 'heading', heading: -1 }]);
    ask(r, -1);   // the clear is in flight now: deduped against it
    expect(headings(c)).toHaveLength(2);
    c.results.push({ id: c.ids[c.commands().map((x) => x.kind).lastIndexOf('heading')]!, tick: 3, status: 'applied' }); r.pump();
    ask(r, -1);   // the result hands the base back to the replica (−1)
    expect(headings(c)).toHaveLength(2);
    r.dispose();
  });
  it('A held at the Helm clears the base: the same heading asked for again is sent while the replica still shows the old hold', () => {
    const r = rig(0, undefined, undefined, undefined, ShipClass.Valkyrn), c = r.attach();
    r.d.holdHeading = 77; c.publish(r.d); r.pump();
    ask(r, 77);
    expect(headings(c)).toEqual([]);   // the replica holds it already
    r.key('keydown', 'KeyA'); r.pump(); r.key('keyup', 'KeyA'); r.pump();   // the sim clears the hold; the replica lags
    ask(r, 77);
    expect(headings(c)).toEqual([{ kind: 'heading', heading: 77 }]);
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
    expect(contact.state()).toEqual({ contact: 1, aim: false });
    r.session.setInputBlocked(false); r.session.setFocused(false);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape');
    expect(contact.state()).toEqual({ contact: 1, aim: false });
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

describe('the online seat notice (start-aboard spec §1)', () => {
  it('shows YOU: SCIENCE for NOTICE_MS after the first sync, then nothing', () => {
    const r = rig(0); sitDown(r.d.interior, 0, r.d.science); r.attach(); r.session.frame();
    expect(h.draws.at(-1)!.notice).toBe('YOU: SCIENCE');
    r.advance(2900); r.session.frame();
    expect(h.draws.at(-1)!.notice).toBe('YOU: SCIENCE');
    r.advance(200); r.session.frame();
    expect(h.draws.at(-1)!.notice).toBeNull();
    r.dispose();
  });
});

describe('Science and the frequency online (Sci-1 spec §5, §7.3, §7.4)', () => {
  const contactOf = (): ContactController => (h.sceneOpts.at(-1) as unknown as { contact: ContactController }).contact;
  it('at Science a selection sends designate, S sends contactScan; at Weapons Digit4 sends laserFrequency 1', () => {
    const r = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    standUp(r.d.interior, 1); sitDown(r.d.interior, 1, r.d.science);
    const c = r.attach(), contact = contactOf();
    contact.sync({ shown: true, station: 'science', target: 1, active: () => true, epoch: 0 });
    contact.click(1); r.pump();
    expect(c.commands().filter((x) => x.kind === 'designate')).toEqual([{ kind: 'designate', contact: 1 }]);
    r.key('keydown', 'KeyS'); r.key('keyup', 'KeyS'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'contactScan')).toEqual([{ kind: 'contactScan', contact: 1 }]);
    r.dispose();
    const w = rig(1, undefined, undefined, undefined, ShipClass.ValkyrnLaser), cw = w.attach();   // W-4 spec §14.1: the beam's rule, on the laser fit. the seated start: player 1 at Weapons
    w.key('keydown', 'Digit4'); w.key('keyup', 'Digit4'); w.pump();
    expect(cw.commands().filter((x) => x.kind === 'laserFrequency')).toEqual([{ kind: 'laserFrequency', freq: 1 }]);
    w.dispose();
  });
  it('a quick undo inside one round trip is sent, not deduped against the lagging replica', () => {
    const r = rig(1);
    standUp(r.d.interior, 1); sitDown(r.d.interior, 1, r.d.science);
    const c = r.attach(), contact = contactOf();
    contact.sync({ shown: true, station: 'science', target: 1, active: () => true, epoch: 0 });
    contact.click(0); r.pump(); contact.close(); r.pump();
    expect(c.commands().filter((x) => x.kind === 'designate')).toEqual([{ kind: 'designate', contact: 0 }, { kind: 'designate', contact: -1 }]);
    r.dispose();
    const w = rig(1), cw = w.attach();   // W-4 spec §9: on the Hound 4 / 5 / 6 tune the guns (3 selects)
    w.key('keydown', 'Digit5'); w.key('keyup', 'Digit5'); w.pump();
    w.key('keydown', 'Digit4'); w.key('keyup', 'Digit4'); w.pump();
    expect(cw.commands().filter((x) => x.kind === 'laserFrequency')).toEqual([{ kind: 'laserFrequency', freq: 1 }, { kind: 'laserFrequency', freq: 0 }]);
    w.dispose();
  });
  it('one request is sent once: a repeated identical request in the same frame is not doubled', () => {
    const r = rig(1);
    standUp(r.d.interior, 1); sitDown(r.d.interior, 1, r.d.science);
    const c = r.attach(), contact = contactOf();
    contact.sync({ shown: true, station: 'science', target: 1, active: () => true, epoch: 0 });
    contact.click(1); r.pump(); r.pump();
    expect(c.commands().filter((x) => x.kind === 'designate')).toEqual([{ kind: 'designate', contact: 1 }]);
    r.dispose();
  });
});

