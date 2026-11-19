import type { HostIdentity } from '../../shared/hostProcessProtocol';
import type { RtcRequest } from '../../shared/rtcSession';
import { webPortEndpoint } from '../platformPort';
import { connectTransportPort } from './bridge';
import { createTransportController, type HiddenControllerOptions } from './controller';
import type { TransportController } from './contracts';
import { createRtcTransport } from './owner';

type Unsubscribe = () => void;
export type PageTransportOptions = Omit<HiddenControllerOptions, 'identity' | 'respond'>;
export interface PageTransport {
  controller: TransportController;
  /** Answer the host Worker's transport port with transport-ready (web build spec §3.2). One port per transport. */
  connect(port: MessagePort): void;
  /** Fires once when the controller's user disposes it (a transport loss for its owner), never on owner disposal. */
  onExit(callback: () => void): Unsubscribe;
  dispose(): void;
}
/** The RTC owner and the RTC controller in one page (web build spec §3): the request/response protocol the hidden
 *  window carried over IPC now crosses a microtask, so both sides keep their validation and their tests. */
export function createPageTransport(identity: HostIdentity, options: PageTransportOptions = {}): PageTransport {
  const responses = new Set<(message: unknown) => void>(), exits = new Set<() => void>();
  let disposed = false, connected: MessagePort | undefined;
  const hidden = createTransportController({ ...options, identity, respond(message) {
    const copy = structuredClone(message);
    queueMicrotask(() => { if (!disposed) for (const callback of [...responses]) { try { callback(copy); } catch { /* the owner isolates */ } } });
  } });
  const controller = createRtcTransport(identity, {
    send(message: RtcRequest, ports: MessagePort[] = []) {
      if (disposed) throw Error('transport-unavailable');
      const copy = structuredClone(message);
      queueMicrotask(() => {
        if (disposed) { for (const port of ports) { try { port.close(); } catch { /* detached */ } } return; }
        hidden.receive(copy, ports.map(webPortEndpoint));
      });
    },
    onResponse(callback) { responses.add(callback); return () => { responses.delete(callback); }; },
    dispose() {
      // Public controller disposal is a transport exit for its owner; owner disposal sets disposed first.
      if (!disposed) for (const callback of [...exits]) { try { callback(); } catch { /* isolate owners */ } }
      dispose();
    }
  });
  function dispose(): void {
    if (disposed) return; disposed = true;
    void controller.dispose(); hidden.dispose(); responses.clear(); exits.clear();
    try { connected?.close(); } catch { /* already detached */ }
  }
  return {
    controller,
    connect(port) {
      if (disposed || connected) { try { port.close(); } catch { /* detached */ } throw Error('transport-unavailable'); }
      connected = port; connectTransportPort(port, identity);
    },
    onExit(callback) { if (disposed) return () => {}; exits.add(callback); return () => { exits.delete(callback); }; },
    dispose
  };
}
