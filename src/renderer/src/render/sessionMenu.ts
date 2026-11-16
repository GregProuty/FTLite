import type { OnlineErrorCode, OnlinePreloadApi, OnlineResult, OnlineStatus } from '../../../shared/onlineSession';
import type { ControlSection } from '../app/controls';
import { VOLUME_STEPS } from '../app/settingsStore';
type MenuApi = Pick<OnlinePreloadApi, 'host' | 'join' | 'ready' | 'start' | 'removeSeat' | 'reconnect' | 'rehost' | 'retry' | 'leave' | 'forgetSeat'>;
/** What Settings can change (main menu spec): the sound volume (saved by the caller), the window's fullscreen state
 *  (live, when the preload bridge offers it) and the read-only controls list. */
export interface MenuSettings {
  volume(): number; setVolume(value: number): void;
  fullscreen?: { get(): Promise<boolean>; set(on: boolean): Promise<boolean> };
  controls: readonly ControlSection[];
}
interface MenuDeps { root: HTMLElement; document: Pick<Document, 'createElement'>; api?: MenuApi; single(): void; online(): void; pause(): void; inputBlocked(value: boolean): void; home?(): void; settings?: MenuSettings }
type Page = 'home' | 'multiplayer' | 'settings' | 'host' | 'join' | 'session' | 'single';
const ERRORS: Partial<Record<OnlineErrorCode, string>> = {
  'online-disabled': 'Online play needs a configured local service. Single player is available.',
  'not-found': 'Room not found. Check the eight-character code and try again.',
  'incompatible': 'This room needs compatible game content and ship data. Check both versions, then try again.',
  'unauthorized': 'This seat is no longer authorized. Return to the menu or forget the saved seat.',
  'host-lost': 'Host disconnected. Reconnect or re-host the last committed checkpoint when available.',
  'no-checkpoint': 'No committed checkpoint is available for this room.',
  'save-invalid': 'The saved checkpoint is corrupt or incompatible. Reconnect to check the service again.',
  'save-too-large': 'The saved checkpoint exceeds the size limit.',
  'save-unavailable': 'The latest save could not be committed. Recovery uses the last committed checkpoint.',
  'conflict': 'Another player may have claimed this room. Reconnect to check the current host.',
  'suspended': 'Online play stopped when the computer suspended. Reconnect explicitly to continue.',
  'retry-exhausted': 'Reconnection timed out. Retry to make a new attempt.',
  'storage-write-failed': 'Your seat could not be saved. This session can play, but restart recovery is unavailable.',
};
export function createSessionMenu(deps: MenuDeps) {
  let status: OnlineStatus | null = null, page: Page = 'home', fullscreen: boolean | null = null;
  let pending = false, disposed = false, localError = '', hadView = false;
  let operation = 0, countdown: HTMLElement | null = null, mirrorLabel: HTMLElement | null = null, receiptAt = 0;
  let recovering = false;
  const { root, document: doc } = deps;
  root.setAttribute('aria-label', 'FTLite session menu'); root.setAttribute('data-testid', 'session-menu');
  function node(tag: string, text = '', id?: string) {
    const el = doc.createElement(tag); el.textContent = text; if (id) el.setAttribute('data-testid', id); return el;
  }
  const can = (action: OnlineStatus['actions'][number]) => !!deps.api && !!status?.actions.includes(action) && !pending;
  function button(parent: HTMLElement, id: string, text: string, action: () => void, enabled = true) {
    const b = node('button', text, id) as HTMLButtonElement; b.type = 'button'; b.disabled = !enabled;
    b.style.cssText = `font:inherit;color:#d7e4f0;background:#172333;border:1px solid #52718d;padding:9px 14px;margin:4px;cursor:${enabled ? 'pointer' : 'default'}${enabled ? '' : ';opacity:.45'}`;
    b.addEventListener('click', action); parent.append(b); return b;
  }
  async function invoke(action: () => Promise<OnlineResult>, enter = true, interrupt = false) {
    if (pending && !interrupt || disposed) return; const id = ++operation; pending = true; localError = '';
    if (enter) { page = 'session'; deps.online(); } render();
    try { const result = await action(); if (id === operation && !result.ok) localError = ERRORS[result.code] ?? `Online request failed (${result.code}). Try again.`; }
    catch { if (id === operation) localError = 'Online request failed. Try again.'; }
    finally { if (id === operation) { pending = false; if (!disposed) render(); } }
  }
  function render() {
    if (disposed) return;
    countdown = null; mirrorLabel = null;
    const playing = page === 'session' && hadView;
    deps.inputBlocked(!playing);   // single player's duel owns its own keyboard; online input stays blocked there
    if (page === 'single') { root.style.cssText = 'display:none'; root.replaceChildren(); return; }
    root.style.cssText = playing
      ? 'position:fixed;left:0;right:0;top:0;z-index:20;color:#d7e4f0;background:#0b111be8;font:14px monospace;padding:6px 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap'
      : 'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:#05060af2;color:#d7e4f0;font:16px monospace';
    const panel = node('section'); panel.style.cssText = playing ? 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' : 'width:min(620px,88vw);max-height:88vh;overflow:auto;scrollbar-color:#52718d #0b111b;box-sizing:border-box;padding:30px;border:1px solid #52718d;background:#0b111b;box-shadow:0 12px 70px #000';
    root.replaceChildren(panel);
    if (!playing) { panel.append(node('h1', 'FTLite')); panel.append(node('p', 'Crew together. Keep the ship flying.')); }
    if (page === 'multiplayer' || page === 'settings') panel.append(node('h2', page === 'multiplayer' ? 'Multiplayer' : 'Settings', 'page-title'));
    const phaseMessage = status?.phase === 'rehosting' ? 'Restoring the mirrored checkpoint…'
      : status?.phase === 'saving' ? 'Saving the final checkpoint…'
      : recovering && status?.phase === 'paused' && status.mirror.committed ? `Restored at tick ${status.mirror.committed.capturedTick}. Paused.` : null;
    const message = localError || phaseMessage || (status?.error ? ERRORS[status.error] ?? `Online stopped (${status.error}). Retry or leave.` : page === 'session' ? `${status?.phase ?? 'Connecting'}${pending ? '…' : ''}` : page === 'multiplayer' ? 'Host a crew or join one with its room code.' : page === 'settings' ? '' : 'Choose how to play.');
    const live = node('p', message, 'status'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); panel.append(live);
    if (page === 'home') {
      const items = node('nav'); items.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:2px;max-width:280px';
      button(items, 'single-player', 'Single player', () => { localError = ''; page = 'single'; render(); deps.single(); });
      button(items, 'multiplayer', 'Multiplayer', () => { localError = ''; page = 'multiplayer'; render(); });
      button(items, 'settings', 'Settings', () => { localError = ''; page = 'settings'; render(); readFullscreen(); });
      panel.append(items);
    } else if (page === 'multiplayer') {
      button(panel, 'host', 'Host', () => { hadView = false; page = 'host'; render(); }, can('host'));
      button(panel, 'join', 'Join', () => { hadView = false; page = 'join'; render(); }, can('join'));
      if (status?.actions.includes('reconnect')) button(panel, 'reconnect', 'Reconnect saved seat', () => { void invoke(() => deps.api!.reconnect()); }, can('reconnect'));
      if (status?.actions.includes('forget-seat')) button(panel, 'forget-seat', 'Forget saved seat', () => { void invoke(() => deps.api!.forgetSeat(), false); }, can('forget-seat'));
      panel.append(node('p', !deps.api || status?.phase === 'idle' && !status.actions.includes('host') && !status.actions.includes('join') ? ERRORS['online-disabled']! : 'Reconnect your saved seat to check the host and the last committed checkpoint.', 'online-availability'));
      button(panel, 'back', 'Back', () => { page = 'home'; localError = ''; render(); }, !pending);
    } else if (page === 'settings') {
      renderSettings(panel);
      button(panel, 'back', 'Back', () => { page = 'home'; render(); });
    } else if (page === 'host' || page === 'join') {
      const host = page === 'host', form = node('form', '', host ? 'host-form' : 'join-form');
      const label = node('label', host ? 'Crew capacity' : 'Room code');
      const control = doc.createElement(host ? 'select' : 'input') as HTMLInputElement | HTMLSelectElement;
      control.setAttribute('data-testid', host ? 'capacity' : 'join-code'); control.setAttribute('aria-label', host ? 'Crew capacity' : 'Room code');
      control.style.cssText = 'display:block;margin:10px 0;padding:10px;background:#172333;color:#d7e4f0;border:1px solid #52718d;font:inherit';
      if (host) { for (let n = 1; n <= 4; n++) { const option = node('option', `${n} crew — ${n <= 2 ? 'Skiff' : 'Cutter'}`) as HTMLOptionElement; option.value = String(n); control.append(option); } control.value = '2'; }
      else { (control as HTMLInputElement).maxLength = 32; control.setAttribute('autocomplete', 'off'); control.setAttribute('spellcheck', 'false'); }
      label.append(control); form.append(label);
      const submit = button(form, host ? 'create-room' : 'join-room', host ? 'Create room' : 'Join room', () => {}, can(host ? 'host' : 'join')); submit.type = 'submit';
      form.addEventListener('submit', event => { event.preventDefault(); if (pending) return;
        if (host) void invoke(() => deps.api!.host(Number(control.value)));
        else { const code = control.value.trim().toUpperCase(); if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code)) { localError = 'Enter an eight-character room code.'; render(); return; } void invoke(() => deps.api!.join(code)); }
      }); panel.append(form); button(panel, 'back', 'Back', () => { page = 'multiplayer'; localError = ''; render(); }, !pending); control.focus();
    } else {
      const room = status?.snapshot;
      if (room) {
        panel.append(node('strong', `ROOM ${room.joinCode}`, 'room-code'));
        panel.append(node('span', `You are Player ${(status!.ownSeat ?? 0) + 1}`, 'assigned-seat'));
        const roster = node(playing ? 'span' : 'ul', '', 'roster');
        for (let pid = 0; pid < room.capacity; pid++) {
          const seat = room.seats.find(s => s.seatId === pid);
          const line = node(playing ? 'span' : 'li', ` P${pid + 1}: ${!seat?.occupied ? 'Bot' : !seat.connected ? 'Bot (human disconnected)' : seat.ready ? 'Ready' : 'Not ready'} `);
          if (status?.role === 'host' && seat?.occupied && pid !== status.ownSeat && status.phase === 'lobby') button(line, `remove-seat-${pid}`, `Remove Player ${pid + 1}`, () => { void invoke(() => deps.api!.removeSeat(pid)); }, can('remove-seat'));
          roster.append(line);
        } panel.append(roster);
      }
      if (status?.phase === 'lobby') {
        const ready = room?.seats.find(s => s.seatId === status!.ownSeat)?.ready ?? false;
        button(panel, 'ready', ready ? 'Not ready' : 'Ready', () => { void invoke(() => deps.api!.ready(!ready)); }, can('ready'));
        if (status.role === 'host') button(panel, 'start', 'Start', () => { void invoke(() => deps.api!.start()); }, can('start') && !!room?.seats.every(s => !s.occupied || s.ready && s.connected));
      }
      if (status?.phase === 'running' || status?.phase === 'paused') button(panel, 'pause', status.phase === 'paused' ? 'Resume' : 'Pause', deps.pause);
      if (status?.mirror.committed) {
        mirrorLabel = node('span', '', 'mirror-status'); panel.append(mirrorLabel); updateReceipt();
        if (['saved', 'rehosting'].includes(status.phase)) panel.append(node('span', 'Recovery may roll back actions after this checkpoint.', 'rollback-warning'));
      }
      if (status?.mirror.localPending) panel.append(node('span', 'Local pending save: not committed to the service.', 'pending-save'));
      if (status?.mirror.error) panel.append(node('span', ERRORS[status.mirror.error] ?? 'Checkpoint storage is unavailable.', 'mirror-error'));
      if (status?.phase === 'saved' || status?.phase === 'rehosting') button(panel, 'rehost', 'Re-host', () => { void invoke(() => deps.api!.rehost()); }, can('rehost'));
      if (status?.retryAtMs !== null && status?.retryAtMs !== undefined) { countdown = node('span', 'Reconnecting saved seat…', 'reconnect-countdown'); panel.append(countdown); }
      if (status && !status.persistent && status.snapshot) panel.append(node('span', 'Seat not saved: restart recovery unavailable.', 'storage-warning'));
      if (status?.actions.includes('retry')) button(panel, 'retry', 'Retry', () => { void invoke(() => deps.api!.retry()); }, can('retry'));
      if (status?.actions.includes('reconnect')) button(panel, 'reconnect', 'Reconnect saved seat', () => { void invoke(() => deps.api!.reconnect()); }, can('reconnect'));
      if (status?.actions.includes('forget-seat')) button(panel, 'forget-seat', 'Forget saved seat', () => { void invoke(() => deps.api!.forgetSeat(), false, true); }, !!deps.api);
      if (status?.actions.includes('leave')) button(panel, 'leave', status.phase === 'ended' ? 'Return to menu' : 'Leave', () => { void invoke(() => deps.api!.leave(), false, true).then(() => { if (status?.phase === 'idle') { deps.home?.(); hadView = false; page = 'home'; render(); } }); }, !!deps.api);
      if (!pending && status?.actions.includes('join')) button(panel, 'try-code', 'Try another code', () => { hadView = false; page = 'join'; render(); });
      if (!pending && (!status || status.phase === 'idle' || status.phase === 'error')) button(panel, 'home', 'Return to menu', () => { deps.home?.(); hadView = false; page = 'home'; render(); });
    }
  }
  function readFullscreen() {
    void deps.settings?.fullscreen?.get().then(on => { fullscreen = on; if (page === 'settings') render(); }, () => {});
  }
  function renderSettings(panel: HTMLElement) {
    const settings = deps.settings;
    const label = node('label', 'Sound volume');
    const volume = doc.createElement('select') as HTMLSelectElement;
    volume.setAttribute('data-testid', 'volume'); volume.setAttribute('aria-label', 'Sound volume');
    volume.style.cssText = 'display:block;margin:8px 0 14px;padding:8px;background:#172333;color:#d7e4f0;border:1px solid #52718d;font:inherit';
    for (const step of VOLUME_STEPS) { const option = node('option', step === 0 ? 'Off' : `${Math.round(step * 100)}%`) as HTMLOptionElement; option.value = String(step); volume.append(option); }
    volume.value = String(settings?.volume() ?? 1); volume.disabled = !settings;
    volume.addEventListener('change', () => { settings?.setVolume(Number(volume.value)); });
    label.append(volume); panel.append(label);
    const fs = settings?.fullscreen;
    button(panel, 'fullscreen', `Fullscreen: ${fullscreen === null ? '…' : fullscreen ? 'On' : 'Off'}`, () => {
      if (!fs || fullscreen === null) return;
      void fs.set(!fullscreen).then(on => { fullscreen = on; if (page === 'settings') render(); }, () => {});
    }, !!fs && fullscreen !== null);
    panel.append(node('p', 'F11 also toggles fullscreen.', 'fullscreen-note'));
    const controls = node('div', '', 'controls');
    controls.append(node('h3', 'Controls'));
    for (const section of settings?.controls ?? []) {
      controls.append(node('h4', section.title));
      const table = node('table'); table.style.cssText = 'border-collapse:collapse;font-size:13px;margin-bottom:8px';
      for (const row of section.rows) {
        const tr = node('tr'), keys = node('td', row.keys), action = node('td', row.action);
        keys.style.cssText = 'padding:2px 14px 2px 0;color:#f0c674;white-space:nowrap;vertical-align:top'; action.style.cssText = 'padding:2px 0';
        tr.append(keys, action); table.append(tr);
      }
      controls.append(table);
    }
    panel.append(controls);
  }
  function updateReceipt() {
    if (!mirrorLabel || !status?.mirror.committed) return;
    const age = status.mirror.receivedAgeMs;
    mirrorLabel.textContent = `Last mirrored checkpoint: tick ${status.mirror.committed.capturedTick}, ${age === null ? 'receipt age unknown' : `received ${Math.floor((age + Math.max(0, performance.now() - receiptAt)) / 1000)}s ago`}.`;
  }
  render();
  return {
    reservedHeight() { return page === 'session' && hadView ? root.offsetHeight : 0; },
    setStatus(next: OnlineStatus) { status = next; receiptAt = performance.now(); if (['saved', 'rehosting', 'reconnecting'].includes(next.phase)) recovering = true; if (next.phase === 'idle' || next.phase === 'running') recovering = false; if (next.attachmentEpoch > 0) hadView = true; if (page !== 'single' && next.phase !== 'idle') page = 'session'; if (next.phase === 'idle' && page === 'session' && !pending && !hadView) page = 'home'; render(); },
    /** Single player has ended (M in the duel): show the main menu again. */
    leaveSingle() { if (page === 'single') { page = 'home'; render(); } },
    home() { if (!status || status.phase === 'idle' || status.phase === 'error') { deps.home?.(); hadView = false; page = 'home'; localError = ''; render(); } },
    frame(_monotonicNow?: number) { updateReceipt(); if (countdown && status?.retryAtMs !== null && status?.retryAtMs !== undefined) countdown.textContent = `Retrying saved seat in ${Math.max(0, Math.ceil((status.retryAtMs - Date.now()) / 1000))}s…`; },
    dispose() { disposed = true; root.replaceChildren(); deps.inputBlocked(true); }
  };
}
