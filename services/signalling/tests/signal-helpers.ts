import { expect } from 'vitest';
import type { LinkIssued, SeatSession } from '../../../src/shared/roomSession';
import type { RtcSignal } from '../../../src/shared/rtcSession';
import { connect, create, join, request, compatibility, type Peer } from './socket-helpers';
export async function setup() {
  let host = await create(); const guest = await join(host);
  const response = await request(`/v2/rooms/${host.snapshot.joinCode}/join`, { compatibility }, { Authorization: `Bearer ${host.seatToken}` });
  host = await response.json() as SeatSession;
  const hp = await connect(host), gp = await connect(guest);
  return { host, guest, hp, gp };
}
export async function links(hp: Peer, gp: Peer, requestId = 1) {
  hp.send({ type: 'link-request', requestId, guestSeatId: 1 });
  expect(await hp.reply(requestId)).toMatchObject({ outcome: { kind: 'attempt' } });
  const h = hp.messages.filter(m => m.payload.type === 'link-issued').at(-1)!.payload as { type: 'link-issued'; link: LinkIssued };
  const g = gp.messages.filter(m => m.payload.type === 'link-issued').at(-1)!.payload as typeof h;
  return { h: h.link, g: g.link };
}
export function signal(link: LinkIssued): RtcSignal {
  return { attemptId: link.attemptId, roomId: link.identity.roomId, seatGeneration: link.identity.seatGeneration,
    hostGeneration: link.identity.hostGeneration, from: link.identity.localConnectionId, to: link.identity.remoteConnectionId,
    kind: 'description', description: { type: link.role === 'offerer' ? 'offer' : 'answer', sdp: 'opaque-sdp' } };
}
