'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';

/* =========================================================
   BLOCK LIBRARY
========================================================= */

const nodeCatalog = [
  {
    group: 'Triggers',
    items: [
      {
        type: 'trigger',
        label: 'Manual Trigger',
        icon: '⚡',
        description: 'Start workflow manually',
        shape: 'circle',
      },
      {
        type: 'schedule',
        label: 'Schedule Trigger',
        icon: '◷',
        description: 'Run on a schedule',
        shape: 'circle',
      },
      {
        type: 'webhook',
        label: 'Webhook Trigger',
        icon: '↗',
        description: 'Start from a webhook',
        shape: 'circle',
      },
      {
        type: 'emailTrigger',
        label: 'Email Trigger',
        icon: '✉',
        description: 'Start when email arrives',
        shape: 'circle',
      },
    ],
  },

  {
    group: 'Flow Control',
    items: [
      {
        type: 'condition',
        label: 'Condition',
        icon: '◇',
        description: 'If / Else decision',
        shape: 'diamond',
      },
      {
        type: 'router',
        label: 'Router',
        icon: '⑂',
        description: 'Split into multiple paths',
        shape: 'diamond',
      },
      {
        type: 'merge',
        label: 'Merge',
        icon: '⇉',
        description: 'Combine workflow paths',
        shape: 'diamond',
      },
      {
        type: 'delay',
        label: 'Delay',
        icon: '◷',
        description: 'Wait before continuing',
        shape: 'square',
      },
      {
        type: 'loop',
        label: 'Loop',
        icon: '↻',
        description: 'Repeat for each item',
        shape: 'square',
      },
      {
        type: 'stop',
        label: 'Stop Workflow',
        icon: '■',
        description: 'End this workflow path',
        shape: 'square',
      },
    ],
  },

  {
    group: 'AI',
    items: [
      {
        type: 'aiPrompt',
        label: 'AI Prompt',
        icon: 'AI',
        description: 'Ask AI to process information',
        shape: 'hex',
      },
      {
        type: 'extract',
        label: 'Extract Data',
        icon: '⌗',
        description: 'Extract structured fields',
        shape: 'hex',
      },
      {
        type: 'classify',
        label: 'Classify',
        icon: '▦',
        description: 'Categorise information',
        shape: 'hex',
      },
      {
        type: 'summarize',
        label: 'Summarise',
        icon: '≡',
        description: 'Create a short summary',
        shape: 'hex',
      },
    ],
  },

  {
    group: 'Connectors & Integrations',
    items: [
      {
        type: 'connector',
        label: 'App Connector',
        icon: '⬡',
        description: 'Connect another application',
        shape: 'rounded',
      },
      {
        type: 'api',
        label: 'API Request',
        icon: '{}',
        description: 'Send or receive API data',
        shape: 'rounded',
      },
      {
        type: 'plugin',
        label: 'Plugin Action',
        icon: '⊕',
        description: 'Use a connected plugin',
        shape: 'rounded',
      },
      {
        type: 'database',
        label: 'Database',
        icon: '▤',
        description: 'Read or write structured data',
        shape: 'rounded',
      },
      {
        type: 'spreadsheet',
        label: 'Spreadsheet',
        icon: '▦',
        description: 'Work with Excel or Sheets',
        shape: 'rounded',
      },
      {
        type: 'fileStorage',
        label: 'File Storage',
        icon: '□',
        description: 'Read or save files',
        shape: 'rounded',
      },
    ],
  },

  {
    group: 'Human',
    items: [
      {
        type: 'approval',
        label: 'Human Approval',
        icon: '✓',
        description: 'Wait for approval',
        shape: 'pill',
      },
      {
        type: 'review',
        label: 'Review Task',
        icon: '👤',
        description: 'Send something for review',
        shape: 'pill',
      },
    ],
  },

  {
    group: 'Outputs',
    items: [
      {
        type: 'email',
        label: 'Send Email',
        icon: '✉',
        description: 'Send an email',
        shape: 'square',
      },
      {
        type: 'whatsapp',
        label: 'Send WhatsApp',
        icon: '◉',
        description: 'Send a WhatsApp message',
        shape: 'square',
      },
      {
        type: 'notification',
        label: 'Notification',
        icon: '!',
        description: 'Create an internal alert',
        shape: 'square',
      },
      {
        type: 'file',
        label: 'Create File',
        icon: '+',
        description: 'Generate an output file',
        shape: 'square',
      },
    ],
  },
];

/* =========================================================
   CONFIGURATION FIELDS FOR EACH BLOCK
========================================================= */

const configSchemas = {
  trigger: [],

  schedule: [
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'select',
      options: ['Every Hour', 'Daily', 'Weekdays', 'Weekly', 'Monthly'],
    },
    {
      key: 'time',
      label: 'Run Time',
      type: 'time',
    },
  ],

  webhook: [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      options: ['POST', 'GET'],
    },
    {
      key: 'path',
      label: 'Webhook Path',
      type: 'text',
      placeholder: '/gst-upload',
    },
  ],

  emailTrigger: [
    {
      key: 'mailbox',
      label: 'Mailbox',
      type: 'text',
      placeholder: 'accounts@firm.com',
    },
    {
      key: 'subjectContains',
      label: 'Subject Contains',
      type: 'text',
      placeholder: 'GST documents',
    },
  ],

  condition: [
    {
      key: 'field',
      label: 'Field',
      type: 'text',
      placeholder: 'invoice.amount',
    },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      options: [
        'Equals',
        'Not Equals',
        'Contains',
        'Greater Than',
        'Less Than',
        'Is Empty',
        'Is Not Empty',
      ],
    },
    {
      key: 'value',
      label: 'Value',
      type: 'text',
    },
  ],

  router: [
    {
      key: 'paths',
      label: 'Number of Paths',
      type: 'number',
      placeholder: '2',
    },
  ],

  merge: [
    {
      key: 'mode',
      label: 'Merge Mode',
      type: 'select',
      options: ['Wait for All', 'Continue on First'],
    },
  ],

  delay: [
    {
      key: 'amount',
      label: 'Delay',
      type: 'number',
      placeholder: '10',
    },
    {
      key: 'unit',
      label: 'Unit',
      type: 'select',
      options: ['Minutes', 'Hours', 'Days'],
    },
  ],

  loop: [
    {
      key: 'source',
      label: 'Items Source',
      type: 'text',
      placeholder: 'invoices',
    },
  ],

  stop: [
    {
      key: 'reason',
      label: 'Reason',
      type: 'text',
      placeholder: 'Workflow complete',
    },
  ],

  aiPrompt: [
    {
      key: 'prompt',
      label: 'Prompt',
      type: 'textarea',
      placeholder: 'Analyse the following information...',
    },
    {
      key: 'outputFormat',
      label: 'Output Format',
      type: 'select',
      options: ['Text', 'JSON', 'Table'],
    },
  ],

  extract: [
    {
      key: 'fields',
      label: 'Fields to Extract',
      type: 'textarea',
      placeholder: 'Invoice No\nDate\nGSTIN\nTaxable Value',
    },
  ],

  classify: [
    {
      key: 'categories',
      label: 'Categories',
      type: 'textarea',
      placeholder: 'Purchase\nSales\nBank\nExpense',
    },
  ],

  summarize: [
    {
      key: 'instructions',
      label: 'Summary Instructions',
      type: 'textarea',
      placeholder: 'Summarise key issues and exceptions...',
    },
  ],

  connector: [
    {
      key: 'application',
      label: 'Application',
      type: 'text',
      placeholder: 'Tally / Outlook / GST Software',
    },
    {
      key: 'action',
      label: 'Action',
      type: 'text',
      placeholder: 'Create voucher',
    },
  ],

  api: [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    {
      key: 'url',
      label: 'URL',
      type: 'text',
      placeholder: 'https://...',
    },
    {
      key: 'headers',
      label: 'Headers',
      type: 'textarea',
      placeholder: 'Content-Type: application/json',
    },
    {
      key: 'body',
      label: 'Request Body',
      type: 'textarea',
      placeholder: '{ }',
    },
  ],

  plugin: [
    {
      key: 'plugin',
      label: 'Plugin',
      type: 'text',
      placeholder: 'Gmail / Drive / CRM',
    },
    {
      key: 'action',
      label: 'Action',
      type: 'text',
      placeholder: 'Search emails',
    },
  ],

  database: [
    {
      key: 'connection',
      label: 'Connection',
      type: 'text',
      placeholder: 'Firm Database',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      options: ['Read', 'Create', 'Update', 'Delete'],
    },
  ],

  spreadsheet: [
    {
      key: 'file',
      label: 'File',
      type: 'text',
      placeholder: 'GST Working.xlsx',
    },
    {
      key: 'sheet',
      label: 'Sheet',
      type: 'text',
      placeholder: 'Reconciliation',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      options: ['Read Rows', 'Add Row', 'Update Row', 'Create Sheet'],
    },
  ],

  fileStorage: [
    {
      key: 'location',
      label: 'Folder / Location',
      type: 'text',
      placeholder: 'Client/GST/FY2026',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      options: ['Read File', 'Save File', 'Move File', 'Rename File'],
    },
  ],

  approval: [
    {
      key: 'approver',
      label: 'Approver',
      type: 'text',
      placeholder: 'Senior CA',
    },
    {
      key: 'message',
      label: 'Approval Message',
      type: 'textarea',
      placeholder: 'Please review and approve...',
    },
  ],

  review: [
    {
      key: 'assignee',
      label: 'Reviewer',
      type: 'text',
      placeholder: 'Team Member',
    },
    {
      key: 'instructions',
      label: 'Review Instructions',
      type: 'textarea',
    },
  ],

  email: [
    {
      key: 'to',
      label: 'To',
      type: 'text',
      placeholder: 'client@example.com',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
    },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
    },
  ],

  whatsapp: [
    {
      key: 'to',
      label: 'Recipient',
      type: 'text',
    },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
    },
  ],

  notification: [
    {
      key: 'recipient',
      label: 'Recipient',
      type: 'text',
    },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
    },
  ],

  file: [
    {
      key: 'fileName',
      label: 'File Name',
      type: 'text',
      placeholder: 'GST Review Pack',
    },
    {
      key: 'format',
      label: 'Format',
      type: 'select',
      options: ['PDF', 'Excel', 'CSV', 'Word'],
    },
  ],
};

/* =========================================================
   HELPERS
========================================================= */

function getTheme(type) {
  const themes = {
    trigger: '#f97316',
    schedule: '#a855f7',
    webhook: '#3b82f6',
    emailTrigger: '#eab308',

    condition: '#22c55e',
    router: '#06b6d4',
    merge: '#14b8a6',
    delay: '#eab308',
    loop: '#0ea5e9',
    stop: '#ef4444',

    aiPrompt: '#8b5cf6',
    extract: '#ec4899',
    classify: '#6366f1',
    summarize: '#a855f7',

    connector: '#10b981',
    api: '#3b82f6',
    plugin: '#14b8a6',
    database: '#64748b',
    spreadsheet: '#16a34a',
    fileStorage: '#64748b',

    approval: '#f97316',
    review: '#f43f5e',

    email: '#eab308',
    whatsapp: '#22c55e',
    notification: '#06b6d4',
    file: '#94a3b8',
  };

  return themes[type] || '#777';
}

function getDefaultConfig(type) {
  const fields = configSchemas[type] || {};
  const config = {};

  fields.forEach((field) => {
    if (field.type === 'select') {
      config[field.key] = field.options?.[0] || '';
    } else {
      config[field.key] = '';
    }
  });

  return config;
}

/* =========================================================
   CUSTOM NODE
========================================================= */

function WorkflowNode({ data, selected }) {
  return (
    <div
      className={`workflowNode ${
        selected ? 'selected' : ''
      } workflowNode-${data.shape || 'rounded'}`}
      style={{
        '--node-accent': getTheme(data.nodeType),
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="nodeHandle"
      />

      <div className="workflowNodeTop">
        <div
          className={`workflowNodeIcon workflowIcon-${data.shape || 'rounded'}`}
        >
          {data.icon}
        </div>

        <div className="workflowNodeText">
          <strong>{data.name}</strong>
          <span>{data.description}</span>
        </div>
      </div>

      <div className="workflowNodeBottom">
        <span className="workflowNodeChip">
          {data.group}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="nodeHandle"
      />
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowNode,
};

/* =========================================================
   WORKFLOW BUILDER
========================================================= */

export default function WorkflowBuilder({ agentId }) {
  const storageKey = `gra-workflow-${agentId}`;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNode, setSelectedNode] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  /* LOAD SAVED WORKFLOW */

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        setNodes(parsed.nodes || []);
        setEdges(parsed.edges || []);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    setLoaded(true);
  }, [storageKey, setNodes, setEdges]);

  /* AUTO SAVE */

  useEffect(() => {
    if (!loaded) return;

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        nodes,
        edges,
      })
    );
  }, [nodes, edges, loaded, storageKey]);

  /* CONNECT NODES */

  const onConnect = useCallback(
    (params) => {
      setEdges((current) =>
        addEdge(
          {
            ...params,

            style: {
              stroke: '#6a6a6a',
              strokeWidth: 2,
            },

            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#8a8a8a',
            },
          },
          current
        )
      );
    },
    [setEdges]
  );

  /* CREATE NODE */

  const createNode = useCallback(
    (template, position) => {
      const parentGroup = nodeCatalog.find((group) =>
        group.items.some(
          (item) => item.type === template.type
        )
      );

      const newNode = {
        id: `${template.type}-${Date.now()}`,

        type: 'workflowNode',

        position,

        data: {
          name: template.label,
          description: template.description,

          nodeType: template.type,

          icon: template.icon,

          shape: template.shape,

          group: parentGroup?.group || 'Block',

          config: getDefaultConfig(template.type),
        },
      };

      setNodes((current) => [
        ...current,
        newNode,
      ]);
    },
    [setNodes]
  );

  /* CLICK TO ADD */

  const addNodeByClick = (template) => {
    createNode(template, {
      x: 150 + Math.random() * 300,
      y: 100 + Math.random() * 280,
    });
  };

  /* DRAG FROM SIDEBAR */

  const onDragStart = (event, template) => {
    event.dataTransfer.setData(
      'application/gra-workflow-node',
      JSON.stringify(template)
    );

    event.dataTransfer.effectAllowed = 'move';
  };

  /* DROP INTO CANVAS */

  const onDragOver = useCallback((event) => {
    event.preventDefault();

    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const rawData =
        event.dataTransfer.getData(
          'application/gra-workflow-node'
        );

      if (!rawData) return;

      try {
        const template = JSON.parse(rawData);

        const position =
          reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });

        createNode(template, position);
      } catch {
        return;
      }
    },
    [reactFlowInstance, createNode]
  );

  /* UPDATE BASIC NODE FIELD */

  const updateNodeField = (field, value) => {
    if (!selectedNode) return;

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,

              data: {
                ...node.data,

                [field]: value,
              },
            }
          : node
      )
    );

    setSelectedNode((current) => ({
      ...current,

      data: {
        ...current.data,

        [field]: value,
      },
    }));
  };

  /* UPDATE CONFIG */

  const updateNodeConfig = (key, value) => {
    if (!selectedNode) return;

    const newConfig = {
      ...(selectedNode.data.config || {}),
      [key]: value,
    };

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,

              data: {
                ...node.data,

                config: newConfig,
              },
            }
          : node
      )
    );

    setSelectedNode((current) => ({
      ...current,

      data: {
        ...current.data,

        config: newConfig,
      },
    }));
  };

  /* DELETE NODE */

  const deleteSelectedNode = () => {
    if (!selectedNode) return;

    setNodes((current) =>
      current.filter(
        (node) =>
          node.id !== selectedNode.id
      )
    );

    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNode.id &&
          edge.target !== selectedNode.id
      )
    );

    setSelectedNode(null);
  };

  /* CLEAR */

  const clearWorkflow = () => {
    const confirmed = window.confirm(
      'Clear this entire workflow?'
    );

    if (!confirmed) return;

    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  };

  /* SEARCH */

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return nodeCatalog;

    const query = search.toLowerCase();

    return nodeCatalog
      .map((group) => ({
        ...group,

        items: group.items.filter(
          (item) =>
            item.label
              .toLowerCase()
              .includes(query) ||

            item.description
              .toLowerCase()
              .includes(query) ||

            group.group
              .toLowerCase()
              .includes(query)
        ),
      }))
      .filter(
        (group) =>
          group.items.length > 0
      );
  }, [search]);

  const selectedSchema =
    selectedNode
      ? configSchemas[
          selectedNode.data.nodeType
        ] || []
      : [];

  return (
    <div className="workflowBuilder">

      {/* =====================================================
          LEFT BLOCK LIBRARY
      ===================================================== */}

      <aside className="workflowSidebar">

        <div className="workflowSidebarHeader">
          <h3>Workflow Blocks</h3>

          <span>
            Drag onto canvas or click
          </span>
        </div>

        <div className="workflowSearchBox">
          <input
            type="text"

            placeholder="Search triggers, AI, apps..."

            value={search}

            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>

        <div className="workflowGroups">
          {filteredCatalog.map((group) => (
            <div
              className="workflowGroup"
              key={group.group}
            >
              <div className="workflowGroupTitle">
                {group.group}
              </div>

              <div className="workflowGroupItems">
                {group.items.map((item) => (
                  <button
                    key={item.type}

                    className="workflowLibraryItem"

                    draggable

                    onDragStart={(event) =>
                      onDragStart(event, item)
                    }

                    onClick={() =>
                      addNodeByClick(item)
                    }
                  >
                    <div
                      className={`workflowLibraryItemIcon workflowIcon-${item.shape}`}
                    >
                      {item.icon}
                    </div>

                    <div className="workflowLibraryItemText">
                      <strong>
                        {item.label}
                      </strong>

                      <span>
                        {item.description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* =====================================================
          CENTER WORKFLOW BOARD
      ===================================================== */}

      <section className="workflowBoard">

        <div className="workflowBoardTopbar">

          <div className="workflowBoardTitle">
            <strong>
              Workflow Canvas
            </strong>

            <span>
              {nodes.length} nodes
              {' • '}
              {edges.length} connections
            </span>
          </div>

          <div className="workflowBoardActions">

            <span className="workflowDraftStatus">
              Saved locally
            </span>

            <button
              onClick={clearWorkflow}
            >
              Clear
            </button>

          </div>

        </div>

        <div
          className="workflowCanvasShell"

          onDragOver={onDragOver}

          onDrop={onDrop}
        >

          <ReactFlow
            nodes={nodes}

            edges={edges}

            nodeTypes={nodeTypes}

            onInit={setReactFlowInstance}

            onNodesChange={
              onNodesChange
            }

            onEdgesChange={
              onEdgesChange
            }

            onConnect={onConnect}

            onNodeClick={(
              event,
              node
            ) => {
              setSelectedNode(node);
            }}

            onPaneClick={() =>
              setSelectedNode(null)
            }

            deleteKeyCode={[
              'Backspace',
              'Delete',
            ]}

            defaultEdgeOptions={{
              style: {
                stroke: '#666',
                strokeWidth: 2,
              },

              markerEnd: {
                type:
                  MarkerType.ArrowClosed,

                color: '#888',
              },
            }}

            fitView
          >

            <Background
              gap={22}
              size={1}
              color="#272727"
            />

            <Controls />

            <MiniMap
              nodeColor={(node) =>
                getTheme(
                  node.data?.nodeType
                )
              }

              maskColor="rgba(0,0,0,0.65)"

              style={{
                background: '#151515',
                border:
                  '1px solid #2e2e2e',
              }}
            />

          </ReactFlow>

        </div>
      </section>

      {/* =====================================================
          RIGHT PROPERTIES
      ===================================================== */}

      <aside className="workflowInspector">

        <div className="workflowInspectorHeader">
          <h3>Properties</h3>

          <span>
            Configure selected block
          </span>
        </div>

        {!selectedNode ? (

          <div className="workflowEmptyInspector">

            <div className="workflowEmptyInspectorIcon">
              ◇
            </div>

            <p>
              Select a block from the
              canvas to configure it.
            </p>

          </div>

        ) : (

          <div className="workflowInspectorForm">

            <div className="workflowInspectorType">
              {selectedNode.data.icon}

              <span>
                {
                  selectedNode.data
                    .group
                }
              </span>
            </div>

            <label>
              Block Name
            </label>

            <input
              value={
                selectedNode.data.name ||
                ''
              }

              onChange={(e) =>
                updateNodeField(
                  'name',
                  e.target.value
                )
              }
            />

            <label>
              Description
            </label>

            <textarea
              rows={3}

              value={
                selectedNode.data
                  .description || ''
              }

              onChange={(e) =>
                updateNodeField(
                  'description',
                  e.target.value
                )
              }
            />

            {selectedSchema.length > 0 && (
              <>
                <div className="workflowInspectorDivider">
                  Configuration
                </div>

                {selectedSchema.map(
                  (field) => (
                    <div
                      className="workflowConfigField"
                      key={field.key}
                    >
                      <label>
                        {field.label}
                      </label>

                      {field.type ===
                        'textarea' && (
                        <textarea
                          rows={4}

                          placeholder={
                            field.placeholder ||
                            ''
                          }

                          value={
                            selectedNode.data
                              .config?.[
                              field.key
                            ] || ''
                          }

                          onChange={(e) =>
                            updateNodeConfig(
                              field.key,
                              e.target.value
                            )
                          }
                        />
                      )}

                      {field.type ===
                        'select' && (
                        <select
                          value={
                            selectedNode.data
                              .config?.[
                              field.key
                            ] || ''
                          }

                          onChange={(e) =>
                            updateNodeConfig(
                              field.key,
                              e.target.value
                            )
                          }
                        >
                          {field.options?.map(
                            (option) => (
                              <option
                                key={
                                  option
                                }
                                value={
                                  option
                                }
                              >
                                {option}
                              </option>
                            )
                          )}
                        </select>
                      )}

                      {field.type !==
                        'textarea' &&
                        field.type !==
                          'select' && (
                          <input
                            type={
                              field.type ||
                              'text'
                            }

                            placeholder={
                              field.placeholder ||
                              ''
                            }

                            value={
                              selectedNode.data
                                .config?.[
                                field.key
                              ] || ''
                            }

                            onChange={(e) =>
                              updateNodeConfig(
                                field.key,
                                e.target.value
                              )
                            }
                          />
                        )}
                    </div>
                  )
                )}
              </>
            )}

            <div className="workflowInspectorDivider">
              Technical
            </div>

            <label>
              Node ID
            </label>

            <div className="workflowReadonly workflowIdBox">
              {selectedNode.id}
            </div>

            <div className="workflowConfigNotice">
              Visual configuration only.
              This block will not perform
              any external action yet.
            </div>

            <button
              className="workflowDangerButton"

              onClick={
                deleteSelectedNode
              }
            >
              Delete Block
            </button>

          </div>

        )}

      </aside>

    </div>
  );
}
