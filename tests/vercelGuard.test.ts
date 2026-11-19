// Web-ii R1-F5: a plain `vercel` / `vercel deploy` (a source build, no passcode middleware) must fail on purpose; only
// `npm run deploy:web` (--prebuilt, which uploads just .vercel/output and never runs a build) may deploy.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('vercel.json deploy guard', () => {
  it('has a buildCommand that fails and points at deploy:web', () => {
    const { buildCommand } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { buildCommand?: string };
    expect(typeof buildCommand).toBe('string');
    const run = spawnSync(buildCommand!, { shell: true, encoding: 'utf8' });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('npm run deploy:web');
  });
  it('the scripted deploy stays prebuilt', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts['deploy:web']).toContain('vercel deploy --prebuilt --prod');
  });
});
