// TEST ONLY (Web-i Task 9): the lease smoke's owner page. Production Worker owners over the built production Worker,
// each wrapped by a generated module that imports lease-smoke-observer first. Main drives it through executeJavaScript.
import { createWorkerHostPlatform, startWorkerHost, type HostProcessHandle } from '../../src/network/host/workerHost';

declare global { interface Window { leaseSmoke: typeof api } }
const wrapper = new URLSearchParams(location.search).get('wrapper')!;
const evidence = new Map<string, unknown>(), ports: MessagePort[] = [];
const hosts: { label: string; handle: HostProcessHandle; current: unknown }[] = [], workers: { label: string; terminated: boolean }[] = [];
const lifecycle = { onSuspend: () => () => {}, onResume: () => () => {} };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
function createWorker(label: string) {
  return () => {
    const worker = new Worker(wrapper, { type: 'module', name: label }), record = { label, terminated: false }; workers.push(record);
    const terminate = worker.terminate.bind(worker); worker.terminate = () => { record.terminated = true; terminate(); };
    // The first message the Worker sees, before the owner's initialize: its evidence port (consumed by the observer).
    const channel = new MessageChannel();
    channel.port1.addEventListener('message', event => { evidence.set(label, event.data); }); channel.port1.start();
    worker.postMessage({ kind: 'lease-smoke-evidence' }, [channel.port2]);
    return worker;
  };
}
async function request(index: number, command: object) {
  const response = await hosts[index]!.handle.request(command as never);
  if (!response.ok) throw Error('host-command-failed');
  return response;
}
const api = {
  async start(label: string, identity: object, sessionLease: object, init: unknown): Promise<number> {
    const handle = await startWorkerHost({ ...identity, sessionLease } as never, createWorkerHostPlatform({ lifecycle, createWorker: createWorker(label) }));
    const record = { label, handle, current: null as unknown }; hosts.push(record);
    handle.onLeaseRequest(r => { record.current = r; });
    if (!record.current) throw Error('missing-first-renewal');
    await request(hosts.length - 1, { kind: 'start', initBytes: encode(init) });
    return hosts.length - 1;
  },
  current: (index: number) => hosts[index]!.current,
  async applyLease(index: number, renewal: any, lifetimeMs: number) {
    await hosts[index]!.handle.applyLease(renewal, { roomId: renewal.roomId, hostGeneration: renewal.hostGeneration, hostSeatId: renewal.hostSeatId,
      nonce: renewal.nonce, expiresAtEpochMs: Date.now() + lifetimeMs });
  },
  completeBootstrap: (index: number) => hosts[index]!.handle.completeBootstrap(),
  async attach(index: number) {
    const channel = new MessageChannel(); ports.push(channel.port1);
    await hosts[index]!.handle.attachPeer('controlled-human', [0], channel.port2); channel.port1.start();
  },
  async checkpoint(index: number) { return decode((await request(index, { kind: 'checkpoint' })).checkpointBytes!); },
  async pause(index: number) { await request(index, { kind: 'pause', reason: 'fresh-grant-observation' }); },
  /** One reliable-ordered command frame from the controlled peer, as main posted it on its port before. */
  sendCommand(envelope: unknown) { ports.at(-1)!.postMessage({ version: 1, type: 'data', id: 10000, kind: 'reliable-ordered', bytes: encode({ kind: 'command', envelope }) }); },
  /** Block this page's own thread (the Worker keeps running), as main's thread was blocked before. */
  stall(ms: number) { const start = performance.now(); while (performance.now() - start < ms) { /* deliberate busy wait */ } return performance.now() - start; },
  evidence: (label: string) => evidence.get(label) ?? null,
  async dispose() {
    for (const host of hosts) await host.handle.dispose();
    for (const port of ports) port.close();
    return { workers: workers.length, terminated: workers.filter(w => w.terminated).length };
  }
};
window.leaseSmoke = api;
