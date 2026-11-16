const r=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
function diff(a,b,path='botControllers') {
  if(a && b && typeof a==='object' && typeof b==='object') for(const key of new Set([...Object.keys(a),...Object.keys(b)])) diff(a[key],b[key],path+'.'+key);
  else if(a!==b) console.log(JSON.stringify({path,before:a,after:b}));
}
console.log(JSON.stringify({commandHighWater:r.proof.restored.commandHighWater,heldHighWater:r.proof.restored.heldHighWater}));
diff(r.proof.restored.botMemory,r.proof.pausedBaseline.botMemory);
