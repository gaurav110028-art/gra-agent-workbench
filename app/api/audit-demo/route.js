export const runtime = 'nodejs';
export const maxDuration = 60;

const OPENAI_URL = 'https://api.openai.com/v1/responses';

const BALANCE_KEYS = [
  'cash',
  'bank',
  'trade_receivables',
  'security_deposits',
  'inventory',
  'ppe',
  'accumulated_depreciation',
  'trade_payables',
  'gst_output_liability',
  'gst_input_credit',
  'tds_payable',
  'employee_benefits_payable',
  'term_loan',
  'equity',
  'retained_earnings',
  'other',
];

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clientName: { type: 'string' },
    extractionSummary: { type: 'string' },
    priorYearBalances: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', enum: BALANCE_KEYS },
          rawName: { type: 'string' },
          amount: { type: 'number' },
          side: { type: 'string', enum: ['Dr', 'Cr'] },
        },
        required: ['key', 'rawName', 'amount', 'side'],
      },
    },
    currentYearOpenings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', enum: BALANCE_KEYS },
          rawName: { type: 'string' },
          amount: { type: 'number' },
          side: { type: 'string', enum: ['Dr', 'Cr'] },
        },
        required: ['key', 'rawName', 'amount', 'side'],
      },
    },
    gstRows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          month: { type: 'string' },
          booksTaxableSales: { type: 'number' },
          gstr1TaxableSales: { type: 'number' },
          booksOutputGST: { type: 'number' },
          gstr3bOutputGST: { type: 'number' },
          booksITC: { type: 'number' },
          gstr3bITCClaimed: { type: 'number' },
        },
        required: [
          'month',
          'booksTaxableSales',
          'gstr1TaxableSales',
          'booksOutputGST',
          'gstr3bOutputGST',
          'booksITC',
          'gstr3bITCClaimed',
        ],
      },
    },
  },
  required: [
    'clientName',
    'extractionSummary',
    'priorYearBalances',
    'currentYearOpenings',
    'gstRows',
  ],
};

function mimeFor(file) {
  if (file.type) return file.type;

  const lower = file.name.toLowerCase();

  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';

  return 'application/octet-stream';
}

async function toInputFile(file, detail) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString('base64');

  return {
    type: 'input_file',
    filename: file.name,
    file_data: `data:${mimeFor(file)};base64,${base64}`,
    ...(detail ? { detail } : {}),
  };
}

function getOutputText(response) {
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;

    for (const content of item.content || []) {
      if (content?.type === 'output_text' && content.text) {
        return content.text;
      }
    }
  }

  return '';
}

function signed(balance) {
  const amount = Math.abs(Number(balance?.amount || 0));
  return balance?.side === 'Cr' ? -amount : amount;
}

function absoluteDifference(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0));
}

function prettyKey(key, rawName) {
  if (rawName) return rawName;

  return String(key || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function openingQuery(area, difference) {
  return `Please provide a reconciliation for the Rs ${Math.round(
    Math.abs(difference)
  ).toLocaleString('en-IN')} difference between the prior-year signed closing balance and the current-year opening trial balance for ${area}, together with supporting entries/documents.`;
}

function gstQuery(month, area, difference) {
  return `Please reconcile ${month} ${area}. The difference identified is Rs ${Math.round(
    Math.abs(difference)
  ).toLocaleString('en-IN')}. Please provide invoice/return workings and the reason for the difference.`;
}

function reconcile(extracted) {
  const prior = new Map();
  const current = new Map();

  for (const item of extracted.priorYearBalances || []) {
    if (item.key === 'other') continue;
    if (!prior.has(item.key)) prior.set(item.key, item);
  }

  for (const item of extracted.currentYearOpenings || []) {
    if (item.key === 'other') continue;
    if (!current.has(item.key)) current.set(item.key, item);
  }

  const openingFindings = [];

  for (const [key, priorItem] of prior.entries()) {
    const currentItem = current.get(key);

    if (!currentItem) continue;

    const priorSigned = signed(priorItem);
    const currentSigned = signed(currentItem);
    const difference = currentSigned - priorSigned;

    if (Math.abs(difference) < 1) continue;

    const area = prettyKey(
      key,
      currentItem.rawName || priorItem.rawName
    );

    openingFindings.push({
      type: 'Opening Balance',
      key,
      area,
      priorYearClosing: priorSigned,
      currentYearOpening: currentSigned,
      difference: Math.abs(difference),
      observation: `Opening balance differs from the prior-year signed closing balance by Rs ${Math.round(
        Math.abs(difference)
      ).toLocaleString('en-IN')}.`,
      query: openingQuery(area, difference),
      requiresSeniorCA: true,
    });
  }

  const gstFindings = [];

  for (const row of extracted.gstRows || []) {
    const checks = [
      {
        area: 'GSTR-1 taxable turnover vs books',
        difference:
          Number(row.gstr1TaxableSales || 0) -
          Number(row.booksTaxableSales || 0),
      },
      {
        area: 'GSTR-3B output GST vs books',
        difference:
          Number(row.gstr3bOutputGST || 0) -
          Number(row.booksOutputGST || 0),
      },
      {
        area: 'GSTR-3B ITC claimed vs books',
        difference:
          Number(row.gstr3bITCClaimed || 0) -
          Number(row.booksITC || 0),
      },
    ];

    for (const check of checks) {
      if (Math.abs(check.difference) < 1) continue;

      gstFindings.push({
        type: 'GST Reconciliation',
        key: `${row.month}-${check.area}`,
        area: `${row.month} · ${check.area}`,
        difference: Math.abs(check.difference),
        observation: `${check.area} differs by Rs ${Math.round(
          Math.abs(check.difference)
        ).toLocaleString('en-IN')}.`,
        query: gstQuery(
          row.month,
          check.area,
          check.difference
        ),
        requiresSeniorCA: true,
      });
    }
  }

  const findings = [
    ...openingFindings,
    ...gstFindings,
  ];

  const queries = findings.map((finding) => ({
    area: finding.area,
    amount: finding.difference,
    query: finding.query,
    requiresSeniorCA: true,
  }));

  return {
    clientName: extracted.clientName || 'Demo Client',
    extractionSummary:
      extracted.extractionSummary ||
      'Files extracted successfully.',
    openingFindings,
    gstFindings,
    findings,
    queries,
    extractedCounts: {
      priorYearBalances:
        extracted.priorYearBalances?.length || 0,
      currentYearOpenings:
        extracted.currentYearOpenings?.length || 0,
      gstRows: extracted.gstRows?.length || 0,
    },
  };
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        {
          error:
            'OPENAI_API_KEY is missing in Vercel Environment Variables.',
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const financialStatements = formData.get(
      'financialStatements'
    );
    const trialBalance = formData.get('trialBalance');
    const gstData = formData.get('gstData');

    if (
      !(financialStatements instanceof File) ||
      !(trialBalance instanceof File) ||
      !(gstData instanceof File)
    ) {
      return Response.json(
        {
          error:
            'Please upload the signed financial statements PDF, trial balance Excel and GST reconciliation Excel.',
        },
        { status: 400 }
      );
    }

    const totalBytes =
      financialStatements.size +
      trialBalance.size +
      gstData.size;

    if (totalBytes > 12 * 1024 * 1024) {
      return Response.json(
        {
          error:
            'Demo upload is limited to 12 MB total. Use smaller demo files.',
        },
        { status: 413 }
      );
    }

    const [fsInput, tbInput, gstInput] =
      await Promise.all([
        toInputFile(financialStatements, 'high'),
        toInputFile(trialBalance),
        toInputFile(gstData),
      ]);

    const openAIResponse = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_MODEL ||
          'gpt-5.6-luna',
        store: false,
        input: [
          {
            role: 'user',
            content: [
              fsInput,
              tbInput,
              gstInput,
              {
                type: 'input_text',
                text: `You are performing extraction only for a Chartered Accountant audit assistant demo.

The first file is the prior-year signed financial statements. Extract signed closing balance-sheet figures relevant to opening-balance reconciliation.
The second file is the current-year trial balance. Extract opening debit/credit balances. Ignore period movements when identifying opening balances.
The third file is GST reconciliation data. Extract each monthly row containing books taxable sales, GSTR-1 taxable sales, books output GST, GSTR-3B output GST, books ITC and GSTR-3B ITC claimed.

For balance items use one of the supplied standardized keys. Amount must always be a positive number and side must separately state Dr or Cr. Assets and receivables are normally Dr. Liabilities, equity and accumulated depreciation are normally Cr. Use the source document values only. Do not invent missing figures. Do not calculate audit conclusions.`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'gra_audit_demo_extraction',
            strict: true,
            schema: extractionSchema,
          },
          verbosity: 'low',
        },
      }),
    });

    const raw = await openAIResponse.json();

    if (!openAIResponse.ok) {
      return Response.json(
        {
          error:
            raw?.error?.message ||
            'OpenAI file analysis failed.',
        },
        { status: openAIResponse.status }
      );
    }

    const outputText = getOutputText(raw);

    if (!outputText) {
      return Response.json(
        {
          error:
            'OpenAI returned no structured extraction result.',
        },
        { status: 502 }
      );
    }

    let extracted;

    try {
      extracted = JSON.parse(outputText);
    } catch {
      return Response.json(
        {
          error:
            'Could not parse the structured audit extraction.',
        },
        { status: 502 }
      );
    }

    const result = reconcile(extracted);

    return Response.json({
      ...result,
      processedAt: new Date().toISOString(),
      engine: 'OpenAI extraction + deterministic reconciliation',
      liveEmailSent: false,
    });
  } catch (error) {
    console.error('GRA audit demo error', error);

    return Response.json(
      {
        error:
          error?.message ||
          'Unexpected audit demo processing error.',
      },
      { status: 500 }
    );
  }
}
