// The host's simulation in a dedicated Web Worker (web build spec §3.2): the generic control plane the Electron utility
// ran, over browser MessagePorts. The page terminates the Worker; nothing here exits a process of its own.
import { createUtilityHost } from '../network/utilityHost';
import { webPortEndpoint } from '../network/platformPort';
import { randomHex } from '../network/random';
import { authorityModes } from './authorityModes';

export interface AuthorityWorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}
export function startAuthorityWorker(scope: AuthorityWorkerScope, contentDigest: string) {
  const owner = createUtilityHost(authorityModes, {
    contentDigest, clock: { nowMs: () => performance.now() },
    leaseClock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, nonce: () => randomHex(16),
    scheduler: { schedule(delayMs, callback) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } },
    onCrash() { /* the generic controller owns bounded crash forwarding and disposal */ }
  }, message => scope.postMessage(message));
  scope.addEventListener('message', event => owner.receive(event.data, Array.from(event.ports, port => webPortEndpoint(port))));
  return owner;
}
