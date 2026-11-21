import { NextResponse } from 'next/server';
import { authenticate, authConfig, can } from './lib/security/auth.mjs';
import { SecurityError } from './lib/security/errors.mjs';
import { requireWhatsAppAdmin } from './lib/security/whatsapp.mjs';
import { workspaceDestination } from './app/access-destinations.js';

// Page guard only. Every API handler has its own mandatory security wrapper.
export async function proxy(request) {
  const { pathname, searchParams } = request.nextUrl;
  const whatsapp = pathname === '/whatsapp' || pathname.startsWith('/whatsapp/');
  const whatsappInbox = pathname === '/workspace' && searchParams.get('view') === 'queryInbox';
  const migration = pathname === '/workspace/migration' || pathname.startsWith('/workspace/migration/');
  const headers = { 'Cache-Control': 'no-store' };
  let origin;
  try { origin = authConfig().origin; }
  catch { return new NextResponse('Server authentication is not configured correctly.', { status: 503, headers }); }
  try {
    const principal = await authenticate(request);
    if (principal.role === 'service' || !can(principal, 'workbench:read')) {
      throw new SecurityError(403, 'Browser access is not authorized.');
    }
    if (whatsapp || whatsappInbox || migration) requireWhatsAppAdmin(principal);
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (!(error instanceof SecurityError) || error.status !== 401) {
      const status = error instanceof SecurityError && error.status === 403 ? 403 : 503;
      const message = status === 403 ? 'Browser access is not authorized.' : 'Private workspace access is unavailable.';
      return new NextResponse(message, { status, headers });
    }
    // Next requires an absolute redirect. Use the configured origin, never Host.
    const next = migration ? '/workspace/migration' : whatsapp ? '/whatsapp' : pathname === '/redactor' ? '/redactor' : workspaceDestination(searchParams.get('view'));
    const response = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
export const config = { matcher: ['/workspace/:path*', '/whatsapp/:path*', '/redactor'] };
