import type { ModeDefinition, ModeRegistry } from './contracts';
import { positiveSafeInteger } from '../../shared/netSession';
export function createModeRegistry(definitions: readonly ModeDefinition[]): ModeRegistry {
  const entries = new Map<string, ModeDefinition>();
  for (const definition of definitions) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(definition.modeId) || !positiveSafeInteger(definition.schemaVersion)
      || !positiveSafeInteger(definition.simVersion) || typeof definition.createHost !== 'function'
      || (definition.latestStreamKey !== undefined && typeof definition.latestStreamKey !== 'function') || entries.has(definition.modeId)) throw Error('invalid or duplicate mode');
    entries.set(definition.modeId, Object.freeze({ ...definition }));
  }
  return Object.freeze({ get(modeId: string) { const definition = entries.get(modeId); if (!definition) throw Error('unknown mode'); return definition; } });
}
