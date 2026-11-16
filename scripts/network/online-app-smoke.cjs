// TEST ONLY executable wrapper. Loads the unchanged compiled production app.
const electron = require('electron');
const { app, BrowserWindow, utilityProcess, ipcMain, powerMonitor } = electron;
process.on('uncaughtException',()=>{console.error('APP_DRIVER_UNCAUGHT');app.exit(1);});
const { resolve, join, sep } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const clickVerified = require('./online-app-click.cjs');
const directory = app.commandLine.getSwitchValue('online-app-dir');
const role = app.commandLine.getSwitchValue('online-app-role');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (app.isPackaged || !directory || !['host', 'guest', 'filler', 'incompatible'].includes(role)
  || resolve(profile) !== resolve(directory, role) || !resolve(profile).startsWith(resolve(directory) + sep)) throw Error('isolated test profile required');
app.setPath('userData', profile);
app.disableHardwareAcceleration();
// Multiple real app windows in automation must not be treated as occluded by the
// harness terminal. Focus/blur still use native window focus and production guards.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const windows = [], utilities = [], channels = [], nativeClosed = new Map();
const mirrorReceipts = [];
const recovery = { gets: [], puts: [], restores: [], captures: [], phases: [], invalidations: [], clicks: [], heldUploads: 0 };
let holdUploads = false, holdRestore = false, restoreRelease, blockNextGrant = false;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function checkpointProof(bytes) {
  const b = Buffer.from(bytes), cp = JSON.parse(b.toString());
  return { payloadSha256: hash(b), runId: cp.init.runId, tick: cp.snapshot.header.tick, phase: cp.phase,
    commandHighWater: cp.commandHighWater, heldHighWater: cp.heldHighWater, botMemoryHash: hash(JSON.stringify(cp.botControllers)), botMemory:cp.botControllers,
    reconciledBotMemory:require(join(directory,'observer/utility.cjs')).reconciledMemory(cp), snapshotHash: hash(JSON.stringify(cp.snapshot)) };
}
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const checkpoint = new URL(url).pathname.endsWith('/checkpoint');
  if (checkpoint && init?.method === 'PUT' && holdUploads) {
    recovery.heldUploads++; recovery.pending = checkpointProof(init.body);
    await new Promise((_, reject) => { const abort = () => reject(Error('held-upload-aborted')); if(init.signal?.aborted) abort(); else init.signal?.addEventListener('abort', abort, { once: true }); });
  }
  const response = await nativeFetch(url, init);
  if (checkpoint && response.ok) {
    if(init?.method === 'PUT') recovery.puts.push(checkpointProof(init.body));
    else {
      const proof = checkpointProof(await response.clone().arrayBuffer()); recovery.gets.push(proof);
      if(holdRestore) { holdRestore=false; await new Promise(done => { restoreRelease=done; }); }
    }
  }
  return response;
};
let visible, stopping = false, delayNextTransport = false;
const originalChannel = electron.MessageChannelMain;
// Electron exports nonconfigurable constructors. Observe the native port methods
// instead; this probe pair is closed before instrumentation and excluded below.
const probe = new originalChannel(), portPrototype=Object.getPrototypeOf(probe.port1);
probe.port1.close();probe.port2.close();
function track(port) {
  let record=channels.find(c=>c.port===port);
  if(!record){record={port,released:false};channels.push(record);port.once('close',()=>{record.released=true;});}
  return record;
}
for(const method of ['start','postMessage','close']) {
  const original=portPrototype[method];
  portPrototype[method]=function(...args){const record=track(this);const result=original.apply(this,args);if(method==='close')record.released=true;return result;};
}
function transferred(ports) { for (const port of ports ?? []) track(port).released=true; }
const fork = utilityProcess.fork;
utilityProcess.fork = (...args) => {
  if(app.commandLine.hasSwitch('recovery-observe-utility')) args=[resolve(__dirname,'online-recovery-utility.cjs'),[join(directory,'observer/utility.cjs'),join(directory,`${role}-utility-${utilities.length}.json`),args[0]],args[2]];
  const child = fork(...args), record = { child, exited: false, pid: null, producerChanges: [] }; utilities.push(record);
  child.once('spawn', () => { record.pid = child.pid; });
  child.once('exit', () => { record.exited = true; });
  child.on('message', message => {
    if (message?.kind !== 'checkpoint') return;
    const candidate = message.candidate;
    if(candidate?.bytes) { recovery.captures.push({ cause: candidate.cause, ...checkpointProof(candidate.bytes) }); if(recovery.captures.length>64) recovery.captures.shift(); }
    if (candidate?.cause === 'initial' && candidate.capturedTick === 0) record.initialCaptureTick = 0;
    if (candidate?.cause === 'periodic' && candidate.capturedTick === 300) record.periodicCapturedTick = 300;
  });
  const post = child.postMessage.bind(child);
  child.postMessage = (message, ports) => {
    const delayedGrant=message?.kind === 'lease-grant' && blockNextGrant;
    if(message?.kind === 'lease-grant' && blockNextGrant) {
      blockNextGrant=false; const started=performance.now();
      writeFileSync(join(directory,`${role}-block.json`),JSON.stringify({startedEpochMs:Date.now(),pid:process.pid,utilityPid:record.pid,lastPut:recovery.puts.at(-1)}));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25000);
      recovery.mainBlockedMs=performance.now()-started;
    }
    if (message?.kind === 'initialize') { record.runId = message.sessionLease?.runId; record.utilityEpoch = message.sessionLease?.utilityEpoch; record.hostGeneration = message.hostGeneration; }
    if (message?.kind === 'command' && message.command?.kind === 'restore') recovery.restores.push(checkpointProof(message.command.checkpointBytes));
    if (message?.kind === 'lease-invalidate') recovery.invalidations.push(message.reason);
    if (message?.kind === 'bootstrap-complete') record.bootstrapAfterCommit = record.initialCaptureTick === 0
      && mirrorReceipts.some(m => m.runId === record.runId && m.capturedTick === 0);
    // Only lifecycle kind and logical seat, never credentials or payload bytes.
    if (message?.kind === 'command') record.producerChanges.push({ kind: message.command?.kind, seatId: message.command?.seatId, player: message.command?.player, human: message.command?.human });
    const result=post(message, ports);transferred(ports);
    // Keep main's queued timeout/teardown callbacks blocked until the old utility
    // has independently examined the deliberately late real-service reply.
    if(delayedGrant) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);
    return result;
  };
  return child;
};
app.on('browser-window-created', (_, window) => {
  const hidden = !!visible; if (!visible) visible = window;
  const diagnosticContext={role,page:hidden?'transport':'application'};
  if (!hidden && typeof window.webContents.send === 'function') {
    const send = window.webContents.send.bind(window.webContents);
    window.webContents.send = (channel, value) => {
      const m = channel === 'online:status' && value?.status?.mirror?.committed;
      if(channel === 'online:status' && recovery.phases.at(-1) !== value?.status?.phase) recovery.phases.push(value.status.phase);
      if (m && !mirrorReceipts.some(old => old.runId === m.runId && old.hostGeneration === m.hostGeneration && old.checkpointSequence === m.checkpointSequence)) {
        mirrorReceipts.push({ runId: m.runId, hostGeneration: m.hostGeneration, checkpointSequence: m.checkpointSequence, capturedTick: m.capturedTick, payloadSha256: m.payloadSha256 });
        if (mirrorReceipts.length > 64) mirrorReceipts.shift();
      }
      return send(channel, value);
    };
  }
  window.webContents.on('preload-error', () => console.error('APP_PRELOAD_ERROR',diagnosticContext));
  window.webContents.on('console-message', details => { if (details.level === 'error') console.error('APP_PAGE_ERROR',diagnosticContext); });
  const record = { window, hidden, closed: false }; windows.push(record);
  window.once('closed', () => { record.closed = true; });
  const originalLoad = window.loadFile.bind(window);
  window.loadFile = async (...args) => {
    // Owners await load() before attempts; UI cannot act until driver readiness.
    // Instrument only after actual app load, avoiding an extra preload lifecycle.
    await originalLoad(...args);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    if(hidden) {
      await window.webContents.debugger.sendCommand('Runtime.addBinding',{name:'onlineNativeClosed'});
      window.webContents.debugger.on('message',(_,method,params)=>{if(method==='Runtime.bindingCalled'&&params.name==='onlineNativeClosed') nativeClosed.set(record,JSON.parse(params.payload));});
    }
    await window.webContents.executeJavaScript(hidden ? `(${observeNative.toString()})();
      window.RTCPeerConnection = new Proxy(window.RTCPeerConnection,{construct(Target,args){const pc=Reflect.construct(Target,args),close=pc.close.bind(pc);pc.close=()=>{close();window.rtcNative.status().then(s=>window.onlineNativeClosed(JSON.stringify(s)));};return pc;}}); void 0;`
      : readFileSync(join(directory, 'observer/observer.js'), 'utf8'));
    const post = window.webContents.mainFrame.postMessage.bind(window.webContents.mainFrame);
    window.webContents.mainFrame.postMessage = (channel, message, ports) => { const result=post(channel,message,ports);transferred(ports);return result; };
    const postContents=window.webContents.postMessage.bind(window.webContents);
    window.webContents.postMessage=(channel,message,ports)=>{const result=postContents(channel,message,ports);transferred(ports);return result;};
    if(hidden && delayNextTransport) { delayNextTransport=false; await delay(1200); }
  };
  // Capture actual native cleanup immediately before the owner destroys its page.
  const destroy = window.destroy.bind(window);
  window.destroy = () => {
    if (hidden && !window.isDestroyed()) {
      void window.webContents.executeJavaScript('window.rtcNative?.status()').then(value => nativeClosed.set(record,value)).catch(() => {});
    }
    destroy();
  };
});
const js = source => visible.webContents.executeJavaScript(source);
const delay = ms => new Promise(done => setTimeout(done, ms));
async function click(id) {
  const attempts=await clickVerified({
    prepare:async()=>{
      visible.focus();
      return js(`(() => { const id=${JSON.stringify(id)}, e=document.querySelector('[data-testid="'+id+'"]'); if(!e||e.disabled) throw Error('unavailable control');
        window.onlineDriverHit='miss'; const listener=event=>{const target=event.target.closest?.('[data-testid]'); window.onlineDriverHit=target?.dataset.testid===id?'target':event.target.closest?.('button,input,select')?'other':'miss';};
        window.onlineDriverClickListener=listener;document.addEventListener('click',listener,true);
        const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    },
    send:point=>{visible.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});visible.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});},
    settle:()=>delay(60),
    observed:()=>js(`(() => {document.removeEventListener('click',window.onlineDriverClickListener,true);delete window.onlineDriverClickListener;return window.onlineDriverHit;})()`)
  });
  recovery.clicks.push({id,attempts});if(recovery.clicks.length>64)recovery.clicks.shift();
}
async function command(message) {
  switch (message.command) {
    case 'status': return { ...await js(`(async () => ({status:(await window.ftlite.online.readStatus()).status, observations:window.onlineAppObservation(), keys:window.onlineAppKeys, text:document.body.innerText, hidden:document.hidden, focused:document.hasFocus()}))()`),electron:process.versions.electron,
      recovery, mirrorProof: { receipts: mirrorReceipts, utilities: utilities.map(({ runId, utilityEpoch, hostGeneration, initialCaptureTick, periodicCapturedTick, bootstrapAfterCommit }) => ({ runId, utilityEpoch, hostGeneration, initialCaptureTick, periodicCapturedTick, bootstrapAfterCommit })) } };
    case 'hold-upload': holdUploads=true; return true;
    case 'block-next-grant': blockNextGrant=true; return true;
    case 'hold-restore': holdRestore=true; return true;
    case 'release-restore': restoreRelease?.(); return true;
    case 'suspend-hook': powerMonitor.emit('suspend'); return true;
    case 'resize': {
      if (![[1280,720],[640,480]].some(([w,h]) => message.width === w && message.height === h)) throw Error('invalid test size');
      // Native stress viewport below the ordinary app minimum; production sizing
      // and all renderer/layout/input code remain unchanged.
      visible.setMinimumSize(640, 480); visible.setContentSize(message.width, message.height); await delay(150); return true;
    }
    case 'layout': return js(`(() => { const rect = e => { const r=e.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}; }; return {width:innerWidth,height:innerHeight,menu:rect(document.querySelector('[data-testid="session-menu"]')),canvas:rect(document.querySelector('canvas'))}; })()`);
    case 'click': await click(message.id); return true;
    case 'type': await click(message.id); visible.webContents.insertText(message.text); return true;
    case 'capacity': await click('capacity'); visible.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'}); visible.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'});
      for(let i=1;i<message.value;i++){ visible.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'}); visible.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'}); }
      visible.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'}); visible.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'}); return true;
    case 'key': visible.restore(); visible.show(); visible.focus(); visible.webContents.focus(); await js('document.activeElement?.blur()'); visible.webContents.sendInputEvent({type:message.down?'keyDown':'keyUp',keyCode:message.key}); return true;
    case 'focus': visible.restore(); visible.show(); visible.focus(); visible.webContents.focus(); return true;
    case 'blur': visible.blur(); visible.minimize(); return true;
    case 'screenshot': {
      visible.show(); visible.focus(); await delay(300);
      const capture = await visible.webContents.debugger.sendCommand('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
      const bytes = Buffer.from(capture.data,'base64'); if(bytes.length<1000) throw Error('empty screenshot');
      writeFileSync(message.path,bytes); return {bytes:bytes.length};
    }
    case 'resources': return { bounds:visible.getBounds(),minimized:visible.isMinimized(),visible:visible.isVisible(),focused:visible.isFocused(), utilities: utilities.map(r => ({pid:r.pid,exited:r.exited,producerChanges:r.producerChanges})),
      windows: windows.filter(r => !r.closed).length, ports: channels.filter(r => !r.released).length,
      native: await Promise.all(windows.filter(r => r.hidden && !r.closed).map(async r => { const value=await r.window.webContents.executeJavaScript('window.rtcNative.status()');nativeClosed.set(r,value);return value; })),
      listeners: ['net:rtc-response','net:transport-ready'].reduce((n,k)=>n+ipcMain.listenerCount(k),0) };
    case 'resource-counts': return {utilities:utilities.map(r=>({pid:r.pid,exited:r.exited})),windows:windows.filter(r=>!r.closed).length,ports:channels.filter(r=>!r.released).length,
      listeners:['net:rtc-response','net:transport-ready'].reduce((n,k)=>n+ipcMain.listenerCount(k),0)};
    case 'transport-death': windows.find(r => r.hidden && !r.closed)?.window.destroy(); return true;
    case 'delay-next-transport': delayNextTransport=true; return true;
    case 'shutdown': {
      stopping = true;
      for(const record of windows.filter(r=>r.hidden&&!r.closed)) {
        const data = await record.window.webContents.executeJavaScript('window.rtcNative.status()'); nativeClosed.set(record,data);
      }
      if(visible&&!visible.isDestroyed()) visible.destroy();
      for(let i=0;i<100 && utilities.some(r=>!r.exited);i++) await delay(20);
      const result = { utilities: utilities.length, utilityExits: utilities.filter(r=>r.exited).length,
        windows: BrowserWindow.getAllWindows().length, ports: channels.filter(r=>!r.released).length,
        listeners: ['online:status','net:rtc-response','net:transport-ready'].reduce((n,k)=>n+ipcMain.listenerCount(k),0),
        nativeWindows:windows.filter(r=>r.hidden).length,nativeWindowExits:windows.filter(r=>r.hidden&&r.closed).length,
        nativePeersObserved:[...nativeClosed.values()].flatMap(r=>r?.connections??[]).length,
        nativePeerCloses:[...nativeClosed.values()].flatMap(r=>r?.connections??[]).filter(r=>r.state==='closed').length,
        nativePeersEndedWithWindow:[...nativeClosed].flatMap(([owner,r])=>owner.closed?(r?.connections??[]).filter(p=>p.state!=='closed'):[]).length,
        peers:[...nativeClosed].flatMap(([owner,r])=>owner.closed?[]:r?.connections??[]).filter(r=>r.state!=='closed').length,
        utilityPids:utilities.map(r=>r.pid),observedMainPorts:channels.length };
      process.send?.({id:message.requestId,result},()=>app.exit(0)); return;
    }
    default: throw Error('unknown driver command');
  }
}
// Hold the wrapper alive long enough to report actual utility exits at shutdown.
app.on('window-all-closed', event => { if (stopping) event?.preventDefault?.(); });
app.on('before-quit', event => { if(stopping) event.preventDefault(); });
const diagnosticCommands=new Set(['status','click','type','capacity','key','focus','blur','resize','layout','screenshot','resources','resource-counts','transport-death','delay-next-transport','shutdown','hold-upload','hold-restore','release-restore','block-next-grant','suspend-hook']);
process.on('message', message => { void command(message).then(result => { if(message.command!=='shutdown') process.send?.({id:message.requestId,result}); })
  .catch(error => process.send?.({id:Number.isSafeInteger(message?.requestId)?message.requestId:0,error:'app-driver-command-failed',
    command:diagnosticCommands.has(message?.command)?message.command:'unknown',reason:['native-click-not-delivered','native-click-wrong-control'].includes(error?.message)?error.message:'command-failed'})); });
require(role==='incompatible' ? join(directory,'incompatible-build/main/index.js') : '../../out/main/index.js');


