import { serviceError } from './errors';
export { Room } from './room';
export { Directory } from './directory';
export interface Env { ROOMS: DurableObjectNamespace; DIRECTORY: DurableObjectNamespace }
// Allocation and authorization are introduced by later tasks. No success or
// public internal-method fallback is allowed in the initial service scaffold.
export default { fetch: () => serviceError('unavailable', 503) } satisfies ExportedHandler<Env>;
