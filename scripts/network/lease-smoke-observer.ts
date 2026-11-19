// TEST ONLY (Web-i Task 9): imported by the generated Worker wrapper BEFORE the production Worker chunk. The real built
// authority owns the gate and the simulation; observation and continuous ingress stay inside the Worker while the page is blocked.
const label = (self as unknown as { name: string }).name;
const scope = self as unknown as { addEventListener(type: 'message', l: (e: MessageEvent) => void): void; postMessage(m: unknown, t?: Transferable[]): void };
const evidence = { firstRequestMs: null as number | null, lastGameplayMs: null as number | null, tick: 0, highWater: [0, 0], attemptsAfterDeadline: 0,
  rejectedAfterDeadline: 0, publications: 0, phase: 'paused', lagTicks: 0, lastTickDeadlineMs: 0 };
let report: MessagePort | undefined;
const save = () => report?.postMessage(structuredClone(evidence));
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const send = scope.postMessage.bind(scope);
(self as unknown as { postMessage(m: any, t?: Transferable[]): void }).postMessage = (message, transfer) => {
  if (message?.kind === 'lease-request' && evidence.firstRequestMs === null) { evidence.firstRequestMs = performance.now(); save(); }
  return send(message, transfer ?? []);
};
// The delayed probe withholds later renewal opportunities so its FIRST request is still the matching one after more than
// 12 s. Clocks and gate arithmetic remain the unmodified production code.
if (label === 'delayed') {
  const schedule = setTimeout;
  (self as unknown as { setTimeout: (cb: () => void, ms?: number) => unknown }).setTimeout = (cb, ms) => schedule(cb, ms === 5000 ? 50000 : ms);
}
let runId: string | undefined, incoming = 0;
scope.addEventListener('message', event => {
  const data = event.data;
  if (data?.kind === 'lease-smoke-evidence') { event.stopImmediatePropagation(); report = event.ports[0]; save(); return; }
  if (data?.kind === 'initialize') runId = data.sessionLease?.runId;
  if (data?.kind !== 'attach' || label !== 'running') return;
  const port = event.ports[0]!, post = port.postMessage.bind(port);
  port.postMessage = ((frame: any) => {
    if (frame?.type === 'data') {
      const message = decode(frame.bytes), now = performance.now();
      if (message.kind === 'state') {
        const state = message.state; evidence.publications++;
        if (state.tick > evidence.tick || state.commandHighWater.some((n: number, i: number) => n > evidence.highWater[i]!)) evidence.lastGameplayMs = now;
        evidence.tick = state.tick; evidence.highWater = state.commandHighWater; evidence.phase = state.phase;
        evidence.lagTicks = state.lagTicks; evidence.lastTickDeadlineMs = state.tickTimeMs; save();
      } else if (message.kind === 'result' && evidence.firstRequestMs !== null && now >= evidence.firstRequestMs + 12000 && message.result.reason === 'unavailable') {
        evidence.rejectedAfterDeadline++; save();
      }
      // Release real PortLink backpressure independently of the page's event loop.
      queueMicrotask(() => port.dispatchEvent(new MessageEvent('message', { data: { version: 1, type: 'ack', id: frame.id } })));
    }
    return post(frame);
  }) as typeof port.postMessage;
  const timer = setInterval(() => {
    const now = performance.now();
    if (evidence.firstRequestMs === null) return;
    if (now >= evidence.firstRequestMs + 16000) { clearInterval(timer); save(); return; }
    if (now >= evidence.firstRequestMs + 12000) evidence.attemptsAfterDeadline++;
    port.dispatchEvent(new MessageEvent('message', { data: { version: 1, type: 'data', id: ++incoming, kind: 'reliable-ordered', bytes: encode({ kind: 'command', envelope: {
      runId, id: { player: 0, sequence: evidence.highWater[0]! + 1 }, requestedTick: evidence.tick,
      command: incoming % 2 ? { kind: 'stand' } : { kind: 'setPaused', paused: false } } }) } }));
  }, 100);
});
export {};
