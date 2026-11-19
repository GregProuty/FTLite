// TEST ONLY (web build spec §3.5): a Worker at 60 Hz, its ticks relayed over an RTCDataChannel pair, and a lease-style
// round trip every 5 s (Worker → page → WebSocket to local workerd → page → Worker), as the hosting page will run them.
import type { PageMeasurement, WorkerIn, WorkerOut } from './protocol';

declare global {
  interface Window { bgTab: { ready: Promise<void>; start(): void; result(): Promise<PageMeasurement> } }
}
const params = new URLSearchParams(location.search);
const mode: PageMeasurement['mode'] = params.get('mode') === 'visible' ? 'visible' : 'hidden';
const wsUrl = params.get('ws') ?? '';
const errors: string[] = [], events: string[] = [], relayDelays: number[] = [];
const samples = { hidden: 0, visible: 0 };
let started = 0, last = 0, periods = 0, periodSum = 0, measuring = false;
addEventListener('error', event => errors.push(String(event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
document.addEventListener('visibilitychange', () => { if (measuring) events.push(`${Math.round(performance.now() - started)}:${document.visibilityState}`); });
setInterval(() => {
  if (!measuring) return;
  const now = performance.now();
  samples[document.visibilityState === 'hidden' ? 'hidden' : 'visible']++;
  if (last) { periodSum += now - last; periods++; }
  last = now;
}, 100);
async function channelPair(): Promise<{ send: RTCDataChannel; receive: RTCDataChannel }> {
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.addEventListener('icecandidate', event => { if (event.candidate) void b.addIceCandidate(event.candidate); });
  b.addEventListener('icecandidate', event => { if (event.candidate) void a.addIceCandidate(event.candidate); });
  const send = a.createDataChannel('ftl-latest-v1', { ordered: false, maxRetransmits: 0 });
  const received = new Promise<RTCDataChannel>(resolve => b.addEventListener('datachannel', event => resolve(event.channel), { once: true }));
  await a.setLocalDescription(); await b.setRemoteDescription(a.localDescription!);
  await b.setLocalDescription(); await a.setRemoteDescription(b.localDescription!);
  const receive = await received;
  await Promise.all([send, receive].map(channel => channel.readyState === 'open' ? undefined
    : new Promise(resolve => channel.addEventListener('open', resolve, { once: true }))));
  return { send, receive };
}
function socket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(Error('echo socket failed')), { once: true });
  });
}
const worker = new Worker(new URL('./tickWorker.ts', import.meta.url), { type: 'module' });
worker.addEventListener('error', event => errors.push('worker: ' + event.message));
const relay = new MessageChannel();
let resolveResult!: (value: Extract<WorkerOut, { kind: 'result' }>) => void;
const workerResult = new Promise<Extract<WorkerOut, { kind: 'result' }>>(resolve => { resolveResult = resolve; });
const ready = (async () => {
  const [{ send, receive }, ws] = await Promise.all([channelPair(), socket()]);
  receive.addEventListener('message', event => {
    const { dueAt } = JSON.parse(event.data as string) as { dueAt: number };
    if (measuring) relayDelays.push(performance.timeOrigin + performance.now() - dueAt);
  });
  ws.addEventListener('message', event => {
    const { id } = JSON.parse(event.data as string) as { id: number };
    relay.port1.postMessage({ kind: 'lease-reply', id } satisfies WorkerIn);
  });
  relay.port1.addEventListener('message', event => {
    const message = event.data as WorkerOut;
    if (message.kind === 'tick') { if (send.readyState === 'open') send.send(JSON.stringify({ tick: message.tick, dueAt: message.dueAt })); }
    else if (message.kind === 'lease') ws.send(JSON.stringify({ id: message.id }));
    else resolveResult(message);
  });
  relay.port1.start();
})();
window.bgTab = {
  ready,
  start() {
    started = performance.now(); last = 0; measuring = true;
    worker.postMessage({ kind: 'start' } satisfies WorkerIn, [relay.port2]);
  },
  async result() {
    relay.port1.postMessage({ kind: 'stop' } satisfies WorkerIn);
    const w = await workerResult; measuring = false;
    return { mode, durationMs: performance.now() - started, visibilitySamples: { ...samples }, visibilityEvents: [...events],
      tickWindows: w.tickWindows, maxTickLatenessMs: w.maxTickLatenessMs, relayDelaysMs: relayDelays, leaseGapsMs: w.leaseGapsMs,
      leaseRoundTripsMs: w.leaseRoundTripsMs, controlPeriodMs: periods ? periodSum / periods : 0, errors: [...errors] };
  }
};
