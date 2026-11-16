import { describe, it, expect } from 'vitest';
import { createRtcDataLink } from '../src/network/rtc/dataLink';
import { encodeRtcFrames, decodeRtcFrame } from '../src/network/rtc/frames';
import type { PayloadClass, PayloadMetadata, RtcDataChannel } from '../src/network/rtc/contracts';
class Channel extends EventTarget implements RtcDataChannel {
  readyState = 'open'; bufferedAmount = 0; bufferedAmountLowThreshold = 0; binaryType: BinaryType = 'arraybuffer'; sent: Uint8Array[] = []; fail = false; onSend?: () => void;
  send(bytes: ArrayBuffer) { if(this.fail) throw new Error('private native details'); this.sent.push(new Uint8Array(bytes).slice()); this.bufferedAmount += bytes.byteLength; this.onSend?.(); }
  close() { this.readyState='closed'; this.dispatchEvent(new Event('close')); }
  drain() { this.bufferedAmount=0; this.dispatchEvent(new Event('bufferedamountlow')); }
  receive(bytes: Uint8Array) { this.dispatchEvent(new MessageEvent('message',{data:bytes.slice().buffer})); }
}
const classes: PayloadClass[]=['input','state','checkpoint','control'];
function payload(size=4,seq=1,stream=1,cls=1) { const b=new Uint8Array(size); b.set([cls,stream,seq%256,Math.floor(seq/256)]); return b; }
function classify(b: Uint8Array): PayloadMetadata { return {class:classes[b[0]!]!,stream:String(b[1]),sequence:b[2]!+256*b[3]!}; }
function setup(limit=0) {
  let now=0,id=0; const jobs=new Map<number,{at:number;cb:()=>void}>(); const reliable=new Channel(),latest=new Channel();
  const scheduler={schedule(delay:number,cb:()=>void){const key=++id;jobs.set(key,{at:now+delay,cb});return ()=>{jobs.delete(key);};}};
  const link=createRtcDataLink({reliable,latest},{peer:'peer',maxMessageSize:limit,classify,clock:{nowMs:()=>now},scheduler});
  const reasons:string[]=[];link.onClose(r=>reasons.push(r));
  return {link,reliable,latest,jobs,reasons,advance(ms=0){now+=ms; const due=[...jobs].filter(([,j])=>j.at<=now);for(const [key,j] of due)if(jobs.delete(key))j.cb();}};
}
describe('RTC data Link',()=>{
  it('exposes effective cap and transfers copied framed logical data with isolated listeners',()=>{
    const a=setup(4392),b=setup(4392), input=payload(5000); const received:number[]=[];
    b.link.onMessage((kind,bytes)=>{expect(kind).toBe('reliable-ordered');bytes[4]=99;});
    b.link.onMessage((_,bytes)=>received.push(bytes[4]!));
    a.link.send('reliable-ordered',input); input.fill(9); for(const f of a.reliable.sent)b.reliable.receive(f);
    expect(a.link.caps.maxDatagram).toBe(4096); expect(received).toEqual([0]); expect(a.reasons).toEqual([]);
  });
  it('bounds reliable app plus native buffered bytes including headers',()=>{
    const a=setup();for(let i=1;i<=7;i++)a.link.send('reliable-ordered',payload(131072,i));
    expect(a.link.stats().bufferedBytes).toBeGreaterThan(917504); expect(a.link.stats().bufferedBytes).toBeLessThanOrEqual(1048576);
    a.link.send('reliable-ordered',payload(131072,8)); expect(a.reasons).toEqual(['rtc-reliable-overflow']); expect(a.link.stats().bufferedBytes).toBe(0);expect(a.jobs.size).toBe(0);
  });
  it('admits exactly 1MiB including headers and closes on the next frame',()=>{
    const a=setup();for(let i=1;i<=7;i++)a.link.send('reliable-ordered',payload(131072,i));
    // Seven 9-fragment packets: 7*(131072+9*42)=920150; eighth has 8 headers.
    a.link.send('reliable-ordered',payload(128090,8));expect(a.link.stats().bufferedBytes).toBe(1048576);expect(a.reasons).toEqual([]);
    a.link.send('reliable-ordered',payload(4,9));expect(a.reasons).toEqual(['rtc-reliable-overflow']);
  });
  it('bounds tiny outstanding/queued frame records at 4096 even below byte budget',()=>{
    const a=setup();for(let i=1;i<=4096;i++)a.link.send('reliable-ordered',payload(4,i));
    expect(a.reasons).toEqual([]);a.link.send('reliable-ordered',payload(4,4097));expect(a.reasons).toEqual(['rtc-reliable-overflow']);
  });
  it('applies the frame record ceiling across both channel queues',()=>{
    const a=setup();a.latest.bufferedAmount=16384;
    for(let i=1;i<=4095;i++)a.link.send('reliable-ordered',payload(4,i));
    a.link.send('unreliable-latest',payload(4,1,2));expect(a.reasons).toEqual([]);
    a.link.send('unreliable-latest',payload(4,1,3));expect(a.reasons).toEqual(['rtc-record-overflow']);
  });
  it('releases native outstanding records after browser drain',()=>{
    const a=setup();for(let i=1;i<=5000;i++){a.link.send('reliable-ordered',payload(4,i));a.reliable.drain();}
    expect(a.reasons).toEqual([]);expect(a.link.stats().bufferedBytes).toBe(0);
  });
  it('replaces latest backlog fairly per stream and holds browser below 16KiB',()=>{
    const a=setup();a.latest.bufferedAmount=16384;
    for(let stream=1;stream<=16;stream++){a.link.send('unreliable-latest',payload(4,1,stream));a.link.send('unreliable-latest',payload(4,2,stream));}
    expect(a.latest.sent).toHaveLength(0);a.latest.drain();
    expect(a.latest.sent).toHaveLength(16);expect(a.latest.bufferedAmount).toBeLessThanOrEqual(16384);
    expect(a.latest.sent.map(f=>decodeRtcFrame(f,16384).metadata.sequence)).toEqual(Array(16).fill(2));
    expect(new Set(a.latest.sent.map(f=>decodeRtcFrame(f,16384).metadata.stream)).size).toBe(16);
  });
  it('rejects seventeenth retained stream and latest larger than conservative cap',()=>{
    const a=setup();a.latest.bufferedAmount=16384;for(let stream=1;stream<=17;stream++)a.link.send('unreliable-latest',payload(4,1,stream));expect(a.reasons).toEqual(['rtc-stream-overflow']);
    const b=setup(4392);b.link.send('unreliable-latest',payload(4097));expect(b.reasons).toEqual(['rtc-latest-overflow']);
  });
  it('drains finite batches and schedules continuation below threshold without needing a low event',()=>{
    const a=setup();a.reliable.bufferedAmount=65536;for(let i=1;i<=40;i++)a.link.send('reliable-ordered',payload(4,i));
    expect(a.reliable.sent).toHaveLength(0);a.reliable.drain();expect(a.reliable.sent).toHaveLength(16);
    expect(a.jobs.size).toBe(1);a.advance();expect(a.reliable.sent).toHaveLength(32);a.advance();expect(a.reliable.sent).toHaveLength(40);expect(a.jobs.size).toBe(0);
  });
  it('delivers reliable controls after a fragmented full under browser stalls',()=>{
    const a=setup(4392),b=setup(4392),got:number[]=[];b.link.onMessage((_,bytes)=>got.push(bytes[0]!));
    a.link.send('reliable-ordered',payload(131072));a.link.send('reliable-ordered',payload(4,1,2,3));
    let delivered=0;for(let pass=0;pass<10;pass++){for(const f of a.reliable.sent.slice(delivered))b.reliable.receive(f);delivered=a.reliable.sent.length;a.reliable.drain();a.advance();}
    expect(got).toEqual([1,3]);expect(a.reasons).toEqual([]);expect(b.reasons).toEqual([]);
  });
  it('closes synchronously from send reentrancy and native throws with bounded reasons',()=>{
    const a=setup();a.reliable.onSend=()=>a.link.close('caller details');a.link.send('reliable-ordered',payload(131072));
    expect(a.reliable.sent).toHaveLength(1);expect(a.reasons).toEqual(['rtc-closed']);expect(a.jobs.size).toBe(0);a.link.close('again');expect(a.reasons).toHaveLength(1);
    const b=setup();b.reliable.fail=true;b.link.send('reliable-ordered',payload());expect(b.reasons).toEqual(['rtc-send-failed']);expect(b.latest.readyState).toBe('closed');
  });
  it('callback close prevents further callbacks and late messages/timers',()=>{
    const a=setup();let calls=0;a.link.onMessage(()=>a.link.close('stop'));a.link.onMessage(()=>calls++);
    a.reliable.receive(encodeRtcFrames(payload(),classify(payload()),1,16384)[0]!);expect(calls).toBe(0);a.reliable.receive(new Uint8Array(1));a.advance(20000);expect(a.reasons).toEqual(['rtc-closed']);expect(a.jobs.size).toBe(0);
  });
  it('expires reassembly with cancellable timer and rejects malformed or classifier mismatch',()=>{
    const a=setup(4392);a.reliable.receive(encodeRtcFrames(payload(5000),classify(payload()),1,4392)[0]!);expect(a.jobs.size).toBe(1);
    a.advance(10000);expect(a.jobs.size).toBe(0);
    const wrong=encodeRtcFrames(payload(4,2),{class:'input',stream:'1',sequence:2},2,4392)[0]!;a.reliable.receive(wrong);expect(a.reasons).toEqual(['rtc-invalid-payload']);
    const b=setup();b.reliable.receive(new Uint8Array(1));expect(b.reasons).toEqual(['rtc-invalid-frame']);
  });
  it('retains one initial packet until listener and rejects a second unobserved packet',()=>{
    const a=setup();a.reliable.receive(encodeRtcFrames(payload(),classify(payload()),1,16384)[0]!);const got:number[]=[];a.link.onMessage((_,b)=>got.push(b[2]!));expect(got).toEqual([1]);
    const b=setup();b.reliable.receive(encodeRtcFrames(payload(),classify(payload()),1,16384)[0]!);b.reliable.receive(encodeRtcFrames(payload(4,2),classify(payload(4,2)),2,16384)[0]!);expect(b.reasons).toEqual(['rtc-unobserved-overflow']);
  });
  it.each(['close','throw'] as const)('handles synchronous initial subscriber %s during flush',action=>{
    const a=setup();a.reliable.receive(encodeRtcFrames(payload(),classify(payload()),1,16384)[0]!);
    let calls=0;a.link.onMessage(()=>{calls++;if(action==='close')a.link.close('stop');else throw new Error('private callback details');});
    a.link.onMessage(()=>calls++);a.reliable.receive(encodeRtcFrames(payload(4,2),classify(payload(4,2)),2,16384)[0]!);
    expect(calls).toBe(1);expect(a.reasons).toEqual([action==='close'?'rtc-closed':'rtc-receiver-failed']);expect(a.jobs.size).toBe(0);
  });
  it('cleans listeners when a native close fires synchronously during registration',()=>{
    class ClosingChannel extends Channel {
      registered=new Set<EventListener>();
      override addEventListener(type:string,listener:EventListener) {super.addEventListener(type,listener);this.registered.add(listener);if(type==='error')this.close();}
      override removeEventListener(type:string,listener:EventListener) {super.removeEventListener(type,listener);this.registered.delete(listener);}
    }
    const reliable=new ClosingChannel(), latest=new ClosingChannel();
    const link=createRtcDataLink({reliable,latest},{peer:'x',maxMessageSize:0,classify,clock:{nowMs:()=>0},scheduler:{schedule:()=>()=>{}}});
    let reason='';link.onClose(r=>reason=r);expect(reason).toBe('rtc-channel-closed');expect(reliable.registered.size+latest.registered.size).toBe(0);
  });
  it('requires already-open channels and never exposes native private diagnostics',()=>{
    const a=setup();expect(a.link.stats()).toEqual({rttMs:0,lossPct:0,relayed:false,bufferedBytes:0});
    const c=new Channel();c.readyState='connecting';expect(()=>createRtcDataLink({reliable:c,latest:new Channel()},{peer:'x',maxMessageSize:0,classify,clock:{nowMs:()=>0},scheduler:{schedule:()=>()=>{}}})).toThrow('rtc-channels-not-open');
  });
});
