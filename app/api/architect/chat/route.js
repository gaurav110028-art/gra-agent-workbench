export const runtime = 'nodejs';

import {
  buildBlueprintFromPrompt,
  validateWorkflowBlueprint,
} from '../../../architect/workflowGenerator.js';
import {
  executeWithRouter,
  getAvailableProviders,
} from '../../../architect/modelRouter.js';

/* =========================================================
   GRA AI Architect - Conversational Brain & Agent Controller
   Endpoint: POST /api/architect/chat
   
   Supports:
   1. Conversational Brain: Caring, empathetic, helpful responses (Gaurav persona).
   2. Agent Controller: Chat commands to run, pause, approve, reject, monitor workflows.
   3. Workflow Builder: Natural language to React Flow blueprint generation.
   4. Multi-Model AI Router: Gemini, OpenAI, Claude, NVIDIA with fallback.
========================================================= */

function detectIntent(text) {
  const clean = String(text || '').trim().toLowerCase();

  // 1. General conversation / Greetings / Caring Queries
  const isGreeting = /^(hi|hello|hey|namaste|good\s*(morning|afternoon|evening)|kaise\s*ho)\b/i.test(clean);
  const isCaringQuery =
    clean.includes('how are you') ||
    clean.includes('who are you') ||
    clean.includes('what can you do') ||
    clean.includes('help me') ||
    clean.includes('stressed') ||
    clean.includes('audit season') ||
    clean.includes('tired') ||
    clean.includes('thank');

  if (isGreeting || isCaringQuery) {
    return { type: 'CONVERSATION', isGreeting, isCaringQuery, clean };
  }

  // 2. 24/7 Automation & Schedule Controller Commands
  if (clean.includes('schedule') || clean.includes('run every') || clean.includes('automate daily') || clean.includes('24/7')) {
    return {
      type: 'CONTROLLER',
      action: 'SCHEDULE_DAILY',
      label: 'Schedule 24/7 Daily Run',
      frequency: 'Daily at 09:00 AM IST',
    };
  }
  if (clean.includes('pause schedule') || clean.includes('pause future') || clean.includes('pause agent')) {
    return {
      type: 'CONTROLLER',
      action: 'PAUSE_SCHEDULE',
      label: 'Pause Future Runs',
    };
  }
  if (clean.includes('resume schedule') || clean.includes('resume agent') || clean.includes('unpause')) {
    return {
      type: 'CONTROLLER',
      action: 'RESUME_SCHEDULE',
      label: 'Resume 24/7 Schedule',
    };
  }
  if (clean.includes('cancel') || clean.includes('stop active') || clean.includes('stop running') || clean.includes('abort run') || clean.includes('terminate')) {
    return {
      type: 'CONTROLLER',
      action: 'CANCEL_ACTIVE_RUN',
      label: 'Cancel Active Run',
    };
  }

  if (clean.includes('debug') || clean.includes('repair') || clean.includes('fix workflow') || clean.includes('troubleshoot')) {
    return {
      type: 'CONTROLLER',
      action: 'DEBUG_WORKFLOW',
      label: 'Debug & Auto-Repair',
    };
  }
  if (clean.includes('template') || clean.includes('sample agent') || clean.includes('show templates')) {
    return {
      type: 'CONTROLLER',
      action: 'SHOW_TEMPLATES',
      label: 'Browse Agent Templates',
    };
  }
  if (clean.includes('audit trail') || clean.includes('audit log') || clean.includes('history log')) {
    return {
      type: 'CONTROLLER',
      action: 'SHOW_AUDIT_TRAIL',
      label: 'View System Audit Trail',
    };
  }

  // 3. Execution / Controller Commands
  if (clean.includes('test run') || clean.includes('run test') || clean.includes('try run')) {
    return { type: 'CONTROLLER', action: 'RUN_TEST', label: 'Test Run Workflow' };
  }
  if (clean.includes('run live') || clean.includes('run workflow') || clean.includes('execute live') || clean.includes('execute now')) {
    return {
      type: 'CONTROLLER',
      action: 'RUN_LIVE',
      label: 'Run Live Workflow',
      requireConfirmation: true,
      confirmPrompt: 'Are you sure you want to run this workflow LIVE? This will execute real actions (emails, API calls, or WhatsApp messages).',
    };
  }
  if (clean.includes('approve') || clean.includes('confirm step') || clean.includes('resume')) {
    return { type: 'CONTROLLER', action: 'APPROVE_STEP', label: 'Approve & Resume' };
  }
  if (clean.includes('reject') || clean.includes('decline approval')) {
    return { type: 'CONTROLLER', action: 'REJECT_STEP', label: 'Reject Approval' };
  }
  if (clean.includes('validate') || clean.includes('check errors') || clean.includes('is it valid')) {
    return { type: 'CONTROLLER', action: 'VALIDATE', label: 'Validate Workflow' };
  }
  if (clean.includes('status') || clean.includes('progress') || clean.includes('how is the run') || clean.includes('show errors')) {
    return { type: 'CONTROLLER', action: 'GET_STATUS', label: 'Check Execution Status' };
  }

  // 4. Workflow generation / modification
  return { type: 'WORKFLOW_BUILDER' };
}

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
  nodes.push({
    type: 'approval',
    label: 'CA Partner Approval Gate',
    icon: 'OK',
    role: 'Human Gate',
    desc: 'Pauses execution in Approvals tab for partner sign-off before sending',
  });

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
    const currentEdges = Array.isArray(payload.currentEdges) ? payload.currentEdges : [];
    const agentName = String(payload.agentName || 'Agent');

    if (!prompt) {
      return Response.json(
        { error: 'Prompt cannot be empty.' },
        { status: 400 }
      );
    }

    const intent = detectIntent(prompt);

    const preferredProvider = payload.preferredProvider || null;
    const availableProviders = getAvailableProviders();
    const hasLiveKey = availableProviders.some((p) => p.status === 'active');

    // Run router attempt for intelligent synthesis when keys are provided
    let liveAiResult = null;
    if (hasLiveKey) {
      try {
        liveAiResult = await executeWithRouter({
          preferredProvider,
          userPrompt: prompt,
          systemPrompt: `You are Gaurav, the AI Automation Architect for GRA Agent Workbench (a CA firm automation platform). Be empathetic, practical, and helpful. Never use em-dashes and never use hashtags.`,
        });
      } catch (routerErr) {
        console.warn('Router execution error:', routerErr.message);
      }
    }

    // =========================================================
    // 1. CONVERSATIONAL BRAIN (Caring nature, greetings, advice)
    // =========================================================
    if (intent.type === 'CONVERSATION') {
      let reply = '';
      const clean = intent.clean;

      // If live AI is available (Gemini/OpenAI), use its real live generated answer!
      if (liveAiResult?.text) {
        reply = liveAiResult.text;
      } else if (clean.includes('stressed') || clean.includes('audit season') || clean.includes('tired')) {
        reply = `Bro, take a deep breath. Tax audit season, client filing delays, and endless document follow-ups are truly exhausting. You do not have to do all this manual chasing yourself.\n\n` +
          `That is exactly why we are building these agents. Let me take the boring, repetitive follow-ups off your hands so you and your team can focus on actual review and client advisory.\n\n` +
          `What is the single biggest bottleneck bothering you right now? We can automate it in minutes.`;
      } else if (clean.includes('how are you')) {
        reply = `I am doing great and excited to help you! My goal is to make sure you never have to do copy-paste compliance work manually again.\n\n` +
          `How can I assist you with **${agentName}** today?`;
      } else if (clean.includes('what can you do') || clean.includes('who are you')) {
        reply = `Hello! I am Gaurav, your AI Automation Architect for GRA Agent Workbench.\n\n` +
          `Here is what I can do for you:\n` +
          `* Design complete automation workflows from plain English instructions.\n` +
          `* Generate real, validated visual nodes and connections on your canvas.\n` +
          `* Run, pause, resume, approve, and monitor your workflows via chat commands.\n` +
          `* Help you streamline GST reconciliations, ITR reminders, TDS filings, and invoice parsing.\n\n` +
          `Whenever you are ready, tell me what process you would like to automate!`;
      } else if (clean.includes('thank')) {
        reply = `You are most welcome! Always happy to support you. Let me know if you want to test the workflow, add another step, or create a new agent.`;
      } else {
        reply = `Hello! I am Gaurav, your AI Automation Architect.\n\n` +
          `Great to connect with you! I am right here by your side. Tell me what is on your mind for **${agentName}**, whether you want to build an automation, test run an existing workflow, or check its status.`;
      }

      const activeProvider = liveAiResult?.provider || (hasLiveKey ? 'Live AI' : 'GRA AI Architect Dev Engine');
      const activeModel = liveAiResult?.model || (hasLiveKey ? 'auto-routed' : 'gra-architect-rule-v2');

      return Response.json({
        reply,
        pipelinePreview: null,
        blueprint: null,
        actionIntent: null,
        mode: hasLiveKey ? 'live' : 'dev-architect-engine',
        provider: activeProvider,
        model: activeModel,
        fallbackUsed: Boolean(liveAiResult?.fallbackUsed),
        availableProviders,
        notice: hasLiveKey
          ? `Live AI active via ${activeProvider} (${activeModel})`
          : 'Development Architect Engine active. Set GEMINI_API_KEY in Vercel for live model inference.',
      });
    }

    // =========================================================
    // 2. AGENT CONTROLLER (Run, pause, approve, reject, status)
    // =========================================================
    if (intent.type === 'CONTROLLER') {
      let reply = '';

      switch (intent.action) {
        case 'SCHEDULE_DAILY':
          reply = `Configuring 24/7 background schedule for **${agentName}**.\n\n` +
            `* **Schedule:** Daily at 09:00 AM IST\n` +
            `* **Trigger Type:** Automated timer trigger\n` +
            `* **Execution Mode:** Background cloud execution (runs reliably even if your browser is closed)\n` +
            `* **Safety Retries:** 3 automatic retry attempts with exponential backoff on transient errors\n\n` +
            `Click **Register 24/7 Schedule** below to activate persistent automation.`;
          break;

        case 'PAUSE_SCHEDULE':
          reply = `Pausing future 24/7 automated runs for **${agentName}**.\n\n` +
            `Upcoming scheduled triggers will be held without cancelling any execution that is actively running right now.`;
          break;

        case 'RESUME_SCHEDULE':
          reply = `Resuming 24/7 automated runs for **${agentName}**.\n\n` +
            `The agent is now active and will fire on its next scheduled interval.`;
          break;

        case 'CANCEL_ACTIVE_RUN':
          reply = `Cancelling currently active execution for **${agentName}**.\n\n` +
            `The running pipeline will be safely aborted and logged in the execution audit history.`;
          break;

        case 'DEBUG_WORKFLOW':
          reply = `AI Workflow Debugger initiated for **${agentName}**.\n\n` +
            `Analyzing canvas connections, triggers, required node configurations, and human approval safeguards...`;
          break;

        case 'SHOW_TEMPLATES':
          reply = `Here are the curated high-impact CA agent templates available for your firm:\n\n` +
            `* **GSTR-2B vs 3B ITC Mismatch Chaser:** Compares purchase register with 2B and drafts vendor reminder letters.\n` +
            `* **ITR Filing Document Tracker:** Chases missing Form 16, AIS, and capital gains statements.\n` +
            `* **Statutory Notice Immediate Triage:** Categorizes section 148 / DRC-01 notices and alerts partners.\n` +
            `* **Section 43B(h) MSME Payment Monitor:** Monitors 45-day vendor payment deadlines for tax disallowance risks.`;
          break;

        case 'SHOW_AUDIT_TRAIL':
          reply = `Retrieving secure system audit trail for **${agentName}**.\n\n` +
            `All partner approvals, execution starts, and external dispatch actions are tracked with timestamp and user attribution.`;
          break;

        case 'RUN_TEST':
          reply = `Initiating a simulated Test Run for **${agentName}**.\n\n` +
            `All steps will run in test mode with sample data so you can safely verify the pipeline without sending real communications.`;
          break;

        case 'RUN_LIVE':
          reply = `CAUTION: You have requested to execute **${agentName}** LIVE.\n\n` +
            `This will make real AI completions and dispatch actual emails/messages after any Approval Gates.\n\n` +
            `Please confirm below before proceeding.`;
          break;

        case 'APPROVE_STEP':
          reply = `Approval command received. Resuming the paused workflow from the CA Partner Approval Gate.`;
          break;

        case 'REJECT_STEP':
          reply = `Rejection command received. The paused workflow execution will be stopped and marked as rejected.`;
          break;

        case 'VALIDATE':
          reply = `Validating the active canvas for **${agentName}**.\n\n` +
            `Checking for valid triggers, connections, and required node configurations.`;
          break;

        case 'GET_STATUS':
          reply = `Checking execution status for **${agentName}**.\n\n` +
            `Your canvas currently contains ${currentNodes.length} nodes and ${currentEdges.length} connections.`;
          break;

        default:
          reply = `Processing controller command for **${agentName}**...`;
      }

      return Response.json({
        reply,
        pipelinePreview: null,
        blueprint: null,
        actionIntent: {
          type: intent.action,
          label: intent.label,
          requireConfirmation: Boolean(intent.requireConfirmation),
          confirmPrompt: intent.confirmPrompt || null,
        },
        mode: hasLiveKey ? 'live' : 'dev-architect-engine',
        provider: hasLiveKey ? 'Live AI' : 'GRA AI Architect Dev Engine',
      });
    }

    // =========================================================
    // 3. WORKFLOW BUILDER (Generates visual nodes and edges)
    // =========================================================
    // If live AI is available (Gemini/OpenAI), ask model to tailor the architecture explanation and nodes
    let dynamicAiExplanation = null;
    if (hasLiveKey && !liveAiResult?.text) {
      try {
        const aiPrompt = `The user wants to create or modify an automation workflow for an Indian CA firm: "${prompt}".
Explain in 3-4 crisp bullet points how this workflow should run from Trigger -> Data Intake -> AI Processing -> Partner Approval -> Client Dispatch.
Follow these rules:
1. Always require a CA Partner Approval Gate before sending communications.
2. Be practical, no em-dashes, no hashtags, conversational Hinglish/English tone.`;

        const explanationRes = await executeWithRouter({
          preferredProvider,
          userPrompt: aiPrompt,
          systemPrompt: `You are Gaurav, expert CA firm AI Automation Architect for GRA Agent Workbench. Be concise, sharp, and helpful.`,
        });
        if (explanationRes?.text) {
          dynamicAiExplanation = explanationRes.text;
        }
      } catch (e) {
        console.warn('AI workflow explanation error:', e.message);
      }
    }

    const rawBlueprint = buildBlueprintFromPrompt(prompt, currentNodes, currentEdges);
    const validated = validateWorkflowBlueprint(rawBlueprint);
    const blueprint = {
      nodes: validated.nodes,
      edges: validated.edges,
      summary: rawBlueprint.summary,
      changeType: rawBlueprint.changeType,
      isValid: validated.isValid,
      issues: validated.issues,
    };

    const stepsSummary = blueprint.nodes
      .map((node, index) => `${index + 1}. **${node.data?.name}** (${node.data?.group || node.data?.nodeType}): ${node.data?.description}`)
      .join('\n');

    const reply = (dynamicAiExplanation ? `${dynamicAiExplanation}\n\n` : '') +
      `**Workflow Architecture Blueprint (${blueprint.nodes.length} Nodes):**\n` +
      `${stepsSummary}\n\n` +
      `**CA Firm Best Practices Applied:**\n` +
      `* **Input & Trigger:** Starts reliably without manual trigger overhead.\n` +
      `* **AI Preparation:** Uses Google Gemini / AI model to draft compliance data.\n` +
      `* **Human-in-the-Loop:** Includes a mandatory **CA Partner Approval Gate** so no client receives an email without partner sign-off.\n` +
      `* **Action & Output:** Dispatches via configured connectors with full audit history.\n\n` +
      `Click **Apply to Canvas** below to load these ${blueprint.nodes.length} nodes and ${blueprint.edges.length} connections directly onto your visual workflow board.`;

    const activeProvider = liveAiResult?.provider || (hasLiveKey ? 'Google Gemini' : 'GRA AI Architect Dev Engine');
    const activeModel = liveAiResult?.model || (hasLiveKey ? 'gemini-1.5-flash' : 'gra-architect-rule-v2');

    return Response.json({
      reply,
      pipelinePreview: detectNodesFromPrompt(prompt),
      blueprint,
      actionIntent: null,
      mode: hasLiveKey ? 'live' : 'dev-architect-engine',
      provider: activeProvider,
      model: activeModel,
      fallbackUsed: Boolean(liveAiResult?.fallbackUsed),
      availableProviders,
      notice: hasLiveKey
        ? `Live AI active via ${activeProvider} (${activeModel})`
        : 'Development Architect Engine active. Set GEMINI_API_KEY in Vercel for live model inference.',
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Server error processing request.' },
      { status: 500 }
    );
  }
}
