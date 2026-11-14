// Local smoke runner only: real renderer, keyboard plus a clearly labelled virtual gamepad.
const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const output = resolve('.superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs');
app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir'));
const sleep = ms => new Promise(done => setTimeout(done, ms));
const deadline = setTimeout(() => { console.error('UI smoke timeout'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 1280, height: 720, useContentSize: true, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(60);
  const cdp = win.webContents.debugger; cdp.attach('1.3');
  const send = (method, params = {}) => cdp.sendCommand(method, params);
  const errors = [], scripts = []; let paused;
  cdp.on('message', (_, method, params) => {
    if (method === 'Runtime.exceptionThrown') errors.push(params.exceptionDetails);
    if (method === 'Debugger.scriptParsed') scripts.push(params);
    if (method === 'Debugger.paused') paused?.(params);
  });
  // Start navigation before awaiting renderer-domain commands: a hidden window
  // has no initialized renderer to answer them until its first navigation.
  await win.loadURL(process.argv[2]);
  await send('Runtime.enable'); await send('Debugger.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const key = async (code, duration = 120) => {
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)}}))`); await sleep(duration);
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)}}))`); await sleep(150);
  };
  const shot = async name => { const image = await win.webContents.capturePage(); writeFileSync(join(output, `ui-${name}.png`), image.toPNG()); };
  async function inspect(mutate = false) {
    const script = scripts.find(s => s.url.includes('/authority/core.ts'));
    if (!script) throw Error('authority script unavailable');
    const { scriptSource } = await send('Debugger.getScriptSource', { scriptId: script.scriptId });
    const lineNumber = scriptSource.split('\n').findIndex(line => line.includes('function publishCompletedState(')) + 1;
    const wait = new Promise(done => { paused = done; });
    const bp = await send('Debugger.setBreakpoint', { location: { scriptId: script.scriptId, lineNumber } });
    const pause = await wait; await send('Debugger.removeBreakpoint', { breakpointId: bp.breakpointId });
    const result = await send('Debugger.evaluateOnCallFrame', { callFrameId: pause.callFrames[0].callFrameId, expression: `(()=>{${mutate ? 'state.hull=0;' : ''}return {tick:state.tick,ship:state.layout.id,players:state.playerCount,runId:deps.init.runId,hull:state.hull}})()`, returnByValue: true });
    await send('Debugger.resume'); paused = undefined;
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  }
  await sleep(1000);
  if (await evaluate('document.querySelectorAll("canvas").length') !== 1) throw Error('game canvas did not load');
  await shot('lobby'); await key('KeyE');
  await evaluate(`window.__testPad={index:0,id:'Virtual determinism smoke pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__testPad]});window.__testPad.buttons[0].pressed=true`);
  await sleep(150); await evaluate('window.__testPad.buttons[0].pressed=false'); await sleep(150);
  await shot('joined'); await key('KeyF'); await sleep(500);
  const first = await inspect(); if (first.ship !== 'skiff' || first.players !== 2) throw Error(`wrong couch setup ${JSON.stringify(first)}`);
  await key('KeyD', 350); await evaluate('window.__testPad.axes[0]=.6;window.__testPad.axes[1]=.8'); await sleep(350);
  await evaluate('window.__testPad.axes.fill(0)'); await shot('couch-running');
  await evaluate("window.dispatchEvent(new Event('blur'))"); await sleep(200); await shot('paused');
  await evaluate("window.dispatchEvent(new Event('focus'))"); await key('KeyF'); await sleep(200);
  await inspect(true); await sleep(400); await shot('gameover');
  const records = await evaluate("JSON.parse(localStorage.getItem('ftlite-telemetry') ?? '[]').length");
  if (records !== 1) throw Error(`completion was not stored exactly once: ${records}`);
  await key('KeyF'); await shot('restart-lobby'); await key('KeyF'); await sleep(400);
  const second = await inspect(); await shot('restarted');
  if (first.runId === second.runId || second.hull !== 100 || second.players !== 2 || errors.length) throw Error(JSON.stringify({ first, second, errors }));
  const result = { engine: process.versions, first, second, telemetryRecords: records, errors, input: 'keyboard plus virtual gamepad; physical hardware NOT RUN' };
  writeFileSync(join(output, 'ui-smoke.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });
