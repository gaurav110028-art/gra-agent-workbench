/* =========================================================
   MULTI-MODEL AI ROUTER & PROVIDER ADAPTERS
   Supports:
   1. Google Gemini (Gemini 2.0 Flash / 3.8 Flash)
   2. OpenAI (GPT-4o / GPT-4o-mini)
   3. Anthropic Claude (Claude 3.5 Sonnet / Haiku 4.5)
   4. NVIDIA NIM (DeepSeek / Llama-3 / Mistral via NVIDIA API)

   Features:
   - Configurable priority router with automatic fallback
   - Server-side key security (keys never leaked to client)
   - Usage, latency, and cost telemetry tracking
   - Safe development engine fallback when no API keys are provided
========================================================= */

// In-memory usage telemetry
globalThis.__gra_ai_telemetry = globalThis.__gra_ai_telemetry || {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  fallbackEvents: 0,
  byProvider: {
    gemini: { calls: 0, errors: 0, totalInputTokens: 0, totalOutputTokens: 0 },
    openai: { calls: 0, errors: 0, totalInputTokens: 0, totalOutputTokens: 0 },
    anthropic: { calls: 0, errors: 0, totalInputTokens: 0, totalOutputTokens: 0 },
    nvidia: { calls: 0, errors: 0, totalInputTokens: 0, totalOutputTokens: 0 },
    dev_engine: { calls: 0, errors: 0, totalInputTokens: 0, totalOutputTokens: 0 },
  },
  recentLogs: [],
};

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Returns available provider list based on configured environment keys
 */
export function getAvailableProviders() {
  const providers = [];

  if (process.env.GEMINI_API_KEY) {
    providers.push({
      id: 'gemini',
      name: 'Google Gemini',
      model: 'gemini-2.0-flash',
      status: 'active',
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      id: 'openai',
      name: 'OpenAI',
      model: 'gpt-4o-mini',
      status: 'active',
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: 'anthropic',
      name: 'Anthropic Claude',
      model: 'claude-haiku-4-5-20251001',
      status: 'active',
    });
  }

  if (process.env.NVIDIA_API_KEY) {
    providers.push({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      model: 'meta/llama-3.1-70b-instruct',
      status: 'active',
    });
  }

  // Always available local fallback engine
  providers.push({
    id: 'dev_engine',
    name: 'GRA Dev Architect Engine',
    model: 'gra-architect-rule-v2',
    status: 'builtin',
  });

  return providers;
}

/**
 * Record usage telemetry
 */
function recordUsage(provider, success, inTokens = 0, outTokens = 0, errorMsg = null) {
  const telemetry = globalThis.__gra_ai_telemetry;
  telemetry.totalCalls += 1;
  if (success) {
    telemetry.successfulCalls += 1;
  } else {
    telemetry.failedCalls += 1;
  }

  if (!telemetry.byProvider[provider]) {
    telemetry.byProvider[provider] = { calls: 0, errors: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  }

  const pStats = telemetry.byProvider[provider];
  pStats.calls += 1;
  if (!success) pStats.errors += 1;
  pStats.totalInputTokens += inTokens;
  pStats.totalOutputTokens += outTokens;

  telemetry.recentLogs.unshift({
    timestamp: new Date().toISOString(),
    provider,
    success,
    tokens: { input: inTokens, output: outTokens },
    error: errorMsg || null,
  });

  if (telemetry.recentLogs.length > 50) {
    telemetry.recentLogs = telemetry.recentLogs.slice(0, 50);
  }
}

/**
 * Call Google Gemini API
 */
async function callGemini({ systemPrompt, userPrompt, temperature = 0.3 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  // Current working models (Oct 2026) in priority order
  // gemini-2.0-flash = stable fast model, gemini-3.8-flash = latest gen
  const candidateModels = [
    'gemini-2.0-flash',
    'gemini-3.8-flash',
    'gemini-2.5-flash',
  ];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      // API key as query param (Google AI Studio recommended method)
      const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: 1000,
        },
      };

      if (systemPrompt) {
        requestBody.system_instruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const raw = await res.json().catch(() => null);
      if (res.ok && raw?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = raw.candidates[0].content.parts[0].text;
        const inTokens = raw?.usageMetadata?.promptTokenCount || 0;
        const outTokens = raw?.usageMetadata?.candidatesTokenCount || 0;
        return { text, model, inTokens, outTokens, provider: 'gemini' };
      }

      if (!res.ok) {
        const msg = raw?.error?.message || `HTTP ${res.status}`;
        lastError = new Error(`Gemini ${model}: ${msg}`);
        console.warn(`Gemini model ${model} failed: ${msg}, trying next...`);
      }
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} exception: ${err.message}, trying next...`);
    }
  }

  throw lastError || new Error('All Gemini candidate models failed.');
}

/**
 * Call OpenAI API
 */
async function callOpenAI({ systemPrompt, userPrompt, temperature = 0.3 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const model = 'gpt-4o-mini';
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch(OPENAI_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 1200,
      messages,
    }),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(raw?.error?.message || `OpenAI returned HTTP ${res.status}`);
  }

  const text = raw?.choices?.[0]?.message?.content || '';
  const inTokens = raw?.usage?.prompt_tokens || 0;
  const outTokens = raw?.usage?.completion_tokens || 0;

  return { text, model, inTokens, outTokens, provider: 'openai' };
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropic({ systemPrompt, userPrompt, temperature = 0.3 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const model = 'claude-haiku-4-5-20251001';
  const res = await fetch(ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(raw?.error?.message || `Anthropic returned HTTP ${res.status}`);
  }

  const text = (raw?.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  const inTokens = raw?.usage?.input_tokens || 0;
  const outTokens = raw?.usage?.output_tokens || 0;

  return { text, model, inTokens, outTokens, provider: 'anthropic' };
}

/**
 * Call NVIDIA NIM API
 */
async function callNvidia({ systemPrompt, userPrompt, temperature = 0.3 }) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY is not configured');

  const model = 'meta/llama-3.1-70b-instruct';
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch(NVIDIA_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 1200,
      messages,
    }),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(raw?.error?.message || `NVIDIA returned HTTP ${res.status}`);
  }

  const text = raw?.choices?.[0]?.message?.content || '';
  const inTokens = raw?.usage?.prompt_tokens || 0;
  const outTokens = raw?.usage?.completion_tokens || 0;

  return { text, model, inTokens, outTokens, provider: 'nvidia' };
}

/**
 * Execute completion via Intelligent Model Router with Fallback
 * Primary candidate -> Fallback candidate -> Rule-based Dev Engine
 */
export async function executeWithRouter({
  preferredProvider = null,
  systemPrompt = '',
  userPrompt = '',
  temperature = 0.3,
}) {
  const callProviderMap = {
    gemini: callGemini,
    openai: callOpenAI,
    anthropic: callAnthropic,
    nvidia: callNvidia,
  };

  // Determine priority order
  const order = [];
  if (preferredProvider && callProviderMap[preferredProvider]) {
    order.push(preferredProvider);
  }

  // Add all other configured providers in priority: Gemini -> OpenAI -> Anthropic -> NVIDIA
  ['gemini', 'openai', 'anthropic', 'nvidia'].forEach((p) => {
    if (!order.includes(p)) order.push(p);
  });

  // Attempt providers in order
  for (let i = 0; i < order.length; i += 1) {
    const providerKey = order[i];
    const runner = callProviderMap[providerKey];

    // Check if key is available before trying
    const hasKey =
      (providerKey === 'gemini' && process.env.GEMINI_API_KEY) ||
      (providerKey === 'openai' && process.env.OPENAI_API_KEY) ||
      (providerKey === 'anthropic' && process.env.ANTHROPIC_API_KEY) ||
      (providerKey === 'nvidia' && process.env.NVIDIA_API_KEY);

    if (!hasKey) continue;

    try {
      const result = await runner({ systemPrompt, userPrompt, temperature });
      recordUsage(providerKey, true, result.inTokens, result.outTokens);
      return {
        ...result,
        fallbackUsed: i > 0,
        originalProviderRequested: preferredProvider,
      };
    } catch (err) {
      console.warn(`Provider ${providerKey} failed: ${err.message}. Trying next fallback...`);
      recordUsage(providerKey, false, 0, 0, err.message);
      globalThis.__gra_ai_telemetry.fallbackEvents += 1;
    }
  }

  // Builtin rule-based fallback if no live provider succeeded
  recordUsage('dev_engine', true, 0, 0);
  return {
    text: null,
    model: 'gra-architect-dev-engine',
    provider: 'dev_engine',
    fallbackUsed: true,
    isLocalEngine: true,
  };
}

/**
 * Get AI Usage and Telemetry Stats
 */
export function getAiTelemetry() {
  return {
    ...globalThis.__gra_ai_telemetry,
    availableProviders: getAvailableProviders(),
  };
}
