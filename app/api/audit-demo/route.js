import { inflateRawSync } from 'node:zlib';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const BALANCE_KEYS = [
  'capital',
  'secured_loans',
  'fixed_assets_net',
  'inventory',
  'trade_receivables',
  'cash_and_bank',
  'other_current_assets',
  'loans_and_advances',
  'current_liabilities',
  'other',
];

const GST_AREA_KEYS = [
  'sales_turnover',
  'output_gst',
  'itc_claimed',
];

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clientName: { type: 'string' },
    extractionSummary: { type: 'string' },

    trialBalanceComplete: { type: 'boolean' },

    sourceWarnings: {
      type: 'array',
      items: { type: 'string' },
    },

    gstScope: { type: 'string' },

    priorYearBalances: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: {
            type: 'string',
            enum: BALANCE_KEYS,
          },
          rawName: { type: 'string' },
          amount: { type: 'number' },
          side: {
            type: 'string',
            enum: ['Dr', 'Cr'],
          },
        },
        required: [
          'key',
          'rawName',
          'amount',
          'side',
        ],
      },
    },

    currentYearOpenings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: {
            type: 'string',
            enum: BALANCE_KEYS,
          },
          rawName: { type: 'string' },
          amount: { type: 'number' },
          side: {
            type: 'string',
            enum: ['Dr', 'Cr'],
          },
          location: { type: 'string' },
          isInterBranch: { type: 'boolean' },
        },
        required: [
          'key',
          'rawName',
          'amount',
          'side',
          'location',
          'isInterBranch',
        ],
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

          booksOutputIGST: { type: 'number' },
          booksOutputCGST: { type: 'number' },
          booksOutputSGST: { type: 'number' },

          gstr3bOutputIGST: { type: 'number' },
          gstr3bOutputCGST: { type: 'number' },
          gstr3bOutputSGST: { type: 'number' },

          booksITCIGST: { type: 'number' },
          booksITCCGST: { type: 'number' },
          booksITCSGST: { type: 'number' },

          gstr3bITCIGST: { type: 'number' },
          gstr3bITCCGST: { type: 'number' },
          gstr3bITCSGST: { type: 'number' },
        },
        required: [
          'month',
          'booksTaxableSales',
          'gstr1TaxableSales',
          'booksOutputIGST',
          'booksOutputCGST',
          'booksOutputSGST',
          'gstr3bOutputIGST',
          'gstr3bOutputCGST',
          'gstr3bOutputSGST',
          'booksITCIGST',
          'booksITCCGST',
          'booksITCSGST',
          'gstr3bITCIGST',
          'gstr3bITCCGST',
          'gstr3bITCSGST',
        ],
      },
    },

    explainedDifferences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          month: { type: 'string' },
          areaKey: {
            type: 'string',
            enum: GST_AREA_KEYS,
          },
          reason: { type: 'string' },
        },
        required: [
          'month',
          'areaKey',
          'reason',
        ],
      },
    },

    gstSpecificExceptions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          area: { type: 'string' },
          amount: { type: 'number' },
          observation: { type: 'string' },
          status: {
            type: 'string',
            enum: [
              'Unresolved',
              'Explained',
              'Timing',
            ],
          },
          suggestedQuery: { type: 'string' },
        },
        required: [
          'area',
          'amount',
          'observation',
          'status',
          'suggestedQuery',
        ],
      },
    },
  },

  required: [
    'clientName',
    'extractionSummary',
    'trialBalanceComplete',
    'sourceWarnings',
    'gstScope',
    'priorYearBalances',
    'currentYearOpenings',
    'gstRows',
    'explainedDifferences',
    'gstSpecificExceptions',
  ],
};

function decodeXml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, number) =>
      String.fromCodePoint(Number(number))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(parseInt(number, 16))
    );
}

function stripSpreadsheetNamespace(xml = '') {
  return xml
    .replaceAll('<x:', '<')
    .replaceAll('</x:', '</');
}

function unzipEntries(buffer) {
  let endRecord = -1;
  const minimumOffset = Math.max(
    0,
    buffer.length - 65557
  );

  for (
    let offset = buffer.length - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (
      buffer.readUInt32LE(offset) ===
      0x06054b50
    ) {
      endRecord = offset;
      break;
    }
  }

  if (endRecord < 0) {
    throw new Error(
      'The Excel file could not be opened as an XLSX workbook.'
    );
  }

  const totalEntries =
    buffer.readUInt16LE(endRecord + 10);

  let directoryOffset =
    buffer.readUInt32LE(endRecord + 16);

  const files = new Map();

  for (
    let entryIndex = 0;
    entryIndex < totalEntries;
    entryIndex += 1
  ) {
    if (
      buffer.readUInt32LE(directoryOffset) !==
      0x02014b50
    ) {
      throw new Error(
        'The Excel ZIP directory is invalid.'
      );
    }

    const compressionMethod =
      buffer.readUInt16LE(
        directoryOffset + 10
      );

    const compressedSize =
      buffer.readUInt32LE(
        directoryOffset + 20
      );

    const nameLength =
      buffer.readUInt16LE(
        directoryOffset + 28
      );

    const extraLength =
      buffer.readUInt16LE(
        directoryOffset + 30
      );

    const commentLength =
      buffer.readUInt16LE(
        directoryOffset + 32
      );

    const localHeaderOffset =
      buffer.readUInt32LE(
        directoryOffset + 42
      );

    const fileName = buffer
      .slice(
        directoryOffset + 46,
        directoryOffset + 46 + nameLength
      )
      .toString('utf8');

    if (
      buffer.readUInt32LE(
        localHeaderOffset
      ) !== 0x04034b50
    ) {
      throw new Error(
        'The Excel workbook contains an invalid ZIP entry.'
      );
    }

    const localNameLength =
      buffer.readUInt16LE(
        localHeaderOffset + 26
      );

    const localExtraLength =
      buffer.readUInt16LE(
        localHeaderOffset + 28
      );

    const dataStart =
      localHeaderOffset +
      30 +
      localNameLength +
      localExtraLength;

    const compressedData =
      buffer.slice(
        dataStart,
        dataStart + compressedSize
      );

    let data;

    if (compressionMethod === 0) {
      data = compressedData;
    } else if (
      compressionMethod === 8
    ) {
      data =
        inflateRawSync(compressedData);
    } else {
      throw new Error(
        `Unsupported Excel compression method: ${compressionMethod}`
      );
    }

    files.set(fileName, data);

    directoryOffset +=
      46 +
      nameLength +
      extraLength +
      commentLength;
  }

  return files;
}

function columnIndex(cellReference = 'A1') {
  const letters =
    cellReference
      .match(/[A-Z]+/i)?.[0]
      ?.toUpperCase() || 'A';

  let value = 0;

  for (const character of letters) {
    value =
      value * 26 +
      character.charCodeAt(0) -
      64;
  }

  return value - 1;
}

function extractTextTags(xml = '') {
  return [
    ...xml.matchAll(
      /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
    ),
  ]
    .map((match) =>
      decodeXml(match[1])
    )
    .join('');
}

function worksheetToTsv(
  xml,
  sharedStrings
) {
  const normalized =
    stripSpreadsheetNamespace(xml);

  const lines = [];

  for (
    const rowMatch of
    normalized.matchAll(
      /<row\b[^>]*>([\s\S]*?)<\/row>/g
    )
  ) {
    const rowXml = rowMatch[1];
    const values = [];

    for (
      const cellMatch of
      rowXml.matchAll(
        /<c\b([^>]*)>([\s\S]*?)<\/c>/g
      )
    ) {
      const attributes =
        cellMatch[1];

      const body =
        cellMatch[2];

      const reference =
        attributes.match(
          /\br="([^"]+)"/
        )?.[1] || 'A1';

      const type =
        attributes.match(
          /\bt="([^"]+)"/
        )?.[1] || '';

      const index =
        columnIndex(reference);

      let value = '';

      if (type === 'inlineStr') {
        value =
          extractTextTags(body);
      } else {
        const raw =
          body.match(
            /<v>([\s\S]*?)<\/v>/
          )?.[1] ?? '';

        if (type === 's') {
          value =
            sharedStrings[
              Number(raw)
            ] ?? raw;
        } else if (type === 'b') {
          value =
            raw === '1'
              ? 'TRUE'
              : 'FALSE';
        } else {
          value =
            decodeXml(raw);
        }
      }

      while (
        values.length <= index
      ) {
        values.push('');
      }

      values[index] =
        String(value)
          .replace(
            /[\t\r\n]+/g,
            ' '
          )
          .trim();
    }

    while (
      values.length &&
      values[
        values.length - 1
      ] === ''
    ) {
      values.pop();
    }

    if (
      values.some(
        (value) =>
          value !== ''
      )
    ) {
      lines.push(
        values.join('\t')
      );
    }
  }

  return lines.join('\n');
}

function workbookSheetMap(files) {
  const workbookXml =
    stripSpreadsheetNamespace(
      files
        .get('xl/workbook.xml')
        ?.toString('utf8') || ''
    );

  const relsXml =
    files
      .get(
        'xl/_rels/workbook.xml.rels'
      )
      ?.toString('utf8') || '';

  const relationshipMap =
    new Map();

  for (
    const match of
    relsXml.matchAll(
      /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g
    )
  ) {
    relationshipMap.set(
      match[1],
      match[2]
    );
  }

  const sheets = [];

  for (
    const match of
    workbookXml.matchAll(
      /<sheet\b([^>]*)\/?>/g
    )
  ) {
    const attrs = match[1];

    const name =
      decodeXml(
        attrs.match(
          /\bname="([^"]+)"/
        )?.[1] || ''
      );

    const relId =
      attrs.match(
        /\br:id="([^"]+)"/
      )?.[1] || '';

    let target =
      relationshipMap.get(relId) ||
      '';

    if (
      target &&
      !target.startsWith('xl/')
    ) {
      target = `xl/${target.replace(
        /^\//,
        ''
      )}`;
    }

    if (name && target) {
      sheets.push({
        name,
        target,
      });
    }
  }

  if (sheets.length) {
    return sheets;
  }

  return [...files.keys()]
    .filter((name) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(
        name
      )
    )
    .sort()
    .map((target, index) => ({
      name: `Sheet ${index + 1}`,
      target,
    }));
}

function xlsxSelectedSheetsToText(
  buffer,
  fileName,
  preferredSheetNames = []
) {
  const files =
    unzipEntries(buffer);

  const sharedXml =
    stripSpreadsheetNamespace(
      files
        .get(
          'xl/sharedStrings.xml'
        )
        ?.toString('utf8') ||
        ''
    );

  const sharedStrings = [
    ...sharedXml.matchAll(
      /<si>([\s\S]*?)<\/si>/g
    ),
  ].map((match) =>
    extractTextTags(match[1])
  );

  const sheetMap =
    workbookSheetMap(files);

  const selected =
    preferredSheetNames.length
      ? sheetMap.filter(
          (sheet) =>
            preferredSheetNames
              .map((name) =>
                name.toLowerCase()
              )
              .includes(
                sheet.name.toLowerCase()
              )
        )
      : sheetMap;

  const finalSelection =
    selected.length
      ? selected
      : sheetMap.filter(
          (sheet) =>
            sheet.name.toLowerCase() !==
            'index'
        );

  if (!finalSelection.length) {
    throw new Error(
      `No usable worksheet was found in ${fileName}.`
    );
  }

  return finalSelection
    .map((sheet) => {
      const xmlBuffer =
        files.get(sheet.target);

      if (!xmlBuffer) {
        return '';
      }

      const text =
        worksheetToTsv(
          xmlBuffer.toString(
            'utf8'
          ),
          sharedStrings
        );

      return `### SHEET: ${sheet.name}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function isPdf(file) {
  return file.name
    .toLowerCase()
    .endsWith('.pdf');
}

function isXlsx(file) {
  return file.name
    .toLowerCase()
    .endsWith('.xlsx');
}

function signed(balance) {
  const amount = Math.abs(
    Number(
      balance?.amount || 0
    )
  );

  return balance?.side === 'Cr'
    ? -amount
    : amount;
}

function prettyKey(
  key,
  rawName
) {
  if (rawName) return rawName;

  return String(key || '')
    .replaceAll('_', ' ')
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

function openingQuery(
  area,
  difference
) {
  return `Please provide a reconciliation for the Rs ${Math.round(
    Math.abs(difference)
  ).toLocaleString(
    'en-IN'
  )} difference between the prior-year consolidated signed closing balance and the consolidated current-year opening trial balance for ${area}, together with the location-wise break-up and supporting entries/documents.`;
}

function gstQuery(
  month,
  area,
  difference
) {
  return `Please reconcile ${month} ${area}. The difference identified is Rs ${Math.round(
    Math.abs(difference)
  ).toLocaleString(
    'en-IN'
  )}. Please provide invoice/return workings and the reason for the difference.`;
}

function totalTax(
  igst,
  cgst,
  sgst
) {
  return (
    Number(igst || 0) +
    Number(cgst || 0) +
    Number(sgst || 0)
  );
}

function aggregateBalances(
  balances = []
) {
  const map = new Map();

  for (const item of balances) {
    if (
      item.key === 'other'
    ) {
      continue;
    }

    if (
      item.isInterBranch === true
    ) {
      continue;
    }

    const current =
      map.get(item.key) || {
        key: item.key,
        rawNames: [],
        signedAmount: 0,
        locations: [],
      };

    current.signedAmount +=
      signed(item);

    if (
      item.rawName &&
      !current.rawNames.includes(
        item.rawName
      )
    ) {
      current.rawNames.push(
        item.rawName
      );
    }

    if (
      item.location &&
      !current.locations.includes(
        item.location
      )
    ) {
      current.locations.push(
        item.location
      );
    }

    map.set(
      item.key,
      current
    );
  }

  return map;
}

function findExplanation(
  explainedDifferences,
  month,
  areaKey
) {
  return (
    explainedDifferences || []
  ).find(
    (item) =>
      String(item.month)
        .toLowerCase() ===
        String(month)
          .toLowerCase() &&
      item.areaKey === areaKey
  );
}

function reconcile(extracted) {
  const sourceWarnings =
    Array.isArray(
      extracted.sourceWarnings
    )
      ? [...extracted.sourceWarnings]
      : [];

  const sourceFindings = [];

  if (
    extracted.trialBalanceComplete ===
    false
  ) {
    sourceFindings.push({
      type:
        'Source Completeness',
      key:
        'trial-balance-incomplete',
      area:
        'Current-year Trial Balance',
      difference: 0,
      observation:
        'The current-year trial balance appears incomplete. A consolidated opening-balance conclusion has therefore not been made.',
      query:
        'Please provide the complete current-year trial balance for all locations, including every continuation page / complete export, so that opening balances can be consolidated and reconciled to the signed financial statements.',
      requiresSeniorCA: true,
      status: 'Unresolved',
    });

    if (
      !sourceWarnings.some(
        (warning) =>
          /trial balance/i.test(
            warning
          )
      )
    ) {
      sourceWarnings.push(
        'Opening-balance reconciliation is limited because the current-year trial balance appears incomplete.'
      );
    }
  }

  const prior =
    aggregateBalances(
      (extracted.priorYearBalances || []).map(
        (item) => ({
          ...item,
          location:
            'Consolidated Signed FS',
          isInterBranch: false,
        })
      )
    );

  const current =
    aggregateBalances(
      extracted.currentYearOpenings ||
        []
    );

  const openingFindings = [];

  if (
    extracted.trialBalanceComplete !==
    false
  ) {
    for (
      const [key, priorItem]
      of prior.entries()
    ) {
      const currentItem =
        current.get(key);

      if (!currentItem) {
        continue;
      }

      const difference =
        currentItem.signedAmount -
        priorItem.signedAmount;

      if (
        Math.abs(difference) <
        1
      ) {
        continue;
      }

      const area =
        prettyKey(
          key,
          currentItem.rawNames[0] ||
            priorItem.rawNames[0]
        );

      openingFindings.push({
        type:
          'Opening Balance',
        key,
        area,
        priorYearClosing:
          priorItem.signedAmount,
        currentYearOpening:
          currentItem.signedAmount,
        locations:
          currentItem.locations,
        difference:
          Math.abs(difference),
        observation:
          `Consolidated opening balance differs from the prior-year signed closing balance by Rs ${Math.round(
            Math.abs(
              difference
            )
          ).toLocaleString(
            'en-IN'
          )}.`,
        query:
          openingQuery(
            area,
            difference
          ),
        requiresSeniorCA: true,
        status: 'Unresolved',
      });
    }
  }

  const gstFindings = [];

  for (
    const row of
    extracted.gstRows || []
  ) {
    const booksOutputGST =
      totalTax(
        row.booksOutputIGST,
        row.booksOutputCGST,
        row.booksOutputSGST
      );

    const gstr3bOutputGST =
      totalTax(
        row.gstr3bOutputIGST,
        row.gstr3bOutputCGST,
        row.gstr3bOutputSGST
      );

    const booksITC =
      totalTax(
        row.booksITCIGST,
        row.booksITCCGST,
        row.booksITCSGST
      );

    const gstr3bITC =
      totalTax(
        row.gstr3bITCIGST,
        row.gstr3bITCCGST,
        row.gstr3bITCSGST
      );

    const checks = [
      {
        areaKey:
          'sales_turnover',
        area:
          'GSTR-1 taxable turnover vs books',
        difference:
          Number(
            row.gstr1TaxableSales ||
              0
          ) -
          Number(
            row.booksTaxableSales ||
              0
          ),
      },
      {
        areaKey:
          'output_gst',
        area:
          'GSTR-3B output GST vs books',
        difference:
          gstr3bOutputGST -
          booksOutputGST,
      },
      {
        areaKey:
          'itc_claimed',
        area:
          'GSTR-3B ITC claimed vs books',
        difference:
          gstr3bITC -
          booksITC,
      },
    ];

    for (
      const check of checks
    ) {
      if (
        Math.abs(
          check.difference
        ) < 1
      ) {
        continue;
      }

      const explanation =
        findExplanation(
          extracted
            .explainedDifferences,
          row.month,
          check.areaKey
        );

      gstFindings.push({
        type:
          'GST Reconciliation',
        key:
          `${row.month}-${check.areaKey}`,
        area:
          `${row.month} · ${check.area}`,
        difference:
          Math.abs(
            check.difference
          ),
        observation:
          explanation
            ? `${check.area} differs by Rs ${Math.round(
                Math.abs(
                  check.difference
                )
              ).toLocaleString(
                'en-IN'
              )}. Source working contains an explanation: ${explanation.reason}`
            : `${check.area} differs by Rs ${Math.round(
                Math.abs(
                  check.difference
                )
              ).toLocaleString(
                'en-IN'
              )}.`,
        query:
          explanation
            ? ''
            : gstQuery(
                row.month,
                check.area,
                check.difference
              ),
        requiresSeniorCA: true,
        status:
          explanation
            ? 'Explained - Verify'
            : 'Unresolved',
      });
    }
  }

  const specificGstFindings =
    (
      extracted
        .gstSpecificExceptions ||
      []
    ).map(
      (item, index) => ({
        type:
          'GST Specific Exception',
        key:
          `gst-specific-${index + 1}`,
        area: item.area,
        difference:
          Math.abs(
            Number(
              item.amount || 0
            )
          ),
        observation:
          item.observation,
        query:
          item.status ===
          'Unresolved'
            ? item.suggestedQuery
            : '',
        requiresSeniorCA: true,
        status:
          item.status ===
          'Unresolved'
            ? 'Unresolved'
            : `${item.status} - Verify`,
      })
    );

  const gstScope =
    String(
      extracted.gstScope || ''
    ).trim();

  if (gstScope) {
    sourceWarnings.push(
      `GST reconciliation scope identified from the workbook: ${gstScope}. Do not treat this automatically as an entity-wide GST conclusion for other locations/GSTINs.`
    );
  }

  const findings = [
    ...sourceFindings,
    ...openingFindings,
    ...gstFindings,
    ...specificGstFindings,
  ];

  const queries =
    findings
      .filter(
        (finding) =>
          finding.query &&
          finding.status ===
            'Unresolved'
      )
      .map(
        (finding) => ({
          area:
            finding.area,
          amount:
            finding.difference,
          query:
            finding.query,
          requiresSeniorCA:
            true,
        })
      );

  return {
    clientName:
      extracted.clientName ||
      'Client',
    extractionSummary:
      extracted
        .extractionSummary ||
      'Files extracted successfully.',
    trialBalanceComplete:
      extracted
        .trialBalanceComplete,
    sourceWarnings,
    gstScope,
    openingFindings,
    gstFindings,
    specificGstFindings,
    findings,
    queries,
    extractedCounts: {
      priorYearBalances:
        extracted
          .priorYearBalances
          ?.length || 0,
      currentYearOpenings:
        extracted
          .currentYearOpenings
          ?.length || 0,
      gstRows:
        extracted.gstRows
          ?.length || 0,
      specificGstExceptions:
        extracted
          .gstSpecificExceptions
          ?.length || 0,
    },
  };
}

function getClaudeText(
  response
) {
  return (
    response?.content || []
  )
    .filter(
      (content) =>
        content?.type ===
          'text' &&
        typeof content.text ===
          'string'
    )
    .map(
      (content) =>
        content.text
    )
    .join('\n')
    .trim();
}

export async function POST(
  request
) {
  try {
    if (
      !process.env
        .ANTHROPIC_API_KEY
    ) {
      return Response.json(
        {
          error:
            'ANTHROPIC_API_KEY is missing in Vercel Environment Variables.',
        },
        { status: 500 }
      );
    }

    const formData =
      await request.formData();

    const financialStatements =
      formData.get(
        'financialStatements'
      );

    const trialBalance =
      formData.get(
        'trialBalance'
      );

    const gstData =
      formData.get(
        'gstData'
      );

    if (
      !(
        financialStatements instanceof
        File
      ) ||
      !(
        trialBalance instanceof
        File
      ) ||
      !(
        gstData instanceof
        File
      )
    ) {
      return Response.json(
        {
          error:
            'Select the signed financial statements, current-year trial balance, and GST reconciliation Sources.',
        },
        { status: 400 }
      );
    }

    if (
      !isPdf(
        financialStatements
      )
    ) {
      return Response.json(
        {
          error:
            'Signed financial statements must be a PDF.',
        },
        { status: 400 }
      );
    }

    if (
      !(
        isPdf(
          trialBalance
        ) ||
        isXlsx(
          trialBalance
        ) ||
        trialBalance.name
          .toLowerCase()
          .endsWith('.csv')
      )
    ) {
      return Response.json(
        {
          error:
            'Trial balance must be PDF, XLSX or CSV.',
        },
        { status: 400 }
      );
    }

    if (
      !isXlsx(
        gstData
      )
    ) {
      return Response.json(
        {
          error:
            'GST reconciliation must currently be an XLSX workbook.',
        },
        { status: 400 }
      );
    }

    const totalBytes =
      financialStatements.size +
      trialBalance.size +
      gstData.size;

    if (
      totalBytes >
      18 * 1024 * 1024
    ) {
      return Response.json(
        {
          error:
            'Combined audit Sources exceed the current 18 MB processing limit.',
        },
        { status: 413 }
      );
    }

    const financialBuffer =
      Buffer.from(
        await financialStatements.arrayBuffer()
      );

    const trialBalanceBuffer =
      Buffer.from(
        await trialBalance.arrayBuffer()
      );

    const gstBuffer =
      Buffer.from(
        await gstData.arrayBuffer()
      );

    const gstText =
      xlsxSelectedSheetsToText(
        gstBuffer,
        gstData.name,
        [
          'Sales Reco',
          'Purchase-ITC Reco',
          'Vendor-wise ITC Mismatch',
          'Bill-wise Exceptions',
          'Net GST Summary',
          'Notes & Exceptions',
        ]
      );

    const content = [
      {
        type: 'text',
        text:
          'SOURCE A - PRIOR-YEAR SIGNED CONSOLIDATED FINANCIAL STATEMENTS',
      },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type:
            'application/pdf',
          data:
            financialBuffer.toString(
              'base64'
            ),
        },
      },
      {
        type: 'text',
        text:
          'SOURCE B - CURRENT-YEAR TRIAL BALANCE. This source may contain multiple locations/branches. Extract opening balances location-wise first; do not compare one location directly to consolidated financial statements.',
      },
    ];

    if (
      isPdf(
        trialBalance
      )
    ) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type:
            'application/pdf',
          data:
            trialBalanceBuffer.toString(
              'base64'
            ),
        },
      });
    } else if (
      isXlsx(
        trialBalance
      )
    ) {
      const trialText =
        xlsxSelectedSheetsToText(
          trialBalanceBuffer,
          trialBalance.name
        );

      content.push({
        type: 'text',
        text:
          `<current_year_trial_balance filename="${trialBalance.name}">\n${trialText}\n</current_year_trial_balance>`,
      });
    } else {
      content.push({
        type: 'text',
        text:
          `<current_year_trial_balance filename="${trialBalance.name}">\n${trialBalanceBuffer.toString('utf8')}\n</current_year_trial_balance>`,
      });
    }

    content.push(
      {
        type: 'text',
        text:
          'SOURCE C - GST RECONCILIATION WORKBOOK. Multiple substantive sheets are included below; the Index sheet is intentionally excluded.',
      },
      {
        type: 'text',
        text:
          `<gst_reconciliation filename="${gstData.name}">\n${gstText}\n</gst_reconciliation>`,
      },
      {
        type: 'text',
        text:
`Extract audit data faithfully using these rules:

1. PRIOR-YEAR FINANCIAL STATEMENTS
   - They are consolidated financial statements.
   - Extract closing balances as at 31 March 2025 using the standardized balance keys.
   - Use NET fixed assets for fixed_assets_net.
   - Do not invent schedule break-ups not visible in the signed statements.

2. CURRENT-YEAR TRIAL BALANCE
   - Extract OPENING balances only. Ignore current-year transactions and closing balances.
   - The source may contain Delhi, Haryana, or other location-wise sections.
   - Put the location/branch name on every opening balance.
   - Mark Branch / Division / inter-unit control accounts as isInterBranch=true.
   - Do not use an inter-branch balance in consolidated opening-balance totals.
   - If any page says "continued", "carried over" without the continuation, appears truncated, or a location is incomplete, set trialBalanceComplete=false and explain it in sourceWarnings.
   - Do not infer balances from missing pages.

3. CONSOLIDATION
   - Do not compare an individual location against the consolidated signed financial statements.
   - The application will aggregate the location-wise opening balances after excluding inter-branch control accounts.
   - Extract only source amounts; do not perform the final reconciliation yourself.

4. GST WORKBOOK
   - Identify the exact entity/location/GSTIN scope from the workbook header and return it in gstScope.
   - From Sales Reco, extract month-wise Book taxable sales, GSTR-1 taxable sales, and IGST/CGST/SGST output tax for Book and GSTR-3B.
   - From Purchase-ITC Reco, extract month-wise Book ITC and GSTR-3B ITC components.
   - Ignore TOTAL rows.
   - Read Vendor-wise ITC Mismatch, Bill-wise Exceptions and Notes & Exceptions.
   - Put genuinely unresolved vendor/bill exceptions in gstSpecificExceptions.
   - If the source itself clearly explains a mismatch as an amendment, reclassification, timing difference, or rounding item, record it in explainedDifferences / gstSpecificExceptions with the appropriate status. Do not silently treat it as resolved; it still requires CA verification.

5. AUDITOR SAFETY
   - Use only values visible in the supplied sources.
   - Do not invent missing data.
   - Do not make a final audit conclusion.
   - Missing/incomplete source data must be highlighted, not guessed.`,
      }
    );

    const claudeRequestBody = {
      model:
        'claude-haiku-4-5-20251001',
      max_tokens: 5000,
      system:
        'You are a controlled extraction engine for a Chartered Accountant audit assistant. Preserve source scope and location. Never guess missing figures. Never convert an incomplete source into a clean audit conclusion. The application performs deterministic arithmetic and a Senior CA reviews all material exceptions.',
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      output_config: {
        format: {
          type:
            'json_schema',
          schema:
            extractionSchema,
        },
      },
    };

    let claudeResponse = null;
    let raw = null;
    let upstreamText = '';

    for (
      let attempt = 1;
      attempt <= 3;
      attempt += 1
    ) {
      claudeResponse =
        await fetch(
          ANTHROPIC_URL,
          {
            method: 'POST',
            headers: {
              'x-api-key':
                process.env
                  .ANTHROPIC_API_KEY,
              'anthropic-version':
                '2023-06-01',
              'content-type':
                'application/json',
            },
            body: JSON.stringify(
              claudeRequestBody
            ),
          }
        );

      upstreamText =
        await claudeResponse.text();

      try {
        raw = upstreamText
          ? JSON.parse(upstreamText)
          : null;
      } catch {
        raw = null;
      }

      if (
        claudeResponse.ok &&
        raw
      ) {
        break;
      }

      const retryable =
        [
          429,
          500,
          502,
          503,
          504,
          529,
        ].includes(
          claudeResponse.status
        ) ||
        (
          claudeResponse.ok &&
          !raw
        );

      if (
        retryable &&
        attempt < 3
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              attempt * 1200
            )
        );

        continue;
      }

      const upstreamMessage =
        raw?.error?.message ||
        upstreamText
          ?.replace(
            /\s+/g,
            ' '
          )
          .trim()
          .slice(0, 500) ||
        `Anthropic returned HTTP ${claudeResponse.status}.`;

      return Response.json(
        {
          error:
            `Claude API request failed: ${upstreamMessage}`,
          providerStatus:
            claudeResponse.status,
        },
        {
          status:
            claudeResponse.ok
              ? 502
              : claudeResponse.status,
        }
      );
    }

    if (!raw) {
      return Response.json(
        {
          error:
            'Claude API returned a non-JSON response after 3 attempts. Please retry the audit run.',
        },
        { status: 502 }
      );
    }

    const outputText =
      getClaudeText(raw);

    if (!outputText) {
      return Response.json(
        {
          error:
            'Claude returned no structured extraction result.',
        },
        { status: 502 }
      );
    }

    let extracted;

    try {
      extracted =
        JSON.parse(
          outputText
        );
    } catch {
      return Response.json(
        {
          error:
            'Claude responded, but the structured audit output could not be parsed. Please retry once. If it repeats, send the error screenshot.',
        },
        { status: 502 }
      );
    }

    const result =
      reconcile(extracted);

    return Response.json({
      ...result,
      processedAt:
        new Date().toISOString(),
      engine:
        'Claude Haiku 4.5 multi-location extraction + deterministic reconciliation',
      model:
        raw?.model ||
        'claude-haiku-4-5-20251001',
      usage:
        raw?.usage || null,
      liveEmailSent: false,
    });
  } catch (error) {
    console.error(
      'GRA real-data audit processing error',
      error
    );

    return Response.json(
      {
        error:
          error?.message ||
          'Unexpected real-data audit processing error.',
      },
      { status: 500 }
    );
  }
}
