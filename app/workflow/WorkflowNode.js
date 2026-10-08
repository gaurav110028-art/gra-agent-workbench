'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

import {
  getTheme,
  splitColumns,
  triggerTypes,
} from '../workflowCatalog';

export function getSourceHandles(nodeType, config = {}) {
  if (nodeType === 'condition') {
    return [
      { id: 'true', label: 'true', tone: 'success' },
      { id: 'false', label: 'false', tone: 'danger' },
    ];
  }

  if (nodeType === 'router') {
    const routes = splitColumns(config.routes);
    const list = routes.length ? routes : ['Route 1', 'Route 2'];

    return list.map((label, index) => ({
      id: `route-${index}`,
      label,
      tone: 'neutral',
    }));
  }

  return [{ id: null, label: '', tone: 'neutral' }];
}

const statusLabel = {
  running: 'Running',
  success: 'Success',
  error: 'Error',
  waiting: 'Waiting',
  skipped: 'Skipped',
};

function WorkflowNodeComponent({ data, selected }) {
  const handles = getSourceHandles(data.nodeType, data.config);
  const multi = handles.length > 1;
  const isTrigger = triggerTypes.includes(data.nodeType);
  const runStatus = data.runStatus || 'idle';

  return (
    <div
      className={`
        workflowNode
        ${selected ? 'selected' : ''}
        ${data.hasValidationError ? 'invalid' : ''}
        workflowNode-${data.shape || 'rounded'}
        workflowNode-run-${runStatus}
      `}
      style={{ '--node-accent': getTheme(data.nodeType) }}
    >
      {!isTrigger && (
        <Handle type="target" position={Position.Left} className="nodeHandle" />
      )}

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
        <span className="workflowNodeChip">{data.group}</span>

        {runStatus !== 'idle' && (
          <span className={`workflowNodeStatus is-${runStatus}`}>
            <i />
            {statusLabel[runStatus]}
            {typeof data.durationMs === 'number' &&
              runStatus !== 'running' &&
              runStatus !== 'skipped' && (
                <b>{data.durationMs} ms</b>
              )}
          </span>
        )}
      </div>

      {multi ? (
        <div className="workflowNodeHandles">
          {handles.map((handle, index) => (
            <Handle
              key={handle.id}
              id={handle.id}
              type="source"
              position={Position.Right}
              className={`nodeHandle nodeHandle-${handle.tone}`}
              style={{
                top: `${((index + 1) / (handles.length + 1)) * 100}%`,
              }}
            >
              <span className="nodeHandleLabel">{handle.label}</span>
            </Handle>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Right} className="nodeHandle" />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);

export const nodeTypes = {
  workflowNode: WorkflowNode,
};
