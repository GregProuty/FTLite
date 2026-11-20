// TEST ONLY executable wrapper for the duel frame probe (scripts/network/duel-frame-probe.ts). It loads the shared app gate
// wrapper (online-app-smoke.cjs, unchanged, which loads the unchanged compiled app) and adds a side channel of its own:
// messages carrying `frameProbe` are answered with `frameReply` (they carry no requestId, so the shared wrapper's
// 'unknown driver command' answer goes to id 0, which the probe never waits on).
//  - FTLITE_FRAME_PROBE_GPU=1 keeps hardware acceleration on, as the production app runs (main/index.ts never disables it);
//    the shared wrapper disables it for every app gate, so without the flag the probe measures the software renderer.
//  - { frameProbe, eval }: run page source in the app window and answer its value.
//  - { frameProbe, place: { x, y } }: move the app window (so the two windows sit side by side).
//  - { frameProbe, display: true }: the primary display's refresh rate, size and scale, and the GPU feature status.
const { app, BrowserWindow, screen } = require('electron');
if (process.env.FTLITE_FRAME_PROBE_GPU === '1') app.disableHardwareAcceleration = () => {};
app.commandLine.appendSwitch('enable-precise-memory-info');   // performance.memory per frame, so a GC shows as a heap drop
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function answer(m) {
  const win = BrowserWindow.getAllWindows()[0];
  if (m.display) {
    const d = screen.getPrimaryDisplay(), all = screen.getAllDisplays();
    return { primary: { frequency: d.displayFrequency, size: d.size, workArea: d.workArea, scale: d.scaleFactor }, displays: all.map((x) => ({ id: x.id, frequency: x.displayFrequency, bounds: x.bounds, scale: x.scaleFactor })),
      window: win ? { bounds: win.getBounds(), display: screen.getDisplayMatching(win.getBounds()).displayFrequency } : null, gpu: app.getGPUFeatureStatus(), hardwareAcceleration: app.isHardwareAccelerationEnabled() };
  }
  if (!win || win.isDestroyed()) throw Error('no app window');
  if (m.place) { win.setPosition(m.place.x, m.place.y); await delay(100); return win.getBounds(); }
  if (typeof m.eval === 'string') return Promise.race([win.webContents.executeJavaScript(m.eval), delay(m.ms ?? 8000).then(() => { throw Error('page-call-timeout'); })]);
  throw Error('unknown frame probe request');
}
process.on('message', (m) => {
  if (!m || !Number.isSafeInteger(m.frameProbe)) return;
  answer(m).then((result) => process.send?.({ frameReply: m.frameProbe, result }), (error) => process.send?.({ frameReply: m.frameProbe, error: String(error?.message ?? error) }));
});
require('./online-app-smoke.cjs');
