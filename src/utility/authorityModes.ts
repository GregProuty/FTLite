// The modes the authority utility registers (engine refactor spec §6): the sector and the duel. authorityHost.ts, the
// utility's Electron entry point, builds its host from exactly this registry, so a test can drive the same one.
import { createModeRegistry } from '../network/modes/registry';
import { sectorMode } from '../network/modes/sector';
import { duelMode } from '../network/modes/duel';

export const authorityModes = createModeRegistry([sectorMode, duelMode]);
