'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

import {
  createRun,
  finishRun,
  saveRun,
} from './runHistory';

import {
  createApprovalRequest,
  decideApproval,
} from './approvalQueue';

import {
  getWorkflowVersionState,
  initializeWorkflowVersion,
  saveWorkflowDraft,
  publishWorkflow,
} from './workflowVersions';

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
   CONFIGURATION SCHEMAS
========================================================= */

const configSchemas = {
  trigger: [],

  schedule: [
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'select',
      required: true,
      options: ['Every Hour', 'Daily', 'Weekdays', 'Weekly', 'Monthly'],
    },
    {
      key: 'time',
      label: 'Run Time',
      type: 'time',
      required: true,
    },
  ],

  webhook: [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      required: true,
      options: ['POST', 'GET'],
    },
    {
      key: 'path',
      label: 'Webhook Path',
      type: 'text',
      required: true,
      placeholder: '/gst-upload',
    },
  ],

  emailTrigger: [
    {
      key: 'mailbox',
      label: 'Mailbox',
      type: 'text',
      required: true,
      placeholder: 'accounts@firm.com',
    },
    {
      key: 'subjectContains',
      label: 'Subject Contains',
      type: 'text',
      required: false,
      placeholder: 'GST documents',
    },
  ],

  condition: [
    {
      key: 'field',
      label: 'Field',
      type: 'text',
      required: true,
      placeholder: 'invoice.amount',
    },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      required: true,
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
      required: true,
    },
  ],

  router: [
    {
      key: 'paths',
      label: 'Number of Paths',
      type: 'number',
      required: true,
      placeholder: '2',
    },
  ],

  merge: [
    {
      key: 'mode',
      label: 'Merge Mode',
      type: 'select',
      required: true,
      options: ['Wait for All', 'Continue on First'],
    },
  ],

  delay: [
    {
      key: 'amount',
      label: 'Delay',
      type: 'number',
      required: true,
      placeholder: '10',
    },
    {
      key: 'unit',
      label: 'Unit',
      type: 'select',
      required: true,
      options: ['Minutes', 'Hours', 'Days'],
    },
  ],

  loop: [
    {
      key: 'source',
      label: 'Items Source',
      type: 'text',
      required: true,
      placeholder: 'invoices',
    },
  ],

  stop: [
    {
      key: 'reason',
      label: 'Reason',
      type: 'text',
      required: false,
      placeholder: 'Workflow complete',
    },
  ],

  aiPrompt: [
    {
      key: 'prompt',
      label: 'Prompt',
      type: 'textarea',
      required: true,
      placeholder: 'Analyse the following information...',
    },
    {
      key: 'outputFormat',
      label: 'Output Format',
      type: 'select',
      required: true,
      options: ['Text', 'JSON', 'Table'],
    },
  ],

  extract: [
    {
      key: 'fields',
      label: 'Fields to Extract',
      type: 'textarea',
      required: true,
      placeholder: 'Invoice No\nDate\nGSTIN\nTaxable Value',
    },
  ],

  classify: [
    {
      key: 'categories',
      label: 'Categories',
      type: 'textarea',
      required: true,
      placeholder: 'Purchase\nSales\nBank\nExpense',
    },
  ],

  summarize: [
    {
      key: 'instructions',
      label: 'Summary Instructions',
      type: 'textarea',
      required: true,
      placeholder: 'Summarise key issues and exceptions...',
    },
  ],

  connector: [
    {
      key: 'application',
      label: 'Application',
      type: 'text',
      required: true,
      placeholder: 'Tally / Outlook / GST Software',
    },
    {
      key: 'action',
      label: 'Action',
      type: 'text',
      required: true,
      placeholder: 'Create voucher',
    },
  ],

  api: [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      required: true,
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    {
      key: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      placeholder: 'https://...',
    },
    {
      key: 'headers',
      label: 'Headers',
      type: 'textarea',
      required: false,
      placeholder: 'Content-Type: application/json',
    },
    {
      key: 'body',
      label: 'Request Body',
      type: 'textarea',
      required: false,
      placeholder: '{ }',
    },
  ],

  plugin: [
    {
      key: 'plugin',
      label: 'Plugin',
      type: 'text',
      required: true,
      placeholder: 'Gmail / Drive / CRM',
    },
    {
      key: 'action',
      label: 'Action',
      type: 'text',
      required: true,
      placeholder: 'Search emails',
    },
  ],

  database: [
    {
      key: 'connection',
      label: 'Connection',
      type: 'text',
      required: true,
      placeholder: 'Firm Database',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read', 'Create', 'Update', 'Delete'],
    },
  ],

  spreadsheet: [
    {
      key: 'file',
      label: 'File',
      type: 'text',
      required: true,
      placeholder: 'GST Working.xlsx',
    },
    {
      key: 'sheet',
      label: 'Sheet',
      type: 'text',
      required: true,
      placeholder: 'Reconciliation',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read Rows', 'Add Row', 'Update Row', 'Create Sheet'],
    },
  ],

  fileStorage: [
    {
      key: 'location',
      label: 'Folder / Location',
      type: 'text',
      required: true,
      placeholder: 'Client/GST/FY2026',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read File', 'Save File', 'Move File', 'Rename File'],
    },
  ],

  approval: [
    {
      key: 'approver',
      label: 'Approver',
      type: 'text',
      required: true,
      placeholder: 'Senior CA',
    },
    {
      key: 'message',
      label: 'Approval Message',
      type: 'textarea',
      required: false,
      placeholder: 'Please review and approve...',
    },
  ],

  review: [
    {
      key: 'assignee',
      label: 'Reviewer',
      type: 'text',
      required: true,
      placeholder: 'Team Member',
    },
    {
      key: 'instructions',
      label: 'Review Instructions',
      type: 'textarea',
      required: false,
    },
  ],

  email: [
    {
      key: 'to',
      label: 'To',
      type: 'text',
      required: true,
      placeholder: 'client@example.com',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
      required: true,
    },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
      required: true,
    },
  ],

  whatsapp: [
    {
      key: 'to',
      label: 'Recipient',
      type: 'text',
      required: true,
    },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
      required: true,
    },
  ],

  notification: [
    {
      key: 'recipient',
      label: 'Recipient',
      type: 'text',
      required: true,
    },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
      required: true,
    },
  ],

  file: [
    {
      key: 'fileName',
      label: 'File Name',
      type: 'text',
      required: true,
      placeholder: 'GST Review Pack',
    },
    {
      key: 'format',
      label: 'Format',
      type: 'select',
      required: true,
      options: ['PDF', 'Excel', 'CSV', 'Word'],
    },
  ],
};

const triggerTypes = ['trigger', 'schedule', 'webhook', 'emailTrigger'];
const terminalTypes = ['stop', 'email', 'whatsapp', 'notification', 'file'];

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
  const fields = configSchemas[type] || [];
  const config = {};

  fields.forEach((field) => {
    config[field.key] =
      field.type === 'select'
        ? field.options?.[0] || ''
        : '';
  });

  return config;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  );
}

function WorkflowNode({ data, selected }) {
  return (
    <div
      className={`
        workflowNode
        ${selected ? 'selected' : ''}
        ${data.hasValidationError ? 'invalid' : ''}
        workflowNode-${data.shape || 'rounded'}
      `}
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
          className={`
            workflowNodeIcon
            workflowIcon-${data.shape || 'rounded'}
          `}
        >
          {data.icon}
        </div>

        <div className="workflowNodeText">
          <strong>{data.name}</strong>
          <span>{data.description}</span>
        </div>
      </div>

      <div className="workflowNodeBottom">
        <span className="workflowNodeChip">{data.group}</span>
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

export default function WorkflowBuilder({ agentId, agentName }) {
  const storageKey = `gra-workflow-${agentId}`;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNode, setSelectedNode] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  const [versionState, setVersionState] = useState(null);
  const [publishMessage, setPublishMessage] = useState('');

  const [panelMode, setPanelMode] = useState(null);

  const [validationIssues, setValidationIssues] = useState([]);
  const [validationErrorIds, setValidationErrorIds] = useState([]);

  const [runSteps, setRunSteps] = useState([]);
  const [runStatus, setRunStatus] = useState('idle');

  const [runPlan, setRunPlan] = useState([]);
  const [waitingStepIndex, setWaitingStepIndex] = useState(null);

  const currentRunRef = useRef(null);
  const runStepsRef = useRef([]);
  const currentApprovalRef = useRef(null);

  useEffect(() => {
    setLoaded(false);

    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNodes(parsed.nodes || []);
        setEdges(parsed.edges || []);
      } catch {
        localStorage.removeItem(storageKey);
        setNodes([]);
        setEdges([]);
      }
    } else {
      setNodes([]);
      setEdges([]);
    }

    setSelectedNode(null);
    setPanelMode(null);
    setRunSteps([]);
    setRunPlan([]);
    setWaitingStepIndex(null);
    setRunStatus('idle');

    currentRunRef.current = null;
    runStepsRef.current = [];
    currentApprovalRef.current = null;

    setVersionState(
      getWorkflowVersionState(agentId)
    );

    setPublishMessage('');

    setLoaded(true);
  }, [agentId, storageKey, setNodes, setEdges]);

  useEffect(() => {
    if (!loaded) return;

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        nodes,
        edges,
      })
    );

    const existingVersionState =
      getWorkflowVersionState(agentId);

    const updatedVersionState =
      existingVersionState?.draft
        ? saveWorkflowDraft({
            agentId,
            nodes,
            edges,
          })
        : initializeWorkflowVersion({
            agentId,
            nodes,
            edges,
          });

    setVersionState(updatedVersionState);
    setPublishMessage('');
  }, [
    agentId,
    nodes,
    edges,
    loaded,
    storageKey,
  ]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          hasValidationError: validationErrorIds.includes(node.id),
        },
      })),
    [nodes, validationErrorIds]
  );

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

      setPanelMode(null);
    },
    [setEdges]
  );

  const createNode = useCallback(
    (template, position) => {
      const parentGroup = nodeCatalog.find((group) =>
        group.items.some((item) => item.type === template.type)
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

      setNodes((current) => [...current, newNode]);
      setPanelMode(null);
    },
    [setNodes]
  );

  const addNodeByClick = (template) => {
    createNode(template, {
      x: 150 + Math.random() * 300,
      y: 100 + Math.random() * 280,
    });
  };

  const onDragStart = (event, template) => {
    event.dataTransfer.setData(
      'application/gra-workflow-node',
      JSON.stringify(template)
    );

    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const rawData = event.dataTransfer.getData(
        'application/gra-workflow-node'
      );

      if (!rawData) return;

      try {
        const template = JSON.parse(rawData);

        const position = reactFlowInstance.screenToFlowPosition({
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

    setPanelMode(null);
  };

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

    setPanelMode(null);
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;

    setNodes((current) =>
      current.filter((node) => node.id !== selectedNode.id)
    );

    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNode.id &&
          edge.target !== selectedNode.id
      )
    );

    setSelectedNode(null);
    setPanelMode(null);
  };

  const clearWorkflow = () => {
    const confirmed = window.confirm('Clear this entire workflow?');

    if (!confirmed) return;

    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setValidationIssues([]);
    setValidationErrorIds([]);
    setRunSteps([]);
    setRunPlan([]);
    setWaitingStepIndex(null);
    setPanelMode(null);
    setRunStatus('idle');
  };

  const validateWorkflow = (openPanel = true) => {
    const issues = [];

    if (nodes.length === 0) {
      issues.push({
        nodeId: null,
        message: 'Workflow has no blocks.',
      });
    }

    const triggers = nodes.filter((node) =>
      triggerTypes.includes(node.data.nodeType)
    );

    if (nodes.length > 0 && triggers.length === 0) {
      issues.push({
        nodeId: null,
        message: 'Add one trigger to start the workflow.',
      });
    }

    if (triggers.length > 1) {
      triggers.forEach((trigger) => {
        issues.push({
          nodeId: trigger.id,
          message: `${trigger.data.name}: only one trigger is allowed in this MVP.`,
        });
      });
    }

    const incomingMap = {};
    const outgoingMap = {};

    nodes.forEach((node) => {
      incomingMap[node.id] = [];
      outgoingMap[node.id] = [];
    });

    edges.forEach((edge) => {
      if (outgoingMap[edge.source]) {
        outgoingMap[edge.source].push(edge.target);
      }

      if (incomingMap[edge.target]) {
        incomingMap[edge.target].push(edge.source);
      }
    });

    nodes.forEach((node) => {
      const type = node.data.nodeType;
      const incoming = incomingMap[node.id] || [];
      const outgoing = outgoingMap[node.id] || [];
      const isTrigger = triggerTypes.includes(type);

      if (isTrigger && incoming.length > 0) {
        issues.push({
          nodeId: node.id,
          message: `${node.data.name}: trigger cannot have an incoming connection.`,
        });
      }

      if (!isTrigger && incoming.length === 0) {
        issues.push({
          nodeId: node.id,
          message: `${node.data.name}: block is not connected to a previous step.`,
        });
      }

      if (!terminalTypes.includes(type) && outgoing.length === 0) {
        issues.push({
          nodeId: node.id,
          message: `${node.data.name}: no next step is connected.`,
        });
      }

      if (
        (type === 'condition' || type === 'router') &&
        outgoing.length < 2
      ) {
        issues.push({
          nodeId: node.id,
          message: `${node.data.name}: connect at least two output paths.`,
        });
      }

      const schema = configSchemas[type] || [];

      schema.forEach((field) => {
        if (
          field.required &&
          isEmpty(node.data.config?.[field.key])
        ) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.name}: ${field.label} is required.`,
          });
        }
      });
    });

    if (triggers.length === 1) {
      const reachable = new Set();
      const queue = [triggers[0].id];

      while (queue.length > 0) {
        const current = queue.shift();

        if (reachable.has(current)) continue;

        reachable.add(current);

        const nextNodes = outgoingMap[current] || [];

        nextNodes.forEach((nextId) => {
          if (!reachable.has(nextId)) {
            queue.push(nextId);
          }
        });
      }

      nodes.forEach((node) => {
        if (!reachable.has(node.id)) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.name}: block cannot be reached from the trigger.`,
          });
        }
      });
    }

    const uniqueIssues = issues.filter(
      (issue, index, array) =>
        array.findIndex(
          (other) =>
            other.nodeId === issue.nodeId &&
            other.message === issue.message
        ) === index
    );

    setValidationIssues(uniqueIssues);

    setValidationErrorIds([
      ...new Set(
        uniqueIssues
          .map((issue) => issue.nodeId)
          .filter(Boolean)
      ),
    ]);

    if (openPanel) {
      setPanelMode('validation');
      setRunSteps([]);
      setRunPlan([]);
      setWaitingStepIndex(null);
      setRunStatus('idle');
    }

    return uniqueIssues;
  };

  const buildExecutionOrder = () => {
    const trigger = nodes.find((node) =>
      triggerTypes.includes(node.data.nodeType)
    );

    if (!trigger) return [];

    const nodeMap = Object.fromEntries(
      nodes.map((node) => [node.id, node])
    );

    const adjacency = {};

    nodes.forEach((node) => {
      adjacency[node.id] = [];
    });

    edges.forEach((edge) => {
      if (adjacency[edge.source]) {
        adjacency[edge.source].push(edge.target);
      }
    });

    const queue = [trigger.id];
    const visited = new Set();
    const ordered = [];

    while (queue.length > 0) {
      const id = queue.shift();

      if (visited.has(id)) continue;

      visited.add(id);

      const node = nodeMap[id];

      if (node) ordered.push(node);

      (adjacency[id] || []).forEach((nextId) => {
        if (!visited.has(nextId)) {
          queue.push(nextId);
        }
      });
    }

    return ordered;
  };

  const getSimulationNote = (node) => {
    const type = node.data.nodeType;

    if (type === 'condition') {
      return 'Simulated result: True';
    }

    if (
      ['aiPrompt', 'extract', 'classify', 'summarize'].includes(type)
    ) {
      return 'AI step simulated. No model was called.';
    }

    if (
      [
        'connector',
        'api',
        'plugin',
        'database',
        'spreadsheet',
        'fileStorage',
        'email',
        'whatsapp',
        'notification',
        'file',
      ].includes(type)
    ) {
      return 'External action simulated. Nothing was sent or changed.';
    }

    if (type === 'delay') {
      return 'Delay simulated. No real waiting occurred.';
    }

    return 'Simulated successfully';
  };

  const persistRun = (
    status,
    steps = runStepsRef.current,
    extra = {}
  ) => {
    if (!currentRunRef.current) return;

    const current = currentRunRef.current;

    const nextRun =
      status === 'Completed' ||
      status === 'Rejected' ||
      status === 'Failed'
        ? finishRun(current, status, {
            steps,
            ...extra,
          })
        : {
            ...current,
            status,
            steps,
            ...extra,
          };

    currentRunRef.current = nextRun;
    saveRun(nextRun);
  };

  const setRunStepsSnapshot = (
    nextSteps,
    historyStatus = null,
    extra = {}
  ) => {
    runStepsRef.current = nextSteps;
    setRunSteps(nextSteps);

    if (historyStatus) {
      persistRun(historyStatus, nextSteps, extra);
    }
  };

  const continueSimulation = async (orderedNodes, startIndex) => {
    for (
      let index = startIndex;
      index < orderedNodes.length;
      index += 1
    ) {
      const node = orderedNodes[index];
      const type = node.data.nodeType;

      const runningSteps = runStepsRef.current.map(
        (step, stepIndex) =>
          stepIndex === index
            ? {
                ...step,
                status: 'running',
                note: 'Simulating...',
              }
            : step
      );

      setRunStepsSnapshot(
        runningSteps,
        'Running'
      );

      await sleep(500);

      if (type === 'approval' || type === 'review') {
        const waitingSteps = runStepsRef.current.map(
          (step, stepIndex) =>
            stepIndex === index
              ? {
                  ...step,
                  status: 'waiting',
                  note: 'Waiting for human action',
                }
              : step
        );

        const reviewer =
          node.data.config?.approver ||
          node.data.config?.assignee ||
          'Reviewer';

        const approvalRequest = createApprovalRequest({
          runId: currentRunRef.current?.id,
          agentId,
          agentName: agentName || 'Agent',
          nodeId: node.id,
          blockName: node.data.name || 'Human Approval',
          approver: reviewer,
          message:
            node.data.config?.message ||
            node.data.config?.instructions ||
            '',
        });

        currentApprovalRef.current = approvalRequest;

        setRunStepsSnapshot(
          waitingSteps,
          'Waiting',
          {
            approval: {
              approvalId: approvalRequest.id,
              decision: 'Pending',
              by: reviewer,
              requestedAt: approvalRequest.requestedAt,
            },
          }
        );

        setWaitingStepIndex(index);
        setRunStatus('waiting');
        return;
      }

      const completedSteps = runStepsRef.current.map(
        (step, stepIndex) =>
          stepIndex === index
            ? {
                ...step,
                status: 'completed',
                note: getSimulationNote(node),
              }
            : step
      );

      setRunStepsSnapshot(
        completedSteps,
        'Running'
      );
    }

    setWaitingStepIndex(null);
    setRunStatus('completed');

    persistRun(
      'Completed',
      runStepsRef.current
    );
  };

  const testWorkflow = async () => {
    const issues = validateWorkflow(false);

    if (issues.length > 0) {
      setPanelMode('validation');
      setRunStatus('blocked');
      return;
    }

    const orderedNodes = buildExecutionOrder();

    const initialSteps = orderedNodes.map((node) => ({
      nodeId: node.id,
      name: node.data.name,
      type: node.data.nodeType,
      icon: node.data.icon,
      status: 'pending',
      note: '',
    }));

    const newRun = createRun({
      agentId,
      agentName: agentName || 'Agent',
      steps: initialSteps,
    });

    currentRunRef.current = newRun;
    runStepsRef.current = initialSteps;
    currentApprovalRef.current = null;

    saveRun(newRun);

    setRunPlan(orderedNodes);
    setRunSteps(initialSteps);
    setPanelMode('test');
    setRunStatus('running');
    setWaitingStepIndex(null);
    setValidationErrorIds([]);

    await continueSimulation(orderedNodes, 0);
  };

  const approveHumanStep = async () => {
    if (
      waitingStepIndex === null ||
      !runPlan.length ||
      runStatus !== 'waiting'
    ) {
      return;
    }

    const approvedIndex = waitingStepIndex;
    const approvalNode = runPlan[approvedIndex];

    const reviewer =
      approvalNode?.data?.config?.approver ||
      approvalNode?.data?.config?.assignee ||
      'Reviewer';

    const approvedSteps = runStepsRef.current.map(
      (step, index) =>
        index === approvedIndex
          ? {
              ...step,
              status: 'completed',
              note: 'Approved by human. Test resumed.',
            }
          : step
    );

    let approvalDecision = null;

    if (currentApprovalRef.current?.id) {
      approvalDecision = decideApproval({
        approvalId: currentApprovalRef.current.id,
        decision: 'Approved',
        decisionBy: reviewer,
        decisionNote: 'Approved from workflow test panel.',
      });

      if (approvalDecision) {
        currentApprovalRef.current = approvalDecision;
      }
    }

    setRunStepsSnapshot(
      approvedSteps,
      'Running',
      {
        approval: {
          approvalId: currentApprovalRef.current?.id || null,
          decision: 'Approved',
          by: reviewer,
          decidedAt:
            approvalDecision?.decidedAt ||
            new Date().toISOString(),
        },
      }
    );

    setWaitingStepIndex(null);
    setRunStatus('running');

    await sleep(250);

    await continueSimulation(
      runPlan,
      approvedIndex + 1
    );
  };

  const rejectHumanStep = () => {
    if (
      waitingStepIndex === null ||
      runStatus !== 'waiting'
    ) {
      return;
    }

    const rejectedIndex = waitingStepIndex;
    const approvalNode = runPlan[rejectedIndex];

    const reviewer =
      approvalNode?.data?.config?.approver ||
      approvalNode?.data?.config?.assignee ||
      'Reviewer';

    const rejectedSteps = runStepsRef.current.map(
      (step, index) => {
        if (index === rejectedIndex) {
          return {
            ...step,
            status: 'rejected',
            note: 'Rejected by human. Workflow stopped.',
          };
        }

        if (
          index > rejectedIndex &&
          step.status === 'pending'
        ) {
          return {
            ...step,
            status: 'skipped',
            note: 'Skipped because approval was rejected.',
          };
        }

        return step;
      }
    );

    let approvalDecision = null;

    if (currentApprovalRef.current?.id) {
      approvalDecision = decideApproval({
        approvalId: currentApprovalRef.current.id,
        decision: 'Rejected',
        decisionBy: reviewer,
        decisionNote: 'Rejected from workflow test panel.',
      });

      if (approvalDecision) {
        currentApprovalRef.current = approvalDecision;
      }
    }

    setRunStepsSnapshot(
      rejectedSteps,
      'Rejected',
      {
        approval: {
          approvalId: currentApprovalRef.current?.id || null,
          decision: 'Rejected',
          by: reviewer,
          decidedAt:
            approvalDecision?.decidedAt ||
            new Date().toISOString(),
        },
      }
    );

    setWaitingStepIndex(null);
    setRunStatus('rejected');
  };

  const publishCurrentWorkflow = () => {
    const issues = validateWorkflow(false);

    if (issues.length > 0) {
      setPanelMode('validation');
      setRunStatus('blocked');
      setPublishMessage(
        'Fix validation issues before publishing.'
      );
      return;
    }

    const published = publishWorkflow({
      agentId,
      nodes,
      edges,
    });

    setVersionState(published);

    setPublishMessage(
      `Published v${published?.publishedVersion || 1}`
    );

    setPanelMode('validation');
    setValidationIssues([]);
    setValidationErrorIds([]);
    setRunStatus('idle');
  };

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return nodeCatalog;

    const query = search.toLowerCase();

    return nodeCatalog
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            group.group.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [search]);

  const selectedSchema = selectedNode
    ? configSchemas[selectedNode.data.nodeType] || []
    : [];

  const showExecutionPanel = panelMode !== null;

  return (
    <div className="workflowBuilder">
      <aside className="workflowSidebar">
        <div className="workflowSidebarHeader">
          <h3>Workflow Blocks</h3>
          <span>Drag onto canvas or click</span>
        </div>

        <div className="workflowSearchBox">
          <input
            type="text"
            placeholder="Search triggers, AI, apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="workflowGroups">
          {filteredCatalog.map((group) => (
            <div className="workflowGroup" key={group.group}>
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
                    onClick={() => addNodeByClick(item)}
                  >
                    <div
                      className={`
                        workflowLibraryItemIcon
                        workflowIcon-${item.shape}
                      `}
                    >
                      {item.icon}
                    </div>

                    <div className="workflowLibraryItemText">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section
        className={`
          workflowBoard
          ${showExecutionPanel ? 'withExecutionPanel' : ''}
        `}
      >
        <div className="workflowBoardTopbar">
          <div className="workflowBoardTitle">
            <strong>Workflow Canvas</strong>
            <span>
              {nodes.length} nodes • {edges.length} connections
            </span>
          </div>

          <div className="workflowBoardActions">
            <div className="workflowVersionControls">
              <span
                className={`workflowVersionBadge ${
                  versionState?.isDirty
                    ? 'draft'
                    : 'published'
                }`}
              >
                {versionState?.isDirty
                  ? `Draft v${versionState?.draftVersion || 1}`
                  : `Published v${versionState?.publishedVersion || versionState?.draftVersion || 1}`}
              </span>

              {versionState?.publishedVersion && (
                <span className="workflowPublishedReference">
                  Published v{versionState.publishedVersion}
                </span>
              )}

              <span className="workflowDraftStatus">
                Saved locally
              </span>

              {publishMessage && (
                <span className="workflowPublishMessage">
                  {publishMessage}
                </span>
              )}
            </div>

            <button
              className="workflowActionButton"
              onClick={() => validateWorkflow(true)}
              disabled={runStatus === 'running'}
            >
              ✓ Validate
            </button>

            <button
              className="workflowActionButton workflowPublishButton"
              onClick={publishCurrentWorkflow}
              disabled={
                runStatus === 'running' ||
                nodes.length === 0 ||
                versionState?.isDirty === false
              }
            >
              ↑ Publish
            </button>

            <button
              className="workflowActionButton workflowTestButton"
              onClick={testWorkflow}
              disabled={runStatus === 'running'}
            >
              {runStatus === 'running'
                ? 'Running...'
                : '▶ Test Run'}
            </button>

            <button
              className="workflowActionButton"
              onClick={clearWorkflow}
              disabled={runStatus === 'running'}
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
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setReactFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(event, node) => {
              setSelectedNode(node);
            }}
            onPaneClick={() => setSelectedNode(null)}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{
              style: {
                stroke: '#666',
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
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
                getTheme(node.data?.nodeType)
              }
              maskColor="rgba(0,0,0,0.65)"
              style={{
                background: '#151515',
                border: '1px solid #2e2e2e',
              }}
            />
          </ReactFlow>
        </div>

        {showExecutionPanel && (
          <div className="workflowExecutionPanel">
            <div className="workflowExecutionHeader">
              <div>
                <strong>
                  {panelMode === 'validation'
                    ? 'Workflow Validation'
                    : 'Test Run'}
                </strong>

                <span>
                  {panelMode === 'validation'
                    ? 'Check workflow structure and required configuration'
                    : 'Safe simulation. No external actions will execute.'}
                </span>
              </div>

              <button
                className="workflowExecutionClose"
                onClick={() => setPanelMode(null)}
              >
                ×
              </button>
            </div>

            <div className="workflowExecutionBody">
              {panelMode === 'validation' && (
                <>
                  {validationIssues.length === 0 ? (
                    <div className="workflowValidationSuccess">
                      <strong>
                        {publishMessage
                          ? `✓ ${publishMessage}`
                          : '✓ Workflow valid'}
                      </strong>
                      <span>
                        {publishMessage
                          ? 'This exact workflow snapshot is now the published version.'
                          : 'No blocking issues found. Ready for a test run or publish.'}
                      </span>
                    </div>
                  ) : (
                    <div className="workflowValidationList">
                      <div className="workflowValidationSummary">
                        {validationIssues.length}{' '}
                        issue
                        {validationIssues.length !== 1 ? 's' : ''}{' '}
                        found
                      </div>

                      {validationIssues.map((issue, index) => (
                        <button
                          key={`${issue.nodeId}-${index}`}
                          className="workflowValidationItem"
                          onClick={() => {
                            if (!issue.nodeId) return;

                            const node = nodes.find(
                              (item) => item.id === issue.nodeId
                            );

                            if (node) {
                              setSelectedNode(node);
                            }
                          }}
                        >
                          <span>!</span>
                          <p>{issue.message}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {panelMode === 'test' && (
                <div className="workflowRunSteps">
                  <div
                    className={`
                      workflowRunStatus
                      workflowRunStatus-${runStatus}
                    `}
                  >
                    {runStatus === 'running' && '● Test running'}
                    {runStatus === 'completed' && '✓ Test completed'}
                    {runStatus === 'waiting' && '◷ Waiting for human action'}
                    {runStatus === 'blocked' && '✕ Test blocked'}
                    {runStatus === 'rejected' && '✕ Workflow rejected'}
                  </div>

                  {runSteps.map((step, index) => (
                    <div
                      className={`
                        workflowRunStep
                        workflowRunStep-${step.status}
                      `}
                      key={step.nodeId}
                    >
                      <div className="workflowRunStepNumber">
                        {index + 1}
                      </div>

                      <div className="workflowRunStepIcon">
                        {step.icon}
                      </div>

                      <div className="workflowRunStepText">
                        <strong>{step.name}</strong>
                        <span>{step.note || 'Waiting...'}</span>

                        {step.status === 'waiting' && (
                          <div className="workflowApprovalActions">
                            <button
                              className="workflowApproveButton"
                              onClick={approveHumanStep}
                            >
                              ✓ Approve & Continue
                            </button>

                            <button
                              className="workflowRejectButton"
                              onClick={rejectHumanStep}
                            >
                              × Reject
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="workflowRunStepState">
                        {step.status === 'pending' && 'Pending'}
                        {step.status === 'running' && 'Running'}
                        {step.status === 'completed' && '✓'}
                        {step.status === 'waiting' && 'Waiting'}
                        {step.status === 'rejected' && 'Rejected'}
                        {step.status === 'skipped' && 'Skipped'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <aside className="workflowInspector">
        <div className="workflowInspectorHeader">
          <h3>Properties</h3>
          <span>Configure selected block</span>
        </div>

        {!selectedNode ? (
          <div className="workflowEmptyInspector">
            <div className="workflowEmptyInspectorIcon">
              ◇
            </div>

            <p>
              Select a block from the canvas to configure it.
            </p>
          </div>
        ) : (
          <div className="workflowInspectorForm">
            <div className="workflowInspectorType">
              {selectedNode.data.icon}
              <span>{selectedNode.data.group}</span>
            </div>

            <label>Block Name</label>

            <input
              value={selectedNode.data.name || ''}
              onChange={(e) =>
                updateNodeField('name', e.target.value)
              }
            />

            <label>Description</label>

            <textarea
              rows={3}
              value={selectedNode.data.description || ''}
              onChange={(e) =>
                updateNodeField('description', e.target.value)
              }
            />

            {selectedSchema.length > 0 && (
              <>
                <div className="workflowInspectorDivider">
                  Configuration
                </div>

                {selectedSchema.map((field) => (
                  <div
                    className="workflowConfigField"
                    key={field.key}
                  >
                    <label>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>

                    {field.type === 'textarea' && (
                      <textarea
                        rows={4}
                        placeholder={field.placeholder || ''}
                        value={
                          selectedNode.data.config?.[field.key] || ''
                        }
                        onChange={(e) =>
                          updateNodeConfig(
                            field.key,
                            e.target.value
                          )
                        }
                      />
                    )}

                    {field.type === 'select' && (
                      <select
                        value={
                          selectedNode.data.config?.[field.key] || ''
                        }
                        onChange={(e) =>
                          updateNodeConfig(
                            field.key,
                            e.target.value
                          )
                        }
                      >
                        {field.options?.map((option) => (
                          <option
                            key={option}
                            value={option}
                          >
                            {option}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type !== 'textarea' &&
                      field.type !== 'select' && (
                        <input
                          type={field.type || 'text'}
                          placeholder={field.placeholder || ''}
                          value={
                            selectedNode.data.config?.[field.key] || ''
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
                ))}
              </>
            )}

            <div className="workflowInspectorDivider">
              Technical
            </div>

            <label>Node ID</label>

            <div className="workflowReadonly workflowIdBox">
              {selectedNode.id}
            </div>

            <div className="workflowConfigNotice">
              Visual configuration only. Test Run is simulated and will
              not send emails, call APIs, change databases, or alter
              external systems.
            </div>

            <button
              className="workflowDangerButton"
              onClick={deleteSelectedNode}
            >
              Delete Block
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
