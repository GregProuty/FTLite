import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (bytes: string): string => createHash('sha256').update(bytes, 'utf8').digest('hex');
/** Build/CLI only: runtime constructors receive this digest explicitly. No generated artifact. */
export function computeContentDigest(root: string): string {
  const walk = (relative: string): string[] => readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = relative + '/' + entry.name;
    return entry.isDirectory() ? walk(path) : /\.(?:ts|json)$/.test(entry.name) ? [path] : [];
  });
  const paths = [
    ...walk('src/renderer/src/sim'), ...walk('src/renderer/src/authority'), ...walk('src/network/modes'), ...walk('src/network/rtc'), ...walk('src/network/state'), ...walk('src/network/session'),
    'src/shared/intent.ts', 'src/shared/netSession.ts', 'src/shared/rtcSession.ts', 'src/shared/roomSession.ts', 'src/shared/onlineSession.ts', 'src/shared/sessionLease.ts', 'src/shared/sessionCheckpoint.ts', 'src/renderer/src/net/contracts.ts',
    'src/renderer/src/net/codec.ts', 'src/renderer/src/net/receivePolicy.ts', 'src/renderer/src/clientControl/clientRun.ts', 'src/shared/hostProcessProtocol.ts'
  ].sort();
  const manifest = paths.map((path) => ({ path, hash: sha256(readFileSync(join(root, path), 'utf8').replace(/\r\n?/g, '\n')) }));
  return sha256(JSON.stringify(manifest));
}
