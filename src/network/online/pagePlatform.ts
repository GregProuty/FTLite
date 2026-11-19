import { copyOnlinePortDescriptor, type OnlinePortDescriptor } from '../../shared/onlineSession';
import { validateSessionLeaseIdentity } from '../../shared/sessionLease';
import { startWorkerHost, type HostPlatform } from '../host/workerHost';
import { createPageTransport, type PageTransportOptions } from '../transport/pageTransport';
import type { OnlinePlatform } from './onlineSession';

export interface PagePlatformOptions {
  hostPlatform(): HostPlatform;
  /** Hand one game port to the page's single listener; throws when there is none. */
  deliver(descriptor: OnlinePortDescriptor, port: MessagePort): void;
  transport?: PageTransportOptions;
}
/** The page's OnlinePlatform (web build spec §3.1): the host Worker, page transports and game-port delivery. */
export function createPagePlatform(options: PagePlatformOptions): OnlinePlatform {
  let lastEpoch = 0;
  return {
    async createTransport(identity) {
      const transport = createPageTransport(identity, options.transport), exits = new Set<() => void>();
      let stopped = false, lost = false;
      const offExit = transport.onExit(() => {
        if (stopped) return; stopped = true; lost = true;
        for (const cb of [...exits]) { try { cb(); } catch { /* isolate owners */ } }
        exits.clear();
      });
      return {
        controller: transport.controller,
        onExit(cb) {
          if (stopped) { if (lost) cb(); return () => {}; }
          if (exits.size >= 64) throw Error('transport-lost');
          exits.add(cb); return () => { exits.delete(cb); };
        },
        async dispose() { if (stopped) return; stopped = true; offExit(); exits.clear(); transport.dispose(); }
      };
    },
    async startLeasedHost(identity, signal, sessionLease) {
      if (!validateSessionLeaseIdentity(sessionLease) || sessionLease.hostGeneration !== identity.hostGeneration) throw Error('invalid-lease');
      return startWorkerHost({ ...identity, signal, sessionLease }, options.hostPlatform());
    },
    channel: () => new MessageChannel(),
    publishPort(descriptor, port) {
      try {
        const copy = copyOnlinePortDescriptor(descriptor);
        if (copy.epoch <= lastEpoch) throw Error('invalid-port');
        options.deliver(copy, port); lastEpoch = copy.epoch;
      } catch {
        try { port.close(); } catch { /* detached */ }
        throw Error('invalid-port');
      }
    },
    // The page itself is the visible owner; its unload is handled by createPageOnline (pagehide, prepare-exit).
    onVisibleGone: () => () => {}
  };
}
