import { ipcRenderer } from 'electron';
import { isHostIdentity, matchesIdentity, TRANSPORT_CHANNEL, TRANSPORT_READY_CHANNEL } from '../shared/hostProcessProtocol';

// This isolated preload has no public invoke API. Its only input is main's fixed channel.
const identity = JSON.parse(new URLSearchParams(location.search).get('identity') ?? 'null') as unknown;
if (!isHostIdentity(identity) || !matchesIdentity(identity, identity)) throw Error('invalid transport identity');
let transferred = false;
ipcRenderer.on(TRANSPORT_CHANNEL, (event, message: unknown) => {
  if (transferred || event.ports.length !== 1 || !matchesIdentity(message, identity)) {
    for (const port of event.ports) port.close(); return;
  }
  transferred = true;
  window.postMessage({ kind: TRANSPORT_CHANNEL, ...identity, protocolVersion: 2 }, '*', event.ports);
});
window.addEventListener('DOMContentLoaded', () => ipcRenderer.send(TRANSPORT_READY_CHANNEL, identity), { once: true });
