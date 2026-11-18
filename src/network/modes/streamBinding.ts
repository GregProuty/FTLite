// The host side of a streamed attachment for any encounter mode (engine refactor spec §6: each mode owns its stream
// publication adapter). Moved unchanged from the sector stream: the mode supplies how a publication becomes a Net-3
// StateImage, its message codec, its notification stream name and its error label.
import type { AttachOptions } from '../../renderer/src/authority/authority';
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import type { MessageCodec } from '../../renderer/src/net/codec';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, MAX_RETAINED_IMAGES, type StateImage } from '../state/imageCodec';
import { createStateSender } from '../state/sender';

type Notification<S> = Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>;
export interface ModeStreamOptions<S> {
  clock: MonotonicClock; latestPayloadLimit: number;
  /** Validate a publication and turn it into a state image (throws on an invalid publication). */
  toImage(publication: PublishedState<S>): StateImage;
  codec: MessageCodec<S>;
  notificationStream: string;
  /** Prefix of every close reason and error, e.g. 'sector'. */
  label: string;
}

/** Mode-owned envelope preserves the original reliable codec bytes verbatim. */
export function encodeModeNotification<S>(codec: MessageCodec<S>, stream: string, label: string, message: Notification<S>, requiredPublicationSequence: number, transportSequence: number): Uint8Array {
  if (!Number.isSafeInteger(requiredPublicationSequence) || requiredPublicationSequence < 0) throw Error(`${label}-notification-floor`);
  const payload = codec.encodeMessage(message), body = new Uint8Array(9 + payload.length);
  body[0] = 1; new DataView(body.buffer).setFloat64(1, requiredPublicationSequence, true); body.set(payload, 9);
  return encodeOpaquePacket('state', stream, transportSequence, body);
}
export function modeInputIdentity<S>(codec: MessageCodec<S>, label: string, bytes: Uint8Array, channel: ChannelKind): { stream: string; channel: ChannelKind } {
  const message = codec.decodeMessage(bytes);
  if (message.kind === 'held') {
    const held = message.frame.held, neutral = held.moveX === 0 && held.moveY === 0 && !held.interactHeld;
    return { stream: `held:${message.frame.player}`, channel: neutral && channel === 'reliable-ordered' ? 'reliable-ordered' : 'unreliable-latest' };
  }
  if (message.kind === 'command' || message.kind === 'callout' || message.kind === 'ping') return { stream: message.kind, channel: 'reliable-ordered' };   // Feel-ii: pings ride their own stream
  throw Error(`${label}-input-direction`);
}

/** Trusted authority attachment. It owns stream controls, while the authority owns gameplay ingress. */
export function createModeStreamBinding<S>(link: Link, options: ModeStreamOptions<S>) {
  const { codec, label } = options;
  const nextTransportSequence = createTransportSequence(), messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>();
  let closed = false, ready = false;
  const sentFulls = new Set<number>();
  const removers: (() => void)[] = [];
  const sender = createStateSender({ clock: options.clock, latestPayloadLimit: options.latestPayloadLimit, nextTransportSequence,
    send: (kind, bytes) => {
      if (closed) return;
      if (!ready && kind === 'reliable-ordered') {
        // Record before send: a synchronous transport can deliver the ACK and
        // subsequent input before this callback returns.
        sentFulls.add(inspectState(decodeStatePacket(bytes)).sequence);
        while (sentFulls.size > MAX_RETAINED_IMAGES) sentFulls.delete(sentFulls.values().next().value!);
      }
      link.send(kind, bytes);
    }, close: reason => link.close(reason) });
  function dispose(): void { if (closed) return; closed = true; ready = false; sentFulls.clear(); sender.dispose(); messages.clear(); for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } } }
  const offClose = link.onClose(dispose);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind, bytes) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'control' && metadata.stream === 'state-control') {
        if (kind !== 'reliable-ordered') throw Error(`${label}-control-channel`);
        sender.receiveControl(bytes);
        if (!closed && !ready && sentFulls.has(sender.acknowledgedSequence())) { ready = true; sentFulls.clear(); }
        return;
      }
      if (metadata.class !== 'input') throw Error(`${label}-input-direction`);
      const payload = decodeOpaquePacket(bytes), expected = modeInputIdentity(codec, label, payload.bytes, kind);
      if (payload.stream !== expected.stream || kind !== expected.channel) throw Error(`${label}-input-channel`);
      if (!ready) return;
      for (const receive of [...messages]) { if (closed) break; receive(kind, payload.bytes); }
    } catch { link.close(`${label}-stream-invalid`); }
  }));
  const authorityLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    send() { throw Error(`${label}-stream-missing-sink`); } };
  const attachOptions: AttachOptions<S> = {
    publicationSink(publication, reliable) {
      if (closed) return;
      try { sender.publish(options.toImage(publication), reliable); } catch { link.close(`${label}-stream-invalid`); }
    },
    notificationSink(message, floor) {
      if (closed) return;
      try { link.send('reliable-ordered', encodeModeNotification(codec, options.notificationStream, label, message, floor, nextTransportSequence())); } catch { link.close(`${label}-stream-invalid`); }
    }
  };
  return { link: authorityLink, attachOptions, dispose, stats: sender.stats };
}
