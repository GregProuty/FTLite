import type { OnlineStatus } from '../../../../shared/onlineSession';
import { useActions, useUi } from '../context';
import { can, countdownText, ERRORS, receiptText, seatLabel, startAllowed, type MenuAction } from '../menuState';
import { useNow } from '../useNow';
import { MenuButton } from './MenuButton';

function MirrorLine(props: { status: OnlineStatus; receivedAt: number }) {
  const perfNow = performance.now(), age = props.status.mirror.receivedAgeMs;
  // The text changes when the elapsed age crosses a whole second: a fixed wall-clock phase while both clocks advance together.
  const phase = age === null ? 0 : (((Date.now() - (age + Math.max(0, perfNow - props.receivedAt))) % 1000) + 1000) % 1000;
  useNow(1000, phase);
  return <span data-testid="mirror-status">{receiptText(props.status, props.receivedAt, perfNow)}</span>;
}
function Countdown(props: { retryAtMs: number }) {
  const now = useNow(1000, ((props.retryAtMs % 1000) + 1000) % 1000);   // the text changes when the deadline crosses a whole second
  return <span data-testid="reconnect-countdown">{countdownText(props.retryAtMs, now)}</span>;
}

/** The room, the roster, the lobby and run controls, recovery state and the ways out (Net-3d/3e; main menu spec). */
export function SessionPage(props: { playing: boolean }) {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const v = { menu, online }, status = online.status, room = status?.snapshot ?? null;
  const has = (a: MenuAction): boolean => !!status?.actions.includes(a);
  const ownReady = room?.seats.find((s) => s.seatId === status!.ownSeat)?.ready ?? false;
  const Roster = props.playing ? 'span' : 'ul', Line = props.playing ? 'span' : 'li';
  return (
    <>
      {status && room && (
        <>
          <strong data-testid="room-code">{`ROOM ${room.joinCode}`}</strong>
          <span data-testid="assigned-seat">{`You are Player ${(status.ownSeat ?? 0) + 1}`}</span>
          <Roster data-testid="roster">
            {Array.from({ length: room.capacity }, (_, pid) => {
              const seat = room.seats.find((s) => s.seatId === pid);
              return (
                <Line key={pid}>
                  {seatLabel(status, pid)}
                  {status.role === 'host' && !!seat?.occupied && pid !== status.ownSeat && status.phase === 'lobby'
                    && <MenuButton id={`remove-seat-${pid}`} text={`Remove Player ${pid + 1}`} onClick={() => actions.removeSeat(pid)} enabled={can(v, 'remove-seat')} />}
                </Line>
              );
            })}
          </Roster>
        </>
      )}
      {status?.phase === 'lobby' && (
        <>
          <MenuButton id="ready" text={ownReady ? 'Not ready' : 'Ready'} onClick={() => actions.ready(!ownReady)} enabled={can(v, 'ready')} />
          {status.role === 'host' && <MenuButton id="start" text="Start" onClick={actions.start} enabled={startAllowed(v)} />}
        </>
      )}
      {(status?.phase === 'running' || status?.phase === 'paused') && <MenuButton id="pause" text={status.phase === 'paused' ? 'Resume' : 'Pause'} onClick={actions.pause} />}
      {status?.mirror.committed && (
        <>
          <MirrorLine status={status} receivedAt={online.receivedAt} />
          {(status.phase === 'saved' || status.phase === 'rehosting') && <span data-testid="rollback-warning">Recovery may roll back actions after this checkpoint.</span>}
        </>
      )}
      {status?.mirror.localPending && <span data-testid="pending-save">Local pending save: not committed to the service.</span>}
      {status?.mirror.error && <span data-testid="mirror-error">{ERRORS[status.mirror.error] ?? 'Checkpoint storage is unavailable.'}</span>}
      {(status?.phase === 'saved' || status?.phase === 'rehosting') && <MenuButton id="rehost" text="Re-host" onClick={actions.rehost} enabled={can(v, 'rehost')} />}
      {status?.retryAtMs !== null && status?.retryAtMs !== undefined && <Countdown retryAtMs={status.retryAtMs} />}
      {status && !status.persistent && status.snapshot && <span data-testid="storage-warning">Seat not saved: restart recovery unavailable.</span>}
      {has('retry') && <MenuButton id="retry" text="Retry" onClick={actions.retry} enabled={can(v, 'retry')} />}
      {has('reconnect') && <MenuButton id="reconnect" text="Reconnect saved seat" onClick={actions.reconnect} enabled={can(v, 'reconnect')} />}
      {has('forget-seat') && <MenuButton id="forget-seat" text="Forget saved seat" onClick={actions.forgetSeatNow} enabled={online.available} />}
      {has('leave') && <MenuButton id="leave" text={status!.phase === 'ended' ? 'Return to menu' : 'Leave'} onClick={actions.leave} enabled={online.available} />}
      {!menu.pending && has('join') && <MenuButton id="try-code" text="Try another code" onClick={actions.tryAnotherCode} />}
      {!menu.pending && (!status || status.phase === 'idle' || status.phase === 'error') && <MenuButton id="home" text="Return to menu" onClick={actions.returnHome} />}
    </>
  );
}
