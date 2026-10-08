'use client';

import { useState } from 'react';

function JsonBlock({ title, value }) {
  const [copied, setCopied] = useState(false);

  const text =
    value === undefined
      ? '—'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="consoleJsonBlock">
      <div className="consoleJsonHeader">
        <span>{title}</span>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

const stateLabel = {
  pending: 'Idle',
  running: 'Running',
  completed: 'Success',
  failed: 'Error',
  rejected: 'Rejected',
  waiting: 'Waiting',
  skipped: 'Skipped',
};

export default function ExecutionConsole({
  panelMode,
  collapsed,
  onToggleCollapse,
  onClose,
  runStatus,
  runMode,
  steps,
  validationIssues,
  publishMessage,
  onSelectNode,
  onApprove,
  onReject,
  auditPanel,
}) {
  const [openSteps, setOpenSteps] = useState({});

  const toggleStep = (nodeId) =>
    setOpenSteps((current) => ({ ...current, [nodeId]: !current[nodeId] }));

  const totalMs = steps.reduce(
    (sum, step) => sum + (Number(step.durationMs) || 0),
    0
  );

  const counts = steps.reduce(
    (acc, step) => {
      if (step.status === 'completed') acc.success += 1;
      else if (step.status === 'failed' || step.status === 'rejected') acc.error += 1;
      else if (step.status === 'skipped') acc.skipped += 1;
      return acc;
    },
    { success: 0, error: 0, skipped: 0 }
  );

  const title =
    panelMode === 'validation' ? 'Workflow Validation' : 'Execution Console';

  return (
    <div className={`workflowExecutionPanel ${collapsed ? 'collapsed' : ''}`}>
      <div className="workflowExecutionHeader">
        <button
          type="button"
          className="consoleToggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand console' : 'Collapse console'}
        >
          {collapsed ? '▲' : '▼'}
        </button>

        <div className="consoleTitle">
          <strong>{title}</strong>

          {panelMode === 'run' && (
            <div className="consoleMeta">
              <span className={`consoleModeBadge ${runMode}`}>
                {runMode === 'live'
                  ? 'Run Workflow · live'
                  : runMode === 'audit'
                    ? 'Audit Demo · real files'
                    : 'Test Run · simulated'}
              </span>

              <span className={`consoleRunState is-${runStatus}`}>
                {runStatus === 'running' && 'Running'}
                {runStatus === 'completed' && 'Completed'}
                {runStatus === 'waiting' && 'Waiting for approval'}
                {runStatus === 'blocked' && 'Failed'}
                {runStatus === 'rejected' && 'Rejected'}
                {runStatus === 'idle' && 'Idle'}
              </span>

              <span className="consoleStats">
                {counts.success} ok · {counts.error} error · {counts.skipped} skipped · {totalMs} ms
              </span>
            </div>
          )}

          {panelMode === 'validation' && (
            <span className="consoleHint">
              Structure and required parameters are checked before any run.
            </span>
          )}
        </div>

        <button
          type="button"
          className="workflowExecutionClose"
          onClick={onClose}
          aria-label="Close console"
        >
          ×
        </button>
      </div>

      {!collapsed && (
        <div className="workflowExecutionBody">
          {panelMode === 'validation' && (
            <>
              {validationIssues.length === 0 ? (
                <div className="workflowValidationSuccess">
                  <strong>{publishMessage ? `✓ ${publishMessage}` : '✓ Workflow valid'}</strong>
                  <span>
                    {publishMessage
                      ? 'This exact workflow snapshot is now the published version.'
                      : 'No blocking issues found. Ready for a test run, live run or publish.'}
                  </span>
                </div>
              ) : (
                <div className="workflowValidationList">
                  <div className="workflowValidationSummary">
                    {validationIssues.length} issue
                    {validationIssues.length !== 1 ? 's' : ''} found
                  </div>

                  {validationIssues.map((issue, index) => (
                    <button
                      type="button"
                      key={`${issue.nodeId}-${index}`}
                      className="workflowValidationItem"
                      onClick={() => issue.nodeId && onSelectNode(issue.nodeId)}
                    >
                      <span>!</span>
                      <p>{issue.message}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {panelMode === 'run' && (
            <div className="consoleSteps">
              {auditPanel}

              {steps.length === 0 && (
                <div className="consoleEmpty">
                  Press Test Run to simulate, or Run Workflow to execute live steps.
                </div>
              )}

              {steps.map((step, index) => {
                const open = Boolean(openSteps[step.nodeId]);

                return (
                  <div
                    className={`consoleStep consoleStep-${step.status} ${open ? 'open' : ''}`}
                    key={step.nodeId}
                  >
                    <button
                      type="button"
                      className="consoleStepRow"
                      onClick={() => toggleStep(step.nodeId)}
                      aria-expanded={open}
                    >
                      <span className="consoleStepIndex">{index + 1}</span>
                      <span className="consoleStepIcon">{step.icon}</span>

                      <span className="consoleStepText">
                        <strong>{step.name}</strong>
                        <span>{step.note || 'Waiting...'}</span>
                      </span>

                      <span className="consoleStepDuration">
                        {typeof step.durationMs === 'number' ? `${step.durationMs} ms` : ''}
                      </span>

                      <span className={`consoleStepState is-${step.status}`}>
                        <i />
                        {stateLabel[step.status] || step.status}
                      </span>

                      <span className="consoleStepChevron">{open ? '▾' : '▸'}</span>
                    </button>

                    {step.status === 'waiting' && (
                      <div className="workflowApprovalActions">
                        <button
                          type="button"
                          className="workflowApproveButton"
                          onClick={onApprove}
                        >
                          ✓ Approve & Continue
                        </button>

                        <button
                          type="button"
                          className="workflowRejectButton"
                          onClick={onReject}
                        >
                          × Reject
                        </button>

                        <span className="consoleApprovalHint">
                          Also available in the Approvals tab.
                        </span>
                      </div>
                    )}

                    {open && (
                      <div className="consoleStepDetail">
                        <JsonBlock title="Input" value={step.input} />
                        <JsonBlock
                          title={step.status === 'failed' ? 'Error' : 'Output'}
                          value={
                            step.status === 'failed'
                              ? { error: step.error || step.note, output: step.output }
                              : step.output
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
