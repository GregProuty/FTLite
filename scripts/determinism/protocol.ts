export interface Sample { ship: string; variant?: string; seed: number; runId: string; tick: number; completed: number; hash: string; fields: Record<string, unknown> }
export interface Report { samples: Sample[]; boundaries: unknown[] }
export function firstDifference(a: unknown, b: unknown, path = ''): string | undefined {
  if (Object.is(a, b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const difference = firstDifference((a as any)[key], (b as any)[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return;
  }
  return `${path}: expected ${JSON.stringify(a)}, actual ${JSON.stringify(b)}`;
}
export function compareReports(expected: Report, actual: Report): void {
  if (expected.samples.length !== actual.samples.length) throw Error(`sample count: expected ${expected.samples.length}, actual ${actual.samples.length}`);
  for (let i = 0; i < expected.samples.length; i++) {
    const a = expected.samples[i]!, b = actual.samples[i]!;
    const difference = firstDifference(a.fields, b.fields, 'canonical') ?? firstDifference(a, b, 'sample');
    if (difference) throw Error(`${a.variant ?? a.ship} seed ${a.seed} run ${a.runId} tick ${a.tick} completed ${a.completed}: ${difference}`);
  }
  const difference = firstDifference(expected.boundaries, actual.boundaries, 'boundaries');
  if (difference) throw Error(difference);
}
export function browserExecutable(engine: string, executable: string | undefined, required: boolean): string {
  if (executable) return executable;
  if (required) throw Error(`${engine} required executable unavailable`);
  return `${engine} NOT RUN: executable unavailable`;
}
export function receiveBrowser(timeoutMs: number) {
  let resolve!: (value: { engine: string; report: Report; duelRestore: { checks: number; finalHash: string } }) => void, reject!: (error: Error) => void;
  const promise = new Promise<{ engine: string; report: Report; duelRestore: { checks: number; finalHash: string } }>((yes, no) => { resolve = yes; reject = no; });
  const timer = setTimeout(() => reject(Error(`browser timeout after ${timeoutMs}ms`)), timeoutMs);
  return { promise, report(value: any) {
    clearTimeout(timer);
    if (value?.error) reject(Error(`browser page failure: ${value.error}`));
    else if (!value?.engine || !Array.isArray(value?.report?.samples) || !Array.isArray(value?.report?.boundaries) || typeof value?.duelRestore?.finalHash !== 'string' || typeof value?.duelRestore?.checks !== 'number') reject(Error('malformed browser report'));
    else resolve(value);
  } };
}
