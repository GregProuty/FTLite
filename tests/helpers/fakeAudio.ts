// A fake AudioContext for app/audio.ts (Audio-i): records what the engine creates, starts and stops. Time never advances,
// and a ramp or target lands at once, so a test reads the value the engine aimed for.
export class FakeParam {
  value = 0;
  setValueAtTime(v: number): this { this.value = v; return this; }
  linearRampToValueAtTime(v: number): this { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number): this { this.value = v; return this; }
  setTargetAtTime(v: number): this { this.value = v; return this; }
}
export interface FakeSource {
  buffer: { duration: number } | null; loop: boolean; loopStart: number; loopEnd: number;
  playbackRate: FakeParam; detune: FakeParam; starts: number[][]; stops: number; onended: (() => void) | null;
  connect(): void; disconnect(): void; start(...a: number[]): void; stop(): void;
}
export function fakeAudioContext() {
  const made = { oscillators: 0, sources: [] as FakeSource[], gains: [] as FakeParam[], panners: [] as FakeParam[] };
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 0, sampleRate: 8000, destination: node(),
    createGain: () => { const gain = new FakeParam(); made.gains.push(gain); return { ...node(), gain }; },
    createOscillator: () => { made.oscillators++; return { ...node(), type: 'sine', frequency: new FakeParam(), start() {}, stop() {} }; },
    createBufferSource: () => {
      const s: FakeSource = { ...node(), buffer: null, loop: false, loopStart: 0, loopEnd: 0, playbackRate: new FakeParam(), detune: new FakeParam(), starts: [], stops: 0, onended: null,
        start: (...a: number[]) => { s.starts.push(a); }, stop: () => { s.stops++; } };
      made.sources.push(s); return s;
    },
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }),
    createStereoPanner: () => { const pan = new FakeParam(); made.panners.push(pan); return { ...node(), pan }; },
    createBuffer: (channels: number, length: number, rate: number) => { const data = new Float32Array(length); return { duration: length / rate, length, sampleRate: rate, numberOfChannels: channels, getChannelData: () => data }; },
    /** A decoded buffer lasts one second per byte; an empty file fails, as a corrupt one would. */
    decodeAudioData: async (bytes: ArrayBuffer) => { if (bytes.byteLength === 0) throw new Error('cannot decode'); return { duration: bytes.byteLength, length: bytes.byteLength, sampleRate: 8000, numberOfChannels: 2 }; },
    resume: async () => {}, suspend: async () => {}
  };
  return { ctx: ctx as unknown as AudioContext, made };
}
