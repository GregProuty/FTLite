// TEST ONLY (Web-i Task 9): records every MessagePort the page creates through MessageChannel and whether it was later
// closed or transferred away (Worker, MessagePort or window postMessage transfer lists). The shared gate rule: once a page
// transport is disposed, every page MessagePort it owned is closed. A DOM 'close' event is not reliable, so close()
// and the transfer-taking postMessage methods are wrapped instead. Installed once per page, before any channel exists.
type PortState = 'open' | 'closed' | 'transferred';
const tracked = new Map<MessagePort, PortState>();
let installed = false;

function transferList(argument: unknown): unknown[] {
  if (Array.isArray(argument)) return argument;
  const transfer = (argument as { transfer?: unknown } | null | undefined)?.transfer;
  return Array.isArray(transfer) ? transfer : [];
}
function markTransferred(list: unknown[]): void {
  for (const item of list) if (item instanceof MessagePort && tracked.get(item) === 'open') tracked.set(item, 'transferred');
}

export function trackPagePorts(): { created: number; open: number; closed: number; transferred: number } {
  if (!installed) {
    installed = true;
    const NativeChannel = globalThis.MessageChannel;
    globalThis.MessageChannel = class TrackedMessageChannel extends NativeChannel {
      constructor() { super(); tracked.set(this.port1, 'open'); tracked.set(this.port2, 'open'); }
    };
    const nativeClose = MessagePort.prototype.close;
    MessagePort.prototype.close = function (this: MessagePort) {
      if (tracked.get(this) === 'open') tracked.set(this, 'closed');
      return nativeClose.call(this);
    };
    const nativePortPost = MessagePort.prototype.postMessage as (this: MessagePort, message: unknown, transfer?: unknown) => void;
    MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, transfer?: unknown) {
      nativePortPost.call(this, message, transfer as never); markTransferred(transferList(transfer));
    } as typeof MessagePort.prototype.postMessage;
    const nativeWorkerPost = Worker.prototype.postMessage as (this: Worker, message: unknown, transfer?: unknown) => void;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, transfer?: unknown) {
      nativeWorkerPost.call(this, message, transfer as never); markTransferred(transferList(transfer));
    } as typeof Worker.prototype.postMessage;
    const nativeWindowPost = window.postMessage.bind(window) as (message: unknown, target?: unknown, transfer?: unknown) => void;
    window.postMessage = ((message: unknown, target?: unknown, transfer?: unknown) => {
      nativeWindowPost(message, target, transfer); markTransferred(transferList(typeof target === 'string' ? transfer : target));
    }) as typeof window.postMessage;
  }
  const states = [...tracked.values()];
  return { created: states.length, open: states.filter(s => s === 'open').length,
    closed: states.filter(s => s === 'closed').length, transferred: states.filter(s => s === 'transferred').length };
}
