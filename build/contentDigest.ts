import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (bytes: string): string => createHash('sha256').update(bytes, 'utf8').digest('hex');
/** Build/CLI only: runtime constructors receive this digest explicitly. No generated artifact. */
export function computeContentDigest(root: string): string {
  const simRoot = 'src/renderer/src/sim';
  const walk = (relative: string): string[] => readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = relative + '/' + entry.name;
    return entry.isDirectory() ? walk(path) : /\.(?:ts|json)$/.test(entry.name) ? [path] : [];
  });
  const paths = [...walk(simRoot), 'src/shared/intent.ts', 'src/renderer/src/net/contracts.ts', 'src/renderer/src/net/codec.ts'].sort();
  const manifest = paths.map((path) => ({ path, hash: sha256(readFileSync(join(root, path), 'utf8').replace(/\r\n?/g, '\n')) }));
  return sha256(JSON.stringify(manifest));
}
