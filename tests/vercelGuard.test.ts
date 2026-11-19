// Continuous deployment (owner 2026-11-19, replacing Web-ii R1-F5's failing buildCommand): a Git-triggered Vercel build
// runs our own pipeline, which fetches the paid art, runs the production build:web (passcode middleware included) and
// the output check, so a source build can never serve the site without its passcode. Only master deploys.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  framework?: unknown; installCommand?: string; buildCommand?: string; git?: { deploymentEnabled?: Record<string, boolean> } };
const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;

describe('vercel.json continuous deployment', () => {
  it('builds with build:vercel: paid art, then the production build:web, then the output check', () => {
    expect(config.framework).toBeNull();
    expect(config.buildCommand).toBe('npm run build:vercel');
    expect(scripts['build:vercel']).toBe('tsx scripts/web/fetch-paid-art.ts && npm run build:web && tsx scripts/web/check-output.ts .vercel/output');
    expect(scripts['build:web']).toBe('tsx scripts/web/build-web.ts');   // no --test: production refuses missing paid art
  });
  it('installs without the Electron binary', () => {
    expect(config.installCommand).toBe('ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci');
  });
  it('deploys master only (every other branch, slashes included, is off)', () => {
    expect(config.git?.deploymentEnabled).toEqual({ '**': false, master: true });
  });
  it('the scripted deploy stays prebuilt', () => {
    expect(scripts['deploy:web']).toContain('vercel deploy --prebuilt --prod');
  });
});
