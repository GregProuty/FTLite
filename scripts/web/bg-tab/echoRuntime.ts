// TEST ONLY (web build spec §3.5): a local workerd that echoes WebSocket messages, standing in for the lobby service's
// lease reply. The same pinned Miniflare/workerd the signalling gates use (services/signalling/scripts/local-runtime.ts).
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const ECHO = `export default { fetch(request) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('echo');
  const [client, server] = Object.values(new WebSocketPair());
  server.accept(); server.addEventListener('message', event => server.send(event.data));
  return new Response(null, { status: 101, webSocket: client });
} };`;
export async function startEchoRuntime(directory: string): Promise<{ wsUrl: string; dispose(): Promise<void> }> {
  const requireService = createRequire(resolve('services/signalling/package.json'));
  const { Miniflare, convertV4MiniflareOptions } = requireService('miniflare');
  if (requireService('workerd/package.json').version !== '1.20261023.1') throw Error('wrong pinned workerd');
  const options = convertV4MiniflareOptions({ name: 'bg-tab-echo', modules: true, script: ECHO, compatibilityDate: '2026-10-23',
    host: '127.0.0.1', port: 0, cf: false, resourceTmpPath: directory });
  options.enableDevRegistry = false; options.telemetry = { enabled: false }; options.logRequests = false;
  const runtime = new Miniflare(options);
  const url = String(await runtime.ready).replace(/\/$/, '');
  return { wsUrl: url.replace(/^http/, 'ws') + '/echo', dispose: () => runtime.dispose() };
}
