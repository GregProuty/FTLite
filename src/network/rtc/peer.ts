import type { Link, LinkStats } from '../../renderer/src/net/contracts';
import { createRtcDataLink } from './dataLink';
import { rtcRoute, type RtcRoute } from './route';
import type { MonotonicClock, PayloadClassifier, RtcDataChannel, Scheduler } from './contracts';
import { RTC_MAX_PACKET_BYTES } from './contracts';
import { copyRtcIceServers, isRtcCandidate, isRtcIdentity, isRtcSignal, rtcBoundedText, rtcId, rtcKeys, rtcRecord,
  RTC_AUTH_BYTES, RTC_AUTH_PREFIX, RTC_LATEST_LABEL, RTC_PRE_DESCRIPTION_CANDIDATES, RTC_RELIABLE_LABEL,
  RTC_SDP_BYTES, RTC_SETUP_MS, RTC_TICKET_BYTES, RTC_TOTAL_CANDIDATES, type RtcIdentity, type RtcSignal } from '../../shared/rtcSession';

export interface RtcPeerChannel extends RtcDataChannel {
  readonly label: string; readonly ordered: boolean; readonly maxRetransmits: number | null;
  readonly maxPacketLifeTime: number | null; readonly protocol: string; readonly negotiated: boolean;
  send(data: ArrayBuffer | string): void;
}
/** Narrow native-compatible seam. The normal renderer factory creates RTCPeerConnection directly. */
export interface RtcPeerConnection {
  readonly connectionState: string; readonly iceConnectionState: string;
  readonly localDescription: RTCSessionDescriptionInit | null; readonly sctp: { readonly maxMessageSize: number } | null;
  createDataChannel(label: string, options: RTCDataChannelInit): RtcPeerChannel;
  createOffer(): Promise<RTCSessionDescriptionInit>; createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(value: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(value: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(value: RTCIceCandidateInit | null): Promise<void>;
  getStats(): Promise<RTCStatsReport>; close(): void;
  addEventListener(type: string, callback: EventListener): void; removeEventListener(type: string, callback: EventListener): void;
}
export interface RtcPeerOptions {
  attemptId: string; role: 'offerer' | 'answerer'; identity: RtcIdentity;
  localTicket: string; expectedRemoteTicket: string;
  /** Deadline in this injected clock's monotonic domain; never serialize a process-local deadline. */
  ticketExpiresAtMs: number;
  iceServers: readonly RTCIceServer[]; iceTransportPolicy?: 'all' | 'relay'; emitSignal(signal: RtcSignal): void;
  classify: PayloadClassifier; clock: MonotonicClock; scheduler: Scheduler;
  createConnection?: (configuration: RTCConfiguration) => RtcPeerConnection;
}
export interface RtcPeer {
  readonly ready: Promise<Link>; receiveSignal(signal: unknown): Promise<void>; close(reason: string): void; diagnostics(): LinkStats;
  /** The selected pair's route and RTT from the last stats sample (H-2 spec §8), each null before one or when unknown
   *  (a missing currentRoundTripTime is null, not 0); never a candidate or address. */
  linkFigures?(): { route: RtcRoute | null; rttMs: number | null };
}

/** The adapter allows exactly one already-authenticated race packet to enter task1's initial consumer slot. */
function handoffChannel(channel: RtcPeerChannel) {
  const messages = new Set<EventListener>();
  return {
    get readyState() { return channel.readyState; }, get bufferedAmount() { return channel.bufferedAmount; },
    get bufferedAmountLowThreshold() { return channel.bufferedAmountLowThreshold; }, set bufferedAmountLowThreshold(v: number) { channel.bufferedAmountLowThreshold = v; },
    get binaryType() { return channel.binaryType; }, set binaryType(v: BinaryType) { channel.binaryType = v; },
    send: (data: ArrayBuffer) => channel.send(data), close: () => channel.close(),
    addEventListener(type: string, listener: EventListener) { if(type === 'message')messages.add(listener); channel.addEventListener(type,listener); },
    removeEventListener(type: string, listener: EventListener) { messages.delete(listener); channel.removeEventListener(type,listener); },
    replay(data: ArrayBuffer) { for(const listener of messages)listener(new MessageEvent('message',{data})); }
  };
}

export function createRtcPeer({attemptId,role,identity: suppliedIdentity,localTicket: suppliedLocalTicket,expectedRemoteTicket: suppliedRemoteTicket,ticketExpiresAtMs,iceServers,iceTransportPolicy='all',emitSignal,classify,clock,scheduler,createConnection = config => new RTCPeerConnection(config)}: RtcPeerOptions): RtcPeer {
  let localTicket: string | undefined = suppliedLocalTicket, expectedRemoteTicket: string | undefined = suppliedRemoteTicket;
  // Do not retain additional secret bindings in callbacks.
  suppliedLocalTicket = ''; suppliedRemoteTicket = '';
  const identity = { ...suppliedIdentity };
  let pc: RtcPeerConnection | undefined, reliable: RtcPeerChannel | undefined, latest: RtcPeerChannel | undefined;
  let link: Link | undefined, closed = false, settled = false, helloSent = false, helloReceived = false, ackSent = false, ackReceived = false;
  let remoteDescription = false, descriptionAdmitted = false, candidateCount = 0, localCandidateCount = 0;
  const candidates: (RTCIceCandidateInit | null)[] = [], nativeListeners: (() => void)[] = [], authListeners: (() => void)[] = [];
  let pending: {channel: RtcPeerChannel; data: ArrayBuffer} | undefined;
  let cancelSetup: (() => void) | undefined, cancelStats: (() => void) | undefined;
  let chain = Promise.resolve(), sampled = { rttMs: 0, lossPct: 0, relayed: false }, route: RtcRoute | null = null, rtt: number | null = null;
  let resolveReady!: (link: Link) => void, rejectReady!: (reason: Error) => void;
  const ready = new Promise<Link>((resolve,reject) => { resolveReady=resolve;rejectReady=reject; });
  // Closing an attempt before a caller subscribes must not cause an unhandled rejection.
  void ready.catch(() => {});
  const remove = (list: (() => void)[]) => { for(const dispose of list.splice(0))dispose(); };
  function fail(reason: string) {
    if(closed)return; closed=true; localTicket=undefined;expectedRemoteTicket=undefined;pending=undefined;candidates.length=0;
    cancelSetup?.();cancelSetup=undefined;cancelStats?.();cancelStats=undefined;remove(authListeners);remove(nativeListeners);
    if(!settled){settled=true;rejectReady(new Error(reason));}
    link?.close('rtc-closed');
    try{reliable?.close();}catch{} try{latest?.close();}catch{} try{pc?.close();}catch{}
  }
  const alive = () => !closed;
  function listen(target: Pick<RtcPeerConnection,'addEventListener'|'removeEventListener'>,type: string, listener: EventListener, list = nativeListeners) {
    if(closed)return;target.addEventListener(type,listener);
    const dispose=()=>target.removeEventListener(type,listener);if(closed)dispose();else list.push(dispose);
  }
  function validTime() { const now=clock.nowMs();return Number.isFinite(now) && now < ticketExpiresAtMs; }
  function stamp() { return {attemptId,roomId:identity.roomId,seatGeneration:identity.seatGeneration,from:identity.localConnectionId,to:identity.remoteConnectionId,hostGeneration:identity.hostGeneration}; }
  function emit(signal: RtcSignal) { if(closed)return;try{emitSignal(signal);}catch{fail('rtc-signalling-failed');} }
  function enqueue(work: () => Promise<void>): Promise<void> {
    chain=chain.then(async()=>{if(!alive())return;try{await work();}catch{fail('rtc-negotiation-failed');}});
    return chain;
  }
  function sendAuth(value: unknown) {
    try {
      const message=RTC_AUTH_PREFIX+JSON.stringify(value);
      if(!rtcBoundedText(message,RTC_AUTH_BYTES)){fail('rtc-auth-failed');return;}
      reliable!.send(message);
    }catch{fail('rtc-auth-failed');}
  }
  function completeAuth() {
    if(closed || link || !reliable || !latest || reliable.readyState!=='open' || latest.readyState!=='open')return;
    if(!validTime()){fail('rtc-auth-failed');return;}
    if(!helloSent){helloSent=true;const ticket=localTicket;localTicket=undefined;sendAuth({kind:'hello',attemptId,identity,ticket});if(closed)return;}
    if(helloReceived && !ackSent){ackSent=true;sendAuth({kind:'ack',attemptId});if(closed)return;}
    if(!helloReceived || !ackSent || !ackReceived)return;
    localTicket=undefined;expectedRemoteTicket=undefined;remove(authListeners);
    try {
      const r=handoffChannel(reliable),l=handoffChannel(latest);
      link=createRtcDataLink({reliable:r,latest:l},{peer:identity.remoteConnectionId,maxMessageSize:pc!.sctp?.maxMessageSize ?? 0,classify,clock,scheduler});
      link.onClose(()=>fail('rtc-channel-closed'));
      if(closed)return;
      if(pending){const packet=pending;pending=undefined;(packet.channel===reliable?r:l).replay(packet.data);if(closed)return;}
      cancelSetup?.();cancelSetup=undefined;settled=true;
      const wrapped: Link = {peer:link.peer,caps:link.caps,send:link.send,onMessage:link.onMessage,onClose:link.onClose,stats:diagnostics,close:()=>fail('rtc-closed')};
      resolveReady(wrapped);scheduleStats();
    }catch{fail('rtc-channel-setup-failed');}
  }
  function authMessage(channel: RtcPeerChannel, event: Event) {
    if(closed)return;const data=(event as MessageEvent<unknown>).data;
    // Ticket validation precedes retaining any data packet. One bounded packet can race the final ack on the other channel.
    if(data instanceof ArrayBuffer && helloReceived && ackSent && data.byteLength>0 && data.byteLength<=RTC_MAX_PACKET_BYTES && !pending){pending={channel,data:data.slice(0)};return;}
    if(channel!==reliable || !rtcBoundedText(data,RTC_AUTH_BYTES) || !data.startsWith(RTC_AUTH_PREFIX) || !validTime()){fail('rtc-auth-failed');return;}
    let value: unknown;try{value=JSON.parse(data.slice(RTC_AUTH_PREFIX.length));}catch{fail('rtc-auth-failed');return;}
    if(!rtcRecord(value) || value.attemptId!==attemptId){fail('rtc-auth-failed');return;}
    if(value.kind==='hello' && !helloReceived && rtcKeys(value,['kind','attemptId','identity','ticket']) && isRtcIdentity(value.identity) && value.ticket===expectedRemoteTicket) {
      const remote={...identity,localConnectionId:identity.remoteConnectionId,remoteConnectionId:identity.localConnectionId};
      const received=value.identity;
      if(!(Object.keys(remote) as (keyof RtcIdentity)[]).every(key=>received[key]===remote[key])){fail('rtc-auth-failed');return;}
      helloReceived=true;expectedRemoteTicket=undefined;completeAuth();return;
    }
    if(value.kind==='ack' && rtcKeys(value,['kind','attemptId']) && helloSent && helloReceived && ackSent && !ackReceived){ackReceived=true;completeAuth();return;}
    fail('rtc-auth-failed');
  }
  function admit(channel: RtcPeerChannel) {
    if(closed){try{channel.close();}catch{}return;}
    const isReliable=channel.label===RTC_RELIABLE_LABEL,isLatest=channel.label===RTC_LATEST_LABEL;
    if((!isReliable && !isLatest) || (isReliable?!!reliable:!!latest) || channel.ordered!==isReliable || channel.maxRetransmits!==(isReliable?null:0) || channel.maxPacketLifeTime!==null || channel.protocol!=='' || channel.negotiated!==false || !['connecting','open'].includes(channel.readyState)) {
      try{channel.close();}catch{} fail('rtc-channel-invalid');return;
    }
    if(isReliable)reliable=channel;else latest=channel;channel.binaryType='arraybuffer';
    listen(channel,'close',()=>fail('rtc-channel-closed'));
    listen(channel,'error',()=>fail('rtc-channel-error'));
    listen(channel,'open',()=>completeAuth(),authListeners);
    listen(channel,'message',e=>authMessage(channel,e),authListeners);completeAuth();
  }
  async function installDescription(description: RTCSessionDescriptionInit) {
    await pc!.setRemoteDescription(description);if(!alive())return;remoteDescription=true;
    for(const candidate of candidates.splice(0)){await pc!.addIceCandidate(candidate);if(!alive())return;}
    if(role==='answerer') {
      const answer=await pc!.createAnswer();if(!alive())return;
      await publishDescription(answer);
    }
  }
  async function publishDescription(description: RTCSessionDescriptionInit) {
    const expected=role==='offerer'?'offer':'answer';
    if(description.type!==expected || !rtcBoundedText(description.sdp,RTC_SDP_BYTES) || !description.sdp.length){fail('rtc-negotiation-failed');return;}
    await pc!.setLocalDescription(description);if(!alive())return;
    const local=pc!.localDescription;
    if(!local || local.type!==expected || !rtcBoundedText(local.sdp,RTC_SDP_BYTES) || !local.sdp.length){fail('rtc-negotiation-failed');return;}
    emit({...stamp(),kind:'description',description:{type:expected,sdp:local.sdp}});
  }
  function receiveSignal(value: unknown): Promise<void> {
    if(closed)return Promise.resolve();
    if(rtcRecord(value) && rtcId(value.attemptId) && value.attemptId!==attemptId)return Promise.resolve();
    if(!isRtcSignal(value) || value.attemptId!==attemptId || value.roomId!==identity.roomId || value.seatGeneration!==identity.seatGeneration || value.hostGeneration!==identity.hostGeneration || value.from!==identity.remoteConnectionId || value.to!==identity.localConnectionId){fail('rtc-signal-invalid');return Promise.resolve();}
    if(value.kind==='description') {
      if(descriptionAdmitted || value.description.type!==(role==='offerer'?'answer':'offer')){fail('rtc-signal-invalid');return Promise.resolve();}
      descriptionAdmitted=true;const description={...value.description};return enqueue(()=>installDescription(description));
    }
    if(++candidateCount>RTC_TOTAL_CANDIDATES){fail('rtc-signal-invalid');return Promise.resolve();}
    const candidate=value.candidate===null?null:{...value.candidate};
    // Admission is synchronous: an attacker cannot grow the async chain while native description awaits.
    if(!remoteDescription) { if(candidates.length>=RTC_PRE_DESCRIPTION_CANDIDATES){fail('rtc-signal-invalid');return Promise.resolve();}candidates.push(candidate);return Promise.resolve(); }
    return enqueue(async()=>{await pc!.addIceCandidate(candidate);if(!alive())return;});
  }
  function diagnostics(): LinkStats { return {...sampled,bufferedBytes:link?.stats().bufferedBytes ?? 0}; }
  function scheduleStats() { if(!closed)cancelStats=scheduler.schedule(1000,()=>{cancelStats=undefined;void sampleStats();}); }
  async function sampleStats() {
    try {
      const report=await pc!.getStats();if(!alive())return;
      // DOM's minimal RTCStatsReport typing only promises forEach. Retain no raw report in public state.
      const find=(id: unknown): unknown=>{let found: unknown;report.forEach((record: unknown)=>{if(rtcRecord(record) && record.id===id)found=record;});return found;};
      let pair: Record<string,unknown> | undefined;
      report.forEach((record: unknown)=>{if(rtcRecord(record) && record.type==='transport' && typeof record.selectedCandidatePairId==='string'){const selected=find(record.selectedCandidatePairId);if(rtcRecord(selected) && selected.type==='candidate-pair')pair=selected;}});
      if(!pair)report.forEach((record: unknown)=>{if(rtcRecord(record) && record.type==='candidate-pair' && record.nominated===true && record.state==='succeeded')pair=record;});
      if(pair) {
        const finite=(v: unknown,max: number)=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=max?v:0;
        const received=finite(pair.packetsReceived,Number.MAX_SAFE_INTEGER),lost=finite(pair.packetsLost,Number.MAX_SAFE_INTEGER);
        const local=find(pair.localCandidateId),remote=find(pair.remoteCandidateId);
        sampled={rttMs:finite(pair.currentRoundTripTime,60)*1000,lossPct:received+lost>0?100*lost/(received+lost):0,relayed:(rtcRecord(local)&&local.candidateType==='relay') || (rtcRecord(remote)&&remote.candidateType==='relay')};
        const seconds=pair.currentRoundTripTime;
        route=rtcRoute(local,remote,iceServers.length===0); rtt=typeof seconds==='number' && Number.isFinite(seconds) && seconds>=0 && seconds<=60?seconds*1000:null;
      }
    }catch{} finally{if(alive())scheduleStats();}
  }
  const api: RtcPeer={ready,receiveSignal,close:()=>fail('rtc-closed'),diagnostics,linkFigures:()=>({route,rttMs:rtt})};
  try {
    const servers=copyRtcIceServers(iceServers);
    if(!rtcId(attemptId) || !isRtcIdentity(identity) || !['offerer','answerer'].includes(role) || !['all','relay'].includes(iceTransportPolicy) || !localTicket || !expectedRemoteTicket || !rtcBoundedText(localTicket,RTC_TICKET_BYTES) || !rtcBoundedText(expectedRemoteTicket,RTC_TICKET_BYTES) || !Number.isFinite(ticketExpiresAtMs) || !validTime() || !servers){fail('rtc-config-invalid');return api;}
    cancelSetup=scheduler.schedule(RTC_SETUP_MS,()=>fail('rtc-setup-timeout'));
    pc=createConnection({iceServers:servers,iceTransportPolicy});
    listen(pc,'connectionstatechange',()=>{if(pc!.connectionState==='failed' || pc!.connectionState==='closed')fail('rtc-connection-failed');});
    listen(pc,'iceconnectionstatechange',()=>{if(pc!.iceConnectionState==='failed' || pc!.iceConnectionState==='closed')fail('rtc-connection-failed');});
    listen(pc,'datachannel',e=>{const channel=(e as RTCDataChannelEvent).channel;if(!channel){fail('rtc-channel-invalid');return;}admit(channel);});
    listen(pc,'icecandidate',e=>{
      if(closed)return;const native=(e as RTCPeerConnectionIceEvent).candidate;
      let candidate: RTCIceCandidateInit | null;try{candidate=native?native.toJSON():null;}catch{fail('rtc-signal-invalid');return;}
      if(++localCandidateCount>RTC_TOTAL_CANDIDATES || !isRtcCandidate(candidate)){fail('rtc-signal-invalid');return;}
      emit({...stamp(),kind:'candidate',candidate});
    });
    if(role==='offerer') {
      admit(pc.createDataChannel(RTC_RELIABLE_LABEL,{ordered:true}));if(!alive())return api;
      admit(pc.createDataChannel(RTC_LATEST_LABEL,{ordered:false,maxRetransmits:0}));
      void enqueue(async()=>{const offer=await pc!.createOffer();if(!alive())return;await publishDescription(offer);});
    }
  }catch{fail('rtc-connection-failed');}
  return api;
}
