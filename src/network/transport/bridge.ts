import { isHostIdentity, matchesIdentity, TRANSPORT_CHANNEL, type HostIdentity } from '../../shared/hostProcessProtocol';
import { SESSION_PROTOCOL_VERSION, type PortEndpoint } from '../../shared/netSession';
import { isRtcRequest, RTC_REQUEST_CHANNEL, RTC_RESPONSE_CHANNEL } from '../../shared/rtcSession';
import { createTransportController, type HiddenControllerOptions } from './controller';

export function browserPortEndpoint(port: MessagePort): PortEndpoint {
  return {
    postMessage: data => port.postMessage(data), start: () => port.start(), close: () => port.close(),
    onMessage(callback) { const receive = (event: MessageEvent) => callback(event.data); port.addEventListener('message', receive); return () => port.removeEventListener('message', receive); },
    onClose(callback) {
      port.addEventListener('messageerror', callback); port.addEventListener('close', callback);
      return () => { port.removeEventListener('messageerror', callback); port.removeEventListener('close', callback); };
    }
  };
}
export function installTransportBridge(target: Window, identity: HostIdentity, dependencies: Omit<HiddenControllerOptions, 'identity' | 'respond'> = {}) {
  let port: MessagePort | undefined, disposed = false;
  const controller = createTransportController({ ...dependencies, identity,
    respond: message => target.postMessage({ channel: RTC_RESPONSE_CHANNEL, message }, '*') });
  const receive = (event: MessageEvent) => {
    if (disposed || event.source !== target) { for (const rejected of event.ports) rejected.close(); return; }
    if (event.data?.channel === RTC_RESPONSE_CHANNEL && !event.ports.length) return;
    if (event.data?.channel === RTC_REQUEST_CHANNEL && isRtcRequest(event.data.message)) {
      controller.receive(event.data.message, event.ports.map(browserPortEndpoint)); return;
    }
    if (event.data?.kind !== TRANSPORT_CHANNEL || !matchesIdentity(event.data, identity) || event.ports.length !== 1 || port) {
      for (const rejected of event.ports) rejected.close(); return;
    }
    port = event.ports[0]!;
    port.addEventListener('messageerror', () => port?.close());
    port.start();
    port.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
  };
  function dispose() {
    if (disposed) return; disposed = true;
    target.removeEventListener('message', receive); target.removeEventListener('pagehide', dispose);
    controller.dispose(); port?.close(); port = undefined;
  }
  target.addEventListener('message', receive);
  target.addEventListener('pagehide', dispose, { once: true });
  return { dispose };
}
export function startTransportBridge(): void {
  const identity: unknown = JSON.parse(new URLSearchParams(location.search).get('identity') ?? 'null');
  if (!isHostIdentity(identity) || !matchesIdentity(identity, identity)) throw Error('invalid transport identity');
  installTransportBridge(window, identity);
}
