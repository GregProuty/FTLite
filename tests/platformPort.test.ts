import { expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { MessageChannel } from 'node:worker_threads';
import { emitterPortEndpoint, webPortEndpoint } from '../src/network/platformPort';

it('reads Electron utility/Main event.data and removes exact listeners', () => {
  const native = Object.assign(new EventEmitter(), { postMessage() {}, start() {}, close() {} });
  const port = emitterPortEndpoint(native, 'electron'), received: unknown[] = [];
  const off = port.onMessage(data => received.push(data));
  native.emit('message', { data: { kind: 'transport-ready' }, ports: [] });
  off(); native.emit('message', { data: { kind: 'stale' } });
  expect(received).toEqual([{ kind: 'transport-ready' }]); expect(native.listenerCount('message')).toBe(0);
});
it('reads raw messages from an actual Node worker MessagePort', async () => {
  const { port1, port2 } = new MessageChannel(), port = emitterPortEndpoint(port1, 'node');
  try {
    const received = new Promise(resolve => { port.onMessage(resolve); port.start(); });
    port2.postMessage({ kind: 'raw' }); expect(await received).toEqual({ kind: 'raw' });
  } finally { port1.close(); port2.close(); }
});
it('reads event.data from an actual MessageChannel and removes exact listeners (web build spec §3.2)', async () => {
  const channel = new globalThis.MessageChannel(), port = webPortEndpoint(channel.port1 as unknown as globalThis.MessagePort), received: unknown[] = [];
  try {
    const first = new Promise(resolve => { const off = port.onMessage(data => { received.push(data); off(); resolve(data); }); port.start(); });
    channel.port2.postMessage({ kind: 'transport-ready' }); expect(await first).toEqual({ kind: 'transport-ready' });
    channel.port2.postMessage({ kind: 'stale' }); await new Promise(done => setTimeout(done, 20));
    expect(received).toEqual([{ kind: 'transport-ready' }]);
  } finally { channel.port1.close(); channel.port2.close(); }
});
