// TEST ONLY (web build spec §8): one pairing of the browser network gate. Host and join through the real menu; a short
// scripted duel whose authority publication matches the guest; guest reconnect with the saved seat; rehost from the
// IndexedDB mirror after the host tab closes (through its leave prompt); then the rehosted guest leaves and every page
// port it opened is closed and its Worker terminated.
import type { GateKey, GatePlayer, GateView } from './players';

export const PAIRINGS = ['chromium-firefox', 'firefox-chromium', 'chromium-electron'] as const;
export type Pairing = (typeof PAIRINGS)[number];
export const INJECTIONS = ['origin-refused'] as const;
export type Injection = (typeof INJECTIONS)[number];
/** The duel gate's test seed (scripts/network/duel-app-smoke.ts). */
export const DUEL_TEST_SEED = 351;
export function parseWebNetArgs(argv: readonly string[]): { pairings: readonly Pairing[]; inject: Injection | null; reportPath: string } {
  const value = (name: string): string | undefined => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const pairing = value('pairing'), inject = value('inject');
  if (pairing !== undefined && !(PAIRINGS as readonly string[]).includes(pairing)) throw Error(`unknown pairing ${pairing}`);
  if (inject !== undefined && !(INJECTIONS as readonly string[]).includes(inject)) throw Error(`unknown injection ${inject}`);
  return { pairings: pairing ? [pairing as Pairing] : PAIRINGS, inject: (inject as Injection | undefined) ?? null, reportPath: value('report-path') ?? 'out/web-ii-net/web-net.json' };
}
/** State packets can arrive out of order and a paused host stops publishing: the newest is the highest sequence. */
export function latestPublication(view: GateView): any {
  return (view.observations.at(-1)?.publications as any[] | undefined)?.reduce((a: any, p: any) => (a && a.sequence >= p.sequence ? a : p), undefined);
}
/** The newest publication the authority's own renderer and the guest both received, identical in run, sequence, tick and hash. */
export function commonPublication(host: GateView, guest: GateView): any {
  const hp: any[] = host.observations.at(-1)?.publications ?? [], gp: any[] = guest.observations.at(-1)?.publications ?? [];
  return gp.findLast(p => hp.some(q => q.runId === p.runId && q.sequence === p.sequence && q.tick === p.tick && q.hash === p.hash));
}
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
/** What a timed-out wait last saw, short: a view's phase, error, actions and newest publication's presence and pause. */
function describe(value: unknown): string {
  const one = (v: any): unknown => v && typeof v === 'object' && 'status' in v && 'observations' in v
    ? (() => { const p = latestPublication(v); return { phase: v.status.phase, role: v.status.role, error: v.status.error, actions: v.status.actions,
      mirror: v.status.mirror && { committed: v.status.mirror.committed && { checkpointSequence: v.status.mirror.committed.checkpointSequence, capturedTick: v.status.mirror.committed.capturedTick }, localPending: v.status.mirror.localPending, persistent: v.status.mirror.persistent, error: v.status.mirror.error },
      publication: p && { sequence: p.sequence, tick: p.tick, phase: p.phase, pauseReason: p.pauseReason, present: p.present, speed: p.speed } }; })() : v;
  try { return JSON.stringify(Array.isArray(value) ? value.map(one) : one(value)).slice(0, 400); } catch { return String(value).slice(0, 400); }
}
const assert = (value: unknown, message: string): void => { if (!value) throw Error(message); };

export async function runPairing(h: GatePlayer, g: GatePlayer, deps: { step(label: string): void; aborted(): boolean }): Promise<Record<string, unknown>> {
  const proof: Record<string, unknown> = {};
  async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, label: string, ms = 15000): Promise<T> {
    const end = performance.now() + ms;
    let last: T | undefined;
    while (performance.now() < end) { if (deps.aborted()) throw Error('launcher timeout'); const v = await read(); last = v; if (ok(v)) return v; await delay(100); }
    throw Error(`${label} timeout (last: ${describe(last)})`);
  }
  const phase = (p: GatePlayer, value: string, ms?: number): Promise<GateView> => until(() => p.read(), v => {
    if (v.status.phase === 'error' && value !== 'error') throw Error(`${p.name} ${value}: online error ${v.status.error}`);
    return v.status.phase === value;
  }, `${p.name} ${value}`, ms);
  const press = async (p: GatePlayer, code: GateKey, hold = 120): Promise<void> => { await p.key(code, true); await delay(hold); await p.key(code, false); };
  const applied = async (p: GatePlayer, seat: number): Promise<number> =>
    Math.max(0, ...((await p.read()).observations.at(-1)?.results ?? []).filter((x: any) => x.status === 'applied' && x.id.player === seat).map((x: any) => x.id.sequence as number));
  async function walkAndSit(p: GatePlayer, seat: number, route: readonly (readonly [GateKey, number])[]): Promise<void> {
    for (const [code, ms] of route) await press(p, code, ms);
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await applied(p, seat); await press(p, 'KeyE');
      try { await until(() => applied(p, seat), n => n > before, `${p.name} sat`, 1500); return; } catch { await press(p, 'KeyA', 120); }
    }
    throw Error(`${p.name} could not reach its console`);
  }

  deps.step('host and join');
  await h.click('multiplayer'); await h.click('host'); await h.click('crew-2'); await h.click('create-room');
  const lobby = await phase(h, 'lobby', 20000);
  assert(lobby.status.snapshot?.compatibility.modeId === 'duel' && lobby.status.snapshot.capacity === 2, `${h.name} made a two-seat duel room`);
  await g.click('multiplayer'); await g.click('join'); await g.type('join-code', lobby.status.snapshot!.joinCode); await g.click('join-room');
  await phase(g, 'lobby');
  await h.click('ready'); await g.click('ready');
  await until(() => h.read(), v => v.status.actions.includes('start'), 'both ready');
  await h.click('start');
  await phase(h, 'running', 20000); await phase(g, 'running', 20000);
  await until(() => g.read(), v => latestPublication(v)?.seed === DUEL_TEST_SEED, `${g.name} sees the round start`);
  proof.hostJoin = { capacity: 2, seed: DUEL_TEST_SEED };

  deps.step('scripted duel');
  // Both start standing in the Hound's mid room: the host walks to Weapons, the guest to the Helm (duel-app-smoke's routes).
  await walkAndSit(h, 0, [['KeyD', 3000], ['KeyW', 1500], ['KeyA', 300]]);
  await walkAndSit(g, 1, [['KeyD', 3000]]);
  const speedBefore = latestPublication(await h.read()).speed as number;
  await g.key('KeyW', true); await delay(2000); await g.key('KeyW', false);
  const fast = await until(async () => [latestPublication(await h.read()), latestPublication(await g.read())], ([a, b]) => a?.speed > speedBefore + 1 && b?.speed > speedBefore + 1, 'the Helm thrust shows on both');
  const agreement = await until(async () => commonPublication(await h.read(), await g.read()), x => !!x, 'the authority publication matches the guest');
  proof.duel = { speedBefore, hostSpeed: fast[0].speed, guestSpeed: fast[1].speed, agreement: { tick: agreement.tick, sequence: agreement.sequence, hash: agreement.hash } };

  deps.step('guest reconnect');
  await g.close({ prompt: false });
  await until(() => h.read(), v => { const p = latestPublication(v); return p?.present[1] === 0 && p?.phase === 'paused' && p?.pauseReason === 'peer-lost'; }, `${h.name} pauses for the lost guest`, 30000);
  await g.reopen();
  // Review R1-F2: a reload in place must get ftlite-online back (reload() throws if the online session is missing).
  if (g.reload) { await g.reload(); proof.reloadKeptOnline = true; }
  await g.click('multiplayer');
  await until(() => g.read(), v => v.status.actions.includes('reconnect'), `${g.name} offers its saved seat`);
  await g.click('reconnect');
  await phase(g, 'paused', 30000);
  await press(h, 'Escape');
  await phase(h, 'running'); await phase(g, 'running');
  await until(() => h.read(), v => latestPublication(v)?.present[1] === 1, 'the guest is present again');
  proof.reconnect = { savedSeat: true, resumedByEscape: true };

  deps.step('rehost');
  // A committed mirror whose local save finished (persistent and nothing pending).
  await until(() => g.read(), v => !!v.status.mirror.committed && !v.status.mirror.localPending && v.status.mirror.persistent, `${g.name} holds a committed, saved mirror`, 60000);
  const closed = await h.close({ prompt: true });
  assert(closed.prompted, `${h.name} closed a running match without the leave prompt`);
  const lost = await until(() => g.read(), v => v.status.phase !== 'running' && v.status.phase !== 'paused', `${g.name} sees the host go`, 30000);
  const last = lost.status.mirror.committed;
  assert(!!last && !lost.status.mirror.localPending, `${g.name} lost its committed mirror`);
  // Review R1-F4: the guest's tab (or app) goes too, so the mirror the rehost uses can only come back from IndexedDB.
  await g.close({ prompt: false });
  await g.reopen();
  // Review R2-F4: Reconnect's mirror refresh also fetches the service's checkpoint, so the status alone cannot show what
  // IndexedDB kept. Read the stored mirror-v1 straight from the database before Reconnect can touch it.
  const stored = g.storedMirror ? await g.storedMirror() : undefined;
  if (stored !== undefined) assert(stored !== null && stored.magic === 'FTLNMIR1' && stored.checkpointSequence === last!.checkpointSequence && stored.capturedTick === last!.capturedTick,
    `${g.name} IndexedDB mirror-v1 does not hold the committed checkpoint: ${JSON.stringify(stored)} vs sequence ${last!.checkpointSequence}, tick ${last!.capturedTick}`);
  await g.click('multiplayer');
  await until(() => g.read(), v => v.status.actions.includes('reconnect'), `${g.name} offers its saved seat after the host went`);
  await g.click('reconnect');
  const restored = await until(() => g.read(), v => v.status.phase === 'saved' && v.status.actions.includes('rehost') && v.status.mirror.committed?.capturedTick === last!.capturedTick,
    `${g.name} may rehost from its IndexedDB mirror (tick ${last!.capturedTick})`, 45000);
  const mirrored = restored;
  await g.click('rehost');
  const rehosted = await until(() => g.read(), v => {
    if (v.status.phase === 'error') throw Error(`${g.name} rehost: online error ${v.status.error}`);
    return v.status.role === 'host' && (v.status.phase === 'paused' || v.status.phase === 'running');
  }, `${g.name} rehosted`, 45000);
  proof.rehost = { mirroredTick: mirrored.status.mirror.committed!.capturedTick, committedSequence: last!.checkpointSequence,
    indexedDbMirror: stored === undefined ? 'not read (Electron page: the driver has no page evaluate)' : stored, phase: rehosted.status.phase, leavePrompt: true };

  deps.step('cleanup');
  await until(() => g.read(), v => v.status.actions.includes('leave'), `${g.name} can leave`);
  await g.click('leave'); await phase(g, 'idle', 20000);
  const counts = await until(() => g.counts(), c => c.portsCreated > 0 && c.ports === 0 && c.workers > 0 && c.workers === c.workerExits, `${g.name} closed its ports and terminated its Worker`, 10000);
  assert(counts.workerErrors === 0, `${g.name} Worker errors: ${counts.workerErrors}`);
  proof.cleanup = counts;
  const errors = [...h.errors, ...g.errors];
  assert(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`);
  return proof;
}
