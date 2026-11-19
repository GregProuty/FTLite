// Audio in the browser (web build spec §7.3, deviation W-7): the AudioContext resumes on the first key or pointer event
// (the first menu click) and on every focus; audio.unlock is guarded inside, so repeats are harmless.
export interface UnlockTarget { addEventListener(type: string, fn: () => void, opts?: AddEventListenerOptions): void; removeEventListener(type: string, fn: () => void): void }
export function installAudioUnlock(target: UnlockTarget, audio: { unlock(): void }): () => void {
  const unlock = (): void => audio.unlock();
  target.addEventListener('keydown', unlock, { once: true }); target.addEventListener('pointerdown', unlock, { once: true }); target.addEventListener('focus', unlock);
  return () => { for (const type of ['keydown', 'pointerdown', 'focus']) target.removeEventListener(type, unlock); };
}
