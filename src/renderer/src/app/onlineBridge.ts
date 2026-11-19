import { copyOnlinePortDescriptor, copyOnlineStatus, validateOnlinePortDescriptor, validateOnlineStatusEnvelope,
  type OnlinePortDescriptor, type OnlinePreloadApi, type OnlineStatus, type Unsubscribe } from '../../../shared/onlineSession';

export type OnlinePortListener = (descriptor: OnlinePortDescriptor, port: MessagePort) => void;
/** The page's online facade (app/online/pageSession.ts): the former preload API plus direct game-port delivery. */
export interface PageOnlineApi extends OnlinePreloadApi { onPort(callback: OnlinePortListener): Unsubscribe }
/** The UI's view of the page session: validated status, one game-port owner, and the named online actions only. */
export function createOnlineBridge(api: PageOnlineApi) {
  let disposed = false, epoch = 0, portListener: OnlinePortListener | undefined;
  const removers = new Set<Unsubscribe>();
  const offPort = api.onPort((descriptor, port) => {
    const close = () => { try { port.close(); } catch { /* detached */ } };
    if (disposed || !validateOnlinePortDescriptor(descriptor) || descriptor.epoch <= epoch) { close(); return; }
    epoch = descriptor.epoch;
    if (!portListener) { close(); return; }
    try { portListener(copyOnlinePortDescriptor(descriptor), port); } catch { close(); }
  });
  const { host, join, ready, removeSeat, viewState, reconnect, rehost, start, retry, leave, forgetSeat, readStatus, linkStats } = api;
  return {
    host, join, ready, removeSeat, viewState, reconnect, rehost, start, retry, leave, forgetSeat, readStatus, linkStats,
    onPort(callback: OnlinePortListener): Unsubscribe {
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
      if (disposed) return; disposed = true; offPort(); portListener = undefined;
      for (const off of [...removers]) off(); removers.clear();
    }
  };
}
