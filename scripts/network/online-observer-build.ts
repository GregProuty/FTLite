import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
/** Test-only production observers, shared by local and internet launchers. */
export async function buildOnlineObservers(directory:string,digest:string) {
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,lib:{entry:resolve('scripts/network/online-app-observer.ts'),name:'OnlineObserver',formats:['iife'],fileName:()=>'observer.js'}}});
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',lib:{entry:resolve('scripts/network/online-recovery-utility.ts'),formats:['cjs'],fileName:()=>'utility.cjs'},rollupOptions:{external:['node:fs']}}});
}
/** The duel's passive observer (H-2 spec §10) and a no-op utility proof: a duel checkpoint has no sector card memory. */
export async function buildDuelObservers(directory:string,digest:string) {
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,lib:{entry:resolve('scripts/network/duel-app-observer.ts'),name:'DuelObserver',formats:['iife'],fileName:()=>'observer.js'}}});
  writeFileSync(join(directory,'observer','utility.cjs'),'module.exports = { reconciledMemory: () => null };\n');
}
