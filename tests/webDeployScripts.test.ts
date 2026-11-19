// The deploy entry (web build spec §5.2): a fresh production build:web, the output check, then a prebuilt production
// deploy; the CLI and esbuild are exact pins; Vercel's directory is never committed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
describe('deploy:web', () => {
  it('builds for production, checks the output, then deploys the prebuilt output to production', () => {
    expect(pkg.scripts['deploy:web']).toBe('npm run build:web && tsx scripts/web/check-output.ts .vercel/output && vercel deploy --prebuilt --prod');
    expect(pkg.scripts['build:web']).toBe('tsx scripts/web/build-web.ts');
  });
  it('pins the Vercel CLI and esbuild exactly', () => {
    expect(pkg.devDependencies.vercel).toBe('65.10.0'); expect(pkg.devDependencies.esbuild).toBe('0.25.12');
  });
  it('never commits .vercel/', () => { expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\.vercel\/$/m); });
  it('runs the live smoke from its own entry and never builds or deploys in it', () => {
    expect(pkg.scripts['test:web-live']).toBe('tsx scripts/web/live-smoke.ts');
  });
});
