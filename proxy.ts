import { NextRequest, NextResponse } from 'next/server';
import { authorized, unauthorized, newSession, validSession, SESSION_COOKIE, publicOrigin } from './lib/security/auth';

export function proxy(request: NextRequest) {
  if (!authorized(request)) return unauthorized();
  const origin = publicOrigin();
  if (!origin) return new Response('Public origin not configured', { status: 503 });
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  if (request.method === 'GET' && !request.nextUrl.pathname.startsWith('/api/') &&
      !validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    response.cookies.set(SESSION_COOKIE, newSession(), {
      httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'strict', path: '/', maxAge: 86400,
    });
  }
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
