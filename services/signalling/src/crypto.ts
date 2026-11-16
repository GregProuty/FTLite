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
export function randomJoinCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => alphabet[byte & 31]).join('');
}
export async function hashPlatformIp(request: Request, salt: string | undefined): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!salt || salt.length > 4096 || !ip || !validIp(ip)) throw Error('unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))));
}
function validIp(ip: string): boolean {
  if (ip.includes(':')) {
    try { return /^[0-9a-fA-F:.]+$/.test(ip) && new URL(`http://[${ip}]/`).hostname.startsWith('['); } catch { return false; }
  }
  return /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(ip)
    && ip.split('.').every(part => Number(part) <= 255);
}
