import { DurableObject } from 'cloudflare:workers';
import { serviceError } from './errors';
import { initializeServiceSchema } from './storage';
export class Directory extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    initializeServiceSchema(ctx.storage);
  }
  fetch(): Response { return serviceError('unavailable', 503); }
}
