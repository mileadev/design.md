import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'designmd_session';
function secret(): string | undefined {
  const value = process.env.DESIGNMD_ACCESS_TOKEN;
  return value && value.length >= 32 ? value : undefined;
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function authorized(req: Request): boolean {
  const key = secret();
  if (!key) return false;
  const expected = 'Basic ' + Buffer.from('designmd:' + key).toString('base64');
  return equal(req.headers.get('authorization') ?? '', expected);
}
export function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401, headers: { 'www-authenticate': 'Basic realm="designmd", charset="UTF-8"', 'cache-control': 'no-store' },
  });
}
export function publicOrigin(): string | null {
  try {
    const url = new URL(process.env.DESIGNMD_PUBLIC_ORIGIN ?? '');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
export function newSession(): string {
  const key = secret();
  if (!key) throw new Error('Access token not configured');
  const id = randomBytes(32).toString('hex');
  return id + '.' + createHmac('sha256', key).update(id).digest('hex');
}
export function validSession(value: string | undefined): string | null {
  const key = secret();
  if (!key || !value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
  const [id, signature] = value.split('.');
  return equal(signature, createHmac('sha256', key).update(id).digest('hex')) ? id : null;
}
export function requestOwner(req: Request): string | null {
  const cookie = req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='));
  return validSession(cookie?.slice(SESSION_COOKIE.length+1));
}
export function allowedOrigin(req: Request): boolean {
  const origin = publicOrigin();
  return origin !== null && req.headers.get('origin') === origin;
}
