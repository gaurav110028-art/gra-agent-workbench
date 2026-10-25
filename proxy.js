import { NextResponse } from 'next/server';
import { authenticate, authConfig, can } from './lib/security/auth.mjs';

// Page guard only. Every API handler has its own mandatory security wrapper.
export async function proxy(request) {
  let origin;
  try { origin = authConfig().origin; }
  catch { return new NextResponse('Server authentication is not configured correctly.', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    const principal = await authenticate(request);
    if (!can(principal, 'workbench:read')) return new NextResponse('Browser access is not authorized.', { status: 403 });
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    // Next requires an absolute redirect. Use the configured origin, never Host.
    const next = request.nextUrl.pathname === '/redactor' ? '/redactor' : '/';
    const response = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
export const config = { matcher: ['/', '/redactor'] };
