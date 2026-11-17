import { expect,it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { INTERNET_ARTIFACTS } from '../scripts/network/internet-app-report';
import { parseJoinCodeFile } from '../scripts/network/join-code-file';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createLauncherDeadline,stopOwnedProcess } from '../scripts/network/lease-smoke-lifecycle';
const require=createRequire(import.meta.url);
it('observes actual selected candidate types and applies relay only in test construction',async()=>{
  const observe=require('../scripts/network/rtc-smoke-native.cjs');let config:any;
  class PC extends EventTarget {connectionState='connected';constructor(c:any){super();config=c;} createDataChannel(){}getConfiguration(){return config;}async getStats(){return new Map([['t',{type:'transport',selectedCandidatePairId:'p'}],['p',{state:'succeeded',localCandidateId:'l',remoteCandidateId:'r'}],['l',{candidateType:'relay'}],['r',{candidateType:'srflx'}]]);}}
  const window:any={RTCPeerConnection:PC,setTimeout,clearTimeout};runInNewContext(`(${observe.toString()})({forceRelay:true})`,{window,EventTarget});new window.RTCPeerConnection({iceServers:[]});
  expect(config.iceTransportPolicy).toBe('relay');expect((await window.rtcNative.status()).connections[0]).toMatchObject({selected:true,localType:'relay',remoteType:'srflx',policy:'relay'});
});
it.each(['preparation-read-failure','preparation-timeout','cleanup-stop-failure'])('bounds and cleans internet launcher %s without an endpoint call',async fault=>{
  const directory=mkdtempSync(join(tmpdir(),'ftlite-internet-test-'));const report=join(directory,'report.json');const deadline=createLauncherDeadline(performance.now()+27000);
  const child=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'scripts/network/internet-app-smoke.ts','--service-origin=https://service.example',`--inject-${fault}`,`--report-path=${report}`],{windowsHide:true,stdio:'ignore'});
  try{const code=await deadline.wait(new Promise(done=>child.once('exit',done)),'test-timeout',5000);expect(code).toBe(1);
    const r=JSON.parse(readFileSync(report,'utf8'));expect(r.failure).toBe(fault==='preparation-timeout'?'preparation-timeout':'preparation-failed');expect(r.elapsedMs).toBeLessThan(r.budgetMs);expect(r.temporaryRemoved).toBe(true);expect(r.directoryCleanupAttempted).toBe(true);expect(r.peers).toEqual([]);
    expect(r.cleanupFailed).toBe(fault==='cleanup-stop-failure');expect(existsSync(join(tmpdir(),r.temporaryName))).toBe(false);
    for(const p of r.processes){expect(p.exited).toBe(true);expect(()=>process.kill(p.pid,0)).toThrow();}
  }finally{await stopOwnedProcess(child,deadline);const target=resolve(directory);if(!target.startsWith(resolve(tmpdir())+sep)||!target.includes('ftlite-internet-test-'))throw Error('test-cleanup-invalid');rmSync(target,{recursive:true,force:true});}
},30000);
it('rejects a manifest-origin/identity mismatch before ancestry, builds or native allocation',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'ftlite-internet-test-')),report=join(directory,'report.json'),manifest=join(directory,'manifest.json');
  const historical=JSON.parse(readFileSync('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/recovery-skiff.json','utf8'));
  writeFileSync(manifest,JSON.stringify({serviceOrigin:'https://service.example',identity:{revision:historical.source.revision,serviceOrigin:'https://intended.example',artifacts:Object.fromEntries(INTERNET_ARTIFACTS.map(p=>[p,'a'.repeat(64)]))}}));
  const deadline=createLauncherDeadline(performance.now()+10000);
  const child=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'scripts/network/internet-app-smoke.ts','--service-origin=https://service.example',`--candidate-manifest=${manifest}`,`--report-path=${report}`],{windowsHide:true,stdio:'ignore'});
  try{expect(await deadline.wait(new Promise(done=>child.once('exit',done)),'test-timeout',3000)).toBe(1);
    const r=JSON.parse(readFileSync(report,'utf8'));expect(r.failure).toBe('preparation-failed');expect(r.processes).toHaveLength(1);expect(r.ownedProcesses).toHaveLength(1);expect(r.peers).toEqual([]);expect(r.temporaryRemoved).toBe(true);expect(r.cleanupFailed).toBe(false);expect(r.processes[0].exited).toBe(true);
  }finally{await stopOwnedProcess(child,deadline);const target=resolve(directory);if(!target.startsWith(resolve(tmpdir())+sep)||!target.includes('ftlite-internet-test-'))throw Error('test-cleanup-invalid');rmSync(target,{recursive:true,force:true});}
},12000);
it.each([['a two-machine guest without a join-code file',['--role=guest']],['a join-code file off the guest',['--role=host','--join-code-file=join-code.txt']]])('refuses %s before any work or report',async(_name,extra)=>{
  const directory=mkdtempSync(join(tmpdir(),'ftlite-internet-test-')),report=join(directory,'report.json');const deadline=createLauncherDeadline(performance.now()+10000);
  const child=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'scripts/network/internet-app-smoke.ts','--service-origin=https://service.example','--machine-label=device-a','--network-label=network-a',...extra,`--report-path=${report}`],{windowsHide:true,stdio:'ignore'});
  try{expect(await deadline.wait(new Promise(done=>child.once('exit',done)),'test-timeout',3000)).toBe(1);expect(existsSync(report)).toBe(false);
  }finally{await stopOwnedProcess(child,deadline);const target=resolve(directory);if(!target.startsWith(resolve(tmpdir())+sep)||!target.includes('ftlite-internet-test-'))throw Error('test-cleanup-invalid');rmSync(target,{recursive:true,force:true});}
},12000);
it.each([
  ['UTF-8',Buffer.from('ABCD1234\n','utf8')],
  ['UTF-8 with a BOM (Set-Content -Encoding UTF8)',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('ABCD1234\r\n','utf8')])],
  ['UTF-16LE with a BOM (PowerShell 5.1 > and Out-File)',Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('ABCD1234\r\n','utf16le')])],
  ['ROOM and lower case',Buffer.from('room abcd1234','utf8')],
])('reads a join-code file saved as %s',(_name,bytes)=>expect(parseJoinCodeFile(bytes)).toBe('ABCD1234'));
it('maps the look-alikes the room code alphabet leaves out (O to 0, I and L to 1)',()=>{
  expect(parseJoinCodeFile(Buffer.from('ROOM OIL5ab9o','utf8'))).toBe('0115AB90');
  expect(parseJoinCodeFile(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('oil5ab9o','utf16le')]))).toBe('0115AB90');
});
it.each([['too short','ABCD123'],['too long','ABCD12345'],['U (not in the alphabet)','ABCDU234'],['inner space','ABCD 1234'],['empty','']])('waits on a join-code file that is %s',(_name,text)=>expect(parseJoinCodeFile(Buffer.from(text,'utf8'))).toBe(''));
it('does not read UTF-16LE without its BOM as a code',()=>expect(parseJoinCodeFile(Buffer.from('ABCD1234','utf16le'))).toBe(''));
