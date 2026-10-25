export function mcpStream(request) {
  const encoder = new TextEncoder();
  let heartbeat, expiry, controller, closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat); clearTimeout(expiry);
    request.signal.removeEventListener('abort', stop);
    try { controller?.close(); } catch { /* Already cancelled. */ }
  };
  const stream = new ReadableStream({
    start(target) {
      controller = target;
      target.enqueue(encoder.encode(`event: endpoint\ndata: ${process.env.GRA_APP_ORIGIN}/api/mcp\n\n`));
      heartbeat = setInterval(() => { try { target.enqueue(encoder.encode(': keep-alive\n\n')); } catch { stop(); } }, 10000);
      expiry = setTimeout(stop, 45000);
      request.signal.addEventListener('abort', stop, { once: true });
      if (request.signal.aborted) stop();
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}
