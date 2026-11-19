import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const iife = (directory:string,digest:string,entry:string,name:string,fileName:string) => build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
  build:{outDir:join(directory,'observer'),emptyOutDir:false,lib:{entry:resolve(entry),name,formats:['iife'],fileName:()=>fileName}}});
/** Web-i: the page probe every app gate injects before any page script (scripts/network/page-probe.ts). */
const buildPageProbe = (directory:string,digest:string) => iife(directory,digest,'scripts/network/page-probe.ts','OnlinePageProbe','page-probe.js');
/** Test-only production observers, shared by local and internet launchers. */
export async function buildOnlineObservers(directory:string,digest:string) {
  await iife(directory,digest,'scripts/network/online-app-observer.ts','OnlineObserver','observer.js');
  await buildPageProbe(directory,digest);
  // reconciledMemory for the wrapper (Node), and the same source as the recovery gate's Worker prelude (Web-i).
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',lib:{entry:resolve('scripts/network/online-recovery-utility.ts'),formats:['cjs'],fileName:()=>'utility.cjs'}}});
  await iife(directory,digest,'scripts/network/online-recovery-utility.ts','RecoveryWorkerObserver','recovery-worker.js');
}
/** The duel's passive observer (H-2 spec §10) and a no-op utility proof: a duel checkpoint has no sector card memory. */
export async function buildDuelObservers(directory:string,digest:string) {
  await iife(directory,digest,'scripts/network/duel-app-observer.ts','DuelObserver','observer.js');
  await buildPageProbe(directory,digest);
  writeFileSync(join(directory,'observer','utility.cjs'),'module.exports = { reconciledMemory: () => null };\n');
}
