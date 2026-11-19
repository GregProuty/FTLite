// Unsupported browsers (web build spec §7.7): the online stack needs these APIs; without one, Multiplayer is replaced by
// the text below and Single player still runs. Safari passes and gets a one-line note. The texts are the spec's, exact.
export const UNSUPPORTED_TEXT = 'FTLite needs a recent Chrome, Edge or Firefox on a computer.';
export const SAFARI_NOTE = 'Safari is not tested';
export const ONE_TAB_TEXT = 'FTLite is already open in another tab';
export interface SupportGlobals {
  RTCPeerConnection?: unknown; Worker?: unknown; indexedDB?: unknown; MessageChannel?: unknown;
  crypto?: { subtle?: unknown; getRandomValues?: unknown };
  navigator?: { locks?: unknown; userAgent?: string; vendor?: string };
}
export function isSafari(userAgent: string, vendor: string): boolean {
  return /Apple/.test(vendor) && /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR|Firefox|Electron)\//.test(userAgent);
}
export function checkBrowserSupport(g: SupportGlobals): { ok: boolean; missing: string[]; safari: boolean } {
  const checks: [string, boolean][] = [
    ['RTCPeerConnection', typeof g.RTCPeerConnection === 'function'], ['Worker', typeof g.Worker === 'function'],
    ['indexedDB', !!g.indexedDB && typeof g.indexedDB === 'object'], ['crypto.subtle', !!g.crypto?.subtle],
    ['crypto.getRandomValues', typeof g.crypto?.getRandomValues === 'function'], ['MessageChannel', typeof g.MessageChannel === 'function'],
    ['navigator.locks', !!g.navigator?.locks]];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { ok: missing.length === 0, missing, safari: isSafari(g.navigator?.userAgent ?? '', g.navigator?.vendor ?? '') };
}
