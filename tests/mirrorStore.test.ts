import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, open, rename, unlink, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createMirrorStore, type MirrorFileV1, type SessionMirror, type MirrorFileSystem } from '../src/main/network/mirrorStore';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { expect(dirname(resolve(root))).toBe(resolve(tmpdir())); expect(root).toContain('ftlite-mirror-'); await rm(root, { recursive: true, force: true }); } });
async function directory() { const root = await mkdtemp(join(tmpdir(), 'ftlite-mirror-')); roots.push(root); return root; }
export function mirror(sequence = 1, generation = 1, tick = 0, size = 16): SessionMirror {
  const bytes = new Uint8Array(size).fill(sequence);
  return { metadata: { version: 1, protocolVersion: 2, roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: generation, checkpointSequence: sequence, capturedTick: tick,
    payloadSha256: createHash('sha256').update(bytes).digest('hex'), compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' } }, bytes };
}
const record = (): MirrorFileV1 => ({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: 'a'.repeat(32), committed: mirror(), pending: mirror(2) });
const fs: MirrorFileSystem = { mkdir, open, rename, unlink };
describe('atomic binary session mirror', () => {
  it('round trips two maximum payloads below 544 KiB, with exact magic/header/raw order and detached invocation bytes', async () => {
    const root = await directory(), store = createMirrorStore(root, () => {}), value = record();
    expect(await store.load()).toBeNull(); value.committed = mirror(1, 1, 0, 262144); value.pending = mirror(2, 1, 300, 262144);
    const saved = store.save(value); value.pending.bytes[0] = 99; await saved;
    const loaded = await store.load(), bytes = await readFile(join(root, 'online-mirror-v1.bin'));
    expect(bytes.length).toBeLessThanOrEqual(557056); expect(bytes.subarray(0, 8).toString()).toBe('FTLNMIR1');
    const end = 12 + bytes.readUInt32LE(8); expect(bytes[end]).toBe(1); expect(bytes[end + 262144]).toBe(2); expect(loaded?.pending?.bytes[0]).toBe(2);
    await store.clear(); await store.clear(); expect(await store.load()).toBeNull(); expect(await readdir(root)).toEqual([]);
  });
  it.each(['magic', 'truncated', 'oversize', 'trailing', 'hash', 'utf8', 'extra', 'duplicate'] as const)('rejects %s corruption with fixed errors', async kind => {
    const root = await directory(), store = createMirrorStore(root, () => {}), path = join(root, 'online-mirror-v1.bin'); await store.save(record()); let bytes = await readFile(path);
    if (kind === 'magic') bytes[0] = 0;
    if (kind === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
    if (kind === 'oversize') bytes = Buffer.alloc(557057);
    if (kind === 'trailing') bytes = Buffer.concat([bytes, Buffer.from([0])]);
    if (kind === 'hash') bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    if (kind === 'utf8') bytes[12] = 255;
    if (kind === 'extra' || kind === 'duplicate') {
      const length = bytes.readUInt32LE(8), old = bytes.subarray(12, 12 + length).toString();
      const header = Buffer.from(old.slice(0, -1) + (kind === 'extra' ? ',"seatToken":"secret"}' : ',"version":1}'));
      const prefix = Buffer.from(bytes.subarray(0, 12)); prefix.writeUInt32LE(header.length, 8); bytes = Buffer.concat([prefix, header, bytes.subarray(12 + length)]);
    }
    await writeFile(path, bytes); await expect(store.load()).rejects.toMatchObject({ code: kind === 'oversize' ? 'save-too-large' : 'save-invalid' });
  });
  it('validates mode payload and room binding before replacing a valid file', async () => {
    const root = await directory(), store = createMirrorStore(root, m => { if (m.bytes[0] === 3) throw Error('mode mismatch'); }); await store.save(record());
    await expect(store.save({ ...record(), pending: mirror(3) })).rejects.toMatchObject({ code: 'save-invalid' });
    await expect(store.save({ ...record(), roomId: 'd'.repeat(32) })).rejects.toMatchObject({ code: 'save-invalid' }); expect(await store.load()).toEqual(record());
  });
  it.each(['open', 'write', 'rename'] as const)('retains committed bytes and only cleans owned temp after %s failure', async stage => {
    const root = await directory(); let fail = false, collision = '';
    const store = createMirrorStore(root, () => {}, { ...fs, open: async (path, flags, mode) => {
      if (fail && stage === 'open' && flags === 'wx') { collision = path; await writeFile(path, 'other owner'); throw Error('exists'); }
      const handle = await open(path, flags, mode);
      if (fail && stage === 'write' && flags === 'wx') return { read: handle.read.bind(handle), close: handle.close.bind(handle), sync: handle.sync.bind(handle), writeFile: async () => { throw Error('secret'); } };
      return handle;
    }, rename: async (from, to) => { if (fail && stage === 'rename') throw Error('secret'); await rename(from, to); } });
    await store.save(record()); fail = true; await expect(store.save({ ...record(), pending: mirror(4) })).rejects.toMatchObject({ code: 'save-unavailable' });
    expect(await store.load()).toEqual(record()); expect(await readdir(root)).toHaveLength(stage === 'open' ? 2 : 1);
    if (collision) expect(await readFile(collision, 'utf8')).toBe('other owner');
  });
  it('serializes queued write and Forget, never recreating the cleared file', async () => {
    const store = createMirrorStore(await directory(), () => {}); await Promise.all([store.save(record()), store.clear()]); expect(await store.load()).toBeNull();
  });
});
