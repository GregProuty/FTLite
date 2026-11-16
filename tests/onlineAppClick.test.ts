import { createRequire } from 'node:module';
import { expect,it } from 'vitest';
const clickVerified=createRequire(import.meta.url)('../scripts/network/online-app-click.cjs');
it('recomputes a missed native target after reflow and stops once the target receives its click',async()=>{
  let frame=0;const received:number[]=[];
  const attempts=await clickVerified({prepare:async()=>++frame,send:(point:number)=>received.push(point),settle:async()=>{},observed:async()=>frame===1?'miss':'target'});
  expect(received).toEqual([1,2]);expect(attempts).toBe(2);
});
it('never retries a delivered different control or turns undelivered clicks into success',async()=>{
  let attempts=0;
  const driver={prepare:async()=>++attempts,send:()=>{},settle:async()=>{},observed:async()=> 'other'};
  await expect(clickVerified(driver)).rejects.toThrow();expect(attempts).toBe(1);
  attempts=0;await expect(clickVerified({...driver,observed:async()=> 'miss'})).rejects.toThrow();expect(attempts).toBe(3);
});
