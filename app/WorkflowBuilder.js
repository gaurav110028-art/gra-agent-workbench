'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import '@xyflow/react/dist/style.css';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  MarkerType,
} from '@xyflow/react';

import { createRun, finishRun, saveRun } from './runHistory';

import {
  createApprovalRequest,
  decideApproval,
  recordApprovalActionResult,
} from './approvalQueue';

import {
  getWorkflowVersionState,
  initializeWorkflowVersion,
  saveWorkflowDraft,
  publishWorkflow,
} from './workflowVersions';

import { getAgentSources, getSourceFile, subscribeToSources } from './sourceStore';

import {
  nodeCatalog,
  configSchemas,
  triggerTypes,
  terminalTypes,
  getTheme,
  getDefaultConfig,
} from './workflowCatalog';

import {
  createRunner,
  getUpstreamNodes,
  orderFromTrigger,
  resolveTemplate,
} from './workflowEngine';

import { nodeTypes } from './workflow/WorkflowNode';
import NodeInspector from './workflow/NodeInspector';
import ExecutionConsole from './workflow/ExecutionConsole';
import GauravChatDrawer from './architect/GauravChatDrawer';

/* =========================================================
   HELPERS
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

const edgeStyle = {
  style: { stroke: '#6a6a6a', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' },
};

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`HTTP ${response.status}: non-JSON response.`);
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with HTTP ${response.status}.`);
  }

  return payload;
}

/* Nodes load from storage after mount, so fit the viewport once React Flow
   has measured them, and again when the console changes the canvas height. */
function AutoFit({ signal }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();

  useEffect(() => {
    if (!initialized) return;

    const timer = setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 1, duration: 250 });
    }, 40);

    return () => clearTimeout(timer);
  }, [initialized, signal, fitView]);

  return null;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function WorkflowBuilder({ agentId, agentName, onOpenSources }) {
  const storageKey = `gra-workflow-${agentId}`;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const [availableSources, setAvailableSources] = useState([]);

  const [versionState, setVersionState] = useState(null);
  const [publishMessage, setPublishMessage] = useState('');

  const [panelMode, setPanelMode] = useState(null);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [showGauravDrawer, setShowGauravDrawer] = useState(false);

  const [validationIssues, setValidationIssues] = useState([]);
  const [validationErrorIds, setValidationErrorIds] = useState([]);

  const [runSteps, setRunSteps] = useState([]);
  const [runStatus, setRunStatus] = useState('idle');
  const [runMode, setRunMode] = useState('test');

  const [auditResult, setAuditResult] = useState(null);
  const [auditError, setAuditError] = useState('');
  const [auditProcessing, setAuditProcessing] = useState(false);

  const currentRunRef = useRef(null);
  const runStepsRef = useRef([]);
  const currentApprovalRef = useRef(null);
  const runnerRef = useRef(null);
  const waitingNodeIdRef = useRef(null);
  const auditPlanRef = useRef([]);

  /* ---------- load / persist ---------- */

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

    setSelectedNodeId(null);
    setPanelMode(null);
    setRunSteps([]);
    setRunStatus('idle');
    setAuditResult(null);
    setAuditError('');
    setAuditProcessing(false);

    currentRunRef.current = null;
    runStepsRef.current = [];
    currentApprovalRef.current = null;
    runnerRef.current = null;
    waitingNodeIdRef.current = null;

    setVersionState(getWorkflowVersionState(agentId));
    setPublishMessage('');
    setLoaded(true);
  }, [agentId, storageKey, setNodes, setEdges]);

  useEffect(() => {
    let active = true;

    const refreshSources = async () => {
      try {
        const next = await getAgentSources(agentId);
        if (active) setAvailableSources(next);
      } catch {
        if (active) setAvailableSources([]);
      }
    };

    refreshSources();

    const unsubscribe = subscribeToSources((detail) => {
      if (!detail?.agentId || String(detail.agentId) === String(agentId)) {
        refreshSources();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [agentId]);

  useEffect(() => {
    if (!loaded) return;

    localStorage.setItem(storageKey, JSON.stringify({ nodes, edges }));

    const existing = getWorkflowVersionState(agentId);

    const updated = existing?.draft
      ? saveWorkflowDraft({ agentId, nodes, edges })
      : initializeWorkflowVersion({ agentId, nodes, edges });

    setVersionState(updated);
    setPublishMessage('');
  }, [agentId, nodes, edges, loaded, storageKey]);

  /* ---------- derived ---------- */

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const stepByNode = useMemo(
    () => Object.fromEntries(runSteps.map((step) => [step.nodeId, step])),
    [runSteps]
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const step = stepByNode[node.id];
        const runStatusMap = {
          running: 'running',
          completed: 'success',
          failed: 'error',
          rejected: 'error',
          waiting: 'waiting',
          skipped: 'skipped',
        };

        return {
          ...node,
          data: {
            ...node.data,
            hasValidationError: validationErrorIds.includes(node.id),
            runStatus: step ? runStatusMap[step.status] || 'idle' : 'idle',
            durationMs: step?.durationMs,
          },
        };
      }),
    [nodes, validationErrorIds, stepByNode]
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const sourceStep = stepByNode[edge.source];
        const targetStep = stepByNode[edge.target];
        const flowed =
          sourceStep &&
          targetStep &&
          sourceStep.status === 'completed' &&
          targetStep.status !== 'pending' &&
          targetStep.status !== 'skipped';

        return {
          ...edge,
          animated: Boolean(sourceStep?.status === 'completed' && targetStep?.status === 'running'),
          className: flowed ? 'edge-flowed' : targetStep?.status === 'skipped' ? 'edge-skipped' : '',
        };
      }),
    [edges, stepByNode]
  );

  const upstreamNodes = useMemo(
    () => (selectedNode ? getUpstreamNodes(selectedNode.id, nodes, edges) : []),
    [selectedNode, nodes, edges]
  );

  const prevNode = useMemo(() => {
    if (!selectedNode) return null;
    const incoming = edges.find((edge) => edge.target === selectedNode.id);
    return incoming ? nodes.find((node) => node.id === incoming.source) || null : null;
  }, [selectedNode, nodes, edges]);

  const isAuditWorkflow = nodes.some((node) => {
    const name = String(node.data?.name || '').toLowerCase();
    return (
      name.includes('audit file intake') ||
      name.includes('read & extract audit documents') ||
      name.includes('read and extract audit documents') ||
      name.includes('audit query generator')
    );
  });

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

  /* ---------- canvas editing ---------- */

  const onConnect = useCallback(
    (params) => {
      let label = params.sourceHandle || undefined;

      const routeMatch = /^route-(\d+)$/.exec(params.sourceHandle || '');

      if (routeMatch) {
        const source = nodes.find((node) => node.id === params.source);
        const routes = String(source?.data?.config?.routes || '')
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean);
        label = routes[Number(routeMatch[1])] || `Route ${Number(routeMatch[1]) + 1}`;
      }

      setEdges((current) =>
        addEdge({ ...params, ...edgeStyle, ...(label ? { label } : {}) }, current)
      );
    },
    [setEdges, nodes]
  );

  const createNode = useCallback(
    (template, position) => {
      const parentGroup = nodeCatalog.find((group) =>
        group.items.some((item) => item.type === template.type)
      );

      const id = `${template.type}-${Date.now()}`;

      setNodes((current) => [
        ...current,
        {
          id,
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
        },
      ]);

      setSelectedNodeId(id);
    },
    [setNodes]
  );

  const addNodeByClick = (template) => {
    const last = nodes[nodes.length - 1];
    createNode(template, {
      x: last ? last.position.x + 300 : 120,
      y: last ? last.position.y : 220,
    });
  };

  const onDragStart = (event, template) => {
    event.dataTransfer.setData('application/gra-workflow-node', JSON.stringify(template));
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

      const raw = event.dataTransfer.getData('application/gra-workflow-node');
      if (!raw) return;

      try {
        const template = JSON.parse(raw);
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        createNode(template, position);
      } catch {
        /* ignore malformed drag payloads */
      }
    },
    [reactFlowInstance, createNode]
  );

  const patchNodeData = (nodeId, updater) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, data: updater(node.data) } : node
      )
    );
  };

  const updateNodeField = (field, value) => {
    if (!selectedNode) return;
    patchNodeData(selectedNode.id, (data) => ({ ...data, [field]: value }));
  };

  const updateNodeConfig = (key, value) => {
    if (!selectedNode) return;
    patchNodeData(selectedNode.id, (data) => ({
      ...data,
      config: { ...(data.config || {}), [key]: value },
    }));
  };

  const patchNodeConfig = (patch) => {
    if (!selectedNode) return;
    patchNodeData(selectedNode.id, (data) => ({
      ...data,
      config: { ...(data.config || {}), ...patch },
    }));
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;

    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    setSelectedNodeId(null);
  };

  const clearWorkflow = () => {
    if (!window.confirm('Clear this entire workflow?')) return;

    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setValidationIssues([]);
    setValidationErrorIds([]);
    setRunSteps([]);
    setPanelMode(null);
    setRunStatus('idle');
  };

  /* ---------- validation ---------- */

  const validateWorkflow = (openPanel = true) => {
    const issues = [];

    if (nodes.length === 0) {
      issues.push({ nodeId: null, message: 'Workflow has no nodes.' });
    }

    const triggers = nodes.filter((node) => triggerTypes.includes(node.data.nodeType));

    if (nodes.length > 0 && triggers.length === 0) {
      issues.push({ nodeId: null, message: 'Add one trigger to start the workflow.' });
    }

    if (triggers.length > 1) {
      triggers.forEach((trigger) => {
        issues.push({
          nodeId: trigger.id,
          message: `${trigger.data.name}: only one trigger is allowed per workflow.`,
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
      outgoingMap[edge.source]?.push(edge.target);
      incomingMap[edge.target]?.push(edge.source);
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
          message: `${node.data.name}: node is not connected to a previous step.`,
        });
      }

      if (!terminalTypes.includes(type) && outgoing.length === 0) {
        issues.push({
          nodeId: node.id,
          message: `${node.data.name}: no next step is connected.`,
        });
      }

      if ((type === 'condition' || type === 'router') && outgoing.length < 2) {
        issues.push({
          nodeId: node.id,
          message: `${node.data.name}: connect at least two output paths.`,
        });
      }

      const schema = configSchemas[type] || [];
      const config = node.data.config || {};

      schema.forEach((field) => {
        if (!field.required) return;

        if (type === 'bulkEmail' && field.key === 'to' && config.dataSource === 'Uploaded CSV / JSON' && !config.csvRows?.length) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.name}: upload a CSV / JSON file for recipients.`,
          });
        }

        if (isEmpty(config[field.key])) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.name}: ${field.label} is required.`,
          });
        }
      });

      const normalizedNodeName = String(node.data?.name || '').toLowerCase();

      if (
        normalizedNodeName.includes('read & extract audit documents') ||
        normalizedNodeName.includes('read and extract audit documents')
      ) {
        [
          ['financialStatementsSourceId', 'Last-year Signed Financial Statements'],
          ['trialBalanceSourceId', 'Current-year Trial Balance'],
          ['gstDataSourceId', 'GST Reconciliation Data'],
        ].forEach(([key, label]) => {
          if (isEmpty(config[key])) {
            issues.push({
              nodeId: node.id,
              message: `${node.data.name}: ${label} Source is required.`,
            });
          }
        });
      }
    });

    if (triggers.length === 1) {
      const reachable = new Set(orderFromTrigger(nodes, edges).map((node) => node.id));

      nodes.forEach((node) => {
        if (!reachable.has(node.id)) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.name}: node cannot be reached from the trigger.`,
          });
        }
      });
    }

    const unique = issues.filter(
      (issue, index, array) =>
        array.findIndex(
          (other) => other.nodeId === issue.nodeId && other.message === issue.message
        ) === index
    );

    setValidationIssues(unique);
    setValidationErrorIds([...new Set(unique.map((issue) => issue.nodeId).filter(Boolean))]);

    if (openPanel) {
      setPanelMode('validation');
      setConsoleCollapsed(false);
    }

    return unique;
  };

  /* ---------- run bookkeeping ---------- */

  const persistRun = (status, steps = runStepsRef.current, extra = {}) => {
    if (!currentRunRef.current) return;

    const current = currentRunRef.current;
    const terminal = ['Completed', 'Rejected', 'Failed'].includes(status);

    const next = terminal
      ? finishRun(current, status, { steps, ...extra })
      : { ...current, status, steps, ...extra };

    currentRunRef.current = next;
    saveRun(next);
  };

  const setStepsSnapshot = (steps, historyStatus = null, extra = {}) => {
    runStepsRef.current = steps;
    setRunSteps(steps);
    if (historyStatus) persistRun(historyStatus, steps, extra);
  };

  const patchStep = (nodeId, patch, historyStatus = null, extra = {}) => {
    const next = runStepsRef.current.map((step) =>
      step.nodeId === nodeId ? { ...step, ...patch } : step
    );
    setStepsSnapshot(next, historyStatus, extra);
  };

  const beginRun = (orderedNodes, type) => {
    const initialSteps = orderedNodes.map((node) => ({
      nodeId: node.id,
      name: node.data.name,
      type: node.data.nodeType,
      icon: node.data.icon,
      status: 'pending',
      note: '',
      input: undefined,
      output: undefined,
      durationMs: undefined,
    }));

    const latest = getWorkflowVersionState(agentId);

    const run = {
      ...createRun({
        agentId,
        agentName: agentName || 'Agent',
        steps: initialSteps,
        workflowVersion: latest?.draftVersion || latest?.publishedVersion || 1,
        workflowVersionStatus: latest?.isDirty ? 'Draft' : 'Published',
        workflowSnapshot: { nodes, edges, capturedAt: new Date().toISOString() },
      }),
      type,
    };

    currentRunRef.current = run;
    runStepsRef.current = initialSteps;
    currentApprovalRef.current = null;
    waitingNodeIdRef.current = null;

    saveRun(run);

    setRunSteps(initialSteps);
    setPanelMode('run');
    setConsoleCollapsed(false);
    setRunStatus('running');
    setValidationErrorIds([]);
    setAuditError('');

    return initialSteps;
  };

  /* ---------- live services ---------- */

  const services = useMemo(
    () => ({
      sendEmail: async (message) => {
        try {
          const payload = await postJson('/api/send-email', {
            to: message.to,
            subject: message.subject,
            body: message.body,
            runId: currentRunRef.current?.id,
            approvalId: currentApprovalRef.current?.id,
          });

          return {
            status: 'sent',
            provider: 'Resend',
            id: payload.id,
            to: message.to,
            subject: message.subject,
            sentAt: new Date().toISOString(),
          };
        } catch (error) {
          return {
            status: 'failed',
            provider: 'Resend',
            to: message.to,
            subject: message.subject,
            error: error?.message || 'Email sending failed.',
          };
        }
      },
      callAi: async (request) => {
        try {
          return await postJson('/api/ai-node', request);
        } catch (error) {
          return { text: '', json: null, error: error?.message || 'AI call failed.' };
        }
      },
      httpRequest: async (request) => {
        try {
          return await postJson('/api/http-request', request);
        } catch (error) {
          return { status: 0, body: null, error: error?.message || 'HTTP request failed.', durationMs: 0 };
        }
      },
    }),
    []
  );

  /* ---------- approval helpers ---------- */

  const findFirstReachableSendNode = (startNodeId) => {
    const queue = [startNodeId];
    const visited = new Set([startNodeId]);

    while (queue.length > 0) {
      const currentId = queue.shift();

      for (const edge of edges.filter((item) => item.source === currentId)) {
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);

        const next = nodes.find((node) => node.id === edge.target);
        if (!next) continue;

        if (next.data?.nodeType === 'email' || next.data?.nodeType === 'bulkEmail') {
          return next;
        }

        queue.push(next.id);
      }
    }

    return null;
  };

  const buildPostApprovalAction = (approvalNodeId, ctx = null, extraBodyLines = '') => {
    const sendNode = findFirstReachableSendNode(approvalNodeId);
    if (!sendNode) return null;

    const config = sendNode.data?.config || {};
    const scope = ctx || { outputs: {}, item: null, prev: null };

    if (sendNode.data.nodeType === 'bulkEmail') {
      const rows =
        config.dataSource === 'Uploaded CSV / JSON'
          ? config.csvRows || []
          : ctx?.items?.length
            ? ctx.items
            : config.csvRows || [];

      const messages = rows.slice(0, Number(config.maxRecipients) || 50).map((row) => {
        const rowScope = { ...scope, item: row };
        return {
          to: resolveTemplate(config.to, rowScope),
          subject: resolveTemplate(config.subject, rowScope),
          body: resolveTemplate(config.body, rowScope),
        };
      });

      return {
        type: 'bulkEmail',
        nodeId: sendNode.id,
        to: `${messages.length} recipient(s)`,
        subject: messages[0]?.subject || resolveTemplate(config.subject, scope),
        body: messages[0]?.body || '',
        messages,
      };
    }

    const body = resolveTemplate(config.body, scope).trim();

    return {
      type: 'email',
      nodeId: sendNode.id,
      to: resolveTemplate(config.to, scope).trim(),
      subject: resolveTemplate(config.subject, scope).trim(),
      body: extraBodyLines ? `${body}\n\n${extraBodyLines}`.trim() : body,
    };
  };

  const sendPostApprovalEmail = async (approval) => {
    const action = approval?.postApprovalAction;
    if (!action) return null;

    if (action.type === 'bulkEmail') {
      const results = [];
      for (const message of action.messages || []) {
        results.push(await services.sendEmail(message));
      }
      const sent = results.filter((item) => item.status === 'sent');
      const failed = results.filter((item) => item.status !== 'sent');

      return {
        status: failed.length === results.length && results.length > 0 ? 'failed' : 'sent',
        provider: 'Resend',
        to: `${sent.length} of ${results.length} recipient(s)`,
        subject: action.subject,
        results,
        sentAt: new Date().toISOString(),
        ...(failed.length ? { error: `${failed.length} failed: ${failed[0].error}` } : {}),
      };
    }

    if (action.type === 'email') {
      return services.sendEmail({ to: action.to, subject: action.subject, body: action.body });
    }

    return null;
  };

  /* ---------- engine run (Test Run / Run Workflow) ---------- */

  const startEngineRun = async (mode) => {
    const issues = validateWorkflow(false);

    if (issues.length > 0) {
      setPanelMode('validation');
      setConsoleCollapsed(false);
      setRunStatus('blocked');
      return;
    }

    if (mode === 'live') {
      const confirmed = window.confirm(
        'Run Workflow executes live steps: AI Agent nodes call the model and Send Email / Bulk Email nodes send through Resend (after any Approval Gate). Continue?'
      );
      if (!confirmed) return;
    }

    const ordered = orderFromTrigger(nodes, edges);

    setRunMode(mode);
    setAuditResult(null);
    beginRun(ordered, mode === 'live' ? 'Live Run' : 'Test Run');

    const runner = createRunner({
      nodes,
      edges,
      mode,
      services,
      hooks: {
        onStart: (node, input) => {
          patchStep(node.id, { status: 'running', note: 'Running...', input }, 'Running');
        },
        onSuccess: (node, result, durationMs) => {
          patchStep(
            node.id,
            { status: 'completed', note: result.note, output: result.output, durationMs },
            'Running'
          );
        },
        onError: (node, result, durationMs) => {
          patchStep(
            node.id,
            {
              status: 'failed',
              note: result.note || result.error,
              output: result.output,
              error: result.error,
              durationMs,
            },
            'Running'
          );
        },
        onSkip: (node, reason) => {
          patchStep(node.id, {
            status: 'skipped',
            note: reason || 'Branch not taken.',
            durationMs: 0,
          });
        },
        onPause: (node, result, durationMs, ctx) => {
          const reviewer = result.output.approver || 'Reviewer';

          const approval = createApprovalRequest({
            runId: currentRunRef.current?.id,
            agentId,
            agentName: agentName || 'Agent',
            nodeId: node.id,
            blockName: node.data.name || 'Approval Gate',
            approver: reviewer,
            message: result.output.message || '',
            workflowVersion: currentRunRef.current?.workflowVersion || null,
            workflowVersionStatus: currentRunRef.current?.workflowVersionStatus || null,
            // Only live runs attach a real send action; a simulated Test Run
            // must never email sample addresses from the Approvals tab.
            postApprovalAction:
              mode === 'live'
                ? buildPostApprovalAction(node.id, {
                    outputs: runner.state.outputs,
                    item: ctx.item,
                    items: ctx.items,
                    prev: ctx.prev,
                  })
                : null,
          });

          currentApprovalRef.current = approval;
          waitingNodeIdRef.current = node.id;

          patchStep(
            node.id,
            { status: 'waiting', note: result.note, output: result.output, durationMs },
            'Waiting',
            {
              approval: {
                approvalId: approval.id,
                decision: 'Pending',
                by: reviewer,
                requestedAt: approval.requestedAt,
              },
            }
          );

          setRunStatus('waiting');
        },
      },
    });

    runnerRef.current = runner;

    const outcome = await runner.start();
    finalizeEngineOutcome(outcome);
  };

  const finalizeEngineOutcome = (outcome) => {
    if (outcome === 'completed') {
      setRunStatus('completed');
      persistRun('Completed');
    } else if (outcome === 'failed') {
      setRunStatus('blocked');
      const failedStep = runStepsRef.current.find((step) => step.status === 'failed');
      persistRun('Failed', runStepsRef.current, { error: failedStep?.error || failedStep?.note });
    }
  };

  /* ---------- audit demo (unchanged behaviour, new step shape) ---------- */

  const formatAuditAmount = (value) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Math.abs(Number(value || 0)));

  const getAuditNodeNote = (node, result) => {
    const name = String(node.data?.name || '').toLowerCase();
    const openingCount = result?.openingFindings?.length || 0;
    const gstCount = result?.gstFindings?.length || 0;
    const totalCount = result?.findings?.length || 0;
    const queryCount = result?.queries?.length || 0;

    if (name.includes('manual trigger')) return 'Started manually by the user.';
    if (name.includes('audit file intake')) return 'Client documents were loaded from the agent Source Library.';
    if (name.includes('read & extract') || name.includes('read and extract')) {
      return `File analysis completed. ${result?.extractionSummary || 'Financial statements, trial balance and GST records were extracted from the selected Sources.'}`;
    }
    if (name.includes('opening balance')) {
      return `${openingCount} opening-balance exception${openingCount === 1 ? '' : 's'} identified by deterministic comparison.`;
    }
    if (name.includes('gst reconciliation')) {
      return `${gstCount} GST exception${gstCount === 1 ? '' : 's'} identified across books, GSTR-1 and GSTR-3B data.`;
    }
    if (name.includes('combine audit exceptions')) {
      return `${totalCount} total audit exception${totalCount === 1 ? '' : 's'} combined for review.`;
    }
    if (name.includes('audit query generator')) {
      return `${queryCount} client quer${queryCount === 1 ? 'y' : 'ies'} generated from the identified exceptions.`;
    }
    if (name.includes('send client audit queries')) {
      return 'Client communication step reached. After Senior CA approval, the configured email can be sent through Resend.';
    }
    return 'Completed using the real audit-demo result.';
  };

  const buildAuditApprovalMessage = (node, result) => {
    const configured =
      node.data.config?.message ||
      'Please review the identified audit exceptions and proposed client queries before communication.';

    const lines = (result?.queries || [])
      .slice(0, 10)
      .map((query, index) => `${index + 1}. ${query.area}: ${query.query}`)
      .join('\n');

    return `${configured}\n\nREAL AUDIT DEMO FINDINGS: ${result?.findings?.length || 0} exception(s).\n\n${lines}`;
  };

  const continueAuditExecution = async (orderedNodes, result, startIndex = 0) => {
    for (let index = startIndex; index < orderedNodes.length; index += 1) {
      const node = orderedNodes[index];
      const type = node.data.nodeType;
      const started = performance.now();

      patchStep(
        node.id,
        {
          status: 'running',
          note: String(node.data?.name || '').toLowerCase().includes('read & extract')
            ? 'Reading the uploaded PDF and Excel files...'
            : 'Processing real audit result...',
          input: { auditFindings: result?.findings?.length || 0 },
        },
        'Running'
      );

      await sleep(220);

      if (type === 'approval' || type === 'review') {
        const reviewer = node.data.config?.approver || node.data.config?.assignee || 'Senior CA';

        const queryLines = (result?.queries || [])
          .slice(0, 20)
          .map((item, i) => `${i + 1}. ${item.area || 'Audit'}: ${item.query || item.message || ''}`)
          .join('\n');

        const approval = createApprovalRequest({
          runId: currentRunRef.current?.id,
          agentId,
          agentName: agentName || 'Agent',
          nodeId: node.id,
          blockName: node.data.name || 'Senior CA Review',
          approver: reviewer,
          message: buildAuditApprovalMessage(node, result),
          workflowVersion: currentRunRef.current?.workflowVersion || null,
          workflowVersionStatus: currentRunRef.current?.workflowVersionStatus || null,
          postApprovalAction: buildPostApprovalAction(node.id, null, queryLines ? `Audit Queries:\n${queryLines}` : ''),
        });

        currentApprovalRef.current = approval;
        waitingNodeIdRef.current = node.id;

        patchStep(
          node.id,
          {
            status: 'waiting',
            note: `Waiting for Senior CA review of ${result?.findings?.length || 0} real exception(s) and ${result?.queries?.length || 0} client query draft(s).`,
            output: { findings: result?.findings?.length || 0, queries: result?.queries || [] },
            durationMs: Math.round(performance.now() - started),
          },
          'Waiting',
          {
            auditResult: result,
            approval: {
              approvalId: approval.id,
              decision: 'Pending',
              by: reviewer,
              requestedAt: approval.requestedAt,
            },
          }
        );

        setRunStatus('waiting');
        return;
      }

      patchStep(
        node.id,
        {
          status: 'completed',
          note: getAuditNodeNote(node, result),
          output: { summary: getAuditNodeNote(node, result) },
          durationMs: Math.round(performance.now() - started),
        },
        'Running',
        { auditResult: result }
      );
    }

    setRunStatus('completed');
    persistRun('Completed', runStepsRef.current, { auditResult: result });
  };

  const runAuditDemo = async () => {
    const issues = validateWorkflow(false);

    if (issues.length > 0) {
      setPanelMode('validation');
      setConsoleCollapsed(false);
      setRunStatus('blocked');
      return;
    }

    const byName = (needle) =>
      nodes.find((node) => String(node.data?.name || '').toLowerCase().includes(needle));

    const extractor =
      byName('read & extract audit documents') || byName('read and extract audit documents');
    const openingNode = byName('opening balance reconciliation');
    const gstNode = byName('gst reconciliation');

    const firstPdf = availableSources.find((source) => source.category === 'PDF');
    const trialMatch = availableSources.find((source) => /trial|\btb\b/i.test(source.name));
    const gstMatch = availableSources.find((source) => /gst|gstr/i.test(source.name));

    const financialStatementsSourceId =
      extractor?.data?.config?.financialStatementsSourceId ||
      openingNode?.data?.config?.referenceSourceId ||
      firstPdf?.id ||
      '';
    const trialBalanceSourceId =
      extractor?.data?.config?.trialBalanceSourceId ||
      openingNode?.data?.config?.sourceId ||
      trialMatch?.id ||
      '';
    const gstDataSourceId =
      extractor?.data?.config?.gstDataSourceId || gstNode?.data?.config?.sourceId || gstMatch?.id || '';

    const missing = [];
    if (!financialStatementsSourceId) missing.push('last-year signed financial statements');
    if (!trialBalanceSourceId) missing.push('current-year trial balance');
    if (!gstDataSourceId) missing.push('GST reconciliation data');

    if (missing.length > 0) {
      setAuditError(`Select ${missing.join(', ')} from the Sources tab / workflow source selectors.`);
      setPanelMode('run');
      setConsoleCollapsed(false);
      setRunStatus('blocked');
      return;
    }

    const ordered = orderFromTrigger(nodes, edges);
    auditPlanRef.current = ordered;

    setRunMode('audit');
    setAuditResult(null);
    const initialSteps = beginRun(ordered, 'Audit Demo');
    setAuditProcessing(true);

    try {
      const [fs, tb, gst] = await Promise.all([
        getSourceFile(agentId, financialStatementsSourceId),
        getSourceFile(agentId, trialBalanceSourceId),
        getSourceFile(agentId, gstDataSourceId),
      ]);

      if (!fs || !tb || !gst) {
        throw new Error('One or more selected Source files are unavailable. Re-upload them in the Sources tab.');
      }

      const formData = new FormData();
      formData.append('financialStatements', fs);
      formData.append('trialBalance', tb);
      formData.append('gstData', gst);

      const response = await fetch('/api/audit-demo', { method: 'POST', body: formData });
      const text = await response.text();

      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(
          `Audit API returned HTTP ${response.status} with a non-JSON response: ${String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500) || 'No response body was returned.'}`
        );
      }

      if (!response.ok) {
        const requestError = new Error(payload?.error || `Audit processing failed with HTTP ${response.status}.`);
        requestError.auditFailurePayload = payload;
        throw requestError;
      }

      if (!payload) throw new Error('Audit API returned an empty response.');

      setAuditResult(payload);
      persistRun('Running', initialSteps, { auditResult: payload });

      await continueAuditExecution(ordered, payload);
    } catch (error) {
      const message = error?.message || 'Audit processing failed.';
      setAuditError(message);
      setRunStatus('blocked');

      const failurePayload = error?.auditFailurePayload || null;
      const failedAuditResult = failurePayload?.usage
        ? {
            usage: failurePayload.usage,
            model: failurePayload.model || 'claude-haiku-4-5-20251001',
            engine: failurePayload.engine || 'Claude Haiku 4.5 failed extraction',
            failed: true,
            error: message,
            stopReason: failurePayload.stopReason || null,
          }
        : null;

      const first = runStepsRef.current[0];
      if (first) {
        patchStep(
          first.nodeId,
          { status: 'failed', note: message, error: message },
          'Failed',
          { error: message, ...(failedAuditResult ? { auditResult: failedAuditResult } : {}) }
        );
      }
    } finally {
      setAuditProcessing(false);
    }
  };

  /* ---------- approve / reject from console ---------- */

  const approveHumanStep = async () => {
    const nodeId = waitingNodeIdRef.current;
    if (!nodeId || runStatus !== 'waiting') return;

    const approvalNode = nodes.find((node) => node.id === nodeId);
    const reviewer =
      approvalNode?.data?.config?.approver || approvalNode?.data?.config?.assignee || 'Reviewer';

    let approvalDecision = null;

    if (currentApprovalRef.current?.id) {
      approvalDecision = decideApproval({
        approvalId: currentApprovalRef.current.id,
        decision: 'Approved',
        decisionBy: reviewer,
        decisionNote: 'Approved from workflow console.',
      });
      if (approvalDecision) currentApprovalRef.current = approvalDecision;
    }

    const decidedAt = approvalDecision?.decidedAt || new Date().toISOString();
    const approvalMeta = {
      approvalId: approvalDecision?.id || null,
      decision: 'Approved',
      by: reviewer,
      decidedAt,
    };

    patchStep(
      nodeId,
      {
        status: 'completed',
        note: `Approved by ${reviewer}. Workflow resumed.`,
        output: { decision: 'Approved', approvedBy: reviewer, decidedAt },
      },
      'Running',
      { approval: approvalMeta }
    );

    waitingNodeIdRef.current = null;
    setRunStatus('running');

    /* Audit demo: the approved Send Email step executes through Resend
       exactly as before. */
    if (runMode === 'audit') {
      let actionResult = null;

      if (approvalDecision?.postApprovalAction) {
        actionResult = await sendPostApprovalEmail(approvalDecision);

        const recorded = recordApprovalActionResult({
          approvalId: approvalDecision.id,
          actionResult,
        });
        if (recorded) currentApprovalRef.current = recorded;

        const sendNodeId = approvalDecision.postApprovalAction.nodeId;

        if (actionResult?.status === 'failed') {
          const failed = runStepsRef.current.map((step) => {
            if (step.nodeId === sendNodeId) {
              return { ...step, status: 'failed', note: `Email send failed: ${actionResult.error}`, error: actionResult.error, output: actionResult };
            }
            if (step.status === 'pending') {
              return { ...step, status: 'skipped', note: 'Skipped because the approved email action failed.' };
            }
            return step;
          });

          setStepsSnapshot(failed, 'Failed', { approval: approvalMeta, emailAction: actionResult });
          setRunStatus('blocked');
          window.alert(`Approval saved, but email could not be sent: ${actionResult.error}`);
          return;
        }

        persistRun('Running', runStepsRef.current, { approval: approvalMeta, emailAction: actionResult });
      }

      const ordered = auditPlanRef.current;
      const index = ordered.findIndex((node) => node.id === nodeId);
      await sleep(200);
      await continueAuditExecutionWithSentEmail(ordered, index + 1, actionResult);
      return;
    }

    /* Test run resumes the simulation; live run lets the engine send
       through Resend and records that result against the approval. */
    const runner = runnerRef.current;
    if (!runner) return;

    const outcome = await runner.resume({ decision: 'Approved', approvedBy: reviewer, decidedAt });

    const sendNodeId = approvalDecision?.postApprovalAction?.nodeId;
    const sendStep = sendNodeId ? runStepsRef.current.find((s) => s.nodeId === sendNodeId) : null;

    if (runMode === 'live' && approvalDecision && sendStep?.output) {
      const recorded = recordApprovalActionResult({
        approvalId: approvalDecision.id,
        actionResult: {
          status: sendStep.status === 'failed' ? 'failed' : 'sent',
          provider: 'Resend',
          to: sendStep.output.to || `${sendStep.output.sent || 0} recipient(s)`,
          subject: sendStep.output.subject,
          id: sendStep.output.id,
          error: sendStep.error,
          sentAt: new Date().toISOString(),
        },
      });
      if (recorded) currentApprovalRef.current = recorded;
    }

    finalizeEngineOutcome(outcome);
  };

  const continueAuditExecutionWithSentEmail = async (ordered, startIndex, actionResult) => {
    const result = auditResult || currentRunRef.current?.auditResult || null;

    for (let index = startIndex; index < ordered.length; index += 1) {
      const node = ordered[index];
      const started = performance.now();

      patchStep(node.id, { status: 'running', note: 'Processing...' }, 'Running');
      await sleep(220);

      const sent =
        node.data.nodeType === 'email' &&
        actionResult?.status === 'sent' &&
        currentApprovalRef.current?.postApprovalAction?.nodeId === node.id;

      patchStep(
        node.id,
        {
          status: 'completed',
          note: sent
            ? `Email sent via Resend to ${actionResult.to}. Message ID: ${actionResult.id || 'received'}`
            : getAuditNodeNote(node, result),
          output: sent ? actionResult : { summary: getAuditNodeNote(node, result) },
          durationMs: Math.round(performance.now() - started),
        },
        'Running'
      );
    }

    setRunStatus('completed');
    persistRun('Completed', runStepsRef.current, result ? { auditResult: result } : {});
  };

  const rejectHumanStep = () => {
    const nodeId = waitingNodeIdRef.current;
    if (!nodeId || runStatus !== 'waiting') return;

    const approvalNode = nodes.find((node) => node.id === nodeId);
    const reviewer =
      approvalNode?.data?.config?.approver || approvalNode?.data?.config?.assignee || 'Reviewer';

    let approvalDecision = null;

    if (currentApprovalRef.current?.id) {
      approvalDecision = decideApproval({
        approvalId: currentApprovalRef.current.id,
        decision: 'Rejected',
        decisionBy: reviewer,
        decisionNote: 'Rejected from workflow console.',
      });
      if (approvalDecision) currentApprovalRef.current = approvalDecision;
    }

    runnerRef.current?.rejectPaused?.();

    const rejected = runStepsRef.current.map((step) => {
      if (step.nodeId === nodeId) {
        return { ...step, status: 'rejected', note: `Rejected by ${reviewer}. Workflow stopped.` };
      }
      if (step.status === 'pending') {
        return { ...step, status: 'skipped', note: 'Skipped because approval was rejected.' };
      }
      return step;
    });

    setStepsSnapshot(rejected, 'Rejected', {
      approval: {
        approvalId: approvalDecision?.id || null,
        decision: 'Rejected',
        by: reviewer,
        decidedAt: approvalDecision?.decidedAt || new Date().toISOString(),
      },
    });

    waitingNodeIdRef.current = null;
    setRunStatus('rejected');
  };

  /* ---------- publish ---------- */

  const publishCurrentWorkflow = () => {
    const issues = validateWorkflow(false);

    if (issues.length > 0) {
      setPanelMode('validation');
      setConsoleCollapsed(false);
      setRunStatus('blocked');
      setPublishMessage('Fix validation issues before publishing.');
      return;
    }

    const published = publishWorkflow({ agentId, nodes, edges });
    setVersionState(published);
    setPublishMessage(`Published v${published?.publishedVersion || 1}`);
    setPanelMode('validation');
    setConsoleCollapsed(false);
    setValidationIssues([]);
    setValidationErrorIds([]);
    setRunStatus('idle');
  };

  /* ---------- audit inspector extras ---------- */

  const selectedName = String(selectedNode?.data?.name || '').toLowerCase();
  const selectedIsAuditIntake = selectedName.includes('audit file intake');
  const selectedIsAuditExtractor =
    selectedName.includes('read & extract audit documents') ||
    selectedName.includes('read and extract audit documents');
  const selectedIsOpeningReconciliation = selectedName.includes('opening balance reconciliation');

  const sourceSelect = (key, label, categories, placeholder) => (
    <div className="workflowConfigField" key={key}>
      <label>{label}</label>
      <select
        value={selectedNode?.data.config?.[key] || ''}
        onChange={(event) => updateNodeConfig(key, event.target.value)}
      >
        <option value="">{placeholder}</option>
        {availableSources
          .filter((source) => !categories || categories.includes(source.category))
          .map((source) => (
            <option key={source.id} value={source.id}>
              {source.name} · {source.category}
            </option>
          ))}
      </select>
    </div>
  );

  const auditExtras = selectedNode ? (
    <>
      {selectedIsAuditIntake && (
        <>
          <div className="workflowInspectorDivider">Source Library</div>
          <div className="auditUploadNotice">
            File uploads live in the <strong>Sources</strong> tab. This node references a saved Source instead of asking for the same file on every run.
          </div>
          <button type="button" className="workflowOpenSourcesButton" onClick={() => onOpenSources?.()}>
            Open Sources →
          </button>
        </>
      )}

      {selectedIsAuditExtractor && (
        <>
          <div className="workflowInspectorDivider">Audit Source Mapping</div>
          <div className="auditUploadNotice">
            Tell the audit engine which saved Source plays each role. Files stay in Sources until this workflow explicitly runs them.
          </div>
          {sourceSelect('financialStatementsSourceId', 'Last-year Signed Financial Statements *', ['PDF'], 'Select PDF...')}
          {sourceSelect('trialBalanceSourceId', 'Current-year Trial Balance *', ['PDF', 'Excel', 'CSV'], 'Select PDF / Excel / CSV...')}
          {sourceSelect('gstDataSourceId', 'GST Reconciliation Data *', ['Excel', 'CSV'], 'Select Excel / CSV...')}
          {availableSources.length === 0 && (
            <button type="button" className="workflowOpenSourcesButton" onClick={() => onOpenSources?.()}>
              Upload Sources →
            </button>
          )}
        </>
      )}

      {selectedIsOpeningReconciliation && (
        <>
          <div className="workflowInspectorDivider">Reconciliation Reference</div>
          {sourceSelect('referenceSourceId', 'Compare With Signed Financial Statements', null, 'Select reference Source...')}
        </>
      )}
    </>
  ) : null;

  const footerNotice =
    selectedIsAuditIntake || selectedIsAuditExtractor || selectedIsOpeningReconciliation
      ? 'Sources are stored in this browser for the MVP. Run Audit Demo loads only the Sources selected by this workflow. After Senior CA approval, a configured Send Email step can send through Resend.'
      : 'Test Run simulates every step with sample data and renders {{variables}} without sending. Run Workflow executes AI Agent and HTTP nodes live and sends email through Resend after any Approval Gate.';

  const auditPanel = (
    <>
      {auditError && (
        <div className="auditDemoError">
          <strong>Audit Demo Error</strong>
          <span>{auditError}</span>
        </div>
      )}

      {auditResult && (
        <div className="auditDemoResult">
          <div className="auditDemoResultHeader">
            <div>
              <strong>Real File Analysis</strong>
              <span>
                {auditResult.clientName || 'Demo Client'} · {auditResult.findings?.length || 0} exception(s)
              </span>
            </div>
            <span className="auditDemoRealBadge">REAL</span>
          </div>

          <div className="auditDemoStats">
            <div>
              <span>Opening exceptions</span>
              <strong>{auditResult.openingFindings?.length || 0}</strong>
            </div>
            <div>
              <span>GST exceptions</span>
              <strong>{auditResult.gstFindings?.length || 0}</strong>
            </div>
            <div>
              <span>Client queries</span>
              <strong>{auditResult.queries?.length || 0}</strong>
            </div>
          </div>

          <div className="auditDemoFindings">
            {(auditResult.findings || []).slice(0, 12).map((finding, index) => (
              <div className="auditDemoFindingRow" key={`${finding.area}-${index}`}>
                <div>
                  <strong>{finding.area}</strong>
                  <span>{finding.observation}</span>
                </div>
                <b>{formatAuditAmount(finding.difference)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const handleApplyBlueprint = useCallback(
    ({ nodes: newNodes, edges: newEdges, summary }, mode = 'replace') => {
      if (!Array.isArray(newNodes) || newNodes.length === 0) return;

      if (mode === 'append' && nodes.length > 0) {
        const maxX = Math.max(...nodes.map((n) => n.position.x), 0);
        const shiftX = maxX + 300;

        const shiftedNodes = newNodes.map((n, i) => ({
          ...n,
          id: `${n.id}_${Date.now()}_${i}`,
          position: { x: n.position.x + shiftX, y: n.position.y },
        }));

        const lastExisting = nodes[nodes.length - 1];
        const firstNew = shiftedNodes[0];

        const linkingEdge = {
          id: `e-${lastExisting.id}-${firstNew.id}`,
          source: lastExisting.id,
          target: firstNew.id,
          style: { stroke: '#6a6a6a', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: 'var(--text-muted)' },
        };

        const remappedEdges = (newEdges || []).map((e) => {
          const sNode = shiftedNodes.find((sn) => sn.id.startsWith(e.source));
          const tNode = shiftedNodes.find((sn) => sn.id.startsWith(e.target));
          return {
            ...e,
            id: `e-${sNode?.id || e.source}-${tNode?.id || e.target}`,
            source: sNode?.id || e.source,
            target: tNode?.id || e.target,
          };
        });

        const combinedNodes = [...nodes, ...shiftedNodes];
        const combinedEdges = [...edges, linkingEdge, ...remappedEdges];

        setNodes(combinedNodes);
        setEdges(combinedEdges);
        saveWorkflowDraft({ agentId, nodes: combinedNodes, edges: combinedEdges });
      } else {
        setNodes(newNodes);
        setEdges(newEdges || []);
        saveWorkflowDraft({ agentId, nodes: newNodes, edges: newEdges || [] });
      }

      setPublishMessage(summary || 'Workflow updated by GRA AI Architect.');
      setTimeout(() => {
        validateWorkflow(false);
      }, 150);
    },
    [nodes, edges, agentId, setNodes, setEdges]
  );

  const busy = runStatus === 'running' || auditProcessing;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="workflowBuilder">
      <aside className="workflowSidebar">
        <div className="workflowSidebarHeader">
          <h3>Nodes</h3>
          <span>Drag onto the canvas or click to add</span>
        </div>

        <div className="workflowSearchBox">
          <input
            type="text"
            placeholder="Search triggers, logic, connectors..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="workflowGroups">
          {filteredCatalog.map((group) => {
            const collapsed = collapsedGroups[group.group] && !search.trim();

            return (
              <div className="workflowGroup" key={group.group}>
                <button
                  type="button"
                  className="workflowGroupTitle"
                  onClick={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [group.group]: !current[group.group],
                    }))
                  }
                  aria-expanded={!collapsed}
                >
                  <span>{group.group}</span>
                  <small>{group.items.length}</small>
                  <i>{collapsed ? '▸' : '▾'}</i>
                </button>

                {!collapsed && (
                  <div className="workflowGroupItems">
                    {group.items.map((item) => (
                      <button
                        type="button"
                        key={item.type}
                        className="workflowLibraryItem"
                        draggable
                        onDragStart={(event) => onDragStart(event, item)}
                        onClick={() => addNodeByClick(item)}
                        style={{ '--node-accent': getTheme(item.type) }}
                      >
                        <div className={`workflowLibraryItemIcon workflowIcon-${item.shape}`}>
                          {item.icon}
                        </div>
                        <div className="workflowLibraryItemText">
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className={`workflowBoard ${panelMode ? 'withExecutionPanel' : ''}`}>
        <div className="workflowBoardTopbar">
          <div className="workflowBoardTitle">
            <strong>Workflow Canvas</strong>
            <span>
              {nodes.length} nodes · {edges.length} connections
            </span>
          </div>

          <div className="workflowBoardActions">
            <div className="workflowVersionControls">
              <span className={`workflowVersionBadge ${versionState?.isDirty ? 'draft' : 'published'}`}>
                {versionState?.isDirty
                  ? `Draft v${versionState?.draftVersion || 1}`
                  : `Published v${versionState?.publishedVersion || versionState?.draftVersion || 1}`}
              </span>

              {versionState?.publishedVersion && versionState?.isDirty && (
                <span className="workflowPublishedReference">
                  Published v{versionState.publishedVersion}
                </span>
              )}

              <span className="workflowDraftStatus">Saved locally</span>

              {publishMessage && <span className="workflowPublishMessage">{publishMessage}</span>}
            </div>

            <button
              type="button"
              className={`workflowActionButton gauravArchitectToggleBtn ${showGauravDrawer ? 'active' : ''}`}
              onClick={() => setShowGauravDrawer((current) => !current)}
              title="Open GRA AI Architect"
            >
              <img src="/gra-ai-logo.png" alt="GRA AI Architect" className="topbarAiLogo" />
              <strong>GRA AI Architect</strong>
            </button>

            <button type="button" className="workflowActionButton" onClick={() => validateWorkflow(true)} disabled={busy}>
              ✓ Validate
            </button>

            <button
              type="button"
              className="workflowActionButton workflowPublishButton"
              onClick={publishCurrentWorkflow}
              disabled={busy || nodes.length === 0 || versionState?.isDirty === false}
            >
              ↑ Publish
            </button>

            {isAuditWorkflow && (
              <button
                type="button"
                className="workflowActionButton workflowAuditDemoButton"
                onClick={runAuditDemo}
                disabled={busy}
                title="Select the audit documents from Sources, then run real file analysis"
              >
                {auditProcessing ? 'Claude Haiku analyzing...' : 'Run Audit Demo'}
              </button>
            )}

            <button
              type="button"
              className="workflowActionButton workflowTestButton"
              onClick={() => startEngineRun('test')}
              disabled={busy}
            >
              {busy && runMode === 'test' ? 'Running...' : 'Test Run'}
            </button>

            <button
              type="button"
              className="workflowActionButton workflowLiveButton"
              onClick={() => startEngineRun('live')}
              disabled={busy}
              title="Execute AI, HTTP and Resend steps for real"
            >
              {busy && runMode === 'live' ? 'Running live...' : 'Run Workflow'}
            </button>

            <button type="button" className="workflowActionButton" onClick={clearWorkflow} disabled={busy}>
              Clear
            </button>
          </div>
        </div>

        <div className="workflowCanvasShell" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onInit={setReactFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(event, node) => setSelectedNodeId(node.id)}
            onEdgeClick={(event, edge) => {
              event.stopPropagation();
              setEdges((current) =>
                current.map((item) => ({ ...item, selected: item.id === edge.id }))
              );
              setSelectedNodeId(null);
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              event.stopPropagation();
              if (!window.confirm('Delete this connection?')) return;
              setEdges((current) => current.filter((item) => item.id !== edge.id));
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setEdges((current) => current.map((item) => ({ ...item, selected: false })));
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{ interactionWidth: 36, ...edgeStyle }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.15}
          >
            <AutoFit signal={`${agentId}-${panelMode}-${consoleCollapsed}`} />
            <Background gap={22} size={1} color="var(--border-strong)" />
            <Controls />
            <MiniMap
              nodeColor={(node) => getTheme(node.data?.nodeType)}
              maskColor="var(--minimap-mask)"
              style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="workflowCanvasEmpty">
              <strong>Start with a trigger</strong>
              <span>Drag a node from the left, or pick a template when creating an agent.</span>
            </div>
          )}

          {selectedNode && (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              nodes={nodes}
              upstreamNodes={upstreamNodes}
              prevNode={prevNode}
              availableSources={availableSources}
              onChangeField={updateNodeField}
              onChangeConfig={updateNodeConfig}
              onPatchConfig={patchNodeConfig}
              onDelete={deleteSelectedNode}
              onClose={() => setSelectedNodeId(null)}
              onOpenSources={onOpenSources}
              extras={auditExtras}
              footerNotice={footerNotice}
            />
          )}
        </div>

        {panelMode && (
          <ExecutionConsole
            panelMode={panelMode}
            collapsed={consoleCollapsed}
            onToggleCollapse={() => setConsoleCollapsed((value) => !value)}
            onClose={() => setPanelMode(null)}
            runStatus={runStatus}
            runMode={runMode}
            steps={runSteps}
            validationIssues={validationIssues}
            publishMessage={publishMessage}
            onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
            onApprove={approveHumanStep}
            onReject={rejectHumanStep}
            auditPanel={auditPanel}
          />
        )}
      </section>

      <GauravChatDrawer
        isOpen={showGauravDrawer}
        onClose={() => setShowGauravDrawer(false)}
        agentId={agentId}
        agentName={agentName}
        currentNodes={nodes}
        currentEdges={edges}
        onApplyBlueprint={handleApplyBlueprint}
      />
    </div>
  );
}
