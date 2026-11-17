// The text-parity probe's mount (?mode=uiprobe): the same providers, ProbePage instead of the UI root. Loaded lazily by main.ts.
import type { UiActions } from '../actions';
import { mountWith } from '../mount';
import type { UiStore } from '../store';
import { ProbePage } from './ProbePage';

export function mountProbe(opts: { el: HTMLElement; store: UiStore; actions: UiActions }): Promise<() => void> { return mountWith(opts, <ProbePage />); }
