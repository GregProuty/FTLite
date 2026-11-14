import { executeFixture, unpackFixture } from './fixture';
import { compareReports } from './protocol';
declare global { interface Window { determinism?: { engine: string; report(value: unknown): void } } }
const token = new URLSearchParams(location.search).get('token');
let sent = false;
function report(value: unknown): void {
  if (sent) return; sent = true;
  if (window.determinism) window.determinism.report(value);
  else void fetch(`/result/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}
window.addEventListener('error', event => report({ error: event.error?.stack ?? event.message }));
window.addEventListener('unhandledrejection', event => report({ error: String(event.reason?.stack ?? event.reason) }));
async function main() {
  if (new URLSearchParams(location.search).get('fault') === 'page') throw Error('injected browser page failure');
  const fixture = unpackFixture(await (await fetch('/fixture.json')).json());
  const actual = executeFixture(fixture, __GAMEPLAY_CONTENT_DIGEST__);
  compareReports(fixture.expected, actual);
  report({ engine: window.determinism?.engine ?? navigator.userAgent, report: actual });
}
void main().catch(error => report({ error: String(error.stack ?? error) }));
