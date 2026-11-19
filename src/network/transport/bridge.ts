import type { HostIdentity } from '../../shared/hostProcessProtocol';
import { SESSION_PROTOCOL_VERSION } from '../../shared/netSession';
import { webPortEndpoint } from '../platformPort';

/** The game's port adapter (renderer app/onlineSession.ts) and the controller's: one browser endpoint. */
export const browserPortEndpoint = webPortEndpoint;
/** Answer the host Worker's transport port (web build spec §3.2): the page-side half of the Worker owner's readiness. */
export function connectTransportPort(port: MessagePort, identity: HostIdentity): void {
  port.addEventListener('messageerror', () => port.close());
  port.start();
  port.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
}
