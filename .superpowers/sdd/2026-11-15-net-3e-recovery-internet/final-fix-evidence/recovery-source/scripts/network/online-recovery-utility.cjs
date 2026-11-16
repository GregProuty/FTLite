// Test wrapper: observe real utility messages, then load the exact built entry.
const [observer, evidence, entry] = process.argv.slice(2);
process.on('uncaughtException',error=>{require('node:fs').writeFileSync(evidence+'.error.json',JSON.stringify({code:['EPERM','EACCES','EBUSY'].includes(error?.code)?error.code:'utility-observer-uncaught'}));process.exit(1);});
require(observer).observeUtility(process.parentPort,evidence);
const fs=require('node:fs'), crypto=require('node:crypto'), Module=require('node:module');
const source=fs.readFileSync(entry,'utf8'), transformed=require('./online-recovery-instrument.cjs')(source);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(evidence+'.instrumentation.json',JSON.stringify({sourceSha256:hash(source),observedSha256:hash(transformed),transformSha256:hash(fs.readFileSync(require.resolve('./online-recovery-instrument.cjs')))}));
const observed=new Module(entry,module); observed.filename=entry; observed.paths=Module._nodeModulePaths(require('node:path').dirname(entry)); observed._compile(transformed,entry);
