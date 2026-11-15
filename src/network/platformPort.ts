import type { PortEndpoint } from '../shared/netSession';

interface EmitterPort {
  postMessage(data: unknown): void; start(): void; close(): void;
  on(event: string, callback: (...args: any[]) => void): unknown;
  off(event: string, callback: (...args: any[]) => void): unknown;
}
/** Node worker MessagePort delivers raw data; Electron MessagePortMain delivers event.data. */
export function emitterPortEndpoint(port: EmitterPort, style: 'node' | 'electron'): PortEndpoint {
  return {
    postMessage: data => port.postMessage(data), start: () => port.start(), close: () => port.close(),
    onMessage(cb) { const listener = (event: any) => cb(style === 'node' ? event : event.data); port.on('message', listener); return () => { port.off('message', listener); }; },
    onClose(cb) {
      const failed = () => { port.close(); cb(); };
      port.on('close', cb); port.on('messageerror', failed);
      return () => { port.off('close', cb); port.off('messageerror', failed); };
    }
  };
}
