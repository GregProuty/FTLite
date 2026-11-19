import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAuthorityWorker } from '../src/worker/authorityWorkerMain';
import { duelMode } from '../src/network/modes/duel';
import { SESSION_PROTOCOL_VERSION } from '../src/shared/netSession';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const off of cleanups.splice(0)) off(); });
const identity = { modeId: 'duel', schemaVersion: duelMode.schemaVersion, simVersion: duelMode.simVersion, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, hostGeneration: 1 };
function worker() {
  const posted: any[] = []; let listener: ((event: MessageEvent) => void) | undefined;
  const owner = startAuthorityWorker({ postMessage: message => posted.push(message), addEventListener: (_type, l) => { listener = l; } }, __GAMEPLAY_CONTENT_DIGEST__);
  cleanups.push(() => owner.dispose());
  return { posted, send: (data: unknown, ports: unknown[] = []) => listener!({ data, ports } as unknown as MessageEvent) };
}
describe('the host Worker entry (web build spec §3.2)', () => {
  it('initializes from the authority modes and answers the transport handshake over a real MessageChannel', async () => {
    const w = worker(); w.send({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
    expect(w.posted.at(-1)).toMatchObject({ kind: 'ready', modeId: 'duel', hostGeneration: 1 });
    const channel = new MessageChannel(); cleanups.push(() => channel.port2.close());
    w.send({ kind: 'transport', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity }, [channel.port1]);
    channel.port2.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
    await vi.waitFor(() => expect(w.posted.at(-1)).toEqual({ kind: 'transport-ready', hostGeneration: 1 }));
  });
  it('refuses a build with another content digest', () => {
    const w = worker(); w.send({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity, contentDigest: 'f'.repeat(64) });
    expect(w.posted.at(-1)).toMatchObject({ kind: 'fatal', reason: 'incompatible-identity' });
  });
  it('asks for its first lease renewal with a random 32-hex nonce', () => {
    const w = worker(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 1, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    w.send({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity, sessionLease });
    const request = w.posted.find(m => m.kind === 'lease-request');
    expect(request.request).toMatchObject(sessionLease); expect(request.request.nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});
