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

/** The browser counterpart of emitterPortEndpoint (web build spec §3.2): a DOM MessagePort delivers MessageEvent.data. */
export function webPortEndpoint(port: MessagePort): PortEndpoint {
  return {
    postMessage: data => port.postMessage(data), start: () => port.start(), close: () => port.close(),
    onMessage(callback) { const receive = (event: MessageEvent) => callback(event.data); port.addEventListener('message', receive); return () => port.removeEventListener('message', receive); },
    onClose(callback) {
      port.addEventListener('messageerror', callback); port.addEventListener('close', callback);
      return () => { port.removeEventListener('messageerror', callback); port.removeEventListener('close', callback); };
    }
  };
}
