import { DurableObject } from 'cloudflare:workers';
import type { Env as ServiceEnv } from '../src/index';
export { default, Room, Directory } from '../src/index';

/** Test entry only. Never exported by the shipping Worker. */
export class ProbeDO extends DurableObject {
  readonly marker = crypto.randomUUID();
  fetch(): Response {
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS socket_proof (value INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('INSERT INTO socket_proof VALUES (41)');
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({ id: 'attachment-proof' });
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(socket: WebSocket): void {
    socket.send(JSON.stringify({
      marker: this.marker,
      attachment: socket.deserializeAttachment(),
      value: this.ctx.storage.sql.exec<{ value: number }>('SELECT value FROM socket_proof').one().value,
      sockets: this.ctx.getWebSockets().length,
    }));
  }
}

declare module 'cloudflare:workers' {
  namespace Cloudflare { interface Env extends ServiceEnv { PROBE: DurableObjectNamespace<ProbeDO> } }
}
