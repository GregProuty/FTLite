// Web-iii live smoke (web build spec §8: "two browser profiles with iceTransportPolicy: 'relay'"): the page-side
// sources and the pure verdicts. Pure: no Playwright. A production page has no test probe (Web-ii W-1), so the relay is
// forced by an init script and the phase is read from the menu as a player sees it (plan L-1, L-2).
export const LIVE_PLAY_MS = 60000, MIN_RELAY_BYTES = 1024, RELAY_SAMPLE_MS = 10000;
/** Plan L-3: both sides must read `ended` within END_AGREE_MS of each other, and not before MIN_EARLY_END_MS (two relay samples). */
export const END_AGREE_MS = 5000, MIN_EARLY_END_MS = 2 * RELAY_SAMPLE_MS;
export interface PeerSample { state: string; policy: string | null; local: string | null; remote: string | null; bytesReceived: number; bytesSent: number }
export interface UiView { status: string | null; title: string | null; roomCode: string | null; pause: string | null; leave: string | null; retry: boolean; home: boolean; sessionHome: boolean }
export interface PlayState { endedAtMs: number | null }
export type PlayStep = 'continue' | 'done' | 'ended' | { fail: string };
export interface LiveDuelReport {
  hostBrowser: string; guestBrowser: string; playedMs: number; endedEarly: boolean; phases: { host: string; guest: string };
  samples: { host: PeerSample[][]; guest: PeerSample[][] }; relay: { host: string | null; guest: string | null }; pageErrors: string[]; problems: string[];
}

/** Playwright init script (runs before any page script, every document): RTCPeerConnection becomes a subclass that
 *  forces iceTransportPolicy 'relay' and keeps every instance in globalThis.__ftliteLive.peers. Installs once. */
export const RELAY_INIT_SCRIPT = `(() => {
  const g = globalThis, Native = g.RTCPeerConnection;
  if (typeof Native !== 'function' || g.__ftliteLive) return;
  const peers = [];
  class RelayPeerConnection extends Native {
    constructor(config, ...rest) { super(Object.assign({}, config || {}, { iceTransportPolicy: 'relay' }), ...rest); peers.push(this); }
    setConfiguration(config) { return super.setConfiguration(Object.assign({}, config || {}, { iceTransportPolicy: 'relay' })); }
  }
  Object.defineProperty(g, 'RTCPeerConnection', { value: RelayPeerConnection, writable: true, configurable: true });
  g.__ftliteLive = { peers };
})();`;

/** page.evaluate source: one PeerSample per kept connection; the selected pair from Chromium's transport stats, else
 *  Firefox's selected pair, else a nominated succeeded pair. null when the hook is missing. */
export const PEER_STATS_SOURCE = `(async () => {
  const live = globalThis.__ftliteLive;
  if (!live) return null;
  const out = [];
  for (const pc of live.peers.slice(-20)) {
    const sample = { state: pc.connectionState, policy: pc.getConfiguration().iceTransportPolicy || null, local: null, remote: null, bytesReceived: 0, bytesSent: 0 };
    out.push(sample);
    if (pc.connectionState !== 'connected') continue;
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach(s => { if (!pair && s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId) || null; });
    stats.forEach(s => { if (!pair && s.type === 'candidate-pair' && s.selected === true) pair = s; });
    stats.forEach(s => { if (!pair && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
    if (!pair) continue;
    const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
    sample.local = local ? local.candidateType : null; sample.remote = remote ? remote.candidateType : null;
    sample.bytesReceived = pair.bytesReceived || 0; sample.bytesSent = pair.bytesSent || 0;
  }
  return out;
})()`;

/** page.evaluate source: what the menu shows (Menu.tsx status line and title, SessionPage.tsx room code and buttons). */
export const UI_READ_SOURCE = `(() => {
  const text = id => { const el = document.querySelector('[data-testid="' + id + '"]'); return el ? (el.textContent || '').trim() : null; };
  return { status: text('status'), title: text('page-title'), roomCode: text('room-code'), pause: text('pause'), leave: text('leave'),
    retry: !!document.querySelector('[data-testid="retry"]'), home: !!document.querySelector('[data-testid="multiplayer"]'),
    sessionHome: !!document.querySelector('[data-testid="home"]') };
})()`;

const PHASES = ['idle', 'creating', 'joining', 'lobby', 'connecting', 'syncing', 'running', 'paused', 'reconnecting', 'saved', 'saving', 'rehosting', 'ended', 'error'];
/** The session page prints the phase name (menuMessage), the lobby its title; an error replaces the status with its
 *  text, and the session page's `home` button (shown only for phase idle or error, SessionPage.tsx) then marks it (L-9).
 *  Before the first status arrives the page prints "Connecting" and also shows `home` (status null), so that is not an error. */
export function uiPhase(v: UiView): string {
  if (v.title === 'Lobby') return 'lobby';
  const s = (v.status ?? '').replace(/…$/, '');
  if (PHASES.includes(s)) return s;
  if (s === 'Connecting') return 'connecting';
  if (v.retry || v.sessionHome || s.startsWith('Online stopped')) return 'error';
  if (v.home && s === 'Choose how to play.') return 'home';
  return 'other';
}
export function roomCodeOf(v: UiView): string | null {
  return v.roomCode === null ? null : v.roomCode.replace(/^ROOM\s+/, '').trim() || null;
}

/** One tick of the 60 s play (plan L-3); updates `state.endedAtMs` the first time one side reads ended. */
export function playStep(phases: { host: string; guest: string }, elapsedMs: number, state: PlayState): PlayStep {
  const { host, guest } = phases, hostEnded = host === 'ended', guestEnded = guest === 'ended';
  if (hostEnded && guestEnded) {
    const first = state.endedAtMs ?? elapsedMs;
    return first < MIN_EARLY_END_MS ? { fail: `the round ended after only ${first} ms (need ${MIN_EARLY_END_MS} for two relay samples)` } : 'ended';
  }
  if (hostEnded || guestEnded) {
    if ((hostEnded ? guest : host) !== 'running') return { fail: `the round ended on one side only: host ${host}, guest ${guest}` };
    state.endedAtMs ??= elapsedMs;
    const waited = elapsedMs - state.endedAtMs;
    return waited > END_AGREE_MS ? { fail: `only the ${hostEnded ? 'host' : 'guest'} reads ended (for ${waited} ms)` } : 'continue';
  }
  if (host === 'running' && guest === 'running') {
    if (state.endedAtMs !== null) return { fail: `a side came back from ended: host ${host}, guest ${guest}` };
    return elapsedMs >= LIVE_PLAY_MS ? 'done' : 'continue';
  }
  return { fail: `the duel left running during play: host ${host}, guest ${guest}` };
}

/** null when the samples prove TURN: two samples with a connected peer, every connected peer relay-only with a relay
 *  local candidate on its selected pair, and at least MIN_RELAY_BYTES received between the first and last of them. */
export function relayVerdict(samples: readonly (readonly PeerSample[])[]): string | null {
  const connected = samples.map(s => s.filter(p => p.state === 'connected')).filter(s => s.length > 0);
  if (connected.length < 2) return `only ${connected.length} sample(s) had a connected peer (need 2)`;
  for (const sample of connected) for (const p of sample) {
    if (p.policy !== 'relay') return `a peer connection ran with iceTransportPolicy ${p.policy}`;
    if (p.local !== 'relay') return `the selected candidate pair is local ${p.local}, not relay`;
  }
  const bytes = (s: readonly PeerSample[]): number => s.reduce((n, p) => n + p.bytesReceived, 0);
  const moved = bytes(connected[connected.length - 1]!) - bytes(connected[0]!);
  return moved < MIN_RELAY_BYTES ? `only ${moved} bytes arrived over the relay during play (need ${MIN_RELAY_BYTES})` : null;
}
