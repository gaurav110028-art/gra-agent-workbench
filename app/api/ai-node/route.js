export const runtime = 'nodejs';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function extractJson(text) {
  const source = String(text || '').trim();

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : source;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const provider = String(payload.provider || 'Claude (Anthropic)');
  const systemPrompt = String(payload.systemPrompt || '').slice(0, 8000);
  const userPrompt = String(payload.userPrompt || '').slice(0, 20000);
  const wantsJson = payload.outputFormat === 'JSON';
  const jsonKeys = Array.isArray(payload.jsonKeys) ? payload.jsonKeys : [];

  if (!userPrompt.trim()) {
    return Response.json({ error: 'User prompt is empty.' }, { status: 400 });
  }

  const jsonInstruction = wantsJson
    ? `\n\nRespond with a single JSON object only${
        jsonKeys.length ? ` using exactly these keys: ${jsonKeys.join(', ')}` : ''
      }. No prose, no markdown fences.`
    : '';

  const system = `${systemPrompt}${jsonInstruction}`.trim();
  const useOpenAi = /openai/i.test(provider);

  try {
    if (useOpenAi) {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return Response.json(
          { error: 'OPENAI_API_KEY is not configured.' },
          { status: 500 }
        );
      }

      const model = 'gpt-4o-mini';

      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature: 0.3,
          ...(wantsJson ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      const raw = await response.json().catch(() => null);

      if (!response.ok) {
        return Response.json(
          { error: raw?.error?.message || `OpenAI returned HTTP ${response.status}.` },
          { status: 502 }
        );
      }

      const text = raw?.choices?.[0]?.message?.content || '';

      return Response.json({
        text,
        json: wantsJson ? extractJson(text) : null,
        model: raw?.model || model,
        tokens: {
          input: raw?.usage?.prompt_tokens || 0,
          output: raw?.usage?.completion_tokens || 0,
        },
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY is not configured.' },
        { status: 500 }
      );
    }

    const model = 'claude-haiku-4-5-20251001';

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.3,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      return Response.json(
        { error: raw?.error?.message || `Anthropic returned HTTP ${response.status}.` },
        { status: 502 }
      );
    }

    const text = (raw?.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return Response.json({
      text,
      json: wantsJson ? extractJson(text) : null,
      model: raw?.model || model,
      tokens: {
        input: raw?.usage?.input_tokens || 0,
        output: raw?.usage?.output_tokens || 0,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'AI request failed.' },
      { status: 500 }
    );
  }
}
