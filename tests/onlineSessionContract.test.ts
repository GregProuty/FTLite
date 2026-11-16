import { describe, expect, it } from 'vitest';
import { copyOnlinePortDescriptor, copyOnlineStatus, validateOnlineAction, validateOnlinePortDescriptor, validateOnlineResult, validateOnlineStatus, validateOnlineStatusEnvelope, type OnlineStatus } from '../src/shared/onlineSession';
import type { RoomSnapshot } from '../src/shared/roomSession';

const snapshot: RoomSnapshot = {
  roomId: 'a'.repeat(32), joinCode: 'ABCD1234', runId: 'b'.repeat(32),
  compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' },
  capacity: 2, hostSeatId: 0, hostGeneration: 1, phase: 'lobby', rosterRevision: 1,
  seats: [{ seatId: 0, seatGeneration: 1, occupied: true, connected: true, ready: false }, { seatId: 1, seatGeneration: 0, occupied: false, connected: false, ready: false }],
};
const status = (): OnlineStatus => ({ phase: 'lobby', role: 'host', ownSeat: 0, snapshot: structuredClone(snapshot), attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['ready', 'start', 'leave'] });

describe('bounded online renderer boundary', () => {
  it('validates mirror receipts without admitting bytes, credentials or restored receipt timestamps', () => {
    const mirror = { committed: null, receivedAgeMs: null, localPending: true, persistent: false, error: 'save-unavailable' };
    expect(validateOnlineStatus({ ...status(), mirror })).toBe(true);
    for (const bad of [{ ...mirror, bytes: [1] }, { ...mirror, receivedAgeMs: -1 }, { ...mirror, seatToken: 'secret' }, { ...mirror, error: 'raw' }]) expect(validateOnlineStatus({ ...status(), mirror: bad })).toBe(false);
  });
  it('accepts only version one status revisions with strict bounded public data', () => {
    expect(validateOnlineStatusEnvelope({ version: 1, revision: 1, status: status() })).toBe(true);
    for (const value of [{ version: 2, revision: 1, status: status() }, { version: 1, revision: 0, status: status() },
      { version: 1, revision: Number.MAX_SAFE_INTEGER + 1, status: status() }, { version: 1, revision: 1, status: status(), seatToken: 'private' },
      { version: 1, revision: 1, status: { ...status(), seatToken: 'private' } }]) expect(validateOnlineStatusEnvelope(value)).toBe(false);
  });
  it.each([{type:'host',capacity:1}, {type:'host',capacity:4}, {type:'join',code:'  abcd1234  '}, {type:'ready',ready:false}, {type:'remove-seat',seatId:3}, {type:'view-state',epoch:1,phase:'synced'}, ...['reconnect','start','retry','leave','forget-seat'].map(type=>({type}))])('accepts allowed action %j', action => {
    expect(validateOnlineAction(action)).toBe(true);
  });
  it.each([null, {}, {type:'host',capacity:0}, {type:'host',capacity:5}, {type:'host',capacity:1.5}, {type:'join',code:'ABCD123I'}, {type:'join',code:'ABCD1234',seatToken:'secret'}, {type:'join',code:' '.repeat(25)+'ABCD1234'}, {type:'reconnect',roomId:'a'.repeat(32)}, {type:'remove-seat',seatId:4}, {type:'ready',ready:1}, {type:'view-state',epoch:0,phase:'synced'}, {type:'view-state',epoch:Number.MAX_SAFE_INTEGER+1,phase:'running'}, {type:'view-state',epoch:1,phase:'lobby'}, {type:'toString'}])('rejects malformed/privileged action %j', action => {
    expect(validateOnlineAction(action)).toBe(false);
  });
  it('checks the input bound before trimming and normalizing a code', () => {
    expect(validateOnlineAction({ type: 'join', code: ' '.repeat(24)+'abcd1234' })).toBe(true);
    expect(validateOnlineAction({ type: 'join', code: ' '.repeat(25)+'abcd1234' })).toBe(false);
  });
  it('accepts bounded safe status and a distinct nonpersistent storage warning', () => {
    expect(validateOnlineStatus(status())).toBe(true);
    expect(validateOnlineStatus({ ...status(), persistent: false, error: 'storage-write-failed' })).toBe(true);
    expect(validateOnlineStatus({ ...status(), phase: 'idle', role: null, ownSeat: null, snapshot: null, actions: [] })).toBe(true);
  });
  it('rejects credentials, unknown fields and invalid nested roster fields', () => {
    for (const value of [ { ...status(), seatToken: 'secret' }, { ...status(), error: 'secret exception' }, { ...status(), attachmentEpoch: -1 }, { ...status(), attachmentEpoch: Number.MAX_SAFE_INTEGER+1 }, { ...status(), retryAtMs: Infinity }, { ...status(), ownSeat: 4 }, { ...status(), actions: ['launch'] }, { ...status(), actions: ['leave','leave'] }, { ...status(), snapshot: {...snapshot, seatToken:'secret'} }, { ...status(), snapshot: {...snapshot, seats:[{...snapshot.seats[0],seatToken:'secret'},snapshot.seats[1]]} }, { ...status(), snapshot: {...snapshot, compatibility:{...snapshot.compatibility,token:'secret'}} } ]) expect(validateOnlineStatus(value)).toBe(false);
  });
  it.each(['actions', 'seats'] as const)('rejects credential properties attached to the %s array', location => {
    const value = status();
    const array = location === 'actions' ? value.actions : value.snapshot!.seats;
    Object.assign(array, { seatToken: 'private-test-value' });
    expect(validateOnlineStatus(value)).toBe(false);
    expect(() => copyOnlineStatus(value)).toThrow('invalid-status');
  });
  it.each(['actions', 'seats'] as const)('rejects holes in the %s array', location => {
    const value = status();
    const array = location === 'actions' ? value.actions : value.snapshot!.seats;
    delete (array as unknown[])[0];
    expect(validateOnlineStatus(value)).toBe(false);
    expect(() => copyOnlineStatus(value)).toThrow('invalid-status');
  });
  it('returns detached status copies and rejects unsafe data before copying', () => {
    const original = status(), copied = copyOnlineStatus(original);
    copied.snapshot!.seats[0]!.ready = true;
    copied.snapshot!.compatibility.modeId = 'other';
    expect(original.snapshot!.seats[0]!.ready).toBe(false);
    expect(original.snapshot!.compatibility.modeId).toBe('sector');
    (copied.actions as string[]).push('retry');
    expect(original.actions).toEqual(['ready','start','leave']);
    expect(() => copyOnlineStatus({...original,seatToken:'secret'} as OnlineStatus)).toThrow('invalid-status');
  });
  it('validates attachment descriptors using strict room compatibility and positive epochs', () => {
    const port = { epoch: 1, runId: snapshot.runId, hostGeneration: 1, seatId: 1, compatibility: snapshot.compatibility };
    expect(validateOnlinePortDescriptor(port)).toBe(true);
    for (const value of [{...port,epoch:0}, {...port,epoch:1.5}, {...port,epoch:Number.MAX_SAFE_INTEGER+1}, {...port,runId:'arbitrary'}, {...port,hostGeneration:0}, {...port,seatId:4}, {...port,token:'secret'}, {...port,compatibility:{...port.compatibility,token:'secret'}}]) expect(validateOnlinePortDescriptor(value)).toBe(false);
  });
  it('detaches attachment compatibility before it crosses IPC', () => {
    const port = { epoch: 1, runId: snapshot.runId, hostGeneration: 1, seatId: 1, compatibility: structuredClone(snapshot.compatibility) };
    const copied = copyOnlinePortDescriptor(port);
    copied.compatibility.modeId = 'other';
    expect(port.compatibility.modeId).toBe('sector');
    expect(() => copyOnlinePortDescriptor({ ...port, epoch: 0 })).toThrow('invalid-port');
  });
  it('permits only fixed operation results', () => {
    expect(validateOnlineResult({ok:true})).toBe(true);
    expect(validateOnlineResult({ok:false,code:'unauthorized'})).toBe(true);
    for (const value of [{ok:true,seatToken:'secret'},{ok:false,code:'raw error'},{ok:false,code:'unauthorized',message:'secret'}]) expect(validateOnlineResult(value)).toBe(false);
  });
});
