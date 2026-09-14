'use client';

import { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';

const nodeTemplates = [
  { type: 'trigger', label: 'Trigger', symbol: '⚡' },
  { type: 'action', label: 'Action', symbol: '▶' },
  { type: 'condition', label: 'Condition', symbol: '◇' },
  { type: 'ai', label: 'AI', symbol: 'AI' },
  { type: 'approval', label: 'Human Approval', symbol: '✓' },
  { type: 'delay', label: 'Delay', symbol: '◷' },
];

function getNodeStyle(type) {
  return {
    background: '#1b1b1b',
    color: '#f4f4f4',
    border: '1px solid #454545',
    borderRadius: '10px',
    minWidth: '170px',
    padding: '12px 14px',
    fontSize: '13px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  };
}

export default function WorkflowBuilder({ agentId }) {
  const storageKey = `gra-workflow-${agentId}`;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loaded, setLoaded] = useState(false);

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
            markerEnd: {
              type: MarkerType.ArrowClosed,
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
      position: {
        x: 180 + Math.random() * 250,
        y: 100 + Math.random() * 250,
      },
      data: {
        label: `${template.symbol}  ${template.label}`,
        name: template.label,
        nodeType: template.type,
      },
      style: getNodeStyle(template.type),
    };

    setNodes((current) => [...current, newNode]);
  };

  const updateNodeName = (value) => {
    if (!selectedNode) return;

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                name: value,
                label: `${getSymbol(node.data.nodeType)}  ${value}`,
              },
            }
          : node
      )
    );

    setSelectedNode((current) => ({
      ...current,
      data: {
        ...current.data,
        name: value,
        label: `${getSymbol(current.data.nodeType)}  ${value}`,
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
    const confirmed = window.confirm(
      'Clear this entire workflow?'
    );

    if (!confirmed) return;

    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  };

  return (
    <div className="workflowBuilder">
      <aside className="workflowPalette">
        <div className="workflowPaletteHeader">
          <strong>Nodes</strong>
          <span>Click to add</span>
        </div>

        <div className="nodeLibrary">
          {nodeTemplates.map((template) => (
            <button
              key={template.type}
              className="nodeLibraryItem"
              onClick={() => addNode(template)}
            >
              <span className="nodeLibraryIcon">
                {template.symbol}
              </span>

              <div>
                <strong>{template.label}</strong>
                <small>
                  {getDescription(template.type)}
                </small>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="workflowCanvas">
        <div className="workflowCanvasToolbar">
          <div>
            <strong>Workflow Canvas</strong>
            <span>
              {nodes.length} nodes · {edges.length} connections
            </span>
          </div>

          <button onClick={clearWorkflow}>
            Clear
          </button>
        </div>

        <div className="workflowFlowArea">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(event, node) =>
              setSelectedNode(node)
            }
            onPaneClick={() => setSelectedNode(null)}
            fitView
          >
            <Background
              gap={22}
              size={1}
              color="#2d2d2d"
            />

            <Controls />

            <MiniMap
              nodeColor="#e9754f"
              maskColor="rgba(0,0,0,0.65)"
            />
          </ReactFlow>
        </div>
      </section>

      <aside className="workflowProperties">
        <div className="workflowPropertiesHeader">
          <strong>Properties</strong>
        </div>

        {!selectedNode ? (
          <div className="noNodeSelected">
            <span>◇</span>
            <p>Select a node to configure it.</p>
          </div>
        ) : (
          <div className="nodePropertiesForm">
            <label>Node Name</label>

            <input
              value={selectedNode.data.name || ''}
              onChange={(e) =>
                updateNodeName(e.target.value)
              }
            />

            <label>Type</label>

            <div className="propertyReadOnly">
              {selectedNode.data.nodeType}
            </div>

            <label>Node ID</label>

            <div className="propertyReadOnly nodeIdText">
              {selectedNode.id}
            </div>

            <button
              className="deleteNodeButton"
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

function getSymbol(type) {
  const found = nodeTemplates.find(
    (item) => item.type === type
  );

  return found?.symbol || '◇';
}

function getDescription(type) {
  const descriptions = {
    trigger: 'Starts the workflow',
    action: 'Performs an action',
    condition: 'Branch using rules',
    ai: 'AI processing step',
    approval: 'Wait for human review',
    delay: 'Wait before continuing',
  };

  return descriptions[type] || '';
}
