import { boundedHostBytes, isHostCommand, positiveSafeInteger, type HostCommand, type HostErrorCode, type HostResponse, type PortEndpoint } from '../shared/netSession';
import { createPortLink } from './portLink';
import { classifyStreamPacket } from './state/imageCodec';
import { validStreamAttachmentOptions, type StreamAttachmentOptions } from '../shared/hostProcessProtocol';
import type { ModeHost, ModeHostDeps, ModeRegistry, Unsubscribe } from './modes/contracts';
import type { CaptureCause, ModeCheckpoint } from '../shared/sessionCheckpoint';

export function createHostRuntime(registry: ModeRegistry, deps: ModeHostDeps, identity: { modeId: string; schemaVersion: number; simVersion: number; hostGeneration: number }) {
  const definition = registry.get(identity.modeId), generation = identity.hostGeneration;
  if (definition.schemaVersion !== identity.schemaVersion || definition.simVersion !== identity.simVersion
    || !positiveSafeInteger(generation) || !/^[0-9a-f]{64}$/.test(deps.contentDigest)) throw Error('incompatible host identity');
  let host: ModeHost | null = null, disposed = false, lastRequest = 0;
  const peers = new Map<string, Unsubscribe>();
  function clearPeers(): void { for (const off of [...peers.values()]) off(); }
  function retire(owner: ModeHost | null): void { try { owner?.dispose(); } catch { /* disposal must release the rest of the runtime */ } }
  function dispose(): void { if (disposed) return; disposed = true; clearPeers(); const old = host; host = null; retire(old); }
  return {
    async captureCheckpoint(cause: CaptureCause): Promise<ModeCheckpoint> {
      if (disposed || !host) return Promise.reject(Error('capture unavailable'));
      const owner = host;
      return owner.captureCheckpoint(cause).then(candidate => {
        if (disposed || host !== owner) throw Error('capture unavailable');
        return candidate;
      });
    },
    settleSessionFence(): void { if (!disposed && host) host.pause('session-fenced'); },
    completeBootstrap(): void { if (disposed || !host || !deps.sessionGate?.check().allowed) throw Error('bootstrap unavailable'); host.completeBootstrap(); },
    handle(command: HostCommand): HostResponse {
      const raw = command as unknown as Record<string, unknown> | null;
      if (!positiveSafeInteger(raw?.requestId)) return { requestId: null, hostGeneration: generation, ok: false, error: { code: 'invalid-command', message: 'invalid-command' } };
      const requestId = raw.requestId;
      const error = (code: HostErrorCode): HostResponse => ({ requestId, hostGeneration: generation, ok: false, error: { code, message: code } });
      if (!positiveSafeInteger(raw.hostGeneration)) return error('invalid-command');
      if (raw.hostGeneration !== generation) return error('stale-generation');
      // Constant-memory duplicate policy: every stamped attempt consumes its ID;
      // equal/older IDs are rejected, never replayed or cached with large payloads.
      if (requestId <= lastRequest) return error('stale-request');
      lastRequest = requestId;
      if (!isHostCommand(command)) return error('invalid-command');
      if (disposed && command.kind !== 'dispose') return error('unavailable');
      try {
        if (command.kind === 'dispose') dispose();
        else if (command.kind === 'start' || command.kind === 'restore') {
          let installing = true, initial: ModeCheckpoint | undefined;
          let candidate: ModeHost | undefined;
          try {
            candidate = definition.createHost({ ...deps, onCheckpoint: deps.onCheckpoint ? value => {
              if (disposed) return;
              if (installing) { if (initial?.cause !== 'exit') initial = value; }
              else if (host === candidate) deps.onCheckpoint!(value);
            } : undefined });
            if (disposed) { retire(candidate); return error('unavailable'); }
            try {
              if (command.kind === 'start') candidate.start(new Uint8Array(command.initBytes));
              else candidate.restore(new Uint8Array(command.checkpointBytes));
            } catch (cause) { retire(candidate); throw cause; }
            if (disposed) { retire(candidate); return error('unavailable'); }
            clearPeers();
            if (disposed) { retire(candidate); return error('unavailable'); }
            const old = host; host = candidate; retire(old);
            if (disposed) return error('unavailable');
            installing = false;
            if (initial) { const captured = initial; initial = undefined; try { deps.onCheckpoint?.(captured); } catch { /* isolate capture observer */ } }
          } finally { installing = false; initial = undefined; }
        } else {
          if (!host) return error('unavailable');
          if (command.kind === 'pause') host.pause(command.reason);
          else {
            const bytes = host.checkpoint();
            if (!boundedHostBytes(bytes)) return error('checkpoint-too-large');
            return { requestId, hostGeneration: generation, ok: true, checkpointBytes: new Uint8Array(bytes) };
          }
        }
        return { requestId, hostGeneration: generation, ok: true };
      } catch { return error('mode-error'); }
    },
    attachPeer(peer: string, players: readonly number[], port: PortEndpoint, options?: StreamAttachmentOptions): Unsubscribe {
      if (!validStreamAttachmentOptions(options) || disposed || !host || typeof peer !== 'string' || !peer.length || peer.length > 128 || !Array.isArray(players)
        || !players.length || players.length > 16 || players.some(p => !Number.isSafeInteger(p) || p < 0 || p > 65535)
        || new Set(players).size !== players.length || (!peers.has(peer) && peers.size >= 16)) {
        try { port.close(); } catch { /* rejected transferred ownership */ } throw Error('peer unavailable');
      }
      peers.get(peer)?.();
      const link = createPortLink(port, peer, { latestStreamKey: options?.streamed ? bytes => classifyStreamPacket(bytes).stream : definition.latestStreamKey });
      let detach: Unsubscribe | undefined, offClose: Unsubscribe | undefined, closed = false;
      const cleanup = () => {
        if (closed) return; closed = true;
        if (peers.get(peer) === cleanup) peers.delete(peer);
        try { offClose?.(); } catch { /* finish cleanup */ }
        try { detach?.(); } catch { /* finish cleanup */ }
        link.close('peer-detached');
      };
      peers.set(peer, cleanup);
      try {
        offClose = link.onClose(cleanup);
        if (closed) throw Error('peer closed during attachment');
        detach = host.attach(link, [...players], 'receive-time', options);
        if (closed) { detach(); throw Error('peer closed during attachment'); }
      } catch (error) { cleanup(); throw error; }
      return cleanup;
    },
    dispose
  };
}
