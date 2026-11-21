import { secure } from '../../../../lib/security/route.mjs';
import { requireWhatsAppAdmin } from '../../../../lib/security/whatsapp.mjs';
/* =========================================================
   WHATSAPP WEBHOOK ENDPOINT
   Receives messages from WhatsApp Web Extension or
   API provider and stores them for Query Inbox sync.
   
   OPTIONS - CORS preflight
   POST    /api/webhook/whatsapp - Ingest query
   GET     /api/webhook/whatsapp - Poll recent queries & health
   DELETE  /api/webhook/whatsapp - Clear server queries buffer
========================================================= */

globalThis.__gra_queries = globalThis.__gra_queries || [];

const CORS_HEADERS = {};

async function handleOPTIONS(request, principal) {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function detectCategory(text) {
  const clean = text.toLowerCase();
  if (clean.includes('gst') || clean.includes('gstr') || clean.includes('eway') || clean.includes('2b')) return 'GST';
  if (clean.includes('itr') || clean.includes('income tax') || clean.includes('advance tax') || clean.includes('148') || clean.includes('143')) return 'Income Tax';
  if (clean.includes('tds') || clean.includes('tcs') || clean.includes('form 16') || clean.includes('26as') || clean.includes('ais')) return 'TDS';
  if (clean.includes('roc') || clean.includes('mca') || clean.includes('din') || clean.includes('mgt') || clean.includes('aoc')) return 'ROC';
  if (clean.includes('audit') || clean.includes('balance sheet') || clean.includes('ledger') || clean.includes('depreciation')) return 'Audit';
  return 'General';
}

function detectPriority(text) {
  const clean = text.toLowerCase();
  if (clean.includes('notice') || clean.includes('148') || clean.includes('penalty') || clean.includes('urgent') || clean.includes('demand')) {
    return 'Urgent';
  }
  if (clean.includes('due date') || clean.includes('last date') || clean.includes('mismatch') || clean.includes('today')) {
    return 'High';
  }
  return 'Normal';
}

async function handlePOST(request, principal) {
  try {
    const payload = await request.json();

    const message = String(payload.message || '').trim();
    if (message.length > 10000 || String(payload.senderName || '').length > 200 || String(payload.senderNumber || '').length > 50 || String(payload.groupName || '').length > 200) return Response.json({ error: 'Webhook field length limit exceeded.' }, { status: 400 });
    if (!message) {
      return Response.json(
        { error: 'Message is required.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const query = {
      id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderName: String(payload.senderName || 'Client').trim(),
      senderNumber: String(payload.senderNumber || '').trim(),
      message,
      source: payload.source === 'group' ? 'group' : 'personal',
      groupName: String(payload.groupName || '').trim(),
      category: detectCategory(message),
      priority: detectPriority(message),
      status: 'New',
      assignedTo: '',
      escalatedTo: '',
      notes: [],
      receivedAt: payload.timestamp || new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
      isRead: false,
    };

    /* Store in server-side buffer (capped at 200) */
    globalThis.__gra_queries.unshift(query);
    if (globalThis.__gra_queries.length > 200) {
      globalThis.__gra_queries = globalThis.__gra_queries.slice(0, 200);
    }

    return Response.json(
      {
        ok: true,
        message: 'Query received and synced to workbench buffer.',
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return Response.json(
      {
        error: 'Invalid webhook payload.',
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

/* Health check & query fetch for live sync */
async function handleGET(request, principal) {
  return Response.json(
    {
      status: 'active',
      service: 'GRA WhatsApp Webhook',
      timestamp: new Date().toISOString(),
      queries: globalThis.__gra_queries || [],
    },
    { headers: CORS_HEADERS }
  );
}

/* Clear buffer */
async function handleDELETE(request, principal) {
  globalThis.__gra_queries = [];
  return Response.json(
    {
      ok: true,
      message: 'Server query buffer cleared.',
    },
    { headers: CORS_HEADERS }
  );
}

export const GET = secure({ permission: 'queries:read', limit: 120, authorize: requireWhatsAppAdmin }, handleGET);

// The existing scoped integration remains write-only. Browser test submissions require the designated admin.
export const POST = secure({
  permission: 'webhook:ingest',
  limit: 60,
  authorize: principal => {
    if (principal.role !== 'service') requireWhatsAppAdmin(principal);
  },
}, handlePOST);

export const DELETE = secure({ permission: 'admin:manage', limit: 10, authorize: requireWhatsAppAdmin }, handleDELETE);

export const OPTIONS = secure({"preflight":true}, handleOPTIONS);
