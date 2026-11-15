const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function randomHex128(): string { return hex(crypto.getRandomValues(new Uint8Array(16))); }
export function randomToken256(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export async function tokenHash(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
export function normalizeJoinCode(value: string): string | undefined {
  return /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/i.test(value) ? value.toUpperCase() : undefined;
}
