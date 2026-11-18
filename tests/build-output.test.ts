import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';

// Runs only after `npm run build`: proves the assets and notices reach the packaged renderer (spec §3 delivery).
describe.skipIf(!existsSync('out/renderer'))('build output', () => {
  it('ships the manifest and the notices', () => {
    expect(existsSync('out/renderer/assets/manifest.json')).toBe(true);
    expect(existsSync('out/renderer/THIRD_PARTY_NOTICES.txt')).toBe(true);
  });
  it('ships the host Worker chunk and no hidden transport page (web build spec §3.2, §3.3)', () => {
    expect(existsSync('out/renderer/assets/authorityWorker.js')).toBe(true);
    expect(existsSync('out/renderer/networkTransport.html')).toBe(false);
    expect(existsSync('out/main/authorityHost.js')).toBe(false); expect(existsSync('out/preload/networkTransport.js')).toBe(false);
  });
});
