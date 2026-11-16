// TEST ONLY passive utility-side stream observation. No coordinator or input source.
import { writeFileSync, renameSync } from 'node:fs';
import { classifyStreamPacket, decodeOpaquePacket, decodeState, decodeStatePacket, ImageStore, inspectState } from '../../src/network/state/imageCodec';
import { imageToPublication } from '../../src/network/modes/sectorStream';
import { decodeMessage } from '../../src/renderer/src/net/codec';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { loadSnapshot } from '../../src/renderer/src/sim/snapshot';
import { disposeSimState } from '../../src/renderer/src/sim/state';
import { reconcileUi } from '../../src/renderer/src/clientControl/cardController';
/** Read-only expected first publication for dormant UI; no authority or producer runs. */
export function reconciledMemory(checkpoint:any) {
  const layout=[parseShip(skiff),parseShip(cutter)].find(l=>l.id===checkpoint.init.layoutId)!;
  const state=loadSnapshot(layout,checkpoint.snapshot,checkpoint.init.contentDigest);
  try { return checkpoint.botControllers.map((ui:any)=>{
    const next=structuredClone(ui); reconcileUi(state,next,checkpoint.init.runId,checkpoint.commandHighWater);
    next.players.forEach((p:any,i:number)=>{p.nextSequence=checkpoint.commandHighWater[i]+1;p.heldSequence=checkpoint.heldHighWater[i];});return next;
  }); } finally { disposeSimState(state); }
}
export function observeUtility(parent: any, path: string) {
  const layouts = [parseShip(skiff),parseShip(cutter)], requests = new Map<string,number>(), grants = new Map<number,number>();
  const evidence: any = { pid:process.pid, requests:0, grants:0, tick:0, phase:'paused', lastAdvanceMs:0, afterDeadlineInputs:0, unavailableResults:0, lateReplyRejected:0, errors:0 };
  (globalThis as any).__recoveryLease = (event:any) => {
    if(event.kind==='request') {
      requests.set(event.nonce,event.startedMs); evidence.requests++;
      while(requests.size>8) requests.delete(requests.keys().next().value!);
    } else if(event.kind==='accepted') {
      const {kind,...lease}=event;
      evidence.acceptedLease=lease;
      evidence.deadlineMs=event.deadlineMs;
    }
  };
  (globalThis as any).__recoveryPermission = (event:any) => {
    const key=event.boundary;
    const boundary=(evidence.permissions??={})[key]??={allowed:0,denied:0,postDeadlineAllowed:0,lastAllowedMs:0};
    if(event.allowed) { boundary.allowed++; boundary.lastAllowedMs=event.atMs; if(event.atMs>=evidence.deadlineMs) boundary.postDeadlineAllowed++; }
    else boundary.denied++;
  };
  const save = () => {
    try { writeFileSync(path+'.tmp',JSON.stringify(evidence)); renameSync(path+'.tmp',path); }
    catch(error) {
      // Windows can deny replacement while the launcher has the prior sample open.
      // Retain one latest sample and retry on the next observation; never stall authority.
      if(!['EPERM','EACCES','EBUSY'].includes((error as any)?.code)) throw error;
      evidence.observationWriteRetries=(evidence.observationWriteRetries??0)+1;
    }
  };
  const send = parent.postMessage.bind(parent);
  parent.postMessage = (message: any) => {
    if(message.kind==='response' && grants.has(message.response.requestId)) {
      const start = grants.get(message.response.requestId)!; grants.delete(message.response.requestId);
      if(message.response.ok) { evidence.grants++; if(!evidence.acceptedLease || evidence.acceptedLease.startedMs!==start) evidence.errors++; }
      else if(performance.now()>=start+12000) { evidence.lateReplyRejected++; writeFileSync(path+'.late.json',JSON.stringify(evidence)); }
      save();
    }
    return send(message);
  };
  parent.on('message',(event:any)=>{
    const message=event.data;
    if(message.kind==='lease-grant') {
      const started=requests.get(message.request.nonce);
      if(started===undefined) evidence.errors++;
      else grants.set(message.requestId,started);
    }
    if(message.kind==='initialize') { evidence.utilityEpoch=message.sessionLease.utilityEpoch; evidence.hostGeneration=message.hostGeneration; save(); }
    if(message.kind!=='attach') return;
    const port=event.ports[0], post=port.postMessage.bind(port), images=new ImageStore();
    port.on('message',(event:any)=>{ try { const d=event.data; if(d?.type==='data' && classifyStreamPacket(new Uint8Array(d.bytes)).class==='input' && performance.now()>=evidence.deadlineMs) { evidence.afterDeadlineInputs++; save(); } } catch { evidence.errors++; save(); } });
    port.postMessage=(frame:any)=>{
      try {
        if(frame?.type==='data') {
          const bytes=new Uint8Array(frame.bytes), meta=classifyStreamPacket(bytes);
          if(meta.stream==='state') {
            const data=decodeStatePacket(bytes), header=inspectState(data), image=decodeState(data,images.get(header.baseSequence)); images.put(image,header.baseSequence?[header.baseSequence]:[]);
            const p=imageToPublication(image,{resolveLayout:id=>layouts.find(l=>l.id===id)!});
            if(p.tick>evidence.tick || p.commandHighWater.some((n,i)=>n>(evidence.commandHighWater?.[i]??0))) evidence.lastAdvanceMs=performance.now();
            Object.assign(evidence,{tick:p.tick,phase:p.phase,hash:p.hash,scheduledTickMs:p.tickTimeMs,commandHighWater:p.commandHighWater,heldHighWater:p.heldHighWater}); save();
          } else if(meta.stream==='sector-notification') {
            const result:any=decodeMessage(decodeOpaquePacket(bytes).bytes.subarray(9));
            if(result.kind==='result' && result.result.reason==='unavailable' && performance.now()>=evidence.deadlineMs) { evidence.unavailableResults++; save(); }
          }
        }
      } catch { evidence.errors++; save(); }
      return post(frame);
    };
    port.on('close',()=>images.clear());
  });
  const timer=setInterval(()=>{ evidence.observedMs=performance.now(); save(); },100);
  timer.unref(); save();
}
