// UI round spec §2.1: the stage size (internal px) the UI lays out on, from the layout slice.
import { useShallow } from 'zustand/react/shallow';
import type { StageSize } from '../../../../shared/resolution';
import { useUi } from '../context';

export function useStage(): StageSize { return useUi(useShallow((s) => ({ w: s.layout.stageW, h: s.layout.stageH }))); }
