import { expect,it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
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
