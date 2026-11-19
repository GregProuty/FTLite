// Web-iii live smoke, the page-side pieces run in Node against fakes: the RTCPeerConnection relay hook, the stats read
// for Chromium- and Firefox-shaped stats, the phase read from the menu, and the relay verdict.
import { describe, expect, it } from 'vitest';
import { candidateTypes, LIVE_PLAY_MS, localPairVerdict, MIN_EARLY_END_MS, PEER_STATS_SOURCE, playStep, RELAY_INIT_SCRIPT, relayInitScript, relayVerdict, roomCodeOf, UI_READ_SOURCE, uiPhase,
  type PeerSample, type PlayState, type UiView } from '../scripts/web/live/relay';

class FakePc { config: any; connectionState = 'new'; stats = new Map<string, any>();
  constructor(config?: any) { this.config = config; }
  setConfiguration(config: any): void { this.config = config; }
  getConfiguration(): any { return this.config; }
  async getStats(): Promise<Map<string, any>> { return this.stats; } }
const runIn = (g: object, source: string): unknown => new Function('globalThis', `return ${source}`)(g);

describe('the relay hook', () => {
  it('forces relay in the constructor and setConfiguration, keeps every instance and installs once', () => {
    const g: any = { RTCPeerConnection: FakePc };
    new Function('globalThis', RELAY_INIT_SCRIPT)(g);
    const pc = new g.RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' });
    expect(pc).toBeInstanceOf(FakePc); expect(pc.config).toEqual({ iceServers: [], iceTransportPolicy: 'relay' });
    pc.setConfiguration({ iceTransportPolicy: 'all' }); expect(pc.config.iceTransportPolicy).toBe('relay');
    new Function('globalThis', RELAY_INIT_SCRIPT)(g);
    const bare = new g.RTCPeerConnection(); expect(bare.config).toEqual({ iceTransportPolicy: 'relay' });
    expect(g.__ftliteLive.peers).toEqual([pc, bare]);
    const none: any = {}; new Function('globalThis', RELAY_INIT_SCRIPT)(none); expect(none.__ftliteLive).toBeUndefined();
  });
});

describe('the non-forcing hook (local smoke)', () => {
  it('keeps every instance and leaves the configuration alone', () => {
    const g: any = { RTCPeerConnection: FakePc };
    new Function('globalThis', relayInitScript({ force: false }))(g);
    const pc = new g.RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' }), bare = new g.RTCPeerConnection();
    expect(pc).toBeInstanceOf(FakePc); expect(pc.config).toEqual({ iceServers: [], iceTransportPolicy: 'all' }); expect(bare.config).toBeUndefined();
    pc.setConfiguration({ iceTransportPolicy: 'all' }); expect(pc.config.iceTransportPolicy).toBe('all');
    expect(g.__ftliteLive.peers).toEqual([pc, bare]); expect(g.__ftliteLive.force).toBe(false);
    expect(relayInitScript({ force: true })).toBe(RELAY_INIT_SCRIPT);
  });
});

describe('the peer stats read', () => {
  it('reads the selected pair from Chromium transport stats and Firefox selected pairs; skips unconnected peers', async () => {
    const chrome = new FakePc({ iceTransportPolicy: 'relay' }); chrome.connectionState = 'connected';
    chrome.stats = new Map<string, any>([['T', { type: 'transport', selectedCandidatePairId: 'P' }], ['P', { type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', bytesReceived: 5000, bytesSent: 4000 }],
      ['L', { type: 'local-candidate', candidateType: 'relay' }], ['R', { type: 'remote-candidate', candidateType: 'relay' }]]);
    const fox = new FakePc({ iceTransportPolicy: 'relay' }); fox.connectionState = 'connected';
    fox.stats = new Map<string, any>([['P1', { type: 'candidate-pair', selected: false, localCandidateId: 'L2', remoteCandidateId: 'R', bytesReceived: 1 }],
      ['P2', { type: 'candidate-pair', selected: true, localCandidateId: 'L', remoteCandidateId: 'R', bytesReceived: 700, bytesSent: 600 }],
      ['L', { type: 'local-candidate', candidateType: 'relay' }], ['L2', { type: 'local-candidate', candidateType: 'host' }], ['R', { type: 'remote-candidate', candidateType: 'srflx' }]]);
    const idle = new FakePc({ iceTransportPolicy: 'relay' }); idle.connectionState = 'closed';
    expect(await runIn({ __ftliteLive: { peers: [chrome, fox, idle] } }, PEER_STATS_SOURCE)).toEqual([
      { state: 'connected', policy: 'relay', local: 'relay', remote: 'relay', bytesReceived: 5000, bytesSent: 4000 },
      { state: 'connected', policy: 'relay', local: 'relay', remote: 'srflx', bytesReceived: 700, bytesSent: 600 },
      { state: 'closed', policy: 'relay', local: null, remote: null, bytesReceived: 0, bytesSent: 0 }]);
    expect(await runIn({}, PEER_STATS_SOURCE)).toBeNull();
  });
  it('parses the UI read as an expression', () => { expect(() => new Function(`return ${UI_READ_SOURCE}`)).not.toThrow(); });
});

describe('the menu phase and the room code', () => {
  const view = (v: Partial<UiView>): UiView => ({ status: null, title: null, roomCode: null, pause: null, leave: null, retry: false, home: false, sessionHome: false, ...v });
  it('reads the phase the session page prints', () => {
    expect(uiPhase(view({ title: 'Lobby', status: 'Everyone presses Ready, then the host starts.' }))).toBe('lobby');
    expect(uiPhase(view({ status: 'running' }))).toBe('running');
    expect(uiPhase(view({ status: 'creating…' }))).toBe('creating');
    expect(uiPhase(view({ status: 'Online stopped (rtc-failed). Retry or leave.' }))).toBe('error');
    expect(uiPhase(view({ status: 'The room is full.', retry: true }))).toBe('error');
    expect(uiPhase(view({ status: 'Choose how to play.', home: true }))).toBe('home');
    expect(uiPhase(view({ status: 'Restoring the mirrored checkpoint…' }))).toBe('other');
    // A known-message error screen (menuMessage prints the ERRORS text) shows the session page's Return to menu button.
    expect(uiPhase(view({ status: 'Room not found. Check the code.', sessionHome: true }))).toBe('error');
    expect(uiPhase(view({ status: 'idle', sessionHome: true }))).toBe('idle');
    // Before the first status the session page prints "Connecting" and shows Return to menu (status null): not an error.
    expect(uiPhase(view({ status: 'Connecting…', sessionHome: true }))).toBe('connecting');
    expect(uiPhase(view({ status: 'Connecting', sessionHome: true }))).toBe('connecting');
  });
  it('reads the room code from the lobby key or the strip', () => {
    expect(roomCodeOf(view({ roomCode: 'K7Q2MX' }))).toBe('K7Q2MX');
    expect(roomCodeOf(view({ roomCode: 'ROOM K7Q2MX' }))).toBe('K7Q2MX');
    expect(roomCodeOf(view({}))).toBeNull();
  });
});

describe('playStep', () => {
  const both = (host: string, guest: string) => ({ host, guest });
  it('continues while both run and is done at 60 s', () => {
    const s: PlayState = { endedAtMs: null };
    expect(playStep(both('running', 'running'), 1000, s)).toBe('continue');
    expect(playStep(both('running', 'running'), LIVE_PLAY_MS, s)).toBe('done');
  });
  it('accepts an early end only when both sides read ended within 5 s, after the floor', () => {
    const s: PlayState = { endedAtMs: null };
    expect(playStep(both('ended', 'running'), 30000, s)).toBe('continue'); expect(s.endedAtMs).toBe(30000);
    expect(playStep(both('ended', 'ended'), 33000, s)).toBe('ended');
    expect(playStep(both('ended', 'ended'), MIN_EARLY_END_MS - 1, { endedAtMs: null })).toEqual({ fail: expect.stringMatching(/ended after only/) });
    // Review R1-F3: a sample between ticks must not stretch the 5 s agreement window.
    expect(playStep(both('ended', 'ended'), 36000, { endedAtMs: 30000 })).toEqual({ fail: expect.stringMatching(/read ended 6000 ms apart/) });
    expect(playStep(both('ended', 'ended'), 35000, { endedAtMs: 30000 })).toBe('ended');
  });
  it('fails a one-sided end, a pause, an error or any other phase', () => {
    const s: PlayState = { endedAtMs: null };
    playStep(both('running', 'ended'), 30000, s);
    expect(playStep(both('running', 'ended'), 35001, s)).toEqual({ fail: expect.stringMatching(/only the guest reads ended/) });
    expect(playStep(both('ended', 'reconnecting'), 30000, { endedAtMs: null })).toEqual({ fail: expect.stringMatching(/host ended, guest reconnecting/) });
    expect(playStep(both('paused', 'running'), 5000, { endedAtMs: null })).toEqual({ fail: expect.stringMatching(/left running during play: host paused, guest running/) });
    expect(playStep(both('running', 'running'), 31000, { endedAtMs: 30000 })).toEqual({ fail: expect.stringMatching(/came back from ended/) });
  });
});

describe('relayVerdict', () => {
  const peer = (bytesReceived: number, o: Partial<PeerSample> = {}): PeerSample => ({ state: 'connected', policy: 'relay', local: 'relay', remote: 'relay', bytesReceived, bytesSent: 0, ...o });
  it('passes two connected relay samples with traffic between them and ignores unconnected peers', () => {
    expect(relayVerdict([[peer(100)], [peer(9000), { ...peer(0), state: 'closed', policy: 'all', local: null }]])).toBeNull();
  });
  it('fails too few samples, a non-relay policy or pair, and too little traffic', () => {
    expect(relayVerdict([[peer(100)], []])).toMatch(/only 1 sample/);
    expect(relayVerdict([[peer(100, { policy: 'all' })], [peer(9000)]])).toMatch(/iceTransportPolicy all/);
    expect(relayVerdict([[peer(100)], [peer(9000, { local: 'srflx' })]])).toMatch(/local srflx, not relay/);
    expect(relayVerdict([[peer(100)], [peer(600)]])).toMatch(/only 500 bytes/);
    expect(relayVerdict([[peer(100)], [peer(9000, { local: null })]])).toMatch(/local null, not relay/);
  });
  it('the local verdict needs a known selected pair and traffic, any policy or type, and lists the types', () => {
    const host = (bytes: number, o: Partial<PeerSample> = {}) => peer(bytes, { policy: 'all', local: 'host', remote: 'host', ...o });
    expect(localPairVerdict([[host(100)], [host(9000, { local: 'prflx' })]])).toBeNull();
    expect(localPairVerdict([[host(100)], []])).toMatch(/only 1 sample/);
    expect(localPairVerdict([[host(100)], [host(9000, { local: null })]])).toMatch(/no selected candidate pair/);
    expect(localPairVerdict([[host(100)], [host(600)]])).toMatch(/only 500 bytes arrived over the selected pair/);
    expect(candidateTypes([[host(100)], [host(9000, { local: 'prflx' }), { ...host(0), state: 'closed', local: 'relay' }]])).toEqual(['host/host', 'prflx/host']);
  });
});
