import { secure } from '../../../../lib/security/route.mjs';
export const runtime = 'nodejs';

import { getAiTelemetry, getAvailableProviders } from '../../../architect/modelRouter.js';

/* =========================================================
   AI MODEL TELEMETRY & CONFIGURATION API
   Endpoint: /api/architect/models
   
   GET: Fetch active providers, model status, and usage telemetry
========================================================= */

async function handleGET(request, principal) {
  try {
    const telemetry = getAiTelemetry();
    const available = getAvailableProviders();

    return Response.json({
      ok: true,
      availableProviders: available,
      telemetry,
      serverTimestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to fetch AI model telemetry.' },
      { status: 500 }
    );
  }
}

export const GET = secure({"permission":"workbench:read","limit":60}, handleGET);
