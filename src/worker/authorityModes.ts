// The modes the host Worker registers (engine refactor spec §6; web build spec §3.2): the sector and the duel.
// authorityWorkerMain.ts builds its host from exactly this registry, so a test can drive the same one.
import { createModeRegistry } from '../network/modes/registry';
import { sectorMode } from '../network/modes/sector';
import { duelMode } from '../network/modes/duel';

export const authorityModes = createModeRegistry([sectorMode, duelMode]);
