import { isHostIdentity, matchesIdentity, TRANSPORT_CHANNEL } from '../../shared/hostProcessProtocol';
import { SESSION_PROTOCOL_VERSION } from '../../shared/netSession';

const identity: unknown = JSON.parse(new URLSearchParams(location.search).get('identity') ?? 'null');
if (!isHostIdentity(identity) || !matchesIdentity(identity, identity)) throw Error('invalid transport identity');
let port: MessagePort | undefined;
window.addEventListener('message', event => {
  if (event.source !== window || event.data?.kind !== TRANSPORT_CHANNEL || !matchesIdentity(event.data, identity)
    || event.ports.length !== 1 || port) { for (const rejected of event.ports) rejected.close(); return; }
  port = event.ports[0]!;
  port.addEventListener('messageerror', () => port?.close());
  port.start();
  port.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
});
window.addEventListener('pagehide', () => { port?.close(); port = undefined; }, { once: true });
