// The route a connected RTC link takes (H-2 spec §8): 'lan' when the selected candidate pair is direct on the local
// network, 'internet' when it crosses a NAT or a relay. Only this label leaves the hidden transport window; candidate
// types and addresses never do.
import { rtcRecord } from '../../shared/rtcSession';

export type RtcRoute = 'lan' | 'internet';

/** A private, link-local, loopback or mDNS address: the far side is on this network. */
export function localAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const a = value.toLowerCase();
  if (a.endsWith('.local')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a);
  if (v4) { const [x, y] = [Number(v4[1]), Number(v4[2])]; return x === 10 || x === 127 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254); }
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}
/** The route of a selected pair from its local and remote candidate stats records; null when it is unknown.
 *  Any relay, or a server-reflexive candidate on either side, is 'internet'; two host candidates are 'lan'. A
 *  peer-reflexive candidate (a LAN check that arrived before the candidate signal) is judged by its address. Chromium
 *  hides a remote one's address. Only on a direct attempt (no STUN or TURN servers configured, so neither side can have
 *  a server-reflexive or relay path) does a local host candidate at a private address decide 'lan'; otherwise the
 *  route is unknown rather than a guessed label. A private local address alone proves nothing behind a NAT. */
export function rtcRoute(local: unknown, remote: unknown, direct = false): RtcRoute | null {
  if (!rtcRecord(local) || !rtcRecord(remote)) return null;
  const types = [local.candidateType, remote.candidateType];
  if (!types.every(t => t === 'host' || t === 'srflx' || t === 'prflx' || t === 'relay')) return null;
  if (types.includes('relay') || types.includes('srflx')) return 'internet';
  const at = (c: Record<string, unknown>): unknown => c.address ?? c.ip;
  const judged = (c: Record<string, unknown>): RtcRoute | null => { const a = at(c); return typeof a === 'string' && a !== '' ? (localAddress(a) ? 'lan' : 'internet') : null; };
  const near = local.candidateType === 'prflx' ? judged(local) : 'lan';
  const far = remote.candidateType === 'prflx' ? judged(remote) ?? (direct && local.candidateType === 'host' && localAddress(at(local)) ? 'lan' : null) : 'lan';
  return near === 'internet' || far === 'internet' ? 'internet' : near === 'lan' && far === 'lan' ? 'lan' : null;
}
