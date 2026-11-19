// TEST ONLY (Web-i Task 11): a session preload the app gates' wrapper registers (online-app-smoke.cjs). It asks main
// for the probe source (rtcNative, page-probe.js, the observer) and runs it in the page's main world before any page
// script. Product preloads and pages are unchanged; main answers only its own app window.
const { contextBridge, ipcRenderer } = require('electron');
const source = ipcRenderer.sendSync('online-test:probe-source');
if (typeof source === 'string' && source) contextBridge.executeInMainWorld({ func: text => { (0, eval)(text); }, args: [source] });
