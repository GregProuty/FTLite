// Installed only by this gate in the production hidden page before any attempt.
// Every connection/channel and operation below delegates to Chromium's native
// implementation. The wrappers observe lifecycle and label deliberate faults.
module.exports = function observeNativeRtc(options = {}) {
  const Original = window.RTCPeerConnection, pcs = [], timers = new Set();
  const originalTimeout = window.setTimeout.bind(window), originalClear = window.clearTimeout.bind(window);
  window.setTimeout = (callback, ms, ...args) => {
    const id = originalTimeout(() => { timers.delete(id); callback(...args); }, ms); timers.add(id); return id;
  };
  window.clearTimeout = id => { timers.delete(id); originalClear(id); };
  function listeners(target) {
    const active = new Map(), add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, callback, options) => {
      let set = active.get(type); if (!set) active.set(type, set = new Set()); set.add(callback); add(type, callback, options);
    };
    target.removeEventListener = (type, callback, options) => { active.get(type)?.delete(callback); remove(type, callback, options); };
    return () => [...active.values()].reduce((sum, set) => sum + set.size, 0);
  }
  let drop = false, reorder = false, held, closeFragment = false, faultPc;
  const faults = { dropped: 0, reordered: 0, closedMidTransfer: 0 };
  window.RTCPeerConnection = new Proxy(Original, { construct(Target, args) {
    if (options.forceRelay === true) args = [{ ...args[0], iceTransportPolicy: 'relay' }];
    const pc = Reflect.construct(Target, args), record = { pc, channels: [], listenerCount: listeners(pc) }; pcs.push(record);
    function channel(dc) {
      if (record.channels.some(value => value.dc === dc)) return dc;
      const item = { dc, listenerCount: listeners(dc), sent: 0, received: 0, maxBytes: 0 };
      record.channels.push(item);
      // Native prototype listeners are observations, excluded from production counts.
      EventTarget.prototype.addEventListener.call(dc, 'message', () => { item.received++; });
      const send = dc.send.bind(dc);
      dc.send = data => {
        if (data instanceof ArrayBuffer) {
          item.sent++; item.maxBytes = Math.max(item.maxBytes, data.byteLength);
          const view = new DataView(data);
          if (pc === faultPc && dc.label === 'ftl-latest-v1' && view.getUint8(3) === 1) {
            if (drop) { drop = false; faults.dropped++; return; }
            if (reorder && !held) { held = { send, data: data.slice(0) }; return; }
            if (reorder && held) { const earlier = held; held = undefined; reorder = false; send(data); earlier.send(earlier.data); faults.reordered++; return; }
          }
          if (pc === faultPc && closeFragment && dc.label === 'ftl-reliable-v1' && view.getUint16(8) > 1 && view.getUint16(6) === 0) {
            closeFragment = false; send(data); faults.closedMidTransfer++; pc.close(); return;
          }
        }
        send(data);
      };
      return dc;
    }
    const create = pc.createDataChannel.bind(pc); pc.createDataChannel = (...values) => channel(create(...values));
    EventTarget.prototype.addEventListener.call(pc, 'datachannel', event => channel(event.channel));
    return pc;
  } });
  window.rtcNative = {
    closeAll() { for (const record of pcs) record.pc.close(); return true; },
    fault(kind) {
      faultPc = kind === 'mid-transfer' ? pcs.at(-1)?.pc : pcs[0]?.pc;
      if (kind === 'drop') drop = true; else if (kind === 'reorder') reorder = true; else if (kind === 'mid-transfer') closeFragment = true;
    },
    async status() {
      const connections = [];
      for (const item of pcs) {
        let direct = false, selected = false, lossAvailable = false, localType = null, remoteType = null;
        if (item.pc.connectionState !== 'closed') {
          const stats = await item.pc.getStats();
          stats.forEach(record => {
            if (record.type !== 'transport' || !record.selectedCandidatePairId) return;
            const pair = stats.get(record.selectedCandidatePairId);
            if (!pair || pair.state !== 'succeeded') return;
            selected = true;
            localType = stats.get(pair.localCandidateId)?.candidateType ?? null;
            remoteType = stats.get(pair.remoteCandidateId)?.candidateType ?? null;
            direct = stats.get(pair.localCandidateId)?.candidateType !== 'relay' && stats.get(pair.remoteCandidateId)?.candidateType !== 'relay';
            lossAvailable = typeof pair.packetsLost === 'number';
          });
        }
        connections.push({ state: item.pc.connectionState, selected, direct, lossAvailable, localType, remoteType, policy: item.pc.getConfiguration().iceTransportPolicy, listeners: item.listenerCount(),
          channels: item.channels.map(({ dc, listenerCount, sent, received, maxBytes }) => ({ label: dc.label, state: dc.readyState,
            ordered: dc.ordered, maxRetransmits: dc.maxRetransmits, maxPacketLifeTime: dc.maxPacketLifeTime,
            listeners: listenerCount(), sent, received, maxBytes })) });
      }
      return { connections, timers: timers.size, held: !!held, faults: { ...faults } };
    }
  };
};
