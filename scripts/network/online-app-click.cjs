// Test driver only: a delivered click is never replayed, even if its action fails.
module.exports=async function clickVerified(driver) {
  for(let attempt=1;attempt<=3;attempt++) {
    const point=await driver.prepare(); driver.send(point); await driver.settle();
    const hit=await driver.observed();
    if(hit==='target') return attempt;
    if(hit!=='miss') throw Error('native-click-wrong-control');
  }
  throw Error('native-click-not-delivered');
};
