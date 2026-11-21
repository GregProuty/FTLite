// UI round spec §2.1: the stage size (internal px) the UI lays out on, from the layout slice.
import { useShallow } from 'zustand/react/shallow';
import type { StageSize } from '../../../../shared/resolution';
import { useUi } from '../context';
import { consoleLayout, type ConsoleLayout } from '../../render/duel/consoleLayout';

export function useStage(): StageSize { return useUi(useShallow((s) => ({ w: s.layout.stageW, h: s.layout.stageH }))); }

/** UI round 2b: the console layout anchored to the live stage's edges (memoised per size, so the object is stable). */
export function useConsoleLayout(): ConsoleLayout { return consoleLayout(useStage()); }
