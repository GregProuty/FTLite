import type { OnlineErrorCode, OnlinePreloadApi, OnlineResult, OnlineStatus } from '../../../shared/onlineSession';
type MenuApi = Pick<OnlinePreloadApi, 'host' | 'join' | 'ready' | 'start' | 'removeSeat' | 'reconnect' | 'retry' | 'leave' | 'forgetSeat'>;
interface MenuDeps { root: HTMLElement; document: Pick<Document, 'createElement'>; api?: MenuApi; couch(): void; online(): void; pause(): void; inputBlocked(value: boolean): void; leaveCouch?(): void; home?(): void }
const ERRORS: Partial<Record<OnlineErrorCode, string>> = {
  'online-disabled': 'Online development needs a configured local service. Couch play is available.',
  'not-found': 'Room not found. Check the eight-character code and try again.',
  'incompatible': 'This room needs compatible game content and ship data. Check both versions, then try again.',
  'unauthorized': 'This seat is no longer authorized. Return to the menu or forget the saved seat.',
  'host-lost': 'The host has stopped. A saved seat cannot restore a lost game; rehosting is not available yet.',
  'suspended': 'Online play stopped when the computer suspended. Reconnect explicitly to continue.',
  'retry-exhausted': 'Reconnection timed out. Retry to make a new attempt.',
  'storage-write-failed': 'Your seat could not be saved. This session can play, but restart recovery is unavailable.',
};
export function createSessionMenu(deps: MenuDeps) {
  let status: OnlineStatus | null = null, page: 'home' | 'host' | 'join' | 'session' | 'couch' = 'home';
  let pending = false, disposed = false, localError = '', hadView = false;
  let operation = 0, countdown: HTMLElement | null = null;
  const { root, document: doc } = deps;
  root.setAttribute('aria-label', 'FTLite session menu'); root.setAttribute('data-testid', 'session-menu');
  function node(tag: string, text = '', id?: string) {
    const el = doc.createElement(tag); el.textContent = text; if (id) el.setAttribute('data-testid', id); return el;
  }
  const can = (action: OnlineStatus['actions'][number]) => !!deps.api && !!status?.actions.includes(action) && !pending;
  function button(parent: HTMLElement, id: string, text: string, action: () => void, enabled = true) {
    const b = node('button', text, id) as HTMLButtonElement; b.type = 'button'; b.disabled = !enabled;
    b.style.cssText = 'font:inherit;color:#d7e4f0;background:#172333;border:1px solid #52718d;padding:9px 14px;margin:4px;cursor:pointer';
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
    countdown = null;
    const playing = page === 'couch' || page === 'session' && hadView;
    deps.inputBlocked(!playing);
    root.style.cssText = playing
      ? 'position:fixed;left:0;right:0;top:0;z-index:20;color:#d7e4f0;background:#0b111be8;font:14px monospace;padding:6px 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap'
      : 'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:#05060af2;color:#d7e4f0;font:16px monospace';
    const panel = node('section'); panel.style.cssText = playing ? 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' : 'width:min(580px,85vw);padding:30px;border:1px solid #52718d;background:#0b111b;box-shadow:0 12px 70px #000';
    root.replaceChildren(panel);
    if (page === 'couch') { button(panel, 'leave-couch', 'Leave couch play', () => { deps.leaveCouch?.(); page = 'home'; render(); }); return; }
    if (!playing) { panel.append(node('h1', 'FTLite')); panel.append(node('p', 'Crew together. Keep the ship flying.')); }
    const message = localError || (status?.error ? ERRORS[status.error] ?? `Online stopped (${status.error}). Retry or leave.` : page === 'session' ? `${status?.phase ?? 'Connecting'}${pending ? '…' : ''}` : 'Choose how to play.');
    const live = node('p', message, 'status'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); panel.append(live);
    if (page === 'home') {
      button(panel, 'couch', 'Couch play', () => { page = 'couch'; deps.couch(); render(); });
      button(panel, 'host', 'Host', () => { hadView = false; page = 'host'; render(); }, can('host'));
      button(panel, 'join', 'Join', () => { hadView = false; page = 'join'; render(); }, can('join'));
      if (status?.actions.includes('reconnect')) button(panel, 'reconnect', 'Reconnect saved seat', () => { void invoke(() => deps.api!.reconnect()); }, can('reconnect'));
      if (status?.actions.includes('forget-seat')) button(panel, 'forget-seat', 'Forget saved seat', () => { void invoke(() => deps.api!.forgetSeat(), false); }, can('forget-seat'));
      panel.append(node('p', !deps.api || status?.phase === 'idle' && !status.actions.includes('host') && !status.actions.includes('join') ? ERRORS['online-disabled']! : 'A saved seat reconnects to a living host. It is not a saved game.', 'online-availability'));
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
      }); panel.append(form); button(panel, 'back', 'Back', () => { page = 'home'; localError = ''; render(); }, !pending); control.focus();
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
      if (status?.retryAtMs !== null && status?.retryAtMs !== undefined) { countdown = node('span', 'Reconnecting saved seat…', 'reconnect-countdown'); panel.append(countdown); }
      if (status && !status.persistent && status.snapshot) panel.append(node('span', 'Seat not saved: restart recovery unavailable.', 'storage-warning'));
      if (status?.actions.includes('retry')) button(panel, 'retry', 'Retry', () => { void invoke(() => deps.api!.retry()); }, can('retry'));
      if (status?.actions.includes('reconnect')) button(panel, 'reconnect', 'Reconnect saved seat', () => { void invoke(() => deps.api!.reconnect()); }, can('reconnect'));
      if (status?.actions.includes('leave')) button(panel, 'leave', status.phase === 'ended' ? 'Return to menu' : 'Leave', () => { void invoke(() => deps.api!.leave(), false, true).then(() => { if (status?.phase === 'idle') { deps.home?.(); hadView = false; page = 'home'; render(); } }); }, !!deps.api);
      if (!pending && status?.actions.includes('join')) button(panel, 'try-code', 'Try another code', () => { hadView = false; page = 'join'; render(); });
      if (!pending && (!status || status.phase === 'idle' || status.phase === 'error')) button(panel, 'home', 'Return to menu', () => { deps.home?.(); hadView = false; page = 'home'; render(); });
    }
  }
  render();
  return {
    setStatus(next: OnlineStatus) { status = next; if (next.attachmentEpoch > 0) hadView = true; if (page !== 'couch' && next.phase !== 'idle') page = 'session'; if (next.phase === 'idle' && page === 'session' && !pending && !hadView) page = 'home'; render(); },
    home() { if (!status || status.phase === 'idle' || status.phase === 'error') { deps.home?.(); hadView = false; page = 'home'; localError = ''; render(); } },
    frame(now: number) { if (countdown && status?.retryAtMs !== null && status?.retryAtMs !== undefined) countdown.textContent = `Retrying saved seat in ${Math.max(0, Math.ceil((status.retryAtMs - now) / 1000))}s…`; },
    dispose() { disposed = true; root.replaceChildren(); deps.inputBlocked(true); }
  };
}
