import { buildDuelObservers, buildOnlineObservers } from './online-observer-build';
const [directory,digest,kind]=process.argv.slice(2);
if(!directory||!digest||(kind!==undefined&&kind!=='duel'))throw Error('observer-arguments-invalid');
(kind==='duel'?buildDuelObservers:buildOnlineObservers)(directory,digest).then(()=>process.exit(0),()=>process.exit(1));
