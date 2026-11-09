import { describe, it, expect } from 'vitest';
import { hashF64 } from '../src/shared/hash';

describe('hashF64', () => {
  it('is stable and 8 hex chars', () => {
    const h = hashF64(new Float64Array([1, 2.5, -3]));
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(hashF64(new Float64Array([1, 2.5, -3]))).toBe(h);
  });
  it('changes when any value changes', () => {
    const a = hashF64(new Float64Array([1, 2, 3]));
    expect(hashF64(new Float64Array([1, 2, 3.0000001]))).not.toBe(a);
    expect(hashF64(new Float64Array([1, 2]))).not.toBe(a);
  });
  it('distinguishes 0 and -0 (canonical state must never contain -0)', () => {
    expect(hashF64(new Float64Array([0]))).not.toBe(hashF64(new Float64Array([-0])));
  });
});
