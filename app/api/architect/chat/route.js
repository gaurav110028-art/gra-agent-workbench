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
   GAURAV: AI Automation Architect for GRA Agent Workbench
   Endpoint: POST /api/architect/chat
========================================================= */

const GAURAV_SYSTEM_PROMPT = `You are Gaurav, AI Automation Architect for GRA Agent Workbench (CA firm automation platform).
RULES:
1. When greeted with "hi" or "hello", reply with a warm, natural 1-sentence greeting like: "Hey! I am **Gaurav**, your AI Automation Architect. How can I help you today?"
2. For questions, answer directly in 1-2 sentences with the key answer in **bold**. Never stop mid-sentence.
3. Natural Hinglish/English tone. Never use em-dashes. Never use hashtags.`;

function isWorkflowCreationRequest(text) {
  const clean = String(text || '').trim().toLowerCase();
  const keywords = [
    'workflow', 'agent', 'automation', 'pipeline', 'flow', 'nodes',
    'chaser', 'reconcil', 'invoice', 'parser', 'reminder', 'schedule',
    'make a', 'make an', 'create a', 'create an', 'build a', 'build an',
    'email automation', 'mail automation', 'whatsapp', 'bot',
  ];
  return keywords.some((k) => clean.includes(k));
}

function detectControllerCommand(text) {
  const clean = String(text || '').trim().toLowerCase();
  if (clean.includes('schedule') && (clean.includes('daily') || clean.includes('run every') || clean.includes('24/7'))) {
    return { action: 'SCHEDULE_DAILY', label: 'Schedule 24/7 Daily Run' };
  }
  if (clean.includes('pause schedule') || clean.includes('pause agent')) {
    return { action: 'PAUSE_SCHEDULE', label: 'Pause Future Runs' };
  }
  if (clean.includes('resume schedule') || clean.includes('resume agent')) {
    return { action: 'RESUME_SCHEDULE', label: 'Resume 24/7 Schedule' };
  }
  if (clean.includes('approve') || clean.includes('proceed')) {
    return { action: 'APPROVE_STEP', label: 'Approve & Continue' };
  }
  if (clean.includes('reject') || clean.includes('decline')) {
    return { action: 'REJECT_STEP', label: 'Reject Approval' };
  }
  return null;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const prompt = String(payload.prompt || '').trim();
    const currentNodes = Array.isArray(payload.currentNodes) ? payload.currentNodes : [];
    const currentEdges = Array.isArray(payload.currentEdges) ? payload.currentEdges : [];
    const agentName = String(payload.agentName || 'Agent');
    const preferredProvider = payload.preferredProvider || null;

    if (!prompt) {
      return Response.json({ error: 'Prompt cannot be empty.' }, { status: 400 });
    }

    const availableProviders = getAvailableProviders();
    const hasLiveKey = availableProviders.some((p) => p.status === 'active');

    // 1. Controller Command Check (Pause, Resume, Approve)
    const ctrlCommand = detectControllerCommand(prompt);
    if (ctrlCommand) {
      let reply = `Action confirmed: **${ctrlCommand.label}** for ${agentName}.`;
      if (ctrlCommand.action === 'SCHEDULE_DAILY') {
        reply = `24/7 background schedule configured for **${agentName}** (Daily at 09:00 AM IST with cloud persistence).`;
      } else if (ctrlCommand.action === 'PAUSE_SCHEDULE') {
        reply = `Future automated runs for **${agentName}** are now paused.`;
      } else if (ctrlCommand.action === 'APPROVE_STEP') {
        reply = `CA Partner Approval granted. Workflow execution resumed.`;
      }

      return Response.json({
        reply,
        pipelinePreview: null,
        blueprint: null,
        actionIntent: { type: ctrlCommand.action, label: ctrlCommand.label },
        mode: hasLiveKey ? 'live' : 'dev-architect-engine',
        provider: 'Gaurav Architect',
        model: 'gaurav-controller',
      });
    }

    // 2. Workflow Creation Request vs General Conversation
    const wantsWorkflow = isWorkflowCreationRequest(prompt);

    // Call Gemini 2.0 Flash / Live Model Router
    let liveAiResult = null;
    try {
      const userMessage = wantsWorkflow
        ? `The user wants to create/modify a CA automation workflow: "${prompt}".
Please explain concisely in 2-3 bullet points how this workflow should run (Trigger -> Intake -> AI -> CA Partner Approval -> Output). Always follow CA firm safety: require Partner Approval Gate before sending emails/messages.`
        : prompt;

      liveAiResult = await executeWithRouter({
        preferredProvider,
        userPrompt: userMessage,
        systemPrompt: GAURAV_SYSTEM_PROMPT,
      });
    } catch (err) {
      console.warn('Router error:', err.message);
    }

    const activeProvider = liveAiResult?.provider || (hasLiveKey ? 'Google Gemini' : 'Gaurav Architect');
    const activeModel = liveAiResult?.model || 'gemini-2.0-flash';

    // If it's a normal conversation question (like "What is LLM?", "Hi", etc.)
    if (!wantsWorkflow) {
      const conversationalReply = liveAiResult?.text ||
        `Hey bro! I am Gaurav, your AI Automation Architect. I am right here to help you build workflows, automate CA compliance, and answer any questions. Tell me what you want to create!`;

      return Response.json({
        reply: conversationalReply,
        pipelinePreview: null,
        blueprint: null,
        actionIntent: null,
        mode: hasLiveKey ? 'live' : 'dev-architect-engine',
        provider: activeProvider,
        model: activeModel,
        fallbackUsed: Boolean(liveAiResult?.fallbackUsed),
        availableProviders,
      });
    }

    // If it's a workflow request, generate visual nodes + blueprint
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

    const aiExplanation = liveAiResult?.text
      ? `${liveAiResult.text}\n\n`
      : `Bro, here is the automation architecture designed for **${agentName}**:\n\n`;

    const reply = `${aiExplanation}**Workflow Architecture Blueprint (${blueprint.nodes.length} Nodes):**\n` +
      `${stepsSummary}\n\n` +
      `**CA Firm Design Standards Applied:**\n` +
      `* **Trigger:** Scheduled or event-driven without manual effort.\n` +
      `* **AI Engine:** Pre-fills and drafts compliance data with Gemini.\n` +
      `* **Partner Approval Gate:** Pauses before sending communications so no client receives an unverified email.\n` +
      `* **Dispatch:** Sends via Resend / WhatsApp API with audit tracking.\n\n` +
      `Click **Apply to Canvas** below to load these ${blueprint.nodes.length} nodes directly onto your board.`;

    return Response.json({
      reply,
      pipelinePreview: null,
      blueprint,
      actionIntent: null,
      mode: hasLiveKey ? 'live' : 'dev-architect-engine',
      provider: activeProvider,
      model: activeModel,
      fallbackUsed: Boolean(liveAiResult?.fallbackUsed),
      availableProviders,
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Server error processing request.' },
      { status: 500 }
    );
  }
}
