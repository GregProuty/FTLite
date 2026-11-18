import { createPortLink } from '../../src/network/portLink';
import { createClientRun, type ClientRun } from '../../src/renderer/src/clientControl/clientRun';
import { translateTick, pauseActions } from '../../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../../src/renderer/src/clientControl/inputFrame';
import { Position } from '../../src/renderer/src/sim/components';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import starter from '../../src/renderer/src/sim/ship/starter.json';
import type { Link } from '../../src/renderer/src/net/contracts';

declare global { interface Window { hostSmokeReport(value: unknown): void; hostSmoke: typeof api } }
let client: ClientRun | undefined, link: Link | undefined, ready = false, lastCallback = 0, largestGap = 0;
let producer: ReturnType<typeof setInterval> | undefined;
const report = (value: unknown) => window.hostSmokeReport(value);
window.addEventListener('error', event => report({ kind: 'page-error', message: event.message }));
window.addEventListener('unhandledrejection', event => report({ kind: 'page-error', message: String(event.reason?.stack ?? event.reason) }));
function view() { const state = client?.state(); if (!state) throw Error('producer has no validated full state'); return state; }
function send(moveX = 0, confirmPresses = 0) {
  const state = view();
  const actions = translateTick(state, client!.ui, [{ ...NEUTRAL_FRAME, moveX, confirmPresses }], state.tick, [0], client!.commandBudget);
  client!.send(actions); return actions;
}
function stopProducer() { clearInterval(producer); producer = undefined; }
const api = {
  status() {
    return { ready, tick: client?.state()?.tick, phase: client?.publication()?.phase, largestGap,
      command: client?.ui.players[0]?.nextSequence, held: client?.ui.players[0]?.heldSequence,
      commandStatus: client?.commandStatus(0), x: client?.state() ? Position.x[view().crew[0]!] : null,
      results: client?.takeResults() ?? [] };
  },
  resume() { const state = view(); const actions = pauseActions(client!.ui, 0, state.tick, false, client!.commandBudget); client!.send(actions); return actions.commands[0]; },
  primeHeld() { stopProducer(); return send(1).held[0]; },
  stall() {
    stopProducer();
    // Translate at the last observed authority tick, then deliver the original
    // envelopes after a real visible-renderer busy loop. Never rewrite sender ticks.
    const state = view(), actions = translateTick(state, client!.ui,
      [{ ...NEUTRAL_FRAME, moveX: -1, confirmPresses: 1 }], state.tick, [0], client!.commandBudget);
    if (actions.commands.length !== 1 || actions.commands[0]!.command.kind !== 'vote') throw Error('fixture failed to translate a real semantic vote');
    const start = performance.now();
    report({ kind: 'stall-start', tick: state.tick, command: actions.commands[0], held: actions.held[0] });
    while (performance.now() - start < 500) { /* deliberately stall only this visible renderer */ }
    client!.send(actions);
    report({ kind: 'stall-end', milliseconds: performance.now() - start, observedTick: view().tick });
    return { requestedTick: actions.commands[0]!.requestedTick, sequence: actions.commands[0]!.id.sequence };
  },
  neutralProducer() {
    stopProducer(); send(); lastCallback = performance.now();
    producer = setInterval(() => {
      const now = performance.now(); largestGap = Math.max(largestGap, now - lastCallback); lastCallback = now; send();
    }, 1000 / 60);
  },
  detach() { stopProducer(); ready = false; client?.dispose(); client = undefined; link?.close('smoke-detach'); link = undefined; },
  injectPageFailure() { setTimeout(() => { throw Error('injected host smoke page exception'); }); }
};
window.hostSmoke = api;
window.addEventListener('message', event => {
  if (event.source !== window || event.data?.kind !== 'host-smoke-port' || event.ports.length !== 1) return;
  api.detach();
  const port = event.ports[0]!;
  link = createPortLink({ postMessage: value => port.postMessage(value), start: () => port.start(), close: () => port.close(),
    onMessage(cb) { const listener = (e: MessageEvent) => cb(e.data); port.addEventListener('message', listener); return () => port.removeEventListener('message', listener); },
    onClose(cb) { const listener = () => cb(); port.addEventListener('messageerror', listener); return () => port.removeEventListener('messageerror', listener); }
  }, 'host-human');
  client = createClientRun(link, [0], { runId: 'host-smoke', contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
    resolveLayout: () => parseShip(starter), admissionPolicy: 'receive-time' });
  link.onMessage(() => {
    if (client?.state()) ready = true;
    const now = performance.now(); if (lastCallback) largestGap = Math.max(largestGap, now - lastCallback); lastCallback = now;
  });
});

import { createWorkerHostPlatform, startWorkerHost, type HostProcessHandle, type WorkerLike } from '../../src/network/host/workerHost';
import { base64ToBytes, bytesToBase64 } from '../../src/shared/bytes';

// The owner role (Web-i): production Worker owners over the built production Worker, driven by main through
// executeJavaScript. Bytes cross the executeJavaScript boundary as base64.
type StartMode = 'normal' | 'abort-before' | 'abort-after-spawn' | 'crash-on-spawn';
interface HostEntry { handle?: HostProcessHandle; exit?: string; starting: Promise<void>; abort: AbortController; worker?: Worker;
  terminated: boolean; errored: boolean; lastOkResponse?: unknown; intercept?: (message: any) => boolean }
const params = new URLSearchParams(location.search);
if (params.get('role') === 'owner') {
  const workerUrl = params.get('worker')!;
  const suspends = new Set<() => void>(), resumes = new Set<() => void>();
  const lifecycle = { onSuspend(cb: () => void) { suspends.add(cb); return () => { suspends.delete(cb); }; }, onResume(cb: () => void) { resumes.add(cb); return () => { resumes.delete(cb); }; } };
  const hosts = new Map<number, HostEntry>();
  let nextHost = 0;
  const entry = (id: number) => { const value = hosts.get(id); if (!value) throw Error('host-unknown'); return value; };
  const handle = (id: number) => { const value = entry(id).handle; if (!value) throw Error('host-unavailable'); return value; };
  // Each host's Worker is observed from construction; the helpers abort or crash it inside the spawn task itself.
  function observedWorker(value: HostEntry, mode: StartMode): () => WorkerLike {
    return () => {
      const worker = new Worker(workerUrl, { type: 'module' }); value.worker = worker;
      const terminate = worker.terminate.bind(worker); worker.terminate = () => { value.terminated = true; terminate(); };
      worker.addEventListener('error', () => { value.errored = true; });
      // Registered before the spawn adapter's own listener, so an armed interception is consumed first.
      worker.addEventListener('message', event => {
        const message = event.data;
        if (value.intercept?.(message)) { event.stopImmediatePropagation(); return; }
        if (message?.kind === 'response' && message.response?.ok && value.lastOkResponse === undefined) value.lastOkResponse = structuredClone(message);
      });
      if (mode === 'abort-after-spawn') value.abort.abort();
      // A microtask: after startWorkerHost's synchronous body has subscribed, before any Worker reply can arrive.
      if (mode === 'crash-on-spawn') queueMicrotask(() => worker.dispatchEvent(new ErrorEvent('error', { message: 'injected worker crash', cancelable: true })));
      return worker;
    };
  }
  const encodeCommand = (command: any) => command.kind === 'start' ? { ...command, initBytes: base64ToBytes(command.initBytes) }
    : command.kind === 'restore' ? { ...command, checkpointBytes: base64ToBytes(command.checkpointBytes) } : command;
  const decodeResponse = (response: any) => response.ok && response.checkpointBytes ? { ...response, checkpointBytes: bytesToBase64(response.checkpointBytes) } : response;
  const owner = {
    start(options: object, mode: StartMode = 'normal'): number {
      const id = ++nextHost, value: HostEntry = { abort: new AbortController(), terminated: false, errored: false, starting: Promise.resolve() };
      hosts.set(id, value);
      if (mode === 'abort-before') value.abort.abort();
      value.starting = startWorkerHost({ ...options, signal: value.abort.signal } as never, createWorkerHostPlatform({ lifecycle, createWorker: observedWorker(value, mode) }))
        .then(h => { value.handle = h; h.onExit(reason => { value.exit = reason; }); }, error => { value.exit = String(error?.message ?? error); });
      return id;
    },
    async settled(id: number) { await entry(id).starting; const value = entry(id); return { ready: !!value.handle, exit: value.exit ?? null }; },
    exit: (id: number) => entry(id).exit ?? null,
    async request(id: number, command: object) { return decodeResponse(await handle(id).request(encodeCommand(command))); },
    async attachLocal(id: number, peer: string, players: number[], options?: object) {
      const { port1, port2 } = new MessageChannel();
      // null crosses executeJavaScript for "no options"; the production owner accepts only undefined there.
      await handle(id).attachPeer(peer, players, port1, (options ?? undefined) as never);
      // The preload forwards this port to main, which hands it to the producer page (its existing host-smoke-port path).
      window.postMessage({ kind: 'host-smoke-port-out' }, '*', [port2]);
    },
    async dispose(id: number) { await handle(id).dispose(); },
    suspend() { for (const cb of [...suspends]) cb(); },
    resume() { for (const cb of [...resumes]) cb(); },
    /** A Worker crash: an error event on that host's Worker object, which the spawn adapter treats as an exit. */
    crashWorker(id: number) { entry(id).worker!.dispatchEvent(new ErrorEvent('error', { message: 'injected worker crash', cancelable: true })); },
    /** The page transport lost: its controller disposed by its user. */
    async killTransport(id: number) { await handle(id).transport.dispose(); },
    /** One real ok response captured from host `from`'s Worker (the stale-generation replay). */
    lastOkResponse: (from: number) => entry(from).lastOkResponse ?? null,
    /** Replay a message into host `to`'s owner exactly as if its Worker had posted it. */
    inject(to: number, message: unknown) { entry(to).worker!.dispatchEvent(new MessageEvent('message', { data: message })); },
    /** Arm, on host `id`, a one-shot interception of the Worker reply with this request id; resolves with that reply. */
    intercept(id: number, requestId: number) {
      const value = entry(id);
      return new Promise(resolve => { value.intercept = message => {
        if (message?.kind !== 'response' || message.response?.requestId !== requestId) return false;
        value.intercept = undefined; resolve(message.response); return true;
      }; });
    },
    /** Post a raw command straight to host `id`'s Worker, bypassing its owner. */
    rawCommand(id: number, command: object) { entry(id).worker!.postMessage({ kind: 'command', command }); },
    counts() {
      const byHost: Record<number, { created: boolean; terminated: boolean; errored: boolean }> = {};
      for (const [id, value] of hosts) byHost[id] = { created: !!value.worker, terminated: value.terminated, errored: value.errored };
      const created = [...hosts.values()].filter(v => v.worker);
      return { workers: created.length, terminated: created.filter(v => v.terminated).length, byHost };
    }
  };
  (window as any).hostSmoke = { owner };
}
