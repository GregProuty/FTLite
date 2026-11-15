import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const sources = {
  'src/renderer/src/sim/tuning.ts': 'export const SPEED = 4;\n',
  'src/renderer/src/sim/weapons.ts': 'export const damage = 2;\n',
  'src/renderer/src/sim/ship/cutter.json': '{"width":12}\n',
  'src/shared/intent.ts': 'export type Intent = number;\n',
  'src/renderer/src/net/contracts.ts': 'export type Message = string;\n',
  'src/renderer/src/net/codec.ts': 'export const protocol = 1;\n',
  'src/shared/netSession.ts': 'export const protocol = 2;\n',
  'src/renderer/src/net/receivePolicy.ts': 'export const age = 120;\n',
  'src/renderer/src/authority/core.ts': 'export const execution = 1;\n',
  'src/renderer/src/authority/ledger.ts': 'export const admission = 1;\n',
  'src/renderer/src/authority/checkpoint.ts': 'export const checkpointVersion = 2;\n',
  'src/network/modes/sector.ts': 'export const mode = 1;\n',
  'src/network/modes/contracts.ts': 'export type ModeSchema = number;\n',
  'src/network/modes/registry.ts': 'export const registered = true;\n',
  'src/shared/rtcSession.ts': 'export const rtcProtocol = 1;\n',
  'src/network/rtc/contracts.ts': 'export const limit = 4096;\n',
  'src/network/rtc/frames.ts': 'export const frame = 1;\n',
  'src/network/rtc/dataLink.ts': 'export const queue = 16;\n',
  'src/network/rtc/peer.ts': 'export const auth = 1;\n'
};
function fixture(entries = Object.entries(sources)): string {
  const root = mkdtempSync(join(tmpdir(), 'ftlite-digest-')); roots.push(root);
  for (const [path, content] of entries) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); }
  return root;
}
describe('build gameplay content digest', () => {
  it('is stable under enumeration/creation order, root paths and CRLF source bytes', () => {
    const a = fixture(), b = fixture(Object.entries(sources).reverse().map(([p, c]) => [p, c.replaceAll('\n', '\r\n')]));
    expect(computeContentDigest(a)).toMatch(/^[0-9a-f]{64}$/); expect(computeContentDigest(b)).toBe(computeContentDigest(a));
  });
  it.each(Object.keys(sources))('invalidates when gameplay or protocol source %s changes', (path) => {
    const root = fixture(), before = computeContentDigest(root); writeFileSync(join(root, path), sources[path as keyof typeof sources] + 'changed');
    expect(computeContentDigest(root)).not.toBe(before);
  });
  it('includes newly added nested sim sources and excludes git/render/generated files', () => {
    const root = fixture(), before = computeContentDigest(root);
    mkdirSync(join(root, '.git')); writeFileSync(join(root, '.git', 'HEAD'), 'changed');
    mkdirSync(join(root, 'src/renderer/src/render')); writeFileSync(join(root, 'src/renderer/src/render/hud.ts'), 'changed');
    expect(computeContentDigest(root)).toBe(before);
    writeFileSync(join(root, 'src/renderer/src/sim/ship/new.ts'), 'new'); expect(computeContentDigest(root)).not.toBe(before);
  });
  it('injects the identical build digest into Vitest runtime', () => {
    expect(__GAMEPLAY_CONTENT_DIGEST__).toBe(computeContentDigest(resolve('.')));
  });
});
