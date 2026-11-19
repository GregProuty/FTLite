// TEST ONLY (web build spec §8): one player of the browser network gate. A browser player is a Playwright page in its own
// context (its own IndexedDB and Web Lock) with the Web-i page probe and the duel observer injected before any page
// script; an Electron player is the built app through scripts/network/online-app-smoke.cjs. Every page call is bounded.
import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import electron from 'electron';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { OnlineStatus } from '../../../src/shared/onlineSession';

export type GateKey = 'KeyD' | 'KeyW' | 'KeyA' | 'KeyE' | 'Space' | 'Escape';
export interface GateView { status: OnlineStatus; observations: any[]; text: string }
/** ports: online-owned page MessagePorts still open; portsCreated: how many were created after counting was armed (before Host/Join). */
export interface GateCounts { workers: number; workerExits: number; workerErrors: number; ports: number; portsCreated: number }
export interface GatePlayer {
  readonly name: string;
  read(): Promise<GateView>;
  click(id: string): Promise<void>;
  type(id: string, text: string): Promise<void>;
  key(code: GateKey, down: boolean): Promise<void>;
  counts(): Promise<GateCounts>;
  /** Leave as a player would: a browser tab closes (through its leave prompt when `prompt`), Electron is killed. */
  close(options: { prompt: boolean }): Promise<{ prompted: boolean }>;
  /** Open the game again on the same saved data (the same browser context, the same Electron profile). */
  reopen(): Promise<void>;
  /** Browser only (review R1-F2): reload the tab in place; throws unless the online session exists again (the Web Lock was re-taken). */
  reload?(): Promise<void>;
  /** Browser only (review R2-F4): database ftlite's records/mirror-v1 decoded as mirrorStore.ts lays it out (magic at 0-7,
   *  header length uint32 LE at 8, JSON header at 12); null when nothing is stored. */
  storedMirror?(): Promise<StoredMirror | null>;
  dispose(): Promise<void>;
  readonly errors: string[];
  /** Electron only: console errors that are not uncaught exceptions (reported, not failed on). */
  readonly consoleErrors?: string[];
  /** Browser only (review R1-F3): every response or failed request to the service origin, as Playwright saw it (CORS hides them from page script). */
  readonly network: NetworkEntry[];
}
/** `source` 'playwright' is the page's request as Playwright saw it; 'cdp' is Chromium's own network log (DevTools protocol),
 *  which also shows a CORS preflight (`preflight: true`) and the CORS error that blocked a request. */
export interface NetworkEntry { method: string; path: string; status: number | null; origin: string | null; failure: string | null;
  source?: 'playwright' | 'cdp'; preflight?: boolean; corsError?: string | null }
export interface StoredMirror { magic: string; checkpointSequence: number | null; capturedTick: number | null }
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
export async function bounded<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timeout`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function ready(read: () => Promise<string>, label: string): Promise<void> {
  const end = performance.now() + 30000;
  while (performance.now() < end) { try { if ((await read()).includes('Single player')) return; } catch { /* still loading */ } await delay(100); }
  throw Error(`${label} ready timeout`);
}

export async function createBrowserPlayer(o: { browser: Browser; name: string; url: string; initScripts: string[]; serviceOrigin: string }): Promise<GatePlayer> {
  const context: BrowserContext = await o.browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const path of o.initScripts) await context.addInitScript({ path });
  const errors: string[] = [], network: NetworkEntry[] = [];
  const note = (entry: NetworkEntry): void => { if (network.length < 400) network.push(entry); };
  const service = (url: string): string | null => { try { const u = new URL(url); return u.origin === o.serviceOrigin ? u.pathname : null; } catch { return null; } };
  let page!: Page;
  const online = async (): Promise<void> => {
    await ready(() => bounded(page.evaluate(() => document.body.innerText), 4000, `${o.name} text`), o.name);
    // Only the tab holding ftlite-online builds the session the test probe exposes (Task 8).
    if (!(await bounded(page.evaluate(() => typeof (window as any).__ftliteOnlineTest === 'object'), 4000, `${o.name} probe`))) throw Error(`${o.name} has no online session (Web Lock not taken)`);
  };
  const open = async (): Promise<void> => {
    page = await context.newPage();
    page.on('pageerror', error => { if (errors.length < 20) errors.push(String(error.message).slice(0, 200)); });
    page.on('response', response => { const r = response.request(), path = service(r.url()); if (path === null) return;
      void r.allHeaders().then(h => note({ method: r.method(), path, status: response.status(), origin: h.origin ?? null, failure: null, source: 'playwright' }), () => {}); });
    page.on('requestfailed', r => { const path = service(r.url()); if (path === null) return;
      void r.allHeaders().then(h => h.origin ?? null, () => null).then(origin => note({ method: r.method(), path, status: null, origin, failure: r.failure()?.errorText ?? 'failed', source: 'playwright' })); });
    if (o.browser.browserType().name() === 'chromium') {
      // Chromium hides a refused preflight from Playwright's request events (the POST only fails with net::ERR_FAILED and
      // no Origin among its provisional headers); its DevTools log has the preflight, its status and the CORS error.
      const cdp = await bounded(context.newCDPSession(page), 6000, `${o.name} cdp`);
      const seen = new Map<string, NetworkEntry>(), header = (h: Record<string, unknown> | undefined) => {
        const v = h && Object.entries(h).find(([k]) => k.toLowerCase() === 'origin')?.[1]; return typeof v === 'string' ? v : null; };
      const entry = (id: string, url?: string, method?: string, preflight = false): NetworkEntry | undefined => {
        let e = seen.get(id); if (e || url === undefined) return e;
        const path = service(url); if (path === null) return undefined;
        e = { method: method ?? 'GET', path, status: null, origin: null, failure: null, source: 'cdp', preflight, corsError: null };
        if (seen.size < 400) { seen.set(id, e); note(e); } return e;
      };
      cdp.on('Network.requestWillBeSent', (e: any) => { const x = entry(e.requestId, e.request.url, e.request.method, e.type === 'Preflight' || e.request.method === 'OPTIONS'); if (x) x.origin ??= header(e.request.headers); });
      cdp.on('Network.requestWillBeSentExtraInfo', (e: any) => { const x = seen.get(e.requestId); if (x) x.origin ??= header(e.headers); });
      cdp.on('Network.responseReceived', (e: any) => { const x = entry(e.requestId, e.response.url, e.response.requestHeaders?.[':method'], e.type === 'Preflight'); if (x) { x.status ??= e.response.status; x.origin ??= header(e.response.requestHeaders); } });
      cdp.on('Network.responseReceivedExtraInfo', (e: any) => { const x = seen.get(e.requestId); if (x) x.status ??= e.statusCode; });
      cdp.on('Network.loadingFailed', (e: any) => { const x = seen.get(e.requestId); if (x) { x.failure = e.errorText ?? 'failed'; x.corsError = e.corsErrorStatus?.corsError ?? null; } });
      await bounded(cdp.send('Network.enable'), 6000, `${o.name} cdp network`);
    }
    await bounded(page.goto(o.url), 30000, `${o.name} load`);
    await online();
  };
  await open();
  return {
    name: o.name, errors, network,
    async reload() { await bounded(page.reload(), 30000, `${o.name} reload`); await online(); },
    storedMirror: () => bounded(page.evaluate(async () => {
      // No version: open whatever version the page made (2 after Task 9), so this never triggers an upgrade.
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('ftlite'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try {
        if (!db.objectStoreNames.contains('records')) return null;
        const value = await new Promise<unknown>((resolve, reject) => { const q = db.transaction('records', 'readonly').objectStore('records').get('mirror-v1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
        if (!(value instanceof Uint8Array) || value.length < 12) return null;
        const magic = new TextDecoder().decode(value.subarray(0, 8));
        if (magic !== 'FTLNMIR1') return { magic, checkpointSequence: null, capturedTick: null };
        const length = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(8, true);
        const header = JSON.parse(new TextDecoder().decode(value.subarray(12, 12 + length))) as { committed: { metadata: { checkpointSequence: number; capturedTick: number } } | null };
        return { magic, checkpointSequence: header.committed?.metadata.checkpointSequence ?? null, capturedTick: header.committed?.metadata.capturedTick ?? null };
      } finally { db.close(); }
    }), 6000, `${o.name} stored mirror`),
    read: () => bounded(page.evaluate(async () => { const w = window as any;
      return { status: (await w.__ftliteOnlineTest.readStatus()).status, observations: w.onlineAppObservation(), text: document.body.innerText }; }), 4000, `${o.name} read`),
    async click(id) {
      await bounded(page.evaluate(() => (window as any).onlineProbe.set({ countPorts: true })), 4000, `${o.name} arm ports`);
      await bounded(page.click(`[data-testid="${id}"]`, { timeout: 5000 }), 6000, `${o.name} click ${id}`);
    },
    async type(id, text) { await bounded(page.fill(`[data-testid="${id}"]`, text, { timeout: 5000 }), 6000, `${o.name} type ${id}`); },
    async key(code, down) {
      await bounded(page.bringToFront(), 4000, `${o.name} front`);
      await bounded(page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()), 4000, `${o.name} blur`);
      await bounded(down ? page.keyboard.down(code) : page.keyboard.up(code), 4000, `${o.name} key ${code}`);
    },
    counts: () => bounded(page.evaluate(() => { const c = (window as any).onlineProbe.counts(); return { workers: c.workers, workerExits: c.workerExits, workerErrors: c.workerErrors, ports: c.ports, portsCreated: c.observedPagePorts }; }), 4000, `${o.name} counts`),
    async close({ prompt }) {
      if (!prompt) { await bounded(page.close(), 10000, `${o.name} close`); return { prompted: false }; }
      let prompted = false;
      page.once('dialog', dialog => { prompted = dialog.type() === 'beforeunload'; void dialog.accept(); });
      const closed = page.waitForEvent('close', { timeout: 10000 });
      await bounded(page.close({ runBeforeUnload: true }), 10000, `${o.name} close`);
      await closed;
      return { prompted };
    },
    reopen: open,
    async dispose() { await bounded(context.close(), 10000, `${o.name} dispose`).catch(() => {}); }
  };
}

/** The Electron driver's key names (online-app-smoke.cjs sends them to sendInputEvent). */
export function electronKey(code: GateKey): string { return code.startsWith('Key') ? code.slice(3) : code; }

export async function createElectronPlayer(o: { name: string; directory: string; serviceUrl: string; duelTestSeed: number }): Promise<GatePlayer> {
  const errors: string[] = [], consoleErrors: string[] = [];
  let child!: ChildProcess, exited = true, exit: Promise<void> = Promise.resolve();
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>(); let id = 0;
  const request = (command: string, data: object = {}): Promise<any> => {
    if (exited || !child.connected) return Promise.reject(Error(`${o.name} IPC disconnected`));
    return new Promise((resolveRequest, reject) => {
      const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`${o.name} ${command} driver timeout`)); }, 8000);
      pending.set(key, { resolve: resolveRequest, reject, timer });
      try { child.send({ ...data, requestId: key, command }); } catch { pending.delete(key); clearTimeout(timer); reject(Error(`${o.name} IPC disconnected`)); }
    });
  };
  const launch = async (): Promise<void> => {
    if (typeof electron !== 'string') throw Error('Electron executable missing');
    const env: NodeJS.ProcessEnv = { ...process.env, FTL_DEBUG: '1', FTLITE_LOCAL_SERVICE_URL: o.serviceUrl, FTLITE_DUEL_TEST_SEED: String(o.duelTestSeed), FTLITE_ONLINE_TEST_PROBE: '1', NODE_PATH: resolve('node_modules') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CHROME_CRASHPAD_PIPE_NAME; delete env.ELECTRON_RENDERER_URL; delete env.FTLITE_SECTOR_ONLINE_TEST;
    child = spawn(electron, [resolve('scripts/network/online-app-smoke.cjs'), `--online-app-dir=${o.directory}`, '--online-app-role=guest', `--user-data-dir=${join(o.directory, 'guest')}`],
      { env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    exited = false;
    child.on('message', (message: any) => { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(Error(`app-driver-command-failed (${message.command}: ${message.reason})`)) : item.resolve(message.result); });
    if (process.env.FTLITE_WEB_NET_DEBUG) child.stderr!.pipe(process.stderr);
    child.stdout!.resume();
    // FTL_DEBUG (always set for this child) makes the driver print each console error's text. An uncaught page exception
    // ('Uncaught ...', what Playwright's pageerror reports for a browser player) or a driver exception is an error; any other
    // console error (a refused fetch, Chromium's ResizeObserver loop notice) is only kept for the report.
    let buffered = '';
    child.stderr!.on('data', (chunk: Buffer) => {
      const lines = (buffered + String(chunk)).split(/\r?\n/); buffered = lines.pop()!.slice(-4000);
      for (const line of lines) {
        const consoleError = /^DBG console (?:error|3) (.*)$/.exec(line);
        if (consoleError && /^Uncaught\b/.test(consoleError[1]!)) { if (errors.length < 20) errors.push(consoleError[1]!.slice(0, 200)); }
        else if (consoleError) { if (consoleErrors.length < 20) consoleErrors.push(consoleError[1]!.slice(0, 200)); }
        else if (/APP_DRIVER_UNCAUGHT/.test(line) && errors.length < 20) errors.push(line.trim().slice(0, 200));
      }
    });
    exit = new Promise(done => child.once('exit', () => { exited = true; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(`${o.name} exited`)); } pending.clear(); done(); }));
    await ready(async () => (await request('status')).text, o.name);
  };
  const kill = async (): Promise<void> => {
    if (!exited) {
      if (process.platform === 'win32') await new Promise<void>(done => { const c = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); c.once('error', () => done()); c.once('exit', () => done()); });
      else child.kill('SIGKILL');
    }
    await Promise.race([exit, delay(5000)]);
  };
  await launch();
  return {
    name: o.name, errors, consoleErrors, network: [],   // Electron's file:// page is not watched; only the browser host matters to the injection
    async read() { const r = await request('status'); return { status: r.status, observations: r.observations, text: r.text }; },
    async click(target) {
      // Playwright's page.click waits up to 5 s for the control to be there and enabled; the driver refuses at once, so
      // retry its refusal for the same 5 s (parity with the browser players), then name the control. Only 'command-failed'
      // is retried (the control was missing or disabled, nothing was sent); a delivered or misdirected click never is.
      const end = performance.now() + 5000;
      for (;;) {
        try { await request('click', { id: target }); return; }
        catch (error) { if (!/\(click: command-failed\)$/.test(String((error as Error).message)) || performance.now() >= end) throw Error(`${o.name} click ${target}: ${(error as Error).message}`); }
        await delay(150);
      }
    },
    async type(target, text) { await request('type', { id: target, text }); },
    async key(code, down) { await request('key', { key: electronKey(code), down }); },
    async counts() { const r = await request('resource-counts'); const w = r.workers as { exited: boolean; errored: boolean }[];
      return { workers: w.length, workerExits: w.filter(x => x.exited).length, workerErrors: w.filter(x => x.errored).length, ports: r.ports, portsCreated: r.portsCreated }; },
    async close() { await kill(); return { prompted: false }; },   // Electron has no leave prompt (spec §3.3); the gate kills it as duel-app does
    reopen: launch,
    async dispose() { if (!exited) { try { await Promise.race([request('shutdown'), delay(6000)]); } catch { /* forced below */ } } await kill(); }
  };
}
