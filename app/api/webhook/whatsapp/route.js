/* =========================================================
   WHATSAPP WEBHOOK ENDPOINT
   Receives messages from the WhatsApp API provider
   and stores them for the Query Inbox.
   
   POST /api/webhook/whatsapp
========================================================= */

export const runtime = 'edge';

export async function POST(request) {
  try {
    const payload = await request.json();

    /* Validate required fields */
    const message = String(payload.message || '').trim();

    if (!message) {
      return Response.json(
        { error: 'Message is required.' },
        { status: 400 }
      );
    }

    const query = {
      id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,

      senderName: String(payload.senderName || 'Unknown').trim(),
      senderNumber: String(payload.senderNumber || '').trim(),
      message,

      source: payload.source === 'group' ? 'group' : 'personal',
      groupName: String(payload.groupName || '').trim(),

      messageType: String(payload.messageType || 'text').trim(),
      attachments: Array.isArray(payload.attachments)
        ? payload.attachments
        : [],

      status: 'New',
      priority: 'Normal',
      assignedTo: '',
      escalatedTo: '',

      notes: [],

      receivedAt: payload.timestamp || new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,

      isRead: false,
    };

    /*
      NOTE: Edge runtime does not have access to localStorage.
      This webhook returns the query object so the client
      can store it. For server-side persistence, the webhook
      will push to a database (Supabase/Vercel KV) in a future update.

      For now, the webhook validates and echoes back the formatted query.
      The client-side polling or the test button in Settings
      will handle storage.
    */

    return Response.json({
      ok: true,
      query,
      message: 'Query received successfully.',
    });
  } catch (error) {
    return Response.json(
      {
        error: error?.message || 'Invalid webhook payload.',
      },
      { status: 400 }
    );
  }
}

/* Health check */
export async function GET() {
  return Response.json({
    status: 'active',
    service: 'GRA WhatsApp Webhook',
    timestamp: new Date().toISOString(),
    usage: 'POST a JSON message to this endpoint to create a query.',
  });
}
