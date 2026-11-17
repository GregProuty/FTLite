// The client side of a streamed attachment for any mode (H-2 spec §4): createSectorRemoteClient with the mode's parts as
// parameters. It receives Net-3 state images and the mode's notification stream, hands each validated publication and
// notification to the mode's stream client, acknowledges full images, and frames every outgoing held frame, command and
// callout as an input packet on its own stream and channel. The mode supplies its codec, notification stream name and
// error label, how a state image becomes a publication, its client, and an optional presentation hook.
import type { AuthorityMessage, ChannelKind, Link, MonotonicClock, PublishedState } from '../../renderer/src/net/contracts';
import { MAX_MESSAGE_BYTES, type MessageCodec } from '../../renderer/src/net/codec';
import { classifyStreamPacket, createTransportSequence, decodeOpaquePacket, decodeStatePacket, inspectState, encodeOpaquePacket, type StateImage } from '../state/imageCodec';
import { createStateReceiver } from '../state/receiver';
import { modeInputIdentity } from './streamBinding';

/** What the remote client needs from a mode's stream client. */
export interface RemoteStreamClient<S> {
  acceptPublication(value: unknown): 'accepted' | 'ignored' | 'rejected';
  acceptNotification(message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>, requiredPublicationSequence?: number): void;
  acknowledgePublication(sequence: number): boolean;
  dispose(): void;
}
export interface ModeRemoteClientOptions<S, C extends RemoteStreamClient<S>> {
  clock: MonotonicClock;
  codec: MessageCodec<S>;
  notificationStream: string;
  /** Prefix of every close reason and error, e.g. 'sector'. */
  label: string;
  /** Turn a received state image into a publication (throws when invalid). */
  imageToPublication(image: StateImage): PublishedState<S>;
  /** Build the mode's stream client on the framing link (receive-time, remote streaming). */
  createClient(link: Link): C;
  /** After each accepted publication, while connected (the sector's presentation points). */
  onAccepted?(publication: PublishedState<S>): void;
  /** Once, when the link closes or the client is disposed, after the stream client is released. */
  onDisconnect?(): void;
}

export function decodeModeNotification<S>(codec: MessageCodec<S>, stream: string, label: string, packet: Uint8Array): { message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>; floor: number } {
  const { bytes, class: payloadClass, stream: actual } = decodeOpaquePacket(packet);
  if (payloadClass !== 'state' || actual !== stream || bytes.length <= 9 || bytes.length > 9 + MAX_MESSAGE_BYTES || bytes[0] !== 1) throw Error(`${label}-notification`);
  const floor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1, true), message = codec.decodeMessage(bytes.subarray(9));
  if (!Number.isSafeInteger(floor) || floor < 0 || message.kind !== 'result' && message.kind !== 'event') throw Error(`${label}-notification`);
  return { message, floor };
}

export function createModeRemoteClient<S, C extends RemoteStreamClient<S>>(link: Link, options: ModeRemoteClientOptions<S, C>) {
  const { codec, label } = options;
  const nextTransportSequence = createTransportSequence();
  let closed = false;
  const removers: (() => void)[] = [];
  const clientLink: Link = { peer: link.peer, caps: link.caps, stats: () => link.stats(), close: reason => link.close(reason),
    onClose: cb => link.onClose(cb), onMessage: () => () => {},
    send(kind, bytes) {
      if (closed) return;
      try { const expected = modeInputIdentity(codec, label, bytes, kind); if (kind !== expected.channel) throw Error(`${label}-input-channel`);
        link.send(kind, encodeOpaquePacket('input', expected.stream, nextTransportSequence(), bytes));
      } catch { link.close(`${label}-stream-invalid`); }
    }
  };
  const client = options.createClient(clientLink);
  const receiver = createStateReceiver({ clock: options.clock, nextTransportSequence,
    accept(image) {
      if (closed) return 'ignored';
      let publication: PublishedState<S>;
      try { publication = options.imageToPublication(image); } catch { return 'rejected'; }
      const result = client.acceptPublication(publication);
      if (result === 'accepted' && !closed) options.onAccepted?.(publication);
      return result;
    },
    sendControl(bytes) {
      if (closed) return false;
      try { link.send('reliable-ordered', bytes); return !closed; } catch { link.close(`${label}-stream-invalid`); return false; }
    },
    onAcknowledged(image) { if (!closed) client.acknowledgePublication(image.sequence); },
    close: reason => link.close(reason)
  });
  function disconnect(): void {
    if (closed) return; closed = true; receiver.dispose(); client.dispose(); options.onDisconnect?.();
    for (const off of removers.splice(0)) { try { off(); } catch { /* release all subscriptions */ } }
  }
  const offClose = link.onClose(disconnect);
  if (closed) offClose(); else removers.push(offClose);
  if (!closed) removers.push(link.onMessage((kind: ChannelKind, bytes: Uint8Array) => {
    if (closed) return;
    try {
      const metadata = classifyStreamPacket(bytes);
      if (metadata.class === 'state' && metadata.stream === 'state') {
        const header = inspectState(decodeStatePacket(bytes));
        if (kind !== (header.kind === 'full' ? 'reliable-ordered' : 'unreliable-latest')) throw Error(`${label}-state-channel`);
        receiver.receive(bytes); return;
      }
      if (kind !== 'reliable-ordered') throw Error(`${label}-notification-channel`);
      const { message, floor } = decodeModeNotification(codec, options.notificationStream, label, bytes); client.acceptNotification(message, floor);
    } catch { link.close(`${label}-stream-invalid`); }
  }));
  return { client, streamStats: receiver.stats, disconnect, closed: () => closed };
}
