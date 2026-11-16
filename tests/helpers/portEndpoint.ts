import type { PortEndpoint } from '../../src/shared/netSession';
export function portEndpoint() {
  const messages = new Set<(data: unknown) => void>(), closes = new Set<() => void>();
  const sent: unknown[] = [];
  let closed = false;
  const port: PortEndpoint = {
    postMessage(data) { if (closed) throw Error('closed'); sent.push(data); },
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    start() {}, close() { if (closed) return; closed = true; for (const cb of [...closes]) cb(); }
  };
  return { port, sent, get closed() { return closed; }, get listeners() { return messages.size + closes.size; },
    receive(data: unknown) { for (const cb of [...messages]) cb(data); } };
}
