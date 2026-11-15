import { describe, expect, it, vi } from 'vitest';
import { createOnlineRendererSession } from '../src/renderer/src/app/onlineSession';
import { createPortLink } from '../src/network/portLink';
import { createSectorStreamBinding } from '../src/network/modes/sectorStream';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { makeState, LAYOUT, quiet } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { portEndpoint } from './helpers/portEndpoint';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import type { OnlinePortDescriptor, OnlineStatus } from '../src/shared/onlineSession';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { createCrewLayer } from '../src/renderer/src/render/crewSprites';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { Position, Stable } from '../src/renderer/src/sim/components';
import { assertSimStateLive } from '../src/renderer/src/sim/state';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { cardRows } from '../src/renderer/src/clientControl/cardController';
import { doorsCursorTile } from '../src/renderer/src/render/hazardTiles';
import { TILE_PX } from '../src/shared/resolution';
const status: OnlineStatus = { phase: 'syncing', role: 'guest', ownSeat: 2, snapshot: null, attachmentEpoch: 1, error: null, retryAtMs: null, persistent: true, actions: ['leave'] };
function rig(prepare?: (state: ReturnType<typeof makeState>) => void) {
  const state = makeState(3); quiet(state); prepare?.(state); let now = 0, cb = () => {};
  const clock = { nowMs: () => now }, h = portEndpoint(), p = portEndpoint();
  const listeners = new Map<string, Set<(e: any) => void>>();
  const port = { postMessage: p.port.postMessage, close: p.port.close, start() {}, addEventListener(type: string, fn: (e: any) => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); }, removeEventListener(type: string, fn: (e: any) => void) { listeners.get(type)?.delete(fn); } } as unknown as MessagePort;
  const options = { runId: 'online-test', contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT };
  const authority = createFixtureAuthority({ ...options, clock, init: { runId: options.runId, contentDigest: options.contentDigest, seed: 1, playerCount: 3, characters: [], unlocked: [], layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION }, scheduler: { schedule: () => () => {} }, onCrash(error) { throw error; } }, state);
  const binding = createSectorStreamBinding(createPortLink(h.port, 'visible'), { ...options, clock, latestPayloadLimit: 4096 });
  const viewState = vi.fn(async (_epoch: number, _phase: string) => ({ ok: true as const })), draw = vi.fn(), resetInput = vi.fn(), update = vi.fn();
  let moveX = 0, sourceKey = 'kb:0', present = true;
  const saveProgress = vi.fn();
  const session = createOnlineRendererSession({ ...options, ...{ saveProgress }, now: clock.nowMs, scheduler: { schedule(_delay, next) { cb = next; return () => { cb = () => {}; }; } }, sampleDevices: () => [...(present ? [{ key: sourceKey, moveX, moveY: 0, interact: false, confirm: false, cancel: false, any: moveX !== 0 }] : []), { key: 'kb:1', moveX: -1, moveY: 1, interact: true, confirm: true, cancel: true, any: true }], resetInput, renderer: { reset() {}, recordPrev() {}, draw }, hud: { update }, api: { viewState } });
  const descriptor: OnlinePortDescriptor = { epoch: 1, runId: options.runId, hostGeneration: 1, seatId: 2, compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: SIM_VERSION, contentDigest: options.contentDigest, layoutHash: state.derived.layoutHash } };
  session.setStatus(status); session.attach(descriptor, port);
  authority.attach(binding.link, [2], { ...binding.attachOptions, admissionPolicy: 'receive-time' });
  const deliver = () => { for (const data of h.sent.splice(0)) for (const fn of [...listeners.get('message') ?? []]) fn({ data }); for (const data of p.sent.splice(0)) h.receive(data); authority.pump(); };
  const pump = () => { cb(); deliver(); };
  ownTestCleanup(() => { session.dispose(); binding.dispose(); });
  return { state, session, authority, draw, update, viewState, resetInput, descriptor, port, deliver, pump, saveProgress, sent: p.sent, device(key: string, available = true) { sourceKey = key; present = available; }, setMove(v: number) { moveX = v; }, tick() { now += 17; authority.pump(); deliver(); }, disconnect() { for (const fn of [...listeners.get('close') ?? []]) fn({}); } };
}
describe('online renderer uses the real streaming client', () => {
  it('retains a nondefault Doors selection in draws after main detaches the replica', () => {
    const h = rig(state => sitDown(state, 2, state.derived.stationOfKind[StationKind.Doors]!)); h.deliver(); h.pump(); h.session.frame();
    const ui = h.draw.mock.calls.at(-1)![3], station = h.state.derived.stationOfKind[StationKind.Doors]!;
    const selection = { rowKey: cardRows(h.state, station)[3]!.key, page: 'main' as const };
    ui.stations[station] = selection;
    const expectedTile = h.state.derived.edgeTile[h.state.derived.doorEdges[3]!]!;
    expect(doorsCursorTile(h.draw.mock.calls.at(-1)![0], ui)).toBe(expectedTile);
    h.session.setStatus({ ...status, phase: 'reconnecting' }); h.session.frame();
    expect(h.draw.mock.calls.at(-1)![3]?.stations[station]).toEqual(selection);
    expect(doorsCursorTile(h.draw.mock.calls.at(-1)![0], h.draw.mock.calls.at(-1)![3])).toBe(expectedTile);
    expect(h.draw.mock.calls.at(-1)![3]).not.toBe(ui);
  });
  it('shows vacant and disconnected crew as bots with health and without local input prompts', () => {
    const h = rig(); h.deliver(); h.pump();
    h.session.setStatus({ ...status, phase: 'running', snapshot: { seats: [
      { seatId: 0, occupied: false, connected: false }, { seatId: 1, occupied: true, connected: false },
      { seatId: 2, occupied: true, connected: true }
    ] } as any }); h.session.frame();
    expect(h.update.mock.calls.at(-1)![0].players.map((p: any) => p.status)).toEqual(['bot', 'bot', 'active']);
    for (const p of h.update.mock.calls.at(-1)![0].players.slice(0, 2)) {
      expect(p.health).toBeGreaterThan(0); expect(p.interactPrompt).toBe(''); expect(p.confirmPrompt).toBe(''); expect(p.cancelPrompt).toBe('');
    }
  });
  it('neutralizes a removed controller exactly once and stops production until a physical producer returns', () => {
    const h = rig(); h.device('gp:0'); h.setMove(1); h.deliver(); h.pump(); h.pump();
    expect(h.authority.checkpoint([]).held[2]!.moveX).toBe(1);
    h.device('gp:0', false); h.pump(); const high = h.authority.checkpoint([]).heldHighWater;
    h.pump(); h.pump(); expect(h.authority.checkpoint([]).heldHighWater).toEqual(high); expect(h.authority.checkpoint([]).held[2]!.moveX).toBe(0);
    h.device('gp:1'); h.pump(); h.pump(); expect(h.authority.checkpoint([]).held[2]!.moveX).toBe(1);
  });
  it('waits for validated state ACK, maps physical zero only to seat two, and blur neutralizes once without pause', () => {
    const h = rig(); h.setMove(1); h.pump(); expect(h.viewState).not.toHaveBeenCalled();
    h.deliver(); h.pump(); expect(h.viewState.mock.calls.map(c => c[1])).toContain('synced');
    h.pump(); expect(h.authority.checkpoint([]).held.map(f => f.moveX)).toEqual([0, 0, 1]);
    h.session.setFocused(false); h.deliver(); const water = h.authority.checkpoint([]).heldHighWater;
    h.session.setFocused(false); h.pump(); expect(h.authority.checkpoint([])).toMatchObject({ heldHighWater: water, phase: 'running' });
    expect(h.authority.checkpoint([]).held[2]!.moveX).toBe(0);
  });
  it('draws detached presentation without changing confirmed data and freezes after replica disposal', () => {
    const h = rig(); h.deliver(); h.pump(); h.session.frame();
    expect(h.draw).toHaveBeenCalled(); const args = h.draw.mock.calls.at(-1)!;
    const before = saveSnapshot(args[0]); expect(args[4].map((p: any) => p.id)).toEqual(['crew:0', 'crew:1', 'crew:2']);
    h.session.frame(); expect(saveSnapshot(h.draw.mock.calls.at(-1)![0])).toEqual(before);
    h.disconnect(); expect(() => assertSimStateLive(args[0])).toThrow('disposed'); h.session.frame(); const frozen = h.draw.mock.calls.at(-1)!;
    expect(saveSnapshot(frozen[0])).toEqual(before); expect(frozen[4]).toEqual(args[4]);
    h.tick(); h.session.frame(); expect(h.draw.mock.calls.at(-1)![4]).toEqual(frozen[4]);
    h.session.dispose(); expect(() => assertSimStateLive(frozen[0])).toThrow('disposed');
  });
  it('uses delayed draw coordinates in the actual crew layer without modifying Position or snapshots', () => {
    const h = rig(); h.deliver(); h.pump(); h.setMove(1); h.pump(); h.pump();
    for (let i = 0; i < 12; i++) h.tick(); h.session.frame();
    const [view, , , , points] = h.draw.mock.calls.at(-1)!;
    const point = points.find((p: any) => p.id === 'crew:2'); expect(point.x).toBeLessThan(Position.x[view.crew[2]]!);
    const snapshot = saveSnapshot(view), memory = createRenderMemory();
    const layer = createCrewLayer({ missing: ['crew.idle.s'] } as GameAssets, memory);
    layer.draw(view, 1, points);
    expect(memory.lastDrawn.get(Stable.id[view.crew[2]]!)).toEqual({ x: point.x, y: point.y });
    expect(layer.container.children.some(child => child.position.x === point.x * TILE_PX && child.position.y === point.y * TILE_PX)).toBe(true);
    expect(saveSnapshot(view)).toEqual(snapshot); layer.container.destroy({ children: true });
  });
  it('uses owned pause commands, reserves bounded outbox capacity and never writes couch progression', () => {
    const h = rig(); h.deliver(); h.pump(); h.session.frame();
    for (let i = 0; i < 300; i++) h.session.pause();
    expect(h.draw.mock.calls.at(-1)![3].players.map((p: any) => p.nextSequence)).toEqual([1, 1, 257]);
    h.deliver(); expect(h.authority.checkpoint([]).phase).toBe('paused');
    h.session.setFocused(false); h.session.setFocused(true); h.pump(); expect(h.authority.checkpoint([]).phase).toBe('paused');
    expect(h.saveProgress).not.toHaveBeenCalled();
  });
  it('neutralizes menu blocking once and rejects stale attachment epochs without replacing a live client', () => {
    const h = rig(); h.deliver(); h.pump(); h.setMove(1); h.pump(); h.pump();
    h.session.setInputBlocked(true); h.deliver(); const high = h.authority.checkpoint([]).heldHighWater;
    h.session.setInputBlocked(true); h.pump(); expect(h.authority.checkpoint([]).heldHighWater).toEqual(high);
    expect(h.authority.checkpoint([]).held[2]!.moveX).toBe(0);
    const close = vi.fn(); h.session.attach(h.descriptor, { close } as unknown as MessagePort); expect(close).toHaveBeenCalledOnce();
    h.session.setInputBlocked(false); h.pump(); h.pump(); expect(h.authority.checkpoint([]).held[2]!.moveX).toBe(1);
  });
  it('replaces the client, UI and frozen ownership; new attachment cannot send abandoned pending commands', () => {
    const h = rig(); h.deliver(); h.pump(); h.session.frame(); const old = h.draw.mock.calls.at(-1)!;
    h.session.pause(); h.disconnect(); h.session.frame(); const frozen = h.draw.mock.calls.at(-1)![0];
    const postMessage = vi.fn(), close = vi.fn();
    h.session.attach({ ...h.descriptor, epoch: 2 }, { postMessage, close, start() {}, addEventListener() {}, removeEventListener() {} } as unknown as MessagePort);
    expect(() => assertSimStateLive(frozen)).toThrow('disposed'); expect(() => assertSimStateLive(old[0])).toThrow('disposed');
    h.pump(); h.session.frame(); expect(postMessage).not.toHaveBeenCalled();
    expect(h.resetInput.mock.calls.length).toBeGreaterThanOrEqual(3);
    h.session.dispose(); expect(close).toHaveBeenCalledOnce();
  });
});
