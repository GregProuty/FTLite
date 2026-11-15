import { env } from 'cloudflare:workers';
import { afterEach, expect } from 'vitest';
import worker from '../src/index';
import { create, request, compatibility } from './helpers';
import { parseServerEnvelope, type SeatSession, type ServerEnvelope, type SocketTicket } from '../../../src/shared/roomSession';
export { create, request, compatibility };
const open: WebSocket[] = [];
afterEach(() => { for (const socket of open.splice(0)) try { socket.close(1000); } catch {} });
export class Peer {
  readonly messages: ServerEnvelope[] = [];
  readonly closes: number[] = [];
  constructor(readonly socket: WebSocket) {
    socket.accept(); open.push(socket);
    socket.addEventListener('message', e => {
      const value = parseServerEnvelope(e.data);
      if (!value) throw Error('invalid server envelope');
      this.messages.push(value);
    });
    socket.addEventListener('close', e => { this.closes.push(e.code); });
  }
  send(value: unknown) { this.socket.send(JSON.stringify(value)); }
  async until(predicate: () => boolean) { await expect.poll(predicate, { timeout: 2000, interval: 5 }).toBe(true); }
  async reply(id: number) {
    await this.until(() => this.messages.some(m => m.payload.type === 'reply' && m.payload.requestId === id));
    return this.messages.find(m => m.payload.type === 'reply' && m.payload.requestId === id)!.payload;
  }
  ack() { const last = this.messages.at(-1); if (last) this.send({ type: 'ack', sequence: last.sequence }); }
}
export function stub(session: SeatSession) { return env.ROOMS.get(env.ROOMS.idFromName(session.snapshot.roomId)); }
export async function ticket(session: SeatSession): Promise<SocketTicket> {
  const response = await request(`/v2/rooms/${session.snapshot.roomId}/socket-ticket`, {}, { Authorization: `Bearer ${session.seatToken}` });
  expect(response.status).toBe(200); return response.json();
}
export async function upgrade(session: SeatSession) {
  return worker.fetch(new Request(`https://service/v2/rooms/${session.snapshot.roomId}/socket`, { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': '192.0.2.1' } }), { ...env, IP_HASH_SALT: 'synthetic-runtime-test-salt' });
}
export async function connect(session: SeatSession) {
  const t = await ticket(session), response = await upgrade(session);
  expect(response.status).toBe(101);
  const peer = new Peer(response.webSocket!);
  peer.send({ type: 'auth', ticket: t.ticket, connectionId: t.connectionId });
  await peer.until(() => peer.messages.some(m => m.payload.type === 'authenticated'));
  return peer;
}
export async function join(host: SeatSession): Promise<SeatSession> {
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility });
  expect(response.status).toBe(200); return response.json();
}
