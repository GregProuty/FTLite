import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { createLauncherDeadline } from '../scripts/network/lease-smoke-lifecycle';

afterEach(() => vi.useRealTimers());
it.each(['git-failure','git-timeout','artifact','report-directory','cleanup-observation'])('protects recovery launcher preparation and cleanup after %s', async fault => {
  vi.useFakeTimers(); let removed=false, report:any, native=0; const children:any[]=[];
  const directory=path.join(tmpdir(),'ftlite-online-recovery-test');
  const proc:any={argv:['node','launcher'],env:{},cwd:()=>process.cwd(),execPath:process.execPath,exitCode:0};
  const fs={mkdtempSync:()=>directory,mkdirSync:()=>{if(fault==='report-directory')throw Error('private');},
    existsSync:()=>!removed,readdirSync:(p:string)=>{if(p===directory&&fault==='cleanup-observation')throw Error('private');return [];},
    readFileSync:()=>{if(fault==='artifact')throw Error('private');return Buffer.from('artifact');},
    writeFileSync:(_p:string,data:string)=>{report=JSON.parse(data);}};
  const childProcess={execFileSync:()=>{if(fault.startsWith('git'))throw Error('private');return 'revision';},spawn:()=>{
    const child:any=Object.assign(new EventEmitter(),{pid:123+children.length,stdout:new EventEmitter(),stderr:{resume(){}},exitCode:null,signalCode:null});children.push(child);
    if(fault!=='git-timeout')setTimeout(()=>{child.stdout.emit('data',Buffer.from('revision'));child.exitCode=fault==='git-failure'?1:0;child.emit('exit',child.exitCode);child.emit('close');},1);
    return child;
  }};
  const source=ts.transpileModule(readFileSync('scripts/network/online-recovery-smoke.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,esModuleInterop:true}}).outputText;
  runInNewContext(source,{exports:{},Error,process:proc,Buffer,AbortController,performance,setTimeout,clearTimeout,console:{error:()=>{},log:()=>{}},require:(name:string)=>{
    if(name==='node:child_process')return childProcess;if(name==='node:fs')return fs;if(name==='node:os')return {tmpdir};if(name==='node:path')return path;
    if(name==='node:crypto')return {createHash:()=>({update:()=>({digest:()=> 'a'.repeat(64)})})};if(name==='electron')return 'electron';
    if(name.endsWith('contentDigest'))return {computeContentDigest:()=> 'digest'};
    if(name.endsWith('online-app-runtime'))return {startOnlineAppRuntime:()=>{native++;throw Error('native-started');}};
    if(name.endsWith('online-recovery-report'))return {ONLINE_RECOVERY_ARTIFACTS:['artifact'],validateOnlineRecoveryReport:()=>{}};
    if(name.endsWith('online-app-diagnostics'))return {onlineAppFailureCode:()=> 'online-application-gate-failed'};
    if(name.endsWith('lease-smoke-lifecycle'))return {createLauncherDeadline,removeOwnedDirectory:async()=>{removed=true;},stopOwnedProcess:async(child:any)=>{child.exitCode=1;child.emit('exit',1);child.emit('close');}};
    throw Error(name);
  }});
  await vi.advanceTimersByTimeAsync(90000);
  expect(removed).toBe(true);expect(report).toBeDefined();expect(proc.exitCode).toBe(1);expect(report.runtime.temporaryRemoved).toBe(true);
  expect(report.elapsedMs).toBeLessThanOrEqual(report.budgetMs);expect(report.preparationProcesses.every((p:any)=>p.exited)).toBe(true);
  expect(native).toBe(fault==='cleanup-observation'?1:0);expect(vi.getTimerCount()).toBe(0);
  expect(report.failure).toBe(fault==='git-timeout'?'preparation-timeout':fault==='cleanup-observation'?'online-application-gate-failed':'preparation-failed');
});
