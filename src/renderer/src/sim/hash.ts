import { hashF64 } from '../../../shared/hash';
import { flatten } from './flatten';
import type { SimState } from './state';

export function hashState(s: SimState): string {
  return hashF64(flatten(s));
}
