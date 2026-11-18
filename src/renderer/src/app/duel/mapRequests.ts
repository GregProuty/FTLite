// Feel-ii (spec 2026-11-18-feel-ii-design §1.1): what the Helm map's right button asked the duel mode to send since the
// last take: a held heading (a heading index 0..255, or −1 to clear it). The scene turns the pointer into a request each
// frame; the runtime (Single player) or the online session drains it and sends the `heading` command from the Helm only,
// as the contact window's requests go. Local to one screen.
export interface MapRequests {
  heading(h: number): void;
  takeHeading(): number | null;
}

export function createMapRequests(): MapRequests {
  let heading: number | null = null;
  return {
    heading(h) { heading = h; },
    takeHeading() { const out = heading; heading = null; return out; }
  };
}
