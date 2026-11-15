import { DurableObject } from 'cloudflare:workers';
import { serviceError } from './errors';
export class Directory extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS service_schema (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)');
      ctx.storage.sql.exec('INSERT OR IGNORE INTO service_schema VALUES (1, 1)');
      const { version } = ctx.storage.sql.exec<{ version: number }>('SELECT version FROM service_schema WHERE singleton = 1').one();
      if (version !== 1) throw Error('unsupported-schema');
    });
  }
  fetch(): Response { return serviceError('unavailable', 503); }
}
