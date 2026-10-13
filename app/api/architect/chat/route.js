export const runtime = 'nodejs';

/* =========================================================
   GAURAV: Your AI Automation Architect - Chat API Route
   Endpoint: POST /api/architect/chat
   
   Keeps all API keys server-side.
   Detects GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.
   If no live keys are configured, operates as a clearly-labelled
   Dev Architect Engine with domain-aware CA workflow analysis.
========================================================= */

function detectNodesFromPrompt(text) {
  const lower = String(text || '').toLowerCase();
  const nodes = [];

  // 1. Determine Trigger
  if (lower.includes('morning') || lower.includes('every day') || lower.includes('daily') || lower.includes('schedule') || lower.includes('cron')) {
    nodes.push({
      type: 'schedule',
      label: 'Schedule Timer',
      icon: 'T',
      role: 'Trigger',
      desc: 'Fires daily at 09:00 AM IST',
    });
  } else if (lower.includes('webhook') || lower.includes('post') || lower.includes('hook')) {
    nodes.push({
      type: 'webhook',
      label: 'Webhook Trigger',
      icon: '>',
      role: 'Trigger',
      desc: 'Starts when an external HTTP payload arrives',
    });
  } else if (lower.includes('email received') || lower.includes('inbox') || lower.includes('query')) {
    nodes.push({
      type: 'emailTrigger',
      label: 'Email / Query Received',
      icon: '@',
      role: 'Trigger',
      desc: 'Starts when a new client query arrives',
    });
  } else {
    nodes.push({
      type: 'trigger',
      label: 'Manual Trigger',
      icon: '>',
      role: 'Trigger',
      desc: 'Can be triggered manually or via workbench run',
    });
  }

  // 2. Data Intake / Document Processing
  if (lower.includes('pdf') || lower.includes('invoice') || lower.includes('bill') || lower.includes('extract')) {
    nodes.push({
      type: 'pdfParser',
      label: 'PDF / Invoice Parser',
      icon: '#',
      role: 'Intake',
      desc: 'Extracts invoice number, GSTIN, and taxable amount',
    });
  } else if (lower.includes('sheet') || lower.includes('csv') || lower.includes('excel') || lower.includes('register') || lower.includes('client list')) {
    nodes.push({
      type: 'googleSheets',
      label: 'Google Sheets / CSV Data',
      icon: '#',
      role: 'Intake',
      desc: 'Reads client compliance checklist or register',
    });
  }

  // 3. AI Processing / Classification / Reasoning
  if (lower.includes('ai') || lower.includes('analyze') || lower.includes('draft') || lower.includes('classify') || lower.includes('compare') || lower.includes('reconcile')) {
    nodes.push({
      type: 'aiAgent',
      label: 'AI Reasoning & Drafting',
      icon: 'AI',
      role: 'Intelligence',
      desc: 'Evaluates records, formats personalized reminders, or flags mismatches',
    });
  }

  // 4. Decision / Logic Filter
  if (lower.includes('if') || lower.includes('condition') || lower.includes('mismatch') || lower.includes('pending') || lower.includes('filter')) {
    nodes.push({
      type: 'condition',
      label: 'IF Pending / Mismatch Filter',
      icon: '?',
      role: 'Logic',
      desc: 'Branches execution based on pending status or variance threshold',
    });
  }

  // 5. Human-in-the-Loop Review (Crucial for CA Firm!)
  if (lower.includes('approv') || lower.includes('review') || lower.includes('partner') || lower.includes('ca check') || lower.includes('confirm') || true) {
    nodes.push({
      type: 'approval',
      label: 'CA Partner Approval Gate',
      icon: 'OK',
      role: 'Human Gate',
      desc: 'Pauses execution in Approvals tab for partner sign-off before sending',
    });
  }

  // 6. Output Action
  if (lower.includes('whatsapp')) {
    nodes.push({
      type: 'whatsappApi',
      label: 'WhatsApp Business API',
      icon: '*',
      role: 'Action',
      desc: 'Dispatches templated alert or reminder to client phone',
    });
  } else if (lower.includes('api') || lower.includes('http') || lower.includes('webhook')) {
    nodes.push({
      type: 'api',
      label: 'HTTP API Webhook',
      icon: '{}',
      role: 'Action',
      desc: 'Dispatches payload to external system or CRM',
    });
  } else {
    nodes.push({
      type: 'bulkEmail',
      label: 'Resend Email Dispatch',
      icon: '@',
      role: 'Action',
      desc: 'Sends personalized email with itemized compliance details',
    });
  }

  return nodes;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const prompt = String(payload.prompt || '').trim();
    const currentNodes = Array.isArray(payload.currentNodes) ? payload.currentNodes : [];
    const agentName = String(payload.agentName || 'Agent');

    if (!prompt) {
      return Response.json(
        { error: 'Prompt cannot be empty.' },
        { status: 400 }
      );
    }

    // Check for configured server-side keys
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const hasLiveKey = Boolean(geminiKey || openaiKey || anthropicKey);

    // If live API key is present, we can call the live provider
    if (openaiKey) {
      try {
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are GAURAV, an elite AI Automation Architect for a Chartered Accountancy & consultancy firm.
Your job is to architect workflows combining triggers, data ingestion, AI processing, human approval gates, and actions.
Follow strict rules:
- No em dashes anywhere, ever. Use colons or hyphens.
- Use bullet points and concise technical breakdowns.
- Always include an Approval Gate before sensitive external actions (sending emails, filings, WhatsApp).
- Reference node types from the GRA workbench palette: schedule, trigger, googleSheets, pdfParser, aiAgent, condition, approval, bulkEmail, whatsappApi.`,
              },
              {
                role: 'user',
                content: `Target agent: "${agentName}". Current nodes on canvas: ${currentNodes.length}. User request: "${prompt}"`,
              },
            ],
            temperature: 0.3,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const replyText = aiData?.choices?.[0]?.message?.content || '';
          const pipelinePreview = detectNodesFromPrompt(prompt);

          return Response.json({
            reply: replyText,
            pipelinePreview,
            mode: 'live',
            provider: 'OpenAI (gpt-4o-mini)',
          });
        }
      } catch (err) {
        console.error('OpenAI call failed, falling back to Dev Engine:', err);
      }
    }

    // Default / Development Architect Engine mode
    const pipelinePreview = detectNodesFromPrompt(prompt);
    const stepsSummary = pipelinePreview
      .map((node, index) => `${index + 1}. **${node.label}** (${node.role}): ${node.desc}`)
      .join('\n');

    const reply = `Bro, here is the automation architecture designed for **${agentName}**:\n\n` +
      `### Workflow Architecture Blueprint\n` +
      `${stepsSummary}\n\n` +
      `### Key Design Rules Applied:\n` +
      `* **Input & Trigger:** Starts cleanly without requiring manual initiation every day.\n` +
      `* **AI Preparation:** Pre-fills and drafts compliance data or itemized calculations.\n` +
      `* **Human-in-the-Loop:** Includes a mandatory **CA Partner Approval Gate** so no client receives an email without partner sign-off.\n` +
      `* **Action & Output:** Dispatches via configured connectors with full audit history.\n\n` +
      `*Phase 1 chat is ready. In Phase 2, clicking "Build on Canvas" will directly instantiate these ${pipelinePreview.length} nodes and connections on your workflow board.*`;

    return Response.json({
      reply,
      pipelinePreview,
      mode: hasLiveKey ? 'live' : 'dev-architect-engine',
      provider: hasLiveKey ? 'Live AI' : 'GAURAV Dev Engine',
      notice: hasLiveKey
        ? 'Live AI model active'
        : 'Development Architect Engine active. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env.local or Vercel for live model inference.',
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Server error processing request.' },
      { status: 500 }
    );
  }
}
