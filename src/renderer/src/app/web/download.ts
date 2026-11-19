// A file the browser saves (web build spec §7.4): a Blob link clicked once, revoked a second later (revoking at once can
// cancel the download in some browsers).
export function downloadText(doc: { createElement(tag: 'a'): { href: string; download: string; style: { display: string }; click(): void; remove(): void }; body: { append(node: never): void } },
  urls: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void }, name: string, text: string,
  later: (cb: () => void) => void = cb => { setTimeout(cb, 1000); }): void {
  const url = urls.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const a = doc.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
  doc.body.append(a as never); a.click(); a.remove();
  later(() => urls.revokeObjectURL(url));
}
