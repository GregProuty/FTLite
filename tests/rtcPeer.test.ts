import { describe, expect, it } from 'vitest';
import { createRtcPeer, type RtcPeerConnection } from '../src/network/rtc/peer';
import type { RtcIdentity, RtcSignal } from '../src/shared/rtcSession';
import { encodeRtcFrames } from '../src/network/rtc/frames';

class Channel extends EventTarget {
  readyState = 'connecting'; bufferedAmount = 0; bufferedAmountLowThreshold = 0; binaryType: BinaryType = 'arraybuffer';
  protocol = ''; negotiated = false; maxPacketLifeTime: number | null = null; sent: unknown[] = []; listeners = new Set<EventListener>();remote?:Channel;
  constructor(readonly label: string, readonly ordered: boolean, readonly maxRetransmits: number | null) { super(); }
  send(data: ArrayBuffer | string) { const copy=typeof data==='string'?data:data.slice(0);this.sent.push(copy);if(typeof data!=='string')this.bufferedAmount+=data.byteLength;if(this.remote)queueMicrotask(()=>this.remote!.receive(copy)); }
  close() { if(this.readyState === 'closed')return; this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
  open() { this.readyState = 'open'; this.dispatchEvent(new Event('open')); }
  receive(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
  override addEventListener(t: string, f: EventListener) { super.addEventListener(t, f); this.listeners.add(f); }
  override removeEventListener(t: string, f: EventListener) { super.removeEventListener(t, f); this.listeners.delete(f); }
}
class Connection extends EventTarget implements RtcPeerConnection {
  connectionState = 'new'; iceConnectionState = 'new'; localDescription: RTCSessionDescriptionInit | null = null;
  sctp = { maxMessageSize: 16384 }; channels: Channel[] = []; options: RTCDataChannelInit[] = []; calls: string[] = []; listeners = new Set<EventListener>();
  stats = new Map<string, unknown>(); offerWait?: Promise<RTCSessionDescriptionInit>; descriptionWait?: Promise<void>; candidateWait?: Promise<void>;localWait?:Promise<void>;
  createDataChannel(label: string, init: RTCDataChannelInit) { this.options.push(init); const c = new Channel(label, init.ordered ?? true, init.maxRetransmits ?? null); this.channels.push(c); return c; }
  async createOffer() { this.calls.push('offer'); return this.offerWait ?? { type: 'offer' as const, sdp: 'offer' }; }
  async createAnswer() { this.calls.push('answer'); return { type: 'answer' as const, sdp: 'answer' }; }
  async setLocalDescription(d: RTCSessionDescriptionInit) { this.calls.push('local');await this.localWait; this.localDescription = d; }
  async setRemoteDescription(_d: RTCSessionDescriptionInit) { this.calls.push('remote'); await this.descriptionWait; }
  async addIceCandidate(_c: RTCIceCandidateInit | null) { this.calls.push('candidate'); await this.candidateWait; }
  async getStats() { return this.stats as RTCStatsReport; }
  close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
  deliver(c: Channel) { this.channels.push(c); this.dispatchEvent(Object.assign(new Event('datachannel'), { channel: c })); }
  override addEventListener(t: string, f: EventListener) { super.addEventListener(t, f); this.listeners.add(f); }
  override removeEventListener(t: string, f: EventListener) { super.removeEventListener(t, f); this.listeners.delete(f); }
}
const identity: RtcIdentity = { protocolVersion: 2, modeId: 'sector', schemaVersion: 2, simVersion: 35, contentDigest: 'a'.repeat(64), layoutHash: 'b87a0284', runId: 'run', roomId: 'room', hostGeneration: 1, seatGeneration: 2, localConnectionId: 'host', remoteConnectionId: 'guest' };
const mirror = { ...identity, localConnectionId: 'guest', remoteConnectionId: 'host' };
const tick = async () => { for(let i=0;i<20;i++) await Promise.resolve(); };
function setup(overrides: Record<string, unknown> = {}, connection = new Connection()) {
  let now = 0, id = 0; const jobs = new Map<number, { at: number; cb: () => void }>(), signals: RtcSignal[] = [];
  const peer = createRtcPeer({ attemptId: 'attempt', role: 'offerer', identity, localTicket: 'host-ticket', expectedRemoteTicket: 'guest-ticket', ticketExpiresAtMs: 10000, iceServers: [], classify: b => ({class: 'control', stream: 'c', sequence: b[0]!}), clock: { nowMs: () => now }, scheduler: { schedule(delay, cb) { const key=++id; jobs.set(key, {at:now+delay,cb}); return () => { jobs.delete(key); }; } }, emitSignal: signal => signals.push(signal), createConnection: () => connection, ...overrides });
  const outcome = peer.ready.then(link => ({ link }), error => ({ error: (error as Error).message }));
  return { peer, connection, signals, jobs, outcome, advance(ms: number) { now += ms; for(const [key, job] of [...jobs]) if(job.at<=now && jobs.delete(key))job.cb(); } };
}
function signal(kind: 'description' | 'candidate' = 'description', extra: Record<string, unknown> = {}) {
  return {attemptId:'attempt', roomId:'room', seatGeneration:2, from:'guest', to:'host', hostGeneration:1, ...(kind==='description' ? {kind, description:{type:'answer',sdp:'answer'}} : {kind,candidate:{candidate:'candidate'}}), ...extra};
}
const prefix = 'FTL-RTC-AUTH/1:';
function hello(extra: Record<string, unknown> = {}, ticket = 'guest-ticket') { return prefix + JSON.stringify({kind:'hello',attemptId:'attempt',identity:{...mirror,...extra},ticket}); }
function authenticate(s: ReturnType<typeof setup>) {
  const [reliable, latest] = s.connection.channels; reliable!.open(); latest!.open(); reliable!.receive(hello()); reliable!.receive(prefix + JSON.stringify({kind:'ack',attemptId:'attempt'}));
  return {reliable:reliable!,latest:latest!};
}

describe('authenticated RTC peer attempts', () => {
  it('copies ephemeral ICE servers into native all-candidate configuration without exposing credentials in diagnostics', () => {
    const servers = [{ urls: ['turn:example.test:3478?transport=udp', 'turns:example.test:5349?transport=tcp'], username: 'ephemeral', credential: 'test-password' }];
    let config: RTCConfiguration | undefined;
    const s = setup({ iceServers: servers, createConnection: (value: RTCConfiguration) => { config = value; return new Connection(); } });
    expect(config).toEqual({ iceServers: servers, iceTransportPolicy: 'all' }); servers[0]!.credential = 'changed';
    expect(config!.iceServers![0]!.credential).toBe('test-password'); expect(JSON.stringify(s.peer.diagnostics())).not.toContain('test-password'); s.peer.close('done');
  });
  it('creates exact reliable/latest channels and emits host offer only after native local description', async () => {
    const s=setup(); await tick(); expect(s.connection.channels.map(c=>c.label)).toEqual(['ftl-reliable-v1','ftl-latest-v1']);
    expect(s.connection.options).toEqual([{ordered:true},{ordered:false,maxRetransmits:0}]);
    expect(s.connection.calls).toEqual(['offer','local']); expect(s.signals).toEqual([{attemptId:'attempt',roomId:'room',seatGeneration:2,from:'host',to:'guest',hostGeneration:1,kind:'description',description:{type:'offer',sdp:'offer'}}]); s.peer.close('done');
  });
  it('passes validated trusted relay policy and refuses unknown policy before native setup', async () => {
    let configuration:RTCConfiguration|undefined;const a=setup({iceTransportPolicy:'relay',createConnection:(config:RTCConfiguration)=>{configuration=config;return new Connection();}});expect(configuration?.iceTransportPolicy).toBe('relay');a.peer.close('done');
    let called=false;const b=setup({iceTransportPolicy:'unknown',createConnection:()=>{called=true;return new Connection();}});expect(await b.outcome).toEqual({error:'rtc-config-invalid'});expect(called).toBe(false);
  });
  it.each([{ticket:'\0'.repeat(496),bytes:4096,allowed:true},{ticket:'\0'.repeat(496)+'x',bytes:4097,allowed:false},{ticket:'\0'.repeat(512),bytes:4192,allowed:false}])('bounds serialized auth envelope at $bytes bytes before native send', async ({ticket,bytes,allowed}) => {
    // Fixed JSON overhead is1120 bytes for these max-length printable IDs; each NUL encodes as six ASCII bytes.
    const boundedIdentity={...identity,modeId:'m'.repeat(128),runId:'r'.repeat(128),roomId:'o'.repeat(128),localConnectionId:'h'.repeat(128),remoteConnectionId:'g'.repeat(128)};
    const s=setup({attemptId:'t'.repeat(128),identity:boundedIdentity,localTicket:ticket});const [r,l]=s.connection.channels;r!.open();l!.open();
    if(allowed){expect(r!.sent).toHaveLength(1);expect(new TextEncoder().encode(r!.sent[0] as string).byteLength).toBe(bytes);s.peer.close('done');}
    else{expect(r!.sent).toHaveLength(0);expect(await s.outcome).toEqual({error:'rtc-auth-failed'});expect(s.connection.connectionState).toBe('closed');expect(s.connection.listeners.size+r!.listeners.size+l!.listeners.size).toBe(0);expect(s.jobs.size).toBe(0);r!.open();l!.open();expect(r!.sent).toHaveLength(0);}
  });
  it('exposes Link only after both open channels and mutual ticket acknowledgement, preserving first packet', async () => {
    const s=setup(); let ready=false; void s.peer.ready.then(()=>{ready=true;});
    const [r,l]=s.connection.channels; r!.open(); r!.receive(hello()); await tick(); expect(ready).toBe(false); expect(r!.sent).toHaveLength(0);
    l!.open(); expect(r!.sent).toHaveLength(2); r!.receive(prefix+JSON.stringify({kind:'ack',attemptId:'attempt'}));
    const bytes=new Uint8Array([1]); r!.receive(encodeRtcFrames(bytes,{class:'control',stream:'c',sequence:1},1,16384)[0]!.buffer);
    const result=await s.outcome; expect('link' in result).toBe(true); if(!('link' in result))return;
    const got:number[]=[];result.link.onMessage((_,b)=>got.push(b[0]!)); expect(got).toEqual([1]); result.link.close('done'); expect(s.connection.listeners.size).toBe(0);expect(r!.listeners.size+l!.listeners.size).toBe(0);expect(s.jobs.size).toBe(0);
  });
  it('holds one bounded latest frame during acknowledgement race and delivers only after auth', async () => {
    const s=setup();const [r,l]=s.connection.channels;r!.open();l!.open();r!.receive(hello());
    l!.receive(encodeRtcFrames(new Uint8Array([1]),{class:'control',stream:'c',sequence:1},1,16384)[0]!.buffer);
    r!.receive(prefix+JSON.stringify({kind:'ack',attemptId:'attempt'})); const result=await s.outcome;if(!('link'in result))throw Error(result.error);
    const got:number[]=[];result.link.onMessage((_,b)=>got.push(b[0]!));expect(got).toEqual([1]);s.peer.close('done');
  });
  it('runs both production peer handshakes through a broker and preserves immediate reliable first payload', async () => {
    let host!:ReturnType<typeof setup>,guest!:ReturnType<typeof setup>;
    host=setup({emitSignal:(value:RtcSignal)=>{void guest.peer.receiveSignal(value);}});
    guest=setup({role:'answerer',identity:mirror,localTicket:'guest-ticket',expectedRemoteTicket:'host-ticket',emitSignal:(value:RtcSignal)=>{void host.peer.receiveSignal(value);}});
    for(const a of host.connection.channels){const b=new Channel(a.label,a.ordered,a.maxRetransmits);a.remote=b;b.remote=a;guest.connection.deliver(b);}
    void host.peer.ready.then(link=>link.send('reliable-ordered',new Uint8Array([1])));
    for(const c of [...host.connection.channels,...guest.connection.channels])c.open();await tick();
    const result=await guest.outcome;if(!('link'in result))throw Error(result.error);const got:number[]=[];result.link.onMessage((_,b)=>got.push(b[0]!));expect(got).toEqual([1]);expect(host.connection.calls).toEqual(['offer','local','remote']);expect(guest.connection.calls).toEqual(['remote','answer','local']);host.peer.close('done');guest.peer.close('done');expect(host.jobs.size+guest.jobs.size).toBe(0);
  });
  it.each(['protocolVersion','schemaVersion','simVersion','modeId','contentDigest','layoutHash','runId','roomId','hostGeneration','seatGeneration','localConnectionId','remoteConnectionId'])('rejects mismatched authenticated %s', async key => {
    const s=setup();const [r,l]=s.connection.channels;r!.open();l!.open();r!.receive(hello({[key]:key.endsWith('Generation')?99:'wrong'})); expect(await s.outcome).toEqual({error:'rtc-auth-failed'});expect(s.connection.connectionState).toBe('closed');
  });
  it.each(['wrong','expired','replayed'])('rejects %s ticket without exposing secrets', async kind => {
    const s=setup();const [r,l]=s.connection.channels;r!.open();l!.open();if(kind==='expired')s.advance(10001);
    r!.receive(hello({},kind==='wrong'?'secret-ticket':'guest-ticket'));if(kind==='replayed')r!.receive(hello());
    expect(await s.outcome).toEqual({error:'rtc-auth-failed'});expect(s.jobs.size).toBe(0);
  });
  it('rejects application payload before ticket and oversized/unknown auth records', async () => {
    for(const value of [new ArrayBuffer(2), prefix+'x'.repeat(4097),prefix+JSON.stringify({kind:'ack',attemptId:'attempt'})]) {
      const s=setup();const [r,l]=s.connection.channels;r!.open();l!.open();r!.receive(value);expect(await s.outcome).toEqual({error:'rtc-auth-failed'});
    }
  });
  it.each(['unknown','duplicate','options'])('rejects %s answerer channel', async kind => {
    const s=setup({role:'answerer',identity:mirror});const c=new Channel(kind==='unknown'?'other':'ftl-reliable-v1',kind!=='options',null);s.connection.deliver(c);if(kind==='duplicate')s.connection.deliver(new Channel('ftl-reliable-v1',true,null));expect(await s.outcome).toEqual({error:'rtc-channel-invalid'});expect(c.readyState).toBe('closed');
  });
  it('answers a guest offer and serializes queued candidates after description', async () => {
    const s=setup({role:'answerer',identity:mirror}); const stamp={from:'host',to:'guest'};await s.peer.receiveSignal(signal('candidate',stamp));
    await s.peer.receiveSignal(signal('description',{...stamp,description:{type:'offer',sdp:'offer'}}));expect(s.connection.calls).toEqual(['remote','candidate','answer','local']);expect(s.signals[0]).toMatchObject({from:'guest',to:'host',description:{type:'answer',sdp:'answer'}});s.peer.close('done');
  });
  it('accepts exact SDP/candidate limits and all 64 queued candidates without truncation', async () => {
    const s=setup({role:'answerer'});for(let i=0;i<64;i++)await s.peer.receiveSignal(signal('candidate',{candidate:{candidate:'x'.repeat(4096)}}));
    await s.peer.receiveSignal(signal('description',{description:{type:'offer',sdp:'x'.repeat(65536)}}));expect(s.connection.calls.filter(c=>c==='candidate')).toHaveLength(64);expect(s.signals[0]).toMatchObject({kind:'description',description:{type:'answer'}});s.peer.close('done');
  });
  it('serializes live candidate awaits without parallel native operations', async () => {
    const c=new Connection(),s=setup({},c);await s.peer.receiveSignal(signal());let finish!:()=>void;c.candidateWait=new Promise(resolve=>{finish=resolve;});
    const first=s.peer.receiveSignal(signal('candidate')),second=s.peer.receiveSignal(signal('candidate'));await tick();expect(c.calls.filter(x=>x==='candidate')).toHaveLength(1);finish();await Promise.all([first,second]);expect(c.calls.filter(x=>x==='candidate')).toHaveLength(2);s.peer.close('done');
  });
  it.each([{maxRetransmits:1},{maxPacketLifeTime:1},{protocol:'wrong'},{negotiated:true}])('rejects incompatible native channel configuration %j', async options => {
    const s=setup({role:'answerer'}),c=new Channel('ftl-reliable-v1',true,null);Object.assign(c,options);s.connection.deliver(c);expect(await s.outcome).toEqual({error:'rtc-channel-invalid'});
  });
  it('ignores obsolete attempts but rejects invalid current identity before native calls', async () => {
    const s=setup({role:'answerer'});await s.peer.receiveSignal(signal('description',{attemptId:'old',roomId:'wrong'}));expect(s.connection.calls).toEqual([]);
    await s.peer.receiveSignal(signal('description',{roomId:'wrong'}));expect(await s.outcome).toEqual({error:'rtc-signal-invalid'});expect(s.connection.calls).toEqual([]);
  });
  it.each([{from:'host'},{to:'guest'},{seatGeneration:3},{hostGeneration:2},{unknown:true},{candidate:{candidate:'é'.repeat(2049)}}])('rejects current signal identity/schema/UTF8 violation %j', async extra => {
    const s=setup({role:'answerer'});await s.peer.receiveSignal(signal('candidate',extra));expect(await s.outcome).toEqual({error:'rtc-signal-invalid'});expect(s.connection.calls).toEqual([]);
  });
  it.each(['sdp','candidate','pre-description','total'])('bounds %s before native processing', async kind => {
    const s=setup({role:'answerer'});
    if(kind==='sdp')await s.peer.receiveSignal(signal('description',{description:{type:'offer',sdp:'x'.repeat(65537)}}));
    if(kind==='candidate')await s.peer.receiveSignal(signal('candidate',{candidate:{candidate:'x'.repeat(4097)}}));
    if(kind==='pre-description')for(let i=0;i<65;i++)await s.peer.receiveSignal(signal('candidate'));
    if(kind==='total'){await s.peer.receiveSignal(signal('description',{description:{type:'offer',sdp:'offer'}}));for(let i=0;i<129;i++)await s.peer.receiveSignal(signal('candidate'));}
    expect(await s.outcome).toEqual({error:'rtc-signal-invalid'});expect(s.connection.calls.filter(c=>c==='candidate').length).toBe(kind==='total'?128:0);
  });
  it.each([{urls:'https://secret'},Array.from({length:9},()=>({urls:'stun:local'})),[{urls:Array(17).fill('turn:local')}],[{urls:'turn:local',credential:'x'.repeat(513)}]])('rejects invalid ICE config before creating native connection', async servers => {
    let count=0;const s=setup({iceServers:Array.isArray(servers)?servers:[servers],createConnection:()=>{count++;return new Connection();}});expect(await s.outcome).toEqual({error:'rtc-config-invalid'});expect(count).toBe(0);
  });
  it('cancels suspended offer/description/candidate operations without late resurrection', async () => {
    for(const stage of ['offer','local','description','candidate']) {
      const c=new Connection();let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
      if(stage==='offer')c.offerWait=pending.then(()=>({type:'offer',sdp:'private'}));if(stage==='local')c.localWait=pending;if(stage==='description')c.descriptionWait=pending;if(stage==='candidate')c.candidateWait=pending;
      const s=setup({},c);await tick();let receiving:Promise<void>|undefined;
      if(stage==='description')receiving=s.peer.receiveSignal(signal());
      if(stage==='candidate'){await s.peer.receiveSignal(signal());receiving=s.peer.receiveSignal(signal('candidate'));}
      await tick();s.peer.close('private reason');finish();await receiving;await tick();expect(await s.outcome).toEqual({error:'rtc-closed'});expect(s.signals.length).toBe(stage==='offer'||stage==='local'?0:1);expect(s.jobs.size).toBe(0);expect(c.listeners.size).toBe(0);
    }
  });
  it('times out setup and closes on native failure without leaked timers', async () => {
    const a=setup();a.advance(30000);expect(await a.outcome).toEqual({error:'rtc-setup-timeout'});expect(a.jobs.size).toBe(0);
    const b=setup();b.connection.connectionState='failed';b.connection.dispatchEvent(new Event('connectionstatechange'));expect(await b.outcome).toEqual({error:'rtc-connection-failed'});
  });
  it('rejects a second retained cross-channel packet before auth completion', async () => {
    const s=setup();const [r,l]=s.connection.channels;r!.open();l!.open();r!.receive(hello());l!.receive(new ArrayBuffer(4));l!.receive(new ArrayBuffer(4));expect(await s.outcome).toEqual({error:'rtc-auth-failed'});expect(s.jobs.size).toBe(0);
  });
  it('consumes hello ticket once and refuses late auth replay after ready', async () => {
    const s=setup();const {reliable}=authenticate(s);const result=await s.outcome;if(!('link'in result))throw Error(result.error);const reasons:string[]=[];result.link.onClose(r=>reasons.push(r));reliable.receive(hello());expect(reasons).toEqual(['rtc-invalid-frame']);expect(s.connection.listeners.size).toBe(0);expect(s.jobs.size).toBe(0);
  });
  it('bounds outbound ICE and catches provider failure without leaking native exception text', async () => {
    const a=setup({emitSignal:()=>{throw Error('private SDP and token');}});await tick();expect(await a.outcome).toEqual({error:'rtc-signalling-failed'});
    const b=setup();for(let i=0;i<129;i++)b.connection.dispatchEvent(Object.assign(new Event('icecandidate'),{candidate:{toJSON:()=>({candidate:'candidate'})}}));expect(await b.outcome).toEqual({error:'rtc-signal-invalid'});expect(b.signals.filter(x=>x.kind==='candidate')).toHaveLength(128);
  });
  it('does not resume stats after close while native report is pending', async () => {
    const s=setup();authenticate(s);await s.outcome;let finish!:(r:RTCStatsReport)=>void;s.connection.getStats=()=>new Promise(resolve=>{finish=resolve;});s.advance(1000);s.peer.close('done');finish(new Map() as RTCStatsReport);await tick();expect(s.jobs.size).toBe(0);expect(s.peer.diagnostics()).toEqual({rttMs:0,lossPct:0,relayed:false,bufferedBytes:0});
  });
  it('sanitizes nonfinite, negative or over-range native statistics', async () => {
    const s=setup();authenticate(s);const result=await s.outcome;if(!('link'in result))throw Error(result.error);
    s.connection.stats=new Map([['pair',{id:'pair',type:'candidate-pair',nominated:true,state:'succeeded',currentRoundTripTime:Infinity,packetsReceived:-1,packetsLost:NaN}]]);s.advance(1000);await tick();expect(result.link.stats()).toEqual({rttMs:0,lossPct:0,relayed:false,bufferedBytes:0});s.peer.close('done');
  });
  it('wraps sanitized selected-route stats while preserving task1 queue bytes and close', async () => {
    const s=setup();authenticate(s);const result=await s.outcome;if(!('link'in result))throw Error(result.error);
    s.connection.stats=new Map([['transport',{id:'transport',type:'transport',selectedCandidatePairId:'pair'}],['pair',{id:'pair',type:'candidate-pair',currentRoundTripTime:0.025,packetsReceived:90,packetsLost:10,localCandidateId:'local',remoteCandidateId:'remote'}],['local',{id:'local',type:'local-candidate',candidateType:'relay',address:'private'}],['remote',{id:'remote',type:'remote-candidate',candidateType:'host'}]]);
    s.advance(1000);await tick();expect(result.link.stats()).toEqual({rttMs:25,lossPct:10,relayed:true,bufferedBytes:0});
    result.link.send('reliable-ordered',new Uint8Array([1]));expect(result.link.stats().bufferedBytes).toBeGreaterThan(0);const reasons:string[]=[];result.link.onClose(r=>reasons.push(r));s.peer.close('private');expect(reasons).toEqual(['rtc-closed']);expect(s.jobs.size).toBe(0);
  });
});
