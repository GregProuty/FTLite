// TEST ONLY executable wrapper. Loads the unchanged compiled production app.
const electron = require('electron');
const { app, BrowserWindow, utilityProcess, ipcMain, powerMonitor } = electron;
process.on('uncaughtException',()=>{console.error('APP_DRIVER_UNCAUGHT');app.exit(1);});
const { resolve, join, sep } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');
const observeNative = require('./rtc-smoke-native.cjs');
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
  const child = fork(...args), record = { child, exited: false, pid: null, producerChanges: [] }; utilities.push(record);
  child.once('spawn', () => { record.pid = child.pid; });
  child.once('exit', () => { record.exited = true; });
  const post = child.postMessage.bind(child);
  child.postMessage = (message, ports) => {
    // Only lifecycle kind and logical seat, never credentials or payload bytes.
    if (message?.kind === 'command') record.producerChanges.push({ kind: message.command?.kind, seatId: message.command?.seatId, player: message.command?.player, human: message.command?.human });
    const result=post(message, ports);transferred(ports);return result;
  };
  return child;
};
app.on('browser-window-created', (_, window) => {
  const hidden = !!visible; if (!visible) visible = window;
  const diagnosticContext={role,page:hidden?'transport':'application'};
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
  const point = await js(`(() => { const e = document.querySelector('[data-testid="${id}"]'); if (!e || e.disabled) throw Error('unavailable control: ${id}'); const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; })()`);
  visible.focus(); visible.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  visible.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  await delay(60);
}
async function command(message) {
  switch (message.command) {
    case 'status': return { ...await js(`(async () => ({status:(await window.ftlite.online.readStatus()).status, observations:window.onlineAppObservation(), keys:window.onlineAppKeys, text:document.body.innerText, hidden:document.hidden, focused:document.hasFocus()}))()`),electron:process.versions.electron };
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
const diagnosticCommands=new Set(['status','click','type','capacity','key','focus','blur','resize','layout','screenshot','resources','transport-death','delay-next-transport','shutdown']);
process.on('message', message => { void command(message).then(result => { if(message.command!=='shutdown') process.send?.({id:message.requestId,result}); })
  .catch(() => process.send?.({id:Number.isSafeInteger(message?.requestId)?message.requestId:0,error:'app-driver-command-failed',
    command:diagnosticCommands.has(message?.command)?message.command:'unknown'})); });
require(role==='incompatible' ? join(directory,'incompatible-build/main/index.js') : '../../out/main/index.js');


