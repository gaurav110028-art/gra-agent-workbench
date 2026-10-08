'use client';

import { useMemo, useRef, useState } from 'react';

import {
  configSchemas,
  getNodeItemColumns,
  getNodeOutputFields,
  getTheme,
} from '../workflowCatalog';

import {
  parseRowsInput,
  resolveTemplate,
  sampleRows,
} from '../workflowEngine';

function VariablePicker({
  upstreamNodes,
  itemColumns,
  prevNode,
  onInsert,
  onClose,
}) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const list = [];

    if (itemColumns.length) {
      list.push({
        title: 'Current item',
        hint: 'One row at a time ($item)',
        accent: '#0ea5e9',
        entries: itemColumns.map((column) => ({
          label: column,
          expression: `{{$item.${column}}}`,
        })),
      });
    }

    if (prevNode) {
      list.push({
        title: `Previous output · ${prevNode.data.name}`,
        hint: 'Shortcut ($json)',
        accent: getTheme(prevNode.data.nodeType),
        entries: getNodeOutputFields(prevNode, itemColumns).map((field) => ({
          label: field,
          expression: `{{$json.${field}}}`,
        })),
      });
    }

    upstreamNodes.forEach((node) => {
      list.push({
        title: node.data.name,
        hint: node.data.group,
        accent: getTheme(node.data.nodeType),
        entries: getNodeOutputFields(node, itemColumns).map((field) => ({
          label: field,
          expression: `{{$node.${node.data.name}.data.${field}}}`,
        })),
      });
    });

    list.push({
      title: 'System',
      hint: 'Run-time helpers',
      accent: '#64748b',
      entries: [
        { label: 'now (ISO timestamp)', expression: '{{$now}}' },
        { label: 'all items', expression: '{{$items}}' },
      ],
    });

    if (!query.trim()) return list;

    const q = query.toLowerCase();

    return list
      .map((group) => ({
        ...group,
        entries: group.entries.filter(
          (entry) =>
            entry.label.toLowerCase().includes(q) ||
            group.title.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.entries.length > 0);
  }, [upstreamNodes, itemColumns, prevNode, query]);

  return (
    <div className="variablePicker" role="dialog" aria-label="Insert variable">
      <div className="variablePickerHeader">
        <input
          autoFocus
          placeholder="Search fields from previous nodes..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" onClick={onClose} aria-label="Close picker">
          ×
        </button>
      </div>

      <div className="variablePickerBody">
        {groups.length === 0 && (
          <div className="variablePickerEmpty">
            Connect this node to a previous step to map its output.
          </div>
        )}

        {groups.map((group) => (
          <div className="variablePickerGroup" key={group.title}>
            <div
              className="variablePickerGroupTitle"
              style={{ '--picker-accent': group.accent }}
            >
              <i />
              <strong>{group.title}</strong>
              <span>{group.hint}</span>
            </div>

            <div className="variablePickerEntries">
              {group.entries.map((entry) => (
                <button
                  type="button"
                  key={entry.expression}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onInsert(entry.expression)}
                  title={entry.expression}
                >
                  <span>{entry.label}</span>
                  <code>{entry.expression}</code>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsvField({ config, onPatch }) {
  const inputRef = useRef(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [error, setError] = useState('');

  const apply = (text, fileName) => {
    const parsed = parseRowsInput(text);

    if (!parsed.rows.length) {
      setError('No rows found. Use a header row followed by data rows.');
      return;
    }

    setError('');
    onPatch({
      csvRows: parsed.rows,
      csvColumns: parsed.columns,
      csvFileName: fileName || 'pasted-data',
    });
    setPasteOpen(false);
    setPasteValue('');
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => apply(String(reader.result || ''), file.name);
    reader.readAsText(file);
    event.target.value = '';
  };

  const rows = Array.isArray(config.csvRows) ? config.csvRows : [];
  const columns = Array.isArray(config.csvColumns) ? config.csvColumns : [];

  return (
    <div className="csvField">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        hidden
        onChange={onFile}
      />

      {rows.length === 0 ? (
        <div className="csvDropzone">
          <strong>Upload a CSV / JSON for bulk runs</strong>
          <span>Header row becomes {'{{$item.column}}'} variables</span>
          <div>
            <button type="button" onClick={() => inputRef.current?.click()}>
              Choose file
            </button>
            <button type="button" onClick={() => setPasteOpen((v) => !v)}>
              Paste data
            </button>
          </div>
        </div>
      ) : (
        <div className="csvSummary">
          <div>
            <strong>{config.csvFileName}</strong>
            <span>
              {rows.length} row{rows.length === 1 ? '' : 's'} · {columns.length} column
              {columns.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="csvColumns">
            {columns.map((column) => (
              <code key={column}>{column}</code>
            ))}
          </div>

          <div className="csvSummaryActions">
            <button type="button" onClick={() => inputRef.current?.click()}>
              Replace
            </button>
            <button
              type="button"
              onClick={() =>
                onPatch({ csvRows: [], csvColumns: [], csvFileName: '' })
              }
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="csvPaste">
          <textarea
            rows={5}
            placeholder={'client_name,email,period\nSharma Traders,a@b.com,Sep 2026'}
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
          />
          <button type="button" onClick={() => apply(pasteValue, 'pasted-data')}>
            Use pasted rows
          </button>
        </div>
      )}

      {error && <div className="csvError">{error}</div>}
    </div>
  );
}

export default function NodeInspector({
  node,
  nodes,
  upstreamNodes,
  prevNode,
  availableSources,
  onChangeField,
  onChangeConfig,
  onPatchConfig,
  onDelete,
  onClose,
  onOpenSources,
  extras,
  footerNotice,
}) {
  const [pickerFor, setPickerFor] = useState(null);
  const fieldRefs = useRef({});

  const schema = configSchemas[node.data.nodeType] || [];
  const config = node.data.config || {};

  const itemColumns = useMemo(() => {
    let columns = [];

    [...upstreamNodes].reverse().forEach((upstream) => {
      columns = getNodeItemColumns(upstream, columns);
    });

    if (Array.isArray(config.csvColumns) && config.csvColumns.length) {
      return config.csvColumns;
    }

    return columns;
  }, [upstreamNodes, config.csvColumns]);

  const previewCtx = useMemo(() => {
    const sample = sampleRows(itemColumns, 1)[0] || {};
    const outputs = {};

    upstreamNodes.forEach((upstream) => {
      outputs[upstream.data.name] = {
        rows: sampleRows(itemColumns, 2),
        rowCount: 2,
        count: 2,
        json: { subject: 'Sample subject', body: 'Sample body', category: 'GST', urgency: 'High', summary: 'Sample summary', draft_reply: 'Sample reply' },
        text: 'Sample AI text',
        from: sample.email || 'client@example.com',
        fromName: sample.fromName || sample.client_name || 'Client',
        subject: 'GST notice received',
        body: 'Sample email body',
        scheduledAt: new Date().toISOString(),
      };
    });

    return { item: sample, prev: prevNode ? outputs[prevNode.data.name] : {}, outputs };
  }, [itemColumns, upstreamNodes, prevNode]);

  const insertExpression = (key, expression) => {
    const element = fieldRefs.current[key];
    const current = String(config[key] ?? '');

    if (!element) {
      onChangeConfig(key, `${current}${expression}`);
      return;
    }

    const start = element.selectionStart ?? current.length;
    const end = element.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${expression}${current.slice(end)}`;

    onChangeConfig(key, next);

    requestAnimationFrame(() => {
      element.focus();
      const caret = start + expression.length;
      element.setSelectionRange(caret, caret);
    });
  };

  const renderDynamicField = (field) => {
    const value = config[field.key] ?? '';
    const hasVariables = /\{\{/.test(String(value));
    const common = {
      ref: (el) => {
        fieldRefs.current[field.key] = el;
      },
      placeholder: field.placeholder || '',
      value,
      onChange: (event) => onChangeConfig(field.key, event.target.value),
    };

    return (
      <>
        <div className="dynamicFieldHeader">
          <label>
            {field.label}
            {field.required ? ' *' : ''}
          </label>

          {field.dynamic && (
            <button
              type="button"
              className={`variableButton ${pickerFor === field.key ? 'active' : ''}`}
              onClick={() =>
                setPickerFor((current) => (current === field.key ? null : field.key))
              }
            >
              {'{{ }}'} Variable
            </button>
          )}
        </div>

        {field.type === 'textarea' ? (
          <textarea rows={field.key === 'body' || field.key === 'systemPrompt' || field.key === 'userPrompt' ? 7 : 4} {...common} />
        ) : (
          <input type={field.type === 'number' || field.type === 'time' ? field.type : 'text'} {...common} />
        )}

        {pickerFor === field.key && (
          <VariablePicker
            upstreamNodes={upstreamNodes}
            itemColumns={itemColumns}
            prevNode={prevNode}
            onInsert={(expression) => insertExpression(field.key, expression)}
            onClose={() => setPickerFor(null)}
          />
        )}

        {field.dynamic && hasVariables && (
          <div className="fieldPreview">
            <span>Preview with sample data</span>
            <p>{resolveTemplate(value, previewCtx) || '(empty)'}</p>
          </div>
        )}
      </>
    );
  };

  const renderField = (field) => {
    if (field.type === 'csv') {
      return (
        <>
          <label>{field.label}</label>
          <CsvField config={config} onPatch={onPatchConfig} />
        </>
      );
    }

    if (field.type === 'select') {
      return (
        <>
          <label>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
          <select
            value={config[field.key] || ''}
            onChange={(event) => onChangeConfig(field.key, event.target.value)}
          >
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </>
      );
    }

    if (field.type === 'source') {
      return (
        <>
          <label>
            {field.label}
            {field.required ? ' *' : ''}
          </label>
          <select
            value={config[field.key] || ''}
            onChange={(event) => onChangeConfig(field.key, event.target.value)}
          >
            <option value="">Select a Source...</option>
            {availableSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} · {source.category}
              </option>
            ))}
          </select>
          {availableSources.length === 0 && (
            <button
              type="button"
              className="workflowOpenSourcesButton"
              onClick={() => onOpenSources?.()}
            >
              Upload Sources →
            </button>
          )}
        </>
      );
    }

    if (field.type === 'json') {
      return (
        <>
          <label>{field.label}</label>
          <textarea
            rows={5}
            className="monoField"
            placeholder={field.placeholder || ''}
            value={config[field.key] ?? ''}
            onChange={(event) => onChangeConfig(field.key, event.target.value)}
          />
        </>
      );
    }

    return renderDynamicField(field);
  };

  const outputFields = getNodeOutputFields(node, itemColumns);
  const accent = getTheme(node.data.nodeType);

  return (
    <aside className="workflowInspector open" aria-label="Node inspector">
      <div className="workflowInspectorHeader" style={{ '--node-accent': accent }}>
        <div className="workflowInspectorIdentity">
          <div className={`workflowInspectorIcon workflowIcon-${node.data.shape}`}>
            {node.data.icon}
          </div>
          <div>
            <h3>{node.data.name}</h3>
            <span>{node.data.group}</span>
          </div>
        </div>

        <button
          type="button"
          className="workflowInspectorClose"
          onClick={onClose}
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="workflowInspectorForm">
        <label>Node Name</label>
        <input
          value={node.data.name || ''}
          onChange={(event) => onChangeField('name', event.target.value)}
        />

        <label>Description</label>
        <textarea
          rows={2}
          value={node.data.description || ''}
          onChange={(event) => onChangeField('description', event.target.value)}
        />

        {schema.length > 0 && (
          <>
            <div className="workflowInspectorDivider">Parameters</div>

            {schema.map((field) => (
              <div className="workflowConfigField" key={field.key}>
                {renderField(field)}
              </div>
            ))}
          </>
        )}

        {extras}

        <div className="workflowInspectorDivider">Output</div>

        <div className="outputFieldList">
          {outputFields.slice(0, 14).map((field) => (
            <code key={field}>{`$node.${node.data.name}.data.${field}`}</code>
          ))}
        </div>

        <div className="workflowInspectorDivider">Technical</div>

        <label>Node ID</label>
        <div className="workflowReadonly workflowIdBox">{node.id}</div>

        <div className="workflowConfigNotice">{footerNotice}</div>

        <button type="button" className="workflowDangerButton" onClick={onDelete}>
          Delete Node
        </button>
      </div>
    </aside>
  );
}
