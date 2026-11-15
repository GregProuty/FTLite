/** Trusted session data. Ticket issuance and cross-attempt consumption belong to the session provider. */
export interface RtcIdentity {
  protocolVersion: 2; modeId: string; schemaVersion: number; simVersion: number;
  contentDigest: string; layoutHash: string; runId: string; roomId: string;
  hostGeneration: number; seatGeneration: number; localConnectionId: string; remoteConnectionId: string;
}
export type RtcSignal =
  | { attemptId: string; roomId: string; seatGeneration: number; from: string; to: string; hostGeneration: number;
      kind: 'description'; description: { type: 'offer' | 'answer'; sdp: string } }
  | { attemptId: string; roomId: string; seatGeneration: number; from: string; to: string; hostGeneration: number;
      kind: 'candidate'; candidate: RTCIceCandidateInit | null };
export const RTC_RELIABLE_LABEL = 'ftl-reliable-v1';
export const RTC_LATEST_LABEL = 'ftl-latest-v1';
export const RTC_SETUP_MS = 30000;
export const RTC_SDP_BYTES = 65536;
export const RTC_CANDIDATE_BYTES = 4096;
export const RTC_PRE_DESCRIPTION_CANDIDATES = 64;
export const RTC_TOTAL_CANDIDATES = 128;
export const RTC_AUTH_PREFIX = 'FTL-RTC-AUTH/1:';
export const RTC_AUTH_BYTES = 4096;
export const RTC_TICKET_BYTES = 512;

export const rtcRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const rtcKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
export const rtcId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export function rtcBoundedText(v: unknown, bytes: number): v is string {
  return typeof v === 'string' && v.length <= bytes && new TextEncoder().encode(v).byteLength <= bytes;
}
export function isRtcIdentity(v: unknown): v is RtcIdentity {
  return rtcRecord(v) && rtcKeys(v, ['protocolVersion','modeId','schemaVersion','simVersion','contentDigest','layoutHash','runId','roomId','hostGeneration','seatGeneration','localConnectionId','remoteConnectionId'])
    && v.protocolVersion === 2 && rtcId(v.modeId) && positive(v.schemaVersion) && positive(v.simVersion)
    && typeof v.contentDigest === 'string' && /^[0-9a-f]{64}$/.test(v.contentDigest)
    && typeof v.layoutHash === 'string' && /^[0-9a-f]{8}$/.test(v.layoutHash)
    && rtcId(v.runId) && rtcId(v.roomId) && positive(v.hostGeneration) && positive(v.seatGeneration)
    && rtcId(v.localConnectionId) && rtcId(v.remoteConnectionId) && v.localConnectionId !== v.remoteConnectionId;
}
export function isRtcCandidate(v: unknown): v is RTCIceCandidateInit | null {
  if (v === null) return true;
  if (!rtcRecord(v) || !Object.keys(v).every(key => ['candidate','sdpMid','sdpMLineIndex','usernameFragment'].includes(key))) return false;
  return rtcBoundedText(v.candidate, RTC_CANDIDATE_BYTES)
    && (v.sdpMid === undefined || v.sdpMid === null || rtcBoundedText(v.sdpMid,128))
    && (v.sdpMLineIndex === undefined || v.sdpMLineIndex === null || (Number.isSafeInteger(v.sdpMLineIndex) && (v.sdpMLineIndex as number)>=0 && (v.sdpMLineIndex as number)<=65535))
    && (v.usernameFragment === undefined || v.usernameFragment === null || rtcBoundedText(v.usernameFragment,256));
}
export function isRtcSignal(v: unknown): v is RtcSignal {
  if (!rtcRecord(v) || !rtcId(v.attemptId) || !rtcId(v.roomId) || !positive(v.seatGeneration) || !positive(v.hostGeneration) || !rtcId(v.from) || !rtcId(v.to)) return false;
  const stamp = ['attemptId','roomId','seatGeneration','from','to','hostGeneration','kind'];
  if (v.kind === 'candidate') return rtcKeys(v,[...stamp,'candidate']) && isRtcCandidate(v.candidate);
  return v.kind === 'description' && rtcKeys(v,[...stamp,'description']) && rtcRecord(v.description)
    && rtcKeys(v.description,['type','sdp']) && (v.description.type === 'offer' || v.description.type === 'answer')
    && rtcBoundedText(v.description.sdp, RTC_SDP_BYTES) && v.description.sdp.length > 0;
}
/** Copy validated trusted configuration, so later provider mutations cannot alter native setup. */
export function copyRtcIceServers(value: readonly RTCIceServer[]): RTCIceServer[] | undefined {
  if (!Array.isArray(value) || value.length > 8) return;
  const result: RTCIceServer[] = []; let count = 0;
  for (const entry of value) {
    if (!rtcRecord(entry) || !Object.keys(entry).every(key => ['urls','username','credential','credentialType'].includes(key))) return;
    const urls = typeof entry.urls === 'string' ? [entry.urls] : entry.urls;
    if (!Array.isArray(urls) || !urls.length || (count += urls.length)>16 || !urls.every(url => rtcBoundedText(url,2048) && /^(stun|stuns|turn|turns):[^\s]+$/i.test(url))) return;
    if ((entry.username !== undefined && !rtcBoundedText(entry.username,512)) || (entry.credential !== undefined && !rtcBoundedText(entry.credential,512)) || (entry.credentialType !== undefined && entry.credentialType !== 'password')) return;
    result.push({ urls: [...urls], ...(entry.username === undefined ? {} : {username:entry.username as string}), ...(entry.credential === undefined ? {} : {credential:entry.credential as string}) });
  }
  return result;
}
