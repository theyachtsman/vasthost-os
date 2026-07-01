import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Server-side route gating (Part 3): private routes redirect to sign-in BEFORE
// page code runs, so there is no flash of protected content. The cookies are
// httpOnly and set by the API; here we only check presence — the API still
// enforces real auth on every data call. Cookie names must match the backend
// (core/config.py: SESSION_COOKIE_NAME / ADMIN_SESSION_COOKIE_NAME).
const USER_COOKIE = 'gpuiq_session';
const ADMIN_COOKIE = 'gpuiq_admin_session';

// Auth-gated app routes (everything in the (app) layout group).
const APP_PREFIXES = [
  '/dashboard',
  '/market',
  '/earnings',
  '/fleet',
  '/pricing',
  '/offers',
  '/analytics',
  '/alerting',
  '/simulator',
  '/settings',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin tree — separate cookie scope. /admin/login is the only public part.
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    if (!req.cookies.get(ADMIN_COOKIE)) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // App routes require a user session.
  const gated = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (gated && !req.cookies.get(USER_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, the API proxy, and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
