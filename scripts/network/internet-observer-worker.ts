import { buildOnlineObservers } from './online-observer-build';
const [directory,digest]=process.argv.slice(2);
if(!directory||!digest)throw Error('observer-arguments-invalid');
buildOnlineObservers(directory,digest).then(()=>process.exit(0),()=>process.exit(1));
