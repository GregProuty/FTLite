// Web-iii live smoke, the duel (web build spec §8 "The live check"): a Chromium host and a Firefox guest (a second
// Chromium context when Firefox is not installed, plan L-7) open the live site, pass the passcode form as a friend
// would, host and join by code through the real menu with TURN forced (plan L-1), play 60 s (L-3) and leave. Relay is
// proven from getStats (L-2). Not run in CI: it needs the owner's live deploy and passcode.
import { chromium, firefox, type Browser, type BrowserContext, type Page } from 'playwright';
import { WRONG_PASSCODE_TEXT } from '../../../src/web/passcode';
import { bounded, type GateKey } from '../net/players';
import { clip } from './headers';
import { PEER_STATS_SOURCE, playStep, RELAY_INIT_SCRIPT, RELAY_SAMPLE_MS, relayVerdict, roomCodeOf, UI_READ_SOURCE, uiPhase,
  type LiveDuelReport, type PeerSample, type PlayState, type UiView } from './relay';

/** Plan L-7: only Playwright's missing-browser error means "Firefox not installed". */
const FIREFOX_MISSING = /Executable doesn't exist|npx playwright install/;

interface LivePlayer { readonly name: string; readonly page: Page; readonly context: BrowserContext; readonly errors: string[] }
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const read = (p: LivePlayer): Promise<UiView> => bounded(p.page.evaluate<UiView>(UI_READ_SOURCE), 4000, `${p.name} read`);
const stats = async (p: LivePlayer): Promise<PeerSample[]> => (await bounded(p.page.evaluate<PeerSample[] | null>(PEER_STATS_SOURCE), 6000, `${p.name} stats`)) ?? [];
const click = (p: LivePlayer, id: string, timeout = 5000): Promise<void> =>
  bounded(p.page.click(`[data-testid="${id}"]`, { timeout }), timeout + 1000, `${p.name} click ${id}`);
const type = (p: LivePlayer, id: string, text: string): Promise<void> =>
  bounded(p.page.fill(`[data-testid="${id}"]`, text, { timeout: 5000 }), 6000, `${p.name} type ${id}`);
/** Web-ii players.ts key(): the tab in front, nothing focused, then the key held for `ms`. */
async function press(p: LivePlayer, code: GateKey, ms: number): Promise<void> {
  await bounded(p.page.bringToFront(), 4000, `${p.name} front`);
  await bounded(p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()), 4000, `${p.name} blur`);
  await bounded(p.page.keyboard.down(code), 4000, `${p.name} key ${code}`);
  await delay(ms);
  await bounded(p.page.keyboard.up(code), 4000, `${p.name} key ${code}`);
}
async function until(p: LivePlayer, ok: (phase: string, view: UiView) => boolean, label: string, ms: number): Promise<UiView> {
  const end = performance.now() + ms;
  let last: UiView | null = null;
  while (performance.now() < end) {
    const v = await read(p); last = v;
    const phase = uiPhase(v);
    if (ok(phase, v)) return v;
    if (phase === 'error') throw Error(`${p.name} ${label}: online error (${v.status})`);
    await delay(250);
  }
  throw Error(`${p.name} ${label} timeout (last status: ${last?.status ?? 'none'})`);
}

async function openPlayer(browser: Browser, name: string, url: string, passcode: string): Promise<LivePlayer> {
  const context = await bounded(browser.newContext({ viewport: { width: 1280, height: 800 } }), 15000, `${name} context`);
  await bounded(context.addInitScript({ content: RELAY_INIT_SCRIPT }), 4000, `${name} relay hook`);
  const page = await bounded(context.newPage(), 15000, `${name} page`), errors: string[] = [];
  page.on('pageerror', error => { if (errors.length < 20) errors.push(clip(String(error.message), [passcode], 200)); });
  const player: LivePlayer = { name, page, context, errors };
  const first = await bounded(page.goto(`${url}/`), 30000, `${name} load`);
  if (first?.status() !== 401) throw Error(`${name}: the site answered ${first?.status() ?? 'nothing'} before the passcode (expected 401)`);
  await bounded(page.fill('#code', passcode, { timeout: 5000 }), 6000, `${name} passcode field`);
  await bounded(page.click('button[type="submit"]', { timeout: 5000 }), 6000, `${name} passcode submit`);
  const end = performance.now() + 30000;
  for (;;) {
    const v = await read(player).catch(() => null);   // the form posts and redirects: a read can land mid-navigation
    if (v?.home) break;
    const text = await bounded(page.evaluate(() => document.body?.innerText ?? ''), 4000, `${name} text`).catch(() => '');
    if (text.includes(WRONG_PASSCODE_TEXT)) throw Error(`${name}: the passcode was refused (${WRONG_PASSCODE_TEXT})`);
    if (performance.now() > end) throw Error(`${name}: the menu did not appear after the passcode`);
    await delay(250);
  }
  if (!(await bounded(page.evaluate(() => typeof (globalThis as any).__ftliteLive === 'object'), 4000, `${name} relay check`)))
    throw Error(`${name}: the relay hook did not load, so TURN would not be forced`);
  return player;
}

export async function runLiveDuel(o: { url: string; passcode: string; step(label: string): void; aborted(): boolean }): Promise<LiveDuelReport> {
  const browsers: Browser[] = [], contexts: BrowserContext[] = [];
  try {
    o.step('browsers');
    const chrome = await bounded(chromium.launch({ headless: true }), 60000, 'chromium launch'); browsers.push(chrome);
    let fox: Browser | null = null;
    try { fox = await bounded(firefox.launch({ headless: true }), 60000, 'firefox launch'); browsers.push(fox); }
    catch (error) {
      const text = String((error as Error)?.message ?? error);
      if (!FIREFOX_MISSING.test(text)) throw Error(`firefox launch failed (not a missing install): ${clip(text, [o.passcode], 300)}`);
      fox = null;
    }
    o.step('passcode');
    const host = await openPlayer(chrome, 'chromium-host', o.url, o.passcode); contexts.push(host.context);
    const guest = await openPlayer(fox ?? chrome, `${fox ? 'firefox' : 'chromium'}-guest`, o.url, o.passcode); contexts.push(guest.context);

    o.step('host and join');
    await click(host, 'multiplayer'); await click(host, 'host'); await click(host, 'crew-2'); await click(host, 'create-room');
    const lobby = await until(host, phase => phase === 'lobby', 'lobby', 20000);
    const code = roomCodeOf(lobby);
    if (!code) throw Error(`${host.name}: no room code in the lobby`);
    await click(guest, 'multiplayer'); await click(guest, 'join'); await type(guest, 'join-code', code); await click(guest, 'join-room');
    await until(guest, phase => phase === 'lobby', 'lobby', 20000);
    await click(host, 'ready'); await click(guest, 'ready');
    await click(host, 'start', 15000);   // Playwright waits for Start to be enabled (both ready)
    await until(host, phase => phase === 'running', 'running', 30000); await until(guest, phase => phase === 'running', 'running', 30000);

    o.step('play 60 s');
    const began = performance.now(), samples = { host: [] as PeerSample[][], guest: [] as PeerSample[][] };
    const sample = async (): Promise<void> => { samples.host.push(await stats(host)); samples.guest.push(await stats(guest)); };
    await sample();
    // The duel smoke's routes (best effort: a production page exposes no seat state): host to Weapons, guest to the Helm, then thrust.
    for (const [key, ms] of [['KeyD', 3000], ['KeyW', 1500], ['KeyA', 300], ['KeyE', 120]] as const) await press(host, key, ms);
    for (const [key, ms] of [['KeyD', 3000], ['KeyE', 120], ['KeyW', 2000]] as const) await press(guest, key, ms);
    const play: PlayState = { endedAtMs: null };
    let endedEarly = false, nextSample = began + RELAY_SAMPLE_MS, phases = { host: 'running', guest: 'running' };
    for (;;) {
      if (o.aborted()) throw Error('launcher timeout');
      phases = { host: uiPhase(await read(host)), guest: uiPhase(await read(guest)) };
      const next = playStep(phases, performance.now() - began, play);   // plan L-3, unit-tested in relay.ts
      if (typeof next === 'object') throw Error(next.fail);
      if (next === 'ended') { endedEarly = true; break; }
      if (next === 'done') break;
      if (performance.now() >= nextSample) { await sample(); nextSample += RELAY_SAMPLE_MS; }
      await delay(1000);
    }
    if (!endedEarly) await sample();
    const playedMs = Math.round(performance.now() - began);

    o.step('leave');
    await click(guest, 'leave'); await until(guest, (phase, v) => v.home || phase === 'idle', 'left', 20000);
    await click(host, 'leave'); await until(host, (phase, v) => v.home || phase === 'idle', 'left', 20000);

    const relay = { host: relayVerdict(samples.host), guest: relayVerdict(samples.guest) };
    const pageErrors = [...host.errors, ...guest.errors];
    const problems = [...(relay.host ? [`host relay: ${relay.host}`] : []), ...(relay.guest ? [`guest relay: ${relay.guest}`] : []),
      ...(pageErrors.length ? [`page errors: ${pageErrors.slice(0, 3).join(' | ')}`] : [])];
    return { hostBrowser: 'chromium', guestBrowser: fox ? 'firefox' : 'chromium (Firefox not installed)', playedMs, endedEarly, phases, samples, relay, pageErrors, problems };
  } finally {
    for (const c of contexts) await bounded(c.close(), 10000, 'context close').catch(() => {});
    for (const b of browsers) await b.close().catch(() => {});
  }
}
