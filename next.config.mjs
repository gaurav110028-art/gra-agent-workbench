const redactorCsp = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'", // Next App Router hydration; no third-party scripts.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "worker-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default {
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }, { source: '/_next/static/:path*', headers: [
      // Worker scripts need their own CSP; a document's connect-src is not inherited.
      { key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'" },
    ] }, { source: '/redactor', headers: [
      { key: 'Content-Security-Policy', value: redactorCsp },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Cache-Control', value: 'no-store' },
    ] }, ...['/', '/login', '/logout', '/api/:path*'].map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'no-store' }] }))];
  },
};
