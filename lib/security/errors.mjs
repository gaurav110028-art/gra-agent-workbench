export class SecurityError extends Error {
  constructor(status, message, code = 'REQUEST_REJECTED') { super(message); this.status = status; this.code = code; }
}
export function errorResponse(error) {
  const known = error instanceof SecurityError;
  return Response.json({ error: known ? error.message : 'The request could not be completed safely.', code: known ? error.code : 'SERVICE_UNAVAILABLE' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
