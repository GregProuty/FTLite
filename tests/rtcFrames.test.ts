import { describe, it, expect } from 'vitest';
import { encodeRtcFrames, decodeRtcFrame, createRtcReassembler, rtcPacketLimit } from '../src/network/rtc/frames';
import type { PayloadClass, PayloadMetadata } from '../src/network/rtc/contracts';
const meta = (sequence = 1, stream = 's', cls: PayloadClass = 'state'): PayloadMetadata => ({ class: cls, stream, sequence });
const frame = (size = 5000, id = 1, sequence = id, stream = 's') => encodeRtcFrames(new Uint8Array(size).fill(7), meta(sequence, stream), id, 4392);
describe('RTC frames', () => {
  it.each([['input',4096],['control',4096],['state',131072],['checkpoint',262144]] as const)('bounds %s logical bytes before framing', (cls, limit) => {
    const frames = encodeRtcFrames(new Uint8Array(limit), meta(1,'s',cls),1,16384);
    expect(frames.every(f => f.length <= 16384)).toBe(true);
    expect(() => encodeRtcFrames(new Uint8Array(limit+1),meta(1,'s',cls),1,16384)).toThrow();
  });
  it('reserves worst stream header, accepts zero SCTP limit and rejects too-small limits', () => {
    expect(rtcPacketLimit(0)).toBe(16384); expect(rtcPacketLimit(4392)).toBe(4392);
    for (const n of [4391,-1,NaN,Infinity,0.5]) expect(() => rtcPacketLimit(n)).toThrow();
    const f = encodeRtcFrames(new Uint8Array(4096),meta(1,'x'.repeat(128),'input'),1,4392);
    expect(f).toHaveLength(1); expect(f[0]!.length).toBe(4392);
  });
  it('normalizes an unbounded or large direct framing limit to 16KiB', () => {
    for (const limit of [0,65536]) {
      const frames=encodeRtcFrames(new Uint8Array(20000),meta(),1,limit);
      expect(frames).toHaveLength(2);expect(frames[0]!.length).toBe(16384);
      expect(decodeRtcFrame(frames[0]!,limit).bytes.length).toBe(16342);
    }
  });
  it('owns input, decoded fragments and completed payloads', () => {
    const input = new Uint8Array([1,2,3]); const frames = encodeRtcFrames(input,meta(),1,16384); input.fill(9);
    const decoded = decodeRtcFrame(frames[0]!,16384); frames[0]!.fill(8); expect([...decoded.bytes]).toEqual([1,2,3]);
    const r = createRtcReassembler(16384); const packet = r.accept(encodeRtcFrames(new Uint8Array([4]),meta(),1,16384)[0]!, 'reliable-ordered',0);
    expect([...packet!.bytes]).toEqual([4]);
  });
  it('reassembles exact fragments, rejects replay under fresh message ID and permits new transport retry ordinal', () => {
    const r = createRtcReassembler(4392), f = frame(); expect(r.accept(f[0]!, 'reliable-ordered',0)).toBeUndefined();
    expect(r.accept(f[1]!, 'reliable-ordered',1)?.bytes.length).toBe(5000);
    expect(() => r.accept(frame(5,2,1)[0]!, 'reliable-ordered',2)).toThrow();
    expect(r.accept(frame(5,3,2)[0]!, 'reliable-ordered',3)?.metadata.sequence).toBe(2);
  });
  it('rejects duplicate and noncanonical overlapping/out-of-range/count fragments', () => {
    const f = frame(), r = createRtcReassembler(4392); r.accept(f[0]!, 'reliable-ordered',0);
    expect(() => r.accept(f[0]!, 'reliable-ordered',1)).toThrow();
    for (const [offset,value,width] of [[6,3,2],[8,4097,2],[32,1,4],[36,0,4],[28,262145,4]] as const) {
      const bad = f[0]!.slice(), v = new DataView(bad.buffer); if(width===2) v.setUint16(offset,value); else v.setUint32(offset,value);
      expect(() => decodeRtcFrame(bad,4392)).toThrow();
    }
    for (const length of [0,1,39,f[0]!.length-1]) expect(() => decodeRtcFrame(f[0]!.slice(0,length),4392)).toThrow();
  });
  it('retains at most two assemblies and expires at ten seconds', () => {
    const r = createRtcReassembler(4392); r.accept(frame(5000,1,1,'a')[0]!, 'reliable-ordered',0); r.accept(frame(5000,2,1,'b')[0]!, 'reliable-ordered',1);
    expect(() => r.accept(frame(5000,3,1,'c')[0]!, 'reliable-ordered',2)).toThrow();
    expect(r.partialCount).toBe(2); expect(r.expire(9999)).toBe(0); expect(r.expire(10000)).toBe(1); expect(r.partialCount).toBe(1);
    r.clear(); expect(r.partialCount).toBe(0);
  });
  it('ignores unordered stale latest independently of reliable state delivery', () => {
    const r = createRtcReassembler(4392);
    expect(r.accept(frame(5,2,2)[0]!, 'unreliable-latest',0)?.metadata.sequence).toBe(2);
    expect(r.accept(frame(5,1,1)[0]!, 'unreliable-latest',0)).toBeUndefined();
    expect(r.accept(frame(5,1,1)[0]!, 'reliable-ordered',0)?.metadata.sequence).toBe(1);
    expect(() => r.accept(frame()[0]!, 'unreliable-latest',0)).toThrow();
  });
  it('rejects invalid metadata and bounds retained stream identities', () => {
    for (const m of [meta(0),meta(-1),meta(1.5),meta(Number.MAX_SAFE_INTEGER+1),meta(1,''),meta(1,'s'.repeat(129))]) expect(() => encodeRtcFrames(new Uint8Array([1]),m,1,4392)).toThrow();
    const r=createRtcReassembler(4392); for(let i=0;i<16;i++) r.accept(frame(1,i+1,1,String(i))[0]!,'unreliable-latest',0);
    expect(() => r.accept(frame(1,17,1,'extra')[0]!,'unreliable-latest',0)).toThrow();
  });
});
