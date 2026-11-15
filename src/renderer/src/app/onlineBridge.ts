import { copyOnlinePortDescriptor, copyOnlineStatus, ONLINE_PORT_SOURCE, validateOnlinePortEnvelope, validateOnlineStatusEnvelope,
  type OnlinePortDescriptor, type OnlinePreloadApi, type OnlineStatus, type Unsubscribe } from '../../../shared/onlineSession';

/** Page messages can offer local data only; every privileged operation stays on the named preload API. */
export function createOnlineBridge(window: Window, api: OnlinePreloadApi) {
  let disposed = false, epoch = 0, portListener: ((descriptor: OnlinePortDescriptor, port: MessagePort) => void) | undefined;
  const removers = new Set<Unsubscribe>();
  const receive = (event: MessageEvent) => {
    if (event.data?.source !== ONLINE_PORT_SOURCE) return;
    const close = () => { for (const port of event.ports) { try { port.close(); } catch {} } };
    const { source: _source, ...envelope } = event.data;
    if (disposed || event.source !== window || event.ports.length !== 1 || !validateOnlinePortEnvelope(envelope)
      || envelope.descriptor.epoch <= epoch) { close(); return; }
    epoch = envelope.descriptor.epoch;
    if (!portListener) { close(); return; }
    try { portListener(copyOnlinePortDescriptor(envelope.descriptor), event.ports[0]!); } catch { close(); }
  };
  window.addEventListener('message', receive);
  return {
    ...api,
    onPort(callback: (descriptor: OnlinePortDescriptor, port: MessagePort) => void): Unsubscribe {
      if (disposed) return () => {};
      if (portListener) throw Error('invalid-port');
      portListener = callback;
      return () => { if (portListener === callback) portListener = undefined; };
    },
    onStatus(callback: (status: OnlineStatus) => void): Unsubscribe {
      if (disposed) return () => {};
      let removed = false, revision = 0;
      const accept = (value: unknown) => {
        if (removed || disposed || !validateOnlineStatusEnvelope(value) || value.revision <= revision) return;
        revision = value.revision;
        try { callback(copyOnlineStatus(value.status)); } catch { /* isolate UI observers */ }
      };
      const off = api.onStatus(accept);
      // Subscribe first: a newer push wins over an initial read that resolves later.
      void api.readStatus().then(accept, () => {});
      const remove = () => { if (!removed) { removed = true; off(); removers.delete(remove); } };
      removers.add(remove); return remove;
    },
    dispose(): void {
      if (disposed) return; disposed = true; window.removeEventListener('message', receive); portListener = undefined;
      for (const off of [...removers]) off(); removers.clear();
    }
  };
}
