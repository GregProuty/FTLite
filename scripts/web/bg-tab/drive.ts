// TEST ONLY (web build spec §3.5): the in-browser orchestrator. The browser is started headed on this page with no
// automation attached (Playwright's Chromium focus emulation and Firefox's Juggler both force every page visible), and
// this page opens the other tabs itself: a visible baseline, then the sibling control tab and the test page hidden behind
// a cross-site foreground tab. It posts the raw measurements back to the driver's server.
import type { ControlMeasurement, PageMeasurement } from './protocol';

type Bg = Window['bgTab']; type Control = Window['bgControl'];
const params = new URLSearchParams(location.search);
const ws = params.get('ws') ?? '', front = params.get('front') ?? '';
const minutes = Number(params.get('minutes')), visibleSeconds = Number(params.get('visibleSeconds'));
const errors: string[] = [];
addEventListener('error', event => errors.push(String(event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
const log = (line: string) => { void fetch('./log', { method: 'POST', body: line }); };
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]).finally(() => clearTimeout(timer));
}
async function open<T>(url: string, read: (w: Window) => T | undefined): Promise<{ win: Window; api: T }> {
  const win = window.open(url, '_blank');
  if (!win) throw Error('window.open blocked: ' + url);
  for (let i = 0; i < 600; i++) {
    try { const api = read(win); if (api) return { win, api }; } catch { /* not navigated yet */ }
    await delay(50);
  }
  throw Error('tab never became ready: ' + url);
}
const query = `ws=${encodeURIComponent(ws)}`;
async function main(): Promise<{ visible: PageMeasurement; hidden: PageMeasurement; control: ControlMeasurement }> {
  const baseline = await open<Bg>(`./index.html?mode=visible&${query}`, w => (w as Window).bgTab);
  await withTimeout(baseline.api.ready, 30000, 'visible ready'); await delay(500);
  baseline.api.start(); await delay(visibleSeconds * 1000);
  const visible = await withTimeout(baseline.api.result(), 30000, 'visible result'); baseline.win.close();
  const control = await open<Control>('./control.html', w => (w as Window).bgControl);
  const test = await open<Bg>(`./index.html?mode=hidden&${query}`, w => (w as Window).bgTab);
  await withTimeout(test.api.ready, 30000, 'hidden ready');
  // A different site (localhost, not 127.0.0.1), so the foreground tab has its own renderer process.
  if (!window.open(front, '_blank')) throw Error('window.open blocked: ' + front);
  await delay(2000);
  control.api.start(); test.api.start();
  log(`hidden run started; ${minutes} minutes. Do not touch the browser window.`);
  await delay(minutes * 60000);
  const hidden = await withTimeout(test.api.result(), 30000, 'hidden result');
  const controlResult = control.api.result();
  return { visible, hidden, control: controlResult };
}
main().then(
  // Copy out of the other tabs' realms before posting.
  result => fetch('./report', { method: 'POST', body: JSON.stringify({ ...JSON.parse(JSON.stringify(result)), driveErrors: errors }) }),
  (error: unknown) => fetch('./report', { method: 'POST', body: JSON.stringify({ error: String((error as Error)?.stack ?? error), driveErrors: errors }) }));
