// The host Worker's entry (web build spec §3.2), built as out/renderer/assets/authorityWorker.js.
import { startAuthorityWorker, type AuthorityWorkerScope } from './authorityWorkerMain';

declare const __GAMEPLAY_CONTENT_DIGEST__: string;
startAuthorityWorker(self as unknown as AuthorityWorkerScope, __GAMEPLAY_CONTENT_DIGEST__);
