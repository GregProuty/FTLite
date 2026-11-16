import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, open, rename, unlink, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSeatStore, type SavedSeatV1, type SeatStoreFileSystem } from '../src/main/network/seatStore';

const roots: string[] = [];
afterEach(async () => { for (const path of roots.splice(0)) await rm(path,{recursive:true,force:true}); });
async function directory() { const path=await mkdtemp(join(tmpdir(),'ftlite-seat-')); roots.push(path); return path; }
const seat = (char='a'): SavedSeatV1 => ({version:1,serviceOrigin:'http://localhost:8787',roomId:char.repeat(32),joinCode:'ABCD1234',compatibility:{protocolVersion:2,modeId:'sector',schemaVersion:1,simVersion:35,contentDigest:'c'.repeat(64),layoutHash:'12345678'},seatId:1,seatGeneration:1,seatToken:'S'.repeat(43)});
const realFs: SeatStoreFileSystem = {mkdir,open,rename,unlink};
async function savedPath(path:string) { const files=await readdir(path); expect(files).toHaveLength(1); return join(path,files[0]!); }

describe('main-only saved seat store', () => {
  it('round-trips a detached seat record and supports missing files and repeat clear', async () => {
    const path=await directory(), store=createSeatStore(path);
    expect(await store.load()).toBeNull();
    await store.save(seat());
    const loaded=await store.load(); expect(loaded).toEqual(seat());
    loaded!.compatibility.modeId='mutated'; expect((await store.load())!.compatibility.modeId).toBe('sector');
    await store.clear(); await store.clear(); expect(await store.load()).toBeNull();
  });
  it('creates a missing userData directory', async () => {
    const path=join(await directory(),'nested'), store=createSeatStore(path);
    await store.save(seat()); expect(await store.load()).toEqual(seat());
  });
  it.each(['{corrupt', JSON.stringify({...seat(),version:2}), JSON.stringify({...seat(),seatToken:'bad'}), JSON.stringify({...seat(),extra:'secret'}), JSON.stringify({...seat(),serviceOrigin:'http://user:secret@localhost:8787'}), JSON.stringify({...seat(),compatibility:{...seat().compatibility,extra:'secret'}}), JSON.stringify(seat())+' '.repeat(8193), '{"version":1,"version":1}'])('rejects corrupt, unknown-version, oversize or unsafe records with a fixed error', async text => {
    const path=await directory(), store=createSeatStore(path); await store.save(seat()); await writeFile(await savedPath(path),text);
    await expect(store.load()).rejects.toMatchObject({code:'storage-invalid',message:'storage-invalid'});
  });
  it('accepts exactly 8 KiB and rejects 8 KiB plus one without reading arbitrary size', async () => {
    const path=await directory(), store=createSeatStore(path); await store.save(seat()); const file=await savedPath(path), text=JSON.stringify(seat());
    await writeFile(file,text+' '.repeat(8192-Buffer.byteLength(text))); expect(await store.load()).toEqual(seat());
    await writeFile(file,text+' '.repeat(8193-Buffer.byteLength(text))); await expect(store.load()).rejects.toMatchObject({code:'storage-invalid'});
  });
  it('serializes save A, forget and save B without resurrecting A', async () => {
    const store=createSeatStore(await directory());
    const a=store.save(seat('a')), clear=store.clear(), b=store.save(seat('b'));
    await Promise.all([a,clear,b]); expect((await store.load())!.roomId).toBe('b'.repeat(32));
    const c=store.save(seat('c')), forget=store.clear(); await Promise.all([c,forget]); expect(await store.load()).toBeNull();
  });
  it('captures records at save invocation before queued work runs', async () => {
    const store=createSeatStore(await directory()), record=seat(); const saved=store.save(record); record.seatToken='T'.repeat(43); await saved;
    expect((await store.load())!.seatToken).toBe('S'.repeat(43));
  });
  it('preserves A after failed rename, cleans its unique sibling temporary file and recovers the queue', async () => {
    const path=await directory(); let fail=false;
    const store=createSeatStore(path,{...realFs,rename:async (from,to)=>{if(fail) throw Error('secret '+seat().seatToken); await rename(from,to);}});
    await store.save(seat('a')); fail=true;
    await expect(store.save(seat('b'))).rejects.toMatchObject({code:'storage-write-failed',message:'storage-write-failed'});
    expect((await store.load())!.roomId).toBe('a'.repeat(32)); expect(await readdir(path)).toHaveLength(1);
    fail=false; await store.save(seat('c')); expect((await store.load())!.roomId).toBe('c'.repeat(32));
  });
  it('does not remove a temporary file it could not create exclusively', async () => {
    const path=await directory(); let collision='';
    const store=createSeatStore(path,{...realFs,open:async (file,flags,mode)=>{
      if(flags==='wx') { collision=file; await writeFile(file,'another writer'); throw Object.assign(Error('exists'),{code:'EEXIST'}); }
      return open(file,flags,mode);
    }});
    await expect(store.save(seat())).rejects.toMatchObject({code:'storage-write-failed'});
    expect(await readFile(collision,'utf8')).toBe('another writer');
  });
  it('rejects invalid saves before replacing the saved credential', async () => {
    const store=createSeatStore(await directory()); await store.save(seat());
    await expect(store.save({...seat(),seatId:4})).rejects.toMatchObject({code:'storage-invalid'}); expect(await store.load()).toEqual(seat());
  });
  it('sanitizes serialization errors and preserves the saved credential', async () => {
    const store=createSeatStore(await directory()); await store.save(seat());
    const malformed=Object.create({toJSON(){throw Error('secret '+seat().seatToken);}}) as SavedSeatV1;
    Object.assign(malformed,seat());
    await expect(store.save(malformed)).rejects.toMatchObject({code:'storage-invalid',message:'storage-invalid'});
    expect(await store.load()).toEqual(seat());
  });
  it('surfaces fixed read and clear failures without raw file/provider errors', async () => {
    const path=await directory(), secret='secret '+seat().seatToken;
    const unreadable=createSeatStore(path,{...realFs,open:async()=>{throw Error(secret);}});
    await expect(unreadable.load()).rejects.toMatchObject({code:'storage-read-failed',message:'storage-read-failed'});
    const unremovable=createSeatStore(path,{...realFs,unlink:async()=>{throw Error(secret);}});
    await expect(unremovable.clear()).rejects.toMatchObject({code:'storage-clear-failed',message:'storage-clear-failed'});
  });
});
