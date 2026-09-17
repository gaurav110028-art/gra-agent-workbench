export const runtime = 'nodejs';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normaliseRecipients(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isReasonableEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || '')
  );
}

export async function POST(request) {
  try {
    const apiKey =
      process.env.RESEND_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error:
            'RESEND_API_KEY is not configured in Vercel.',
        },
        { status: 500 }
      );
    }

    const payload = await request.json();

    const recipients =
      normaliseRecipients(payload.to);

    const subject = String(
      payload.subject || ''
    ).trim();

    const body = String(
      payload.body || ''
    ).trim();

    if (
      recipients.length === 0 ||
      recipients.some(
        (email) => !isReasonableEmail(email)
      )
    ) {
      return Response.json(
        {
          error:
            'Enter a valid recipient email address.',
        },
        { status: 400 }
      );
    }

    if (!subject) {
      return Response.json(
        {
          error:
            'Email subject is required.',
        },
        { status: 400 }
      );
    }

    if (!body) {
      return Response.json(
        {
          error:
            'Email body is required.',
        },
        { status: 400 }
      );
    }

    const from =
      process.env.RESEND_FROM_EMAIL ||
      'GRA Agent Workbench <onboarding@resend.dev>';

    const replyTo =
      process.env.RESEND_REPLY_TO || '';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#202124;white-space:pre-wrap">
        ${escapeHtml(body).replaceAll(
          '\n',
          '<br/>'
        )}
      </div>
    `;

    const resendPayload = {
      from,
      to: recipients,
      subject,
      text: body,
      html,
    };

    if (replyTo) {
      resendPayload.reply_to = replyTo;
    }

    const idempotencyParts = [
      'gra-approval-email',
      payload.approvalId ||
        payload.runId ||
        Date.now(),
      payload.nodeId || 'email',
    ];

    const response = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type':
            'application/json',
          'User-Agent':
            'GRA-Agent-Workbench/1.0',
          'Idempotency-Key':
            idempotencyParts
              .join('/')
              .slice(0, 240),
        },
        body: JSON.stringify(
          resendPayload
        ),
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error:
            result?.message ||
            result?.error ||
            'Resend rejected the email request.',
          providerResponse: result,
        },
        { status: response.status }
      );
    }

    return Response.json({
      ok: true,
      id: result.id,
      to: recipients,
      provider: 'Resend',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          'Unexpected email sending error.',
      },
      { status: 500 }
    );
  }
}
