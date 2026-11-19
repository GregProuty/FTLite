// TEST ONLY (web build spec §3.5): the sibling control tab. No RTC and no WebSocket, so the browser's hidden-tab
// throttling applies to it; its 100 ms interval must average at least 900 ms for the run to count.
import type { ControlMeasurement } from './protocol';

declare global { interface Window { bgControl: { start(): void; result(): ControlMeasurement } } }
const samples = { hidden: 0, visible: 0 }, events: string[] = [];
let started = 0, last = 0, sum = 0, count = 0, measuring = false;
document.addEventListener('visibilitychange', () => { if (measuring) events.push(`${Math.round(performance.now() - started)}:${document.visibilityState}`); });
setInterval(() => {
  if (!measuring) return;
  const now = performance.now();
  samples[document.visibilityState === 'hidden' ? 'hidden' : 'visible']++;
  if (last) { sum += now - last; count++; }
  last = now;
}, 100);
window.bgControl = {
  start() { started = performance.now(); last = 0; sum = 0; count = 0; samples.hidden = samples.visible = 0; events.length = 0; measuring = true; },
  result() {
    measuring = false;
    return { durationMs: performance.now() - started, visibilitySamples: { ...samples }, visibilityEvents: [...events], periodMs: count ? sum / count : 0, intervals: count };
  }
};
