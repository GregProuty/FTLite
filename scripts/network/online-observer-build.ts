import { build } from 'vite';
import { join, resolve } from 'node:path';
/** Test-only production observers, shared by local and internet launchers. */
export async function buildOnlineObservers(directory:string,digest:string) {
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,lib:{entry:resolve('scripts/network/online-app-observer.ts'),name:'OnlineObserver',formats:['iife'],fileName:()=>'observer.js'}}});
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',lib:{entry:resolve('scripts/network/online-recovery-utility.ts'),formats:['cjs'],fileName:()=>'utility.cjs'},rollupOptions:{external:['node:fs']}}});
}
