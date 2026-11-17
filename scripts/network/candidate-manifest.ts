// Local, read-only artifact audit. No env files, account queries or provider calls.
import { createHash } from 'node:crypto';
import { readFileSync,readdirSync,writeFileSync,mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname,normalize } from 'node:path';
import { createRequire } from 'node:module';
import { computeContentDigest } from '../../build/contentDigest';
import { assertCandidateServiceOrigin } from './internet-app-manifest';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const hash=(path:string)=>sha(readFileSync(path));
const args=new Map(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)];}));
const packagePath=args.get('--package-path'),appDirectory=args.get('--app-directory'),output=args.get('--output');
if(!packagePath||!appDirectory||!output)throw Error('candidate-arguments-invalid');
const serviceOrigin='https://ftlite-signalling-dev.gprout009.workers.dev';
const asarPath=appDirectory+'/resources/app.asar';
const main=asar.extractFile(asarPath,normalize('out/main/index.js')).toString('utf8');
assertCandidateServiceOrigin({serviceOrigin,identity:{serviceOrigin}},serviceOrigin,main);
const entries:string[]=asar.listPackage(asarPath).map((p:string)=>p.replaceAll('\\','/').replace(/^\//,''));
if(entries.some(p=>/(^|\/)\.env|(^|\/)\.dev\.vars|(^|\/)(\.superpowers|test-results|scripts|tests|profiles)(\/|$)/i.test(p)))throw Error('package-content-invalid');
const files=(root:string)=>readdirSync(root,{recursive:true,withFileTypes:true}).filter(d=>d.isFile()).map(d=>(d.parentPath+'/'+d.name).replaceAll('\\','/'));
// The packaged build only (electron-builder.yml packs out/main, out/preload and out/renderer); smoke evidence under out/ is not part of it.
const artifacts=Object.fromEntries(['out/main','out/preload','out/renderer'].flatMap(files).filter(p=>!p.endsWith('/.gitkeep')).sort().map(p=>{const bytes=asar.extractFile(asarPath,normalize(p));if(sha(bytes)!==hash(p))throw Error('package-build-mismatch');return [p,sha(bytes)];}));
if(Object.keys(artifacts).filter(p=>/^out\/(preload|renderer)\//.test(p)&&/\.(js|html)$/.test(p)).some(p=>readFileSync(p,'utf8').includes(serviceOrigin)))throw Error('renderer-origin-invalid');
const sourceFiles=Object.fromEntries([...['src','scripts','build'].flatMap(files),...['package.json','package-lock.json','electron.vite.config.ts','electron-builder.yml']].sort().map(p=>[p,hash(p)]));
const rootLock=JSON.parse(readFileSync('package-lock.json','utf8')),serviceLock=JSON.parse(readFileSync('services/signalling/package-lock.json','utf8'));
const versions=(lock:any,names:string[])=>Object.fromEntries(names.map(name=>[name,lock.packages['node_modules/'+name].version]));
const manifest={version:1,serviceOrigin,packagePath,identity:{serviceOrigin,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim(),digest:computeContentDigest(process.cwd()),packageSha256:hash(packagePath),workerBundleSha256:hash('services/signalling/dist/index.js'),workerConfigSha256:hash('services/signalling/wrangler.jsonc'),artifacts,versions:{electron:'37.10.3',wrangler:'4.156.0',workerd:'1.20261023.1',protocol:2,sim:SIM_VERSION,checkpoint:2,replay:[2,3,4]}},sourceFiles,
  package:{asarSha256:hash(asarPath),executableSha256:hash(appDirectory+'/FTLite.exe'),entryCount:entries.length,entries},
  toolVersions:{node:process.version,root:versions(rootLock,['electron','electron-builder','electron-vite','vite','vitest','typescript','tsx','pixi.js','zod','bitecs']),service:versions(serviceLock,['wrangler','workerd','miniflare','@cloudflare/workers-types','@cloudflare/vitest-plugin','vitest','typescript'])},
  worker:{name:'ftlite-signalling-dev',bundleSha256:hash('services/signalling/dist/index.js'),configSha256:hash('services/signalling/wrangler.jsonc'),lockSha256:hash('services/signalling/package-lock.json')}};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');console.log('Candidate package audit PASS: exact out/main, out/preload and out/renderer bytes, no env, test profiles or evidence.');
