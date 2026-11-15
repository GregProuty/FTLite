import { createHostRuntime } from './hostRuntime';
import { boundedHostBytes, positiveSafeInteger, SESSION_PROTOCOL_VERSION, type HostCommand, type HostResponse, type PortEndpoint } from '../shared/netSession';
import { isHostIdentity, matchesIdentity, validPeer, type HostIdentity } from '../shared/hostProcessProtocol';
import type { ModeHostDeps, ModeRegistry, Unsubscribe } from './modes/contracts';

/** Generic utility control plane. The entry, not a caller, supplies registry/digest/clock. */
export function createUtilityHost(registry: ModeRegistry, deps: ModeHostDeps, post: (message: unknown) => void) {
  let runtime: ReturnType<typeof createHostRuntime> | undefined, identity: HostIdentity | undefined;
  let disposed = false, transport: PortEndpoint | undefined, bridgeReady = false, highestRequest = 0;
  const removers: Unsubscribe[] = [];
  function dispose(): void {
    if (disposed) return; disposed = true;
    for (const off of removers.splice(0)) { try { off(); } catch { /* release all */ } }
    try { transport?.close(); } catch { /* release runtime */ }
    runtime?.dispose();
  }
  function fatal(reason: string): void { dispose(); post({ kind: 'fatal', hostGeneration: identity?.hostGeneration, reason }); }
  function crash(record: Parameters<ModeHostDeps['onCrash']>[0]): void {
    // Mode diagnostics remain opaque. Bound their serialized IPC footprint independently of checkpoint bytes.
    let diagnostic: unknown = null;
    try {
      let nodes = 0, characters = 0;
      const depth = new WeakMap<object, number>();
      const text = JSON.stringify(record.diagnostic, function (key, value: unknown) {
        characters += key.length + (typeof value === 'string' ? value.length : 8);
        if (++nodes > 4096 || characters > 65536) throw Error('diagnostic-budget');
        if (value && typeof value === 'object') {
          const level = (depth.get(this as object) ?? -1) + 1;
          if (level > 32 || depth.has(value)) throw Error('diagnostic-budget');
          depth.set(value, level);
        }
        return value;
      });
      if (text && new TextEncoder().encode(text).byteLength <= 65536) diagnostic = JSON.parse(text);
    } catch { /* retain a bounded notification */ }
    const checkpoint = boundedHostBytes(record.checkpoint) ? new Uint8Array(record.checkpoint) : null;
    try { post({ kind: 'crash', hostGeneration: identity?.hostGeneration, record: { checkpoint, diagnostic } }); }
    finally { dispose(); }
  }
  function response(value: HostResponse): void { post({ kind: 'response', response: value }); }
  return {
    dispose,
    receive(raw: unknown, ports: PortEndpoint[]): void {
      const message = raw as Record<string, any> | null;
      const rejectPorts = () => { for (const port of ports) { try { port.close(); } catch { /* malformed transfer */ } } };
      if (disposed || !message || typeof message !== 'object') { rejectPorts(); fatal('invalid-message'); return; }
      if (message.kind === 'initialize') {
        rejectPorts();
        if (identity || ports.length || message.protocolVersion !== SESSION_PROTOCOL_VERSION || !isHostIdentity(message)
          || message.contentDigest !== deps.contentDigest) { fatal('incompatible-identity'); return; }
        try {
          identity = { modeId: message.modeId, schemaVersion: message.schemaVersion, simVersion: message.simVersion,
            contentDigest: deps.contentDigest, hostGeneration: message.hostGeneration };
          runtime = createHostRuntime(registry, { ...deps, onCrash: crash }, identity);
          post({ kind: 'ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
        } catch { fatal('incompatible-identity'); }
        return;
      }
      if (!identity || !runtime) { rejectPorts(); fatal('uninitialized'); return; }
      if (message.kind === 'transport') {
        if (transport || ports.length !== 1 || !matchesIdentity(message, identity)) { rejectPorts(); fatal('invalid-transport'); return; }
        transport = ports[0]!;
        removers.push(transport.onMessage(data => {
          if (bridgeReady || !matchesIdentity(data, identity!) || (data as any).kind !== 'transport-ready') { fatal('invalid-transport'); return; }
          bridgeReady = true; post({ kind: 'transport-ready', hostGeneration: identity!.hostGeneration });
        }), transport.onClose(() => fatal('transport-closed')));
        transport.start(); return;
      }
      if (message.kind === 'command' && ports.length === 0) {
        const command = message.command as HostCommand;
        if (command && positiveSafeInteger(command.requestId) && command.hostGeneration === identity.hostGeneration) {
          if (command.requestId <= highestRequest) {
            response({ requestId: command.requestId, hostGeneration: identity.hostGeneration, ok: false, error: { code: 'stale-request', message: 'stale-request' } }); return;
          }
          highestRequest = command.requestId;
        }
        response(runtime.handle(command)); return;
      }
      if (message.kind === 'attach') {
        const stamped = positiveSafeInteger(message.requestId) && message.hostGeneration === identity.hostGeneration;
        if (!stamped) { rejectPorts(); fatal('invalid-attachment'); return; }
        const validId = message.requestId > highestRequest; highestRequest = Math.max(highestRequest, message.requestId);
        let ok = false;
        if (validId && bridgeReady && ports.length === 1 && validPeer(message.peer, message.players)) {
          try { runtime.attachPeer(message.peer, message.players, ports[0]!); ok = true; } catch { /* runtime closes rejected ownership */ }
        }
        if (!ok) rejectPorts();
        post({ kind: 'attached', requestId: message.requestId, hostGeneration: identity.hostGeneration, ok }); return;
      }
      rejectPorts(); fatal('invalid-message');
    }
  };
}
