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

/* =========================
   NODE DEFINITIONS
========================= */

const nodeCatalog = [
  {
    group: 'Triggers',
    items: [
      { type: 'trigger', label: 'Manual Trigger', icon: '⚡', description: 'Start manually' },
      { type: 'schedule', label: 'Schedule Trigger', icon: '🕒', description: 'Run by date/time' },
      { type: 'webhook', label: 'Webhook Trigger', icon: '🔗', description: 'Triggered by webhook' },
      { type: 'emailTrigger', label: 'Email Trigger', icon: '✉️', description: 'Triggered by email' },
    ],
  },
  {
    group: 'Logic',
    items: [
      { type: 'condition', label: 'Condition', icon: '◇', description: 'If / Else decision' },
      { type: 'delay', label: 'Delay', icon: '⏳', description: 'Wait before next step' },
      { type: 'loop', label: 'Loop', icon: '🔁', description: 'Repeat over items' },
      { type: 'formatter', label: 'Formatter', icon: '🧮', description: 'Transform data' },
    ],
  },
  {
    group: 'AI',
    items: [
      { type: 'aiPrompt', label: 'AI Prompt', icon: '🤖', description: 'Generate / summarize' },
      { type: 'extract', label: 'Extract Data', icon: '📄', description: 'Pull fields from docs' },
      { type: 'classify', label: 'Classify', icon: '🏷️', description: 'Categorize content' },
    ],
  },
  {
    group: 'Integrations',
    items: [
      { type: 'api', label: 'API Request', icon: '🌐', description: 'Call an external API' },
      { type: 'plugin', label: 'Plugin', icon: '🧩', description: 'Use connected tool' },
      { type: 'database', label: 'Database', icon: '🗄️', description: 'Read / write data' },
      { type: 'spreadsheet', label: 'Spreadsheet', icon: '📊', description: 'Work with sheets' },
    ],
  },
  {
    group: 'Human',
    items: [
      { type: 'approval', label: 'Approval', icon: '✅', description: 'Need human approval' },
      { type: 'review', label: 'Review Task', icon: '👤', description: 'Assign for review' },
    ],
  },
  {
    group: 'Outputs',
    items: [
      { type: 'email', label: 'Send Email', icon: '📨', description: 'Send communication' },
      { type: 'whatsapp', label: 'Send WhatsApp', icon: '💬', description: 'Send message' },
      { type: 'notification', label: 'Notification', icon: '🔔', description: 'Internal alert' },
      { type: 'file', label: 'Create File', icon: '📁', description: 'Generate output file' },
    ],
  },
];

function getNodeTheme(type) {
  const map = {
    trigger: { accent: '#e9754f', chip: 'Trigger' },
    schedule: { accent: '#a16eff', chip: 'Trigger' },
    webhook: { accent: '#3b82f6', chip: 'Trigger' },
    emailTrigger: { accent: '#f59e0b', chip: 'Trigger' },

    condition: { accent: '#22c55e', chip: 'Logic' },
    delay: { accent: '#eab308', chip: 'Logic' },
    loop: { accent: '#06b6d4', chip: 'Logic' },
    formatter: { accent: '#14b8a6', chip: 'Logic' },

    aiPrompt: { accent: '#8b5cf6', chip: 'AI' },
    extract: { accent: '#ec4899', chip: 'AI' },
    classify: { accent: '#6366f1', chip: 'AI' },

    api: { accent: '#3b82f6', chip: 'Integration' },
    plugin: { accent: '#10b981', chip: 'Integration' },
    database: { accent: '#64748b', chip: 'Integration' },
    spreadsheet: { accent: '#16a34a', chip: 'Integration' },

    approval: { accent: '#f97316', chip: 'Human' },
    review: { accent: '#f43f5e', chip: 'Human' },

    email: { accent: '#f59e0b', chip: 'Output' },
    whatsapp: { accent: '#22c55e', chip: 'Output' },
    notification: { accent: '#06b6d4', chip: 'Output' },
    file: { accent: '#94a3b8', chip: 'Output' },
  };

  return map[type] || { accent: '#666', chip: 'Node' };
}

function findTemplate(type) {
  for (const group of nodeCatalog) {
    const found = group.items.find((item) => item.type === type);
    if (found) return found;
  }
  return null;
}

/* =========================
   CUSTOM NODE
========================= */

function WorkflowNode({ data, selected }) {
  const theme = getNodeTheme(data.nodeType);

  return (
    <div
      className={`workflowNode ${selected ? 'selected' : ''}`}
      style={{ '--node-accent': theme.accent }}
    >
      <Handle type="target" position={Position.Left} className="nodeHandle" />

      <div className="workflowNodeTop">
        <div className="workflowNodeIcon">{data.icon}</div>
        <div className="workflowNodeText">
          <strong>{data.name}</strong>
          <span>{data.description}</span>
        </div>
      </div>

      <div className="workflowNodeBottom">
        <span className="workflowNodeChip">{theme.chip}</span>
      </div>

      <Handle type="source" position={Position.Right} className="nodeHandle" />
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowNode,
};

/* =========================
   MAIN COMPONENT
========================= */

export default function WorkflowBuilder({ agentId }) {
  const storageKey = `gra-workflow-${agentId}`;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

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

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: false,
            style: { stroke: '#646464', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#848484',
            },
          },
          eds
        )
      ),
    [setEdges]
  );

  const addNode = (template) => {
    const id = `${template.type}-${Date.now()}`;

    const newNode = {
      id,
      type: 'workflowNode',
      position: {
        x: 150 + Math.random() * 240,
        y: 80 + Math.random() * 220,
      },
      data: {
        name: template.label,
        description: template.description,
        nodeType: template.type,
        icon: template.icon,
      },
    };

    setNodes((current) => [...current, newNode]);
  };

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
  };

  const clearWorkflow = () => {
    const confirmed = window.confirm('Clear this entire workflow?');
    if (!confirmed) return;

    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
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

  return (
    <div className="workflowBuilder">
      {/* LEFT LIBRARY */}
      <aside className="workflowSidebar">
        <div className="workflowSidebarHeader">
          <h3>Workflow Blocks</h3>
          <span>Click to add to canvas</span>
        </div>

        <div className="workflowSearchBox">
          <input
            type="text"
            placeholder="Search blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="workflowGroups">
          {filteredCatalog.map((group) => (
            <div className="workflowGroup" key={group.group}>
              <div className="workflowGroupTitle">{group.group}</div>

              <div className="workflowGroupItems">
                {group.items.map((item) => (
                  <button
                    key={item.type}
                    className="workflowLibraryItem"
                    onClick={() => addNode(item)}
                  >
                    <div className="workflowLibraryItemIcon">{item.icon}</div>

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

      {/* CENTER CANVAS */}
      <section className="workflowBoard">
        <div className="workflowBoardTopbar">
          <div className="workflowBoardTitle">
            <strong>Workflow Canvas</strong>
            <span>
              {nodes.length} nodes • {edges.length} connections
            </span>
          </div>

          <div className="workflowBoardActions">
            <button onClick={clearWorkflow}>Clear</button>
          </div>
        </div>

        <div className="workflowCanvasShell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(event, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
          >
            <Background gap={22} size={1} color="#252525" />
            <Controls />
            <MiniMap
              nodeColor="#e9754f"
              maskColor="rgba(0,0,0,0.65)"
              style={{
                background: '#151515',
                border: '1px solid #2e2e2e',
              }}
            />
          </ReactFlow>
        </div>
      </section>

      {/* RIGHT PROPERTIES */}
      <aside className="workflowInspector">
        <div className="workflowInspectorHeader">
          <h3>Properties</h3>
          <span>Selected block settings</span>
        </div>

        {!selectedNode ? (
          <div className="workflowEmptyInspector">
            <div className="workflowEmptyInspectorIcon">◇</div>
            <p>Select a block from the canvas to configure it.</p>
          </div>
        ) : (
          <div className="workflowInspectorForm">
            <label>Node Name</label>
            <input
              value={selectedNode.data.name || ''}
              onChange={(e) => updateNodeField('name', e.target.value)}
            />

            <label>Description</label>
            <textarea
              rows={4}
              value={selectedNode.data.description || ''}
              onChange={(e) => updateNodeField('description', e.target.value)}
            />

            <label>Type</label>
            <div className="workflowReadonly">
              {findTemplate(selectedNode.data.nodeType)?.label || selectedNode.data.nodeType}
            </div>

            <label>Node ID</label>
            <div className="workflowReadonly workflowIdBox">
              {selectedNode.id}
            </div>

            <button
              className="workflowDangerButton"
              onClick={deleteSelectedNode}
            >
              Delete Node
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
